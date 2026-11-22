import React, { useMemo, useState } from 'react';
import { RotateCcw, ArrowDownAZ, ArrowUpNarrowWide } from 'lucide-react';
import { useClassroom } from '../../../context/ClassroomContext';
import { useFairCall } from './useFairCall';

/**
 * Participation map: how many times each student was called (all games together), who was already called in the
 * current fair round, and who has waited longest. Counts come from the shared call log.
 */
const WINDOWS = [
  { key: 'all', label: 'Tất cả', days: 0 },
  { key: '30', label: '30 ngày', days: 30 },
  { key: '7', label: '7 ngày', days: 7 },
] as const;

const daysAgo = (ts: number) => Math.floor((Date.now() - ts) / 86400000);

export const ParticipationMap: React.FC = () => {
  const { currentClassStudents, activeClassId, callLog } = useClassroom();
  const fair = useFairCall();
  const [win, setWin] = useState<'all' | '30' | '7'>('30');
  const [sortWaiting, setSortWaiting] = useState(true);

  const rows = useMemo(() => {
    const days = WINDOWS.find(w => w.key === win)!.days;
    const since = days ? Date.now() - days * 86400000 : 0;
    const map = new Map<string, { count: number; last: number }>();
    callLog.forEach(e => {
      if (e.classId !== activeClassId) return;
      const m = map.get(e.studentId) || { count: 0, last: 0 };
      if (e.ts >= since) m.count++;
      if (e.ts > m.last) m.last = e.ts;
      map.set(e.studentId, m);
    });
    const list = currentClassStudents.map(s => ({ s, count: map.get(s.id)?.count || 0, last: map.get(s.id)?.last || 0, inRound: fair.calledIds.includes(s.id) }));
    if (sortWaiting) list.sort((a, b) => a.count - b.count || a.last - b.last);
    return list;
  }, [callLog, activeClassId, currentClassStudents, win, sortWaiting, fair.calledIds]);

  const never = rows.filter(r => r.count === 0).length;
  const btn = 'no-hover-fx min-h-10 px-3 rounded-xl text-sm font-bold whitespace-nowrap cursor-pointer border';

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-4" aria-label="Bản đồ tham gia" data-report>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="normal-case text-lg font-black text-slate-900">Bản đồ tham gia và vòng gọi công bằng</h2>
          <p className="text-sm text-slate-700">
            Vòng này đã gọi <strong className="tabular-nums">{fair.calledIds.length}/{fair.total}</strong> bạn
            {fair.fullyCalled ? ' (cả lớp đã đủ lượt, vòng mới tự bắt đầu)' : ''}. Có {never} bạn chưa được gọi trong khoảng đang xem.
          </p>
        </div>
        <button type="button" onClick={fair.resetRound} className={`${btn} bg-white text-sky-800 border-sky-300 hover:bg-sky-50 flex items-center gap-2`}>
          <RotateCcw className="w-4 h-4" />Bắt đầu vòng mới
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map(w => (
          <button key={w.key} type="button" aria-pressed={win === w.key} onClick={() => setWin(w.key)}
            className={`${btn} ${win === w.key ? 'bg-sky-700 text-white border-sky-700' : 'bg-white text-slate-800 border-slate-300'}`}>{w.label}</button>
        ))}
        <button type="button" onClick={() => setSortWaiting(v => !v)} className={`${btn} bg-white text-slate-800 border-slate-300 flex items-center gap-2`}>
          {sortWaiting ? <ArrowUpNarrowWide className="w-4 h-4" /> : <ArrowDownAZ className="w-4 h-4" />}
          {sortWaiting ? 'Sắp xếp: chờ lâu nhất trước' : 'Sắp xếp: theo số thứ tự'}
        </button>
      </div>

      {fair.total === 0 ? <p className="text-sm text-slate-700">Lớp chưa có học sinh.</p> : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {rows.map(r => {
            const tone = r.count === 0 ? 'bg-rose-50 border-rose-300 text-rose-900' : r.count >= 3 ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-sky-50 border-sky-300 text-sky-900';
            return (
              <li key={r.s.id} className={`rounded-xl border px-3 py-2 ${tone}`}>
                <p className="text-sm font-black truncate">{r.inRound ? '✓ ' : ''}{r.s.name}</p>
                <p className="text-xs font-bold tabular-nums whitespace-nowrap">
                  {r.count} lượt • {r.last ? (daysAgo(r.last) === 0 ? 'hôm nay' : `${daysAgo(r.last)} ngày trước`) : 'chưa gọi'}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-slate-700">Đỏ: chưa được gọi • Xanh dương: 1 đến 2 lượt • Xanh lá: từ 3 lượt • Dấu ✓: đã được gọi trong vòng hiện tại.</p>
    </section>
  );
};

export default ParticipationMap;
