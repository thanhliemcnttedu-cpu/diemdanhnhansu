import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, Clock, FileSpreadsheet, Printer, Utensils } from 'lucide-react';
import { useClassroomOptional } from '../../../context/ClassroomContext';
import { toLocalDateKey } from '../../../services/googleDriveService';
import { writeReportXlsx } from '../../../utils/licensedExport';
import { coverageOf, pct1 } from '../../../utils/reportStats';
import type { Classroom } from '../../../types';

/**
 * School-wide daily meal report for the boarding (bán trú) team — replaces the paper slip each
 * homeroom teacher used to fill in and hand over. One row per homeroom class: teacher, enrolment,
 * meals, not eating, names of absent pupils, confirmation time, and classes that have not reported.
 * The teacher's signature is replaced by the account name + time of "Xác nhận điểm danh bán trú";
 * the printed sheet has one signature block for the person in charge of boarding.
 */
const ABSENT = new Set(['excused', 'unexcused', 'sick', 'other']);
export const ABSENT_STATUSES = ABSENT;

const formatVN = (key: string) => { const [y, m, d] = key.split('-'); return d && m ? `${d}/${m}/${y}` : key; };
const two = (n: number) => String(n).padStart(2, '0');
const timeOf = (ms?: number, dateKey?: string) => {
  if (!ms) return '';
  const d = new Date(ms);
  const hm = `${two(d.getHours())}:${two(d.getMinutes())}`;
  return toLocalDateKey(d) === dateKey ? hm : `${hm} ${two(d.getDate())}/${two(d.getMonth() + 1)}`;
};
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export const isHomeroomClass = (c: Classroom) => {
  if (!c) return false;
  if (c.isHomeroom === true) return true;
  if (c.isHomeroom === false) return false;
  const r = String(c.teacherRole || '').trim().toLowerCase();
  if (r === 'homeroom' || r === 'gvcn') return true;
  if (r === 'subject' || r === 'gvbm') return false;
  const n = (c.name || '').toLowerCase();
  return !(n.includes('tin học') || n.includes('bộ môn') || n.includes('tiếng anh')) && !String(c.id).startsWith('class-sub-');
};

interface Row {
  grade: string;
  className: string;
  teacher: string;
  total: number;
  eating: number | null;      // null = the class has not reported
  absentNames: string[];
  absentKnown: boolean;       // attendance was taken that day
  time: string;
  by: string;
  status: 'confirmed' | 'reported' | 'missing';
}

const STATUS_TEXT: Record<Row['status'], string> = { confirmed: 'Đã xác nhận', reported: 'Đã báo', missing: 'Chưa báo' };

/** Data handed in from outside the app context (staff member with the boarding duty on the check-in page) */
export interface MealReportData {
  classes: Classroom[]; students: Array<{ id: string; name: string; classId: string }>;
  attendanceRecords: Array<{ date: string; classId: string; records: Record<string, string> }>;
  boardingRecords: Array<{ date: string; classId: string; records: Record<string, string>; confirmedAt?: number; confirmedBy?: string }>;
  schoolName?: string;
}

export const SchoolMealReportPanel: React.FC<{ data?: MealReportData; date?: string; onDateChange?: (d: string) => void }> = ({ data, date: dateProp, onDateChange }) => {
  const ctx = useClassroomOptional();
  const classes = (data?.classes ?? ctx?.classes ?? []) as Classroom[];
  const students = (data?.students ?? ctx?.students ?? []) as Array<{ id: string; name: string; classId: string }>;
  const attendanceRecords = (data?.attendanceRecords ?? ctx?.attendanceRecords ?? []) as Array<{ date: string; classId: string; records: Record<string, string> }>;
  const boardingRecords = (data?.boardingRecords ?? ctx?.boardingRecords ?? []) as Array<{ date: string; classId: string; records: Record<string, string>; confirmedAt?: number; confirmedBy?: string }>;
  const [showMissing, setShowMissing] = useState(false);
  const [ownDate, setOwnDate] = useState(() => toLocalDateKey(new Date()));
  const date = dateProp ?? ownDate;
  const setDate = (d: string) => { if (onDateChange) onDateChange(d); else setOwnDate(d); };
  const schoolName = data?.schoolName || ctx?.currentUser?.schoolName || ctx?.teacherProfile.schoolName || 'Trường học';

  const rows = useMemo<Row[]>(() => {
    return classes.filter(isHomeroomClass)
      .slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi', { numeric: true }))
      .map(cls => {
        const list = students.filter(s => s.classId === cls.id);
        const att = attendanceRecords.find(r => r.date === date && r.classId === cls.id);
        const sheet = boardingRecords.find(r => r.date === date && r.classId === cls.id);
        const isAbsent = (id: string) => ABSENT.has(String(att?.records?.[id] || ''));
        // Marking a pupil absent creates a boarding entry for that pupil only: that is not a meal report.
        // A class has reported when the teacher confirmed, or (older data) the sheet covers pupils who are present.
        const meal = sheet && (sheet.confirmedAt || Object.keys(sheet.records || {}).some(id => !isAbsent(id))) ? sheet : undefined;
        const eating = meal ? list.filter(s => !isAbsent(s.id) && (meal.records?.[s.id] || 'eating') === 'eating').length : null;
        return {
          grade: String(cls.grade || 'Khác'),
          className: cls.name,
          teacher: cls.teacherName || '',
          total: list.length,
          eating,
          absentNames: list.filter(s => isAbsent(s.id)).map(s => s.name),
          absentKnown: Boolean(att),
          time: timeOf(meal?.confirmedAt, date),
          by: meal?.confirmedBy || '',
          status: meal ? (meal.confirmedAt ? 'confirmed' : 'reported') : 'missing',
        } as Row;
      })
      .filter(r => r.total > 0 || r.status !== 'missing');
  }, [classes, students, attendanceRecords, boardingRecords, date]);

  const reported = rows.filter(r => r.status !== 'missing');
  const coverage = coverageOf(reported.length, rows.length, reported.reduce((n, r) => n + r.total, 0), rows.reduce((n, r) => n + r.total, 0));
  const totalStudents = rows.reduce((n, r) => n + r.total, 0);
  const totalEating = reported.reduce((n, r) => n + (r.eating || 0), 0);
  const reportedStudents = reported.reduce((n, r) => n + r.total, 0);
  const absentText = (r: Row) => (r.absentNames.length ? r.absentNames.join(', ') : r.absentKnown ? 'Không' : r.status === 'missing' ? '' : 'Chưa điểm danh');
  const confirmText = (r: Row) => (r.status === 'confirmed' ? `${r.time}${r.by ? ` – ${r.by}` : ''}` : '');

  const exportExcel = () => {
    const head = ['STT', 'Lớp', 'Giáo viên chủ nhiệm', 'Sĩ số', 'Số ăn', 'Không ăn', 'Học sinh vắng (họ tên)', 'Giờ xác nhận', 'Tình trạng'];
    const aoa: any[][] = [
      [schoolName.toUpperCase()],
      ['BIỂU TỔNG HỢP BÁO ĂN BÁN TRÚ TOÀN TRƯỜNG'],
      [`Ngày ${formatVN(date)}`],
      [],
      head,
    ];
    const first = aoa.length + 1; // Excel row number of the first class
    rows.forEach((r, i) => {
      const n = first + i;
      aoa.push([
        i + 1, r.className, r.teacher, r.total,
        r.eating === null ? '' : r.eating,
        // summary cells are formulas so the sheet recalculates when a number is corrected by hand
        r.eating === null ? '' : { t: 'n', f: `D${n}-E${n}`, v: r.total - r.eating },
        absentText(r), confirmText(r), STATUS_TEXT[r.status],
      ]);
    });
    const last = first + rows.length - 1;
    if (rows.length > 0) {
      aoa.push([
        '', 'TỔNG (LỚP ĐÃ BÁO)', '',
        { t: 'n', f: `SUMIF(I${first}:I${last},"<>Chưa báo",D${first}:D${last})`, v: reportedStudents },
        { t: 'n', f: `SUM(E${first}:E${last})`, v: totalEating },
        { t: 'n', f: `SUM(F${first}:F${last})`, v: reportedStudents - totalEating },
        '', '',
        { t: 's', f: `COUNTIF(I${first}:I${last},"<>Chưa báo")&"/"&COUNTA(B${first}:B${last})&" lớp đã báo"`, v: `${reported.length}/${rows.length} lớp đã báo` },
      ]);
    }
    aoa.push([], ['', '', '', '', '', '', '', 'BAN QUẢN LÝ BÁN TRÚ'], ['', '', '', '', '', '', '', '(Ký và ghi rõ họ tên)']);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [6, 10, 26, 8, 8, 10, 46, 26, 14].map(wch => ({ wch }));
    ws['!merges'] = [0, 1, 2].map(r => ({ s: { r, c: 0 }, e: { r, c: 8 } }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bao_an_ban_tru');
    writeReportXlsx(wb, `Bao_an_ban_tru_toan_truong_${date}.xlsx`);
  };

  const printSheet = () => {
    const body = rows.map((r, i) => `<tr class="${r.status === 'missing' ? 'missing' : ''}">
      <td class="c">${i + 1}</td><td class="c b">${esc(r.className)}</td><td>${esc(r.teacher)}</td>
      <td class="c">${r.total}</td><td class="c b">${r.eating === null ? '' : r.eating}</td><td class="c">${r.eating === null ? '' : r.total - r.eating}</td>
      <td>${esc(absentText(r))}</td><td>${esc(confirmText(r))}</td><td class="c">${STATUS_TEXT[r.status]}</td></tr>`).join('');
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Báo ăn bán trú ${formatVN(date)}</title>
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700&display=swap" rel="stylesheet">
<style>
@page { size: A4 landscape; margin: 12mm; }
body { font-family: 'Be Vietnam Pro', Arial, sans-serif; color: #0f172a; font-size: 11pt; margin: 0; }
h1 { font-size: 15pt; text-align: center; margin: 6px 0 2px; }
.sub { text-align: center; margin: 0 0 10px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #334155; padding: 4px 6px; vertical-align: top; }
th { background: #e0f2fe; font-weight: 700; }
.c { text-align: center; } .b { font-weight: 700; }
tr.missing td { background: #fef3c7; }
tfoot td { font-weight: 700; background: #f1f5f9; }
.sign { margin-top: 18px; display: flex; justify-content: flex-end; }
.sign div { width: 280px; text-align: center; }
.sign .space { height: 70px; }
</style></head><body>
<div class="b">${esc(schoolName)}</div>
<h1>BIỂU TỔNG HỢP BÁO ĂN BÁN TRÚ TOÀN TRƯỜNG</h1>
<p class="sub">Ngày ${formatVN(date)} • ${reported.length}/${rows.length} lớp đã báo (${coverage.studentPct}% học sinh) • Tổng số suất ăn: <strong>${totalEating}</strong>${reported.length < rows.length ? ' • Số liệu tạm tính, còn lớp chưa báo ăn' : ''}</p>
<table><thead><tr><th>STT</th><th>Lớp</th><th>Giáo viên chủ nhiệm</th><th>Sĩ số</th><th>Số ăn</th><th>Không ăn</th><th>Học sinh vắng (họ tên)</th><th>Giờ xác nhận</th><th>Tình trạng</th></tr></thead>
<tbody>${body}</tbody>
<tfoot><tr><td></td><td class="c">TỔNG (lớp đã báo)</td><td></td><td class="c">${reportedStudents}</td><td class="c">${totalEating}</td><td class="c">${reportedStudents - totalEating}</td><td colspan="3">${reported.length}/${rows.length} lớp đã báo</td></tr></tfoot></table>
<div class="sign"><div><div>Ngày ${formatVN(date)}</div><div class="b">BAN QUẢN LÝ BÁN TRÚ</div><div>(Ký và ghi rõ họ tên)</div><div class="space"></div></div></div>
</body></html>`;
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc || !frame.contentWindow) { frame.remove(); return; }
    doc.open(); doc.write(html); doc.close();
    const win = frame.contentWindow;
    const go = () => { try { win.focus(); win.print(); } finally { setTimeout(() => frame.remove(), 60000); } };
    // wait for the font, but print anyway if the computer is offline
    const fonts = (doc as any).fonts;
    Promise.race([fonts?.ready ?? Promise.resolve(), new Promise(r => setTimeout(r, 1500))]).then(() => setTimeout(go, 100));
  };

  const missing = rows.filter(r => r.status === 'missing');

  return (
    <section data-report="" className="bg-white rounded-3xl border border-sky-200 shadow-sm p-4 sm:p-5 space-y-4" aria-labelledby="meal-report-title">
      <div className="flex flex-wrap items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0"><Utensils className="w-5 h-5" aria-hidden="true" /></span>
        <div className="flex-1 min-w-[220px]">
          <h2 id="meal-report-title" className="text-base font-black text-slate-900"><span className="sm:hidden">Báo ăn bán trú toàn trường</span><span className="max-sm:hidden">Biểu tổng hợp báo ăn bán trú toàn trường</span></h2>
          <p className="text-sm text-slate-700">Số liệu lấy từ phần "Ăn bán trú" các giáo viên chủ nhiệm đã xác nhận, thay cho phiếu báo ăn giấy của từng lớp.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="meal-report-date" className="block text-xs font-bold text-slate-900 mb-1">Ngày báo ăn</label>
            <input id="meal-report-date" type="date" value={date} max={toLocalDateKey(new Date())} onChange={e => e.target.value && setDate(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-600" />
          </div>
          <button type="button" onClick={exportExcel} disabled={rows.length === 0}
            className="no-hover-fx h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-black inline-flex items-center gap-2 cursor-pointer">
            <FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> Xuất Excel
          </button>
          <button type="button" onClick={printSheet} disabled={rows.length === 0}
            className="no-hover-fx h-10 px-4 rounded-xl bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-sm font-black inline-flex items-center gap-2 cursor-pointer">
            <Printer className="w-4 h-4" aria-hidden="true" /> In biểu có chỗ ký
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Tổng số suất ăn', value: totalEating, tone: 'bg-emerald-50 border-emerald-200 text-emerald-900' },
          { label: 'Không ăn (lớp đã báo)', value: reportedStudents - totalEating, tone: 'bg-slate-50 border-slate-200 text-slate-900' },
          { label: 'Lớp đã báo', value: `${reported.length}/${rows.length}`, tone: 'bg-sky-50 border-sky-200 text-sky-900' },
          { label: 'Lớp chưa báo', value: missing.length, tone: missing.length ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-900' },
        ].map(c => (
          <div key={c.label} className={`rounded-2xl border px-3 py-2 ${c.tone}`}>
            <div className="text-xs font-bold">{c.label}</div>
            <div className="text-2xl font-black tabular-nums leading-tight">{c.value}</div>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <div role="status" className={`rounded-2xl border px-4 py-3 space-y-2 ${coverage.complete ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-black text-slate-900">Độ đầy đủ: {coverage.reportedClasses}/{coverage.totalClasses} lớp đã báo ăn ({coverage.classPct}%)</span>
            <span className="text-sm text-slate-800">{coverage.reportedStudents}/{coverage.totalStudents} học sinh ({coverage.studentPct}%)</span>
            {reported.length > 0 && <span className="text-sm text-slate-800">Tỷ lệ ăn: <strong>{pct1(totalEating, coverage.reportedStudents) ?? 0}%</strong> sĩ số các lớp đã báo ({totalEating}/{coverage.reportedStudents})</span>}
            {!coverage.complete && <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-950 text-xs font-black uppercase">{coverage.empty ? 'Chưa có dữ liệu' : 'Tạm tính'}</span>}
          </div>
          <div className="h-2.5 rounded-full bg-white/80 border border-slate-200 overflow-hidden" aria-hidden="true">
            <div className={`h-full ${coverage.complete ? 'bg-emerald-600' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, coverage.classPct)}%` }} />
          </div>
          {!coverage.complete && !coverage.empty && <p className="text-xs text-slate-800">Số suất ăn và tỷ lệ chỉ tính các lớp đã báo. Lớp chưa báo không bị tính là không ăn.</p>}
        </div>
      )}

      {missing.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-amber-950 flex-1 min-w-[12rem] flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />{missing.length} lớp chưa báo ăn ngày {formatVN(date)}</p>
            {reported.length > 0 && (
              <button type="button" onClick={() => setShowMissing(v => !v)} aria-expanded={showMissing}
                className="no-hover-fx h-10 px-3 rounded-xl border border-amber-400 bg-white text-sm font-bold text-slate-900 cursor-pointer">
                {showMissing ? 'Ẩn các lớp này khỏi bảng' : 'Hiện các lớp này trong bảng'}
              </button>
            )}
          </div>
          <ul className="space-y-1">
            {[...missing.reduce((m, r) => m.set(r.grade, [...(m.get(r.grade) || []), r.className]), new Map<string, string[]>()).entries()]
              .sort((a, b) => a[0].localeCompare(b[0], 'vi', { numeric: true }))
              .map(([g, names]) => <li key={g} className="text-sm text-slate-800"><strong className="text-slate-900">{g} ({names.length}):</strong> {names.join(', ')}</li>)}
          </ul>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-4 text-center">Chưa có lớp chủ nhiệm nào có học sinh để tổng hợp.</p>
      ) : reported.length === 0 && !showMissing ? (
        <p className="text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-4 text-center">Chưa có lớp nào báo ăn ngày {formatVN(date)}.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[820px] text-sm text-slate-900">
            <thead>
              <tr className="bg-sky-50 text-left text-xs font-black uppercase tracking-wide text-sky-900">
                <th scope="col" className="px-3 py-2 w-12 text-center">STT</th>
                <th scope="col" className="px-3 py-2">Lớp</th>
                <th scope="col" className="px-3 py-2 whitespace-nowrap">Giáo viên chủ nhiệm</th>
                <th scope="col" className="px-3 py-2 text-center">Sĩ số</th>
                <th scope="col" className="px-3 py-2 text-center">Số ăn</th>
                <th scope="col" className="px-3 py-2 text-center">Không ăn</th>
                <th scope="col" className="px-3 py-2">Học sinh vắng</th>
                <th scope="col" className="px-3 py-2">Giờ xác nhận</th>
                <th scope="col" className="px-3 py-2">Tình trạng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.filter(r => showMissing || r.status !== 'missing').map((r, i) => (
                <tr key={r.className + i} className={r.status === 'missing' ? 'bg-amber-50' : 'bg-white'}>
                  <td className="px-3 py-2 text-center tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 font-black whitespace-nowrap">{r.className}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.teacher || <span className="text-slate-600">Chưa phân công</span>}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.total}</td>
                  <td className="px-3 py-2 text-center tabular-nums font-black text-emerald-800">{r.eating === null ? '—' : r.eating}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.eating === null ? '—' : r.total - r.eating}</td>
                  <td className="px-3 py-2 min-w-[180px]">{absentText(r) || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{confirmText(r) || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-black ${
                      r.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : r.status === 'reported' ? 'bg-sky-100 text-sky-800' : 'bg-amber-200 text-amber-900'}`}>
                      {r.status === 'confirmed' ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> : r.status === 'reported' ? <Clock className="w-3.5 h-3.5" aria-hidden="true" /> : <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />}
                      {STATUS_TEXT[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-black">
                <td className="px-3 py-2" />
                <td className="px-3 py-2" colSpan={2}>Tổng (lớp đã báo)</td>
                <td className="px-3 py-2 text-center tabular-nums">{reportedStudents}</td>
                <td className="px-3 py-2 text-center tabular-nums text-emerald-800">{totalEating}</td>
                <td className="px-3 py-2 text-center tabular-nums">{reportedStudents - totalEating}</td>
                <td className="px-3 py-2" colSpan={3}>{reported.length}/{rows.length} lớp đã báo</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-700">
        "Đã xác nhận" kèm giờ và tên tài khoản thay cho chữ ký của giáo viên chủ nhiệm. Lớp báo ăn trước khi có tính năng này hiện "Đã báo" và không có giờ.
      </p>
    </section>
  );
};
