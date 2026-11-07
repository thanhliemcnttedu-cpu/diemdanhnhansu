import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backupsDir = path.join(__dirname, '..', 'data', 'backups');
if (fs.existsSync(backupsDir)) {
  const files = fs.readdirSync(backupsDir);
  for (const f of files) {
    const fullPath = path.join(backupsDir, f);
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log('Đã xóa tệp/thư mục sao lưu cũ:', f);
  }
} else {
  fs.mkdirSync(backupsDir, { recursive: true });
}

// Read current master database
const masterDbPath = path.join(__dirname, '..', 'data', 'classroom_database.json');
const dbContent = fs.readFileSync(masterDbPath, 'utf8');

// Generate timestamp string YYYYMMDD_HHmmss
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const tsStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

const timestampedBackupName = `classroom_database_backup_${tsStr}.json`;
const latestBackupName = 'classroom_database_backup_latest.json';

fs.writeFileSync(path.join(backupsDir, timestampedBackupName), dbContent, 'utf8');
fs.writeFileSync(path.join(backupsDir, latestBackupName), dbContent, 'utf8');

console.log('✅ Đã tạo bản sao lưu mới:', timestampedBackupName);
console.log('✅ Đã cập nhật bản sao lưu mới nhất:', latestBackupName);

// Also create backup of partition files for complete system safety
const partitionsBackupDir = path.join(backupsDir, `partitions_backup_${tsStr}`);
fs.mkdirSync(partitionsBackupDir, { recursive: true });

const partitionFolders = ['database_ca_nhan', 'database_nha_truong', 'database_quan_tri_admin'];
for (const pDir of partitionFolders) {
  const src = path.join(__dirname, '..', 'data', pDir);
  const dst = path.join(partitionsBackupDir, pDir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dst, { recursive: true });
    console.log('✅ Đã sao lưu phân vùng dữ liệu:', pDir);
  }
}

// Create an automated restore script for emergency one-click restore
const restoreScriptContent = `// SCRIPT KHÔI PHỤC TOÀN BỘ CƠ SỞ DỮ LIỆU TỪ BẢN SAO LƯU NÀY
// Chạy lệnh: node restore.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backupFile = path.join(__dirname, '${timestampedBackupName}');
const targetFile = path.join(__dirname, '..', 'classroom_database.json');

if (!fs.existsSync(backupFile)) {
  console.error('Không tìm thấy file backup:', backupFile);
  process.exit(1);
}

fs.copyFileSync(backupFile, targetFile);
console.log('✅ ĐÃ KHÔI PHỤC THÀNH CÔNG classroom_database.json từ bản backup:', backupFile);

const partDir = path.join(__dirname, 'partitions_backup_${tsStr}');
if (fs.existsSync(partDir)) {
  const folders = fs.readdirSync(partDir);
  for (const f of folders) {
    const s = path.join(partDir, f);
    const d = path.join(__dirname, '..', f);
    fs.cpSync(s, d, { recursive: true });
    console.log('✅ Đã khôi phục phân vùng:', f);
  }
}
console.log('🎉 HOÀN TẤT KHÔI PHỤC TOÀN HỆ THỐNG 100%!');
`;

fs.writeFileSync(path.join(backupsDir, 'restore.mjs'), restoreScriptContent, 'utf8');
console.log('✅ Đã tạo script khôi phục một chạm: restore.mjs');
