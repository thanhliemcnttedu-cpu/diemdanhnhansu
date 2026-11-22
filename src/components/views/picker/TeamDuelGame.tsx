import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Swords, RotateCcw } from 'lucide-react';
import { useClassroom } from '../../../context/ClassroomContext';
import type { Student } from '../../../types';
import { playTickSound, playFanfareSound, playCoinSound } from '../../../utils/audio';
import { handleAvatarImgError } from '../../../utils/avatarConfig';
import { useFairCall } from './useFairCall';

/**
 * Đấu tổ đối kháng: pick two groups, the app draws one student from each (fair round), the teacher reads one quick
 * question and taps who answered right first. The winner gets xu and the group scoreboard of this session goes up.
 */
type Duel = { a: Student; b: Student; done: boolean };

export const TeamDuelGame: React.FC = () => {
  const { currentClassStudents, awardPoints } = useClassroom();
  const fair = useFairCall();
  const groups = useMemo(() => [...new Set(currentClassStudents.map(s => s.group || 'Chưa chia tổ'))].sort((x, y) => x.localeCompare(y, 'vi', { numeric: true })), [currentClassStudents]);
  const [ga, setGa] = useState('');
  const [gb, setGb] = useState('');
  const [xu, setXu] = useState(3);
  const [duel, setDuel] = useState<Duel | null>(null);
  const [score, setScore] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState('');
  const [shuffling, setShuffling] = useState(false);
  const [lit, setLit] = useState<string[]>([]);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const A = ga || groups[0] || '';
  const B = gb && gb !== A ? gb : groups.find(g => g !== A) || '';

  const draw = (g: string): Student | null => {
    const members = currentClassStudents.filter(s => (s.group || 'Chưa chia tổ') === g);
    const pool = members.filter(s => !fair.calledIds.includes(s.id));
    const list = pool.length > 0 ? pool : members;
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  };

  const membersOf = (g: string) => currentClassStudents.filter(s => (s.group || 'Chưa chia tổ') === g);

  // Shuffle: the avatars of both groups light up one by one (slowing down), then the two chosen racers pop up.
  const start = () => {
    if (shuffling) return;
    const a = draw(A), b = draw(B);
    if (!a || !b) { setMsg('Cần chọn hai tổ khác nhau, mỗi tổ có ít nhất một bạn.'); return; }
    const ma = membersOf(A), mb = membersOf(B);
    setMsg(''); setDuel(null); setShuffling(true);
    const t0 = performance.now(); const total = 3000;
    const step = () => {
      const p = Math.min((performance.now() - t0) / total, 1);
      if (p >= 1) {
        setLit([a.id, b.id]); setShuffling(false); setDuel({ a, b, done: false });
        fair.markCalled(a.id, 'team_duel'); fair.markCalled(b.id, 'team_duel');
        playFanfareSound(); confetti({ particleCount: 80, spread: 70, origin: { y: 0.55 } });
        return;
      }
      setLit([ma[Math.floor(Math.random() * ma.length)].id, mb[Math.floor(Math.random() * mb.length)].id]);
      playTickSound(500 + p * 600);
      timer.current = window.setTimeout(step, 70 + p * 260);
    };
    step();
  };

  const finish = (side: 'a' | 'b' | 'draw') => {
    if (!duel || duel.done) return;
    if (side !== 'draw') {
      const w = side === 'a' ? duel.a : duel.b;
      const g = w.group || 'Chưa chia tổ';
      awardPoints([w.id], xu, 'Thắng đấu tổ đối kháng');
      setScore(s => ({ ...s, [g]: (s[g] || 0) + 1 }));
      playCoinSound(); playFanfareSound(); confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } });
      setMsg(`${w.name} (${g}) thắng, được cộng ${xu} xu.`);
    } else setMsg('Hòa, cả hai bạn đều giỏi. Chuyển sang cặp khác.');
    setDuel({ ...duel, done: true });
  };

  const card = (s: Student, tone: string) => (
    <div className={`flex-1 min-w-[140px] rounded-2xl border-2 p-3 shadow-xl animate-in zoom-in-50 fade-in duration-700 ${tone}`}>
      <img src={s.avatar} alt={s.name} referrerPolicy="no-referrer" onError={e => handleAvatarImgError(e, s.gender, s.name)} className="mx-auto w-24 h-24 rounded-2xl object-cover border border-slate-200" />
      <p className="mt-2 text-lg font-black text-slate-900">{s.name}</p>
      <p className="text-sm font-bold text-slate-700 whitespace-nowrap">{s.group || 'Chưa chia tổ'}</p>
    </div>
  );
  const sel = 'h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-900';
  const btn = 'no-hover-fx min-h-11 px-4 rounded-xl text-sm font-bold whitespace-nowrap cursor-pointer';

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 sm:p-7 space-y-5 text-center">
      <div>
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">ĐẤU TỔ ĐỐI KHÁNG</h2>
        <p className="text-sm text-slate-700">Chọn hai tổ, máy gọi mỗi tổ một bạn. Thầy cô đọc một câu hỏi nhanh, bạn nào đúng trước thì tổ đó được điểm.</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <label className="text-sm font-bold text-slate-800 flex items-center gap-2 whitespace-nowrap">Tổ thứ nhất <select className={sel} value={A} onChange={e => setGa(e.target.value)}>{groups.map(g => <option key={g}>{g}</option>)}</select></label>
        <label className="text-sm font-bold text-slate-800 flex items-center gap-2 whitespace-nowrap">Tổ thứ hai <select className={sel} value={B} onChange={e => setGb(e.target.value)}>{groups.filter(g => g !== A).map(g => <option key={g}>{g}</option>)}</select></label>
        <label className="text-sm font-bold text-slate-800 flex items-center gap-2 whitespace-nowrap">Xu thưởng <select className={sel} value={xu} onChange={e => setXu(Number(e.target.value))}>{[2, 3, 5].map(n => <option key={n} value={n}>{n} xu</option>)}</select></label>
        <button type="button" onClick={start} disabled={shuffling || (!!duel && !duel.done)} className={`${btn} bg-gradient-to-r from-rose-600 to-orange-600 text-white flex items-center gap-2 disabled:opacity-50`}><Swords className="w-5 h-5" />{shuffling ? 'Đang xáo trộn…' : 'Gọi cặp đấu'}</button>
      </div>

      {shuffling && (
        <div className="grid sm:grid-cols-2 gap-3 text-left" aria-label="Đang xáo trộn học sinh hai tổ">
          {[A, B].map((g, gi) => (
            <div key={g} className={`rounded-2xl border-2 p-3 ${gi === 0 ? 'bg-sky-50 border-sky-300' : 'bg-amber-50 border-amber-300'}`}>
              <p className="text-sm font-black uppercase text-slate-900 mb-2">{g}</p>
              <div className="flex flex-wrap gap-2">
                {membersOf(g).map(s => (
                  <img key={s.id} src={s.avatar} alt={s.name} title={s.name} referrerPolicy="no-referrer" onError={e => handleAvatarImgError(e, s.gender, s.name)}
                    className={`w-12 h-12 rounded-xl object-cover border-2 transition-all duration-75 ${lit.includes(s.id) ? 'border-rose-600 scale-125 shadow-lg ring-4 ring-rose-300 z-10' : 'border-white opacity-60'}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {duel && !shuffling && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
            {card(duel.a, 'bg-sky-50 border-sky-300')}
            <span className="text-3xl font-black text-rose-700" aria-hidden>VS</span>
            {card(duel.b, 'bg-amber-50 border-amber-300')}
          </div>
          {!duel.done ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={() => finish('a')} className={`${btn} bg-sky-700 text-white`}>{duel.a.name} đúng trước</button>
              <button type="button" onClick={() => finish('b')} className={`${btn} bg-amber-700 text-white`}>{duel.b.name} đúng trước</button>
              <button type="button" onClick={() => finish('draw')} className={`${btn} bg-white border border-slate-300 text-slate-800`}>Hòa</button>
            </div>
          ) : (
            <button type="button" onClick={start} className={`${btn} bg-white border border-slate-300 text-slate-800 inline-flex items-center gap-2`}><RotateCcw className="w-4 h-4" />Cặp tiếp theo</button>
          )}
        </div>
      )}
      {msg && <p role="status" className="text-sm font-bold text-emerald-800">{msg}</p>}

      {Object.keys(score).length > 0 && (
        <div className="max-w-md mx-auto text-left">
          <h3 className="text-sm font-black text-slate-900 mb-1">Bảng điểm đấu tổ hôm nay</h3>
          <ul className="space-y-1">
            {Object.entries(score).sort((x, y) => y[1] - x[1]).map(([g, n]) => (
              <li key={g} className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-900"><span>{g}</span><span className="tabular-nums whitespace-nowrap">{n} trận thắng</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default TeamDuelGame;
