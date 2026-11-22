import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { ArrowLeft, Check, Eye, Lock, Pencil, Play, Plus, Puzzle, RotateCcw, Sparkles, Trash2, Users, X } from 'lucide-react';
import { useClassroom } from '../../../../context/ClassroomContext';
import type { Student } from '../../../../types';
import { handleAvatarImgError } from '../../../../utils/avatarConfig';
import { playCardFlipSound, playCoinSound, playFanfareSound, playTickSound, playWrongBuzzerSound, playYesSound, triggerFlowerConfetti } from '../../../../utils/audio';
import { requireQuizStorage } from '../../../modals/QuizStorageModal';
import { PIECE_LAYOUTS, isGuessCorrect, puzzleStore, type PuzzleSet } from '../../../../services/puzzleStore';
import { useFairCall } from '../useFairCall';
import { PuzzleSetEditor } from './PuzzleSetEditor';
import { SAMPLE_PUZZLE } from './samplePuzzle';

/**
 * Lật mảnh ghép: mỗi mảnh là một câu hỏi trắc nghiệm. Trả lời đúng thì lật mảnh, dần lộ bức ảnh bí mật; đoán ra ảnh là thắng.
 * Có thể gọi tên một bạn (công bằng, không gọi lại bạn đã gọi) trả lời từng mảnh và cộng xu khi đúng.
 * Bộ câu hỏi do thầy cô tự soạn, lưu trong kho cá nhân (puzzleStore).
 */
const TILE_COLORS: Array<[string, string]> = [
  ['#38BDF8', '#0369A1'], ['#FBBF24', '#B45309'], ['#FB7185', '#BE123C'], ['#34D399', '#047857'],
  ['#A78BFA', '#6D28D9'], ['#FB923C', '#C2410C'], ['#22D3EE', '#0E7490'], ['#F472B6', '#BE185D'],
];
const LETTERS = ['A', 'B', 'C', 'D'];

const CSS = `
.pz-board{container-type:inline-size;position:relative;width:100%;aspect-ratio:16/9;border-radius:24px;overflow:hidden;background:#fff;box-shadow:0 12px 30px rgba(30,64,175,.18),0 0 0 6px rgba(255,255,255,.9)}
.pz-tile{position:absolute;transition:transform .8s cubic-bezier(.4,.1,.2,1),opacity .6s ease .15s;transform-origin:50% 50%}
.pz-tile.open{transform:perspective(900px) rotateY(180deg) scale(.55);opacity:0;pointer-events:none}
.pz-face{position:absolute;inset:0;border:.3cqw solid rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,var(--c1),var(--c2));cursor:pointer;transition:filter .15s}
.pz-tile:not(.locked):hover .pz-face{filter:brightness(1.1)}
.pz-tile.locked .pz-face{background:repeating-linear-gradient(45deg,#94A3B8 0 1.4cqw,#CBD5E1 1.4cqw 2.8cqw);cursor:not-allowed}
.pz-knob{position:absolute;background:var(--c1);z-index:1}
.pz-tile.locked .pz-knob{background:#A8B3C2}
.pz-knob.r{right:-1.9cqw;top:50%;width:3.8cqw;height:5.6cqw;margin-top:-2.8cqw;border-radius:50%}
.pz-knob.b{bottom:-1.9cqw;left:50%;width:5.6cqw;height:3.8cqw;margin-left:-2.8cqw;border-radius:50%}
.pz-num{position:relative;z-index:2;width:8.4cqw;height:8.4cqw;border-radius:50%;background:rgba(15,23,42,.32);border:.35cqw solid rgba(255,255,255,.75);
  color:#fff;font-weight:900;font-size:4.6cqw;line-height:1;display:flex;align-items:center;justify-content:center;text-shadow:0 .2cqw .5cqw rgba(0,0,0,.35)}
@keyframes pzShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}
.pz-shake{animation:pzShake .45s}
@keyframes pzPop{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
.pz-pop{animation:pzPop .3s ease-out both}
@media (prefers-reduced-motion:reduce){.pz-tile{transition:none}.pz-shake,.pz-pop{animation:none}}
`;

const shuffle = <T,>(a: T[]): T[] => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const modeLabel = (m: 'retry' | 'lock') => (m === 'lock' ? 'Chế độ 2: Sai là khóa mảnh' : 'Chế độ 1: Sai trả lời lại');

// ────────────────────────────────────────────────────────────────── MÀN CHƠI
const PlayScreen: React.FC<{ set: PuzzleSet; onExit: () => void }> = ({ set, onExit }) => {
  const { currentClassStudents, awardPoints } = useClassroom();
  const fair = useFairCall();
  const layout = PIECE_LAYOUTS[set.pieces] || PIECE_LAYOUTS[6];
  const total = set.pieces;

  const [order, setOrder] = useState<number[]>(() => shuffle(Array.from({ length: total }, (_, i) => i)));  // mảnh p ↔ câu order[p]
  const [opened, setOpened] = useState<number[]>([]);
  const [locked, setLocked] = useState<number[]>([]);
  const [piece, setPiece] = useState<number | null>(null);           // mảnh đang hỏi
  const [sel, setSel] = useState<number | null>(null);
  const [result, setResult] = useState<'right' | 'wrong' | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [rolling, setRolling] = useState(false);                    // đang chạy thanh trượt tên
  const [reel, setReel] = useState<{ seq: Student[]; winnerIdx: number } | null>(null);
  const [pos, setPos] = useState(0);              // vị trí băng chuyền (tính theo số thẻ)
  const [speed, setSpeed] = useState(0);          // tốc độ (thẻ / giây) để làm mờ chuyển động
  const [landed, setLanded] = useState(false);    // đã dừng, thẻ trúng sáng lên
  const [stageW, setStageW] = useState(600);
  const rollTimers = useRef<number[]>([]);
  const rollRaf = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [callOn, setCallOn] = useState(currentClassStudents.length > 0);
  const [rewardXu, setRewardXu] = useState(1);
  const [guessOpen, setGuessOpen] = useState(false);
  const [guess, setGuess] = useState('');
  const [guessMsg, setGuessMsg] = useState('');
  const [shake, setShake] = useState(false);
  const [ending, setEnding] = useState<'win' | 'reveal' | null>(null);
  const [awarded, setAwarded] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach(t => window.clearTimeout(t)); rollTimers.current.forEach(t => window.clearTimeout(t)); if (rollRaf.current) cancelAnimationFrame(rollRaf.current); }, []);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  const question = piece != null ? set.questions[order[piece]] : null;
  const remaining = total - opened.length - locked.length;

  const pickStudent = useCallback((exceptId?: string) => {
    const pool = currentClassStudents.filter(s => !fair.calledIds.includes(s.id) && s.id !== exceptId);
    const list = pool.length > 0 ? pool : currentClassStudents.filter(s => s.id !== exceptId);
    return list.length > 0 ? list[Math.floor(Math.random() * list.length)] : null;
  }, [currentClassStudents, fair.calledIds]);

  const openPiece = (p: number) => {
    if (opened.includes(p) || locked.includes(p) || ending) return;
    setPiece(p); setSel(null); setResult(null); setAwarded(false);
    setStudent(null); setRolling(false); setReel(null);   // chưa gọi ai: thầy cô bấm nút để chọn bạn trả lời
    playCardFlipSound();
  };
  const closeQuestion = () => {
    rollTimers.current.forEach(t => window.clearTimeout(t)); rollTimers.current = [];
    if (rollRaf.current) { cancelAnimationFrame(rollRaf.current); rollRaf.current = null; }
    setPiece(null); setSel(null); setResult(null); setStudent(null); setRolling(false); setReel(null);
  };

  /**
   * Chọn bạn trả lời: băng chuyền thẻ ảnh học sinh chạy rất nhanh (nhòe chuyển động), chậm dần, thẻ giữa phóng to;
   * dừng hẳn ở bạn đã được chọn (công bằng, không gọi lại bạn đã gọi) rồi thẻ sáng lên.
   */
  const startPick = (exceptId?: string) => {
    const winner = pickStudent(exceptId);
    if (!winner || rolling) return;
    rollTimers.current.forEach(t => window.clearTimeout(t)); rollTimers.current = [];
    if (rollRaf.current) cancelAnimationFrame(rollRaf.current);
    // Dãy thẻ: các bạn xáo trộn lặp lại cho đủ dài; bạn trúng nằm ở vị trí đích
    const base = shuffle(currentClassStudents);
    const seq: Student[] = [];
    while (seq.length < 44) seq.push(...shuffle(base));
    const winnerIdx = 36;
    seq[winnerIdx] = winner;
    // Nạp sẵn ảnh các thẻ để lúc chạy nhanh không bị trống ảnh
    seq.forEach(st => { if (st.avatar) { const im = new Image(); im.src = st.avatar; } });
    if (stageRef.current) setStageW(stageRef.current.clientWidth);
    setStudent(null); setLanded(false); setReel({ seq, winnerIdx }); setPos(0); setSpeed(0); setRolling(true);

    const DURATION = 3600;
    const t0 = performance.now();
    let last = t0, lastPos = 0, lastTick = 0, lastIdx = 0;
    const frame = (now: number) => {
      const u = Math.min((now - t0) / DURATION, 1);
      const e = 1 - Math.pow(1 - u, 4);                     // nhanh lúc đầu, chậm dần rồi dừng êm
      const cur = winnerIdx * e;
      const dt = Math.max(1, now - last) / 1000;
      setPos(cur); setSpeed(Math.abs(cur - lastPos) / dt);
      last = now; lastPos = cur;
      const idx = Math.round(cur);
      if (idx !== lastIdx && now - lastTick > 70) { lastTick = now; lastIdx = idx; playTickSound(480 + (idx % 5) * 70); }
      if (u < 1) { rollRaf.current = requestAnimationFrame(frame); return; }
      rollRaf.current = null;
      setPos(winnerIdx); setSpeed(0); setLanded(true); playYesSound();
      confetti({ particleCount: 50, spread: 60, startVelocity: 28, origin: { y: 0.45 } });
      rollTimers.current.push(window.setTimeout(() => { setStudent(winner); setRolling(false); setReel(null); setLanded(false); playCardFlipSound(); }, 1100));
    };
    rollRaf.current = requestAnimationFrame(frame);
  };

  // Đo bề rộng khung băng chuyền sau khi vẽ để thẻ vừa khít (điện thoại hẹp thì thẻ nhỏ lại)
  useEffect(() => { if (rolling && stageRef.current) setStageW(stageRef.current.clientWidth); }, [rolling]);

  const needStudent = callOn && !student;
  const answer = (i: number) => {
    if (!question || result || piece == null || needStudent) return;
    const ok = i === question.correct;
    setSel(i); setResult(ok ? 'right' : 'wrong');
    if (student) fair.markCalled(student.id, 'puzzle');
    if (ok) { playYesSound(); } else {
      playWrongBuzzerSound();
      if (set.mode === 'lock') setLocked(l => (l.includes(piece) ? l : [...l, piece]));
    }
  };
  const flipPiece = () => {
    if (piece == null || result !== 'right') return;
    if (student && rewardXu > 0 && !awarded) { awardPoints([student.id], rewardXu, 'Trả lời đúng mảnh ghép (Lật mảnh ghép)'); setAwarded(true); playCoinSound(); }
    const p = piece;
    setOpened(o => (o.includes(p) ? o : [...o, p]));
    closeQuestion();
    later(() => playCardFlipSound(), 120);
  };
  const retry = () => { setSel(null); setResult(null); if (callOn) startPick(student?.id); else setStudent(null); };

  // Hết mảnh để mở (đã mở hết hoặc còn lại đều bị khóa) → mời đoán hình ảnh
  useEffect(() => {
    if (!ending && piece == null && remaining === 0) later(() => setGuessOpen(true), 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, piece, ending]);

  const submitGuess = () => {
    if (!guess.trim()) return;
    if (isGuessCorrect(guess, set.answer)) {
      setGuessOpen(false); setEnding('win');
      playFanfareSound(); triggerFlowerConfetti(); confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
    } else {
      setGuessMsg('Chưa đúng, hãy thử lại hoặc mở thêm mảnh ghép!'); setShake(true); playWrongBuzzerSound();
      later(() => setShake(false), 500);
    }
  };
  const revealAnswer = () => { setGuessOpen(false); setEnding('reveal'); };
  const restart = () => {
    setOrder(shuffle(Array.from({ length: total }, (_, i) => i)));
    setOpened([]); setLocked([]); closeQuestion(); setEnding(null); setGuess(''); setGuessMsg(''); setGuessOpen(false);
  };

  // ---------- Kết thúc
  if (ending) {
    return (
      <div className="bg-gradient-to-b from-sky-50 to-amber-50 rounded-3xl border border-white shadow-sm p-5 sm:p-8 text-center space-y-4">
        <style>{CSS}</style>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="text-5xl" aria-hidden>{ending === 'win' ? '🏆' : '🧩'}</span>
          <div className="text-left">
            <div className="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-black uppercase">{ending === 'win' ? 'Hoàn thành xuất sắc!' : 'Đáp án của bức ảnh'}</div>
            <h3 className="text-3xl sm:text-4xl font-black text-rose-600 uppercase leading-tight">{ending === 'win' ? 'Chúc mừng!' : 'Cùng xem nhé'}</h3>
          </div>
        </div>
        <p className="text-base font-bold text-slate-800 wrap-ok">{ending === 'win' ? 'Xuất sắc! Các em đã đoán chính xác bức ảnh bí mật!' : 'Thầy cô cùng các em xem lại bức ảnh bí mật.'}</p>
        <div className="mx-auto w-full max-w-2xl rounded-3xl overflow-hidden border-4 border-amber-300 shadow-lg" style={{ aspectRatio: '16 / 9' }}>
          <img src={set.image} alt="Bức ảnh bí mật" className="w-full h-full object-cover" />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="px-3.5 py-1.5 rounded-xl bg-emerald-100 text-emerald-900 text-sm font-black wrap-ok">Đáp án: {set.answer.split(/[;|]/)[0].trim()}</span>
          <span className="px-3.5 py-1.5 rounded-xl bg-sky-100 text-sky-900 text-sm font-black tabular-nums">Số mảnh đã mở: {opened.length}/{total}</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button type="button" onClick={restart} className="min-h-12 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-black uppercase inline-flex items-center gap-2 cursor-pointer shadow-md">
            <RotateCcw className="w-4 h-4" /><span>Chơi lại</span>
          </button>
          <button type="button" onClick={onExit} className="min-h-12 px-6 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 text-white text-sm font-black uppercase inline-flex items-center gap-2 cursor-pointer shadow-md">
            <ArrowLeft className="w-4 h-4" /><span>Về danh sách bộ</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <style>{CSS}</style>
      {/* Thanh tiêu đề */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onExit} className="min-h-10 px-3.5 rounded-xl border border-slate-300 bg-white text-sm font-black text-slate-800 inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 whitespace-nowrap">
            <ArrowLeft className="w-4 h-4" /><span>Danh sách bộ</span>
          </button>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight wrap-ok break-words">{set.title} ({total} mảnh)</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-bold">
              <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 whitespace-nowrap">{modeLabel(set.mode)}</span>
              <span className="text-slate-700 tabular-nums whitespace-nowrap">Đã mở: {opened.length}/{total} mảnh{locked.length > 0 ? ` · Khóa: ${locked.length}` : ''}</span>
            </div>
          </div>
        </div>
        <button type="button" onClick={() => { setGuessOpen(true); setGuessMsg(''); }}
          className="min-h-12 px-5 rounded-2xl bg-gradient-to-b from-amber-400 to-orange-500 text-slate-900 text-sm font-black uppercase inline-flex items-center gap-2 cursor-pointer shadow-md border-b-4 border-orange-700 whitespace-nowrap">
          <Sparkles className="w-4 h-4" /><span>Đoán hình ảnh</span>
        </button>
      </div>

      {/* Cài đặt nhanh */}
      <div className="bg-white/80 rounded-2xl border border-slate-200 px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-slate-800">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 cursor-pointer" checked={callOn} disabled={currentClassStudents.length === 0} onChange={e => setCallOn(e.target.checked)} />
          <Users className="w-4 h-4 text-indigo-700" /><span>Gọi tên một bạn trả lời mỗi mảnh</span>
        </label>
        <div className="inline-flex items-center gap-1.5">
          <span>Xu mỗi câu đúng:</span>
          {[0, 1, 2, 3, 5].map(n => (
            <button key={n} type="button" onClick={() => setRewardXu(n)} aria-pressed={rewardXu === n}
              className={`min-w-9 px-2.5 py-1 rounded-full font-black cursor-pointer ${rewardXu === n ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              {n === 0 ? 'Không' : `+${n}`}
            </button>
          ))}
        </div>
      </div>

      {/* Bảng mảnh ghép */}
      <div className="rounded-[32px] p-3 sm:p-4" style={{ background: 'linear-gradient(180deg,#FFF9E8,#FFEFCB)' }}>
        <div className="pz-board mx-auto max-w-4xl">
          <img src={set.image} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          {Array.from({ length: total }, (_, p) => {
            const c = p % layout.cols, r = Math.floor(p / layout.cols);
            const col = TILE_COLORS[p % TILE_COLORS.length];
            const isOpen = opened.includes(p), isLocked = locked.includes(p);
            return (
              <div
                key={p}
                className={`pz-tile ${isOpen ? 'open' : ''} ${isLocked ? 'locked' : ''}`}
                style={{ left: `${(c * 100) / layout.cols}%`, top: `${(r * 100) / layout.rows}%`, width: `${100 / layout.cols}%`, height: `${100 / layout.rows}%`, zIndex: total - p + 1, ['--c1' as string]: col[0], ['--c2' as string]: col[1] } as React.CSSProperties}
              >
                <button type="button" className="pz-face" onClick={() => openPiece(p)} disabled={isOpen || isLocked}
                  aria-label={isLocked ? `Mảnh ${p + 1} đã bị khóa` : isOpen ? `Mảnh ${p + 1} đã mở` : `Mở mảnh ${p + 1}`}>
                  {isLocked ? <Lock className="relative z-[2] text-slate-700" style={{ width: '6cqw', height: '6cqw' }} /> : <span className="pz-num">{p + 1}</span>}
                </button>
                {c < layout.cols - 1 && <span className="pz-knob r" aria-hidden />}
                {r < layout.rows - 1 && <span className="pz-knob b" aria-hidden />}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-center text-xs sm:text-sm font-bold text-slate-700 wrap-ok">
        Bấm vào một mảnh ghép đánh số để trả lời câu hỏi trắc nghiệm. Hoặc bấm <strong>ĐOÁN HÌNH ẢNH</strong> bất cứ lúc nào!
      </p>

      {/* Hộp câu hỏi */}
      {question && piece != null && (
        <div className="fixed inset-0 z-50 bg-sky-900/20 backdrop-blur-xs flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={`Câu hỏi mảnh ${piece + 1}`}>
          <div className="pz-pop w-full max-w-3xl max-h-[94vh] overflow-y-auto bg-white rounded-3xl shadow-2xl border-4 border-amber-300 p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-100 text-indigo-900 text-sm font-black">
                <Puzzle className="w-4 h-4" /><span>Mảnh ghép số {piece + 1}</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-black">{modeLabel(set.mode)}</span>
              <button type="button" onClick={closeQuestion} aria-label="Đóng câu hỏi" className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer"><X className="w-5 h-5 text-slate-700" /></button>
            </div>

            {callOn && (
              student ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-amber-50 border border-amber-200 p-2.5 pz-pop">
                  <img src={student.avatar} alt="" referrerPolicy="no-referrer" onError={(e) => handleAvatarImgError(e, student.gender, student.name)}
                    className="w-14 h-14 rounded-full object-cover object-top border-2 border-white shadow shrink-0 bg-white" />
                  <div className="min-w-[11rem] flex-1">
                    <div className="text-xs font-bold text-amber-900 uppercase">Mời bạn trả lời câu hỏi {piece + 1}</div>
                    <div className="text-lg font-black text-slate-900 leading-tight break-words">{student.name}</div>
                  </div>
                  {!result && (
                    <button type="button" onClick={() => startPick(student.id)} className="min-h-10 px-3 rounded-xl bg-white border border-amber-300 text-xs font-black text-amber-900 cursor-pointer hover:bg-amber-100 whitespace-nowrap">Đổi bạn khác</button>
                  )}
                </div>
              ) : rolling && reel ? (
                (() => {
                  const cardW = Math.max(78, Math.min(118, stageW / 5));
                  const cur = reel.seq[Math.round(pos) % reel.seq.length];
                  const items: React.ReactNode[] = [];
                  for (let i = Math.floor(pos) - 5; i <= Math.ceil(pos) + 5; i++) {
                    const d = Math.abs(i - pos);
                    if (d > 4.2) continue;
                    const st = reel.seq[((i % reel.seq.length) + reel.seq.length) % reel.seq.length];
                    const centre = Math.max(0, 1 - d);
                    const scale = 0.78 + 0.62 * centre;
                    const isWin = landed && i === reel.winnerIdx;
                    items.push(
                      <div key={i} className="absolute top-1/2 left-1/2" style={{
                        width: cardW - 10, marginLeft: -(cardW - 10) / 2, marginTop: -(cardW + 22) / 2,
                        transform: `translateX(${(i - pos) * cardW}px) scale(${scale})`,
                        opacity: Math.max(0.28, 1 - 0.2 * d), zIndex: 100 - Math.round(d * 10),
                        filter: speed > 6 ? `blur(${Math.min(3, speed * 0.07)}px)` : 'none',
                      }}>
                        <div className={`rounded-2xl bg-white border-2 p-1.5 text-center ${isWin ? 'border-amber-500 shadow-[0_0_0_4px_rgba(251,191,36,.55),0_10px_26px_rgba(217,119,6,.45)]' : centre > 0.6 ? 'border-amber-400 shadow-lg' : 'border-slate-200 shadow-sm'}`}>
                          <img src={st.avatar} alt="" draggable={false} referrerPolicy="no-referrer" onError={(e) => handleAvatarImgError(e, st.gender, st.name)}
                            className="w-full aspect-square rounded-xl object-cover object-top bg-slate-100" />
                          <div className="mt-1 text-[12px] leading-tight font-black text-slate-900 break-words" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.1em' }}>{st.name}</div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-2xl border border-amber-200 p-2.5 text-center" style={{ background: 'linear-gradient(180deg,#FFFBEB,#FEF3C7)' }} role="status" aria-live="polite">
                      <div className="text-xs font-black text-amber-900 uppercase mb-1">{landed ? 'Đã chọn được rồi!' : 'Đang tìm bạn may mắn…'}</div>
                      <div ref={stageRef} className="relative mx-auto w-full overflow-hidden rounded-xl" style={{ height: cardW * 1.45 + 24, background: 'radial-gradient(ellipse at center, rgba(255,255,255,.95) 0%, rgba(254,243,199,.35) 70%)' }}>
                        <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2" style={{ width: cardW * 1.9, background: 'radial-gradient(closest-side, rgba(251,191,36,.38), transparent)' }} />
                        {items}
                        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-amber-50 to-transparent" style={{ zIndex: 200 }} />
                        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-amber-50 to-transparent" style={{ zIndex: 200 }} />
                        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2" style={{ zIndex: 210 }} aria-hidden>
                          <svg width="26" height="18" viewBox="0 0 26 18"><path d="M2 2 L24 2 L13 16 Z" fill="#E11D48" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg>
                        </div>
                      </div>
                      <div className="mt-1.5 text-lg sm:text-xl font-black text-slate-900 leading-tight break-words min-h-[1.5em]">{cur.name}</div>
                    </div>
                  );
                })()
              ) : (
                <div className="rounded-2xl bg-amber-50 border-2 border-dashed border-amber-300 p-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-bold text-amber-900 wrap-ok flex-1 min-w-[12rem]">Chưa gọi bạn nào. Bấm nút để chọn ngẫu nhiên một bạn trả lời câu hỏi này.</div>
                  <button type="button" onClick={() => startPick()} className="min-h-12 px-5 rounded-2xl bg-gradient-to-r from-pink-600 to-orange-600 text-white text-sm font-black uppercase inline-flex items-center gap-2 cursor-pointer shadow-md whitespace-nowrap">
                    <Users className="w-4 h-4" /><span>Chọn học sinh trả lời</span>
                  </button>
                </div>
              )
            )}

            <div className="text-xl sm:text-2xl font-black text-slate-900 leading-snug wrap-ok break-words whitespace-pre-wrap">{question.text}</div>
            {question.image && <img src={question.image} alt="Hình minh họa câu hỏi" className="mx-auto max-h-56 rounded-2xl border border-slate-200 object-contain bg-white" />}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {question.options.map((o, i) => {
                if (!o.trim()) return null;
                const isSel = sel === i;
                const showRight = result && i === question.correct;
                const showWrong = result === 'wrong' && isSel;
                return (
                  <button key={i} type="button" onClick={() => answer(i)} disabled={Boolean(result) || needStudent}
                    className={`min-h-14 px-3.5 py-2 rounded-2xl border-2 text-left flex items-center gap-3 cursor-pointer disabled:cursor-default ${needStudent ? 'opacity-55 ' : ''}${showRight ? 'border-emerald-600 bg-emerald-100' : showWrong ? 'border-rose-600 bg-rose-100' : 'border-slate-300 bg-white hover:border-indigo-500 hover:bg-indigo-50'}`}>
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center font-black shrink-0 ${showRight ? 'bg-emerald-700 text-white' : showWrong ? 'bg-rose-700 text-white' : 'bg-indigo-700 text-white'}`}>
                      {showRight ? <Check className="w-5 h-5" /> : showWrong ? <X className="w-5 h-5" /> : LETTERS[i]}
                    </span>
                    <span className="text-base font-bold text-slate-900 wrap-ok break-words min-w-0">{o}</span>
                  </button>
                );
              })}
            </div>

            {result && (
              <div className={`rounded-2xl p-3 text-sm font-bold wrap-ok ${result === 'right' ? 'bg-emerald-50 text-emerald-900 border border-emerald-300' : 'bg-rose-50 text-rose-900 border border-rose-300'}`} role="status">
                {result === 'right'
                  ? `Chính xác!${student && rewardXu > 0 ? ` Bạn ${student.name} được +${rewardXu} xu.` : ''}`
                  : set.mode === 'lock'
                    ? 'Chưa đúng. Mảnh ghép này đã bị khóa, hãy chọn mảnh khác.'
                    : 'Chưa đúng. Hãy trả lời lại hoặc mời bạn khác.'}
                {question.explanation ? <div className="mt-1 font-semibold">Giải thích: {question.explanation}</div> : null}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {result === 'right' && (
                <button type="button" onClick={flipPiece} className="min-h-12 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-black uppercase inline-flex items-center gap-2 cursor-pointer shadow-md">
                  <Sparkles className="w-4 h-4" /><span>Lật mảnh ghép</span>
                </button>
              )}
              {result === 'wrong' && set.mode === 'retry' && (
                <button type="button" onClick={retry} className="min-h-12 px-6 rounded-2xl bg-gradient-to-r from-orange-600 to-rose-600 text-white text-sm font-black uppercase inline-flex items-center gap-2 cursor-pointer shadow-md">
                  <RotateCcw className="w-4 h-4" /><span>Trả lời lại</span>
                </button>
              )}
              {result === 'wrong' && set.mode === 'lock' && (
                <button type="button" onClick={closeQuestion} className="min-h-12 px-6 rounded-2xl bg-slate-800 text-white text-sm font-black uppercase cursor-pointer">Đóng</button>
              )}
              {!result && <button type="button" onClick={closeQuestion} className="min-h-11 px-4 rounded-xl border border-slate-300 text-sm font-black text-slate-700 cursor-pointer hover:bg-slate-50">Chọn mảnh khác</button>}
            </div>
          </div>
        </div>
      )}

      {/* Hộp đoán hình ảnh */}
      {guessOpen && (
        <div className="fixed inset-0 z-[60] bg-sky-900/20 backdrop-blur-xs flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Đoán hình ảnh">
          <div className={`pz-pop w-full max-w-lg bg-white rounded-3xl shadow-2xl border-4 border-amber-300 p-5 space-y-3 ${shake ? 'pz-shake' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xl font-black text-slate-900 inline-flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-600" />Đoán hình ảnh</h4>
              <button type="button" onClick={() => setGuessOpen(false)} aria-label="Đóng" className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer"><X className="w-5 h-5 text-slate-700" /></button>
            </div>
            {remaining === 0 && <p className="text-sm font-bold text-indigo-900 wrap-ok">Đã hết mảnh ghép để mở. Hãy đoán xem bức ảnh bí mật là gì!</p>}
            <input autoFocus value={guess} onChange={e => { setGuess(e.target.value); setGuessMsg(''); }} onKeyDown={e => { if (e.key === 'Enter') submitGuess(); }}
              className="w-full rounded-xl border-2 border-slate-300 px-3.5 py-3 text-lg font-bold text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500" placeholder="Nhập đáp án hình ảnh…" aria-label="Đáp án hình ảnh" />
            {guessMsg && <div className="text-sm font-bold text-rose-700 wrap-ok" role="alert">{guessMsg}</div>}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={revealAnswer} className="min-h-11 px-4 rounded-xl border border-slate-300 text-sm font-black text-slate-700 inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 whitespace-nowrap"><Eye className="w-4 h-4" />Xem đáp án</button>
              <button type="button" onClick={submitGuess} disabled={!guess.trim()} className="min-h-11 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-black uppercase cursor-pointer disabled:opacity-50 whitespace-nowrap">Đoán</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────── DANH SÁCH BỘ
export const PuzzleFlipGame: React.FC = () => {
  const { currentUser } = useClassroom();
  const username = currentUser?.username || 'guest';
  const [sets, setSets] = useState<PuzzleSet[]>([]);
  const [playing, setPlaying] = useState<PuzzleSet | null>(null);
  const [editing, setEditing] = useState<{ set: PuzzleSet | null } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reload = useCallback(async () => { setSets(await puzzleStore.load(username)); }, [username]);
  useEffect(() => {
    reload();
    const off = puzzleStore.subscribe(reload);
    puzzleStore.sync(username).catch(() => {});
    return off;
  }, [username, reload]);

  const startEdit = async (s: PuzzleSet | null) => {
    if (await requireQuizStorage(currentUser)) setEditing({ set: s });
  };
  const saveSet = async (s: PuzzleSet) => {
    const next = [s, ...sets.filter(x => x.id !== s.id)];
    await puzzleStore.save(username, next);
    setSets(next);
    setEditing(null);
    setNote(`Đã lưu bộ "${s.title}" vào kho cá nhân.`);
  };
  const removeSet = async (id: string) => {
    const next = sets.filter(x => x.id !== id);
    await puzzleStore.save(username, next);
    setSets(next); setConfirmId(null);
  };

  if (playing) return <PlayScreen set={playing} onExit={() => setPlaying(null)} />;

  const all: Array<{ set: PuzzleSet; sample: boolean }> = [{ set: SAMPLE_PUZZLE, sample: true }, ...sets.map(s => ({ set: s, sample: false }))];

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-4 sm:p-7 space-y-5">
      <style>{CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">LẬT MẢNH GHÉP</h2>
          <p className="text-sm text-slate-700 wrap-ok">Mỗi mảnh ghép là một câu hỏi. Trả lời đúng để lật mảnh, lộ dần bức ảnh bí mật rồi đoán xem đó là gì.</p>
        </div>
        <button type="button" onClick={() => startEdit(null)}
          className="min-h-12 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-black uppercase inline-flex items-center gap-2 cursor-pointer shadow-md whitespace-nowrap">
          <Plus className="w-4 h-4" /><span>Tạo bộ mới</span>
        </button>
      </div>
      {note && <div className="rounded-xl bg-emerald-50 border border-emerald-300 px-3 py-2 text-sm font-bold text-emerald-900 wrap-ok" role="status">{note}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {all.map(({ set, sample }) => (
          <div key={set.id} className="rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-sky-50 overflow-hidden shadow-2xs flex flex-col">
            <div className="relative" style={{ aspectRatio: '16 / 9' }}>
              <img src={set.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${(PIECE_LAYOUTS[set.pieces] || PIECE_LAYOUTS[6]).cols}, 1fr)`, gridTemplateRows: `repeat(${(PIECE_LAYOUTS[set.pieces] || PIECE_LAYOUTS[6]).rows}, 1fr)`, background: 'rgba(15,23,42,.18)' }} aria-hidden>
                {Array.from({ length: set.pieces }, (_, i) => <div key={i} className="border border-white/70" />)}
              </div>
              {sample && <span className="absolute top-2 right-2 px-2.5 py-0.5 rounded-full bg-indigo-700 text-white text-[12px] font-black">MẪU</span>}
            </div>
            <div className="p-3.5 flex-1 flex flex-col gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-black text-slate-900 leading-snug wrap-ok break-words">{set.title}</h3>
                {set.description && <p className="text-xs font-semibold text-slate-600 wrap-ok break-words">{set.description}</p>}
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs font-black">
                <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-900 whitespace-nowrap">{set.pieces} mảnh</span>
                <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 whitespace-nowrap">{set.mode === 'lock' ? 'Sai là khóa mảnh' : 'Sai trả lời lại'}</span>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                <button type="button" onClick={() => setPlaying(set)} className="min-h-10 px-4 rounded-xl bg-gradient-to-r from-pink-600 to-orange-600 text-white text-xs font-black uppercase inline-flex items-center gap-1.5 cursor-pointer shadow">
                  <Play className="w-4 h-4" /><span>Chơi ngay</span>
                </button>
                <button type="button" onClick={() => startEdit(set)} className="min-h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-black text-slate-800 inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-50">
                  <Pencil className="w-3.5 h-3.5" /><span>{sample ? 'Tạo bản sao để sửa' : 'Sửa'}</span>
                </button>
                {!sample && (confirmId === set.id ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800">
                    <span>Xóa bộ này?</span>
                    <button type="button" onClick={() => removeSet(set.id)} className="px-2.5 py-1 rounded-lg bg-rose-700 text-white font-black cursor-pointer">Xóa</button>
                    <button type="button" onClick={() => setConfirmId(null)} className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-700 font-black cursor-pointer">Hủy</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmId(set.id)} aria-label={`Xóa bộ ${set.title}`} className="min-h-10 w-10 rounded-xl border border-rose-200 text-rose-700 inline-flex items-center justify-center cursor-pointer hover:bg-rose-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs font-bold text-slate-600 wrap-ok">
        Bộ ghép hình của thầy cô được lưu cùng nơi với kho câu hỏi (thư mục trên máy tính hoặc Drive cá nhân đã chọn ở mục "Nơi lưu câu hỏi của tôi").
      </p>

      {editing && <PuzzleSetEditor initial={editing.set} onSave={saveSet} onClose={() => setEditing(null)} />}
    </div>
  );
};

export default PuzzleFlipGame;
