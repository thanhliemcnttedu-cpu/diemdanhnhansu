import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Loader2, Lock, RefreshCw, Search } from 'lucide-react';
import {
  staffAttendanceService, STAFF_STATUS_META, dateRangeKeys, weekdayShort, fromDateKey, isLockedFor,
  StaffMember, StaffRecord, StaffStatus, StaffDayLock,
} from '../../../services/staffAttendanceService';
import { writeReportXlsx } from '../../../utils/licensedExport';

/**
 * "Bảng tháng": one row per staff member, one column per day of the month, a colour-coded symbol in each cell and
 * per-person totals on the right (same layout as the paper attendance sheet). Weekends are shaded.
 * Managers (and staff with the "Điểm danh hộ" duty) can pick a symbol ("brush") and click or drag over cells to mark
 * attendance for others — each batch goes through the existing proxy check-in, so locks and history keep working.
 * Business trip counts as working (same rule as the summary tab). The Excel export uses formulas for every total.
 */
const SYMBOL: Record<StaffStatus, string> = { present: 'X', business_trip: 'CT', sick_leave: 'Ô', personal_unpaid: 'KL' };
const BRUSHES: StaffStatus[] = ['present', 'business_trip', 'sick_leave', 'personal_unpaid'];
const norm = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const two = (n: number) => String(n).padStart(2, '0');
const colName = (i: number) => { let s = ''; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

export const StaffMonthGridPanel: React.FC<{
  auth: { username: string; password: string };
  today: string;
  schoolName?: string;
  /** may mark attendance for others (manager, or staff with the proxy duty) */
  canPaint: boolean;
}> = ({ auth, today, schoolName, canPaint }) => {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [days, setDays] = useState<Record<string, Record<string, StaffRecord>>>({});
  const [locks, setLocks] = useState<Record<string, StaffDayLock>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [brush, setBrush] = useState<StaffStatus | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const dragging = useRef(false);
  const pendingRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);

  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = `${month}-${two(new Date(y, m, 0).getDate())}`;
  const keys = useMemo(() => dateRangeKeys(first, last), [first, last]);
  const isWeekend = (k: string) => { const d = fromDateKey(k).getDay(); return d === 0 || d === 6; };
  // working days = Monday–Friday up to today (same idea as the summary tab)
  const workingDays = useMemo(() => keys.filter(k => k <= today && !isWeekend(k)).length, [keys, today]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const r = await staffAttendanceService.range(first, last, auth);
      if (!r?.success) { setError(r?.message || 'Không tải được bảng chấm công tháng.'); return; }
      setStaff((r.staff || []).filter((s: StaffMember) => !s.disabled));
      setDays(r.days || {}); setLocks(r.locks || {});
    } catch (e: any) { setError(e?.message || 'Không kết nối được Apps Script.'); }
    finally { if (!silent) setLoading(false); }
  }, [auth, first, last]);
  useEffect(() => { setPage(1); load(); }, [load]);

  const depts = useMemo(() => [...new Set(staff.map(s => String(s.dept || s.position || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [staff]);
  const rowsAll = useMemo(() => staff
    .filter(s => (!q.trim() || norm(`${s.name} ${s.code} ${s.position || ''} ${s.dept || ''}`).includes(norm(q.trim()))) && (!dept || String(s.dept || s.position || '').trim() === dept))
    .slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'vi')), [staff, q, dept]);
  const pages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(rowsAll.length / pageSize));
  const cur = Math.min(page, pages);
  const rows = pageSize === 0 ? rowsAll : rowsAll.slice((cur - 1) * pageSize, cur * pageSize);

  const totalsOf = (code: string) => {
    let present = 0, trip = 0, sick = 0, unpaid = 0;
    keys.forEach(k => {
      const st = days[k]?.[code]?.status;
      if (st === 'present') present++; else if (st === 'business_trip') trip++; else if (st === 'sick_leave') sick++; else if (st === 'personal_unpaid') unpaid++;
    });
    const missing = Math.max(0, workingDays - present - trip - sick - unpaid);
    const rate = workingDays > 0 ? Math.min(100, Math.round(((present + trip) / workingDays) * 1000) / 10) : 0;
    return { present, trip, sick, unpaid, missing, rate };
  };

  // ---- painting
  const cellKey = (code: string, date: string) => `${code}|${date}`;
  const canMark = (code: string, date: string) => canPaint && brush !== null && date <= today && !isLockedFor(locks[date], code);
  const addPending = (code: string, date: string) => {
    if (!canMark(code, date) || days[date]?.[code]?.status === brush) return;
    const k = cellKey(code, date);
    if (pendingRef.current.has(k)) return;
    pendingRef.current = new Set(pendingRef.current).add(k);
    setPending(pendingRef.current);
  };
  const commit = useCallback(async () => {
    dragging.current = false;
    const items = [...pendingRef.current];
    pendingRef.current = new Set(); setPending(new Set());
    if (!items.length || !brush || busyRef.current) return;
    busyRef.current = true; setMsg(null);
    const byDate = new Map<string, string[]>();
    items.forEach(k => { const [code, date] = k.split('|'); byDate.set(date, [...(byDate.get(date) || []), code]); });
    let ok = 0; const errors: string[] = [];
    for (const [date, codes] of byDate) {
      try {
        const r = await staffAttendanceService.proxyCheckIn({ codes, status: brush, date }, auth);
        if (r?.success) {
          ok += r.count || codes.length;
          const at = new Date().toISOString();
          setDays(prev => ({ ...prev, [date]: { ...(prev[date] || {}), ...Object.fromEntries(codes.map(c => [c, { status: brush, at, proxy: true } as StaffRecord])) } }));
        } else errors.push(`${date.slice(8)}/${date.slice(5, 7)}: ${r?.message || 'không lưu được'}`);
      } catch (e: any) { errors.push(`${date.slice(8)}/${date.slice(5, 7)}: ${e?.message || 'lỗi mạng'}`); }
    }
    busyRef.current = false;
    setMsg({ ok: errors.length === 0, text: `Đã chấm ${ok} ô "${STAFF_STATUS_META[brush].short}".${errors.length ? ` Lỗi: ${errors.slice(0, 3).join('; ')}.` : ''}` });
    load(true);
  }, [brush, auth, load]);
  useEffect(() => {
    const up = () => { if (dragging.current) commit(); };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [commit]);

  // ---- Excel: every total is a formula over the day cells
  const exportExcel = () => {
    const nD = keys.length;
    const firstDayCol = 3; // A STT, B name, C position
    const lastDayCol = firstDayCol + nD - 1;
    const rng = (n: number) => `${colName(firstDayCol)}${n}:${colName(lastDayCol)}${n}`;
    const cX = lastDayCol + 1, cCT = cX + 1, cO = cX + 2, cKL = cX + 3, cMiss = cX + 4, cRate = cX + 5;
    const endDay = today < last && today.startsWith(month) ? today : last;
    const wdFormula = `NETWORKDAYS(DATE(${y},${m},1),DATE(${y},${m},${Number(endDay.slice(8))}))`;
    const title = `BẢNG CHẤM CÔNG THÁNG ${two(m)}/${y}`;
    const aoa: any[][] = [
      [(schoolName || '').toUpperCase()], [title], [`Ký hiệu: X đi làm • CT đi công tác • Ô nghỉ ốm có phép • KL nghỉ việc riêng không lương`], [],
    ];
    aoa.push(['', 'Số ngày làm việc (T2–T6)', { t: 'n', f: wdFormula, v: workingDays }]);
    aoa.push(['', '', '', ...keys.map(k => weekdayShort(k))]);
    aoa.push(['STT', 'Họ và tên', 'Chức vụ / tổ', ...keys.map(k => Number(k.slice(8))), 'Đi làm', 'Công tác', 'Nghỉ ốm', 'Việc riêng', 'Chưa điểm danh', 'Tỷ lệ đi làm (%)']);
    const head = aoa.length; // number of rows above the first person
    rowsAll.forEach((s, i) => {
      const n = head + i + 1;
      const t = totalsOf(s.code);
      aoa.push([
        i + 1, s.name, [s.position, s.dept].filter(Boolean).join(' · '),
        ...keys.map(k => { const st = days[k]?.[s.code]?.status; return st ? SYMBOL[st] : ''; }),
        { t: 'n', f: `COUNTIF(${rng(n)},"X")`, v: t.present },
        { t: 'n', f: `COUNTIF(${rng(n)},"CT")`, v: t.trip },
        { t: 'n', f: `COUNTIF(${rng(n)},"Ô")`, v: t.sick },
        { t: 'n', f: `COUNTIF(${rng(n)},"KL")`, v: t.unpaid },
        { t: 'n', f: `MAX(0,$C$5-SUM(${colName(cX)}${n}:${colName(cKL)}${n}))`, v: t.missing },
        { t: 'n', f: `IF($C$5=0,0,MIN(100,ROUND((${colName(cX)}${n}+${colName(cCT)}${n})/$C$5*100,1)))`, v: t.rate },
      ]);
    });
    aoa.push([], [], ['', '', '', 'NGƯỜI LẬP BẢNG', '', '', '', '', '', '', '', 'THỦ TRƯỞNG ĐƠN VỊ']);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 6 }, { wch: 26 }, { wch: 22 }, ...keys.map(() => ({ wch: 4 })), ...[9, 10, 10, 10, 14, 14].map(wch => ({ wch }))];
    ws['!merges'] = [0, 1, 2].map(r => ({ s: { r, c: 0 }, e: { r, c: Math.min(cRate, 20) } }));
    ws['!freeze'] = { xSplit: 3, ySplit: head } as any;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Thang_${two(m)}_${y}`);
    writeReportXlsx(wb, `Bang_cham_cong_thang_${two(m)}_${y}.xlsx`);
  };

  const input = 'h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600';

  return (
    <section data-report="" className="bg-white rounded-2xl border border-slate-200 overflow-hidden" aria-labelledby="month-grid-title">
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <h2 id="month-grid-title" className="normal-case text-base font-bold text-slate-900">Bảng chấm công tháng</h2>
          <p className="text-sm text-slate-600">{canPaint ? 'Chọn một ký hiệu rồi bấm hoặc kéo chuột qua các ô để chấm cho nhiều người. Chỉ chấm được từ hôm nay trở về trước; ngày đã khóa không sửa được.' : 'Mỗi dòng một người, mỗi cột một ngày. Ô tô nền xám là thứ Bảy, Chủ nhật.'}</p>
        </div>
        <div>
          <label htmlFor="grid-month" className="block text-xs font-bold text-slate-900 mb-1">Tháng</label>
          <input id="grid-month" type="month" value={month} max={today.slice(0, 7)} onChange={e => e.target.value && setMonth(e.target.value)} className={`${input} tabular-nums`} />
        </div>
        <button type="button" onClick={() => load()} disabled={loading} className="no-hover-fx h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-2 cursor-pointer disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Tải lại
        </button>
        <button type="button" onClick={exportExcel} disabled={loading || rowsAll.length === 0} className="no-hover-fx h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black inline-flex items-center gap-2 cursor-pointer disabled:opacity-50">
          <Download className="w-4 h-4" /> Xuất Excel
        </button>
      </div>

      {/* legend = tools */}
      <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2" role={canPaint ? 'radiogroup' : undefined} aria-label={canPaint ? 'Ký hiệu để chấm' : 'Chú giải ký hiệu'}>
        {BRUSHES.map(st => {
          const meta = STAFF_STATUS_META[st];
          const on = brush === st;
          const chip = (
            <>
              <span className="inline-flex items-center justify-center min-w-7 h-6 px-1 rounded-md text-xs font-black border" style={{ background: meta.soft, color: meta.text, borderColor: meta.color }}>{SYMBOL[st]}</span>
              <span className="text-sm font-semibold">{meta.label}</span>
            </>
          );
          return canPaint
            ? <button key={st} type="button" role="radio" aria-checked={on} onClick={() => setBrush(on ? null : st)}
                className={`no-hover-fx h-10 px-3 rounded-xl border inline-flex items-center gap-2 cursor-pointer ${on ? 'bg-white border-slate-900 ring-2 ring-slate-900 text-slate-900' : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'}`}>{chip}</button>
            : <span key={st} className="inline-flex items-center gap-2 text-slate-800">{chip}</span>;
        })}
        {canPaint && <button type="button" onClick={() => setBrush(null)} className={`no-hover-fx h-10 px-3 rounded-xl border text-sm font-bold cursor-pointer ${brush === null ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'}`}>Chỉ xem (bỏ cọ)</button>}
        <div className="flex-1" />
        <label className="relative">
          <span className="sr-only">Tìm nhân sự</span>
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Tìm nhân sự…" className={`${input} w-48 pl-9`} />
        </label>
        <label className="sr-only" htmlFor="grid-dept">Lọc theo tổ hoặc chức vụ</label>
        <select id="grid-dept" value={dept} onChange={e => { setDept(e.target.value); setPage(1); }} className={`${input} max-w-[14rem]`}>
          <option value="">Tất cả tổ / chức vụ</option>
          {depts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {msg && <p role="status" className={`mx-4 sm:mx-5 mt-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold border ${msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-800'}`}>{msg.text}</p>}
      {error && <p role="alert" className="mx-4 sm:mx-5 mt-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold border bg-red-50 border-red-200 text-red-800">{error}</p>}

      <div className={`overflow-auto max-h-[70vh] border-t border-slate-200 ${canPaint && brush ? 'cursor-crosshair' : ''}`} style={{ touchAction: canPaint && brush ? 'pan-y' : undefined }}>
        <table className="border-separate border-spacing-0 text-sm" data-month-grid>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-30 bg-slate-50 text-left px-3 py-2 min-w-[210px] border-b border-r border-slate-200 font-bold text-slate-900">Nhân sự <span className="block text-xs font-normal text-slate-600">Tháng {two(m)}/{y}</span></th>
              {keys.map(k => {
                const we = isWeekend(k); const sun = fromDateKey(k).getDay() === 0; const lockedAll = locks[k]?.all;
                return (
                  <th key={k} scope="col" className={`sticky top-0 z-20 text-center px-0 py-1 min-w-[32px] w-8 border-b border-slate-200 ${we ? 'bg-slate-200' : 'bg-slate-50'} ${k > today ? 'opacity-60' : ''}`}>
                    <span className={`block text-xs font-black tabular-nums ${sun ? 'text-rose-700' : 'text-slate-900'}`}>{Number(k.slice(8))}</span>
                    <span className={`block text-[11px] font-semibold ${sun ? 'text-rose-700' : 'text-slate-700'}`}>{weekdayShort(k).replace('CN', 'CN')}</span>
                    {lockedAll && <Lock className="w-3 h-3 mx-auto text-slate-700" aria-label="Ngày đã khóa" />}
                  </th>
                );
              })}
              {['Đi làm', 'Công tác', 'Nghỉ ốm', 'Việc riêng', 'Chưa ĐD', 'Tỷ lệ'].map((h, i) => (
                <th key={h} scope="col" className={`sticky top-0 z-20 text-center px-2 py-2 border-b border-l border-slate-200 text-xs font-black whitespace-nowrap ${i === 5 ? 'bg-blue-50 text-blue-900' : 'bg-slate-50 text-slate-900'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={keys.length + 7} className="px-4 py-8 text-center text-slate-600">{loading ? 'Đang tải…' : 'Chưa có nhân sự phù hợp.'}</td></tr>}
            {rows.map(s => {
              const t = totalsOf(s.code);
              return (
                <tr key={s.code}>
                  <th scope="row" className="sticky left-0 z-10 bg-white text-left px-3 py-1.5 border-b border-r border-slate-100 font-semibold text-slate-900 whitespace-nowrap">
                    <span className="block">{s.name}</span>
                    <span className="block text-xs font-normal text-slate-600">{[s.position, s.dept].filter(Boolean).join(' · ') || s.code}</span>
                  </th>
                  {keys.map(k => {
                    const rec = days[k]?.[s.code]; const st = rec?.status; const meta = st ? STAFF_STATUS_META[st] : null;
                    const we = isWeekend(k); const key = cellKey(s.code, k);
                    const isPending = pending.has(key); const locked = isLockedFor(locks[k], s.code);
                    const missingPast = !st && !we && k <= today;
                    return (
                      <td key={k}
                        data-cell={`${s.code}|${k}`}
                        onPointerDown={canPaint && brush ? (e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; dragging.current = true; addPending(s.code, k); } : undefined}
                        onPointerEnter={canPaint && brush ? () => { if (dragging.current) addPending(s.code, k); } : undefined}
                        title={`${s.name} • ${k.slice(8)}/${k.slice(5, 7)}: ${meta ? meta.label : we ? 'Ngày nghỉ cuối tuần' : k <= today ? 'Chưa điểm danh' : 'Chưa tới ngày'}${locked ? ' (đã khóa)' : ''}`}
                        className={`text-center border-b border-slate-100 px-0 h-9 select-none ${we && !meta ? 'bg-slate-100' : ''} ${k > today ? 'opacity-50' : ''} ${isPending ? 'ring-2 ring-inset ring-slate-900' : ''}`}
                        style={meta ? { background: meta.soft, color: meta.text } : undefined}>
                        {isPending && brush ? <span className="text-xs font-black text-slate-900">{SYMBOL[brush]}</span>
                          : st ? <span className="text-xs font-black">{SYMBOL[st]}</span>
                          : missingPast ? <span className="text-slate-400" aria-hidden="true">·</span> : null}
                      </td>
                    );
                  })}
                  <td className="text-center tabular-nums font-bold text-emerald-800 border-b border-l border-slate-100 px-2">{t.present}</td>
                  <td className="text-center tabular-nums font-semibold text-blue-800 border-b border-slate-100 px-2">{t.trip}</td>
                  <td className="text-center tabular-nums font-semibold text-amber-800 border-b border-slate-100 px-2">{t.sick}</td>
                  <td className="text-center tabular-nums font-semibold text-rose-800 border-b border-slate-100 px-2">{t.unpaid}</td>
                  <td className="text-center tabular-nums font-semibold text-slate-700 border-b border-slate-100 px-2">{t.missing}</td>
                  <td className="text-center tabular-nums font-black text-blue-900 bg-blue-50 border-b border-slate-100 px-2 whitespace-nowrap">{t.rate}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 sm:px-5 py-3 border-t border-slate-200 flex flex-wrap items-center gap-3 text-sm text-slate-700">
        <span>Hiển thị <strong className="text-slate-900">{rows.length}</strong> / {rowsAll.length} người • {workingDays} ngày làm việc (T2–T6) tính đến {today <= last && today >= first ? 'hôm nay' : 'hết tháng'}. Tỷ lệ = (đi làm + công tác) ÷ ngày làm việc.</span>
        <div className="flex-1" />
        <label className="inline-flex items-center gap-2">Số dòng
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className={`${input} h-9`}>
            {[20, 40, 0].map(n => <option key={n} value={n}>{n === 0 ? 'Tất cả' : n}</option>)}
          </select>
        </label>
        {pages > 1 && (
          <div className="inline-flex items-center gap-1" role="navigation" aria-label="Chuyển trang">
            <button type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)} className="no-hover-fx h-10 px-3 rounded-xl border border-slate-300 bg-white font-bold disabled:opacity-40 cursor-pointer">Trước</button>
            <span className="px-2 font-bold text-slate-900 tabular-nums">{cur}/{pages}</span>
            <button type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)} className="no-hover-fx h-10 px-3 rounded-xl border border-slate-300 bg-white font-bold disabled:opacity-40 cursor-pointer">Sau</button>
          </div>
        )}
      </div>
    </section>
  );
};

export default StaffMonthGridPanel;
