/**
 * Phát hành GÓI CẬP NHẬT GIAO DIỆN cho bản Desktop (cập nhật nóng, người dùng không phải cài lại):
 *   npm run release:desktop-ui -- --notes "Nội dung thay đổi"
 *
 * 1. vite build → dist/   (bỏ qua bằng --skip-build)
 * 2. Nén dist/ + ui-version.json → release-ui/ui-<phiên bản>.zip
 * 3. Ghi release-ui/ui-manifest.json (phiên bản, dung lượng, SHA-256, chữ ký Ed25519)
 *
 * Sau đó đưa 2 tệp trong release-ui/ lên kênh cập nhật (địa chỉ ở desktop-lite/update-config.json).
 * Phiên bản lấy từ package.json → PHẢI tăng số phiên bản trước mỗi lần phát hành.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const { signedText, verifySignature } = require('../desktop-lite/updater.cjs');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const argValue = (name) => { const i = args.indexOf(name); return i >= 0 ? String(args[i + 1] || '') : ''; };

// --ui-version is for tests only; a real release takes the version from package.json
const version = argValue('--ui-version') || JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const config = JSON.parse(fs.readFileSync(path.join(root, 'desktop-lite', 'update-config.json'), 'utf8'));
const privFile = argValue('--key') || path.join(root, 'desktop-lite', 'keys', 'update-private-key.pem');
const pubFile = path.join(root, 'desktop-lite', 'update-public-key.pem');
const distDir = argValue('--dist') || path.join(root, 'dist');
const outDir = argValue('--out') || path.join(root, 'release-ui');

if (!/^\d+(\.\d+){1,3}$/.test(version)) { console.error(`⛔ Phiên bản trong package.json không hợp lệ: ${version}`); process.exit(1); }
if (!fs.existsSync(privFile) || !fs.existsSync(pubFile)) {
  console.error('⛔ Chưa có khóa ký. Chạy "npm run desktop:keygen" một lần trước.');
  process.exit(1);
}

if (!args.includes('--skip-build')) {
  // Build WITHOUT this machine's .env: the package goes to every school, so it must not carry the
  // developer's VITE_SUPABASE_* / VITE_DRIVE_* values (the installer is built on CI, where there is no .env).
  // VITE_* variables set on purpose in the shell environment are still honoured.
  console.log('▶ Build giao diện web (vite build, không đọc tệp .env của máy)…');
  const emptyEnvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhhp-ui-env-'));
  execFileSync(process.execPath, [
    '-e',
    "import('vite').then(v => v.build({ envDir: process.argv[1] })).catch(e => { console.error(e); process.exit(1); })",
    emptyEnvDir,
  ], { cwd: root, stdio: 'inherit' });
}
if (!fs.existsSync(path.join(distDir, 'index.html'))) { console.error('⛔ Không thấy dist/index.html.'); process.exit(1); }

(async () => {
  const zip = new JSZip();
  const add = (dir, prefix) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) add(full, rel);
      else if (rel !== 'ui-version.json') zip.file(rel, fs.readFileSync(full));
    }
  };
  add(distDir, '');
  zip.file('ui-version.json', JSON.stringify({ version, builtAt: new Date().toISOString() }));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });

  fs.mkdirSync(outDir, { recursive: true });
  const file = `ui-${version}.zip`;
  fs.writeFileSync(path.join(outDir, file), buffer);

  const manifest = {
    version,
    file,
    size: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    minShell: String(config.minShell || ''),
    notes: argValue('--notes'),
    releasedAt: new Date().toISOString(),
  };
  manifest.signature = crypto.sign(null, Buffer.from(signedText(manifest), 'utf8'), crypto.createPrivateKey(fs.readFileSync(privFile))).toString('base64');
  if (!verifySignature(manifest, fs.readFileSync(pubFile, 'utf8'))) {
    console.error('⛔ Chữ ký không khớp khóa công khai trong desktop-lite/update-public-key.pem (sai khóa bí mật?).');
    process.exit(1);
  }
  fs.writeFileSync(path.join(outDir, 'ui-manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`✅ ${path.relative(root, path.join(outDir, file))} – ${(buffer.length / 1048576).toFixed(1)} MB`);
  console.log(`✅ ${path.relative(root, path.join(outDir, 'ui-manifest.json'))} – bản ${version}, cần vỏ từ ${manifest.minShell || '(bất kỳ)'}`);
  console.log(`▶ Đưa 2 tệp trên lên kênh cập nhật: ${config.manifestUrl || '(chưa cấu hình manifestUrl)'}`);
})().catch((e) => { console.error(e); process.exit(1); });
