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
/** Số liệu 1 tháng để xuất: tiêu đề tháng + danh sách giáo viên của mẫu đó */
export interface MonthPack<E extends Entry = Entry> { h: ExcelHeader; list: E[] }

const two = (n: number) => String(n).padStart(2, '0');
/** "12 giờ 45 phút, ngày 10 tháng 11 năm 2026" */
export const createdLabel = (d = new Date()) =>
  `${two(d.getHours())} giờ ${two(d.getMinutes())} phút, ngày ${two(d.getDate())} tháng ${two(d.getMonth() + 1)} năm ${d.getFullYear()}`;
/** 2 dòng thông tin ghi dưới mỗi biểu */
export const infoLines = (month: string, created: string) => [
  `File tổng hợp của tháng: ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`,
  `Ngày giờ tạo biểu: ${created}`,
];

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
  /** Các dòng thông tin ghi dưới bảng (tháng tổng hợp, ngày giờ tạo biểu) */
  footer?: string[];
  /** Kiểu ô của dòng thông tin (Times New Roman nghiêng, thêm vào styles.xml bởi withFooterStyle) */
  footerStyle?: number;
}

/** Thêm 1 kiểu chữ Times New Roman nghiêng (không viền) vào styles.xml của khuôn; trả về styles mới + chỉ số kiểu ô */
function withFooterStyle(styles: string): { styles: string; idx: number } {
  const fonts = /<fonts count="(\d+)"/.exec(styles);
  const xfs = /<cellXfs count="(\d+)"/.exec(styles);
  if (!fonts || !xfs) return { styles, idx: 0 };
  const fontId = Number(fonts[1]);
  const idx = Number(xfs[1]);
  const out = styles
    .replace(/<fonts count="\d+"([^>]*)>/, `<fonts count="${fontId + 1}"$1>`)
    .replace('</fonts>', '<font><i/><sz val="12"/><name val="Times New Roman"/><family val="1"/></font></fonts>')
    .replace(/<cellXfs count="\d+">/, `<cellXfs count="${idx + 1}">`)
    .replace('</cellXfs>', `<xf numFmtId="0" fontId="${fontId}" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>`);
  return { styles: out, idx };
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

  const footer = o.footer || [];
  footer.forEach((line, i) => {
    const r = totalR + 2 + i;
    out.push(`<row r="${r}">${cellXml(`A${r}`, o.footerStyle || 0, { text: line })}</row>`);
  });
  const lastRow = totalR + (footer.length ? footer.length + 1 : 0);
  const shift = (ref: string) => ref.replace(/([A-Z]+)(\d+)/g, (_m, col, row) => `${col}${Number(row) >= totalTpl.r ? Number(row) + delta : row}`);
  const merges = t.merges.map(shift);
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<dimension ref="A1:N${lastRow}"/><sheetViews>${t.sheetView}</sheetViews>${t.sheetFormatPr}${t.cols}`
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

type Sheet = { name: string; xml: string };
/** "TonghopKT" (1 tháng) hoặc "TonghopKT T11-2026" (nhiều tháng, mỗi tháng 1 trang) */
const sheetName = (summaryName: string, month: string, multi: boolean) =>
  (multi ? `${summaryName} T${Number(month.slice(5, 7))}-${month.slice(0, 4)}` : summaryName).slice(0, 31);
/** Tên tệp: "… 2026-11" hoặc "… 2026-09 den 2026-11" */
const fileSuffix = (packs: MonthPack<any>[]) =>
  (packs.length === 1 ? packs[0].h.month : `${packs[0].h.month} den ${packs[packs.length - 1].h.month}`);

/**
 * Ghép biểu: 1 tháng → trang tổng hợp + trang từng giáo viên (đúng như tệp TH của nhà trường);
 * nhiều tháng → mỗi tháng 1 trang tổng hợp (theo thứ tự tháng). Mỗi biểu ghi tháng tổng hợp + ngày giờ tạo.
 */
async function buildBook<E extends Entry>(book: TplBook, packs: MonthPack<E>[], created: string, fileName: string,
  summary: (p: MonthPack<E>, footer: string[], name: string) => Sheet,
  teachers: (p: MonthPack<E>, footer: string[]) => Sheet[]) {
  const multi = packs.length > 1;
  const sheets: Sheet[] = [];
  packs.forEach(p => {
    const footer = infoLines(p.h.month, created);
    sheets.push(summary(p, footer, ''));
    if (!multi) sheets.push(...teachers(p, footer));
  });
  await download({ ...book, styles: footerStyled(book).styles }, sheets, fileName);
}
const styledCache = new WeakMap<TplBook, { styles: string; idx: number }>();
const footerStyled = (book: TplBook) => {
  let v = styledCache.get(book);
  if (!v) { v = withFooterStyle(book.styles); styledCache.set(book, v); }
  return v;
};

/** TH1 – Bảng kê tiết dạy các lớp có HS khuyết tật */
export async function exportTH1(packs: MonthPack[], created = createdLabel()) {
  const t = (await loadTemplates()).th1;
  const multi = packs.length > 1;
  await buildBook(t, packs, created, `TH1. BANG KE DAY KHUYET TAT ${fileSuffix(packs)}.xlsx`,
    ({ h, list }, footer) => ({
      name: sheetName('TonghopKT', h.month, multi),
      xml: renderSheet(t.summary, {
        ...base(h), footer, footerStyle: footerStyled(t).idx,
        value: (_i, k, row) => (h.wks[k] ? list.reduce((a, x) => a + ktOf(weekOf(h, x.log, k) || undefined, codeOfRow(row)), 0) : null),
      }),
    }),
    ({ h, list }, footer) => list.map((x, idx) => ({
      name: String(idx + 1),
      xml: renderSheet(t.teacher, {
        ...base(h), headerText: { A4: x.name }, footer, footerStyle: footerStyled(t).idx,
        value: (_i, k, row) => (h.wks[k] ? ktOf(weekOf(h, x.log, k) || undefined, codeOfRow(row)) : null),
      }),
    })));
}

/** Bảng 1 dòng / giáo viên (TH2, TH3) + trang cá nhân "1", "2"… */
async function perTeacherBook(book: TplBook, summaryName: string, packs: MonthPack[], get: (w: WeekCounts) => number, fileName: string, created: string, title?: string) {
  const multi = packs.length > 1;
  const valOf = (h: ExcelHeader) => (x: Entry, k: number) => { const w = weekOf(h, x.log, k); return h.wks[k] ? (w ? get(w) : 0) : null; };
  await buildBook(book, packs, created, fileName,
    ({ h, list }, footer) => {
      const val = valOf(h);
      return {
        name: sheetName(summaryName, h.month, multi),
        xml: renderSheet(book.summary, {
          ...base(h), title, rowCount: list.length, uniformRows: true, footer, footerStyle: footerStyled(book).idx,
          rowName: (i) => list[i]?.name ?? null,
          value: (i, k) => (list[i] ? val(list[i], k) : null),
        }),
      };
    },
    ({ h, list }, footer) => {
      const val = valOf(h);
      return list.map((x, idx) => ({
        name: String(idx + 1),
        xml: renderSheet(book.teacher, {
          ...base(h), title, footer, footerStyle: footerStyled(book).idx,
          rowName: (i) => (i === 0 ? x.name : null),
          value: (i, k) => (i === 0 ? val(x, k) : null),
        }),
      }));
    });
}

/** TH2 – Bảng kê tiết dạy Giáo dục thể chất */
export async function exportTH2(packs: MonthPack[], created = createdLabel()) {
  const t = (await loadTemplates()).th2;
  await perTeacherBook(t, 'TonghopGDTC', packs, w => Number(w.pe) || 0, `TH2. BANG KE DAY GDTC ${fileSuffix(packs)}.xlsx`, created);
}

/** Bảng kê thừa giờ các môn khác (khuôn TH3): mỗi (giáo viên, môn) 1 dòng; trang "1", "2"… mỗi giáo viên */
export async function exportOvertime(packs: MonthPack<Entry & { subjects?: string[] }>[], created = createdLabel()) {
  const t = (await loadTemplates()).th3;
  const title = 'BẢNG KÊ TIẾT DẠY THỪA GIỜ CÁC MÔN';
  const multi = packs.length > 1;
  const codesOf = (x: Entry & { subjects?: string[] }) => {
    const used = new Set<string>(x.subjects || []);
    Object.values(x.log?.weeks || {}).forEach(w => Object.keys(w?.ot || {}).forEach(c => used.add(c)));
    return OVERTIME_SUBJECTS.map(s => s.code).filter(c => used.has(c));
  };
  const valOf = (h: ExcelHeader) => (x: Entry, code: string, k: number) => (h.wks[k] ? otOf(weekOf(h, x.log, k) || undefined, code) : null);
  await buildBook(t, packs, created, `BANG KE THUA GIO CAC MON ${fileSuffix(packs)}.xlsx`,
    ({ h, list }, footer) => {
      const lines = list.flatMap(x => codesOf(x).map(code => ({ x, code })));
      const val = valOf(h);
      return {
        name: sheetName('TongTG', h.month, multi),
        xml: renderSheet(t.summary, {
          ...base(h), title, rowCount: lines.length, uniformRows: true, footer, footerStyle: footerStyled(t).idx,
          rowName: (i) => lines[i]?.x.name ?? null,
          rowLabel: (i) => (lines[i] ? subjectLabel(lines[i].code) : null),
          value: (i, k) => (lines[i] ? val(lines[i].x, lines[i].code, k) : null),
        }),
      };
    },
    ({ h, list }, footer) => {
      const val = valOf(h);
      return list.map((x, idx) => {
        const codes = codesOf(x);
        return {
          name: String(idx + 1),
          xml: renderSheet(t.teacher, {
            ...base(h), title, rowCount: codes.length, uniformRows: true, footer, footerStyle: footerStyled(t).idx,
            rowName: (i) => (i === 0 ? x.name : null),
            rowLabel: (i) => (codes[i] ? subjectLabel(codes[i]) : null),
            value: (i, k) => (codes[i] ? val(x, codes[i], k) : null),
          }),
        };
      });
    });
}

/** TH3 – Bảng kê tiết dạy thừa giờ Tiếng Anh */
export async function exportTH3(packs: MonthPack[], created = createdLabel()) {
  const t = (await loadTemplates()).th3;
  await perTeacherBook(t, 'TongTA', packs, w => Number(w.english) || 0, `TH3. BANG KE DAY TIENG ANH ${fileSuffix(packs)}.xlsx`, created);
}
