import { Classroom, Student, Subject, PointCriterion, Reward, TimetableSlot, QuickLink, TeacherProfile, SubjectTeacherConfig, SubjectTimetableSlot } from '../types';

// Thông tin TÁC GIẢ ỨNG DỤNG - Cố định không sửa trong cài đặt (Yêu cầu 6)
export const APP_AUTHOR_INFO = {
  name: 'NGUYỄN THANH LIÊM',
  schoolName: 'TRƯỜNG TIỂU HỌC SỐ 1 TÂN UYÊN',
  zalo: '0888.358.363',
  zaloUrl: 'https://zalo.me/0888358363',
  facebook: 'https://www.facebook.com/nguyenthanhliemautotech/'
};

export const SYSTEM_AVATARS = [
  // Cartoon Boys
  { id: 'av-boy-1', label: 'Nam Mũ', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=NamMu&backgroundColor=b6e3f4', gender: 'Nam' },
  { id: 'av-boy-2', label: 'Nam Đeo kính', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=NamKinh&backgroundColor=c0aede', gender: 'Nam' },
  { id: 'av-boy-3', label: 'Nam Tóc vàng', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=NamTocVang&backgroundColor=ffd5dc', gender: 'Nam' },
  { id: 'av-boy-4', label: 'Nam Phi công', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=NamPhiCong&backgroundColor=d1d4f9', gender: 'Nam' },
  { id: 'av-boy-5', label: 'Nam Siêu nhân', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=NamSieuNhan&backgroundColor=ffdfbf', gender: 'Nam' },
  // Cartoon Girls
  { id: 'av-girl-1', label: 'Nữ Nơ hồng', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=NuNoHong&backgroundColor=ffd5dc', gender: 'Nữ' },
  { id: 'av-girl-2', label: 'Nữ Tóc ngắn', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=NuTocNgan&backgroundColor=c0aede', gender: 'Nữ' },
  { id: 'av-girl-3', label: 'Nữ Đeo kính', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=NuDeoKinh&backgroundColor=b6e3f4', gender: 'Nữ' },
  { id: 'av-girl-4', label: 'Nữ Vương miện', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=NuVuongMien&backgroundColor=ffdfbf', gender: 'Nữ' },
  { id: 'av-girl-5', label: 'Nữ Họa sĩ', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=NuHoaSii&backgroundColor=d1d4f9', gender: 'Nữ' },
  // Mascots
  { id: 'av-pet-1', label: 'Thỏ Hồng', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=ThoHong&backgroundColor=ffd5dc', gender: 'Linh vật' },
  { id: 'av-pet-2', label: 'Gấu Trúc', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=GauTruc&backgroundColor=b6e3f4', gender: 'Linh vật' }
];

// Thông tin giáo viên mặc định trong cài đặt
export const DEFAULT_TEACHER: TeacherProfile = {
  name: 'Giáo viên',
  birthDate: '',
  role: 'GIÁO VIÊN CHỦ NHIỆM',
  teachingSubject: 'Giáo viên chủ nhiệm',
  schoolName: '',
  avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Teacher&backgroundColor=ffd5dc',
  phone: '',
  zalo: '',
  facebook: '',
  socialLink: '',
  academicYear: ''
};

// Thông tin hồ sơ chuẩn cho Tài khoản Quản trị Cao nhất (adminquantri)
export const ADMIN_QUANTRI_PROFILE: TeacherProfile = {
  name: 'Tài khoản quản trị Cao nhất',
  birthDate: '',
  role: 'TÀI KHOẢN QUẢN TRỊ CAO NHẤT',
  teachingSubject: 'Quản trị viên Hệ thống Cấp cao',
  schoolName: 'Hệ thống Quản trị Lớp học Hạnh phúc',
  avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=AdminQuanTriBoss&backgroundColor=d1d4f9',
  phone: '0888358363',
  zalo: '0888358363',
  facebook: 'https://www.facebook.com/nguyenthanhliemautotech/',
  socialLink: 'https://zalo.me/0888358363',
  academicYear: '2026–2027'
};

// Mặc định ban đầu
export const INITIAL_CLASSES: Classroom[] = [];

// 3 Môn mặc định theo yêu cầu hệ thống
export const DEFAULT_CORE_SUBJECTS: Subject[] = [
  { id: 'sub-general', name: 'GHI CHUNG / NỀ NẾP', icon: 'Star', color: '#F59E0B', enabled: true, isDefault: true },
  { id: 'sub-toan', name: 'TOÁN', icon: 'Calculator', color: '#3B82F6', enabled: false, isDefault: true },
  { id: 'sub-tiengviet', name: 'TIẾNG VIỆT', icon: 'BookOpen', color: '#EF4444', enabled: false, isDefault: true }
];

export const INITIAL_SUBJECTS: Subject[] = [
  // 🌟 Mặc định ban đầu trên tài khoản GVCN: Chỉ cấu hình nhận xu ở môn GHI CHUNG / NỀ NẾP, các môn còn lại ở chế độ chưa cấu hình (enabled: false)
  { id: 'sub-general', name: 'GHI CHUNG / NỀ NẾP', icon: 'Star', color: '#F59E0B', enabled: true, isDefault: true },
  { id: 'sub-toan', name: 'TOÁN', icon: 'Calculator', color: '#3B82F6', enabled: false, isDefault: true },
  { id: 'sub-tiengviet', name: 'TIẾNG VIỆT', icon: 'BookOpen', color: '#EF4444', enabled: false, isDefault: true },
  { id: 'sub-daoduc', name: 'ĐẠO ĐỨC', icon: 'Heart', color: '#E11D48', enabled: false, isDefault: true },
  { id: 'sub-tnxh', name: 'TN & XÃ HỘI', icon: 'Compass', color: '#10B981', enabled: false, isDefault: true },
  { id: 'sub-lichsu', name: 'LỊCH SỬ & ĐỊA LÝ', icon: 'Map', color: '#F97316', enabled: false, isDefault: true },
  { id: 'sub-khoahoc', name: 'KHOA HỌC', icon: 'Atom', color: '#06B6D4', enabled: false, isDefault: true },
  // Các môn học chuyên biệt / bộ môn (Giáo viên có thể tự do bật/tắt hoặc thêm mới theo nhu cầu)
  { id: 'sub-tienganh', name: 'TIẾNG ANH', icon: 'Globe', color: '#8B5CF6', enabled: false },
  { id: 'sub-tinhoc', name: 'TIN HỌC', icon: 'Monitor', color: '#6366F1', enabled: false },
  { id: 'sub-congnghe', name: 'CÔNG NGHỆ', icon: 'Cpu', color: '#14B8A6', enabled: false },
  { id: 'sub-mythuat', name: 'MĨ THUẬT', icon: 'Palette', color: '#EC4899', enabled: false },
  { id: 'sub-amnhac', name: 'ÂM NHẠC', icon: 'Music', color: '#A855F7', enabled: false },
  { id: 'sub-gdtc', name: 'GIÁO DỤC THỂ CHẤT', icon: 'Activity', color: '#3B82F6', enabled: false },
  { id: 'sub-trainghiem', name: 'HOẠT ĐỘNG TRẢI NGHIỆM', icon: 'Sparkles', color: '#F59E0B', enabled: false }
];

export const INITIAL_CRITERIA: PointCriterion[] = [
  { id: 'crit-1', title: 'Phát biểu tích cực', points: 3, type: 'positive', category: 'Học tập' },
  { id: 'crit-2', title: 'Hăng hái xây dựng bài', points: 1, type: 'positive', category: 'Học tập' },
  { id: 'crit-3', title: 'Làm bài tập đầy đủ, sạch đẹp', points: 2, type: 'positive', category: 'Học tập' },
  { id: 'crit-4', title: 'Đi học đúng giờ, nề nếp tốt', points: 2, type: 'positive', category: 'Kỷ luật' },
  { id: 'crit-5', title: 'Đạt điểm 9, 10 bài kiểm tra', points: 5, type: 'positive', category: 'Học tập' },
  { id: 'crit-6', title: 'Việc tốt - Giúp đỡ bạn bè', points: 5, type: 'positive', category: 'Đạo đức' },
  { id: 'crit-7', title: 'Học sinh xuất sắc trong tuần', points: 10, type: 'positive', category: 'Khen thưởng' },
  { id: 'crit-8', title: 'Mất trật tự trong giờ học', points: -2, type: 'negative', category: 'Kỷ luật' },
  { id: 'crit-9', title: 'Quên sách vở / Chưa làm bài', points: -2, type: 'negative', category: 'Học tập' }
];

// Lớp học sinh mặc định ban đầu
export const INITIAL_STUDENTS_CLASS_4A1: Student[] = [];

export const INITIAL_STUDENTS_CLASS_4_1 = INITIAL_STUDENTS_CLASS_4A1;

export const INITIAL_REWARDS: Reward[] = [];

export const INITIAL_QUICK_LINKS: QuickLink[] = [
  { id: 'link-1', title: 'Sách giáo khoa điện tử', url: 'https://hanhtrangso.nxbgd.vn', category: 'Học liệu & SGK', description: 'Xem trực tuyến sách giáo khoa và bài tập', isPinned: true },
  { id: 'link-2', title: 'Google Meet dạy học trực tuyến', url: 'https://meet.google.com', category: 'Học liệu & SGK', description: 'Phòng học trực tuyến Google Meet dùng chung', isPinned: true },
  { id: 'link-3', title: 'Học Trực Tuyến OLM.vn', url: 'https://olm.vn', category: 'Luyện tập', description: 'Ngân hàng đề thi và luyện tập tương tác' },
  { id: 'link-4', title: 'Quizizz Trò chơi trắc nghiệm', url: 'https://quizizz.com', category: 'Trò chơi', description: 'Tổ chức mini-game kiểm tra kiến thức nhanh' },
  { id: 'link-5', title: 'Máy chiếu vật thể bằng Smart phone', url: 'https://sharecame-production.up.railway.app/', category: 'Học liệu số', description: 'Dùng điện thoại làm máy chiếu vật thể: đưa bài làm, vật thật lên màn hình lớp' }
];

/**
 * Default links added AFTER accounts already had their own saved list. Each one is offered once to an existing
 * account (see ClassroomContext.applyUserClassroomData); a link the teacher then deletes does not come back.
 */
export const LATER_DEFAULT_QUICK_LINK_IDS = ['link-5'];

// Thời khóa biểu cố định của lớp 4A1 (Yêu cầu 1)
export const INITIAL_TIMETABLE: TimetableSlot[] = [];

// Cấu hình mặc định cho Giáo viên bộ môn (Yêu cầu GVBM Tin học dạy nhiều lớp)
export const DEFAULT_SUBJECT_TEACHER_CONFIG: SubjectTeacherConfig = {
  subjectName: 'TIN HỌC',
  subject2: 'CÔNG NGHỆ',
  subject3: '',
  subject4: '',
  taughtSubjects: ['TIN HỌC', 'CÔNG NGHỆ'],
  roomDefault: 'Phòng máy Tin học',
  scheduleScope: 'semester',
  periodName: 'Học kì I (Từ ngày 05/9/2026)',
  morningPeriods: 4,
  afternoonPeriods: 3,
  hasSaturday: false,
  teacherDisplayName: 'Nguyễn Thanh Liêm',
  semester: 'I',
  effectiveStartDate: '05/9/2026'
};

// 20 Tên lớp phổ biến để giáo viên bộ môn phân bổ giảng dạy
export const PRESET_SUBJECT_CLASS_NAMES = [
  '3A1', '3A2', '3A3', '3A4',
  '4A1', '4A2', '4A3', '4A4', '4A5', '4A6',
  '5A1', '5A2', '5A3', '5A4', '5A5', '5A6',
  '2A1', '2A2', '1A1', '1A2'
];

// Danh sách 18 lớp theo mẫu Thời khóa biểu giảng dạy thực tế của thầy Nguyễn Thanh Liêm
export const SAMPLE_SUBJECT_CLASSES_BY_IMAGE = [
  // Khối 3 (7 lớp)
  { name: '3A1', grade: 'Khối 3', studentCount: 35, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 3A1' },
  { name: '3A2', grade: 'Khối 3', studentCount: 34, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 3A2' },
  { name: '3A3', grade: 'Khối 3', studentCount: 35, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 3A3' },
  { name: '3A4', grade: 'Khối 3', studentCount: 33, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 3A4' },
  { name: '3A5', grade: 'Khối 3', studentCount: 35, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 3A5' },
  { name: '3A6', grade: 'Khối 3', studentCount: 34, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 3A6' },
  { name: '3A7', grade: 'Khối 3', studentCount: 32, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 3A7' },
  // Khối 4 (6 lớp)
  { name: '4A1', grade: 'Khối 4', studentCount: 35, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 4A1' },
  { name: '4A2', grade: 'Khối 4', studentCount: 35, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 4A2' },
  { name: '4A3', grade: 'Khối 4', studentCount: 34, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 4A3' },
  { name: '4A4', grade: 'Khối 4', studentCount: 33, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 4A4' },
  { name: '4A5', grade: 'Khối 4', studentCount: 35, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 4A5' },
  { name: '4A6', grade: 'Khối 4', studentCount: 34, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 4A6' },
  // Khối 5 (5 lớp)
  { name: '5A1', grade: 'Khối 5', studentCount: 36, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 5A1' },
  { name: '5A2', grade: 'Khối 5', studentCount: 35, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 5A2' },
  { name: '5A3', grade: 'Khối 5', studentCount: 34, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 5A3' },
  { name: '5A4', grade: 'Khối 5', studentCount: 35, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 5A4' },
  { name: '5A5', grade: 'Khối 5', studentCount: 36, room: 'Phòng máy Tin học', teacherName: 'GVCN Lớp 5A5' }
];

// THỜI KHÓA BIỂU GIẢNG DẠY MẪU CHUẨN ĐÚNG THEO ẢNH ĐÍNH KÈM (THẦY NGUYỄN THANH LIÊM - MÔN TIN HỌC)
export const SAMPLE_SUBJECT_TIMETABLE_BY_IMAGE: SubjectTimetableSlot[] = [
  // THỨ HAI (6 tiết: Sáng 3 tiết, Chiều 3 tiết)
  { id: 'sbj-img-2-m2', day: 2, session: 'morning', period: 2, classId: 'class-4a1', className: '4A1', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 4A1' },
  { id: 'sbj-img-2-m3', day: 2, session: 'morning', period: 3, classId: 'class-4a2', className: '4A2', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 4A2' },
  { id: 'sbj-img-2-m4', day: 2, session: 'morning', period: 4, classId: 'class-4a3', className: '4A3', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 4A3' },
  { id: 'sbj-img-2-a1', day: 2, session: 'afternoon', period: 1, classId: 'class-4a4', className: '4A4', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 4A4' },
  { id: 'sbj-img-2-a2', day: 2, session: 'afternoon', period: 2, classId: 'class-4a5', className: '4A5', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 4A5' },
  { id: 'sbj-img-2-a3', day: 2, session: 'afternoon', period: 3, classId: 'class-4a6', className: '4A6', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 4A6' },

  // THỨ BA (7 tiết: Sáng 4 tiết, Chiều 3 tiết)
  { id: 'sbj-img-3-m1', day: 3, session: 'morning', period: 1, classId: 'class-3a1', className: '3A1', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 3A1' },
  { id: 'sbj-img-3-m2', day: 3, session: 'morning', period: 2, classId: 'class-3a2', className: '3A2', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 3A2' },
  { id: 'sbj-img-3-m3', day: 3, session: 'morning', period: 3, classId: 'class-3a3', className: '3A3', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 3A3' },
  { id: 'sbj-img-3-m4', day: 3, session: 'morning', period: 4, classId: 'class-3a4', className: '3A4', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 3A4' },
  { id: 'sbj-img-3-a1', day: 3, session: 'afternoon', period: 1, classId: 'class-3a5', className: '3A5', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 3A5' },
  { id: 'sbj-img-3-a2', day: 3, session: 'afternoon', period: 2, classId: 'class-3a6', className: '3A6', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 3A6' },
  { id: 'sbj-img-3-a3', day: 3, session: 'afternoon', period: 3, classId: 'class-3a7', className: '3A7', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 3A7' },

  // THỨ TƯ (4 tiết: Sáng 3 tiết, Chiều 1 tiết)
  { id: 'sbj-img-4-m2', day: 4, session: 'morning', period: 2, classId: 'class-5a1', className: '5A1', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 5A1' },
  { id: 'sbj-img-4-m3', day: 4, session: 'morning', period: 3, classId: 'class-5a2', className: '5A2', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 5A2' },
  { id: 'sbj-img-4-m4', day: 4, session: 'morning', period: 4, classId: 'class-5a3', className: '5A3', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 5A3' },
  { id: 'sbj-img-4-a2', day: 4, session: 'afternoon', period: 2, classId: 'class-5a4', className: '5A4', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 5A4' },

  // THỨ SÁU (1 tiết: Sáng 1 tiết)
  { id: 'sbj-img-6-m2', day: 6, session: 'morning', period: 2, classId: 'class-5a5', className: '5A5', subject: 'Tin học', room: 'Phòng máy Tin học', note: 'Tin học 5A5' }
];

// Thời khóa biểu mẫu ban đầu cho Giáo viên bộ môn Tin học dạy 20 lớp
// Tài khoản mới bắt đầu với TKB bộ môn trống; bộ mẫu ở trên chỉ áp dụng khi giáo viên chủ động chọn "Dùng mẫu"
export const INITIAL_SUBJECT_TIMETABLE: SubjectTimetableSlot[] = [];

