import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isSupabaseConfigured,
  upsertSupabaseUser,
  deleteSupabaseUser,
  deleteSupabaseUserData,
  saveSupabaseUserData,
  insertSupabaseAuditLog,
  saveSupabaseSystemSettings
} from './supabase';
// 🧪 LOCAL SUPABASE SIMULATOR: Ghi song song dữ liệu khi chạy localhost:3000
import { syncToLocalSupabaseSim } from './localSupabaseSim';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDataDir(): string {
  if (process.env.LHHP_DATA_DIR && fs.existsSync(process.env.LHHP_DATA_DIR)) {
    return process.env.LHHP_DATA_DIR;
  }
  const candidates = [
    path.resolve(process.cwd(), 'data'),
    path.resolve(__dirname, 'data'),
    path.resolve(__dirname, '../data')
  ];
  if (typeof process !== 'undefined' && (process as any).resourcesPath) {
    candidates.push(path.join((process as any).resourcesPath, 'app.asar.unpacked', 'data'));
    candidates.push(path.join((process as any).resourcesPath, 'data'));
  }
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  const defaultDir = path.resolve(process.cwd(), 'data');
  try {
    if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });
  } catch (_) {}
  return defaultDir;
}

export const DATA_DIR = resolveDataDir();
export const DB_FILE = path.join(DATA_DIR, 'classroom_database.json');

// Cloud hosts (Railway volume...): when LHHP_DATA_DIR points to an empty persistent
// volume, seed it once from the repository copy so the first boot is not empty.
(function seedPersistentDataDirOnce() {
  try {
    if (fs.existsSync(DB_FILE)) return;
    const repoDbFile = path.resolve(process.cwd(), 'data', 'classroom_database.json');
    if (repoDbFile !== DB_FILE && fs.existsSync(repoDbFile)) {
      fs.copyFileSync(repoDbFile, DB_FILE);
      console.log(`[Database] Seeded ${DB_FILE} from repository data.`);
    }
  } catch (err: any) {
    console.warn('[Database] Seed data dir skipped:', err?.message);
  }
})();

// 📂 4 THƯ MỤC PHÂN CẤP QUẢN LÝ DATABASE RIÊNG BIỆT (Yêu cầu A)
export const DIR_CA_NHAN = path.resolve(DATA_DIR, 'database_ca_nhan');
export const DIR_NHA_TRUONG = path.resolve(DATA_DIR, 'database_nha_truong');
export const DIR_TRUONG_DEMO = path.resolve(DATA_DIR, 'database_truong_demo');
export const DIR_ADMIN = path.resolve(DATA_DIR, 'database_quan_tri_admin');

export interface UserAccountServer {
  id: string;
  username: string;
  password?: string;
  fullName: string;
  role: 'admin' | 'homeroom' | 'subject' | 'bgh' | 'school_admin' | 'guest_admin';
  isDemo?: boolean;
  isBgh?: boolean;
  isSchoolAdmin?: boolean;
  isGuestAdmin?: boolean;
  tenantType?: 'school' | 'guest'; // 'school': Tổ chức Nhà trường, 'guest': Giáo viên vãng lai
  schoolId?: string;
  maxStudentsAllowed?: number; // 10 cho tài khoản demo
  email?: string;
  phone?: string;
  avatar?: string;
  assignedClassName?: string;
  subjectName?: string;
  schoolName?: string;
  createdAt: number;
  lastLoginAt?: number;
  status?: 'active' | 'locked';
}

export interface SchoolEntity {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  adminUsername?: string;
  adminFullName?: string;
  createdAt?: number;
}

export interface AuditLogItem {
  id: string;
  timestamp: number;
  username: string;
  userFullName: string;
  role: 'admin' | 'homeroom' | 'subject' | 'bgh' | 'school_admin' | 'guest_admin';
  actionType: 'CREATE_CLASS' | 'UPDATE_CLASS' | 'DELETE_CLASS' | 'ADD_STUDENT' | 'UPDATE_STUDENT' | 'DELETE_STUDENT' | 'AWARD_POINTS' | 'ATTENDANCE' | 'RESTORE_DATA' | 'UPDATE_TIMETABLE' | 'BATCH_STUDENTS' | 'ACCOUNT_CREATE' | 'OTHER';
  description: string;
  details?: any;
}

export interface DatabaseSchema {
  version: string;
  appName: string;
  lastSync: string;
  users: UserAccountServer[];
  schools?: SchoolEntity[];
  userData: Record<string, any>;
  auditLogs: AuditLogItem[];
  registrations?: any[];
  systemSettings: {
    allowRegistration: boolean;
    autoSyncIntervalMs: number;
    githubRepoName?: string;
    githubRepoUrl?: string;
    githubToken?: string;
    githubBranch?: string;
    autoPushGithub?: boolean;
    autoPullGithub?: boolean;
    lastGithubPushAt?: number;
    lastGithubPullAt?: number;
    lastGithubStatus?: string;
    // Shared Google Drive bridge config per school (key: normalized school name, '*' = all)
    driveSharedConfigs?: Record<string, {
      scriptUrl: string;
      folderId?: string;
      folderUrl?: string;
      updatedAt: number;
      updatedBy?: string;
    }>;
  };
}

export const DEFAULT_SCHOOLS: SchoolEntity[] = [];

// Default Seed Accounts
export const DEFAULT_USERS: UserAccountServer[] = [
  // ==========================================
  // QUẢN TRỊ TỐI CAO DUY NHẤT HỆ THỐNG
  // ==========================================
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

let dbMemoryCache: DatabaseSchema | null = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadDatabase(forceReload = false): DatabaseSchema {
  if (dbMemoryCache && !forceReload) return dbMemoryCache;

  ensureDataDir();

  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(content) as DatabaseSchema;
      if (parsed && Array.isArray(parsed.users)) {
        if (!Array.isArray(parsed.auditLogs)) {
          parsed.auditLogs = [];
        }
        if (!Array.isArray(parsed.registrations)) {
          parsed.registrations = [];
        }
        let userListChanged = false;

        const REMOVED_SCHOOL_IDS = new Set<string>([]);
        const REMOVED_SCHOOL_CODES = new Set<string>([]);
        // (Đã bỏ danh sách tài khoản thử nghiệm cũ — dữ liệu khởi đầu chỉ có adminquantri)
        const REMOVED_USERNAMES = new Set<string>([]);

        // 1. Purge trường học cũ
        if (Array.isArray(parsed.schools)) {
          const initCount = parsed.schools.length;
          parsed.schools = parsed.schools.filter(s => {
            // Only drop the exact legacy demo records by ID (never by code/name: real schools may match)
            if (REMOVED_SCHOOL_IDS.has(s.id)) return false;
            return true;
          });
          if (parsed.schools.length !== initCount) {
            userListChanged = true;
          }
        }

        // 2. Purge tài khoản cũ
        if (Array.isArray(parsed.users)) {
          const initCount = parsed.users.length;
          parsed.users = parsed.users.filter(u => !REMOVED_USERNAMES.has(u.username.toLowerCase()));
          if (parsed.users.length !== initCount) {
            userListChanged = true;
          }
        }

        // 3. Purge userData cũ
        if (parsed.userData) {
          for (const uName of REMOVED_USERNAMES) {
            if (parsed.userData[uName]) {
              delete parsed.userData[uName];
              userListChanged = true;
            }
          }
        }

        // 4. Purge auditLogs cũ của các tài khoản đã bị loại bỏ
        if (Array.isArray(parsed.auditLogs)) {
          const initCount = parsed.auditLogs.length;
          parsed.auditLogs = parsed.auditLogs.filter(l => !REMOVED_USERNAMES.has((l.username || '').toLowerCase()));
          if (parsed.auditLogs.length !== initCount) {
            userListChanged = true;
          }
        }

        // 5. Purge mọi dấu vết cũ trong students và classes của các user còn lại
        if (parsed.userData) {
          // Làm sạch classes & students của admin và adminquantri để đảm bảo 0 lớp, 0 học sinh khi khởi tạo lại
          if (parsed.userData['admin']) {
            parsed.userData['admin'].classes = [];
            parsed.userData['admin'].students = [];
          }
          if (parsed.userData['adminquantri']) {
            parsed.userData['adminquantri'].classes = [];
            parsed.userData['adminquantri'].students = [];
          }

          for (const uData of Object.values(parsed.userData)) {
            if (uData && Array.isArray((uData as any).students)) {
              (uData as any).students = (uData as any).students.filter(
                (s: any) => !s.teacherUsername || !REMOVED_USERNAMES.has(s.teacherUsername.toLowerCase())
              );
            }
            if (uData && Array.isArray((uData as any).classes)) {
              (uData as any).classes = (uData as any).classes.filter(
                (c: any) => !c.teacherUsername || !REMOVED_USERNAMES.has(c.teacherUsername.toLowerCase())
              );
            }
          }
        }

        if (!Array.isArray(parsed.schools) || parsed.schools.length === 0) {
          parsed.schools = [...DEFAULT_SCHOOLS];
          userListChanged = true;
        } else {
          // Bảo toàn và bổ sung các trường học chuẩn nếu chưa có
          for (const defSchool of DEFAULT_SCHOOLS) {
            const hasSchool = parsed.schools.some(
              s => s.id === defSchool.id || s.name.trim().toLowerCase() === defSchool.name.trim().toLowerCase()
            );
            if (!hasSchool) {
              parsed.schools.push({ ...defSchool });
              userListChanged = true;
            }
          }
        }

        // Ensure default accounts always exist and have expected defaults
        for (const defaultUser of DEFAULT_USERS) {
          const found = parsed.users.find(u => u.username.toLowerCase() === defaultUser.username.toLowerCase());
          if (!found) {
            parsed.users.push({ ...defaultUser });
            userListChanged = true;
          } else {
            // Cập nhật mật khẩu chuẩn theo yêu cầu nếu có thay đổi
            if (defaultUser.password && found.password !== defaultUser.password) {
              found.password = defaultUser.password;
              userListChanged = true;
            }
            if (defaultUser.isDemo !== undefined && found.isDemo !== defaultUser.isDemo) {
              found.isDemo = defaultUser.isDemo;
              found.maxStudentsAllowed = defaultUser.maxStudentsAllowed;
              userListChanged = true;
            }
            if (defaultUser.isBgh !== undefined && found.isBgh !== defaultUser.isBgh) {
              found.isBgh = defaultUser.isBgh;
              found.role = 'bgh';
              userListChanged = true;
            }
            if (defaultUser.isSchoolAdmin !== undefined && found.isSchoolAdmin !== defaultUser.isSchoolAdmin) {
              found.isSchoolAdmin = defaultUser.isSchoolAdmin;
              found.role = defaultUser.role;
              userListChanged = true;
            }
            if (defaultUser.isGuestAdmin !== undefined && found.isGuestAdmin !== defaultUser.isGuestAdmin) {
              found.isGuestAdmin = defaultUser.isGuestAdmin;
              found.role = defaultUser.role;
              userListChanged = true;
            }
            if (!found.tenantType) {
              found.tenantType = defaultUser.tenantType || 'school';
              userListChanged = true;
            }
            if (defaultUser.schoolName && !found.schoolName) {
              found.schoolName = defaultUser.schoolName;
              userListChanged = true;
            }
            if (defaultUser.assignedClassName && !found.assignedClassName) {
              found.assignedClassName = defaultUser.assignedClassName;
              userListChanged = true;
            }
            if (defaultUser.subjectName && !found.subjectName) {
              found.subjectName = defaultUser.subjectName;
              userListChanged = true;
            }
          }
        }
        const seeded = seedDefaultUserData(parsed);
        if (userListChanged || seeded) {
          saveDatabase(parsed);
        } else {
          // Luôn đồng bộ 4 thư mục phân cấp
          syncPartitionDirectories(parsed);
        }
        dbMemoryCache = parsed;
        return parsed;
      }
    } catch (err) {
      console.error('Lỗi khi đọc file classroom_database.json, khởi tạo database mới:', err);
    }
  }

  // Initialize fresh database
  const initialDb: DatabaseSchema = {
    version: '2.0.0',
    appName: 'LỚP HỌC HẠNH PHÚC - CƠ SỞ DỮ LIỆU ĐỒNG BỘ GITHUB',
    lastSync: new Date().toISOString(),
    users: [...DEFAULT_USERS],
    schools: [...DEFAULT_SCHOOLS],
    userData: {},
    auditLogs: [],
    systemSettings: {
      allowRegistration: true,
      autoSyncIntervalMs: 15000,
      githubRepoName: 'lop-hoc-hanh-phuc-database'
    }
  };

  seedDefaultUserData(initialDb);
  saveDatabase(initialDb);
  dbMemoryCache = initialDb;
  return initialDb;
}

// Seed default initial data - Đã tắt hoàn toàn việc tự sinh lớp học & học sinh để đảm bảo CSDL sạch sẽ 100%
function seedDefaultUserData(db: DatabaseSchema): boolean {
  let changed = false;
  if (!db.userData) {
    db.userData = {};
    changed = true;
  }

  // Đảm bảo không tự sinh lớp học hoặc học sinh giả lập cho bất kỳ tài khoản nào
  // Dữ liệu chỉ được tạo khi người dùng/giáo viên thực sự tạo trên giao diện
  for (const user of db.users) {
    const uData = db.userData[user.username.toLowerCase()];
    if (uData && Array.isArray(uData.classes)) {
      uData.classes = uData.classes.map((cls: any) => ({
        ...cls,
        teacherUsername: cls.teacherUsername || user.username,
        teacherRole: cls.teacherRole || user.role,
        teacherName: cls.teacherName || user.fullName
      }));
    }
  }

  return changed;
}

/**
 * 📂 [YÊU CẦU A] ĐỒNG BỘ PHÂN CẤP 4 THƯ MỤC DATABASE RIÊNG BIỆT:
 * 1. DIR_CA_NHAN: Vai trò Tài khoản cá nhân (personal_teacher, guest_admin)
 * 2. DIR_NHA_TRUONG: Vai trò Nhà Trường (school_teacher, school_admin, bgh)
 * 3. DIR_TRUONG_DEMO: Vai trò Nhà Trường DEMO (school_teacherdemo, school_admindemo, bghdemo)
 * 4. DIR_ADMIN: Vai trò Quản trị Cao Nhất (admin, adminquantri)
 */
export function syncPartitionDirectories(data: DatabaseSchema): void {
  try {
    const partitions = [DIR_CA_NHAN, DIR_NHA_TRUONG, DIR_ADMIN];
    for (const dir of partitions) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    const allUsers = data.users || [];
    const allUserData = data.userData || {};
    const allSchools = data.schools || [];

    // Helper kiểm tra Demo
    const isDemoUser = (u: UserAccountServer) => {
      if (u.isDemo) return true;
      if (u.role === 'admin' || u.role === 'guest_admin') return false;
      const sName = (u.schoolName || '').toUpperCase();
      return sName.includes('DEMO') || sName.includes('THỰC NGHIỆM') || u.username.toLowerCase().includes('demo');
    };

    // 1. Phân vùng Cá Nhân (database_ca_nhan)
    const usersCaNhan = allUsers.filter(u => u.tenantType === 'guest' || u.role === 'guest_admin');
    const userDataCaNhan: Record<string, any> = {};
    for (const u of usersCaNhan) {
      const key = u.username.toLowerCase();
      if (allUserData[key]) userDataCaNhan[key] = allUserData[key];
    }
    const dbCaNhan = {
      partition: 'ca_nhan',
      title: 'Cơ Sở Dữ Liệu Giáo Viên Cá Nhân & Quản Trị Cá Nhân',
      lastSync: data.lastSync,
      users: usersCaNhan,
      userData: userDataCaNhan
    };
    fs.writeFileSync(path.join(DIR_CA_NHAN, 'database.json'), JSON.stringify(dbCaNhan, null, 2), 'utf-8');
    fs.writeFileSync(path.join(DIR_CA_NHAN, 'users.json'), JSON.stringify(usersCaNhan, null, 2), 'utf-8');
    if (!fs.existsSync(path.join(DIR_CA_NHAN, 'README.md'))) {
      fs.writeFileSync(path.join(DIR_CA_NHAN, 'README.md'), `# Thư mục Database: Vai Trò Tài Khoản Cá Nhân (database_ca_nhan)
- Quản trị: Vai trò Quản trị Tài khoản Cá Nhân (guest_admin)
- Người dùng: Giáo viên tự do, tỉnh lẻ (personal_teacher, tenantType: 'guest')
- Dữ liệu lưu trữ: Danh sách tài khoản đăng nhập, mật khẩu và dữ liệu lớp học của giáo viên vãng lai/cá nhân.
`, 'utf-8');
    }

    // Demo school partition (database_truong_demo) has been retired: no longer written.

    // 3. Phân vùng Nhà Trường Chính Thức (database_nha_truong)
    const usersNhaTruong = allUsers.filter(u => 
      u.tenantType === 'school' && 
      !isDemoUser(u) && 
      u.role !== 'admin'
    );
    const userDataNhaTruong: Record<string, any> = {};
    for (const u of usersNhaTruong) {
      const key = u.username.toLowerCase();
      if (allUserData[key]) userDataNhaTruong[key] = allUserData[key];
    }
    const schoolsNhaTruong = allSchools.filter(s => !s.name.toUpperCase().includes('DEMO'));
    const dbNhaTruong = {
      partition: 'nha_truong',
      title: 'Cơ Sở Dữ Liệu Tổ Chức Nhà Trường (Các trường học)',
      lastSync: data.lastSync,
      schools: schoolsNhaTruong,
      users: usersNhaTruong,
      userData: userDataNhaTruong
    };
    fs.writeFileSync(path.join(DIR_NHA_TRUONG, 'database.json'), JSON.stringify(dbNhaTruong, null, 2), 'utf-8');
    fs.writeFileSync(path.join(DIR_NHA_TRUONG, 'users.json'), JSON.stringify(usersNhaTruong, null, 2), 'utf-8');
    fs.writeFileSync(path.join(DIR_NHA_TRUONG, 'schools.json'), JSON.stringify(schoolsNhaTruong, null, 2), 'utf-8');
    fs.writeFileSync(path.join(DIR_NHA_TRUONG, 'README.md'), `# Thư mục Database: Vai Trò Nhà Trường (database_nha_truong)
- Quản trị Nhà Trường: (vai trò school_admin)
- Ban Giám Hiệu: (vai trò bgh)
- Giáo viên trường: (vai trò homeroom / subject)
- Dữ liệu lưu trữ: Tài khoản, mật khẩu, danh mục trường và dữ liệu lớp học chính thức.
`, 'utf-8');

    // 4. Phân vùng Quản Trị Cao Nhất (database_quan_tri_admin)
    const usersAdmin = allUsers.filter(u => u.role === 'admin');
    const dbAdmin = {
      partition: 'quan_tri_admin',
      title: 'Cơ Sở Dữ Liệu Quản Trị Tối Cao Hệ Thống',
      lastSync: data.lastSync,
      users: usersAdmin,
      systemSettings: data.systemSettings,
      auditLogs: (data.auditLogs || []).slice(-300),
      masterSummary: {
        totalUsers: allUsers.length,
        totalSchools: allSchools.length,
        totalClassesConfigured: Object.keys(allUserData).length
      }
    };
    fs.writeFileSync(path.join(DIR_ADMIN, 'database.json'), JSON.stringify(dbAdmin, null, 2), 'utf-8');
    fs.writeFileSync(path.join(DIR_ADMIN, 'users.json'), JSON.stringify(usersAdmin, null, 2), 'utf-8');
    fs.writeFileSync(path.join(DIR_ADMIN, 'system_settings.json'), JSON.stringify(data.systemSettings || {}, null, 2), 'utf-8');
    fs.writeFileSync(path.join(DIR_ADMIN, 'audit_logs.json'), JSON.stringify(data.auditLogs || [], null, 2), 'utf-8');
    if (!fs.existsSync(path.join(DIR_ADMIN, 'README.md'))) {
      fs.writeFileSync(path.join(DIR_ADMIN, 'README.md'), `# Thư mục Database: Quản Trị Tối Cao (database_quan_tri_admin)
- Quản trị tối cao: adminquantri / admin (role: admin)
- Quyền hạn: Quyền quản trị tối cao toàn bộ hệ thống, phân quyền, cấu hình đồng bộ, nhật ký hoạt động.
- Dữ liệu lưu trữ: Tài khoản quản trị, thiết lập hệ thống, nhật ký kiểm toán và tổng quan Master Data.
`, 'utf-8');
    }

  } catch (syncErr) {
    console.warn('[PartitionSync] Lỗi khi đồng bộ 4 thư mục phân cấp:', syncErr);
  }
}

export function saveDatabase(data: DatabaseSchema): boolean {
  ensureDataDir();
  data.lastSync = new Date().toISOString();
  dbMemoryCache = data;

  const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    fs.writeFileSync(tempFile, jsonStr, 'utf-8');
    fs.renameSync(tempFile, DB_FILE);

    // Tự động phân cấp lưu trữ vào 4 thư mục riêng biệt (Yêu cầu A)
    syncPartitionDirectories(data);

    // 🧪 LOCAL SUPABASE SIMULATOR: Ghi song song vào simulator khi chạy localhost
    // CHỈ HOẠT ĐỘNG KHI NODE_ENV=development. KHÔNG ảnh hưởng production.
    try {
      syncToLocalSupabaseSim({
        users: data.users,
        schools: data.schools,
        userData: data.userData,
        auditLogs: data.auditLogs,
        registrations: data.registrations
      });
    } catch (_simErr) {
      // Lỗi simulator không được làm ảnh hưởng luồng lưu chính
      console.warn('[LocalSupabaseSim] Lỗi sync không ảnh hưởng DB chính:', _simErr);
    }

    // Tự động sao lưu an toàn một bản dự phòng tại data/backups
    try {
      const backupDir = path.join(DATA_DIR, 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(path.join(backupDir, 'classroom_database_backup_latest.json'), jsonStr, 'utf-8');
    } catch (_) {}

    return true;
  } catch (err) {
    console.error('Lỗi khi ghi dữ liệu vào database:', err);
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch (_) {}
    return false;
  }
}

/**
 * 🛡️ HỆ THỐNG HỢP NHẤT DỮ LIỆU THÔNG MINH (NON-DESTRUCTIVE SMART MERGE)
 * Bảo toàn 100% dữ liệu: Không bao giờ xóa lớp học, học sinh, ảnh đại diện hay cấu hình cá nhân hóa.
 * Ngăn chặn tình trạng 1 lớp ở localhost ghi đè làm mất 30 lớp học và hàng nghìn học sinh trên GitHub!
 */
export function smartMergeDatabase(localDb: DatabaseSchema, remoteDb: DatabaseSchema): DatabaseSchema {
  if (!remoteDb || !Array.isArray(remoteDb.users)) {
    return localDb;
  }
  if (!localDb || !Array.isArray(localDb.users)) {
    return remoteDb;
  }

  const merged: DatabaseSchema = {
    version: remoteDb.version || localDb.version || '2.0.0',
    appName: remoteDb.appName || localDb.appName,
    lastSync: new Date().toISOString(),
    users: [],
    userData: {},
    auditLogs: [],
    systemSettings: {
      ...(remoteDb.systemSettings || {}),
      ...(localDb.systemSettings || {})
    }
  };

  // 1. Hợp nhất danh sách Tài khoản Người dùng (Users): Ưu tiên giữ lại 100% tài khoản thật từ Remote
  const userMap = new Map<string, UserAccountServer>();
  for (const u of (remoteDb.users || [])) {
    userMap.set(u.username.toLowerCase(), { ...u });
  }
  for (const u of (localDb.users || [])) {
    const key = u.username.toLowerCase();
    if (!userMap.has(key)) {
      userMap.set(key, { ...u });
    } else {
      const existing = userMap.get(key)!;
      userMap.set(key, {
        ...existing,
        // Giữ ảnh avatar & tên thật từ remote nếu local chỉ là tên mặc định
        fullName: existing.fullName || u.fullName,
        avatar: existing.avatar || u.avatar,
        schoolName: existing.schoolName || u.schoolName,
        lastLoginAt: Math.max(existing.lastLoginAt || 0, u.lastLoginAt || 0),
        status: u.status || existing.status || 'active'
      });
    }
  }
  merged.users = Array.from(userMap.values());

  // 2. Hợp nhất Dữ liệu Lớp học & Học sinh của từng Giáo viên (UserData): CỐT LÕI BẢO TOÀN
  merged.userData = {};
  // Nạp 100% dữ liệu giáo viên từ Remote (bao gồm toàn bộ 30 lớp và học sinh trên GitHub)
  for (const [uname, uData] of Object.entries(remoteDb.userData || {})) {
    merged.userData[uname.toLowerCase()] = JSON.parse(JSON.stringify(uData));
  }

  // Hợp nhất có chọn lọc với dữ liệu từ Local
  for (const [uname, localUData] of Object.entries(localDb.userData || {})) {
    const key = uname.toLowerCase();
    const remoteUData = merged.userData[key];

    if (!remoteUData) {
      // Giáo viên này chỉ có ở local -> thêm vào
      merged.userData[key] = JSON.parse(JSON.stringify(localUData));
    } else {
      // Giáo viên có ở cả remote và local -> Hợp nhất sâu (Deep Merge), tuyệt đối không đè mất lớp cũ
      const mergedClassesMap = new Map<string, any>();
      for (const c of (remoteUData.classes || [])) {
        mergedClassesMap.set(c.id, { ...c });
      }
      for (const c of (localUData.classes || [])) {
        if (mergedClassesMap.has(c.id)) {
          const ex = mergedClassesMap.get(c.id);
          mergedClassesMap.set(c.id, {
            ...ex,
            ...c,
            // Giữ lại ảnh đại diện lớp, slogan cá nhân hóa từ remote nếu có
            avatar: ex.avatar || c.avatar,
            slogan: ex.slogan || c.slogan,
            teacherName: ex.teacherName || c.teacherName
          });
        } else {
          mergedClassesMap.set(c.id, { ...c });
        }
      }

      // Hợp nhất học sinh: Giữ lại 100% học sinh từ remote
      const mergedStudentsMap = new Map<string, any>();
      for (const s of (remoteUData.students || [])) {
        mergedStudentsMap.set(s.id, { ...s });
      }
      for (const s of (localUData.students || [])) {
        if (mergedStudentsMap.has(s.id)) {
          const ex = mergedStudentsMap.get(s.id);
          mergedStudentsMap.set(s.id, {
            ...ex,
            ...s,
            // Giữ ảnh đại diện học sinh, điểm số cao nhất
            avatar: ex.avatar || s.avatar,
            points: Math.max(ex.points || 0, s.points || 0)
          });
        } else {
          mergedStudentsMap.set(s.id, { ...s });
        }
      }

      merged.userData[key] = {
        ...remoteUData,
        ...localUData,
        classes: Array.from(mergedClassesMap.values()),
        students: Array.from(mergedStudentsMap.values()),
        // Bảo toàn thông tin hồ sơ giáo viên (tên, avatar, trường)
        teacherProfile: {
          ...(remoteUData.teacherProfile || {}),
          ...(localUData.teacherProfile || {}),
          name: remoteUData.teacherProfile?.name || localUData.teacherProfile?.name,
          avatar: remoteUData.teacherProfile?.avatar || localUData.teacherProfile?.avatar
        },
        updatedAt: Math.max(Number(remoteUData.updatedAt) || 0, Number(localUData.updatedAt) || 0, Date.now())
      };
    }
  }

  // 3. Hợp nhất Nhật ký Audit Logs (giữ tối đa 500 bản ghi mới nhất)
  const logMap = new Map<string, any>();
  for (const log of (remoteDb.auditLogs || [])) {
    logMap.set(log.id, log);
  }
  for (const log of (localDb.auditLogs || [])) {
    logMap.set(log.id, log);
  }
  merged.auditLogs = Array.from(logMap.values())
    .filter(l => !REMOVED_USERNAMES.has(((l as any).username || '').toLowerCase()))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 500);

  // 4. Hợp nhất Danh mục Trường học (Schools) & Lọc sạch trường / tài khoản cũ
  const REMOVED_SCHOOL_IDS = new Set<string>([]);
  const REMOVED_SCHOOL_CODES = new Set<string>([]);
  const REMOVED_USERNAMES = new Set<string>([]);

  const schoolMap = new Map<string, any>();
  for (const s of (remoteDb.schools || [])) {
    if (s && s.id && !REMOVED_SCHOOL_IDS.has(s.id)) {
      schoolMap.set(s.id, s);
    }
  }
  for (const s of (localDb.schools || [])) {
    if (s && s.id && !REMOVED_SCHOOL_IDS.has(s.id)) {
      if (!schoolMap.has(s.id)) {
        schoolMap.set(s.id, s);
      }
    }
  }
  merged.schools = Array.from(schoolMap.values());
  if (merged.schools.length === 0) {
    merged.schools = [...DEFAULT_SCHOOLS];
  }

  // Lọc sạch users và userData khỏi danh sách cũ
  merged.users = merged.users.filter(u => !REMOVED_USERNAMES.has(u.username.toLowerCase()));
  for (const u of REMOVED_USERNAMES) {
    if (merged.userData[u]) {
      delete merged.userData[u];
    }
  }

  return merged;
}

// User Operations
export function getAllUsers(): UserAccountServer[] {
  const db = loadDatabase();
  return db.users;
}

export function findUserByUsername(username: string): UserAccountServer | null {
  const db = loadDatabase();
  const normalized = username.trim().toLowerCase();
  return db.users.find(u => u.username.toLowerCase() === normalized) || null;
}

export function findUserById(id: string): UserAccountServer | null {
  const db = loadDatabase();
  return db.users.find(u => u.id === id) || null;
}

export function createUser(payload: {
  username: string;
  password?: string;
  fullName: string;
  role: 'admin' | 'homeroom' | 'subject' | 'bgh' | 'school_admin' | 'guest_admin';
  email?: string;
  phone?: string;
  assignedClassName?: string;
  subjectName?: string;
  schoolName?: string;
  tenantType?: 'school' | 'guest';
}): { success: boolean; user?: UserAccountServer; message?: string } {
  const db = loadDatabase();
  const cleanUsername = payload.username.trim().toLowerCase();

  if (!cleanUsername || cleanUsername.length < 3) {
    return { success: false, message: 'Tên đăng nhập phải có ít nhất 3 ký tự.' };
  }

  if (db.users.some(u => u.username.toLowerCase() === cleanUsername)) {
    return { success: false, message: `Tên đăng nhập "${cleanUsername}" đã tồn tại trên hệ thống.` };
  }

  // Demo school retired: new accounts are never auto-flagged as demo.
  const isDemo = false;

  const newUser: UserAccountServer = {
    id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    username: cleanUsername,
    password: payload.password || '123456',
    fullName: payload.fullName.trim() || cleanUsername,
    role: payload.role,
    isSchoolAdmin: payload.role === 'school_admin' || undefined,
    isBgh: payload.role === 'bgh' || payload.role === 'school_admin' || undefined,
    isGuestAdmin: payload.role === 'guest_admin' || undefined,
    tenantType: payload.tenantType || (payload.role === 'guest_admin' ? 'guest' : 'school'),
    isDemo: isDemo || undefined,
    maxStudentsAllowed: isDemo ? 10 : undefined,
    email: payload.email || '',
    phone: payload.phone || '',
    assignedClassName: payload.assignedClassName || (payload.role === 'homeroom' ? 'Lớp mới' : undefined),
    subjectName: payload.subjectName || (payload.role === 'subject' ? 'Tin học' : undefined),
    schoolName: payload.schoolName || 'Trường học',
    avatar: payload.role === 'homeroom'
      ? `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}&backgroundColor=ffd5dc`
      : payload.role === 'subject'
      ? `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}&backgroundColor=b6e3f4`
      : (payload.role === 'school_admin' || payload.role === 'bgh')
      ? `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}&backgroundColor=bbf7d0`
      : `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}&backgroundColor=d1d4f9`,
    createdAt: Date.now(),
    status: 'active'
  };

  db.users.push(newUser);
  saveDatabase(db);

  if (isSupabaseConfigured()) {
    upsertSupabaseUser(newUser).catch(err => {
      console.warn('[Supabase Dual-Write] Lỗi lưu user mới:', err);
    });
  }

  return { success: true, user: newUser };
}

export function createUsersBulk(items: Array<{
  username: string;
  password?: string;
  fullName: string;
  role: 'admin' | 'homeroom' | 'subject';
  email?: string;
  phone?: string;
  assignedClassName?: string;
  subjectName?: string;
  schoolName?: string;
}>): { success: boolean; count: number; created: UserAccountServer[]; errors: string[]; message: string } {
  const db = loadDatabase();
  const created: UserAccountServer[] = [];
  const errors: string[] = [];

  const existingUsernames = new Set(db.users.map(u => u.username.toLowerCase()));

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const cleanUsername = (item.username || '').trim().toLowerCase();

    if (!cleanUsername || cleanUsername.length < 3) {
      errors.push(`Dòng ${i + 1}: Tên đăng nhập "${item.username || ''}" không hợp lệ (phải có ít nhất 3 ký tự).`);
      continue;
    }

    if (existingUsernames.has(cleanUsername)) {
      errors.push(`Dòng ${i + 1}: Tên đăng nhập "${cleanUsername}" đã tồn tại trên hệ thống.`);
      continue;
    }

    // Demo school retired: new accounts are never auto-flagged as demo.
    const isDemo = false;

    const newUser: UserAccountServer = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 5)}-${i}`,
      username: cleanUsername,
      password: item.password || '123456',
      fullName: (item.fullName || cleanUsername).trim(),
      role: item.role === 'subject' ? 'subject' : item.role === 'admin' ? 'admin' : 'homeroom',
      isDemo: isDemo || undefined,
      maxStudentsAllowed: isDemo ? 10 : undefined,
      email: item.email?.trim() || '',
      phone: item.phone?.trim() || '',
      assignedClassName: item.assignedClassName?.trim() || (item.role === 'homeroom' ? 'Lớp mới' : undefined),
      subjectName: item.subjectName?.trim() || (item.role === 'subject' ? 'Tin học' : undefined),
      schoolName: item.schoolName?.trim() || 'Trường học',
      tenantType: (item as any).tenantType || (isDemo ? 'demo' : 'school'),
      avatar: item.role === 'homeroom'
        ? `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}&backgroundColor=ffd5dc`
        : item.role === 'subject'
        ? `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}&backgroundColor=b6e3f4`
        : `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}&backgroundColor=d1d4f9`,
      createdAt: Date.now(),
      status: 'active'
    };

    existingUsernames.add(cleanUsername);
    db.users.push(newUser);
    created.push(newUser);
  }

  if (created.length > 0) {
    saveDatabase(db);
    if (isSupabaseConfigured()) {
      for (const u of created) {
        upsertSupabaseUser(u).catch(() => {});
      }
    }
  }

  return {
    success: created.length > 0,
    count: created.length,
    created,
    errors,
    message: created.length > 0
      ? `Đã tạo thành công ${created.length} tài khoản giáo viên mới.`
      : 'Không có tài khoản nào được tạo.'
  };
}

export function updateUser(id: string, updates: Partial<UserAccountServer>): { success: boolean; user?: UserAccountServer; message?: string } {
  const db = loadDatabase();
  const cleanKey = (id || '').trim().toLowerCase();
  const strippedKey = cleanKey.replace(/^user-/, '');
  const index = db.users.findIndex(u => 
    u.id.toLowerCase() === cleanKey || 
    u.username.toLowerCase() === cleanKey ||
    u.username.toLowerCase() === strippedKey ||
    ('user-' + u.username.toLowerCase()) === cleanKey
  );

  if (index === -1) {
    return { success: false, message: 'Không tìm thấy tài khoản người dùng.' };
  }

  const current = db.users[index];

  // Prevent changing username of default admin if necessary
  if (current.username === 'admin' && updates.username && updates.username !== 'admin') {
    return { success: false, message: 'Không được đổi tên đăng nhập tài khoản quản trị mặc định (admin).' };
  }

  // Check if new username is already taken by another account
  if (updates.username && updates.username.trim().toLowerCase() !== current.username.trim().toLowerCase()) {
    const newUsernameClean = updates.username.trim().toLowerCase();
    const existing = db.users.find(u => u.username.toLowerCase() === newUsernameClean && u.id !== current.id);
    if (existing) {
      return { success: false, message: `Tên đăng nhập "${updates.username}" đã tồn tại trên hệ thống. Vui lòng chọn tên khác.` };
    }
  }

  const oldCleanUsername = current.username.trim().toLowerCase();
  const updatedUser: UserAccountServer = {
    ...current,
    ...updates,
    username: updates.username ? updates.username.trim().toLowerCase() : current.username,
    id: current.id, // preserve ID
  };

  if (updates.role) {
    updatedUser.role = updates.role;
    updatedUser.isSchoolAdmin = updates.role === 'school_admin' || Boolean(updates.isSchoolAdmin);
    updatedUser.isBgh = updates.role === 'bgh' || updates.role === 'school_admin' || Boolean(updates.isBgh);
    updatedUser.isGuestAdmin = updates.role === 'guest_admin' || Boolean(updates.isGuestAdmin);
    if (updates.role === 'school_admin' || updates.role === 'bgh' || updates.role === 'homeroom' || updates.role === 'subject') {
      updatedUser.tenantType = 'school';
    } else if (updates.role === 'guest_admin') {
      updatedUser.tenantType = 'guest';
    }
  }

  const newCleanUsername = updatedUser.username.trim().toLowerCase();

  db.users[index] = updatedUser;

  // Di chuyển dữ liệu lớp học nếu username thay đổi
  if (oldCleanUsername !== newCleanUsername && db.userData[oldCleanUsername]) {
    db.userData[newCleanUsername] = db.userData[oldCleanUsername];
    delete db.userData[oldCleanUsername];
  }

  // Đồng bộ thông tin schoolName vào userData của giáo viên nếu có thay đổi
  if (updates.schoolName && db.userData[newCleanUsername]) {
    if (!db.userData[newCleanUsername].teacherProfile) {
      db.userData[newCleanUsername].teacherProfile = {};
    }
    db.userData[newCleanUsername].teacherProfile.schoolName = updates.schoolName;
    if (db.userData[newCleanUsername].settings) {
      db.userData[newCleanUsername].settings.schoolName = updates.schoolName;
    }
    db.userData[newCleanUsername].updatedAt = Date.now();
  }

  saveDatabase(db);

  if (isSupabaseConfigured()) {
    upsertSupabaseUser(updatedUser).catch(err => {
      console.warn('[Supabase Dual-Write] Lỗi cập nhật user:', err);
    });
  }

  return { success: true, user: updatedUser };
}

/**
 * 🏢 DI CHUYỂN TOÀN BỘ DATABASE GIÁO VIÊN VÃNG LAI VÀO NHÀ TRƯỜNG ĐƯỢC CHỈ ĐỊNH
 * - Bảo toàn 100% tài khoản, mật khẩu, thông tin cá nhân.
 * - Bảo toàn 100% lớp học, danh sách học sinh, điểm số thi đua và chuyên cần.
 * - Cập nhật tenantType = 'school', schoolName = targetSchoolName.
 * - Tự động di chuyển dữ liệu phân vùng từ database_ca_nhan sang database_nha_truong.
 * - Nhà trường được gán có toàn quyền xem lớp, xem học sinh, cấp lại mật khẩu cho cô giáo.
 */
export function transferUserToSchool(usernameOrId: string, targetSchoolName: string): {
  success: boolean;
  user?: UserAccountServer;
  message?: string;
  transferredData?: {
    classesCount: number;
    studentsCount: number;
    oldSchool: string;
    newSchool: string;
  };
} {
  const db = loadDatabase();
  const searchKey = usernameOrId.trim().toLowerCase();
  const index = db.users.findIndex(u => u.id === usernameOrId || u.username.toLowerCase() === searchKey);

  if (index === -1) {
    return { success: false, message: `Không tìm thấy tài khoản người dùng "${usernameOrId}".` };
  }

  const current = db.users[index];

  if (current.username.toLowerCase() === 'admin' || current.role === 'admin') {
    return { success: false, message: 'Không thể di chuyển tài khoản Quản trị viên tối cao (admin) vào nhà trường.' };
  }

  const oldSchool = current.schoolName || 'Giáo viên cá nhân vãng lai';
  const cleanUsername = current.username.trim().toLowerCase();
  
  // 1. Cập nhật thông tin tài khoản user
  const updatedUser: UserAccountServer = {
    ...current,
    tenantType: 'school',
    schoolName: targetSchoolName,
    isGuestAdmin: false
  };
  db.users[index] = updatedUser;

  // 2. Bảo toàn và cập nhật dữ liệu lớp học, học sinh, điểm số của giáo viên
  let classesCount = 0;
  let studentsCount = 0;

  if (db.userData[cleanUsername]) {
    const uData = db.userData[cleanUsername];
    if (!uData.teacherProfile) {
      uData.teacherProfile = {};
    }
    uData.teacherProfile.schoolName = targetSchoolName;
    if (uData.settings) {
      uData.settings.schoolName = targetSchoolName;
    }
    // Đếm số lượng lớp và học sinh để phản hồi xác nhận
    if (Array.isArray(uData.classes)) {
      classesCount = uData.classes.length;
      uData.classes = uData.classes.map((cls: any) => ({
        ...cls,
        schoolName: targetSchoolName
      }));
    }
    if (Array.isArray(uData.students)) {
      studentsCount = uData.students.length;
    }
    uData.updatedAt = Date.now();
  }

  // 3. Ghi log kiểm toán (Audit Log)
  addAuditLog({
    username: 'admin',
    userFullName: 'Quản trị viên Hệ thống Cấp cao',
    role: 'admin',
    actionType: 'UPDATE_CLASS',
    description: `Di chuyển CSDL giáo viên "${current.fullName}" (@${current.username}) từ [${oldSchool}] sang [${targetSchoolName}] (Bảo toàn ${classesCount} lớp, ${studentsCount} học sinh).`,
    details: {
      targetUsername: current.username,
      targetSchoolName,
      classesCount,
      studentsCount
    }
  });

  // 4. Lưu CSDL toàn cục và tự động kích hoạt syncPartitionDirectories()
  saveDatabase(db);

  // 5. Dual-write lên Supabase nếu có cấu hình
  if (isSupabaseConfigured()) {
    upsertSupabaseUser(updatedUser).catch(err => {
      console.warn('[Supabase Dual-Write] Lỗi cập nhật user khi chuyển trường:', err);
    });
    if (db.userData[cleanUsername]) {
      saveSupabaseUserData(cleanUsername, db.userData[cleanUsername]).catch(err => {
        console.warn(`[Supabase Dual-Write] Lỗi đồng bộ ngầm userData ${cleanUsername}:`, err);
      });
    }
  }

  return {
    success: true,
    user: updatedUser,
    message: `Đã di chuyển thành công giáo viên "${current.fullName}" vào trường "${targetSchoolName}". Toàn bộ tài khoản, mật khẩu, ${classesCount} lớp học và ${studentsCount} học sinh được bảo toàn nguyên vẹn 100%.`,
    transferredData: {
      classesCount,
      studentsCount,
      oldSchool,
      newSchool: targetSchoolName
    }
  };
}

export function deleteUser(id: string): { success: boolean; message?: string } {
  const db = loadDatabase();
  const cleanKey = (id || '').trim().toLowerCase();
  const strippedKey = cleanKey.replace(/^user-/, '');
  const target = db.users.find(u => 
    u.id.toLowerCase() === cleanKey || 
    u.username.toLowerCase() === cleanKey ||
    u.username.toLowerCase() === strippedKey ||
    ('user-' + u.username.toLowerCase()) === cleanKey
  );

  if (!target) {
    return { success: false, message: 'Không tìm thấy tài khoản để xóa.' };
  }

  if (target.username.toLowerCase() === 'admin') {
    return { success: false, message: 'Không thể xóa tài khoản Quản trị viên tối cao (admin).' };
  }

  db.users = db.users.filter(u => u.id !== id);
  // Also optionally keep or cleanup user data
  saveDatabase(db);

  if (isSupabaseConfigured()) {
    deleteSupabaseUser(id).catch(err => {
      console.warn('[Supabase Dual-Write] Lỗi xóa user:', err);
    });
  }

  return { success: true };
}

export function resetPassword(id: string, newPassword = '123456'): { success: boolean; message?: string } {
  const db = loadDatabase();
  const user = db.users.find(u => u.id === id);

  if (!user) {
    return { success: false, message: 'Không tìm thấy tài khoản để đặt lại mật khẩu.' };
  }

  user.password = newPassword;
  saveDatabase(db);

  if (isSupabaseConfigured()) {
    upsertSupabaseUser(user).catch(err => {
      console.warn('[Supabase Dual-Write] Lỗi cập nhật mật khẩu user:', err);
    });
  }

  return { success: true, message: `Đã đặt lại mật khẩu cho tài khoản "${user.username}" thành: ${newPassword}` };
}

// User Independent Classroom Data
export function getUserData(username: string): any {
  const db = loadDatabase();
  const normalized = username.trim().toLowerCase();
  let data = db.userData[normalized] || null;

  // 1. Kiểm tra alias nếu dữ liệu rỗng (ví dụ gvcn1a1 <-> gvcn_1a1)
  const alias = normalized.startsWith('gvcn_')
    ? normalized.replace('gvcn_', 'gvcn')
    : (normalized.startsWith('gvcn') ? normalized.replace('gvcn', 'gvcn_') : '');

  if ((!data || !Array.isArray(data.classes) || data.classes.length === 0) && alias) {
    const aliasData = db.userData[alias];
    if (aliasData && Array.isArray(aliasData.classes) && aliasData.classes.length > 0) {
      data = aliasData;
      // Tự động khôi phục dữ liệu cho normalized
      db.userData[normalized] = JSON.parse(JSON.stringify(aliasData));
      saveDatabase(db);
    }
  }

  // 2. Self-Healing thông minh: Nếu tài khoản giáo viên chủ nhiệm vẫn thiếu lớp hoặc học sinh,
  // tự động tìm kiếm và khôi phục từ CSDL Quản trị nhà trường
  if (!data || !Array.isArray(data.classes) || data.classes.length === 0 || !Array.isArray(data.students) || data.students.length === 0) {
    const userObj = db.users.find(u => u.username.toLowerCase() === normalized || (alias && u.username.toLowerCase() === alias));
    if (userObj && (userObj.role === 'homeroom' || !userObj.role)) {
      const assigned = (userObj.assignedClassName || '').toLowerCase();
      // Duyệt qua tất cả userData để tìm lớp học tương ứng
      for (const owner of Object.keys(db.userData)) {
        const oClasses = db.userData[owner]?.classes;
        if (Array.isArray(oClasses)) {
          const matchedClass = oClasses.find((c: any) =>
            c && (
              c.teacherUsername?.toLowerCase() === normalized ||
              (alias && c.teacherUsername?.toLowerCase() === alias) ||
              (assigned && c.name?.toLowerCase().includes(assigned)) ||
              (userObj.fullName && c.teacherName?.toLowerCase().includes(userObj.fullName.toLowerCase()))
            )
          );

          if (matchedClass) {
            const oStudents = db.userData[owner]?.students || [];
            const matchedStudents = oStudents.filter((s: any) => s && s.classId === matchedClass.id);
            if (matchedStudents.length > 0) {
              const healedData = {
                classes: [{
                  ...matchedClass,
                  teacherUsername: normalized,
                  teacherName: userObj.fullName || matchedClass.teacherName
                }],
                activeClassId: matchedClass.id,
                students: matchedStudents.map((s: any) => ({ ...s, classId: matchedClass.id })),
                attendanceRecords: db.userData[owner]?.attendanceRecords?.filter((r: any) => r.classId === matchedClass.id) || [],
                boardingRecords: db.userData[owner]?.boardingRecords?.filter((r: any) => r.classId === matchedClass.id) || [],
                transactions: db.userData[owner]?.transactions || [],
                updatedAt: Date.now()
              };

              db.userData[normalized] = healedData;
              if (alias) {
                db.userData[alias] = JSON.parse(JSON.stringify(healedData));
              }
              saveDatabase(db);
              data = healedData;
              break;
            }
          }
        }
      }
    }
  }

  return data;
}

export function saveUserData(username: string, data: any): boolean {
  const db = loadDatabase();
  const normalized = username.trim().toLowerCase();
  
  // 🛡️ BẢO TOÀN DỮ LIỆU TUYỆT ĐỐI (Zero Data Loss Protocol) cho tài khoản Quản trị & BGH:
  // Nếu là tài khoản Quản trị (admin, school_admin, bgh):
  // Không cho phép ghi đè phá hủy làm trống classes, students, attendanceRecords hoặc boardingRecords
  const userObj = db.users.find(u => u.username.toLowerCase() === normalized);
  const isExecutiveUser = userObj && (
    userObj.role === 'admin' ||
    userObj.role === 'school_admin' ||
    userObj.role === 'bgh' ||
    userObj.isSchoolAdmin ||
    userObj.isBgh ||
    normalized === 'adminquantri'
  );

  const existingData = db.userData[normalized] || {};
  let finalClasses = Array.isArray(data.classes) && data.classes.length > 0
    ? data.classes
    : (Array.isArray(existingData.classes) ? existingData.classes : []);
  let finalStudents = Array.isArray(data.students) && data.students.length > 0
    ? data.students
    : (Array.isArray(existingData.students) ? existingData.students : []);

  // Smart merge cho attendanceRecords và boardingRecords của Executive
  let finalAttendance = Array.isArray(data.attendanceRecords) ? data.attendanceRecords : [];
  let finalBoarding = Array.isArray(data.boardingRecords) ? data.boardingRecords : [];

  if (isExecutiveUser) {
    if (finalAttendance.length === 0 && Array.isArray(existingData.attendanceRecords)) {
      finalAttendance = existingData.attendanceRecords;
    } else if (Array.isArray(existingData.attendanceRecords)) {
      const attMap = new Map<string, any>();
      for (const a of existingData.attendanceRecords) {
        if (a && a.date && a.classId) attMap.set(`${a.date}_${a.classId}`, a);
      }
      for (const a of finalAttendance) {
        if (a && a.date && a.classId) {
          const ex = attMap.get(`${a.date}_${a.classId}`);
          attMap.set(`${a.date}_${a.classId}`, { ...ex, ...a, records: { ...(ex?.records || {}), ...(a.records || {}) } });
        }
      }
      finalAttendance = Array.from(attMap.values());
    }

    if (finalBoarding.length === 0 && Array.isArray(existingData.boardingRecords)) {
      finalBoarding = existingData.boardingRecords;
    } else if (Array.isArray(existingData.boardingRecords)) {
      const bMap = new Map<string, any>();
      for (const b of existingData.boardingRecords) {
        if (b && b.date && b.classId) bMap.set(`${b.date}_${b.classId}`, b);
      }
      for (const b of finalBoarding) {
        if (b && b.date && b.classId) {
          const ex = bMap.get(`${b.date}_${b.classId}`);
          bMap.set(`${b.date}_${b.classId}`, { ...ex, ...b, records: { ...(ex?.records || {}), ...(b.records || {}) } });
        }
      }
      finalBoarding = Array.from(bMap.values());
    }
  }

  const payload = {
    ...data,
    classes: finalClasses,
    students: finalStudents,
    attendanceRecords: finalAttendance,
    boardingRecords: finalBoarding,
    updatedAt: Date.now()
  };

  db.userData[normalized] = payload;

  // Đồng bộ hai chiều cho alias (ví dụ gvcn1a1 <-> gvcn_1a1)
  const alias = normalized.startsWith('gvcn_')
    ? normalized.replace('gvcn_', 'gvcn')
    : (normalized.startsWith('gvcn') ? normalized.replace('gvcn', 'gvcn_') : '');

  if (alias) {
    db.userData[alias] = JSON.parse(JSON.stringify(payload));
  }

  // 📂 Tự động cập nhật đồng bộ file gvcn_*.json trên đĩa nếu có tệp của giáo viên này
  try {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir);
      const targetClassName = payload.classes?.[0]?.name || '';
      for (const f of files) {
        const lower = f.toLowerCase();
        if (!lower.startsWith('gvcn_') || !lower.endsWith('.json')) continue;
        const filePath = path.join(dataDir, f);
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(raw);
          const meta = parsed.metadata || {};
          const cInfo = parsed.classInfo || {};
          const isMatch = (meta.teacherUsername && meta.teacherUsername.toLowerCase() === normalized) ||
            (alias && meta.teacherUsername && meta.teacherUsername.toLowerCase() === alias) ||
            (targetClassName && (cInfo.name === targetClassName || meta.className === targetClassName)) ||
            (lower.includes(normalized.replace(/[^a-z0-9]/g, '')));
          
          if (isMatch) {
            parsed.fullClassroomData = {
              ...(parsed.fullClassroomData || {}),
              attendanceRecords: payload.attendanceRecords || [],
              boardingRecords: payload.boardingRecords || [],
              students: payload.students || parsed.fullClassroomData?.students || [],
              classes: payload.classes || parsed.fullClassroomData?.classes || []
            };
            parsed.attendanceRecords = payload.attendanceRecords || [];
            parsed.boardingRecords = payload.boardingRecords || [];
            parsed.students = payload.students || parsed.students || [];
            parsed.exportedAt = new Date().toISOString();
            parsed.lastUpdated = Date.now();
            fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  const saved = saveDatabase(db);

  if (isSupabaseConfigured()) {
    saveSupabaseUserData(normalized, db.userData[normalized]).catch(err => {
      console.warn(`[Supabase Dual-Write] Lỗi đồng bộ ngầm userData ${normalized}:`, err);
    });
  }

  return saved;
}

// ========================================================
// ADMIN UNIFIED CLASSROOM DATA & MULTI-TEACHER SYNC
// ========================================================
export function getAdminAllData(): {
  success: boolean;
  teachers: any[];
  classes: any[];
  students: any[];
  attendanceRecords?: any[];
  boardingRecords?: any[];
  transactions?: any[];
  userData: Record<string, any>;
  timestamp: number;
} {
  const db = loadDatabase(true);
  const teachers = db.users
    .filter(u => u.role === 'homeroom') // Chỉ lấy giáo viên chủ nhiệm
    .map(({ password, ...u }) => u);

  const allClassesMap = new Map<string, any>();
  const allStudentsMap = new Map<string, any>();
  const allAttendanceMap = new Map<string, any>();
  const allBoardingMap = new Map<string, any>();
  const allTransactions: any[] = [];

  // 1. Collect classes, students, attendance, boarding, transactions from all teacher accounts
  for (const t of teachers) {
    const tUser = t.username.toLowerCase();
    let uData = db.userData[tUser] || {};
    if (!uData.classes || uData.classes.length === 0) {
      const alias = tUser.startsWith('gvcn_')
        ? tUser.replace('gvcn_', 'gvcn')
        : (tUser.startsWith('gvcn') ? tUser.replace('gvcn', 'gvcn_') : '');
      if (alias && db.userData[alias]?.classes?.length > 0) {
        uData = db.userData[alias];
      }
    }
    const uClasses = Array.isArray(uData.classes) ? uData.classes : [];
    const uStudents = Array.isArray(uData.students) ? uData.students : [];
    const uAttendance = Array.isArray(uData.attendanceRecords) ? uData.attendanceRecords : [];
    const uBoarding = Array.isArray(uData.boardingRecords) ? uData.boardingRecords : [];
    const uTransactions = Array.isArray(uData.transactions) ? uData.transactions : [];

    for (const c of uClasses) {
      if (c.teacherRole === 'subject' || (c.id && c.id.startsWith('class-sub-'))) {
        continue;
      }
      const enrichedClass = {
        ...c,
        schoolName: c.schoolName || t.schoolName || 'TRƯỜNG HỌC',
        teacherUsername: c.teacherUsername || t.username,
        teacherRole: 'homeroom',
        teacherName: c.teacherName || t.fullName
      };
      allClassesMap.set(c.id, enrichedClass);
    }

    for (const s of uStudents) {
      if (s.classId === 'class-1791592764810' || (s.classId && s.classId.startsWith('class-sub-'))) {
        continue;
      }
      allStudentsMap.set(s.id, {
        ...s,
        teacherUsername: s.teacherUsername || t.username
      });
    }

    // Lấy tập ID các lớp mà giáo viên này thực sự làm chủ nhiệm (dựa theo c.teacherUsername hoặc sở hữu duy nhất)
    const ownedClassIds = new Set(
      uClasses
        .filter((c: any) => {
          if (!c || !c.id) return false;
          const tUsername = (c.teacherUsername || '').trim().toLowerCase().replace('_', '');
          const curUserNorm = tUser.replace('_', '');
          return !tUsername || tUsername === curUserNorm;
        })
        .map((c: any) => c.id)
    );

    // Tổng hợp điểm danh chuyên cần từ đúng GVCN phụ trách lớp
    for (const att of uAttendance) {
      if (att && att.date && att.classId && ownedClassIds.has(att.classId)) {
        const key = `${att.date}_${att.classId}`;
        if (!allAttendanceMap.has(key)) {
          allAttendanceMap.set(key, { ...att });
        } else {
          const ex = allAttendanceMap.get(key);
          allAttendanceMap.set(key, {
            ...ex,
            ...att,
            records: { ...(ex.records || {}), ...(att.records || {}) }
          });
        }
      }
    }

    // Tổng hợp ăn bán trú từ đúng GVCN phụ trách lớp
    for (const b of uBoarding) {
      if (b && b.date && b.classId && ownedClassIds.has(b.classId)) {
        const key = `${b.date}_${b.classId}`;
        if (!allBoardingMap.has(key)) {
          allBoardingMap.set(key, { ...b });
        } else {
          const ex = allBoardingMap.get(key);
          allBoardingMap.set(key, {
            ...ex,
            ...b,
            records: { ...(ex.records || {}), ...(b.records || {}) }
          });
        }
      }
    }

    // Tổng hợp điểm xu thi đua
    for (const tx of uTransactions) {
      if (tx && tx.id) {
        allTransactions.push(tx);
      }
    }
  }

  // 1.5. Hợp nhất lớp và học sinh từ các tài khoản Quản trị nhà trường (school_admin) để liên thông đầy đủ
  const schoolAdmins = db.users.filter(u => u.role === 'school_admin' || u.isSchoolAdmin);
  for (const sa of schoolAdmins) {
    const saData = db.userData[sa.username.toLowerCase()] || {};
    const saClasses = Array.isArray(saData.classes) ? saData.classes : [];
    const saStudents = Array.isArray(saData.students) ? saData.students : [];
    const saAttendance = Array.isArray(saData.attendanceRecords) ? saData.attendanceRecords : [];
    const saBoarding = Array.isArray(saData.boardingRecords) ? saData.boardingRecords : [];
    const saTransactions = Array.isArray(saData.transactions) ? saData.transactions : [];

    for (const c of saClasses) {
      if (c.teacherRole === 'subject' || (c.id && c.id.startsWith('class-sub-'))) {
        continue;
      }
      if (!allClassesMap.has(c.id)) {
        allClassesMap.set(c.id, {
          ...c,
          teacherRole: 'homeroom',
          schoolName: c.schoolName || sa.schoolName || 'TRƯỜNG HỌC'
        });
      } else {
        const existing = allClassesMap.get(c.id)!;
        if (!existing.schoolName && (c.schoolName || sa.schoolName)) {
          existing.schoolName = c.schoolName || sa.schoolName;
        }
      }
    }

    for (const s of saStudents) {
      if (s.classId === 'class-1791592764810' || (s.classId && s.classId.startsWith('class-sub-'))) {
        continue;
      }
      if (!allStudentsMap.has(s.id)) {
        allStudentsMap.set(s.id, s);
      }
    }

    for (const att of saAttendance) {
      if (att && att.date && att.classId) {
        const key = `${att.date}_${att.classId}`;
        if (!allAttendanceMap.has(key)) {
          allAttendanceMap.set(key, { ...att });
        }
      }
    }

    for (const b of saBoarding) {
      if (b && b.date && b.classId) {
        const key = `${b.date}_${b.classId}`;
        if (!allBoardingMap.has(key)) {
          allBoardingMap.set(key, { ...b });
        }
      }
    }

    for (const tx of saTransactions) {
      if (tx && tx.id) {
        allTransactions.push(tx);
      }
    }
  }

  // Sắp xếp lịch sử thi đua theo thời gian mới nhất
  allTransactions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // Calculate the highest updatedAt timestamp across all teachers to prevent polling false-positives
  const maxTeacherUpdatedAt = Math.max(
    0,
    ...teachers.map(t => Number(db.userData[t.username.toLowerCase()]?.updatedAt) || 0),
    Number(db.userData['admin']?.updatedAt) || 0,
    Number(db.userData['adminquantri']?.updatedAt) || 0
  );

  return {
    success: true,
    teachers,
    classes: Array.from(allClassesMap.values()),
    students: Array.from(allStudentsMap.values()),
    attendanceRecords: Array.from(allAttendanceMap.values()),
    boardingRecords: Array.from(allBoardingMap.values()),
    transactions: allTransactions,
    userData: db.userData,
    timestamp: maxTeacherUpdatedAt || Date.now()
  };
}

/**
 * ⚡ TỔNG HỢP DỮ LIỆU ĐA TẦNG CHO BAN GIÁM HIỆU & QUẢN TRỊ NHÀ TRƯỜNG (< 2ms):
 * Tự động gom và đồng bộ toàn bộ lớp học, học sinh, điểm danh chuyên cần, bán trú và điểm thi đua
 * của tất cả các giáo viên chủ nhiệm trong trường một cách trực tiếp từ bộ nhớ/CSDL máy chủ.
 */
export function getExecutiveScopedDataServer(currentUser: any): {
  success: boolean;
  classes: any[];
  students: any[];
  attendanceRecords: any[];
  boardingRecords: any[];
  transactions: any[];
  teachers: any[];
  timestamp: number;
} {
  const db = loadDatabase(true);
  const isMasterAdmin = currentUser?.role === 'admin' || currentUser?.username?.toLowerCase() === 'adminquantri';
  const targetSchool = (currentUser?.schoolName || '').trim().toLowerCase();

  // 1. Lọc danh sách giáo viên phụ trách thuộc trường của currentUser
  const scopedTeachers = db.users.filter(u => {
    if (u.role !== 'homeroom') return false;
    if (isMasterAdmin) return true;
    const uSchool = (u.schoolName || '').trim().toLowerCase();
    if (!targetSchool || !uSchool) return false;
    return uSchool === targetSchool;
  });

  const allClassesMap = new Map<string, any>();
  const allStudentsMap = new Map<string, any>();
  const allAttendanceMap = new Map<string, any>();
  const allBoardingMap = new Map<string, any>();
  const allTransactions: any[] = [];

  for (const t of scopedTeachers) {
    const tUser = t.username.toLowerCase();
    const alias = tUser.startsWith('gvcn_')
      ? tUser.replace('gvcn_', 'gvcn')
      : (tUser.startsWith('gvcn') ? tUser.replace('gvcn', 'gvcn_') : '');

    let uData = db.userData[tUser] || {};
    const aliasData = alias ? (db.userData[alias] || {}) : {};

    // Gộp dữ liệu từ tài khoản chính và alias nếu có
    const uClasses = Array.isArray(uData.classes) && uData.classes.length > 0 
      ? uData.classes 
      : (Array.isArray(aliasData.classes) ? aliasData.classes : []);
    const uStudents = Array.isArray(uData.students) && uData.students.length > 0 
      ? uData.students 
      : (Array.isArray(aliasData.students) ? aliasData.students : []);
    
    // Gộp tất cả bản ghi điểm danh từ cả 2 tài khoản
    const rawAtt = [...(Array.isArray(uData.attendanceRecords) ? uData.attendanceRecords : []), ...(Array.isArray(aliasData.attendanceRecords) ? aliasData.attendanceRecords : [])];
    const rawBoarding = [...(Array.isArray(uData.boardingRecords) ? uData.boardingRecords : []), ...(Array.isArray(aliasData.boardingRecords) ? aliasData.boardingRecords : [])];
    const rawTx = [...(Array.isArray(uData.transactions) ? uData.transactions : []), ...(Array.isArray(aliasData.transactions) ? aliasData.transactions : [])];

    for (const c of uClasses) {
      if (c.teacherRole === 'subject' || (c.id && c.id.startsWith('class-sub-'))) continue;
      allClassesMap.set(c.id, {
        ...c,
        schoolName: c.schoolName || t.schoolName || currentUser?.schoolName || 'TRƯỜNG HỌC',
        teacherUsername: c.teacherUsername || t.username,
        teacherRole: 'homeroom',
        teacherName: c.teacherName || t.fullName
      });
    }

    for (const s of uStudents) {
      if (s.classId === 'class-1791592764810' || (s.classId && s.classId.startsWith('class-sub-'))) continue;
      allStudentsMap.set(s.id, { ...s, teacherUsername: s.teacherUsername || t.username });
    }

    // Lấy tập ID các lớp mà giáo viên này thực sự quản lý
    const classIdList = uClasses.map((c: any) => c.id).filter(Boolean);
    const ownedClassIds = new Set(classIdList);

    for (const att of rawAtt) {
      if (att && att.date && att.classId && (ownedClassIds.size === 0 || ownedClassIds.has(att.classId))) {
        const key = `${att.date}_${att.classId}`;
        if (!allAttendanceMap.has(key)) {
          allAttendanceMap.set(key, { ...att });
        } else {
          const ex = allAttendanceMap.get(key);
          allAttendanceMap.set(key, {
            ...ex,
            ...att,
            records: { ...(ex.records || {}), ...(att.records || {}) }
          });
        }
      }
    }

    for (const b of rawBoarding) {
      if (b && b.date && b.classId && (ownedClassIds.size === 0 || ownedClassIds.has(b.classId))) {
        const key = `${b.date}_${b.classId}`;
        if (!allBoardingMap.has(key)) {
          allBoardingMap.set(key, { ...b });
        } else {
          const ex = allBoardingMap.get(key);
          allBoardingMap.set(key, {
            ...ex,
            ...b,
            records: { ...(ex.records || {}), ...(b.records || {}) }
          });
        }
      }
    }

    for (const tx of rawTx) {
      if (tx && tx.id) allTransactions.push(tx);
    }
  }

  // 🌟 Nạp bổ sung dữ liệu lớp học, học sinh, điểm danh, bán trú từ các tài khoản Quản trị nhà trường (school_admin)
  const schoolAdminUsers = db.users.filter(u => {
    if (!(u.role === 'school_admin' || u.isSchoolAdmin)) return false;
    if (isMasterAdmin) return true;
    const saSchool = (u.schoolName || '').trim().toLowerCase();
    return Boolean(targetSchool && saSchool === targetSchool);
  });

  for (const sa of schoolAdminUsers) {
    const saData = db.userData[sa.username.toLowerCase()] || {};
    
    // Nạp bổ sung lớp học nếu chưa có trong map
    if (Array.isArray(saData.classes)) {
      for (const c of saData.classes) {
        if (c && c.id && !allClassesMap.has(c.id) && c.teacherRole !== 'subject' && !c.id.startsWith('class-sub-')) {
          allClassesMap.set(c.id, {
            ...c,
            schoolName: c.schoolName || sa.schoolName || currentUser?.schoolName || 'TRƯỜNG HỌC',
            teacherRole: 'homeroom'
          });
        }
      }
    }

    // Nạp bổ sung học sinh nếu chưa có trong map
    if (Array.isArray(saData.students)) {
      for (const s of saData.students) {
        if (s && s.id && !allStudentsMap.has(s.id) && s.classId !== 'class-1791592764810' && !s.classId.startsWith('class-sub-')) {
          allStudentsMap.set(s.id, s);
        }
      }
    }

    if (Array.isArray(saData.attendanceRecords)) {
      for (const att of saData.attendanceRecords) {
        if (att && att.date && att.classId) {
          const key = `${att.date}_${att.classId}`;
          if (!allAttendanceMap.has(key)) {
            allAttendanceMap.set(key, { ...att });
          } else {
            const ex = allAttendanceMap.get(key);
            allAttendanceMap.set(key, {
              ...ex,
              ...att,
              records: { ...(ex.records || {}), ...(att.records || {}) }
            });
          }
        }
      }
    }
    if (Array.isArray(saData.boardingRecords)) {
      for (const b of saData.boardingRecords) {
        if (b && b.date && b.classId) {
          const key = `${b.date}_${b.classId}`;
          if (!allBoardingMap.has(key)) {
            allBoardingMap.set(key, { ...b });
          } else {
            const ex = allBoardingMap.get(key);
            allBoardingMap.set(key, {
              ...ex,
              ...b,
              records: { ...(ex.records || {}), ...(b.records || {}) }
            });
          }
        }
      }
    }
  }

  // 📂 TỰ ĐỘNG QUÉT VÀ HỢP NHẤT TOÀN BỘ FILE LỚP HỌC (GVCN_*.JSON) TỪ THƯ MỤC DATA & THƯ MỤC LƯU TRỮ
  try {
    const dataDir = path.resolve(process.cwd(), 'data');
    const scanDirs = [dataDir];
    const storageConfigFile = path.join(dataDir, 'storage_location.json');
    if (fs.existsSync(storageConfigFile)) {
      try {
        const sc = JSON.parse(fs.readFileSync(storageConfigFile, 'utf-8'));
        if (sc.customPath && fs.existsSync(sc.customPath) && !scanDirs.includes(sc.customPath)) {
          scanDirs.push(sc.customPath);
        }
      } catch (_) {}
    }

    for (const dir of scanDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const files = fs.readdirSync(dir);
        for (const f of files) {
          const lower = f.toLowerCase();
          if (!lower.endsWith('.json')) continue;
          if (!lower.startsWith('gvcn_') && lower !== 'du_lieu_lop_hoc_hanh_phuc.json') continue;

          try {
            const filePath = path.join(dir, f);
            const raw = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(raw);

            const cInfo = parsed.classInfo || {};
            const meta = parsed.metadata || {};
            const classId = cInfo.id || parsed.fullClassroomData?.activeClassId || ('class-' + f.replace(/\.json$/i, ''));
            const className = cInfo.name || meta.className;

            if (className && !allClassesMap.has(classId)) {
              allClassesMap.set(classId, {
                id: classId,
                name: className,
                grade: cInfo.grade || meta.grade || 'Khối 1',
                schoolName: cInfo.schoolName || meta.schoolName || currentUser?.schoolName || '',
                branch: cInfo.branch || meta.branch || null,
                campus: cInfo.campus || meta.campus || null,
                academicYear: cInfo.academicYear || meta.academicYear || '2026 - 2027',
                teacherName: meta.teacherName || '',
                teacherUsername: meta.teacherUsername || '',
                teacherRole: 'homeroom'
              });
            }

            // Students
            const studentList = parsed.students || parsed.fullClassroomData?.students || [];
            if (Array.isArray(studentList)) {
              studentList.forEach((st: any) => {
                if (st && st.id) {
                  const existing = allStudentsMap.get(st.id);
                  allStudentsMap.set(st.id, {
                    ...(existing || {}),
                    ...st,
                    classId: st.classId || classId
                  });
                }
              });
            }

            // Attendance records từ mảng
            const attList = parsed.fullClassroomData?.attendanceRecords || parsed.attendanceRecords || [];
            if (Array.isArray(attList)) {
              attList.forEach((att: any) => {
                if (att && att.date && (att.classId || classId)) {
                  const targetCId = att.classId || classId;
                  const key = `${att.date}_${targetCId}`;
                  const ex = allAttendanceMap.get(key);
                  if (ex) {
                    const exTs = ex.timestamp || ex.updatedAt || 0;
                    const fileTs = att.timestamp || att.updatedAt || (parsed.lastUpdated || (parsed.exportedAt ? new Date(parsed.exportedAt).getTime() : 0));
                    if (exTs > fileTs && Object.keys(ex.records || {}).length > 0) {
                      allAttendanceMap.set(key, { ...att, ...ex, classId: targetCId, records: { ...(att.records || {}), ...(ex.records || {}) } });
                    } else {
                      allAttendanceMap.set(key, { ...ex, ...att, classId: targetCId, records: { ...(ex.records || {}), ...(att.records || {}) } });
                    }
                  } else {
                    allAttendanceMap.set(key, { ...att, classId: targetCId });
                  }
                }
              });
            }

            // Boarding records từ mảng
            const brdList = parsed.fullClassroomData?.boardingRecords || parsed.boardingRecords || [];
            if (Array.isArray(brdList)) {
              brdList.forEach((brd: any) => {
                if (brd && brd.date && (brd.classId || classId)) {
                  const targetCId = brd.classId || classId;
                  const key = `${brd.date}_${targetCId}`;
                  const ex = allBoardingMap.get(key);
                  if (ex) {
                    const exTs = ex.timestamp || ex.updatedAt || 0;
                    const fileTs = brd.timestamp || brd.updatedAt || (parsed.lastUpdated || (parsed.exportedAt ? new Date(parsed.exportedAt).getTime() : 0));
                    if (exTs > fileTs && Object.keys(ex.records || {}).length > 0) {
                      allBoardingMap.set(key, { ...brd, ...ex, classId: targetCId, records: { ...(brd.records || {}), ...(ex.records || {}) } });
                    } else {
                      allBoardingMap.set(key, { ...ex, ...brd, classId: targetCId, records: { ...(ex.records || {}), ...(brd.records || {}) } });
                    }
                  } else {
                    allBoardingMap.set(key, { ...brd, classId: targetCId });
                  }
                }
              });
            }

            // Trích xuất từ dailyRecords (Chuẩn Google Drive Sync - chỉ nạp bổ sung nếu ngày đó chưa có bản ghi)
            if (parsed.dailyRecords && typeof parsed.dailyRecords === 'object') {
              for (const [date, rec] of Object.entries(parsed.dailyRecords as Record<string, any>)) {
                if (rec && typeof rec === 'object') {
                  if (rec.attendance && rec.attendance.details) {
                    const key = `${date}_${classId}`;
                    if (!allAttendanceMap.has(key)) {
                      allAttendanceMap.set(key, {
                        classId,
                        date,
                        records: { ...(rec.attendance.details || {}) }
                      });
                    }
                  }
                  if (rec.boarding && rec.boarding.details) {
                    const key = `${date}_${classId}`;
                    if (!allBoardingMap.has(key)) {
                      allBoardingMap.set(key, {
                        classId,
                        date,
                        records: { ...(rec.boarding.details || {}) }
                      });
                    }
                  }
                }
              }
            }
          } catch (_) {}
        }
      } catch (_) {}
    }
  } catch (_) {}

  allTransactions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return {
    success: true,
    classes: Array.from(allClassesMap.values()),
    students: Array.from(allStudentsMap.values()),
    attendanceRecords: Array.from(allAttendanceMap.values()),
    boardingRecords: Array.from(allBoardingMap.values()),
    transactions: allTransactions,
    teachers: scopedTeachers.map(({ password, ...u }) => u),
    timestamp: Date.now()
  };
}

export function syncAdminClassroomData(classes: any[], students: any[]): { success: boolean; timestamp: number } {
  const db = loadDatabase();
  const now = Date.now();

  // 1. Phân bổ và hợp nhất lớp học & học sinh vào TẤT CẢ các tài khoản người dùng có quản lý các lớp này
  const classIdsToSync = new Set(classes.map(c => c.id));
  const classesById = new Map<string, any>();
  for (const c of classes) {
    classesById.set(c.id, c);
  }
  const studentsByClassId = new Map<string, any[]>();
  for (const s of students) {
    if (s.classId) {
      // Student-only (delta) syncs must still reach the owning teacher even if the class itself is unchanged
      classIdsToSync.add(s.classId);
      if (!studentsByClassId.has(s.classId)) {
        studentsByClassId.set(s.classId, []);
      }
      studentsByClassId.get(s.classId)!.push(s);
    }
  }

  // Quét toàn bộ db.userData để cập nhật mọi tài khoản (giáo viên, bgh, admin...) có chứa các lớp đang đồng bộ
  for (const [uName, uData] of Object.entries(db.userData)) {
    if (!uData || typeof uData !== 'object') continue;
    const existingClasses = Array.isArray((uData as any).classes) ? (uData as any).classes : [];
    const hasAnyTargetClass = existingClasses.some((c: any) => classIdsToSync.has(c.id));
    
    if (hasAnyTargetClass) {
      // Cập nhật thông tin lớp học
      const classMap = new Map<string, any>();
      for (const ec of existingClasses) {
        classMap.set(ec.id, ec);
      }
      for (const [cId, freshClass] of classesById.entries()) {
        if (classMap.has(cId)) {
          classMap.set(cId, { ...classMap.get(cId), ...freshClass });
        }
      }

      // Cập nhật học sinh thuộc các lớp này trong uData
      const existingStudents = Array.isArray((uData as any).students) ? (uData as any).students : [];
      const studentMap = new Map<string, any>();
      for (const es of existingStudents) {
        studentMap.set(es.id, es);
      }
      for (const cId of classMap.keys()) {
        const freshStudents = studentsByClassId.get(cId) || [];
        for (const fs of freshStudents) {
          studentMap.set(fs.id, { ...(studentMap.get(fs.id) || {}), ...fs });
        }
      }

      (uData as any).classes = Array.from(classMap.values());
      (uData as any).students = Array.from(studentMap.values());
      (uData as any).updatedAt = now;
    }
  }

  // Phân bổ thêm cho các giáo viên được chỉ định cụ thể qua teacherUsername
  for (const c of classes) {
    if (c.teacherUsername) {
      const tUser = c.teacherUsername.toLowerCase();
      if (!db.userData[tUser]) {
        db.userData[tUser] = { classes: [], students: [], updatedAt: now };
      }
      const uData = db.userData[tUser];
      const curClasses = Array.isArray(uData.classes) ? uData.classes : [];
      const cIdx = curClasses.findIndex((item: any) => item.id === c.id);
      if (cIdx >= 0) {
        curClasses[cIdx] = { ...curClasses[cIdx], ...c };
      } else {
        curClasses.push(c);
      }
      uData.classes = curClasses;

      const curStudents = Array.isArray(uData.students) ? uData.students : [];
      const sMap = new Map<string, any>();
      for (const cs of curStudents) sMap.set(cs.id, cs);
      const cStudents = studentsByClassId.get(c.id) || [];
      for (const cs of cStudents) sMap.set(cs.id, { ...(sMap.get(cs.id) || {}), ...cs });
      uData.students = Array.from(sMap.values());
      uData.updatedAt = now;
    }
  }

  // 2. Hợp nhất snapshot toàn diện cho cả 'admin' và 'adminquantri'
  const adminClassesMap = new Map<string, any>();
  for (const ac of (db.userData['admin']?.classes || [])) {
    adminClassesMap.set(ac.id, ac);
  }
  for (const ac of (db.userData['adminquantri']?.classes || [])) {
    if (!adminClassesMap.has(ac.id)) adminClassesMap.set(ac.id, ac);
  }
  for (const c of classes) {
    adminClassesMap.set(c.id, { ...(adminClassesMap.get(c.id) || {}), ...c });
  }

  const adminStudentsMap = new Map<string, any>();
  for (const as of (db.userData['admin']?.students || [])) {
    adminStudentsMap.set(as.id, as);
  }
  for (const as of (db.userData['adminquantri']?.students || [])) {
    if (!adminStudentsMap.has(as.id)) adminStudentsMap.set(as.id, as);
  }
  for (const s of students) {
    adminStudentsMap.set(s.id, { ...(adminStudentsMap.get(s.id) || {}), ...s });
  }

  const adminSnapshot = {
    classes: Array.from(adminClassesMap.values()),
    students: Array.from(adminStudentsMap.values()),
    updatedAt: now
  };

  db.userData['admin'] = {
    ...(db.userData['admin'] || {}),
    ...adminSnapshot
  };

  db.userData['adminquantri'] = {
    ...(db.userData['adminquantri'] || {}),
    ...adminSnapshot
  };

  saveDatabase(db);

  if (isSupabaseConfigured()) {
    for (const [uName, uData] of Object.entries(db.userData)) {
      if (uData && (uData as any).updatedAt === now) {
        saveSupabaseUserData(uName, uData).catch(() => {});
      }
    }
  }

  return { success: true, timestamp: now };
}

export function updateAdminClass(classData: any, targetUsername?: string, isDelete = false): { success: boolean; updatedAt: number } {
  const db = loadDatabase();
  const now = Date.now();
  const username = (targetUsername || classData.teacherUsername || 'adminquantri').toLowerCase();

  if (isDelete) {
    // Supreme Privileges: Khi XÓA một lớp học, quét TOÀN BỘ db.userData để loại bỏ lớp này và tất cả học sinh thuộc lớp này
    for (const [u, uData] of Object.entries(db.userData)) {
      if (!uData || typeof uData !== 'object') continue;
      let changed = false;
      if (Array.isArray((uData as any).classes)) {
        const origLen = (uData as any).classes.length;
        (uData as any).classes = (uData as any).classes.filter((c: any) => c.id !== classData.id);
        if ((uData as any).classes.length !== origLen) changed = true;
      }
      if (Array.isArray((uData as any).students)) {
        const origLen = (uData as any).students.length;
        (uData as any).students = (uData as any).students.filter((s: any) => s.classId !== classData.id);
        if ((uData as any).students.length !== origLen) changed = true;
      }
      if (changed) {
        (uData as any).updatedAt = now;
        if (isSupabaseConfigured()) {
          saveSupabaseUserData(u, uData).catch(() => {});
        }
      }
    }
  } else {
    if (!db.userData[username]) {
      db.userData[username] = { classes: [], students: [], updatedAt: now };
    }

    const uData = db.userData[username];
    let curClasses = Array.isArray(uData.classes) ? uData.classes : [];
    const idx = curClasses.findIndex((c: any) => c.id === classData.id);
    if (idx >= 0) {
      curClasses[idx] = { ...curClasses[idx], ...classData, teacherUsername: username };
    } else {
      curClasses.push({ ...classData, teacherUsername: username });
    }
    uData.classes = curClasses;
    uData.updatedAt = now;

    if (isSupabaseConfigured()) {
      saveSupabaseUserData(username, uData).catch(() => {});
    }

    // Đồng thời cập nhật đồng bộ sang các tài khoản khác có chứa lớp này
    const isExecutiveOrAdmin = (uName: string): boolean => {
      const lower = uName.toLowerCase();
      if (lower === 'admin' || lower === 'adminquantri' || lower === 'guest_admin' || lower.startsWith('quantri') || lower.startsWith('bgh_')) return true;
      const uObj = db.users.find(u => u.username.toLowerCase() === lower);
      if (uObj) {
        return uObj.role === 'admin' || uObj.role === 'school_admin' || uObj.role === 'bgh' || Boolean(uObj.isSchoolAdmin) || Boolean(uObj.isBgh);
      }
      return false;
    };

    for (const [otherUser, otherData] of Object.entries(db.userData)) {
      if (otherUser !== username && otherData && typeof otherData === 'object') {
        const isExec = isExecutiveOrAdmin(otherUser);
        let changed = false;

        if (Array.isArray((otherData as any).classes)) {
          const oClasses = (otherData as any).classes;
          const cIdx = oClasses.findIndex((c: any) => c.id === classData.id);
          if (cIdx >= 0) {
            if (isExec) {
              // Cấp Quản trị / BGH: Cập nhật thông tin lớp học mới nhất
              oClasses[cIdx] = { ...oClasses[cIdx], ...classData, teacherUsername: username };
              changed = true;
            } else {
              // Giáo viên chủ nhiệm khác: Lớp đã chuyển giao cho giáo viên khác => LOẠI BỎ KHỎI TÀI KHOẢN GVCN CŨ
              (otherData as any).classes = oClasses.filter((c: any) => c.id !== classData.id);
              changed = true;
            }
          }
        }

        // Nếu là GVCN khác và lớp đã chuyển giao => loại bỏ học sinh thuộc lớp này khỏi tài khoản GVCN cũ
        if (!isExec && Array.isArray((otherData as any).students)) {
          const origLen = (otherData as any).students.length;
          (otherData as any).students = (otherData as any).students.filter((s: any) => s.classId !== classData.id);
          if ((otherData as any).students.length !== origLen) {
            changed = true;
          }
        }

        if (changed) {
          (otherData as any).updatedAt = now;
          if (isSupabaseConfigured()) {
            saveSupabaseUserData(otherUser, otherData).catch(() => {});
          }
        }
      }
    }
  }

  saveDatabase(db);
  return { success: true, updatedAt: now };
}

export function updateAdminStudent(studentData: any, targetUsername?: string, isDelete = false): { success: boolean; updatedAt: number } {
  const db = loadDatabase();
  const now = Date.now();

  if (isDelete) {
    // Supreme Privileges: Khi XÓA một học sinh, quét TOÀN BỘ db.userData để loại bỏ học sinh này khỏi mọi tài khoản
    for (const [u, uData] of Object.entries(db.userData)) {
      if (!uData || typeof uData !== 'object') continue;
      if (Array.isArray((uData as any).students)) {
        const origLen = (uData as any).students.length;
        (uData as any).students = (uData as any).students.filter((s: any) => s.id !== studentData.id);
        if ((uData as any).students.length !== origLen) {
          (uData as any).updatedAt = now;
          if (isSupabaseConfigured()) {
            saveSupabaseUserData(u, uData).catch(() => {});
          }
        }
      }
    }
  } else {
    let username = targetUsername ? targetUsername.toLowerCase() : '';

    if (!username) {
      for (const [u, data] of Object.entries(db.userData)) {
        if (Array.isArray((data as any).classes) && (data as any).classes.some((c: any) => c.id === studentData.classId)) {
          username = u;
          break;
        }
      }
      if (!username) username = 'adminquantri';
    }

    if (!db.userData[username]) {
      db.userData[username] = { classes: [], students: [], updatedAt: now };
    }

    const uData = db.userData[username];
    let curStudents = Array.isArray(uData.students) ? uData.students : [];
    const idx = curStudents.findIndex((s: any) => s.id === studentData.id);
    if (idx >= 0) {
      curStudents[idx] = { ...curStudents[idx], ...studentData };
    } else {
      curStudents.push(studentData);
    }
    uData.students = curStudents;
    uData.updatedAt = now;

    if (isSupabaseConfigured()) {
      saveSupabaseUserData(username, uData).catch(() => {});
    }

    // Đồng thời cập nhật vào toàn bộ các tài khoản giáo viên/admin khác có chứa học sinh này
    for (const [otherUser, otherData] of Object.entries(db.userData)) {
      if (otherUser !== username && Array.isArray((otherData as any)?.students)) {
        const oStudents = (otherData as any).students;
        const sIdx = oStudents.findIndex((s: any) => s.id === studentData.id);
        if (sIdx >= 0) {
          oStudents[sIdx] = { ...oStudents[sIdx], ...studentData };
          (otherData as any).updatedAt = now;
          if (isSupabaseConfigured()) {
            saveSupabaseUserData(otherUser, otherData).catch(() => {});
          }
        }
      }
    }
  }

  saveDatabase(db);
  return { success: true, updatedAt: now };
}

// Audit Logs & Activity History
export function addAuditLog(entry: {
  username: string;
  userFullName: string;
  role: AuditLogItem['role'];
  actionType: AuditLogItem['actionType'];
  description: string;
  details?: any;
}): AuditLogItem {
  const db = loadDatabase();
  if (!Array.isArray(db.auditLogs)) {
    db.auditLogs = [];
  }

  const logItem: AuditLogItem = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    timestamp: Date.now(),
    username: entry.username,
    userFullName: entry.userFullName,
    role: entry.role,
    actionType: entry.actionType,
    description: entry.description,
    details: entry.details
  };

  db.auditLogs.unshift(logItem); // newest first

  // Cap at 2000 log items
  if (db.auditLogs.length > 2000) {
    db.auditLogs = db.auditLogs.slice(0, 2000);
  }

  saveDatabase(db);

  if (isSupabaseConfigured()) {
    insertSupabaseAuditLog(logItem).catch(() => {});
  }

  return logItem;
}

export function getAuditLogs(options?: {
  limit?: number;
  username?: string;
  actionType?: string;
}): AuditLogItem[] {
  const db = loadDatabase();
  let logs = Array.isArray(db.auditLogs) ? db.auditLogs : [];

  if (options?.username) {
    const u = options.username.trim().toLowerCase();
    logs = logs.filter(l => l.username.toLowerCase() === u);
  }

  if (options?.actionType && options.actionType !== 'ALL') {
    logs = logs.filter(l => l.actionType === options.actionType);
  }

  const limit = options?.limit || 200;
  return logs.slice(0, limit);
}

export function clearAuditLogs(): boolean {
  const db = loadDatabase();
  db.auditLogs = [];
  return saveDatabase(db);
}

export function getUserDataSummary() {
  const db = loadDatabase();
  return db.users.map(u => {
    const rawData = db.userData[u.username.toLowerCase()] || {};
    const classesList = Array.isArray(rawData.classes) ? rawData.classes : [];
    const studentsList = Array.isArray(rawData.students) ? rawData.students : [];
    
    return {
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      assignedClassName: u.assignedClassName,
      subjectName: u.subjectName,
      schoolName: u.schoolName,
      status: u.status,
      classCount: classesList.length,
      studentCount: studentsList.length,
      lastUpdated: rawData.updatedAt || u.createdAt,
      classes: classesList.map((c: any) => ({
        id: c.id,
        name: c.name,
        grade: c.grade,
        studentCount: studentsList.filter((s: any) => s.classId === c.id).length
      }))
    };
  });
}

export function getDatabaseStats() {
  const db = loadDatabase();
  let totalClasses = 0;
  let totalStudents = 0;

  const userBreakdown: Array<{
    username: string;
    fullName: string;
    role: string;
    classesCount: number;
    studentsCount: number;
    bytes: number;
    sizeKB: number;
    percentOfTotal: number;
  }> = [];

  let totalUserDataBytes = 0;

  for (const user of db.users) {
    const uData = db.userData[user.username] || null;
    let uClasses = 0;
    let uStudents = 0;
    let uBytes = 0;

    if (uData) {
      if (Array.isArray(uData.classes)) uClasses = uData.classes.length;
      if (Array.isArray(uData.students)) uStudents = uData.students.length;
      try {
        uBytes = Buffer.byteLength(JSON.stringify(uData), 'utf8');
      } catch (_) {
        uBytes = 0;
      }
    }

    totalClasses += uClasses;
    totalStudents += uStudents;
    totalUserDataBytes += uBytes;

    userBreakdown.push({
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      classesCount: uClasses,
      studentsCount: uStudents,
      bytes: uBytes,
      sizeKB: Math.round((uBytes / 1024) * 10) / 10,
      percentOfTotal: 0
    });
  }

  const fileSize = fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : 0;
  const auditLogsBytes = Buffer.byteLength(JSON.stringify(db.auditLogs || []), 'utf8');
  const usersBytes = Buffer.byteLength(JSON.stringify(db.users || []), 'utf8');
  const systemSettingsBytes = Buffer.byteLength(JSON.stringify(db.systemSettings || {}), 'utf8');

  // Calculate percentages
  const safeTotal = fileSize > 0 ? fileSize : 1;
  userBreakdown.forEach(item => {
    item.percentOfTotal = Math.round((item.bytes / safeTotal) * 1000) / 10;
  });

  const fileSizeKB = Math.round((fileSize / 1024) * 10) / 10;
  const fileSizeMB = Math.round((fileSize / (1024 * 1024)) * 100) / 100;
  const formattedSize = fileSize >= 1024 * 1024 
    ? `${fileSizeMB.toFixed(2)} MB` 
    : `${fileSizeKB.toFixed(1)} KB`;

  const storageQuotaMB = 50; // Quota 50 MB
  const percentOfQuota = Math.round((fileSize / (storageQuotaMB * 1024 * 1024)) * 1000) / 10;

  return {
    userCount: db.users.length,
    users: db.users.map(({ password, ...u }) => u),
    totalClasses,
    totalStudents,
    lastSync: db.lastSync,
    fileSizeBytes: fileSize,
    fileSizeKB,
    fileSizeMB,
    formattedSize,
    storageQuotaMB,
    percentOfQuota,
    storageBreakdown: {
      userData: {
        bytes: totalUserDataBytes,
        sizeKB: Math.round((totalUserDataBytes / 1024) * 10) / 10,
        percent: Math.round((totalUserDataBytes / safeTotal) * 1000) / 10
      },
      auditLogs: {
        bytes: auditLogsBytes,
        sizeKB: Math.round((auditLogsBytes / 1024) * 10) / 10,
        count: (db.auditLogs || []).length,
        percent: Math.round((auditLogsBytes / safeTotal) * 1000) / 10
      },
      users: {
        bytes: usersBytes,
        sizeKB: Math.round((usersBytes / 1024) * 10) / 10,
        count: db.users.length,
        percent: Math.round((usersBytes / safeTotal) * 1000) / 10
      },
      systemOverhead: {
        bytes: systemSettingsBytes,
        sizeKB: Math.round((systemSettingsBytes / 1024) * 10) / 10
      }
    },
    userBreakdown,
    dbPath: DB_FILE
  };
}

export function compactDatabase() {
  const db = loadDatabase();
  db.lastSync = new Date().toISOString();
  saveDatabase(db);
  return getDatabaseStats();
}

/**
 * 🎓 CÔNG CỤ CHUẨN BỊ NĂM HỌC MỚI DÀNH CHO NHÀ TRƯỜNG (Yêu cầu 3)
 * @param schoolName Tên trường cần xóa dữ liệu (nếu rỗng hoặc 'ALL' thì áp dụng cho toàn bộ tài khoản thuộc nhà trường)
 * @param mode 'full': Xóa toàn bộ thông tin lớp học, học sinh, giáo viên của trường
 *             'keep_teachers': Xóa lớp học & học sinh, GIỮ NGUYÊN tài khoản user giáo viên
 */
/**
 * 🏫 QUẢN LÝ DANH MỤC CƠ SỞ DỮ LIỆU TRƯỜNG HỌC (Dành cho Admin Tối Cao)
 */
export function getSchools(): SchoolEntity[] {
  const db = loadDatabase();
  if (!Array.isArray(db.schools)) {
    db.schools = [];
    saveDatabase(db);
  }
  return db.schools;
}

export function createSchool(data: Partial<SchoolEntity> & { adminPassword?: string; adminFullName?: string; createAccount?: boolean }) {
  const db = loadDatabase();
  if (!Array.isArray(db.schools)) {
    db.schools = [...DEFAULT_SCHOOLS];
  }
  if (!data.name || !data.name.trim()) {
    return { success: false, message: 'Tên trường học không được để trống.' };
  }

  const cleanName = data.name.trim();
  const existing = db.schools.find(s => s.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) {
    return { success: false, message: 'Trường học này đã tồn tại trong hệ thống.' };
  }

  const schoolCode = data.code?.trim().toUpperCase() || `TH_${Date.now().toString().slice(-4)}`;

  const newSchool: SchoolEntity = {
    id: data.id || `school_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: cleanName,
    code: schoolCode,
    address: data.address?.trim() || '',
    phone: data.phone?.trim() || '',
    adminUsername: (data.createAccount && data.adminUsername?.trim()) ? data.adminUsername.trim() : '',
    createdAt: Date.now()
  };

  db.schools.push(newSchool);

  // Chỉ tạo tài khoản nếu có yêu cầu rõ ràng qua cờ createAccount === true (mặc định chỉ tạo CSDL trường mới)
  let adminAccountResult: { username: string; password?: string; fullName: string; role: string; schoolName: string } | undefined = undefined;

  if (data.createAccount && data.adminUsername?.trim()) {
    const bghUsername = data.adminUsername.trim().toLowerCase();
    const bghPassword = data.adminPassword?.trim() || '123456';
    const bghFullName = data.adminFullName?.trim() || `Ban Giám Hiệu ${cleanName}`;

    if (!Array.isArray(db.users)) {
      db.users = [];
    }
    const existingUserIdx = db.users.findIndex(u => u.username.toLowerCase() === bghUsername);
    const bghUser: UserAccountServer = {
      id: `user-${bghUsername}`,
      username: bghUsername,
      password: bghPassword,
      fullName: bghFullName,
      role: 'school_admin',
      isSchoolAdmin: true,
      isBgh: true,
      tenantType: 'school',
      schoolName: cleanName,
      email: `${bghUsername}@lophoc.edu.vn`,
      phone: data.phone?.trim() || '',
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${bghUsername}&backgroundColor=bbf7d0`,
      createdAt: Date.now(),
      status: 'active'
    };

    if (existingUserIdx >= 0) {
      db.users[existingUserIdx] = { ...db.users[existingUserIdx], ...bghUser, id: db.users[existingUserIdx].id };
    } else {
      db.users.push(bghUser);
    }

    if (!db.userData) db.userData = {};
    if (!db.userData[bghUsername]) {
      db.userData[bghUsername] = {
        classes: [],
        students: [],
        subjectClasses: [],
        schoolName: cleanName
      };
    }

    if (isSupabaseConfigured()) {
      try {
        upsertSupabaseUser(bghUser).catch((err) => console.warn('[Supabase Sync BGH] Lỗi upsert user:', err));
        saveSupabaseUserData(bghUsername, db.userData[bghUsername]).catch((err) => console.warn('[Supabase Sync BGH Data] Lỗi lưu user data:', err));
      } catch (_) {}
    }

    adminAccountResult = {
      username: bghUsername,
      password: bghPassword,
      fullName: bghFullName,
      role: 'school_admin',
      schoolName: cleanName
    };
  }

  saveDatabase(db);

  addAuditLog({
    username: 'adminquantri',
    userFullName: 'Quản trị viên Hệ thống Cấp cao',
    role: 'admin',
    actionType: 'OTHER',
    description: `Khởi tạo cơ sở dữ liệu trường học mới: ${newSchool.name} (${newSchool.code})${data.createAccount ? ' kèm tài khoản BGH' : ' (chưa cấp tài khoản)'}`,
    details: { school: newSchool }
  });

  return {
    success: true,
    school: newSchool,
    adminAccount: adminAccountResult,
    message: `Khởi tạo CSDL trường "${newSchool.name}" thành công.`
  };
}

export function provisionSchoolAdmin(schoolId: string, data: { adminUsername: string; adminPassword?: string; adminFullName?: string; phone?: string }) {
  const db = loadDatabase();
  if (!Array.isArray(db.schools)) {
    db.schools = [...DEFAULT_SCHOOLS];
  }
  const school = db.schools.find(s => s.id === schoolId);
  if (!school) {
    return { success: false, message: 'Không tìm thấy thông tin trường học.' };
  }

  const bghUsername = (data.adminUsername || '').trim().toLowerCase();
  if (!bghUsername) {
    return { success: false, message: 'Tên đăng nhập BGH không được để trống.' };
  }

  const bghPassword = data.adminPassword?.trim() || '123456';
  const bghFullName = data.adminFullName?.trim() || `Ban Giám Hiệu ${school.name}`;

  if (!Array.isArray(db.users)) {
    db.users = [];
  }

  const existingUserIdx = db.users.findIndex(u => u.username.toLowerCase() === bghUsername);
  const bghUser: UserAccountServer = {
    id: existingUserIdx >= 0 ? db.users[existingUserIdx].id : `user-${bghUsername}`,
    username: bghUsername,
    password: bghPassword,
    fullName: bghFullName,
    role: 'school_admin',
    isSchoolAdmin: true,
    isBgh: true,
    tenantType: 'school',
    schoolName: school.name,
    email: `${bghUsername}@lophoc.edu.vn`,
    phone: data.phone?.trim() || school.phone || '',
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${bghUsername}&backgroundColor=bbf7d0`,
    createdAt: Date.now(),
    status: 'active'
  };

  if (existingUserIdx >= 0) {
    db.users[existingUserIdx] = { ...db.users[existingUserIdx], ...bghUser, id: db.users[existingUserIdx].id };
  } else {
    db.users.push(bghUser);
  }

  school.adminUsername = bghUsername;
  school.adminFullName = bghFullName;

  if (!db.userData) db.userData = {};
  if (!db.userData[bghUsername]) {
    db.userData[bghUsername] = {
      classes: [],
      students: [],
      subjectClasses: [],
      schoolName: school.name
    };
  }

  if (isSupabaseConfigured()) {
    try {
      upsertSupabaseUser(bghUser).catch(err => console.warn('[Supabase Sync BGH]', err));
      saveSupabaseUserData(bghUsername, db.userData[bghUsername]).catch(err => console.warn('[Supabase Sync BGH Data]', err));
    } catch (_) {}
  }

  saveDatabase(db);

  addAuditLog({
    username: 'adminquantri',
    userFullName: 'Quản trị viên Hệ thống Cấp cao',
    role: 'admin',
    actionType: 'ACCOUNT_CREATE',
    description: `Cấp tài khoản Quản trị Ban Giám Hiệu cho trường ${school.name}: @${bghUsername}`,
    details: { school, bghUser: { username: bghUsername, fullName: bghFullName } }
  });

  return {
    success: true,
    school,
    adminAccount: {
      username: bghUsername,
      password: bghPassword,
      fullName: bghFullName,
      role: 'school_admin',
      schoolName: school.name
    },
    message: `Đã cấp tài khoản BGH (@${bghUsername}) cho trường "${school.name}" thành công!`
  };
}

export function updateSchool(id: string, data: Partial<SchoolEntity>) {
  const db = loadDatabase();
  if (!Array.isArray(db.schools)) {
    db.schools = [...DEFAULT_SCHOOLS];
  }
  const idx = db.schools.findIndex(s => s.id === id);
  if (idx === -1) {
    return { success: false, message: 'Không tìm thấy trường học cần cập nhật.' };
  }

  const oldSchool = db.schools[idx];
  const oldName = oldSchool.name;
  const newName = data.name?.trim() || oldSchool.name;

  db.schools[idx] = {
    ...oldSchool,
    name: newName,
    code: data.code?.trim().toUpperCase() || oldSchool.code,
    address: data.address !== undefined ? data.address.trim() : oldSchool.address,
    phone: data.phone !== undefined ? data.phone.trim() : oldSchool.phone,
    adminUsername: data.adminUsername !== undefined ? data.adminUsername.trim() : oldSchool.adminUsername
  };

  // Nếu đổi tên trường, cập nhật luôn trường schoolName của các user trực thuộc
  if (oldName !== newName) {
    for (const u of db.users) {
      if (u.schoolName === oldName) {
        u.schoolName = newName;
      }
    }
  }

  saveDatabase(db);
  return { success: true, school: db.schools[idx], message: 'Cập nhật thông tin trường thành công.' };
}

export function deleteSchool(id: string, schoolName?: string) {
  const db = loadDatabase();
  if (!Array.isArray(db.schools)) {
    return { success: false, message: 'Danh sách trường rỗng.' };
  }
  const cleanId = (id || '').trim().toLowerCase();
  const cleanName = (schoolName || '').trim().toLowerCase();
  const target = db.schools.find(s => 
    s.id === id || 
    (cleanName && s.name.trim().toLowerCase() === cleanName) ||
    (cleanId && s.name.trim().toLowerCase() === cleanId) ||
    (s.code && s.code.toLowerCase() === cleanId)
  );
  if (!target) {
    return { success: false, message: 'Không tìm thấy trường học cần xóa.' };
  }

  // 💥 CASCADE DELETE TOÀN DIỆN CSDL TRƯỜNG HỌC (Zero Remnants Protocol):
  // 1. Tìm tất cả tài khoản thuộc trường (loại trừ tài khoản Super Admin)
  const isSchoolUser = (u: UserAccountServer) => {
    if (u.role === 'admin' || u.username === 'adminquantri') return false;
    return (
      (u.schoolName && u.schoolName.trim().toLowerCase() === target.name.trim().toLowerCase()) ||
      u.schoolId === target.id ||
      (target.code && u.schoolName?.toLowerCase() === target.code.toLowerCase())
    );
  };

  const usersInSchool = db.users.filter(isSchoolUser);
  const deletedUsernames: string[] = [];

  for (const u of usersInSchool) {
    deletedUsernames.push(u.username);
    const cleanUser = u.username.trim().toLowerCase();
    // Xóa sạch toàn bộ mô hình lớp học, học sinh, điểm số của tài khoản đó trong local JSON
    if (db.userData && db.userData[cleanUser]) {
      delete db.userData[cleanUser];
    }
    // Xóa người dùng và dữ liệu lớp học trên Supabase nếu đã cấu hình
    if (isSupabaseConfigured()) {
      deleteSupabaseUser(u.id).catch(() => {});
      deleteSupabaseUserData(u.username).catch(() => {});
    }
  }

  // 2. Quét dọn toàn bộ mô hình lớp học thuộc trường bị xóa trong userData của TẤT CẢ các tài khoản còn lại
  if (db.userData && typeof db.userData === 'object') {
    for (const username of Object.keys(db.userData)) {
      const uData = db.userData[username];
      if (uData && Array.isArray(uData.classes)) {
        uData.classes = uData.classes.filter((c: any) => 
          !(c.schoolName && (
            c.schoolName.trim().toLowerCase() === target.name.trim().toLowerCase() ||
            (target.code && c.schoolName.toLowerCase() === target.code.toLowerCase())
          )) &&
          c.schoolId !== target.id
        );
      }
    }
  }

  // 3. Xóa các tài khoản thuộc trường khỏi danh sách users
  db.users = db.users.filter(u => !isSchoolUser(u));

  // 4. Xóa trường khỏi danh mục schools
  db.schools = db.schools.filter(s => s.id !== target.id && s.name.trim().toLowerCase() !== target.name.trim().toLowerCase());
  saveDatabase(db);

  addAuditLog({
    username: 'admin',
    userFullName: 'Quản trị viên Hệ thống',
    role: 'admin',
    actionType: 'OTHER',
    description: `Xóa CSDL trường học (Cascade): ${target.name} (${target.code}) - Đã xóa ${usersInSchool.length} tài khoản và xóa trắng toàn bộ mô hình lớp học liên đới`,
    details: { school: target, deletedAccounts: deletedUsernames }
  });

  return { 
    success: true, 
    message: `Đã xóa sạch CSDL trường ${target.name} cùng ${usersInSchool.length} tài khoản và xóa trắng toàn bộ mô hình lớp học liên đới.` 
  };
}

/**
 * 🎓 CÔNG CỤ CHUẨN BỊ NĂM HỌC MỚI (Dành cho Quản trị Nhà trường & Quản trị Cá nhân)
 * @param schoolName Tên trường cần xóa dữ liệu (nếu rỗng hoặc 'ALL' thì áp dụng cho toàn bộ tài khoản thuộc nhà trường)
 * @param mode 'full': Xóa toàn bộ thông tin lớp học, học sinh, giáo viên
 *             'keep_teachers': Xóa lớp học & học sinh, GIỮ NGUYÊN tài khoản user giáo viên
 * @param targetScope 'school': Phân vùng trường học | 'guest': Phân vùng giáo viên cá nhân
 */
export function resetSchoolAcademicYear(
  schoolName?: string, 
  mode: 'full' | 'keep_teachers' = 'keep_teachers',
  targetScope: 'school' | 'guest' = 'school'
) {
  const db = loadDatabase();
  const targetSchool = (schoolName || '').trim().toLowerCase();

  const isMatching = (u: UserAccountServer) => {
    // Không bao giờ xóa tài khoản quản trị cốt lõi hệ thống
    if (u.username === 'adminquantri' || u.role === 'admin') {
      return false;
    }

    if (targetScope === 'guest') {
      // Phân vùng cá nhân: không xóa tài khoản quản trị cá nhân hoặc adminquantri
      if (u.username === 'adminquantri' || u.role === 'guest_admin') {
        return false;
      }
      return (u.tenantType || 'guest') === 'guest';
    } else {
      // Phân vùng nhà trường: không xóa tài khoản quản trị trường
      if (u.role === 'school_admin') {
        return false;
      }
      if ((u.tenantType || 'school') === 'guest') {
        return false;
      }
      if (!targetSchool || targetSchool === 'all') {
        return true;
      }
      return (u.schoolName || '').trim().toLowerCase() === targetSchool;
    }
  };

  const affectedUsers = db.users.filter(isMatching);
  let deletedClassCount = 0;
  let deletedStudentCount = 0;

  if (mode === 'full') {
    // LỰA CHỌN 1: Xóa toàn bộ thông tin lớp học, học sinh, và tài khoản giáo viên
    const usernamesToDelete = new Set(affectedUsers.map(u => u.username.toLowerCase()));

    for (const uname of usernamesToDelete) {
      if (db.userData[uname]) {
        deletedClassCount += (db.userData[uname].classes || []).length;
        deletedStudentCount += (db.userData[uname].students || []).length;
        delete db.userData[uname];
      }
    }

    db.users = db.users.filter(u => !usernamesToDelete.has(u.username.toLowerCase()));

    addAuditLog({
      username: targetScope === 'guest' ? 'adminquantri' : 'quan_tri_truong',
      userFullName: targetScope === 'guest' ? 'Quản trị viên Hệ thống (GV Cá nhân)' : 'Quản trị Nhà trường',
      role: targetScope === 'guest' ? 'guest_admin' : 'school_admin',
      actionType: 'DELETE_CLASS',
      description: `[NĂM HỌC MỚI - TOÀN DIỆN ${targetScope.toUpperCase()}] Đã xóa ${usernamesToDelete.size} giáo viên, ${deletedClassCount} lớp và ${deletedStudentCount} học sinh.`,
      details: { mode: 'full', targetScope, usernames: Array.from(usernamesToDelete) }
    });

  } else {
    // LỰA CHỌN 2: Xóa dữ liệu lớp học & học sinh mà KHÔNG xóa tài khoản user của giáo viên
    for (const u of affectedUsers) {
      const uname = u.username.toLowerCase();
      if (db.userData[uname]) {
        deletedClassCount += (db.userData[uname].classes || []).length;
        deletedStudentCount += (db.userData[uname].students || []).length;
        db.userData[uname] = {
          ...db.userData[uname],
          classes: [],
          activeClassId: '',
          students: [],
          transactions: [],
          redemptions: [],
          attendanceRecords: [],
          boardingRecords: [],
          seatingAssignments: {},
          timetable: [],
          subjectTimetable: [],
          updatedAt: Date.now()
        };
      }
    }

    addAuditLog({
      username: targetScope === 'guest' ? 'adminquantri' : 'quan_tri_truong',
      userFullName: targetScope === 'guest' ? 'Quản trị viên Hệ thống (GV Cá nhân)' : 'Quản trị Nhà trường',
      role: targetScope === 'guest' ? 'guest_admin' : 'school_admin',
      actionType: 'DELETE_CLASS',
      description: `[NĂM HỌC MỚI - GIỮ GIÁO VIÊN ${targetScope.toUpperCase()}] Đã dọn sạch ${deletedClassCount} lớp và ${deletedStudentCount} học sinh của ${affectedUsers.length} giáo viên.`,
      details: { mode: 'keep_teachers', targetScope, affectedUserCount: affectedUsers.length }
    });
  }

  saveDatabase(db);
  const scopeTitle = targetScope === 'guest' ? 'nhóm Giáo viên cá nhân' : (schoolName ? `trường ${schoolName}` : 'nhà trường');
  return {
    success: true,
    mode,
    targetScope,
    affectedUsersCount: affectedUsers.length,
    deletedClassCount,
    deletedStudentCount,
    message: mode === 'full' 
      ? `Đã xóa toàn bộ dữ liệu lớp học, học sinh và ${affectedUsers.length} tài khoản giáo viên thuộc ${scopeTitle} cho năm học mới thành công!`
      : `Đã dọn sạch dữ liệu lớp học & học sinh cho năm học mới, bảo toàn nguyên vẹn ${affectedUsers.length} tài khoản giáo viên thuộc ${scopeTitle}!`
  };
}

/**
 * 📦 TRÍCH XUẤT DATA JSON THEO PHÂN QUYỀN (Dành cho Quản trị Trường & Quản trị Cá Nhân)
 */
export function exportDatabaseScoped(scope: 'all' | 'school' | 'guest' = 'all', schoolName?: string) {
  const db = loadDatabase();
  if (scope === 'all') return db;

  const targetSchool = (schoolName || '').trim().toLowerCase();
  const filterUser = (u: UserAccountServer) => {
    if (scope === 'guest') {
      return (u.tenantType || 'guest') === 'guest';
    } else {
      if ((u.tenantType || 'school') === 'guest') return false;
      if (!targetSchool || targetSchool === 'all') return true;
      return (u.schoolName || '').trim().toLowerCase() === targetSchool;
    }
  };

  const scopedUsers = db.users.filter(filterUser);
  const scopedUsernames = new Set(scopedUsers.map(u => u.username.toLowerCase()));
  const scopedUserData: Record<string, any> = {};

  for (const [uname, data] of Object.entries(db.userData || {})) {
    if (scopedUsernames.has(uname.toLowerCase())) {
      scopedUserData[uname] = data;
    }
  }

  return {
    version: db.version,
    appName: db.appName,
    exportedScope: scope,
    schoolName: schoolName || 'Tất cả trường',
    exportedAt: new Date().toISOString(),
    users: scopedUsers,
    schools: scope === 'school' ? (db.schools || []).filter(s => !targetSchool || targetSchool === 'all' || s.name.toLowerCase() === targetSchool) : [],
    userData: scopedUserData
  };
}

/**
 * 📥 NẠP VÀ GỘP DATA JSON THEO PHÂN QUYỀN (An toàn, Non-Destructive)
 */
export function importDatabaseScoped(importedData: any, scope: 'all' | 'school' | 'guest' = 'all', schoolName?: string) {
  const db = loadDatabase();
  if (!importedData || (!Array.isArray(importedData.users) && typeof importedData.userData !== 'object')) {
    return { success: false, message: 'File dữ liệu không đúng định dạng JSON hợp lệ.' };
  }

  if (scope === 'all') {
    // Admin Full Restore
    if (Array.isArray(importedData.users)) {
      db.users = importedData.users;
    }
    if (Array.isArray(importedData.schools)) {
      db.schools = importedData.schools;
    }
    if (importedData.userData && typeof importedData.userData === 'object') {
      db.userData = importedData.userData;
    }
  } else {
    // Non-destructive Scoped Import
    const incomingUsers = Array.isArray(importedData.users) ? importedData.users : [];
    const incomingUserData = importedData.userData || {};

    for (const inUser of incomingUsers) {
      const idx = db.users.findIndex(u => u.username.toLowerCase() === inUser.username.toLowerCase());
      if (idx >= 0) {
        db.users[idx] = { ...db.users[idx], ...inUser };
      } else {
        db.users.push(inUser);
      }
    }

    for (const [uname, data] of Object.entries(incomingUserData)) {
      db.userData[uname] = data;
    }
  }

  saveDatabase(db);
  return { success: true, message: 'Nhập và đồng bộ dữ liệu JSON thành công!' };
}

/**
 * 📝 LƯU ĐƠN ĐĂNG KÝ SỬ DỤNG PHẦN MỀM (Yêu cầu 4)
 */
export function addRegistrationRequest(req: any) {
  const db = loadDatabase();
  if (!Array.isArray(db.registrations)) {
    db.registrations = [];
  }
  const newReq = {
    id: `reg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    fullName: req.fullName || '',
    roleOrTitle: req.roleOrTitle || '',
    organization: req.organization || '',
    zaloPhone: req.zaloPhone || '',
    requestType: req.requestType || (req.registrationType === 'school' ? 'Cấp cho tổ chức nhà trường' : 'Cấp tài khoản cá nhân'),
    accountRole: req.accountRole || (req.registrationType === 'school' ? 'Quản trị nhà trường' : ''),
    registrationType: req.registrationType || 'personal', // 'school' | 'personal'
    amount: req.registrationType === 'school' ? 1000000 : 50000,
    transferContent: req.registrationType === 'school' ? 'MO TAI KHOAN QLHS TRUONG' : 'MO TAI KHOAN CA NHAN',
    createdAt: Date.now(),
    status: 'pending'
  };

  db.registrations.unshift(newReq);
  saveDatabase(db);
  return { success: true, registration: newReq };
}

export function getRegistrationRequests() {
  const db = loadDatabase();
  return db.registrations || [];
}

export function updateRegistrationRequestStatus(id: string, status: 'approved' | 'rejected', reason?: string) {
  const db = loadDatabase();
  if (!db.registrations) db.registrations = [];
  const index = db.registrations.findIndex((r: any) => r.id === id);
  if (index !== -1) {
    db.registrations[index].status = status;
    if (reason !== undefined) {
      db.registrations[index].rejectReason = reason;
    }
    saveDatabase(db);
    return true;
  }
  return false;
}

export function deleteRegistrationRequest(id: string) {
  const db = loadDatabase();
  if (!db.registrations) db.registrations = [];
  const initialLength = db.registrations.length;
  db.registrations = db.registrations.filter((r: any) => r.id !== id);
  if (db.registrations.length !== initialLength) {
    saveDatabase(db);
    return true;
  }
  return false;
}

/**
 * 👥 LẤY DANH SÁCH TÀI KHOẢN THEO PHÂN LOẠI (NHÀ TRƯỜNG HOẶC VÃNG LAI)
 */
export function getUsersByTenant(tenantType?: 'school' | 'guest') {
  const db = loadDatabase();
  if (!tenantType) return db.users.map(({ password, ...u }) => u);
  return db.users
    .filter(u => (u.tenantType || 'school') === tenantType)
    .map(({ password, ...u }) => u);
}

