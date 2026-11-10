/**
 * 🔐 Phiên tài khoản GIÁO VIÊN (tài khoản dùng chung với chấm công, có `staffCode`) nhớ TRÊN MÁY tới khi ĐĂNG XUẤT.
 * Dùng cho mục "Chấm công của tôi": Apps Script (1.1.6) nhận `account: {username, password}` thay cho số CCCD + mật khẩu
 * điểm danh → giáo viên đã đăng nhập phần mềm thì vào thẳng, không hỏi lại mật khẩu.
 * Lưu ở localStorage, mã hóa nhẹ (không để chữ thô); xóa khi Đăng xuất hoặc khi Apps Script từ chối (đã đổi mật khẩu).
 */
const KEY = 'lhhp_teacher_auth_v1';
const SALT = 'LHHP-gv-2026';

export interface TeacherAuth { username: string; password: string }

const xor = (s: string) => Array.from(s).map((ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ SALT.charCodeAt(i % SALT.length))).join('');

export function saveTeacherAuth(username: string, password: string) {
  if (!username || !password) return;
  try { localStorage.setItem(KEY, btoa(unescape(encodeURIComponent(xor(JSON.stringify({ username: username.trim().toLowerCase(), password })))))); } catch (_) { /* ignore */ }
}

export function readTeacherAuth(): TeacherAuth | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(xor(decodeURIComponent(escape(atob(raw)))));
    return o && o.username && o.password ? { username: String(o.username), password: String(o.password) } : null;
  } catch (_) { return null; }
}

export function clearTeacherAuth() {
  try { localStorage.removeItem(KEY); } catch (_) { /* ignore */ }
}
