/**
 * 📊 Xuất Excel KÊ KHAI TIẾT DẠY ĐÚNG BIỂU MẪU nhà trường đang dùng (TH1 / TH2 / TH3).
 *
 * Khuôn `src/assets/kekhaiExcelTemplates.json` được trích từ chính các tệp .xlsm của nhà trường
 * (kiểu ô: phông, viền, căn lề, màu; độ rộng cột; chiều cao dòng; ô gộp; khổ giấy in) — đã xóa tên người,
 * số liệu, macro và mật khẩu khóa trang. Ở đây chỉ điền số liệu vào khuôn rồi đóng gói .xlsx bằng JSZip:
 *  - TH1: trang "TonghopKT" (14 môn × Tuần 1…5) + mỗi giáo viên 1 trang "1", "2"… (giống tệp cá nhân)
 *  - TH2: trang "TonghopGDTC" (mỗi GV 1 dòng, tối thiểu 12 dòng như mẫu) + trang "1", "2"…
 *  - TH3: trang "TongTA" (tối thiểu 3 dòng như mẫu) + trang "1", "2"…
 *  - Thêm: bảng kê tiết GDTC dạy ngoài trời (dùng khuôn TH2, đổi tiêu đề)
 *  - Thêm: bảng kê thừa giờ các môn khác (khuôn TH3, mỗi môn của giáo viên 1 dòng, cột Môn ghi tên môn)
 * Cột Tổng và dòng Tổng là công thức SUM như tệp gốc (có sẵn giá trị tính trước, Excel tự tính lại khi mở).
 */
import JSZip from 'jszip';
import { MonthWeek, HSKT_SUBJECTS, ktOf, otOf, subjectLabel, OVERTIME_SUBJECTS, TeachLog, WeekCounts, schoolYearOf } from './teachingLogService';

export interface ExcelHeader { org: string; school: string; month: string; wks: MonthWeek[] }
type Entry = { name: string; log: TeachLog | null };

type TplCell = { c: string; s: number; text?: string; num?: number };
type TplRow = { r: number; ht: number | null; cells: TplCell[] };
type TplSheet = { cols: string; sheetFormatPr: string; sheetView: string; pageMargins: string; pageSetup: string; printOptions: string; merges: string[]; rows: TplRow[] };
type TplBook = { styles: string; theme: string; summary: TplSheet; teacher: TplSheet };
type Templates = Record<'th1' | 'th2' | 'th3', TplBook>;

let cache: Promise<Templates> | null = null;
const loadTemplates = () => (cache ||= import('../assets/kekhaiExcelTemplates.json').then(m => (m as any).default as Templates));

const WEEK_COLS = ['D', 'F', 'H', 'J', 'L'];
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DATA_START = 5;

interface RenderOpts {
  org: string; school: string; year: string; title?: string;
  /** Ghi đè chữ ở vùng tiêu đề (vd. tên giáo viên ở A4 của trang cá nhân TH1) */
  headerText?: Record<string, string>;
  /** Số dòng dữ liệu tối thiểu (bảng 1 dòng / GV); mặc định = số dòng của khuôn */
  rowCount?: number;
  /** Mọi dòng dữ liệu dùng kiểu của dòng đầu (mẫu gốc để lẫn chữ đậm / thường giữa các dòng) */
  uniformRows?: boolean;
  rowName?: (i: number) => string | null;
  /** Ghi đè chữ ở các cột Môn (C, E, G, I, K, M) của dòng i; null = để trống */
  rowLabel?: (i: number) => string | null;
  /** Số tiết dòng i, tuần k (0…4); null = để trống */
  value: (i: number, k: number, tplRow: TplRow) => number | null;
}

function renderSheet(t: TplSheet, o: RenderOpts) {
  const totalTpl = t.rows[t.rows.length - 1];
  const header = t.rows.filter(r => r.r < DATA_START);
  const dataTpl = t.rows.filter(r => r.r >= DATA_START && r.r < totalTpl.r);
  const n = Math.max(dataTpl.length, o.rowCount || 0);
  const totalR = DATA_START + n;
  const delta = totalR - totalTpl.r;
  const out: string[] = [];
  const cellXml = (ref: string, s: number, val: { text?: string | null; num?: number | null; f?: string }) => {
    if (val.f) return `<c r="${ref}" s="${s}"><f>${val.f}</f><v>${val.num || 0}</v></c>`;
    if (val.text != null && val.text !== '') return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(val.text)}</t></is></c>`;
    if (val.num != null) return `<c r="${ref}" s="${s}"><v>${val.num}</v></c>`;
    return `<c r="${ref}" s="${s}"/>`;
  };
  const rowOpen = (r: number, ht: number | null) => `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>`;

  header.forEach(row => {
    out.push(rowOpen(row.r, row.ht));
    row.cells.forEach(c => {
      const ref = `${c.c}${row.r}`;
      let text = c.text ?? null;
      if (ref === 'A1') text = o.org.toUpperCase();
      if (ref === 'A2') text = o.school.toUpperCase();
      if (ref === 'E1' && o.title) text = o.title;
      if (ref === 'E2') text = `NĂM HỌC ${o.year}`;
      if (o.headerText?.[ref] != null) text = o.headerText[ref];
      out.push(cellXml(ref, c.s, { text, num: c.num }));
    });
    out.push('</row>');
  });

  const colTotals: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const tpl = o.uniformRows ? dataTpl[0] : dataTpl[Math.min(i, dataTpl.length - 1)];
    const r = DATA_START + i;
    let rowSum = 0;
    out.push(rowOpen(r, tpl.ht));
    tpl.cells.forEach(c => {
      const ref = `${c.c}${r}`;
      const k = WEEK_COLS.indexOf(c.c);
      if (c.c === 'A') { out.push(cellXml(ref, c.s, { text: o.rowName?.(i) ?? null })); return; }
      if (c.c === 'B') {
        const asText = c.text != null && /^\d+$/.test(c.text);
        out.push(cellXml(ref, c.s, asText ? { text: String(i + 1) } : { num: i + 1 }));
        return;
      }
      if (k >= 0) {
        const v = o.value(i, k, tpl);
        if (v != null) { rowSum += v; colTotals[c.c] = (colTotals[c.c] || 0) + v; }
        out.push(cellXml(ref, c.s, { num: v }));
        return;
      }
      if (c.c === 'N') { out.push(cellXml(ref, c.s, { f: `SUM(${WEEK_COLS.map(x => x + r).join(',')})`, num: rowSum })); return; }
      if (o.rowLabel && ['C', 'E', 'G', 'I', 'K', 'M'].includes(c.c)) { out.push(cellXml(ref, c.s, { text: o.rowLabel(i) })); return; }
      out.push(cellXml(ref, c.s, { text: c.text ?? null, num: c.num }));
    });
    colTotals.N = (colTotals.N || 0) + rowSum;
    out.push('</row>');
  }

  out.push(rowOpen(totalR, totalTpl.ht));
  totalTpl.cells.forEach(c => {
    const ref = `${c.c}${totalR}`;
    if (WEEK_COLS.includes(c.c) || c.c === 'N') out.push(cellXml(ref, c.s, { f: `SUM(${c.c}${DATA_START}:${c.c}${totalR - 1})`, num: colTotals[c.c] || 0 }));
    else out.push(cellXml(ref, c.s, { text: c.text ?? null, num: c.num }));
  });
  out.push('</row>');

  const shift = (ref: string) => ref.replace(/([A-Z]+)(\d+)/g, (_m, col, row) => `${col}${Number(row) >= totalTpl.r ? Number(row) + delta : row}`);
  const merges = t.merges.map(shift);
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<dimension ref="A1:N${totalR}"/><sheetViews>${t.sheetView}</sheetViews>${t.sheetFormatPr}${t.cols}`
    + `<sheetData>${out.join('')}</sheetData>`
    + (merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '')
    + `${t.printOptions}${t.pageMargins}${t.pageSetup}</worksheet>`;
}

async function download(book: TplBook, sheets: Array<{ name: string; xml: string }>, fileName: string) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<bookViews><workbookView/></bookViews><sheets>'
    + sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
    + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + `<Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>`);
  zip.file('xl/styles.xml', book.styles);
  zip.file('xl/theme/theme1.xml', book.theme);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, s.xml));
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const weekOf = (h: ExcelHeader, log: TeachLog | null, k: number): WeekCounts | undefined | null =>
  (h.wks[k] ? log?.weeks?.[h.wks[k].key] : null);
const base = (h: ExcelHeader) => ({ org: h.org, school: h.school, year: schoolYearOf(h.month) });
const codeOfRow = (row: TplRow) => {
  const label = row.cells.find(c => c.c === 'C')?.text || '';
  return HSKT_SUBJECTS.find(s => s.label === label.trim())?.code || '';
};

/** TH1 – Bảng kê tiết dạy các lớp có HS khuyết tật */
export async function exportTH1(h: ExcelHeader, list: Entry[]) {
  const t = (await loadTemplates()).th1;
  const sheets = [{
    name: 'TonghopKT',
    xml: renderSheet(t.summary, {
      ...base(h),
      value: (_i, k, row) => (h.wks[k] ? list.reduce((a, x) => a + ktOf(weekOf(h, x.log, k) || undefined, codeOfRow(row)), 0) : null),
    }),
  }];
  list.forEach((x, idx) => sheets.push({
    name: String(idx + 1),
    xml: renderSheet(t.teacher, {
      ...base(h), headerText: { A4: x.name },
      value: (_i, k, row) => (h.wks[k] ? ktOf(weekOf(h, x.log, k) || undefined, codeOfRow(row)) : null),
    }),
  }));
  await download(t, sheets, `TH1. BANG KE DAY KHUYET TAT ${h.month}.xlsx`);
}

/** Bảng 1 dòng / giáo viên (TH2, TH3) + trang cá nhân "1", "2"… */
async function perTeacherBook(book: TplBook, summaryName: string, h: ExcelHeader, list: Entry[], get: (w: WeekCounts) => number, fileName: string, title?: string) {
  const val = (x: Entry, k: number) => { const w = weekOf(h, x.log, k); return h.wks[k] ? (w ? get(w) : 0) : null; };
  const sheets = [{
    name: summaryName,
    xml: renderSheet(book.summary, {
      ...base(h), title, rowCount: list.length, uniformRows: true,
      rowName: (i) => list[i]?.name ?? null,
      value: (i, k) => (list[i] ? val(list[i], k) : null),
    }),
  }];
  list.forEach((x, idx) => sheets.push({
    name: String(idx + 1),
    xml: renderSheet(book.teacher, {
      ...base(h), title,
      rowName: (i) => (i === 0 ? x.name : null),
      value: (i, k) => (i === 0 ? val(x, k) : null),
    }),
  }));
  await download(book, sheets, fileName);
}

/** TH2 – Bảng kê tiết dạy Giáo dục thể chất */
export async function exportTH2(h: ExcelHeader, list: Entry[]) {
  const t = (await loadTemplates()).th2;
  await perTeacherBook(t, 'TonghopGDTC', h, list, w => Number(w.pe) || 0, `TH2. BANG KE DAY GDTC ${h.month}.xlsx`);
}

/** Bảng kê tiết GDTC dạy ngoài trời (khuôn TH2, đổi tiêu đề) */
export async function exportOutdoor(h: ExcelHeader, list: Entry[]) {
  const t = (await loadTemplates()).th2;
  await perTeacherBook(t, 'TonghopNgoaiTroi', h, list, w => Number(w.outdoor) || 0, `BANG KE GDTC DAY NGOAI TROI ${h.month}.xlsx`, 'BẢNG KÊ TIẾT GDTC DẠY NGOÀI TRỜI');
}

/** Bảng kê thừa giờ các môn khác (khuôn TH3): mỗi (giáo viên, môn) 1 dòng; trang "1", "2"… mỗi giáo viên */
export async function exportOvertime(h: ExcelHeader, list: Array<Entry & { subjects?: string[] }>) {
  const t = (await loadTemplates()).th3;
  const title = 'BẢNG KÊ TIẾT DẠY THỪA GIỜ CÁC MÔN';
  const codesOf = (x: Entry & { subjects?: string[] }) => {
    const used = new Set<string>(x.subjects || []);
    Object.values(x.log?.weeks || {}).forEach(w => Object.keys(w?.ot || {}).forEach(c => used.add(c)));
    return OVERTIME_SUBJECTS.map(s => s.code).filter(c => used.has(c));
  };
  const lines = list.flatMap(x => codesOf(x).map(code => ({ x, code })));
  const val = (x: Entry, code: string, k: number) => (h.wks[k] ? otOf(weekOf(h, x.log, k) || undefined, code) : null);
  const sheets = [{
    name: 'TongTG',
    xml: renderSheet(t.summary, {
      ...base(h), title, rowCount: lines.length, uniformRows: true,
      rowName: (i) => lines[i]?.x.name ?? null,
      rowLabel: (i) => (lines[i] ? subjectLabel(lines[i].code) : null),
      value: (i, k) => (lines[i] ? val(lines[i].x, lines[i].code, k) : null),
    }),
  }];
  list.forEach((x, idx) => {
    const codes = codesOf(x);
    sheets.push({
      name: String(idx + 1),
      xml: renderSheet(t.teacher, {
        ...base(h), title, rowCount: codes.length, uniformRows: true,
        rowName: (i) => (i === 0 ? x.name : null),
        rowLabel: (i) => (codes[i] ? subjectLabel(codes[i]) : null),
        value: (i, k) => (codes[i] ? val(x, codes[i], k) : null),
      }),
    });
  });
  await download(t, sheets, `BANG KE THUA GIO CAC MON ${h.month}.xlsx`);
}

/** TH3 – Bảng kê tiết dạy thừa giờ Tiếng Anh */
export async function exportTH3(h: ExcelHeader, list: Entry[]) {
  const t = (await loadTemplates()).th3;
  await perTeacherBook(t, 'TongTA', h, list, w => Number(w.english) || 0, `TH3. BANG KE DAY TIENG ANH ${h.month}.xlsx`);
}
