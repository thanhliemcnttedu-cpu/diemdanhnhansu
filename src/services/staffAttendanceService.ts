/**
 * 👩‍🏫 CHẤM CÔNG (ĐIỂM DANH) GIÁO VIÊN – NHÂN VIÊN TOÀN TRƯỜNG
 *
 * - Dữ liệu nằm trong thư mục Drive dùng chung, do Apps Script V4.2+ quản lý (V4.3: Quản trị xem đủ số CCCD):
 *   nhansu_truong.json (CCCD + mật khẩu chỉ lưu dạng băm) và chamcong_nhansu_YYYY-MM.json.
 * - Nhân sự điểm danh tại trang /diemdanh bằng số CCCD + mật khẩu điểm danh; NGÀY do máy chủ quyết định.
 * - Quản trị (admin / school_admin) quản lý danh sách; BGH + Quản trị xem tổng hợp (cần mật khẩu phiên).
 */
import { googleDriveService } from './googleDriveService';
import { saveManagerAuth, readManagerAuth, clearManagerAuth } from '../utils/persistedAuth';

export type StaffStatus = 'present' | 'business_trip' | 'sick_leave' | 'personal_unpaid';
/** Thứ tự hiển thị trạng thái (Đi công tác = có làm việc, tính vào tỷ lệ đi làm) */
export const STAFF_STATUS_ORDER: Array<StaffStatus | 'missing'> = ['present', 'business_trip', 'sick_leave', 'personal_unpaid', 'missing'];

export const STAFF_STATUS_META: Record<StaffStatus | 'missing', { label: string; short: string; color: string; soft: string; text: string }> = {
  present: { label: 'Có mặt đi làm', short: 'Có mặt', color: '#047857', soft: '#ecfdf5', text: '#065f46' },
  business_trip: { label: 'Đi công tác', short: 'Công tác', color: '#1d4ed8', soft: '#eff6ff', text: '#1e40af' },
  sick_leave: { label: 'Nghỉ ốm có phép', short: 'Nghỉ ốm', color: '#b45309', soft: '#fffbeb', text: '#92400e' },
  personal_unpaid: { label: 'Nghỉ việc riêng không hưởng lương', short: 'Việc riêng', color: '#be123c', soft: '#fff1f2', text: '#9f1239' },
  missing: { label: 'Chưa điểm danh', short: 'Chưa ĐD', color: '#64748b', soft: '#f1f5f9', text: '#334155' },
};

export interface StaffMember {
  code: string;
  name: string;
  position?: string;
  dept?: string;
  gender?: string;
  phone?: string;
  order?: number;
  cccdLast4?: string;
  disabled?: boolean;
  hasPin?: boolean;
  currentPin?: string;
  /** Số CCCD đầy đủ (Apps Script 4.3: chỉ Quản trị; 4.4: lưu trong hồ sơ, trả về trường `cccd`) */
  currentCccd?: string;
  cccd?: string;
  updatedAt?: string;
}

/** Khóa chốt số liệu điểm danh của 1 ngày (Apps Script 4.5): khóa tất cả hoặc từng mã GV */
export interface StaffDayLock { all?: boolean; codes?: Record<string, boolean>; at?: string; by?: string }
export const isLockedFor = (L: StaffDayLock | null | undefined, code: string) => Boolean(L && (L.all || L.codes?.[code]));

export interface StaffAttempt { status: StaffStatus; note?: string; at: string; by?: string }
/** `by` + `proxy`: BGH / Quản trị điểm danh hộ (Apps Script 4.7) */
export interface StaffRecord { status: StaffStatus; note?: string; at: string; firstAt?: string; edits?: number; attempt?: number; history?: StaffAttempt[]; by?: string; proxy?: boolean }

/** Lần điểm danh hiện tại trong ngày (1 = lần đầu) */
export const attemptOf = (r?: StaffRecord | null) => (r ? r.attempt || (r.history?.length) || (r.edits || 0) + 1 : 0);
/** Ghi chú hệ thống khi điểm danh lại: "Thực hiện điểm danh lại lần 2" */
export const systemNoteOf = (r?: StaffRecord | null) => {
  const proxyBefore = !r?.proxy ? lastProxyOf(r) : null;
  return [
    attemptOf(r) > 1 ? `Thực hiện điểm danh lại lần ${attemptOf(r)}` : '',
    r?.proxy && r.by ? `Điểm danh hộ bởi ${r.by}` : '',
    // Đã được điểm danh hộ, sau đó nhân sự TỰ điểm danh lại → kết quả tính theo lần tự điểm danh
    proxyBefore ? `Tự điểm danh lại sau khi được điểm danh hộ bởi ${proxyBefore.by}` : '',
  ].filter(Boolean).join(' • ');
};
/** Lần điểm danh hộ gần nhất trong ngày (nếu có) */
export function lastProxyOf(r?: StaffRecord | null): StaffAttempt | null {
  const h = r?.history || [];
  for (let i = h.length - 1; i >= 0; i--) if (h[i].by) return h[i];
  return null;
}
/** Bản ghi hiện tại là do BGH / Quản trị điểm danh hộ (lần cuối) */
export const isProxyRecord = (r?: StaffRecord | null) => !!(r?.proxy && r.by);

/** Ghi chú đi công tác: "Nơi công tác: … • Nội dung: … • ghi chú thêm" (ghép / tách để sửa lại) */
export const composeTripNote = (place: string, content: string, extra: string) =>
  [`Nơi công tác: ${place.trim()}`, content.trim() ? `Nội dung: ${content.trim()}` : '', extra.trim()].filter(Boolean).join(' • ').slice(0, 300);
export const parseTripNote = (note: string) => {
  const m = /^Nơi công tác: (.*?)(?: • Nội dung: (.*?))?(?: • (.*))?$/.exec(note || '');
  return m ? { place: m[1] || '', content: m[2] || '', extra: m[3] || '' } : { place: '', content: '', extra: note || '' };
};
/** Ghép ghi chú của người điểm danh + ghi chú hệ thống */
export const fullNoteOf = (r?: StaffRecord | null) => [r?.note || '', systemNoteOf(r)].filter(Boolean).join(' • ');
const two = (n: number) => String(n).padStart(2, '0');
/** 07:25:26 */
export const timeHMS = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`; };
/** 7 giờ 25 phút 26 giây */
export const timeSpoken = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return `${d.getHours()} giờ ${two(d.getMinutes())} phút ${two(d.getSeconds())} giây`; };
/** Danh sách các lần điểm danh trong ngày (bản ghi cũ chưa có lịch sử → 1 lần) */
export const attemptsOf = (r?: StaffRecord | null): StaffAttempt[] => (!r ? [] : r.history && r.history.length ? r.history : [{ status: r.status, note: r.note, at: r.at }]);

export interface StaffUpsert {
  code: string;
  name?: string;
  position?: string;
  dept?: string;
  gender?: string;
  phone?: string;
  order?: number;
  disabled?: boolean;
  cccd?: string;
  pin?: string;
}

const CONN_KEY = 'lhhp_staff_checkin_conn';
const VIEWER_KEY = 'lhhp_staff_viewer_auth';

type Conn = { scriptUrl: string; folderId: string; schoolName?: string };

// ---------------------------------------------------------------- connection
const encodeConn = (c: Conn) => btoa(unescape(encodeURIComponent(JSON.stringify({ u: c.scriptUrl, f: c.folderId, s: c.schoolName || '' }))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decodeConn = (raw: string): Conn | null => {
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const o = JSON.parse(decodeURIComponent(escape(atob(b64 + '==='.slice((b64.length + 3) % 4)))));
    const scriptUrl = googleDriveService.normalizeScriptUrl(String(o.u || ''));
    const folderId = String(o.f || '').trim();
    return scriptUrl && folderId ? { scriptUrl, folderId, schoolName: o.s || '' } : null;
  } catch (_) {
    return null;
  }
};

// Link rút gọn: /diemdanh#<mã script>.<mã thư mục>  (link cũ #c=... vẫn dùng được)
const SCRIPT_ID_RE = /^https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]{20,})\/exec$/;
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,}$/;
const decodeShortConn = (hash: string): Conn | null => {
  const m = /^#?([A-Za-z0-9_-]{20,})\.([A-Za-z0-9_-]{10,})$/.exec(hash.trim());
  return m ? { scriptUrl: `https://script.google.com/macros/s/${m[1]}/exec`, folderId: m[2] } : null;
};
/** Kết nối gắn sẵn khi build web (biến Vercel VITE_DRIVE_SCRIPT_URL + VITE_DRIVE_FOLDER_ID) */
const buildTimeConn = (): Conn | null => {
  const env = (import.meta as any).env || {};
  const scriptUrl = googleDriveService.normalizeScriptUrl(String(env.VITE_DRIVE_SCRIPT_URL || '').trim());
  const folderId = String(env.VITE_DRIVE_FOLDER_ID || '').trim();
  return scriptUrl && folderId ? { scriptUrl, folderId } : null;
};
const readSavedConn = (): Conn | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(CONN_KEY) || 'null');
    return saved?.scriptUrl && saved?.folderId ? saved : null;
  } catch (_) { return null; }
};

/** Lệnh nhân sự tự làm (điểm danh, kê khai) — nhận `account` (Apps Script 1.1.6) */
const SELF_ACTIONS = new Set(['staffAuth', 'staffCheckIn', 'teachGet', 'teachSaveProfile', 'teachSaveLog']);

export const staffAttendanceService = {
  /**
   * Kết nối Apps Script cho chấm công. Thứ tự: link đang mở (#mã.mã hoặc #c=...) → cấu hình Drive của máy (Quản trị vừa cài / cập nhật)
   * → kết nối đã nhớ từ link trước. Cấu hình của máy PHẢI đứng trước kết nối đã nhớ, nếu không màn quản lý sẽ gọi nhầm link cũ đã chết.
   */
  resolveConnection(): Conn | null {
    if (typeof window !== 'undefined') {
      const short = decodeShortConn(window.location.hash);
      if (short) {
        const saved = readSavedConn();
        const c: Conn = { ...short, schoolName: saved && saved.scriptUrl === short.scriptUrl && saved.folderId === short.folderId ? saved.schoolName || '' : '' };
        try { localStorage.setItem(CONN_KEY, JSON.stringify(c)); } catch (_) { /* ignore */ }
        return c;
      }
      const m = /[#&?]c=([A-Za-z0-9_-]+)/.exec(window.location.hash + window.location.search);
      if (m) {
        const c = decodeConn(m[1]);
        if (c) {
          try { localStorage.setItem(CONN_KEY, JSON.stringify(c)); } catch (_) { /* ignore */ }
          return c;
        }
      }
    }
    const cfg = googleDriveService.getConfig();
    const scriptUrl = googleDriveService.normalizeScriptUrl(cfg.scriptUrl);
    if (!scriptUrl || !cfg.folderId) {
      return typeof window !== 'undefined' ? readSavedConn() : null;
    }
    let schoolName = '';
    try {
      const cache = JSON.parse(localStorage.getItem('lhhp_drive_schools_cache') || 'null');
      const list = Array.isArray(cache?.schools) ? cache.schools : [];
      if (list.length === 1) schoolName = String(list[0]?.name || '');
    } catch (_) { /* ignore */ }
    return { scriptUrl, folderId: cfg.folderId, schoolName };
  },

  /**
   * Link điểm danh để Quản trị gửi cho nhân sự (không chứa mật khẩu). Gọn nhất có thể:
   * - Web đã gắn sẵn kết nối khi build (biến Vercel) và trùng kết nối máy này → https://truong.vercel.app/diemdanh
   * - Link Apps Script dạng chuẩn → https://truong.vercel.app/diemdanh#<mã script>.<mã thư mục>
   * - Trường hợp khác → dạng cũ #c=...
   */
  buildCheckInLink(schoolName?: string, baseUrl?: string): string | null {
    const cfg = googleDriveService.getConfig();
    const scriptUrl = googleDriveService.normalizeScriptUrl(cfg.scriptUrl);
    const folderId = String(cfg.folderId || '').trim();
    if (!scriptUrl || !folderId) return null;
    const origin = (baseUrl || this.getWebBaseUrl()).replace(/\/+$/, '');
    if (!origin) return null;
    const env = buildTimeConn();
    const sameOrigin = typeof window !== 'undefined' && window.location.origin === origin;
    if (env && sameOrigin && env.scriptUrl === scriptUrl && env.folderId === folderId) return `${origin}/diemdanh`;
    const sid = SCRIPT_ID_RE.exec(scriptUrl);
    if (sid && DRIVE_ID_RE.test(folderId)) return `${origin}/diemdanh#${sid[1]}.${folderId}`;
    return `${origin}/diemdanh#c=${encodeConn({ scriptUrl, folderId, schoolName })}`;
  },

  /** Tên trường cho trang điểm danh (link rút gọn không chứa tên trường) – lấy từ Apps Script, nhớ lại cho lần sau */
  async fetchSchoolName(conn: Conn): Promise<string> {
    try {
      const res = await fetch(`${conn.scriptUrl}${conn.scriptUrl.includes('?') ? '&' : '?'}action=listSchools&folderId=${encodeURIComponent(conn.folderId)}`);
      const data = JSON.parse(await res.text());
      const list = Array.isArray(data?.schools) ? data.schools : [];
      const name = list.length === 1 ? String(list[0]?.name || '') : '';
      if (name) {
        const saved = readSavedConn();
        if (saved && saved.scriptUrl === conn.scriptUrl && saved.folderId === conn.folderId) {
          try { localStorage.setItem(CONN_KEY, JSON.stringify({ ...saved, schoolName: name })); } catch (_) { /* ignore */ }
        }
      }
      return name;
    } catch (_) { return ''; }
  },

  /** Địa chỉ trang web của trường: bản web lấy chính địa chỉ đang mở; bản cài đặt dùng địa chỉ đã lưu */
  getWebBaseUrl(): string {
    try {
      const saved = localStorage.getItem('lhhp_school_web_url');
      if (saved) return saved;
    } catch (_) { /* ignore */ }
    return typeof window !== 'undefined' && /^https?:/.test(window.location.protocol) ? window.location.origin : '';
  },
  setWebBaseUrl(url: string) {
    try { localStorage.setItem('lhhp_school_web_url', url.trim().replace(/\/+$/, '')); } catch (_) { /* ignore */ }
  },
  /** Địa chỉ đã lưu trên máy này ('' khi chưa lưu) — khác getWebBaseUrl ở chỗ không tự lấy địa chỉ đang mở */
  getSavedWebBaseUrl(): string {
    try { return localStorage.getItem('lhhp_school_web_url') || ''; } catch (_) { return ''; }
  },
  clearWebBaseUrl() {
    try { localStorage.removeItem('lhhp_school_web_url'); } catch (_) { /* ignore */ }
  },

  /** 1.1.6: tài khoản phần mềm của giáo viên đang mở "Chấm công của tôi" — gửi kèm thay cho mật khẩu điểm danh */
  selfAccount: null as { username: string; password: string } | null,
  setSelfAccount(acc: { username: string; password: string } | null) { this.selfAccount = acc; },

  async call(body: Record<string, unknown>, conn?: Conn | null, timeoutMs = 25000): Promise<any> {
    const c = conn || this.resolveConnection();
    if (this.selfAccount && SELF_ACTIONS.has(String(body.action || ''))) body = { ...body, account: this.selfAccount };
    if (!c) throw new Error('Chưa có kết nối Google Drive của nhà trường. Hãy mở đúng link điểm danh do nhà trường gửi.');
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(c.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ folderId: c.folderId, ...body }),
        signal: controller.signal,
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch (_) {
        throw new Error(/accounts\.google\.com|ServiceLogin/i.test(text) ? 'Apps Script chưa mở quyền "Bất kỳ ai" (Anyone).' : 'Máy chủ Apps Script trả về nội dung không hợp lệ.');
      }
      if (data && data.success === false && /Hành động không hợp lệ/i.test(String(data.message || ''))) {
        throw new Error('Apps Script của nhà trường chưa được cập nhật lên phiên bản có chức năng chấm công. Quản trị cần dán mã mới và triển khai lại (Hệ thống → Cài đặt Apps Script → Cập nhật).');
      }
      return data;
    } catch (e: any) {
      if (e?.name === 'AbortError') throw new Error('Mạng chậm, không kết nối được máy chủ. Vui lòng thử lại.');
      // Trình duyệt không nhận được phản hồi hợp lệ (link /exec chết, dự án Apps Script bị xóa, chưa mở "Bất kỳ ai"…)
      if (e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(String(e?.message || ''))) {
        const err: any = new Error('Không kết nối được Apps Script của nhà trường: link /exec không trả lời. Thường do dự án Apps Script đã bị xóa (ví dụ nằm trong thư mục vừa dọn), triển khai bị lưu trữ, hoặc chưa mở quyền "Bất kỳ ai".');
        err.code = 'NETWORK';
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  },

  /**
   * Chẩn đoán khi gọi thất bại: link chết? hay thư mục đã mất CSDL nhà trường (csdl_truong.json) nên không nhận ra tài khoản?
   */
  async diagnoseFailure(): Promise<{ kind: 'dead' | 'no_db' | 'ok' | 'unknown'; message: string }> {
    const c = this.resolveConnection();
    if (!c) return { kind: 'unknown', message: '' };
    const get = async (q: string) => {
      try {
        const res = await fetch(`${c.scriptUrl}${c.scriptUrl.includes('?') ? '&' : '?'}${q}`);
        return JSON.parse(await res.text());
      } catch (_) { return null; }
    };
    const ping = await get('action=ping');
    if (!ping?.success) {
      return { kind: 'dead', message: 'Không kết nối được Apps Script của nhà trường: link /exec không trả lời. Thường do dự án Apps Script đã bị xóa (ví dụ nằm trong thư mục Drive vừa dọn — kiểm tra Thùng rác), triển khai bị lưu trữ, hoặc chưa mở quyền "Bất kỳ ai". Mở "Cài đặt Apps Script" để kiểm tra và cài lại.' };
    }
    const ls = await get(`action=listSchools&folderId=${encodeURIComponent(c.folderId)}`);
    if (ls && ls.success && !ls.initialized) {
      return { kind: 'no_db', message: 'Thư mục Drive chưa có cơ sở dữ liệu nhà trường (tệp csdl_truong.json đã bị xóa), nên Apps Script không nhận ra tài khoản. Cách làm: khôi phục csdl_truong.json từ Thùng rác Google Drive, HOẶC đăng xuất rồi đăng nhập vai trò Quản trị cao nhất (adminquantri) để khởi tạo lại trường và tài khoản; sau đó nhập lại danh sách nhân sự.' };
    }
    if (ls && !ls.success) return { kind: 'dead', message: `Apps Script không mở được thư mục Drive (${ls.message || 'không rõ lý do'}). Mở "Cài đặt Apps Script" để kiểm tra.` };
    return { kind: 'ok', message: '' };
  },

  // ---------------- nhân sự tự điểm danh
  staffAuth(cccd: string, pin: string) { return this.call({ action: 'staffAuth', cccd, pin }); },
  checkIn(cccd: string, pin: string, status: StaffStatus, note: string, date: string) {
    return this.call({ action: 'staffCheckIn', cccd, pin, status, note, date });
  },

  // ---------------- phiên Quản trị / BGH: nhớ trên máy tới khi Đăng xuất (utils/persistedAuth)
  rememberViewerAuth(username: string, password: string, isAdmin?: boolean) {
    try { sessionStorage.setItem(VIEWER_KEY, JSON.stringify({ username: username.trim().toLowerCase(), password })); } catch (_) { /* ignore */ }
    saveManagerAuth(username, password, isAdmin);
  },
  getViewerAuth(): { username: string; password: string } | null {
    try {
      const s = JSON.parse(sessionStorage.getItem(VIEWER_KEY) || 'null');
      if (s?.username && s?.password) return s;
    } catch (_) { /* ignore */ }
    const p = readManagerAuth();
    return p ? { username: p.username, password: p.password } : null;
  },
  /** Apps Script từ chối (mật khẩu đã đổi nơi khác) → quên phiên để hỏi lại */
  clearViewerAuth() {
    try { sessionStorage.removeItem(VIEWER_KEY); } catch (_) { /* ignore */ }
    clearManagerAuth();
  },

  // ---------------- số CCCD đầy đủ nhớ trên máy Quản trị (khi nhập Excel / sửa) — dùng khi Apps Script chưa trả `currentCccd`
  cccdCacheKey() {
    const c = this.resolveConnection();
    return `lhhp_staff_cccd_cache:${c?.folderId || 'default'}`;
  },
  readCccdCache(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(this.cccdCacheKey()) || '{}') || {}; } catch (_) { return {}; }
  },
  rememberCccds(items: Array<{ code: string; cccd?: string }>, deletedCodes: string[] = []) {
    try {
      const cache = this.readCccdCache();
      items.forEach(it => {
        const d = String(it.cccd || '').replace(/\D/g, '');
        if (it.code && (d.length === 12 || d.length === 9)) cache[String(it.code).trim().toUpperCase()] = d;
      });
      deletedCodes.forEach(c => { delete cache[String(c).trim().toUpperCase()]; });
      localStorage.setItem(this.cccdCacheKey(), JSON.stringify(cache));
    } catch (_) { /* ignore */ }
  },
  /** Bổ sung số CCCD đầy đủ từ bộ nhớ máy (chỉ khi 4 số cuối khớp, tránh hiện số cũ) */
  withFullCccd<T extends { staff?: StaffMember[] }>(res: T): T {
    if (!res || !Array.isArray(res.staff)) return res;
    const cache = this.readCccdCache();
    res.staff = res.staff.map(s => {
      if (s.currentCccd) return s;
      if (s.cccd) return { ...s, currentCccd: s.cccd };
      const d = cache[String(s.code).toUpperCase()];
      return d && (!s.cccdLast4 || d.endsWith(s.cccdLast4)) ? { ...s, currentCccd: d } : s;
    });
    return res;
  },

  /** Phiên bản Apps Script đang thực sự chạy (để biết đã triển khai bản mới hay chưa) */
  async getScriptVersion(): Promise<string> {
    const c = this.resolveConnection();
    if (!c) return '';
    try {
      const res = await fetch(`${c.scriptUrl}${c.scriptUrl.includes('?') ? '&' : '?'}action=ping`);
      const data = JSON.parse(await res.text());
      return String(data?.version || '');
    } catch (_) { return ''; }
  },

  async getRoster(auth?: { username: string; password: string } | null) {
    return this.withFullCccd(await this.call({ action: 'getStaffRoster', auth: auth ?? staffAttendanceService.getViewerAuth() }));
  },
  async saveRoster(staff: StaffUpsert[], deletedCodes: string[] = [], auth?: { username: string; password: string } | null) {
    const res = await this.call({ action: 'saveStaffRoster', auth: auth ?? staffAttendanceService.getViewerAuth(), staff, deletedCodes }, null, 60000);
    if (res?.success) this.rememberCccds(staff.map(s => ({ code: s.code, cccd: s.cccd })), deletedCodes);
    return this.withFullCccd(res);
  },
  /** BGH / Quản trị: khóa hoặc mở khóa điểm danh (codes = danh sách mã; all = toàn bộ) */
  /** BGH / Quản trị điểm danh hộ 1 / nhiều nhân sự (Apps Script 4.7) */
  proxyCheckIn(opts: { codes: string[]; status: StaffStatus; note?: string; date?: string }, auth?: { username: string; password: string } | null) {
    return this.call({ action: 'staffProxyCheckIn', auth: auth ?? staffAttendanceService.getViewerAuth(), codes: opts.codes, status: opts.status, note: opts.note || '', date: opts.date });
  },

  lockStaff(opts: { date?: string; lock: boolean; all?: boolean; codes?: string[] }, auth?: { username: string; password: string } | null) {
    return this.call({ action: 'staffLock', auth: auth ?? staffAttendanceService.getViewerAuth(), date: opts.date, lock: opts.lock, all: Boolean(opts.all), codes: opts.codes || [] });
  },

  async range(from: string, to: string, auth?: { username: string; password: string } | null) {
    return this.withFullCccd(await this.call({ action: 'staffAttendanceRange', auth: auth ?? staffAttendanceService.getViewerAuth(), from, to }, null, 45000));
  },
};

// ---------------------------------------------------------------- dates
export const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromDateKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k: string, n: number) => { const d = fromDateKey(k); d.setDate(d.getDate() + n); return toDateKey(d); };
const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
export const weekdayLabel = (k: string) => WEEKDAYS[fromDateKey(k).getDay()];
export const weekdayShort = (k: string) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][fromDateKey(k).getDay()];
export const longDateLabel = (k: string) => { const d = fromDateKey(k); return `${WEEKDAYS[d.getDay()]}, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`; };
export const shortDateLabel = (k: string) => { const d = fromDateKey(k); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const dateRangeKeys = (from: string, to: string) => {
  const out: string[] = [];
  for (let k = from, i = 0; k <= to && i < 400; k = addDays(k, 1), i++) out.push(k);
  return out;
};

// ---------------------------------------------------------------- aggregation
export interface DayStat { date: string; total: number; present: number; business_trip: number; sick_leave: number; personal_unpaid: number; missing: number; marked: number; workRate: number; markRate: number }
export interface PersonStat { staff: StaffMember; present: number; business_trip: number; sick_leave: number; personal_unpaid: number; missing: number; workDays: number; workRate: number }

/** Ngày làm việc: Thứ Hai – Thứ Sáu, hoặc ngày Thứ Bảy/Chủ nhật có người điểm danh; không tính ngày tương lai */
export function workingDays(from: string, to: string, today: string, days: Record<string, Record<string, StaffRecord>>) {
  return dateRangeKeys(from, to < today ? to : today).filter(k => {
    const dow = fromDateKey(k).getDay();
    return (dow >= 1 && dow <= 5) || Object.keys(days[k] || {}).length > 0;
  });
}

export function aggregate(staff: StaffMember[], days: Record<string, Record<string, StaffRecord>>, from: string, to: string, today: string) {
  const active = staff.filter(s => !s.disabled);
  const wd = workingDays(from, to, today, days);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  const daily: DayStat[] = wd.map(date => {
    const recs = days[date] || {};
    const c = { present: 0, business_trip: 0, sick_leave: 0, personal_unpaid: 0 } as Record<StaffStatus, number>;
    active.forEach(s => { const r = recs[s.code]; if (r && c[r.status] !== undefined) c[r.status]++; });
    const marked = c.present + c.business_trip + c.sick_leave + c.personal_unpaid;
    return { date, total: active.length, ...c, missing: Math.max(0, active.length - marked), marked, workRate: pct(c.present + c.business_trip, active.length), markRate: pct(marked, active.length) };
  });
  const people: PersonStat[] = active.map(s => {
    const p = { present: 0, business_trip: 0, sick_leave: 0, personal_unpaid: 0, missing: 0 };
    wd.forEach(date => { const r = (days[date] || {})[s.code]; if (r && p[r.status] !== undefined) p[r.status]++; else if (!r) p.missing++; });
    return { staff: s, ...p, workDays: wd.length, workRate: pct(p.present + p.business_trip, wd.length) };
  });
  const sum = daily.reduce((a, d) => ({ present: a.present + d.present, business_trip: a.business_trip + d.business_trip, sick_leave: a.sick_leave + d.sick_leave, personal_unpaid: a.personal_unpaid + d.personal_unpaid, missing: a.missing + d.missing }),
    { present: 0, business_trip: 0, sick_leave: 0, personal_unpaid: 0, missing: 0 });
  const slots = daily.length * active.length;
  return { daily, people, workingDays: wd, totals: { ...sum, slots, workRate: pct(sum.present + sum.business_trip, slots), markRate: pct(slots - sum.missing, slots) }, activeCount: active.length };
}

// ---------------------------------------------------------------- Excel import (CSDL ngành Bộ GD&ĐT hoặc mẫu đơn giản)
const pick = (row: Record<string, any>, names: string[]) => {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find(x => x.replace(/\s+/g, ' ').trim().toLowerCase().startsWith(n.toLowerCase()));
    if (k && String(row[k]).trim()) return String(row[k]).trim();
  }
  return '';
};

export interface ParsedStaffRow extends StaffUpsert { inactiveReason?: string; birthDate?: string; issues: string[]; excelRow?: number }

export function parseStaffRows(rows: Record<string, any>[]): ParsedStaffRow[] {
  const out: ParsedStaffRow[] = [];
  rows.forEach((row, i) => {
    const name = pick(row, ['Họ tên', 'Họ và tên', 'Ho ten', 'Tên']);
    const code = pick(row, ['Mã định danh', 'Mã giáo viên', 'Mã GV', 'Mã cán bộ', 'Mã nhân sự', 'Mã']);
    const cccd = pick(row, ['Số CMTND', 'Số CCCD', 'CCCD', 'Căn cước', 'CMND', 'Số định danh cá nhân']).replace(/\D/g, '');
    if (!name && !code && !cccd) return;
    const position = pick(row, ['Vị trí việc làm', 'Chức vụ', 'Nhóm chức vụ']);
    const group = pick(row, ['Nhóm chức vụ']);
    const subject = pick(row, ['Môn dạy', 'Tổ chuyên môn', 'Tổ', 'Bộ phận']);
    const statusText = pick(row, ['Trạng thái CB', 'Trạng thái']);
    const issues: string[] = [];
    if (!code) issues.push('thiếu mã');
    if (!name) issues.push('thiếu họ tên');
    if (cccd.length < 9 || cccd.length > 12) issues.push('CCCD không hợp lệ');
    const inactive = statusText && !/đang làm việc/i.test(statusText);
    out.push({
      code: code.toUpperCase(), name, cccd, position: position || group, dept: subject || (group && group !== position ? group : ''),
      gender: pick(row, ['Giới tính']), phone: pick(row, ['Điện thoại', 'Số điện thoại', 'SĐT']), order: Number(pick(row, ['STT'])) || i + 1,
      birthDate: pick(row, ['Ngày sinh']), disabled: Boolean(inactive), inactiveReason: inactive ? statusText : undefined, issues,
    });
  });
  return out;
}

// ---------------------------------------------------------------- Biểu mẫu nhập nhân sự (đúng tệp xuất từ CSDL ngành)
/** 68 cột, đúng tên và thứ tự của biểu mẫu "Thong tin nhan su mau khi upload.xlsx" */
export const STAFF_TEMPLATE_HEADERS: string[] = [
  "STT",
  "Mã định danh Bộ GD&ĐT",
  "Họ tên",
  "Giới tính",
  "Ngày sinh",
  "Trạng thái CB",
  "Số CMTND/TCC",
  "Email",
  "Điện thoại",
  "Dân tộc",
  "Tôn giáo",
  "Tỉnh/Thành phố\n(Theo địa chỉ thường trú)",
  "Quận/Huyện\n(Theo địa chỉ thường trú)",
  "Xã/Phường\n(Theo địa chỉ thường trú)",
  "Tổ/Thôn/Xóm (Theo địa chỉ thường trú)",
  "Tỉnh/Thành phố\n(Theo quê quán)",
  "Quận/Huyện\n(Theo quê quán)",
  "Xã/Phường\n(Theo quê quán)",
  "Tổ/Thôn/Xóm (Theo quê quán)",
  "Là Đoàn viên",
  "Là Đảng viên",
  "Số sổ BHXH",
  "Vị trí việc làm",
  "Nhóm chức vụ",
  "Hình thức hợp đồng",
  "Có CC bồi dưỡng TCCD",
  "Ngày tuyển dụng",
  "Cơ quan tuyển dụng",
  "Nghề nghiệp khi được tuyển dụng",
  "Môn dạy",
  "Ngạch/Hạng",
  "S.tiết thực dạy trên tuần",
  "S.tiết thực k.nhiệm trên tuần",
  "Đã tập huấn dạy KN sống",
  "Dạy HSKT học hòa nhập",
  "Dạy 1 buổi/ngày",
  "Dạy 2 buổi/ngày",
  "Chuyên trách đội",
  "Mức phụ cấp thu hút nghề (%)",
  "Mức phụ cấp thâm niên (%)",
  "Mức phụ cấp ưu đãi nghề (%)",
  "Mức phụ cấp chức vụ lãnh đạo (%)",
  "Bậc lương",
  "Phần trăm vượt khung (%)",
  "Hệ số lương",
  "Ngày hưởng",
  "KQ B.dưỡng t.xuyên",
  "T.độ c.môn n.vụ",
  "T.độ LLCT",
  "T.độ quản lý GD",
  "Tham gia bồi dưỡng nghiệp vụ",
  "Ngoại ngữ chính",
  "Nhóm C.Chỉ N.Ngữ",
  "Loại C.Chỉ N.Ngữ",
  "Khung N.Lực N.Ngữ",
  "GV có chứng chỉ tiếng dân tộc thiểu số",
  "Trình độ đào tạo ngoại ngữ",
  "T.độ tin học",
  "Chuyên ngành chính",
  "Trình độ chính",
  "Chuyên ngành khác",
  "Trình độ khác",
  "Tham gia bồi dưỡng CBQL cốt cán",
  "Tham gia bồi dưỡng thay sách",
  "Đánh giá viên chức",
  "Giáo viên dạy giỏi",
  "GV chủ nhiệm giỏi",
  "GV tổng phụ trách Đội giỏi",
];
const normHeader = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const colLetter = (i: number) => { let s = ''; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const cellText = (v: unknown) => (v == null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(v)) : String(v).trim());
/** Số đọc từ ô kiểu số bị mất số 0 đầu (CCCD 12 số, CMND 9 số, điện thoại 10 số) */
const digitsOf = (v: unknown, lens: number[]) => {
  const d = (typeof v === 'number' ? String(Math.round(v)) : String(v ?? '')).replace(/\D/g, '');
  if (typeof v === 'number') for (const L of lens) if (d.length === L - 1) return '0' + d;
  return d;
};
const dateText = (v: unknown) => {
  if (typeof v === 'number' && v > 1 && v < 80000) { // ngày kiểu số của Excel
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  }
  if (v instanceof Date && !isNaN(v.getTime())) return `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`;
  return cellText(v);
};

export interface StaffSheetResult { ok: boolean; errors: string[]; headerRow: number; rows: ParsedStaffRow[] }

/**
 * Đọc bảng Excel nhân sự (mảng các dòng, đọc với raw: true). Bắt buộc ĐÚNG biểu mẫu:
 * đủ 68 cột, đúng tên, đúng thứ tự (A → BP). Sai biểu mẫu → trả lỗi chỉ rõ cột sai, không nhập.
 */
export function parseStaffSheet(aoa: unknown[][]): StaffSheetResult {
  const want = STAFF_TEMPLATE_HEADERS.map(normHeader);
  let h = -1;
  for (let i = 0; i < Math.min(15, aoa.length); i++) {
    const r = (aoa[i] || []).map(normHeader);
    if (r.includes(want[1]) && r.includes(want[2])) { h = i; break; }
  }
  if (h < 0) return { ok: false, headerRow: -1, rows: [], errors: ['Không thấy dòng tiêu đề của biểu mẫu (cần có cột "Mã định danh Bộ GD&ĐT" và "Họ tên"). Hãy dùng đúng tệp xuất từ CSDL ngành hoặc tệp mẫu của phần mềm.'] };
  const got = (aoa[h] || []).map(normHeader);
  while (got.length && !got[got.length - 1]) got.pop();
  const errors: string[] = [];
  want.forEach((w, i) => {
    if (got[i] === w) return;
    const at = got.indexOf(w);
    errors.push(at < 0 ? `Thiếu cột "${STAFF_TEMPLATE_HEADERS[i].replace(/\s+/g, ' ')}" (cột ${colLetter(i)})` : `Cột "${STAFF_TEMPLATE_HEADERS[i].replace(/\s+/g, ' ')}" phải ở cột ${colLetter(i)}, tệp đang để ở cột ${colLetter(at)}`);
  });
  errors.sort((x, y) => Number(!x.startsWith('Thiếu')) - Number(!y.startsWith('Thiếu')));
  if (got.length > want.length) errors.push(`Tệp có thêm ${got.length - want.length} cột ngoài biểu mẫu (từ cột ${colLetter(want.length)}).`);
  if (errors.length) return { ok: false, headerRow: h, rows: [], errors };

  const C = (name: string) => want.indexOf(normHeader(name));
  const iStt = C('STT'), iCode = C('Mã định danh Bộ GD&ĐT'), iName = C('Họ tên'), iGender = C('Giới tính'), iBirth = C('Ngày sinh'),
    iStatus = C('Trạng thái CB'), iCccd = C('Số CMTND/TCC'), iPhone = C('Điện thoại'), iPos = C('Vị trí việc làm'), iGroup = C('Nhóm chức vụ'), iSubject = C('Môn dạy');
  const rows: ParsedStaffRow[] = [];
  const seenCode = new Map<string, number>();
  const seenCccd = new Map<string, number>();
  for (let r = h + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const name = cellText(row[iName]);
    const code = cellText(row[iCode]).toUpperCase();
    const cccd = digitsOf(row[iCccd], [12, 9]);
    if (!name && !code && !cccd) continue; // dòng trống
    const position = cellText(row[iPos]);
    const group = cellText(row[iGroup]);
    const subject = cellText(row[iSubject]);
    const statusText = cellText(row[iStatus]);
    const excelRow = r + 1;
    const issues: string[] = [];
    if (!code) issues.push('thiếu Mã định danh Bộ GD&ĐT');
    if (!name) issues.push('thiếu Họ tên');
    if (!cccd) issues.push('thiếu Số CMTND/TCC');
    else if (cccd.length !== 12 && cccd.length !== 9) issues.push('Số CMTND/TCC phải 12 số (CCCD) hoặc 9 số (CMND)');
    if (code && seenCode.has(code)) issues.push(`trùng mã với dòng ${seenCode.get(code)}`);
    if (cccd && seenCccd.has(cccd)) issues.push(`trùng CCCD với dòng ${seenCccd.get(cccd)}`);
    if (code && !seenCode.has(code)) seenCode.set(code, excelRow);
    if (cccd && !seenCccd.has(cccd)) seenCccd.set(cccd, excelRow);
    const inactive = Boolean(statusText) && !/đang làm việc/i.test(statusText);
    rows.push({
      code, name, cccd, position: position || group, dept: subject || (group && group !== position ? group : ''),
      gender: cellText(row[iGender]), phone: digitsOf(row[iPhone], [10]), order: Number(cellText(row[iStt])) || rows.length + 1,
      birthDate: dateText(row[iBirth]), disabled: inactive, inactiveReason: inactive ? statusText : undefined, issues,
      excelRow,
    });
  }
  return { ok: true, headerRow: h, rows, errors: [] };
}

/** Mật khẩu điểm danh ngẫu nhiên 6 chữ số */
export function randomPin() {
  const a = new Uint32Array(1);
  (globalThis.crypto || (window as any).msCrypto).getRandomValues(a);
  return String(100000 + (a[0] % 900000));
}
