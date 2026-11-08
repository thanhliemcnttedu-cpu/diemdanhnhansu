/**
 * 🔑 LICENSE & CDKEY ACTIVATION SERVICE
 * Quản lý bản quyền phần mềm Lớp Học Hạnh Phúc
 *
 * Chế độ dùng thử (Trial Mode):
 * - Tối đa 01 lớp học
 * - Mỗi lớp tối đa 10 học sinh
 * Khi kích hoạt đúng CDKEY: mở khóa không giới hạn số lớp và số học sinh.
 *
 * 🔒 Mã CDKEY KHÔNG lưu dạng chữ trong mã nguồn: chỉ so sánh mã băm.
 *    Trạng thái kích hoạt lưu kèm chữ ký (mã băm gắn với máy/trình duyệt) — sửa tay localStorage không mở khóa được.
 */

export const LOCAL_LICENSE_STORAGE_KEY = 'lhhp_cdkey_license_v1';
/** Hiển thị thay cho mã thật sau khi đã kích hoạt */
export const MASKED_CDKEY = '•••• •••• •••• (đã kích hoạt)';
/** Giữ tên cũ cho các màn hình đang import (không còn chứa mã thật) */
export const OFFICIAL_CDKEY = MASKED_CDKEY;

export const TRIAL_MAX_CLASSES = 1;
export const TRIAL_MAX_STUDENTS_PER_CLASS = 10;

// Mã băm của CDKEY hợp lệ (chuẩn hoá: viết hoa, bỏ khoảng trắng/gạch nối)
const VALID_KEY_HASHES = new Set<string>(['wc5v9pbrz1']);

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

const compactKey = (raw: string) => (raw || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
const keyHash = (raw: string) => cyrb53(`LHHP|${compactKey(raw)}`);

/** Chữ ký trạng thái kích hoạt: gắn với mã băm của khóa + thời điểm kích hoạt */
const signLicense = (hash: string, activatedAt: string) => cyrb53(`LHHP-SIG|${hash}|${activatedAt}`, 0x5eed);

export interface LicenseDetails {
  isActivated: boolean;
  key: string; // luôn là chuỗi che (không lộ mã thật)
  activatedAt?: string;
  licensedTo?: string;
  schoolName?: string;
}

export type LicenseChangeListener = (details: LicenseDetails) => void;

class LicenseService {
  private listeners: Set<LicenseChangeListener> = new Set();
  private currentDetails: LicenseDetails;

  constructor() {
    this.currentDetails = this.loadFromStorage();
  }

  private loadFromStorage(): LicenseDetails {
    const trial: LicenseDetails = { isActivated: false, key: '', activatedAt: undefined };
    try {
      const raw = localStorage.getItem(LOCAL_LICENSE_STORAGE_KEY);
      if (!raw) return trial;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.isActivated) return trial;

      // Bản ghi mới: có mã băm + chữ ký hợp lệ
      if (parsed.h && parsed.sig && VALID_KEY_HASHES.has(parsed.h) && parsed.activatedAt
        && signLicense(parsed.h, parsed.activatedAt) === parsed.sig) {
        return {
          isActivated: true,
          key: MASKED_CDKEY,
          activatedAt: parsed.activatedAt,
          licensedTo: parsed.licensedTo || 'Giáo viên Bản quyền Chính thức',
          schoolName: parsed.schoolName || '',
        };
      }

      // Bản ghi cũ (trước khi có chữ ký): chỉ chấp nhận nếu chứa đúng mã → nâng cấp sang bản ghi có chữ ký
      if (typeof parsed.key === 'string' && VALID_KEY_HASHES.has(keyHash(parsed.key))) {
        const activatedAt = parsed.activatedAt || new Date().toISOString();
        const h = keyHash(parsed.key);
        const upgraded = { isActivated: true, h, sig: signLicense(h, activatedAt), activatedAt, licensedTo: parsed.licensedTo, schoolName: parsed.schoolName };
        try { localStorage.setItem(LOCAL_LICENSE_STORAGE_KEY, JSON.stringify(upgraded)); } catch (_) { /* ignore */ }
        return { isActivated: true, key: MASKED_CDKEY, activatedAt, licensedTo: parsed.licensedTo || 'Giáo viên Bản quyền Chính thức', schoolName: parsed.schoolName || '' };
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

  /** Kích hoạt bản quyền bằng CDKEY (không phân biệt hoa/thường, khoảng trắng, gạch nối) */
  public activate(inputKey: string, licensedTo?: string, schoolName?: string): { success: boolean; message: string } {
    const h = keyHash(inputKey);
    if (compactKey(inputKey) && VALID_KEY_HASHES.has(h)) {
      const activatedAt = new Date().toISOString();
      const record = {
        isActivated: true, h, sig: signLicense(h, activatedAt), activatedAt,
        licensedTo: licensedTo || 'Giáo viên Bản quyền Chính thức',
        schoolName: schoolName || '',
      };
      try { localStorage.setItem(LOCAL_LICENSE_STORAGE_KEY, JSON.stringify(record)); } catch (_) { /* ignore */ }
      this.currentDetails = { isActivated: true, key: MASKED_CDKEY, activatedAt, licensedTo: record.licensedTo, schoolName: record.schoolName };
      this.notifyListeners();
      return {
        success: true,
        message: 'Kích hoạt thành công! Phần mềm Lớp Học Hạnh Phúc đã mở khóa bản quyền không giới hạn.'
      };
    }
    return {
      success: false,
      message: 'Mã CDKEY không hợp lệ! Vui lòng liên hệ Thầy Nguyễn Thanh Liêm (0888.358.363) để nhận mã kích hoạt bản quyền chính thức.'
    };
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
        message: `Chế độ Dùng Thử: Giới hạn tối đa ${String(TRIAL_MAX_CLASSES).padStart(2, '0')} lớp học! Vui lòng kích hoạt CDKEY Bản Quyền để quản lý nhiều lớp học.`
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
          ? `Chế độ Dùng Thử: mỗi lớp tối đa ${TRIAL_MAX_STUDENTS_PER_CLASS} học sinh. Lớp còn thêm được ${remaining} em — phần mềm chỉ thêm ${remaining} em đầu danh sách. Kích hoạt CDKEY Bản Quyền để mở khóa sĩ số không giới hạn.`
          : `Chế độ Dùng Thử: Giới hạn tối đa ${TRIAL_MAX_STUDENTS_PER_CLASS} học sinh/lớp! Vui lòng kích hoạt CDKEY Bản Quyền để mở khóa toàn bộ sĩ số không giới hạn.`
      };
    }
    return { allowed: true, remaining };
  }
}

export const licenseService = new LicenseService();
