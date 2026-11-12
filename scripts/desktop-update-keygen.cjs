/**
 * Tạo cặp khóa ký bản cập nhật giao diện cho bản Desktop (chạy MỘT LẦN):  npm run desktop:keygen
 *
 * - Khóa công khai  → desktop-lite/update-public-key.pem  (đưa vào bộ cài, được phép đưa lên kho mã)
 * - Khóa bí mật     → desktop-lite/keys/update-private-key.pem  (KHÔNG đưa lên kho; hãy chép dự phòng ra USB)
 *
 * Mất khóa bí mật = không phát hành được bản cập nhật nóng cho các máy đã cài; khi đó phải phát hành bộ cài mới.
 * Script từ chối ghi đè khóa đang có.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pubFile = path.join(root, 'desktop-lite', 'update-public-key.pem');
const keyDir = path.join(root, 'desktop-lite', 'keys');
const privFile = path.join(keyDir, 'update-private-key.pem');

if (fs.existsSync(privFile) || fs.existsSync(pubFile)) {
  console.error('⛔ Đã có khóa (desktop-lite/update-public-key.pem hoặc desktop-lite/keys/update-private-key.pem). Không ghi đè.');
  process.exit(1);
}
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.mkdirSync(keyDir, { recursive: true });
fs.writeFileSync(privFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(pubFile, publicKey.export({ type: 'spki', format: 'pem' }));
console.log('✅ Đã tạo khóa ký bản cập nhật.');
console.log('   Khóa công khai : desktop-lite/update-public-key.pem');
console.log('   Khóa bí mật    : desktop-lite/keys/update-private-key.pem  ← chép dự phòng, không gửi cho ai, không đưa lên kho');
