/**
 * CẤP MÃ BẢN QUYỀN cho một trường (chỉ tác giả chạy, cần khóa bí mật):
 *
 *   npm run license:issue -- --folder "<mã trường hoặc link thư mục Google Drive>" --school "Tên trường"
 *
 * - "Mã trường" là mã thư mục Google Drive dùng chung của trường; quản trị xem ở hộp "Bản quyền phần mềm" trong phần mềm.
 * - Mã in ra chỉ mở khóa cho ĐÚNG thư mục đó, vĩnh viễn. Gửi mã cho quản trị nhà trường để dán vào phần mềm.
 * - Mỗi lần cấp được ghi vào license-keys/issued.csv (sổ theo dõi của tác giả, không đưa lên kho).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? String(args[i + 1] || '').trim() : ''; };

const keyDir = path.join(root, 'license-keys');
const privFile = arg('--key') || path.join(keyDir, 'license-private-key.pem');
const rawFolder = arg('--folder');
const school = arg('--school');

if (!rawFolder || !school) {
  console.error('Cách dùng: npm run license:issue -- --folder "<mã trường hoặc link thư mục Drive>" --school "Tên trường"');
  process.exit(1);
}
if (!fs.existsSync(privFile)) {
  console.error('⛔ Chưa có khóa bí mật. Chạy "npm run license:keygen" một lần trước.');
  process.exit(1);
}
const m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(rawFolder) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(rawFolder);
const folderId = m ? m[1] : rawFolder;
if (!/^[A-Za-z0-9_-]{10,}$/.test(folderId)) {
  console.error(`⛔ Mã trường không hợp lệ: ${folderId}`);
  process.exit(1);
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const issuedAt = new Date().toISOString().slice(0, 10);
const serial = crypto.randomBytes(4).toString('hex');
const payload = { f: folderId, s: school.slice(0, 120), i: issuedAt, n: serial };
const signed = `LHHP2.${b64url(JSON.stringify(payload))}`;
const signature = crypto.sign('sha256', Buffer.from(signed, 'utf8'), { key: crypto.createPrivateKey(fs.readFileSync(privFile)), dsaEncoding: 'ieee-p1363' });
const code = `${signed}.${b64url(signature)}`;

const csv = path.join(keyDir, 'issued.csv');
fs.mkdirSync(keyDir, { recursive: true });
if (!fs.existsSync(csv)) fs.writeFileSync(csv, '﻿ngay_cap,so_cap,ten_truong,ma_truong\n');
fs.appendFileSync(csv, `${issuedAt},${serial},"${school.replace(/"/g, '""')}",${folderId}\n`);

console.log(`Trường     : ${school}`);
console.log(`Mã trường  : ${folderId}`);
console.log(`Ngày cấp   : ${issuedAt}   Số cấp: ${serial}`);
console.log('MÃ BẢN QUYỀN (gửi cho quản trị nhà trường, dán nguyên dòng):\n');
console.log(code);
console.log('');
