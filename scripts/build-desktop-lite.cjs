/**
 * Đóng gói BẢN CÀI ĐẶT GỌN (setup.exe) – chạy giống hệt bản web.
 *   npm run package:win:lite
 *
 * 1. vite build → dist/
 * 2. Gom vào desktop-lite/app/: main.cjs, preload.cjs, icon.ico, dist/ và package.json KHÔNG có dependencies
 *    (để electron-builder không chép node_modules → bộ cài nhẹ).
 * 3. electron-builder --config electron-builder.lite.json → release-lite/LopHocHanhPhuc_Setup.exe
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const stage = path.join(root, 'desktop-lite', 'app');
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version;

const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env } });

if (!process.argv.includes('--skip-build')) {
  console.log('▶ Build giao diện web (vite build)…');
  run('npx vite build');
}

console.log('▶ Chuẩn bị thư mục đóng gói desktop-lite/app …');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
fs.cpSync(path.join(root, 'dist'), path.join(stage, 'dist'), { recursive: true });
fs.copyFileSync(path.join(root, 'desktop-lite', 'main.cjs'), path.join(stage, 'main.cjs'));
fs.copyFileSync(path.join(root, 'desktop-lite', 'preload.cjs'), path.join(stage, 'preload.cjs'));
fs.copyFileSync(path.join(root, 'public', 'icon.ico'), path.join(stage, 'icon.ico'));
// Hot update of the UI (desktop-lite/updater.cjs): updater + channel + author's public key + version of the bundled UI
fs.copyFileSync(path.join(root, 'desktop-lite', 'updater.cjs'), path.join(stage, 'updater.cjs'));
fs.copyFileSync(path.join(root, 'desktop-lite', 'update-config.json'), path.join(stage, 'update-config.json'));
const updateKey = path.join(root, 'desktop-lite', 'update-public-key.pem');
if (fs.existsSync(updateKey)) fs.copyFileSync(updateKey, path.join(stage, 'update-public-key.pem'));
else console.warn('⚠ Chưa có desktop-lite/update-public-key.pem (chạy "npm run desktop:keygen") → bộ cài này KHÔNG tự cập nhật được.');
fs.writeFileSync(path.join(stage, 'dist', 'ui-version.json'), JSON.stringify({ version: rootPkg.version, builtAt: new Date().toISOString() }));
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({
  name: 'lop-hoc-hanh-phuc-desktop',
  productName: 'LopHocHanhPhuc',
  version: rootPkg.version && rootPkg.version !== '0.0.0' ? rootPkg.version : '1.0.0',
  description: 'Lớp Học Hạnh Phúc – bản cài đặt gọn (kết nối Google Drive như bản web)',
  author: 'Nguyễn Thanh Liêm',
  main: 'main.cjs',
  license: 'UNLICENSED',
}, null, 2));

const sizeOf = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .reduce((s, e) => s + (e.isDirectory() ? sizeOf(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`  Ứng dụng: ${(sizeOf(stage) / 1048576).toFixed(1)} MB (Electron ${electronVersion})`);

console.log('▶ Đóng gói setup.exe (electron-builder)…');
run(`npx electron-builder --win --x64 --config electron-builder.lite.json -c.electronVersion=${electronVersion}`);

const out = path.join(root, 'release-lite');
fs.readdirSync(out).filter(f => f.endsWith('.exe')).forEach(f => {
  console.log(`✅ ${path.join('release-lite', f)} – ${(fs.statSync(path.join(out, f)).size / 1048576).toFixed(1)} MB`);
});
