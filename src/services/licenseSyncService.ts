/**
 * 🔑 BẢN QUYỀN DÙNG CHUNG CẢ TRƯỜNG (Apps Script 1.1.7; bản quyền theo trường từ 1.1.11 — 11/2026)
 * - Quản trị (tối cao / trường) kích hoạt bản quyền trên máy mình → `push()` gửi bản ghi lên Apps Script
 *   (`setLicense`, lưu ở Script Properties — không nằm trong thư mục Drive):
 *     • bản quyền theo trường: chính mã bản quyền (đã ký cho đúng thư mục này, không dùng được ở trường khác) — cần Apps Script ≥ 1.1.11
 *     • kích hoạt kiểu cũ: mã băm + chữ ký, không có mã CDKEY — Apps Script ≥ 1.1.7
 * - Mọi máy đã kết nối đúng thư mục + Apps Script: `pull()` đọc `getLicense` → `licenseService.applySharedRecordAsync`
 *   tự kiểm tra chữ ký rồi kích hoạt đủ tính năng, không phải nhập mã.
 * Gọi `sync()` lúc mở phần mềm và mỗi lần đổi tài khoản. Apps Script cũ (chưa có lệnh) → bỏ qua, không báo lỗi.
 */
import { licenseService } from './licenseService';
import { googleDriveService } from './googleDriveService';
import { schoolDriveDbService } from './schoolDriveDbService';
import { compareVersions } from './appsScriptSetupService';

const MIN_SCRIPT_VERSION = '1.1.7';
/** School licence codes are stored by Apps Script from this version on */
const MIN_SCRIPT_VERSION_SCHOOL_LICENSE = '1.1.11';

const PUSHED_KEY = 'lhhp_license_shared:';

/**
 * What the school's Apps Script says about the school licence:
 * - 'licensed'   : this machine is (now) activated
 * - 'unlicensed' : the script answered and the school has no (valid) licence
 * - 'unknown'    : not connected, script unreachable or too old to answer → callers must not lock anything on this
 */
export type SchoolLicenseStatus = 'licensed' | 'unlicensed' | 'unknown';

function target(): { url: string; folderId: string } | null {
  try {
    const cfg = googleDriveService.getConfig();
    const url = googleDriveService.normalizeScriptUrl(cfg.scriptUrl);
    const folderId = (cfg.folderId || '').trim();
    return url && folderId ? { url, folderId } : null;
  } catch (_) { return null; }
}

export const licenseSyncService = {
  /** Read the school-wide licence and activate this machine when it is valid */
  async check(): Promise<SchoolLicenseStatus> {
    licenseService.refresh();
    if (licenseService.isActivated()) return 'licensed';
    const t = target();
    if (!t) return 'unknown';
    try {
      const sep = t.url.includes('?') ? '&' : '?';
      const res = await fetch(`${t.url}${sep}action=getLicense&folderId=${encodeURIComponent(t.folderId)}`);
      const data = await res.json();
      // An Apps Script older than 1.1.7 does not know getLicense: its answer has no `record` field
      if (!data || data.success !== true || !('record' in data)) return 'unknown';
      if (data.record && await licenseService.applySharedRecordAsync(data.record)) return 'licensed';
      return licenseService.isActivated() ? 'licensed' : 'unlicensed';
    } catch (_) {
      return 'unknown';
    }
  },

  /**
   * Licence of the school behind a given Apps Script + folder (stand-alone staff check-in page opened from a link).
   * Nothing is activated or stored on this device.
   */
  async checkFor(conn: { scriptUrl: string; folderId: string } | null): Promise<SchoolLicenseStatus> {
    const url = conn ? googleDriveService.normalizeScriptUrl(conn.scriptUrl) : '';
    const folderId = conn ? String(conn.folderId || '').trim() : '';
    if (!url || !folderId) return 'unknown';
    try {
      const sep = url.includes('?') ? '&' : '?';
      const res = await fetch(`${url}${sep}action=getLicense&folderId=${encodeURIComponent(folderId)}`);
      const data = await res.json();
      if (!data || data.success !== true || !('record' in data)) return 'unknown';
      return (await licenseService.isValidRecordFor(data.record, folderId)) ? 'licensed' : 'unlicensed';
    } catch (_) {
      return 'unknown';
    }
  },

  /** Máy chưa kích hoạt: lấy bản quyền dùng chung của trường. Trả về true nếu vừa kích hoạt. */
  async pull(): Promise<boolean> {
    if (licenseService.isActivated()) return false;
    return (await this.check()) === 'licensed';
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
    // thông tin đăng nhập thành tệp trong thư mục. Chỉ gửi khi Apps Script đủ phiên bản.
    const needed = rec.v === 2 ? MIN_SCRIPT_VERSION_SCHOOL_LICENSE : MIN_SCRIPT_VERSION;
    try {
      const sep = t.url.includes('?') ? '&' : '?';
      const ping = await (await fetch(`${t.url}${sep}action=ping`)).json();
      if (!ping?.version || compareVersions(String(ping.version), needed) < 0) {
        return { shared: false, message: `Bản quyền mới áp dụng cho máy này. Muốn áp dụng cho cả trường, cần cập nhật Apps Script lên phiên bản ${needed} trở lên (Dữ liệu → Google Drive của trường & Apps Script), rồi mở lại hộp Bản quyền.` };
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
    licenseService.refresh();
    if (licenseService.isActivated()) await this.push();
    else await this.pull();
  },
};
