/**
 * 🧩 KHO BỘ GHÉP HÌNH CỦA GIÁO VIÊN (trò "Lật mảnh ghép") — dữ liệu CÁ NHÂN, lưu cùng nơi với kho câu hỏi.
 * - Trên máy: IndexedDB `lhhp_personal` › `quiz_bank`, khóa `puzzle:<tài khoản>` (dung lượng lớn vì có ảnh bí mật).
 * - Thư mục máy tính đã chọn ở "Nơi lưu câu hỏi": tự ghi `ghep_hinh_<tài khoản>.json` cạnh tệp câu hỏi (gom 1,5 giây).
 * - Drive cá nhân (nếu đã kết nối): tệp `ghep_hinh_<tài khoản>.json` qua Apps Script cá nhân, đẩy sau 10 giây.
 * Đồng bộ luôn GỘP theo mã bộ (bộ nào sửa sau thì thắng) và nhớ bộ đã xóa (deleted), không để bản này xóa trắng bản kia.
 * Không đụng tới kho câu hỏi cũ (`quizBankStore`), chỉ dùng lại cấu hình nơi lưu của nó.
 */
import { quizBankStore } from './quizBankStore';
import { shrinkImageDataUrl } from '../utils/driveCompact';

export interface PuzzleQuestion {
  id: string;
  text: string;
  /** Ảnh minh họa câu hỏi (data URL, đã thu nhỏ) */
  image?: string;
  /** Bốn phương án A–D (ô trống nghĩa là không dùng) */
  options: string[];
  /** Vị trí đáp án đúng trong `options` */
  correct: number;
  explanation?: string;
}

export interface PuzzleSet {
  id: string;
  title: string;
  description?: string;
  /** Số mảnh: 3 (3×1), 4 (2×2), 6 (3×2), 8 (4×2), 9 (3×3), 12 (4×3) */
  pieces: number;
  /** retry = sai thì trả lời lại; lock = sai là khóa mảnh */
  mode: 'retry' | 'lock';
  /** Ảnh bí mật (data URL) */
  image: string;
  /** Đáp án hình ảnh; nhiều cách gọi cách nhau bằng ; hoặc | */
  answer: string;
  questions: PuzzleQuestion[];
  updatedAt: number;
}

interface Rec { sets: PuzzleSet[]; deleted: string[]; updatedAt: number }

export const PIECE_LAYOUTS: Record<number, { cols: number; rows: number }> = {
  3: { cols: 3, rows: 1 }, 4: { cols: 2, rows: 2 }, 6: { cols: 3, rows: 2 }, 8: { cols: 4, rows: 2 }, 9: { cols: 3, rows: 3 }, 12: { cols: 4, rows: 3 },
};

const DB_NAME = 'lhhp_personal';
const STORE = 'quiz_bank';
const KEY = 'puzzle:';
const LS_FALLBACK = 'lhhp_puzzle_personal:';
const norm = (u: string) => String(u || '').trim().toLowerCase();
const fileName = (u: string) => `ghep_hinh_${norm(u).replace(/[^a-z0-9_.-]/g, '_')}.json`;
const MAX_TOMBSTONES = 500;

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
async function idbGet(u: string): Promise<Rec | null> {
  const db = await openDb();
  if (!db) { try { return JSON.parse(localStorage.getItem(LS_FALLBACK + u) || 'null'); } catch (_) { return null; } }
  return new Promise(resolve => {
    try {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY + u);
      r.onsuccess = () => resolve((r.result as Rec) || null);
      r.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}
async function idbPut(u: string, rec: Rec): Promise<void> {
  const db = await openDb();
  if (!db) { try { localStorage.setItem(LS_FALLBACK + u, JSON.stringify(rec)); } catch (_) { /* đầy */ } return; }
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec, KEY + u);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (_) { resolve(); }
  });
}

/** Gộp hai bản: cùng mã thì bộ có updatedAt lớn hơn thắng; bộ đã xóa ở bên nào cũng bị bỏ ở cả hai */
function merge(a: Rec | null, b: Rec | null): Rec {
  if (!a) return b ? { ...b, deleted: b.deleted || [] } : { sets: [], deleted: [], updatedAt: 0 };
  if (!b) return { ...a, deleted: a.deleted || [] };
  const deleted = Array.from(new Set([...(a.deleted || []), ...(b.deleted || [])])).slice(-MAX_TOMBSTONES);
  const gone = new Set(deleted);
  const byId = new Map<string, PuzzleSet>();
  [...(a.sets || []), ...(b.sets || [])].forEach(s => {
    if (!s || !s.id || gone.has(s.id)) return;
    const cur = byId.get(s.id);
    if (!cur || (s.updatedAt || 0) >= (cur.updatedAt || 0)) byId.set(s.id, s);
  });
  return { sets: Array.from(byId.values()), deleted, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) };
}
const same = (x: Rec | null, y: Rec | null) => Boolean(x && y)
  && JSON.stringify([...(x!.sets || [])].sort((p, q) => p.id.localeCompare(q.id))) === JSON.stringify([...(y!.sets || [])].sort((p, q) => p.id.localeCompare(q.id)))
  && JSON.stringify([...(x!.deleted || [])].sort()) === JSON.stringify([...(y!.deleted || [])].sort());

const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => { try { fn(); } catch (_) { /* ignore */ } });
const localTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function shrinkSet(s: PuzzleSet): Promise<PuzzleSet> {
  const big = async (v: string | undefined, side: number, limit: number) => (v && /^data:image\//i.test(v) && v.length > limit ? shrinkImageDataUrl(v, side, 0.82) : v);
  const questions = await Promise.all((s.questions || []).map(async q => ({ ...q, image: await big(q.image, 800, 90_000) })));
  return { ...s, image: (await big(s.image, 1280, 260_000)) || s.image, questions };
}

export const puzzleStore = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },

  async load(username: string): Promise<PuzzleSet[]> {
    const rec = await idbGet(norm(username));
    return (rec?.sets || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  /** Lưu toàn bộ danh sách bộ ghép hình của tài khoản (gọi sau khi thêm / sửa / xóa) */
  async save(username: string, sets: PuzzleSet[]): Promise<void> {
    const u = norm(username);
    if (!u) return;
    const prev = await idbGet(u);
    const keep = new Set(sets.map(s => s.id));
    const removed = (prev?.sets || []).map(s => s.id).filter(id => !keep.has(id));
    const packed = await Promise.all(sets.map(shrinkSet));
    const rec: Rec = { sets: packed, deleted: Array.from(new Set([...(prev?.deleted || []), ...removed])).filter(id => !keep.has(id)).slice(-MAX_TOMBSTONES), updatedAt: Date.now() };
    await idbPut(u, rec);
    emit();
    this.scheduleLocalWrite(u);
    if (quizBankStore.getDriveConfig(u)) this.schedulePush(u);
  },

  // ---------- Thư mục trên máy tính (dùng lại thư mục đã chọn ở "Nơi lưu câu hỏi")
  scheduleLocalWrite(u: string, delay = 1500) {
    if (quizBankStore.getLocalInfo(u)?.mode !== 'folder') return;
    const t = localTimers.get(u);
    if (t) clearTimeout(t);
    localTimers.set(u, setTimeout(() => { localTimers.delete(u); this.writeLocal(u, false).catch(() => {}); }, delay));
  },
  async writeLocal(username: string, interactive: boolean): Promise<boolean> {
    const u = norm(username);
    if (quizBankStore.getLocalInfo(u)?.mode !== 'folder') return false;
    const handle = await quizBankStore.folderHandle(u, interactive);
    const rec = await idbGet(u);
    if (!handle || !rec) return false;
    try {
      const fh = await handle.getFileHandle(fileName(u), { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify({ format: 'lhhp_puzzle_sets', version: 1, owner: u, ...rec }));
      await w.close();
      return true;
    } catch (_) { return false; }
  },
  async readLocal(username: string): Promise<Rec | null> {
    const u = norm(username);
    if (quizBankStore.getLocalInfo(u)?.mode !== 'folder') return null;
    const handle = await quizBankStore.folderHandle(u, false);
    if (!handle) return null;
    try {
      const fh = await handle.getFileHandle(fileName(u));
      const data = JSON.parse(await (await fh.getFile()).text());
      return Array.isArray(data?.sets) ? { sets: data.sets, deleted: Array.isArray(data.deleted) ? data.deleted : [], updatedAt: data.updatedAt || 0 } : null;
    } catch (_) { return null; }
  },

  // ---------- Drive cá nhân
  schedulePush(u: string, delay = 10000) {
    const t = pushTimers.get(u);
    if (t) clearTimeout(t);
    pushTimers.set(u, setTimeout(() => { pushTimers.delete(u); this.pushDrive(u).catch(() => {}); }, delay));
  },
  async pushDrive(username: string): Promise<boolean> {
    const u = norm(username);
    const cfg = quizBankStore.getDriveConfig(u);
    const rec = await idbGet(u);
    if (!cfg || !rec) return false;
    try {
      const res = await fetch(cfg.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'saveClassData', folderId: cfg.folderId, fileName: fileName(u), data: { format: 'lhhp_puzzle_sets', version: 1, owner: u, ...rec } }),
      });
      const data = await res.json().catch(() => null);
      return Boolean(data && data.success !== false);
    } catch (_) { return false; }
  },
  async pullDrive(username: string): Promise<Rec | null> {
    const u = norm(username);
    const cfg = quizBankStore.getDriveConfig(u);
    if (!cfg) return null;
    try {
      const sep = cfg.scriptUrl.includes('?') ? '&' : '?';
      const remote = await (await fetch(`${cfg.scriptUrl}${sep}action=getLatest&strict=1&folderId=${encodeURIComponent(cfg.folderId)}&fileName=${encodeURIComponent(fileName(u))}`)).json();
      if (!remote || remote.success === false || !Array.isArray(remote.sets)) return null;
      return { sets: remote.sets, deleted: Array.isArray(remote.deleted) ? remote.deleted : [], updatedAt: remote.updatedAt || 0 };
    } catch (_) { return null; }
  },

  /** Gộp bản trên máy với thư mục máy tính và Drive cá nhân (nếu có). Trả về true nếu danh sách trên máy vừa đổi. */
  async sync(username: string): Promise<boolean> {
    const u = norm(username);
    if (!u) return false;
    const local = await idbGet(u);
    const [folder, drive] = await Promise.all([this.readLocal(u), this.pullDrive(u)]);
    let rec = merge(local, folder);
    rec = merge(rec, drive);
    const changed = !same(rec, local);
    if (changed) { await idbPut(u, rec); emit(); }
    if (changed || (folder && !same(rec, folder))) this.scheduleLocalWrite(u, 300);
    if (drive && !same(rec, drive)) this.schedulePush(u, 1000);
    return changed;
  },
};

/** Mã bộ / mã câu ngắn, đủ khác nhau trên cùng một máy */
export const newPuzzleId = (p = 'pz') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Bỏ dấu, chữ thường, bỏ ký tự thừa — để so sánh đáp án đoán hình ảnh */
export const normalizeGuess = (s: string) => String(s || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
  .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Đoán đúng nếu trùng (hoặc chứa) một trong các cách gọi đáp án */
export const isGuessCorrect = (guess: string, answer: string) => {
  const g = normalizeGuess(guess);
  if (!g) return false;
  return String(answer || '').split(/[;|]/).map(normalizeGuess).filter(Boolean).some(a => g === a || g.includes(a));
};
