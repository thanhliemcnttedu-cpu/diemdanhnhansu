import React, { useEffect, useMemo, useState } from 'react';
import { X, Play, ChevronLeft, ChevronRight, RotateCcw, CheckCircle2, XCircle, Lightbulb, Coins, Trophy, Eye } from 'lucide-react';
import type { QuestionItem } from '../../../types';
import { shuffle, shuffleAvoid, shuffleMatching } from '../../../utils/shuffle';
import { QuestionAudioButton } from '../../views/picker/QuestionAudioButton';
import { typeLabel } from './QuestionEditor';
import { SequenceBoard, MatchingBoard } from '../../views/picker/AnswerBoards';

/**
 * ▶ CHƠI THỬ câu hỏi / bộ câu hỏi với vai trò HỌC SINH (11/2026) — để giáo viên kiểm tra câu hỏi trước khi dùng.
 * Tự làm bài như học sinh (đủ 7 dạng), bấm Kiểm tra để xem Đúng / Sai + lời giải; không cộng xu, không ghi dữ liệu.
 * Thứ tự phương án GIỮ NGUYÊN như trò chơi; Sắp xếp / Nối cột / từ điền được XÁO TRỘN như khi chơi.
 */

const LETTERS = 'ABCDEF';
const BLANK_RE = /\[[^\]]*\]/g;
type Result = boolean | null;

interface Props { questions: QuestionItem[]; startIndex?: number; title?: string; onClose: () => void }

export const QuestionPlayer: React.FC<Props> = ({ questions, startIndex = 0, title, onClose }) => {
  const [idx, setIdx] = useState(Math.min(startIndex, Math.max(0, questions.length - 1)));
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [round, setRound] = useState(0); // tăng để làm lại câu hiện tại
  const q = questions[idx];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && !(e.target as HTMLElement)?.closest('input,textarea')) setIdx(i => Math.min(i + 1, questions.length - 1));
      else if (e.key === 'ArrowLeft' && !(e.target as HTMLElement)?.closest('input,textarea')) setIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, questions.length]);

  if (!q) return null;
  const done = Object.keys(results).length;
  const correct = Object.values(results).filter(Boolean).length;
  const isSet = questions.length > 1;

  return (
    <div className="fixed inset-0 z-[70] bg-sky-900/30 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="qp-title">
      <div className="bg-white w-full max-w-4xl h-[94vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><Play className="w-5 h-5 fill-emerald-600" /></div>
          <div className="flex-1 min-w-0">
            <h2 id="qp-title" className="text-base font-black text-slate-900 truncate">Chơi thử{title ? ` — ${title}` : ''}</h2>
            <p className="text-sm text-slate-600 truncate">Bạn đang làm bài như học sinh · không cộng xu, không lưu kết quả</p>
          </div>
          {isSet && (
            <span className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-amber-50 border border-amber-200 text-sm font-black text-amber-900 tabular-nums"><Trophy className="w-4 h-4" /> Đúng {correct}/{done}</span>
          )}
          <button type="button" onClick={onClose} aria-label="Đóng" className="no-hover-fx w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5 bg-gradient-to-b from-sky-50/60 to-white">
          <PlayOne key={`${q.id}-${round}`} q={q} onResult={(ok) => setResults(r => ({ ...r, [q.id]: ok }))} />
        </div>

        <div className="px-4 sm:px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
          {isSet ? (
            <>
              <button type="button" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0} className="no-hover-fx h-10 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-bold text-slate-700 inline-flex items-center gap-1 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /> Câu trước</button>
              <span className="text-sm font-bold text-slate-700 tabular-nums mx-1">Câu {idx + 1}/{questions.length}</span>
              <div className="hidden md:flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
                {questions.map((x, i) => (
                  <button key={x.id} type="button" onClick={() => setIdx(i)} aria-label={`Câu ${i + 1}`}
                    className={`no-hover-fx w-7 h-7 shrink-0 rounded-lg text-xs font-black ${i === idx ? 'ring-2 ring-indigo-500 ' : ''}${results[x.id] === true ? 'bg-emerald-600 text-white' : results[x.id] === false ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{i + 1}</button>
                ))}
              </div>
            </>
          ) : <span className="flex-1" />}
          <button type="button" onClick={() => { setRound(r => r + 1); setResults(r => { const n = { ...r }; delete n[q.id]; return n; }); }} className="no-hover-fx h-10 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-bold text-slate-700 inline-flex items-center gap-1.5 ml-auto"><RotateCcw className="w-4 h-4" /> Làm lại</button>
          {isSet && idx < questions.length - 1 ? (
            <button type="button" onClick={() => setIdx(i => i + 1)} className="no-hover-fx h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black inline-flex items-center gap-1">Câu tiếp <ChevronRight className="w-4 h-4" /></button>
          ) : (
            <button type="button" onClick={onClose} className="no-hover-fx h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black">Xong</button>
          )}
        </div>
      </div>
    </div>
  );
};

/** Một câu hỏi — tương tác như học sinh */
const PlayOne: React.FC<{ q: QuestionItem; onResult: (ok: boolean) => void }> = ({ q, onResult }) => {
  const [result, setResult] = useState<Result>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [tf, setTf] = useState<boolean | null>(null);
  const [fills, setFills] = useState<string[]>([]);
  const [seqPicked, setSeqPicked] = useState<number[]>([]);
  const [matchSel, setMatchSel] = useState<number | null>(null);
  const [matches, setMatches] = useState<Record<number, number>>({});
  const [showKey, setShowKey] = useState(false);

  const blanks = useMemo(() => (q.questionText.match(BLANK_RE) || []).length || (q.blankAnswers || []).length, [q]);
  const wordBank = useMemo(() => shuffle([...(q.blankAnswers || []), ...(q.distractorWords || [])].filter(Boolean)), [q]);
  const seqOrder = useMemo(() => shuffleAvoid((q.sequenceItems || []).map((_, i) => i)), [q]);
  const matchOrder = useMemo(() => shuffleMatching((q.matchingPairs || []).length), [q]);

  const finish = (ok: boolean) => { setResult(ok); onResult(ok); };
  const locked = result !== null;

  const check = () => {
    switch (q.type) {
      case 'multi_select': {
        const want = [...(q.correctOptionIndices || [])].sort().join(',');
        finish([...picked].sort().join(',') === want);
        break;
      }
      case 'fill_blank': {
        const norm = (x: string) => (x || '').trim().toLowerCase();
        finish((q.blankAnswers || []).slice(0, blanks).every((a, i) => norm(fills[i]) === norm(a)));
        break;
      }
      case 'sequence_order':
        finish(seqPicked.length === (q.sequenceItems || []).length && seqPicked.every((v, i) => v === i));
        break;
      case 'matching':
        finish((q.matchingPairs || []).every((_, i) => matches[i] === i));
        break;
    }
  };
  const canCheck = q.type === 'multi_select' ? picked.length > 0
    : q.type === 'fill_blank' ? fills.filter(Boolean).length >= blanks && blanks > 0
    : q.type === 'sequence_order' ? seqPicked.length === (q.sequenceItems || []).length
    : q.type === 'matching' ? Object.keys(matches).length === (q.matchingPairs || []).length
    : false;

  const parts = q.questionText.split(BLANK_RE);
  const optionImgs = (q.optionImages || []).some(Boolean);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
        <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200">{typeLabel(q.type)}</span>
        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{q.subject || 'Tổng hợp'}</span>
        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1"><Coins className="w-3.5 h-3.5" /> +{q.pointsReward || 2} xu</span>
      </div>

      {/* Đề bài */}
      {q.questionText && (
        <p className="text-xl sm:text-2xl font-black text-slate-900 leading-snug whitespace-pre-wrap">
          {q.type === 'fill_blank' ? parts.map((p, i) => (
            <React.Fragment key={i}>{p}{i < parts.length - 1 && (
              <button type="button" disabled={locked || !fills[i]} onClick={() => setFills(f => { const n = [...f]; n[i] = ''; return n; })}
                className={`no-hover-fx inline-flex items-center justify-center min-w-24 h-10 mx-1 px-3 align-middle rounded-xl border-2 border-dashed text-lg ${fills[i] ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-400 text-slate-400'} ${result !== null && fills[i] ? ((fills[i] || '').trim().toLowerCase() === (q.blankAnswers?.[i] || '').trim().toLowerCase() ? 'border-solid border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-solid border-rose-600 bg-rose-50 text-rose-800') : ''}`}
                title={fills[i] ? 'Bấm để bỏ từ này' : undefined}>{fills[i] || `(${i + 1})`}</button>
            )}</React.Fragment>
          )) : q.questionText}
        </p>
      )}
      {q.image && <img src={q.image} alt="Ảnh câu hỏi" className="max-h-72 mx-auto object-contain rounded-2xl border border-slate-200 bg-white" />}
      <QuestionAudioButton src={q.audio} />

      {/* Trả lời */}
      {(q.type === 'multiple_choice' || q.type === 'multi_select') && (
        <div className={`grid gap-3 ${optionImgs ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {(q.options || []).map((o, i) => {
            const sel = picked.includes(i);
            const right = q.type === 'multiple_choice' ? q.correctOptionIndex === i : (q.correctOptionIndices || []).includes(i);
            const tone = locked ? (right ? 'border-emerald-600 bg-emerald-50' : sel ? 'border-rose-600 bg-rose-50' : 'border-slate-200 bg-white opacity-70') : sel ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-400';
            return (
              <button key={i} type="button" disabled={locked}
                onClick={() => {
                  if (q.type === 'multiple_choice') { setPicked([i]); finish(i === q.correctOptionIndex); }
                  else setPicked(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]);
                }}
                className={`no-hover-fx text-left rounded-2xl border-2 p-3 flex flex-col gap-2 transition-colors ${tone}`}>
                <span className="flex items-center gap-2.5">
                  <span className={`w-9 h-9 rounded-xl text-base font-black inline-flex items-center justify-center shrink-0 ${locked && right ? 'bg-emerald-600 text-white' : sel ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{LETTERS[i]}</span>
                  <span className="text-base font-bold text-slate-900">{o}</span>
                  {locked && right && <CheckCircle2 className="w-5 h-5 text-emerald-700 ml-auto shrink-0" />}
                  {locked && sel && !right && <XCircle className="w-5 h-5 text-rose-700 ml-auto shrink-0" />}
                </span>
                {q.optionImages?.[i] && <img src={q.optionImages[i]} alt={`Phương án ${LETTERS[i]}`} className="w-full h-32 object-contain rounded-xl bg-white" />}
              </button>
            );
          })}
        </div>
      )}

      {q.type === 'true_false' && (
        <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
          {[true, false].map(v => {
            const right = (q.isTrue ?? true) === v;
            const sel = tf === v;
            return (
              <button key={String(v)} type="button" disabled={locked} onClick={() => { setTf(v); finish(right); }}
                className={`no-hover-fx h-20 rounded-2xl border-2 text-2xl font-black ${locked ? (right ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : sel ? 'border-rose-600 bg-rose-50 text-rose-800' : 'border-slate-200 text-slate-400') : 'border-slate-300 bg-white text-slate-800 hover:border-indigo-500'}`}>{v ? 'ĐÚNG' : 'SAI'}</button>
            );
          })}
        </div>
      )}

      {q.type === 'fill_blank' && !locked && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-slate-700">Bấm từ để điền vào chỗ trống (bấm lại ô đã điền để bỏ):</p>
          <div className="flex flex-wrap gap-2">
            {wordBank.map((w, i) => {
              const used = fills.filter(x => x === w).length >= wordBank.slice(0, i + 1).filter(x => x === w).length;
              return (
                <button key={i} type="button" disabled={used}
                  onClick={() => setFills(f => { const n = [...f]; const k = Array.from({ length: blanks }).findIndex((_, j) => !n[j]); if (k >= 0) n[k] = w; return n; })}
                  className="no-hover-fx h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-base font-bold disabled:opacity-30">{w}</button>
              );
            })}
          </div>
        </div>
      )}

      {q.type === 'sequence_order' && (
        <SequenceBoard
          items={(q.sequenceItems || []).map((t, k) => ({ text: t, image: q.sequenceImages?.[k] || undefined }))}
          pool={seqOrder} order={seqPicked} onChange={setSeqPicked} locked={locked} />
      )}

      {q.type === 'matching' && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-slate-700">Bấm một ô ở cột A, rồi bấm ô cần nối ở cột B (bấm lại ô A để nối lại):</p>
          <MatchingBoard
            left={(q.matchingPairs || []).map(p => ({ text: p.left, image: p.leftImage }))}
            right={(q.matchingPairs || []).map(p => ({ text: p.right, image: p.rightImage }))}
            leftOrder={matchOrder.left} rightOrder={matchOrder.right}
            matches={matches} selected={matchSel} onSelect={setMatchSel}
            onMatch={(l, r) => setMatches(m => ({ ...m, [l]: r }))}
            onUnmatch={(l) => setMatches(m => { const n = { ...m }; delete n[l]; return n; })}
            locked={locked} />
          {locked && result === false && (
            <div className="rounded-xl bg-white border border-slate-200 p-3 text-sm text-slate-800 space-y-1">
              <strong>Đáp án đúng:</strong>
              {(q.matchingPairs || []).map((p, k) => <div key={k}>{p.left || '(ảnh)'} ↔ {p.right || '(ảnh)'}</div>)}
            </div>
          )}
        </div>
      )}

      {q.type === 'oral' && !locked && (
        <div className="space-y-2 text-center">
          <p className="text-sm text-slate-700">Câu trả lời miệng — học sinh nói, giáo viên chấm:</p>
          <div className="inline-flex gap-2">
            <button type="button" onClick={() => finish(true)} className="no-hover-fx h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-base font-black">Trả lời đúng</button>
            <button type="button" onClick={() => finish(false)} className="no-hover-fx h-11 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-base font-black">Chưa đúng</button>
          </div>
        </div>
      )}

      {!locked && ['multi_select', 'fill_blank', 'sequence_order', 'matching'].includes(q.type) && (
        <div className="flex justify-center">
          <button type="button" onClick={check} disabled={!canCheck} className="no-hover-fx h-12 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-base font-black disabled:opacity-40">Kiểm tra</button>
        </div>
      )}

      {locked && (
        <div className={`rounded-2xl border-2 p-4 space-y-2 ${result ? 'border-emerald-500 bg-emerald-50' : 'border-rose-500 bg-rose-50'}`} role="status">
          <div className={`flex items-center gap-2 text-lg font-black ${result ? 'text-emerald-800' : 'text-rose-800'}`}>
            {result ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
            {result ? `Chính xác! +${q.pointsReward || 2} xu (chơi thử, không cộng thật)` : 'Chưa đúng'}
          </div>
          {q.type === 'fill_blank' && !result && <p className="text-sm text-slate-800"><strong>Đáp án:</strong> {(q.blankAnswers || []).join(' · ')}</p>}
          {(q.teacherAnswerKey || q.answerImage) && (
            showKey ? (
              <div className="space-y-2">
                {q.teacherAnswerKey && <p className="text-sm text-slate-800 whitespace-pre-wrap flex gap-1.5"><Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />{q.teacherAnswerKey}</p>}
                {q.answerImage && <img src={q.answerImage} alt="Ảnh lời giải" className="max-h-48 object-contain rounded-xl bg-white border border-slate-200" />}
              </div>
            ) : (
              <button type="button" onClick={() => setShowKey(true)} className="no-hover-fx text-sm font-bold text-indigo-700 hover:underline inline-flex items-center gap-1"><Eye className="w-4 h-4" /> Xem lời giải</button>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default QuestionPlayer;
