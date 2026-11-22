import React, { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Flame, RotateCcw } from 'lucide-react';
import { useClassroom } from '../../../context/ClassroomContext';
import type { Student } from '../../../types';
import { playTickSound, playFanfareSound, playCoinSound } from '../../../utils/audio';
import { CalledStudentModal } from './CalledStudentModal';
import { useFairCall } from './useFairCall';

/**
 * Bom hẹn giờ: the fuse is lit, names flash faster and faster, and the bomb "explodes" on the student who must answer.
 * The student is drawn first (fair round), the flashing is only the show, so the result is always fair and logged.
 */
const FUSES = [
  { key: 'short', label: 'Ngắn (5–9 giây)', min: 5000, max: 9000 },
  { key: 'mid', label: 'Vừa (10–18 giây)', min: 10000, max: 18000 },
  { key: 'long', label: 'Dài (20–30 giây)', min: 20000, max: 30000 },
] as const;

export const BombGame: React.FC = () => {
  const { currentClassStudents, awardPoints } = useClassroom();
  const fair = useFairCall();
  const [fuse, setFuse] = useState<typeof FUSES[number]['key']>('mid');
  const [running, setRunning] = useState(false);
  const [shown, setShown] = useState<Student | null>(null);
  const [winner, setWinner] = useState<Student | null>(null);
  const [open, setOpen] = useState(false);
  const [awarded, setAwarded] = useState(false);
  const [boom, setBoom] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const start = () => {
    if (running || currentClassStudents.length === 0) return;
    const pool = currentClassStudents.filter(s => !fair.calledIds.includes(s.id));
    const list = pool.length > 0 ? pool : currentClassStudents;
    const target = list[Math.floor(Math.random() * list.length)];
    const f = FUSES.find(x => x.key === fuse)!;
    const total = f.min + Math.random() * (f.max - f.min);
    const t0 = performance.now();
    setRunning(true); setWinner(null); setOpen(false); setAwarded(false); setBoom(false);

    const step = () => {
      const p = Math.min((performance.now() - t0) / total, 1);
      if (p >= 1) {
        setShown(target); setWinner(target); setBoom(true); setRunning(false);
        fair.markCalled(target.id, 'bomb');
        playFanfareSound();
        confetti({ particleCount: 120, spread: 100, origin: { y: 0.55 }, colors: ['#f97316', '#facc15', '#ef4444'] });
        timer.current = window.setTimeout(() => setOpen(true), 900);
        return;
      }
      setShown(currentClassStudents[Math.floor(Math.random() * currentClassStudents.length)]);
      playTickSound(500 + p * 700);
      // tick interval shrinks from ~600ms to ~110ms as the fuse burns down
      timer.current = window.setTimeout(step, 600 - p * 490);
    };
    step();
  };

  const award = (pts: number, reason: string) => {
    if (!winner || awarded) return;
    awardPoints([winner.id], pts, `${reason} (Bom hẹn giờ)`);
    playCoinSound(); setAwarded(true);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 sm:p-7 space-y-5 text-center">
      <div>
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">BOM HẸN GIỜ</h2>
        <p className="text-sm text-slate-700">Châm ngòi, cả lớp hồi hộp chờ bom nổ. Bạn trúng bom trả lời một câu hỏi của thầy cô.</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2" role="radiogroup" aria-label="Độ dài ngòi">
        {FUSES.map(f => (
          <button key={f.key} type="button" disabled={running} aria-pressed={fuse === f.key} onClick={() => setFuse(f.key)}
            className={`no-hover-fx min-h-10 px-3 rounded-xl text-sm font-bold whitespace-nowrap cursor-pointer border disabled:opacity-60 ${fuse === f.key ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-800 border-slate-300'}`}>{f.label}</button>
        ))}
      </div>

      <div className="mx-auto w-full max-w-md rounded-3xl bg-orange-50 border-2 border-orange-300 py-8 px-4">
        <div className={`text-8xl select-none ${running ? 'animate-bounce' : ''} ${boom ? 'scale-125 transition-transform' : ''}`} aria-hidden>{boom ? '💥' : '💣'}</div>
        <p className="mt-4 min-h-10 text-2xl font-black text-slate-900 tabular-nums" aria-live="polite">
          {shown ? shown.name : 'Sẵn sàng châm ngòi'}
        </p>
        <p className="text-sm font-bold text-orange-900">{running ? 'Tích tắc… tích tắc…' : boom ? 'BÙM! Chúc mừng bạn trúng bom' : `${currentClassStudents.length} bạn trong lớp`}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={start} disabled={running || currentClassStudents.length === 0}
          className="no-hover-fx min-h-12 px-6 rounded-2xl bg-gradient-to-r from-orange-600 to-rose-600 text-white text-base font-black flex items-center gap-2 cursor-pointer disabled:opacity-50">
          <Flame className="w-5 h-5" />{running ? 'Đang cháy…' : 'Châm ngòi'}
        </button>
        {winner && !running && (
          <button type="button" onClick={start} className="no-hover-fx min-h-12 px-4 rounded-2xl bg-white border border-slate-300 text-slate-800 text-sm font-bold flex items-center gap-2 cursor-pointer"><RotateCcw className="w-4 h-4" />Quả bom khác</button>
        )}
      </div>

      <CalledStudentModal
        student={winner} open={open} title="Bom đã nổ!" badge="TRÚNG BOM"
        message={<>Bom nổ ngay bạn <strong className="text-slate-900">{winner?.name}</strong>! Mời bạn trả lời câu hỏi của thầy cô.</>}
        onAward={award} awarded={awarded} onClose={() => setOpen(false)}
      />
    </div>
  );
};

export default BombGame;
