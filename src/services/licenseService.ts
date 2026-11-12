/**
 * 🔑 LICENSE & CDKEY ACTIVATION SERVICE
 * Quản lý bản quyền phần mềm Lớp Học Hạnh Phúc
 *
 * Chế độ dùng thử (Trial Mode):
 * - Tối đa 01 lớp học
 * - Mỗi lớp tối đa 10 học sinh
 * - Khóa: chấm công nhân sự, kê khai tiết dạy, thư khen, xuất báo cáo / Excel / PDF / ảnh thời khóa biểu
 *
 * MÃ BẢN QUYỀN (người dùng chọn 11/2026): MỘT mã do tác giả cung cấp, dùng chung cho bản web và bản cài đặt, KHÔNG gắn với
 * thư mục lưu trữ của trường (trường đổi thư mục, đổi mật khẩu quản trị… bản quyền vẫn giữ). Nhập đúng → mở đủ tính năng.
 * 🔒 Mã KHÔNG lưu dạng chữ trong mã nguồn / tài liệu: chỉ so sánh mã băm (`ACTIVATION_KEY_HASHES`). Bản ghi kích hoạt có
 *    chữ ký (`h` + `sig`). Mã cũ không còn kích hoạt MỚI; máy / trường đã kích hoạt bằng mã cũ vẫn giữ hiệu lực.
 *
 * Còn sẵn (không dùng trong luồng thường): mã KÝ RIÊNG cho thư mục của một trường
 *   LHHP2.<payload base64url>.<chữ ký ECDSA P-256 base64url>     payload = { f: mã thư mục, s: tên trường, i: ngày cấp, n: số cấp }
 * do `scripts/license-issue.cjs` cấp — chặt hơn (mã trường này không dùng được cho trường khác), cần Apps Script 1.1.11.
 */
import { LICENSE_PUBLIC_JWK } from './licensePublicKey';

export const LOCAL_LICENSE_STORAGE_KEY = 'lhhp_cdkey_license_v1';
/** Hiển thị thay cho mã thật sau khi đã kích hoạt */
export const MASKED_CDKEY = '•••• •••• •••• (đã kích hoạt)';
/** Giữ tên cũ cho các màn hình đang import (không còn chứa mã thật) */
export const OFFICIAL_CDKEY = MASKED_CDKEY;

export const TRIAL_MAX_CLASSES = 1;
export const TRIAL_MAX_STUDENTS_PER_CLASS = 10;

// Mã băm của mã bản quyền đang cấp (chuẩn hoá: viết hoa, bỏ khoảng trắng/gạch nối). Nhập đúng mã này → kích hoạt.
// Đổi / thêm mã: tính cyrb53('LHHP|' + mã đã chuẩn hoá) rồi thêm vào đây. KHÔNG ghi mã dạng chữ ở bất kỳ đâu.
const ACTIVATION_KEY_HASHES = new Set<string>(['23m8l8v5mue']);
// Mọi mã băm được nhận trong BẢN GHI đã kích hoạt: mã đang cấp + mã cũ (máy / trường đã kích hoạt bằng mã cũ giữ hiệu lực)
const VALID_KEY_HASHES = new Set<string>([...ACTIVATION_KEY_HASHES, 'wc5v9pbrz1']);

/** Băm nhanh đồng bộ (cyrb53) */
function cyrb53(str: string, seed = 0x1a2b): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const INVALID_KEY_MESSAGE = 'Mã bản quyền không đúng. Vui lòng liên hệ Thầy Nguyễn Thanh Liêm (0888.358.363) để nhận mã kích hoạt bản quyền chính thức.';

const compactKey = (raw: string) => (raw || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
const keyHash = (raw: string) => cyrb53(`LHHP|${compactKey(raw)}`);

/** Chữ ký trạng thái kích hoạt kiểu cũ: gắn với mã băm của khóa + thời điểm kích hoạt */
const signLicense = (hash: string, activatedAt: string) => cyrb53(`LHHP-SIG|${hash}|${activatedAt}`, 0x5eed);

// ------------------------------------------------------------------------------------------- school licence code
const V2_PREFIX = 'LHHP2.';
const DRIVE_CONFIG_KEY = 'lop_hoc_google_drive_config_v2';

export interface SchoolLicensePayload { f: string; s?: string; i?: string; n?: string }

const b64urlToBytes = (v: string): Uint8Array => {
  const b = atob(v.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((v.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

/** Splits a pasted code; null when it is not a school licence code. No signature check here. */
export function parseLicenseCode(raw: string): { code: string; signed: string; sig: Uint8Array; payload: SchoolLicensePayload } | null {
  const code = String(raw || '').replace(/\s+/g, '');
  if (!code.startsWith(V2_PREFIX)) return null;
  const parts = code.split('.');
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]+$/.test(parts[2])) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
    if (!payload || typeof payload.f !== 'string' || !payload.f) return null;
    return { code, signed: `${parts[0]}.${parts[1]}`, sig: b64urlToBytes(parts[2]), payload };
  } catch (_) { return null; }
}

/** Payload when the author's signature is valid, otherwise null (also null where the browser has no WebCrypto) */
export async function verifyLicenseCode(raw: string): Promise<SchoolLicensePayload | null> {
  const p = parseLicenseCode(raw);
  if (!p || !LICENSE_PUBLIC_JWK || typeof crypto === 'undefined' || !crypto.subtle) return null;
  try {
    const key = await crypto.subtle.importKey('jwk', LICENSE_PUBLIC_JWK as JsonWebKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, p.sig as BufferSource, new TextEncoder().encode(p.signed));
    return ok ? p.payload : null;
  } catch (_) { return null; }
}

/** Google Drive folder this machine is connected to (the school's identity for licensing) */
export function currentLicenseFolderId(): string {
  try {
    const cfg = JSON.parse(localStorage.getItem(DRIVE_CONFIG_KEY) || 'null') || {};
    const id = String(cfg.folderId || '').trim();
    if (id) return id;
    const m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(String(cfg.folderUrl || ''));
    return m ? m[1] : '';
  } catch (_) { return ''; }
}

export interface LicenseDetails {
  isActivated: boolean;
  key: string; // luôn là chuỗi che (không lộ mã thật)
  activatedAt?: string;
  licensedTo?: string;
  schoolName?: string;
  /** 'school' = code signed for this school's folder; 'legacy' = activation made with the old shared key */
  kind?: 'school' | 'legacy';
  /** a school licence is stored on this machine but was issued for another folder than the one connected now */
  wrongFolder?: boolean;
}

export type LicenseChangeListener = (details: LicenseDetails) => void;

class LicenseService {
  private listeners: Set<LicenseChangeListener> = new Set();
  private currentDetails: LicenseDetails;

  constructor() {
    this.currentDetails = this.loadFromStorage();
    // A stored school licence is trusted for the first instant, then its signature is checked; a forged record is dropped
    this.verifyStoredSchoolLicense();
    if (typeof window !== 'undefined') {
      const recheck = () => this.refresh();
      window.addEventListener('storage', recheck);
      window.addEventListener('focus', recheck);
    }
  }

  private verifyStoredSchoolLicense(): void {
    let code = '';
    try {
      const p = JSON.parse(localStorage.getItem(LOCAL_LICENSE_STORAGE_KEY) || 'null');
      if (p && p.v === 2) code = String(p.code || '');
    } catch (_) { /* ignore */ }
    if (!code || typeof crypto === 'undefined' || !crypto.subtle) return;
    verifyLicenseCode(code).then((payload) => { if (!payload) this.deactivate(); }).catch(() => {});
  }

  /** Re-read the stored licence (the connected folder may have changed) and tell listeners when the state flips */
  public refresh(): void {
    const next = this.loadFromStorage();
    const changed = next.isActivated !== this.currentDetails.isActivated || next.wrongFolder !== this.currentDetails.wrongFolder;
    this.currentDetails = next;
    if (changed) this.notifyListeners();
  }

  private loadFromStorage(): LicenseDetails {
    const trial: LicenseDetails = { isActivated: false, key: '', activatedAt: undefined };
    try {
      const raw = localStorage.getItem(LOCAL_LICENSE_STORAGE_KEY);
      if (!raw) return trial;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.isActivated) return trial;

      // School licence: valid only while this machine is connected to the folder the code was issued for
      if (parsed.v === 2) {
        const p = parseLicenseCode(String(parsed.code || ''));
        if (!p) return trial;
        if (p.payload.f !== currentLicenseFolderId()) return { ...trial, wrongFolder: true, schoolName: p.payload.s || '' };
        return {
          isActivated: true, key: MASKED_CDKEY, kind: 'school',
          activatedAt: parsed.activatedAt,
          licensedTo: parsed.licensedTo || 'Bản quyền của trường',
          schoolName: p.payload.s || parsed.schoolName || '',
        };
      }

      // Bản ghi kiểu cũ: có mã băm + chữ ký hợp lệ
      if (parsed.h && parsed.sig && VALID_KEY_HASHES.has(parsed.h) && parsed.activatedAt
        && signLicense(parsed.h, parsed.activatedAt) === parsed.sig) {
        return {
          isActivated: true,
          key: MASKED_CDKEY,
          kind: 'legacy',
          activatedAt: parsed.activatedAt,
          licensedTo: parsed.licensedTo || 'Giáo viên Bản quyền Chính thức',
          schoolName: parsed.schoolName || '',
        };
      }

      // Bản ghi rất cũ (trước khi có chữ ký): chỉ chấp nhận nếu chứa đúng mã → nâng cấp sang bản ghi có chữ ký
      if (typeof parsed.key === 'string' && VALID_KEY_HASHES.has(keyHash(parsed.key))) {
        const activatedAt = parsed.activatedAt || new Date().toISOString();
        const h = keyHash(parsed.key);
        const upgraded = { isActivated: true, h, sig: signLicense(h, activatedAt), activatedAt, licensedTo: parsed.licensedTo, schoolName: parsed.schoolName };
        try { localStorage.setItem(LOCAL_LICENSE_STORAGE_KEY, JSON.stringify(upgraded)); } catch (_) { /* ignore */ }
        return { isActivated: true, key: MASKED_CDKEY, kind: 'legacy', activatedAt, licensedTo: parsed.licensedTo || 'Giáo viên Bản quyền Chính thức', schoolName: parsed.schoolName || '' };
      }
    } catch (_) { /* ignore */ }
    return trial;
  }

  public getDetails(): LicenseDetails {
    return { ...this.currentDetails };
  }

  public isActivated(): boolean {
    return this.currentDetails.isActivated;
  }

  public subscribe(listener: LicenseChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.getDetails());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const details = this.getDetails();
    this.listeners.forEach(fn => {
      try { fn(details); } catch (_) { /* ignore */ }
    });
  }

  /**
   * Kích hoạt bằng mã bản quyền do tác giả cung cấp (không phân biệt hoa/thường, khoảng trắng, gạch nối).
   * Mã dùng chung cho bản web và bản cài đặt, KHÔNG gắn với thư mục lưu trữ của trường: trường đổi thư mục, đổi mật khẩu
   * quản trị… bản quyền vẫn giữ. Mã cũ không còn kích hoạt mới (máy / trường đã kích hoạt bằng mã cũ giữ hiệu lực).
   */
  public activate(inputKey: string, licensedTo?: string, schoolName?: string): { success: boolean; message: string } {
    const h = keyHash(inputKey);
    if (!compactKey(inputKey) || !ACTIVATION_KEY_HASHES.has(h)) return { success: false, message: INVALID_KEY_MESSAGE };
    const activatedAt = new Date().toISOString();
    const record = {
      isActivated: true, h, sig: signLicense(h, activatedAt), activatedAt,
      licensedTo: licensedTo || 'Bản quyền chính thức',
      schoolName: schoolName || '',
    };
    try { localStorage.setItem(LOCAL_LICENSE_STORAGE_KEY, JSON.stringify(record)); } catch (_) { /* ignore */ }
    this.currentDetails = { isActivated: true, key: MASKED_CDKEY, kind: 'legacy', activatedAt, licensedTo: record.licensedTo, schoolName: record.schoolName };
    this.notifyListeners();
    return { success: true, message: 'Kích hoạt thành công! Phần mềm Lớp Học Hạnh Phúc đã mở khóa đầy đủ tính năng.' };
  }

  /**
   * Same as activate(), and additionally accepts a code signed for one school folder (LHHP2.…) — a stricter kind of
   * licence the author can issue with scripts/license-issue.cjs; not used in the normal flow.
   */
  public async activateAsync(inputKey: string, licensedTo?: string, schoolName?: string): Promise<{ success: boolean; message: string }> {
    const parsed = parseLicenseCode(inputKey);
    if (!parsed) {
      if (!compactKey(inputKey)) return { success: false, message: 'Vui lòng nhập mã bản quyền.' };
      return this.activate(inputKey, licensedTo, schoolName);
    }
    const folderId = currentLicenseFolderId();
    if (!folderId) {
      return { success: false, message: 'Máy này chưa kết nối thư mục Google Drive của trường. Hãy kết nối (Dữ liệu → Google Drive của trường) rồi nhập mã bản quyền.' };
    }
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      return { success: false, message: 'Trình duyệt này không kiểm tra được chữ ký bản quyền. Hãy mở phần mềm bằng Chrome hoặc Edge bản mới, qua địa chỉ https.' };
    }
    const payload = await verifyLicenseCode(parsed.code);
    if (!payload) {
      return { success: false, message: 'Mã bản quyền không hợp lệ (chữ ký không đúng). Hãy sao chép lại đầy đủ mã do tác giả gửi, hoặc liên hệ Thầy Nguyễn Thanh Liêm (0888.358.363).' };
    }
    if (payload.f !== folderId) {
      return { success: false, message: `Mã bản quyền này được cấp riêng cho trường khác${payload.s ? ` (${payload.s})` : ''}, không dùng được cho thư mục Google Drive đang kết nối.` };
    }
    const activatedAt = new Date().toISOString();
    const record = { isActivated: true, v: 2, code: parsed.code, activatedAt, licensedTo: licensedTo || 'Bản quyền của trường', schoolName: payload.s || '' };
    try { localStorage.setItem(LOCAL_LICENSE_STORAGE_KEY, JSON.stringify(record)); } catch (_) { /* ignore */ }
    this.currentDetails = { isActivated: true, key: MASKED_CDKEY, kind: 'school', activatedAt, licensedTo: record.licensedTo, schoolName: record.schoolName };
    this.notifyListeners();
    return { success: true, message: `Kích hoạt thành công! Bản quyền${payload.s ? ` của ${payload.s}` : ''} đã mở khóa đầy đủ tính năng.` };
  }

  /**
   * Bản ghi kích hoạt ĐÃ KÝ trên máy — để chia sẻ cho cả trường.
   * Bản quyền theo trường: chính mã bản quyền (chỉ dùng được cho thư mục của trường). Kiểu cũ: mã băm + chữ ký, không có mã CDKEY.
   */
  public getSignedRecord(): { h?: string; sig: string; v?: number; code?: string; activatedAt: string; licensedTo?: string; schoolName?: string } | null {
    if (!this.isActivated()) return null;
    try {
      const p = JSON.parse(localStorage.getItem(LOCAL_LICENSE_STORAGE_KEY) || 'null');
      if (p && p.v === 2 && parseLicenseCode(String(p.code || ''))) {
        const code = String(p.code);
        return { v: 2, code, sig: code.slice(-24), activatedAt: p.activatedAt, licensedTo: p.licensedTo, schoolName: p.schoolName };
      }
      if (p && p.h && p.sig && p.activatedAt && VALID_KEY_HASHES.has(p.h) && signLicense(p.h, p.activatedAt) === p.sig) {
        return { h: p.h, sig: p.sig, activatedAt: p.activatedAt, licensedTo: p.licensedTo, schoolName: p.schoolName };
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  /**
   * Áp bản quyền DÙNG CHUNG kiểu cũ của trường (Apps Script 1.1.7 lưu) — chỉ nhận bản ghi có mã băm hợp lệ
   * và chữ ký đúng. Trả về true khi máy này vừa được kích hoạt.
   */
  public applySharedRecord(rec: any): boolean {
    if (this.isActivated() || !rec || typeof rec !== 'object') return false;
    const h = String(rec.h || ''), sig = String(rec.sig || ''), activatedAt = String(rec.activatedAt || '');
    if (!h || !sig || !activatedAt || !VALID_KEY_HASHES.has(h) || signLicense(h, activatedAt) !== sig) return false;
    const record = {
      isActivated: true, h, sig, activatedAt,
      licensedTo: String(rec.licensedTo || 'Bản quyền dùng chung của trường'),
      schoolName: String(rec.schoolName || ''),
      source: 'school',
    };
    try { localStorage.setItem(LOCAL_LICENSE_STORAGE_KEY, JSON.stringify(record)); } catch (_) { /* ignore */ }
    this.currentDetails = { isActivated: true, key: MASKED_CDKEY, kind: 'legacy', activatedAt, licensedTo: record.licensedTo, schoolName: record.schoolName };
    this.notifyListeners();
    return true;
  }

  /**
   * School-wide licence read from the school's Apps Script: a school licence code (checked: author's signature + issued
   * for the connected folder) or an old shared-key record. Returns true when this machine has just been activated.
   */
  public async applySharedRecordAsync(rec: any): Promise<boolean> {
    if (this.isActivated() || !rec || typeof rec !== 'object') return false;
    if (rec.v !== 2) return this.applySharedRecord(rec);
    const payload = await verifyLicenseCode(String(rec.code || ''));
    if (!payload || payload.f !== currentLicenseFolderId()) return false;
    const activatedAt = String(rec.activatedAt || new Date().toISOString());
    const record = {
      isActivated: true, v: 2, code: String(rec.code).replace(/\s+/g, ''), activatedAt,
      licensedTo: String(rec.licensedTo || 'Bản quyền dùng chung của trường'), schoolName: payload.s || '', source: 'school',
    };
    try { localStorage.setItem(LOCAL_LICENSE_STORAGE_KEY, JSON.stringify(record)); } catch (_) { /* ignore */ }
    this.currentDetails = { isActivated: true, key: MASKED_CDKEY, kind: 'school', activatedAt, licensedTo: record.licensedTo, schoolName: record.schoolName };
    this.notifyListeners();
    return true;
  }

  /**
   * Is this school-wide record a valid licence for the given folder? Nothing is stored. Used by the stand-alone staff
   * check-in page, which talks to a school through its link and not through this machine's Drive connection.
   */
  public async isValidRecordFor(rec: any, folderId: string): Promise<boolean> {
    if (!rec || typeof rec !== 'object') return false;
    if (rec.v === 2) {
      const payload = await verifyLicenseCode(String(rec.code || ''));
      return Boolean(payload && folderId && payload.f === folderId);
    }
    const h = String(rec.h || ''), sig = String(rec.sig || ''), activatedAt = String(rec.activatedAt || '');
    return Boolean(h && sig && activatedAt && VALID_KEY_HASHES.has(h) && signLicense(h, activatedAt) === sig);
  }

  /** Hủy kích hoạt (dùng khi thử nghiệm hoặc reset) */
  public deactivate(): void {
    try { localStorage.removeItem(LOCAL_LICENSE_STORAGE_KEY); } catch (_) { /* ignore */ }
    this.currentDetails = { isActivated: false, key: '', activatedAt: undefined };
    this.notifyListeners();
  }

  /** Kiểm tra giới hạn số lớp học (Trial: tối đa 01 lớp) */
  public checkClassLimit(currentClassesCount: number, adding = 1): { allowed: boolean; remaining: number; message?: string } {
    if (this.isActivated()) return { allowed: true, remaining: Infinity };
    const remaining = Math.max(0, TRIAL_MAX_CLASSES - currentClassesCount);
    if (adding > remaining) {
      return {
        allowed: false,
        remaining,
        message: `Chế độ Dùng Thử: Giới hạn tối đa ${String(TRIAL_MAX_CLASSES).padStart(2, '0')} lớp học! Vui lòng kích hoạt bản quyền của trường để quản lý nhiều lớp học.`
      };
    }
    return { allowed: true, remaining };
  }

  /** Kiểm tra giới hạn số học sinh trong 1 lớp (Trial: tối đa 10 học sinh) */
  public checkStudentLimit(currentStudentsInClassCount: number, adding = 1): { allowed: boolean; remaining: number; message?: string } {
    if (this.isActivated()) return { allowed: true, remaining: Infinity };
    const remaining = Math.max(0, TRIAL_MAX_STUDENTS_PER_CLASS - currentStudentsInClassCount);
    if (adding > remaining) {
      return {
        allowed: false,
        remaining,
        message: remaining > 0
          ? `Chế độ Dùng Thử: mỗi lớp tối đa ${TRIAL_MAX_STUDENTS_PER_CLASS} học sinh. Lớp còn thêm được ${remaining} em — phần mềm chỉ thêm ${remaining} em đầu danh sách. Kích hoạt bản quyền của trường để mở khóa sĩ số không giới hạn.`
          : `Chế độ Dùng Thử: Giới hạn tối đa ${TRIAL_MAX_STUDENTS_PER_CLASS} học sinh/lớp! Vui lòng kích hoạt bản quyền của trường để mở khóa toàn bộ sĩ số không giới hạn.`
      };
    }
    return { allowed: true, remaining };
  }
}

export const licenseService = new LicenseService();
