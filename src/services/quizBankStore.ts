/**
 * 📚 KHO CÂU HỎI CÁ NHÂN CỦA GIÁO VIÊN (11/2026) — tách bộ câu hỏi trò chơi khỏi dữ liệu chung của nhà trường.
 * - Bước 1: tệp lớp trên Drive TRƯỜNG không còn chứa bộ câu hỏi (utils/driveCompact.ts bỏ `quizBank`).
 * - Bước 2: lưu trên máy trong IndexedDB (dung lượng lớn, không giới hạn 5 MB như localStorage) theo từng tài khoản;
 *           chỉ lưu câu tự soạn / câu mẫu đã sửa + thứ tự (câu mẫu nguyên bản lấy lại từ phần mềm); ảnh được nén
 *           TRONG BẢN LƯU (cạnh ≤ 800px). Xuất / Nhập tệp .json để lưu thư mục máy tính, USB, gửi đồng nghiệp.
 * - Bước 3: (tùy chọn) đồng bộ tệp `nganhang_cauhoi_<tài khoản>.json` lên Google Drive CÁ NHÂN của giáo viên qua
 *           Apps Script cá nhân (dùng lại đúng mã Apps Script của phần mềm, triển khai trên tài khoản Google của giáo viên).
 * Các trò chơi KHÔNG đổi: vẫn đọc `quizBank` và lưu bằng `updateQuizBank` của context.
 */
import type { QuestionItem } from '../types';
import { DEFAULT_QUESTIONS, smartMergeQuizBank } from '../utils/quizParser';
import { googleDriveService } from './googleDriveService';
import { shrinkImageDataUrl } from '../utils/driveCompact';

interface StoredBank { order: string[]; items: QuestionItem[]; updatedAt: number }
export interface PersonalDriveConfig { scriptUrl: string; folderId: string; folderUrl?: string; lastSyncAt?: number; lastError?: string }

const DB_NAME = 'lhhp_personal';
const STORE = 'quiz_bank';
const LS_FALLBACK = 'lhhp_quiz_personal:';
const CFG_KEY = 'lhhp_quiz_drive:';
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
  const custom = list.filter(q => DEFAULT_JSON.get(q.id) !== JSON.stringify(q));
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
export const countCustom = (questions: QuestionItem[]) => (questions || []).filter(q => q && DEFAULT_JSON.get(q.id) !== JSON.stringify(q)).length;

// ─────────────────────────────── Drive cá nhân
const remoteFileName = (username: string) => `nganhang_cauhoi_${norm(username).replace(/[^a-z0-9_.-]/g, '_')}.json`;
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
    await idbPut(u, await pack(questions));
    emit();
    if (this.getDriveConfig(u)) this.schedulePush(u);
  },

  /** Nhận bộ câu hỏi từ dữ liệu cũ (tệp lớp / bộ nhớ trình duyệt): CỘNG THÊM câu chưa có vào kho, không xóa câu nào.
   *  Trả về bộ câu hỏi đầy đủ sau khi gộp (để hiển thị). */
  async adopt(username: string, incoming: QuestionItem[]): Promise<QuestionItem[]> {
    const u = norm(username);
    const rec = await idbGet(u);
    if (!rec) { await idbPut(u, await pack(incoming)); emit(); return smartMergeQuizBank(incoming); }
    const current = unpack(rec);
    const merged = union(current, (incoming || []).filter(q => DEFAULT_JSON.get(q.id) !== JSON.stringify(q)));
    if (merged.length !== current.length) { await idbPut(u, await pack(merged)); emit(); }
    return smartMergeQuizBank(merged);
  },

  // ---------- Xuất / Nhập tệp
  async exportFile(username: string, questions: QuestionItem[], teacherName?: string): Promise<number> {
    const rec = await pack(questions);
    const payload = { format: 'lhhp_quiz_bank', version: 1, exportedAt: new Date().toISOString(), teacher: teacherName || username, ...rec };
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
  async testDrive(scriptUrlRaw: string, folderRaw: string): Promise<{ ok: boolean; message: string; cfg?: PersonalDriveConfig }> {
    const scriptUrl = googleDriveService.normalizeScriptUrl(scriptUrlRaw.trim());
    const folderId = googleDriveService.extractFolderIdFromUrl(folderRaw.trim()) || folderRaw.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(scriptUrl) && !/^http:\/\/localhost:\d+\/exec$/.test(scriptUrl)) {
      return { ok: false, message: 'Link Apps Script chưa đúng (phải là link Ứng dụng web kết thúc bằng /exec).' };
    }
    if (!folderId || folderId.length < 10) return { ok: false, message: 'Chưa đọc được mã thư mục từ link thư mục Google Drive.' };
    const school = googleDriveService.getConfig();
    if (folderId === (school.folderId || '').trim() || scriptUrl === googleDriveService.normalizeScriptUrl(school.scriptUrl)) {
      return { ok: false, message: 'Đây là thư mục / Apps Script CỦA TRƯỜNG. Hãy dùng thư mục và Apps Script trên tài khoản Google cá nhân của bạn.' };
    }
    try {
      const sep = scriptUrl.includes('?') ? '&' : '?';
      const ping = await (await fetch(`${scriptUrl}${sep}action=ping`)).json();
      if (!ping?.success) return { ok: false, message: 'Apps Script không trả lời. Kiểm tra đã triển khai Ứng dụng web, quyền truy cập "Bất kỳ ai".' };
      const ls = await (await fetch(`${scriptUrl}${sep}action=listFiles&folderId=${encodeURIComponent(folderId)}`)).json();
      if (!ls?.success) return { ok: false, message: `Apps Script không mở được thư mục (${ls?.message || 'kiểm tra lại link thư mục'}).` };
      return { ok: true, message: 'Kết nối Google Drive cá nhân thành công.', cfg: { scriptUrl, folderId, folderUrl: folderRaw.trim() } };
    } catch (_) {
      return { ok: false, message: 'Không kết nối được Apps Script (link sai, dự án bị xóa hoặc chưa mở quyền "Bất kỳ ai").' };
    }
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
        body: JSON.stringify({ action: 'saveClassData', folderId: cfg.folderId, fileName: remoteFileName(u), data: { format: 'lhhp_quiz_bank', version: 1, owner: u, ...rec } }),
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
      const local = await idbGet(u);
      if (local && (local.updatedAt || 0) >= (remote.updatedAt || 0)) {
        if ((local.updatedAt || 0) > (remote.updatedAt || 0)) await this.pushDrive(u);
        return null;
      }
      const rec: StoredBank = { order: remote.order, items: remote.items || [], updatedAt: remote.updatedAt || Date.now() };
      await idbPut(u, rec);
      this.setDriveConfig(u, { ...cfg, lastSyncAt: Date.now(), lastError: undefined });
      return smartMergeQuizBank(unpack(rec));
    } catch (_) {
      return null;
    }
  },
  remoteFileName,
};
