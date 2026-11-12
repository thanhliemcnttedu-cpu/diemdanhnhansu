/**
 * Tạo cặp khóa BẢN QUYỀN của tác giả (chạy MỘT LẦN):  npm run license:keygen
 *
 * - Khóa bí mật   → license-keys/license-private-key.pem   (KHÔNG đưa lên kho, KHÔNG gửi cho ai; chép dự phòng ra nơi an toàn)
 * - Khóa công khai → src/services/licensePublicKey.ts       (nằm trong phần mềm, chỉ dùng để KIỂM TRA mã bản quyền)
 *
 * Ai có khóa bí mật thì cấp được bản quyền. Mất khóa bí mật = không cấp được mã mới cho các bản phần mềm đã phát hành.
 * Đổi khóa = mọi mã đã cấp hết hiệu lực trên bản phần mềm mới. Script từ chối ghi đè khóa đang có.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const keyDir = path.join(root, 'license-keys');
const privFile = path.join(keyDir, 'license-private-key.pem');
const pubFile = path.join(root, 'src', 'services', 'licensePublicKey.ts');

if (fs.existsSync(privFile)) {
  console.error('⛔ Đã có khóa bí mật (license-keys/license-private-key.pem). Không ghi đè.');
  process.exit(1);
}
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = publicKey.export({ format: 'jwk' });
fs.mkdirSync(keyDir, { recursive: true });
fs.writeFileSync(privFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(pubFile, `/**
 * PUBLIC key that checks school licence codes (ECDSA P-256). Written by scripts/license-keygen.cjs.
 * It can only VERIFY codes; the matching private key stays with the author (license-keys/, never committed).
 */
export const LICENSE_PUBLIC_JWK: { kty: string; crv: string; x: string; y: string } | null = ${JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y })};
`);
console.log('✅ Đã tạo khóa bản quyền.');
console.log('   Khóa công khai : src/services/licensePublicKey.ts');
console.log('   Khóa bí mật    : license-keys/license-private-key.pem  ← chép dự phòng, không gửi cho ai, không đưa lên kho');
