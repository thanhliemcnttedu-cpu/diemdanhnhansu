export type Gender = 'Nam' | 'Nữ';

export type ClassOfficerRoleId = 
  | 'none'
  | 'monitor'           // LỚP TRƯỞNG
  | 'academic_deputy'   // LỚP PHÓ HỌC TẬP
  | 'activity_deputy'   // LỚP PHONG TRÀO
  | 'team_leader_1'     // TỔ TRƯỞNG TỔ 1
  | 'team_leader_2'     // TỔ TRƯỞNG TỔ 2
  | 'team_leader_3'     // TỔ TRƯỞNG TỔ 3
  | 'team_leader_4'     // TỔ TRƯỞNG TỔ 4
  | 'team_vice_1'       // TỔ PHÓ TỔ 1
  | 'team_vice_2'       // TỔ PHÓ TỔ 2
  | 'team_vice_3'       // TỔ PHÓ TỔ 3
  | 'team_vice_4'       // TỔ PHÓ TỔ 4
  | 'custom'
  | string;

export interface ClassOfficerRoleDef {
  id: ClassOfficerRoleId;
  label: string;
  icon: string;
  color: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

export const CLASS_OFFICER_ROLES: ClassOfficerRoleDef[] = [
  { id: 'monitor', label: 'LỚP TRƯỞNG', icon: '👑', color: 'from-amber-500 to-yellow-600', badgeBg: 'bg-amber-100', badgeText: 'text-amber-900', badgeBorder: 'border-amber-300' },
  { id: 'academic_deputy', label: 'LỚP PHÓ HỌC TẬP', icon: '📘', color: 'from-blue-500 to-indigo-600', badgeBg: 'bg-blue-100', badgeText: 'text-blue-900', badgeBorder: 'border-blue-300' },
  { id: 'activity_deputy', label: 'LỚP PHONG TRÀO', icon: '🚩', color: 'from-orange-500 to-red-600', badgeBg: 'bg-orange-100', badgeText: 'text-orange-900', badgeBorder: 'border-orange-300' },
  { id: 'team_leader_1', label: 'TỔ TRƯỞNG TỔ 1', icon: '🥇', color: 'from-emerald-500 to-teal-600', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-900', badgeBorder: 'border-emerald-300' },
  { id: 'team_leader_2', label: 'TỔ TRƯỞNG TỔ 2', icon: '🥇', color: 'from-sky-500 to-blue-600', badgeBg: 'bg-sky-100', badgeText: 'text-sky-900', badgeBorder: 'border-sky-300' },
  { id: 'team_leader_3', label: 'TỔ TRƯỞNG TỔ 3', icon: '🥇', color: 'from-violet-500 to-purple-600', badgeBg: 'bg-violet-100', badgeText: 'text-violet-900', badgeBorder: 'border-violet-300' },
  { id: 'team_leader_4', label: 'TỔ TRƯỞNG TỔ 4', icon: '🥇', color: 'from-rose-500 to-pink-600', badgeBg: 'bg-rose-100', badgeText: 'text-rose-900', badgeBorder: 'border-rose-300' },
  { id: 'team_vice_1', label: 'TỔ PHÓ TỔ 1', icon: '🥈', color: 'from-teal-500 to-emerald-600', badgeBg: 'bg-teal-50', badgeText: 'text-teal-800', badgeBorder: 'border-teal-200' },
  { id: 'team_vice_2', label: 'TỔ PHÓ TỔ 2', icon: '🥈', color: 'from-cyan-500 to-sky-600', badgeBg: 'bg-cyan-50', badgeText: 'text-cyan-800', badgeBorder: 'border-cyan-200' },
  { id: 'team_vice_3', label: 'TỔ PHÓ TỔ 3', icon: '🥈', color: 'from-fuchsia-500 to-purple-600', badgeBg: 'bg-fuchsia-50', badgeText: 'text-fuchsia-800', badgeBorder: 'border-fuchsia-200' },
  { id: 'team_vice_4', label: 'TỔ PHÓ TỔ 4', icon: '🥈', color: 'from-pink-500 to-rose-600', badgeBg: 'bg-pink-50', badgeText: 'text-pink-800', badgeBorder: 'border-pink-200' },
];

export function getStudentRoleInfo(role?: string): ClassOfficerRoleDef | null {
  if (!role || !role.trim()) return null;
  const clean = role.trim().toLowerCase();
  const match = CLASS_OFFICER_ROLES.find(
    r => r.label.toLowerCase() === clean || r.id === clean
  );
  if (match) return match;
  if (clean.includes('lớp trưởng')) {
    return CLASS_OFFICER_ROLES[0];
  }
  if (clean.includes('học tập')) {
    return CLASS_OFFICER_ROLES[1];
  }
  if (clean.includes('phong trào')) {
    return CLASS_OFFICER_ROLES[2];
  }
  if (clean.includes('tổ trưởng')) {
    if (clean.includes('1')) return CLASS_OFFICER_ROLES[3];
    if (clean.includes('2')) return CLASS_OFFICER_ROLES[4];
    if (clean.includes('3')) return CLASS_OFFICER_ROLES[5];
    if (clean.includes('4')) return CLASS_OFFICER_ROLES[6];
    return CLASS_OFFICER_ROLES[3];
  }
  if (clean.includes('tổ phó')) {
    if (clean.includes('1')) return CLASS_OFFICER_ROLES[7];
    if (clean.includes('2')) return CLASS_OFFICER_ROLES[8];
    if (clean.includes('3')) return CLASS_OFFICER_ROLES[9];
    if (clean.includes('4')) return CLASS_OFFICER_ROLES[10];
    return CLASS_OFFICER_ROLES[7];
  }
  return { id: 'custom', label: role, icon: '⭐', color: 'from-indigo-500 to-purple-600', badgeBg: 'bg-indigo-50', badgeText: 'text-indigo-800', badgeBorder: 'border-indigo-200' };
}

// Lấy danh sách tối đa 3 chức vụ của học sinh
export function getStudentRolesList(student: { role?: string; roles?: string[] } | null | undefined): string[] {
  if (!student) return [];
  if (Array.isArray(student.roles) && student.roles.length > 0) {
    return student.roles.filter(Boolean).slice(0, 3);
  }
  if (student.role && student.role.trim()) {
    const parts = student.role.split(/[•,;\n]+/).map(s => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts.slice(0, 3) : [student.role.trim()];
  }
  return [];
}

export interface Student {
  id: string;
  classId: string;
  stt: number;
  name: string;
  birthDate?: string; // Ngày tháng năm sinh (dd/mm/yyyy hoặc yyyy-mm-dd)
  gender: Gender;
  avatar: string;
  originalAvatar?: string; // Ảnh gốc chưa crop từ máy tính để luôn thu phóng chỉnh sửa nguyên vẹn
  avatarScale: number; // 0.8 - 2.5
  avatarPosition: { x: number; y: number };
  flipX?: boolean; // Lật ngược chiều ngang (Horizontal Flip)
  filter?: string; // Bộ lọc hiệu ứng màu/làm đẹp ảnh đại diện
  points: number; // Tổng số xu tích lũy (không làm mất tổng xu hiện tại)
  subjectPoints?: Record<string, number>; // Điểm xu lưu theo từng môn học (User requirement)
  group?: string; // Tổ 1, Tổ 2, Tổ 3, Tổ 4
  role?: string;  // Chức vụ cán bộ lớp (chuỗi kết hợp ví dụ 'LỚP TRƯỞNG • TỔ TRƯỞNG TỔ 1')
  roles?: string[]; // Mảng tối đa 3 chức vụ trọng trách đảm nhiệm đồng thời (User Request)
}

// Question types for Random Picker & Classroom Quiz Challenges
export type QuestionType = 
  | 'multiple_choice'   // Trắc nghiệm 1 đáp án đúng (tùy biến số lượng đáp án 2 - 8)
  | 'multi_select'      // Trắc nghiệm nhiều đáp án đúng
  | 'true_false'        // Đúng / Sai
  | 'fill_blank'        // Kéo thả / Điền vào chỗ trống
  | 'sequence_order'    // Sắp xếp thứ tự các bước
  | 'matching'          // Nối cột A với cột B
  | 'oral';             // Tự luận / Trả lời bằng lời

export interface QuestionMatchingPair {
  left: string;   // Cột A (1, 2, 3...)
  right: string;  // Cột B tương ứng (A, B, C...)
  leftImage?: string;
  rightImage?: string;
}

export interface QuestionItem {
  id: string;
  type: QuestionType;
  questionText: string;
  image?: string; // Tùy chọn ảnh minh họa câu hỏi
  answerImage?: string; // Tùy chọn ảnh minh họa câu trả lời / đáp án giáo viên
  
  // Trắc nghiệm 1 đáp án & Nhiều đáp án
  options?: string[]; // Mảng lựa chọn linh hoạt (2, 3, 4, 5, 6...)
  optionImages?: string[]; // Ảnh minh họa cho từng đáp án
  correctOptionIndex?: number; // Dành cho trắc nghiệm đơn hoặc True/False (0 = A/Đúng, 1 = B/Sai)
  correctOptionIndices?: number[]; // Dành cho trắc nghiệm nhiều đáp án đúng [0, 2]
  
  // Dạng Đúng / Sai
  isTrue?: boolean; // true = Đúng, false = Sai
  
  // Dạng Điền chỗ trống / Kéo thả
  blankAnswers?: string[]; // Các từ cần điền vào các vị trí trống
  distractorWords?: string[]; // Từ nhiễu để kéo thả
  
  // Dạng Sắp xếp thứ tự các bước
  sequenceItems?: string[]; // Các bước theo đúng thứ tự chuẩn
  
  // Dạng Nối cột A với cột B
  matchingPairs?: QuestionMatchingPair[]; // Các cặp nối A - B
  
  teacherAnswerKey?: string; // Đáp án/hướng dẫn của giáo viên hoặc giải thích
  pointsReward?: number; // Số xu thưởng khi trả lời đúng (mặc định 2 xu)
  subject?: string; // Môn học (Toán, Tiếng Việt, Tiếng Anh, Đố vui, v.v.)
}

export interface QuestionBank {
  id: string;
  title: string;
  description?: string;
  subject?: string;
  questions: QuestionItem[];
  createdAt: number;
}

export interface ParentCommitteeMember {
  name: string;
  phone: string;
  roleTitle?: string;
  note?: string;
}

export interface ParentCommittee {
  head: ParentCommitteeMember;    // Trưởng ban phụ huynh
  deputy: ParentCommitteeMember;  // Phó ban phụ huynh
  member1: ParentCommitteeMember; // Ủy viên 1
  member2: ParentCommitteeMember; // Ủy viên 2
}

export interface Classroom {
  id: string;
  name: string;
  grade: string; // Khối 1 -> Khối 5, Khối 6...
  color: string; // Hex or tailwind badge
  academicYear: string; // e.g. "2026 - 2027"
  teacherName?: string; // Tên giáo viên chủ nhiệm / bộ môn
  teacherUsername?: string; // Tài khoản giáo viên phụ trách (VD: gv_lop1a1)
  teacherRole?: TeacherRole | 'GVCN' | 'GVBM'; // 'homeroom' | 'subject' | 'GVCN' | 'GVBM'
  isHomeroom?: boolean; // Cờ nhận diện phân quyền: true = Lớp chủ nhiệm (GVCN), false = Lớp bộ môn (GVBM)
  avatar?: string; // Ảnh đại diện của lớp học
  originalAvatar?: string; // Ảnh gốc độ nét cao ban đầu để căn chỉnh lại
  avatarScale?: number; // Tỉ lệ zoom ảnh đại diện (0.5 - 3)
  avatarPosition?: { x: number; y: number }; // Vị trí căn chỉnh ảnh (x, y)
  slogan?: string; // Slogan lớp học
  branch?: string | null; // Phân hiệu (ví dụ: 'Phân hiệu 1', 'Cơ sở A'...) hoặc null nếu chưa cấu hình
  campus?: string | null; // Điểm trường (ví dụ: 'Điểm trường Trung tâm', 'Điểm phụ'...) hoặc null nếu chưa cấu hình
  schoolName?: string; // Tên trường học sở thuộc (ví dụ: 'TRƯỜNG HỌC HẠNH PHÚC'...)
  parentCommittee?: ParentCommittee; // Ban đại diện phụ huynh học sinh
}

export interface SchoolCampus {
  id: string;
  name: string; // Tên điểm trường (VD: "Điểm Trung tâm", "Điểm phụ"...)
  address?: string; // Địa chỉ nếu có
}

export interface SchoolBranch {
  id: string;
  name: string; // Tên phân hiệu (VD: "Điểm chính", "Phân hiệu 1", "Phân hiệu Bản Cát"...)
  campuses: SchoolCampus[]; // Danh sách các điểm trường trực thuộc phân hiệu này
}

export interface SchoolBranchConfig {
  schoolName: string;
  branches: SchoolBranch[];
  updatedAt: number;
}

export interface Subject {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  enabled?: boolean; // Áp dụng cho lớp / giáo viên hiện tại
  isDefault?: boolean; // Đánh dấu 3 môn mặc định hệ thống: GHI CHUNG / NỀ NẾP, TOÁN, TIẾNG VIỆT
}

export interface PointCriterion {
  id: string;
  title: string;
  points: number; // e.g. +3, +4, -2
  type: 'positive' | 'negative';
  category?: string;
}

export interface PointTransaction {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  amount: number;
  reason: string;
  subjectName?: string;
  timestamp: number;
}

export interface Reward {
  id: string;
  classId?: string;
  name: string;
  cost: number;
  stock: number;
  image: string;
  description?: string;
}

export interface RewardRedemption {
  id: string;
  studentId: string;
  studentName: string;
  rewardId: string;
  rewardName: string;
  cost: number;
  timestamp: number;
  status: 'Đã nhận' | 'Chờ trao';
}

export type AttendanceStatus = 'present' | 'late' | 'excused' | 'unexcused' | 'sick' | 'other';

export interface DailyAttendance {
  date: string; // YYYY-MM-DD
  classId: string;
  records: Record<string, AttendanceStatus>; // studentId -> status
  notes?: string;
}

export type BoardingStatus = 'eating' | 'not_eating' | 'absent_meal'; // 'eating' (Ăn bán trú), 'not_eating' (Không ăn/Về nhà)

export interface DailyBoardingMeal {
  date: string; // YYYY-MM-DD
  classId: string;
  records: Record<string, BoardingStatus>; // studentId -> status (ăn bán trú / không ăn / báo cắt suất)
  notes?: string;
}

export interface DeskPosition {
  row: number;
  col: number; // aisle/dãy: 0, 1, 2, 3, 4
  subCol: number; // 0 = ghế trái, 1 = ghế phải của bàn đôi
}

export type SeatingColumnsCount = 2 | 3 | 4 | 5 | 6;
export type TeacherDeskPosition = 'left' | 'center' | 'right';
export type DoorPosition = 'left' | 'right';
export type BlackboardPosition = 'center' | 'left' | 'right';
export type DeskNumberingOrder = 'vertical' | 'horizontal'; // 'THEO DỌC' | 'THEO NGANG'

export interface SeatingDeskAssignment {
  seatKey: string; // e.g. "col-row-sub"
  studentId: string;
}

export interface TimetableConfig {
  morningPeriods: number; // default 5
  afternoonPeriods: number; // default 4
  hasSaturday: boolean;
}

export type TeacherRole = 'homeroom' | 'subject'; // 'homeroom' = Giáo viên chủ nhiệm, 'subject' = Giáo viên bộ môn

export interface SubjectTimetableSlot {
  id: string;
  day: number; // 2 -> 7 (Thứ 2 - Thứ 7)
  period: number; // 1 -> 5
  session: 'morning' | 'afternoon';
  classId: string; // ID lớp học (ví dụ: 'class-4a1')
  className: string; // Tên lớp học (ví dụ: '4A1')
  subject: string; // Tên môn (ví dụ: 'Tin học')
  room?: string; // Phòng học (ví dụ: 'Phòng máy 1')
  note?: string; // Nội dung bài dạy hoặc ghi chú
  scope?: 'semester' | 'period'; // 'semester' = Dùng chung cả học kì, 'period' = Theo thời điểm/tuần
  periodName?: string; // Tên giai đoạn áp dụng
}

export interface SubjectTeacherConfig {
  subjectName: string; // Môn giảng dạy chính (ví dụ: 'Tin học')
  subject2?: string; // Môn dạy 2 (ví dụ: 'Công nghệ')
  subject3?: string; // Môn dạy 3 (tùy chọn)
  subject4?: string; // Môn dạy 4 (tùy chọn)
  taughtSubjects?: string[]; // Danh sách các môn giáo viên bộ môn giảng dạy (có thể dạy nhiều môn)
  roomDefault: string; // Phòng học mặc định
  scheduleScope: 'semester' | 'period'; // 'semester' (Dùng chung cả học kì) | 'period' (Theo thời điểm)
  periodName: string; // Ví dụ: 'Học kì I (Áp dụng Tuần 1 – Tuần 18)'
  morningPeriods: number;
  afternoonPeriods: number;
  hasSaturday: boolean;
  semester?: string; // Ví dụ: 'I' hoặc 'II'
  effectiveStartDate?: string; // Ví dụ: '05/9/2026'
  teacherDisplayName?: string; // Ví dụ: 'Nguyễn Thanh Liêm'
}

export interface TimetableSlot {
  day: number; // 2 -> 7 (Thứ 2 - Thứ 7)
  period: number; // 1 -> 5
  session: 'morning' | 'afternoon';
  subject: string;
  room?: string;
  note?: string;
  teacher?: string;
  classId?: string; // Cố định theo từng lớp
}

export interface QuickLink {
  id: string;
  title: string;
  url: string;
  category: string;
  description?: string;
  isPinned?: boolean;
  iconUrl?: string; // URL or base64 image for link logo/icon
}

export interface TeacherProfile {
  name: string;
  role: string;
  birthDate?: string; // Ngày tháng năm sinh của giáo viên (dd/mm/yyyy hoặc yyyy-mm-dd)
  teachingSubject: string;
  schoolName: string;
  avatar: string;
  originalAvatar?: string; // Ảnh gốc chưa crop từ máy tính để luôn thu phóng chỉnh sửa nguyên vẹn
  avatarScale?: number;
  avatarPosition?: { x: number; y: number };
  phone?: string;
  zalo?: string;
  facebook?: string; // Địa chỉ liên kết mạng xã hội Facebook
  socialLink?: string;
  academicYear?: string;
}

export interface AiQuizQuestion {
  id: string;
  subject: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface AiStudentRemark {
  studentId: string;
  studentName: string;
  summary: string;
  strengths: string[];
  recommendations: string[];
  parentNote: string;
}

export interface InitSubjectClassItem {
  name: string;
  grade?: string;
  studentCount: number;
  room?: string;
  teacherName?: string;
  slogan?: string;
}

export type UserRole = 'admin' | 'homeroom' | 'subject' | 'bgh' | 'school_admin' | 'guest_admin';

// 5 Vai trò đăng nhập theo yêu cầu người dùng
export type LoginRoleScope = 
  | 'personal_teacher'  // a. Vai trò Cá Nhân
  | 'school_teacher'    // b. Vai trò Giáo viên thuộc Nhà trường
  | 'school_admin'      // c. Vai trò Quản trị Nhà Trường
  | 'guest_admin'       // d. Vai Trò Quản trị Tài khoản Cá Nhân
  | 'admin';            // e. Vai Trò Admin

export interface SchoolEntity {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  adminUsername?: string;
  adminPassword?: string;
  adminFullName?: string;
  createdAt?: number;
}

export interface UserAccount {
  id: string;
  username: string;
  password?: string;
  mustChangePassword?: boolean; // Bắt buộc đổi mật khẩu ở lần đăng nhập đầu (tài khoản do Quản trị cấp)
  disabled?: boolean;
  fullName: string;
  role: UserRole;
  isDemo?: boolean;
  isBgh?: boolean;
  isSchoolAdmin?: boolean;
  isGuestAdmin?: boolean;
  tenantType?: 'school' | 'guest' | 'demo'; // 'school': Tổ chức Nhà trường, 'guest': Giáo viên vãng lai, 'demo': Thử nghiệm
  schoolId?: string;
  maxStudentsAllowed?: number; // Giới hạn số học sinh (10 cho tài khoản demo)
  email?: string;
  phone?: string;
  avatar?: string;
  assignedClassName?: string;
  subjectName?: string;
  schoolName?: string;
  createdAt: number;
  lastLoginAt?: number;
  status?: 'active' | 'locked';
  /** Mã GV trong danh sách nhân sự chấm công (Apps Script 1.1.4): tài khoản dùng chung — đăng nhập bằng CCCD / mã GV + mật khẩu điểm danh */
  staffCode?: string;
}

export interface RegistrationRequest {
  id: string;
  fullName: string;
  roleOrTitle: string; // Chức vụ
  organization: string; // Đơn vị công tác
  zaloPhone: string; // Số điện thoại dùng ZALO
  registrationType: 'school' | 'personal'; // 'school' (1 triệu đồng) hoặc 'personal' (50 nghìn đồng)
  amount: number;
  transferContent: string;
  notes?: string;
  createdAt: number;
  status?: 'pending' | 'completed';
}

export interface UserClassroomData {
  classes: Classroom[];
  activeClassId: string;
  students: Student[];
  subjects: Subject[];
  criteria: PointCriterion[];
  transactions: PointTransaction[];
  rewards: Reward[];
  redemptions: RewardRedemption[];
  seatingColumns: SeatingColumnsCount;
  deskCountsPerColumn: number[];
  deskNumberingOrder: DeskNumberingOrder;
  teacherDeskPos: TeacherDeskPosition;
  doorPos: DoorPosition;
  blackboardPos: BlackboardPosition;
  seatingAssignments: Record<string, string>;
  attendanceRecords: DailyAttendance[];
  boardingRecords: DailyBoardingMeal[];
  timetable: TimetableSlot[];
  timetableConfig: TimetableConfig;
  teacherRole: TeacherRole;
  subjectTeacherConfig: SubjectTeacherConfig;
  subjectTimetable: SubjectTimetableSlot[];
  quickLinks: QuickLink[];
  teacherProfile: TeacherProfile;
  quizBank?: QuestionItem[];
  infographicConfig?: any;
  updatedAt?: number;
}

