import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'classroom_database.json');
const BACKUPS_ROOT = path.join(DATA_DIR, 'backups');

console.log('================================================================');
console.log('🧹 [LÀM SẠCH TOÀN BỘ CƠ SỞ DỮ LIỆU LOCALHOST - ZERO RESIDUAL DATA]');
console.log('================================================================');

// 1. Tạo thư mục sao lưu an toàn trước khi làm sạch
const timestamp = Date.now();
const safeBackupDir = path.join(BACKUPS_ROOT, `backup_before_factory_reset_${timestamp}`);
if (!fs.existsSync(safeBackupDir)) {
  fs.mkdirSync(safeBackupDir, { recursive: true });
}

// Danh sách các file tàn dư cần sao lưu và dọn dẹp
const residualFiles = [
  'classroom_database.json',
  'adminquantri.json',
  'bgh.json',
  'du_lieu_lop_hoc_hanh_phuc.json',
  'quantrinhatruong.json',
  'storage_location.json'
];

residualFiles.forEach(file => {
  const srcPath = path.join(DATA_DIR, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, path.join(safeBackupDir, file));
    console.log(`📦 [Sao lưu an toàn] Đã copy ${file} -> backups/backup_before_factory_reset_${timestamp}/`);
  }
});

// 2. Tài khoản quản trị tối cao DUY NHẤT của hệ thống
const adminquantriUser = {
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
};

// 3. Cấu trúc CSDL sạch trắng hoàn toàn
const cleanDatabase = {
  version: '2.0.0',
  appName: 'LỚP HỌC HẠNH PHÚC - CƠ SỞ DỮ LIỆU ĐỒNG BỘ GITHUB',
  lastSync: new Date().toISOString(),
  schools: [],
  users: [adminquantriUser],
  userData: {
    adminquantri: {
      classes: [],
      students: [],
      attendanceRecords: [],
      boardingRecords: [],
      transactions: [],
      updatedAt: Date.now()
    }
  },
  auditLogs: [
    {
      id: `log-factory-reset-${Date.now()}`,
      timestamp: Date.now(),
      username: 'adminquantri',
      userFullName: 'Quản trị viên Hệ thống Cấp cao',
      role: 'admin',
      actionType: 'FACTORY_RESET',
      description: 'Làm sạch trắng toàn bộ cơ sở dữ liệu trên localhost: Xóa 100% học sinh, lớp học, trường học và tài khoản đã cấp. Duy nhất 01 tài khoản Quản trị tối cao adminquantri.'
    }
  ],
  registrations: [],
  systemSettings: {
    allowRegistration: true,
    autoSyncIntervalMs: 15000,
    githubRepoName: 'lop-hoc-hanh-phuc-database'
  }
};

// 4. Ghi đè file classroom_database.json sạch sẽ
fs.writeFileSync(DB_FILE, JSON.stringify(cleanDatabase, null, 2), 'utf-8');
console.log('✅ [1/5] Đã làm sạch file data/classroom_database.json (0 trường, 0 lớp, 0 học sinh, 1 tài khoản).');

// 5. Xóa bỏ các tệp dữ liệu lớp cũ độc lập trong thư mục data/
const filesToRemove = [
  'adminquantri.json',
  'bgh.json',
  'du_lieu_lop_hoc_hanh_phuc.json',
  'quantrinhatruong.json'
];

filesToRemove.forEach(file => {
  const filePath = path.join(DATA_DIR, file);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`🗑️ [2/5] Đã xóa tệp dữ liệu lớp học cũ: data/${file}`);
    } catch (err) {
      console.warn(`⚠️ Không thể xóa tệp ${file}:`, err);
    }
  }
});

// 6. Làm sạch 4 thư mục phân vùng quản lý
const partitions = ['database_ca_nhan', 'database_nha_truong', 'database_quan_tri_admin'];
partitions.forEach(dir => {
  const p = path.join(DATA_DIR, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// 6.1 Phân vùng Cá nhân
fs.writeFileSync(path.join(DATA_DIR, 'database_ca_nhan', 'database.json'), JSON.stringify({
  partition: 'ca_nhan',
  title: 'Cơ Sở Dữ Liệu Giáo Viên Cá Nhân & Quản Trị Cá Nhân',
  lastSync: cleanDatabase.lastSync,
  users: [],
  userData: {}
}, null, 2), 'utf-8');
fs.writeFileSync(path.join(DATA_DIR, 'database_ca_nhan', 'users.json'), JSON.stringify([], null, 2), 'utf-8');

// 6.2 Phân vùng Nhà trường
fs.writeFileSync(path.join(DATA_DIR, 'database_nha_truong', 'database.json'), JSON.stringify({
  partition: 'nha_truong',
  title: 'Cơ Sở Dữ Liệu Tổ Chức Nhà Trường',
  lastSync: cleanDatabase.lastSync,
  schools: [],
  users: [],
  userData: {}
}, null, 2), 'utf-8');
fs.writeFileSync(path.join(DATA_DIR, 'database_nha_truong', 'users.json'), JSON.stringify([], null, 2), 'utf-8');
fs.writeFileSync(path.join(DATA_DIR, 'database_nha_truong', 'schools.json'), JSON.stringify([], null, 2), 'utf-8');

// 6.4 Phân vùng Quản trị Admin
fs.writeFileSync(path.join(DATA_DIR, 'database_quan_tri_admin', 'database.json'), JSON.stringify({
  partition: 'quan_tri_admin',
  title: 'Cơ Sở Dữ Liệu Quản Trị Tối Cao Hệ Thống',
  lastSync: cleanDatabase.lastSync,
  users: [adminquantriUser],
  systemSettings: cleanDatabase.systemSettings,
  auditLogs: cleanDatabase.auditLogs,
  masterSummary: { totalUsers: 1, totalSchools: 0, totalClassesConfigured: 0 }
}, null, 2), 'utf-8');
fs.writeFileSync(path.join(DATA_DIR, 'database_quan_tri_admin', 'users.json'), JSON.stringify([adminquantriUser], null, 2), 'utf-8');
fs.writeFileSync(path.join(DATA_DIR, 'database_quan_tri_admin', 'system_settings.json'), JSON.stringify(cleanDatabase.systemSettings, null, 2), 'utf-8');
fs.writeFileSync(path.join(DATA_DIR, 'database_quan_tri_admin', 'audit_logs.json'), JSON.stringify(cleanDatabase.auditLogs, null, 2), 'utf-8');
console.log('✅ [3/5] Đã làm sạch 4 thư mục phân vùng database.');

// 7. Làm sạch Local Supabase Simulator (tables/)
const SIM_TABLES_DIR = path.join(DATA_DIR, 'database_local_supabase_sim', 'tables');
if (fs.existsSync(SIM_TABLES_DIR)) {
  fs.writeFileSync(path.join(SIM_TABLES_DIR, 'users.json'), JSON.stringify([adminquantriUser], null, 2), 'utf-8');
  fs.writeFileSync(path.join(SIM_TABLES_DIR, 'schools.json'), JSON.stringify([], null, 2), 'utf-8');
  fs.writeFileSync(path.join(SIM_TABLES_DIR, 'user_data.json'), JSON.stringify({
    adminquantri: {
      classes: [],
      students: [],
      attendanceRecords: [],
      boardingRecords: [],
      transactions: [],
      updatedAt: Date.now()
    }
  }, null, 2), 'utf-8');
  fs.writeFileSync(path.join(SIM_TABLES_DIR, 'registrations.json'), JSON.stringify([], null, 2), 'utf-8');
  fs.writeFileSync(path.join(SIM_TABLES_DIR, 'audit_logs.json'), JSON.stringify(cleanDatabase.auditLogs, null, 2), 'utf-8');
  console.log('✅ [4/5] Đã làm sạch các bảng dữ liệu trong Local Supabase Simulator.');
}

// 8. Kiểm tra và làm sạch thư mục lưu trữ ngoài (nếu có D:\DuLieu_LopHocHanhPhuc)
try {
  const storageConfigFile = path.join(DATA_DIR, 'storage_location.json');
  if (fs.existsSync(storageConfigFile)) {
    const sc = JSON.parse(fs.readFileSync(storageConfigFile, 'utf-8'));
    if (sc.customPath && fs.existsSync(sc.customPath)) {
      const files = fs.readdirSync(sc.customPath);
      const extBackup = path.join(sc.customPath, 'backups_old');
      if (!fs.existsSync(extBackup)) fs.mkdirSync(extBackup, { recursive: true });

      files.forEach(f => {
        const lower = f.toLowerCase();
        if (lower.startsWith('gvcn_') || lower === 'du_lieu_lop_hoc_hanh_phuc.json' || lower === 'classroom_database.json') {
          const oldFile = path.join(sc.customPath, f);
          fs.copyFileSync(oldFile, path.join(extBackup, f));
          fs.unlinkSync(oldFile);
          console.log(`📦 [Dọn ổ ngoài] Đã chuyển file cũ ${f} vào ${extBackup}`);
        }
      });
    }
  }
} catch (extErr) {
  console.warn('Lưu ý khi kiểm tra ổ lưu trữ ngoài:', extErr);
}

console.log('================================================================');
console.log('🎉 TỔNG KẾT TRẠNG THÁI HỆ THỐNG SAU KHI LÀM SẠCH:');
console.log(`   - Tài khoản duy nhất: ${adminquantriUser.username} (Mật khẩu: ${adminquantriUser.password})`);
console.log(`   - Tổng số trường học: 0 trường`);
console.log(`   - Tổng số lớp học:    0 lớp`);
console.log(`   - Tổng số học sinh:   0 em`);
console.log(`   - Bản sao lưu cũ tại: data/backups/backup_before_factory_reset_${timestamp}/`);
console.log('================================================================');
