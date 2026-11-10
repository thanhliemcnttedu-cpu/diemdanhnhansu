import { UserClassroomData, UserAccount, Classroom, Student, DailyAttendance, DailyBoardingMeal } from '../types';
import { 
  StandardClassroomJson, 
  SchoolWideAggregationReport, 
  GoogleDriveConfig 
} from '../types/driveSync';
import { dataAdapter } from './dataAdapter';
import { isViewOnly } from '../utils/viewOnlyMode';
import { compactClassroomDataForDrive } from '../utils/driveCompact';
import { getAppliedAdminEdits, mergeAppliedAdminEdits } from './adminEditsStore';
import { getRoleScopedDataFileName } from './dataStorageService';
import appsScriptSource from '../../scripts/google_apps_script.js?raw';

export const LOCAL_DRIVE_CONFIG_KEY = 'lop_hoc_google_drive_config_v2';

/** Local (device timezone, GMT+7 in Vietnam) YYYY-MM-DD key — avoids the UTC off-by-one before 7am. */
export const toLocalDateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export interface DriveRangeDayTotals {
  attendanceClasses: number;
  students: number;
  present: number;
  late: number;
  excused: number;
  unexcused: number;
  boardingClasses: number;
  boardingRegistered: number;
  boardingActual: number;
}

export interface DriveRangeClass {
  classId: string;
  className: string;
  grade?: string | number;
  schoolName?: string;
  teacherName?: string;
  teacherUsername?: string;
  fileName: string;
  totalStudents: number;
  updatedAt?: string;
  lastReportDate?: string;
  days: Record<string, {
    att?: { present: number; late: number; excused: number; unexcused: number; marked: number };
    brd?: { registered: number; actual: number };
  }>;
}

export interface DriveRangeAggregate {
  success: boolean;
  from: string;
  to: string;
  totalClasses: number;
  totalStudents: number;
  days: Record<string, DriveRangeDayTotals>;
  classes: DriveRangeClass[];
  generatedAt: string;
}

export const DEFAULT_DEBOUNCE_MS = 800;

export type DriveSyncStatusListener = (status: {
  status: 'idle' | 'pending' | 'syncing' | 'success' | 'error';
  lastSyncTime?: string;
  error?: string;
}) => void;

const statusListeners = new Set<DriveSyncStatusListener>();
let debounceTimer: any = null;
let autoSyncIntervalTimer: any = null;
let isSyncingActive = false;
let autoSyncCycleCount = 0;
let urgentPushRequested = false;
let latestSnapshot: { data: UserClassroomData; user: UserAccount; classId?: string } | null = null;

// ⏱️ Bước 3 tối ưu (11/2026): GOM thay đổi 15 giây mới đẩy 1 lần (trước: 0,8 giây) → ít lần ghi đè tệp lớp,
// ít "phiên bản cũ" Drive giữ lại (tính vào dung lượng). Xác nhận điểm danh / bán trú vẫn đẩy NGAY.
// Phần đang chờ được đẩy ngay khi chuyển tab / ẩn / đóng trang / đăng xuất; đóng đột ngột → lần mở sau tự đẩy bù.
export const DRIVE_PUSH_BATCH_MS = 15000;
const PENDING_PUSH_KEY = 'lhhp_drive_push_pending';
const markPendingPush = (username?: string) => { try { if (username) localStorage.setItem(PENDING_PUSH_KEY, username.toLowerCase()); } catch (_) { /* ignore */ } };
const clearPendingPush = (username?: string) => {
  try {
    const cur = localStorage.getItem(PENDING_PUSH_KEY);
    if (cur && (!username || cur === username.toLowerCase())) localStorage.removeItem(PENDING_PUSH_KEY);
  } catch (_) { /* ignore */ }
};
const hasPendingPushFor = (username?: string) => { try { return !!username && localStorage.getItem(PENDING_PUSH_KEY) === username.toLowerCase(); } catch (_) { return false; } };

export const googleDriveService = {
  /**
   * 1. 🔍 Bóc tách Folder ID từ link chia sẻ Google Drive
   * Ví dụ: https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoP -> 1aBcDeFgHiJkLmNoP
   */
  extractFolderIdFromUrl(url: string): string | undefined {
    if (!url || typeof url !== 'string') return undefined;
    const cleanUrl = url.trim();
    
    // Pattern 1: /folders/ID (Hỗ trợ ký tự đặc biệt, gạch ngang ở đuôi như --)
    const folderMatch = cleanUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch && folderMatch[1]) return folderMatch[1];

    // Pattern 2: id=ID
    const idParamMatch = cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParamMatch && idParamMatch[1]) return idParamMatch[1];

    // Pattern 3: /d/ID
    const dMatch = cleanUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (dMatch && dMatch[1]) return dMatch[1];

    // Nếu người dùng dán trực tiếp chuỗi ID ký tự
    if (/^[a-zA-Z0-9_-]{20,}$/.test(cleanUrl)) {
      return cleanUrl;
    }

    return undefined;
  },

  /**
   * 🧹 Chuẩn hóa URL Google Apps Script: loại bỏ khoảng trắng, tự động thêm /exec nếu thiếu
   */
  normalizeScriptUrl(url?: string): string {
    if (!url || typeof url !== 'string') return '';
    let clean = url.trim();
    // Nếu người dùng dán thiếu /exec ở cuối (ví dụ https://script.google.com/macros/s/AKfycb...)
    if (clean.includes('script.google.com/macros/s/') && !clean.endsWith('/exec') && !clean.endsWith('/dev')) {
      clean = clean.replace(/\/+$/, '') + '/exec';
    }
    return clean;
  },

  /**
   * 📜 Tự động sinh mã nguồn Google Apps Script đồng bộ 1-Click
   * Đã tự động điền Folder ID của người dùng và tích hợp xử lý an toàn
   */
  generateAppsScriptCode(folderId?: string): string {
    // Single source of truth: scripts/google_apps_script.js (V3, range aggregation for BGH)
    const cleanId = (folderId || '').trim() || 'DIEN_FOLDER_ID_CUA_BAN_VAO_DAY';
    return appsScriptSource.replace('__FOLDER_ID__', cleanId);
  },

  /**
   * 2. ⚙️ Đọc cấu hình Google Drive từ bộ nhớ cục bộ
   */
  getConfig(): GoogleDriveConfig {
    const defaultConfig: GoogleDriveConfig = {
      folderUrl: '',
      folderId: '',
      scriptUrl: '',
      bghFolderUrl: '',
      bghFolderId: '',
      autoSyncEnabled: true,
      debounceMs: DEFAULT_DEBOUNCE_MS,
      syncStatus: 'idle',
      syncMethod: 'appscript',
      desktopPath: 'G:\\My Drive\\DuLieu_LopHocHanhPhuc',
      folderHistory: []
    };

    // Build-time defaults (Vercel / Railway / GitHub builds): VITE_DRIVE_SCRIPT_URL, VITE_DRIVE_FOLDER_ID
    const envScriptUrl = String((import.meta as any).env?.VITE_DRIVE_SCRIPT_URL || '').trim();
    const envFolderId = String((import.meta as any).env?.VITE_DRIVE_FOLDER_ID || '').trim();
    if (envScriptUrl) defaultConfig.scriptUrl = envScriptUrl;
    if (envFolderId) {
      defaultConfig.folderId = envFolderId;
      defaultConfig.folderUrl = `https://drive.google.com/drive/folders/${envFolderId}`;
    }

    try {
      const raw = localStorage.getItem(LOCAL_DRIVE_CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!parsed.scriptUrl && defaultConfig.scriptUrl) delete parsed.scriptUrl;
        if (!parsed.folderId && defaultConfig.folderId) {
          delete parsed.folderId;
          delete parsed.folderUrl;
        }
        return {
          ...defaultConfig, 
          ...parsed,
          folderHistory: Array.isArray(parsed.folderHistory) && parsed.folderHistory.length > 0 
            ? parsed.folderHistory 
            : defaultConfig.folderHistory
        };
      }
    } catch (_) {}

    return defaultConfig;
  },

  /**
   * 💾 Lưu cấu hình Google Drive (Bảo toàn dữ liệu thông minh)
   */
  saveConfig(newConfig: Partial<GoogleDriveConfig>): GoogleDriveConfig {
    const current = this.getConfig();
    const updated: GoogleDriveConfig = { ...current, ...newConfig };

    // Tự động chuẩn hóa scriptUrl
    if (updated.scriptUrl) {
      updated.scriptUrl = this.normalizeScriptUrl(updated.scriptUrl);
    }

    // Tự động trích xuất folderId nếu người dùng sửa folderUrl
    if (updated.folderUrl) {
      const extracted = this.extractFolderIdFromUrl(updated.folderUrl);
      if (extracted) {
        updated.folderId = extracted;
      }
    } else if (current.folderUrl && !newConfig.folderUrl && newConfig.folderUrl !== '') {
      // Bảo toàn folderUrl cũ nếu không chủ động xóa
      updated.folderUrl = current.folderUrl;
    }

    // Nếu có folderId mà chưa có folderUrl, tự động dựng URL chuẩn
    if (updated.folderId && !updated.folderUrl) {
      updated.folderUrl = `https://drive.google.com/drive/folders/${updated.folderId}`;
    }

    if (updated.bghFolderUrl) {
      const extractedBgh = this.extractFolderIdFromUrl(updated.bghFolderUrl);
      if (extractedBgh) {
        updated.bghFolderId = extractedBgh;
      }
    }

    // Tự động lưu vào lịch sử các thư mục đã từng dùng (Ảnh 6)
    if (updated.folderId) {
      const history = [...(updated.folderHistory || [])];
      const today = new Date().toLocaleDateString('vi-VN');
      const idx = history.findIndex(h => h.id === updated.folderId);
      if (idx >= 0) {
        history[idx].date = today;
        history[idx].url = updated.folderUrl;
      } else {
        history.unshift({
          id: updated.folderId,
          url: updated.folderUrl,
          date: today,
          name: `ID: ${updated.folderId}`
        });
      }
      updated.folderHistory = history.slice(0, 10);
    }

    try {
      localStorage.setItem(LOCAL_DRIVE_CONFIG_KEY, JSON.stringify(updated));
    } catch (_) {}

    this.notifyStatusListeners({
      status: updated.syncStatus,
      lastSyncTime: updated.lastSyncTime,
      error: updated.lastError
    });

    return updated;
  },

  /**
   * Đăng ký lắng nghe thay đổi trạng thái đồng bộ
   */
  subscribeStatus(listener: DriveSyncStatusListener): () => void {
    statusListeners.add(listener);
    // Gửi ngay trạng thái hiện tại
    const cfg = this.getConfig();
    listener({
      status: cfg.syncStatus,
      lastSyncTime: cfg.lastSyncTime,
      error: cfg.lastError
    });
    return () => statusListeners.delete(listener);
  },

  notifyStatusListeners(payload: {
    status: 'idle' | 'pending' | 'syncing' | 'success' | 'error';
    lastSyncTime?: string;
    error?: string;
  }) {
    statusListeners.forEach(fn => {
      try { fn(payload); } catch (_) {}
    });
  },

  /**
   * 3. 🧪 Kiểm tra kết nối Google Apps Script (Ping Test)
   */
  async testConnection(scriptUrl?: string): Promise<{ success: boolean; message: string; isAuthError?: boolean }> {
    const rawUrl = scriptUrl || this.getConfig().scriptUrl;
    if (!rawUrl || !rawUrl.trim()) {
      return { success: false, message: 'Chưa điền URL Web App của Google Apps Script.' };
    }

    const url = this.normalizeScriptUrl(rawUrl);

    if (url.endsWith('/dev')) {
      return {
        success: false,
        message: '⚠️ URL đang có đuôi /dev (Bản thử nghiệm). Thầy/Cô cần mở Deploy -> New deployment để lấy URL chính thức có đuôi /exec!'
      };
    }

    // 1. Thử qua Electron IPC (Nếu đang chạy ứng dụng Desktop đóng gói)
    if (typeof window !== 'undefined' && (window as any).electronAPI?.proxyDrivePing) {
      try {
        const ipcRes = await (window as any).electronAPI.proxyDrivePing({ scriptUrl: url });
        if (ipcRes && typeof ipcRes === 'object') {
          return {
            success: Boolean(ipcRes.success),
            message: ipcRes.message || (ipcRes.success ? 'Kết nối Cầu nối Google Apps Script thành công!' : 'Kết nối thất bại'),
            isAuthError: ipcRes.isAuthError
          };
        }
      } catch (ipcErr) {
        console.warn('IPC proxyDrivePing error:', ipcErr);
      }
    }

    // 2. Thử qua server proxy nội bộ Express
    try {
      const baseUrl = typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'http://127.0.0.1:3000' : '';
      const proxyRes = await fetch(`${baseUrl}/api/drive/ping?scriptUrl=${encodeURIComponent(url)}`);
      if (proxyRes.ok) {
        const data = await proxyRes.json();
        return {
          success: Boolean(data.success),
          message: data.message || 'Kết nối Cầu nối Google Apps Script thành công!',
          isAuthError: data.isAuthError
        };
      }
    } catch (_) {}

    // 3. Fallback thử gọi trực tiếp nếu server proxy không sẵn sàng
    try {
      const targetUrl = url.includes('?') ? `${url}&action=ping` : `${url}?action=ping`;
      const res = await fetch(targetUrl, { method: 'GET', mode: 'cors' });
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        return { success: Boolean(data.success), message: data.message || 'Kết nối thành công!' };
      } catch (_) {
        if (text.includes('accounts.google.com') || text.includes('Sign in') || text.includes('ServiceLogin')) {
          return { 
            success: false, 
            isAuthError: true,
            message: '⚠️ Google Apps Script yêu cầu đăng nhập. Thầy/Cô cần mở Deploy -> Manage deployments -> Chọn chiếc bút (Edit) -> Chỉnh "Who has access" thành "Anyone" (Bất kỳ ai) rồi bấm Deploy lại!'
          };
        }
        return {
          success: false,
          message: 'Google Apps Script phản hồi không đúng cấu trúc JSON: ' + text.slice(0, 150)
        };
      }
    } catch (e: any) {
      return { 
        success: false, 
        message: 'Không thể kết nối đến Google Apps Script. Vui lòng kiểm tra kết nối mạng và đảm bảo quyền truy cập là "Anyone" (Bất kỳ ai).'
      };
    }
  },

  /**
   * 🎯 Xác định tên tệp tin chuẩn hóa theo vai trò người dùng (3 Cấp độ):
   * - Cấp 1 (Quản trị nhà trường): quantrinhatruong.json
   * - Cấp 2 (Ban giám hiệu): bgh.json
   * - Cấp 3 (Giáo viên chủ nhiệm & bộ môn): gvcn_{ten_lop}.json (Ví dụ: gvcn_1a1.json)
   */
  getFileNameForUser(
    currentUser?: UserAccount | null, 
    targetClassName?: string,
    teacherRole?: 'homeroom' | 'subject'
  ): string {
    return getRoleScopedDataFileName(currentUser, teacherRole, targetClassName);
  },

  /**
   * 4. 🚀 ĐẨY DỮ LIỆU LÊN GOOGLE DRIVE (PUSH)
   * Tự động lưu đúng tệp:
   * - BGH: bgh.json
   * - Quản trị nhà trường: quantrinhatruong.json
   * - Giáo viên: gvcn_{ten_lop}.json
   */
  async pushClassData(
    userData: UserClassroomData,
    currentUser: UserAccount,
    targetClassId?: string,
    isManual = false
  ): Promise<{ success: boolean; message: string; fileUrl?: string; isAuthError?: boolean }> {
    // 👁️ Chế độ chỉ xem: không đẩy dữ liệu của giáo viên đang được xem
    if (isViewOnly()) return { success: true, message: 'Chế độ chỉ xem — không lưu.' };
    const config = this.getConfig();
    const scriptUrl = this.normalizeScriptUrl(config.scriptUrl);
    const folderId = config.folderId?.trim();

    if (!scriptUrl) {
      if (isManual) {
        return { success: false, message: 'Vui lòng dán URL Web App của Google Apps Script trước khi đồng bộ.' };
      }
      return { success: false, message: 'Chưa cấu hình Google Apps Script.' };
    }

    if (scriptUrl.endsWith('/dev')) {
      return {
        success: false,
        message: '⚠️ URL đang có đuôi /dev (Bản thử nghiệm). Thầy/Cô cần mở Deploy -> New deployment để lấy URL chính thức có đuôi /exec!'
      };
    }

    this.saveConfig({ syncStatus: 'syncing', lastError: undefined });
    this.notifyStatusListeners({ status: 'syncing' });

    try {
      // 1. Chuẩn hóa dữ liệu sang dạng StandardClassroomJson
      // GVCN: luôn gửi LỚP CHỦ NHIỆM (không gửi lớp bộ môn đang mở) để BGH chỉ tổng hợp đúng lớp chủ nhiệm
      let effectiveTargetClassId = targetClassId;
      const isHomeroomAccount = currentUser.role === 'homeroom' && userData.teacherRole !== 'subject';
      if (isHomeroomAccount && Array.isArray(userData.classes) && userData.classes.length > 0) {
        const assigned = (currentUser.assignedClassName || '').trim().toUpperCase();
        const homeroomClass =
          userData.classes.find(c => c.isHomeroom === true || c.teacherRole === 'homeroom' || c.teacherRole === 'GVCN') ||
          (assigned ? userData.classes.find(c => (c.name || '').trim().toUpperCase() === assigned) : undefined);
        if (homeroomClass) effectiveTargetClassId = homeroomClass.id;
      }
      const standardJson = dataAdapter.toStandardClassroomJson(userData, currentUser, effectiveTargetClassId);
      if (standardJson.metadata) {
        standardJson.metadata.teacherRole = userData.teacherRole === 'subject' || currentUser.role === 'subject' ? 'subject' : 'homeroom';
        // Dấu "đã nhận điều chỉnh của Quản trị" (xem adminEditsService)
        if (currentUser.role === 'homeroom') {
          (standardJson.metadata as any).appliedAdminEdits = getAppliedAdminEdits(currentUser.username);
        }
      }

      // 📦 Tài khoản quản lý (Quản trị tối cao / Quản trị trường / BGH): dữ liệu lớp – học sinh – điểm danh đã nằm
      // trong tệp gvcn_*.json của từng GVCN → tệp riêng (adminquantri.json, quantrinhatruong.json, bgh.json) chỉ giữ
      // thông tin/cấu hình của chính tài khoản, không chép lại toàn bộ lớp (tránh phình to hàng chục MB).
      const uname0 = (currentUser.username || '').toLowerCase();
      const isManagementPush = Boolean(
        uname0 === 'adminquantri' || currentUser.role === 'admin' || currentUser.role === 'school_admin' ||
        currentUser.role === 'bgh' || currentUser.isBgh || currentUser.isSchoolAdmin
      );
      if (isManagementPush) {
        const slim: any = {
          ...userData,
          classes: [],
          students: [],
          attendanceRecords: [],
          boardingRecords: [],
          transactions: [],
          redemptions: [],
          seatingAssignments: {}
        };
        (standardJson as any).fullClassroomData = slim;
        (standardJson as any).students = [];
        (standardJson as any).dailyRecords = {};
        (standardJson as any).systemClasses = [];
        if (standardJson.metadata) (standardJson.metadata as any).totalStudents = 0;
        (standardJson as any).scope = 'management_settings_only';
      }

      // 🛡️ CHỐT CHẶN MẤT DỮ LIỆU: máy GVCN định đẩy tệp lớp 0 học sinh trong khi tệp trên Drive đang có học sinh
      // (thường do bộ nhớ máy trống/cũ) → KHÔNG ghi đè. GVCN đăng nhập lại để khôi phục lớp từ Drive.
      if (!isManagementPush && currentUser.role === 'homeroom' && Array.isArray((standardJson as any).students) && (standardJson as any).students.length === 0) {
        try {
          const fileForCheck = this.getFileNameForUser(currentUser, standardJson.classInfo?.name, userData.teacherRole);
          const remoteRes = await fetch(`${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}action=getLatest&strict=1&folderId=${encodeURIComponent(folderId || '')}&fileName=${encodeURIComponent(fileForCheck)}`);
          const remote = await remoteRes.json();
          const remoteCount = Array.isArray(remote?.students) ? remote.students.length : (Array.isArray(remote?.fullClassroomData?.students) ? remote.fullClassroomData.students.length : 0);
          if (remoteCount > 0) {
            const msg = `Bảo vệ dữ liệu: không ghi đè lớp ${standardJson.classInfo?.name || ''} trên Drive (Drive có ${remoteCount} học sinh, máy này đang có 0). Hãy đăng xuất rồi đăng nhập lại để khôi phục lớp từ Drive.`;
            console.warn(msg);
            this.saveConfig({ syncStatus: 'error', lastError: msg });
            this.notifyStatusListeners({ status: 'error', error: msg });
            return { success: false, message: msg };
          }
        } catch (_) {
          // không kiểm tra được (mất mạng) → không đẩy tệp rỗng cho an toàn
          return { success: false, message: 'Chưa đẩy lớp rỗng lên Drive vì không kiểm tra được dữ liệu hiện có.' };
        }
      }

      // 📦 Bước 1 tối ưu: thu gọn BẢN GỬI (ảnh gốc ở lại máy, ảnh quá lớn nén lại; danh sách chuẩn không kèm ảnh vì
      // ảnh đã nằm trong fullClassroomData). Dữ liệu trên máy giữ nguyên.
      if (!isManagementPush) {
        try {
          if (Array.isArray((standardJson as any).students)) {
            (standardJson as any).students = (standardJson as any).students.map((s: any) => {
              if (!s || typeof s !== 'object') return s;
              const { avatar: _a, ...rest } = s;
              return rest;
            });
          }
          if ((standardJson as any).fullClassroomData) {
            (standardJson as any).fullClassroomData = await compactClassroomDataForDrive((standardJson as any).fullClassroomData);
          }
        } catch (_) { /* gửi bản đầy đủ nếu thu gọn lỗi */ }
      }

      // Lưu 1 bản rolling daily backup cục bộ
      dataAdapter.createDailyRollingBackup(currentUser.username, userData).catch(() => {});

      // Tự động phân định tên file theo vai trò: adminquantri.json, quantrinhatruong.json, bgh.json, gvcn_{ten_lop}.json
      const classFileName = this.getFileNameForUser(currentUser, standardJson.classInfo?.name, userData.teacherRole);

      const payload = {
        action: 'saveClassData',
        folderId: folderId || '',
        fileName: classFileName,
        data: standardJson
      };

      // 2. Gửi qua IPC Electron hoặc server proxy nội bộ (Bảo vệ CORS & xử lý Redirect 302 của Apps Script)
      let resultData: any = null;

      // ⚡ 2.1. Thử qua Electron IPC (Nếu đang chạy ứng dụng Desktop đóng gói)
      if (typeof window !== 'undefined' && (window as any).electronAPI?.proxyDriveSync) {
        try {
          const ipcResult = await (window as any).electronAPI.proxyDriveSync({
            scriptUrl,
            payload
          });
          if (ipcResult) {
            resultData = ipcResult;
          }
        } catch (ipcErr) {
          console.warn('IPC proxyDriveSync error:', ipcErr);
        }
      }

      // 2.2. Thử qua HTTP Express Server proxy nội bộ nếu IPC chưa có kết quả
      if (!resultData) {
        try {
          const baseUrl = typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'http://127.0.0.1:3000' : '';
          const proxyRes = await fetch(`${baseUrl}/api/drive/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scriptUrl,
              folderId: folderId || '',
              fileName: classFileName,
              payload
            })
          });

          if (proxyRes.ok) {
            resultData = await proxyRes.json();
          }
        } catch (_) {}
      }

      // 2.3. Fallback gọi trực tiếp nếu server proxy không có
      if (!resultData) {
        const directRes = await fetch(scriptUrl, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        const directText = await directRes.text();
        try {
          resultData = JSON.parse(directText);
        } catch (_) {
          if (directText.includes('accounts.google.com') || directText.includes('Sign in') || directText.includes('ServiceLogin')) {
            resultData = {
              success: false,
              isAuthError: true,
              message: 'Google Apps Script yêu cầu đăng nhập. Thầy/Cô cần mở Deploy -> Manage deployments -> Chỉnh "Who has access" thành "Anyone" (Bất kỳ ai) rồi bấm Deploy lại!'
            };
          } else {
            resultData = {
              success: false,
              message: 'Google Apps Script phản hồi không đúng JSON: ' + directText.slice(0, 150)
            };
          }
        }
      }

      if (resultData && resultData.success) {
        clearPendingPush(currentUser.username);
        const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        this.saveConfig({
          syncStatus: 'success',
          lastSyncTime: nowStr,
          lastError: undefined
        });
        this.notifyStatusListeners({ status: 'success', lastSyncTime: nowStr });

        // (Đã bỏ tệp kiểu cũ csdl_truong_<mã trường>.json: CSDL V4 duy nhất là csdl_truong.json,
        //  dữ liệu lớp nằm trong gvcn_*.json — tránh trùng lặp và nhầm lẫn trên Drive.)

        return {
          success: true,
          message: resultData.message || `Đồng bộ Google Drive thành công (${classFileName})!`,
          fileUrl: resultData.fileUrl
        };
      } else {
        const errMsg = resultData?.message || 'Lỗi không xác định từ Google Drive.';
        this.saveConfig({ syncStatus: 'error', lastError: errMsg });
        this.notifyStatusListeners({ status: 'error', error: errMsg });
        return { 
          success: false, 
          message: errMsg,
          isAuthError: resultData?.isAuthError
        };
      }

    } catch (err: any) {
      const errMsg = err?.message || 'Không thể kết nối đến máy chủ Google Drive.';
      this.saveConfig({ syncStatus: 'error', lastError: errMsg });
      this.notifyStatusListeners({ status: 'error', error: errMsg });
      return { success: false, message: errMsg };
    }
  },

  /**
   * 5. 📥 KÉO DỮ LIỆU TỪ GOOGLE DRIVE VỀ MÁY (PULL)
   * Áp dụng Smart Merge để không làm mất thông tin cục bộ
   * Tự động kéo đúng file của vai trò:
   * - BGH: bgh.json
   * - Quản trị nhà trường: quantrinhatruong.json
   * - Giáo viên: gvcn_{ten_lop}.json
   */
  async pullClassData(
    localData: UserClassroomData,
    targetFileName?: string,
    currentUser?: UserAccount | null
  ): Promise<{ success: boolean; mergedData?: UserClassroomData; message: string; raw?: any }> {
    const config = this.getConfig();
    const scriptUrl = this.normalizeScriptUrl(config.scriptUrl);
    const folderId = config.folderId?.trim();

    if (!scriptUrl) {
      return { success: false, message: 'Chưa cấu hình URL Google Apps Script.' };
    }

    const fileToFetch = targetFileName || this.getFileNameForUser(currentUser);

    try {
      let standardJson: StandardClassroomJson | null = null;

      // 1. Thử qua Electron IPC
      if (typeof window !== 'undefined' && (window as any).electronAPI?.proxyDrivePull) {
        try {
          const ipcResult = await (window as any).electronAPI.proxyDrivePull({
            scriptUrl,
            folderId: folderId || '',
            fileName: fileToFetch
          });
          if (ipcResult && (ipcResult.students || ipcResult.metadata || ipcResult.fullClassroomData || ipcResult.classes)) {
            standardJson = ipcResult;
          }
        } catch (ipcErr) {
          console.warn('IPC proxyDrivePull error:', ipcErr);
        }
      }

      // 2. Kéo qua server proxy nội bộ Express
      if (!standardJson) {
        try {
          const baseUrl = typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'http://127.0.0.1:3000' : '';
          const proxyRes = await fetch(`${baseUrl}/api/drive/pull?scriptUrl=${encodeURIComponent(scriptUrl)}&folderId=${encodeURIComponent(folderId || '')}&fileName=${encodeURIComponent(fileToFetch)}`);
          if (proxyRes.ok) {
            standardJson = await proxyRes.json();
          }
        } catch (_) {}
      }

      // 3. Fallback trực tiếp
      if (!standardJson) {
        const directRes = await fetch(`${scriptUrl}?action=getLatest&folderId=${encodeURIComponent(folderId || '')}&fileName=${encodeURIComponent(fileToFetch)}`);
        standardJson = await directRes.json();
      }

      if (standardJson && (standardJson.students || standardJson.metadata || standardJson.fullClassroomData || (standardJson as any).classes)) {
        // 💾 Tự động lưu tệp vừa kéo về vào ổ đĩa (data/ hoặc customPath) để máy chủ & Electron truy xuất ngay
        try {
          if (typeof window !== 'undefined' && (window as any).electronAPI?.saveRoleFile) {
            (window as any).electronAPI.saveRoleFile({
              fileName: fileToFetch,
              data: standardJson
            }).catch(() => {});
          } else {
            const baseUrl = typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'http://127.0.0.1:3000' : '';
            fetch(`${baseUrl}/api/storage/write-role-file`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileName: fileToFetch, data: standardJson })
            }).catch(() => {});
          }
        } catch (_) {}

        // GVCN đăng nhập máy mới: khôi phục dấu "đã nhận điều chỉnh của Quản trị" từ tệp lớp
        const appliedFromFile = (standardJson as any)?.metadata?.appliedAdminEdits;
        if (appliedFromFile && currentUser?.role === 'homeroom' && fileToFetch === this.getFileNameForUser(currentUser, (standardJson as any)?.classInfo?.name)) {
          mergeAppliedAdminEdits(currentUser.username, appliedFromFile);
        }

        // Áp dụng Non-Destructive Smart Merge
        const mergedData = dataAdapter.smartMergeClassroomData(localData, standardJson);
        const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        this.saveConfig({ syncStatus: 'success', lastSyncTime: nowStr });
        this.notifyStatusListeners({ status: 'success', lastSyncTime: nowStr });

        return {
          success: true,
          mergedData,
          raw: standardJson,
          message: `Tải và hợp nhất dữ liệu từ Google Drive thành công (${fileToFetch})!`
        };
      } else {
        return { success: false, message: `Không tìm thấy tệp dữ liệu ${fileToFetch} trên Google Drive.` };
      }
    } catch (err: any) {
      return { success: false, message: 'Lỗi tải dữ liệu: ' + (err?.message || err) };
    }
  },

  /**
   * 6. 🏛️ TỔNG HỢP BÁO CÁO TOÀN TRƯỜNG CHO BAN GIÁM HIỆU & ADMIN
   */
  async fetchBghAggregatedReport(
    reportDate?: string,
    bghFolderId?: string
  ): Promise<{ success: boolean; report?: SchoolWideAggregationReport; message: string }> {
    const config = this.getConfig();
    const scriptUrl = this.normalizeScriptUrl(config.scriptUrl);
    const targetFolderId = bghFolderId || config.bghFolderId || config.folderId || '';

    if (!scriptUrl) {
      return { success: false, message: 'Chưa cấu hình URL Google Apps Script cấp trường.' };
    }

    const dateStr = reportDate || toLocalDateKey(new Date());

    try {
      let report: SchoolWideAggregationReport | null = null;

      // 1. Thử qua Electron IPC
      if (typeof window !== 'undefined' && (window as any).electronAPI?.proxyDriveAggregate) {
        try {
          const ipcResult = await (window as any).electronAPI.proxyDriveAggregate({
            scriptUrl,
            folderId: targetFolderId,
            date: dateStr
          });
          if (ipcResult && ipcResult.summary && Array.isArray(ipcResult.classesDetail)) {
            report = ipcResult;
          }
        } catch (ipcErr) {
          console.warn('IPC proxyDriveAggregate error:', ipcErr);
        }
      }

      // 2. Thử qua server Express
      if (!report) {
        try {
          const baseUrl = typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'http://127.0.0.1:3000' : '';
          const proxyRes = await fetch(
            `${baseUrl}/api/drive/aggregate?scriptUrl=${encodeURIComponent(scriptUrl)}&folderId=${encodeURIComponent(targetFolderId)}&date=${encodeURIComponent(dateStr)}`
          );
          if (proxyRes.ok) {
            report = await proxyRes.json();
          }
        } catch (_) {}
      }

      // 3. Thử trực tiếp
      if (!report) {
        const directRes = await fetch(
          `${scriptUrl}?action=aggregateAllClasses&folderId=${encodeURIComponent(targetFolderId)}&date=${encodeURIComponent(dateStr)}`
        );
        report = await directRes.json();
      }

      if (report && report.summary && Array.isArray(report.classesDetail)) {
        return { success: true, report, message: 'Tổng hợp số liệu từ các lớp thành công!' };
      } else {
        return { success: false, message: 'Không thể tổng hợp báo cáo. Vui lòng kiểm tra quyền truy cập thư mục của các lớp.' };
      }
    } catch (err: any) {
      return { success: false, message: 'Lỗi tổng hợp: ' + (err?.message || err) };
    }
  },

  /**
   * 🌟 KÉO VÀ ĐỒNG BỘ TOÀN BỘ FILE LỚP HỌC (GVCN_*.JSON) TỪ GOOGLE DRIVE VỀ MÁY
   * Giúp tài khoản Quản trị & BGH tự động cập nhật số liệu mới nhất của tất cả giáo viên
   */
  async pullAllClassFilesFromDrive(
    currentUser?: UserAccount | null
  ): Promise<{
    success: boolean;
    pulledCount: number;
    classes: Classroom[];
    students: Student[];
    attendanceRecords: DailyAttendance[];
    boardingRecords: DailyBoardingMeal[];
    message: string;
    appliedByClass?: Record<string, Record<string, number>>;
  }> {
    const config = this.getConfig();
    const scriptUrl = this.normalizeScriptUrl(config.scriptUrl);
    const folderId = config.folderId?.trim() || '';

    if (!scriptUrl) {
      return {
        success: false,
        pulledCount: 0,
        classes: [],
        students: [],
        attendanceRecords: [],
        boardingRecords: [],
        message: 'Chưa cấu hình URL Google Apps Script.'
      };
    }

    try {
      let filesList: Array<{ id: string; name: string }> = [];
      let listOk = false;

      try {
        const directRes = await fetch(`${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}action=listClassFiles&folderId=${encodeURIComponent(folderId)}`);
        const listData = await directRes.json();
        if (listData && Array.isArray(listData.files)) {
          filesList = listData.files;
          listOk = true;
        }
      } catch (_) {}

      if (!listOk) {
        return {
          success: false,
          pulledCount: 0,
          classes: [],
          students: [],
          attendanceRecords: [],
          boardingRecords: [],
          message: 'Không đọc được danh sách tệp lớp trên Google Drive.'
        };
      }

      const gvcnFiles = filesList.filter(f => f.name.toLowerCase().startsWith('gvcn_') && f.name.toLowerCase().endsWith('.json'));

      const classesMap = new Map<string, Classroom>();
      const studentsMap = new Map<string, Student>();
      const attMap = new Map<string, DailyAttendance>();
      const boardingMap = new Map<string, DailyBoardingMeal>();
      let pulledCount = 0;

      // Tải song song (tối đa 5 tệp cùng lúc) để toàn trường vài chục lớp vẫn nhanh
      const pulled: Array<{ success: boolean; mergedData?: UserClassroomData; raw?: any }> = new Array(gvcnFiles.length);
      const appliedByClass: Record<string, Record<string, number>> = {};
      let cursor = 0;
      const worker = async () => {
        while (cursor < gvcnFiles.length) {
          const idx = cursor++;
          try {
            pulled[idx] = await this.pullClassData({ classes: [], students: [] } as any, gvcnFiles[idx].name, currentUser);
          } catch (_) {
            pulled[idx] = { success: false };
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(5, gvcnFiles.length) }, worker));

      for (const pullRes of pulled) {
        try {
          if (pullRes && pullRes.success && pullRes.mergedData) {
            pulledCount++;
            const md = pullRes.mergedData;
            const appliedMarks = pullRes.raw?.metadata?.appliedAdminEdits;
            if (appliedMarks && typeof appliedMarks === 'object') {
              const ids = new Set<string>([pullRes.raw?.classInfo?.id, ...(md.classes || []).map((c: any) => c?.id)].filter(Boolean));
              ids.forEach(cid => { appliedByClass[cid] = appliedMarks; });
            }
            (md.classes || []).forEach(c => { if (c && c.id) classesMap.set(c.id, c); });
            (md.students || []).forEach(s => { if (s && s.id) studentsMap.set(s.id, s); });
            (md.attendanceRecords || []).forEach(a => {
              if (a && a.date && a.classId) {
                const k = `${a.date}_${a.classId}`;
                const ex = attMap.get(k);
                attMap.set(k, { ...ex, ...a, records: { ...(ex?.records || {}), ...(a.records || {}) } });
              }
            });
            (md.boardingRecords || []).forEach(b => {
              if (b && b.date && b.classId) {
                const k = `${b.date}_${b.classId}`;
                const ex = boardingMap.get(k);
                boardingMap.set(k, { ...ex, ...b, records: { ...(ex?.records || {}), ...(b.records || {}) } });
              }
            });
          }
        } catch (_) {}
      }

      return {
        success: true,
        pulledCount,
        classes: Array.from(classesMap.values()),
        students: Array.from(studentsMap.values()),
        attendanceRecords: Array.from(attMap.values()),
        boardingRecords: Array.from(boardingMap.values()),
        appliedByClass,
        message: `Đã kéo thành công dữ liệu từ ${pulledCount} lớp học trên Google Drive!`
      };
    } catch (err: any) {
      return {
        success: false,
        pulledCount: 0,
        classes: [],
        students: [],
        attendanceRecords: [],
        boardingRecords: [],
        message: 'Lỗi kéo dữ liệu lớp từ Drive: ' + (err?.message || err)
      };
    }
  },

  /**
   * 7. ⚡ DEBOUNCE AUTO-PUSH (TỰ ĐỘNG ĐẨY NGẦM SAU 800MS)
   * Tự động kích hoạt khi giáo viên điểm danh, chấm sao, cập nhật học sinh
   */
  triggerAutoPushDebounced(
    getData: () => { data: UserClassroomData; user: UserAccount; targetClassId?: string }
  ) {
    const config = this.getConfig();
    if (config.autoSyncEnabled === false) {
      return;
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    this.notifyStatusListeners({ status: 'pending' });
    try { const g = getData(); if (g?.data && g?.user) { latestSnapshot = { data: g.data, user: g.user, classId: g.targetClassId }; markPendingPush(g.user.username); } } catch (_) { /* ignore */ }

    debounceTimer = setTimeout(async () => {
      debounceTimer = null;
      try {
        const { data, user, targetClassId } = getData();
        if (data && user) {
          await this.pushClassData(data, user, targetClassId, false);
        }
      } catch (_) {}
    }, Math.max(config.debounceMs || DEFAULT_DEBOUNCE_MS, DRIVE_PUSH_BATCH_MS));
  },

  /**
   * 🔄 TỰ ĐỘNG ĐỒNG BỘ VÀ GHI ĐÈ LIÊN TỤC LÊN GOOGLE DRIVE THEO THỜI GIAN THỰC
   * Mỗi khi có thay đổi dữ liệu (điểm danh, bán trú, cộng điểm, sửa học sinh...):
   * 1. Nếu cấu hình Ổ Drive trên máy (Desktop): tự động ghi đè file vào thư mục Desktop
   * 2. Nếu cấu hình Cầu nối Apps Script (1-Click) hoặc có scriptUrl: tự động PUSH và ghi đè
   */
  autoSyncCurrentData(
    userData: UserClassroomData,
    currentUser?: UserAccount | null,
    targetClassId?: string,
    teacherRole?: 'homeroom' | 'subject'
  ) {
    const config = this.getConfig();
    if (config.autoSyncEnabled === false) return;
    if (!currentUser) return;

    const effectiveClassId = targetClassId || userData.activeClassId || userData.classes?.[0]?.id;

    // Keep the freshest snapshot for immediate pushes / retries (avoids stale closures)
    latestSnapshot = { data: userData, user: currentUser, classId: effectiveClassId };

    // 1. Nếu cấu hình Thư mục Google Drive trên máy (Google Drive for Desktop)
    if (config.syncMethod === 'desktop' && config.desktopPath) {
      try {
        const classFileName = this.getFileNameForUser(currentUser, undefined, teacherRole);
        if (typeof window !== 'undefined' && (window as any).electronAPI?.saveRoleFile) {
          (window as any).electronAPI.saveRoleFile({
            customPath: config.desktopPath,
            fileName: classFileName,
            data: userData
          }).catch(() => {});
        } else {
          fetch('/api/storage/write-role-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customPath: config.desktopPath,
              fileName: classFileName,
              data: userData
            })
          }).catch(() => {});
        }
      } catch (_) {}
    }

    // 2. Tự động PUSH ngầm lên Google Drive qua Cầu nối Apps Script (Debounce 800ms)
    if (config.scriptUrl) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      this.notifyStatusListeners({ status: 'pending' });

      // GVCN vừa bấm "Xác nhận điểm danh / bán trú": đẩy ngay; còn lại gom 15 giây
      const delay = urgentPushRequested ? 0 : Math.max(config.debounceMs || DEFAULT_DEBOUNCE_MS, DRIVE_PUSH_BATCH_MS);
      urgentPushRequested = false;
      markPendingPush(currentUser.username);

      debounceTimer = setTimeout(async () => {
        debounceTimer = null;
        try {
          await this.pushClassData(userData, currentUser, effectiveClassId, false);
        } catch (_) {}
      }, delay);
    }
  },

  /**
   * ⚡ Yêu cầu đẩy dữ liệu lên Google Drive NGAY LẬP TỨC (dùng khi GVCN bấm Xác nhận điểm danh / bán trú).
   * Lần tự lưu kế tiếp (~200ms sau khi state cập nhật) sẽ đẩy không chờ debounce; nếu không có thay đổi
   * state nào (số liệu đã đúng sẵn), tự đẩy bản dữ liệu mới nhất sau 700ms.
   */
  /** Đẩy NGAY phần thay đổi đang chờ trong hàng đợi 15 giây (chuyển tab / đóng trang / đăng xuất). */
  async flushPendingPush(): Promise<void> {
    if (!debounceTimer || !latestSnapshot) return;
    clearTimeout(debounceTimer);
    debounceTimer = null;
    const snap = latestSnapshot;
    try { await this.pushClassData(snap.data, snap.user, snap.classId, false); } catch (_) { /* vòng thử lại xử lý */ }
  },

  requestImmediatePush() {
    urgentPushRequested = true;
    setTimeout(() => {
      if (!urgentPushRequested || !latestSnapshot) return;
      urgentPushRequested = false;
      const config = this.getConfig();
      if (!config.scriptUrl || config.autoSyncEnabled === false) return;
      const snap = latestSnapshot;
      if (debounceTimer) clearTimeout(debounceTimer);
      this.pushClassData(snap.data, snap.user, snap.classId, false).catch(() => {});
    }, 700);
  },

  /**
   * 📤 Gửi payload trực tiếp lên Apps Script qua Electron IPC, HTTP proxy Express hoặc fetch trực tiếp
   */
  async sendPushPayload(
    scriptUrl: string,
    folderId: string,
    fileName: string,
    payload: any
  ): Promise<any> {
    // 1. Thử qua Electron IPC
    if (typeof window !== 'undefined' && (window as any).electronAPI?.proxyDriveSync) {
      try {
        const res = await (window as any).electronAPI.proxyDriveSync({ scriptUrl, payload });
        if (res) return res;
      } catch (_) {}
    }

    // 2. Thử qua server Express proxy
    try {
      const baseUrl = typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'http://127.0.0.1:3000' : '';
      const proxyRes = await fetch(`${baseUrl}/api/drive/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptUrl, folderId, fileName, payload })
      });
      if (proxyRes.ok) return await proxyRes.json();
    } catch (_) {}

    // 3. Direct fetch
    try {
      const direct = await fetch(scriptUrl, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const txt = await direct.text();
      return JSON.parse(txt);
    } catch (_) {}

    return null;
  },

  /**
   * 🆔 KÉO VÀ NẠP CSDL TRƯỜNG THEO MÃ ID TRƯỜNG (School Code / School ID)
   * Giúp máy trạm chỉ cần nhập/chọn mã trường là tự động tải đúng CSDL và tài khoản được gán
   */
  async pullSchoolDataByCode(schoolCode: string): Promise<{ success: boolean; school?: any; usersCount: number; message: string }> {
    if (!schoolCode) return { success: false, usersCount: 0, message: 'Chưa cung cấp mã trường học.' };
    const cleanCode = schoolCode.trim().toLowerCase();
    const config = this.getConfig();
    const scriptUrl = this.normalizeScriptUrl(config.scriptUrl);
    const folderId = config.folderId?.trim() || '';

    if (!scriptUrl) {
      return { success: false, usersCount: 0, message: 'Chưa cấu hình URL Google Apps Script.' };
    }

    try {
      // 1. Kéo file CSDL riêng theo mã trường: csdl_truong_{cleanCode}.json
      const specificFileName = `csdl_truong_${cleanCode}.json`;
      let resData: any = null;
      try {
        const direct = await fetch(`${scriptUrl}?action=getLatest&folderId=${encodeURIComponent(folderId)}&fileName=${encodeURIComponent(specificFileName)}`);
        resData = await direct.json();
      } catch (_) {}

      // 2. Kéo từ quantrinhatruong.json hoặc adminquantri.json nếu chưa thấy file riêng
      if (!resData || !resData.systemSchools) {
        const masterFiles = ['quantrinhatruong.json', 'adminquantri.json'];
        for (const mf of masterFiles) {
          try {
            const directMaster = await fetch(`${scriptUrl}?action=getLatest&folderId=${encodeURIComponent(folderId)}&fileName=${mf}`);
            const masterJson = await directMaster.json();
            if (masterJson && Array.isArray(masterJson.systemSchools)) {
              const foundSchool = masterJson.systemSchools.find((s: any) => 
                (s.code && s.code.toLowerCase() === cleanCode) || 
                (s.id && s.id.toLowerCase() === cleanCode) ||
                (s.id && s.id.toLowerCase() === `sch_${cleanCode}`)
              );
              if (foundSchool) {
                const matchedUsers = Array.isArray(masterJson.systemUsers) 
                  ? masterJson.systemUsers.filter((u: any) => 
                      (u.schoolCode && u.schoolCode.toLowerCase() === cleanCode) ||
                      (u.schoolId && u.schoolId === foundSchool.id) ||
                      (u.schoolName && foundSchool.name && u.schoolName.toLowerCase() === foundSchool.name.toLowerCase())
                    )
                  : [];
                resData = {
                  systemSchools: [foundSchool],
                  systemUsers: matchedUsers,
                  systemClasses: masterJson.systemClasses || []
                };
                break;
              }
            }
          } catch (_) {}
        }
      }

      if (resData && (resData.systemSchools || resData.systemUsers)) {
        const syncRes = dataAdapter.syncIncomingHierarchy(resData);
        return {
          success: true,
          school: resData.systemSchools?.[0],
          usersCount: syncRes.usersAdded,
          message: `Đã nạp CSDL trường theo mã ID "${schoolCode.toUpperCase()}" thành công! (${syncRes.usersAdded} tài khoản)`
        };
      }

      return { success: false, usersCount: 0, message: `Không tìm thấy CSDL trên Drive cho mã trường "${schoolCode}".` };
    } catch (err: any) {
      return { success: false, usersCount: 0, message: 'Lỗi nạp dữ liệu theo mã trường: ' + (err?.message || err) };
    }
  },

  /**
   * 🏛️ KÉO TOÀN BỘ CSDL PHÂN CẤP TỪ GOOGLE DRIVE VỀ MÁY
   * Tự động kéo:
   * 1. adminquantri.json (CSDL trường & tài khoản Quản trị trường, BGH do admin tối cao khởi tạo)
   * 2. quantrinhatruong.json (Tài khoản GVCN, GVBM và các lớp học do Quản trị trường khởi tạo)
   * 3. Các file CSDL trường theo mã ID: csdl_truong_{code}.json
   * Nạp trực tiếp vào LocalStorage và Backend CSDL máy trạm
   */
  async pullHierarchyDataFromDrive(): Promise<{
    success: boolean;
    schoolsCount: number;
    usersCount: number;
    classesCount: number;
    message: string;
  }> {
    const config = this.getConfig();
    const scriptUrl = this.normalizeScriptUrl(config.scriptUrl);
    const folderId = config.folderId?.trim() || '';

    if (!scriptUrl) {
      return { success: false, schoolsCount: 0, usersCount: 0, classesCount: 0, message: 'Chưa cấu hình URL Google Apps Script.' };
    }

    let totalSchools = 0;
    let totalUsers = 0;
    let totalClasses = 0;
    const filesToTry = ['adminquantri.json', 'quantrinhatruong.json'];

    // Lấy thêm các mã trường đã lưu cục bộ để kéo nếu có
    try {
      const rawS = localStorage.getItem('lop_hoc_schools_list_v1');
      if (rawS) {
        const sList: any[] = JSON.parse(rawS);
        sList.forEach(s => {
          if (s && s.code) {
            const fn = `csdl_truong_${s.code.trim().toLowerCase()}.json`;
            if (!filesToTry.includes(fn)) filesToTry.push(fn);
          }
        });
      }
    } catch (_) {}

    for (const fileName of filesToTry) {
      try {
        let standardJson: any = null;

        // 1. Thử qua Electron IPC
        if (typeof window !== 'undefined' && (window as any).electronAPI?.proxyDrivePull) {
          try {
            standardJson = await (window as any).electronAPI.proxyDrivePull({ scriptUrl, folderId, fileName });
          } catch (_) {}
        }

        // 2. Thử qua proxy backend Express
        if (!standardJson) {
          try {
            const baseUrl = typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'http://127.0.0.1:3000' : '';
            const res = await fetch(`${baseUrl}/api/drive/pull?scriptUrl=${encodeURIComponent(scriptUrl)}&folderId=${encodeURIComponent(folderId)}&fileName=${encodeURIComponent(fileName)}`);
            if (res.ok) standardJson = await res.json();
          } catch (_) {}
        }

        // 3. Thử trực tiếp
        if (!standardJson) {
          try {
            const direct = await fetch(`${scriptUrl}?action=getLatest&folderId=${encodeURIComponent(folderId)}&fileName=${encodeURIComponent(fileName)}`);
            standardJson = await direct.json();
          } catch (_) {}
        }

        if (standardJson && (standardJson.systemSchools || standardJson.systemUsers || standardJson.systemClasses || standardJson.metadata || standardJson.fullClassroomData)) {
          const syncRes = dataAdapter.syncIncomingHierarchy(standardJson);
          totalSchools += syncRes.schoolsAdded;
          totalUsers += syncRes.usersAdded;
          totalClasses += syncRes.classesAdded;
        }
      } catch (fErr) {
        console.warn(`Lỗi kéo file phân cấp ${fileName}:`, fErr);
      }
    }

    const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    this.saveConfig({ syncStatus: 'success', lastSyncTime: nowStr });
    this.notifyStatusListeners({ status: 'success', lastSyncTime: nowStr });

    const totalFound = totalSchools + totalUsers + totalClasses;
    return {
      success: totalFound > 0,
      schoolsCount: totalSchools,
      usersCount: totalUsers,
      classesCount: totalClasses,
      message: totalFound > 0
        ? `Đã nạp thành công ${totalSchools} trường học, ${totalUsers} tài khoản và ${totalClasses} lớp học từ Google Drive!`
        : 'Không tìm thấy dữ liệu trường hoặc tài khoản mới trên Google Drive.'
    };
  },

  /**
   * ⚡ CƠ CHẾ NGẦM TỰ ĐỘNG ĐỒNG BỘ GOOGLE DRIVE SAU MỖI 5 GIÂY (5-SECOND INTERVAL)
   * Áp dụng cho TOÀN HỆ THỐNG và TẤT CẢ CÁC TÀI KHOẢN:
   * - Cứ mỗi 5 giây tự động đẩy ngầm dữ liệu mới nhất lên Google Drive
   * - Đối với Quản trị trường / BGH: tự động tổng hợp số liệu từ các giáo viên
   * - Đối với màn hình đăng nhập: tự động cập nhật CSDL trường và tài khoản mới
   */
  startAutoSyncLoop5s(
    getAppContextData: () => {
      data?: UserClassroomData;
      user?: UserAccount | null;
      activeClassId?: string;
    }
  ): () => void {
    if (autoSyncIntervalTimer) {
      clearInterval(autoSyncIntervalTimer);
      autoSyncIntervalTimer = null;
    }

    // Chạy ngầm định kỳ 5 giây (5000ms)
    autoSyncIntervalTimer = setInterval(async () => {
      if (isSyncingActive) return;

      const config = this.getConfig();
      if (config.autoSyncEnabled === false) return;
      if (!config.scriptUrl && (!config.desktopPath || config.syncMethod !== 'desktop')) return;

      autoSyncCycleCount++;

      try {
        isSyncingActive = true;
        const ctx = getAppContextData();
        const curUser = ctx?.user;
        const curData = ctx?.data;
        const actClassId = ctx?.activeClassId;

        if (curUser && curData) {
          // Changes are pushed on save by autoSyncCurrentData (debounced). The loop only
          // retries a failed push (every 15s) instead of re-uploading every 5s, which
          // exhausted Apps Script quotas with many classes.
          if (!debounceTimer && autoSyncCycleCount % 3 === 0 && config.syncStatus !== 'error' && hasPendingPushFor(curUser.username)) {
            // Lần trước trang bị đóng khi còn thay đổi chưa đẩy → đẩy bù bản trên máy
            await this.pushClassData(curData, curUser, actClassId, false);
          } else if (config.syncStatus === 'error' && autoSyncCycleCount % 3 === 0) {
            const snap = latestSnapshot && latestSnapshot.user.username === curUser.username ? latestSnapshot : null;
            await this.pushClassData(snap ? snap.data : curData, curUser, snap ? snap.classId : actClassId, false);
          }
        } else {
          // Khi chưa đăng nhập (ở màn hình đăng nhập): Cứ mỗi 15 giây (3 chu kỳ) tự động kéo CSDL phân cấp về máy
          // Bản web (CSDL nhà trường V4 trong csdl_truong.json) không kéo các tệp phân cấp cũ
          // (adminquantri.json / csdl_truong_*.json) để tránh nạp lại tài khoản, trường đã cũ.
          if (autoSyncCycleCount % 3 === 0 && !(config.folderId || '').trim()) {
            await this.pullHierarchyDataFromDrive().catch(() => {});
          }
        }
      } catch (loopErr) {
        console.warn('[AutoSync 5s Loop Error]', loopErr);
      } finally {
        isSyncingActive = false;
      }
    }, 5000);

    return () => {
      if (autoSyncIntervalTimer) {
        clearInterval(autoSyncIntervalTimer);
        autoSyncIntervalTimer = null;
      }
    };
  },

  /**
   * 🌐 Cấu hình Drive dùng chung toàn trường (lưu trên server Express nếu có)
   * Giúp mọi máy GVCN / BGH / Quản trị tự nhận cùng 1 Apps Script + 1 thư mục.
   */
  async loadSharedConfig(user?: UserAccount | null): Promise<boolean> {
    try {
      if (typeof window === 'undefined') return false;
      const baseUrl = window.location.protocol === 'file:' ? 'http://127.0.0.1:3000' : '';
      const school = encodeURIComponent(user?.schoolName || '');
      const res = await fetch(`${baseUrl}/api/drive/shared-config?school=${school}`, { cache: 'no-store' });
      if (!res.ok || !(res.headers.get('content-type') || '').includes('application/json')) return false;
      const json = await res.json();
      const shared = json?.config;
      if (!shared?.scriptUrl) return false;
      const current = this.getConfig();
      if (current.scriptUrl === this.normalizeScriptUrl(shared.scriptUrl) && (!shared.folderId || current.folderId === shared.folderId)) {
        return false;
      }
      this.saveConfig({
        scriptUrl: shared.scriptUrl,
        ...(shared.folderId ? { folderId: shared.folderId, folderUrl: shared.folderUrl || `https://drive.google.com/drive/folders/${shared.folderId}` } : {})
      });
      return true;
    } catch (_) {
      return false;
    }
  },

  /**
   * 📣 Tin nhắn "thông tin kết nối" Quản trị nhà trường gửi cho toàn trường (Zalo / email...).
   * GVCN / BGH chỉ cần dán nguyên tin nhắn vào phần mềm.
   */
  buildConnectionShareText(schoolName?: string): string {
    const cfg = this.getConfig();
    const folderLink = cfg.folderId ? `https://drive.google.com/drive/folders/${cfg.folderId}` : (cfg.folderUrl || '');
    return [
      '🔗 KẾT NỐI GOOGLE DRIVE – LỚP HỌC HẠNH PHÚC',
      schoolName ? `Trường: ${schoolName}` : '',
      `1) Link thư mục dùng chung: ${folderLink}`,
      `2) Mã kết nối (Apps Script): ${this.normalizeScriptUrl(cfg.scriptUrl)}`,
      'Cách dùng: Mở phần mềm → ở màn hình đăng nhập dán link (1) vào Ô 1, link (2) vào Ô 2 → bấm XÁC THỰC & KẾT NỐI → chọn trường và đăng nhập.'
    ].filter(Boolean).join('\n');
  },

  /** Tách link thư mục + URL Apps Script từ tin nhắn kết nối (hoặc từ 1 link bất kỳ) */
  parseConnectionText(text: string): { scriptUrl?: string; folderId?: string; folderUrl?: string } {
    const raw = String(text || '');
    const scriptMatch = raw.match(/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+(?:\/(?:exec|dev))?/);
    const driveMatch = raw.match(/https:\/\/drive\.google\.com\/[^\s"'<>]+/);
    let folderId: string | undefined;
    if (driveMatch) folderId = this.extractFolderIdFromUrl(driveMatch[0]);
    if (!folderId && !scriptMatch) folderId = this.extractFolderIdFromUrl(raw.trim());
    return {
      scriptUrl: scriptMatch ? this.normalizeScriptUrl(scriptMatch[0]) : undefined,
      folderId,
      folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : undefined
    };
  },

  async publishSharedConfig(user?: UserAccount | null): Promise<{ success: boolean; message: string }> {
    const cfg = this.getConfig();
    if (!cfg.scriptUrl) return { success: false, message: 'Chưa có URL Apps Script để chia sẻ.' };
    try {
      const baseUrl = typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'http://127.0.0.1:3000' : '';
      const res = await fetch(`${baseUrl}/api/drive/shared-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school: user?.schoolName || '',
          scriptUrl: cfg.scriptUrl,
          folderId: cfg.folderId,
          folderUrl: cfg.folderUrl,
          updatedBy: user?.username
        })
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        return { success: true, message: 'Đã áp dụng cấu hình Drive cho toàn trường (mọi tài khoản tự nhận).' };
      }
      return { success: false, message: json?.message || 'Máy chủ không lưu được cấu hình dùng chung.' };
    } catch (_) {
      return { success: false, message: 'Không có máy chủ để lưu cấu hình dùng chung (bản web tĩnh dùng biến VITE_DRIVE_SCRIPT_URL).' };
    }
  },

  /**
   * 📊 Thống kê chuyên cần & bán trú toàn trường theo khoảng ngày (Apps Script V3: aggregateRange)
   */
  async fetchAttendanceRangeStats(from: string, to: string): Promise<{ success: boolean; data?: DriveRangeAggregate; message: string }> {
    const config = this.getConfig();
    const scriptUrl = this.normalizeScriptUrl(config.scriptUrl);
    const folderId = config.bghFolderId || config.folderId || '';
    if (!scriptUrl) return { success: false, message: 'Chưa cấu hình Google Drive (Apps Script).' };

    const query = `action=aggregateRange&folderId=${encodeURIComponent(folderId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    try {
      let data: any = null;
      // Express proxy first (avoids CORS/redirect issues), then direct browser call (Vercel)
      try {
        const baseUrl = typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'http://127.0.0.1:3000' : '';
        const proxyRes = await fetch(`${baseUrl}/api/drive/range?scriptUrl=${encodeURIComponent(scriptUrl)}&${query}`, { cache: 'no-store' });
        if (proxyRes.ok && (proxyRes.headers.get('content-type') || '').includes('application/json')) {
          data = await proxyRes.json();
        }
      } catch (_) {}
      if (!data) {
        const directRes = await fetch(`${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}${query}`);
        data = JSON.parse(await directRes.text());
      }
      if (data?.success && data.days && Array.isArray(data.classes)) {
        return { success: true, data, message: 'OK' };
      }
      if (data && data.success === false && /không hợp lệ/i.test(String(data.message || ''))) {
        return { success: false, message: 'Apps Script đang là bản cũ. Hãy dán lại mã V3 trong mục Đồng bộ Google Drive và Triển khai lại.' };
      }
      return { success: false, message: data?.message || 'Không nhận được số liệu tổng hợp.' };
    } catch (err: any) {
      return { success: false, message: 'Lỗi tổng hợp Drive: ' + (err?.message || err) };
    }
  },

  stopAutoSyncLoop5s() {
    if (autoSyncIntervalTimer) {
      clearInterval(autoSyncIntervalTimer);
      autoSyncIntervalTimer = null;
    }
  }
};

// Trang bị ẩn (chuyển tab, thu nhỏ, khóa máy) hoặc đóng → đẩy ngay phần thay đổi đang chờ trong hàng đợi 15 giây
if (typeof window !== 'undefined' && !(window as any).__lhhpDriveFlushInstalled) {
  (window as any).__lhhpDriveFlushInstalled = true;
  const flush = () => { googleDriveService.flushPendingPush().catch(() => {}); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
}
