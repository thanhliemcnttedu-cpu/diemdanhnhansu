import * as XLSX from 'xlsx';
import type { SchoolBranch } from '../types';

/**
 * 📋 DANH SÁCH PHÂN CÔNG CHỦ NHIỆM (Excel) → gán lớp chủ nhiệm, phân hiệu, điểm trường khi tạo tài khoản.
 * Đọc đúng tệp nhà trường đang dùng (STT | Khối học | ID lớp | Tên lớp | Điểm trường | Sỹ số | Giáo viên chủ nhiệm),
 * nhận diện cột theo TÊN (không phụ thuộc thứ tự); cột "Phân hiệu" không bắt buộc.
 */
export interface HomeroomRow {
  row: number;          // số dòng trong Excel (để báo lỗi)
  grade: string;        // "1".."5"
  classId: string;      // ID lớp (CSDL ngành), có thể trống
  className: string;    // 1A1 (viết hoa)
  campusText: string;   // ô Điểm trường như trong tệp
  branchText: string;   // ô Phân hiệu (nếu có)
  size: number | null;  // Sỹ số
  teacherName: string;  // Giáo viên chủ nhiệm
}

export const HOMEROOM_TEMPLATE_HEADERS = ['STT', 'Khối học', 'ID lớp', 'Tên lớp', 'Điểm trường', 'Phân hiệu', 'Sỹ số', 'Giáo viên chủ nhiệm'];

/** So khớp không dấu, bỏ khoảng trắng thừa ("Hoà" = "Hòa", "Thuỷ" = "Thủy") */
export const looseKey = (t: string) =>
  String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
/** So khớp có dấu (chuẩn NFC + đưa dấu về chung một kiểu bằng cách so cả chuỗi đã tách dấu) */
export const strictKey = (t: string) => String(t || '').normalize('NFD').toLowerCase().replace(/\s+/g, ' ').trim();

const HEADER_KEYS: Record<keyof Omit<HomeroomRow, 'row'>, string[]> = {
  grade: ['khoi hoc', 'khoi'],
  classId: ['id lop', 'ma lop'],
  className: ['ten lop', 'lop'],
  campusText: ['diem truong'],
  branchText: ['phan hieu'],
  size: ['sy so', 'si so'],
  teacherName: ['giao vien chu nhiem', 'gvcn', 'giao vien'],
};

export function parseHomeroomSheet(buf: ArrayBuffer): { rows: HomeroomRow[]; errors: string[] } {
  const wb = XLSX.read(buf, { type: 'array' });
  const errors: string[] = [];
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    // Tìm dòng tiêu đề trong 10 dòng đầu: phải có "Tên lớp" và "Giáo viên chủ nhiệm"
    for (let h = 0; h < Math.min(10, grid.length); h++) {
      const heads = (grid[h] || []).map((c: any) => looseKey(String(c)));
      const col: Partial<Record<keyof typeof HEADER_KEYS, number>> = {};
      (Object.keys(HEADER_KEYS) as Array<keyof typeof HEADER_KEYS>).forEach(k => {
        // ưu tiên khớp đúng tên cột, sau đó mới khớp gần đúng
        let idx = heads.findIndex((x: string) => HEADER_KEYS[k].includes(x));
        if (idx < 0 && k !== 'className') idx = heads.findIndex((x: string) => HEADER_KEYS[k].some(key => x.startsWith(key)));
        if (idx >= 0) col[k] = idx;
      });
      if (col.className === undefined || col.teacherName === undefined) continue;
      const rows: HomeroomRow[] = [];
      for (let r = h + 1; r < grid.length; r++) {
        const line = grid[r] || [];
        const get = (k: keyof typeof HEADER_KEYS) => (col[k] === undefined ? '' : String(line[col[k]!] ?? '').trim());
        const className = get('className').toUpperCase().replace(/\s+/g, '');
        const teacherName = get('teacherName').replace(/\s+/g, ' ');
        if (!className && !teacherName) continue;
        if (!className) { errors.push(`Dòng ${r + 1}: thiếu Tên lớp.`); continue; }
        const gradeRaw = get('grade').replace(/\D/g, '') || (className.match(/^\d+/)?.[0] ?? '');
        const sizeNum = Number(get('size').replace(/\D/g, ''));
        rows.push({
          row: r + 1, grade: gradeRaw, classId: get('classId'), className,
          campusText: get('campusText').replace(/\s+/g, ' '), branchText: get('branchText').replace(/\s+/g, ' '),
          size: Number.isFinite(sizeNum) && sizeNum > 0 ? sizeNum : null, teacherName,
        });
      }
      return { rows, errors };
    }
  }
  return { rows: [], errors: ['Không thấy dòng tiêu đề có cột "Tên lớp" và "Giáo viên chủ nhiệm". Hãy dùng tệp mẫu.'] };
}

/** Tệp mẫu: đúng các cột nhà trường đang dùng + cột Phân hiệu (không bắt buộc) */
export function downloadHomeroomTemplate() {
  const sample = [
    HOMEROOM_TEMPLATE_HEADERS,
    [1, 1, '', '1A1', 'Điểm trường chính', '', 30, 'Nguyễn Thị A'],
    [2, 1, '', '1A2', 'Điểm trường chính', '', 28, 'Trần Thị B'],
    [3, 2, '', '2A1', 'Bản Mới', 'Phân hiệu 1', 25, 'Lê Văn C'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(sample);
  ws['!cols'] = [6, 10, 14, 10, 22, 18, 8, 28].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, 'Mau_phan_cong_chu_nhiem.xlsx');
}

export const MAIN_BRANCH_NAME = 'Trường chính';

/**
 * Xác định phân hiệu + điểm trường cho từng dòng, dựa vào danh mục phân hiệu đang có của trường.
 * - Có cột Phân hiệu → dùng luôn (điểm trường = ô Điểm trường, trừ khi trùng tên phân hiệu).
 * - Ô Điểm trường trùng tên 1 điểm trường đã khai báo → lấy phân hiệu chứa nó.
 * - Trùng tên 1 phân hiệu (VD "Phân hiệu 1") → chỉ gán phân hiệu.
 * - Chưa có trong danh mục: tên bắt đầu "Phân hiệu" → phân hiệu mới; còn lại → điểm trường mới thuộc "Trường chính"
 *   (Quản trị sắp xếp lại ở Mô hình lớp & HS nếu cần).
 * Trả về danh mục đã bổ sung (KHÔNG xóa gì của danh mục cũ) và cờ `changed` nếu cần lưu.
 */
export function resolvePlacements(rows: HomeroomRow[], catalog: SchoolBranch[]) {
  const branches: SchoolBranch[] = (catalog || []).map(b => ({ ...b, campuses: [...(b.campuses || [])] }));
  let changed = false;
  const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const findBranch = (name: string) => branches.find(b => looseKey(b.name) === looseKey(name));
  const ensureBranch = (name: string) => {
    let b = findBranch(name);
    if (!b) { b = { id: uid('branch'), name, campuses: [] }; branches.push(b); changed = true; }
    return b;
  };
  const ensureCampus = (b: SchoolBranch, name: string) => {
    if (!b.campuses.some(c => looseKey(c.name) === looseKey(name))) { b.campuses.push({ id: uid('campus'), name }); changed = true; }
  };
  const placements = rows.map(r => {
    const campusText = r.campusText;
    if (r.branchText) {
      const b = ensureBranch(findBranch(r.branchText)?.name || r.branchText);
      if (campusText && looseKey(campusText) !== looseKey(b.name)) { ensureCampus(b, campusText); return { branch: b.name, campus: b.campuses.find(c => looseKey(c.name) === looseKey(campusText))!.name }; }
      return { branch: b.name, campus: '' };
    }
    if (!campusText) return { branch: '', campus: '' };
    for (const b of branches) {
      const c = b.campuses.find(x => looseKey(x.name) === looseKey(campusText));
      if (c) return { branch: b.name, campus: c.name };
    }
    const asBranch = findBranch(campusText);
    if (asBranch) return { branch: asBranch.name, campus: '' };
    if (looseKey(campusText).startsWith('phan hieu')) { const b = ensureBranch(campusText); return { branch: b.name, campus: '' }; }
    const main = branches.length === 1 && !looseKey(branches[0].name).startsWith('phan hieu') ? branches[0] : ensureBranch(MAIN_BRANCH_NAME);
    ensureCampus(main, campusText);
    return { branch: main.name, campus: campusText };
  });
  return { placements, branches, changed };
}
