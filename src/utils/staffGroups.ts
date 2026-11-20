/**
 * Staff grouping used by the role filters (account creation + duty assignment).
 * Priority: the person's software account (if any) > the roster text (position / department).
 */
export type StaffGroup = 'homeroom' | 'subject' | 'manager' | 'staff';
export type StaffGroupFilter = StaffGroup | 'all';

export const STAFF_GROUPS: { id: StaffGroup; label: string }[] = [
  { id: 'homeroom', label: 'GV chủ nhiệm' },
  { id: 'subject', label: 'GV bộ môn' },
  { id: 'manager', label: 'Cán bộ quản lý' },
  { id: 'staff', label: 'Nhân viên' },
];

const norm = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const SUBJECT_HINTS = ['my thuat', 'am nhac', 'tin hoc', 'tieng anh', 'the duc', 'gdtc', 'giao duc the chat', 'cong nghe', 'ngoai ngu'];

interface UserLike { role?: string; nonTeaching?: boolean; isBgh?: boolean; isSchoolAdmin?: boolean }

export function staffGroupOf(
  s: { position?: string; dept?: string },
  user?: UserLike | null,
  hasHomeroomAssignment = false,
): StaffGroup {
  if (user) {
    if (user.role === 'bgh' || user.role === 'school_admin' || user.isBgh || user.isSchoolAdmin) return 'manager';
    if (user.nonTeaching) return 'staff';
    if (user.role === 'homeroom') return 'homeroom';
    if (user.role === 'subject') return 'subject';
  }
  const pos = norm(s.position || '');
  const dept = norm(s.dept || '');
  if (pos.includes('hieu truong') || pos.includes('can bo quan ly') || dept.includes('ban giam hieu')) return 'manager';
  if (!pos.includes('giao vien')) return 'staff';
  if (hasHomeroomAssignment) return 'homeroom';
  return SUBJECT_HINTS.some(h => dept.includes(h)) ? 'subject' : 'homeroom';
}
