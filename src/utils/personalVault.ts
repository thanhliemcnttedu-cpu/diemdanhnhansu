/**
 * 🔐 KÉT CÁ NHÂN (11/2026) — mã hóa link Google Drive cá nhân (kho câu hỏi) bằng MẬT KHẨU của giáo viên,
 * để bản mã đi theo dữ liệu tài khoản (tệp lớp trên Drive trường / máy chủ) mà Quản trị, BGH không đọc được.
 * - Khóa = PBKDF2-SHA256(mật khẩu, "lhhp-quiz-vault|<tài khoản>", 150 000 vòng) → AES-GCM 256; mỗi lần khóa dùng IV mới.
 * - Khóa sinh lúc đăng nhập (lúc có mật khẩu), giữ trong IndexedDB dạng KHÔNG xuất được tới khi Đăng xuất.
 * - Đổi mật khẩu → bản mã cũ không mở được → giáo viên dán lại link một lần, phần mềm khóa lại bằng mật khẩu mới.
 * Không có Web Crypto (trang không an toàn) → bỏ qua lặng lẽ (vẫn dùng cấu hình theo máy như cũ).
 */
const enc = new TextEncoder();
const dec = new TextDecoder();
const hasCrypto = () => typeof crypto !== 'undefined' && !!crypto.subtle;

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; u8.forEach(x => { s += String.fromCharCode(x); });
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export interface SealedBox { i: string; c: string }

export async function deriveVaultKey(username: string, password: string): Promise<CryptoKey | null> {
  if (!hasCrypto() || !username || !password) return null;
  try {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode(`lhhp-quiz-vault|${username.trim().toLowerCase()}`), iterations: 150000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  } catch (_) { return null; }
}

export async function sealJSON(key: CryptoKey, obj: unknown): Promise<SealedBox | null> {
  if (!hasCrypto()) return null;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return { i: b64(iv), c: b64(c) };
  } catch (_) { return null; }
}

/** Mở bản mã; sai khóa (đổi mật khẩu) / hỏng → null */
export async function openJSON<T = any>(key: CryptoKey, box: SealedBox): Promise<T | null> {
  if (!hasCrypto() || !box?.i || !box?.c) return null;
  try {
    const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.i) }, key, unb64(box.c));
    return JSON.parse(dec.decode(p)) as T;
  } catch (_) { return null; }
}

/** Dấu vân tay (SHA-256) — so sánh cấu hình mà không lộ link */
export async function fingerprint(text: string): Promise<string> {
  if (!hasCrypto()) return text.length.toString(36);
  const h = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return b64(h).slice(0, 22);
}
