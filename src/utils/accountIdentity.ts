import { UserAccount } from '../types';

/**
 * 🏛️ BẢNG ÁNH XẠ ĐỊNH DANH TÀI KHOẢN CHUẨN TỪ QUẢN TRỊ NHÀ TRƯỜNG (ACCOUNT IDENTITY MAP)
 * Định danh tên hiển thị chính xác theo hồ sơ khởi tạo của Nhà trường & Hệ thống.
 */
export const ACCOUNT_IDENTITY_MAP: Record<string, {
  fullName: string;
  role: 'admin' | 'school_admin' | 'bgh' | 'guest_admin' | 'homeroom' | 'subject';
  schoolName: string;
  roleTitle: string;
}> = {
  // (Đã bỏ định danh cứng của các tài khoản thử nghiệm cũ —
  //  tên, vai trò, trường của tài khoản trường học lấy từ CSDL nhà trường.)
  // Tài khoản Quản trị Tối cao Hệ thống
  'adminquantri': {
    fullName: 'Quản trị viên Hệ thống Cấp cao',
    role: 'admin',
    schoolName: 'Hệ thống Quản trị Lớp học Hạnh phúc',
    roleTitle: 'Quản trị Tối cao'
  },
  // (Chỉ còn 1 tài khoản hệ thống duy nhất: adminquantri)
};

/**
 * 🌟 SINGLE SOURCE OF TRUTH: Lấy tên hiển thị định danh chuẩn xác 100% của tài khoản
 * Ưu tiên:
 * 1. Bảng ánh xạ định danh khởi tạo (ACCOUNT_IDENTITY_MAP)
 * 2. Khớp từ cơ sở dữ liệu tài khoản quản trị nhà trường (allUsers)
 * 3. Thuộc tính fullName của user hiện tại
 * 4. Fallback tự động nhận diện theo vai trò và trường học
 */
export function getOfficialDisplayName(
  user: {
    username?: string;
    fullName?: string;
    schoolName?: string;
    role?: string;
    isBgh?: boolean;
    isSchoolAdmin?: boolean;
    isGuestAdmin?: boolean;
    assignedClassName?: string;
    subjectName?: string;
  } | null | undefined,
  allUsers?: Array<{ username: string; fullName: string; schoolName?: string; role?: string }>
): string {
  if (!user || !user.username) return 'Khách';
  const cleanU = user.username.trim().toLowerCase();

  // 1. Kiểm tra bảng ánh xạ định danh tài khoản chuẩn
  if (ACCOUNT_IDENTITY_MAP[cleanU]?.fullName) {
    return ACCOUNT_IDENTITY_MAP[cleanU].fullName;
  }

  // 2. Tra cứu từ cơ sở dữ liệu người dùng (allUsers) do quản trị nhà trường khởi tạo/import
  if (Array.isArray(allUsers) && allUsers.length > 0) {
    const matched = allUsers.find(u => u.username.toLowerCase() === cleanU);
    if (matched && matched.fullName && matched.fullName.trim()) {
      return matched.fullName.trim();
    }
  }

  // 3. Sử dụng fullName hiện tại của người dùng nếu có và không rỗng
  if (user.fullName && user.fullName.trim()) {
    const fn = user.fullName.trim();
    // Bỏ qua các placeholder chung chung nếu có trường học cụ thể
    if (fn !== 'Giáo viên' && fn !== 'Quản trị viên') {
      return fn;
    }
  }

  // 4. Fallback động nhận diện theo vai trò quản trị nhà trường
  if (user.role === 'school_admin' || user.isSchoolAdmin) {
    const sName = user.schoolName?.trim() || 'TRƯỜNG HỌC';
    return `Quản trị ${sName.toUpperCase().replace(/^TRƯỜNG\s+/i, '')}`;
  }

  if (user.role === 'bgh' || user.isBgh) {
    const sName = user.schoolName?.trim() || 'TRƯỜNG HỌC';
    return `Ban Giám Hiệu ${sName.toUpperCase().replace(/^TRƯỜNG\s+/i, '')}`;
  }

  if (user.role === 'admin') {
    return 'Quản trị viên Hệ thống Cấp cao';
  }

  if (user.role === 'homeroom') {
    return user.assignedClassName ? `GVCN Lớp ${user.assignedClassName}` : 'Giáo viên chủ nhiệm';
  }

  if (user.role === 'subject') {
    return user.subjectName ? `GVBM Môn ${user.subjectName}` : 'Giáo viên bộ môn';
  }

  return user.username;
}

/**
 * 🏷️ Lấy chức danh / vai trò định danh chuẩn hiển thị trên Header & Thẻ người dùng
 */
export function getOfficialRoleTitle(
  user: {
    username?: string;
    role?: string;
    isBgh?: boolean;
    isSchoolAdmin?: boolean;
    isGuestAdmin?: boolean;
    assignedClassName?: string;
    subjectName?: string;
    schoolName?: string;
  } | null | undefined
): string {
  if (!user) return 'Chưa đăng nhập';
  const cleanU = (user.username || '').trim().toLowerCase();

  if (ACCOUNT_IDENTITY_MAP[cleanU]?.roleTitle) {
    return ACCOUNT_IDENTITY_MAP[cleanU].roleTitle;
  }

  if (user.role === 'admin') return 'Tài khoản quản trị Cao nhất';
  if (user.role === 'bgh' || user.isBgh) return 'Ban Giám Hiệu';
  if (user.role === 'school_admin' || user.isSchoolAdmin) return 'Quản trị Nhà trường';
  if (user.role === 'guest_admin' || user.isGuestAdmin) return 'Quản trị GV Cá nhân';
  if (user.role === 'homeroom') {
    return user.assignedClassName ? `GV Chủ nhiệm (${user.assignedClassName})` : 'GV Chủ nhiệm';
  }
  if (user.role === 'subject') {
    return user.subjectName ? `GV Bộ môn (${user.subjectName})` : 'GV Bộ môn';
  }

  return 'Giáo viên';
}

/**
 * 🛡️ Kiểm tra tài khoản có thuộc 3 nhóm quản lý/quản trị bị giới hạn quyền can thiệp nghiệp vụ lớp học hay không:
 * 1. Quản trị Nhà trường (school_admin / isSchoolAdmin)
 * 2. Ban Giám Hiệu (bgh / isBgh)
 * 3. Quản trị Tối cao / adminquantri (adminquantri / admin)
 * 
 * Theo quy định:
 * - Không có quyền gán/cấu hình cán bộ lớp cho học sinh.
 * - Không có quyền thay đổi ảnh đại diện (avatar) của học sinh.
 * - Trong danh mục lớp học: Không có quyền cấu hình ảnh avatar của lớp, không có quyền Slogan / Khẩu hiệu, không có quyền Ban Đại Diện Cha Mẹ Học Sinh.
 */
export function isRestrictedAdminOrBgh(user: {
  username?: string;
  role?: string;
  isBgh?: boolean;
  isSchoolAdmin?: boolean;
} | null | undefined): boolean {
  if (!user) return false;
  const cleanU = (user.username || '').trim().toLowerCase();
  return Boolean(
    cleanU === 'adminquantri' ||
    cleanU === 'admin' ||
    user.role === 'admin' ||
    user.role === 'school_admin' ||
    user.isSchoolAdmin ||
    user.role === 'bgh' ||
    user.isBgh
  );
}
