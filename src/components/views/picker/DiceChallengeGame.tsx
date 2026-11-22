import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Dices } from 'lucide-react';
import { useClassroom } from '../../../context/ClassroomContext';
import type { Student } from '../../../types';
import { playTickSound, playFanfareSound, playCoinSound } from '../../../utils/audio';
import { handleAvatarImgError } from '../../../utils/avatarConfig';
import { CalledStudentModal } from './CalledStudentModal';
import { useFairCall } from './useFairCall';

/**
 * Xúc xắc gọi tên: mỗi mặt của khối xúc xắc 3D là một bạn (số mặt, ảnh tròn, tên).
 * Bạn được gọi tên được chọn trước (công bằng, ghi nhận như mọi trò gọi tên), rồi gieo để mặt đó ngửa lên.
 */
// Xoay khối để mặt v quay ra trước. Hai mặt đối nhau cộng bằng 7 (1/6 trước/sau, 3/4 phải/trái, 2/5 trên/dưới).
const FACE_ROT: Record<number, [number, number]> = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };
const FACE_PLACE: Record<number, string> = {
  1: 'rotateY(0deg)', 6: 'rotateY(180deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)', 2: 'rotateX(90deg)', 5: 'rotateX(-90deg)',
};
// Viền vòng quanh ảnh mỗi mặt: hồng, xanh ngọc, vàng, xanh da trời, tím, cam
const RINGS: Record<number, string> = { 1: '#F9A8D4', 2: '#5EEAD4', 3: '#FCD34D', 4: '#7DD3FC', 5: '#C4B5FD', 6: '#FDBA74' };

const sample = (list: Student[], count: number, exclude?: string): Student[] => {
  const pool = list.filter(s => s.id !== exclude);
  const out: Student[] = [];
  const bag = [...pool];
  while (out.length < count && bag.length > 0) out.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  // Lớp ít hơn 6 bạn thì lặp lại cho đủ 6 mặt
  while (out.length < count && pool.length > 0) out.push(pool[Math.floor(Math.random() * pool.length)]);
  return out;
};

const Face: React.FC<{ v: number; st?: Student }> = ({ v, st }) => (
  <div className="dice-face" style={{ transform: `${FACE_PLACE[v]} translateZ(calc(var(--ds) / 2))` }}>
    <span className="dice-num">{v}</span>
    <div className="dice-ava" style={{ borderColor: RINGS[v] }}>
      {st && (
        <img
          src={st.avatar} alt="" referrerPolicy="no-referrer" draggable={false}
          onError={(e) => handleAvatarImgError(e, st.gender, st.name)}
        />
      )}
    </div>
    <div className="dice-name">{st ? st.name : ''}</div>
  </div>
);

const DICE_CSS = `
.dice-scene{--ds:200px;perspective:900px;width:calc(var(--ds)*1.75);height:calc(var(--ds)*1.7);margin:0 auto;position:relative}
@media (max-width:480px){.dice-scene{--ds:150px}}
.dice-cube{width:var(--ds);height:var(--ds);position:absolute;left:50%;top:50%;margin:calc(var(--ds)/-2) 0 0 calc(var(--ds)/-2);transform-style:preserve-3d}
.dice-face{position:absolute;inset:0;border-radius:16%;background:linear-gradient(160deg,#FFFFFF,#FFF7E3);border:calc(var(--ds)*.03) solid #F59E0B;box-shadow:inset 0 0 calc(var(--ds)*.1) rgba(245,158,11,.22);backface-visibility:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--ds)*.05);padding:calc(var(--ds)*.06) calc(var(--ds)*.05) calc(var(--ds)*.05)}
.dice-num{position:absolute;left:calc(var(--ds)*.09);top:calc(var(--ds)*.06);font-size:calc(var(--ds)*.075);font-weight:800;color:#B45309;line-height:1}
.dice-ava{width:calc(var(--ds)*.46);height:calc(var(--ds)*.46);border-radius:50%;border:calc(var(--ds)*.025) solid #FBCFE8;background:#fff;overflow:hidden;flex:none;box-shadow:0 2px 6px rgba(0,0,0,.12)}
.dice-ava img{width:100%;height:100%;object-fit:cover;object-position:center top;display:block}
.dice-name{max-width:100%;font-size:calc(var(--ds)*.09);font-weight:800;color:#0f172a;line-height:1.15;text-align:center;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dice-air{position:absolute;inset:0}
.dice-shadow{position:absolute;left:50%;bottom:2%;width:calc(var(--ds)*.9);height:calc(var(--ds)*.2);margin-left:calc(var(--ds)*-.45);border-radius:50%;background:rgba(146,64,14,.28);filter:blur(7px)}
.dice-landed .dice-air{animation:diceLand .5s ease-out both}
@keyframes diceLand{0%{transform:scale(1.1)}60%{transform:scale(.97)}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.dice-landed .dice-air{animation:none}}
`;

type Phase = 'idle' | 'toss' | 'landed';
/** Tổng thời gian gieo (ms): quay rất nhanh lúc đầu, chậm dần rồi dừng hẳn */
const ROLL_MS = 4000;

export const DiceChallengeGame: React.FC = () => {
  const { currentClassStudents, awardPoints } = useClassroom();
  const fair = useFairCall();
  const [phase, setPhase] = useState<Phase>('idle');
  const [value, setValue] = useState(1);              // mặt (1-6) xúc xắc dừng lại
  const [rot, setRot] = useState<[number, number]>([-22, -32]);
  const cubeRef = useRef<HTMLDivElement | null>(null);
  const airRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [winner, setWinner] = useState<Student | null>(null);
  const [open, setOpen] = useState(false);
  const [awarded, setAwarded] = useState(false);
  // Bạn nào ở mặt nào; ban đầu là 6 bạn ngẫu nhiên của lớp
  const classKey = currentClassStudents.map(s => s.id).join('|');
  const calledKey = fair.calledIds.join('|');
  const initialFaces = useMemo(() => {
    const left = currentClassStudents.filter(s => !fair.calledIds.includes(s.id));
    return sample(left.length > 0 ? left : currentClassStudents, 6);
  }, [classKey, calledKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [faceStudents, setFaceStudents] = useState<Student[] | null>(null);
  const faces = faceStudents && faceStudents.every(f => currentClassStudents.some(s => s.id === f.id)) ? faceStudents : initialFaces;
  const timers = useRef<number[]>([]);
  const clear = () => { timers.current.forEach(t => window.clearTimeout(t)); timers.current = []; };
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => { clear(); if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const rolling = phase === 'toss';

  const roll = () => {
    if (rolling || currentClassStudents.length === 0) return;
    clear();
    const pool = currentClassStudents.filter(s => !fair.calledIds.includes(s.id));
    const list = pool.length > 0 ? pool : currentClassStudents;
    const target = list[Math.floor(Math.random() * list.length)];
    const finalValue = 1 + Math.floor(Math.random() * 6);
    // Đặt bạn được gọi lên mặt sẽ ngửa; 5 mặt còn lại là các bạn khác
    const others = sample(list, 5, target.id);   // 5 mặt còn lại cũng chỉ là các bạn chưa được gọi
    const next: Student[] = [];
    let oi = 0;
    for (let v = 1; v <= 6; v++) next.push(v === finalValue ? target : (others[oi++] || target));
    setFaceStudents(next);
    setWinner(null); setOpen(false); setAwarded(false); setPhase('toss');

    // Một chuyển động liên tục ~4 giây: quay rất nhanh lúc đầu, chậm dần (ease-out mạnh) rồi dừng ở mặt đã chọn.
    // Xúc xắc nảy nhẹ lên rồi hạ xuống cùng nhịp chậm lại.
    const [fx, fy] = FACE_ROT[finalValue];
    const x0 = rot[0], y0 = rot[1];
    const xEnd = Math.round(x0 / 360) * 360 + 5 * 360 + fx;
    const yEnd = Math.round(y0 / 360) * 360 + 7 * 360 + fy;
    const t0 = performance.now();
    let lastTick = 0;
    const frame = (now: number) => {
      const p = Math.min((now - t0) / ROLL_MS, 1);
      const e = 1 - Math.pow(1 - p, 4);
      const x = x0 + (xEnd - x0) * e;
      const y = y0 + (yEnd - y0) * e;
      const hop = Math.max(0, Math.sin(Math.PI * Math.min(1, p * 1.6))) * 70 * (1 - p);
      if (cubeRef.current) cubeRef.current.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
      if (airRef.current) airRef.current.style.transform = `translateY(${-hop}px)`;
      if (shadowRef.current) { shadowRef.current.style.transform = `scale(${1 - hop / 200})`; shadowRef.current.style.opacity = String(1 - hop / 160); }
      // tiếng lách cách mỗi khi qua một góc 90°, thưa dần khi xúc xắc chậm lại
      const q = Math.floor(Math.abs(y - y0) / 90);
      if (q !== lastTick) { lastTick = q; playTickSound(420 + (q % 6) * 70); }
      if (p < 1) { rafRef.current = requestAnimationFrame(frame); return; }
      rafRef.current = null;
      setRot([xEnd, yEnd]);
      setWinner(target); setValue(finalValue); setPhase('landed');
      fair.markCalled(target.id, 'dice');
      playFanfareSound(); confetti({ particleCount: 80, spread: 75, origin: { y: 0.55 } });
      later(() => setOpen(true), 700);
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  const award = (pts: number, reason: string) => {
    if (!winner || awarded) return;
    awardPoints([winner.id], pts, `${reason} (Xúc xắc gọi tên)`);
    playCoinSound(); setAwarded(true);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 sm:p-7 space-y-5 text-center">
      <style>{DICE_CSS}</style>
      <div>
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">XÚC XẮC GỌI TÊN</h2>
        <p className="text-sm text-slate-700">Mỗi mặt xúc xắc là một bạn. Bấm gieo, mặt nào ngửa lên là bạn đó được gọi tên.</p>
      </div>

      <div className="mx-auto w-full max-w-xl rounded-[32px] border-2 border-amber-200 py-8 px-4" style={{ background: 'linear-gradient(180deg,#FFF9E8 0%,#FFEFCB 100%)' }}>
        <div className={`dice-scene ${phase === 'landed' ? 'dice-landed' : ''}`} aria-label={winner ? `Xúc xắc ra mặt ${value}: ${winner.name}` : 'Xúc xắc 3D'} role="img">
          <div className="dice-shadow" ref={shadowRef} />
          <div className="dice-air" ref={airRef}>
            <div className="dice-cube" ref={cubeRef} style={{ transform: `rotateX(${rot[0]}deg) rotateY(${rot[1]}deg)` }}>
              {[1, 2, 3, 4, 5, 6].map(v => <Face key={v} v={v} st={faces[v - 1]} />)}
            </div>
          </div>
        </div>
        <p className="mt-3 min-h-10 text-2xl font-black text-slate-900 wrap-ok break-words" aria-live="polite">{winner ? winner.name : 'Sẵn sàng gieo'}</p>
        {phase === 'landed' && winner && <p className="text-sm font-bold text-amber-900">Chúc mừng bạn được gọi tên!</p>}
        {phase === 'toss' && <p className="text-sm font-bold text-amber-900">Xúc xắc đang lăn…</p>}
        <p className="mt-2 text-xs font-bold text-slate-700 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span className="tabular-nums">Còn {currentClassStudents.length - fair.calledIds.length}/{currentClassStudents.length} bạn chưa được gọi</span>
          <span aria-hidden>·</span>
          <span>Bạn đã gọi không bị gọi lại cho đến khi cả lớp đủ một vòng</span>
          {fair.calledIds.length > 0 && !rolling && (
            <button type="button" onClick={fair.resetRound} className="underline text-amber-900 font-black cursor-pointer">Bắt đầu vòng mới</button>
          )}
        </p>

        <div className="mt-5 flex justify-center">
          <button type="button" onClick={roll} disabled={rolling || currentClassStudents.length === 0}
            className="no-hover-fx w-full max-w-sm min-h-14 px-6 rounded-2xl bg-gradient-to-r from-orange-600 to-rose-600 text-white text-base font-black uppercase flex items-center justify-center gap-2.5 cursor-pointer shadow-lg shadow-orange-500/30 disabled:opacity-60">
            <Dices className="w-5 h-5 shrink-0" />
            <span>{rolling ? 'Đang gieo…' : 'Gieo xúc xắc ngay'}</span>
            {!rolling && <span aria-hidden>🎲</span>}
          </button>
        </div>
      </div>

      <CalledStudentModal
        student={winner} open={open} title="XÚC XẮC GỌI TÊN" badge="XÚC XẮC"
        onAward={award} awarded={awarded} onClose={() => setOpen(false)}
      />
    </div>
  );
};

export default DiceChallengeGame;
