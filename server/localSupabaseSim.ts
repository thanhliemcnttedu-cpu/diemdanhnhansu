/**
 * 🧪 LOCAL SUPABASE SIMULATOR MODULE
 * ====================================
 * Mô phỏng hành vi Supabase Cloud ngay trên máy local (localhost:3000).
 * 
 * NGUYÊN TẮC:
 * - Chỉ hoạt động khi NODE_ENV=development hoặc chạy localhost.
 * - Lưu dữ liệu song song vào thư mục: data/database_local_supabase_sim/tables/
 * - KHÔNG BAO GIỜ ảnh hưởng đến dữ liệu production hoặc GitHub.
 * - Được .gitignore bảo vệ: tables/ và snapshots/ sẽ không bao giờ lên GitHub.
 * 
 * LUỒNG DỮ LIỆU (Fallback 3 lớp):
 *   Supabase Cloud (nếu có ENV) → Local Supabase Sim (thư mục này) → LocalStorage
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveSimDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'data/database_local_supabase_sim'),
    path.resolve(__dirname, 'data/database_local_supabase_sim'),
    path.resolve(__dirname, '../data/database_local_supabase_sim')
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return path.resolve(process.cwd(), 'data/database_local_supabase_sim');
}

// Thư mục gốc của Local Supabase Simulator
const SIM_DIR = resolveSimDir();
const TABLES_DIR = path.join(SIM_DIR, 'tables');
const SNAPSHOTS_DIR = path.join(SIM_DIR, 'snapshots');

// Chỉ bật simulator khi chạy development (localhost)
const IS_LOCAL_DEV = process.env.NODE_ENV !== 'production';

// ============================================================
// HELPER: Đảm bảo thư mục tồn tại
// ============================================================
function ensureSimDirs() {
  [SIM_DIR, TABLES_DIR, SNAPSHOTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// ============================================================
// HELPER: Đọc bảng từ simulator
// ============================================================
function readTable<T = any>(tableName: string): T {
  const filePath = path.join(TABLES_DIR, `${tableName}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn(`[LocalSupabaseSim] Lỗi đọc bảng ${tableName}:`, err);
  }
  return { _table: tableName, rows: [] } as unknown as T;
}

// ============================================================
// HELPER: Ghi bảng vào simulator
// ============================================================
function writeTable(tableName: string, data: any): boolean {
  const filePath = path.join(TABLES_DIR, `${tableName}.json`);
  try {
    ensureSimDirs();
    data._lastUpdated = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.warn(`[LocalSupabaseSim] Lỗi ghi bảng ${tableName}:`, err);
    return false;
  }
}

// ============================================================
// HELPER: Lưu snapshot tại thời điểm hiện tại
// ============================================================
function saveSnapshot(label: string, data: any) {
  try {
    ensureSimDirs();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotFile = path.join(SNAPSHOTS_DIR, `${label}_${timestamp}.json`);
    fs.writeFileSync(snapshotFile, JSON.stringify(data, null, 2), 'utf-8');
    
    // Giữ tối đa 20 snapshots, xóa cũ nhất
    const snapshots = fs.readdirSync(SNAPSHOTS_DIR)
      .filter(f => f.endsWith('.json') && f !== '.gitkeep')
      .sort();
    if (snapshots.length > 20) {
      const toDelete = snapshots.slice(0, snapshots.length - 20);
      toDelete.forEach(f => {
        try { fs.unlinkSync(path.join(SNAPSHOTS_DIR, f)); } catch (_) {}
      });
    }
  } catch (err) {
    console.warn('[LocalSupabaseSim] Lỗi lưu snapshot:', err);
  }
}

// ============================================================
// INTERFACE: Dữ liệu nhà trường trong Simulator
// ============================================================
export interface SimSchool {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  adminUsername?: string;
  createdAt: number;
  createdBy?: string; // 'adminquantri' hoặc username tạo trường
  _source: 'local_supabase_sim';
}

export interface SimUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  schoolId?: string;
  schoolName?: string;
  isBgh?: boolean;
  isSchoolAdmin?: boolean;
  tenantType?: string;
  createdAt: number;
  createdBy?: string;
  _source: 'local_supabase_sim';
}

export interface SimUserData {
  username: string;
  schoolId?: string;
  classes: any[];
  students: any[];
  subjects?: any[];
  criteria?: any[];
  transactions?: any[];
  teacherProfile?: any;
  updatedAt: number;
  _source: 'local_supabase_sim';
}

// ============================================================
// API CHÍNH: Đồng bộ toàn bộ DatabaseSchema vào Simulator
// ============================================================
/**
 * Gọi hàm này sau mỗi lần saveDatabase() để cập nhật Simulator.
 * Dữ liệu sẽ được tách ra theo từng bảng riêng biệt.
 */
export function syncToLocalSupabaseSim(dbData: {
  users?: any[];
  schools?: any[];
  userData?: Record<string, any>;
  auditLogs?: any[];
  registrations?: any[];
  systemSettings?: any;
}): void {
  if (!IS_LOCAL_DEV) {
    console.log('[LocalSupabaseSim] Bỏ qua sync - Môi trường production');
    return;
  }

  try {
    ensureSimDirs();
    console.log('[LocalSupabaseSim] 🔄 Đang đồng bộ dữ liệu vào Simulator...');

    // 1. Đồng bộ bảng users
    if (dbData.users) {
      const usersTable = readTable('users');
      usersTable._table = 'users';
      usersTable._syncToCloud = false;
      usersTable.rows = dbData.users.map((u: any) => ({
        ...u,
        _source: 'local_supabase_sim'
      }));
      writeTable('users', usersTable);
    }

    // 2. Đồng bộ bảng schools
    if (dbData.schools) {
      const schoolsTable = readTable('schools');
      schoolsTable._table = 'schools';
      schoolsTable._syncToCloud = false;
      schoolsTable.rows = dbData.schools.map((s: any) => ({
        ...s,
        _source: 'local_supabase_sim'
      }));
      writeTable('schools', schoolsTable);
    }

    // 3. Đồng bộ bảng user_data (dữ liệu lớp học, học sinh, điểm...)
    if (dbData.userData) {
      const userDataTable = readTable('user_data');
      userDataTable._table = 'user_data';
      userDataTable._syncToCloud = false;
      // Lưu dạng object { username: data } để dễ truy vấn
      const rows: Record<string, any> = {};
      for (const [username, data] of Object.entries(dbData.userData)) {
        rows[username.toLowerCase()] = {
          ...(data as any),
          _source: 'local_supabase_sim',
          _syncedAt: new Date().toISOString()
        };
      }
      userDataTable.rows = rows;
      writeTable('user_data', userDataTable);
    }

    // 4. Đồng bộ bảng audit_logs (giữ tối đa 500 bản ghi)
    if (dbData.auditLogs) {
      const auditTable = readTable('audit_logs');
      auditTable._table = 'audit_logs';
      auditTable._syncToCloud = false;
      auditTable.rows = (dbData.auditLogs || []).slice(-500);
      writeTable('audit_logs', auditTable);
    }

    // 5. Đồng bộ bảng registrations
    if (dbData.registrations) {
      const regTable = readTable('registrations');
      regTable._table = 'registrations';
      regTable._syncToCloud = false;
      regTable.rows = dbData.registrations;
      writeTable('registrations', regTable);
    }

    console.log('[LocalSupabaseSim] ✅ Đồng bộ thành công!', {
      users: (dbData.users || []).length,
      schools: (dbData.schools || []).length,
      teachers: Object.keys(dbData.userData || {}).length,
      auditLogs: (dbData.auditLogs || []).length
    });

  } catch (err) {
    console.warn('[LocalSupabaseSim] ❌ Lỗi khi đồng bộ:', err);
  }
}

// ============================================================
// API: Lưu một nhà trường mới (khi adminquantri khởi tạo trường)
// ============================================================
export function simUpsertSchool(school: any, createdBy?: string): boolean {
  if (!IS_LOCAL_DEV) return false;
  
  try {
    ensureSimDirs();
    const schoolsTable = readTable<{ rows: SimSchool[] }>('schools');
    if (!Array.isArray(schoolsTable.rows)) schoolsTable.rows = [];
    
    const idx = schoolsTable.rows.findIndex((s: SimSchool) => s.id === school.id);
    const simSchool: SimSchool = {
      ...school,
      createdBy: createdBy || 'adminquantri',
      _source: 'local_supabase_sim'
    };

    if (idx >= 0) {
      schoolsTable.rows[idx] = { ...schoolsTable.rows[idx], ...simSchool };
    } else {
      schoolsTable.rows.push(simSchool);
    }

    writeTable('schools', schoolsTable);
    saveSnapshot('school_upsert', schoolsTable);
    console.log(`[LocalSupabaseSim] 🏫 Đã lưu trường học: ${school.name}`);
    return true;
  } catch (err) {
    console.warn('[LocalSupabaseSim] Lỗi lưu trường học:', err);
    return false;
  }
}

// ============================================================
// API: Lưu tài khoản người dùng mới (giáo viên, BGH, admin nhà trường)
// ============================================================
export function simUpsertUser(user: any, createdBy?: string): boolean {
  if (!IS_LOCAL_DEV) return false;
  
  try {
    ensureSimDirs();
    const usersTable = readTable<{ rows: SimUser[] }>('users');
    if (!Array.isArray(usersTable.rows)) usersTable.rows = [];
    
    const key = user.username?.toLowerCase();
    if (!key) return false;
    
    const idx = usersTable.rows.findIndex((u: SimUser) => u.username?.toLowerCase() === key);
    const simUser: SimUser = {
      ...user,
      createdBy: createdBy || 'adminquantri',
      _source: 'local_supabase_sim'
    };
    
    if (idx >= 0) {
      usersTable.rows[idx] = { ...usersTable.rows[idx], ...simUser };
    } else {
      usersTable.rows.push(simUser);
    }

    writeTable('users', usersTable);
    console.log(`[LocalSupabaseSim] 👤 Đã lưu tài khoản: ${user.username} (${user.role})`);
    return true;
  } catch (err) {
    console.warn('[LocalSupabaseSim] Lỗi lưu tài khoản:', err);
    return false;
  }
}

// ============================================================
// API: Lưu dữ liệu lớp học / học sinh của một giáo viên
// ============================================================
export function simSaveUserData(username: string, data: any): boolean {
  if (!IS_LOCAL_DEV) return false;
  
  try {
    ensureSimDirs();
    const userDataTable = readTable<{ rows: Record<string, any> }>('user_data');
    if (!userDataTable.rows || typeof userDataTable.rows !== 'object' || Array.isArray(userDataTable.rows)) {
      userDataTable.rows = {};
    }
    
    const key = username.toLowerCase();
    userDataTable.rows[key] = {
      ...data,
      _source: 'local_supabase_sim',
      _syncedAt: new Date().toISOString()
    };

    writeTable('user_data', userDataTable);
    
    const classCount = (data.classes || []).length;
    const studentCount = (data.students || []).length;
    console.log(`[LocalSupabaseSim] 📚 Đã lưu dữ liệu ${username}: ${classCount} lớp, ${studentCount} học sinh`);
    return true;
  } catch (err) {
    console.warn('[LocalSupabaseSim] Lỗi lưu user_data:', err);
    return false;
  }
}

// ============================================================
// API: Đọc toàn bộ dữ liệu từ Simulator (để khởi tạo server)
// ============================================================
export function simReadAll(): {
  users: any[];
  schools: any[];
  userData: Record<string, any>;
  auditLogs: any[];
  registrations: any[];
} {
  if (!IS_LOCAL_DEV) {
    return { users: [], schools: [], userData: {}, auditLogs: [], registrations: [] };
  }
  
  try {
    const usersTable = readTable<{ rows: any[] }>('users');
    const schoolsTable = readTable<{ rows: any[] }>('schools');
    const userDataTable = readTable<{ rows: Record<string, any> }>('user_data');
    const auditTable = readTable<{ rows: any[] }>('audit_logs');
    const regTable = readTable<{ rows: any[] }>('registrations');

    return {
      users: Array.isArray(usersTable.rows) ? usersTable.rows : [],
      schools: Array.isArray(schoolsTable.rows) ? schoolsTable.rows : [],
      userData: (userDataTable.rows && typeof userDataTable.rows === 'object' && !Array.isArray(userDataTable.rows))
        ? userDataTable.rows : {},
      auditLogs: Array.isArray(auditTable.rows) ? auditTable.rows : [],
      registrations: Array.isArray(regTable.rows) ? regTable.rows : []
    };
  } catch (err) {
    console.warn('[LocalSupabaseSim] Lỗi đọc dữ liệu simulator:', err);
    return { users: [], schools: [], userData: {}, auditLogs: [], registrations: [] };
  }
}

// ============================================================
// API: Xóa toàn bộ dữ liệu simulator (chỉ dùng khi reset local)
// ============================================================
export function simClearAll(): void {
  if (!IS_LOCAL_DEV) return;
  
  const tables = ['users', 'schools', 'user_data', 'audit_logs', 'registrations'];
  tables.forEach(tableName => {
    writeTable(tableName, {
      _table: tableName,
      _syncToCloud: false,
      _clearedAt: new Date().toISOString(),
      rows: tableName === 'user_data' ? {} : []
    });
  });
  console.log('[LocalSupabaseSim] 🗑️ Đã xóa toàn bộ dữ liệu simulator');
}

// ============================================================
// TRẠNG THÁI SIMULATOR
// ============================================================
export function getSimStatus(): {
  isActive: boolean;
  environment: string;
  tablesDir: string;
  stats: { users: number; schools: number; teachers: number };
} {
  const usersTable = readTable<{ rows: any[] }>('users');
  const schoolsTable = readTable<{ rows: any[] }>('schools');
  const userDataTable = readTable<{ rows: Record<string, any> }>('user_data');

  return {
    isActive: IS_LOCAL_DEV,
    environment: process.env.NODE_ENV || 'development',
    tablesDir: TABLES_DIR,
    stats: {
      users: (usersTable.rows || []).length,
      schools: (schoolsTable.rows || []).length,
      teachers: Object.keys(userDataTable.rows || {}).length
    }
  };
}

export { IS_LOCAL_DEV };
