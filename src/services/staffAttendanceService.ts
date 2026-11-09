/**
 * 👩‍🏫 CHẤM CÔNG (ĐIỂM DANH) GIÁO VIÊN – NHÂN VIÊN TOÀN TRƯỜNG
 *
 * - Dữ liệu nằm trong thư mục Drive dùng chung, do Apps Script V4.2 quản lý:
 *   nhansu_truong.json (CCCD + mật khẩu chỉ lưu dạng băm) và chamcong_nhansu_YYYY-MM.json.
 * - Nhân sự điểm danh tại trang /diemdanh bằng số CCCD + mật khẩu điểm danh; NGÀY do máy chủ quyết định.
 * - Quản trị (admin / school_admin) quản lý danh sách; BGH + Quản trị xem tổng hợp (cần mật khẩu phiên).
 */
import { googleDriveService } from './googleDriveService';

export type StaffStatus = 'present' | 'sick_leave' | 'personal_unpaid';

export const STAFF_STATUS_META: Record<StaffStatus | 'missing', { label: string; short: string; color: string; soft: string; text: string }> = {
  present: { label: 'Có mặt đi làm', short: 'Có mặt', color: '#047857', soft: '#ecfdf5', text: '#065f46' },
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
  updatedAt?: string;
}

export interface StaffAttempt { status: StaffStatus; note?: string; at: string }
export interface StaffRecord { status: StaffStatus; note?: string; at: string; firstAt?: string; edits?: number; attempt?: number; history?: StaffAttempt[] }

/** Lần điểm danh hiện tại trong ngày (1 = lần đầu) */
export const attemptOf = (r?: StaffRecord | null) => (r ? r.attempt || (r.history?.length) || (r.edits || 0) + 1 : 0);
/** Ghi chú hệ thống khi điểm danh lại: "Thực hiện điểm danh lại lần 2" */
export const systemNoteOf = (r?: StaffRecord | null) => (attemptOf(r) > 1 ? `Thực hiện điểm danh lại lần ${attemptOf(r)}` : '');
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

export const staffAttendanceService = {
  /** Kết nối dùng cho trang điểm danh: ưu tiên link (#c=...), rồi kết nối đã nhớ, rồi kết nối của phần mềm */
  resolveConnection(): Conn | null {
    if (typeof window !== 'undefined') {
      const m = /[#&?]c=([A-Za-z0-9_-]+)/.exec(window.location.hash + window.location.search);
      if (m) {
        const c = decodeConn(m[1]);
        if (c) {
          try { localStorage.setItem(CONN_KEY, JSON.stringify(c)); } catch (_) { /* ignore */ }
          return c;
        }
      }
      try {
        const saved = JSON.parse(localStorage.getItem(CONN_KEY) || 'null');
        if (saved?.scriptUrl && saved?.folderId) return saved;
      } catch (_) { /* ignore */ }
    }
    const cfg = googleDriveService.getConfig();
    const scriptUrl = googleDriveService.normalizeScriptUrl(cfg.scriptUrl);
    if (!scriptUrl || !cfg.folderId) return null;
    let schoolName = '';
    try {
      const cache = JSON.parse(localStorage.getItem('lhhp_drive_schools_cache') || 'null');
      const list = Array.isArray(cache?.schools) ? cache.schools : [];
      if (list.length === 1) schoolName = String(list[0]?.name || '');
    } catch (_) { /* ignore */ }
    return { scriptUrl, folderId: cfg.folderId, schoolName };
  },

  /** Link điểm danh để Quản trị gửi cho nhân sự (chứa link script + mã thư mục, không chứa mật khẩu) */
  buildCheckInLink(schoolName?: string, baseUrl?: string): string | null {
    const cfg = googleDriveService.getConfig();
    const scriptUrl = googleDriveService.normalizeScriptUrl(cfg.scriptUrl);
    if (!scriptUrl || !cfg.folderId) return null;
    const origin = (baseUrl || this.getWebBaseUrl()).replace(/\/+$/, '');
    if (!origin) return null;
    return `${origin}/diemdanh#c=${encodeConn({ scriptUrl, folderId: cfg.folderId, schoolName })}`;
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

  async call(body: Record<string, unknown>, conn?: Conn | null, timeoutMs = 25000): Promise<any> {
    const c = conn || this.resolveConnection();
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
        throw new Error('Apps Script của nhà trường chưa được cập nhật lên phiên bản 4.2 (có chức năng chấm công). Quản trị cần dán mã mới và triển khai lại.');
      }
      return data;
    } catch (e: any) {
      if (e?.name === 'AbortError') throw new Error('Mạng chậm, không kết nối được máy chủ. Vui lòng thử lại.');
      throw e;
    } finally {
      clearTimeout(t);
    }
  },

  // ---------------- nhân sự tự điểm danh
  staffAuth(cccd: string, pin: string) { return this.call({ action: 'staffAuth', cccd, pin }); },
  checkIn(cccd: string, pin: string, status: StaffStatus, note: string, date: string) {
    return this.call({ action: 'staffCheckIn', cccd, pin, status, note, date });
  },

  // ---------------- phiên Quản trị / BGH (sessionStorage, mất khi đóng tab)
  rememberViewerAuth(username: string, password: string) {
    try { sessionStorage.setItem(VIEWER_KEY, JSON.stringify({ username: username.trim().toLowerCase(), password })); } catch (_) { /* ignore */ }
  },
  getViewerAuth(): { username: string; password: string } | null {
    try { return JSON.parse(sessionStorage.getItem(VIEWER_KEY) || 'null'); } catch (_) { return null; }
  },
  clearViewerAuth() { try { sessionStorage.removeItem(VIEWER_KEY); } catch (_) { /* ignore */ } },

  getRoster(auth?: { username: string; password: string } | null) {
    return this.call({ action: 'getStaffRoster', auth: auth ?? staffAttendanceService.getViewerAuth() });
  },
  saveRoster(staff: StaffUpsert[], deletedCodes: string[] = [], auth?: { username: string; password: string } | null) {
    return this.call({ action: 'saveStaffRoster', auth: auth ?? staffAttendanceService.getViewerAuth(), staff, deletedCodes }, null, 60000);
  },
  range(from: string, to: string, auth?: { username: string; password: string } | null) {
    return this.call({ action: 'staffAttendanceRange', auth: auth ?? staffAttendanceService.getViewerAuth(), from, to }, null, 45000);
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
export interface DayStat { date: string; total: number; present: number; sick_leave: number; personal_unpaid: number; missing: number; marked: number; workRate: number; markRate: number }
export interface PersonStat { staff: StaffMember; present: number; sick_leave: number; personal_unpaid: number; missing: number; workDays: number; workRate: number }

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
    const c = { present: 0, sick_leave: 0, personal_unpaid: 0 } as Record<StaffStatus, number>;
    active.forEach(s => { const r = recs[s.code]; if (r && c[r.status] !== undefined) c[r.status]++; });
    const marked = c.present + c.sick_leave + c.personal_unpaid;
    return { date, total: active.length, ...c, missing: Math.max(0, active.length - marked), marked, workRate: pct(c.present, active.length), markRate: pct(marked, active.length) };
  });
  const people: PersonStat[] = active.map(s => {
    const p = { present: 0, sick_leave: 0, personal_unpaid: 0, missing: 0 };
    wd.forEach(date => { const r = (days[date] || {})[s.code]; if (r) p[r.status]++; else p.missing++; });
    return { staff: s, ...p, workDays: wd.length, workRate: pct(p.present, wd.length) };
  });
  const sum = daily.reduce((a, d) => ({ present: a.present + d.present, sick_leave: a.sick_leave + d.sick_leave, personal_unpaid: a.personal_unpaid + d.personal_unpaid, missing: a.missing + d.missing }),
    { present: 0, sick_leave: 0, personal_unpaid: 0, missing: 0 });
  const slots = daily.length * active.length;
  return { daily, people, workingDays: wd, totals: { ...sum, slots, workRate: pct(sum.present, slots), markRate: pct(slots - sum.missing, slots) }, activeCount: active.length };
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

export interface ParsedStaffRow extends StaffUpsert { inactiveReason?: string; birthDate?: string; issues: string[] }

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

/** Mật khẩu điểm danh ngẫu nhiên 6 chữ số */
export function randomPin() {
  const a = new Uint32Array(1);
  (globalThis.crypto || (window as any).msCrypto).getRandomValues(a);
  return String(100000 + (a[0] % 900000));
}
