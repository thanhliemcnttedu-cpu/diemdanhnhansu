import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { BarChart3, CalendarDays, FileSpreadsheet, Printer, UserX } from 'lucide-react';
import { useClassroom } from '../../../context/ClassroomContext';
import { toLocalDateKey } from '../../../services/googleDriveService';
import { staffAttendanceService } from '../../../services/staffAttendanceService';
import { writeReportXlsx } from '../../../utils/licensedExport';
import { isHomeroomClass } from './SchoolMealReportPanel';
import type { Classroom, Student } from '../../../types';

/**
 * Leadership reports for the principal / school admin / super admin, built only from what homeroom teachers
 * already record (attendance + boarding): 1) quick daily report, 2) weekly list of frequently absent pupils,
 * 3) monthly school summary. Read-only. Every summary cell of the Excel export is a formula.
 */
type Cell = string | number | { f: string; v: number | string };
interface Sheet {
  title: string; subtitle: string; file: string; sheetName: string;
  head: string[]; rows: Cell[][]; foot?: Cell[]; widths: number[]; notes?: string[];
  /** indexes of rows to highlight (class has not reported, etc.) */
  warnRows?: Set<number>;
}

const EXCUSED = new Set(['excused', 'sick', 'other']);
const two = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => toLocalDateKey(d);
const fromKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k: string, n: number) => { const d = fromKey(k); d.setDate(d.getDate() + n); return key(d); };
const vn = (k: string) => { const [y, m, d] = k.split('-'); return `${d}/${m}/${y}`; };
const dm = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const col = (i: number) => String.fromCharCode(65 + i);
const val = (c: Cell) => (typeof c === 'object' ? c.v : c);
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));
const mondayOf = (k: string) => addDays(k, -((fromKey(k).getDay() + 6) % 7));
const sortClasses = (list: Classroom[]) => list.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi', { numeric: true }));

type Tab = 'day' | 'week' | 'month';
const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'day', label: 'Báo cáo nhanh trong ngày', icon: <CalendarDays className="w-4 h-4" aria-hidden="true" /> },
  { id: 'week', label: 'Học sinh vắng nhiều trong tuần', icon: <UserX className="w-4 h-4" aria-hidden="true" /> },
  { id: 'month', label: 'Tổng hợp tháng toàn trường', icon: <BarChart3 className="w-4 h-4" aria-hidden="true" /> },
];

export const LeaderReportsPanel: React.FC = () => {
  const { classes, students, attendanceRecords, boardingRecords, teacherProfile, currentUser } = useClassroom();
  const today = key(new Date());
  const [tab, setTab] = useState<Tab>('day');
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [threshold, setThreshold] = useState(3);
  const schoolName = currentUser?.schoolName || teacherProfile.schoolName || 'Trường học';

  const homerooms = useMemo(() => sortClasses(classes.filter(isHomeroomClass)), [classes]);
  const byClass = useMemo(() => {
    const m = new Map<string, Student[]>();
    students.forEach(s => { const l = m.get(s.classId); if (l) l.push(s); else m.set(s.classId, [s]); });
    return m;
  }, [students]);
  const attMap = useMemo(() => new Map(attendanceRecords.map(r => [`${r.classId}|${r.date}`, r])), [attendanceRecords]);
  const mealMap = useMemo(() => new Map(boardingRecords.map(r => [`${r.classId}|${r.date}`, r])), [boardingRecords]);

  /** Meals of one class on one day; null = the class has not reported (same rule as the boarding sheet) */
  const mealsOf = (cls: Classroom, d: string): number | null => {
    const list = byClass.get(cls.id) || [];
    const att = attMap.get(`${cls.id}|${d}`);
    const sheet = mealMap.get(`${cls.id}|${d}`);
    const absent = (id: string) => { const st = String(att?.records?.[id] || ''); return st === 'unexcused' || EXCUSED.has(st); };
    if (!(sheet && ((sheet as any).confirmedAt || Object.keys(sheet.records || {}).some(id => !absent(id))))) return null;
    return list.filter(s => !absent(s.id) && ((sheet.records as any)?.[s.id] || 'eating') === 'eating').length;
  };
  const countDay = (cls: Classroom, d: string) => {
    const list = byClass.get(cls.id) || [];
    const att = attMap.get(`${cls.id}|${d}`);
    if (!att) return null;
    let excused = 0, unexcused = 0, late = 0;
    list.forEach(s => { const st = String(att.records?.[s.id] || ''); if (st === 'unexcused') unexcused++; else if (EXCUSED.has(st)) excused++; else if (st === 'late') late++; });
    return { excused, unexcused, late };
  };

  // Staff check-in of the chosen day: only when the manager password was already entered on the staff screen
  const [staffLine, setStaffLine] = useState('');
  useEffect(() => {
    let alive = true;
    setStaffLine('');
    const auth = staffAttendanceService.getViewerAuth();
    if (tab !== 'day' || !auth) return;
    staffAttendanceService.range(date, date, auth).then(r => {
      if (!alive || !r?.success || !Array.isArray(r.staff)) return;
      const day = (r.days || {})[date] || {};
      const missing = r.staff.filter((s: any) => !day[s.code]).map((s: any) => s.name);
      const off = r.staff.filter((s: any) => day[s.code] && day[s.code].status !== 'present').map((s: any) => s.name);
      setStaffLine(`Nhân sự: ${r.staff.length - missing.length}/${r.staff.length} người đã điểm danh`
        + (off.length ? ` • Nghỉ / công tác: ${off.join(', ')}` : '')
        + (missing.length ? ` • Chưa điểm danh: ${missing.join(', ')}` : ''));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [tab, date]);

  const sheet = useMemo<Sheet>(() => {
    if (tab === 'day') {
      const rows: Cell[][] = []; const warn = new Set<number>();
      const first = 6; // Excel row of the first class (3 title rows, 1 blank, 1 header)
      homerooms.forEach((cls, i) => {
        const total = (byClass.get(cls.id) || []).length;
        if (!total) return;
        const n = first + rows.length;
        const c = countDay(cls, date);
        const meals = mealsOf(cls, date);
        if (!c) warn.add(rows.length);
        rows.push([
          rows.length + 1, cls.name, cls.teacherName || '', total,
          c ? { f: `D${n}-F${n}-G${n}`, v: total - c.excused - c.unexcused } : '',
          c ? c.excused : '', c ? c.unexcused : '', c ? c.late : '',
          c ? { f: `ROUND(E${n}/D${n}*100,1)`, v: pct(total - c.excused - c.unexcused, total) } : '',
          meals === null ? '' : meals,
          c ? 'Đã điểm danh' : 'Chưa điểm danh',
        ]);
        void i;
      });
      const last = first + rows.length - 1;
      const done = rows.filter(r => r[10] === 'Đã điểm danh');
      const sum = (ix: number) => rows.reduce((a, r) => a + (Number(val(r[ix])) || 0), 0);
      const doneTotal = done.reduce((a, r) => a + Number(r[3]), 0);
      return {
        title: 'BÁO CÁO NHANH TÌNH HÌNH TRONG NGÀY', subtitle: `Ngày ${vn(date)}`, file: `Bao_cao_nhanh_${date}.xlsx`, sheetName: 'Bao_cao_ngay',
        head: ['STT', 'Lớp', 'Giáo viên chủ nhiệm', 'Sĩ số', 'Có mặt', 'Vắng có phép', 'Vắng không phép', 'Đi muộn', 'Chuyên cần (%)', 'Suất ăn bán trú', 'Tình trạng'],
        rows, warnRows: warn, widths: [6, 10, 26, 8, 9, 13, 15, 9, 14, 15, 16],
        foot: rows.length ? ['', 'TOÀN TRƯỜNG', '',
          { f: `SUM(D${first}:D${last})`, v: sum(3) }, { f: `SUM(E${first}:E${last})`, v: sum(4) },
          { f: `SUM(F${first}:F${last})`, v: sum(5) }, { f: `SUM(G${first}:G${last})`, v: sum(6) }, { f: `SUM(H${first}:H${last})`, v: sum(7) },
          { f: `IF(SUMIF(K${first}:K${last},"Đã điểm danh",D${first}:D${last})=0,0,ROUND(SUM(E${first}:E${last})/SUMIF(K${first}:K${last},"Đã điểm danh",D${first}:D${last})*100,1))`, v: pct(sum(4), doneTotal) },
          { f: `SUM(J${first}:J${last})`, v: sum(9) },
          { f: `COUNTIF(K${first}:K${last},"Đã điểm danh")&"/"&COUNTA(B${first}:B${last})&" lớp"`, v: `${done.length}/${rows.length} lớp` }] : undefined,
        notes: [staffLine || 'Nhân sự: mở màn Chấm công và nhập mật khẩu để có số liệu điểm danh giáo viên – nhân viên.',
          'Tỷ lệ chuyên cần toàn trường tính trên sĩ số các lớp đã điểm danh. Ô suất ăn để trống là lớp chưa báo ăn.'],
      };
    }

    if (tab === 'week') {
      const mon = mondayOf(date);
      const days = [0, 1, 2, 3, 4].map(i => addDays(mon, i));
      const first = 6;
      const list: Array<{ cells: Cell[]; total: number; un: number }> = [];
      homerooms.forEach(cls => {
        (byClass.get(cls.id) || []).forEach(s => {
          const marks = days.map(d => { const st = String(attMap.get(`${cls.id}|${d}`)?.records?.[s.id] || ''); return st === 'unexcused' ? 'K' : EXCUSED.has(st) ? 'P' : ''; });
          const ex = marks.filter(m => m === 'P').length; const un = marks.filter(m => m === 'K').length;
          if (ex + un >= threshold || un >= 2) list.push({ total: ex + un, un, cells: ['', cls.name, s.name, cls.teacherName || '', ...marks, ex, un, ex + un] });
        });
      });
      list.sort((a, b) => b.total - a.total || b.un - a.un);
      const rows = list.map((x, i) => {
        const n = first + i;
        const c = x.cells.slice();
        c[0] = i + 1;
        c[9] = { f: `COUNTIF(E${n}:I${n},"P")`, v: Number(x.cells[9]) };
        c[10] = { f: `COUNTIF(E${n}:I${n},"K")`, v: x.un };
        c[11] = { f: `J${n}+K${n}`, v: x.total };
        return c;
      });
      const last = first + rows.length - 1;
      return {
        title: 'DANH SÁCH HỌC SINH VẮNG NHIỀU TRONG TUẦN', subtitle: `Tuần từ ${vn(days[0])} đến ${vn(days[4])} • Vắng từ ${threshold} buổi, hoặc vắng không phép từ 2 buổi`,
        file: `Hoc_sinh_vang_nhieu_${days[0]}_${days[4]}.xlsx`, sheetName: 'Vang_nhieu',
        head: ['STT', 'Lớp', 'Họ và tên', 'Giáo viên chủ nhiệm', ...days.map((d, i) => `T${i + 2} ${dm(d)}`), 'Có phép', 'Không phép', 'Tổng vắng'],
        rows, widths: [6, 9, 28, 26, 10, 10, 10, 10, 10, 10, 12, 11],
        foot: rows.length ? ['', 'TỔNG', { f: `COUNTA(C${first}:C${last})&" học sinh"`, v: `${rows.length} học sinh` }, '', '', '', '', '', '',
          { f: `SUM(J${first}:J${last})`, v: list.reduce((a, x) => a + (x.total - x.un), 0) },
          { f: `SUM(K${first}:K${last})`, v: list.reduce((a, x) => a + x.un, 0) },
          { f: `SUM(L${first}:L${last})`, v: list.reduce((a, x) => a + x.total, 0) }] : undefined,
        notes: ['P = vắng có phép (kể cả ốm); K = vắng không phép. Ô trống = có mặt hoặc lớp chưa điểm danh ngày đó.'],
      };
    }

    // month
    const [y, m] = month.split('-').map(Number);
    const prev = (() => { const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${two(d.getMonth() + 1)}`; })();
    const stat = (cls: Classroom, ym: string) => {
      const total = (byClass.get(cls.id) || []).length;
      let days = 0, ex = 0, un = 0, meals = 0;
      const end = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
      for (let d = 1; d <= end; d++) {
        const k = `${ym}-${two(d)}`;
        if (k > today) break;
        const c = countDay(cls, k);
        if (c) { days++; ex += c.excused; un += c.unexcused; }
        meals += mealsOf(cls, k) || 0;
      }
      return { total, days, ex, un, meals, rate: pct(total * days - ex - un, total * days) };
    };
    const first = 6;
    const rows: Cell[][] = [];
    const agg = { total: 0, slots: 0, ex: 0, un: 0, meals: 0, male: 0, female: 0, pSlots: 0, pAbs: 0 };
    homerooms.forEach(cls => {
      const list = byClass.get(cls.id) || [];
      if (!list.length) return;
      const n = first + rows.length;
      const a = stat(cls, month); const p = stat(cls, prev);
      const female = list.filter(s => String(s.gender) === 'Nữ').length;
      agg.total += a.total; agg.slots += a.total * a.days; agg.ex += a.ex; agg.un += a.un; agg.meals += a.meals;
      agg.female += female; agg.male += list.length - female; agg.pSlots += p.total * p.days; agg.pAbs += p.ex + p.un;
      rows.push([
        rows.length + 1, cls.name, String(cls.grade || ''), cls.teacherName || '', a.total,
        { f: `E${n}-G${n}`, v: list.length - female }, female, a.days, a.ex, a.un,
        { f: `IF(E${n}*H${n}=0,0,ROUND((E${n}*H${n}-I${n}-J${n})/(E${n}*H${n})*100,1))`, v: a.rate },
        p.days ? p.rate : '',
        p.days ? { f: `ROUND(K${n}-L${n},1)`, v: Math.round((a.rate - p.rate) * 10) / 10 } : '',
        a.meals,
      ]);
    });
    const last = first + rows.length - 1;
    const prevRate = pct(agg.pSlots - agg.pAbs, agg.pSlots);
    const rate = pct(agg.slots - agg.ex - agg.un, agg.slots);
    return {
      title: 'TỔNG HỢP TÌNH HÌNH TOÀN TRƯỜNG THEO THÁNG', subtitle: `Tháng ${m}/${y}${month === today.slice(0, 7) ? ` (tính đến ${vn(today)})` : ''}`,
      file: `Tong_hop_thang_${month}.xlsx`, sheetName: 'Tong_hop_thang',
      head: ['STT', 'Lớp', 'Khối', 'Giáo viên chủ nhiệm', 'Sĩ số', 'Nam', 'Nữ', 'Số ngày đã điểm danh', 'Lượt vắng có phép', 'Lượt vắng không phép', 'Chuyên cần (%)', 'Tháng trước (%)', 'Chênh lệch', 'Tổng suất ăn'],
      rows, widths: [6, 9, 9, 26, 8, 7, 7, 13, 13, 14, 13, 13, 11, 13],
      foot: rows.length ? ['', 'TOÀN TRƯỜNG', { f: `COUNTA(B${first}:B${last})&" lớp"`, v: `${rows.length} lớp` }, '',
        { f: `SUM(E${first}:E${last})`, v: agg.total }, { f: `SUM(F${first}:F${last})`, v: agg.male }, { f: `SUM(G${first}:G${last})`, v: agg.female }, '',
        { f: `SUM(I${first}:I${last})`, v: agg.ex }, { f: `SUM(J${first}:J${last})`, v: agg.un },
        { f: `IF(SUMPRODUCT(E${first}:E${last},H${first}:H${last})=0,0,ROUND((SUMPRODUCT(E${first}:E${last},H${first}:H${last})-SUM(I${first}:J${last}))/SUMPRODUCT(E${first}:E${last},H${first}:H${last})*100,1))`, v: rate },
        agg.pSlots ? prevRate : '', agg.pSlots ? { f: `ROUND(K${last + 1}-L${last + 1},1)`, v: Math.round((rate - prevRate) * 10) / 10 } : '',
        { f: `SUM(N${first}:N${last})`, v: agg.meals }] : undefined,
      notes: ['Tỷ lệ chuyên cần = (sĩ số × số ngày đã điểm danh − lượt vắng) ÷ (sĩ số × số ngày đã điểm danh), theo sĩ số hiện tại của lớp.',
        'Chênh lệch dương là chuyên cần tốt hơn tháng trước. Tổng suất ăn chỉ tính các ngày lớp đã báo ăn.'],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, date, month, threshold, homerooms, byClass, attMap, mealMap, staffLine, today]);

  const exportExcel = () => {
    const aoa: any[][] = [[schoolName.toUpperCase()], [sheet.title], [sheet.subtitle], [], sheet.head];
    sheet.rows.forEach(r => aoa.push(r.map(c => (typeof c === 'object' ? { t: typeof c.v === 'number' ? 'n' : 's', f: c.f, v: c.v } : c))));
    if (sheet.foot) aoa.push(sheet.foot.map(c => (typeof c === 'object' ? { t: typeof c.v === 'number' ? 'n' : 's', f: c.f, v: c.v } : c)));
    aoa.push([]);
    (sheet.notes || []).forEach(n => aoa.push([n]));
    const sign = sheet.head.length - 3;
    aoa.push([], [...Array(sign).fill(''), 'HIỆU TRƯỞNG'], [...Array(sign).fill(''), '(Ký, ghi rõ họ tên và đóng dấu)']);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = sheet.widths.map(wch => ({ wch }));
    ws['!merges'] = [0, 1, 2].map(r => ({ s: { r, c: 0 }, e: { r, c: sheet.head.length - 1 } }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName);
    writeReportXlsx(wb, sheet.file);
  };

  const printSheet = () => {
    const td = (c: Cell, i: number) => `<td class="${typeof val(c) === 'number' || i === 0 || String(val(c)).length <= 3 ? 'c' : ''}">${esc(val(c))}</td>`;
    const body = sheet.rows.map((r, i) => `<tr class="${sheet.warnRows?.has(i) ? 'warn' : ''}">${r.map(td).join('')}</tr>`).join('');
    const foot = sheet.foot ? `<tfoot><tr>${sheet.foot.map(td).join('')}</tr></tfoot>` : '';
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(sheet.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700&display=swap" rel="stylesheet">
<style>
@page { size: A4 landscape; margin: 12mm; }
body { font-family: 'Be Vietnam Pro', Arial, sans-serif; color: #0f172a; font-size: 10.5pt; margin: 0; }
h1 { font-size: 15pt; text-align: center; margin: 6px 0 2px; }
.sub { text-align: center; margin: 0 0 10px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #334155; padding: 4px 6px; vertical-align: top; }
th { background: #e0f2fe; font-weight: 700; }
.c { text-align: center; } .b { font-weight: 700; }
tr.warn td { background: #fef3c7; }
tfoot td { font-weight: 700; background: #f1f5f9; }
.note { margin: 6px 0 0; font-size: 9.5pt; }
.sign { margin-top: 16px; display: flex; justify-content: flex-end; }
.sign div { width: 300px; text-align: center; }
.sign .space { height: 70px; }
</style></head><body>
<div class="b">${esc(schoolName)}</div>
<h1>${esc(sheet.title)}</h1>
<p class="sub">${esc(sheet.subtitle)}</p>
<table><thead><tr>${sheet.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td class="c" colspan="${sheet.head.length}">Không có dữ liệu</td></tr>`}</tbody>${foot}</table>
${(sheet.notes || []).map(n => `<p class="note">${esc(n)}</p>`).join('')}
<div class="sign"><div><div>Ngày ${vn(today)}</div><div class="b">HIỆU TRƯỞNG</div><div>(Ký, ghi rõ họ tên và đóng dấu)</div><div class="space"></div></div></div>
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
    const fonts = (doc as any).fonts;
    Promise.race([fonts?.ready ?? Promise.resolve(), new Promise(r => setTimeout(r, 1500))]).then(() => setTimeout(go, 100));
  };

  const input = 'h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-600';
  const isNum = (c: Cell) => typeof val(c) === 'number';

  return (
    <section className="bg-white rounded-3xl border border-sky-200 shadow-sm p-4 sm:p-5 space-y-4" aria-labelledby="leader-report-title">
      <div className="flex flex-wrap items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0"><BarChart3 className="w-5 h-5" aria-hidden="true" /></span>
        <div className="flex-1 min-w-[220px]">
          <h2 id="leader-report-title" className="normal-case text-base font-black text-slate-900">Báo cáo lãnh đạo</h2>
          <p className="text-sm text-slate-700">Tổng hợp từ số liệu điểm danh và bán trú các giáo viên chủ nhiệm đã ghi. Xuất Excel có công thức hoặc in bản có chỗ ký.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Loại báo cáo">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`no-hover-fx h-10 px-3.5 rounded-xl border text-sm font-bold inline-flex items-center gap-2 cursor-pointer ${tab === t.id ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'}`}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {tab !== 'month' ? (
          <div>
            <label htmlFor="leader-date" className="block text-xs font-bold text-slate-900 mb-1">{tab === 'day' ? 'Ngày báo cáo' : 'Một ngày trong tuần cần xem'}</label>
            <input id="leader-date" type="date" value={date} max={today} onChange={e => e.target.value && setDate(e.target.value)} className={input} />
          </div>
        ) : (
          <div>
            <label htmlFor="leader-month" className="block text-xs font-bold text-slate-900 mb-1">Tháng</label>
            <input id="leader-month" type="month" value={month} max={today.slice(0, 7)} onChange={e => e.target.value && setMonth(e.target.value)} className={input} />
          </div>
        )}
        {tab === 'week' && (
          <div>
            <label htmlFor="leader-threshold" className="block text-xs font-bold text-slate-900 mb-1">Vắng từ</label>
            <select id="leader-threshold" value={threshold} onChange={e => setThreshold(Number(e.target.value))} className={input}>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} buổi</option>)}
            </select>
          </div>
        )}
        <div className="flex-1" />
        <button type="button" onClick={exportExcel} disabled={sheet.rows.length === 0}
          className="no-hover-fx h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-black inline-flex items-center gap-2 cursor-pointer">
          <FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> Xuất Excel
        </button>
        <button type="button" onClick={printSheet} disabled={sheet.rows.length === 0}
          className="no-hover-fx h-10 px-4 rounded-xl bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-sm font-black inline-flex items-center gap-2 cursor-pointer">
          <Printer className="w-4 h-4" aria-hidden="true" /> In bản có chỗ ký
        </button>
      </div>

      <p className="text-sm font-bold text-slate-900">{sheet.subtitle}</p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-sm min-w-[760px]" data-leader-report={tab}>
          <thead>
            <tr className="bg-sky-50 text-slate-900">
              {sheet.head.map(h => <th key={h} scope="col" className="px-2.5 py-2 text-left font-bold align-bottom">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.length === 0 && (
              <tr><td colSpan={sheet.head.length} className="px-3 py-8 text-center text-slate-600">
                {tab === 'week' ? 'Không có học sinh nào vắng tới ngưỡng trong tuần này.' : 'Chưa có lớp chủ nhiệm nào có học sinh.'}
              </td></tr>
            )}
            {sheet.rows.map((r, i) => (
              <tr key={i} className={`border-t border-slate-100 ${sheet.warnRows?.has(i) ? 'bg-amber-50' : ''}`}>
                {r.map((c, j) => (
                  <td key={j} className={`px-2.5 py-2 ${isNum(c) ? 'tabular-nums text-right' : ''} ${j === 1 || j === 2 && tab === 'week' ? 'font-bold text-slate-900' : 'text-slate-800'} ${j === 3 || (j === 2 && tab !== 'week') ? 'whitespace-nowrap' : ''}`}>
                    {tab === 'month' && j === 12 && typeof val(c) === 'number'
                      ? <span className={Number(val(c)) < 0 ? 'font-bold text-rose-700' : 'font-bold text-emerald-700'}>{Number(val(c)) > 0 ? '+' : ''}{val(c)}</span>
                      : tab === 'week' && j >= 4 && j <= 8 && val(c)
                        ? <span className={`inline-block w-6 text-center rounded font-bold ${val(c) === 'K' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900'}`}>{val(c)}</span>
                        : val(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {sheet.foot && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-900">
                {sheet.foot.map((c, j) => <td key={j} className={`px-2.5 py-2 ${isNum(c) ? 'tabular-nums text-right' : ''}`}>{val(c)}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {(sheet.notes || []).map(n => <p key={n} className="text-xs text-slate-600">{n}</p>)}
    </section>
  );
};

export default LeaderReportsPanel;
