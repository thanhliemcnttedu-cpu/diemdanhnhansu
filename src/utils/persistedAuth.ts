/**
 * 🔐 Phiên Quản trị / BGH nhớ TRÊN MÁY này cho tới khi ĐĂNG XUẤT.
 * Apps Script không biết ai đã đăng nhập phần mềm nên mọi lệnh đọc / ghi CSDL, chấm công vẫn phải gửi kèm tài khoản.
 * Trước đây chỉ nhớ trong phiên trình duyệt (sessionStorage) → đóng trình duyệt / mở tab mới là bị hỏi lại mật khẩu.
 * Nay lưu ở localStorage (mã hóa nhẹ, không để chữ thô), xóa khi Đăng xuất hoặc khi Apps Script từ chối (đổi mật khẩu nơi khác).
 * Chỉ dùng cho tài khoản quản lý (Quản trị tối cao / Quản trị trường / BGH); giáo viên không có phiên này.
 */
const KEY = 'lhhp_mgr_auth_v1';
const SALT = 'LHHP-mgr-2026';

export interface ManagerAuth { username: string; password: string; isAdmin: boolean }

const xor = (s: string) => Array.from(s).map((ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ SALT.charCodeAt(i % SALT.length))).join('');
const encode = (o: ManagerAuth) => btoa(unescape(encodeURIComponent(xor(JSON.stringify(o)))));
const decode = (raw: string): ManagerAuth | null => {
  try {
    const o = JSON.parse(xor(decodeURIComponent(escape(atob(raw)))));
    return o && o.username && o.password ? { username: String(o.username).toLowerCase(), password: String(o.password), isAdmin: Boolean(o.isAdmin) } : null;
  } catch (_) { return null; }
};

export function saveManagerAuth(username: string, password: string, isAdmin?: boolean) {
  if (!username || !password) return;
  const key = username.trim().toLowerCase();
  const prev = readManagerAuth();
  const admin = isAdmin ?? Boolean(prev && prev.username === key && prev.isAdmin);
  try { localStorage.setItem(KEY, encode({ username: key, password, isAdmin: admin })); } catch (_) { /* ignore */ }
}

export function readManagerAuth(): ManagerAuth | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? decode(raw) : null;
  } catch (_) { return null; }
}

export function clearManagerAuth() {
  try { localStorage.removeItem(KEY); } catch (_) { /* ignore */ }
}
