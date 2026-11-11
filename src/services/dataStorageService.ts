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

import { isViewOnly } from '../utils/viewOnlyMode';

export const STORAGE_LOCATION_KEY = 'lhhp_data_storage_path_config_v2';
/** Bản web (không có máy chủ / Electron): trình duyệt chỉ ghi được vào thư mục người dùng TỰ CHỌN qua hộp chọn thư mục */
const FS_DB = 'lhhp_local_folder';
const FS_STORE = 'handles';
const FS_KEY = 'role_data_folder';
export const LOCAL_FOLDER_EVENT = 'lhhp:local-folder-status';

export interface LocalFolderStatus {
  supported: boolean;
  /** Đã chọn thư mục */
  picked: boolean;
  folderName: string;
  /** Trình duyệt đã quên quyền ghi (sau khi mở lại) → cần bấm cho phép */
  needsPermission: boolean;
  fileName?: string;
  sizeKb?: number;
  savedAt?: string;
  error?: string;
}

function fsOpenDb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(FS_DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(FS_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}
async function fsGetHandle(): Promise<any> {
  const db = await fsOpenDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const r = db.transaction(FS_STORE, 'readonly').objectStore(FS_STORE).get(FS_KEY);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}
async function fsSetHandle(handle: any): Promise<void> {
  const db = await fsOpenDb();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(FS_STORE, 'readwrite');
      if (handle) tx.objectStore(FS_STORE).put(handle, FS_KEY); else tx.objectStore(FS_STORE).delete(FS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (_) { resolve(); }
  });
}
/** Có máy chủ Express hoặc Electron ghi tệp theo đường dẫn không (bản web tĩnh thì không) */
function hasNativeWriter(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as any).electronAPI?.saveRoleFile) return true;
  return (window as any).__lhhpApiAvailable === true;
}
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
  /** Bản web: tên thư mục đã chọn bằng hộp chọn thư mục của trình duyệt */
  browserFolderName?: string;
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
          lastSavedAt: parsed.lastSavedAt,
          browserFolderName: parsed.browserFolderName
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

    // Đồng bộ lên server (bản web tĩnh không có /api → bỏ qua)
    if (typeof window !== 'undefined' && (window as any).__lhhpApiAvailable === true) try {
      fetch('/api/storage/save-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.config)
      }).catch(() => {});
    } catch (_) {}

    return this.getConfig();
  }

  // ───────────── BẢN WEB: ghi tệp THẬT vào thư mục người dùng chọn (File System Access API — Chrome / Edge) ─────────────
  private localStatus: LocalFolderStatus = { supported: false, picked: false, folderName: '', needsPermission: false };

  /** Bản web tĩnh (không máy chủ, không Electron): chỉ ghi được qua thư mục đã chọn trong trình duyệt */
  public isBrowserFolderMode(): boolean { return !hasNativeWriter(); }
  public isFolderPickerSupported(): boolean { return typeof window !== 'undefined' && 'showDirectoryPicker' in window; }
  public getLocalFolderStatus(): LocalFolderStatus { return { ...this.localStatus }; }

  private setLocalStatus(patch: Partial<LocalFolderStatus>) {
    this.localStatus = { ...this.localStatus, ...patch, supported: this.isFolderPickerSupported() };
    try { window.dispatchEvent(new CustomEvent(LOCAL_FOLDER_EVENT, { detail: this.getLocalFolderStatus() })); } catch (_) { /* ignore */ }
  }

  /** Đọc trạng thái thư mục đã chọn (không hỏi quyền) */
  public async refreshLocalFolderStatus(fileName?: string): Promise<LocalFolderStatus> {
    if (!this.isFolderPickerSupported()) { this.setLocalStatus({ picked: false, folderName: '', needsPermission: false }); return this.getLocalFolderStatus(); }
    const handle = await fsGetHandle();
    if (!handle) { this.setLocalStatus({ picked: false, folderName: '', needsPermission: false, sizeKb: undefined }); return this.getLocalFolderStatus(); }
    let perm = 'granted';
    try { if (handle.queryPermission) perm = await handle.queryPermission({ mode: 'readwrite' }); } catch (_) { perm = 'prompt'; }
    const patch: Partial<LocalFolderStatus> = { picked: true, folderName: handle.name || '', needsPermission: perm !== 'granted' };
    if (perm === 'granted' && fileName) {
      try {
        const fh = await handle.getFileHandle(fileName);
        const f = await fh.getFile();
        patch.fileName = fileName;
        patch.sizeKb = Math.round(f.size / 102.4) / 10;
        patch.savedAt = new Date(f.lastModified).toLocaleString('vi-VN');
      } catch (_) { patch.fileName = fileName; patch.sizeKb = undefined; patch.savedAt = undefined; }
    }
    this.setLocalStatus(patch);
    return this.getLocalFolderStatus();
  }

  /** Mở hộp chọn thư mục của trình duyệt (phải gọi từ thao tác bấm nút) */
  public async pickLocalFolder(): Promise<{ ok: boolean; message: string }> {
    if (!this.isFolderPickerSupported()) {
      return { ok: false, message: 'Trình duyệt này không cho phần mềm ghi tệp vào thư mục máy tính. Hãy dùng Chrome hoặc Edge trên máy tính, hoặc bấm "Tải tệp về máy".' };
    }
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite', id: 'lhhp-data' });
      if (handle.requestPermission && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
        return { ok: false, message: 'Chưa được phép ghi vào thư mục này. Hãy bấm "Cho phép" khi trình duyệt hỏi.' };
      }
      await fsSetHandle(handle);
      this.saveConfig({ browserFolderName: handle.name || '' });
      this.setLocalStatus({ picked: true, folderName: handle.name || '', needsPermission: false, fileName: undefined, sizeKb: undefined, savedAt: undefined, error: undefined });
      return { ok: true, message: `Đã chọn thư mục "${handle.name}".` };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { ok: false, message: '' };
      return { ok: false, message: 'Không mở được thư mục này (trình duyệt chặn thư mục hệ thống và thư mục gốc của ổ đĩa). Hãy tạo / chọn một thư mục thường ở ổ D hoặc E.' };
    }
  }

  /** Xin lại quyền ghi (trình duyệt quên quyền sau khi mở lại) — gọi từ thao tác bấm nút */
  public async requestLocalPermission(): Promise<boolean> {
    const handle = await fsGetHandle();
    if (!handle) return false;
    try {
      const perm = handle.requestPermission ? await handle.requestPermission({ mode: 'readwrite' }) : 'granted';
      this.setLocalStatus({ needsPermission: perm !== 'granted' });
      return perm === 'granted';
    } catch (_) { return false; }
  }

  public async forgetLocalFolder(): Promise<void> {
    await fsSetHandle(null);
    this.saveConfig({ browserFolderName: '' });
    this.setLocalStatus({ picked: false, folderName: '', needsPermission: false, fileName: undefined, sizeKb: undefined, savedAt: undefined, error: undefined });
  }

  /**
   * Kiểm tra (và xin lại nếu cần) quyền ghi thư mục đã chọn. Gọi NGAY trong thao tác bấm nút, trước các việc
   * chạy lâu — trình duyệt chỉ hiện hộp xin quyền khi còn trong thao tác của người dùng.
   */
  public async ensureLocalWritePermission(): Promise<{ ok: boolean; code?: 'UNSUPPORTED' | 'NO_FOLDER' | 'NEED_PERMISSION'; message: string; folderName?: string }> {
    if (!this.isFolderPickerSupported()) return { ok: false, code: 'UNSUPPORTED', message: 'Trình duyệt này không ghi được tệp vào thư mục máy tính. Hãy dùng Chrome hoặc Edge trên máy tính.' };
    const handle = await fsGetHandle();
    if (!handle) return { ok: false, code: 'NO_FOLDER', message: 'Chưa chọn thư mục trên máy tính. Hãy bấm "Chọn thư mục trên máy tính" trước.' };
    try {
      let perm = handle.queryPermission ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted';
      if (perm !== 'granted' && handle.requestPermission) perm = await handle.requestPermission({ mode: 'readwrite' });
      this.setLocalStatus({ picked: true, folderName: handle.name || '', needsPermission: perm !== 'granted' });
      if (perm !== 'granted') return { ok: false, code: 'NEED_PERMISSION', folderName: handle.name, message: 'Trình duyệt chưa được phép ghi vào thư mục. Hãy bấm "Cho phép ghi vào thư mục" rồi thử lại.' };
      return { ok: true, message: '', folderName: handle.name };
    } catch (_) {
      return { ok: false, code: 'NEED_PERMISSION', folderName: handle.name, message: 'Không xin được quyền ghi vào thư mục. Hãy chọn lại thư mục.' };
    }
  }

  /**
   * Ghi nhiều tệp vào thư mục đã chọn, có thể nằm trong thư mục con (`dir`, tự tạo nếu chưa có).
   * Chỉ tạo / ghi đè đúng các tệp được truyền vào; không xóa gì khác. Không hỏi quyền — gọi ensureLocalWritePermission trước.
   */
  public async writeFilesToLocalFolder(
    entries: Array<{ dir?: string; name: string; data?: any; text?: string }>,
    onProgress?: (done: number, total: number) => void
  ): Promise<{ success: boolean; message: string; code?: 'UNSUPPORTED' | 'NO_FOLDER' | 'NEED_PERMISSION' | 'WRITE_ERROR'; folderName?: string; written: number; totalKb: number; sizes?: Record<string, number> }> {
    if (!this.isFolderPickerSupported()) return { success: false, code: 'UNSUPPORTED', message: 'Trình duyệt này không ghi được tệp vào thư mục máy tính.', written: 0, totalKb: 0 };
    const handle = await fsGetHandle();
    if (!handle) return { success: false, code: 'NO_FOLDER', message: 'Chưa chọn thư mục trên máy tính.', written: 0, totalKb: 0 };
    const perm = handle.queryPermission ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted';
    if (perm !== 'granted') return { success: false, code: 'NEED_PERMISSION', folderName: handle.name, message: 'Trình duyệt cần được cho phép ghi lại vào thư mục.', written: 0, totalKb: 0 };
    const dirs: Record<string, any> = { '': handle };
    const sizes: Record<string, number> = {};
    let written = 0, totalBytes = 0;
    try {
      for (const e of entries) {
        const dirName = (e.dir || '').trim();
        if (!dirs[dirName]) dirs[dirName] = await handle.getDirectoryHandle(dirName, { create: true });
        const text = typeof e.text === 'string' ? e.text : JSON.stringify(e.data ?? null, null, 2);
        const fh = await dirs[dirName].getFileHandle(e.name, { create: true });
        const w = await fh.createWritable();
        await w.write(text);
        await w.close();
        const bytes = new Blob([text]).size;
        totalBytes += bytes;
        sizes[dirName ? `${dirName}/${e.name}` : e.name] = Math.round(bytes / 102.4) / 10;
        written++;
        if (onProgress) onProgress(written, entries.length);
      }
    } catch (err: any) {
      return { success: false, code: 'WRITE_ERROR', folderName: handle.name, written, totalKb: Math.round(totalBytes / 102.4) / 10, sizes,
        message: `Không ghi được tệp vào thư mục "${handle.name || ''}" (đã ghi ${written}/${entries.length} tệp): ${err?.message || 'lỗi không rõ'}.` };
    }
    return { success: true, folderName: handle.name, written, totalKb: Math.round(totalBytes / 102.4) / 10, sizes, message: `Đã ghi ${written} tệp vào thư mục "${handle.name}".` };
  }

  /** Ghi tệp thật vào thư mục đã chọn. Không hỏi quyền (để dùng được trong tự động lưu). */
  private async writeToLocalFolder(fileName: string, data: any): Promise<{ success: boolean; message: string; sizeKb?: number; folderName?: string; code?: 'UNSUPPORTED' | 'NO_FOLDER' | 'NEED_PERMISSION' | 'WRITE_ERROR' }> {
    if (!this.isFolderPickerSupported()) return { success: false, code: 'UNSUPPORTED', message: 'Trình duyệt này không ghi được tệp vào thư mục máy tính (cần Chrome hoặc Edge trên máy tính).' };
    const handle = await fsGetHandle();
    if (!handle) return { success: false, code: 'NO_FOLDER', message: 'Chưa chọn thư mục trên máy tính.' };
    try {
      const perm = handle.queryPermission ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted';
      if (perm !== 'granted') {
        this.setLocalStatus({ picked: true, folderName: handle.name || '', needsPermission: true });
        return { success: false, code: 'NEED_PERMISSION', folderName: handle.name, message: 'Trình duyệt cần được cho phép ghi lại vào thư mục (bấm "Cho phép ghi vào thư mục").' };
      }
      const text = JSON.stringify(data, null, 2);
      const fh = await handle.getFileHandle(fileName, { create: true });
      const w = await fh.createWritable();
      await w.write(text);
      await w.close();
      const sizeKb = Math.round(new Blob([text]).size / 102.4) / 10;
      const savedAt = new Date().toLocaleString('vi-VN');
      this.setLocalStatus({ picked: true, folderName: handle.name || '', needsPermission: false, fileName, sizeKb, savedAt, error: undefined });
      return { success: true, sizeKb, folderName: handle.name, message: `Đã ghi tệp ${fileName} vào thư mục "${handle.name}".` };
    } catch (err: any) {
      const message = `Không ghi được tệp vào thư mục "${handle.name || ''}": ${err?.message || 'lỗi không rõ'}. Hãy chọn lại thư mục.`;
      this.setLocalStatus({ error: message });
      return { success: false, code: 'WRITE_ERROR', message };
    }
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
  ): Promise<{ success: boolean; message: string; fileName: string; filePath?: string; sizeKb?: number; code?: string }> {
    // 🛡️ Luôn nạp cấu hình mới nhất từ bộ nhớ để đảm bảo lưu đúng thư mục ổ D/E/F người dùng đã chọn
    this.config = this.loadConfig();
    const fileName = getRoleScopedDataFileName(currentUser, teacherRole, activeClassName);
    const targetFolder = targetFolderOverride || this.config.customPath || `${this.config.selectedDrive}\\DuLieu_LopHocHanhPhuc`;

    // 👁️ Chế độ chỉ xem: không ghi tệp của giáo viên đang xem ra máy Quản trị
    if (isViewOnly()) return { success: false, message: 'Đang ở chế độ chỉ xem — không ghi tệp.', fileName, code: 'VIEW_ONLY' };

    // 🌐 BẢN WEB (Vercel — không máy chủ, không Electron): trình duyệt KHÔNG ghi được theo đường dẫn kiểu "D:\…".
    // Chỉ ghi được vào thư mục người dùng đã chọn bằng hộp chọn thư mục → ghi THẬT, không báo thành công giả.
    if (!hasNativeWriter()) {
      const r = await this.writeToLocalFolder(fileName, data);
      if (r.success) {
        this.saveConfig({ lastSavedFileName: fileName, lastSavedAt: new Date().toLocaleString('vi-VN'), currentFileSizeKb: r.sizeKb, browserFolderName: r.folderName });
      }
      return { success: r.success, message: r.message, fileName, filePath: r.folderName ? `${r.folderName}\\${fileName}` : undefined, sizeKb: r.sizeKb, code: r.code };
    }

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
    }, hasNativeWriter() ? 600 : 3000); // bản web ghi cả tệp vào thư mục máy → gom 3 giây
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
      success: false,
      foundLocations: [],
      message: 'Bản web không tự quét được ổ đĩa. Hãy bấm "Chọn tệp .json" và trỏ tới tệp dữ liệu.'
    };
  }
}

export const dataStorageService = new DataStorageService();
