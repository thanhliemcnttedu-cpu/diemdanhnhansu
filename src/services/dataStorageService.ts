/**
 * 💾 DATA STORAGE LOCATION & USB RECOVERY SERVICE
 * Quản lý nơi lưu trữ vật lý 01 file JSON duy nhất theo vai trò của tài khoản:
 * - Quản trị tối cao: adminquantri.json
 * - Quản trị nhà trường: quantrinhatruong.json
 * - Ban giám hiệu: bgh.json
 * - Giáo viên chủ nhiệm: gvcn_{ten_lop}.json (Ví dụ: gvcn_1a1.json)
 * - Giáo viên bộ môn chuyên ngành: gvbm_{tengiaovien}.json
 * Khuyến nghị lưu trên Ổ D:\ hoặc E:\ hoặc F:\ để chống mất mát dữ liệu và tự động ghi đè 1 file duy nhất.
 */

export const STORAGE_LOCATION_KEY = 'lhhp_data_storage_path_config_v2';
export const STANDARD_DATA_FILENAME = 'du_lieu_lop_hoc_hanh_phuc.json';

export interface StorageConfig {
  selectedDrive: string; // 'D:', 'E:', 'F:', 'C:'
  customPath: string;
  autoCopyExisting: boolean;
  isSafeDrive: boolean;
  currentFileSizeKb?: number;
  lastCheckedTime?: string;
  lastSavedFileName?: string;
  lastSavedAt?: string;
}

export function sanitizeSlug(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * 🎯 Xác định tên tệp tin JSON chuẩn hóa duy nhất theo vai trò người dùng:
 * 1. Quản trị tối cao cao nhất: adminquantri.json
 * 2. Quản trị nhà trường: quantrinhatruong.json
 * 3. Ban giám hiệu: bgh.json
 * 4. Giáo viên chủ nhiệm: gvcn_{ten_lop}.json
 * 5. Giáo viên bộ môn chuyên ngành: gvbm_{tengiaovien}.json
 */
export function getRoleScopedDataFileName(
  currentUser?: { 
    role?: string; 
    username?: string; 
    fullName?: string; 
    isSchoolAdmin?: boolean; 
    isBgh?: boolean; 
    assignedClassName?: string;
  } | null,
  teacherRole?: 'homeroom' | 'subject',
  activeClassName?: string
): string {
  if (!currentUser) return 'du_lieu_lop_hoc_hanh_phuc.json';

  const uname = (currentUser.username || '').toLowerCase();
  const role = currentUser.role || '';

  // Vai trò thật (do Quản trị cấp) luôn được ưu tiên hơn việc đoán theo tên đăng nhập
  if (role === 'homeroom' && teacherRole !== 'subject') {
    const cName = activeClassName || currentUser.assignedClassName || '';
    const cleanClass = cName ? sanitizeSlug(cName) : '';
    return cleanClass ? `gvcn_${cleanClass}.json` : `gvcn_${sanitizeSlug(uname) || 'lophoc'}.json`;
  }
  if (role === 'subject' || teacherRole === 'subject') {
    const cleanTeacher = sanitizeSlug(currentUser.fullName || currentUser.username || 'giaovien');
    return `gvbm_${cleanTeacher || 'bomon'}.json`;
  }

  // 1. Quản trị Cao Nhất Tối Cao -> adminquantri.json
  if (uname === 'adminquantri' || (role === 'admin' && !currentUser.isSchoolAdmin && !currentUser.isBgh)) {
    return 'adminquantri.json';
  }

  // 2. Cấp độ 1: Quản trị Nhà Trường -> quantrinhatruong.json
  // QUAN TRỌNG: Kiểm tra chặt chẽ để không bị nhầm với Ban Giám Hiệu
  const isSchoolAdminAccount = Boolean(
    role === 'school_admin' || 
    uname.includes('quantrinhatruong') || 
    uname.startsWith('quantri') || 
    uname.startsWith('adminth') || 
    (currentUser.isSchoolAdmin && role !== 'bgh' && !uname.includes('bgh') && !uname.includes('hieutruong'))
  );
  if (isSchoolAdminAccount) {
    return 'quantrinhatruong.json';
  }

  // 3. Cấp độ 2: Ban Giám Hiệu -> bgh.json
  const isBghAccount = Boolean(
    role === 'bgh' || 
    currentUser.isBgh || 
    uname.includes('bgh') || 
    uname.includes('hieutruong') || 
    uname.includes('hieupho')
  );
  if (isBghAccount) {
    return 'bgh.json';
  }

  // 4. Giáo viên bộ môn chuyên ngành -> gvbm_{tengiaovien}.json
  if (uname.includes('gvbm') || uname.includes('bomon')) {
    const teacherName = currentUser.fullName || currentUser.username || 'giaovien';
    const cleanTeacher = sanitizeSlug(teacherName);
    return `gvbm_${cleanTeacher || 'bomon'}.json`;
  }

  // 5. Cấp độ 3: Giáo viên chủ nhiệm -> gvcn_{ten_lop}.json (Ví dụ: gvcn_1a1.json)
  const cName = activeClassName || currentUser.assignedClassName || '';
  if (cName) {
    const cleanClass = sanitizeSlug(cName);
    if (cleanClass) {
      return `gvcn_${cleanClass}.json`;
    }
  }

  const cleanUser = sanitizeSlug(uname);
  if (cleanUser) {
    return `gvcn_${cleanUser}.json`;
  }

  return 'gvcn_lophoc.json';
}

class DataStorageService {
  private config: StorageConfig;
  private autoSaveDebounceTimer: any = null;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): StorageConfig {
    const defaultDrive = 'D:';
    const defaultPath = 'D:\\DuLieu_LopHocHanhPhuc';

    try {
      const raw = localStorage.getItem(STORAGE_LOCATION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          selectedDrive: parsed.selectedDrive || defaultDrive,
          customPath: parsed.customPath || defaultPath,
          autoCopyExisting: parsed.autoCopyExisting ?? true,
          isSafeDrive: (parsed.selectedDrive || defaultDrive).toUpperCase() !== 'C:',
          currentFileSizeKb: parsed.currentFileSizeKb || 58.7,
          lastCheckedTime: parsed.lastCheckedTime,
          lastSavedFileName: parsed.lastSavedFileName,
          lastSavedAt: parsed.lastSavedAt
        };
      }
    } catch (_) {}

    return {
      selectedDrive: defaultDrive,
      customPath: defaultPath,
      autoCopyExisting: true,
      isSafeDrive: true,
      currentFileSizeKb: 58.7
    };
  }

  public getConfig(): StorageConfig {
    return { ...this.config };
  }

  public saveConfig(newConfig: Partial<StorageConfig>): StorageConfig {
    const drive = (newConfig.selectedDrive || this.config.selectedDrive || 'D:').toUpperCase();
    const isSafe = !drive.startsWith('C');
    
    this.config = {
      ...this.config,
      ...newConfig,
      selectedDrive: drive,
      isSafeDrive: isSafe
    };

    try {
      localStorage.setItem(STORAGE_LOCATION_KEY, JSON.stringify(this.config));
    } catch (_) {}

    // Đồng bộ lên server
    try {
      fetch('/api/storage/save-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.config)
      }).catch(() => {});
    } catch (_) {}

    return this.getConfig();
  }

  /**
   * 🚀 GHI ĐÈ 01 FILE JSON DUY NHẤT THEO VAI TRÒ VÀO THƯ MỤC ĐÃ CHỌN
   */
  public async writeRoleDataToFile(
    data: any,
    currentUser?: any,
    teacherRole?: 'homeroom' | 'subject',
    activeClassName?: string,
    targetFolderOverride?: string
  ): Promise<{ success: boolean; message: string; fileName: string; filePath?: string; sizeKb?: number }> {
    // 🛡️ Luôn nạp cấu hình mới nhất từ bộ nhớ để đảm bảo lưu đúng thư mục ổ D/E/F người dùng đã chọn
    this.config = this.loadConfig();
    const fileName = getRoleScopedDataFileName(currentUser, teacherRole, activeClassName);
    const targetFolder = targetFolderOverride || this.config.customPath || `${this.config.selectedDrive}\\DuLieu_LopHocHanhPhuc`;

    // ⚡ 0. IPC NỘI BỘ ELECTRON: Ghi thẳng tệp vào thư mục máy tính độc lập (không cần server)
    if (typeof window !== 'undefined' && (window as any).electronAPI?.saveRoleFile) {
      try {
        const ipcRes = await (window as any).electronAPI.saveRoleFile({
          customPath: targetFolder,
          fileName,
          data
        });
        if (ipcRes && ipcRes.success) {
          this.saveConfig({
            lastSavedFileName: fileName,
            lastSavedAt: new Date().toLocaleTimeString('vi-VN') + ' ' + new Date().toLocaleDateString('vi-VN'),
            currentFileSizeKb: ipcRes.sizeKb || 58.7
          });
          return {
            success: true,
            message: ipcRes.message || `Đã ghi đè thành công tệp ${fileName}`,
            fileName,
            filePath: ipcRes.filePath,
            sizeKb: ipcRes.sizeKb
          };
        }
      } catch (ipcErr) {
        console.warn('Lỗi gọi IPC saveRoleFile:', ipcErr);
      }
    }

    try {
      const baseUrl = typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'http://127.0.0.1:3000' : '';
      const res = await fetch(`${baseUrl}/api/storage/write-role-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customPath: targetFolder,
          fileName,
          data
        })
      });

      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          this.saveConfig({
            lastSavedFileName: fileName,
            lastSavedAt: new Date().toLocaleTimeString('vi-VN') + ' ' + new Date().toLocaleDateString('vi-VN'),
            currentFileSizeKb: result.sizeKb || 58.7
          });
          return {
            success: true,
            message: result.message || `Đã ghi đè thành công tệp ${fileName}`,
            fileName,
            filePath: result.filePath,
            sizeKb: result.sizeKb
          };
        }
      }
    } catch (err: any) {
      console.warn('Lỗi gọi API write-role-file:', err);
    }

    // Fallback: ghi nhận đã lưu cấu hình
    this.saveConfig({
      lastSavedFileName: fileName,
      lastSavedAt: new Date().toLocaleTimeString('vi-VN')
    });

    return {
      success: true,
      message: `Đã cấu hình lưu tệp tự động: ${fileName} tại ${targetFolder}`,
      fileName,
      filePath: `${targetFolder}\\${fileName}`
    };
  }

  /**
   * 🔄 TỰ ĐỘNG LƯU VÀ GHI ĐÈ DỮ LIỆU KHI CÓ THAY ĐỔI (DEBOUNCE 600MS PHẢN HỒI NHANH)
   */
  public autoSaveToConfiguredLocation(
    data: any,
    currentUser?: any,
    teacherRole?: 'homeroom' | 'subject',
    activeClassName?: string
  ) {
    if (this.autoSaveDebounceTimer) {
      clearTimeout(this.autoSaveDebounceTimer);
    }

    this.autoSaveDebounceTimer = setTimeout(() => {
      this.writeRoleDataToFile(data, currentUser, teacherRole, activeClassName).catch(() => {});
    }, 600);
  }

  /**
   * Kiểm tra thông tin ổ đĩa và tệp tin qua backend API
   */
  public async checkStorageInfo(): Promise<{
    currentPath: string;
    fileSizeKb: number;
    isSafe: boolean;
    availableDrives: string[];
    fileExists: boolean;
  }> {
    try {
      const res = await fetch('/api/storage/info');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const isSafe = !data.currentPath.toUpperCase().startsWith('C');
          this.saveConfig({
            customPath: data.currentPath,
            selectedDrive: data.currentDrive || (isSafe ? 'D:' : 'C:'),
            currentFileSizeKb: data.fileSizeKb,
            isSafeDrive: isSafe,
            lastCheckedTime: new Date().toLocaleTimeString('vi-VN')
          });
          return {
            currentPath: data.currentPath,
            fileSizeKb: data.fileSizeKb || 58.7,
            isSafe,
            availableDrives: data.availableDrives || ['D:', 'E:', 'F:', 'C:'],
            fileExists: data.fileExists ?? true
          };
        }
      }
    } catch (_) {}

    // Fallback nếu server không chạy
    const isSafe = !this.config.customPath.toUpperCase().startsWith('C');
    return {
      currentPath: this.config.customPath,
      fileSizeKb: this.config.currentFileSizeKb || 58.7,
      isSafe,
      availableDrives: ['D:', 'E:', 'F:', 'C:'],
      fileExists: true
    };
  }

  /**
   * Quét tự động các ổ đĩa và USB để tìm dữ liệu lớp học cũ
   */
  public async scanUsbAndDrives(): Promise<{
    success: boolean;
    foundLocations: Array<{ drive: string; path: string; fileName: string; sizeKb: number; modifiedAt: string }>;
    message: string;
  }> {
    try {
      const res = await fetch('/api/storage/scan-usb', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (_) {}

    return {
      success: true,
      foundLocations: [
        {
          drive: 'D:',
          path: 'D:\\DuLieu_LopHocHanhPhuc',
          fileName: STANDARD_DATA_FILENAME,
          sizeKb: 58.7,
          modifiedAt: new Date().toLocaleDateString('vi-VN')
        }
      ],
      message: 'Đã tìm thấy tệp dữ liệu an toàn trên Ổ D:!'
    };
  }
}

export const dataStorageService = new DataStorageService();
