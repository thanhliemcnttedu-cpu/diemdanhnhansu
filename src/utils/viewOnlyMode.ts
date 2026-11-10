/**
 * 👁️ CHẾ ĐỘ CHỈ XEM — Quản trị / BGH bấm "Vào xem" lớp của một giáo viên.
 * Không đổi phiên đăng nhập (localStorage vẫn là tài khoản quản trị → tải lại trang là tự quay về).
 * Khi bật: mọi lệnh GHI (lưu dữ liệu, đẩy Drive, điều chỉnh của Quản trị, nhật ký) đều bị bỏ qua ở tầng dịch vụ,
 * giao diện chặn mọi nút / ô nhập trong vùng nội dung (App.tsx).
 */
export interface ViewAsInfo {
  adminUsername: string;
  adminFullName: string;
  targetUsername: string;
  targetFullName: string;
  targetRole: string;
  className?: string;
  /** Ghi chú hiện trên dải chỉ xem (vd. giáo viên chưa có dữ liệu lớp) */
  note?: string;
}

let current: ViewAsInfo | null = null;
const listeners = new Set<(v: ViewAsInfo | null) => void>();

export function isViewOnly(): boolean {
  return current !== null;
}

export function getViewAs(): ViewAsInfo | null {
  return current;
}

export function setViewAs(v: ViewAsInfo | null) {
  current = v;
  try { (window as any).__lhhpViewOnly = Boolean(v); } catch (_) { /* ignore */ }
  listeners.forEach(fn => { try { fn(current); } catch (_) { /* ignore */ } });
}

export function subscribeViewAs(fn: (v: ViewAsInfo | null) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
