import React from 'react';
import { STAFF_GROUPS, StaffGroupFilter } from '../../utils/staffGroups';

/** Role filter chips with counts ("Tất cả" + 4 groups). Buttons are 40px tall for touch screens. */
export const StaffGroupChips: React.FC<{
  value: StaffGroupFilter;
  onChange: (v: StaffGroupFilter) => void;
  counts: Record<string, number>;
  total: number;
}> = ({ value, onChange, counts, total }) => {
  const items: { id: StaffGroupFilter; label: string; n: number }[] = [
    { id: 'all', label: 'Tất cả', n: total },
    ...STAFF_GROUPS.map(g => ({ id: g.id as StaffGroupFilter, label: g.label, n: counts[g.id] || 0 })),
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc theo vai trò">
      {items.map(it => {
        const on = value === it.id;
        return (
          <button key={it.id} type="button" aria-pressed={on} onClick={() => onChange(it.id)}
            className={`no-hover-fx h-10 px-3 rounded-full text-sm font-bold whitespace-nowrap inline-flex items-center gap-1.5 border cursor-pointer ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'}`}>
            {it.label}
            <span className={`min-w-6 px-1.5 rounded-full text-xs font-black tabular-nums text-center ${on ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-700'}`}>{it.n}</span>
          </button>
        );
      })}
    </div>
  );
};
