import * as XLSX from 'xlsx';

/**
 * Utility to create scientifically formatted Excel worksheets with:
 * - Clean title & administrative header blocks
 * - Explicit column widths (!cols) so text is never truncated
 * - Proper numeric formats for counts and percentages
 * - Summary rows and clean styling
 */

export interface ExcelColumnDef {
  header: string;
  key: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  isNumber?: boolean;
}

export interface ReportMeta {
  schoolName?: string;
  className?: string;
  teacherName?: string;
  reportTitle: string;
  reportDate?: string;
  formulaNote?: string;
}

export function buildFormattedSheet(
  meta: ReportMeta,
  columns: ExcelColumnDef[],
  dataRows: Record<string, any>[],
  summaryRow?: Record<string, any>
): XLSX.WorkSheet {
  const aoa: any[][] = [];

  // Row 1: School Header
  const school = meta.schoolName || 'TRƯỜNG HỌC';
  aoa.push([school, '', '', '', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM']);
  aoa.push(['Lớp Học Hạnh Phúc - Hệ Sinh Thái Giáo Dục', '', '', '', 'Độc lập - Tự do - Hạnh phúc']);
  aoa.push([]); // Blank row

  // Row 4: Main Report Title (Centered in Excel)
  aoa.push(['', '', meta.reportTitle.toUpperCase()]);
  
  // Row 5: Metadata line (Class, Date, Teacher)
  const metaParts: string[] = [];
  if (meta.className) metaParts.push(`Lớp: ${meta.className}`);
  if (meta.reportDate) metaParts.push(`Ngày báo cáo: ${meta.reportDate}`);
  if (meta.teacherName) metaParts.push(`Giáo viên chủ nhiệm: ${meta.teacherName}`);
  aoa.push(['', '', metaParts.join('  |  ')]);

  if (meta.formulaNote) {
    aoa.push(['', '', `* ${meta.formulaNote}`]);
  }
  aoa.push([]); // Blank row before table

  // Table Headers
  const headerRow = columns.map(c => c.header);
  aoa.push(headerRow);

  // Data Rows
  dataRows.forEach((row, idx) => {
    const rowVals = columns.map(col => {
      if (col.key === 'stt' && row[col.key] === undefined) {
        return idx + 1;
      }
      const val = row[col.key];
      if (col.isNumber && val !== undefined && val !== null) {
        const num = Number(val);
        return isNaN(num) ? val : num;
      }
      return val ?? '';
    });
    aoa.push(rowVals);
  });

  // Optional Summary Row
  if (summaryRow) {
    const sumVals = columns.map(col => {
      const val = summaryRow[col.key];
      if (col.isNumber && val !== undefined && val !== null) {
        const num = Number(val);
        return isNaN(num) ? val : num;
      }
      return val ?? '';
    });
    aoa.push(sumVals);
  }

  // Footer Signatures
  aoa.push([]);
  aoa.push([]);
  const dateStr = meta.reportDate ? `Ngày ${meta.reportDate}` : 'Ngày......tháng......năm......';
  const lastColIdx = Math.max(columns.length - 1, 4);
  const sigRow1 = new Array(lastColIdx + 1).fill('');
  sigRow1[1] = 'NGƯỜI LẬP BÁO CÁO';
  sigRow1[Math.floor(lastColIdx / 2)] = 'GIÁO VIÊN CHỦ NHIỆM';
  sigRow1[lastColIdx] = 'HIỆU TRƯỞNG / BGH DUYỆT';

  const sigRow2 = new Array(lastColIdx + 1).fill('');
  sigRow2[1] = '(Ký và ghi rõ họ tên)';
  sigRow2[Math.floor(lastColIdx / 2)] = '(Ký và ghi rõ họ tên)';
  sigRow2[lastColIdx] = '(Ký, đóng dấu)';

  aoa.push(sigRow1);
  aoa.push(sigRow2);

  // Convert AOA to Sheet
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths definition
  ws['!cols'] = columns.map(col => ({
    wch: col.width || Math.max(col.header.length + 4, 12)
  }));

  // Merges for header titles
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }, // School name
    { s: { r: 0, c: 4 }, e: { r: 0, c: Math.max(lastColIdx, 5) } }, // National title
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
    { s: { r: 1, c: 4 }, e: { r: 1, c: Math.max(lastColIdx, 5) } },
    { s: { r: 3, c: 1 }, e: { r: 3, c: Math.max(lastColIdx - 1, 3) } }, // Report Title
    { s: { r: 4, c: 1 }, e: { r: 4, c: Math.max(lastColIdx - 1, 3) } }, // Meta info
  ];

  return ws;
}
