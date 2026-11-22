import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Search } from 'lucide-react';
import { writeReportXlsx } from '../../../utils/licensedExport';
import type { AttendanceStatus, DailyAttendance, Student } from '../../../types';

/**
 * "Bảng tháng" of a homeroom class: one row per pupil, one column per day, colour-coded symbol per cell, totals on the right.
 * Read-only (the daily tab keeps the edit-window rule). A day counts only when the class actually took attendance that day;
 * a weekday without a sheet shows a dot, it is "no data", not "absent". The Excel export uses formulas for every total.
 */
const SYMBOL: Record<AttendanceStatus, string> = { present: 'X', late: 'M', excused: 'P', sick: 'Ô', unexcused: 'K', other: 'L' };
const META: Record<AttendanceStatus, { label: string; bg: string; fg: string }> = {
  present: { label: 'Có mặt', bg: '#ecfdf5', fg: '#065f46' },
  late: { label: 'Đi muộn (tính là có mặt)', bg: '#fef9c3', fg: '#854d0e' },
  excused: { label: 'Vắng có phép', bg: '#eff6ff', fg: '#1e40af' },
  sick: { label: 'Nghỉ ốm', bg: '#fff7ed', fg: '#9a3412' },
  unexcused: { label: 'Vắng không phép', bg: '#fff1f2', fg: '#9f1239' },
  other: { label: 'Lý do khác', bg: '#f5f3ff', fg: '#5b21b6' },
};
const ORDER: AttendanceStatus[] = ['present', 'late', 'excused', 'sick', 'unexcused', 'other'];
const two = (n: number) => String(n).padStart(2, '0');
const norm = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const colName = (i: number) => { let s = ''; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

export const AttendanceMonthGrid: React.FC<{
  students: Student[];
  records: DailyAttendance[];
  className: string;
  teacherName?: string;
  schoolName?: string;
  today: string;
}> = ({ students, records, className, teacherName, schoolName, today }) => {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [q, setQ] = useState('');
  const [y, m] = month.split('-').map(Number);
  const nDays = new Date(y, m, 0).getDate();
  const keys = useMemo(() => Array.from({ length: nDays }, (_, i) => `${month}-${two(i + 1)}`), [month, nDays]);
  const dow = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8))).getDay();

  // date -> pupil id -> status, only for sheets that really hold marks
  const byDate = useMemo(() => {
    const map = new Map<string, Record<string, AttendanceStatus>>();
    records.forEach(r => { if (r.date.startsWith(month) && r.records && Object.keys(r.records).length > 0) map.set(r.date, r.records); });
    return map;
  }, [records, month]);
  const recordedDays = byDate.size;

  const rows = useMemo(() => students.filter(s => !q.trim() || norm(s.name).includes(norm(q.trim()))), [students, q]);
  const totalsOf = (id: string) => {
    const t = { present: 0, late: 0, excused: 0, sick: 0, unexcused: 0, other: 0 };
    byDate.forEach(rec => { const st = rec[id]; if (st) t[st]++; });
    const here = t.present + t.late;
    return { ...t, here, rate: recordedDays > 0 ? Math.round((here / recordedDays) * 1000) / 10 : 0 };
  };

  const exportExcel = () => {
    const c0 = 2; // A STT, B name, days start at C
    const cLast = c0 + nDays - 1;
    const rowN = 8; // first pupil row (1-based)
    const lastRow = rowN + students.length - 1;
    const cHere = cLast + 1, cRate = cHere + 6;
    const flags = keys.map((_, i) => ({ t: 'n', f: `IF(COUNTA(${colName(c0 + i)}${rowN}:${colName(c0 + i)}${lastRow})>0,1,0)`, v: byDate.has(keys[i]) ? 1 : 0 }));
    const aoa: any[][] = [
      [(schoolName || '').toUpperCase()],
      [`BẢNG CHUYÊN CẦN THÁNG ${two(m)}/${y} • LỚP ${className}`],
      [`Giáo viên chủ nhiệm: ${teacherName || ''}`],
      [`Ký hiệu: X có mặt • M đi muộn • P vắng có phép • Ô nghỉ ốm • K vắng không phép • L lý do khác. Ô trống = lớp chưa điểm danh hoặc ngày nghỉ.`],
      ['', 'Ngày lớp đã điểm danh', ...flags, { t: 'n', f: `SUM(${colName(c0)}5:${colName(cLast)}5)`, v: recordedDays }],
      ['', '', ...keys.map(k => WD[dow(k)])],
      ['STT', 'Họ và tên', ...keys.map(k => Number(k.slice(8))), 'Có mặt', 'Trong đó muộn', 'Vắng có phép', 'Nghỉ ốm', 'Không phép', 'Lý do khác', 'Chuyên cần (%)'],
    ];
    const daysCell = `$${colName(cLast + 1)}$5`;
    students.forEach((s, i) => {
      const n = rowN + i;
      const t = totalsOf(s.id);
      const rng = `${colName(c0)}${n}:${colName(cLast)}${n}`;
      aoa.push([
        i + 1, s.name,
        ...keys.map(k => { const st = byDate.get(k)?.[s.id]; return st ? SYMBOL[st] : ''; }),
        { t: 'n', f: `COUNTIF(${rng},"X")+COUNTIF(${rng},"M")`, v: t.here },
        { t: 'n', f: `COUNTIF(${rng},"M")`, v: t.late },
        { t: 'n', f: `COUNTIF(${rng},"P")`, v: t.excused },
        { t: 'n', f: `COUNTIF(${rng},"Ô")`, v: t.sick },
        { t: 'n', f: `COUNTIF(${rng},"K")`, v: t.unexcused },
        { t: 'n', f: `COUNTIF(${rng},"L")`, v: t.other },
        { t: 'n', f: `IF(${daysCell}=0,0,ROUND(${colName(cHere)}${n}/${daysCell}*100,1))`, v: t.rate },
      ]);
    });
    aoa.push([], ['', 'GIÁO VIÊN CHỦ NHIỆM', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'BAN GIÁM HIỆU']);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 6 }, { wch: 28 }, ...keys.map(() => ({ wch: 4 })), ...[9, 12, 12, 9, 11, 11, 13].map(wch => ({ wch }))];
    ws['!merges'] = [0, 1, 2, 3].map(r => ({ s: { r, c: 0 }, e: { r, c: Math.min(cRate, 24) } }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Lop_${className}_T${two(m)}`);
    writeReportXlsx(wb, `Bang_chuyen_can_${className}_${two(m)}_${y}.xlsx`);
  };

  const input = 'h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600';

  return (
    <section data-report="" className="bg-white rounded-2xl border border-slate-200 overflow-hidden" aria-labelledby="att-month-title">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <h3 id="att-month-title" className="normal-case text-base font-black text-slate-900">Bảng chuyên cần tháng {two(m)}/{y} • Lớp {className}</h3>
          <p className="text-sm text-slate-600">Mỗi dòng một học sinh, mỗi cột một ngày. Chỉ xem; muốn sửa hãy mở tab Điểm danh lớp.</p>
        </div>
        <div>
          <label htmlFor="att-month" className="block text-xs font-bold text-slate-900 mb-1">Tháng</label>
          <input id="att-month" type="month" value={month} max={today.slice(0, 7)} onChange={e => e.target.value && setMonth(e.target.value)} className={`${input} tabular-nums`} />
        </div>
        <label className="relative">
          <span className="sr-only">Tìm học sinh</span>
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm học sinh…" className={`${input} w-44 pl-9`} />
        </label>
        <button type="button" onClick={exportExcel} disabled={students.length === 0}
          className="no-hover-fx h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black inline-flex items-center gap-2 cursor-pointer disabled:opacity-50">
          <Download className="w-4 h-4" /> Xuất Excel
        </button>
      </div>

      <div className="px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-label="Chú giải ký hiệu">
        {ORDER.map(st => (
          <span key={st} className="inline-flex items-center gap-1.5 text-sm text-slate-800">
            <span className="inline-flex items-center justify-center min-w-6 h-6 px-1 rounded-md text-xs font-black border border-slate-300" style={{ background: META[st].bg, color: META[st].fg }}>{SYMBOL[st]}</span>
            {META[st].label}
          </span>
        ))}
      </div>

      <div className="overflow-auto max-h-[70vh]">
        <table className="border-separate border-spacing-0 text-sm" data-att-month-grid>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-30 bg-slate-50 text-left px-3 py-2 min-w-[200px] border-b border-r border-slate-200 font-bold text-slate-900">Học sinh</th>
              {keys.map(k => {
                const d = dow(k); const we = d === 0 || d === 6;
                return (
                  <th key={k} scope="col" className={`sticky top-0 z-20 text-center px-0 py-1 min-w-[30px] w-[30px] border-b border-slate-200 ${we ? 'bg-slate-200' : 'bg-slate-50'} ${k > today ? 'opacity-60' : ''}`}>
                    <span className={`block text-xs font-black tabular-nums ${d === 0 ? 'text-rose-700' : 'text-slate-900'}`}>{Number(k.slice(8))}</span>
                    <span className={`block text-[11px] font-semibold ${d === 0 ? 'text-rose-700' : 'text-slate-700'}`}>{WD[d]}</span>
                  </th>
                );
              })}
              {['Có mặt', 'Muộn', 'P', 'Ô', 'K', 'L', 'CC %'].map((h, i) => (
                <th key={h} scope="col" title={['Số ngày có mặt (gồm đi muộn)', 'Trong đó đi muộn', 'Vắng có phép', 'Nghỉ ốm', 'Vắng không phép', 'Lý do khác', 'Chuyên cần'][i]}
                  className={`sticky top-0 z-20 text-center px-2 py-2 border-b border-l border-slate-200 text-xs font-black whitespace-nowrap ${i === 6 ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-900'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={nDays + 8} className="px-4 py-8 text-center text-slate-600">Chưa có học sinh phù hợp.</td></tr>}
            {rows.map((s, i) => {
              const t = totalsOf(s.id);
              return (
                <tr key={s.id}>
                  <th scope="row" className="sticky left-0 z-10 bg-white text-left px-3 py-1.5 border-b border-r border-slate-100 font-semibold text-slate-900 whitespace-nowrap">
                    <span className="inline-block w-7 text-xs font-normal text-slate-600 tabular-nums">{students.indexOf(s) + 1}</span>{s.name}
                  </th>
                  {keys.map(k => {
                    const st = byDate.get(k)?.[s.id]; const d = dow(k); const we = d === 0 || d === 6;
                    const noSheet = !byDate.has(k) && !we && k <= today;
                    return (
                      <td key={k} title={`${s.name} • ${k.slice(8)}/${k.slice(5, 7)}: ${st ? META[st].label : we ? 'Ngày nghỉ cuối tuần' : byDate.has(k) ? 'Chưa đánh dấu' : k <= today ? 'Lớp chưa điểm danh' : 'Chưa tới ngày'}`}
                        className={`text-center border-b border-slate-100 px-0 h-8 select-none ${we && !st ? 'bg-slate-100' : ''} ${k > today ? 'opacity-50' : ''}`}
                        style={st ? { background: META[st].bg, color: META[st].fg } : undefined}>
                        {st ? <span className="text-xs font-black">{SYMBOL[st]}</span> : noSheet ? <span className="text-slate-400" aria-hidden="true">·</span> : null}
                      </td>
                    );
                  })}
                  <td className="text-center tabular-nums font-bold text-emerald-800 border-b border-l border-slate-100 px-2">{t.here}</td>
                  <td className="text-center tabular-nums text-yellow-900 border-b border-slate-100 px-2">{t.late}</td>
                  <td className="text-center tabular-nums text-blue-800 border-b border-slate-100 px-2">{t.excused}</td>
                  <td className="text-center tabular-nums text-orange-800 border-b border-slate-100 px-2">{t.sick}</td>
                  <td className="text-center tabular-nums font-bold text-rose-800 border-b border-slate-100 px-2">{t.unexcused}</td>
                  <td className="text-center tabular-nums text-violet-800 border-b border-slate-100 px-2">{t.other}</td>
                  <td className="text-center tabular-nums font-black text-emerald-900 bg-emerald-50 border-b border-slate-100 px-2 whitespace-nowrap">{recordedDays > 0 ? `${t.rate}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="px-4 py-3 border-t border-slate-200 text-sm text-slate-700">
        {recordedDays > 0
          ? <>Lớp đã điểm danh <strong className="text-slate-900">{recordedDays}</strong> ngày trong tháng. Chuyên cần = số ngày có mặt (gồm đi muộn) ÷ số ngày lớp đã điểm danh. Dấu chấm là ngày thường lớp chưa điểm danh, không tính là vắng.</>
          : <>Tháng này lớp chưa có ngày nào điểm danh.</>}
      </p>
    </section>
  );
};

export default AttendanceMonthGrid;
