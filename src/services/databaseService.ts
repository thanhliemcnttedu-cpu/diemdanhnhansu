import { MANAGER_DATA_MS, cacheFor } from '../utils/liveSync';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { UserAccount, UserClassroomData, Classroom, Student, UserRole, SchoolEntity, LoginRoleScope, DailyAttendance, DailyBoardingMeal, PointTransaction, SchoolBranch, SchoolCampus } from '../types';
import { generateStudentsForClass } from '../utils/studentGenerator';
import { ACCOUNT_IDENTITY_MAP, getOfficialDisplayName } from '../utils/accountIdentity';
import { dataStorageService } from './dataStorageService';
import { googleDriveService } from './googleDriveService';
import { schoolDriveDbService } from './schoolDriveDbService';
import { adminEditsService, schoolBranchesDrive } from './adminEditsService';
import { DEFAULT_SUBJECT_TEACHER_CONFIG } from '../data/initialData';
import { isViewOnly } from '../utils/viewOnlyMode';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'http://127.0.0.1:3000';
  }
  return '';
}

export const LOCAL_AUTH_KEY = 'lop_hoc_current_user_v2';
export const LOCAL_SESSION_KEY = 'lop_hoc_session_time_v2';
export const LOCAL_DB_PREFIX = 'lop_hoc_user_db_';
export const LOCAL_SCHOOLS_KEY = 'lop_hoc_schools_list_v1';
export const LOCAL_BRANCHES_PREFIX = 'lop_hoc_school_branches_';
export const SESSION_TIMEOUT_MS = 300 * 60 * 1000; // 300 minutes = 5 hours

// Unique Client ID per tab/browser instance to prevent echo loops
export const CLIENT_ID = 'client_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);

// Supabase Cloud Configuration with fallback for direct client access
const SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) 
  || ''; // không ghi cứng dự án Supabase vào mã (chỉ đọc từ biến môi trường)

const SUPABASE_ANON_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY)
  || ''; // không ghi cứng khóa Supabase vào mã

let supabaseClient: SupabaseClient | null = null;
let realtimeChannel: RealtimeChannel | null = null;
const realtimeListeners: Set<(event: { type: string; username?: string; targetUsername?: string; timestamp: number; originClientId?: string; message?: string }) => void> = new Set();

// Local inter-tab & cross-browser broadcast channel on same machine
const localBroadcastChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('lop_hoc_realtime_bus') 
  : null;

if (localBroadcastChannel) {
  localBroadcastChannel.onmessage = (event) => {
    const data = event.data;
    if (data && data.originClientId !== CLIENT_ID) {
      realtimeListeners.forEach(listener => {
        try {
          listener({
            type: 'DATA_CHANGED',
            username: data.username,
            targetUsername: data.targetUsername,
            originClientId: data.originClientId,
            timestamp: data.timestamp || Date.now(),
            message: data.message || 'Cập nhật từ tab/cửa sổ khác'
          });
        } catch (_) {}
      });
    }
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'lop_hoc_realtime_ping' && e.newValue) {
      try {
        const data = JSON.parse(e.newValue);
        if (data && data.originClientId !== CLIENT_ID) {
          realtimeListeners.forEach(listener => {
            try {
              listener({
                type: 'DATA_CHANGED',
                username: data.username,
                targetUsername: data.targetUsername,
                originClientId: data.originClientId,
                timestamp: data.timestamp || Date.now(),
                message: 'Cập nhật trực quan đa trình duyệt'
              });
            } catch (_) {}
          });
        }
      } catch (_) {}
    }
  });
}

// Đã tắt tính năng đẩy/kết nối Supabase để chuyển sang hệ thống Google Drive
export function getBrowserSupabase(): SupabaseClient | null {
  return null;
}

function initSupabaseRealtime(): void {
  const supabase = getBrowserSupabase();
  if (!supabase || realtimeChannel) return;

  try {
    realtimeChannel = supabase.channel('classroom_realtime_sync', {
      config: { broadcast: { ack: false, self: false } }
    });

    realtimeChannel
      .on('broadcast', { event: 'user_data_updated' }, (msg: any) => {
        const payload = msg?.payload;
        if (payload && payload.originClientId !== CLIENT_ID) {
          realtimeListeners.forEach(listener => {
            try {
              listener({
                type: payload.type || 'DATA_CHANGED',
                action: payload.action,
                classData: payload.classData,
                classId: payload.classId,
                attendanceRecord: payload.attendanceRecord,
                boardingRecord: payload.boardingRecord,
                transaction: payload.transaction,
                points: payload.points,
                studentId: payload.studentId,
                username: payload.username,
                targetUsername: payload.targetUsername,
                originClientId: payload.originClientId,
                timestamp: payload.timestamp || Date.now(),
                message: payload.message
              } as any);
            } catch (_) {}
          });
        }
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_classroom_data'
        },
        (payload: any) => {
          const newRow = payload?.new as any;
          if (newRow?.username) {
            realtimeListeners.forEach(listener => {
              try {
                listener({
                  type: 'DATA_CHANGED',
                  username: newRow.username,
                  originClientId: 'remote_postgres',
                  timestamp: Date.now()
                });
              } catch (_) {}
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Supabase Realtime] Connected successfully to sync channel');
        }
      });
  } catch (err) {
    console.warn('[Supabase Realtime] Init error:', err);
  }
}

export interface AuditLogItem {
  id: string;
  timestamp: number;
  username: string;
  userFullName: string;
  role: UserRole;
  actionType: string;
  description: string;
  details?: any;
}

export interface UserSummaryItem {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  assignedClassName?: string;
  subjectName?: string;
  schoolName?: string;
  status?: string;
  classCount: number;
  studentCount: number;
  lastUpdated?: number;
  classes: Array<{ id: string; name: string; grade: any; studentCount: number }>;
}

export interface UserStorageStat {
  username: string;
  fullName: string;
  role: string;
  classesCount: number;
  studentsCount: number;
  bytes: number;
  sizeKB: number;
  percentOfTotal: number;
}

export interface DatabaseStats {
  userCount: number;
  users: UserAccount[];
  totalClasses: number;
  totalStudents: number;
  lastSync: string;
  fileSizeBytes?: number;
  fileSizeKB: number;
  fileSizeMB?: number;
  formattedSize?: string;
  storageQuotaMB?: number;
  percentOfQuota?: number;
  storageBreakdown?: {
    userData: {
      bytes: number;
      sizeKB: number;
      percent: number;
    };
    auditLogs: {
      bytes: number;
      sizeKB: number;
      count: number;
      percent: number;
    };
    users: {
      bytes: number;
      sizeKB: number;
      count: number;
      percent: number;
    };
    systemOverhead?: {
      bytes: number;
      sizeKB: number;
    };
  };
  userBreakdown?: UserStorageStat[];
  dbPath?: string;
}

export const FALLBACK_USERS: UserAccount[] = [
  // Quản trị Tối cao duy nhất
  {
    id: 'user-adminquantri',
    username: 'adminquantri',
    password: 'Tanuyen@2026',
    fullName: 'Quản trị viên Hệ thống Cấp cao',
    role: 'admin',
    tenantType: 'school',
    email: 'adminquantri@lophoc.edu.vn',
    phone: '0888358363',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=AdminQuanTriBoss&backgroundColor=d1d4f9',
    schoolName: 'Hệ thống Quản trị Lớp học Hạnh phúc',
    createdAt: Date.now(),
    status: 'active'
  }
];

export const FALLBACK_SCHOOLS: SchoolEntity[] = [];

// ☁️ Bộ nhớ đệm tệp lớp GVCN đọc từ Drive cho Quản trị/BGH (app làm mới ~12s/lần → chỉ gọi Drive tối đa 1 lần/60s)
type DriveClassFilesData = {
  classes: Classroom[];
  students: Student[];
  attendanceRecords: DailyAttendance[];
  boardingRecords: DailyBoardingMeal[];
  appliedByClass?: Record<string, Record<string, number>>;
};
const DRIVE_CLASS_FILES_TTL_MS = cacheFor(MANAGER_DATA_MS); // chu kỳ 60 s (utils/liveSync) — chỉ tải tệp lớp đã đổi
let driveClassFilesCache: { key: string; at: number; data: DriveClassFilesData } | null = null;
let driveClassFilesInflight: { key: string; promise: Promise<DriveClassFilesData | null> } | null = null;

async function loadDriveClassFilesCached(currentUser: UserAccount): Promise<DriveClassFilesData | null> {
  const cfg = googleDriveService.getConfig();
  if (!cfg.scriptUrl) return null;
  const key = `${cfg.scriptUrl}|${cfg.folderId || ''}`;
  if (driveClassFilesCache && driveClassFilesCache.key === key && Date.now() - driveClassFilesCache.at < DRIVE_CLASS_FILES_TTL_MS) {
    return driveClassFilesCache.data;
  }
  if (driveClassFilesInflight && driveClassFilesInflight.key === key) return driveClassFilesInflight.promise;
  const promise = (async () => {
    try {
      const res = await googleDriveService.pullAllClassFilesFromDrive(currentUser);
      if (!res.success) return driveClassFilesCache?.key === key ? driveClassFilesCache.data : null;
      const data: DriveClassFilesData = {
        classes: res.classes,
        students: res.students,
        attendanceRecords: res.attendanceRecords,
        boardingRecords: res.boardingRecords,
        appliedByClass: res.appliedByClass || {}
      };
      driveClassFilesCache = { key, at: Date.now(), data };
      return data;
    } catch (_) {
      return driveClassFilesCache?.key === key ? driveClassFilesCache.data : null;
    } finally {
      driveClassFilesInflight = null;
    }
  })();
  driveClassFilesInflight = { key, promise };
  return promise;
}

/** Bỏ bộ nhớ đệm để lần tổng hợp sau đọc lại Drive ngay (ví dụ khi bấm "Làm mới"). */
export function invalidateDriveClassFilesCache() {
  driveClassFilesCache = null;
}

/** Sự kiện toàn app: Quản trị/BGH bấm "Cập nhật dữ liệu" → các bảng thống kê tải lại ngay. */
export const FORCE_DATA_REFRESH_EVENT = 'lhhp:force-data-refresh';

export const databaseService = {
  // Authentication
  async login(
    username: string, 
    password: string, 
    selectedRoleScope?: LoginRoleScope, 
    selectedSchoolName?: string
  ): Promise<{ success: boolean; user?: UserAccount; message?: string }> {
    const cleanU = username.trim().toLowerCase();

    // 🛡️ Không chặn các tài khoản cũ nữa để cho phép tạo mới cùng tên

    const validateRole = (user: UserAccount): { valid: boolean; message?: string } => {
      if (!selectedRoleScope) return { valid: true };
      let valid = true;
      if (selectedRoleScope === 'admin') {
        valid = user.role === 'admin';
      } else if (selectedRoleScope === 'school_admin') {
        valid = user.role === 'school_admin' || Boolean(user.isSchoolAdmin) || user.role === 'bgh' || Boolean(user.isBgh) || user.role === 'admin';
      } else if (selectedRoleScope === 'guest_admin') {
        valid = user.role === 'guest_admin' || Boolean(user.isGuestAdmin) || user.role === 'admin';
      } else if (selectedRoleScope === 'personal_teacher') {
        valid = user.tenantType === 'guest' || 
                Boolean(user.schoolName && (user.schoolName.toLowerCase().includes('cá nhân') || user.schoolName.toLowerCase().includes('tự do') || user.schoolName.toLowerCase().includes('vãng lai')));
      } else if (selectedRoleScope === 'school_teacher') {
        valid = (user.tenantType === 'school' || user.role === 'homeroom' || user.role === 'subject' || user.role === 'bgh' || Boolean(user.isBgh)) &&
                !(user.tenantType === 'guest');
      }
      if (!valid) {
        return { valid: false, message: 'Bạn đã nhập không đúng vai trò với tài khoản được gán vui lòng kiểm tra lại' };
      }
      return { valid: true };
    };

    const validateSchool = (user: UserAccount): { valid: boolean; message?: string } => {
      if (user.role === 'admin' || user.role === 'guest_admin' || user.tenantType === 'guest') {
        return { valid: true };
      }
      if (selectedRoleScope === 'personal_teacher') {
        return { valid: true };
      }
      if (!selectedSchoolName || !selectedSchoolName.trim()) {
        return { valid: false, message: 'Bạn đã chọn sai trường.' };
      }
      const userSchool = (user.schoolName || '').trim();
      if (!userSchool) return { valid: true };

      const normalize = (name: string) => {
        return name
          .toLowerCase()
          .replace(/\(.*?\)/g, '')
          .replace(/trường\s+/gi, '')
          .replace(/tiểu học\s+/gi, 'th ')
          .replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]/g, '')
          .trim()
          .replace(/\s+/g, ' ');
      };

      const normUser = normalize(userSchool);
      const normSel = normalize(selectedSchoolName);
      // 🔒 STRICT MATCH: So sánh chính xác tên trường để tránh nhầm trường có tên tương tự
      const matches = normUser === normSel;
      if (!matches) {
        return { valid: false, message: 'Bạn đã chọn sai trường.' };
      }
      return { valid: true };
    };

    // 0. 🏫 CSDL NHÀ TRƯỜNG TRÊN GOOGLE DRIVE (Apps Script V4) — nguồn chuẩn của bản web
    const finishLogin = (authedUser: UserAccount, message: string) => {
      const roleCheck = validateRole(authedUser);
      if (!roleCheck.valid) return { success: false, message: roleCheck.message };
      const schoolCheck = validateSchool(authedUser);
      if (!schoolCheck.valid) return { success: false, message: schoolCheck.message };
      localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(authedUser));
      localStorage.setItem(LOCAL_SESSION_KEY, Date.now().toString());
      return { success: true, user: authedUser, message };
    };
    const isAdminScope = !selectedRoleScope || selectedRoleScope === 'admin';
    let driveDbInitialized = false;
    // Kết quả Drive khi không đăng nhập được qua Drive (Quản trị thử tiếp nguồn dự phòng) — để báo ĐÚNG nguyên nhân
    let driveFail: { status: string; message?: string } | null = null;
    const wrongCredMessage = () => {
      if (driveFail?.status === 'not_initialized') {
        return 'Thư mục dùng chung đã kết nối nhưng cơ sở dữ liệu nhà trường CHƯA CÓ TÀI KHOẢN nào (tệp csdl_truong.json trống hoặc bị mất, hoặc khôi phục sao lưu chưa ghi được tài khoản). Quản trị tối cao đăng nhập bằng mật khẩu khởi tạo mặc định để khởi tạo lại / khôi phục tệp sao lưu.';
      }
      if (driveFail?.status === 'unreachable') {
        return `Không kiểm tra được tài khoản trên Google Drive: ${driveFail.message || 'Apps Script không trả lời'}. Kiểm tra link Apps Script (/exec) đang kết nối, quyền truy cập "Bất kỳ ai" và phiên bản Apps Script (mục Cài đặt Apps Script).`;
      }
      return 'Bạn đã nhập sai tài khoản mật khẩu.';
    };
    try {
      driveDbInitialized = Boolean(JSON.parse(localStorage.getItem('lhhp_drive_schools_cache') || 'null')?.initialized);
    } catch (_) {}

    if (schoolDriveDbService.isConfigured()) {
      const driveRes = await schoolDriveDbService.login(username, password);
      if (driveRes.status === 'ok') {
        const result = finishLogin(driveRes.user, 'Đăng nhập thành công (CSDL nhà trường trên Google Drive).');
        if (result.success && (driveRes.user.role === 'admin' || driveRes.user.role === 'school_admin' || driveRes.user.isSchoolAdmin)) {
          // Quản trị đăng nhập máy mới: tải toàn bộ tài khoản (không mật khẩu) về để quản lý.
          // Chạy NỀN (không chờ) để vào phần mềm ngay; xong thì báo cho giao diện nạp lại danh sách tài khoản.
          schoolDriveDbService.pullForAdmin()
            .then(() => { try { window.dispatchEvent(new Event('lhhp:admin-users-pulled')); } catch (_) { /* ignore */ } })
            .catch(() => null);
        }
        return result;
      }
      if (driveRes.status === 'invalid' || driveRes.status === 'disabled') {
        return { success: false, message: driveRes.message };
      }
      driveFail = { status: driveRes.status, message: driveRes.message };
      if (driveRes.status === 'not_initialized') {
        driveDbInitialized = false;
        if (!isAdminScope) {
          return { success: false, message: 'Nhà trường chưa khởi tạo cơ sở dữ liệu trên thư mục dùng chung. Quản trị cần đăng nhập để khởi tạo trường và cấp tài khoản.' };
        }
      }
      // 'unreachable' (mất mạng / Apps Script cũ): BGH / giáo viên không có nguồn dự phòng nào khác
      // trên bản web — báo rõ lỗi kết nối thay vì báo nhầm "sai mật khẩu".
      if (driveRes.status === 'unreachable' && !isAdminScope) {
        return { success: false, message: `Không kết nối được cơ sở dữ liệu nhà trường trên Google Drive: ${driveRes.message}` };
      }
      // Quản trị: thử các nguồn dự phòng bên dưới (khởi tạo lần đầu)
    } else if (!isAdminScope) {
      return {
        success: false,
        message: 'Máy này chưa kết nối thư mục dùng chung của nhà trường. Hãy dán link thư mục (Ô 1) và link mã script (Ô 2) ở màn hình đăng nhập rồi bấm Xác thực.'
      };
    }

    // 1. Direct Supabase Cloud Authentication (works anywhere across devices)
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        const { data: userRow, error: uErr } = await supabase
          .from('users')
          .select('*')
          .eq('username', cleanU)
          .maybeSingle();

        if (!uErr && userRow) {
          const isSuperAdminUser = userRow.username === 'adminquantri';
          const isGuestAdminUser = userRow.username === 'admin' || userRow.username === 'quantricanhan';
          const defaultExpected = userRow.password || '';
          const isPwdMatch = (userRow.password === password) ||
            (password === defaultExpected) ||
            false; // (đã bỏ mật khẩu cửa sau)
          if (isPwdMatch) {
            // 🌟 SINGLE SOURCE OF TRUTH: Luôn lấy tên từ bảng users (full_name), KHÔNG bao giờ từ teacherProfile snapshot cũ
            const finalName = (userRow.full_name || userRow.fullName || '').trim();
            const finalAvatar = userRow.avatar || '';

            const authedUser: UserAccount = {
              id: userRow.id,
              username: userRow.username,
              fullName: finalName || userRow.username,
              role: userRow.role,
              isDemo: userRow.is_demo ?? userRow.isDemo,
              isBgh: userRow.is_bgh ?? userRow.isBgh,
              isSchoolAdmin: userRow.is_school_admin ?? userRow.isSchoolAdmin,
              isGuestAdmin: userRow.is_guest_admin ?? userRow.isGuestAdmin,
              tenantType: userRow.tenant_type || userRow.tenantType || 'school',
              maxStudentsAllowed: userRow.max_students_allowed || userRow.maxStudentsAllowed,
              email: userRow.email,
              phone: userRow.phone,
              avatar: finalAvatar,
              schoolName: userRow.school_name || userRow.schoolName,
              assignedClassName: userRow.assigned_class_name || userRow.assignedClassName,
              subjectName: userRow.subject_name || userRow.subjectName,
              createdAt: Number(userRow.created_at) || Date.now(),
              status: userRow.status || 'active'
            };

            const roleCheck = validateRole(authedUser);
            if (!roleCheck.valid) {
              return { success: false, message: roleCheck.message };
            }

            const schoolCheck = validateSchool(authedUser);
            if (!schoolCheck.valid) {
              return { success: false, message: schoolCheck.message };
            }

            localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(authedUser));
            localStorage.setItem(LOCAL_SESSION_KEY, Date.now().toString());

            // Initialize realtime listener automatically
            initSupabaseRealtime();

            return {
              success: true,
              user: authedUser,
              message: 'Đăng nhập thành công qua Supabase Cloud!'
            };
          } else {
            return { success: false, message: wrongCredMessage() };
          }
        }
      } catch (err) {
        console.warn('Supabase direct login check failed:', err);
      }
    }

    // 2. Local Node/Express Server Login Fallback (chỉ gọi khi chạy local dev, bỏ qua trên Vercel/Static để tránh lag)
    const isVercelHost = typeof window !== 'undefined' && (
      window.location.hostname.includes('vercel.app') || 
      window.location.hostname.includes('github.io')
    );

    if (!isVercelHost) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, selectedRoleScope, selectedSchoolName }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await res.json();
        if (res.ok && data.success && data.user) {
          const authedUser: UserAccount = {
            ...data.user
          };
          // Quản trị đăng nhập qua máy chủ: giữ phiên để ký các lần ghi CSDL nhà trường lên Drive
          if (authedUser.role === 'admin' || authedUser.role === 'school_admin' || authedUser.isSchoolAdmin) {
            schoolDriveDbService.rememberAdminAuth(authedUser.username, password);
          }

          const roleCheck = validateRole(authedUser);
          if (!roleCheck.valid) {
            return { success: false, message: roleCheck.message };
          }

          const schoolCheck = validateSchool(authedUser);
          if (!schoolCheck.valid) {
            return { success: false, message: schoolCheck.message };
          }

          localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(authedUser));
          localStorage.setItem(LOCAL_SESSION_KEY, Date.now().toString());
          initSupabaseRealtime();
          return { success: true, user: authedUser, message: data.message };
        }
        if (data && data.message) {
          return { success: false, message: data.message };
        }
      } catch (_) {}
    }

    // 3. Offline fallback & Dynamic Local Accounts Check (Hỗ trợ tài khoản mới tạo và tài khoản nạp từ Google Drive)
    let candidateUsers: UserAccount[] = [...FALLBACK_USERS];
    try {
      const rawStoredUsers = localStorage.getItem('LHHP_USERS');
      if (rawStoredUsers) {
        const parsedUsers = JSON.parse(rawStoredUsers);
        if (Array.isArray(parsedUsers)) {
          const knownUsernames = new Set(candidateUsers.map(u => u.username.toLowerCase()));
          parsedUsers.forEach((u: any) => {
            if (u && u.username && !knownUsernames.has(u.username.toLowerCase())) {
              candidateUsers.push({
                ...u,
                id: u.id || `user-${u.username.toLowerCase()}`,
                fullName: u.fullName || u.username,
                role: u.role || 'homeroom',
                status: u.status || 'active',
                createdAt: u.createdAt || Date.now()
              });
              knownUsernames.add(u.username.toLowerCase());
            }
          });
        }
      }
    } catch (_) {}

    let match = candidateUsers.find(u => u.username.toLowerCase() === cleanU);

    // ⚡ 3.1. Nếu chưa thấy và máy đã có cấu hình Google Drive: Tự động kéo nhanh CSDL phân cấp từ Drive về
    if (!match) {
      try {
        const driveCfg = googleDriveService.getConfig();
        if (driveCfg.scriptUrl && driveCfg.scriptUrl.trim()) {
          // 3.1.1. Thử kéo theo mã trường được chọn
          if (selectedSchoolName) {
            try {
              const rawS = localStorage.getItem(LOCAL_SCHOOLS_KEY);
              if (rawS) {
                const sList = JSON.parse(rawS);
                const foundS = sList.find((s: any) => s.name === selectedSchoolName);
                if (foundS && foundS.code) {
                  await googleDriveService.pullSchoolDataByCode(foundS.code);
                }
              }
            } catch (_) {}
          }

          // 3.1.2. Thử kéo phân cấp toàn hệ thống (adminquantri.json & quantrinhatruong.json)
          const pullRes = await googleDriveService.pullHierarchyDataFromDrive();
          if (pullRes.success) {
            // Tải lại candidateUsers sau khi kéo
            const rawReload = localStorage.getItem('LHHP_USERS');
            if (rawReload) {
              const reloadedUsers = JSON.parse(rawReload);
              if (Array.isArray(reloadedUsers)) {
                match = reloadedUsers.find((u: any) => u.username && u.username.toLowerCase() === cleanU);
              }
            }
          }
        }
      } catch (_) {}
    }

    if (match) {
      // 🔒 Không còn mật khẩu "cửa sau" (123456 / mật khẩu chung) cho mọi tài khoản.
      // Mật khẩu mặc định của Quản trị chỉ dùng để KHỞI TẠO khi thư mục dùng chung chưa có CSDL trường.
      const fallbackAdmin = FALLBACK_USERS.find(f => f.username === match!.username);
      const storedPassword = (match as any).password as string | undefined;
      const isBootstrapAdmin = Boolean(fallbackAdmin && !driveDbInitialized && password === fallbackAdmin.password);
      const isPasswordMatch = isBootstrapAdmin || Boolean(storedPassword && password === storedPassword && !fallbackAdmin);

      if (isPasswordMatch) {
        // Quản trị cao nhất giữ nguyên mật khẩu mặc định (không bắt buộc đổi) theo yêu cầu nhà trường
        const authedUser: UserAccount = {
          ...match
        };
        if (isBootstrapAdmin) {
          schoolDriveDbService.rememberAdminAuth(match.username, password);
        }

        const roleCheck = validateRole(authedUser);
        if (!roleCheck.valid) {
          return { success: false, message: roleCheck.message };
        }

        const schoolCheck = validateSchool(authedUser);
        if (!schoolCheck.valid) {
          return { success: false, message: schoolCheck.message };
        }

        localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(authedUser));
        localStorage.setItem(LOCAL_SESSION_KEY, Date.now().toString());
        return { success: true, user: authedUser, message: 'Đăng nhập thành công (chế độ dự phòng offline).' };
      } else {
        return { success: false, message: wrongCredMessage() };
      }
    }
    return { success: false, message: wrongCredMessage() };
  },

  isSessionValid(): boolean {
    try {
      const raw = localStorage.getItem(LOCAL_AUTH_KEY);
      const sessionTime = localStorage.getItem(LOCAL_SESSION_KEY);
      if (!raw || !sessionTime) return false;
      const elapsed = Date.now() - parseInt(sessionTime, 10);
      return elapsed < SESSION_TIMEOUT_MS;
    } catch (_) {
      return false;
    }
  },

  touchSession(): void {
    try {
      localStorage.setItem(LOCAL_SESSION_KEY, Date.now().toString());
    } catch (_) {}
  },

  getCurrentUser(): UserAccount | null {
    try {
      const raw = localStorage.getItem(LOCAL_AUTH_KEY);
      const sessionTime = localStorage.getItem(LOCAL_SESSION_KEY);
      if (!raw || !sessionTime) return null;
      const elapsed = Date.now() - parseInt(sessionTime, 10);
      if (elapsed > SESSION_TIMEOUT_MS) {
        // Expired after 300 minutes
        localStorage.removeItem(LOCAL_AUTH_KEY);
        localStorage.removeItem(LOCAL_SESSION_KEY);
        return null;
      }
      const user = JSON.parse(raw) as UserAccount;
      if (user && user.username) {
        const cleanU = user.username.trim().toLowerCase();
        // 🏛️ 1. Khớp từ bảng ánh xạ định danh khởi tạo chuẩn của Nhà trường
        if (ACCOUNT_IDENTITY_MAP[cleanU]) {
          const idInfo = ACCOUNT_IDENTITY_MAP[cleanU];
          user.fullName = idInfo.fullName;
          user.role = idInfo.role as any;
          user.schoolName = idInfo.schoolName;
          if (idInfo.role === 'school_admin') user.isSchoolAdmin = true;
          if (idInfo.role === 'bgh') user.isBgh = true;
        }

        const canonical = FALLBACK_USERS.find(u => u.username.toLowerCase() === cleanU);
        if (canonical) {
          // 🌟 SINGLE SOURCE OF TRUTH: Bảo đảm danh tính, vai trò và tên chuẩn xác 100% từ FALLBACK_USERS
          // KHÔNG bao giờ cho phép teacherProfile snapshot cũ ghi đè lên fullName
          user.fullName = canonical.fullName;
          user.role = canonical.role;
          user.schoolName = canonical.schoolName;
          user.avatar = canonical.avatar || user.avatar;
          user.isBgh = Boolean(canonical.isBgh);
          user.isSchoolAdmin = Boolean(canonical.isSchoolAdmin);
          user.isGuestAdmin = Boolean(canonical.isGuestAdmin);
          user.isDemo = Boolean(canonical.isDemo);
          user.tenantType = canonical.tenantType;
          user.assignedClassName = canonical.assignedClassName;
          user.subjectName = canonical.subjectName;
        }

        try {
          localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(user));
        } catch (_) {}
      }
      return user;
    } catch (_) {}
    return null;
  },

  logout(): void {
    localStorage.removeItem(LOCAL_AUTH_KEY);
    localStorage.removeItem(LOCAL_SESSION_KEY);
  },

  // User Management (Admin)
  async getUsers(): Promise<UserAccount[]> {
    const filterLegacyUsers = (list: UserAccount[]): UserAccount[] => {
      return (list || []).filter(u => {
        if (!u) return false;
        const uName = (u.username || '').toLowerCase();
        const sName = (u.schoolName || '').toLowerCase();
        void sName; // legacy TH_TN filter removed (demo school retired)
        return true;
      });
    };

    // 1. Kiểm tra môi trường Static/Vercel hoặc khi Supabase client sẵn sàng
    const isVercelOrStatic = typeof window !== 'undefined' && (
      window.location.hostname.includes('vercel.app') || 
      window.location.hostname.includes('github.io') ||
      window.location.port === '' ||
      window.location.protocol === 'https:'
    );

    const supabase = getBrowserSupabase();

    // Nếu chạy trên Vercel/Cloud host và có kết nối Supabase, ưu tiên lấy trực tiếp từ Supabase ngay lập tức (<200ms)
    if (isVercelOrStatic && supabase) {
      try {
        const { data: users, error } = await supabase.from('users').select('*');
        if (!error && Array.isArray(users)) {
          const mapped = users.map(u => ({
            id: u.id,
            username: u.username,
            password: u.password,
            fullName: u.full_name || u.fullName,
            role: u.role,
            email: u.email,
            phone: u.phone,
            avatar: u.avatar,
            schoolName: u.school_name || u.schoolName,
            assignedClassName: u.assigned_class_name || u.assignedClassName,
            subjectName: u.subject_name || u.subjectName,
            tenantType: u.tenant_type || (u.school_name?.toLowerCase().includes('cá nhân') ? 'guest' : 'school'),
            createdAt: Number(u.created_at) || Date.now(),
            status: u.status || 'active'
          }));
          return filterLegacyUsers(mapped);
        }
      } catch (err) {
        console.warn('Supabase getUsers direct error:', err);
      }
    }

    // 2. Server API nội bộ (chỉ khi chạy local dev có backend Express)
    if (!isVercelOrStatic) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${getApiBaseUrl()}/api/users`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.users)) {
            // Smart merge: Bổ sung các user từ localStorage mà server có thể chưa có (race condition)
            let mergedUsers: UserAccount[] = [...data.users];
            try {
              const rawStored = localStorage.getItem('LHHP_USERS');
              if (rawStored) {
                const storedList: UserAccount[] = JSON.parse(rawStored);
                if (Array.isArray(storedList)) {
                  const serverUsernames = new Set(mergedUsers.map(u => u.username?.toLowerCase()));
                  for (const lu of storedList) {
                    if (lu?.username && !serverUsernames.has(lu.username.toLowerCase())) {
                      mergedUsers.push(lu);
                    }
                  }
                }
              }
            } catch (_) {}
            return filterLegacyUsers(mergedUsers);
          }
        }
      } catch (err) {
        console.warn('Error fetching users from local server:', err);
      }
    }

    // 3. Direct Supabase Cloud (Fallback nếu bước trên chưa lấy được)
    if (supabase) {
      try {
        const { data: users, error } = await supabase.from('users').select('*');
        if (!error && Array.isArray(users)) {
          const mapped = users.map(u => ({
            id: u.id,
            username: u.username,
            password: u.password,
            fullName: u.full_name || u.fullName,
            role: u.role,
            email: u.email,
            phone: u.phone,
            avatar: u.avatar,
            schoolName: u.school_name || u.schoolName,
            assignedClassName: u.assigned_class_name || u.assignedClassName,
            subjectName: u.subject_name || u.subjectName,
            tenantType: u.tenant_type || (u.school_name?.toLowerCase().includes('cá nhân') ? 'guest' : 'school'),
            createdAt: Number(u.created_at) || Date.now(),
            status: u.status || 'active'
          }));
          return filterLegacyUsers(mapped);
        }
      } catch (err) {
        console.warn('Supabase getUsers error:', err);
      }
    }

    // 4. LocalStorage cache cho môi trường Static / Vercel
    try {
      const rawStoredUsers = localStorage.getItem('LHHP_USERS');
      if (rawStoredUsers) {
        const parsed = JSON.parse(rawStoredUsers);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return filterLegacyUsers(parsed);
        }
      }
    } catch (_) {}

    return FALLBACK_USERS;
  },

  async createUser(payload: {
    username: string;
    password?: string;
    fullName: string;
    role: UserRole;
    email?: string;
    phone?: string;
    assignedClassName?: string;
    subjectName?: string;
    schoolName?: string;
    tenantType?: 'school' | 'guest' | 'demo';
  }): Promise<{ success: boolean; user?: UserAccount; message?: string }> {
    const cleanU = payload.username.trim().toLowerCase();
    const newId = 'user-' + cleanU;
    const nowTs = Date.now();

    // Demo school retired: never auto-flag accounts as demo.
    const isDemoSchool = false;

    const newUser: UserAccount = {
      id: newId,
      username: cleanU,
      fullName: payload.fullName.trim(),
      role: payload.role,
      isDemo: isDemoSchool,
      maxStudentsAllowed: isDemoSchool ? 10 : undefined,
      email: payload.email?.trim() || `${cleanU}@lophoc.edu.vn`,
      phone: payload.phone?.trim() || '',
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanU}&backgroundColor=ffd5dc`,
      assignedClassName: payload.assignedClassName?.trim() || (payload.role === 'homeroom' ? '4A1' : undefined),
      subjectName: payload.subjectName?.trim() || (payload.role === 'subject' ? 'Tin học' : undefined),
      schoolName: payload.schoolName?.trim() || 'Trường Tiểu học',
      createdAt: nowTs,
      status: 'active',
      tenantType: payload.tenantType || 'school'
    };

    // 1. Luôn lưu vào LocalStorage để cache tức thì
    try {
      const rawStored = localStorage.getItem('LHHP_USERS');
      const uList = rawStored ? JSON.parse(rawStored) : [];
      const updated = [...uList.filter((u: any) => u.username !== cleanU), newUser];
      localStorage.setItem('LHHP_USERS', JSON.stringify(updated));
    } catch (_) {}

    // 2. Ghi song song lên Supabase Cloud (nếu có cấu hình)
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        await supabase.from('users').upsert({
          id: newId,
          username: cleanU,
          password: payload.password || '123456',
          full_name: newUser.fullName,
          role: newUser.role,
          is_demo: newUser.isDemo,
          max_students_allowed: newUser.maxStudentsAllowed,
          email: newUser.email,
          phone: newUser.phone,
          avatar: newUser.avatar,
          school_name: newUser.schoolName,
          assigned_class_name: newUser.assignedClassName,
          subject_name: newUser.subjectName,
          status: newUser.status,
          created_at: new Date().toISOString()
        }, { onConflict: 'username' });
      } catch (sbErr) {
        console.warn('[Supabase createUser exception]', sbErr);
      }
    }

    const isVercelOrStatic = typeof window !== 'undefined' && (
      window.location.hostname.includes('vercel.app') ||
      window.location.hostname.includes('github.io') ||
      window.location.port === '' ||
      window.location.protocol === 'https:'
    );

    // 3. Nếu chạy local dev (có backend Express), BẮT BUỘC gửi tới /api/users để lưu vào CSDL JSON máy chủ
    if (!isVercelOrStatic) {
      try {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          // Cập nhật lại cache LHHP_USERS từ kết quả backend nếu có
          if (data?.user) {
            try {
              const rawStored = localStorage.getItem('LHHP_USERS');
              const uList = rawStored ? JSON.parse(rawStored) : [];
              const updated = [...uList.filter((u: any) => u.username !== cleanU), data.user];
              localStorage.setItem('LHHP_USERS', JSON.stringify(updated));
            } catch (_) {}
          }
          return data;
        } else {
          try {
            const errData = await res.json();
            if (errData?.message) return errData;
          } catch (_) {}
        }
      } catch (err: any) {
        console.warn('Lỗi gọi /api/users nội bộ, dùng kết quả fallback:', err);
      }
    }

    return { success: true, user: newUser, message: 'Đã tạo tài khoản thành công!' };
  },

  async createUsersBulk(items: Array<{
    username: string;
    password?: string;
    fullName: string;
    role: UserRole;
    email?: string;
    phone?: string;
    assignedClassName?: string;
    subjectName?: string;
    schoolName?: string;
    tenantType?: 'school' | 'guest';
    /** Gắn với nhân sự chấm công (tài khoản dùng chung) */
    staffCode?: string;
    /** Phân hiệu / điểm trường của lớp chủ nhiệm */
    assignedBranch?: string;
    assignedCampus?: string;
  }>): Promise<{ success: boolean; count: number; created?: UserAccount[]; errors?: string[]; message?: string }> {
    if (!items || items.length === 0) {
      return { success: false, count: 0, message: 'Danh sách tạo rỗng.' };
    }

    const nowTs = Date.now();
    const newAccounts: UserAccount[] = items.map((item, idx) => {
      const cleanU = item.username.trim().toLowerCase();
      // Demo school retired: never auto-flag accounts as demo.
      const isDemoSchool = false;
      return {
        id: `user-${cleanU}`,
        username: cleanU,
        fullName: item.fullName.trim(),
        role: item.role,
        isDemo: isDemoSchool,
        maxStudentsAllowed: isDemoSchool ? 10 : undefined,
        email: item.email?.trim() || `${cleanU}@lophoc.edu.vn`,
        phone: item.phone?.trim() || '',
        avatar: item.role === 'homeroom'
          ? `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanU}&backgroundColor=ffd5dc`
          : item.role === 'subject'
          ? `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanU}&backgroundColor=b6e3f4`
          : `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanU}&backgroundColor=d1d4f9`,
        assignedClassName: item.assignedClassName?.trim() || (item.role === 'homeroom' ? 'Lớp mới' : undefined),
        subjectName: item.subjectName?.trim() || (item.role === 'subject' ? 'Tin học' : undefined),
        schoolName: item.schoolName?.trim() || 'Trường Tiểu học',
        tenantType: item.tenantType || 'school',
        createdAt: nowTs + idx,
        status: 'active',
        ...(item.staffCode ? { staffCode: String(item.staffCode).trim().toUpperCase() } : {}),
        ...(item.assignedBranch?.trim() ? { assignedBranch: item.assignedBranch.trim() } : {}),
        ...(item.assignedCampus?.trim() ? { assignedCampus: item.assignedCampus.trim() } : {})
      };
    });

    // 1. CẬP NHẬT TỨC THÌ VÀO LOCALSTORAGE (0ms - Zero Latency)
    try {
      const rawStored = localStorage.getItem('LHHP_USERS');
      const uList: UserAccount[] = rawStored ? JSON.parse(rawStored) : [];
      const newMap = new Map<string, UserAccount>();
      for (const u of uList) newMap.set(u.username.toLowerCase(), u);
      for (const nu of newAccounts) newMap.set(nu.username.toLowerCase(), nu);
      localStorage.setItem('LHHP_USERS', JSON.stringify(Array.from(newMap.values())));
    } catch (_) {}

    const isVercelOrStatic = typeof window !== 'undefined' && (
      window.location.hostname.includes('vercel.app') ||
      window.location.hostname.includes('github.io') ||
      window.location.port === '' ||
      window.location.protocol === 'https:'
    );

    let backendResult: any = null;

    // 2. NẾU CHẠY LOCAL DEV: GỌI EXPRESS BACKEND (/api/users/bulk) VỚI TIMEOUT 4000ms
    if (!isVercelOrStatic) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch('/api/users/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ users: items }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          backendResult = await res.json();
          // Cập nhật lại cache với danh sách từ server nếu có
          if (backendResult?.created && Array.isArray(backendResult.created)) {
            try {
              const rawStored = localStorage.getItem('LHHP_USERS');
              const uList: UserAccount[] = rawStored ? JSON.parse(rawStored) : [];
              const newMap = new Map<string, UserAccount>();
              for (const u of uList) newMap.set(u.username.toLowerCase(), u);
              for (const nu of backendResult.created) newMap.set(nu.username.toLowerCase(), nu);
              localStorage.setItem('LHHP_USERS', JSON.stringify(Array.from(newMap.values())));
            } catch (_) {}
          }
        }
      } catch (err) {
        console.warn('Lỗi gọi /api/users/bulk nội bộ, sử dụng dữ liệu local:', err);
      }
    }

    // 3. ĐỒNG BỘ SUPABASE CLOUD CHẠY SONG SONG KHÔNG CHẶN (Background Non-Blocking Sync)
    const supabase = getBrowserSupabase();
    if (supabase && items.length > 0) {
      (async () => {
        try {
          const rows = items.map(item => {
            const cleanU = item.username.trim().toLowerCase();
            return {
              id: 'user-' + cleanU,
              username: cleanU,
              password: item.password || '123456',
              full_name: item.fullName.trim(),
              role: item.role,
              email: item.email?.trim() || `${cleanU}@lophoc.edu.vn`,
              phone: item.phone?.trim() || '',
              avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanU}&backgroundColor=ffd5dc`,
              assigned_class_name: item.assignedClassName?.trim() || (item.role === 'homeroom' ? 'Lớp mới' : undefined),
              subject_name: item.subjectName?.trim() || (item.role === 'subject' ? 'Tin học' : undefined),
              school_name: item.schoolName?.trim() || 'Trường Tiểu học',
              status: 'active',
              created_at: new Date().toISOString()
            };
          });
          await supabase.from('users').upsert(rows, { onConflict: 'username' });
        } catch (sbErr) {
          console.warn('[Supabase Bulk Sync Background] Ngoại lệ không chặn UI:', sbErr);
        }
      })();
    }

    return backendResult || { 
      success: true, 
      count: newAccounts.length, 
      created: newAccounts, 
      message: `Đã tạo ${newAccounts.length} tài khoản giáo viên thành công!` 
    };
  },

  async updateUser(id: string, payload: Partial<UserAccount> & { username?: string }): Promise<{ success: boolean; user?: UserAccount; message?: string }> {
    const cleanId = id.trim().toLowerCase();
    const newUsernameClean = payload.username ? payload.username.trim().toLowerCase() : undefined;
    let updatedLocalUser: UserAccount | undefined;

    // 1. CẬP NHẬT TỨC THÌ VÀO LOCALSTORAGE (0ms - Zero Latency)
    try {
      const rawStored = localStorage.getItem('LHHP_USERS');
      if (rawStored) {
        const uList: UserAccount[] = JSON.parse(rawStored);
        const idx = uList.findIndex((u: any) => u.id === id || u.username.toLowerCase() === cleanId);
        if (idx >= 0) {
          const current = uList[idx];
          const updated: UserAccount = {
            ...current,
            ...payload,
            username: newUsernameClean || current.username,
            fullName: payload.fullName !== undefined ? payload.fullName.trim() : current.fullName,
            role: payload.role !== undefined ? payload.role : current.role,
            phone: payload.phone !== undefined ? payload.phone : current.phone,
            email: payload.email !== undefined ? payload.email : current.email,
            assignedClassName: payload.assignedClassName !== undefined ? payload.assignedClassName : current.assignedClassName,
            subjectName: payload.subjectName !== undefined ? payload.subjectName : current.subjectName,
            schoolName: payload.schoolName !== undefined ? payload.schoolName : current.schoolName,
            tenantType: payload.tenantType !== undefined ? payload.tenantType : current.tenantType,
            status: payload.status !== undefined ? payload.status : current.status
          };
          uList[idx] = updated;
          updatedLocalUser = updated;
          localStorage.setItem('LHHP_USERS', JSON.stringify(uList));

          // Di chuyển cache userData nếu đổi username
          if (newUsernameClean && newUsernameClean !== current.username.toLowerCase()) {
            const oldKey = LOCAL_DB_PREFIX + current.username.toLowerCase();
            const newKey = LOCAL_DB_PREFIX + newUsernameClean;
            const oldData = localStorage.getItem(oldKey);
            if (oldData) {
              localStorage.setItem(newKey, oldData);
              localStorage.removeItem(oldKey);
            }
          }
        }
      }
    } catch (_) {}

    const isVercelOrStatic = typeof window !== 'undefined' && (
      window.location.hostname.includes('vercel.app') ||
      window.location.hostname.includes('github.io') ||
      window.location.port === '' ||
      window.location.protocol === 'https:'
    );

    let backendResult: any = null;

    // 2. NẾU CHẠY LOCAL DEV: GỌI EXPRESS BACKEND (/api/users/:id) ƯU TIÊN VỚI TIMEOUT NHANH (2000ms)
    if (!isVercelOrStatic) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`/api/users/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          try {
            backendResult = await res.json();
          } catch (_) {
            backendResult = { success: true };
          }
        }
      } catch (err) {
        console.warn('Lỗi gọi /api/users/:id cục bộ, tiếp tục với dữ liệu local:', err);
      }
    }

    // 3. ĐỒNG BỘ SUPABASE CLOUD CHẠY SONG SONG KHÔNG CHẶN (Background Non-Blocking Sync)
    const supabase = getBrowserSupabase();
    if (supabase) {
      (async () => {
        try {
          const dbPayload: any = {};
          if (payload.username !== undefined) dbPayload.username = payload.username.trim().toLowerCase();
          if (payload.fullName !== undefined) dbPayload.full_name = payload.fullName;
          if (payload.avatar !== undefined) dbPayload.avatar = payload.avatar;
          if (payload.phone !== undefined) dbPayload.phone = payload.phone;
          if (payload.schoolName !== undefined) dbPayload.school_name = payload.schoolName;
          if (payload.assignedClassName !== undefined) dbPayload.assigned_class_name = payload.assignedClassName;
          if (payload.subjectName !== undefined) dbPayload.subject_name = payload.subjectName;
          if (payload.email !== undefined) dbPayload.email = payload.email;
          if (payload.role !== undefined) dbPayload.role = payload.role;
          if (payload.status !== undefined) dbPayload.status = payload.status;

          // Bọc timeout 2500ms cho Supabase để không bao giờ bị kẹt
          const sbPromise = supabase
            .from('users')
            .update(dbPayload)
            .or(`id.eq.${id},username.eq.${id}`);
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase timeout')), 2500));
          await Promise.race([sbPromise, timeoutPromise]);

          if (payload.username && payload.username.trim().toLowerCase() !== id.trim().toLowerCase()) {
            const oldUser = id.trim().toLowerCase();
            const newUser = payload.username.trim().toLowerCase();
            try {
              await supabase
                .from('user_classroom_data')
                .update({ username: newUser })
                .eq('username', oldUser);
            } catch (_) {}
          }

          // Broadcast realtime change
          initSupabaseRealtime();
          if (realtimeChannel) {
            realtimeChannel.send({
              type: 'broadcast',
              event: 'user_data_updated',
              payload: {
                username: payload.username || id,
                originClientId: CLIENT_ID,
                timestamp: Date.now(),
                message: 'Thông tin tài khoản đã được cập nhật'
              }
            }).catch(() => {});
          }
        } catch (sbErr) {
          console.warn('[Supabase Sync Background] Ngoại lệ không chặn UI:', sbErr);
        }
      })();
    }

    // Broadcast tab nội bộ
    try {
      if (localBroadcastChannel) {
        localBroadcastChannel.postMessage({
          type: 'USER_DATA_CHANGED',
          username: payload.username || id,
          originClientId: CLIENT_ID,
          timestamp: Date.now()
        });
      }
    } catch (_) {}

    return backendResult || { success: true, user: updatedLocalUser, message: 'Đã cập nhật thông tin tài khoản thành công.' };
  },

  async deleteUser(id: string): Promise<{ success: boolean; message?: string }> {
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        await supabase.from('users').delete().or(`id.eq.${id},username.eq.${id}`);
        await supabase.from('user_classroom_data').delete().or(`username.eq.${id}`);
      } catch (err) {
        console.warn('Supabase delete user error:', err);
      }
    }
    
    // Clean up local cache & users list
    try {
      localStorage.removeItem(LOCAL_DB_PREFIX + id.toLowerCase());
      const rawStored = localStorage.getItem('LHHP_USERS');
      if (rawStored) {
        const uList = JSON.parse(rawStored);
        if (Array.isArray(uList)) {
          const filtered = uList.filter((u: any) => u.id !== id && u.username !== id);
          localStorage.setItem('LHHP_USERS', JSON.stringify(filtered));
        }
      }
    } catch (_) {}

    const isVercelOrStatic = typeof window !== 'undefined' && (
      window.location.hostname.includes('vercel.app') ||
      window.location.hostname.includes('github.io') ||
      window.location.port === '' ||
      window.location.protocol === 'https:'
    );

    // Nếu chạy trên Vercel hoặc static host, không có backend Express /api/users
    if (isVercelOrStatic) {
      return { success: true, message: 'Đã xóa tài khoản thành công.' };
    }

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'DELETE'
      });
      // Handle 204 No Content or response.ok safely without JSON parse error
      if (res.status === 204 || res.ok) {
        let data: any = { success: true, message: 'Đã xóa tài khoản thành công.' };
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            data = await res.json();
          } catch (_) {}
        }
        return data;
      } else {
        let errMsg = 'Lỗi máy chủ khi xóa tài khoản.';
        try {
          const errData = await res.json();
          if (errData?.message) errMsg = errData.message;
        } catch (_) {}
        return { success: false, message: errMsg };
      }
    } catch (err: any) {
      // If Supabase already deleted, consider successful
      if (supabase) {
        return { success: true, message: 'Đã xóa tài khoản trên hệ thống.' };
      }
      return { success: false, message: err?.message || 'Lỗi kết nối khi xóa tài khoản.' };
    }
  },

  /** Gán 1 mật khẩu chung cho nhiều tài khoản (Quản trị) */
  async resetPasswordsBulk(ids: string[], newPassword: string): Promise<{ success: boolean; count: number; failed: string[]; message?: string }> {
    const failed: string[] = [];
    let count = 0;
    for (const id of ids) {
      try {
        const r = await (this as any).resetPassword(id, newPassword);
        if (r?.success) count++; else failed.push(id);
      } catch (_) { failed.push(id); }
    }
    return { success: count > 0 || ids.length === 0, count, failed, message: failed.length ? `Có ${failed.length} tài khoản chưa đổi được mật khẩu.` : undefined };
  },

  async resetPassword(id: string, newPassword = '123456'): Promise<{ success: boolean; message?: string }> {
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        await supabase.from('users').update({ password: newPassword }).or(`id.eq.${id},username.eq.${id}`);
      } catch (_) {}
    }
    try {
      const res = await fetch(`/api/users/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, message: err?.message || 'Lỗi kết nối khi đặt lại mật khẩu.' };
    }
  },

  async transferUserToSchool(id: string, targetSchoolName: string): Promise<{
    success: boolean;
    user?: UserAccount;
    message?: string;
    transferredData?: {
      classesCount: number;
      studentsCount: number;
      oldSchool: string;
      newSchool: string;
    };
  }> {
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        await supabase
          .from('users')
          .update({
            tenant_type: 'school',
            school_name: targetSchoolName,
            is_guest_admin: false
          })
          .or(`id.eq.${id},username.eq.${id}`);
      } catch (_) {}
    }
    try {
      const res = await fetch(`/api/users/${id}/transfer-school`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSchoolName })
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, message: err?.message || 'Lỗi kết nối khi di chuyển tài khoản sang trường học.' };
    }
  },

  // Clean up only temporary non-essential caches (Strict: NEVER purge user databases or quiz banks)
  purgeLocalStorageUserData(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('lop_hoc_temp_') || key.startsWith('lop_hoc_cache_'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  },

  // Tự động làm sạch và nén nhẹ dữ liệu trước khi gửi lên đám mây Supabase để đảm bảo payload < 500KB
  async sanitizeAndCompressPayload(data: UserClassroomData): Promise<UserClassroomData> {
    if (!data) return data;
    try {
      const cloned: UserClassroomData = JSON.parse(JSON.stringify(data));

      // 1. Tối ưu ảnh đại diện học sinh
      if (Array.isArray(cloned.students)) {
        cloned.students = await Promise.all(
          cloned.students.map(async (st) => {
            const cleanSt = { ...st };
            // Nén ảnh avatar nếu là base64 lớn > 40KB
            if (typeof cleanSt.avatar === 'string' && cleanSt.avatar.startsWith('data:image') && cleanSt.avatar.length > 45000) {
              cleanSt.avatar = await this.compressImageBase64(cleanSt.avatar, 256, 0.82);
            }
            // Loại bỏ trường originalAvatar khổng lồ nếu kích thước > 40KB để tránh lãng phí dung lượng
            if (cleanSt.originalAvatar && typeof cleanSt.originalAvatar === 'string' && cleanSt.originalAvatar.length > 40000) {
              cleanSt.originalAvatar = cleanSt.avatar;
            }
            return cleanSt;
          })
        );
      }

      // 2. Tối ưu ảnh trong kho câu hỏi quiz
      if (Array.isArray(cloned.quizBank)) {
        cloned.quizBank = await Promise.all(
          cloned.quizBank.map(async (q) => {
            const cleanQ = { ...q };
            if (cleanQ.image && cleanQ.image.startsWith('data:image') && cleanQ.image.length > 70000) {
              cleanQ.image = await this.compressImageBase64(cleanQ.image, 600, 0.80);
            }
            if (cleanQ.answerImage && cleanQ.answerImage.startsWith('data:image') && cleanQ.answerImage.length > 70000) {
              cleanQ.answerImage = await this.compressImageBase64(cleanQ.answerImage, 600, 0.80);
            }
            if (Array.isArray(cleanQ.optionImages)) {
              cleanQ.optionImages = await Promise.all(
                cleanQ.optionImages.map(async (optImg) => {
                  if (optImg && optImg.startsWith('data:image') && optImg.length > 50000) {
                    return await this.compressImageBase64(optImg, 380, 0.80);
                  }
                  return optImg;
                })
              );
            }
            return cleanQ;
          })
        );
      }

      // 3. Giới hạn lịch sử giao dịch điểm 350 mục gần nhất
      if (Array.isArray(cloned.transactions) && cloned.transactions.length > 350) {
        cloned.transactions = cloned.transactions.slice(0, 350);
      }

      return cloned;
    } catch (_) {
      return data;
    }
  },

  async loadUserData(username: string): Promise<UserClassroomData | null> {
    const cleanUser = username.trim().toLowerCase();
    
    // 1. Tầng 1: Express Server API nội bộ (cực nhanh 1-3ms khi chạy localhost/máy chủ)
    const isVercelHost = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
    if (!isVercelHost) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${getApiBaseUrl()}/api/user-data/${encodeURIComponent(cleanUser)}?t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const result = await res.json();
          if (result.success && result.found && result.data) {
            try {
              localStorage.setItem(LOCAL_DB_PREFIX + cleanUser, JSON.stringify(result.data));
            } catch (_) {}
            return result.data as UserClassroomData;
          }
        }
      } catch (err) {
        // Fallback sang các tầng tiếp theo
      }
    }

    // 2. Tầng 2: Supabase Cloud (với Timeout 1.5s bảo vệ, không để treo nếu URL 404 hoặc mạng lag)
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        const queryPromise = supabase
          .from('user_classroom_data')
          .select('data, updated_at')
          .eq('username', cleanUser)
          .maybeSingle();

        const timeoutPromise = new Promise<{ data: any; error: any }>((resolve) => 
          setTimeout(() => resolve({ data: null, error: new Error('Supabase query timeout') }), 1500)
        );

        const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

        if (!error && data?.data) {
          const cData = data.data as UserClassroomData;
          try {
            localStorage.setItem(LOCAL_DB_PREFIX + cleanUser, JSON.stringify(cData));
          } catch (_) {}
          return cData;
        }
      } catch (err) {
        console.warn(`Supabase loadUserData (${cleanUser}) error:`, err);
      }
    }

    // 3. Tầng 3: LocalStorage fallback (An toàn tuyệt đối 0ms nếu offline hoặc mạng tạm thời gián đoạn)
    try {
      const cached = localStorage.getItem(LOCAL_DB_PREFIX + cleanUser);
      if (cached) {
        return JSON.parse(cached) as UserClassroomData;
      }
    } catch (_) {}

    // (Đã bỏ "alias" gvcn1a1 <-> gvcn_1a1: hai tên đăng nhập khác nhau là hai tài khoản khác nhau;
    //  ghép bí danh từng nạp nhầm dữ liệu lớp của tài khoản cũ.)

    // 5. Tầng 5: Nếu chưa có dữ liệu thì trả về null để khởi tạo sạch
    return null;
  },

  async saveUserData(username: string, data: UserClassroomData): Promise<boolean> {
    // 👁️ Chế độ chỉ xem (Quản trị đang xem lớp của giáo viên): KHÔNG ghi gì
    if (isViewOnly()) return true;
    const cleanUser = username.trim().toLowerCase();
    let isSuccess = false;

    // 1. Tầng 1 (LocalStorage First & Immediate): Lưu đồng bộ ngay lập tức vào trình duyệt (0ms)
    try {
      localStorage.setItem(LOCAL_DB_PREFIX + cleanUser, JSON.stringify(data));
      // (Đã bỏ chép dữ liệu sang "alias" gvcn1a1 <-> gvcn_1a1 — từng tạo ra lớp 1A1 trùng lặp)
      isSuccess = true;
    } catch (_) {}

    // Cập nhật thông báo đa tab nội bộ tức thì
    try {
      if (localBroadcastChannel) {
        localBroadcastChannel.postMessage({
          type: 'DATA_CHANGED',
          username: cleanUser,
          originClientId: CLIENT_ID,
          timestamp: data.updatedAt || Date.now()
        });
      }
      localStorage.setItem('lop_hoc_realtime_ping', JSON.stringify({
        username: cleanUser,
        originClientId: CLIENT_ID,
        timestamp: data.updatedAt || Date.now(),
        r: Math.random()
      }));
    } catch (_) {}

    // 2. Tầng 2: Gửi lên Express Backend Server (/api/user-data/:username) với Timeout 2.5s (1-3ms)
    const isVercelHost = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
    if (!isVercelHost) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(`/api/user-data/${encodeURIComponent(cleanUser)}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Client-Id': CLIENT_ID
          },
          body: JSON.stringify(data),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const result = await res.json();
          if (result.success) isSuccess = true;
        }
      } catch (err) {
        console.warn(`Lỗi đồng bộ dữ liệu người dùng ${cleanUser} lên máy chủ:`, err);
      }
    }

    // 3. Tầng 3: Supabase Cloud Database (Chạy ngầm Non-Blocking Async, không bao giờ chặn UI giáo viên)
    const supabase = getBrowserSupabase();
    if (supabase) {
      (async () => {
        try {
          const payloadToUpload = await this.sanitizeAndCompressPayload(data);
          // Runs in the background (never blocks the UI), so wait for the real result:
          // large payloads (class/student photos) often need more than a couple of seconds,
          // and a premature timeout used to skip the realtime broadcast to executive accounts.
          const { error } = await supabase
            .from('user_classroom_data')
            .upsert({
              username: cleanUser,
              data: payloadToUpload,
              updated_at: new Date().toISOString()
            }, { onConflict: 'username' });

          if (!error) {
            initSupabaseRealtime();
            if (realtimeChannel) {
              realtimeChannel.send({
                type: 'broadcast',
                event: 'user_data_updated',
                payload: {
                  username: cleanUser,
                  originClientId: CLIENT_ID,
                  timestamp: data.updatedAt || Date.now()
                }
              }).catch(() => {});
            }
          }
        } catch (_) {}
      })();
    }

    // 4. Tầng 4: Tự động ghi đè 1 file JSON duy nhất trên ổ đĩa cấu hình (D/E/F...) theo vai trò tài khoản
    try {
      let curUser = this.getCurrentUser();
      if (!curUser && cleanUser) {
        curUser = {
          username: cleanUser,
          role: (cleanUser === 'adminquantri' || cleanUser === 'admin') ? 'admin' : (cleanUser.includes('quantri') ? 'school_admin' : (cleanUser.includes('bgh') ? 'bgh' : 'homeroom'))
        } as any;
      }
      const activeClassName = data.classes?.find(c => c.id === data.activeClassId)?.name || data.classes?.[0]?.name;
      dataStorageService.autoSaveToConfiguredLocation(data, curUser, data.teacherRole, activeClassName);
    } catch (_) {}

    // 5. Tầng 5: Tự động ghi đè liên tục theo thời gian thực lên Google Drive đã cấu hình
    try {
      let curUser = this.getCurrentUser();
      if (!curUser && cleanUser) {
        curUser = {
          username: cleanUser,
          role: (cleanUser === 'adminquantri' || cleanUser === 'admin') ? 'admin' : (cleanUser.includes('quantri') ? 'school_admin' : (cleanUser.includes('bgh') ? 'bgh' : 'homeroom'))
        } as any;
      }
      const activeClassId = data.activeClassId || data.classes?.[0]?.id;
      googleDriveService.autoSyncCurrentData(data, curUser, activeClassId, data.teacherRole);
    } catch (_) {}

    return isSuccess;
  },

  // ⚡ GVCN phát sóng xác nhận điểm danh/bán trú tức thì tới BGH và Quản trị nhà trường
  async broadcastAttendanceConfirmed(opts: {
    type: 'ATTENDANCE_CONFIRMED' | 'BOARDING_CONFIRMED' | 'ATTENDANCE_UPDATED' | 'BOARDING_UPDATED';
    classId: string;
    className?: string;
    date: string;
    attendanceRecord?: any;
    boardingRecord?: any;
    schoolName?: string;
    username?: string;
  }): Promise<void> {
    const event = {
      ...opts,
      timestamp: Date.now(),
      originClientId: CLIENT_ID,
      message: opts.type === 'ATTENDANCE_CONFIRMED'
        ? `✅ Lớp ${opts.className || opts.classId} đã xác nhận điểm danh ngày ${opts.date}`
        : opts.type === 'BOARDING_CONFIRMED'
          ? `🍱 Lớp ${opts.className || opts.classId} đã xác nhận bán trú ngày ${opts.date}`
          : `📊 Lớp ${opts.className || opts.classId} cập nhật dữ liệu ${opts.date}`
    };

    // 1. Broadcast qua Supabase Cloud Realtime (cross-device)
    const supabase = getBrowserSupabase();
    if (supabase && realtimeChannel) {
      try {
        await realtimeChannel.send({
          type: 'broadcast',
          event: 'user_data_updated',
          payload: event
        });
      } catch (_) {}
    }

    // 2. Broadcast qua SSE server (Express Multi-device Hub)
    try {
      await fetch(`${getApiBaseUrl()}/api/realtime/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      });
    } catch (_) {}

    // 3. Broadcast qua BroadcastChannel liên tab (0ms)
    try {
      if (localBroadcastChannel) {
        localBroadcastChannel.postMessage(event);
      }
    } catch (_) {}

    // 4. Broadcast qua Storage Event liên cửa sổ trình duyệt (0ms)
    try {
      localStorage.setItem('lop_hoc_realtime_ping', JSON.stringify({
        ...event,
        r: Math.random()
      }));
    } catch (_) {}
  },

  // Real-time Event listener across computers and browsers
  subscribeRealtimeUpdates(
    username: string,
    onUpdate: (event: { 
      type: string; 
      action?: string;
      classData?: any;
      classId?: string;
      attendanceRecord?: any;
      boardingRecord?: any;
      transaction?: any;
      points?: number;
      studentId?: string;
      username?: string; 
      targetUsername?: string; 
      timestamp: number; 
      originClientId?: string; 
      message?: string;
      schoolName?: string;
    }) => void
  ): () => void {
    const cleanUser = username.trim().toLowerCase();

    // 1. Supabase Cloud Realtime Channel
    initSupabaseRealtime();
    realtimeListeners.add(onUpdate);

    // 2. Server EventSource (if running local Express server)
    let eventSource: EventSource | null = null;
    let reconnectTimer: any = null;

    const connect = () => {
      try {
        // Bản web tĩnh (không có máy chủ Express): không mở luồng SSE, kiểm tra lại sau 60 giây
        if (typeof window !== 'undefined' && (window as any).__lhhpApiAvailable === false) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, 60000);
          return;
        }
        const url = `${getApiBaseUrl()}/api/realtime/stream?username=${encodeURIComponent(cleanUser)}&clientId=${encodeURIComponent(CLIENT_ID)}`;
        eventSource = new EventSource(url);

        eventSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data && data.originClientId !== CLIENT_ID) {
              onUpdate(data);
            }
          } catch (_) {}
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch (err) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 4000);
      }
    };

    connect();

    return () => {
      realtimeListeners.delete(onUpdate);
      clearTimeout(reconnectTimer);
      if (eventSource) {
        eventSource.close();
      }
    };
  },

  // Admin Unified Data Sync: Fetch classes, students, attendance, boarding, and points across all teachers
  // Admin Unified Data Sync: Fetch classes, students, attendance, boarding, and points across all teachers
  async getAdminAllData(): Promise<{
    success: boolean;
    teachers: UserAccount[];
    classes: Classroom[];
    students: Student[];
    attendanceRecords: DailyAttendance[];
    boardingRecords: DailyBoardingMeal[];
    transactions: PointTransaction[];
    userData: Record<string, any>;
    timestamp: number;
  } | null> {
    try {
      const scoped = await this.getExecutiveScopedData({
        id: 'user-adminquantri',
        username: 'adminquantri',
        role: 'admin',
        schoolName: 'TRƯỜNG HỌC'
      } as any);

      if (scoped && Array.isArray(scoped.classes)) {
        return {
          success: true,
          teachers: scoped.teachers || [],
          classes: scoped.classes,
          students: scoped.students,
          attendanceRecords: scoped.attendanceRecords,
          boardingRecords: scoped.boardingRecords,
          transactions: scoped.transactions,
          userData: {},
          timestamp: Date.now()
        };
      }
    } catch (err) {
      console.warn('Lỗi lấy dữ liệu quản trị toàn hệ thống:', err);
    }
    return null;
  },

  // 🌟 Tổng hợp toàn bộ dữ liệu lớp học, học sinh, điểm danh, bán trú theo trường cho Ban Giám Hiệu & Quản Trị
  async getExecutiveScopedData(currentUser: UserAccount): Promise<{
    classes: Classroom[];
    students: Student[];
    attendanceRecords: DailyAttendance[];
    boardingRecords: DailyBoardingMeal[];
    transactions: PointTransaction[];
    teachers: UserAccount[];
  }> {
    // ⚡ 0. FAST PATH TỪ SERVER NỘI BỘ (1-3ms): Lấy trực tiếp toàn bộ lớp học, học sinh, điểm danh, bán trú, thi đua
    const isVercelHost = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
    if (!isVercelHost) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${getApiBaseUrl()}/api/executive/scoped-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentUser),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const result = await res.json();
          if (result && result.success && Array.isArray(result.classes)) {
            return {
              classes: result.classes,
              students: result.students || [],
              attendanceRecords: result.attendanceRecords || [],
              boardingRecords: result.boardingRecords || [],
              transactions: result.transactions || [],
              teachers: result.teachers || []
            };
          }
        }
      } catch (_) {}
    }

    const isMasterAdmin = currentUser.role === 'admin' || currentUser.username?.toLowerCase() === 'adminquantri';
    const isGuestAdmin = currentUser.role === 'guest_admin' || currentUser.isGuestAdmin;
    const targetSchool = (currentUser.schoolName || '').trim().toLowerCase();

    // 1. Lấy danh sách toàn bộ người dùng
    const allUsers = await this.getUsers();

    // 2. Lọc danh sách giáo viên phụ trách thuộc trường / khối của currentUser
    // 🌟 QUY TẮC CỐT LÕI: Chỉ tổng hợp số liệu từ các tài khoản GIÁO VIÊN CHỦ NHIỆM (role === 'homeroom')
    // Tuyệt đối KHÔNG tổng hợp tài khoản Giáo viên bộ môn (role === 'subject') để đảm bảo số lớp và số học sinh toàn trường chuẩn xác 100%, không bị nhân đôi
    const scopedTeachers = allUsers.filter(u => {
      if (u.role !== 'homeroom') return false;

      // Master Admin: tổng hợp toàn hệ thống từ các lớp chủ nhiệm
      if (isMasterAdmin) return true;

      // Guest Admin: tổng hợp khối giáo viên cá nhân / vãng lai
      if (isGuestAdmin) {
        return u.tenantType === 'guest' || 
          (u.schoolName && u.schoolName.toLowerCase().includes('cá nhân')) || 
          (u.schoolName && u.schoolName.toLowerCase().includes('tự do'));
      }

      // School Admin & BGH: tổng hợp toàn bộ giáo viên chủ nhiệm trong CÙNG NHÀ TRƯỜNG
      // 🔒 STRICT MATCH: So sánh chính xác tên trường, không dùng includes() để tránh nhầm trường
      const uSchool = (u.schoolName || '').trim().toLowerCase();
      if (!targetSchool || !uSchool) return false;
      return uSchool === targetSchool;
    });

    // 🌟 LIÊN THÔNG DỮ LIỆU TỔNG THỂ CHO QUẢN TRỊ CẤP CAO (MASTER ADMIN) & QUẢN TRỊ NHÀ TRƯỜNG / BGH:
    // Nạp dữ liệu từ các tài khoản Quản trị nhà trường (school_admin) để liên thông 100% lớp học và học sinh
    const schoolAdmins = allUsers.filter(u => {
      if (!(u.role === 'school_admin' || u.isSchoolAdmin)) return false;
      if (isMasterAdmin) return true;
      const uSchool = (u.schoolName || '').trim().toLowerCase();
      return Boolean(targetSchool && uSchool === targetSchool);
    });

    const allClassesMap = new Map<string, Classroom>();
    const canonicalToIdMap = new Map<string, string>(); // canonicalName -> primary classId
    const classAliasMap = new Map<string, string>();     // old/duplicate classId -> primary classId
    const allStudentsMap = new Map<string, Student>();
    const allAttendanceMap = new Map<string, DailyAttendance>();
    const allBoardingMap = new Map<string, DailyBoardingMeal>();
    const allTransactions: PointTransaction[] = [];

    // Chuẩn hóa tên lớp để làm Canonical Key chống nhân đôi lớp (ví dụ: "1A2 Đỗ Thị Hải" -> "1a2_dothihai")
    const getCanonicalKey = (name: string): string => {
      if (!name) return '';
      return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');
    };

    // Nếu hiện tại chưa có giáo viên chủ nhiệm nào (CSDL trắng vừa dọn dẹp xong), hoàn tất ngay lập tức trong 0ms
    // (trừ khi đã kết nối Drive dùng chung: tệp lớp trên Drive vẫn là nguồn dữ liệu hợp lệ)
    if (scopedTeachers.length === 0 && schoolAdmins.length === 0 && !googleDriveService.getConfig().scriptUrl) {
      return {
        classes: [],
        students: [],
        attendanceRecords: [],
        boardingRecords: [],
        transactions: [],
        teachers: []
      };
    }

    // 3. Tải và tổng hợp dữ liệu từ từng giáo viên và từ các Quản trị nhà trường
    const accountsToFetch = [...scopedTeachers, ...schoolAdmins];

    // ⚡ BATCH FETCH TỐI ƯU SIÊU TỐC TỪ SUPABASE (Chỉ 1-2 truy vấn thay vì bắn 70 request lẻ tẻ gây timeout 1.5s)
    const fetchedUserMap = new Map<string, UserClassroomData>();
    const supabase = getBrowserSupabase();
    if (supabase && accountsToFetch.length > 0) {
      try {
        const allUsernames = Array.from(new Set(accountsToFetch.map(a => (a.username || '').trim().toLowerCase())));
        const CHUNK_SIZE = 40;
        for (let i = 0; i < allUsernames.length; i += CHUNK_SIZE) {
          const chunk = allUsernames.slice(i, i + CHUNK_SIZE);
          const { data: rows, error } = await supabase
            .from('user_classroom_data')
            .select('username, data')
            .in('username', chunk);
          if (!error && Array.isArray(rows)) {
            rows.forEach((r: any) => {
              if (r && r.username && r.data) {
                fetchedUserMap.set(r.username.trim().toLowerCase(), r.data as UserClassroomData);
              }
            });
          }
        }
      } catch (err) {
        console.warn('Batch fetch user_classroom_data error:', err);
      }
    }

    // Duyệt qua toàn bộ danh sách tài khoản cần tổng hợp
    for (const account of accountsToFetch) {
      const uName = (account.username || '').trim().toLowerCase();
      let uData = fetchedUserMap.get(uName);
      if (!uData) {
        try {
          const cached = localStorage.getItem(LOCAL_DB_PREFIX + uName);
          if (cached) uData = JSON.parse(cached);
        } catch (_) {}
      }

      const safeUserData: UserClassroomData = uData || {
        classes: [],
        students: [],
        attendanceRecords: [],
        boardingRecords: [],
        transactions: []
      } as any;

      // 🛡️ TỔNG HỢP LỚP HỌC (CANONICAL DEDUPLICATION & SMART MERGE)
      // Loại trừ hoàn toàn lớp bộ môn (teacherRole === 'subject' hoặc class-sub-)
      if (Array.isArray(safeUserData.classes)) {
        safeUserData.classes.forEach((c: Classroom) => {
          if (!c || !c.id) return;
          if (c.teacherRole === 'subject' || c.id.startsWith('class-sub-')) return;

          const cleanTeacherName = (c.teacherName && !c.teacherName.toLowerCase().includes('ban giám hiệu') && !c.teacherName.toLowerCase().includes('quản trị'))
            ? c.teacherName
            : (account.role === 'homeroom' ? account.fullName : c.teacherName);

          const cKey = getCanonicalKey(c.name);
          let targetId = c.id;

          // Kiểm tra xem đã có lớp mang canonical name này chưa
          if (cKey && canonicalToIdMap.has(cKey)) {
            const existingId = canonicalToIdMap.get(cKey)!;
            // Nếu lớp hiện tại là timestamp ID chuẩn (class-179...) còn ID trước đó là slug (class-1a2...) -> ưu tiên timestamp ID
            if (c.id.startsWith('class-179') && !existingId.startsWith('class-179')) {
              const oldCls = allClassesMap.get(existingId);
              allClassesMap.delete(existingId);
              canonicalToIdMap.set(cKey, c.id);
              classAliasMap.set(existingId, c.id);
              targetId = c.id;
              if (oldCls) allClassesMap.set(targetId, oldCls);
            } else {
              targetId = existingId;
              classAliasMap.set(c.id, existingId);
            }
          } else if (cKey) {
            canonicalToIdMap.set(cKey, c.id);
          }

          const existing = allClassesMap.get(targetId);
          const finalBranch = (c.branch && String(c.branch).trim())
            ? String(c.branch).trim()
            : (existing?.branch && String(existing.branch).trim() ? String(existing.branch).trim() : null);
          const finalCampus = (c.campus && String(c.campus).trim())
            ? String(c.campus).trim()
            : (existing?.campus && String(existing.campus).trim() ? String(existing.campus).trim() : null);
          const finalSchool = (c.schoolName && String(c.schoolName).trim())
            ? String(c.schoolName).trim()
            : (existing?.schoolName && String(existing.schoolName).trim() 
              ? String(existing.schoolName).trim() 
              : (account.schoolName || 'TRƯỜNG HỌC'));

          allClassesMap.set(targetId, {
            ...(existing || {}),
            ...c,
            id: targetId,
            branch: finalBranch,
            campus: finalCampus,
            schoolName: finalSchool,
            teacherUsername: c.teacherUsername || existing?.teacherUsername || (account.role === 'homeroom' ? account.username : undefined),
            teacherName: cleanTeacherName || existing?.teacherName,
            teacherRole: 'homeroom'
          });
        });
      }

      // 🛡️ TỔNG HỢP HỌC SINH (Mapping classId theo classAliasMap)
      if (Array.isArray(safeUserData.students)) {
        safeUserData.students.forEach((s: Student) => {
          if (!s || !s.id) return;
          if (s.classId === 'class-1791592764810' || (s.classId && s.classId.startsWith('class-sub-'))) return;
          
          const mappedClassId = classAliasMap.get(s.classId) || s.classId;
          const existingS = allStudentsMap.get(s.id);

          // Giữ điểm số thi đua cao nhất nếu có sự chênh lệch giữa các cache
          const finalPoints = Math.max(s.points || 0, existingS?.points || 0);

          allStudentsMap.set(s.id, {
            ...(existingS || {}),
            ...s,
            classId: mappedClassId,
            points: finalPoints
          });
        });
      }

      // 🛡️ TỔNG HỢP ĐIỂM DANH (CHUYÊN CẦN)
      if (Array.isArray(safeUserData.attendanceRecords)) {
        safeUserData.attendanceRecords.forEach((att: DailyAttendance) => {
          if (!att || !att.date || !att.classId) return;
          const mappedClassId = classAliasMap.get(att.classId) || att.classId;
          const attKey = `${att.date}_${mappedClassId}`;
          const existingAtt = allAttendanceMap.get(attKey);
          if (existingAtt) {
            allAttendanceMap.set(attKey, {
              ...existingAtt,
              ...att,
              classId: mappedClassId,
              records: { ...(existingAtt.records || {}), ...(att.records || {}) }
            });
          } else {
            allAttendanceMap.set(attKey, {
              ...att,
              classId: mappedClassId
            });
          }
        });
      }

      // 🛡️ TỔNG HỢP BÁN TRÚ (BOARDING MEALS)
      if (Array.isArray(safeUserData.boardingRecords)) {
        safeUserData.boardingRecords.forEach((b: DailyBoardingMeal) => {
          if (!b || !b.date || !b.classId) return;
          const mappedClassId = classAliasMap.get(b.classId) || b.classId;
          const bKey = `${b.date}_${mappedClassId}`;
          const existingB = allBoardingMap.get(bKey);
          if (existingB) {
            allBoardingMap.set(bKey, {
              ...existingB,
              ...b,
              classId: mappedClassId,
              records: { ...(existingB.records || {}), ...(b.records || {}) }
            });
          } else {
            allBoardingMap.set(bKey, {
              ...b,
              classId: mappedClassId
            });
          }
        });
      }

      // Tổng hợp giao dịch điểm thi đua
      if (Array.isArray(safeUserData.transactions)) {
        allTransactions.push(...safeUserData.transactions);
      }
    }

    // 🛡️ BẢO TOÀN DỮ LIỆU: Bổ sung thông tin branch/campus và records từ row của admin/adminquantri hoặc chính currentUser và school_admin
    try {
      const checkUsers = ['admin', 'adminquantri'];
      if (currentUser.username) checkUsers.push(currentUser.username.toLowerCase());
      if (isMasterAdmin) {
        schoolAdmins.forEach(sa => {
          if (sa.username) checkUsers.push(sa.username.toLowerCase());
        });
      }

      const adminDataList: UserClassroomData[] = [];
      for (const u of checkUsers) {
        const d = fetchedUserMap.get(u);
        if (d) adminDataList.push(d);
      }

      for (const aData of adminDataList) {
        if (!aData) continue;
        const aClasses = aData.classes;
        if (Array.isArray(aClasses)) {
          for (const ac of aClasses) {
            if (!ac || !ac.id) continue;
            if (ac.teacherRole === 'subject' || ac.id.startsWith('class-sub-')) continue;

            const cKey = getCanonicalKey(ac.name);
            const targetId = classAliasMap.get(ac.id) || (cKey ? canonicalToIdMap.get(cKey) : null) || ac.id;

            if (allClassesMap.has(targetId)) {
              const targetCls = allClassesMap.get(targetId)!;
              if (!targetCls.campus && ac.campus && String(ac.campus).trim()) {
                targetCls.campus = String(ac.campus).trim();
              }
              if (!targetCls.branch && ac.branch && String(ac.branch).trim()) {
                targetCls.branch = String(ac.branch).trim();
              }
              if (!targetCls.schoolName && ac.schoolName && String(ac.schoolName).trim()) {
                targetCls.schoolName = String(ac.schoolName).trim();
              }
            } else {
              allClassesMap.set(targetId, { ...ac, id: targetId });
              if (cKey) canonicalToIdMap.set(cKey, targetId);
            }
          }
        }
        if (Array.isArray(aData.students)) {
          for (const st of aData.students) {
            if (st && st.id && st.classId !== 'class-1791592764810' && !st.classId.startsWith('class-sub-')) {
              const mappedClassId = classAliasMap.get(st.classId) || st.classId;
              const existingS = allStudentsMap.get(st.id);
              const finalPoints = Math.max(st.points || 0, existingS?.points || 0);
              allStudentsMap.set(st.id, { ...(existingS || {}), ...st, classId: mappedClassId, points: finalPoints });
            }
          }
        }
        if (Array.isArray(aData.attendanceRecords)) {
          for (const att of aData.attendanceRecords) {
            if (att && att.date && att.classId) {
              const mappedClassId = classAliasMap.get(att.classId) || att.classId;
              const attKey = `${att.date}_${mappedClassId}`;
              const existing = allAttendanceMap.get(attKey);
              if (existing) {
                allAttendanceMap.set(attKey, {
                  ...existing,
                  ...att,
                  classId: mappedClassId,
                  records: { ...(existing.records || {}), ...(att.records || {}) }
                });
              } else {
                allAttendanceMap.set(attKey, { ...att, classId: mappedClassId });
              }
            }
          }
        }
        if (Array.isArray(aData.boardingRecords)) {
          for (const b of aData.boardingRecords) {
            if (b && b.date && b.classId) {
              const mappedClassId = classAliasMap.get(b.classId) || b.classId;
              const bKey = `${b.date}_${mappedClassId}`;
              const existing = allBoardingMap.get(bKey);
              if (existing) {
                allBoardingMap.set(bKey, {
                  ...existing,
                  ...b,
                  classId: mappedClassId,
                  records: { ...(existing.records || {}), ...(b.records || {}) }
                });
              } else {
                allBoardingMap.set(bKey, { ...b, classId: mappedClassId });
              }
            }
          }
        }
      }

      // LocalStorage fallback an toàn tuyệt đối khi offline hoặc chạy localhost
      for (const u of checkUsers) {
        try {
          const cached = localStorage.getItem(LOCAL_DB_PREFIX + u);
          if (cached) {
            const aData = JSON.parse(cached);
            if (Array.isArray(aData.classes)) {
              for (const ac of aData.classes) {
                if (ac && ac.id) {
                  if (ac.teacherRole === 'subject' || ac.id.startsWith('class-sub-')) continue;
                  const cKey = getCanonicalKey(ac.name);
                  const targetId = classAliasMap.get(ac.id) || (cKey ? canonicalToIdMap.get(cKey) : null) || ac.id;

                  if (allClassesMap.has(targetId)) {
                    const targetCls = allClassesMap.get(targetId)!;
                    if (!targetCls.campus && ac.campus && String(ac.campus).trim()) {
                      targetCls.campus = String(ac.campus).trim();
                    }
                    if (!targetCls.branch && ac.branch && String(ac.branch).trim()) {
                      targetCls.branch = String(ac.branch).trim();
                    }
                    if (!targetCls.schoolName && ac.schoolName && String(ac.schoolName).trim()) {
                      targetCls.schoolName = String(ac.schoolName).trim();
                    }
                  } else {
                    allClassesMap.set(targetId, { ...ac, id: targetId });
                    if (cKey) canonicalToIdMap.set(cKey, targetId);
                  }
                }
              }
            }
            if (Array.isArray(aData.students)) {
              for (const st of aData.students) {
                if (st && st.id && st.classId !== 'class-1791592764810' && !st.classId.startsWith('class-sub-')) {
                  const mappedClassId = classAliasMap.get(st.classId) || st.classId;
                  const existingS = allStudentsMap.get(st.id);
                  const finalPoints = Math.max(st.points || 0, existingS?.points || 0);
                  allStudentsMap.set(st.id, { ...(existingS || {}), ...st, classId: mappedClassId, points: finalPoints });
                }
              }
            }
          }
        } catch (_) {}
      }
    } catch (_) {}

    // ☁️ NGUỒN GOOGLE DRIVE (bản web Vercel không có máy chủ/Supabase): đọc tệp lớp gvcn_*.json của
    // các GVCN trong thư mục dùng chung để Quản trị & BGH thấy đủ lớp, học sinh, điểm danh, bán trú.
    try {
      const drive = await loadDriveClassFilesCached(currentUser);
      if (drive) {
        for (const c of drive.classes) {
          if (!c || !c.id) continue;
          if (c.teacherRole === 'subject' || c.id.startsWith('class-sub-')) continue;
          const cKey = getCanonicalKey(c.name);
          const targetId = classAliasMap.get(c.id) || (cKey ? canonicalToIdMap.get(cKey) : null) || c.id;
          if (targetId !== c.id) classAliasMap.set(c.id, targetId);
          const existing = allClassesMap.get(targetId);
          allClassesMap.set(targetId, {
            ...(existing || {}),
            ...c,
            id: targetId,
            branch: c.branch || existing?.branch || null,
            campus: c.campus || existing?.campus || null,
            schoolName: c.schoolName || existing?.schoolName || currentUser.schoolName || 'TRƯỜNG HỌC',
            teacherRole: 'homeroom'
          } as Classroom);
          if (cKey && !canonicalToIdMap.has(cKey)) canonicalToIdMap.set(cKey, targetId);
        }
        for (const s of drive.students) {
          if (!s || !s.id || !s.classId || s.classId.startsWith('class-sub-')) continue;
          const mappedClassId = classAliasMap.get(s.classId) || s.classId;
          const existingS = allStudentsMap.get(s.id);
          allStudentsMap.set(s.id, { ...(existingS || {}), ...s, classId: mappedClassId, points: Math.max(s.points || 0, existingS?.points || 0) });
        }
        const mergeDaily = <T extends { date: string; classId: string; records?: any }>(list: T[], map: Map<string, T>) => {
          for (const r of list) {
            if (!r || !r.date || !r.classId) continue;
            const mappedClassId = classAliasMap.get(r.classId) || r.classId;
            const key = `${r.date}_${mappedClassId}`;
            const ex = map.get(key);
            map.set(key, { ...(ex || {}), ...r, classId: mappedClassId, records: { ...((ex as any)?.records || {}), ...(r.records || {}) } } as T);
          }
        };
        mergeDaily(drive.attendanceRecords, allAttendanceMap);
        mergeDaily(drive.boardingRecords, allBoardingMap);
      }

      // ✏️ Áp điều chỉnh của Quản trị (tệp dieuchinh_quantri.json) chưa được GVCN nhận vào lớp
      const edits = await adminEditsService.fetchEntries();
      const editList = Object.values(edits).filter(Boolean).sort((a, b) => a.at - b.at);
      if (editList.length > 0) {
        const appliedByClass: Record<string, Record<string, number>> = {};
        for (const [cid, applied] of Object.entries(drive?.appliedByClass || {})) {
          appliedByClass[cid] = applied;
          const alias = classAliasMap.get(cid);
          if (alias) appliedByClass[alias] = applied;
        }
        const resolveClassId = (cid?: string, cname?: string) => {
          if (!cid) return cid;
          const aliased = classAliasMap.get(cid) || cid;
          if (allClassesMap.has(aliased)) return aliased;
          const byName = cname ? canonicalToIdMap.get(getCanonicalKey(cname)) : undefined;
          return byName || aliased;
        };
        adminEditsService.noteConsumption(appliedByClass, editList);
        for (const e of editList) {
          if (adminEditsService.isConsumed(e, appliedByClass)) continue;
          if (e.kind === 'class') {
            const target = resolveClassId(e.id, e.className || e.data?.name) || e.id;
            if (e.deleted) {
              allClassesMap.delete(target);
              for (const [sid, st] of allStudentsMap) if (st.classId === target) allStudentsMap.delete(sid);
            } else {
              const existing = allClassesMap.get(target);
              if (!existing && !e.data?.name) continue;
              allClassesMap.set(target, { ...(existing || {}), ...(e.data || {}), id: target } as Classroom);
              const cKey = getCanonicalKey((e.data?.name || existing?.name || '') as string);
              if (cKey && !canonicalToIdMap.has(cKey)) canonicalToIdMap.set(cKey, target);
            }
          } else {
            if (e.deleted) {
              allStudentsMap.delete(e.id);
              continue;
            }
            const existingS = allStudentsMap.get(e.id);
            if (!existingS && !e.data?.name) continue;
            const merged = { ...(existingS || {}), ...(e.data || {}), id: e.id } as Student;
            merged.classId = resolveClassId(merged.classId, e.className) || merged.classId;
            allStudentsMap.set(e.id, merged);
          }
        }
      }
    } catch (driveErr) {
      console.warn('Drive class files merge error:', driveErr);
    }

    const validClassIds = new Set(allClassesMap.keys());
    let validStudents = Array.from(allStudentsMap.values()).filter(s =>
      Boolean(s.classId && validClassIds.has(s.classId)) &&
      s.classId !== 'class-1791592764810' &&
      !s.classId.startsWith('class-sub-')
    );

    const finalClasses = Array.from(allClassesMap.values());
    try { adminEditsService.setKnownSnapshot(finalClasses, validStudents); } catch (_) {}

    return {
      classes: finalClasses,
      students: validStudents,
      attendanceRecords: Array.from(allAttendanceMap.values()),
      boardingRecords: Array.from(allBoardingMap.values()),
      transactions: allTransactions,
      teachers: scopedTeachers
    };
  },

  // Broadcast điểm danh tức thì qua Supabase Realtime & BroadcastChannel & SSE Hub
  broadcastAttendance(attendanceRecord: DailyAttendance, username?: string): void {
    try {
      const payload = {
        type: 'ATTENDANCE_UPDATED',
        action: 'UPDATE_ATTENDANCE',
        attendanceRecord,
        username: (username || '').toLowerCase(),
        originClientId: CLIENT_ID,
        timestamp: Date.now()
      };
      if (localBroadcastChannel) {
        localBroadcastChannel.postMessage(payload);
      }
      localStorage.setItem('lop_hoc_realtime_ping', JSON.stringify({
        ...payload,
        r: Math.random()
      }));
      initSupabaseRealtime();
      if (realtimeChannel) {
        realtimeChannel.send({
          type: 'broadcast',
          event: 'user_data_updated',
          payload
        }).catch(() => {});
      }
      fetch(`${getApiBaseUrl()}/api/realtime/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch (_) {}
  },

  // Broadcast bán trú tức thì qua Supabase Realtime & BroadcastChannel & SSE Hub
  broadcastBoarding(boardingRecord: DailyBoardingMeal, username?: string): void {
    try {
      const payload = {
        type: 'BOARDING_UPDATED',
        action: 'UPDATE_BOARDING',
        boardingRecord,
        username: (username || '').toLowerCase(),
        originClientId: CLIENT_ID,
        timestamp: Date.now()
      };
      if (localBroadcastChannel) {
        localBroadcastChannel.postMessage(payload);
      }
      localStorage.setItem('lop_hoc_realtime_ping', JSON.stringify({
        ...payload,
        r: Math.random()
      }));
      initSupabaseRealtime();
      if (realtimeChannel) {
        realtimeChannel.send({
          type: 'broadcast',
          event: 'user_data_updated',
          payload
        }).catch(() => {});
      }
      fetch(`${getApiBaseUrl()}/api/realtime/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch (_) {}
  },

  // Admin Unified Data Sync: Save and distribute classes and students to all teachers
  async syncAdminAllData(classes: Classroom[], students: Student[]): Promise<boolean> {
    if (isViewOnly()) return true;
    let synced = false;

    // 1. Direct Supabase Cloud Sync
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        const nowTs = Date.now();
        // Merge by id (payload may be a delta containing only changed records)
        const mergeById = (base: any[] | undefined, incoming: any[]) => {
          const map = new Map<string, any>();
          for (const item of Array.isArray(base) ? base : []) if (item && item.id) map.set(item.id, item);
          for (const item of incoming) if (item && item.id) map.set(item.id, { ...(map.get(item.id) || {}), ...item });
          return Array.from(map.values());
        };
        const { data: adminRow } = await supabase.from('user_classroom_data').select('data').eq('username', 'admin').maybeSingle();
        const adminData = adminRow?.data || {};
        await supabase.from('user_classroom_data').upsert({
          username: 'admin',
          data: { ...adminData, classes: mergeById(adminData.classes, classes), students: mergeById(adminData.students, students), updatedAt: nowTs },
          updated_at: new Date().toISOString()
        });

        const { data: superAdminRow } = await supabase.from('user_classroom_data').select('data').eq('username', 'adminquantri').maybeSingle();
        const superAdminData = superAdminRow?.data || {};
        await supabase.from('user_classroom_data').upsert({
          username: 'adminquantri',
          data: { ...superAdminData, classes: mergeById(superAdminData.classes, classes), students: mergeById(superAdminData.students, students), updatedAt: nowTs },
          updated_at: new Date().toISOString()
        });

        // Broadcast to all connected clients
        initSupabaseRealtime();
        if (realtimeChannel) {
          realtimeChannel.send({
            type: 'broadcast',
            event: 'user_data_updated',
            payload: {
              username: 'all',
              targetUsername: 'all',
              originClientId: CLIENT_ID,
              timestamp: nowTs,
              message: 'Quản trị viên đã đồng bộ toàn bộ lớp học và học sinh'
            }
          }).catch(() => {});
        }

        // Multi-tab broadcast
        try {
          if (localBroadcastChannel) {
            localBroadcastChannel.postMessage({
              type: 'DATA_CHANGED',
              username: 'all',
              originClientId: CLIENT_ID,
              timestamp: nowTs
            });
          }
          localStorage.setItem('lop_hoc_realtime_ping', JSON.stringify({
            username: 'all',
            originClientId: CLIENT_ID,
            timestamp: nowTs,
            r: Math.random()
          }));
        } catch (_) {}

        synced = true;
      } catch (err) {
        console.warn('Supabase syncAdminAllData error:', err);
      }
    }

    // 2. Server API fallback
    try {
      const res = await fetch('/api/admin/sync-all', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Client-Id': CLIENT_ID
        },
        body: JSON.stringify({ classes, students })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) synced = true;
      }
    } catch (err) {
      console.warn('Lỗi đồng bộ toàn hệ thống từ tài khoản Admin:', err);
    }
    return synced;
  },

  async updateAdminClass(classData: any, targetUsername?: string, isDelete = false): Promise<boolean> {
    if (isViewOnly()) return true;
    // ☁️ Bản web (Drive): ghi điều chỉnh của Quản trị/BGH vào tệp dieuchinh_quantri.json
    try { adminEditsService.record('class', classData, isDelete); } catch (_) {}
    const username = (targetUsername || classData?.teacherUsername || '').trim().toLowerCase();
    const nowTs = Date.now();
    let isSuccess = false;

    const classDataToSave = {
      ...classData,
      branch: (classData?.branch && String(classData.branch).trim()) ? String(classData.branch).trim() : null,
      campus: (classData?.campus && String(classData.campus).trim()) ? String(classData.campus).trim() : null
    };

    // 1. CẬP NHẬT TỨC THÌ VÀO LOCALSTORAGE CHO CÁC TÀI KHOẢN LIÊN QUAN (0ms)
    try {
      const execAdmins = ['admin', 'adminquantri'];
      const localTargets = Array.from(new Set([username, ...execAdmins].filter(Boolean)));
      for (const u of localTargets) {
        const localKey = LOCAL_DB_PREFIX + u;
        const cached = localStorage.getItem(localKey);
        if (cached) {
          try {
            const cachedData = JSON.parse(cached);
            let curClasses: Classroom[] = Array.isArray(cachedData.classes) ? cachedData.classes : [];
            if (isDelete) {
              curClasses = curClasses.filter((c: any) => c.id !== classData.id);
            } else {
              const idx = curClasses.findIndex((c: any) => c.id === classData.id);
              if (idx >= 0) {
                curClasses[idx] = { ...curClasses[idx], ...classDataToSave, teacherUsername: username || curClasses[idx].teacherUsername };
              } else {
                curClasses.push({ ...classDataToSave, teacherUsername: username || classDataToSave.teacherUsername });
              }
            }
            cachedData.classes = curClasses;
            cachedData.updatedAt = nowTs;
            localStorage.setItem(localKey, JSON.stringify(cachedData));
          } catch (_) {}
        }
      }

      // Quét toàn bộ localStorage để loại bỏ lớp này khỏi tài khoản GVCN cũ (nếu lớp được chuyển sang GVCN mới)
      if (typeof window !== 'undefined' && window.localStorage && username) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(LOCAL_DB_PREFIX)) {
            const uFromKey = key.slice(LOCAL_DB_PREFIX.length).toLowerCase();
            // Nếu không phải tài khoản nhận lớp và không phải admin/bgh
            if (uFromKey !== username.toLowerCase() && !execAdmins.includes(uFromKey) && !uFromKey.startsWith('bgh_') && !uFromKey.startsWith('quantri')) {
              try {
                const raw = localStorage.getItem(key);
                if (raw) {
                  const data = JSON.parse(raw);
                  if (Array.isArray(data.classes) && data.classes.some((c: any) => c.id === classData.id)) {
                    data.classes = data.classes.filter((c: any) => c.id !== classData.id);
                    if (Array.isArray(data.students)) {
                      data.students = data.students.filter((s: any) => s.classId !== classData.id);
                    }
                    data.updatedAt = nowTs;
                    localStorage.setItem(key, JSON.stringify(data));
                  }
                }
              } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}

    const isVercelOrStatic = typeof window !== 'undefined' && (
      window.location.hostname.includes('vercel.app') ||
      window.location.hostname.includes('github.io') ||
      window.location.port === '' ||
      window.location.protocol === 'https:'
    );

    // 2. NẾU CHẠY LOCAL: GỌI EXPRESS BACKEND (/api/admin/update-class) TRƯỚC TIÊN (1-5ms)
    if (!isVercelOrStatic) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch('/api/admin/update-class', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Client-Id': CLIENT_ID
          },
          body: JSON.stringify({ classData: classDataToSave, targetUsername: username, isDelete }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data.success) isSuccess = true;
        }
      } catch (err) {
        // Tiếp tục fallback
      }
    }

    // 3. ĐỒNG BỘ SUPABASE CLOUD CHẠY NỀN KHÔNG CHẶN (Background Non-Blocking Sync)
    const supabase = getBrowserSupabase();
    if (supabase) {
      (async () => {
        try {
          // A. Cập nhật cho giáo viên được gán lớp (nếu có username)
          if (username) {
            const { data: userRow } = await supabase.from('user_classroom_data').select('data').eq('username', username).maybeSingle();
            const curData = userRow?.data || { classes: [], students: [] };
            let curClasses: Classroom[] = Array.isArray(curData.classes) ? curData.classes : [];
            if (isDelete) {
              curClasses = curClasses.filter((c: any) => c.id !== classData.id);
            } else {
              const idx = curClasses.findIndex((c: any) => c.id === classData.id);
              if (idx >= 0) {
                curClasses[idx] = { ...curClasses[idx], ...classDataToSave, teacherUsername: username };
              } else {
                curClasses.push({ ...classDataToSave, teacherUsername: username });
              }
            }
            await supabase.from('user_classroom_data').upsert({
              username,
              data: { ...curData, classes: curClasses, updatedAt: nowTs },
              updated_at: new Date().toISOString()
            }, { onConflict: 'username' });
          }

          // B. Cập nhật cho admin & adminquantri (Toàn hệ thống và quản trị tối cao)
          for (const adminU of ['admin', 'adminquantri']) {
            const { data: aRow } = await supabase.from('user_classroom_data').select('data').eq('username', adminU).maybeSingle();
            const aData = aRow?.data || { classes: [], students: [] };
            let aClasses: Classroom[] = Array.isArray(aData.classes) ? aData.classes : [];
            if (isDelete) {
              aClasses = aClasses.filter((c: any) => c.id !== classData.id);
            } else {
              const aIdx = aClasses.findIndex((c: any) => c.id === classData.id);
              if (aIdx >= 0) {
                aClasses[aIdx] = { ...aClasses[aIdx], ...classDataToSave, teacherUsername: username || aClasses[aIdx].teacherUsername };
              } else {
                aClasses.push({ ...classDataToSave, teacherUsername: username || classDataToSave.teacherUsername });
              }
            }
            await supabase.from('user_classroom_data').upsert({
              username: adminU,
              data: { ...aData, classes: aClasses, updatedAt: nowTs },
              updated_at: new Date().toISOString()
            }, { onConflict: 'username' });
          }

          // C. Cập nhật cho các tài khoản Quản trị nhà trường (school_admin & bgh)
          try {
            const { data: schoolAdmins } = await supabase
              .from('users')
              .select('username')
              .in('role', ['school_admin', 'bgh']);
            if (schoolAdmins && schoolAdmins.length > 0) {
              for (const sa of schoolAdmins) {
                const saUser = (sa.username || '').toLowerCase();
                if (saUser && saUser !== 'admin' && saUser !== 'adminquantri' && saUser !== username) {
                  const { data: saRow } = await supabase.from('user_classroom_data').select('data').eq('username', saUser).maybeSingle();
                  const saData = saRow?.data || { classes: [], students: [] };
                  let saClasses: Classroom[] = Array.isArray(saData.classes) ? saData.classes : [];
                  if (isDelete) {
                    saClasses = saClasses.filter((c: any) => c.id !== classData.id);
                  } else {
                    const saIdx = saClasses.findIndex((c: any) => c.id === classData.id);
                    if (saIdx >= 0) {
                      saClasses[saIdx] = { ...saClasses[saIdx], ...classDataToSave, teacherUsername: username || saClasses[saIdx].teacherUsername };
                    } else {
                      saClasses.push({ ...classDataToSave, teacherUsername: username || classDataToSave.teacherUsername });
                    }
                  }
                  await supabase.from('user_classroom_data').upsert({
                    username: saUser,
                    data: { ...saData, classes: saClasses, updatedAt: nowTs },
                    updated_at: new Date().toISOString()
                  }, { onConflict: 'username' });
                }
              }
            }
          } catch (saErr) {
            console.warn('Sync school_admin error:', saErr);
          }

          // Broadcast realtime change với FULL payload cho Zero Latency
          initSupabaseRealtime();
          if (realtimeChannel) {
            realtimeChannel.send({
              type: 'broadcast',
              event: 'user_data_updated',
              payload: {
                type: isDelete ? 'CLASS_DELETED' : 'CLASS_UPDATED',
                action: isDelete ? 'DELETE_CLASS' : 'UPDATE_CLASS',
                classData: classDataToSave,
                classId: classData.id,
                username: username || 'all',
                targetUsername: username || 'all',
                originClientId: CLIENT_ID,
                timestamp: nowTs,
                message: isDelete ? `Đã xóa lớp học: ${classData.name || classData.id}` : `Đã tạo/cập nhật lớp học: ${classData.name}`
              }
            }).catch(() => {});
          }
        } catch (sbErr) {
          console.warn('[Supabase Cloud Sync Class] Ngoại lệ không chặn UI:', sbErr);
        }
      })();
    }

    // Multi-tab BroadcastChannel
    try {
      if (localBroadcastChannel) {
        localBroadcastChannel.postMessage({
          type: isDelete ? 'CLASS_DELETED' : 'CLASS_UPDATED',
          action: isDelete ? 'DELETE_CLASS' : 'UPDATE_CLASS',
          classData: classDataToSave,
          classId: classData.id,
          username: username || 'all',
          originClientId: CLIENT_ID,
          timestamp: nowTs
        });
      }
      localStorage.setItem('lop_hoc_realtime_ping', JSON.stringify({
        type: isDelete ? 'CLASS_DELETED' : 'CLASS_UPDATED',
        classData: classDataToSave,
        classId: classData.id,
        username: username || 'all',
        originClientId: CLIENT_ID,
        timestamp: nowTs,
        r: Math.random()
      }));
    } catch (_) {}

    return isSuccess;
  },

  async updateAdminStudent(studentData: any, targetUsername?: string, isDelete = false, schoolName?: string): Promise<boolean> {
    if (isViewOnly()) return true;
    // ☁️ Bản web (Drive): ghi điều chỉnh của Quản trị tối cao vào tệp dieuchinh_quantri.json
    try { adminEditsService.record('student', studentData, isDelete); } catch (_) {}
    const username = (targetUsername || '').trim().toLowerCase();
    const nowTs = Date.now();
    let isSuccess = false;

    // 1. Direct Supabase Cloud Dual-Write
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        if (username) {
          const { data: userRow } = await supabase.from('user_classroom_data').select('data').eq('username', username).maybeSingle();
          const curData = userRow?.data || { classes: [], students: [] };
          let curStudents: Student[] = Array.isArray(curData.students) ? curData.students : [];
          if (isDelete) {
            curStudents = curStudents.filter((s: any) => s.id !== studentData.id);
          } else {
            const idx = curStudents.findIndex((s: any) => s.id === studentData.id);
            if (idx >= 0) {
              curStudents[idx] = { ...curStudents[idx], ...studentData };
            } else {
              curStudents.push(studentData);
            }
          }
          await supabase.from('user_classroom_data').upsert({
            username,
            data: { ...curData, students: curStudents, updatedAt: nowTs },
            updated_at: new Date().toISOString()
          }, { onConflict: 'username' });

          try {
            const localKey = LOCAL_DB_PREFIX + username;
            const cached = localStorage.getItem(localKey);
            const cachedData = cached ? JSON.parse(cached) : curData;
            cachedData.students = curStudents;
            cachedData.updatedAt = nowTs;
            localStorage.setItem(localKey, JSON.stringify(cachedData));
          } catch (_) {}
        }

        // Cập nhật cho admin & adminquantri (Toàn hệ thống và Quản trị tối cao)
        for (const adminU of ['admin', 'adminquantri']) {
          const { data: aRow } = await supabase.from('user_classroom_data').select('data').eq('username', adminU).maybeSingle();
          const aData = aRow?.data || { classes: [], students: [] };
          let aStudents: Student[] = Array.isArray(aData.students) ? aData.students : [];
          if (isDelete) {
            aStudents = aStudents.filter((s: any) => s.id !== studentData.id);
          } else {
            const aIdx = aStudents.findIndex((s: any) => s.id === studentData.id);
            if (aIdx >= 0) {
              aStudents[aIdx] = { ...aStudents[aIdx], ...studentData };
            } else {
              aStudents.push(studentData);
            }
          }
          await supabase.from('user_classroom_data').upsert({
            username: adminU,
            data: { ...aData, students: aStudents, updatedAt: nowTs },
            updated_at: new Date().toISOString()
          }, { onConflict: 'username' });

          try {
            const localKey = LOCAL_DB_PREFIX + adminU;
            const cached = localStorage.getItem(localKey);
            const cachedData = cached ? JSON.parse(cached) : aData;
            cachedData.students = aStudents;
            cachedData.updatedAt = nowTs;
            localStorage.setItem(localKey, JSON.stringify(cachedData));
          } catch (_) {}
        }

        // Phát Supabase Realtime broadcast liên thông 3 chiều tức thì (Giáo viên ↔ Quản trị trường ↔ Quản trị tối cao)
        initSupabaseRealtime();
        if (realtimeChannel) {
          realtimeChannel.send({
            type: 'broadcast',
            event: 'user_data_updated',
            payload: {
              username: username || 'all',
              targetUsername: username || 'all',
              schoolName: schoolName || '',
              studentId: studentData.id,
              originClientId: CLIENT_ID,
              timestamp: nowTs,
              message: isDelete ? `Đã xóa học sinh: ${studentData.name || studentData.id}` : `Đã cập nhật học sinh: ${studentData.name}`
            }
          }).catch(() => {});
        }

        isSuccess = true;
      } catch (sbErr) {
        console.warn('Supabase updateAdminStudent error:', sbErr);
      }
    }

    // 2. Server API fallback
    try {
      const res = await fetch('/api/admin/update-student', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Client-Id': CLIENT_ID
        },
        body: JSON.stringify({ studentData, targetUsername: username, isDelete, schoolName })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) isSuccess = true;
      }
    } catch (err) {
      // Bỏ qua lỗi kết nối backend express khi chạy thuần tĩnh trên Vercel
    }

    // 3. Local Broadcast Channel & ping
    try {
      if (localBroadcastChannel) {
        localBroadcastChannel.postMessage({
          type: 'STUDENT_CHANGED',
          username: username || 'all',
          studentData,
          schoolName: schoolName || '',
          originClientId: CLIENT_ID,
          timestamp: nowTs
        });
      }
      localStorage.setItem('lop_hoc_realtime_ping', JSON.stringify({
        username: username || 'all',
        schoolName: schoolName || '',
        originClientId: CLIENT_ID,
        timestamp: nowTs,
        r: Math.random()
      }));
    } catch (_) {}

    return isSuccess;
  },

  /**
   * 🌟 CẤU HÌNH PHÂN HIỆU & ĐIỂM TRƯỜNG THUỘC PHÂN HIỆU CHO TỪNG TRƯỜNG HỌC
   * Đảm bảo tính đồng nhất 100% dữ liệu từ GVCN lên Quản trị trường & Quản trị tối cao
   */
  async getSchoolBranches(schoolName: string): Promise<SchoolBranch[]> {
    const cleanSchool = (schoolName || '').trim();
    if (!cleanSchool) return [];

    const cacheKey = LOCAL_BRANCHES_PREFIX + cleanSchool.toLowerCase();

    // 1. Direct Supabase Cloud (ưu tiên tải realtime từ đám mây)
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        const configKey = 'school_branches:' + cleanSchool.toLowerCase();
        const { data: row } = await supabase
          .from('user_classroom_data')
          .select('data')
          .eq('username', configKey)
          .maybeSingle();

        if (row?.data?.branches && Array.isArray(row.data.branches) && row.data.branches.length > 0) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify(row.data.branches));
          } catch (_) {}
          return row.data.branches;
        }
      } catch (err) {
        console.warn('Supabase getSchoolBranches error:', err);
      }
    }

    // 1b. ☁️ Bản web (Drive dùng chung): danh mục phân hiệu chung cho mọi máy Quản trị / BGH
    try {
      const fromDrive = await schoolBranchesDrive.load(cleanSchool);
      if (Array.isArray(fromDrive)) {
        try { localStorage.setItem(cacheKey, JSON.stringify(fromDrive)); } catch (_) {}
        return fromDrive;
      }
    } catch (err) {
      console.warn('Drive getSchoolBranches error:', err);
    }

    // 2. LocalStorage Fallback
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}

    return [];
  },

  async saveSchoolBranches(schoolName: string, branches: SchoolBranch[]): Promise<boolean> {
    if (isViewOnly()) return true;
    const cleanSchool = (schoolName || '').trim();
    if (!cleanSchool) return false;

    const cacheKey = LOCAL_BRANCHES_PREFIX + cleanSchool.toLowerCase();
    const nowTs = Date.now();
    let isSuccess = false;

    // 1. LocalStorage First
    try {
      localStorage.setItem(cacheKey, JSON.stringify(branches));
      isSuccess = true;
    } catch (_) {}

    // 1b. ☁️ Bản web (Drive dùng chung): ghi danh mục phân hiệu vào phanhieu_truong.json
    try {
      await schoolBranchesDrive.save(cleanSchool, branches);
    } catch (err) {
      console.warn('Drive saveSchoolBranches error:', err);
    }

    // 2. Supabase Cloud Database Upsert
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        const configKey = 'school_branches:' + cleanSchool.toLowerCase();
        const { error } = await supabase.from('user_classroom_data').upsert({
          username: configKey,
          data: {
            schoolName: cleanSchool,
            branches,
            updatedAt: nowTs
          },
          updated_at: new Date().toISOString()
        }, { onConflict: 'username' });

        if (!error) {
          isSuccess = true;
        }
      } catch (err) {
        console.warn('Supabase saveSchoolBranches error:', err);
      }
    }

    // 3. Realtime Broadcast tới toàn bộ Giáo viên & BGH trong trường
    try {
      initSupabaseRealtime();
      if (realtimeChannel) {
        realtimeChannel.send({
          type: 'broadcast',
          event: 'school_branches_updated',
          payload: {
            schoolName: cleanSchool,
            branches,
            originClientId: CLIENT_ID,
            timestamp: nowTs,
            message: `Cập nhật phân hiệu & điểm trường: ${cleanSchool}`
          }
        }).catch(() => {});
      }
    } catch (_) {}

    try {
      if (localBroadcastChannel) {
        localBroadcastChannel.postMessage({
          type: 'SCHOOL_BRANCHES_UPDATED',
          schoolName: cleanSchool,
          branches,
          originClientId: CLIENT_ID,
          timestamp: nowTs
        });
      }
    } catch (_) {}

    return isSuccess;
  },

  /**
   * 🌟 SUPREME PRIVILEGES: Xóa lớp học trên toàn hệ thống
   * Nếu isSuperAdmin: Bỏ qua kiểm tra teacher_id, xóa thẳng theo id của lớp học
   */
  async deleteClass(classId: string, options?: { teacherUsername?: string; currentUserId?: string; isSuperAdmin?: boolean }): Promise<boolean> {
    const isSuperAdmin = Boolean(options?.isSuperAdmin);
    let success = false;

    // 1. Direct Supabase Cloud Mutate
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        if (isSuperAdmin) {
          // Bỏ qua lọc teacher_id, xóa thẳng theo id lớp học
          await supabase.from('classes').delete().eq('id', classId);
          await supabase.from('students').delete().eq('class_id', classId);
        } else if (options?.currentUserId) {
          // Giáo viên thông thường: chỉ được xóa lớp thuộc quyền sở hữu của mình
          await supabase.from('classes').delete().eq('id', classId).eq('teacher_id', options.currentUserId);
          await supabase.from('students').delete().eq('class_id', classId).eq('teacher_id', options.currentUserId);
        }
      } catch (err) {
        console.warn('Supabase direct deleteClass exception:', err);
      }
    }

    // 2. Server API Sync (cập nhật triệt để mọi userData)
    success = await this.updateAdminClass({ id: classId }, options?.teacherUsername, true);
    return success;
  },

  /**
   * 🌟 SUPREME PRIVILEGES: Xóa học sinh trên toàn hệ thống
   * Nếu isSuperAdmin: Bỏ qua kiểm tra teacher_id, xóa thẳng theo id học sinh
   */
  async deleteStudent(studentId: string, options?: { classId?: string; teacherUsername?: string; currentUserId?: string; isSuperAdmin?: boolean }): Promise<boolean> {
    const isSuperAdmin = Boolean(options?.isSuperAdmin);
    let success = false;

    // 1. Direct Supabase Cloud Mutate
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        if (isSuperAdmin) {
          // Bỏ qua lọc teacher_id, xóa thẳng theo id học sinh
          await supabase.from('students').delete().eq('id', studentId);
        } else if (options?.currentUserId) {
          // Giáo viên thông thường: chỉ được xóa học sinh trong lớp của mình
          await supabase.from('students').delete().eq('id', studentId).eq('teacher_id', options.currentUserId);
        }
      } catch (err) {
        console.warn('Supabase direct deleteStudent exception:', err);
      }
    }

    // 2. Server API Sync (cập nhật triệt để mọi userData)
    success = await this.updateAdminStudent({ id: studentId, classId: options?.classId }, options?.teacherUsername, true);
    return success;
  },

  async deleteStudentsByClassId(classId: string, options?: { teacherUsername?: string; currentUserId?: string; isSuperAdmin?: boolean }): Promise<boolean> {
    const isSuperAdmin = Boolean(options?.isSuperAdmin);
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        if (isSuperAdmin) {
          await supabase.from('students').delete().eq('class_id', classId);
        } else if (options?.currentUserId) {
          await supabase.from('students').delete().eq('class_id', classId).eq('teacher_id', options.currentUserId);
        }
      } catch (err) {
        console.warn('Supabase direct deleteStudentsByClassId exception:', err);
      }
    }
    return true;
  },

  /**
   * 🌟 SUPREME PRIVILEGES: Cập nhật lớp học trên toàn hệ thống
   */
  async updateClass(classId: string, classData: any, options?: { teacherUsername?: string; currentUserId?: string; isSuperAdmin?: boolean }): Promise<boolean> {
    const isSuperAdmin = Boolean(options?.isSuperAdmin);
    let success = false;

    // 1. Direct Supabase Cloud Mutate
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        const payload = { ...classData, id: classId };
        if (isSuperAdmin) {
          await supabase.from('classes').update(payload).eq('id', classId);
        } else if (options?.currentUserId) {
          await supabase.from('classes').update(payload).eq('id', classId).eq('teacher_id', options.currentUserId);
        }
      } catch (err) {
        console.warn('Supabase direct updateClass exception:', err);
      }
    }

    // 2. Server API Sync
    success = await this.updateAdminClass({ ...classData, id: classId }, options?.teacherUsername, false);
    return success;
  },

  /**
   * 🌟 SUPREME PRIVILEGES: Cập nhật học sinh trên toàn hệ thống
   */
  async updateStudent(studentId: string, studentData: any, options?: { teacherUsername?: string; currentUserId?: string; isSuperAdmin?: boolean }): Promise<boolean> {
    const isSuperAdmin = Boolean(options?.isSuperAdmin);
    let success = false;

    // 1. Direct Supabase Cloud Mutate
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        const payload = { ...studentData, id: studentId };
        if (isSuperAdmin) {
          await supabase.from('students').update(payload).eq('id', studentId);
        } else if (options?.currentUserId) {
          await supabase.from('students').update(payload).eq('id', studentId).eq('teacher_id', options.currentUserId);
        }
      } catch (err) {
        console.warn('Supabase direct updateStudent exception:', err);
      }
    }

    // 2. Server API Sync
    success = await this.updateAdminStudent({ ...studentData, id: studentId }, options?.teacherUsername, false);
    return success;
  },

  // GitHub Server Database Status & Checkpoint
  async getGithubStatus(): Promise<any> {
    try {
      const res = await fetch(`/api/github/status?t=${Date.now()}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('Lỗi kiểm tra trạng thái GitHub:', err);
    }
    return null;
  },

  async configureGithubRemote(config: {
    repoUrl: string;
    token?: string;
    branch?: string;
    autoPush?: boolean;
    autoPull?: boolean;
  }): Promise<{ success: boolean; message: string; status?: any }> {
    try {
      const res = await fetch('/api/github/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err?.message || 'Lỗi kết nối khi cấu hình GitHub.' };
    }
  },

  async pushToGithub(): Promise<{ success: boolean; message: string; timestamp?: number }> {
    try {
      const res = await fetch('/api/github/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err?.message || 'Lỗi kết nối khi đẩy lên GitHub.' };
    }
  },

  // 🚀 NÂNG CẤP TÍNH NĂNG PHẦN MỀM LÊN GITHUB (BẢO TOÀN 100% DỮ LIỆU GIÁO VIÊN TRÊN GITHUB)
  async pushCodeUpgrade(commitMessage?: string): Promise<{ success: boolean; message: string; timestamp?: number }> {
    try {
      const res = await fetch('/api/github/push-code-upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMessage })
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err?.message || 'Lỗi kết nối khi nâng cấp tính năng lên GitHub.' };
    }
  },

  async pullFromGithub(): Promise<{ success: boolean; message: string; timestamp?: number }> {
    try {
      const res = await fetch('/api/github/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err?.message || 'Lỗi kết nối khi kéo từ GitHub.' };
    }
  },

  async createGithubCheckpoint(message?: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch('/api/github/checkpoint', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Client-Id': CLIENT_ID
        },
        body: JSON.stringify({ message })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err: any) {
      console.warn('Lỗi lưu điểm GitHub Checkpoint:', err);
    }
    return { success: false, message: 'Lỗi kết nối máy chủ GitHub.' };
  },

  // Full Database Stats & Sync (for GitHub & Backups)
  async getDatabaseStats(): Promise<DatabaseStats | null> {
    try {
      const res = await fetch('/api/database/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          return data.stats as DatabaseStats;
        }
      }
    } catch (err) {
      console.warn('Lỗi lấy thống kê database:', err);
    }
    return null;
  },

  async compactDatabase(): Promise<{ success: boolean; message: string; stats?: DatabaseStats }> {
    try {
      const res = await fetch('/api/database/compact', { method: 'POST' });
      const data = await res.json();
      return {
        success: data.success,
        message: data.message || 'Tối ưu hóa database thành công!',
        stats: data.stats
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Lỗi khi tối ưu hóa database.'
      };
    }
  },

  getLocalStorageUsage(): { bytes: number; sizeKB: number; formatted: string } {
    try {
      let totalBytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('lop_hoc') || key.startsWith('classroom'))) {
          const val = localStorage.getItem(key) || '';
          totalBytes += (key.length + val.length) * 2; // UTF-16 approx
        }
      }
      const sizeKB = Math.round((totalBytes / 1024) * 10) / 10;
      return {
        bytes: totalBytes,
        sizeKB,
        formatted: sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(2)} MB` : `${sizeKB.toFixed(1)} KB`
      };
    } catch (_) {
      return { bytes: 0, sizeKB: 0, formatted: '0 KB' };
    }
  },

  downloadDatabaseExport(): void {
    window.location.href = '/api/database/export';
  },

  async importDatabase(jsonContent: any): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch('/api/database/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonContent)
      });
      const data = await res.json();
      return {
        success: data.success,
        message: data.message || (data.success ? 'Khôi phục thành công' : 'Khôi phục thất bại')
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Lỗi kết nối khi gửi dữ liệu khôi phục.'
      };
    }
  },

  // Supabase Cloud Sync (Đã tắt - Chuyển sang Google Drive)
  async getSupabaseStatus(): Promise<{ success: boolean; configured: boolean; message: string }> {
    return { success: false, configured: false, message: 'Tính năng Supabase đã được tắt (Đang sử dụng Google Drive).' };
  },

  async migrateToSupabase(): Promise<{ success: boolean; message: string; usersMigrated?: number; dataEntriesMigrated?: number; logsMigrated?: number }> {
    return { success: false, message: 'Tính năng đẩy Supabase đã được loại bỏ.' };
  },

  // Audit Logs & Activity History
  async getAuditLogs(options?: { limit?: number; username?: string; actionType?: string }): Promise<AuditLogItem[]> {
    try {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.username) params.set('username', options.username);
      if (options?.actionType) params.set('actionType', options.actionType);

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.logs)) {
          return data.logs;
        }
      }
    } catch (err) {
      console.warn('Lỗi lấy lịch sử thao tác:', err);
    }
    return [];
  },

  async addAuditLog(entry: {
    username: string;
    userFullName: string;
    role: UserRole;
    actionType: string;
    description: string;
    details?: any;
  }): Promise<boolean> {
    // Đã bỏ chức năng "Lịch sử thao tác" (11/2026): không ghi nhật ký để mọi lần lưu / tải nhanh nhất.
    // Giữ hàm (nhiều nơi gọi) nhưng không làm gì.
    void entry;
    return true;
    // eslint-disable-next-line no-unreachable
    try {
      const res = await fetch('/api/audit-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      return res.ok;
    } catch (err) {
      console.warn('Lỗi ghi lịch sử thao tác:', err);
      return false;
    }
  },

  async clearAuditLogs(): Promise<boolean> {
    try {
      const res = await fetch('/api/audit-logs', { method: 'DELETE' });
      return res.ok;
    } catch (err) {
      console.warn('Lỗi xóa lịch sử thao tác:', err);
      return false;
    }
  },

  async getUserDataSummaries(): Promise<UserSummaryItem[]> {
    try {
      const res = await fetch('/api/user-data-summaries');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.summaries)) {
          return data.summaries;
        }
      }
    } catch (err) {
      console.warn('Lỗi lấy tổng hợp dữ liệu thực:', err);
    }
    return [];
  },

  // 🏫 QUẢN LÝ DANH MỤC TRƯỜNG HỌC (ADMIN)
  async getSchools(): Promise<SchoolEntity[]> {
    const purgeRemovedSchools = (list: SchoolEntity[]): SchoolEntity[] => {
      // Chỉ loại đúng bản ghi demo cũ theo ID. Không lọc theo mã / tên để không làm mất
      // trường thật (ví dụ "Trường Thực nghiệm", mã TH_TN) — trường demo đã được gỡ bỏ hoàn toàn.
      const REMOVED_IDS = new Set(['school-thucnghiem-02']);
      return (list || []).filter(s => {
        if (!s) return false;
        if (REMOVED_IDS.has(s.id)) return false;
        return true;
      });
    };

    // 1. Thử gọi API backend (Local dev)
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/schools`);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success && Array.isArray(data.schools)) {
          const cleanSchools = purgeRemovedSchools(data.schools);
          localStorage.setItem(LOCAL_SCHOOLS_KEY, JSON.stringify(cleanSchools));
          return cleanSchools;
        }
      }
    } catch (_) {}

    // 2. Thử đọc từ Supabase Cloud trực tiếp
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        const { data: sbSchools, error } = await supabase.from('schools').select('*');
        if (!error && Array.isArray(sbSchools)) {
          const mapped: SchoolEntity[] = sbSchools.map((s: any) => ({
            id: s.id,
            name: s.name,
            code: s.code || '',
            address: s.address || '',
            phone: s.phone || '',
            adminUsername: s.admin_username || (s.code ? `bgh_${s.code.toLowerCase().replace(/[^a-z0-9]/g, '')}` : ''),
            adminFullName: s.principal_name || `Ban Giám Hiệu ${s.name}`,
            createdAt: s.created_at ? new Date(s.created_at).getTime() : Date.now()
          }));
          const clean = purgeRemovedSchools(mapped);
          localStorage.setItem(LOCAL_SCHOOLS_KEY, JSON.stringify(clean));
          return clean;
        }
      } catch (_) {}
    }

    // 3. Đọc từ LocalStorage
    try {
      const cached = localStorage.getItem(LOCAL_SCHOOLS_KEY);
      if (cached) {
        const list = JSON.parse(cached);
        if (Array.isArray(list) && list.length > 0) {
          const cleanList = purgeRemovedSchools(list);
          if (cleanList.length > 0) return cleanList;
        }
      }
    } catch (_) {}

    // 4. Fallback thông minh: Tự động trích xuất danh sách trường từ bảng Users trên Supabase hoặc LocalStorage
    try {
      const users = await this.getUsers();
      if (Array.isArray(users) && users.length > 0) {
        const schoolMap = new Map<string, SchoolEntity>();
        users.forEach(u => {
          const sName = (u.schoolName || '').trim();
          if (
            sName && 
            !sName.toLowerCase().includes('cá nhân') && 
            !sName.toLowerCase().includes('tự do') && 
            !sName.toLowerCase().includes('vãng lai') &&
            !sName.toLowerCase().includes('quản trị lớp học')
          ) {
            if (!schoolMap.has(sName)) {
              const codeSlug = sName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() || 'TRUONG';
              schoolMap.set(sName, {
                id: `school-auto-${codeSlug.toLowerCase()}`,
                name: sName,
                code: codeSlug,
                address: '',
                phone: u.phone || '',
                adminUsername: u.role === 'school_admin' || u.role === 'bgh' ? u.username : `bgh_${codeSlug.toLowerCase()}`,
                adminFullName: u.role === 'school_admin' || u.role === 'bgh' ? u.fullName : `Ban Giám Hiệu ${sName}`,
                createdAt: Date.now()
              });
            }
          }
        });
        const extracted = Array.from(schoolMap.values());
        const cleanExtracted = purgeRemovedSchools(extracted);
        if (cleanExtracted.length > 0) {
          try {
            localStorage.setItem(LOCAL_SCHOOLS_KEY, JSON.stringify(cleanExtracted));
          } catch (_) {}
          return cleanExtracted;
        }
      }
    } catch (_) {}

    return [];
  },

  async createSchool(schoolData: Partial<SchoolEntity> & { adminPassword?: string; adminFullName?: string; createAccount?: boolean }): Promise<{
    success: boolean;
    school?: SchoolEntity;
    adminAccount?: { username: string; password?: string; fullName: string; role: string; schoolName: string };
    message?: string;
  }> {
    if (!schoolData.name || !schoolData.name.trim()) {
      return { success: false, message: 'Tên trường học không được để trống.' };
    }

    const cleanName = schoolData.name.trim();
    const schoolCode = schoolData.code?.trim().toUpperCase() || `TH_${Date.now().toString().slice(-4)}`;

    const newSchool: SchoolEntity = {
      id: schoolData.id || `school_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      code: schoolCode,
      address: schoolData.address?.trim() || '',
      phone: schoolData.phone?.trim() || '',
      adminUsername: schoolData.createAccount ? (schoolData.adminUsername?.trim() || '') : '',
      createdAt: Date.now()
    };

    // 1. Thử gọi qua API backend trước (Local dev)
    try {
      const res = await fetch('/api/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schoolData)
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success) {
          // Lưu cache client
          try {
            const cachedSchools = await this.getSchools();
            const updated = [...cachedSchools.filter(s => s.id !== (data.school?.id || newSchool.id)), data.school || newSchool];
            localStorage.setItem(LOCAL_SCHOOLS_KEY, JSON.stringify(updated));
          } catch (_) {}
          return data;
        }
      }
    } catch (_) {}

    // 2. Chế độ Vercel / Cloud Fallback: Lưu trực tiếp vào Supabase (hoặc LocalStorage)
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        await supabase.from('schools').upsert({
          id: newSchool.id,
          name: newSchool.name,
          code: newSchool.code,
          address: newSchool.address,
          phone: newSchool.phone,
          tenant_type: 'formal',
          status: 'active'
        }, { onConflict: 'id' });
      } catch (sErr) {
        console.warn('[Supabase Create School Table]', sErr);
      }
    }

    // 3. Cập nhật cache cục bộ LocalStorage
    try {
      const rawCached = localStorage.getItem(LOCAL_SCHOOLS_KEY);
      const list: SchoolEntity[] = rawCached ? JSON.parse(rawCached) : [];
      const updatedList = [...list.filter(s => s.id !== newSchool.id && s.name.toLowerCase() !== cleanName.toLowerCase()), newSchool];
      localStorage.setItem(LOCAL_SCHOOLS_KEY, JSON.stringify(updatedList));
    } catch (_) {}

    return {
      success: true,
      school: newSchool,
      message: 'Khởi tạo cơ sở dữ liệu trường học thành công!'
    };
  },

  async provisionSchoolAdmin(schoolId: string, data: { adminUsername: string; adminPassword?: string; adminFullName?: string; phone?: string }): Promise<{
    success: boolean;
    school?: SchoolEntity;
    adminAccount?: { username: string; password?: string; fullName: string; role: string; schoolName: string };
    message?: string;
  }> {
    try {
      const res = await fetch(`/api/schools/${schoolId}/provision-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const resData = await res.json();
      if (resData.success) {
        // Cập nhật lại cache schools
        try {
          const cached = await this.getSchools();
          const updated = cached.map(s => s.id === schoolId ? { ...s, adminUsername: data.adminUsername } : s);
          localStorage.setItem(LOCAL_SCHOOLS_KEY, JSON.stringify(updated));
        } catch (_) {}
      }
      return resData;
    } catch (err: any) {
      // Fallback
      try {
        await this.updateSchool(schoolId, { adminUsername: data.adminUsername });
        return {
          success: true,
          adminAccount: {
            username: data.adminUsername,
            password: data.adminPassword || '123456',
            fullName: data.adminFullName || `Ban Giám Hiệu`,
            role: 'school_admin',
            schoolName: ''
          },
          message: 'Đã cấp tài khoản BGH thành công!'
        };
      } catch (fallbackErr: any) {
        return { success: false, message: fallbackErr?.message || 'Lỗi cấp tài khoản BGH.' };
      }
    }
  },

  async updateSchool(id: string, schoolData: Partial<SchoolEntity>): Promise<{ success: boolean; school?: SchoolEntity; message?: string }> {
    try {
      const res = await fetch(`/api/schools/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schoolData)
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, message: err?.message || 'Lỗi khi cập nhật thông tin trường.' };
    }
  },

  async deleteSchool(id: string, schoolName?: string): Promise<{ success: boolean; message?: string }> {
    // 💥 PROGRAMMATIC CASCADE DELETION (XÓA LIÊN ĐỚI 6 BƯỚC BOTTOM-UP CHO SUPABASE)
    const supabase = getBrowserSupabase();
    if (supabase) {
      try {
        console.log(`[Cascade Delete] Bắt đầu dọn dẹp liên đới cho trường: ${id} (${schoolName || ''})`);

        // BƯỚC 1: Tìm tất cả các Lớp học (Classes) thuộc Trường (school_id hoặc school_name)
        let classIds: string[] = [];
        try {
          let cQuery = supabase.from('classes').select('id');
          if (schoolName) {
            cQuery = cQuery.or(`school_id.eq."${id}",school_name.eq."${schoolName}"`);
          } else {
            cQuery = cQuery.eq('school_id', id);
          }
          const { data: classesData, error: cErr } = await cQuery;
          if (cErr) {
            console.warn('[Cascade Step 1] Không tìm thấy hoặc lỗi truy vấn bảng classes:', cErr.message);
          } else if (classesData && classesData.length > 0) {
            classIds = classesData.map((c: any) => c.id);
          }
        } catch (step1Err) {
          console.warn('[Cascade Step 1] Bỏ qua kiểm tra lớp học:', step1Err);
        }

        // BƯỚC 2: Xóa toàn bộ Học sinh (Students) thuộc các Lớp học vừa tìm được ở Bước 1
        try {
          if (classIds.length > 0) {
            const { error: stErr } = await supabase.from('students').delete().in('class_id', classIds);
            if (stErr) console.warn('[Cascade Step 2] Lỗi xóa students theo class_id:', stErr.message);
          }
          if (schoolName) {
            await supabase.from('students').delete().or(`school_id.eq."${id}",school_name.eq."${schoolName}"`);
          } else {
            await supabase.from('students').delete().eq('school_id', id);
          }
        } catch (step2Err) {
          console.warn('[Cascade Step 2] Bỏ qua xóa học sinh:', step2Err);
        }

        // BƯỚC 3: Xóa toàn bộ Lớp học (Classes) có school_id / school_name trùng khớp
        try {
          let delClsQuery = supabase.from('classes').delete();
          if (schoolName) {
            delClsQuery = delClsQuery.or(`school_id.eq."${id}",school_name.eq."${schoolName}"`);
          } else {
            delClsQuery = delClsQuery.eq('school_id', id);
          }
          const { error: clsDelErr } = await delClsQuery;
          if (clsDelErr) console.warn('[Cascade Step 3] Lỗi xóa bảng classes:', clsDelErr.message);
        } catch (step3Err) {
          console.warn('[Cascade Step 3] Bỏ qua xóa lớp học:', step3Err);
        }

        // BƯỚC 4: Xóa toàn bộ Tài khoản (Accounts / Users) và user_classroom_data thuộc Trường
        try {
          let uQuery = supabase.from('users').select('id, username').neq('role', 'admin').neq('username', 'adminquantri');
          if (schoolName) {
            uQuery = uQuery.or(`school_id.eq."${id}",school_name.eq."${schoolName}"`);
          } else {
            uQuery = uQuery.eq('school_id', id);
          }
          const { data: usersToDelete, error: uFetchErr } = await uQuery;
          if (!uFetchErr && usersToDelete && usersToDelete.length > 0) {
            const usernames = usersToDelete.map((u: any) => u.username);
            await supabase.from('user_classroom_data').delete().in('username', usernames);
            let delUQuery = supabase.from('users').delete().neq('role', 'admin').neq('username', 'adminquantri');
            if (schoolName) {
              delUQuery = delUQuery.or(`school_id.eq."${id}",school_name.eq."${schoolName}"`);
            } else {
              delUQuery = delUQuery.eq('school_id', id);
            }
            const { error: uDelErr } = await delUQuery;
            if (uDelErr) console.warn('[Cascade Step 4] Lỗi xóa users:', uDelErr.message);
          }
        } catch (step4Err) {
          console.warn('[Cascade Step 4] Bỏ qua xóa người dùng:', step4Err);
        }

        // BƯỚC 5: Xóa các Game / Lesson / Thư khen / Báo cáo liên kết trực tiếp với school_id
        const relatedTables = ['certificates', 'lessons', 'games', 'game_sessions', 'student_activities', 'activities'];
        for (const tbl of relatedTables) {
          try {
            await supabase.from(tbl).delete().eq('school_id', id);
          } catch (_) {}
        }

        // BƯỚC 6: CUỐI CÙNG, thực hiện lệnh xóa CSDL Trường học (Schools)
        try {
          let delSchQuery = supabase.from('schools').delete();
          if (schoolName) {
            delSchQuery = delSchQuery.or(`id.eq."${id}",name.eq."${schoolName}"`);
          } else {
            delSchQuery = delSchQuery.eq('id', id);
          }
          const { error: schErr } = await delSchQuery;
          if (schErr) {
            console.warn('[Cascade Step 6] Supabase delete schools warning:', schErr.message);
            // Nếu bảng schools chưa được tạo trên Supabase hoặc lỗi schema cache, không chặn quy trình xóa local
          } else {
            console.log(`[Cascade Delete] Đã xóa thành công trường học trên Supabase: ${id}`);
          }
        } catch (schEx) {
          console.warn('[Cascade Step 6] Bỏ qua lỗi xóa bảng schools trên Supabase:', schEx);
        }
      } catch (err: any) {
        console.warn('Lỗi quy trình xóa liên đới Supabase (sẽ fallback sang local API):', err);
      }
    }

    // 2. Server API Cascade (Đồng bộ cục bộ cho local JSON database)
    try {
      const queryParam = schoolName ? `?schoolName=${encodeURIComponent(schoolName)}` : '';
      const res = await fetch(`/api/schools/${encodeURIComponent(id)}${queryParam}`, { method: 'DELETE' });
      if (res.status === 204 || res.ok) {
        let data: any = { success: true, message: `Đã dọn dẹp liên đới và xóa sạch CSDL trường "${schoolName || id}".` };
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            data = await res.json();
          } catch (_) {}
        }
        return data;
      } else {
        let errMsg = 'Lỗi máy chủ khi xóa trường.';
        try {
          const errData = await res.json();
          if (errData?.message) errMsg = errData.message;
        } catch (_) {}
        if (supabase) {
          return { success: true, message: `Đã dọn dẹp và xóa sạch CSDL trường "${schoolName || id}" trên Cloud Supabase.` };
        }
        return { success: false, message: errMsg };
      }
    } catch (err: any) {
      if (supabase) {
        return { success: true, message: `Đã dọn dẹp và xóa sạch CSDL trường "${schoolName || id}" trên Cloud Supabase.` };
      }
      return { success: false, message: err?.message || 'Lỗi kết nối khi xóa trường.' };
    }
  },

  // 🎓 Chuẩn bị năm học mới: Xóa dữ liệu trường / nhóm cá nhân có lựa chọn
  async resetSchoolAcademicYear(
    schoolName?: string, 
    mode: 'full' | 'keep_teachers' = 'keep_teachers',
    targetScope: 'school' | 'guest' = 'school'
  ): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch('/api/database/reset-academic-year', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolName, mode, targetScope })
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, message: err?.message || 'Lỗi khi gửi yêu cầu xóa năm học mới.' };
    }
  },

  // 📦 Tải file Data JSON theo phân quyền (Nhà trường / Cá nhân / Toàn hệ thống)
  async exportScopedData(scope: 'all' | 'school' | 'guest' = 'all', schoolName?: string): Promise<any> {
    try {
      const query = new URLSearchParams({ scope, schoolName: schoolName || '' }).toString();
      const res = await fetch(`/api/database/export-scoped?${query}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('Lỗi export dữ liệu scoped:', err);
    }
    return null;
  },

  // 📥 Nạp file Data JSON theo phân quyền (Nhà trường / Cá nhân / Toàn hệ thống)
  async importScopedData(data: any, scope: 'all' | 'school' | 'guest' = 'all', schoolName?: string): Promise<any> {
    try {
      const res = await fetch('/api/database/import-scoped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, scope, schoolName })
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err?.message || 'Lỗi nạp file JSON.' };
    }
  },

  // 📝 Đăng ký sử dụng phần mềm (Yêu cầu 4)
  async submitRegistration(reqData: any): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqData)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Lưu tạm vào localStorage làm bằng chứng đăng ký phía client
        try {
          const localList = JSON.parse(localStorage.getItem('lop_hoc_my_registrations') || '[]');
          localList.unshift(data.registration || reqData);
          localStorage.setItem('lop_hoc_my_registrations', JSON.stringify(localList));
        } catch (_) {}
        return { success: true, message: 'Gửi đăng ký sử dụng thành công!' };
      }
    } catch (err) {
      console.warn('Không kết nối được server, lưu offline:', err);
    }
    // Fallback lưu local
    try {
      const localList = JSON.parse(localStorage.getItem('lop_hoc_my_registrations') || '[]');
      localList.unshift({
        ...reqData,
        id: `reg_${Date.now()}`,
        createdAt: Date.now(),
        status: 'pending'
      });
      localStorage.setItem('lop_hoc_my_registrations', JSON.stringify(localList));
      return { success: true, message: 'Đã lưu thông tin đăng ký thành công!' };
    } catch (_) {}
    return { success: false, message: 'Không thể lưu đơn đăng ký.' };
  },

  async getRegistrations(): Promise<any[]> {
    try {
      const res = await fetch('/api/registrations');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.registrations)) {
          return data.registrations;
        }
      }
    } catch (_) {}
    try {
      return JSON.parse(localStorage.getItem('lop_hoc_my_registrations') || '[]');
    } catch (_) {
      return [];
    }
  },

  async updateRegistrationStatus(id: string, status: 'approved' | 'rejected', reason?: string): Promise<{ success: boolean; message?: string }> {
    try {
      await fetch(`/api/registrations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason })
      });
    } catch (_) {}

    try {
      const localList = JSON.parse(localStorage.getItem('lop_hoc_my_registrations') || '[]');
      const index = localList.findIndex((r: any) => r.id === id);
      if (index !== -1) {
        localList[index].status = status;
        if (reason !== undefined) {
          localList[index].rejectReason = reason;
        }
        localStorage.setItem('lop_hoc_my_registrations', JSON.stringify(localList));
        return { success: true };
      }
    } catch (_) {}
    return { success: false, message: 'Không tìm thấy đơn đăng ký.' };
  },

  async deleteRegistration(id: string): Promise<{ success: boolean; message?: string }> {
    try {
      await fetch(`/api/registrations/${id}`, { method: 'DELETE' });
    } catch (_) {}

    try {
      let localList = JSON.parse(localStorage.getItem('lop_hoc_my_registrations') || '[]');
      localList = localList.filter((r: any) => r.id !== id);
      localStorage.setItem('lop_hoc_my_registrations', JSON.stringify(localList));
      return { success: true, message: 'Xóa đơn đăng ký thành công.' };
    } catch (_) {}
    return { success: false, message: 'Lỗi khi xóa đơn đăng ký.' };
  },

  // 🚀 Tối ưu hóa nén ảnh Avatar / Data storage (Yêu cầu 1)
  async compressImageBase64(base64Str: string, maxWidth = 320, quality = 0.82): Promise<string> {
    if (!base64Str || !base64Str.startsWith('data:image')) {
      return base64Str;
    }
    // Nếu kích thước base64 nhỏ hơn 40KB thì không cần nén thêm
    if (base64Str.length < 50000) {
      return base64Str;
    }
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(base64Str);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        };
        img.onerror = () => resolve(base64Str);
        img.src = base64Str;
      } catch (_) {
        resolve(base64Str);
      }
    });
  }
};

// =====================================================================================
// 🏫 ADAPTER: ĐỒNG BỘ TÀI KHOẢN & TRƯỜNG LÊN CSDL NHÀ TRƯỜNG TRÊN GOOGLE DRIVE (Apps Script V4)
// Giữ nguyên Public API: hàm gốc chạy như cũ, sau đó ghi thêm lên Drive (gộp, có chữ ký Quản trị).
// Chỉ hoạt động khi máy đã cấu hình thư mục dùng chung; nếu chưa, mọi thứ chạy như trước.
// =====================================================================================
(() => {
  const ds = databaseService as any;
  const actor = () => databaseService.getCurrentUser();
  const findLocalUserById = (id: string): any => {
    try {
      const list = JSON.parse(localStorage.getItem('LHHP_USERS') || '[]');
      // Không khớp khi id rỗng (tài khoản từ Drive không có id → trước đây khớp nhầm tài khoản đầu tiên)
      if (!id) return null;
      return list.find((u: any) => (u?.id && u.id === id) || String(u?.username || '').toLowerCase() === String(id).toLowerCase());
    } catch (_) {
      return null;
    }
  };
  // Tài khoản do Quản trị cấp KHÔNG bị bắt đổi mật khẩu lần đầu (người dùng tự đổi khi cần).

  const origCreateUser = ds.createUser.bind(ds);
  ds.createUser = async (payload: any) => {
    const res = await origCreateUser(payload);
    if (res?.success && schoolDriveDbService.isConfigured()) {
      schoolDriveDbService.setPendingPassword(payload.username, payload.password || '123456');
      schoolDriveDbService.queueSync(actor());
    }
    return res;
  };

  const origCreateUsersBulk = ds.createUsersBulk.bind(ds);
  ds.createUsersBulk = async (items: any[]) => {
    const res = await origCreateUsersBulk(items);
    if (res?.success && schoolDriveDbService.isConfigured()) {
      (items || []).forEach(it => {
        if (!it?.username) return;
        schoolDriveDbService.setPendingPassword(it.username, it.password || '123456');
      });
      schoolDriveDbService.queueSync(actor());
    }
    return res;
  };

  const origUpdateUser = ds.updateUser.bind(ds);
  ds.updateUser = async (id: string, payload: any) => {
    const res = await origUpdateUser(id, payload);
    if (res?.success && schoolDriveDbService.isConfigured()) {
      const u = findLocalUserById(id);
      const username = payload?.username || u?.username;
      if (username) schoolDriveDbService.markUserDirty(username);
      if (username && payload?.password) schoolDriveDbService.setPendingPassword(username, payload.password);
      schoolDriveDbService.queueSync(actor());
    }
    return res;
  };

  const origDeleteUser = ds.deleteUser.bind(ds);
  ds.deleteUser = async (id: string) => {
    const before = findLocalUserById(id);
    const res = await origDeleteUser(id);
    if (res?.success && before?.username && schoolDriveDbService.isConfigured()) {
      schoolDriveDbService.markUserDeleted(before.username);
      schoolDriveDbService.queueSync(actor());
    }
    return res;
  };

  const origResetPassword = ds.resetPassword.bind(ds);
  ds.resetPassword = async (id: string, newPassword = '123456') => {
    const u = findLocalUserById(id);
    if (schoolDriveDbService.isConfigured() && u?.username) {
      schoolDriveDbService.setPendingPassword(u.username, newPassword);
      const sync = await schoolDriveDbService.syncNow();
      // Vẫn thử máy chủ Express (localhost) nhưng không phụ thuộc vào nó
      origResetPassword(id, newPassword).catch(() => {});
      return sync.success
        ? { success: true, message: `Đã đặt lại mật khẩu cho ${u.username} và lưu lên Google Drive.` }
        : { success: false, message: sync.message };
    }
    return origResetPassword(id, newPassword);
  };

  // Gán mật khẩu chung hàng loạt: bản web ghi tất cả rồi đồng bộ Drive MỘT lần (không đồng bộ từng tài khoản)
  const origResetPasswordsBulk = ds.resetPasswordsBulk.bind(ds);
  ds.resetPasswordsBulk = async (ids: string[], newPassword: string) => {
    if (!schoolDriveDbService.isConfigured()) return origResetPasswordsBulk(ids, newPassword);
    const users = ids.map(id => ({ id, u: findLocalUserById(id) }));
    const ok = users.filter(x => x.u?.username);
    ok.forEach(x => schoolDriveDbService.setPendingPassword(x.u!.username, newPassword));
    const sync = await schoolDriveDbService.syncNow();
    ok.forEach(x => { origResetPassword(x.id, newPassword).catch(() => {}); });
    const failed = users.filter(x => !x.u?.username).map(x => x.id);
    return sync.success
      ? { success: true, count: ok.length, failed, message: `Đã gán mật khẩu chung cho ${ok.length} tài khoản và lưu lên Google Drive.` }
      : { success: false, count: 0, failed: ids, message: sync.message };
  };

  const origCreateSchool = ds.createSchool.bind(ds);
  ds.createSchool = async (schoolData: any) => {
    const res = await origCreateSchool(schoolData);
    if (res?.success && schoolDriveDbService.isConfigured()) {
      // Bản web không có máy chủ: tự tạo tài khoản Quản trị trường nếu được yêu cầu
      if (schoolData?.createAccount && schoolData?.adminUsername && !res.adminAccount) {
        const adminPw = schoolData.adminPassword || '123456';
        const adminName = schoolData.adminFullName || `Quản trị ${schoolData.name}`;
        const created = await ds.createUser({
          username: schoolData.adminUsername,
          password: adminPw,
          fullName: adminName,
          role: 'school_admin',
          schoolName: res.school?.name || schoolData.name,
          tenantType: 'school'
        });
        if (created?.success) {
          res.adminAccount = {
            username: String(schoolData.adminUsername).trim().toLowerCase(),
            password: adminPw,
            fullName: adminName,
            role: 'school_admin',
            schoolName: res.school?.name || schoolData.name
          };
        }
      }
      if (res.school) schoolDriveDbService.markSchoolDirty(res.school.id || res.school.name);
      schoolDriveDbService.queueSync(actor());
    }
    return res;
  };

  const origProvision = ds.provisionSchoolAdmin.bind(ds);
  ds.provisionSchoolAdmin = async (schoolId: string, data: any) => {
    if (!schoolDriveDbService.isConfigured()) return origProvision(schoolId, data);
    const schools: SchoolEntity[] = await ds.getSchools();
    const school = schools.find(s => s.id === schoolId);
    const adminPw = data.adminPassword || '123456';
    const adminName = data.adminFullName || 'Ban Giám Hiệu';
    const created = await ds.createUser({
      username: data.adminUsername,
      password: adminPw,
      fullName: adminName,
      phone: data.phone,
      role: 'school_admin',
      schoolName: school?.name || '',
      tenantType: 'school'
    });
    if (!created?.success) return { success: false, message: created?.message || 'Không tạo được tài khoản.' };
    try {
      const updated = schools.map(s => (s.id === schoolId ? { ...s, adminUsername: data.adminUsername } : s));
      localStorage.setItem(LOCAL_SCHOOLS_KEY, JSON.stringify(updated));
    } catch (_) {}
    schoolDriveDbService.markSchoolDirty(schoolId);
    return {
      success: true,
      school,
      adminAccount: {
        username: String(data.adminUsername).trim().toLowerCase(),
        password: adminPw,
        fullName: adminName,
        role: 'school_admin',
        schoolName: school?.name || ''
      },
      message: 'Đã cấp tài khoản Quản trị trường và lưu lên Google Drive.'
    };
  };

  const origUpdateSchool = ds.updateSchool.bind(ds);
  ds.updateSchool = async (id: string, schoolData: any) => {
    const res = await origUpdateSchool(id, schoolData);
    if (!schoolDriveDbService.isConfigured()) return res;
    let school: SchoolEntity | undefined;
    try {
      const list: SchoolEntity[] = JSON.parse(localStorage.getItem(LOCAL_SCHOOLS_KEY) || '[]');
      const next = list.map(s => {
        if (s.id !== id) return s;
        school = { ...s, ...schoolData };
        return school as SchoolEntity;
      });
      localStorage.setItem(LOCAL_SCHOOLS_KEY, JSON.stringify(next));
    } catch (_) {}
    schoolDriveDbService.markSchoolDirty(id);
    schoolDriveDbService.queueSync(actor());
    if (res?.success) return res;
    return { success: Boolean(school), school, message: school ? 'Đã cập nhật trường và lưu lên Google Drive.' : res?.message };
  };

  const origDeleteSchool = ds.deleteSchool.bind(ds);
  ds.deleteSchool = async (id: string, schoolName?: string) => {
    const res = await origDeleteSchool(id, schoolName);
    if (schoolDriveDbService.isConfigured()) {
      try {
        const list: SchoolEntity[] = JSON.parse(localStorage.getItem(LOCAL_SCHOOLS_KEY) || '[]');
        localStorage.setItem(LOCAL_SCHOOLS_KEY, JSON.stringify(list.filter(s => s.id !== id)));
      } catch (_) {}
      schoolDriveDbService.markSchoolDeleted(id);
      schoolDriveDbService.queueSync(actor());
    }
    return res;
  };

  const origLogout = ds.logout.bind(ds);
  ds.logout = () => {
    schoolDriveDbService.clearSession();
    origLogout();
  };
})();
