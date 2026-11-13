/**
 * Offline data folder (desktop build only).
 *
 * The desktop shell (desktop-lite/main.cjs) lets the user choose ONE folder on the PC and exposes a small
 * bridge `window.lhhpDesktop.offline` to read / write JSON files inside it. This service wraps that bridge.
 * On the web build, and on an installed shell older than the one that introduced the bridge, `isAvailable()`
 * is false and every call resolves to a harmless "not available" result — callers never need to branch on
 * the platform, and nothing here can break the existing Drive / localStorage flow.
 */

export interface OfflineFolderInfo {
  /** Absolute path of the chosen folder, '' when none has been chosen yet */
  dir: string;
  exists: boolean;
  writable: boolean;
  /** Folder the app proposes by default (Documents\LopHocHanhPhuc_DuLieu) */
  suggested: string;
}

export interface OfflineFileEntry {
  name: string;
  size: number;
  mtimeMs: number;
}

export type OfflineErrorCode =
  | 'UNAVAILABLE' | 'NO_FOLDER' | 'CANCELED' | 'NOT_WRITABLE' | 'BAD_PATH' | 'NOT_FOUND' | 'TOO_LARGE' | 'INVALID' | 'FAILED';

interface Bridge {
  info: () => Promise<OfflineFolderInfo | null>;
  choose: () => Promise<any>;
  useSuggested: () => Promise<any>;
  open: () => Promise<any>;
  read: (relPath: string) => Promise<any>;
  write: (relPath: string, text: string) => Promise<any>;
  list: (relDir: string) => Promise<any>;
  remove: (relPath: string) => Promise<any>;
}

const bridge = (): Bridge | null =>
  (typeof window !== 'undefined' && (window as any).lhhpDesktop?.offline) || null;

const EMPTY_INFO: OfflineFolderInfo = { dir: '', exists: false, writable: false, suggested: '' };

const errorOf = (res: any): OfflineErrorCode => (res && typeof res.error === 'string' ? res.error : 'FAILED') as OfflineErrorCode;

/** File-name-safe key: keeps letters (Vietnamese included) and digits, everything else becomes "_" */
const safeName = (value: string): string =>
  String(value || '').normalize('NFC').replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'khong_ten';

export const offlineStoreService = {
  /** True only inside a desktop shell that has the offline-folder bridge */
  isAvailable(): boolean {
    return !!bridge();
  },

  safeName,

  async getFolder(): Promise<OfflineFolderInfo> {
    const b = bridge();
    if (!b) return EMPTY_INFO;
    try { return (await b.info()) || EMPTY_INFO; } catch { return EMPTY_INFO; }
  },

  /** A folder has been chosen and can be written right now (false e.g. when a USB drive was removed) */
  async isReady(): Promise<boolean> {
    const info = await this.getFolder();
    return !!info.dir && info.exists && info.writable;
  },

  /** Opens the system folder dialog */
  async chooseFolder(): Promise<{ ok: boolean; info?: OfflineFolderInfo; error?: OfflineErrorCode }> {
    const b = bridge();
    if (!b) return { ok: false, error: 'UNAVAILABLE' };
    try {
      const res = await b.choose();
      return res?.ok ? { ok: true, info: res as OfflineFolderInfo } : { ok: false, error: errorOf(res) };
    } catch { return { ok: false, error: 'FAILED' }; }
  },

  /** Uses (and creates) the proposed folder in Documents */
  async useSuggestedFolder(): Promise<{ ok: boolean; info?: OfflineFolderInfo; error?: OfflineErrorCode }> {
    const b = bridge();
    if (!b) return { ok: false, error: 'UNAVAILABLE' };
    try {
      const res = await b.useSuggested();
      return res?.ok ? { ok: true, info: res as OfflineFolderInfo } : { ok: false, error: errorOf(res) };
    } catch { return { ok: false, error: 'FAILED' }; }
  },

  /** Shows the folder in Windows Explorer */
  async openFolder(): Promise<boolean> {
    const b = bridge();
    if (!b) return false;
    try { return !!(await b.open())?.ok; } catch { return false; }
  },

  /** Parsed JSON of a file in the folder; null when missing, unreadable or not valid JSON */
  async readJson<T = any>(relPath: string): Promise<T | null> {
    const b = bridge();
    if (!b) return null;
    try {
      const res = await b.read(relPath);
      if (!res?.ok || typeof res.text !== 'string') return null;
      return JSON.parse(res.text) as T;
    } catch { return null; }
  },

  /** Atomic write (old file stays intact if the write is interrupted) */
  async writeJson(relPath: string, value: unknown): Promise<{ ok: boolean; error?: OfflineErrorCode }> {
    const b = bridge();
    if (!b) return { ok: false, error: 'UNAVAILABLE' };
    try {
      const res = await b.write(relPath, JSON.stringify(value));
      return res?.ok ? { ok: true } : { ok: false, error: errorOf(res) };
    } catch { return { ok: false, error: 'FAILED' }; }
  },

  async list(relDir = ''): Promise<OfflineFileEntry[]> {
    const b = bridge();
    if (!b) return [];
    try {
      const res = await b.list(relDir);
      return res?.ok && Array.isArray(res.files) ? (res.files as OfflineFileEntry[]) : [];
    } catch { return []; }
  },

  async remove(relPath: string): Promise<boolean> {
    const b = bridge();
    if (!b) return false;
    try { return !!(await b.remove(relPath))?.ok; } catch { return false; }
  },

  // ───────── Working copy of one account's data (classes, students, attendance…) ─────────

  /** File that holds the working copy of an account's data inside the offline folder */
  userDataPath(username: string): string {
    return `${USER_DATA_DIR}/${userDataScope()}/${safeName(String(username || '').trim().toLowerCase())}.json`;
  },

  /**
   * Keep the account's latest data in the offline folder. Calls are grouped (one write per account every
   * MIRROR_DELAY_MS at most) because the app saves after every small change. Does nothing on the web build.
   */
  mirrorUserData(username: string, data: unknown): void {
    if (!bridge() || !username || !data) return;
    const key = String(username).trim().toLowerCase();
    pendingMirrors.set(key, data);
    if (mirrorTimer) return;
    mirrorTimer = setTimeout(() => { mirrorTimer = null; void this.flushMirrors(); }, MIRROR_DELAY_MS);
  },

  /** Write every waiting working copy now (app hidden / closing / signing out) */
  async flushMirrors(): Promise<void> {
    if (mirrorTimer) { clearTimeout(mirrorTimer); mirrorTimer = null; }
    const jobs = Array.from(pendingMirrors.entries());
    pendingMirrors.clear();
    for (const [username, data] of jobs) {
      const res = await this.writeJson(this.userDataPath(username), { version: 1, username, savedAt: Date.now(), data });
      // Folder not reachable right now (drive removed…) → keep it for the next attempt
      if (!res.ok && res.error !== 'UNAVAILABLE' && !pendingMirrors.has(username)) pendingMirrors.set(username, data);
    }
  },

  // ───────── Whole-school data kept for management accounts (per school connection) ─────────

  schoolFilePath(name: string): string {
    return `${SCHOOL_DATA_DIR}/${userDataScope()}/${name}`;
  },
  async writeSchoolFile(name: string, data: unknown): Promise<boolean> {
    if (!bridge()) return false;
    return (await this.writeJson(this.schoolFilePath(name), { version: 1, savedAt: Date.now(), data })).ok;
  },
  async readSchoolFile<T = any>(name: string): Promise<{ data: T; savedAt: number } | null> {
    if (!bridge()) return null;
    const file = await this.readJson<{ data?: T; savedAt?: number }>(this.schoolFilePath(name));
    return file && file.data != null ? { data: file.data, savedAt: Number(file.savedAt) || 0 } : null;
  },

  /** The account's working copy from the offline folder, or null */
  async readUserData<T = any>(username: string): Promise<T | null> {
    if (!bridge() || !username) return null;
    const file = await this.readJson<{ data?: T }>(this.userDataPath(username));
    return file && file.data && typeof file.data === 'object' ? file.data : null;
  },
};

const USER_DATA_DIR = 'du_lieu_tai_khoan';
const SCHOOL_DATA_DIR = 'du_lieu_toan_truong';
/**
 * One sub-folder per school connection (shared Drive folder id): the same user name at another school is a
 * different account and must never load this school's data. Read straight from the saved connection to keep
 * this module free of service imports.
 */
const userDataScope = (): string => {
  try {
    const cfg = JSON.parse(localStorage.getItem('lop_hoc_google_drive_config_v2') || 'null');
    const id = String(cfg?.folderId || '').trim();
    if (id) return `truong_${safeName(id).slice(0, 40)}`;
  } catch { /* ignore */ }
  return 'chua_ket_noi_truong';
};
const MIRROR_DELAY_MS = 2500;
const pendingMirrors = new Map<string, unknown>();
let mirrorTimer: ReturnType<typeof setTimeout> | null = null;

if (typeof window !== 'undefined') {
  const flush = () => { void offlineStoreService.flushMirrors(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
