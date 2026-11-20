import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, Table2 } from 'lucide-react';
import {
  STAFF_STATUS_META, STAFF_STATUS_ORDER, attemptOf, attemptsOf, fullNoteOf, shortDateLabel, timeHMS, toDateKey, weekdayLabel,
} from '../../../services/staffAttendanceService';
import type { StaffMember, StaffRecord, StaffStatus } from '../../../services/staffAttendanceService';

/**
 * "List + detail" layout for staff attendance (same design language as classes/StudentsSplitView):
 * - desktop / landscape tablet (>= 1024px): staff list on the left, the selected person on the right
 * - very wide screens (>= 1536px): the attendance history becomes a second column of the detail pane
 * - portrait tablet / phone: list only; a person opens as a full page with a back button
 * READ-ONLY and presentational: no service calls, no editing actions. It never reads PINs or CCCD numbers.
 */
export interface StaffSplitViewProps {
  staff: StaffMember[];
  /** date key (YYYY-MM-DD) → staff code → record of that day */
  days: Record<string, Record<string, StaffRecord>>;
  /** Days of the loaded range shown in totals / history, ascending */
  dateKeys: string[];
  /** Day shown in the list (normally today) */
  selectedDate: string;
  /** Human label of the loaded range, e.g. "Tuần này" */
  rangeLabel?: string;
  onBackToTable: () => void;
}

type StatusKey = StaffStatus | 'missing';
type Filter = 'all' | 'present' | 'away' | 'missing';
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Tất cả' }, { id: 'present', label: 'Có mặt' }, { id: 'away', label: 'Nghỉ / công tác' }, { id: 'missing', label: 'Chưa điểm danh' },
];
const norm = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const givenName = (n: string) => n.trim().split(/\s+/).pop() || '';
const statusKeyOf = (r?: StaffRecord | null): StatusKey => (r && STAFF_STATUS_META[r.status] ? r.status : 'missing');
const matches = (f: Filter, k: StatusKey) => f === 'all' || (f === 'present' ? k === 'present' : f === 'missing' ? k === 'missing' : k !== 'present' && k !== 'missing');
const subLineOf = (s: StaffMember) => [s.position, s.dept].map(x => String(x || '').trim()).filter(Boolean).join(' · ');

const outline = 'no-hover-fx h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer';

/** One unified status label (small rounded label in the status colour) */
const StatusLabel: React.FC<{ status: StatusKey; long?: boolean }> = ({ status, long }) => {
  const m = STAFF_STATUS_META[status];
  return (
    <span className="inline-block max-w-full px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap truncate align-middle" style={{ background: m.soft, color: m.text }}>
      {status === 'missing' ? 'Chưa điểm danh' : long ? m.label : m.short}
    </span>
  );
};

export const StaffSplitView: React.FC<StaffSplitViewProps> = (p) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const dayRecords = p.days[p.selectedDate] || {};
  const isToday = p.selectedDate === toDateKey(new Date());
  const dayText = isToday ? 'hôm nay' : `ngày ${shortDateLabel(p.selectedDate)}`;

  // Active staff only, A–Z by given name (Vietnamese roster order), same as the table view
  const active = useMemo(() => p.staff.filter(s => !s.disabled).slice().sort((a, b) =>
    givenName(a.name).localeCompare(givenName(b.name), 'vi', { sensitivity: 'base' }) || a.name.trim().localeCompare(b.name.trim(), 'vi', { sensitivity: 'base' })), [p.staff]);

  const list = useMemo(() => {
    const q = norm(query.trim());
    return active.filter(s => matches(filter, statusKeyOf(dayRecords[s.code])) && (!q || norm(`${s.name} ${s.position || ''} ${s.dept || ''}`).includes(q)));
  }, [active, dayRecords, filter, query]);
  const count = (f: Filter) => active.filter(s => matches(f, statusKeyOf(dayRecords[s.code]))).length;

  // Keep a person selected on wide screens so the right pane is never empty
  const selected = active.find(s => s.code === selectedCode) || list[0] || null;
  useEffect(() => { if (selectedCode && !active.some(s => s.code === selectedCode)) { setSelectedCode(null); setMobileOpen(false); } }, [active, selectedCode]);

  const record = selected ? dayRecords[selected.code] : undefined;

  // Totals + history of the loaded range for the selected person (newest day first)
  const history = useMemo(() => {
    if (!selected) return [] as Array<{ date: string; record?: StaffRecord }>;
    return p.dateKeys.slice().sort().reverse().map(date => ({ date, record: (p.days[date] || {})[selected.code] }));
  }, [p.dateKeys, p.days, selected]);
  const totals = useMemo(() => {
    const t: Record<StatusKey, number> = { present: 0, business_trip: 0, sick_leave: 0, personal_unpaid: 0, missing: 0 };
    history.forEach(h => { t[statusKeyOf(h.record)]++; });
    return t;
  }, [history]);

  const historyBlock = (
    <section aria-label="Lịch sử điểm danh" className="min-w-0">
      <h4 className="normal-case text-sm font-bold text-slate-900 mb-2">Lịch sử điểm danh{p.rangeLabel ? ` · ${p.rangeLabel}` : ''}</h4>
      {history.length === 0 ? <p className="text-sm text-slate-600">Chưa có ngày làm việc nào trong khoảng đã chọn.</p> : (
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          {history.map(h => {
            const attempts = attemptsOf(h.record);
            const note = fullNoteOf(h.record);
            return (
              <div key={h.date} className="border-t border-slate-200 first:border-t-0">
                <p className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 tabular-nums">{weekdayLabel(h.date)}, {shortDateLabel(h.date)}/{h.date.slice(0, 4)}</p>
                <div className="px-3 py-2 space-y-1.5">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0"><StatusLabel status={statusKeyOf(h.record)} /></span>
                    <span className="min-w-0 flex-1 text-sm text-slate-800 break-words">{note}</span>
                    <span className="shrink-0 text-xs text-slate-600 tabular-nums">{h.record ? timeHMS(h.record.at) : ''}</span>
                  </div>
                  {attempts.length > 1 && (
                    <ul className="pl-3 border-l-2 border-slate-200 space-y-1" aria-label="Các lần điểm danh trong ngày">
                      {attempts.map((a, i) => (
                        <li key={`${a.at}-${i}`} className="flex items-start gap-2 text-xs text-slate-700">
                          <span className="shrink-0 font-semibold">Lần {i + 1}</span>
                          <span className="min-w-0 flex-1 break-words">{STAFF_STATUS_META[a.status]?.short || a.status}{a.note ? ` · ${a.note}` : ''}{a.by ? ` · điểm danh hộ bởi ${a.by}` : ''}</span>
                          <span className="shrink-0 text-slate-600 tabular-nums">{timeHMS(a.at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  const detail = selected && (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <div className="min-w-0">
          <h3 className="normal-case text-xl font-bold text-slate-900 leading-snug break-words">{selected.name}</h3>
          <p className="text-sm text-slate-600 break-words">{subLineOf(selected) || 'Chưa nhập chức vụ, bộ phận'}</p>
        </div>

        <dl className="rounded-2xl border border-slate-200 divide-y divide-slate-100 text-sm">
          {([
            ['Mã', selected.code],
            ['Chức vụ', selected.position || 'Chưa nhập'],
            ['Bộ phận', selected.dept || 'Chưa nhập'],
            [`Trạng thái ${dayText}`, <StatusLabel key="s" status={statusKeyOf(record)} long />],
            ['Giờ điểm danh', record ? timeHMS(record.at) : 'Chưa điểm danh'],
            ['Ghi chú', fullNoteOf(record) || 'Không có'],
            ...(attemptOf(record) > 1 ? [['Số lần điểm danh lại', `${attemptOf(record) - 1} lần (tổng ${attemptOf(record)} lần điểm danh)`]] : []),
          ] as Array<[string, React.ReactNode]>).map(([k, v]) => (
            <div key={k} className="px-3.5 py-2.5 flex items-start justify-between gap-4">
              <dt className="normal-case tracking-normal text-slate-600 shrink-0">{k}</dt>
              <dd className="font-semibold text-slate-900 text-right break-words min-w-0">{v}</dd>
            </div>
          ))}
        </dl>

        <section aria-label="Tổng hợp trong khoảng đã chọn" className="min-w-0">
          <h4 className="normal-case text-sm font-bold text-slate-900 mb-2">Tổng hợp{p.rangeLabel ? ` · ${p.rangeLabel}` : ''} <span className="font-normal text-slate-600">({history.length} ngày làm việc)</span></h4>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {STAFF_STATUS_ORDER.map(k => (
              <li key={k} className="rounded-xl border border-slate-200 px-3 py-2 min-w-0">
                <span className="block text-lg font-bold tabular-nums leading-tight" style={{ color: STAFF_STATUS_META[k].text }}>{totals[k]}</span>
                <span className="block text-xs text-slate-700 truncate" title={STAFF_STATUS_META[k].label}>{k === 'missing' ? 'Chưa điểm danh' : STAFF_STATUS_META[k].short}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {historyBlock}
    </div>
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden" data-staff-split>
      {/* Filter row: pills + search + way back to the table layout */}
      <div className="px-3 sm:px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
        <div className="inline-flex p-1 rounded-full bg-slate-100 max-w-full overflow-x-auto" role="tablist" aria-label={`Lọc nhân sự theo trạng thái ${dayText}`}>
          {FILTERS.map(f => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
              className={`no-hover-fx h-10 px-3 rounded-full text-sm font-semibold whitespace-nowrap cursor-pointer ${filter === f.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-700 hover:text-slate-900'}`}>
              {f.label} <span className="tabular-nums text-slate-600">{count(f.id)}</span>
            </button>
          ))}
        </div>
        <label className="relative flex-1 min-w-[180px]">
          <span className="sr-only">Tìm nhân sự theo tên hoặc chức vụ</span>
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm theo tên, chức vụ"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600" />
        </label>
        <button type="button" onClick={p.onBackToTable} className={`${outline} !h-10`} title="Quay về giao diện bảng như trước">
          <Table2 className="w-4 h-4" aria-hidden="true" /> Dạng bảng
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)]">
        {/* List */}
        <ul className="lg:border-r lg:border-slate-200 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto divide-y divide-slate-100" aria-label={`Danh sách nhân sự, trạng thái ${dayText}`}>
          {list.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-600">Không có nhân sự phù hợp.</li>}
          {list.map(s => {
            const on = selected?.code === s.code;
            const k = statusKeyOf(dayRecords[s.code]);
            return (
              <li key={s.code}>
                <button type="button" onClick={() => { setSelectedCode(s.code); setMobileOpen(true); }} aria-current={on ? 'true' : undefined}
                  className={`no-hover-fx w-full min-h-[52px] text-left pl-0 pr-3 py-2.5 flex items-center gap-3 cursor-pointer ${on ? 'lg:bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <span className="self-stretch w-1 rounded-r shrink-0" style={{ background: STAFF_STATUS_META[k].color }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-slate-900 truncate">{s.name}</span>
                    <span className="block text-xs text-slate-600 truncate">{subLineOf(s) || 'Chưa nhập chức vụ'}</span>
                  </span>
                  <span className="shrink-0 max-w-[45%]"><StatusLabel status={k} /></span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Detail: right pane on wide screens */}
        <div className="max-lg:hidden p-5 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto">
          {detail || <p className="text-sm text-slate-600">Chọn một người ở danh sách bên trái để xem chi tiết.</p>}
        </div>
      </div>

      {/* Detail: full page on phone / portrait tablet */}
      {mobileOpen && selected && (
        <div className="lg:hidden fixed inset-0 z-50 bg-white flex flex-col" role="dialog" aria-modal="true" aria-label={`Chi tiết điểm danh của ${selected.name}`}>
          <div className="h-14 px-2 flex items-center gap-1 bg-blue-600 text-white shrink-0">
            <button type="button" onClick={() => setMobileOpen(false)} className="no-hover-fx w-11 h-11 rounded-full hover:bg-white/15 inline-flex items-center justify-center cursor-pointer" aria-label="Quay lại danh sách">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-base font-bold truncate">Nhân sự</p>
              <p className="text-xs text-white truncate">Chi tiết điểm danh</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{detail}</div>
        </div>
      )}
    </div>
  );
};

export default StaffSplitView;
