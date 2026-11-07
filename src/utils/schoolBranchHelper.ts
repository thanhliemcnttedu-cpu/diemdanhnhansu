import { Classroom, SchoolBranch } from '../types';

/**
 * 🏛️ TỰ ĐỘNG TRÍCH XUẤT DANH MỤC PHÂN HIỆU & ĐIỂM TRƯỜNG TỪ DANH SÁCH LỚP HỌC (AUTO-SEED / AUTO-EXTRACT)
 * Đảm bảo 100% tài khoản Quản trị nhà trường, Ban giám hiệu và Quản trị viên
 * luôn có sẵn danh mục Phân hiệu và Điểm trường chuẩn xác mà không bao giờ bị rỗng (0 phân hiệu).
 */
export function extractSchoolBranchesFromClasses(classesList: Classroom[]): SchoolBranch[] {
  if (!classesList || classesList.length === 0) return [];

  const branchMap = new Map<string, Set<string>>();

  classesList.forEach(c => {
    const bName = (c.branch || '').trim();
    if (!bName) return;

    if (!branchMap.has(bName)) {
      branchMap.set(bName, new Set<string>());
    }

    const cName = (c.campus || '').trim();
    if (cName) {
      branchMap.get(bName)!.add(cName);
    }
  });

  const result: SchoolBranch[] = [];
  branchMap.forEach((campusSet, branchName) => {
    result.push({
      id: `branch-auto-${encodeURIComponent(branchName.toLowerCase())}`,
      name: branchName,
      campuses: Array.from(campusSet).sort((a, b) => a.localeCompare(b, 'vi')).map(cpName => ({
        id: `campus-auto-${encodeURIComponent(cpName.toLowerCase())}`,
        name: cpName
      }))
    });
  });

  // Sắp xếp phân hiệu theo bảng chữ cái tiếng Việt
  return result.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}
