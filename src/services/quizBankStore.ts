/**
 * 📚 KHO CÂU HỎI CÁ NHÂN CỦA GIÁO VIÊN (11/2026) — tách bộ câu hỏi trò chơi khỏi dữ liệu chung của nhà trường.
 * - Bước 1: tệp lớp trên Drive TRƯỜNG không còn chứa bộ câu hỏi (utils/driveCompact.ts bỏ `quizBank`).
 * - Bước 2: lưu trên máy trong IndexedDB (dung lượng lớn, không giới hạn 5 MB như localStorage) theo từng tài khoản;
 *           chỉ lưu câu tự soạn / câu mẫu đã sửa + thứ tự (câu mẫu nguyên bản lấy lại từ phần mềm); ảnh được nén
 *           TRONG BẢN LƯU (cạnh ≤ 800px). Xuất / Nhập tệp .json để lưu thư mục máy tính, USB, gửi đồng nghiệp.
 * - Bước 3: (tùy chọn) đồng bộ tệp `nganhang_cauhoi_<tài khoản>.json` lên Google Drive CÁ NHÂN của giáo viên qua
 *           Apps Script cá nhân (dùng lại đúng mã Apps Script của phần mềm, triển khai trên tài khoản Google của giáo viên).
 * - Bước 4 (11/2026): THƯ MỤC TRÊN MÁY TÍNH do giáo viên chọn (File System Access API) — phần mềm tự ghi tệp
 *           `nganhang_cauhoi_<tài khoản>.json` vào thư mục đó mỗi lần lưu. Giáo viên phải cấu hình nơi lưu (thư mục máy
 *           tính hoặc Drive cá nhân) trước khi THÊM câu hỏi (`isConfigured`, xem modals/QuizStorageModal › requireQuizStorage).
 * Các trò chơi KHÔNG đổi: vẫn đọc `quizBank` và lưu bằng `updateQuizBank` của context.
 */
import type { UserAccount } from '../types';
import type { QuestionItem } from '../types';
import { DEFAULT_QUESTIONS, smartMergeQuizBank } from '../utils/quizParser';
import { isLegacySample } from '../utils/legacySampleQuestions';
import { googleDriveService } from './googleDriveService';
import { shrinkImageDataUrl } from '../utils/driveCompact';

interface StoredBank { order: string[]; items: QuestionItem[]; updatedAt: number; deleted?: string[] }
const MAX_TOMBSTONES = 1000;
/**
 * GỘP hai bản kho câu hỏi (máy ↔ Drive cá nhân) — KHÔNG để bản này xóa trắng bản kia (11/2026).
 * Câu có ở bất kỳ bên nào đều giữ; cùng mã ở cả hai bên → lấy bản của bên cập nhật sau; câu đã xóa (deleted) ở
 * bên nào cũng bị bỏ ở cả hai. Thứ tự: theo bên mới hơn, rồi thêm câu chỉ bên kia có.
 */
function mergeBanks(a: StoredBank | null, b: StoredBank | null): StoredBank {
  if (!a) return b ? { ...b, deleted: b.deleted || [] } : { order: [], items: [], updatedAt: 0, deleted: [] };
  if (!b) return { ...a, deleted: a.deleted || [] };
  const [older, newer] = (a.updatedAt || 0) <= (b.updatedAt || 0) ? [a, b] : [b, a];
  const deleted = Array.from(new Set([...(older.deleted || []), ...(newer.deleted || [])])).slice(-MAX_TOMBSTONES);
  const gone = new Set(deleted);
  const byId = new Map<string, QuestionItem>();
  (older.items || []).forEach(q => { if (q && q.id) byId.set(q.id, q); });
  (newer.items || []).forEach(q => { if (q && q.id) byId.set(q.id, q); });
  const order: string[] = [];
  const seen = new Set<string>();
  [...(newer.order || []), ...(older.order || []), ...Array.from(byId.keys())].forEach(id => {
    if (!id || seen.has(id) || gone.has(id)) return;
    seen.add(id); order.push(id);
  });
  return { order, items: Array.from(byId.values()).filter(q => !gone.has(q.id)), updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0), deleted };
}
const sameBank = (x: StoredBank | null, y: StoredBank | null) => Boolean(x && y)
  && JSON.stringify(x!.order) === JSON.stringify(y!.order)
  && JSON.stringify([...(x!.items || [])].sort((p, q) => p.id.localeCompare(q.id))) === JSON.stringify([...(y!.items || [])].sort((p, q) => p.id.localeCompare(q.id)))
  && JSON.stringify([...(x!.deleted || [])].sort()) === JSON.stringify([...(y!.deleted || [])].sort());
export interface DriveCheckStep { key: string; label: string; status: 'ok' | 'fail' | 'skip'; detail?: string }
export interface DriveDiagnosis { ok: boolean; steps: DriveCheckStep[]; message: string; next?: string; cfg?: PersonalDriveConfig }
export interface PersonalDriveConfig { scriptUrl: string; folderId: string; folderUrl?: string; lastSyncAt?: number; lastError?: string }

const DB_NAME = 'lhhp_personal';
const STORE = 'quiz_bank';
const LS_FALLBACK = 'lhhp_quiz_personal:';
const CFG_KEY = 'lhhp_quiz_drive:';
const SUBJ_KEY = 'lhhp_quiz_subjects_v2:';
const OLD_SUBJ_KEY = 'lhhp_quiz_subjects:'; // bản trước: chỉ chứa "bộ câu hỏi" tự tạo
const LESSON_KEY = 'lhhp_quiz_lessons:';
/** Danh sách môn mặc định của giáo viên (giáo viên tự thêm / xóa) */
export const DEFAULT_TEACHER_SUBJECTS = ['Toán học', 'Tiếng Việt', 'Tiếng Anh', 'Khoa học', 'Lịch sử & Địa lý', 'Tin học', 'Đạo đức & Kỹ năng sống', 'Âm nhạc', 'Mỹ thuật', 'Hoạt động trải nghiệm', 'Giáo dục thể chất'];
const LOCAL_KEY = 'lhhp_quiz_local:';
const HANDLE_KEY = '__folder_handle__:';
const VAULT_KEY = '__vault_key__:';
/** Nơi lưu trên máy: 'folder' = thư mục máy tính đã chọn; 'browser' = chỉ bộ nhớ phần mềm (trình duyệt không hỗ trợ chọn thư mục) */
export interface LocalStorageInfo { mode: 'folder' | 'browser'; folderName?: string; setAt: number; lastWriteAt?: number; lastError?: string; needsPermission?: boolean }
const DEFAULT_JSON = new Map(DEFAULT_QUESTIONS.map(q => [q.id, JSON.stringify(q)]));
const DEFAULT_BY_ID = new Map(DEFAULT_QUESTIONS.map(q => [q.id, q]));
const norm = (u: string) => String(u || '').trim().toLowerCase();

// ─────────────────────────────── IndexedDB (dự phòng localStorage khi trình duyệt chặn)
function openDb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE); } catch (_) { /* đã có */ } };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}
async function idbGet(key: string): Promise<StoredBank | null> {
  const db = await openDb();
  if (!db) { try { return JSON.parse(localStorage.getItem(LS_FALLBACK + key) || 'null'); } catch (_) { return null; } }
  return new Promise(resolve => {
    try {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve((r.result as StoredBank) || null);
      r.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}
async function idbPut(key: string, val: StoredBank): Promise<void> {
  const db = await openDb();
  if (!db) { try { localStorage.setItem(LS_FALLBACK + key, JSON.stringify(val)); } catch (_) { /* đầy */ } return; }
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (_) { resolve(); }
  });
}

// Giá trị bất kỳ (thẻ thư mục FileSystemDirectoryHandle) trong cùng kho IndexedDB
async function idbGetAny(key: string): Promise<any> {
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}
async function idbPutAny(key: string, val: any): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      if (val === null) tx.objectStore(STORE).delete(key); else tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (_) { resolve(false); }
  });
}

// ─────────────────────────────── đóng gói gọn
const isImg = (v: unknown): v is string => typeof v === 'string' && /^data:image\//i.test(v);
async function shrinkQuestion(q: QuestionItem): Promise<QuestionItem> {
  const out: any = { ...q };
  const big = async (v: unknown, side: number, limit: number) => (isImg(v) && v.length > limit ? shrinkImageDataUrl(v, side, 0.8) : v);
  out.image = await big(out.image, 800, 90_000);
  out.answerImage = await big(out.answerImage, 800, 90_000);
  if (Array.isArray(out.optionImages)) out.optionImages = await Promise.all(out.optionImages.map((v: unknown) => big(v, 480, 60_000)));
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as QuestionItem;
}
async function pack(questions: QuestionItem[]): Promise<StoredBank> {
  const list = (questions || []).filter(q => q && q.id);
  const custom = list.filter(q => DEFAULT_JSON.get(q.id) !== JSON.stringify(q) && !isLegacySample(q));
  return { order: list.map(q => q.id), items: await Promise.all(custom.map(shrinkQuestion)), updatedAt: Date.now() };
}
function unpack(rec: StoredBank | null): QuestionItem[] {
  if (!rec || !Array.isArray(rec.order)) return [];
  const byId = new Map((rec.items || []).map(q => [q.id, q]));
  const list = rec.order.map(id => byId.get(id) || DEFAULT_BY_ID.get(id)).filter(Boolean) as QuestionItem[];
  // câu có trong items nhưng thiếu trong order (tệp nhập tay) → thêm cuối
  (rec.items || []).forEach(q => { if (!rec.order.includes(q.id)) list.push(q); });
  return list;
}
/** Gộp cộng thêm: giữ nguyên `base`, thêm câu của `extra` chưa có (theo mã) */
function union(base: QuestionItem[], extra: QuestionItem[]): QuestionItem[] {
  const ids = new Set(base.map(q => q.id));
  return [...base, ...extra.filter(q => q && q.id && !ids.has(q.id))];
}
export const countCustom = (questions: QuestionItem[]) => (questions || []).filter(q => q && DEFAULT_JSON.get(q.id) !== JSON.stringify(q) && !isLegacySample(q)).length;
/** Câu mẫu nguyên bản của phần mềm (chưa sửa) */
export const isSampleQuestion = (q: QuestionItem) => Boolean(q && (DEFAULT_JSON.get(q.id) === JSON.stringify(q) || isLegacySample(q)));
/** Tài khoản giáo viên (không phải Quản trị / BGH) — có kho câu hỏi cá nhân */
export const isPersonalQuizAccount = (u: UserAccount | null | undefined) => Boolean(
  u && !(u.role === 'admin' || u.role === 'school_admin' || u.role === 'bgh' || u.role === 'guest_admin' || u.isBgh || u.isSchoolAdmin || u.isGuestAdmin)
);
/** Trình duyệt cho phép chọn thư mục trên máy tính (Chrome / Edge / bản cài đặt) */
export const supportsLocalFolder = () => typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function' && window.isSecureContext !== false;

// ─────────────────────────────── Drive cá nhân
const remoteFileName = (username: string) => `nganhang_cauhoi_${norm(username).replace(/[^a-z0-9_.-]/g, '_')}.json`;
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const localTimers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => { try { fn(); } catch (_) { /* ignore */ } });

export const quizBankStore = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },

  /** Bộ câu hỏi đã lưu trên máy (đã ghép lại câu mẫu, thứ tự giữ nguyên); null nếu chưa có */
  async load(username: string): Promise<{ questions: QuestionItem[]; updatedAt: number } | null> {
    const rec = await idbGet(norm(username));
    return rec ? { questions: smartMergeQuizBank(unpack(rec)), updatedAt: rec.updatedAt || 0 } : null;
  },

  /** Lưu bộ câu hỏi (gọi từ updateQuizBank). Có cấu hình Drive cá nhân → hẹn đẩy lên sau 10 giây. */
  async save(username: string, questions: QuestionItem[]): Promise<void> {
    const u = norm(username);
    if (!u) return;
    const prev = await idbGet(u);
    const next = await pack(questions);
    const keep = new Set(next.order);
    const removed = (prev?.items || []).map(q => q.id).filter(id => id && !keep.has(id)); // chỉ câu tự soạn / đã sửa
    next.deleted = Array.from(new Set([...(prev?.deleted || []), ...removed])).filter(id => !keep.has(id)).slice(-MAX_TOMBSTONES);
    await idbPut(u, next);
    emit();
    if (this.getDriveConfig(u)) this.schedulePush(u);
    if (this.getLocalInfo(u)?.mode === 'folder') this.scheduleLocalWrite(u);
  },

  // ---------- Danh sách MÔN HỌC và BÀI HỌC của giáo viên (giáo viên thêm / xóa; giữ cả môn, bài chưa có câu)
  getSubjects(username: string): string[] {
    try {
      const raw = localStorage.getItem(SUBJ_KEY + norm(username));
      if (raw === null) {
        // Lần đầu: môn mặc định + các bộ đã tạo ở bản trước
        let old: string[] = [];
        try { const v = JSON.parse(localStorage.getItem(OLD_SUBJ_KEY + norm(username)) || '[]'); old = Array.isArray(v) ? v.map(String) : []; } catch (_) { old = []; }
        return Array.from(new Set([...DEFAULT_TEACHER_SUBJECTS, ...old])).filter(Boolean);
      }
      const v = JSON.parse(raw); return Array.isArray(v) ? v.map(String).filter(Boolean) : [...DEFAULT_TEACHER_SUBJECTS];
    } catch (_) { return [...DEFAULT_TEACHER_SUBJECTS]; }
  },
  setSubjects(username: string, list: string[]) {
    try { localStorage.setItem(SUBJ_KEY + norm(username), JSON.stringify(Array.from(new Set(list.map(x => x.trim()).filter(Boolean))))); } catch (_) { /* ignore */ }
    emit();
    this.catalogChanged(username);
  },
  /** Danh mục đổi → hẹn ghi lại tệp (thư mục máy / Drive cá nhân) để danh mục đi kèm */
  catalogChanged(username: string) {
    const u = norm(username);
    if (this.getLocalInfo(u)?.mode === 'folder') this.scheduleLocalWrite(u);
    if (this.getDriveConfig(u)) this.schedulePush(u);
  },
  addSubject(username: string, name: string) {
    const n = name.trim(); if (!n) return;
    const cur = this.getSubjects(username);
    if (!cur.includes(n)) this.setSubjects(username, [...cur, n]);
  },
  removeSubject(username: string, name: string) {
    this.setSubjects(username, this.getSubjects(username).filter(x => x !== name));
    const les = this.getLessons(username); if (les[name]) { delete les[name]; this.setLessons(username, les); }
  },
  /** Danh mục môn + bài của giáo viên (đi kèm tệp câu hỏi để máy khác dựng lại được) */
  catalog(username: string): { subjects: string[]; lessons: Record<string, string[]> } {
    return { subjects: this.getSubjects(username), lessons: this.getLessons(username) };
  },
  /** Gộp CỘNG THÊM danh mục từ tệp (Drive cá nhân / thư mục / tệp nhập), không xóa môn, bài nào trên máy */
  mergeCatalog(username: string, cat: any) {
    if (!cat || typeof cat !== 'object') return;
    const subs = Array.isArray(cat.subjects) ? cat.subjects.map(String).filter(Boolean) : [];
    const cur = this.getSubjects(username);
    const nextSubs = Array.from(new Set([...cur, ...subs]));
    if (nextSubs.length !== cur.length) this.setSubjects(username, nextSubs);
    if (cat.lessons && typeof cat.lessons === 'object') {
      const m = this.getLessons(username); let changed = false;
      Object.entries(cat.lessons).forEach(([sub, arr]) => {
        if (!Array.isArray(arr)) return;
        const merged = Array.from(new Set([...(m[sub] || []), ...arr.map(String).filter(Boolean)]));
        if (merged.length !== (m[sub] || []).length) { m[sub] = merged; changed = true; }
      });
      if (changed) this.setLessons(username, m);
    }
  },
  mergeCatalogFromText(username: string, text: string) {
    try { const d = JSON.parse(text); if (d && !Array.isArray(d)) this.mergeCatalog(username, d.catalog); } catch (_) { /* ignore */ }
  },
  getLessons(username: string): Record<string, string[]> {
    try { const v = JSON.parse(localStorage.getItem(LESSON_KEY + norm(username)) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; }
  },
  setLessons(username: string, map: Record<string, string[]>) {
    try { localStorage.setItem(LESSON_KEY + norm(username), JSON.stringify(map)); } catch (_) { /* ignore */ }
    emit();
    this.catalogChanged(username);
  },
  addLesson(username: string, subject: string, name: string) {
    const n = name.trim(); if (!n || !subject) return;
    const m = this.getLessons(username); const cur = m[subject] || [];
    if (!cur.includes(n)) { m[subject] = [...cur, n]; this.setLessons(username, m); }
    this.addSubject(username, subject);
  },
  removeLesson(username: string, subject: string, name: string) {
    const m = this.getLessons(username);
    if (m[subject]) { m[subject] = m[subject].filter(x => x !== name); this.setLessons(username, m); }
  },

  // ---------- Khóa két cá nhân (sinh từ mật khẩu lúc đăng nhập, KHÔNG xuất được; xóa khi Đăng xuất)
  async setVaultKey(username: string, key: CryptoKey | null) { await idbPutAny(VAULT_KEY + norm(username), key); },
  async getVaultKey(username: string): Promise<CryptoKey | null> { return (await idbGetAny(VAULT_KEY + norm(username))) || null; },

  // ---------- Nơi lưu bắt buộc trước khi thêm câu hỏi
  /** Đã cấu hình nơi lưu câu hỏi (thư mục máy tính / bộ nhớ máy / Drive cá nhân) */
  isConfigured(username: string): boolean {
    return Boolean(this.getDriveConfig(username) || this.getLocalInfo(username));
  },

  // ---------- Thư mục trên máy tính (File System Access API)
  getLocalInfo(username: string): LocalStorageInfo | null {
    try { const c = JSON.parse(localStorage.getItem(LOCAL_KEY + norm(username)) || 'null'); return c && (c.mode === 'folder' || c.mode === 'browser') ? c : null; } catch (_) { return null; }
  },
  setLocalInfo(username: string, info: LocalStorageInfo | null) {
    try {
      if (info) localStorage.setItem(LOCAL_KEY + norm(username), JSON.stringify(info));
      else localStorage.removeItem(LOCAL_KEY + norm(username));
    } catch (_) { /* ignore */ }
    emit();
  },
  /** Chọn thư mục trên máy tính (phải gọi trong lúc bấm nút). Thư mục đã có tệp câu hỏi → trả về câu hỏi trong tệp để gộp. */
  async pickLocalFolder(username: string): Promise<{ ok: boolean; message: string; existing?: QuestionItem[] }> {
    const u = norm(username);
    const picker = (window as any).showDirectoryPicker;
    if (typeof picker !== 'function') return { ok: false, message: 'Trình duyệt này không cho chọn thư mục. Hãy dùng Chrome / Edge, hoặc dùng Google Drive cá nhân.' };
    let handle: any;
    try {
      handle = await picker.call(window, { id: 'lhhp-quiz-bank', mode: 'readwrite', startIn: 'documents' });
    } catch (e: any) {
      return { ok: false, message: e?.name === 'AbortError' ? '' : 'Không mở được hộp chọn thư mục.' };
    }
    try {
      if (handle.requestPermission && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
        return { ok: false, message: 'Bạn chưa cho phép phần mềm ghi vào thư mục này.' };
      }
    } catch (_) { /* trình duyệt cũ: bỏ qua */ }
    if (!(await idbPutAny(HANDLE_KEY + u, handle))) return { ok: false, message: 'Không ghi nhớ được thư mục trên máy này.' };
    this.setLocalInfo(u, { mode: 'folder', folderName: handle.name, setAt: Date.now() });
    const existing = await this.readLocalFolder(u, false).catch(() => null);
    if (!existing || !existing.length) await this.writeLocalFolder(u, false);
    return { ok: true, message: `Đã chọn thư mục "${handle.name}". Bộ câu hỏi tự lưu vào tệp ${remoteFileName(u)} trong thư mục này.`, existing: existing || undefined };
  },
  /** Chỉ dùng bộ nhớ phần mềm trên máy (trình duyệt không hỗ trợ chọn thư mục) */
  useBrowserOnly(username: string) {
    this.setLocalInfo(username, { mode: 'browser', setAt: Date.now() });
  },
  async clearLocal(username: string) {
    const u = norm(username);
    await idbPutAny(HANDLE_KEY + u, null);
    this.setLocalInfo(u, null);
  },
  async folderHandle(username: string, interactive: boolean): Promise<any | null> {
    const u = norm(username);
    const handle = await idbGetAny(HANDLE_KEY + u);
    if (!handle) return null;
    try {
      let perm = handle.queryPermission ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted';
      if (perm !== 'granted' && interactive && handle.requestPermission) perm = await handle.requestPermission({ mode: 'readwrite' });
      const info = this.getLocalInfo(u);
      if (perm !== 'granted') {
        if (info && !info.needsPermission) this.setLocalInfo(u, { ...info, needsPermission: true });
        return null;
      }
      if (info?.needsPermission) this.setLocalInfo(u, { ...info, needsPermission: false });
      return handle;
    } catch (_) { return null; }
  },
  scheduleLocalWrite(username: string, delay = 1500) {
    const u = norm(username);
    const t = localTimers.get(u);
    if (t) clearTimeout(t);
    localTimers.set(u, setTimeout(() => { localTimers.delete(u); this.writeLocalFolder(u, false).catch(() => {}); }, delay));
  },
  /** Ghi kho câu hỏi trên máy ra tệp trong thư mục đã chọn. interactive = đang trong lúc bấm nút (được hỏi lại quyền). */
  async writeLocalFolder(username: string, interactive: boolean): Promise<{ ok: boolean; message: string }> {
    const u = norm(username);
    const info = this.getLocalInfo(u);
    if (info?.mode !== 'folder') return { ok: false, message: 'Chưa chọn thư mục trên máy tính.' };
    const handle = await this.folderHandle(u, interactive);
    if (!handle) return { ok: false, message: 'Cần cho phép lại quyền ghi vào thư mục (bấm "Cho phép ghi thư mục").' };
    const rec = (await idbGet(u)) || { order: [], items: [], updatedAt: Date.now() };
    try {
      const fh = await handle.getFileHandle(remoteFileName(u), { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify({ format: 'lhhp_quiz_bank', version: 1, owner: u, ...rec, catalog: this.catalog(u) }));
      await w.close();
      this.setLocalInfo(u, { ...(this.getLocalInfo(u) as LocalStorageInfo), lastWriteAt: Date.now(), lastError: undefined, needsPermission: false });
      return { ok: true, message: `Đã lưu vào thư mục "${handle.name}".` };
    } catch (_) {
      this.setLocalInfo(u, { ...(this.getLocalInfo(u) as LocalStorageInfo), lastError: 'Không ghi được tệp vào thư mục (thư mục bị xóa / đổi tên / USB đã rút?).' });
      return { ok: false, message: 'Không ghi được tệp vào thư mục đã chọn.' };
    }
  },
  /** Đọc tệp câu hỏi trong thư mục đã chọn (null nếu chưa có tệp / không có quyền) */
  async readLocalFolder(username: string, interactive: boolean): Promise<QuestionItem[] | null> {
    const u = norm(username);
    const handle = await this.folderHandle(u, interactive);
    if (!handle) return null;
    try {
      const fh = await handle.getFileHandle(remoteFileName(u));
      const text = await (await fh.getFile()).text();
      this.mergeCatalogFromText(u, text);
      return this.parseImport(text);
    } catch (_) { return null; }
  },
  /** Gọi trong lúc giáo viên bấm nút: xin lại quyền ghi thư mục nếu trình duyệt đã quên (sau khi mở lại trình duyệt) */
  async ensureLocalPermission(username: string): Promise<void> {
    const info = this.getLocalInfo(username);
    if (info?.mode !== 'folder') return;
    const handle = await this.folderHandle(username, true);
    if (handle && (info.needsPermission || !info.lastWriteAt)) await this.writeLocalFolder(username, false);
  },

  /** Nhận bộ câu hỏi từ dữ liệu cũ (tệp lớp / bộ nhớ trình duyệt): CỘNG THÊM câu chưa có vào kho, không xóa câu nào.
   *  Trả về bộ câu hỏi đầy đủ sau khi gộp (để hiển thị). */
  async adopt(username: string, incoming: QuestionItem[]): Promise<QuestionItem[]> {
    const u = norm(username);
    const rec = await idbGet(u);
    if (!rec) { await idbPut(u, await pack(incoming)); emit(); return smartMergeQuizBank(incoming); }
    const current = unpack(rec);
    const merged = union(current, (incoming || []).filter(q => DEFAULT_JSON.get(q.id) !== JSON.stringify(q) && !isLegacySample(q)));
    if (merged.length !== current.length) { await idbPut(u, await pack(merged)); emit(); }
    return smartMergeQuizBank(merged);
  },

  // ---------- Xuất / Nhập tệp
  async exportFile(username: string, questions: QuestionItem[], teacherName?: string): Promise<number> {
    const rec = await pack(questions);
    const payload = { format: 'lhhp_quiz_bank', version: 1, exportedAt: new Date().toISOString(), teacher: teacherName || username, ...rec, catalog: this.catalog(username) };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Bo_cau_hoi_${norm(username)}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return rec.items.length;
  },
  /** Đọc tệp .json đã xuất (hoặc mảng câu hỏi) → danh sách câu hỏi */
  parseImport(text: string): QuestionItem[] {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data.filter((q: any) => q && q.id && q.questionText !== undefined);
    if (data && Array.isArray(data.items)) return unpack({ order: Array.isArray(data.order) ? data.order : [], items: data.items, updatedAt: 0 });
    throw new Error('Tệp không đúng định dạng bộ câu hỏi của phần mềm.');
  },
  /** Gộp câu nhập vào bộ hiện có: cùng mã → thay bằng câu trong tệp; mã mới → thêm cuối */
  mergeImport(current: QuestionItem[], imported: QuestionItem[]): { questions: QuestionItem[]; added: number; replaced: number } {
    const byId = new Map(imported.map(q => [q.id, q]));
    let replaced = 0;
    const next = current.map(q => { const r = byId.get(q.id); if (r && JSON.stringify(r) !== JSON.stringify(q)) { replaced++; return r; } return q; });
    const ids = new Set(current.map(q => q.id));
    const added = imported.filter(q => !ids.has(q.id));
    return { questions: [...next, ...added], added: added.length, replaced };
  },

  // ---------- Google Drive cá nhân (tùy chọn)
  getDriveConfig(username: string): PersonalDriveConfig | null {
    try { const c = JSON.parse(localStorage.getItem(CFG_KEY + norm(username)) || 'null'); return c && c.scriptUrl && c.folderId ? c : null; } catch (_) { return null; }
  },
  setDriveConfig(username: string, cfg: PersonalDriveConfig | null) {
    try {
      if (cfg) localStorage.setItem(CFG_KEY + norm(username), JSON.stringify(cfg));
      else localStorage.removeItem(CFG_KEY + norm(username));
    } catch (_) { /* ignore */ }
    emit();
  },
  /** Kiểm tra link: đúng định dạng, Apps Script trả lời, mở được thư mục, KHÔNG trùng thư mục của trường */
  /** Kiểm tra từng bước kết nối Drive cá nhân: mỗi bước Đạt / Không đạt + việc cần làm tiếp (dừng ở bước lỗi đầu tiên) */
  async diagnoseDrive(scriptUrlRaw: string, folderRaw: string): Promise<DriveDiagnosis> {
    const scriptUrl = googleDriveService.normalizeScriptUrl(scriptUrlRaw.trim());
    const folderId = googleDriveService.extractFolderIdFromUrl(folderRaw.trim()) || folderRaw.trim();
    const steps: DriveCheckStep[] = [
      { key: 'folder', label: 'Link thư mục Google Drive', status: 'skip' },
      { key: 'script', label: 'Link Apps Script (Ứng dụng web /exec)', status: 'skip' },
      { key: 'personal', label: 'Là thư mục & Apps Script CÁ NHÂN (không phải của trường)', status: 'skip' },
      { key: 'ping', label: 'Apps Script trả lời (quyền "Bất kỳ ai")', status: 'skip' },
      { key: 'open', label: 'Apps Script mở được thư mục', status: 'skip' },
    ];
    const fail = (k: string, detail: string, next: string): DriveDiagnosis => {
      const st = steps.find(x => x.key === k)!; st.status = 'fail'; st.detail = detail;
      return { ok: false, steps, next, message: detail };
    };
    const pass = (k: string, detail?: string) => { const st = steps.find(x => x.key === k)!; st.status = 'ok'; st.detail = detail; };

    if (!folderId || folderId.length < 10 || /\s/.test(folderId)) {
      return fail('folder', folderRaw.trim() ? 'Không đọc được mã thư mục từ link.' : 'Chưa nhập link thư mục.',
        'Mở thư mục cá nhân trên drive.google.com, sao chép link trên thanh địa chỉ (dạng https://drive.google.com/drive/folders/...) rồi dán vào ô 1.');
    }
    pass('folder', `Mã thư mục: ${folderId.slice(0, 6)}…${folderId.slice(-4)}`);
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(scriptUrl) && !/^http:\/\/localhost:\d+\/exec$/.test(scriptUrl)) {
      return fail('script', scriptUrlRaw.trim() ? 'Link chưa đúng dạng Ứng dụng web (phải kết thúc bằng /exec).' : 'Chưa nhập link Apps Script.',
        'Trong Apps Script bấm Triển khai → Quản lý các bản triển khai → sao chép "URL ứng dụng web" (kết thúc bằng /exec). Không dùng link trang soạn mã (…/edit).');
    }
    pass('script');
    const school = googleDriveService.getConfig();
    if (folderId === (school.folderId || '').trim() || scriptUrl === googleDriveService.normalizeScriptUrl(school.scriptUrl)) {
      return fail('personal', 'Đây là thư mục / Apps Script CỦA TRƯỜNG.',
        'Tạo thư mục và dự án Apps Script trên tài khoản Google CÁ NHÂN của bạn (bước 1–3), rồi dán 2 link mới.');
    }
    pass('personal');
    const sep = scriptUrl.includes('?') ? '&' : '?';
    try {
      const ping = await (await fetch(`${scriptUrl}${sep}action=ping`)).json();
      if (!ping?.success) throw new Error('no');
      pass('ping', ping.version ? `Phiên bản mã ${ping.version}` : undefined);
    } catch (_) {
      return fail('ping', 'Apps Script không trả lời.',
        'Mở dự án Apps Script → Triển khai → Tùy chọn triển khai mới → Ứng dụng web, "Người có quyền truy cập": Bất kỳ ai → Triển khai → cho phép quyền, rồi dán link /exec mới.');
    }
    try {
      const ls = await (await fetch(`${scriptUrl}${sep}action=listFiles&folderId=${encodeURIComponent(folderId)}`)).json();
      if (!ls?.success) {
        return fail('open', `Không mở được thư mục${ls?.message ? ` (${ls.message})` : ''}.`,
          'Thư mục phải thuộc CÙNG tài khoản Google đã triển khai Apps Script. Kiểm tra lại link thư mục, bấm "Sao chép mã" để lấy mã mới, dán vào Apps Script, Lưu và triển khai phiên bản mới.');
      }
      pass('open', `Thư mục có ${Array.isArray(ls.files) ? ls.files.length : 0} tệp`);
    } catch (_) {
      return fail('open', 'Mất kết nối khi mở thư mục.', 'Kiểm tra kết nối mạng rồi bấm Kiểm tra lại.');
    }
    return { ok: true, steps, message: 'Kết nối Google Drive cá nhân thành công.', cfg: { scriptUrl, folderId, folderUrl: folderRaw.trim() } };
  },
  /** Kiểm tra link (dạng rút gọn của diagnoseDrive) */
  async testDrive(scriptUrlRaw: string, folderRaw: string): Promise<{ ok: boolean; message: string; cfg?: PersonalDriveConfig }> {
    const d = await this.diagnoseDrive(scriptUrlRaw, folderRaw);
    return { ok: d.ok, message: d.message, cfg: d.cfg };
  },
  schedulePush(username: string, delay = 10000) {
    const u = norm(username);
    const t = pushTimers.get(u);
    if (t) clearTimeout(t);
    pushTimers.set(u, setTimeout(() => { pushTimers.delete(u); this.pushDrive(u).catch(() => {}); }, delay));
  },
  /** Đẩy kho câu hỏi trên máy lên tệp trong Drive cá nhân */
  async pushDrive(username: string): Promise<{ ok: boolean; message: string }> {
    const u = norm(username);
    const cfg = this.getDriveConfig(u);
    if (!cfg) return { ok: false, message: 'Chưa cấu hình Google Drive cá nhân.' };
    const rec = await idbGet(u);
    if (!rec) return { ok: false, message: 'Chưa có câu hỏi để đồng bộ.' };
    try {
      const res = await fetch(cfg.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'saveClassData', folderId: cfg.folderId, fileName: remoteFileName(u), data: { format: 'lhhp_quiz_bank', version: 1, owner: u, ...rec, catalog: this.catalog(u) } }),
      });
      const data = await res.json().catch(() => null);
      const ok = Boolean(data && data.success !== false);
      this.setDriveConfig(u, { ...cfg, lastSyncAt: ok ? Date.now() : cfg.lastSyncAt, lastError: ok ? undefined : (data?.message || 'Không lưu được lên Drive cá nhân.') });
      return { ok, message: ok ? 'Đã đồng bộ lên Google Drive cá nhân.' : (data?.message || 'Không lưu được lên Drive cá nhân.') };
    } catch (_) {
      this.setDriveConfig(u, { ...cfg, lastError: 'Mất kết nối Drive cá nhân.' });
      return { ok: false, message: 'Mất kết nối Drive cá nhân, sẽ thử lại ở lần lưu sau.' };
    }
  },
  /** Lấy tệp trên Drive cá nhân: bản nào MỚI HƠN thì dùng; trả về bộ câu hỏi nếu máy vừa nhận bản mới hơn */
  async pullDrive(username: string): Promise<QuestionItem[] | null> {
    const u = norm(username);
    const cfg = this.getDriveConfig(u);
    if (!cfg) return null;
    try {
      const sep = cfg.scriptUrl.includes('?') ? '&' : '?';
      const remote = await (await fetch(`${cfg.scriptUrl}${sep}action=getLatest&strict=1&folderId=${encodeURIComponent(cfg.folderId)}&fileName=${encodeURIComponent(remoteFileName(u))}`)).json();
      if (!remote || remote.success === false || !Array.isArray(remote.order)) {
        if (await idbGet(u)) await this.pushDrive(u); // Drive chưa có tệp → đưa bản trên máy lên
        return null;
      }
      this.mergeCatalog(u, remote.catalog);
      const local = await idbGet(u);
      const remoteRec: StoredBank = { order: remote.order, items: remote.items || [], updatedAt: remote.updatedAt || 0, deleted: Array.isArray(remote.deleted) ? remote.deleted : [] };
      const rec = mergeBanks(local, remoteRec);
      if (!sameBank(rec, remoteRec)) { await idbPut(u, rec); await this.pushDrive(u); } // Drive thiếu phần của máy → đưa lên (đã gộp)
      else if (!sameBank(rec, local)) await idbPut(u, rec);
      this.setDriveConfig(u, { ...cfg, lastSyncAt: Date.now(), lastError: undefined });
      if (sameBank(rec, local)) return null; // máy đã đủ
      return smartMergeQuizBank(unpack(rec));
    } catch (_) {
      return null;
    }
  },
  remoteFileName,
};
