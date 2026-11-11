import { quizBankStore } from '../services/quizBankStore';
import { MANAGER_DATA_MS, TEACHER_SYNC_MS, ADMIN_EDITS_MS, LOCAL_EDIT_QUIET_MS, startJitteredLoop } from '../utils/liveSync';
import { deriveVaultKey, sealJSON, openJSON, fingerprint } from '../utils/personalVault';
import type { PersonalQuizVault } from '../types';
import { stripSampleData } from '../utils/sampleData';
import { isViewOnly, getViewAs, setViewAs, subscribeViewAs, ViewAsInfo } from '../utils/viewOnlyMode';
import { saveTeacherAuth, clearTeacherAuth, readTeacherAuth } from '../utils/teacherAuth';
import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { AlertCircle, X } from 'lucide-react';
import JSZip from 'jszip';
import { 
  Classroom, Student, Subject, PointCriterion, PointTransaction, 
  Reward, RewardRedemption, DailyAttendance, TimetableSlot, 
  TimetableConfig, QuickLink, TeacherProfile, AttendanceStatus,
  SeatingColumnsCount, TeacherDeskPosition, DoorPosition, BlackboardPosition,
  DeskNumberingOrder, BoardingStatus, DailyBoardingMeal,
  TeacherRole, SubjectTimetableSlot, SubjectTeacherConfig, InitSubjectClassItem,
  UserAccount, UserRole, UserClassroomData, QuestionItem, LoginRoleScope,
  SchoolBranch
} from '../types';
import { generateStudentsForClass, getStudentRealAvatar } from '../utils/studentGenerator';
import { 
  INITIAL_CLASSES, INITIAL_STUDENTS_CLASS_4A1, INITIAL_SUBJECTS, 
  INITIAL_CRITERIA, INITIAL_REWARDS, INITIAL_TIMETABLE, 
  INITIAL_QUICK_LINKS, DEFAULT_TEACHER, ADMIN_QUANTRI_PROFILE, DEFAULT_CORE_SUBJECTS,
  DEFAULT_SUBJECT_TEACHER_CONFIG, INITIAL_SUBJECT_TIMETABLE, PRESET_SUBJECT_CLASS_NAMES,
  SAMPLE_SUBJECT_TIMETABLE_BY_IMAGE, SAMPLE_SUBJECT_CLASSES_BY_IMAGE
} from '../data/initialData';
import { playCoinSound, playDeductSound } from '../utils/audio';
import { DEFAULT_QUESTIONS, loadQuizBank, saveQuizBank, smartMergeQuizBank } from '../utils/quizParser';
import { databaseService, FALLBACK_USERS, LOCAL_AUTH_KEY, LOCAL_DB_PREFIX, LOCAL_SESSION_KEY, getApiBaseUrl } from '../services/databaseService';
import { AvatarSourceType, getStudentAvatarAssignment, sanitizeStudentAvatar } from '../utils/avatarConfig';
import { getOfficialDisplayName, getOfficialRoleTitle, ACCOUNT_IDENTITY_MAP, isRestrictedAdminOrBgh } from '../utils/accountIdentity';
import { extractSchoolBranchesFromClasses } from '../utils/schoolBranchHelper';
import { 
  AiHierarchySynthesizer, 
  ClassLevelAiSummary, 
  SchoolLevelAiSummary, 
  SystemLevelAiSummary 
} from '../services/aiHierarchySynthesizer';
import { googleDriveService, LOCAL_DRIVE_CONFIG_KEY } from '../services/googleDriveService';
import { schoolDriveDbService } from '../services/schoolDriveDbService';
import { adminEditsService } from '../services/adminEditsService';
import { getAppliedAdminEdits, mergeAppliedAdminEdits } from '../services/adminEditsStore';
import { dataStorageService } from '../services/dataStorageService';
import { licenseService } from '../services/licenseService';

interface ClassroomContextType {
  classes: Classroom[];
  activeClassId: string;
  setActiveClassId: (id: string) => void;
  addClass: (cls: Omit<Classroom, 'id'>) => void;
  bulkAddClasses: (newClasses: Array<Omit<Classroom, 'id'>>) => void;
  updateClass: (id: string, cls: Partial<Classroom>) => void;
  deleteClass: (id: string) => void;
  bulkDeleteClasses: (ids: string[]) => void;
  bulkUpdateClasses: (ids: string[], updates: Partial<Classroom>) => void;
  deleteAllClasses: () => void;

  students: Student[];
  currentClassStudents: Student[];
  addStudent: (student: Omit<Student, 'id' | 'points' | 'stt'>) => void;
  updateStudent: (id: string, data: Partial<Student>) => void;
  deleteStudent: (id: string) => void;
  bulkDeleteStudents: (studentIds: string[]) => void;
  clearClassStudents: (classId: string) => void;
  bulkAddStudents: (students: Array<{ name: string; gender: 'Nam' | 'Nữ'; birthDate?: string; group?: string; role?: string; roles?: string[] }>) => void;
  autoAssignRealAvatarsToClass: (classId?: string) => void;
  autoAssignAvatarsToClass: (classId?: string, type?: AvatarSourceType, overwrite?: boolean) => { updatedCount: number; totalCount: number };
  batchUpdateStudentAvatars?: (updates: Array<{ studentId: string; avatar: string }>) => number;
  resetStudentsCoins: (studentIds?: string[], classId?: string) => void;

  subjects: Subject[];
  addSubject: (name: string, color?: string, icon?: string) => void;
  updateSubject: (id: string, data: Partial<Subject>) => void;
  deleteSubject: (id: string) => void;
  toggleSubjectApplied: (id: string, enabled?: boolean) => void;
  setAppliedSubjects: (subjectIds: string[]) => void;
  resetDefaultSubjects: () => void;

  criteria: PointCriterion[];
  addCriterion: (crit: Omit<PointCriterion, 'id'>) => void;

  transactions: PointTransaction[];
  awardPoints: (studentIds: string[], amount: number, reason: string, subjectName?: string) => void;
  deductPoints: (studentIds: string[], amount: number, reason: string, subjectName?: string) => void;

  rewards: Reward[];
  addReward: (reward: Omit<Reward, 'id'>) => void;
  updateReward: (id: string, data: Partial<Reward>) => void;
  deleteReward: (id: string) => void;
  redemptions: RewardRedemption[];
  redeemReward: (studentId: string, rewardId: string) => { success: boolean; message: string };

  seatingColumns: SeatingColumnsCount;
  setSeatingColumns: (cols: SeatingColumnsCount) => void;
  deskCountsPerColumn: number[];
  setDeskCountsPerColumn: (counts: number[]) => void;
  updateDeskCountForColumn: (colIndex: number, count: number) => void;
  deskNumberingOrder: DeskNumberingOrder;
  setDeskNumberingOrder: (order: DeskNumberingOrder) => void;
  teacherDeskPos: TeacherDeskPosition;
  setTeacherDeskPos: (pos: TeacherDeskPosition) => void;
  doorPos: DoorPosition;
  setDoorPos: (pos: DoorPosition) => void;
  blackboardPos: BlackboardPosition;
  setBlackboardPos: (pos: BlackboardPosition) => void;
  seatingAssignments: Record<string, string>; // seatKey -> studentId
  assignSeat: (seatKey: string, studentId: string | null) => void;
  autoAssignSeating: (mode?: 'random' | 'boy_girl' | 'name') => void;
  clearSeating: () => void;

  attendanceRecords: DailyAttendance[];
  currentDateAttendance: Record<string, AttendanceStatus>;
  setStudentAttendance: (studentId: string, status: AttendanceStatus, date?: string) => void;
  batchSetAttendance: (status: AttendanceStatus, date?: string) => void;

  boardingRecords: DailyBoardingMeal[];
  currentDateBoarding: Record<string, BoardingStatus>;
  setStudentBoarding: (studentId: string, status: BoardingStatus, date?: string) => void;
  batchSetBoarding: (status: BoardingStatus, date?: string) => void;

  timetable: TimetableSlot[];
  timetableConfig: TimetableConfig;
  setTimetableConfig: (config: TimetableConfig) => void;
  updateTimetableSlot: (day: number, session: 'morning' | 'afternoon', period: number, subject: string, classId?: string) => void;

  // Vai trò giáo viên & Quản lý nhiều lớp của Giáo viên bộ môn (User request)
  teacherRole: TeacherRole;
  setTeacherRole: (role: TeacherRole) => void;
  subjectTeacherConfig: SubjectTeacherConfig;
  updateSubjectTeacherConfig: (cfg: Partial<SubjectTeacherConfig>) => void;
  subjectTimetable: SubjectTimetableSlot[];
  updateSubjectTimetableSlot: (slot: Omit<SubjectTimetableSlot, 'id'> & { id?: string }) => void;
  deleteSubjectTimetableSlot: (id: string) => void;
  clearSubjectTimetable: () => void;
  seedSample20SubjectClasses: () => void;
  loadSampleTimetableByImage: (autoCreateClasses?: boolean) => void;
  initSubjectClasses: (items: InitSubjectClassItem[], replaceExisting?: boolean) => void;
  applySubjectTimetableSlots: (slots: SubjectTimetableSlot[]) => void;

  quickLinks: QuickLink[];
  addQuickLink: (link: Omit<QuickLink, 'id'>) => void;
  deleteQuickLink: (id: string) => void;
  updateQuickLink: (id: string, data: Partial<Omit<QuickLink, 'id'>>) => void;
  reorderQuickLinks: (links: QuickLink[]) => void;

  teacherProfile: TeacherProfile;
  updateTeacherProfile: (profile: Partial<TeacherProfile>) => void;

  // Kho câu hỏi độc lập & Infographic lưu trực tuyến theo tài khoản
  quizBank: QuestionItem[];
  setQuizBank: React.Dispatch<React.SetStateAction<QuestionItem[]>>;
  updateQuizBank: (questions: QuestionItem[]) => void;
  /** Két cá nhân: trạng thái ghi nhớ link Drive cá nhân theo tài khoản */
  quizVaultStatus: { hasVault: boolean; cleared: boolean; keyReady: boolean; stale: boolean };
  /** Nhập mật khẩu tài khoản để ghi nhớ link (máy này chưa có khóa két) / mở link đã lưu từ máy khác */
  unlockQuizVault: (password: string) => Promise<{ ok: boolean; message: string }>;
  /** Tải lại két từ dữ liệu tài khoản trên Drive trường (máy khác vừa lưu) */
  refreshQuizVault: () => Promise<boolean>;
  /** Đồng bộ GỘP kho câu hỏi với Drive cá nhân ngay (đẩy phần máy có, lấy phần Drive có) */
  syncPersonalQuiz: () => Promise<boolean>;
  infographicConfig: any;
  updateInfographicConfig: (cfg: any) => void;

  exportBackupJson: () => void;
  importBackupJson: (file: File) => Promise<boolean>;
  exportBackupZip: () => Promise<void>;
  importBackupZip: (file: File) => Promise<boolean>;

  clearAllData: () => void;
  getCurrentUserData: () => UserClassroomData;

  // Quản lý người dùng, phân quyền & Cơ sở dữ liệu đồng bộ
  currentUser: UserAccount | null;
  allUsers: UserAccount[];
  allTeachers: UserAccount[];
  loginUser: (username: string, password: string, selectedRoleScope?: LoginRoleScope, selectedSchoolName?: string) => Promise<{ success: boolean; message?: string }>;
  logoutUser: () => void;
  switchUserAccount: (username: string) => Promise<boolean>;
  /** 👁️ Quản trị / BGH vào xem lớp của giáo viên ở CHẾ ĐỘ CHỈ XEM (không đổi phiên, không ghi) */
  viewAsTeacher: (username: string) => Promise<boolean>;
  /** Thoát chế độ chỉ xem → tải lại trang với tài khoản quản trị */
  exitViewAs: () => void;
  viewAs: ViewAsInfo | null;
  refreshUsersList: () => Promise<void>;
  logUserActivity: (actionType: string, description: string, details?: any) => void;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  isAccountManagerOpen: boolean;
  setIsAccountManagerOpen: (open: boolean) => void;
  isGithubModalOpen: boolean;
  setIsGithubModalOpen: (open: boolean) => void;
  isGoogleDriveModalOpen: boolean;
  setIsGoogleDriveModalOpen: (open: boolean) => void;
  isCdKeyModalOpen: boolean;
  setIsCdKeyModalOpen: (open: boolean) => void;
  isDataStorageModalOpen: boolean;
  setIsDataStorageModalOpen: (open: boolean) => void;
  isCdKeyActivated: boolean;
  activateCdKey: (key: string) => { success: boolean; message: string };
  setAllUserData: (data: UserClassroomData) => void;
  dbSyncStatus: 'synced' | 'syncing' | 'offline';
  lastDbSyncTime: string;
  syncDatabaseNow: (overrideStudents?: any, overrideClasses?: any) => Promise<void>;
  isAdmin: boolean;
  isSchoolAdmin: boolean;
  isGuestAdmin: boolean;
  isHomeroom: boolean;
  isSubject: boolean;
  isDemo: boolean;
  isBgh: boolean;
  canManageAccounts: boolean;
  // Quyền hạn tôn trọng Giáo viên chủ nhiệm (GVCN Autonomy & Permissions)
  isSchoolAdminOrBgh: boolean;
  canEvaluateEmulation: boolean;
  canEditStudentAvatar: boolean;
  canManageStudents?: boolean;
  canEditClassCore?: boolean;
  canDeleteClasses?: boolean;
  canAssignClassOfficer: boolean;
  canEditClassAvatar: boolean;
  canEditClassSlogan: boolean;
  canEditParentCommittee: boolean;
  isRestrictedAdminOrBgh: boolean;
  canResetOrAssignCoins: boolean;
  canCreateClassInfographic: boolean;
  canConfigureCoinSubjects: boolean;
  isRegistrationModalOpen: boolean;
  setIsRegistrationModalOpen: (open: boolean) => void;
  demoWarningMessage: string | null;
  setDemoWarningMessage: (msg: string | null) => void;
  // Cấu hình Phân hiệu & Điểm trường trực thuộc (School Branches & Campuses)
  schoolBranches: SchoolBranch[];
  saveSchoolBranches: (branches: SchoolBranch[], schoolName?: string) => Promise<boolean>;
  reloadSchoolBranches: (schoolName?: string) => Promise<void>;

  // 🧠 CỐT LÕI AI LIÊN THÔNG 3 CẤP ĐỘ (Classroom - School - System)
  aiClassInsight: ClassLevelAiSummary | null;
  aiSchoolInsight: SchoolLevelAiSummary | null;
  aiSystemInsight: SystemLevelAiSummary | null;
}

const ClassroomContext = createContext<ClassroomContextType | undefined>(undefined);

export const ClassroomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 0. User Authentication & Independent Workspace
  // Mặc định khi truy cập lần đầu tiên hoặc quá 300 phút: yêu cầu đăng nhập lại
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    if (!databaseService.isSessionValid()) {
      return null;
    }
    return databaseService.getCurrentUser();
  });
  const [allUsers, setAllUsers] = useState<UserAccount[]>(FALLBACK_USERS);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(() => {
    return !databaseService.isSessionValid();
  });
  const [isAccountManagerOpen, setIsAccountManagerOpen] = useState(false);
  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
  const [isGoogleDriveModalOpen, setIsGoogleDriveModalOpen] = useState(false);
  const [isCdKeyModalOpen, setIsCdKeyModalOpen] = useState(false);
  const [isDataStorageModalOpen, setIsDataStorageModalOpen] = useState(false);
  const [isCdKeyActivated, setIsCdKeyActivated] = useState<boolean>(() => licenseService.isActivated());

  useEffect(() => {
    const unsub = licenseService.subscribe((details) => {
      setIsCdKeyActivated(details.isActivated);
    });
    return () => unsub();
  }, []);

  const activateCdKey = (key: string) => {
    return licenseService.activate(key, currentUser?.fullName, currentUser?.schoolName);
  };
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);
  // Demo school retired: the demo warning banner is never shown.
  const [demoWarningMessage, setDemoWarningMessage] = useState<string | null>(null);
  const [dbSyncStatus, setDbSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('synced');
  const [lastDbSyncTime, setLastDbSyncTime] = useState<string>(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  // 🛡️ WATCHDOG TIMER CHO TRẠNG THÁI LƯU: Tuyệt đối không để treo "ĐANG LƯU..." quá 1.5 giây
  useEffect(() => {
    if (dbSyncStatus === 'syncing') {
      const watchdog = setTimeout(() => {
        setDbSyncStatus('synced');
        const now = new Date();
        setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
      }, 1500);
      return () => clearTimeout(watchdog);
    }
  }, [dbSyncStatus]);

  const [permissionAlert, setPermissionAlert] = useState<string | null>(null);

  const isSuperAdmin = currentUser?.role === 'admin' || currentUser?.username?.toLowerCase() === 'adminquantri';
  // Demo school retired: no account is limited as demo any more (kept for context API compatibility).
  const isDemo = false;
  const isBgh = Boolean(currentUser?.isBgh || currentUser?.role === 'bgh');
  const isSchoolAdmin = Boolean(currentUser?.role === 'school_admin' || currentUser?.isSchoolAdmin);
  const isGuestAdmin = Boolean(currentUser?.role === 'guest_admin' || currentUser?.isGuestAdmin);
  const isAdmin = Boolean(currentUser?.role === 'admin' || isBgh || isSchoolAdmin || isGuestAdmin);
  const canManageAccounts = Boolean(currentUser?.role === 'admin' || isSchoolAdmin || isGuestAdmin || isBgh);

  // 🛡️ BẢO TOÀN TÔN TRỌNG QUYỀN GIÁO VIÊN CHỦ NHIỆM (GVCN AUTONOMY PROTOCOL)
  // Quản trị nhà trường, Ban Giám Hiệu và Admin Quản trị không được:
  // - Gán/cấu hình cán bộ lớp cho học sinh
  // - Thay đổi ảnh đại diện (avatar) của học sinh
  // - Cấu hình ảnh avatar của lớp trong danh mục lớp học
  // - Cấu hình Slogan / Khẩu hiệu lớp học (Hiển thị trên Infographic)
  // - Cấu hình Ban Đại Diện Cha Mẹ Học Sinh
  const isSchoolAdminOrBgh = !isSuperAdmin && Boolean(isSchoolAdmin || isBgh);
  // adminquantri (Quản trị tối cao) có TOÀN QUYỀN: không bị giới hạn như Quản trị nhà trường / BGH
  const isRestrictedAdminOrBghUser = !isSuperAdmin && isRestrictedAdminOrBgh(currentUser);
  // Quản trị nhà trường & BGH: chỉ được thêm/nhập lớp, khai báo phân hiệu – điểm trường và gán phân hiệu cho lớp
  const canManageStudents = !isSchoolAdminOrBgh;
  const canEditClassCore = !isSchoolAdminOrBgh;
  const canDeleteClasses = !isSchoolAdminOrBgh;
  const canEvaluateEmulation = !isSchoolAdminOrBgh;
  const canEditStudentAvatar = !isRestrictedAdminOrBghUser;
  const canAssignClassOfficer = !isRestrictedAdminOrBghUser;
  const canEditClassAvatar = !isRestrictedAdminOrBghUser;
  const canEditClassSlogan = !isRestrictedAdminOrBghUser;
  const canEditParentCommittee = !isRestrictedAdminOrBghUser;
  const canResetOrAssignCoins = !isSchoolAdminOrBgh;
  const canCreateClassInfographic = !isSchoolAdminOrBgh;
  const canConfigureCoinSubjects = !isSchoolAdminOrBgh;

  const currentUserRef = useRef<UserAccount | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Flag to prevent echo loops when remote updates are applied
  const isApplyingRemoteUpdateRef = useRef(false);

  // Tự động đồng bộ và lưu dữ liệu ngay lập tức khi người dùng tắt tab hoặc đóng trình duyệt
  useEffect(() => {
    const handleBeforeUnload = () => {
      const user = currentUserRef.current;
      if (!user) return;
      const isExecutive = Boolean(
        user.role === 'admin' || 
        user.role === 'school_admin' || 
        user.role === 'bgh' || 
        user.isBgh || 
        user.isSchoolAdmin || 
        user.role === 'guest_admin' || 
        user.isGuestAdmin
      );
      if (!isExecutive) {
        const currentData = getCurrentUserData();
        databaseService.saveUserData(user.username, currentData);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, []);

  // 1. Initial In-Memory State (Authoritative data is fetched directly from Server)
  const isInitialExecutive = Boolean(
    currentUser && (
      currentUser.role === 'admin' || 
      currentUser.username?.toLowerCase() === 'adminquantri' ||
      currentUser.role === 'school_admin' || 
      currentUser.role === 'bgh' || 
      currentUser.isBgh || 
      currentUser.isSchoolAdmin || 
      currentUser.role === 'guest_admin' || 
      currentUser.isGuestAdmin
    )
  );

  const [classes, setClasses] = useState<Classroom[]>([]);
  const [activeClassId, setActiveClassId] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);

  // Always retain the latest synchronous references to avoid stale closure updates
  const studentsRef = useRef<Student[]>(students);
  const classesRef = useRef<Classroom[]>(classes);
  useEffect(() => {
    studentsRef.current = students;
  }, [students]);
  useEffect(() => {
    classesRef.current = classes;
  }, [classes]);

  // 🛡️ Tự động rà soát & khắc phục các avatar học sinh trỏ đến file ảnh hỏng / không tồn tại
  useEffect(() => {
    if (!students || students.length === 0) return;
    let hasBroken = false;
    const healed = students.map((s, idx) => {
      const clean = sanitizeStudentAvatar(s.avatar, (s.gender as any) || 'Nam', idx, s.classId);
      if (clean !== s.avatar) {
        hasBroken = true;
        return { ...s, avatar: clean, originalAvatar: clean };
      }
      return s;
    });
    if (hasBroken) {
      studentsRef.current = healed;
      setStudents(healed);
      if (currentUserRef.current) {
        const isExec = Boolean(
          currentUserRef.current.role === 'admin' || 
          currentUserRef.current.role === 'school_admin' || 
          currentUserRef.current.role === 'bgh' || 
          currentUserRef.current.isSchoolAdmin || 
          currentUserRef.current.isBgh ||
          currentUserRef.current.username?.toLowerCase() === 'adminquantri'
        );
        if (!isExec) {
          const payload: UserClassroomData = {
            ...getCurrentUserData(),
            students: healed,
            updatedAt: Date.now()
          };
          databaseService.saveUserData(currentUserRef.current.username, payload).catch(() => {});
        }
      }
    }
  }, [students]);

  // 🛡️ Tự động rà soát & loại bỏ học sinh mồ côi, học sinh bộ môn và 23 học sinh test cũ của lớp 1A12 để bảo đảm sĩ số chuẩn xác 100% (103 học sinh: 1A1: 30, 1A2: 45, 1A3: 28)
  useEffect(() => {
    if (!classes || classes.length === 0 || !students || students.length === 0) return;
    const validClassIds = new Set(classes.map(c => c.id));
    const isExec = currentUserRef.current && (
      currentUserRef.current.role === 'admin' || 
      currentUserRef.current.role === 'school_admin' || 
      currentUserRef.current.role === 'bgh' || 
      currentUserRef.current.isSchoolAdmin || 
      currentUserRef.current.isBgh ||
      currentUserRef.current.username?.toLowerCase() === 'adminquantri'
    );
    const validStudents = students.filter(s => {
      if (!s.classId || !validClassIds.has(s.classId)) return false;
      // Với tài khoản quản trị: tuyệt đối không tổng hợp học sinh của lớp bộ môn và loại bỏ 23 học sinh test cũ của lớp 1A12
      if (isExec) {
        if (s.classId === 'class-1791592764810' || s.classId.startsWith('class-sub-')) return false;
      }
      return true;
    });
    if (validStudents.length !== students.length) {
      console.log(`[ClassroomContext] Tự động loại bỏ ${students.length - validStudents.length} học sinh không hợp lệ/rác để chuẩn hóa sĩ số (còn ${validStudents.length} em)`);
      studentsRef.current = validStudents;
      setStudents(validStudents);
      if (currentUserRef.current && !isExec) {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          students: validStudents,
          updatedAt: Date.now()
        };
        databaseService.saveUserData(currentUserRef.current.username, payload).catch(() => {});
      }
    }
  }, [classes, students]);

  // ⚡ Instant synchronization across browser tabs and windows via local BroadcastChannel
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    try {
      const bc = new BroadcastChannel('lop_hoc_realtime_local');
      bc.onmessage = (event) => {
        const msg = event.data;
        if (msg && msg.type === 'STUDENT_UPDATED' && msg.studentId && msg.studentData) {
          setStudents(prev => {
            const next = prev.map(s => s.id === msg.studentId ? { ...s, ...msg.studentData } : s);
            studentsRef.current = next;
            return next;
          });
        } else if (msg && msg.type === 'CLASS_UPDATED' && msg.classId && msg.classData) {
          setClasses(prev => {
            const next = prev.map(c => c.id === msg.classId ? { ...c, ...msg.classData } : c);
            classesRef.current = next;
            return next;
          });
        } else if (msg && msg.type === 'STUDENTS_BULK_UPDATED' && Array.isArray(msg.students)) {
          setStudents(msg.students);
          studentsRef.current = msg.students;
        } else if (msg && msg.type === 'SCHOOL_BRANCHES_UPDATED' && Array.isArray(msg.branches)) {
          setSchoolBranches(msg.branches);
        }
      };
      return () => {
        bc.close();
      };
    } catch (_) {}
  }, []);

  // 🏛️ Cấu hình Phân hiệu & Điểm trường trực thuộc cho từng Trường học
  const [schoolBranches, setSchoolBranches] = useState<SchoolBranch[]>([]);

  const reloadSchoolBranches = async (schoolName?: string, currentClasses?: Classroom[]) => {
    const targetSchool = (schoolName || currentUser?.schoolName || '').trim();
    if (!targetSchool) {
      setSchoolBranches([]);
      return;
    }
    let list = await databaseService.getSchoolBranches(targetSchool);
    // 🌟 FALLBACK THÔNG MINH: Nếu chưa có cấu hình trong DB nhưng danh sách lớp học đã có dữ liệu phân hiệu/điểm trường
    const classesToCheck = currentClasses || classes;
    if ((!list || list.length === 0) && classesToCheck && classesToCheck.length > 0) {
      const extracted = extractSchoolBranchesFromClasses(classesToCheck);
      if (extracted.length > 0) {
        list = extracted;
        databaseService.saveSchoolBranches(targetSchool, extracted).catch(() => {});
      }
    }
    setSchoolBranches(list || []);
  };

  const saveSchoolBranches = async (branches: SchoolBranch[], schoolName?: string): Promise<boolean> => {
    const targetSchool = (schoolName || currentUser?.schoolName || '').trim();
    if (!targetSchool) return false;
    setSchoolBranches(branches);
    return await databaseService.saveSchoolBranches(targetSchool, branches);
  };

  // Tự động tải và đồng bộ danh mục phân hiệu & điểm trường khi đổi tài khoản / đổi trường / cập nhật lớp
  useEffect(() => {
    if (currentUser?.schoolName) {
      reloadSchoolBranches(currentUser.schoolName, classes);
    } else {
      setSchoolBranches([]);
    }
  }, [currentUser?.username, currentUser?.schoolName, classes.length]);

  // 🛡️ AUTO-SEED GUARD: Khi danh sách lớp học có dữ liệu mà schoolBranches đang rỗng, tự động trích xuất ngay lập tức
  // Không lưu thẳng: đọc danh mục đã lưu (Drive / Supabase / máy) trước, chỉ tự trích khi thật sự chưa có —
  // tránh ghi đè danh mục phân hiệu đầy đủ trên Drive bằng phần trích từ vài lớp.
  useEffect(() => {
    if (schoolBranches.length === 0 && classes.length > 0 && currentUser?.schoolName) {
      if (extractSchoolBranchesFromClasses(classes).length > 0) {
        reloadSchoolBranches(currentUser.schoolName, classes).catch(() => {});
      }
    }
  }, [classes, schoolBranches.length, currentUser?.schoolName]);

  const [subjects, setSubjects] = useState<Subject[]>(INITIAL_SUBJECTS);
  const [criteria, setCriteria] = useState<PointCriterion[]>(INITIAL_CRITERIA);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [rewards, setRewards] = useState<Reward[]>(INITIAL_REWARDS);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [seatingColumns, setSeatingColumnsState] = useState<SeatingColumnsCount>(4);
  const [deskCountsPerColumn, setDeskCountsPerColumn] = useState<number[]>([4, 4, 4, 4]);
  const [deskNumberingOrder, setDeskNumberingOrder] = useState<DeskNumberingOrder>('vertical');

  const setSeatingColumns = (cols: SeatingColumnsCount) => {
    setSeatingColumnsState(cols);
    setDeskCountsPerColumn(prev => {
      const next = [...prev];
      while (next.length < cols) {
        next.push(4);
      }
      return next.slice(0, cols);
    });
  };

  const updateDeskCountForColumn = (colIndex: number, count: number) => {
    const clamped = Math.max(1, Math.min(8, count));
    setDeskCountsPerColumn(prev => {
      const next = [...prev];
      while (next.length <= colIndex) {
        next.push(4);
      }
      next[colIndex] = clamped;
      return next;
    });
  };

  const [teacherDeskPos, setTeacherDeskPos] = useState<TeacherDeskPosition>('left');
  const [doorPos, setDoorPos] = useState<DoorPosition>('right');
  const [blackboardPos, setBlackboardPos] = useState<BlackboardPosition>('center');
  const [seatingAssignments, setSeatingAssignments] = useState<Record<string, string>>(() => {
    const initialMap: Record<string, string> = {};
    INITIAL_STUDENTS_CLASS_4A1.slice(0, 16).forEach((s, idx) => {
      const col = Math.floor(idx / 8);
      const rowInCol = Math.floor((idx % 8) / 2);
      const sub = idx % 2;
      initialMap[`${col}-${rowInCol}-${sub}`] = s.id;
    });
    return initialMap;
  });
  const [attendanceRecords, setAttendanceRecords] = useState<DailyAttendance[]>([]);
  const [boardingRecords, setBoardingRecords] = useState<DailyBoardingMeal[]>([]);
  const [timetableConfig, setTimetableConfig] = useState<TimetableConfig>({ morningPeriods: 4, afternoonPeriods: 3, hasSaturday: false });
  const [timetable, setTimetable] = useState<TimetableSlot[]>(INITIAL_TIMETABLE);
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(INITIAL_QUICK_LINKS);
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile>(() => {
    if (currentUser?.username?.toLowerCase() === 'adminquantri' || currentUser?.role === 'admin') {
      return {
        ...ADMIN_QUANTRI_PROFILE,
        name: currentUser?.fullName || ADMIN_QUANTRI_PROFILE.name
      };
    }
    return DEFAULT_TEACHER;
  });

  // Vai trò giáo viên (homeroom = Chủ nhiệm, subject = Bộ môn)
  // 🌟 Quản trị viên tối cao & Quản trị nhà trường luôn cố định role là 'homeroom', không cho phép chuyển sang GV Bộ môn
  const [teacherRole, setTeacherRoleState] = useState<TeacherRole>(() => {
    if (currentUser) {
      if (
        currentUser.role === 'admin' || 
        currentUser.role === 'school_admin' || 
        currentUser.role === 'bgh' || 
        currentUser.isSchoolAdmin || 
        currentUser.isBgh ||
        currentUser.username?.toLowerCase() === 'adminquantri'
      ) {
        return 'homeroom';
      }
      return currentUser.role === 'subject' ? 'subject' : 'homeroom';
    }
    return 'homeroom';
  });

  const setTeacherRole = (role: TeacherRole) => {
    if (currentUser) {
      if (
        currentUser.role === 'admin' || 
        currentUser.role === 'school_admin' || 
        currentUser.role === 'bgh' || 
        currentUser.isSchoolAdmin || 
        currentUser.isBgh ||
        currentUser.username?.toLowerCase() === 'adminquantri'
      ) {
        setTeacherRoleState('homeroom');
        return;
      }
      const fixed = currentUser.role === 'subject' ? 'subject' : 'homeroom';
      setTeacherRoleState(fixed);
      return;
    }
    setTeacherRoleState(role);
  };

  const [subjectTeacherConfig, setSubjectTeacherConfig] = useState<SubjectTeacherConfig>(DEFAULT_SUBJECT_TEACHER_CONFIG);
  const updateSubjectTeacherConfig = (cfg: Partial<SubjectTeacherConfig>) => {
    setSubjectTeacherConfig(prev => ({ ...prev, ...cfg }));
  };

  const [subjectTimetable, setSubjectTimetable] = useState<SubjectTimetableSlot[]>(INITIAL_SUBJECT_TIMETABLE);
  const [quizBank, setQuizBank] = useState<QuestionItem[]>(() => loadQuizBank());
  const quizBankRef = useRef<QuestionItem[]>(quizBank);
  quizBankRef.current = quizBank;
  // 🔐 Két cá nhân: link Drive cá nhân (kho câu hỏi) mã hóa bằng mật khẩu, đi theo dữ liệu tài khoản (utils/personalVault)
  // Gắn chủ sở hữu để không bao giờ lưu nhầm két của tài khoản trước sang tài khoản sau.
  const [vaultState, setVaultState] = useState<{ owner: string; vault?: PersonalQuizVault }>({ owner: '' });
  const vaultStateRef = useRef(vaultState);
  vaultStateRef.current = vaultState;
  const vaultStaleRef = useRef(false);          // két hiện có không mở được bằng mật khẩu hiện tại (đã đổi mật khẩu)
  const [vaultKeyTick, setVaultKeyTick] = useState(0);
  // Vòng cập nhật 15 giây: lần chỉnh sửa gần nhất trên máy, hàm lấy dữ liệu hiện tại (luôn mới), hàm đồng bộ kho câu hỏi
  const lastLocalChangeAtRef = useRef(0);
  const currentDataGetterRef = useRef<() => UserClassroomData>(() => ({} as UserClassroomData));
  const syncPersonalQuizRef = useRef<() => Promise<boolean>>(async () => false);
  // 📚 Kho câu hỏi CÁ NHÂN (services/quizBankStore): chỉ tài khoản giáo viên, không ở chế độ chỉ xem
  const isPersonalQuizUser = (u: UserAccount | null | undefined) => Boolean(
    u && !isViewOnly() && !(u.role === 'admin' || u.role === 'school_admin' || u.role === 'bgh' || u.isBgh || u.isSchoolAdmin || u.role === 'guest_admin' || u.isGuestAdmin)
  );
  const updateQuizBank = (questions: QuestionItem[]) => {
    const merged = smartMergeQuizBank(questions);
    setQuizBank(merged);
    saveQuizBank(merged);
    if (currentUserRef.current) {
      const user = currentUserRef.current;
      const isExec = Boolean(
        user.role === 'admin' || 
        user.role === 'school_admin' || 
        user.role === 'bgh' || 
        user.isBgh || 
        user.isSchoolAdmin || 
        user.role === 'guest_admin' || 
        user.isGuestAdmin
      );
      if (!isExec) {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          quizBank: merged,
          updatedAt: Date.now()
        };
        databaseService.saveUserData(user.username, payload).catch(() => {});
      }
      // Lưu thêm vào kho câu hỏi cá nhân trên máy (+ Drive cá nhân nếu đã cấu hình)
      if (isPersonalQuizUser(user)) quizBankStore.save(user.username, merged).catch(() => {});
    }
  };

  // Đăng nhập / đổi tài khoản giáo viên: nạp kho câu hỏi CỦA CHÍNH TÀI KHOẢN NÀY (IndexedDB theo tài khoản),
  // rồi lấy bản mới hơn từ Google Drive cá nhân (nếu đã cấu hình).
  // ⚠️ KHÔNG gộp bộ câu hỏi đang nằm trong bộ nhớ (có thể là của tài khoản đăng nhập trước trên cùng máy).
  // Câu hỏi cũ nằm trong dữ liệu riêng của tài khoản vẫn được chuyển sang ở applyUserClassroomData (adopt).
  useEffect(() => {
    const user = currentUserRef.current;
    if (!user || !isPersonalQuizUser(user)) return;
    let alive = true;
    (async () => {
      try {
        const mine = await quizBankStore.load(user.username);
        if (!alive || currentUserRef.current?.username !== user.username) return;
        const own = mine ? mine.questions : DEFAULT_QUESTIONS;
        setQuizBank(own);
        saveQuizBank(own);
        const remote = await quizBankStore.pullDrive(user.username);
        if (alive && remote) {
          setQuizBank(remote);
          saveQuizBank(remote);
        }
      } catch (_) { /* giữ bộ câu hỏi đang có */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username]);

  // Khóa két của tài khoản: IndexedDB; chưa có → sinh từ mật khẩu đã nhớ trên máy (tài khoản dùng chung chấm công)
  const [vaultKeyReady, setVaultKeyReady] = useState(false);
  const getOrMakeVaultKey = async (username: string): Promise<CryptoKey | null> => {
    let key = await quizBankStore.getVaultKey(username);
    if (!key) {
      const remembered = readTeacherAuth();
      if (remembered && remembered.username === username.trim().toLowerCase()) {
        key = await deriveVaultKey(username, remembered.password);
        if (key) await quizBankStore.setVaultKey(username, key);
      }
    }
    if (currentUserRef.current?.username === username) setVaultKeyReady(Boolean(key));
    return key;
  };

  // 🔐 Khóa (mã hóa) link Drive cá nhân vào két khi giáo viên kết nối / đổi link
  const sealPersonalVault = async () => {
    const user = currentUserRef.current;
    if (!user || !isPersonalQuizUser(user)) return;
    const u = user.username;
    const cfg = quizBankStore.getDriveConfig(u);
    if (!cfg) return;
    const key = await getOrMakeVaultKey(u);
    if (!key) return;
    const owner = u.toLowerCase();
    const cur = vaultStateRef.current.owner === owner ? vaultStateRef.current.vault : undefined;
    const h = await fingerprint(`${cfg.scriptUrl}|${cfg.folderId}`);
    if (cur && cur.c && !cur.cleared && cur.h === h && !vaultStaleRef.current) return;
    const box = await sealJSON(key, { scriptUrl: cfg.scriptUrl, folderId: cfg.folderId, folderUrl: cfg.folderUrl || '' });
    if (!box || currentUserRef.current?.username !== u) return;
    vaultStaleRef.current = false;
    setVaultState({ owner, vault: { at: Date.now(), i: box.i, c: box.c, h } });
  };
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = quizBankStore.subscribe(() => { if (t) clearTimeout(t); t = setTimeout(() => { sealPersonalVault().catch(() => {}); }, 400); });
    const onDisconnect = (e: Event) => {
      const user = currentUserRef.current;
      const who = String((e as CustomEvent).detail?.username || '').toLowerCase();
      if (!user || !isPersonalQuizUser(user) || who !== user.username.toLowerCase()) return;
      setVaultState({ owner: who, vault: { at: Date.now(), cleared: true } });
    };
    window.addEventListener('lhhp:quiz-drive-disconnected', onDisconnect);
    return () => { if (t) clearTimeout(t); unsub(); window.removeEventListener('lhhp:quiz-drive-disconnected', onDisconnect); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Két vừa đổi đúng lúc tự động lưu đang tạm khóa (vừa nạp dữ liệu từ máy chủ) → thử lại khi hết khóa để két chắc chắn được lưu
  const vaultPersistedAtRef = useRef(0);
  useEffect(() => {
    const v = vaultState.vault;
    if (!v || !currentUser || vaultState.owner !== currentUser.username.toLowerCase() || vaultPersistedAtRef.current === v.at) return;
    const blocked = !isRemoteDataLoadedRef.current || Date.now() < remoteUpdateLockUntilRef.current || isApplyingRemoteUpdateRef.current;
    if (!blocked) { vaultPersistedAtRef.current = v.at; return; } // lượt tự động lưu của lần render này sẽ lưu két
    const wait = Math.max(300, remoteUpdateLockUntilRef.current - Date.now() + 150);
    const t = setTimeout(() => setVaultState(st => ({ ...st })), wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultState, currentUser?.username]);
  const ownVault = vaultState.owner && vaultState.owner === (currentUser?.username || '').toLowerCase() ? vaultState.vault : undefined;
  const quizVaultStatus = {
    hasVault: Boolean(ownVault?.c && !ownVault.cleared),
    cleared: Boolean(ownVault?.cleared),
    keyReady: vaultKeyReady,
    stale: vaultStaleRef.current,
  };
  const unlockQuizVault = async (password: string): Promise<{ ok: boolean; message: string }> => {
    const user = currentUserRef.current;
    if (!user || !isPersonalQuizUser(user)) return { ok: false, message: 'Chỉ tài khoản giáo viên dùng được chức năng này.' };
    if (!password) return { ok: false, message: 'Hãy nhập mật khẩu tài khoản.' };
    const key = await deriveVaultKey(user.username, password);
    if (!key) return { ok: false, message: 'Trình duyệt này không hỗ trợ mã hóa (cần trang https).' };
    const vault = vaultStateRef.current.owner === user.username.toLowerCase() ? vaultStateRef.current.vault : undefined;
    if (vault?.c && !vault.cleared) {
      const opened = await openJSON(key, { i: vault.i || '', c: vault.c });
      if (!opened) {
        // Không mở được: sai mật khẩu, hoặc két khóa bằng mật khẩu cũ → kiểm tra mật khẩu với CSDL trường
        if (schoolDriveDbService.isConfigured()) {
          const r = await schoolDriveDbService.login(user.username, password).catch(() => null);
          if (!r || r.status !== 'ok') return { ok: false, message: 'Mật khẩu chưa đúng.' };
        }
        vaultStaleRef.current = true; // mật khẩu đúng nhưng két cũ → khóa lại bằng mật khẩu này
      }
    } else if (schoolDriveDbService.isConfigured()) {
      const r = await schoolDriveDbService.login(user.username, password).catch(() => null);
      if (!r || r.status !== 'ok') return { ok: false, message: 'Mật khẩu chưa đúng.' };
    }
    await quizBankStore.setVaultKey(user.username, key);
    setVaultKeyReady(true);
    setVaultKeyTick(t => t + 1); // chạy lại mở két / khóa két
    return { ok: true, message: vault?.c && !vault.cleared && !vaultStaleRef.current ? 'Đã mở link Drive cá nhân đã lưu theo tài khoản.' : 'Đã ghi nhớ link Drive cá nhân theo tài khoản.' };
  };
  const syncPersonalQuiz = async (): Promise<boolean> => {
    const user = currentUserRef.current;
    if (!user || !isPersonalQuizUser(user) || !quizBankStore.getDriveConfig(user.username)) return false;
    const remote = await quizBankStore.pullDrive(user.username);
    if (remote && currentUserRef.current?.username === user.username) { setQuizBank(remote); saveQuizBank(remote); return true; }
    return false;
  };
  syncPersonalQuizRef.current = syncPersonalQuiz;
  const refreshQuizVault = async (): Promise<boolean> => {
    const user = currentUserRef.current;
    if (!user || !isPersonalQuizUser(user) || !schoolDriveDbService.isConfigured()) return false;
    try {
      const base = getCurrentUserData();
      const fileName = googleDriveService.getFileNameForUser(user, user.assignedClassName, base.teacherRole);
      const pulled = await googleDriveService.pullClassData(base, fileName, user);
      const v = (pulled.success && pulled.mergedData) ? (pulled.mergedData as UserClassroomData).personalQuizVault : undefined;
      const owner = user.username.toLowerCase();
      const cur = vaultStateRef.current.owner === owner ? vaultStateRef.current.vault : undefined;
      if (v && (!cur || (v.at || 0) > (cur.at || 0))) { setVaultState({ owner, vault: v }); return true; }
    } catch (_) { /* ignore */ }
    return false;
  };

  // 🔓 Mở két: máy này chưa có link Drive cá nhân (máy mới / mượn máy) → tự kết nối + lấy bộ câu hỏi
  useEffect(() => {
    const user = currentUserRef.current;
    if (!user || !isPersonalQuizUser(user)) return;
    const owner = user.username.toLowerCase();
    const vault = vaultState.owner === owner ? vaultState.vault : undefined;
    let alive = true;
    (async () => {
      const key = await getOrMakeVaultKey(user.username);
      if (!key || !alive) return;
      if (vault?.c && !vault.cleared) {
        const cfg = await openJSON<{ scriptUrl: string; folderId: string; folderUrl?: string }>(key, { i: vault.i || '', c: vault.c });
        if (!alive) return;
        if (!cfg) { vaultStaleRef.current = true; await sealPersonalVault(); return; } // đổi mật khẩu → khóa lại nếu máy có link
        vaultStaleRef.current = false;
        if (!quizBankStore.getDriveConfig(user.username) && cfg.scriptUrl && cfg.folderId) {
          quizBankStore.setDriveConfig(user.username, { scriptUrl: cfg.scriptUrl, folderId: cfg.folderId, folderUrl: cfg.folderUrl });
          // Không phụ thuộc "alive": két có thể được nạp lại giữa chừng (tải lại dữ liệu tài khoản) → vẫn phải hiện câu hỏi vừa lấy
          const remote = await quizBankStore.pullDrive(user.username);
          if (remote && currentUserRef.current?.username === user.username) { setQuizBank(remote); saveQuizBank(remote); }
        }
      } else if (!vault) {
        await sealPersonalVault(); // chưa có két mà máy đã có link → khóa vào két
      }
    })().catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username, vaultState, vaultKeyTick]);

  const [infographicConfig, setInfographicConfig] = useState<any>(null);
  const updateInfographicConfig = (cfg: any) => {
    if (isSchoolAdminOrBgh) {
      setPermissionAlert("Để tôn trọng quyền chủ động của Giáo viên chủ nhiệm, Ban Giám Hiệu và Quản trị nhà trường không có quyền tạo hoặc chỉnh sửa Infographic lớp học.");
      return;
    }
    setInfographicConfig(cfg);
  };

  // Helper to construct complete dataset snapshot
  const getCurrentUserData = (): UserClassroomData => ({
    classes,
    activeClassId,
    students,
    subjects,
    criteria,
    transactions,
    rewards,
    redemptions,
    seatingColumns,
    deskCountsPerColumn,
    deskNumberingOrder,
    teacherDeskPos,
    doorPos,
    blackboardPos,
    seatingAssignments,
    attendanceRecords,
    boardingRecords,
    timetable,
    timetableConfig,
    teacherRole,
    subjectTeacherConfig,
    subjectTimetable,
    quickLinks,
    teacherProfile,
    quizBank,
    infographicConfig,
    ...(vaultState.owner && vaultState.owner === (currentUser?.username || '').toLowerCase() && vaultState.vault ? { personalQuizVault: vaultState.vault } : {})
  });

  currentDataGetterRef.current = getCurrentUserData;

  // Helper to apply dataset snapshot into state hooks
  const applyUserClassroomData = (data: Partial<UserClassroomData>) => {
    // 🧹 Bản web (Drive chung): không hiện / không lưu học sinh & lớp MẪU sinh tự động (xem utils/sampleData.ts)
    if (schoolDriveDbService.isConfigured()) {
      const cleaned = stripSampleData(data);
      if (cleaned.changed) data = cleaned.data;
    }
    // 🌟 SINGLE SOURCE OF TRUTH: tên tài khoản luôn lấy từ currentUser.fullName (CSDL users), KHÔNG bao giờ từ teacherProfile snapshot cũ
    if (currentUserRef.current && currentUserRef.current.fullName) {
      const authorName = currentUserRef.current.fullName;
      if (data.teacherProfile) {
        data.teacherProfile.name = authorName;
        if (currentUserRef.current.schoolName) {
          data.teacherProfile.schoolName = currentUserRef.current.schoolName;
        }
        if (currentUserRef.current.avatar) {
          data.teacherProfile.avatar = currentUserRef.current.avatar;
        }
      }
      // 🌟 Chỉ gán lại teacherName của lớp nếu đó là GVCN chính của lớp đó (homeroom)
      if (currentUserRef.current.role === 'homeroom' && data.classes && Array.isArray(data.classes)) {
        const curU = (currentUserRef.current.username || '').trim().toLowerCase();
        data.classes.forEach(c => {
          const tU = (c.teacherUsername || '').trim().toLowerCase();
          // Chỉ gán nếu lớp thuộc về GVCN hiện tại hoặc chưa gán cho ai
          if (!tU || tU === curU) {
            c.teacherName = authorName;
            c.teacherUsername = curU;
          }
        });
      }
    }

    let cleanClasses: Classroom[] = [];
    if (data.classes && Array.isArray(data.classes)) {
      const isExec = currentUserRef.current && (
        currentUserRef.current.role === 'admin' || 
        currentUserRef.current.role === 'school_admin' || 
        currentUserRef.current.role === 'bgh' || 
        currentUserRef.current.isSchoolAdmin || 
        currentUserRef.current.isBgh ||
        currentUserRef.current.username?.toLowerCase() === 'adminquantri'
      );
      if (isExec) {
        cleanClasses = data.classes.filter(c => c && c.teacherRole !== 'subject' && !c.id.startsWith('class-sub-'));
      } else if (currentUserRef.current?.role === 'homeroom') {
        const curU = (currentUserRef.current.username || '').trim().toLowerCase();
        // 🛡️ BẢO VỆ GVCN: Chỉ hiển thị các lớp mà GVCN này thực sự chủ nhiệm!
        // Nếu một lớp có teacherUsername chỉ định cho giáo viên khác => TUYỆT ĐỐI LOẠI BỎ KHỎI TÀI KHOẢN NÀY
        cleanClasses = data.classes.filter(c => {
          if (!c) return false;
          const tU = (c.teacherUsername || '').trim().toLowerCase();
          if (tU && tU !== curU) return false;
          return true;
        });
      } else {
        cleanClasses = data.classes;
      }
      setClasses(cleanClasses);
    }
    if (data.activeClassId) {
      // Đảm bảo activeClassId thuộc danh sách cleanClasses nếu có
      if (cleanClasses.length > 0 && !cleanClasses.some(c => c.id === data.activeClassId)) {
        setActiveClassId(cleanClasses[0].id);
      } else {
        setActiveClassId(data.activeClassId);
      }
    } else if (cleanClasses.length > 0) {
      setActiveClassId(cleanClasses[0].id);
    }

    if (data.students && Array.isArray(data.students)) {
      const isExec = currentUserRef.current && (
        currentUserRef.current.role === 'admin' || 
        currentUserRef.current.role === 'school_admin' || 
        currentUserRef.current.role === 'bgh' || 
        currentUserRef.current.isSchoolAdmin || 
        currentUserRef.current.isBgh ||
        currentUserRef.current.username?.toLowerCase() === 'adminquantri'
      );
      let filteredStudents = isExec
        ? data.students.filter(s => s && s.classId !== 'class-1791592764810' && !s.classId.startsWith('class-sub-'))
        : data.students;

      // 🛡️ Nếu là GVCN: Chỉ giữ học sinh thuộc các lớp mà GVCN này quản lý
      if (currentUserRef.current?.role === 'homeroom' && cleanClasses.length > 0) {
        const allowedClassIds = new Set(cleanClasses.map(c => c.id));
        filteredStudents = filteredStudents.filter(s => s && allowedClassIds.has(s.classId));
      }

      // 🌟 Tự động nâng cấp các ảnh đại diện bottts robot cũ sang ảnh thật từ thư mục anh demo avata
      const upgradedStudents = filteredStudents.map((s, idx) => {
        if (!s.avatar || s.avatar.includes('api.dicebear.com/7.x/bottts') || s.avatar.includes('seed=student-')) {
          return {
            ...s,
            avatar: getStudentRealAvatar(idx, s.classId)
          };
        }
        return s;
      });
      setStudents(upgradedStudents);
    }
    if (data.subjects && Array.isArray(data.subjects) && data.subjects.length > 0) {
      setSubjects(data.subjects);
    }
    if (data.criteria && Array.isArray(data.criteria)) {
      setCriteria(data.criteria);
    }
    if (data.transactions && Array.isArray(data.transactions)) {
      setTransactions(data.transactions);
    }
    if (data.rewards && Array.isArray(data.rewards)) {
      setRewards(data.rewards);
    }
    if (data.redemptions && Array.isArray(data.redemptions)) {
      setRedemptions(data.redemptions);
    }
    if (data.seatingColumns) {
      setSeatingColumns(data.seatingColumns);
    }
    if (data.deskCountsPerColumn && Array.isArray(data.deskCountsPerColumn)) {
      setDeskCountsPerColumn(data.deskCountsPerColumn);
    }
    if (data.deskNumberingOrder) {
      setDeskNumberingOrder(data.deskNumberingOrder);
    }
    if (data.teacherDeskPos) {
      setTeacherDeskPos(data.teacherDeskPos);
    }
    if (data.doorPos) {
      setDoorPos(data.doorPos);
    }
    if (data.blackboardPos) {
      setBlackboardPos(data.blackboardPos);
    }
    if (data.seatingAssignments) {
      setSeatingAssignments(data.seatingAssignments);
    }
    if (data.attendanceRecords && Array.isArray(data.attendanceRecords)) {
      setAttendanceRecords(data.attendanceRecords);
    }
    if (data.boardingRecords && Array.isArray(data.boardingRecords)) {
      setBoardingRecords(data.boardingRecords);
    }
    if (data.timetable && Array.isArray(data.timetable)) {
      setTimetable(data.timetable);
    }
    if (data.timetableConfig) {
      setTimetableConfig(data.timetableConfig);
    }
    if (data.teacherRole) {
      const isExec = currentUserRef.current && (
        currentUserRef.current.role === 'admin' || 
        currentUserRef.current.role === 'school_admin' || 
        currentUserRef.current.role === 'bgh' || 
        currentUserRef.current.isSchoolAdmin || 
        currentUserRef.current.isBgh ||
        currentUserRef.current.username?.toLowerCase() === 'adminquantri'
      );
      setTeacherRoleState(isExec ? 'homeroom' : data.teacherRole);
    }
    if (data.subjectTeacherConfig) {
      setSubjectTeacherConfig(data.subjectTeacherConfig);
    }
    if (data.subjectTimetable && Array.isArray(data.subjectTimetable)) {
      setSubjectTimetable(data.subjectTimetable);
    }
    if (data.quickLinks && Array.isArray(data.quickLinks)) {
      setQuickLinks(data.quickLinks);
    }
    if (data.teacherProfile) {
      setTeacherProfile(data.teacherProfile);
      // 🌟 KHÔNG bao giờ ghi đè currentUser.fullName từ teacherProfile snapshot cũ
      // Tên tài khoản là Single Source of Truth từ CSDL users
    }
    if (data.quizBank && Array.isArray(data.quizBank)) {
      setQuizBank(smartMergeQuizBank(data.quizBank));
      // Chuyển dữ liệu cũ: câu hỏi nằm trong tệp lớp / bộ nhớ → cộng thêm vào kho cá nhân (không xóa câu nào)
      const qUser = currentUserRef.current;
      if (isPersonalQuizUser(qUser)) {
        quizBankStore.adopt(qUser!.username, data.quizBank).then(all => {
          if (all.length !== quizBankRef.current.length) setQuizBank(all);
        }).catch(() => {});
      }
    }
    if (data.personalQuizVault && currentUserRef.current) {
      const owner = currentUserRef.current.username.toLowerCase();
      const cur = vaultStateRef.current;
      if (cur.owner !== owner || !cur.vault || (data.personalQuizVault.at || 0) > (cur.vault.at || 0)) {
        setVaultState({ owner, vault: data.personalQuizVault });
      }
    }
    if (data.infographicConfig) {
      setInfographicConfig(data.infographicConfig);
    }
  };

  // ⚡ KHỞI CHẠY CƠ CHẾ NGẦM TỰ ĐỘNG ĐỒNG BỘ GOOGLE DRIVE ĐỊNH KỲ MỖI 5 GIÂY (TOÀN HỆ THỐNG - TẤT CẢ TÀI KHOẢN)
  useEffect(() => {
    // Pull the school-wide shared Drive config (one Apps Script + one folder for every account)
    if (currentUser) {
      googleDriveService.loadSharedConfig(currentUser).catch(() => {});
    }
    const stopLoop = googleDriveService.startAutoSyncLoop5s(() => ({
      data: getCurrentUserData(),
      user: currentUserRef.current,
      activeClassId: activeClassId
    }));

    return () => {
      stopLoop();
    };
  }, [activeClassId, currentUser]);

  // Helper to build initial independent default data for a user
  const buildDefaultDataForUser = (user: UserAccount): UserClassroomData => {
    const isExecutive = Boolean(
      user.role === 'admin' || 
      user.role === 'school_admin' || 
      user.role === 'bgh' || 
      user.isBgh || 
      user.isSchoolAdmin || 
      user.role === 'guest_admin' || 
      user.isGuestAdmin
    );

    if (isExecutive) {
      // 🌟 Ban Giám Hiệu và Quản trị KHÔNG CÓ LỚP HỌC & HỌC SINH RIÊNG
      const isSuperAdmin = user.username?.toLowerCase() === 'adminquantri' || user.role === 'admin';
      const profile: TeacherProfile = isSuperAdmin ? {
        ...ADMIN_QUANTRI_PROFILE,
        name: user.fullName || 'Tài khoản quản trị Cao nhất',
        role: 'TÀI KHOẢN QUẢN TRỊ CAO NHẤT',
        teachingSubject: 'Quản trị viên Hệ thống Cấp cao',
        avatar: user.avatar || ADMIN_QUANTRI_PROFILE.avatar,
        schoolName: user.schoolName || ADMIN_QUANTRI_PROFILE.schoolName
      } : {
        ...DEFAULT_TEACHER,
        name: user.fullName || 'BAN GIÁM HIỆU / QUẢN TRỊ VIÊN',
        role: (user.role === 'bgh' || user.isBgh) ? 'BAN GIÁM HIỆU' : ((user.role === 'school_admin' || user.isSchoolAdmin) ? 'QUẢN TRỊ NHÀ TRƯỜNG' : 'QUẢN TRỊ VIÊN HỆ THỐNG'),
        teachingSubject: 'Quản trị & Giám sát',
        phone: user.phone || '0888358363',
        zalo: user.phone || '0888358363',
        schoolName: user.schoolName || 'Hệ thống Quản lý Lớp học Hạnh phúc',
        avatar: user.avatar || DEFAULT_TEACHER.avatar
      };

      return {
        classes: [],
        activeClassId: '',
        students: [],
        subjects: INITIAL_SUBJECTS,
        criteria: INITIAL_CRITERIA,
        transactions: [],
        rewards: INITIAL_REWARDS,
        redemptions: [],
        seatingColumns: 4,
        deskCountsPerColumn: [4, 4, 4, 4],
        deskNumberingOrder: 'vertical',
        teacherDeskPos: 'left',
        doorPos: 'right',
        blackboardPos: 'center',
        seatingAssignments: {},
        attendanceRecords: [],
        boardingRecords: [],
        timetable: INITIAL_TIMETABLE,
        timetableConfig: { morningPeriods: 4, afternoonPeriods: 3, hasSaturday: false },
        teacherRole: 'homeroom',
        subjectTeacherConfig: DEFAULT_SUBJECT_TEACHER_CONFIG,
        subjectTimetable: [],
        quickLinks: INITIAL_QUICK_LINKS,
        teacherProfile: profile,
        quizBank: [...DEFAULT_QUESTIONS],
        infographicConfig: null
      };
    }

    if (user.role === 'subject') {
      // (Đã bỏ danh sách lớp mẫu gán cứng theo tên tài khoản thử nghiệm cũ)
      const classNames = ['3A1'];
      const studentCount = 20;

      const subClasses: Classroom[] = classNames.map((name, idx) => ({
        id: `class-sub-${name.toLowerCase()}`,
        name: name,
        grade: name.startsWith('1') ? 'Khối 1' : name.startsWith('2') ? 'Khối 2' : name.startsWith('3') ? 'Khối 3' : name.startsWith('5') ? 'Khối 5' : 'Khối 4',
        color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'][idx % 6],
        academicYear: '2026–2027',
        teacherName: user.fullName || 'Giáo viên bộ môn',
        avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=SubClass_${name}&backgroundColor=3b82f6`,
        slogan: `Lớp ${name} • Học tập hăng say, rèn luyện chăm chỉ`
      }));

      let allSubStudents: Student[] = [];
      subClasses.forEach(c => {
        const stds = generateStudentsForClass(
          c.id,
          c.name,
          studentCount,
          c.grade,
          user.subjectName || 'Tin học'
        );
        allSubStudents = [...allSubStudents, ...stds];
      });

      const profile: TeacherProfile = {
        name: user.fullName || 'Giáo viên bộ môn',
        role: 'GIÁO VIÊN BỘ MÔN',
        teachingSubject: user.subjectName || 'Tin học',
        schoolName: user.schoolName || 'TRƯỜNG HỌC HẠNH PHÚC',
        avatar: user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}&backgroundColor=b6e3f4`,
        phone: user.phone || '0888358363',
        zalo: user.phone || '0888358363',
        academicYear: '2026–2027'
      };

      const cfg: SubjectTeacherConfig = {
        ...DEFAULT_SUBJECT_TEACHER_CONFIG,
        subjectName: user.subjectName || 'Tin học',
        teacherDisplayName: user.fullName || 'Giáo viên bộ môn'
      };

      return {
        classes: subClasses,
        activeClassId: subClasses[0]?.id || 'class-sub-3a1',
        students: allSubStudents,
        subjects: INITIAL_SUBJECTS,
        criteria: INITIAL_CRITERIA,
        transactions: [],
        rewards: INITIAL_REWARDS,
        redemptions: [],
        seatingColumns: 4,
        deskCountsPerColumn: [4, 4, 4, 4],
        deskNumberingOrder: 'vertical',
        teacherDeskPos: 'left',
        doorPos: 'right',
        blackboardPos: 'center',
        seatingAssignments: {},
        attendanceRecords: [],
        boardingRecords: [],
        timetable: INITIAL_TIMETABLE,
        timetableConfig: { morningPeriods: 4, afternoonPeriods: 3, hasSaturday: false },
        teacherRole: 'subject',
        subjectTeacherConfig: cfg,
        subjectTimetable: [], // tài khoản mới: TKB trống (mẫu chỉ dùng khi bấm "Dùng mẫu")
        quickLinks: INITIAL_QUICK_LINKS,
        teacherProfile: profile,
        quizBank: [...DEFAULT_QUESTIONS],
        infographicConfig: null
      };
    }

    let studentCount = 32;
    if (user.maxStudentsAllowed) studentCount = user.maxStudentsAllowed;

    const homeroomClass: Classroom = {
      id: `class-${(user.assignedClassName || '4a1').toLowerCase().replace(/\s+/g, '')}`,
      name: user.assignedClassName || '4A1',
      grade: (user.assignedClassName || '4A1').startsWith('1') ? 'Khối 1' : (user.assignedClassName || '4A1').startsWith('2') ? 'Khối 2' : (user.assignedClassName || '4A1').startsWith('3') ? 'Khối 3' : (user.assignedClassName || '4A1').startsWith('5') ? 'Khối 5' : 'Khối 4',
      color: '#3B82F6',
      academicYear: '2026–2027',
      teacherName: user.fullName || 'Giáo viên chủ nhiệm',
      teacherUsername: user.username,
      teacherRole: 'homeroom',
      avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=Class${user.assignedClassName || '4A1'}&backgroundColor=3b82f6`,
      slogan: 'Lớp học hạnh phúc • Chăm ngoan, sáng tạo, tự tin tỏa sáng',
      // Phân hiệu / điểm trường gán sẵn từ danh sách phân công chủ nhiệm (nếu có)
      ...(user.assignedBranch ? { branch: user.assignedBranch } : {}),
      ...(user.assignedCampus ? { campus: user.assignedCampus } : {})
    };

    const initialStds = generateStudentsForClass(homeroomClass.id, homeroomClass.name, studentCount, homeroomClass.grade, 'GHI CHUNG / NỀ NẾP');

    const profile: TeacherProfile = {
      ...DEFAULT_TEACHER,
      name: user.fullName || DEFAULT_TEACHER.name,
      role: 'GIÁO VIÊN CHỦ NHIỆM',
      teachingSubject: 'Giáo viên chủ nhiệm',
      phone: user.phone || DEFAULT_TEACHER.phone,
      zalo: user.phone || DEFAULT_TEACHER.zalo,
      schoolName: user.schoolName || DEFAULT_TEACHER.schoolName,
      avatar: user.avatar || DEFAULT_TEACHER.avatar
    };

    return {
      classes: [homeroomClass],
      activeClassId: homeroomClass.id,
      students: initialStds.map(s => ({
        ...s,
        subjectPoints: s.subjectPoints || { 'GHI CHUNG / NỀ NẾP': s.points || 0 }
      })),
      subjects: INITIAL_SUBJECTS,
      criteria: INITIAL_CRITERIA,
      transactions: [],
      rewards: INITIAL_REWARDS,
      redemptions: [],
      seatingColumns: 4,
      deskCountsPerColumn: [4, 4, 4, 4],
      deskNumberingOrder: 'vertical',
      teacherDeskPos: 'left',
      doorPos: 'right',
      blackboardPos: 'center',
      seatingAssignments: {},
      attendanceRecords: [],
      boardingRecords: [],
      timetable: INITIAL_TIMETABLE,
      timetableConfig: { morningPeriods: 4, afternoonPeriods: 3, hasSaturday: false },
      teacherRole: 'homeroom',
      subjectTeacherConfig: DEFAULT_SUBJECT_TEACHER_CONFIG,
      subjectTimetable: [], // tài khoản mới: TKB trống
      quickLinks: INITIAL_QUICK_LINKS,
      teacherProfile: profile,
      quizBank: [...DEFAULT_QUESTIONS],
      infographicConfig: null
    };
  };

  // Refresh users from database & dynamically synchronize official identity
  const refreshUsersList = async () => {
    try {
      const uList = await databaseService.getUsers();
      if (Array.isArray(uList) && uList.length > 0) {
        setAllUsers(uList);

        // 🌟 ÁNH XẠ ĐỊNH DANH TÀI KHOẢN ĐANG ĐĂNG NHẬP THEO KHỞI TẠO TỪ QUẢN TRỊ NHÀ TRƯỜNG
        const activeU = currentUserRef.current;
        if (activeU && activeU.username) {
          const officialName = getOfficialDisplayName(activeU, uList);
          const matchedInDb = uList.find(u => u.username.toLowerCase() === activeU.username.toLowerCase());
          const targetSchool = matchedInDb?.schoolName || activeU.schoolName;
          const targetRole = matchedInDb?.role || activeU.role;
          const targetAvatar = matchedInDb?.avatar || activeU.avatar;

          if (activeU.fullName !== officialName || (matchedInDb && activeU.schoolName !== targetSchool)) {
            const updatedUser: UserAccount = {
              ...activeU,
              fullName: officialName,
              schoolName: targetSchool,
              role: targetRole,
              avatar: targetAvatar
            };
            setCurrentUser(updatedUser);
            currentUserRef.current = updatedUser;
            try {
              if (!isViewOnly()) localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(updatedUser));
            } catch (_) {}

            setTeacherProfile(prev => ({
              ...prev,
              name: officialName,
              schoolName: targetSchool || prev.schoolName,
              avatar: targetAvatar || prev.avatar
            }));
          }
        }
      }
    } catch (_) {}
  };

  // Helper ghi nhật ký thao tác trực tuyến vào audit log
  const logUserActivity = (actionType: string, description: string, details?: any) => {
    const user = currentUserRef.current;
    if (!user) return;
    databaseService.addAuditLog({
      username: user.username,
      userFullName: user.fullName,
      role: user.role,
      actionType,
      description,
      details
    });
  };

  // Multi-browser synchronization refs
  const isRemoteDataLoadedRef = useRef(false);
  const lastRemoteTimestampRef = useRef<number>(0);
  const remoteUpdateLockUntilRef = useRef<number>(0);

  // Baseline of classes/students last received from (or sent to) the server for the admin account.
  // Used to push ONLY records the admin actually edited, so a stale admin snapshot never
  // overwrites fresher edits made by homeroom teachers.
  const adminSyncBaselineRef = useRef<{ classes: Map<string, string>; students: Map<string, string> } | null>(null);
  const buildRecordSnapshot = (items: { id: string }[]): Map<string, string> => {
    const map = new Map<string, string>();
    for (const item of items || []) {
      if (item && item.id) map.set(item.id, JSON.stringify(item));
    }
    return map;
  };

  const markRemoteUpdateActive = (durationMs = 1200) => {
    isApplyingRemoteUpdateRef.current = true;
    remoteUpdateLockUntilRef.current = Date.now() + durationMs;
    setTimeout(() => {
      if (Date.now() >= remoteUpdateLockUntilRef.current) {
        isApplyingRemoteUpdateRef.current = false;
      }
    }, durationMs + 50);
  };

  // Load user data on startup or when currentUser changes
  useEffect(() => {
    refreshUsersList();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      isRemoteDataLoadedRef.current = false;
      return;
    }

    isRemoteDataLoadedRef.current = false;

    // 🚀 Tự động làm sạch cache cũ khi nâng cấp (Auto Cache Busting v4.1.1 Clean)
    try {
      const cacheVer = localStorage.getItem('lophoc_app_cache_version');
      if (cacheVer !== 'v4.1.1-fix-gvcn1a1-students') {
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith(LOCAL_DB_PREFIX) || k.startsWith('lophoc_') || k.startsWith('lop_hoc_')) {
            // Giữ cấu hình thư mục dùng chung (Google Drive) và danh sách trường: xóa chúng làm
            // máy vừa cấu hình mất kết nối ngay lần đăng nhập đầu tiên (bản web).
            if (k !== LOCAL_AUTH_KEY && k !== LOCAL_SESSION_KEY && k !== LOCAL_DRIVE_CONFIG_KEY && k !== 'lop_hoc_schools_list_v1') {
              localStorage.removeItem(k);
            }
          }
        });
        localStorage.setItem('lophoc_app_cache_version', 'v4.1.1-fix-gvcn1a1-students');
      }
    } catch (_) {}

    const initUserData = async () => {
      setDbSyncStatus('syncing');
      try {
        const isExecutive = Boolean(
          currentUser.role === 'admin' || 
          currentUser.role === 'school_admin' || 
          currentUser.role === 'bgh' || 
          currentUser.isBgh || 
          currentUser.isSchoolAdmin || 
          currentUser.role === 'guest_admin' || 
          currentUser.isGuestAdmin
        );

        if (isExecutive) {
          // Xóa bỏ dữ liệu rác cũ trong browser cho tài khoản BGH/Quản trị
          try {
            localStorage.removeItem(LOCAL_DB_PREFIX + currentUser.username.toLowerCase());
            localStorage.removeItem('lophoc_classes');
            localStorage.removeItem('lophoc_students');
          } catch (_) {}

          // 🌟 Ban Giám Hiệu & Quản trị: Tự động kết nối và tổng hợp toàn bộ lớp, học sinh, chuyên cần, bán trú từ các giáo viên trong trường
          const isSuperAdmin = currentUser.username.toLowerCase() === 'adminquantri' || currentUser.role === 'admin';
          if (isSuperAdmin) {
            setTeacherProfile({
              ...ADMIN_QUANTRI_PROFILE,
              name: currentUser.fullName || ADMIN_QUANTRI_PROFILE.name,
              avatar: currentUser.avatar || ADMIN_QUANTRI_PROFILE.avatar,
              schoolName: currentUser.schoolName || ADMIN_QUANTRI_PROFILE.schoolName
            });
          } else {
            setTeacherProfile({
              ...DEFAULT_TEACHER,
              name: currentUser.fullName || 'BAN GIÁM HIỆU / QUẢN TRỊ VIÊN',
              role: (currentUser.role === 'bgh' || currentUser.isBgh) ? 'BAN GIÁM HIỆU' : ((currentUser.role === 'school_admin' || currentUser.isSchoolAdmin) ? 'QUẢN TRỊ NHÀ TRƯỜNG' : 'QUẢN TRỊ VIÊN HỆ THỐNG'),
              teachingSubject: 'Quản trị & Giám sát',
              schoolName: currentUser.schoolName || DEFAULT_TEACHER.schoolName,
              avatar: currentUser.avatar || DEFAULT_TEACHER.avatar
            });
          }

          const scoped = await databaseService.getExecutiveScopedData(currentUser);
          markRemoteUpdateActive(1200);
          const cleanScopedClasses = scoped.classes.filter(c => c && c.teacherRole !== 'subject' && !c.id.startsWith('class-sub-'));
          const cleanScopedStudents = scoped.students.filter(s => s && s.classId !== 'class-1791592764810' && !s.classId.startsWith('class-sub-'));
          setClasses(cleanScopedClasses);
          setStudents(cleanScopedStudents);
          setAttendanceRecords(scoped.attendanceRecords);
          setBoardingRecords(scoped.boardingRecords);
          setTransactions(scoped.transactions);
          if (scoped.classes.length > 0) {
            setActiveClassId(prev => {
              const exists = scoped.classes.some(c => c.id === prev);
              return exists ? prev : scoped.classes[0].id;
            });
          } else {
            setActiveClassId('');
          }
        } else {
          let savedData = await databaseService.loadUserData(currentUser.username);
          if (savedData) savedData = await mergeDriveClassForTeacher(currentUser, savedData);

          // (Đã bỏ "alias" gvcn1a1 <-> gvcn_1a1: không nạp dữ liệu của tài khoản khác)

          if (savedData && Array.isArray(savedData.classes) && savedData.classes.length > 0) {
            markRemoteUpdateActive(1200);
            lastRemoteTimestampRef.current = savedData.updatedAt || Date.now();
            applyUserClassroomData(savedData);
          } else {
            // Kiểm tra cache local an toàn trước khi khởi tạo dữ liệu mặc định
            let localCache: UserClassroomData | null = null;
            try {
              const raw = localStorage.getItem(LOCAL_DB_PREFIX + currentUser.username.toLowerCase());
              if (raw) localCache = JSON.parse(raw);
              // (Đã bỏ ghép bí danh gvcn1a1 <-> gvcn_1a1 — từng nạp nhầm dữ liệu lớp của tài khoản khác)
            } catch (_) {}

            if (localCache && Array.isArray(localCache.classes) && localCache.classes.length > 0) {
              markRemoteUpdateActive(1200);
              lastRemoteTimestampRef.current = localCache.updatedAt || Date.now();
              applyUserClassroomData(localCache);
            } else {
              // Chỉ khởi tạo mặc định nếu tài khoản hoàn toàn mới chưa từng có dữ liệu
              const builtData = buildDefaultDataForUser(currentUser);
              // Bản web (CSDL trên Drive): không sinh học sinh mẫu; khôi phục lớp từ Drive nếu đã có
              // (tránh tạo lớp rỗng rồi tự đẩy đè lên tệp lớp thật trên Drive)
              let initialData: UserClassroomData = builtData;
              if (schoolDriveDbService.isConfigured()) {
                initialData = { ...builtData, students: [], transactions: [] };
                try {
                  const fileName = googleDriveService.getFileNameForUser(currentUser, currentUser.assignedClassName, initialData.teacherRole);
                  const pulled = await googleDriveService.pullClassData(initialData, fileName, currentUser);
                  if (pulled.success && pulled.mergedData) initialData = pulled.mergedData;
                } catch (_) {}
              }
              markRemoteUpdateActive(1200);
              applyUserClassroomData(initialData);
              await databaseService.saveUserData(currentUser.username, initialData);
              lastRemoteTimestampRef.current = Date.now();
            }
          }
        }
        isRemoteDataLoadedRef.current = true;
        setDbSyncStatus('synced');
        const now = new Date();
        setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
      } catch (err) {
        console.warn('Initial data load warning:', err);
        setDbSyncStatus('offline');
        // Still allow editing if offline
        isRemoteDataLoadedRef.current = true;
      }
    };

    initUserData();
  }, [currentUser?.username]);

  // ⚡ Live Real-time Continuous Multi-computer / Multi-browser Synchronization via SSE
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = databaseService.subscribeRealtimeUpdates(currentUser.username, async (event) => {
      try {
        if (event.type === 'school_branches_updated' || (event as any).event === 'school_branches_updated') {
          const evSchool = (event as any).payload?.schoolName || (event as any).schoolName;
          if (!evSchool || evSchool.toLowerCase() === (currentUser.schoolName || '').toLowerCase()) {
            reloadSchoolBranches(currentUser.schoolName);
          }
          return;
        }

        const isSuper = currentUser.role === 'admin' || currentUser.username?.toLowerCase() === 'adminquantri';
        const isExecutive = Boolean(
          currentUser.role === 'school_admin' || 
          currentUser.role === 'bgh' || 
          currentUser.isBgh || 
          currentUser.isSchoolAdmin || 
          currentUser.role === 'guest_admin' || 
          currentUser.isGuestAdmin
        );

        // 🌟 ZERO-LATENCY DIRECT IN-MEMORY REALTIME UPDATES (< 50ms):
        // 1. Cập nhật / Sửa thông tin lớp học tức thì
        if (event.classData && (event.type === 'CLASS_UPDATED' || event.action === 'UPDATE_CLASS')) {
          const updatedCls = event.classData as Classroom;
          setClasses(prev => {
            const idx = prev.findIndex(c => c.id === updatedCls.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { 
                ...next[idx], 
                ...updatedCls,
                branch: updatedCls.branch !== undefined ? updatedCls.branch : next[idx].branch,
                campus: updatedCls.campus !== undefined ? updatedCls.campus : next[idx].campus
              };
              classesRef.current = next;
              return next;
            } else {
              const next = [...prev, updatedCls];
              classesRef.current = next;
              return next;
            }
          });
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
          return;
        }

        // 2. Xóa lớp học tức thì
        if (event.classId && (event.type === 'CLASS_DELETED' || event.action === 'DELETE_CLASS')) {
          setClasses(prev => {
            const next = prev.filter(c => c.id !== event.classId);
            classesRef.current = next;
            return next;
          });
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
          return;
        }

        // 3. Cập nhật Điểm danh / Chuyên cần tức thì (Deep merge)
        if (event.attendanceRecord && (event.type === 'ATTENDANCE_UPDATED' || event.action === 'UPDATE_ATTENDANCE')) {
          const rec = event.attendanceRecord as DailyAttendance;
          if (rec && rec.date && rec.classId) {
            setAttendanceRecords(prev => {
              const idx = prev.findIndex(r => r.date === rec.date && r.classId === rec.classId);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { 
                  ...next[idx], 
                  ...rec,
                  records: { ...(next[idx].records || {}), ...(rec.records || {}) }
                };
                return next;
              }
              return [...prev, rec];
            });
            if (isExecutive || isSuper) {
              databaseService.getExecutiveScopedData(currentUser).then(scoped => {
                setAttendanceRecords(scoped.attendanceRecords);
                setBoardingRecords(scoped.boardingRecords);
                setDbSyncStatus('synced');
                const now = new Date();
                setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
              }).catch(() => {});
            }
            return;
          }
        }

        // 4. Cập nhật Bán trú tức thì (Deep merge)
        if (event.boardingRecord && (event.type === 'BOARDING_UPDATED' || event.action === 'UPDATE_BOARDING')) {
          const rec = event.boardingRecord as DailyBoardingMeal;
          if (rec && rec.date && rec.classId) {
            setBoardingRecords(prev => {
              const idx = prev.findIndex(r => r.date === rec.date && r.classId === rec.classId);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { 
                  ...next[idx], 
                  ...rec,
                  records: { ...(next[idx].records || {}), ...(rec.records || {}) }
                };
                return next;
              }
              return [...prev, rec];
            });
            if (isExecutive || isSuper) {
              databaseService.getExecutiveScopedData(currentUser).then(scoped => {
                setAttendanceRecords(scoped.attendanceRecords);
                setBoardingRecords(scoped.boardingRecords);
                setDbSyncStatus('synced');
                const now = new Date();
                setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
              }).catch(() => {});
            }
            return;
          }
        }

        // ⚡ 4b. GVCN xác nhận điểm danh/bán trú → BGH/Quản trị trường ngay lập tức nhận số liệu tổng hợp
        if (event.type === 'ATTENDANCE_CONFIRMED' || event.type === 'BOARDING_CONFIRMED') {
          // Cập nhật ngay record vào memory trước
          if (event.attendanceRecord) {
            const rec = event.attendanceRecord as DailyAttendance;
            if (rec && rec.date && rec.classId) {
              setAttendanceRecords(prev => {
                const idx = prev.findIndex(r => r.date === rec.date && r.classId === rec.classId);
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = { ...next[idx], ...rec, records: { ...(next[idx].records || {}), ...(rec.records || {}) } };
                  return next;
                }
                return [...prev, rec];
              });
            }
          }
          if (event.boardingRecord) {
            const rec = event.boardingRecord as DailyBoardingMeal;
            if (rec && rec.date && rec.classId) {
              setBoardingRecords(prev => {
                const idx = prev.findIndex(r => r.date === rec.date && r.classId === rec.classId);
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = { ...next[idx], ...rec, records: { ...(next[idx].records || {}), ...(rec.records || {}) } };
                  return next;
                }
                return [...prev, rec];
              });
            }
          }
          // Nếu là BGH/Quản trị trường: tổng hợp lại số liệu tức thì từ server
          if (isExecutive || isSuper) {
            try {
              const scoped = await databaseService.getExecutiveScopedData(currentUser);
              markRemoteUpdateActive(800);
              setAttendanceRecords(scoped.attendanceRecords);
              setBoardingRecords(scoped.boardingRecords);
              setDbSyncStatus('synced');
              const now = new Date();
              setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
            } catch (_) {}
          }
          return;
        }

        // 5. Fallback làm tươi toàn diện cho Quản trị tối cao (adminquantri) & BGH / Quản trị trường
        if (isSuper || isExecutive) {
          // Đồng nhất cơ chế truy xuất: Cả Quản trị tối cao và BGH/Quản trị trường đều lấy số liệu liên thông trực tiếp
          const scoped = await databaseService.getExecutiveScopedData(currentUser);
          if (scoped && Array.isArray(scoped.classes)) {
            markRemoteUpdateActive(1200);
            const cleanClasses = (scoped.classes || []).filter(c => c && c.teacherRole !== 'subject' && !c.id.startsWith('class-sub-'));
            const cleanStudents = (scoped.students || []).filter(s => s && s.classId !== 'class-1791592764810' && !s.classId.startsWith('class-sub-'));
            setClasses(cleanClasses);
            setStudents(cleanStudents);
            setAttendanceRecords(scoped.attendanceRecords || []);
            setBoardingRecords(scoped.boardingRecords || []);
            setTransactions(scoped.transactions || []);
            setDbSyncStatus('synced');
            const now = new Date();
            setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
          }
        } else {
          const target = event.username?.toLowerCase();
          const me = currentUser.username.toLowerCase();
          if (!target || target === me || target === 'all' || target === 'admin' || event.targetUsername === me) {
            const fresh = await databaseService.loadUserData(currentUser.username);
            if (fresh) {
              markRemoteUpdateActive(1200);
              lastRemoteTimestampRef.current = fresh.updatedAt || Date.now();
              applyUserClassroomData(fresh);
              setDbSyncStatus('synced');
              const now = new Date();
              setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
            }
          }
        }
      } catch (err) {
        console.warn('Realtime event handler error:', err);
      }
    });

    return () => unsubscribe();
  }, [currentUser?.username, currentUser?.role, currentUser?.schoolName]);

  // Real-time Multi-browser & Multi-tab sync polling (Fallback layer) — vòng cập nhật 15 giây cho MỌI vai trò (utils/liveSync)
  useEffect(() => {
    if (!currentUser) return;
    let ownFileStamp = '';

    let isChecking = false;
    let lastScopedSignature = '';
    const checkRemoteChanges = async () => {
      if (!isRemoteDataLoadedRef.current || isChecking) return;
      // ⚡ Nhẹ máy: tab đang ẩn thì không làm mới (khi quay lại tab sẽ làm mới ngay)
      if (typeof document !== 'undefined' && document.hidden) return;
      if (Date.now() < remoteUpdateLockUntilRef.current) return;
      isChecking = true;
      try {
        const isExecutive = Boolean(
          currentUser.role === 'school_admin' || 
          currentUser.role === 'bgh' || 
          currentUser.isBgh || 
          currentUser.isSchoolAdmin || 
          currentUser.role === 'guest_admin' || 
          currentUser.isGuestAdmin
        );

        if (currentUser.role === 'admin' || currentUser.username?.toLowerCase() === 'adminquantri' || isExecutive) {
          const scoped = await databaseService.getExecutiveScopedData(currentUser);
          if (scoped && Array.isArray(scoped.classes)) {
            // ⚡ Chỉ cập nhật giao diện khi dữ liệu tổng hợp thật sự thay đổi (tránh vẽ lại toàn ứng dụng mỗi 12 giây)
            let signature = '';
            try {
              signature = JSON.stringify([scoped.classes, scoped.students, scoped.attendanceRecords, scoped.boardingRecords, (scoped.transactions || []).length]);
            } catch (_) { signature = String(Date.now()); }
            if (signature === lastScopedSignature) return;
            lastScopedSignature = signature;
            markRemoteUpdateActive(1200);
            const cleanClasses = (scoped.classes || []).filter(c => c && c.teacherRole !== 'subject' && !c.id.startsWith('class-sub-'));
            const cleanStudents = (scoped.students || []).filter(s => s && s.classId !== 'class-1791592764810' && !s.classId.startsWith('class-sub-'));
            setClasses(cleanClasses);
            setStudents(cleanStudents);
            setAttendanceRecords(scoped.attendanceRecords || []);
            setBoardingRecords(scoped.boardingRecords || []);
            setTransactions(scoped.transactions || []);
            setDbSyncStatus('synced');
            const now = new Date();
            setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
          }
        } else {
          const remote = await databaseService.loadUserData(currentUser.username);
          if (remote && remote.updatedAt && remote.updatedAt > (lastRemoteTimestampRef.current + 50)) {
            markRemoteUpdateActive(1200);
            lastRemoteTimestampRef.current = remote.updatedAt;
            applyUserClassroomData(remote);
            setDbSyncStatus('synced');
            const now = new Date();
            setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
          }
          // ☁️ Bản web (Drive dùng chung): tệp lớp của chính giáo viên đổi trên Drive (máy / trình duyệt khác vừa lưu) → gộp về.
          // Bỏ qua khi máy còn thay đổi chưa đẩy hoặc vừa sửa < 20 giây (không ghi đè chỉnh sửa đang làm).
          const quiet = Date.now() - lastLocalChangeAtRef.current > LOCAL_EDIT_QUIET_MS && !googleDriveService.isPushPending(currentUser.username);
          if ((window as any).__lhhpApiAvailable !== true && schoolDriveDbService.isConfigured() && quiet && !isViewOnly()) {
            const files = await googleDriveService.listClassFilesMeta();
            const cur = currentDataGetterRef.current();
            // Tên tệp đặt GIỐNG lúc đẩy lên (theo lớp đang mở), dự phòng theo lớp được giao của tài khoản
            const activeCls = (cur.classes || []).find(c => c && c.id === cur.activeClassId) || (cur.classes || [])[0];
            const names = Array.from(new Set([
              googleDriveService.getFileNameForUser(currentUser, activeCls?.name, cur.teacherRole),
              googleDriveService.getFileNameForUser(currentUser, currentUser.assignedClassName, cur.teacherRole),
            ].map(n => n.toLowerCase())));
            const f = files?.find(x => names.includes(String(x.name).toLowerCase()));
            const fileName = f?.name || names[0];
            if (f?.updatedAt && f.updatedAt !== ownFileStamp) {
              const firstSeen = !ownFileStamp;
              ownFileStamp = f.updatedAt;
              if (!firstSeen && Date.now() - lastLocalChangeAtRef.current > LOCAL_EDIT_QUIET_MS) {
                const pulled = await googleDriveService.pullClassData(currentDataGetterRef.current(), fileName, currentUser);
                if (pulled.success && pulled.mergedData && Date.now() - lastLocalChangeAtRef.current > LOCAL_EDIT_QUIET_MS) {
                  markRemoteUpdateActive(1200);
                  applyUserClassroomData(pulled.mergedData);
                  setDbSyncStatus('synced');
                  const now = new Date();
                  setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
                }
              }
            }
          }
          // 📚 Kho câu hỏi cá nhân: gộp hai chiều với Drive cá nhân (nếu đã kết nối)
          if (isPersonalQuizUser(currentUser) && quizBankStore.getDriveConfig(currentUser.username)) {
            await syncPersonalQuizRef.current().catch(() => false);
          }
        }
      } catch (_) {
        // silent
      } finally {
        isChecking = false;
      }
    };

    // Chu kỳ cập nhật theo vai trò (utils/liveSync): Quản trị / BGH dữ liệu chi tiết lớp 60 s, giáo viên 60 s;
    // lệch giờ ngẫu nhiên ±15%, tab ẩn thì nghỉ. (Báo cáo số liệu BGH làm mới 15 s ở DriveAttendanceStatsPanel.)
    const isManagerRole = Boolean(currentUser.role === 'admin' || currentUser.role === 'school_admin' || currentUser.role === 'bgh'
      || currentUser.isBgh || currentUser.isSchoolAdmin || currentUser.role === 'guest_admin' || currentUser.isGuestAdmin);
    let lastCheckAt = Date.now();
    const runCheck = async () => { lastCheckAt = Date.now(); await checkRemoteChanges(); };
    const stopLoop = startJitteredLoop(runCheck, isManagerRole ? MANAGER_DATA_MS : TEACHER_SYNC_MS);

    // Quay lại tab / cửa sổ → cập nhật ngay (nhưng không quá 1 lần / 20 giây)
    const onFocus = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (Date.now() - lastCheckAt < 20000) return;
      runCheck();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      stopLoop();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [currentUser?.username]);

  // Kiểm tra thời hạn phiên đăng nhập 300 phút liên tục
  useEffect(() => {
    const sessionTimer = setInterval(() => {
      if (!databaseService.isSessionValid()) {
        if (currentUserRef.current) {
          console.warn('Phiên làm việc 300 phút đã kết thúc. Vui lòng đăng nhập lại.');
          logoutUser();
        } else {
          setIsAuthModalOpen(true);
        }
      }
    }, 20000); // 20 giây kiểm tra một lần

    return () => clearInterval(sessionTimer);
  }, []);

  // Debounced auto-save & database synchronization (Super-fast 200ms debounce with remote echo protection)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (isRemoteDataLoadedRef.current && currentUser && Date.now() >= remoteUpdateLockUntilRef.current && !isApplyingRemoteUpdateRef.current) {
      lastLocalChangeAtRef.current = Date.now(); // chỉnh sửa trên máy (không phải dữ liệu vừa nhận) → vòng 15 giây tạm không kéo về
    }

    // Do NOT auto-save if remote data is still loading
    if (!isRemoteDataLoadedRef.current || !currentUser) {
      if (currentUser?.role === 'admin') {
        adminSyncBaselineRef.current = { classes: buildRecordSnapshot(classes), students: buildRecordSnapshot(students) };
      }
      return;
    }

    // Do NOT auto-save if this state update was triggered by receiving data from server (breaks echo loops)
    if (Date.now() < remoteUpdateLockUntilRef.current || isApplyingRemoteUpdateRef.current) {
      if (currentUser.role === 'admin') {
        adminSyncBaselineRef.current = { classes: buildRecordSnapshot(classes), students: buildRecordSnapshot(students) };
      }
      return;
    }

    setDbSyncStatus('syncing');
    const timer = setTimeout(() => {
      const nowTs = Date.now();
      lastRemoteTimestampRef.current = nowTs;

      const isExecutive = Boolean(
        currentUser.role === 'school_admin' || 
        currentUser.role === 'bgh' || 
        currentUser.isBgh || 
        currentUser.isSchoolAdmin || 
        currentUser.role === 'guest_admin' || 
        currentUser.isGuestAdmin
      );

      if (currentUser.role === 'admin') {
        // Delta sync: only records changed by the admin since the last server snapshot
        const baseline = adminSyncBaselineRef.current;
        const changedClasses = baseline
          ? classes.filter(c => c && c.id && baseline.classes.get(c.id) !== JSON.stringify(c))
          : classes;
        const changedStudents = baseline
          ? students.filter(s => s && s.id && baseline.students.get(s.id) !== JSON.stringify(s))
          : students;
        adminSyncBaselineRef.current = { classes: buildRecordSnapshot(classes), students: buildRecordSnapshot(students) };

        if (changedClasses.length > 0 || changedStudents.length > 0) {
          databaseService.syncAdminAllData(changedClasses, changedStudents).then(() => {
            setDbSyncStatus('synced');
            const now = new Date();
            setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
          }).catch(() => {
            setDbSyncStatus('offline');
          });
        } else {
          setDbSyncStatus('synced');
        }
      } else if (isExecutive) {
        // BGH & Quản trị trường cập nhật trạng thái
        setDbSyncStatus('synced');
        const now = new Date();
        setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
      } else {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          updatedAt: nowTs
        };
        databaseService.saveUserData(currentUser.username, payload).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      }

      // 🌟 TỰ ĐỘNG LƯU VÀ GHI ĐÈ LIÊN TỤC THEO THỜI GIAN THỰC (MÁY TÍNH & GOOGLE DRIVE)
      // Áp dụng cho TOÀN BỘ các vai trò: Quản trị tối cao, Quản trị nhà trường, Ban giám hiệu, GVCN & GVBM!
      try {
        const currentSnapshot = getCurrentUserData();
        const activeClass = classes.find(c => c.id === activeClassId) || classes[0];

        // 💾 1. Tự động ghi đè 1 file JSON duy nhất vào thư mục máy tính đã chọn (ổ D/E/F) theo đúng vai trò tài khoản
        dataStorageService.autoSaveToConfiguredLocation(
          currentSnapshot,
          currentUser,
          teacherRole,
          activeClass?.name
        );

        // ☁️ 2. Tự động đồng bộ và ghi đè liên tục theo thời gian thực lên Google Drive đã cấu hình
        googleDriveService.autoSyncCurrentData(
          currentSnapshot,
          currentUser,
          activeClassId,
          teacherRole
        );
      } catch (autoErr) {
        console.warn('Lỗi tự động lưu file ổ đĩa / Google Drive:', autoErr);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [
    classes, activeClassId, students, subjects, criteria, transactions,
    rewards, redemptions, seatingColumns, deskCountsPerColumn, deskNumberingOrder,
    teacherDeskPos, doorPos, blackboardPos, seatingAssignments, attendanceRecords,
    boardingRecords, timetable, timetableConfig, teacherRole, subjectTeacherConfig,
    subjectTimetable, quickLinks, teacherProfile, quizBank, infographicConfig, vaultState,
    schoolBranches, currentUser?.username
  ]);

  // ✏️ GVCN (bản web Drive): nhận điều chỉnh của Quản trị cho lớp mình (tệp dieuchinh_quantri.json), mỗi 60 giây.
  // Áp vào lớp → tự lưu như bình thường → tệp lớp mang dấu "đã nhận" để màn tổng hợp không áp lại.
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'homeroom') return;
    if (!googleDriveService.getConfig().scriptUrl) return;
    let cancelled = false;
    const run = async () => {
      if (cancelled || !isRemoteDataLoadedRef.current) return;
      try {
        const entries = await adminEditsService.fetchEntries(0);
        if (cancelled || Object.keys(entries).length === 0) return;
        const curClasses = classesRef.current.length > 0 ? classesRef.current : classes;
        const curStudents = studentsRef.current.length > 0 ? studentsRef.current : students;
        const homeroomIds = curClasses
          .filter(c => c && c.teacherRole !== 'subject' && !c.id.startsWith('class-sub-'))
          .map(c => c.id);
        const applied = getAppliedAdminEdits(currentUser.username);
        const res = adminEditsService.applyForTeacher(entries, curClasses, curStudents, applied, homeroomIds);
        if (Object.keys(res.newlyApplied).length > 0) mergeAppliedAdminEdits(currentUser.username, res.newlyApplied);
        if (res.changed) {
          isApplyingRemoteUpdateRef.current = false;
          remoteUpdateLockUntilRef.current = 0;
          classesRef.current = res.classes;
          studentsRef.current = res.students;
          setClasses(res.classes);
          setStudents(res.students);
        }
      } catch (err) {
        console.warn('Nhận điều chỉnh của Quản trị lỗi:', err);
      }
    };
    const first = setTimeout(run, 4000);
    const stopEdits = startJitteredLoop(run, ADMIN_EDITS_MS); // điều chỉnh của Quản trị: 60 s (utils/liveSync)
    return () => {
      cancelled = true;
      clearTimeout(first);
      stopEdits();
    };
  }, [currentUser?.username, currentUser?.role]);

  // User Auth Actions
  const loginUser = async (
    username: string, 
    password: string, 
    selectedRoleScope?: LoginRoleScope, 
    selectedSchoolName?: string
  ): Promise<{ success: boolean; message?: string }> => {
    // 1. Save current workspace before switching if logged in
    if (currentUser) {
      const isCurrentExecutive = Boolean(
        currentUser.role === 'admin' || 
        currentUser.role === 'school_admin' || 
        currentUser.role === 'bgh' || 
        currentUser.isBgh || 
        currentUser.isSchoolAdmin || 
        currentUser.role === 'guest_admin' || 
        currentUser.isGuestAdmin ||
        currentUser.username?.toLowerCase() === 'adminquantri'
      );
      if (!isCurrentExecutive) {
        const currentData = getCurrentUserData();
        await databaseService.saveUserData(currentUser.username, currentData);
      }
    }

    // 2. Perform login
    const res = await databaseService.login(username, password, selectedRoleScope, selectedSchoolName);
    if (res.success && res.user) {
      // Tài khoản giáo viên gắn nhân sự (staffCode): nhớ phiên trên máy tới khi Đăng xuất → "Chấm công của tôi" vào thẳng
      // (Apps Script 1.1.6 xác thực bằng tài khoản phần mềm, không hỏi lại mật khẩu điểm danh)
      try {
        if (res.user.staffCode) saveTeacherAuth(String(res.user.username || ''), password);
        else clearTeacherAuth();
      } catch (_) { /* ignore */ }
      const officialName = getOfficialDisplayName(res.user, allUsers);
      const newUser: UserAccount = {
        ...res.user,
        fullName: officialName
      };
      setCurrentUser(newUser);
      currentUserRef.current = newUser;
      // 🔐 Khóa két cá nhân (chỉ sinh được lúc có mật khẩu) — dùng để mở / khóa link Drive cá nhân
      if (isPersonalQuizUser(newUser)) {
        deriveVaultKey(newUser.username, password)
          .then(k => (k ? quizBankStore.setVaultKey(newUser.username, k) : undefined))
          .then(() => setVaultKeyTick(t => t + 1))
          .catch(() => {});
      }

      // Cập nhật cảnh báo tài khoản Demo theo yêu cầu
      setDemoWarningMessage(null);

      // Ghi nhật ký đăng nhập
      databaseService.addAuditLog({
        username: newUser.username,
        userFullName: newUser.fullName,
        role: newUser.role,
        actionType: 'OTHER',
        description: `Đăng nhập vào hệ thống (${newUser.fullName})`
      });

      // Gán vai trò chính xác theo tài khoản được phân quyền (GVCN / GVBM)
      // Tài khoản quản trị luôn là 'homeroom'
      if (newUser.role === 'homeroom') {
        setTeacherRoleState('homeroom');
      } else if (newUser.role === 'subject') {
        setTeacherRoleState('subject');
      } else {
        setTeacherRoleState('homeroom');
      }

      // 3. Load target user's workspace
      const isNewExecutive = Boolean(
        newUser.role === 'admin' || 
        newUser.role === 'school_admin' || 
        newUser.role === 'bgh' || 
        newUser.isBgh || 
        newUser.isSchoolAdmin || 
        newUser.role === 'guest_admin' || 
        newUser.isGuestAdmin
      );

      if (isNewExecutive) {
        try {
          if (newUser.role !== 'admin') {
            localStorage.removeItem(LOCAL_DB_PREFIX + newUser.username.toLowerCase());
          }
        } catch (_) {}

        const isSuperAdmin = newUser.username.toLowerCase() === 'adminquantri' || newUser.role === 'admin';
        if (isSuperAdmin) {
          setTeacherProfile({
            ...ADMIN_QUANTRI_PROFILE,
            name: officialName,
            avatar: newUser.avatar || ADMIN_QUANTRI_PROFILE.avatar,
            schoolName: newUser.schoolName || ADMIN_QUANTRI_PROFILE.schoolName
          });
        } else {
          setTeacherProfile({
            ...DEFAULT_TEACHER,
            name: officialName,
            role: (newUser.role === 'bgh' || newUser.isBgh) ? 'BAN GIÁM HIỆU' : ((newUser.role === 'school_admin' || newUser.isSchoolAdmin) ? 'QUẢN TRỊ NHÀ TRƯỜNG' : 'QUẢN TRỊ VIÊN HỆ THỐNG'),
            teachingSubject: 'Quản trị & Giám sát',
            schoolName: newUser.schoolName || DEFAULT_TEACHER.schoolName,
            avatar: newUser.avatar || DEFAULT_TEACHER.avatar
          });
        }

        const scoped = await databaseService.getExecutiveScopedData(newUser);
        markRemoteUpdateActive(1200);
        const cleanScopedClasses = scoped.classes.filter(c => c && c.teacherRole !== 'subject' && !c.id.startsWith('class-sub-'));
        const cleanScopedStudents = scoped.students.filter(s => s && s.classId !== 'class-1791592764810' && !s.classId.startsWith('class-sub-'));
        setClasses(cleanScopedClasses);
        setStudents(cleanScopedStudents);
        setAttendanceRecords(scoped.attendanceRecords);
        setBoardingRecords(scoped.boardingRecords);
        setTransactions(scoped.transactions);
        if (cleanScopedClasses.length > 0) {
          setActiveClassId(cleanScopedClasses[0].id);
        }
      } else {
        let targetData = await databaseService.loadUserData(newUser.username);
        if (targetData) targetData = await mergeDriveClassForTeacher(newUser, targetData);
        if (targetData && Array.isArray(targetData.classes) && targetData.classes.length > 0) {
          applyUserClassroomData(targetData);
        } else {
          let localCache: UserClassroomData | null = null;
          try {
            const raw = localStorage.getItem(LOCAL_DB_PREFIX + newUser.username.toLowerCase());
            if (raw) localCache = JSON.parse(raw);
          } catch (_) {}

          if (localCache && Array.isArray(localCache.classes) && localCache.classes.length > 0) {
            applyUserClassroomData(await mergeDriveClassForTeacher(newUser, localCache));
          } else if (schoolDriveDbService.isConfigured()) {
            // 🏫 Bản web (CSDL trên Drive): KHÔNG sinh học sinh mẫu (tránh sai số liệu báo cáo BGH).
            // Khôi phục dữ liệu lớp của giáo viên từ thư mục dùng chung nếu đã có (đăng nhập máy mới).
            let startData: UserClassroomData = { ...buildDefaultDataForUser(newUser), students: [], transactions: [] };
            try {
              const fileName = googleDriveService.getFileNameForUser(newUser, newUser.assignedClassName, startData.teacherRole);
              const pulled = await googleDriveService.pullClassData(startData, fileName, newUser);
              if (pulled.success && pulled.mergedData) startData = pulled.mergedData;
            } catch (_) {}
            applyUserClassroomData(startData);
            await databaseService.saveUserData(newUser.username, startData);
          } else {
            const defaultData = buildDefaultDataForUser(newUser);
            applyUserClassroomData(defaultData);
            await databaseService.saveUserData(newUser.username, defaultData);
          }
        }
      }

      await refreshUsersList();
      return { success: true, message: res.message };
    }
    return { success: false, message: res.message };
  };

  const logoutUser = async () => {
    setDemoWarningMessage(null);
    // Đẩy ngay phần thay đổi đang chờ trong hàng đợi 15 giây trước khi rời tài khoản
    try { await googleDriveService.flushPendingPush(); } catch (_) { /* ignore */ }
    clearTeacherAuth();
    // Bắt buộc lưu dữ liệu đầy đủ lên hệ thống máy chủ trước khi đăng xuất
    if (currentUser) {
      databaseService.addAuditLog({
        username: currentUser.username,
        userFullName: currentUser.fullName,
        role: currentUser.role,
        actionType: 'OTHER',
        description: `Đăng xuất khỏi hệ thống (${currentUser.fullName})`
      });
      const isExecutive = Boolean(
        currentUser.role === 'admin' || 
        currentUser.role === 'school_admin' || 
        currentUser.role === 'bgh' || 
        currentUser.isBgh || 
        currentUser.isSchoolAdmin || 
        currentUser.role === 'guest_admin' || 
        currentUser.isGuestAdmin
      );
      if (!isExecutive) {
        const currentData = getCurrentUserData();
        try {
          await databaseService.saveUserData(currentUser.username, currentData);
        } catch (_) {}
      }
    }
    databaseService.logout();
    if (currentUser) quizBankStore.setVaultKey(currentUser.username, null).catch(() => {});
    setVaultState({ owner: '' });
    setVaultKeyReady(false);
    // Không để bộ câu hỏi của tài khoản vừa đăng xuất nằm lại trong bộ nhớ chung của trình duyệt
    // (kho riêng của tài khoản vẫn còn nguyên trong IndexedDB / Drive cá nhân)
    setQuizBank(DEFAULT_QUESTIONS);
    saveQuizBank(DEFAULT_QUESTIONS);
    setCurrentUser(null);
    setIsAuthModalOpen(true);
  };

  // 👁️ CHẾ ĐỘ CHỈ XEM: Quản trị / BGH xem lớp của giáo viên mà KHÔNG đăng nhập thay giáo viên.
  // Phiên trong localStorage vẫn là tài khoản quản trị (tải lại trang = quay về), mọi lệnh ghi bị chặn ở tầng dịch vụ.
  const [viewAs, setViewAsState] = useState<ViewAsInfo | null>(getViewAs());
  useEffect(() => subscribeViewAs(setViewAsState), []);

  const viewAsTeacher = async (username: string): Promise<boolean> => {
    const admin = currentUserRef.current;
    const target = allUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!admin || !target) return false;
    const officialName = getOfficialDisplayName(target, allUsers);
    setViewAs({
      adminUsername: admin.username, adminFullName: admin.fullName,
      targetUsername: target.username, targetFullName: officialName, targetRole: target.role,
      className: target.role === 'homeroom' ? target.assignedClassName : target.subjectName,
    });
    const viewUser: UserAccount = { ...target, fullName: officialName };
    setCurrentUser(viewUser);
    currentUserRef.current = viewUser;
    setTeacherRoleState(target.role === 'subject' ? 'subject' : 'homeroom');
    markRemoteUpdateActive(1500);
    // Dữ liệu: bản trên máy (nếu có) → gộp lớp đang có trên Drive dùng chung; không sinh học sinh mẫu, không lưu
    let data: UserClassroomData | null = null;
    try { data = await databaseService.loadUserData(target.username); } catch (_) { data = null; }
    // Chưa có dữ liệu: GVBM không dựng lớp mẫu (3A1), GVCN chỉ có khung lớp được phân công — không có học sinh
    let start: UserClassroomData = data && Array.isArray(data.classes) && data.classes.length > 0
      ? data
      : (() => {
          const built = buildDefaultDataForUser(viewUser);
          return { ...built, classes: target.role === 'subject' ? [] : built.classes, activeClassId: target.role === 'subject' ? '' : built.activeClassId, students: [], transactions: [] };
        })();
    try {
      const fileName = googleDriveService.getFileNameForUser(viewUser, viewUser.assignedClassName, start.teacherRole);
      const pulled = await googleDriveService.pullClassData(start, fileName, viewUser);
      if (pulled.success && pulled.mergedData) start = pulled.mergedData;
    } catch (_) { /* chỉ xem: dùng dữ liệu đang có */ }
    const cleaned = stripSampleData(start);
    if (cleaned.changed) start = cleaned.data;
    if (!(start.students || []).length) {
      const info = getViewAs();
      if (info) setViewAs({ ...info, note: cleaned.removedStudents
        ? 'Giáo viên này chưa khởi tạo dữ liệu lớp thật (dữ liệu mẫu do phiên bản cũ tạo ra đã được ẩn).'
        : 'Giáo viên này chưa đăng nhập hoặc chưa có danh sách học sinh trên Google Drive.' });
    }
    applyUserClassroomData(start);
    return true;
  };

  const exitViewAs = () => {
    setViewAs(null);
    // Phiên quản trị vẫn nằm trong localStorage → tải lại là về đúng tài khoản quản trị, dữ liệu quản trị đầy đủ
    window.location.reload();
  };

  const switchUserAccount = async (username: string): Promise<boolean> => {
    // Yêu cầu: Tài khoản giáo viên chủ nhiệm và giáo viên bộ môn không thể chuyển đổi qua lại với các tài khoản khác
    // mà bắt buộc phải đăng xuất và đăng nhập với tài khoản được gán đúng vai trò.
    const targetUser = allUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!targetUser) return false;

    const isExecutiveAdmin = Boolean(
      !currentUser ||
      currentUser.role === 'admin' || 
      currentUser.role === 'school_admin' || 
      currentUser.isSchoolAdmin || 
      currentUser.role === 'bgh' || 
      currentUser.isBgh
    );
    if (!isExecutiveAdmin) {
      const isTargetAdmin = targetUser.role === 'admin' || targetUser.role === 'school_admin' || Boolean(targetUser.isSchoolAdmin) || targetUser.role === 'bgh';
      if (!isTargetAdmin) {
        console.warn('Tài khoản giáo viên không thể chuyển đổi nhanh sang tài khoản khác. Vui lòng đăng xuất để đăng nhập.');
        return false;
      }
    }

    // 1. Save current workspace
    if (currentUser) {
      const isCurrentExecutive = Boolean(
        currentUser.role === 'admin' || 
        currentUser.role === 'school_admin' || 
        currentUser.role === 'bgh' || 
        currentUser.isBgh || 
        currentUser.isSchoolAdmin || 
        currentUser.role === 'guest_admin' || 
        currentUser.isGuestAdmin
      );
      if (!isCurrentExecutive) {
        const currentData = getCurrentUserData();
        await databaseService.saveUserData(currentUser.username, currentData);
      }
    }

    // 2. Switch current user
    const officialTargetName = getOfficialDisplayName(targetUser, allUsers);
    const updatedTargetUser: UserAccount = {
      ...targetUser,
      fullName: officialTargetName
    };
    setCurrentUser(updatedTargetUser);
    currentUserRef.current = updatedTargetUser;
    localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(updatedTargetUser));
    databaseService.touchSession();

    // 3. Load target data
    const isTargetExecutive = Boolean(
      updatedTargetUser.role === 'admin' || 
      updatedTargetUser.role === 'school_admin' || 
      updatedTargetUser.role === 'bgh' || 
      updatedTargetUser.isBgh || 
      updatedTargetUser.isSchoolAdmin || 
      updatedTargetUser.role === 'guest_admin' || 
      updatedTargetUser.isGuestAdmin
    );

    // Gán vai trò theo tài khoản: Quản trị viên luôn là 'homeroom'
    if (isTargetExecutive) {
      setTeacherRoleState('homeroom');
    } else if (targetUser.role === 'subject') {
      setTeacherRoleState('subject');
    } else {
      setTeacherRoleState('homeroom');
    }

    if (isTargetExecutive) {
      const isSuperAdmin = updatedTargetUser.username.toLowerCase() === 'adminquantri' || updatedTargetUser.role === 'admin';
      if (isSuperAdmin) {
        setTeacherProfile({
          ...ADMIN_QUANTRI_PROFILE,
          name: officialTargetName,
          avatar: updatedTargetUser.avatar || ADMIN_QUANTRI_PROFILE.avatar,
          schoolName: updatedTargetUser.schoolName || ADMIN_QUANTRI_PROFILE.schoolName
        });
      } else {
        setTeacherProfile({
          ...DEFAULT_TEACHER,
          name: officialTargetName,
          role: (updatedTargetUser.role === 'bgh' || updatedTargetUser.isBgh) ? 'BAN GIÁM HIỆU' : ((updatedTargetUser.role === 'school_admin' || updatedTargetUser.isSchoolAdmin) ? 'QUẢN TRỊ NHÀ TRƯỜNG' : 'QUẢN TRỊ VIÊN HỆ THỐNG'),
          teachingSubject: 'Quản trị & Giám sát',
          schoolName: updatedTargetUser.schoolName || DEFAULT_TEACHER.schoolName,
          avatar: updatedTargetUser.avatar || DEFAULT_TEACHER.avatar
        });
      }

      const scoped = await databaseService.getExecutiveScopedData(targetUser);
      markRemoteUpdateActive(1200);
      const cleanScopedClasses = scoped.classes.filter(c => c && c.teacherRole !== 'subject' && !c.id.startsWith('class-sub-'));
      const cleanScopedStudents = scoped.students.filter(s => s && s.classId !== 'class-1791592764810' && !s.classId.startsWith('class-sub-'));
      setClasses(cleanScopedClasses);
      setStudents(cleanScopedStudents);
      setAttendanceRecords(scoped.attendanceRecords);
      setBoardingRecords(scoped.boardingRecords);
      setTransactions(scoped.transactions);
      if (cleanScopedClasses.length > 0) {
        setActiveClassId(cleanScopedClasses[0].id);
      }
    } else {
      const targetData = await databaseService.loadUserData(targetUser.username);
      if (targetData) {
        applyUserClassroomData(targetData);
      } else {
        const built = buildDefaultDataForUser(targetUser);
        const defaultData = schoolDriveDbService.isConfigured() ? { ...built, students: [], transactions: [] } : built;
        applyUserClassroomData(defaultData);
        await databaseService.saveUserData(targetUser.username, defaultData);
      }
    }

    return true;
  };

  const syncDatabaseNow = async (overrideStudents?: any, overrideClasses?: any): Promise<void> => {
    if (!currentUser) return;
    // Release any anti-echo locks immediately so user-triggered sync always wins
    isApplyingRemoteUpdateRef.current = false;
    remoteUpdateLockUntilRef.current = 0;

    const curStudents = Array.isArray(overrideStudents)
      ? overrideStudents
      : (studentsRef.current.length > 0 ? studentsRef.current : students);
    const curClasses = Array.isArray(overrideClasses)
      ? overrideClasses
      : (classesRef.current.length > 0 ? classesRef.current : classes);
    const nowTs = Date.now();
    lastRemoteTimestampRef.current = nowTs;

    setDbSyncStatus('syncing');
    const isSuperOrExecutive = Boolean(
      currentUser.role === 'admin' || 
      currentUser.username?.toLowerCase() === 'adminquantri' ||
      currentUser.role === 'school_admin' || 
      currentUser.role === 'bgh' || 
      currentUser.isBgh || 
      currentUser.isSchoolAdmin || 
      currentUser.role === 'guest_admin' || 
      currentUser.isGuestAdmin
    );

    if (isSuperOrExecutive) {
      const scoped = await databaseService.getExecutiveScopedData(currentUser);
      if (scoped && Array.isArray(scoped.classes)) {
        markRemoteUpdateActive(1200);
        const cleanClasses = (scoped.classes || []).filter(c => c && c.teacherRole !== 'subject' && !c.id.startsWith('class-sub-'));
        const cleanStudents = (scoped.students || []).filter(s => s && s.classId !== 'class-1791592764810' && !s.classId.startsWith('class-sub-'));
        setClasses(cleanClasses);
        setStudents(cleanStudents);
        setAttendanceRecords(scoped.attendanceRecords || []);
        setBoardingRecords(scoped.boardingRecords || []);
        setTransactions(scoped.transactions || []);
        setDbSyncStatus('synced');
      } else {
        setDbSyncStatus('offline');
      }
    } else {
      const payload: UserClassroomData = {
        ...getCurrentUserData(),
        classes: curClasses,
        students: curStudents,
        updatedAt: nowTs
      };
      const ok = await databaseService.saveUserData(currentUser.username, payload);
      setDbSyncStatus(ok ? 'synced' : 'offline');

      // ☁️ Tự động kích hoạt Cầu nối Google Drive (Debounce Auto-Push 1.5s ngầm)
      googleDriveService.triggerAutoPushDebounced(() => ({
        data: payload,
        user: currentUser,
        targetClassId: effectiveActiveClassId || activeClassId
      }));

      // ⚡ Phát sóng thời gian thực khi GVCN lưu dữ liệu thành công
      fetch(`${getApiBaseUrl()}/api/realtime/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'DATA_CHANGED',
          action: 'TEACHER_SAVED_DATA',
          username: currentUser.username,
          schoolName: currentUser.schoolName,
          timestamp: nowTs
        })
      }).catch(() => {});
    }
    const now = new Date();
    setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  };

  // Helper nạp / khôi phục dữ liệu toàn diện (dùng cho Google Drive Pull)
  const setAllUserData = (data: UserClassroomData) => {
    if (!data) return;
    if (Array.isArray(data.classes) && data.classes.length > 0) {
      setClasses(data.classes);
      classesRef.current = data.classes;
    }
    if (Array.isArray(data.students)) {
      setStudents(data.students);
      studentsRef.current = data.students;
    }
    if (data.activeClassId) setActiveClassId(data.activeClassId);
    if (Array.isArray(data.attendanceRecords)) setAttendanceRecords(data.attendanceRecords);
    if (Array.isArray(data.boardingRecords)) setBoardingRecords(data.boardingRecords);
    if (Array.isArray(data.transactions)) setTransactions(data.transactions);
    if (Array.isArray(data.rewards)) setRewards(data.rewards);
    if (Array.isArray(data.redemptions)) setRedemptions(data.redemptions);
    if (data.seatingAssignments) setSeatingAssignments(data.seatingAssignments);
    if (data.timetable) setTimetable(data.timetable);
    if (data.subjects) setSubjects(data.subjects);
  };

  // Auto-heal activeClassId if it becomes invalid or empty when classes exist
  const effectiveActiveClassId = activeClassId && classes.some(c => c.id === activeClassId)
    ? activeClassId
    : (classes[0]?.id || '');

  useEffect(() => {
    if (classes.length > 0 && (!activeClassId || !classes.some(c => c.id === activeClassId))) {
      setActiveClassId(classes[0].id);
    }
  }, [classes, activeClassId]);

  // Derived students for active class
  const currentClassStudents = students
    .filter(s => s.classId === (effectiveActiveClassId || activeClassId))
    .sort((a, b) => a.stt - b.stt);

  // BGH & Quản trị nhà trường check helper
  /**
   * 🛡️ GVCN trên bản Drive: luôn GỘP THÊM dữ liệu lớp trên Drive vào dữ liệu đang có trên máy khi đăng nhập.
   * Tránh trường hợp bộ nhớ máy trống / cũ che mất học sinh trên Drive rồi bị tự lưu đè lên tệp lớp thật.
   * (Gộp kiểu cộng thêm — không xoá gì của máy.)
   */
  async function mergeDriveClassForTeacher(user: UserAccount, data: UserClassroomData): Promise<UserClassroomData> {
    try {
      if (user.role !== 'homeroom' || !schoolDriveDbService.isConfigured()) return data;
      const fileName = googleDriveService.getFileNameForUser(user, user.assignedClassName, data.teacherRole);
      const pulled = await googleDriveService.pullClassData(data, fileName, user);
      return pulled.success && pulled.mergedData ? pulled.mergedData : data;
    } catch (_) {
      return data;
    }
  }

  const checkBghPermission = () => {
    if (isSuperAdmin) return true; // Supreme Privileges: Toàn quyền can thiệp CSDL
    if (isSchoolAdminOrBgh) {
      setPermissionAlert("Quản trị nhà trường và Ban Giám Hiệu chỉ được thêm/nhập lớp học, khai báo phân hiệu – điểm trường và gán phân hiệu cho lớp. Thông tin học sinh, điểm danh và điểm thi đua do Giáo viên chủ nhiệm (hoặc Quản trị tối cao) thực hiện.");
      return false;
    }
    return true;
  };

  const checkAttendancePermission = () => {
    if (isSuperAdmin) return true; // Supreme Privileges: Toàn quyền
    if ((isBgh || isSchoolAdmin) && currentUser?.role !== 'admin') {
      setPermissionAlert("Bạn không có quyền điểm danh, công việc này thuộc về giáo viên chủ nhiệm.");
      return false;
    }
    return true;
  };

  // Class methods
  const addClass = (cls: Omit<Classroom, 'id'>) => {
    // 🛡️ Kiểm tra CDKEY Bản Quyền (Trial: Tối đa 01 lớp học)
    const classLimitCheck = licenseService.checkClassLimit(classes.length);
    if (!classLimitCheck.allowed) {
      alert(classLimitCheck.message);
      setIsCdKeyModalOpen(true);
      return;
    }

    if (isDemo && classes.length >= 1) {
      alert('Tài khoản trải nghiệm (DEMO) chỉ được tạo tối đa 01 lớp học. Vui lòng liên hệ Quản trị viên để nâng cấp!');
      setIsRegistrationModalOpen(true);
      return;
    }
    const newId = `class-${Date.now()}`;
    // 🛡️ BẢO TOÀN DỮ LIỆU: Quản trị nhà trường, BGH và adminquantri không cấu hình avatar riêng, slogan hoặc ban phụ huynh
    const sanitizedCls: Omit<Classroom, 'id'> = isRestrictedAdminOrBghUser ? {
      ...cls,
      avatar: cls.avatar || 'https://api.dicebear.com/7.x/shapes/svg?seed=RocketClass&backgroundColor=6366f1',
      slogan: '',
      parentCommittee: {
        head: { name: '', phone: '' },
        deputy: { name: '', phone: '' },
        member1: { name: '', phone: '' },
        member2: { name: '', phone: '' }
      }
    } : cls;
    const newCls: Classroom = { ...sanitizedCls, id: newId };
    const nextClasses = [...classes, newCls];
    setClasses(nextClasses);
    classesRef.current = nextClasses;
    setActiveClassId(newId);
    logUserActivity('CREATE_CLASS', `Mở thêm lớp học mới: ${newCls.name} (${newCls.grade || ''})`, { classId: newId, name: newCls.name });

    if (currentUser) {
      setDbSyncStatus('syncing');
      const nowTs = Date.now();
      const isExecutive = Boolean(
        currentUser.role === 'school_admin' || 
        currentUser.role === 'bgh' || 
        currentUser.isBgh || 
        currentUser.isSchoolAdmin || 
        currentUser.role === 'guest_admin' || 
        currentUser.isGuestAdmin
      );

      // 1. Luôn cập nhật liên thông sang giáo viên chủ nhiệm được phân công (hoặc chính user) và Supabase Cloud
      const targetTeacher = (newCls.teacherUsername || (isExecutive ? '' : currentUser.username)).trim().toLowerCase();
      databaseService.updateAdminClass(newCls, targetTeacher).catch(() => {});

      if (isSuperAdmin) {
        databaseService.syncAdminAllData(nextClasses, studentsRef.current.length > 0 ? studentsRef.current : students).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      } else {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          classes: nextClasses,
          updatedAt: nowTs
        };
        databaseService.saveUserData(currentUser.username, payload).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      }
    }
  };

  // 🌟 TẠO LỚP HỌC HÀNG LOẠT (BULK ADD CLASSES TỪ EXCEL / DANH SÁCH MẪU)
  const bulkAddClasses = async (newClassesList: Array<Omit<Classroom, 'id'>>) => {
    // Quản trị nhà trường & BGH được phép nhập lớp từ Excel (không chặn)
    if (!newClassesList || newClassesList.length === 0) return;

    // 🛡️ Kiểm tra CDKEY Bản Quyền (Trial: tối đa 01 lớp học)
    const bulkClassLimit = licenseService.checkClassLimit(classes.length, newClassesList.length);
    if (!bulkClassLimit.allowed) {
      alert(bulkClassLimit.message);
      setIsCdKeyModalOpen(true);
      return;
    }

    if (isDemo && (classes.length + newClassesList.length) > 1) {
      alert('Tài khoản trải nghiệm (DEMO) chỉ được tạo tối đa 01 lớp học. Vui lòng liên hệ Quản trị viên để nâng cấp!');
      setIsRegistrationModalOpen(true);
      return;
    }

    const createdClasses: Classroom[] = newClassesList.map((item, idx) => ({
      ...item,
      id: `class-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`
    }));

    const nextClasses = [...classes, ...createdClasses];
    setClasses(nextClasses);
    classesRef.current = nextClasses;
    if (!activeClassId && createdClasses.length > 0) {
      setActiveClassId(createdClasses[0].id);
    }

    logUserActivity('CREATE_CLASS', `Tạo hàng loạt ${createdClasses.length} lớp học mới: ${createdClasses.map(c => c.name).join(', ')}`, {
      count: createdClasses.length,
      classes: createdClasses.map(c => ({ id: c.id, name: c.name }))
    });

    if (currentUser) {
      setDbSyncStatus('syncing');
      const nowTs = Date.now();
      const isExecutive = Boolean(
        currentUser.role === 'school_admin' || 
        currentUser.role === 'bgh' || 
        currentUser.isBgh || 
        currentUser.isSchoolAdmin || 
        currentUser.role === 'guest_admin' || 
        currentUser.isGuestAdmin
      );

      // Đồng bộ từng lớp cho từng giáo viên phụ trách & Supabase Cloud
      for (const cls of createdClasses) {
        const targetTeacher = (cls.teacherUsername || (isExecutive ? '' : currentUser.username)).trim().toLowerCase();
        databaseService.updateAdminClass(cls, targetTeacher).catch(() => {});
      }

      if (isSuperAdmin) {
        databaseService.syncAdminAllData(nextClasses, studentsRef.current.length > 0 ? studentsRef.current : students).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      } else {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          classes: nextClasses,
          updatedAt: nowTs
        };
        databaseService.saveUserData(currentUser.username, payload).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      }
    }
  };

  const updateClass = (id: string, updated: Partial<Classroom>) => {
    // Release anti-echo locks immediately so user actions always take precedence
    isApplyingRemoteUpdateRef.current = false;
    remoteUpdateLockUntilRef.current = 0;

    const currentList = classesRef.current.length > 0 ? classesRef.current : classes;
    const existing = currentList.find(c => c.id === id);

    // 🛡️ NẾU LÀ TÀI KHOẢN QUẢN TRỊ NHÀ TRƯỜNG, BAN GIÁM HIỆU HOẶC ADMINQUANTRI:
    // Tuyệt đối không cho phép thay đổi: avatar lớp, slogan, ban đại diện cha mẹ học sinh (bảo toàn dữ liệu của GVCN)
    let cleanUpdated = { ...updated };
    if (isSchoolAdminOrBgh && existing) {
      // Chỉ cho phép gán phân hiệu / điểm trường; giữ nguyên mọi thông tin khác của lớp
      const allowed: Partial<Classroom> = {};
      if ('branch' in updated) allowed.branch = updated.branch;
      if ('campus' in updated) allowed.campus = updated.campus;
      cleanUpdated = allowed;
    }
    if (isRestrictedAdminOrBghUser && existing) {
      if (updated.avatar !== undefined || updated.originalAvatar !== undefined || updated.avatarScale !== undefined || updated.avatarPosition !== undefined) {
        cleanUpdated.avatar = existing.avatar;
        cleanUpdated.originalAvatar = existing.originalAvatar;
        cleanUpdated.avatarScale = existing.avatarScale;
        cleanUpdated.avatarPosition = existing.avatarPosition;
      }
      if (updated.slogan !== undefined) {
        cleanUpdated.slogan = existing.slogan;
      }
      if (updated.parentCommittee !== undefined) {
        cleanUpdated.parentCommittee = existing.parentCommittee;
      }
    }

    const nextClasses = currentList.map(c => c.id === id ? { ...c, ...cleanUpdated } : c);
    setClasses(nextClasses);
    classesRef.current = nextClasses;

    const target = nextClasses.find(c => c.id === id) || ({} as Classroom);
    logUserActivity('UPDATE_CLASS', `Chỉnh sửa thông tin lớp: ${updated.name || target?.name || id}`);

    const nowTs = Date.now();
    lastRemoteTimestampRef.current = nowTs;

    // Immediate database synchronization
    if (currentUser) {
      setDbSyncStatus('syncing');
      const isExecutive = Boolean(
        currentUser.role === 'school_admin' || 
        currentUser.role === 'bgh' || 
        currentUser.isBgh || 
        currentUser.isSchoolAdmin || 
        currentUser.role === 'guest_admin' || 
        currentUser.isGuestAdmin
      );

      // Cập nhật lớp học cho giáo viên được phân công & toàn hệ thống
      const targetTeacher = (target.teacherUsername || (isExecutive ? '' : currentUser.username)).trim().toLowerCase();
      databaseService.updateAdminClass(target, targetTeacher).catch(() => {});

      if (isSuperAdmin) {
        databaseService.syncAdminAllData(nextClasses, studentsRef.current.length > 0 ? studentsRef.current : students).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      } else {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          classes: nextClasses,
          updatedAt: nowTs
        };
        databaseService.saveUserData(currentUser.username, payload).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      }
    }

    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('lop_hoc_realtime_local');
        bc.postMessage({ type: 'CLASS_UPDATED', classId: id, classData: updated, timestamp: nowTs });
        bc.close();
      }
      fetch('/api/realtime/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'CLASS_UPDATED',
          action: 'UPDATE_CLASS',
          classId: id,
          classData: { ...target, ...updated },
          username: currentUser?.username,
          schoolName: currentUser?.schoolName,
          timestamp: nowTs
        })
      }).catch(() => {});
    } catch (_) {}
  };

  const deleteClass = (id: string) => {
    if (!checkBghPermission()) return;
    const target = classes.find(c => c.id === id);
    const remaining = classes.filter(c => c.id !== id);
    setClasses(remaining);
    classesRef.current = remaining;
    if (activeClassId === id) {
      setActiveClassId(remaining.length > 0 ? remaining[0].id : '');
    }
    // Clean up students belonging to deleted class
    const remainingStudents = students.filter(s => s.classId !== id);
    setStudents(remainingStudents);
    studentsRef.current = remainingStudents;
    // Clean up seating
    setSeatingAssignments(prev => {
      const next = { ...prev };
      const targetIds = new Set(students.filter(s => s.classId === id).map(s => s.id));
      Object.keys(next).forEach(k => {
        if (targetIds.has(next[k])) delete next[k];
      });
      return next;
    });
    // Clean up timetable slots for deleted class (Requirement 2 synchronization)
    const targetNameLower = (target?.name || '').toLowerCase().trim();
    setSubjectTimetable(prev => prev.filter(slot => {
      if (slot.classId === id) return false;
      if (targetNameLower && slot.className.toLowerCase().trim() === targetNameLower) return false;
      return true;
    }));
    logUserActivity('DELETE_CLASS', `Xóa lớp học: ${target?.name || id}`, { classId: id, name: target?.name });

    // SUPREME PRIVILEGES & PERSISTENCE SYNCHRONIZATION
    if (currentUser) {
      setDbSyncStatus('syncing');
      const isExecutive = Boolean(
        currentUser.role === 'school_admin' || 
        currentUser.role === 'bgh' || 
        currentUser.isBgh || 
        currentUser.isSchoolAdmin || 
        currentUser.role === 'guest_admin' || 
        currentUser.isGuestAdmin
      );

      // Xóa lớp khỏi giáo viên phụ trách và quản trị toàn hệ thống
      databaseService.deleteClass(id, {
        isSuperAdmin: isSuperAdmin || isExecutive,
        teacherUsername: target?.teacherUsername,
        currentUserId: currentUser.id
      }).catch(() => {});

      if (isSuperAdmin) {
        databaseService.syncAdminAllData(remaining, remainingStudents).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      } else {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          classes: remaining,
          students: remainingStudents,
          updatedAt: Date.now()
        };
        databaseService.saveUserData(currentUser.username, payload).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      }
    }
  };

  const bulkDeleteClasses = (ids: string[]) => {
    if (!checkBghPermission()) return;
    if (!ids || ids.length === 0) return;
    const targetSet = new Set(ids);
    const targetClasses = classes.filter(c => targetSet.has(c.id));
    const targetNamesLower = new Set(targetClasses.map(c => c.name.toLowerCase().trim()));

    const remaining = classes.filter(c => !targetSet.has(c.id));
    setClasses(remaining);
    classesRef.current = remaining;

    if (targetSet.has(activeClassId)) {
      setActiveClassId(remaining.length > 0 ? remaining[0].id : '');
    }

    // Clean up students belonging to deleted classes
    const remainingStudents = students.filter(s => !targetSet.has(s.classId));
    setStudents(remainingStudents);
    studentsRef.current = remainingStudents;

    // Clean up seating
    setSeatingAssignments(prev => {
      const next = { ...prev };
      const studentIdsToDelete = new Set(students.filter(s => targetSet.has(s.classId)).map(s => s.id));
      Object.keys(next).forEach(k => {
        if (studentIdsToDelete.has(next[k])) delete next[k];
      });
      return next;
    });

    // Clean up timetable slots for deleted classes (Requirement 2 synchronization)
    setSubjectTimetable(prev => prev.filter(slot => {
      if (targetSet.has(slot.classId)) return false;
      if (targetNamesLower.has(slot.className.toLowerCase().trim())) return false;
      return true;
    }));

    // Clean up attendance & boarding records
    setAttendanceRecords(prev => prev.filter(r => !targetSet.has(r.classId)));
    setBoardingRecords(prev => prev.filter(r => !targetSet.has(r.classId)));

    const deletedNames = targetClasses.map(c => c.name).join(', ');
    logUserActivity('DELETE_CLASS', `Xóa đồng loạt ${ids.length} lớp học: ${deletedNames}`, { classIds: ids });

    // SUPREME PRIVILEGES & PERSISTENCE SYNCHRONIZATION
    if (currentUser) {
      setDbSyncStatus('syncing');
      const isExecutive = Boolean(
        currentUser.role === 'school_admin' || 
        currentUser.role === 'bgh' || 
        currentUser.isBgh || 
        currentUser.isSchoolAdmin || 
        currentUser.role === 'guest_admin' || 
        currentUser.isGuestAdmin
      );

      ids.forEach(classId => {
        const clsObj = targetClasses.find(c => c.id === classId);
        databaseService.deleteClass(classId, {
          isSuperAdmin: isSuperAdmin || isExecutive,
          teacherUsername: clsObj?.teacherUsername,
          currentUserId: currentUser.id
        }).catch(() => {});
      });

      if (isSuperAdmin) {
        databaseService.syncAdminAllData(remaining, remainingStudents).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      } else {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          classes: remaining,
          students: remainingStudents,
          updatedAt: Date.now()
        };
        databaseService.saveUserData(currentUser.username, payload).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      }
    }
  };

  const bulkUpdateClasses = (ids: string[], updates: Partial<Classroom>) => {
    if (isSchoolAdminOrBgh) {
      const keys = Object.keys(updates || {});
      const onlyBranch = keys.length > 0 && keys.every(k => k === 'branch' || k === 'campus');
      if (!onlyBranch && !checkBghPermission()) return;
    }
    if (!ids || ids.length === 0) return;
    const targetSet = new Set(ids);
    const next = classes.map(c => targetSet.has(c.id) ? { ...c, ...updates } : c);
    setClasses(next);
    classesRef.current = next;
    logUserActivity('UPDATE_CLASS', `Cập nhật thông tin đồng loạt cho ${ids.length} lớp học`, { classIds: ids, updates });
    
    ids.forEach(classId => {
      const cls = next.find(c => c.id === classId);
      if (cls) {
        databaseService.updateAdminClass(cls, cls.teacherUsername).catch(() => {});
      }
    });
  };

  const deleteAllClasses = () => {
    if (!checkBghPermission()) return;
    setClasses([]);
    classesRef.current = [];
    setActiveClassId('');
    setStudents([]);
    studentsRef.current = [];
    setSeatingAssignments({});
    setAttendanceRecords([]);
    setBoardingRecords([]);
    setSubjectTimetable([]);
    logUserActivity('DELETE_CLASS', 'Xóa toàn bộ danh sách lớp học');

    // SUPREME PRIVILEGES & PERSISTENCE SYNCHRONIZATION
    if (currentUser) {
      setDbSyncStatus('syncing');
      if (isSuperAdmin) {
        databaseService.syncAdminAllData([], []).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      } else {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          classes: [],
          students: [],
          updatedAt: Date.now()
        };
        databaseService.saveUserData(currentUser.username, payload).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      }
    }
  };

  // Student methods
  const addStudent = (st: Omit<Student, 'id' | 'points' | 'stt'>) => {
    if (!checkBghPermission()) return;
    const classStudents = students.filter(s => s.classId === activeClassId);

    // 🛡️ Kiểm tra CDKEY Bản Quyền (Trial: Tối đa 10 học sinh/lớp)
    const studentLimitCheck = licenseService.checkStudentLimit(classStudents.length);
    if (!studentLimitCheck.allowed) {
      alert(studentLimitCheck.message);
      setIsCdKeyModalOpen(true);
      return;
    }

    if (isDemo && classStudents.length >= 10) {
      alert('Tài khoản trải nghiệm (DEMO) chỉ được thêm tối đa 10 học sinh mỗi lớp. Vui lòng liên hệ Quản trị viên để nâng cấp!');
      setIsRegistrationModalOpen(true);
      return;
    }

    const newStt = classStudents.length + 1;
    const realAvatar = (st.avatar && !st.avatar.includes('api.dicebear.com/7.x/bottts'))
      ? st.avatar
      : getStudentRealAvatar(newStt - 1, activeClassId);

    const newStudent: Student = {
      ...st,
      id: `hs-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      stt: newStt,
      avatar: realAvatar,
      points: 0,
      avatarScale: st.avatarScale || 1,
      avatarPosition: st.avatarPosition || { x: 0, y: 0 }
    };
    const nextStudents = [...students, newStudent];
    setStudents(nextStudents);
    studentsRef.current = nextStudents;
    const currentClass = classes.find(c => c.id === activeClassId);
    logUserActivity('ADD_STUDENT', `Thêm mới học sinh: ${newStudent.name} (STT ${newStt}) vào lớp ${currentClass?.name || ''}`);

    if (currentUser) {
      setDbSyncStatus('syncing');
      const userSchool = currentUser.schoolName || '';
      // 🌟 LIÊN THÔNG 3 CHIỀU TỨC THÌ: Giáo viên ↔ Quản trị trường ↔ Quản trị tối cao (adminquantri)
      databaseService.updateAdminStudent(newStudent, currentUser.username, false, userSchool).catch(() => {});

      if (isSuperAdmin) {
        databaseService.syncAdminAllData(classesRef.current.length > 0 ? classesRef.current : classes, nextStudents).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      } else {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          students: nextStudents,
          updatedAt: Date.now()
        };
        databaseService.saveUserData(currentUser.username, payload).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      }
    }
  };

  const updateStudent = (id: string, data: Partial<Student>) => {
    if (isSchoolAdminOrBgh) {
      setPermissionAlert("Quản trị nhà trường và Ban Giám Hiệu không có quyền thay đổi thông tin, ảnh đại diện, chức vụ hay điểm thi đua của học sinh. Việc này do Giáo viên chủ nhiệm (hoặc Quản trị tối cao) thực hiện.");
      return;
    }
    if (isRestrictedAdminOrBghUser && (data.avatar !== undefined || data.originalAvatar !== undefined || data.avatarScale !== undefined || data.avatarPosition !== undefined)) {
      setPermissionAlert("Để tôn trọng quyền tự chủ của Giáo viên chủ nhiệm, Quản trị nhà trường, Ban Giám Hiệu và Admin Quản trị không có quyền thay đổi ảnh đại diện của học sinh.");
      return;
    }
    if (isRestrictedAdminOrBghUser && (data.role !== undefined || data.roles !== undefined)) {
      setPermissionAlert("Để tôn trọng quyền tự chủ của Giáo viên chủ nhiệm, Quản trị nhà trường, Ban Giám Hiệu và Admin Quản trị không có quyền cấu hình gán cán bộ lớp cho học sinh.");
      return;
    }
    if (isSchoolAdminOrBgh && data.points !== undefined) {
      setPermissionAlert("Để tôn trọng quyền của Giáo viên chủ nhiệm, Ban Giám Hiệu và Quản trị nhà trường không có quyền thay đổi điểm/xu của học sinh.");
      return;
    }
    // Release anti-echo locks immediately so user actions always take precedence
    isApplyingRemoteUpdateRef.current = false;
    remoteUpdateLockUntilRef.current = 0;

    const currentList = studentsRef.current.length > 0 ? studentsRef.current : students;
    const nextStudents = currentList.map(s => s.id === id ? { ...s, ...data } : s);
    setStudents(nextStudents);
    studentsRef.current = nextStudents;

    const targetStudent = nextStudents.find(s => s.id === id) || ({} as Student);
    logUserActivity('UPDATE_STUDENT', `Chỉnh sửa thông tin học sinh: ${data.name || targetStudent.name || id}`);

    const nowTs = Date.now();
    lastRemoteTimestampRef.current = nowTs;

    // Immediate database synchronization to Server & Supabase Cloud
    if (currentUser) {
      setDbSyncStatus('syncing');
      const userSchool = currentUser.schoolName || '';
      // 🌟 LIÊN THÔNG 3 CHIỀU TỨC THÌ: Cập nhật đồng bộ tức thì cho Giáo viên, BGH và Quản trị tối cao
      databaseService.updateAdminStudent(targetStudent, currentUser.username, false, userSchool).catch(() => {});

      if (isSuperAdmin) {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          students: nextStudents,
          updatedAt: nowTs
        };
        databaseService.saveUserData(currentUser.username, payload).catch(() => {});
        databaseService.syncAdminAllData(classesRef.current.length > 0 ? classesRef.current : classes, nextStudents).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      } else {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          students: nextStudents,
          updatedAt: nowTs
        };
        databaseService.saveUserData(currentUser.username, payload).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      }
    }

    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('lop_hoc_realtime_local');
        bc.postMessage({ type: 'STUDENT_UPDATED', studentId: id, studentData: data, timestamp: nowTs });
        bc.close();
      }
      fetch('/api/realtime/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'STUDENT_UPDATED',
          action: 'UPDATE_STUDENT',
          studentId: id,
          studentData: { ...targetStudent, ...data },
          classId: targetStudent.classId,
          username: currentUser?.username,
          schoolName: currentUser?.schoolName,
          timestamp: nowTs
        })
      }).catch(() => {});
    } catch (_) {}
  };

  const deleteStudent = (id: string) => {
    if (!checkBghPermission()) return;
    // Đọc danh sách MỚI NHẤT (ref) để gọi liên tiếp nhiều lần không bị ghi đè bởi state cũ
    const currentList = studentsRef.current.length > 0 ? studentsRef.current : students;
    const st = currentList.find(s => s.id === id);
    const currentClass = classes.find(c => c.id === st?.classId);
    const remainingStudents = currentList.filter(s => s.id !== id);
    setStudents(remainingStudents);
    studentsRef.current = remainingStudents;
    // also clean up seating assignment
    setSeatingAssignments(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (next[k] === id) delete next[k];
      });
      return next;
    });
    logUserActivity('DELETE_STUDENT', `Xóa học sinh: ${st?.name || id} khỏi lớp ${currentClass?.name || ''}`);

    // SUPREME PRIVILEGES & PERSISTENCE SYNCHRONIZATION
    if (currentUser) {
      setDbSyncStatus('syncing');
      const userSchool = currentUser.schoolName || '';
      // 🌟 LIÊN THÔNG 3 CHIỀU TỨC THÌ: Xóa học sinh đồng bộ ở cả Quản trị trường và Quản trị tối cao
      databaseService.updateAdminStudent({ id }, currentUser.username, true, userSchool).catch(() => {});

      if (isSuperAdmin) {
        databaseService.deleteStudent(id, {
          isSuperAdmin: true,
          classId: st?.classId,
          teacherUsername: currentClass?.teacherUsername,
          currentUserId: currentUser.id
        }).catch(() => {});
        databaseService.syncAdminAllData(classesRef.current.length > 0 ? classesRef.current : classes, remainingStudents).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      } else {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          students: remainingStudents,
          updatedAt: Date.now()
        };
        databaseService.saveUserData(currentUser.username, payload).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      }
    }
  };

  const bulkDeleteStudents = (studentIds: string[]) => {
    if (!checkBghPermission()) return;
    if (studentIds.length === 0) return;
    const idSet = new Set(studentIds);
    const currentClass = classes.find(c => c.id === activeClassId);
    const currentList = studentsRef.current.length > 0 ? studentsRef.current : students;
    const remainingStudents = currentList.filter(s => !idSet.has(s.id));
    setStudents(remainingStudents);
    studentsRef.current = remainingStudents;
    setSeatingAssignments(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (idSet.has(next[k])) delete next[k];
      });
      return next;
    });
    logUserActivity('DELETE_STUDENT', `Xóa ${studentIds.length} học sinh khỏi lớp ${currentClass?.name || ''}`);

    // SUPREME PRIVILEGES & PERSISTENCE SYNCHRONIZATION
    if (currentUser) {
      setDbSyncStatus('syncing');
      const userSchool = currentUser.schoolName || '';
      studentIds.forEach(id => {
        databaseService.updateAdminStudent({ id }, currentUser.username, true, userSchool).catch(() => {});
      });

      if (isSuperAdmin) {
        studentIds.forEach(id => {
          const st = students.find(s => s.id === id);
          databaseService.deleteStudent(id, {
            isSuperAdmin: true,
            classId: st?.classId,
            teacherUsername: currentClass?.teacherUsername,
            currentUserId: currentUser.id
          }).catch(() => {});
        });
        databaseService.syncAdminAllData(classesRef.current.length > 0 ? classesRef.current : classes, remainingStudents).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      } else {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          students: remainingStudents,
          updatedAt: Date.now()
        };
        databaseService.saveUserData(currentUser.username, payload).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      }
    }
  };

  const clearClassStudents = (classId: string) => {
    if (!checkBghPermission()) return;
    const targetClass = classes.find(c => c.id === classId);
    const count = students.filter(s => s.classId === classId).length;
    const targetIds = new Set(students.filter(s => s.classId === classId).map(s => s.id));
    const remainingStudents = students.filter(s => s.classId !== classId);
    setStudents(remainingStudents);
    studentsRef.current = remainingStudents;
    setSeatingAssignments(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (targetIds.has(next[k])) delete next[k];
      });
      return next;
    });
    logUserActivity('DELETE_STUDENT', `Xóa toàn bộ ${count} học sinh của lớp ${targetClass?.name || classId}`);

    // SUPREME PRIVILEGES & PERSISTENCE SYNCHRONIZATION
    if (currentUser) {
      setDbSyncStatus('syncing');
      
      // Batch Delete trên Supabase Cloud
      databaseService.deleteStudentsByClassId(classId, {
        isSuperAdmin,
        teacherUsername: targetClass?.teacherUsername,
        currentUserId: currentUser.id
      }).catch(err => console.warn('Lỗi khi xóa batch học sinh trên DB:', err));

      if (isSuperAdmin) {
        databaseService.syncAdminAllData(classesRef.current.length > 0 ? classesRef.current : classes, remainingStudents).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      } else {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          students: remainingStudents,
          updatedAt: Date.now()
        };
        databaseService.saveUserData(currentUser.username, payload).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      }
    }
  };

  const resetStudentsCoins = (studentIds?: string[], classId?: string) => {
    if (isSchoolAdminOrBgh) {
      setPermissionAlert("Để tôn trọng quyền chủ động của Giáo viên chủ nhiệm, Ban Giám Hiệu và Quản trị nhà trường không có quyền đặt lại (reset) hoặc gán xu của học sinh.");
      return;
    }
    if (!checkBghPermission()) return;
    const targetClassId = classId || activeClassId;
    setStudents(prev => prev.map(s => {
      if (s.classId !== targetClassId) return s;
      if (studentIds && studentIds.length > 0 && !studentIds.includes(s.id)) return s;
      return { ...s, points: 0, subjectPoints: {} };
    }));
    logUserActivity('AWARD_POINTS', 'Đặt lại điểm xu về 0 cho học sinh');
  };

  const bulkAddStudents = (items: Array<{ name: string; gender: 'Nam' | 'Nữ'; birthDate?: string; group?: string; role?: string; roles?: string[] }>) => {
    if (!checkBghPermission()) return;
    const currentList = students.filter(s => s.classId === activeClassId);

    // 🛡️ Kiểm tra CDKEY Bản Quyền (Trial: tối đa 10 học sinh/lớp) — áp dụng cả khi nhập từ Excel
    const bulkLimit = licenseService.checkStudentLimit(currentList.length, items.length);
    if (!bulkLimit.allowed) {
      alert(bulkLimit.message);
      setIsCdKeyModalOpen(true);
      if (bulkLimit.remaining <= 0) return;
      items = items.slice(0, bulkLimit.remaining);
    }

    if (isDemo) {
      if (currentList.length >= 10) {
        alert('Tài khoản trải nghiệm (DEMO) chỉ được thêm tối đa 10 học sinh mỗi lớp. Vui lòng liên hệ Quản trị viên để nâng cấp!');
        setIsRegistrationModalOpen(true);
        return;
      }
      const allowedToAdd = 10 - currentList.length;
      if (items.length > allowedToAdd) {
        alert(`Tài khoản trải nghiệm (DEMO) chỉ được thêm tối đa 10 học sinh mỗi lớp. Vui lòng liên hệ Quản trị viên để nâng cấp! Hệ thống chỉ thêm ${allowedToAdd} học sinh đầu tiên để trải nghiệm.`);
        items = items.slice(0, allowedToAdd);
      }
    }

    let startStt = currentList.length + 1;

    const newItems: Student[] = items.map((item, idx) => {
      const roles = item.roles && item.roles.length > 0
        ? item.roles.slice(0, 3)
        : (item.role ? item.role.split(/[•,;\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 3) : []);
      const roleStr = roles.join(' • ') || item.role || '';

      return {
        id: `hs-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        classId: activeClassId,
        stt: startStt++,
        name: item.name,
        birthDate: item.birthDate || '',
        gender: item.gender,
        avatar: getStudentRealAvatar(currentList.length + idx, activeClassId),
        avatarScale: 1,
        avatarPosition: { x: 0, y: 0 },
        points: 0,
        subjectPoints: {},
        group: item.group || `Tổ ${Math.floor(idx / 8) + 1}`,
        role: roleStr,
        roles
      };
    });

    const nextStudents = [...students, ...newItems];
    setStudents(nextStudents);
    studentsRef.current = nextStudents;
    const currentClass = classes.find(c => c.id === activeClassId);
    logUserActivity('BATCH_STUDENTS', `Thêm mới danh sách ${newItems.length} học sinh vào lớp ${currentClass?.name || ''}`);

    if (currentUser) {
      setDbSyncStatus('syncing');
      const userSchool = currentUser.schoolName || '';
      // 🌟 LIÊN THÔNG 3 CHIỀU TỨC THÌ: Cập nhật từng học sinh mới lên Quản trị trường và Quản trị tối cao
      newItems.forEach(item => {
        databaseService.updateAdminStudent(item, currentUser.username, false, userSchool).catch(() => {});
      });

      if (isSuperAdmin) {
        databaseService.syncAdminAllData(classesRef.current.length > 0 ? classesRef.current : classes, nextStudents).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      } else {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          students: nextStudents,
          updatedAt: Date.now()
        };
        databaseService.saveUserData(currentUser.username, payload).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      }
    }
  };

  // Tự động gán ảnh đại diện (mặc định hoạt hình hoặc ảnh thật demo) phân chia theo giới tính Nam/Nữ
  const autoAssignAvatarsToClass = (
    targetClassId?: string,
    type: AvatarSourceType = 'default',
    overwrite: boolean = false
  ): { updatedCount: number; totalCount: number } => {
    if (isRestrictedAdminOrBghUser) {
      setPermissionAlert("Để tôn trọng quyền tự chủ của Giáo viên chủ nhiệm, Quản trị nhà trường, Ban Giám Hiệu và Admin Quản trị không có quyền tự động gán ảnh đại diện của học sinh.");
      return { updatedCount: 0, totalCount: 0 };
    }
    const cId = targetClassId || activeClassId;
    if (!cId) return { updatedCount: 0, totalCount: 0 };
    let updatedCount = 0;
    const usedUrls = new Set<string>();
    const nowTs = Date.now();

    const currentStudents = studentsRef.current;
    const classStudents = currentStudents.filter(s => s.classId === cId);
    const totalCount = classStudents.length;
    let counter = 0;

    const nextStudents = currentStudents.map(s => {
      if (s.classId === cId) {
        const hasCustomAvatar = Boolean(
          s.avatar && 
          s.avatar.trim() && 
          !s.avatar.includes('api.dicebear.com/7.x/bottts/svg?seed=student-') &&
          !s.avatar.includes('api.dicebear.com/7.x/shapes/svg?seed=student-')
        );
        if (!overwrite && hasCustomAvatar) {
          return s;
        }
        const newAvatar = getStudentAvatarAssignment({
          gender: s.gender || 'Nam',
          type,
          index: counter++,
          classId: cId,
          usedUrls
        });
        updatedCount++;
        return {
          ...s,
          avatar: newAvatar,
          originalAvatar: newAvatar,
          avatarScale: 1,
          avatarPosition: { x: 0, y: 0 }
        };
      }
      return s;
    });

    // 1. Cập nhật ngay lập tức React state & ref
    studentsRef.current = nextStudents;
    setStudents(nextStudents);

    // 2. Kích hoạt quy trình lưu 3 tầng (LocalStorage, Supabase Cloud, Local JSON Server)
    if (currentUser) {
      setDbSyncStatus('syncing');
      if (isSuperAdmin || currentUser.role === 'admin') {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          students: nextStudents,
          updatedAt: nowTs
        };
        databaseService.saveUserData(currentUser.username, payload).catch(() => {});
        databaseService.syncAdminAllData(classesRef.current.length > 0 ? classesRef.current : classes, nextStudents).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      } else {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          students: nextStudents,
          updatedAt: nowTs
        };
        databaseService.saveUserData(currentUser.username, payload).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      }
    }

    // 3. Bắn sự kiện BroadcastChannel nội bộ cho tất cả các tab khác render lại ngay lập tức
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('lop_hoc_realtime_local');
        bc.postMessage({ 
          type: 'STUDENTS_BULK_UPDATED', 
          classId: cId, 
          students: nextStudents, 
          timestamp: nowTs 
        });
        bc.close();
      }
    } catch (_) {}

    const currentClass = classes.find(c => c.id === cId);
    const typeLabel = type === 'default' ? 'Avatar Mặc định (Hoạt hình)' : 'Avatar Ảnh thật demo';
    logUserActivity(
      'AUTO_ASSIGN_AVATARS',
      `Tự động gán ${typeLabel} cho lớp ${currentClass?.name || ''} (Cập nhật: ${updatedCount} học sinh, Ghi đè: ${overwrite ? 'Có' : 'Không'})`
    );
    return { updatedCount, totalCount };
  };

  // Tự động gán ảnh đại diện thật cho toàn bộ học sinh trong lớp (Backward compatibility)
  const autoAssignRealAvatarsToClass = (targetClassId?: string) => {
    autoAssignAvatarsToClass(targetClassId, 'real_demo', true);
  };

  // Cập nhật hàng loạt ảnh đại diện học sinh (từ ảnh chụp tập thể cả lớp hoặc công cụ cắt ghép)
  const batchUpdateStudentAvatars = (
    updates: Array<{ studentId: string; avatar: string }>
  ): number => {
    if (isRestrictedAdminOrBghUser) {
      setPermissionAlert("Để tôn trọng quyền tự chủ của Giáo viên chủ nhiệm, Quản trị nhà trường, Ban Giám Hiệu và Admin Quản trị không có quyền thay đổi hoặc gán ảnh đại diện của học sinh.");
      return 0;
    }
    if (updates.length === 0) return 0;
    const nowTs = Date.now();
    isApplyingRemoteUpdateRef.current = false;
    remoteUpdateLockUntilRef.current = 0;

    const updateMap = new Map(updates.map(u => [u.studentId, u.avatar]));
    const currentStudents = studentsRef.current.length > 0 ? studentsRef.current : students;

    let updatedCount = 0;
    const nextStudents = currentStudents.map(s => {
      const newAvatar = updateMap.get(s.id);
      if (newAvatar) {
        updatedCount++;
        return {
          ...s,
          avatar: newAvatar,
          originalAvatar: newAvatar,
          avatarScale: 1,
          avatarPosition: { x: 0, y: 0 },
          flipX: false
        };
      }
      return s;
    });

    setStudents(nextStudents);
    studentsRef.current = nextStudents;

    const currentClass = classes.find(c => c.id === activeClassId);
    logUserActivity(
      'BATCH_AVATARS',
      `Cập nhật ảnh đại diện từ ảnh tập thể cho ${updatedCount} học sinh lớp ${currentClass?.name || ''}`
    );

    lastRemoteTimestampRef.current = nowTs;

    if (currentUser) {
      setDbSyncStatus('syncing');
      const userSchool = currentUser.schoolName || '';

      // Đồng bộ từng học sinh được cập nhật lên server
      updates.forEach(u => {
        const targetStudent = nextStudents.find(s => s.id === u.studentId);
        if (targetStudent) {
          databaseService.updateAdminStudent(targetStudent, currentUser.username, false, userSchool).catch(() => {});
        }
      });

      if (isSuperAdmin) {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          students: nextStudents,
          updatedAt: nowTs
        };
        databaseService.saveUserData(currentUser.username, payload).catch(() => {});
        databaseService.syncAdminAllData(classesRef.current.length > 0 ? classesRef.current : classes, nextStudents).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      } else {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          students: nextStudents,
          updatedAt: nowTs
        };
        databaseService.saveUserData(currentUser.username, payload).then(() => {
          setDbSyncStatus('synced');
          const now = new Date();
          setLastDbSyncTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }).catch(() => {
          setDbSyncStatus('offline');
        });
      }
    }

    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('lop_hoc_realtime_local');
        bc.postMessage({ 
          type: 'STUDENTS_BULK_UPDATED', 
          classId: activeClassId, 
          students: nextStudents, 
          timestamp: nowTs 
        });
        bc.close();
      }
    } catch (_) {}

    return updatedCount;
  };

  // Subjects (Cấu hình nhận xu: Thêm, sửa, xóa, thiết lập áp dụng cho lớp/giáo viên)
  const addSubject = (name: string, color = '#3B82F6', icon = 'BookOpen') => {
    if (isSchoolAdminOrBgh) {
      setPermissionAlert("Để tôn trọng quyền chủ động của Giáo viên chủ nhiệm, Ban Giám Hiệu và Quản trị nhà trường không có quyền cấu hình nhận xu.");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) return;
    const newSub: Subject = {
      id: `sub-${Date.now()}`,
      name: trimmed,
      color,
      icon,
      enabled: true,
      isDefault: false
    };
    setSubjects(prev => {
      if (prev.some(s => s.name.trim().toLowerCase() === trimmed.toLowerCase())) {
        return prev;
      }
      return [...prev, newSub];
    });
  };

  const updateSubject = (id: string, data: Partial<Subject>) => {
    if (isSchoolAdminOrBgh) {
      setPermissionAlert("Để tôn trọng quyền chủ động của Giáo viên chủ nhiệm, Ban Giám Hiệu và Quản trị nhà trường không có quyền cấu hình nhận xu.");
      return;
    }
    setSubjects(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
  };

  const deleteSubject = (id: string) => {
    if (isSchoolAdminOrBgh) {
      setPermissionAlert("Để tôn trọng quyền chủ động của Giáo viên chủ nhiệm, Ban Giám Hiệu và Quản trị nhà trường không có quyền cấu hình nhận xu.");
      return;
    }
    setSubjects(prev => prev.filter(s => s.id !== id));
  };

  const toggleSubjectApplied = (id: string, enabled?: boolean) => {
    if (isSchoolAdminOrBgh) {
      setPermissionAlert("Để tôn trọng quyền chủ động của Giáo viên chủ nhiệm, Ban Giám Hiệu và Quản trị nhà trường không có quyền cấu hình nhận xu.");
      return;
    }
    setSubjects(prev => prev.map(s => {
      if (s.id === id) {
        return { ...s, enabled: enabled !== undefined ? enabled : !s.enabled };
      }
      return s;
    }));
  };

  const setAppliedSubjects = (subjectIds: string[]) => {
    if (isSchoolAdminOrBgh) {
      setPermissionAlert("Để tôn trọng quyền chủ động của Giáo viên chủ nhiệm, Ban Giám Hiệu và Quản trị nhà trường không có quyền cấu hình nhận xu.");
      return;
    }
    const idSet = new Set(subjectIds);
    setSubjects(prev => prev.map(s => ({
      ...s,
      enabled: idSet.has(s.id)
    })));
  };

  const resetDefaultSubjects = () => {
    if (isSchoolAdminOrBgh) {
      setPermissionAlert("Để tôn trọng quyền chủ động của Giáo viên chủ nhiệm, Ban Giám Hiệu và Quản trị nhà trường không có quyền cấu hình nhận xu.");
      return;
    }
    setSubjects([...INITIAL_SUBJECTS]);
  };

  // Criteria
  const addCriterion = (crit: Omit<PointCriterion, 'id'>) => {
    const newCrit: PointCriterion = {
      ...crit,
      id: `crit-${Date.now()}`
    };
    setCriteria(prev => [...prev, newCrit]);
  };

  // Points Award / Deduct (Lưu theo học sinh và theo môn, không làm mất tổng xu hiện tại)
  const awardPoints = (studentIds: string[], amount: number, reason: string, subjectName?: string) => {
    if (isSchoolAdminOrBgh) {
      setPermissionAlert("Để tôn trọng quyền chủ động của Giáo viên chủ nhiệm, Ban Giám Hiệu và Quản trị nhà trường không có quyền đánh giá điểm thi đua của học sinh.");
      return;
    }
    if (!checkBghPermission()) return;
    if (studentIds.length === 0 || amount <= 0) return;
    playCoinSound();

    const timestamp = Date.now();
    const newTxns: PointTransaction[] = [];
    const targetSubject = (subjectName && subjectName.trim()) ? subjectName.trim() : 'GHI CHUNG / NỀ NẾP';

    const currentList = studentsRef.current.length > 0 ? studentsRef.current : students;
    const nextStudents = currentList.map(s => {
      if (studentIds.includes(s.id)) {
        newTxns.push({
          id: `tx-${timestamp}-${s.id}`,
          studentId: s.id,
          studentName: s.name,
          classId: s.classId,
          amount,
          reason,
          subjectName: targetSubject,
          timestamp
        });
        const currentSubPoints = s.subjectPoints || (s.points > 0 ? { 'GHI CHUNG / NỀ NẾP': s.points } : {});
        const oldXu = currentSubPoints[targetSubject] || 0;
        return { 
          ...s, 
          points: s.points + amount,
          subjectPoints: {
            ...currentSubPoints,
            [targetSubject]: oldXu + amount
          }
        };
      }
      return s;
    });

    setStudents(nextStudents);
    studentsRef.current = nextStudents;

    const nextTxns = [...newTxns, ...transactions];
    setTransactions(nextTxns);
    logUserActivity('AWARD_POINTS', `Cộng ${amount} xu cho ${studentIds.length} học sinh (Lý do: ${reason}, Môn: ${targetSubject})`);

    // Lưu tức thì không để bị mất nếu đóng tab hoặc tắt trình duyệt
    if (currentUserRef.current) {
      const user = currentUserRef.current;
      const isExec = Boolean(
        user.role === 'admin' || 
        user.role === 'school_admin' || 
        user.role === 'bgh' || 
        user.isBgh || 
        user.isSchoolAdmin || 
        user.role === 'guest_admin' || 
        user.isGuestAdmin
      );
      if (!isExec) {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          students: nextStudents,
          transactions: nextTxns,
          updatedAt: timestamp
        };
        databaseService.saveUserData(user.username, payload).catch(() => {});
      }

      // 🌟 LIÊN THÔNG ĐIỂM SỐ 3 CHIỀU: Cập nhật học sinh có điểm thi đua thay đổi sang Quản trị trường và Quản trị tối cao
      const userSchool = user.schoolName || '';
      const affected = nextStudents.filter(s => studentIds.includes(s.id));
      affected.forEach(st => {
        databaseService.updateAdminStudent(st, user.username, false, userSchool).catch(() => {});
      });

      fetch('/api/realtime/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'POINTS_UPDATED',
          action: 'AWARD_POINTS',
          studentIds,
          amount,
          reason,
          username: user.username,
          schoolName: user.schoolName,
          timestamp
        })
      }).catch(() => {});
    }
  };

  const deductPoints = (studentIds: string[], amount: number, reason: string, subjectName?: string) => {
    if (isSchoolAdminOrBgh) {
      setPermissionAlert("Để tôn trọng quyền chủ động của Giáo viên chủ nhiệm, Ban Giám Hiệu và Quản trị nhà trường không có quyền đánh giá điểm thi đua của học sinh.");
      return;
    }
    if (studentIds.length === 0 || amount <= 0) return;
    playDeductSound();

    const timestamp = Date.now();
    const newTxns: PointTransaction[] = [];
    const targetSubject = (subjectName && subjectName.trim()) ? subjectName.trim() : 'GHI CHUNG / NỀ NẾP';

    const currentList = studentsRef.current.length > 0 ? studentsRef.current : students;
    const nextStudents = currentList.map(s => {
      if (studentIds.includes(s.id)) {
        newTxns.push({
          id: `tx-${timestamp}-${s.id}`,
          studentId: s.id,
          studentName: s.name,
          classId: s.classId,
          amount: -amount,
          reason,
          subjectName: targetSubject,
          timestamp
        });
        const currentSubPoints = s.subjectPoints || (s.points > 0 ? { 'GHI CHUNG / NỀ NẾP': s.points } : {});
        const oldXu = currentSubPoints[targetSubject] || 0;
        return { 
          ...s, 
          points: Math.max(0, s.points - amount),
          subjectPoints: {
            ...currentSubPoints,
            [targetSubject]: Math.max(0, oldXu - amount)
          }
        };
      }
      return s;
    });

    setStudents(nextStudents);
    studentsRef.current = nextStudents;

    const nextTxns = [...newTxns, ...transactions];
    setTransactions(nextTxns);
    logUserActivity('AWARD_POINTS', `Trừ ${amount} xu của ${studentIds.length} học sinh (Lý do: ${reason}, Môn: ${targetSubject})`);

    // Lưu tức thì không để bị mất nếu đóng tab hoặc tắt trình duyệt
    if (currentUserRef.current) {
      const user = currentUserRef.current;
      const isExec = Boolean(
        user.role === 'admin' || 
        user.role === 'school_admin' || 
        user.role === 'bgh' || 
        user.isBgh || 
        user.isSchoolAdmin || 
        user.role === 'guest_admin' || 
        user.isGuestAdmin
      );
      if (!isExec) {
        const payload: UserClassroomData = {
          ...getCurrentUserData(),
          students: nextStudents,
          transactions: nextTxns,
          updatedAt: timestamp
        };
        databaseService.saveUserData(user.username, payload).catch(() => {});
      }

      // 🌟 LIÊN THÔNG ĐIỂM SỐ 3 CHIỀU: Cập nhật học sinh có điểm thi đua thay đổi sang Quản trị trường và Quản trị tối cao
      const userSchool = user.schoolName || '';
      const affected = nextStudents.filter(s => studentIds.includes(s.id));
      affected.forEach(st => {
        databaseService.updateAdminStudent(st, user.username, false, userSchool).catch(() => {});
      });

      fetch('/api/realtime/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'POINTS_UPDATED',
          action: 'DEDUCT_POINTS',
          studentIds,
          amount: -amount,
          reason,
          username: user.username,
          schoolName: user.schoolName,
          timestamp
        })
      }).catch(() => {});
    }
  };

  // Rewards
  const addReward = (reward: Omit<Reward, 'id'>) => {
    const newReward: Reward = {
      ...reward,
      id: `rew-${Date.now()}`,
      classId: reward.classId || activeClassId
    };
    setRewards(prev => [...prev, newReward]);
  };

  const updateReward = (id: string, data: Partial<Reward>) => {
    setRewards(prev => prev.map(r => r.id === id ? { ...r, ...data } : r));
  };

  const deleteReward = (id: string) => {
    setRewards(prev => prev.filter(r => r.id !== id));
  };

  const redeemReward = (studentId: string, rewardId: string): { success: boolean; message: string } => {
    const student = students.find(s => s.id === studentId);
    const reward = rewards.find(r => r.id === rewardId);

    if (!student || !reward) {
      return { success: false, message: 'Không tìm thấy học sinh hoặc phần thưởng.' };
    }

    if (reward.stock <= 0) {
      return { success: false, message: 'Món quà này trong kho hiện đã hết!' };
    }

    if (student.points < reward.cost) {
      return { success: false, message: `Học sinh ${student.name} chưa đủ xu (Cần ${reward.cost} xu, hiện có ${student.points} xu).` };
    }

    // Deduct points
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, points: s.points - reward.cost } : s));
    // Deduct stock
    setRewards(prev => prev.map(r => r.id === rewardId ? { ...r, stock: r.stock - 1 } : r));
    // Record redemption
    const redemption: RewardRedemption = {
      id: `rdm-${Date.now()}`,
      studentId: student.id,
      studentName: student.name,
      rewardId: reward.id,
      rewardName: reward.name,
      cost: reward.cost,
      timestamp: Date.now(),
      status: 'Đã nhận'
    };
    setRedemptions(prev => [redemption, ...prev]);

    // Record transaction
    const txn: PointTransaction = {
      id: `tx-${Date.now()}-${student.id}`,
      studentId: student.id,
      studentName: student.name,
      classId: student.classId,
      amount: -reward.cost,
      reason: `Đổi quà: ${reward.name}`,
      timestamp: Date.now()
    };
    setTransactions(prev => [txn, ...prev]);

    playCoinSound();
    return { success: true, message: `Đã đổi thành công "${reward.name}" cho em ${student.name}!` };
  };

  // Seating
  const assignSeat = (seatKey: string, studentId: string | null) => {
    setSeatingAssignments(prev => {
      const next = { ...prev };
      if (!studentId) {
        delete next[seatKey];
      } else {
        // Remove from any prior seat
        Object.keys(next).forEach(k => {
          if (next[k] === studentId) delete next[k];
        });
        next[seatKey] = studentId;
      }
      return next;
    });
  };

  const autoAssignSeating = (mode: 'random' | 'boy_girl' | 'name' = 'random') => {
    const list = [...currentClassStudents];
    if (mode === 'random') {
      list.sort(() => Math.random() - 0.5);
    } else if (mode === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    } else if (mode === 'boy_girl') {
      const boys = list.filter(s => s.gender === 'Nam');
      const girls = list.filter(s => s.gender === 'Nữ');
      const alternating: Student[] = [];
      const max = Math.max(boys.length, girls.length);
      for (let i = 0; i < max; i++) {
        if (boys[i]) alternating.push(boys[i]);
        if (girls[i]) alternating.push(girls[i]);
      }
      list.splice(0, list.length, ...alternating);
    }

    const newMap: Record<string, string> = {};
    const cols = seatingColumns;
    let idx = 0;

    if (deskNumberingOrder === 'horizontal') {
      const maxRows = Math.max(...deskCountsPerColumn.slice(0, cols), 4);
      for (let r = 0; r < maxRows; r++) {
        for (let c = 0; c < cols; c++) {
          const colLimit = deskCountsPerColumn[c] || 4;
          if (r < colLimit) {
            for (let sub = 0; sub < 2; sub++) {
              if (idx < list.length) {
                newMap[`${c}-${r}-${sub}`] = list[idx].id;
                idx++;
              }
            }
          }
        }
      }
    } else {
      // 'vertical' (THEO DỌC)
      for (let c = 0; c < cols; c++) {
        const colLimit = deskCountsPerColumn[c] || 4;
        for (let r = 0; r < colLimit; r++) {
          for (let sub = 0; sub < 2; sub++) {
            if (idx < list.length) {
              newMap[`${c}-${r}-${sub}`] = list[idx].id;
              idx++;
            }
          }
        }
      }
    }
    setSeatingAssignments(newMap);
  };

  const clearSeating = () => {
    setSeatingAssignments({});
  };

  // Attendance
  const todayStr = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();
  const currentDateRecord = attendanceRecords.find(r => r.date === todayStr && r.classId === activeClassId);
  const currentDateAttendance = currentDateRecord?.records || {};

  const setStudentAttendance = (studentId: string, status: AttendanceStatus, date = todayStr) => {
    if (!checkAttendancePermission()) return;
    let targetRecord: DailyAttendance | null = null;
    setAttendanceRecords(prev => {
      const existingIdx = prev.findIndex(r => r.date === date && r.classId === activeClassId);
      if (existingIdx >= 0) {
        const updated = [...prev];
        targetRecord = {
          ...updated[existingIdx],
          records: {
            ...updated[existingIdx].records,
            [studentId]: status
          }
        };
        updated[existingIdx] = targetRecord;
        return updated;
      } else {
        targetRecord = {
          date,
          classId: activeClassId,
          records: {
            [studentId]: status
          }
        };
        return [...prev, targetRecord];
      }
    });

    if (targetRecord) {
      databaseService.broadcastAttendance(targetRecord, currentUser?.username);
    }

    // Nếu học sinh vắng mặt (Nghỉ ốm, Có phép, Không phép, Khác) -> tự động chuyển sang Không ăn/Về nhà
    const isAbsent = status === 'sick' || status === 'excused' || status === 'unexcused' || status === 'other';
    if (isAbsent) {
      setStudentBoarding(studentId, 'not_eating', date);
    }
  };

  const batchSetAttendance = (status: AttendanceStatus, date = todayStr) => {
    const map: Record<string, AttendanceStatus> = {};
    currentClassStudents.forEach(s => {
      map[s.id] = status;
    });

    let targetRecord: DailyAttendance | null = null;
    setAttendanceRecords(prev => {
      const existingIdx = prev.findIndex(r => r.date === date && r.classId === activeClassId);
      if (existingIdx >= 0) {
        const updated = [...prev];
        targetRecord = {
          ...updated[existingIdx],
          records: map
        };
        updated[existingIdx] = targetRecord;
        return updated;
      } else {
        targetRecord = { date, classId: activeClassId, records: map };
        return [...prev, targetRecord];
      }
    });

    if (targetRecord) {
      databaseService.broadcastAttendance(targetRecord, currentUser?.username);
    }
  };

  // Boarding Meals (Ăn bán trú)
  const currentDateBoardingRecord = boardingRecords.find(r => r.date === todayStr && r.classId === activeClassId);
  const currentDateBoarding = currentDateBoardingRecord?.records || {};

  const setStudentBoarding = (studentId: string, status: BoardingStatus, date = todayStr) => {
    if (!checkAttendancePermission()) return;
    let targetRecord: DailyBoardingMeal | null = null;
    setBoardingRecords(prev => {
      const existingIdx = prev.findIndex(r => r.date === date && r.classId === activeClassId);
      if (existingIdx >= 0) {
        const updated = [...prev];
        targetRecord = {
          ...updated[existingIdx],
          records: {
            ...updated[existingIdx].records,
            [studentId]: status
          }
        };
        updated[existingIdx] = targetRecord;
        return updated;
      } else {
        targetRecord = {
          date,
          classId: activeClassId,
          records: {
            [studentId]: status
          }
        };
        return [...prev, targetRecord];
      }
    });

    if (targetRecord) {
      databaseService.broadcastBoarding(targetRecord, currentUser?.username);
    }
  };

  const batchSetBoarding = (status: BoardingStatus, date = todayStr) => {
    const map: Record<string, BoardingStatus> = {};
    currentClassStudents.forEach(s => {
      map[s.id] = status;
    });

    let targetRecord: DailyBoardingMeal | null = null;
    setBoardingRecords(prev => {
      const existingIdx = prev.findIndex(r => r.date === date && r.classId === activeClassId);
      if (existingIdx >= 0) {
        const updated = [...prev];
        targetRecord = {
          ...updated[existingIdx],
          records: map
        };
        updated[existingIdx] = targetRecord;
        return updated;
      } else {
        targetRecord = { date, classId: activeClassId, records: map };
        return [...prev, targetRecord];
      }
    });

    if (targetRecord) {
      databaseService.broadcastBoarding(targetRecord, currentUser?.username);
    }
  };

  // Timetable
  const updateTimetableSlot = (day: number, session: 'morning' | 'afternoon', period: number, subject: string, targetClassId?: string) => {
    const targetId = targetClassId || activeClassId;
    setTimetable(prev => {
      const filtered = prev.filter(t => !(t.day === day && t.session === session && t.period === period && (t.classId ? t.classId === targetId : true)));
      if (!subject.trim()) return filtered;
      return [...filtered, { day, session, period, subject: subject.trim(), classId: targetId }];
    });
  };

  // Subject Teacher Methods (User request: Sắp TKB nhiều lớp dùng chung học kì / thời điểm)
  const updateSubjectTimetableSlot = (slotData: Omit<SubjectTimetableSlot, 'id'> & { id?: string }) => {
    const id = slotData.id || `sbj-${slotData.day}-${slotData.session}-${slotData.period}-${Date.now()}`;
    const newSlot: SubjectTimetableSlot = { ...slotData, id };
    setSubjectTimetable(prev => {
      const filtered = prev.filter(s => !(s.day === newSlot.day && s.session === newSlot.session && s.period === newSlot.period));
      return [...filtered, newSlot];
    });
  };

  const deleteSubjectTimetableSlot = (slotId: string) => {
    setSubjectTimetable(prev => prev.filter(s => s.id !== slotId));
  };

  const clearSubjectTimetable = () => {
    setSubjectTimetable([]);
  };

  const seedSample20SubjectClasses = () => {
    const classNames = PRESET_SUBJECT_CLASS_NAMES;
    const newClassesList: Classroom[] = [...classes];
    const newStudentsList: Student[] = [...students];

    classNames.forEach((cName, idx) => {
      let existingClass = newClassesList.find(c => c.name.trim().toLowerCase() === cName.trim().toLowerCase());
      const classId = existingClass ? existingClass.id : `class-${cName.toLowerCase()}`;
      
      if (!existingClass) {
        const gradeNum = cName.charAt(0);
        existingClass = {
          id: classId,
          name: cName,
          grade: `Khối ${gradeNum}`,
          color: ['#3B82F6', '#EC4899', '#06B6D4', '#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][idx % 8],
          academicYear: teacherProfile.academicYear || '2026–2027',
          teacherName: `GVCN Lớp ${cName}`,
          slogan: `Tập thể ${cName} chăm ngoan, đoàn kết, say mê Tin học!`,
          avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=Class${cName}&backgroundColor=3b82f6`
        };
        newClassesList.push(existingClass);
      }

      const hasStudents = newStudentsList.some(s => s.classId === classId);
      // Bản web (Drive chung): lớp mới để trống, giáo viên nhập danh sách thật (không sinh 20 học sinh mẫu)
      if (!hasStudents && !schoolDriveDbService.isConfigured()) {
        const SAMPLE_NAMES = [
          'Nguyễn Văn An', 'Trần Thị Ngọc Ánh', 'Lê Gia Bảo', 'Phạm Minh Châu', 'Hoàng Quốc Cường',
          'Vũ Mai Dung', 'Đặng Tuấn Đạt', 'Bùi Thùy Dương', 'Đỗ Tiến Đức', 'Hồ Mỹ Hạnh',
          'Ngô Đức Huy', 'Dương Thu Hương', 'Lâm Tuấn Kiệt', 'Phan Thảo Linh', 'Võ Minh Long',
          'Mai Khánh Ly', 'Trịnh Hoàng Nam', 'Lý Kim Ngân', 'Đoàn Hải Phong', 'Đinh Hồng Phúc'
        ];
        SAMPLE_NAMES.forEach((name, sIdx) => {
          const gender: 'Nam' | 'Nữ' = sIdx % 2 === 0 ? 'Nam' : 'Nữ';
          const points = Math.floor(Math.random() * 25) + 5;
          newStudentsList.push({
            id: `hs-${classId}-${sIdx + 1}`,
            classId: classId,
            stt: sIdx + 1,
            name: `${name}`,
            birthDate: `1${(sIdx % 9) + 1}/0${(sIdx % 8) + 1}/2016`,
            gender,
            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${cName}-${sIdx}&backgroundColor=b6e3f4`,
            avatarScale: 1,
            avatarPosition: { x: 0, y: 0 },
            points,
            subjectPoints: {
              'Tin học': points,
              'GHI CHUNG / NỀ NẾP': 5
            },
            group: `Tổ ${(sIdx % 4) + 1}`,
            role: sIdx === 0 ? 'LỚP TRƯỞNG' : (sIdx === 1 ? 'LỚP PHÓ HỌC TẬP' : undefined),
            roles: sIdx === 0 ? ['LỚP TRƯỞNG'] : (sIdx === 1 ? ['LỚP PHÓ HỌC TẬP'] : [])
          });
        });
      }
    });

    setClasses(newClassesList);
    setStudents(newStudentsList);
    setSubjectTimetable(SAMPLE_SUBJECT_TIMETABLE_BY_IMAGE);
    if (!newClassesList.some(c => c.id === activeClassId)) {
      setActiveClassId(newClassesList[0].id);
    }
  };

  const loadSampleTimetableByImage = (autoCreateClasses: boolean = true) => {
    setSubjectTimetable(SAMPLE_SUBJECT_TIMETABLE_BY_IMAGE);
    updateSubjectTeacherConfig({
      subjectName: 'Tin học',
      teacherDisplayName: 'Nguyễn Thanh Liêm',
      semester: 'I',
      effectiveStartDate: '05/9/2026',
      morningPeriods: 4,
      afternoonPeriods: 3
    });

    if (autoCreateClasses) {
      initSubjectClasses(SAMPLE_SUBJECT_CLASSES_BY_IMAGE, false);
    }
  };

  const initSubjectClasses = (items: InitSubjectClassItem[], replaceExisting: boolean = false) => {
    // 🛡️ Bản dùng thử (chưa nhập CDKEY) hoặc tài khoản DEMO: tối đa 01 lớp, 10 học sinh/lớp
    const trialMode = isDemo || !licenseService.isActivated();
    if (trialMode) {
      if (classes.length >= 1 && !replaceExisting) {
        alert('Bản dùng thử (chưa nhập CDKEY) chỉ được tạo tối đa 01 lớp học. Vui lòng nhập CDKEY bản quyền để quản lý nhiều lớp.');
        setIsCdKeyModalOpen(true);
        return;
      }
      if (items.length > 1) {
        alert('Bản dùng thử (chưa nhập CDKEY) chỉ được tạo tối đa 01 lớp học. Phần mềm sẽ khởi tạo 01 lớp đầu tiên với tối đa 10 học sinh.');
        items = items.slice(0, 1);
      }
    }

    let newClassesList: Classroom[] = replaceExisting ? [] : [...classes];
    let newStudentsList: Student[] = replaceExisting ? [] : [...students];

    const currentSubjectName = subjectTeacherConfig.subjectName || 'TIN HỌC';

    items.forEach((item, idx) => {
      const trimmedName = item.name.trim();
      if (!trimmedName) return;

      const grade = item.grade || (trimmedName.match(/\d+/) ? `Khối ${trimmedName.match(/\d+/)![0]}` : 'Khối 4');
      const classId = `class-${trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

      // Check if class already exists
      const existingClassIdx = newClassesList.findIndex(
        c => c.id === classId || c.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );
      
      const classObj: Classroom = {
        id: classId,
        name: trimmedName,
        grade,
        color: ['#3B82F6', '#EC4899', '#06B6D4', '#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][idx % 8],
        academicYear: teacherProfile.academicYear || '2026–2027',
        teacherName: item.teacherName || `GVCN Lớp ${trimmedName}`,
        slogan: item.slogan || `Tập thể ${trimmedName} chăm ngoan, đoàn kết, học tốt môn ${currentSubjectName}!`,
        avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=Class${trimmedName}&backgroundColor=3b82f6`
      };

      if (existingClassIdx >= 0) {
        newClassesList[existingClassIdx] = classObj;
      } else {
        newClassesList.push(classObj);
      }

      // Generate students
      let studentCount = Math.max(1, Math.min(item.studentCount || 32, 60));
      if (trialMode && studentCount > 10) {
        studentCount = 10;
      }
      // Remove any existing students of this class
      newStudentsList = newStudentsList.filter(s => s.classId !== classId);
      
      const generated = generateStudentsForClass(classId, trimmedName, studentCount, grade, currentSubjectName);
      newStudentsList.push(...generated);
    });

    setClasses(newClassesList);
    setStudents(newStudentsList);
    if (newClassesList.length > 0) {
      setActiveClassId(newClassesList[0].id);
    }
  };

  const applySubjectTimetableSlots = (slots: SubjectTimetableSlot[]) => {
    setSubjectTimetable(slots);
  };

  // Quick Links
  const addQuickLink = (link: Omit<QuickLink, 'id'>) => {
    const newLink: QuickLink = {
      ...link,
      id: `link-${Date.now()}`
    };
    setQuickLinks(prev => [...prev, newLink]);
  };

  const deleteQuickLink = (id: string) => {
    setQuickLinks(prev => prev.filter(l => l.id !== id));
  };

  const updateQuickLink = (id: string, data: Partial<Omit<QuickLink, 'id'>>) => {
    setQuickLinks(prev => prev.map(l => l.id === id ? { ...l, ...data } : l));
  };

  const reorderQuickLinks = (newLinks: QuickLink[]) => {
    setQuickLinks(newLinks);
  };

  // Teacher Profile
  const updateTeacherProfile = (data: Partial<TeacherProfile>) => {
    setTeacherProfile(prev => ({ ...prev, ...data }));

    const newName = data.name ? data.name.trim() : '';
    const newAvatar = data.avatar || '';

    // Cập nhật ngay lập tức vào thông tin tài khoản đăng nhập (currentUser)
    setCurrentUser(prevUser => {
      if (!prevUser) return null;
      const updatedUser: UserAccount = {
        ...prevUser,
        fullName: newName || prevUser.fullName,
        avatar: newAvatar || prevUser.avatar,
        phone: data.phone !== undefined ? data.phone.trim() : prevUser.phone,
        schoolName: data.schoolName !== undefined ? data.schoolName.trim() : prevUser.schoolName
      };

      try {
        if (!isViewOnly()) localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(updatedUser));
      } catch (_) {}

      // Đồng bộ cập nhật lên Supabase Cloud & database users table
      databaseService.updateUser(updatedUser.id, {
        fullName: updatedUser.fullName,
        avatar: updatedUser.avatar,
        phone: updatedUser.phone,
        schoolName: updatedUser.schoolName
      }).catch(err => console.warn('Lỗi cập nhật user database:', err));

      return updatedUser;
    });

    // Cập nhật tên giáo viên trong danh sách lớp học nếu có
    if (newName) {
      setClasses(prevClasses => prevClasses.map(cls => {
        if (!cls.teacherName || cls.teacherName === teacherProfile.name || cls.teacherName.includes('Hoa')) {
          return { ...cls, teacherName: newName };
        }
        return cls;
      }));

      // Cập nhật danh sách allUsers (allTeachers được tính toán tự động từ allUsers)
      setAllUsers(prev => prev.map(u => {
        if (currentUser && (u.id === currentUser.id || u.username.toLowerCase() === currentUser.username.toLowerCase())) {
          return { ...u, fullName: newName, avatar: newAvatar || u.avatar };
        }
        return u;
      }));
    }
  };

  // Backup & Restore
  const exportBackupJson = () => {
    const backupData = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      account: currentUser ? {
        username: currentUser.username,
        fullName: currentUser.fullName,
        role: currentUser.role
      } : undefined,
      classes,
      activeClassId,
      students,
      subjects,
      criteria,
      transactions,
      rewards,
      redemptions,
      seatingColumns,
      deskCountsPerColumn,
      deskNumberingOrder,
      teacherDeskPos,
      doorPos,
      blackboardPos,
      seatingAssignments,
      attendanceRecords,
      boardingRecords,
      timetableConfig,
      timetable,
      teacherRole,
      subjectTeacherConfig,
      subjectTimetable,
      quickLinks,
      teacherProfile,
      quizBank,
      infographicConfig
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileSuffix = currentUser ? `_${currentUser.username}_${currentUser.role}` : '';
    link.download = `Sao_Luu_Lop_Hoc_Hanh_Phuc${fileSuffix}_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportBackupZip = async () => {
    const backupData = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      account: currentUser ? {
        username: currentUser.username,
        fullName: currentUser.fullName,
        role: currentUser.role
      } : undefined,
      classes,
      activeClassId,
      students,
      subjects,
      criteria,
      transactions,
      rewards,
      redemptions,
      seatingColumns,
      deskCountsPerColumn,
      deskNumberingOrder,
      teacherDeskPos,
      doorPos,
      blackboardPos,
      seatingAssignments,
      attendanceRecords,
      boardingRecords,
      timetableConfig,
      timetable,
      teacherRole,
      subjectTeacherConfig,
      subjectTimetable,
      quickLinks,
      teacherProfile,
      quizBank,
      infographicConfig
    };

    const zip = new JSZip();
    zip.file("lop_hoc_hanh_phuc_data.json", JSON.stringify(backupData, null, 2));
    zip.file("THONG_TIN_SAO_LUU.txt", `=== SAO LƯU DỮ LIỆU HỆ THỐNG LỚP HỌC HẠNH PHÚC ===\n` +
      `Tài khoản: ${currentUser ? `${currentUser.fullName} (@${currentUser.username})` : 'Mặc định'}\n` +
      `Vai trò: ${teacherRole === 'homeroom' ? 'Giáo viên chủ nhiệm' : 'Giáo viên bộ môn'}\n` +
      `Năm học: ${teacherProfile.academicYear || '2026 - 2027'}\n` +
      `Giáo viên: ${teacherProfile.name}\n` +
      `Đơn vị công tác: ${teacherProfile.schoolName}\n` +
      `Zalo hỗ trợ hệ thống: 0888358363 (https://zalo.me/0888358363)\n` +
      `Thời gian xuất file: ${new Date().toLocaleString('vi-VN')}\n` +
      `Số lượng lớp học: ${classes.length} lớp\n` +
      `Tổng số học sinh: ${students.length} học sinh\n\n` +
      `Hướng dẫn khôi phục:\n` +
      `Để nạp lại dữ liệu, vào mục "DỮ LIỆU" trong ứng dụng, chọn "Nạp Vào Khôi Phục Dữ Liệu" và tải file .ZIP này lên.`
    );

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileSuffix = currentUser ? `_${currentUser.username}_${currentUser.role}` : '';
    link.download = `Sao_Luu_Lop_Hoc_Hanh_Phuc${fileSuffix}_${new Date().toISOString().slice(0, 10)}.zip`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importBackupZip = async (file: File): Promise<boolean> => {
    try {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(file);
      let jsonFile = loadedZip.file("lop_hoc_hanh_phuc_data.json");
      if (!jsonFile) {
        const jsonKeys = Object.keys(loadedZip.files).filter(k => k.endsWith('.json'));
        if (jsonKeys.length > 0) {
          jsonFile = loadedZip.file(jsonKeys[0]);
        }
      }
      if (!jsonFile) return false;
      const text = await jsonFile.async('text');
      const data = JSON.parse(text);

      applyUserClassroomData(data);

      if (currentUser) {
        logUserActivity('RESTORE_DATA', `Khôi phục độc lập dữ liệu từ file zip ${file.name}`);
        const currentData = {
          ...getCurrentUserData(),
          ...data
        };
        await databaseService.saveUserData(currentUser.username, currentData);
      }

      return true;
    } catch (e) {
      console.error('Lỗi giải nén và nạp zip:', e);
      return false;
    }
  };

  const importBackupJson = async (file: File): Promise<boolean> => {
    try {
      // Check if it's a zip file
      if (file.name.toLowerCase().endsWith('.zip')) {
        return await importBackupZip(file);
      }
      const text = await file.text();
      const data = JSON.parse(text);

      applyUserClassroomData(data);

      if (currentUser) {
        logUserActivity('RESTORE_DATA', `Khôi phục độc lập dữ liệu từ file JSON ${file.name}`);
        const currentData = {
          ...getCurrentUserData(),
          ...data
        };
        await databaseService.saveUserData(currentUser.username, currentData);
      }

      return true;
    } catch (err) {
      console.error('Lỗi nạp sao lưu:', err);
      return false;
    }
  };


  const clearAllData = () => {
    // Khởi tạo khung lớp học cơ bản cho năm học mới
    const defaultClass: Classroom = {
      id: 'class-4a1',
      name: '4A1',
      grade: 'Khối 4',
      color: '#3B82F6',
      academicYear: teacherProfile.academicYear || '2026–2027',
      teacherName: teacherProfile.name || (currentUser?.fullName || ''),
      teacherUsername: currentUser?.username || '',
      teacherRole: 'homeroom',
      avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=Class4A1&backgroundColor=3b82f6',
      slogan: '',
      parentCommittee: {
        head: { name: '', phone: '', roleTitle: 'Trưởng ban phụ huynh' },
        deputy: { name: '', phone: '', roleTitle: 'Phó ban phụ huynh' },
        member1: { name: '', phone: '', roleTitle: 'Ủy viên ban phụ huynh 1' },
        member2: { name: '', phone: '', roleTitle: 'Ủy viên ban phụ huynh 2' }
      }
    };
    const freshClasses = [defaultClass];

    setClasses(freshClasses);
    classesRef.current = freshClasses;
    setActiveClassId('class-4a1');
    setStudents([]);
    studentsRef.current = [];
    setTimetable([]);
    setTransactions([]);
    setRewards([...INITIAL_REWARDS]);
    setRedemptions([]);
    setAttendanceRecords([]);
    setBoardingRecords([]);
    setSeatingAssignments({});
    setSubjects([...INITIAL_SUBJECTS]);
    setCriteria([...INITIAL_CRITERIA]);

    if (currentUser) {
      const payload: UserClassroomData = {
        ...getCurrentUserData(),
        classes: freshClasses,
        students: [],
        timetable: [],
        transactions: [],
        rewards: [...INITIAL_REWARDS],
        redemptions: [],
        attendanceRecords: [],
        boardingRecords: [],
        seatingAssignments: {},
        updatedAt: Date.now()
      };
      databaseService.saveUserData(currentUser.username, payload).catch(() => {});
    }
  };

  // 🧠 CỐT LÕI TRÍ TUỆ NHÂN TẠO AI LIÊN THÔNG 3 CẤP ĐỘ (Classroom - School - System)
  const currentClass = classes.find(c => c.id === activeClassId);
  const aiClassInsight = useMemo(() => {
    if (!currentClass) return null;
    return AiHierarchySynthesizer.synthesizeClassroom({
      classroom: currentClass,
      students: currentClassStudents,
      attendanceRecords,
      boardingRecords,
      transactions
    });
  }, [currentClass, currentClassStudents, attendanceRecords, boardingRecords, transactions]);

  const aiSchoolInsight = useMemo(() => {
    return AiHierarchySynthesizer.synthesizeSchool({
      schoolName: currentUser?.schoolName || 'Trường Tiểu học',
      classes,
      students,
      attendanceRecords,
      boardingRecords,
      transactions
    });
  }, [classes, students, attendanceRecords, boardingRecords, transactions, currentUser?.schoolName]);

  const aiSystemInsight = useMemo(() => {
    const schools = Array.from(new Set(allUsers.map(u => u.schoolName).filter(Boolean)));
    return AiHierarchySynthesizer.synthesizeSystem({
      schools,
      classes,
      students,
      attendanceRecords,
      boardingRecords,
      transactions
    });
  }, [classes, students, attendanceRecords, boardingRecords, transactions, allUsers]);

  return (
    <ClassroomContext.Provider value={{
      classes,
      activeClassId,
      setActiveClassId,
      addClass,
      bulkAddClasses,
      updateClass,
      deleteClass,
      bulkDeleteClasses,
      bulkUpdateClasses,
      deleteAllClasses,

      students,
      currentClassStudents,
      addStudent,
      updateStudent,
      deleteStudent,
      bulkDeleteStudents,
      clearClassStudents,
      bulkAddStudents,
      autoAssignRealAvatarsToClass,
      autoAssignAvatarsToClass,
      batchUpdateStudentAvatars,
      resetStudentsCoins,

      subjects,
      addSubject,
      updateSubject,
      deleteSubject,
      toggleSubjectApplied,
      setAppliedSubjects,
      resetDefaultSubjects,

      criteria,
      addCriterion,

      transactions,
      awardPoints,
      deductPoints,

      rewards,
      addReward,
      updateReward,
      deleteReward,
      redemptions,
      redeemReward,

      seatingColumns,
      setSeatingColumns,
      deskCountsPerColumn,
      setDeskCountsPerColumn,
      updateDeskCountForColumn,
      deskNumberingOrder,
      setDeskNumberingOrder,
      teacherDeskPos,
      setTeacherDeskPos,
      doorPos,
      setDoorPos,
      blackboardPos,
      setBlackboardPos,
      seatingAssignments,
      assignSeat,
      autoAssignSeating,
      clearSeating,

      attendanceRecords,
      currentDateAttendance,
      setStudentAttendance,
      batchSetAttendance,

      boardingRecords,
      currentDateBoarding,
      setStudentBoarding,
      batchSetBoarding,

      timetable,
      timetableConfig,
      setTimetableConfig,
      updateTimetableSlot,

      teacherRole,
      setTeacherRole,
      subjectTeacherConfig,
      updateSubjectTeacherConfig,
      subjectTimetable,
      updateSubjectTimetableSlot,
      deleteSubjectTimetableSlot,
      clearSubjectTimetable,
      seedSample20SubjectClasses,
      loadSampleTimetableByImage,
      initSubjectClasses,
      applySubjectTimetableSlots,

      quickLinks,
      addQuickLink,
      deleteQuickLink,
      updateQuickLink,
      reorderQuickLinks,

      teacherProfile,
      updateTeacherProfile,

      // Kho câu hỏi độc lập & Infographic lưu trực tuyến theo tài khoản
      quizBank,
      setQuizBank,
      updateQuizBank,
      quizVaultStatus,
      unlockQuizVault,
      refreshQuizVault,
      syncPersonalQuiz,
      infographicConfig,
      updateInfographicConfig,

      exportBackupJson,
      importBackupJson,
      exportBackupZip,
      importBackupZip,

      clearAllData,
      getCurrentUserData,

      // Quản lý người dùng, phân quyền & Cơ sở dữ liệu đồng bộ
      currentUser,
      allUsers,
      allTeachers: allUsers.filter(u => u.role === 'homeroom' || u.role === 'subject'),
      loginUser,
      logoutUser,
      switchUserAccount,
      viewAsTeacher,
      exitViewAs,
      viewAs,
      refreshUsersList,
      logUserActivity,
      isAuthModalOpen,
      setIsAuthModalOpen,
      isAccountManagerOpen,
      setIsAccountManagerOpen,
      isGithubModalOpen,
      setIsGithubModalOpen,
      isGoogleDriveModalOpen,
      setIsGoogleDriveModalOpen,
      isCdKeyModalOpen,
      setIsCdKeyModalOpen,
      isDataStorageModalOpen,
      setIsDataStorageModalOpen,
      isCdKeyActivated,
      activateCdKey,
      setAllUserData,
      dbSyncStatus,
      lastDbSyncTime,
      syncDatabaseNow,
      isAdmin,
      isSchoolAdmin,
      isGuestAdmin,
      isHomeroom: currentUser?.role === 'homeroom',
      isSubject: currentUser?.role === 'subject',
      isDemo,
      isBgh,
      canManageAccounts,
      isSchoolAdminOrBgh,
      canEvaluateEmulation,
      canEditStudentAvatar,
      canManageStudents,
      canEditClassCore,
      canDeleteClasses,
      canAssignClassOfficer,
      canEditClassAvatar,
      canEditClassSlogan,
      canEditParentCommittee,
      isRestrictedAdminOrBgh: isRestrictedAdminOrBghUser,
      canResetOrAssignCoins,
      canCreateClassInfographic,
      canConfigureCoinSubjects,
      isRegistrationModalOpen,
      setIsRegistrationModalOpen,
      demoWarningMessage,
      setDemoWarningMessage,
      schoolBranches,
      saveSchoolBranches,
      reloadSchoolBranches,

      // 🧠 CỐT LÕI AI LIÊN THÔNG 3 CẤP ĐỘ
      aiClassInsight,
      aiSchoolInsight,
      aiSystemInsight
    }}>
      {children}
      {permissionAlert && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="bg-gradient-to-r from-red-500 to-rose-600 p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-6 h-6 text-white" />
                <h3 className="text-white font-bold text-lg shadow-sm">Cảnh Báo Phân Quyền</h3>
              </div>
              <button onClick={() => setPermissionAlert(null)} className="text-white/90 hover:text-white hover:bg-white/20 p-1.5 rounded-full transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-700 text-base leading-relaxed text-center font-medium">
                {permissionAlert}
              </p>
            </div>
            <div className="bg-gray-50/80 p-4 flex justify-end border-t border-gray-100">
              <button onClick={() => setPermissionAlert(null)} className="px-6 py-2.5 bg-slate-100 text-slate-800 font-medium rounded-xl hover:bg-slate-100 transition-colors shadow-sm w-full sm:w-auto">
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </ClassroomContext.Provider>
  );
};

export const useClassroom = () => {
  const context = useContext(ClassroomContext);
  if (!context) {
    throw new Error('useClassroom must be used within a ClassroomProvider');
  }
  return context;
};
