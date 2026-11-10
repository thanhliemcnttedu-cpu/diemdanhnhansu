/**
 * 📚 KÊ KHAI TIẾT DẠY (Apps Script 4.8, tệp khóa kekhai_tietday.json)
 * Giáo viên đăng nhập bằng CCCD + mật khẩu điểm danh (cùng module chấm công):
 *  1) Khai báo: môn được phân công, lớp có HS khuyết tật, lớp dạy GDTC, lớp dạy Tiếng Anh → Lưu.
 *  2) Kê khai tháng: số tiết theo từng TUẦN (Thứ Hai – Chủ nhật, cắt theo tháng, tối đa 5 tuần có ngày học) cho các mục:
 *     GDTC (trong đó dạy ngoài trời), lớp có HS khuyết tật THEO TỪNG MÔN, thừa giờ Tiếng Anh.
 * BGH / Quản trị xem tổng hợp theo tuần / tháng (teachReport) và xuất Excel đúng mẫu nhà trường đang dùng:
 *   TH1 "TonghopKT" (HSKT theo môn), TH2 "TonghopGDTC", TH3 "TongTA" (thừa giờ Tiếng Anh).
 */
import { staffAttendanceService, StaffMember, toDateKey, fromDateKey, addDays } from './staffAttendanceService';

export type TeachKey = 'outdoor' | 'pe' | 'disabled' | 'english';
export const TEACH_KEYS: TeachKey[] = ['outdoor', 'pe', 'disabled', 'english'];
/** Mục hiển thị / kê khai: tiết GDTC CHÍNH LÀ tiết dạy ngoài trời → chỉ 1 dòng 'pe' (outdoor tự lưu bằng pe để tương thích dữ liệu cũ) */
export const SHOWN_KEYS: TeachKey[] = ['pe', 'disabled', 'english'];
export const TEACH_META: Record<TeachKey, { label: string; short: string; tiny: string; color: string; soft: string; text: string }> = {
  outdoor: { label: 'Tiết GDTC dạy ngoài trời', short: 'Ngoài trời', tiny: 'N.Trời', color: '#047857', soft: '#ecfdf5', text: '#065f46' },
  pe: { label: 'Tiết GDTC (dạy ngoài trời)', short: 'GDTC', tiny: 'GDTC', color: '#1d4ed8', soft: '#eff6ff', text: '#1e40af' },
  disabled: { label: 'Tiết dạy lớp có HS khuyết tật', short: 'Lớp có HSKT', tiny: 'HSKT', color: '#7c3aed', soft: '#f5f3ff', text: '#5b21b6' },
  english: { label: 'Tiết dạy thừa giờ Tiếng Anh', short: 'Thừa giờ T.Anh', tiny: 'T.Anh', color: '#c2410c', soft: '#fff7ed', text: '#9a3412' },
};

/** 14 môn theo bảng kê TH1 của nhà trường (thứ tự giữ nguyên để xuất đúng mẫu "TonghopKT") */
export const HSKT_SUBJECTS: Array<{ code: string; label: string; aliases: string[] }> = [
  { code: 'hdtn', label: 'HĐTN', aliases: ['hoat dong trai nghiem', 'hdtn'] },
  { code: 'tv', label: 'Tiếng Việt', aliases: ['tieng viet'] },
  { code: 'toan', label: 'Toán', aliases: ['toan'] },
  { code: 'ta', label: 'Tiếng Anh', aliases: ['tieng anh', 't. anh', 't.anh'] },
  { code: 'dd', label: 'Đạo đức', aliases: ['dao duc'] },
  { code: 'tnxh', label: 'TN&XH', aliases: ['tn&xh', 'tu nhien va xa hoi', 'tnxh'] },
  { code: 'ls', label: 'Lịch sử', aliases: ['lich su', 'lich su va dia li', 'lich su va dia ly'] },
  { code: 'dl', label: 'Địa lý', aliases: ['dia ly', 'dia li', 'lich su va dia li', 'lich su va dia ly'] },
  { code: 'kh', label: 'Khoa học', aliases: ['khoa hoc'] },
  { code: 'th', label: 'Tin học', aliases: ['tin hoc'] },
  { code: 'cn', label: 'Công nghệ', aliases: ['cong nghe'] },
  { code: 'gdtc', label: 'GDTC', aliases: ['gdtc', 'giao duc the chat', 'the duc'] },
  { code: 'an', label: 'Âm nhạc', aliases: ['am nhac'] },
  { code: 'mt', label: 'Mĩ thuật', aliases: ['mi thuat', 'my thuat'] },
];

export const SUBJECT_PRESETS = HSKT_SUBJECTS.map(s => s.label);

export interface TeachProfile { subjects: string[]; classesDisabled: string[]; classesPE: string[]; classesEnglish: string[]; updatedAt?: string }
/** Số tiết 1 tuần; `kt` = tiết dạy lớp có HSKT theo mã môn (HSKT_SUBJECTS), `disabled` = tổng các môn */
export type WeekCounts = Partial<Record<TeachKey, number>> & { kt?: Record<string, number> };
export interface TeachLog { weeks: Record<string, WeekCounts>; note?: string; updatedAt?: string }
/** 1 tháng giáo viên đã kê (teachGet → months, Apps Script 4.9) */
export interface TeachMonthInfo { month: string; updatedAt: string; totals: Record<TeachKey, number>; locked: boolean }
/** Khóa chốt kê khai của 1 tháng: cả trường (all) hoặc từng mã giáo viên */
export interface TeachLock { all?: boolean; codes?: Record<string, boolean>; at?: string; by?: string }
export const isTeachLocked = (l: TeachLock | null | undefined, code: string) => !!l && (!!l.all || !!l.codes?.[code]);

export interface MonthWeek { key: string; index: number; from: string; to: string; label: string }

export const EMPTY_PROFILE: TeachProfile = { subjects: [], classesDisabled: [], classesPE: [], classesEnglish: [] };

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const dm = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;

/** Các tuần (Thứ Hai – Chủ nhật) giao với tháng YYYY-MM; ngày đầu / cuối cắt theo tháng */
export function monthWeeks(ym: string): MonthWeek[] {
  const [y, m] = ym.split('-').map(Number);
  const first = toDateKey(new Date(y, m - 1, 1));
  const last = toDateKey(new Date(y, m, 0));
  const dow = (fromDateKey(first).getDay() + 6) % 7; // 0 = Thứ Hai
  let monday = addDays(first, -dow);
  const out: MonthWeek[] = [];
  while (monday <= last) {
    const sunday = addDays(monday, 6);
    const from = monday < first ? first : monday;
    const to = sunday > last ? last : sunday;
    // Bỏ "tuần" chỉ gồm Thứ Bảy / Chủ nhật (vd. tháng bắt đầu vào Chủ nhật) — không có tiết dạy
    const friday = addDays(monday, 4);
    const hasWeekday = (from <= friday) && (to >= monday) && (from <= (friday < to ? friday : to));
    if (hasWeekday) out.push({ key: monday, index: out.length + 1, from, to, label: `Tuần ${out.length + 1} (${dm(from)}–${dm(to)})` });
    monday = addDays(monday, 7);
  }
  return out;
}

export const monthLabel = (ym: string) => `Tháng ${Number(ym.slice(5, 7))}/${ym.slice(0, 4)}`;
export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Mục cần kê khai theo khai báo của giáo viên */
export function enabledKeys(p?: TeachProfile | null): TeachKey[] {
  if (!p) return [];
  const subj = (p.subjects || []).map(norm);
  const pe = (p.classesPE || []).length > 0 || subj.some(s => s.includes('the chat') || s === 'gdtc');
  const en = (p.classesEnglish || []).length > 0 || subj.some(s => s.includes('tieng anh'));
  return SHOWN_KEYS.filter(k => (k === 'pe' ? pe : k === 'english' ? en : (p.classesDisabled || []).length > 0));
}

export const sumLog = (log: TeachLog | null | undefined, key: TeachKey) =>
  Object.values(log?.weeks || {}).reduce((a, w) => a + (Number(w?.[key]) || 0), 0);

/** Mã môn (HSKT_SUBJECTS) của các môn giáo viên đã khai báo; "Lịch sử và Địa lí" → cả Lịch sử, Địa lý */
export function subjectCodesOf(subjects: string[] | undefined): string[] {
  const set = new Set<string>();
  (subjects || []).forEach(s => {
    const n = norm(s).trim();
    HSKT_SUBJECTS.forEach(h => { if (norm(h.label) === n || h.aliases.includes(n)) set.add(h.code); });
  });
  return HSKT_SUBJECTS.filter(h => set.has(h.code)).map(h => h.code);
}

/** Tiết HSKT của 1 môn trong 1 tuần; dữ liệu cũ (chỉ có tổng) không chia được theo môn → 0 */
export const ktOf = (w: WeekCounts | undefined, code: string) => Number(w?.kt?.[code]) || 0;

/** Năm học của tháng YYYY-MM (từ tháng 8 sang năm học mới) */
export function schoolYearOf(ym: string) {
  const y = Number(ym.slice(0, 4)); const m = Number(ym.slice(5, 7));
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

const friendly = (e: any) => {
  const msg = String(e?.message || '');
  if (/Hành động không hợp lệ|phiên bản 4\.2/.test(msg)) {
    return 'Hệ thống của trường chưa có đủ chức năng Kê khai tiết dạy (cần Apps Script 4.9). Vui lòng báo Quản trị nhà trường cập nhật.';
  }
  return msg || 'Không kết nối được máy chủ.';
};

async function safeCall(body: Record<string, unknown>, timeout?: number) {
  try {
    const r = await staffAttendanceService.call(body, null, timeout);
    if (r && r.success === false && /Hành động không hợp lệ/i.test(String(r.message || ''))) return { success: false, message: friendly({ message: r.message }) };
    return r;
  } catch (e: any) {
    return { success: false, code: e?.code, message: friendly(e) };
  }
}

export const teachingLogService = {
  get(cccd: string, pin: string, month: string) {
    return safeCall({ action: 'teachGet', cccd, pin, month });
  },
  saveProfile(cccd: string, pin: string, profile: TeachProfile) {
    return safeCall({ action: 'teachSaveProfile', cccd, pin, profile });
  },
  saveLog(cccd: string, pin: string, month: string, weeks: Record<string, WeekCounts>, note: string) {
    return safeCall({ action: 'teachSaveLog', cccd, pin, month, weeks, note });
  },
  /** BGH / Quản trị: tổng hợp các tháng from..to */
  report(from: string, to: string, auth?: { username: string; password: string } | null): Promise<{
    success: boolean; message?: string; code?: string; from?: string; to?: string; today?: string;
    profiles?: Record<string, TeachProfile>; logs?: Record<string, Record<string, TeachLog>>; staff?: StaffMember[];
    locks?: Record<string, TeachLock>;
  }> {
    return safeCall({ action: 'teachReport', auth: auth ?? staffAttendanceService.getViewerAuth(), from, to }, 45000);
  },
  /** BGH / Quản trị: khóa (lock = true) hoặc mở khóa kê khai tháng `month` cho cả trường (all) hoặc các mã `codes` */
  lock(month: string, lock: boolean, target: { all?: boolean; codes?: string[] }, auth?: { username: string; password: string } | null): Promise<{ success: boolean; message?: string; lock?: TeachLock | null }> {
    return safeCall({ action: 'teachLock', auth: auth ?? staffAttendanceService.getViewerAuth(), month, lock, all: !!target.all, codes: target.codes || [] });
  },
};
