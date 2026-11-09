/**
 * 🧭 Trợ giúp cài đặt / cập nhật Google Apps Script của nhà trường (không cần máy chủ, không cần đăng ký Google Cloud).
 * - Đọc phiên bản mã đang đóng gói trong phần mềm (scripts/google_apps_script.js → SCRIPT_VERSION).
 * - Chẩn đoán link /exec: đúng định dạng? đã mở "Bất kỳ ai"? Google đang chạy phiên bản nào? script mở được thư mục chưa?
 * - Kiểm tra cập nhật (dùng cho thông báo "Cần cập nhật Apps Script" trên thanh trên), nhớ kết quả 30 phút trong phiên.
 */
import { googleDriveService } from './googleDriveService';

export const OPEN_APPS_SCRIPT_WIZARD_EVENT = 'lhhp:open-apps-script-wizard';
const UPDATE_CHECK_KEY = 'lhhp_gas_version_check';

export type CheckState = 'ok' | 'fail' | 'warn' | 'skip';
export interface SetupCheck { key: 'url' | 'access' | 'version' | 'folder'; label: string; state: CheckState; detail: string }

/** So sánh "4.10" > "4.5" theo từng phần số */
export function compareVersions(a: string, b: string): number {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function fetchJson(url: string, timeoutMs = 20000): Promise<{ ok: boolean; data?: any; html?: boolean; error?: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    try { return { ok: true, data: JSON.parse(text) }; } catch (_) { return { ok: false, html: /<html|<!doctype/i.test(text) }; }
  } catch (e: any) {
    return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(t);
  }
}

export const appsScriptSetupService = {
  /** Phiên bản mã Apps Script đóng gói trong phần mềm (ví dụ "4.5") */
  getBundledVersion(): string {
    const m = /var\s+SCRIPT_VERSION\s*=\s*"([\d.]+)"/.exec(googleDriveService.generateAppsScriptCode(''));
    return m ? m[1] : '';
  },

  /** Mã đầy đủ để dán vào Apps Script (đã điền sẵn mã thư mục) */
  buildCode(folderId: string): string {
    return googleDriveService.generateAppsScriptCode(folderId);
  },

  /** Phân loại link người dùng dán vào */
  classifyUrl(raw: string): { url: string; problem: string } {
    const url = googleDriveService.normalizeScriptUrl(raw || '');
    if (!url) return { url, problem: 'Chưa dán link.' };
    if (/script\.google\.com\/(home|d\/)|\/edit(\?|$)/.test(url)) {
      return { url, problem: 'Đây là link trang soạn mã. Cần link "URL ứng dụng web" (có đuôi /exec) hiện ra sau khi bấm Triển khai.' };
    }
    if (url.endsWith('/dev')) return { url, problem: 'Link đuôi /dev là bản thử. Hãy dùng "URL ứng dụng web" đuôi /exec.' };
    const isLocalTest = /^http:\/\/(localhost|127\.0\.0\.1):\d+\/exec$/.test(url); // Apps Script giả lập khi phát triển
    if (!isLocalTest && !/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) {
      return { url, problem: 'Link không đúng dạng https://script.google.com/macros/s/…/exec' };
    }
    return { url, problem: '' };
  },

  /** Chẩn đoán đầy đủ 4 bước; dừng sớm khi bước trước hỏng */
  async diagnose(rawUrl: string, folderId: string): Promise<{ checks: SetupCheck[]; url: string; version: string; allOk: boolean }> {
    const latest = this.getBundledVersion();
    const checks: SetupCheck[] = [];
    const { url, problem } = this.classifyUrl(rawUrl);
    checks.push({ key: 'url', label: 'Định dạng link', state: problem ? 'fail' : 'ok', detail: problem || 'Đúng dạng link ứng dụng web (/exec).' });
    if (problem) return { checks, url, version: '', allOk: false };

    const ping = await fetchJson(`${url}?action=ping`);
    if (!ping.ok || !ping.data?.success) {
      checks.push({
        key: 'access', label: 'Quyền truy cập "Bất kỳ ai"', state: 'fail',
        detail: ping.error === 'timeout'
          ? 'Google phản hồi quá lâu. Kiểm tra mạng rồi bấm Kiểm tra lại.'
          : 'Không đọc được phản hồi. Thường do: (1) "Người có quyền truy cập" chưa chọn Bất kỳ ai, hoặc (2) chưa bấm Cấp quyền truy cập khi triển khai. Mở lại Triển khai → Quản lý các tùy chọn triển khai để sửa.',
      });
      return { checks, url, version: '', allOk: false };
    }
    checks.push({ key: 'access', label: 'Quyền truy cập "Bất kỳ ai"', state: 'ok', detail: 'Script trả lời bình thường, ai cũng gọi được.' });

    const version = String(ping.data.version || '');
    // Ghi nhớ ngay để chip trên thanh trên đổi trạng thái (không phải chờ bấm Lưu / hết 30 phút)
    this.rememberVersion(url, version);
    const cmp = compareVersions(version, latest);
    checks.push(cmp >= 0
      ? { key: 'version', label: 'Phiên bản mã', state: 'ok', detail: `Google đang chạy V${version} (mới nhất: V${latest}).` }
      : { key: 'version', label: 'Phiên bản mã', state: 'fail', detail: `Google VẪN chạy V${version || '?'} (cần V${latest}). Dán mã mới, Lưu, rồi Triển khai → Quản lý các tùy chọn triển khai → bút chì → Phiên bản: Phiên bản mới → Triển khai.` });

    if (!folderId) {
      checks.push({ key: 'folder', label: 'Mở được thư mục Drive', state: 'skip', detail: 'Chưa có link thư mục để kiểm tra.' });
    } else {
      const ls = await fetchJson(`${url}?action=listSchools&folderId=${encodeURIComponent(folderId)}`);
      if (ls.ok && ls.data?.success) {
        const n = Array.isArray(ls.data.schools) ? ls.data.schools.length : 0;
        checks.push({ key: 'folder', label: 'Mở được thư mục Drive', state: 'ok', detail: ls.data.initialized ? `Đã thấy cơ sở dữ liệu nhà trường (${n} trường).` : 'Mở được thư mục (chưa có CSDL trường — Quản trị đăng nhập để khởi tạo).' });
      } else {
        checks.push({ key: 'folder', label: 'Mở được thư mục Drive', state: 'fail', detail: `Script không mở được thư mục${ls.data?.message ? ` (${ls.data.message})` : ''}. Kiểm tra lại link thư mục, và tài khoản Google đã triển khai script phải là chủ hoặc có quyền chỉnh sửa thư mục.` });
      }
    }
    return { checks, url, version, allOk: checks.every(c => c.state === 'ok' || c.state === 'skip') };
  },

  /** Kiểm tra cập nhật cho link đang dùng (nhớ 30 phút trong phiên) */
  async checkForUpdate(force = false): Promise<{ current: string; latest: string; outdated: boolean } | null> {
    const cfg = googleDriveService.getConfig();
    const { url, problem } = this.classifyUrl(cfg.scriptUrl || '');
    if (problem) return null;
    const latest = this.getBundledVersion();
    try {
      const cached = JSON.parse(sessionStorage.getItem(UPDATE_CHECK_KEY) || 'null');
      if (!force && cached && cached.url === url && Date.now() - cached.at < 10 * 60 * 1000) {
        return { current: cached.version, latest, outdated: Boolean(cached.version) && compareVersions(cached.version, latest) < 0 };
      }
    } catch (_) { /* ignore */ }
    const ping = await fetchJson(`${url}?action=ping`, 15000);
    if (!ping.ok || !ping.data?.success) return null;
    const version = String(ping.data.version || '');
    try { sessionStorage.setItem(UPDATE_CHECK_KEY, JSON.stringify({ url, version, at: Date.now() })); } catch (_) { /* ignore */ }
    return { current: version, latest, outdated: Boolean(version) && compareVersions(version, latest) < 0 };
  },

  rememberVersion(url: string, version: string) {
    try {
      const cfgUrl = googleDriveService.normalizeScriptUrl(googleDriveService.getConfig().scriptUrl || '');
      if (cfgUrl && cfgUrl === url) {
        sessionStorage.setItem(UPDATE_CHECK_KEY, JSON.stringify({ url, version, at: Date.now() }));
        window.dispatchEvent(new Event('lhhp:apps-script-checked'));
      }
    } catch (_) { /* ignore */ }
  },

  clearUpdateCache() {
    try { sessionStorage.removeItem(UPDATE_CHECK_KEY); } catch (_) { /* ignore */ }
  },

  open(mode?: 'install' | 'update') {
    window.dispatchEvent(new CustomEvent(OPEN_APPS_SCRIPT_WIZARD_EVENT, { detail: { mode } }));
  },
};
