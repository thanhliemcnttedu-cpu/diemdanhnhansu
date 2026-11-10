/**
 * 🔑 BẢN QUYỀN DÙNG CHUNG CẢ TRƯỜNG (Apps Script 1.1.7, 11/2026)
 * - Quản trị (tối cao / trường) kích hoạt CDKEY trên máy mình → `push()` gửi bản ghi ĐÃ KÝ (mã băm + chữ ký, không có
 *   mã CDKEY) lên Apps Script (`setLicense`, lưu ở Script Properties — không nằm trong thư mục Drive).
 * - Mọi máy đã kết nối đúng thư mục + Apps Script: `pull()` đọc `getLicense` → `licenseService.applySharedRecord`
 *   tự kiểm tra mã băm + chữ ký rồi kích hoạt đủ tính năng, không phải nhập CDKEY.
 * Gọi `sync()` lúc mở phần mềm và mỗi lần đổi tài khoản. Apps Script cũ (chưa có lệnh) → bỏ qua, không báo lỗi.
 */
import { licenseService } from './licenseService';
import { googleDriveService } from './googleDriveService';
import { schoolDriveDbService } from './schoolDriveDbService';
import { compareVersions } from './appsScriptSetupService';

const MIN_SCRIPT_VERSION = '1.1.7';

const PUSHED_KEY = 'lhhp_license_shared:';

function target(): { url: string; folderId: string } | null {
  try {
    const cfg = googleDriveService.getConfig();
    const url = googleDriveService.normalizeScriptUrl(cfg.scriptUrl);
    const folderId = (cfg.folderId || '').trim();
    return url && folderId ? { url, folderId } : null;
  } catch (_) { return null; }
}

export const licenseSyncService = {
  /** Máy chưa kích hoạt: lấy bản quyền dùng chung của trường. Trả về true nếu vừa kích hoạt. */
  async pull(): Promise<boolean> {
    if (licenseService.isActivated()) return false;
    const t = target();
    if (!t) return false;
    try {
      const sep = t.url.includes('?') ? '&' : '?';
      const res = await fetch(`${t.url}${sep}action=getLicense&folderId=${encodeURIComponent(t.folderId)}`);
      const data = await res.json();
      return Boolean(data?.success && data.record && licenseService.applySharedRecord(data.record));
    } catch (_) {
      return false;
    }
  },

  /** Quản trị đã kích hoạt: chia sẻ bản quyền cho cả trường (mỗi thư mục chỉ gửi lại khi bản ghi đổi). */
  async push(force = false): Promise<{ shared: boolean; message?: string }> {
    const rec = licenseService.getSignedRecord();
    const t = target();
    if (!rec || !t) return { shared: false };
    const auth = schoolDriveDbService.getAdminAuth();
    if (!auth) return { shared: false, message: 'Bản quyền mới áp dụng cho máy này (đăng nhập tài khoản Quản trị đã kết nối Drive để áp dụng cho cả trường).' };
    const mark = PUSHED_KEY + t.folderId;
    try { if (!force && localStorage.getItem(mark) === rec.sig) return { shared: true }; } catch (_) { /* ignore */ }
    // ⚠️ Apps Script cũ không có lệnh setLicense: lệnh POST lạ rơi vào nhánh "lưu tệp dữ liệu" → có thể ghi cả
    // thông tin đăng nhập thành tệp trong thư mục. Chỉ gửi khi Apps Script từ phiên bản 1.1.7.
    try {
      const sep = t.url.includes('?') ? '&' : '?';
      const ping = await (await fetch(`${t.url}${sep}action=ping`)).json();
      if (!ping?.version || compareVersions(String(ping.version), MIN_SCRIPT_VERSION) < 0) {
        return { shared: false, message: 'Muốn áp dụng bản quyền cho cả trường, cần cập nhật Apps Script lên phiên bản mới nhất.' };
      }
    } catch (_) { return { shared: false }; }
    try {
      const res = await fetch(t.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'setLicense', folderId: t.folderId, auth, record: rec }),
      });
      const data = await res.json();
      if (data?.success) {
        try { localStorage.setItem(mark, rec.sig); } catch (_) { /* ignore */ }
        return { shared: true };
      }
      return { shared: false, message: data?.message || '' };
    } catch (_) {
      return { shared: false };
    }
  },

  async sync(): Promise<void> {
    if (licenseService.isActivated()) await this.push();
    else await this.pull();
  },
};
