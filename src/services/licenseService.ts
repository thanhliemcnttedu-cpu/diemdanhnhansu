/**
 * 🔑 LICENSE & CDKEY ACTIVATION SERVICE
 * Quản lý bản quyền phần mềm Lớp Học Hạnh Phúc
 * 
 * Mã kích hoạt chính thức cho cả 3 cấp độ: LOP-HOC-HANH-PHUC
 * Cấp độ 1: Quản trị nhà trường
 * Cấp độ 2: Ban giám hiệu
 * Cấp độ 3: Giáo viên chủ nhiệm & Giáo viên chuyên ngành
 * 
 * Chế độ dùng thử (Trial Mode):
 * - Tối đa 01 lớp học
 * - Mỗi lớp tối đa 10 học sinh
 * Khi kích hoạt đúng CDKEY: Mở khóa vĩnh viễn không giới hạn số lớp và số học sinh!
 */

export const OFFICIAL_CDKEY = 'LOP-HOC-HANH-PHUC';
export const LOCAL_LICENSE_STORAGE_KEY = 'lhhp_cdkey_license_v1';

export interface LicenseDetails {
  isActivated: boolean;
  key: string;
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

  private normalizeKey(rawKey: string): string {
    if (!rawKey) return '';
    return rawKey
      .trim()
      .toUpperCase()
      .replace(/[\s_]+/g, '-');
  }

  private loadFromStorage(): LicenseDetails {
    try {
      const raw = localStorage.getItem(LOCAL_LICENSE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.isActivated) {
          return {
            isActivated: true,
            key: parsed.key || OFFICIAL_CDKEY,
            activatedAt: parsed.activatedAt || '2026-10-22',
            licensedTo: parsed.licensedTo || 'Giáo viên Bản quyền Chính thức',
            schoolName: parsed.schoolName || ''
          };
        }
      }
    } catch (_) {}

    return {
      isActivated: false,
      key: '',
      activatedAt: undefined
    };
  }

  private saveToStorage(details: LicenseDetails): void {
    try {
      localStorage.setItem(LOCAL_LICENSE_STORAGE_KEY, JSON.stringify(details));
    } catch (_) {}
    this.currentDetails = details;
    this.notifyListeners();
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
      try {
        fn(details);
      } catch (_) {}
    });
  }

  /**
   * Kích hoạt bản quyền bằng CDKEY
   * Chấp nhận: LOP-HOC-HANH-PHUC (hoặc LOPHOCHANHPHUC, viết thường, có khoảng trắng)
   */
  public activate(inputKey: string, licensedTo?: string, schoolName?: string): { success: boolean; message: string } {
    const normalized = this.normalizeKey(inputKey);
    const compactKey = normalized.replace(/-/g, '');

    const isValid = 
      normalized === OFFICIAL_CDKEY || 
      compactKey === 'LOPHOCHANHPHUC';

    if (isValid) {
      const activatedDetails: LicenseDetails = {
        isActivated: true,
        key: OFFICIAL_CDKEY,
        activatedAt: new Date().toISOString(),
        licensedTo: licensedTo || 'Giáo viên Bản quyền Chính thức',
        schoolName: schoolName || ''
      };
      this.saveToStorage(activatedDetails);
      return {
        success: true,
        message: 'Kích hoạt thành công! Phần mềm Lớp Học Hạnh Phúc đã mở khóa bản quyền không giới hạn vĩnh viễn!'
      };
    }

    return {
      success: false,
      message: 'Mã CDKEY không hợp lệ! Vui lòng liên hệ Thầy Nguyễn Thanh Liêm (0888.358.363) để nhận mã kích hoạt bản quyền chính thức.'
    };
  }

  /**
   * Hủy kích hoạt (dùng khi thử nghiệm hoặc reset)
   */
  public deactivate(): void {
    const resetDetails: LicenseDetails = {
      isActivated: false,
      key: '',
      activatedAt: undefined
    };
    this.saveToStorage(resetDetails);
  }

  /**
   * Kiểm tra giới hạn số lớp học (Trial: tối đa 01 lớp)
   */
  public checkClassLimit(currentClassesCount: number): { allowed: boolean; message?: string } {
    if (this.isActivated()) return { allowed: true };
    if (currentClassesCount >= 1) {
      return {
        allowed: false,
        message: 'Chế độ Dùng Thử: Giới hạn tối đa 01 lớp học! Vui lòng kích hoạt CDKEY Bản Quyền để quản lý nhiều lớp học.'
      };
    }
    return { allowed: true };
  }

  /**
   * Kiểm tra giới hạn số học sinh trong 1 lớp (Trial: tối đa 10 học sinh)
   */
  public checkStudentLimit(currentStudentsInClassCount: number): { allowed: boolean; message?: string } {
    if (this.isActivated()) return { allowed: true };
    if (currentStudentsInClassCount >= 10) {
      return {
        allowed: false,
        message: 'Chế độ Dùng Thử: Giới hạn tối đa 10 học sinh/lớp! Vui lòng kích hoạt CDKEY Bản Quyền để mở khóa toàn bộ sĩ số không giới hạn.'
      };
    }
    return { allowed: true };
  }
}

export const licenseService = new LicenseService();
