import React, { useState } from 'react';
import { WeeklySummaryView } from './WeeklySummaryView';
import { PeriodSummaryView, type Preset } from './PeriodSummaryView';

/**
 * One "Tổng kết" menu item: a chip bar switches between the weekly review and the month / term / year / custom-range review.
 * The two screens are unchanged; this only picks which one to show (and lets the journal table jump back to a week).
 */
type Mode = 'week' | Preset;
const CHIPS: Array<[Mode, string]> = [['week', 'Tuần'], ['month', 'Tháng này'], ['lastMonth', 'Tháng trước'], ['hk1', 'Học kỳ 1'], ['hk2', 'Học kỳ 2'], ['year', 'Cả năm học'], ['custom', 'Tự chọn ngày']];

export const SummaryHubView: React.FC<{ onNavigate?: (id: any) => void }> = ({ onNavigate }) => {
  const [mode, setMode] = useState<Mode>('week');
  const [openWeek, setOpenWeek] = useState<string | undefined>();
  return (
    <div>
      <div className="max-w-6xl mx-auto px-3 sm:px-5 pt-3 sm:pt-5">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3 flex flex-wrap items-center gap-2" role="tablist" aria-label="Chọn kỳ tổng kết">
          {CHIPS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
              className={`no-hover-fx min-h-10 px-3 rounded-xl text-sm font-bold whitespace-nowrap cursor-pointer border ${mode === k ? 'bg-sky-700 text-white border-sky-700' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'}`}>{label}</button>
          ))}
        </div>
      </div>
      {mode === 'week'
        ? <WeeklySummaryView key={openWeek || 'now'} onNavigate={onNavigate} initialWeekStart={openWeek} />
        : <PeriodSummaryView preset={mode} hideChips onPresetChange={p => setMode(p)} onOpenWeek={w => { setOpenWeek(w); setMode('week'); }} />}
    </div>
  );
};

export default SummaryHubView;
