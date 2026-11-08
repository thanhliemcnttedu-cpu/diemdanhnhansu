/**
 * Dấu "đã nhận điều chỉnh của Quản trị" trên máy giáo viên.
 *
 * Mỗi điều chỉnh của Quản trị tối cao / Quản trị nhà trường / BGH (tệp dieuchinh_quantri.json trên Drive)
 * có khóa `${kind}:${id}` và thời điểm `at`. Khi máy GVCN đã áp điều chỉnh vào lớp mình, ghi lại
 * { [khóa]: at } ở đây và gửi kèm trong metadata tệp lớp (gvcn_*.json) để màn tổng hợp biết
 * dữ liệu của GVCN đã chứa điều chỉnh đó.
 *
 * Module này cố ý KHÔNG import service nào khác (tránh vòng phụ thuộc).
 */
export type AppliedAdminEdits = Record<string, number>;

const APPLIED_PREFIX = 'lhhp_applied_admin_edits_';

export function getAppliedAdminEdits(username?: string | null): AppliedAdminEdits {
  const u = (username || '').trim().toLowerCase();
  if (!u) return {};
  try {
    const raw = localStorage.getItem(APPLIED_PREFIX + u);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

/** Gộp (giữ thời điểm lớn nhất cho từng khóa) rồi lưu. */
export function mergeAppliedAdminEdits(username: string | null | undefined, incoming: AppliedAdminEdits | null | undefined): AppliedAdminEdits {
  const u = (username || '').trim().toLowerCase();
  const current = getAppliedAdminEdits(u);
  if (!u || !incoming || typeof incoming !== 'object') return current;
  let changed = false;
  for (const [k, v] of Object.entries(incoming)) {
    const at = Number(v) || 0;
    if (at > (current[k] || 0)) {
      current[k] = at;
      changed = true;
    }
  }
  if (changed) {
    try { localStorage.setItem(APPLIED_PREFIX + u, JSON.stringify(current)); } catch (_) {}
  }
  return current;
}
