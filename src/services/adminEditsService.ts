/**
 * ☁️ ĐIỀU CHỈNH CỦA QUẢN TRỊ TRÊN GOOGLE DRIVE (bản web Vercel – không có máy chủ)
 *
 * Bài toán: dữ liệu lớp/học sinh thuộc tệp của từng GVCN (gvcn_*.json). Quản trị tối cao (sửa/xóa/chuyển
 * lớp học sinh…) và Quản trị nhà trường/BGH (thêm lớp, gán phân hiệu) không được ghi đè tệp đó.
 *
 * Giải pháp: mọi điều chỉnh được ghi vào MỘT tệp riêng `dieuchinh_quantri.json`:
 *   { version: 1, updatedAt, entries: { "student:<id>": { kind, id, data | deleted, at, by, classId, prevClassId, className } } }
 *  - Màn tổng hợp của Quản trị/BGH áp các điều chỉnh lên dữ liệu đọc từ Drive (databaseService.getExecutiveScopedData).
 *  - Máy GVCN định kỳ nhận điều chỉnh của lớp mình, áp vào lớp rồi lưu như bình thường; tệp lớp ghi lại
 *    metadata.appliedAdminEdits để màn tổng hợp biết điều chỉnh đã nằm trong dữ liệu GVCN.
 *  - Chỉ lưu các trường THỰC SỰ thay đổi (trừ khi thêm mới / chuyển lớp → lưu đủ), để không đè thay đổi khác của GVCN.
 */
import { ADMIN_EDITS_MS, cacheFor } from '../utils/liveSync';
import type { Classroom, Student } from '../types';
import { googleDriveService } from './googleDriveService';
import { isViewOnly } from '../utils/viewOnlyMode';
import type { AppliedAdminEdits } from './adminEditsStore';

export const ADMIN_EDITS_FILE = 'dieuchinh_quantri.json';
const SESSION_KEY = 'lop_hoc_current_user_v2'; // = LOCAL_AUTH_KEY (không import databaseService để tránh vòng phụ thuộc)
const RETENTION_MS = 180 * 24 * 3600 * 1000;
const CACHE_MS = cacheFor(ADMIN_EDITS_MS); // chu kỳ 60 s (utils/liveSync)

export interface AdminEditEntry {
  kind: 'class' | 'student';
  id: string;
  data?: Record<string, any>;
  deleted?: boolean;
  at: number;
  by: string;
  classId?: string;      // lớp chịu tác động (lớp mới của học sinh / chính lớp)
  prevClassId?: string;  // lớp cũ khi chuyển lớp học sinh
  className?: string;    // tên lớp (để máy GVCN khớp theo tên khi id lớp khác nhau)
}
export type AdminEditEntries = Record<string, AdminEditEntry>;

const known = { class: new Map<string, any>(), student: new Map<string, any>() };
// Adjustments not yet written to Drive. Kept in localStorage as well (per school folder) so that closing the
// app while offline does not lose them; they are sent on the next start / when the network is back.
const PENDING_STORE_PREFIX = 'lhhp_admin_edits_pending:';
const pendingStoreKey = () => PENDING_STORE_PREFIX + (String(googleDriveService.getConfig().folderId || '').trim() || 'default');
const loadStoredPending = (): AdminEditEntries => {
  try {
    const raw = JSON.parse(localStorage.getItem(pendingStoreKey()) || 'null');
    return raw && typeof raw === 'object' ? raw as AdminEditEntries : {};
  } catch (_) { return {}; }
};
/** `extra` = a batch being sent right now (still unconfirmed, so it stays in the stored copy) */
const storePending = (extra?: AdminEditEntries) => {
  try {
    const all = { ...(extra || {}), ...pending };
    if (Object.keys(all).length === 0) localStorage.removeItem(pendingStoreKey());
    else localStorage.setItem(pendingStoreKey(), JSON.stringify(all));
  } catch (_) { /* storage full: the in-memory queue still retries while the app is open */ }
};
let pending: AdminEditEntries = typeof localStorage !== 'undefined' ? loadStoredPending() : {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushChain: Promise<void> = Promise.resolve();
let cache: { at: number; entries: AdminEditEntries } | null = null;
// Dọn tệp: điều chỉnh mà mọi GVCN liên quan đã nhận thì xóa khỏi tệp (giữ tệp luôn nhỏ)
let lastAppliedByClass: Record<string, AppliedAdminEdits> = {};
let pruneRequested = false;
let lastPruneAt = 0;
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;

const keyOf = (kind: string, id: string) => `${kind}:${id}`;
export const canonicalClassName = (name?: string) =>
  (name || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, '');

function sessionUser(): { username: string; role?: string; isBgh?: boolean; isSchoolAdmin?: boolean } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const u = raw ? JSON.parse(raw) : null;
    return u && u.username ? u : null;
  } catch (_) {
    return null;
  }
}

function isManagementUser(u: { username?: string; role?: string; isBgh?: boolean; isSchoolAdmin?: boolean } | null) {
  if (!u) return false;
  return Boolean(
    (u.username || '').toLowerCase() === 'adminquantri' ||
    u.role === 'admin' || u.role === 'school_admin' || u.role === 'bgh' || u.isBgh || u.isSchoolAdmin
  );
}

function driveTarget(): { url: string; folderId: string } | null {
  const c = googleDriveService.getConfig();
  const url = googleDriveService.normalizeScriptUrl(c.scriptUrl);
  return url ? { url, folderId: (c.folderId || '').trim() } : null;
}

/** Gộp 2 điều chỉnh cùng khóa: bản mới hơn thắng; dữ liệu vá được cộng dồn. */
function combine(older: AdminEditEntry | undefined, newer: AdminEditEntry): AdminEditEntry {
  if (!older) return newer;
  const [a, b] = older.at <= newer.at ? [older, newer] : [newer, older];
  if (b.deleted) return b;
  if (a.deleted) return b; // tạo lại sau khi xóa
  return {
    ...b,
    data: { ...(a.data || {}), ...(b.data || {}) },
    prevClassId: a.prevClassId || b.prevClassId
  };
}

async function fetchFile(): Promise<AdminEditEntries> {
  const t = driveTarget();
  if (!t) return {};
  const res = await fetch(
    `${t.url}${t.url.includes('?') ? '&' : '?'}action=getLatest&strict=1&folderId=${encodeURIComponent(t.folderId)}&fileName=${encodeURIComponent(ADMIN_EDITS_FILE)}`
  );
  const json = await res.json();
  if (json && json.entries && typeof json.entries === 'object') return json.entries as AdminEditEntries;
  if (json && json.success === false && /chưa có tệp/i.test(String(json.message || ''))) return {};
  throw new Error(json?.message || 'Không đọc được tệp điều chỉnh của Quản trị.');
}

async function postFile(entries: AdminEditEntries): Promise<void> {
  const t = driveTarget();
  if (!t) return;
  const res = await fetch(t.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'saveClassData',
      folderId: t.folderId,
      fileName: ADMIN_EDITS_FILE,
      data: { version: 1, updatedAt: Date.now(), entries }
    })
  });
  const json = await res.json().catch(() => null);
  if (!json || json.success === false) throw new Error(json?.message || 'Không lưu được điều chỉnh lên Google Drive.');
}

function scheduleFlush(delay = 1500) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushChain = flushChain.then(() => adminEditsService.flush()).catch(() => {});
  }, delay);
}

export const adminEditsService = {
  /** Có nên ghi điều chỉnh lên Drive không (đang là tài khoản quản lý + đã kết nối Drive). */
  isActive(): boolean {
    // Có máy chủ Express (localhost/Desktop) thì máy chủ đã tự đồng bộ sửa đổi → chỉ dùng cho bản web tĩnh
    const apiAvailable = typeof window !== 'undefined' ? (window as any).__lhhpApiAvailable : undefined;
    if (apiAvailable === true) return false;
    return Boolean(driveTarget()) && isManagementUser(sessionUser());
  },

  /** Bỏ bộ nhớ đệm để lần đọc sau lấy điều chỉnh mới nhất trên Drive. */
  invalidateCache() {
    cache = null;
  },

  /** Ảnh chụp dữ liệu mà màn tổng hợp đang hiển thị (để tính phần thay đổi). */
  setKnownSnapshot(classes: Classroom[], students: Student[]) {
    known.class = new Map(classes.map(c => [c.id, c]));
    known.student = new Map(students.map(s => [s.id, s]));
  },

  /** Ghi nhận 1 điều chỉnh (gọi từ databaseService.updateAdminClass / updateAdminStudent). */
  record(kind: 'class' | 'student', obj: any, isDelete = false) {
    if (!obj || !obj.id || !this.isActive() || isViewOnly()) return;
    const user = sessionUser()!;
    const store = known[kind];
    const prev = store.get(obj.id);
    const at = Date.now();
    const classIdOf = (o: any) => (kind === 'class' ? o?.id : o?.classId);
    const nameOfClass = (cid?: string) => (cid ? (known.class.get(cid)?.name || (kind === 'class' ? obj.name : undefined)) : undefined);

    let entry: AdminEditEntry;
    if (isDelete) {
      const cid = classIdOf(prev) || classIdOf(obj);
      entry = { kind, id: obj.id, deleted: true, at, by: user.username, classId: cid, className: nameOfClass(cid) };
      store.delete(obj.id);
    } else {
      const moved = kind === 'student' && prev && obj.classId && prev.classId !== obj.classId;
      let data: Record<string, any>;
      if (!prev || moved) {
        data = { ...obj };
      } else {
        data = {};
        for (const k of Object.keys(obj)) {
          if (k === 'id') continue;
          if (JSON.stringify(obj[k]) !== JSON.stringify(prev[k])) data[k] = obj[k];
        }
        if (Object.keys(data).length === 0) return; // không có gì thay đổi
      }
      const cid = classIdOf(obj) || classIdOf(prev);
      entry = {
        kind, id: obj.id, data, at, by: user.username,
        classId: cid,
        prevClassId: moved ? prev.classId : undefined,
        className: nameOfClass(cid)
      };
      store.set(obj.id, { ...(prev || {}), ...obj });
    }
    const k = keyOf(kind, obj.id);
    pending[k] = combine(pending[k], entry);
    storePending();
    if (cache) cache = { at: cache.at, entries: { ...cache.entries, [k]: combine(cache.entries[k], entry) } };
    scheduleFlush();
  },

  /** Ghi các điều chỉnh đang chờ lên Drive (đọc – gộp – ghi). Lỗi thì giữ lại để thử lại. */
  async flush(): Promise<void> {
    // Only a signed-in management account writes the file (stored entries may come from an earlier session
    // and simply wait for the next one)
    if (!this.isActive()) return;
    const batch = pending;
    const doPrune = pruneRequested;
    if (Object.keys(batch).length === 0 && !doPrune) return;
    pending = {};
    pruneRequested = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Đang ngoại tuyến.');
      const remote = await fetchFile();
      const merged: AdminEditEntries = { ...remote };
      for (const [k, e] of Object.entries(batch)) merged[k] = combine(merged[k], e);
      const cutoff = Date.now() - RETENTION_MS;
      let removed = 0;
      for (const [k, e] of Object.entries(merged)) {
        if (!e || e.at < cutoff) { delete merged[k]; removed++; continue; }
        // đã nằm trong dữ liệu của GVCN (và không phải điều chỉnh vừa ghi trong lượt này)
        if (!batch[k] && this.isConsumed(e, lastAppliedByClass)) { delete merged[k]; removed++; }
      }
      if (Object.keys(batch).length === 0 && removed === 0) return; // chỉ dọn nhưng không có gì để dọn
      await postFile(merged);
      if (doPrune) lastPruneAt = Date.now();
      cache = { at: Date.now(), entries: merged };
      storePending(); // the batch is on Drive now → only entries added meanwhile stay stored
    } catch (err) {
      for (const [k, e] of Object.entries(batch)) pending[k] = combine(pending[k], e);
      storePending();
      console.warn('adminEdits flush error:', err);
      scheduleFlush(10000);
    }
  },

  /** Đọc toàn bộ điều chỉnh (có bộ nhớ đệm), cộng thêm các điều chỉnh chưa kịp ghi. */
  async fetchEntries(maxAgeMs = CACHE_MS): Promise<AdminEditEntries> {
    if (!driveTarget()) return {};
    if (!cache || Date.now() - cache.at > maxAgeMs) {
      try {
        cache = { at: Date.now(), entries: await fetchFile() };
      } catch (_) {
        if (!cache) return { ...pending };
      }
    }
    const out = { ...cache!.entries };
    for (const [k, e] of Object.entries(pending)) out[k] = combine(out[k], e);
    return out;
  },

  /**
   * Màn tổng hợp báo trạng thái "GVCN đã nhận" của từng lớp. Nếu trong tệp có điều chỉnh đã được nhận hết,
   * hẹn một lượt dọn tệp (tối đa 5 phút/lần, chỉ tài khoản quản lý mới ghi).
   */
  noteConsumption(appliedByClass: Record<string, AppliedAdminEdits>, entries: AdminEditEntry[]) {
    lastAppliedByClass = appliedByClass || {};
    if (!this.isActive() || Date.now() - lastPruneAt < PRUNE_INTERVAL_MS) return;
    if (entries.some(e => this.isConsumed(e, lastAppliedByClass))) {
      pruneRequested = true;
      lastPruneAt = Date.now();
      scheduleFlush(3000);
    }
  },

  /** Điều chỉnh đã nằm trong dữ liệu của (các) GVCN liên quan chưa. */
  isConsumed(entry: AdminEditEntry, appliedByClass: Record<string, AppliedAdminEdits>): boolean {
    const k = keyOf(entry.kind, entry.id);
    const involved = [entry.classId, entry.prevClassId].filter(Boolean) as string[];
    if (involved.length === 0) return false;
    return involved.every(cid => (appliedByClass[cid]?.[k] || 0) >= entry.at);
  },

  /**
   * Máy GVCN: áp các điều chỉnh liên quan tới lớp của mình.
   * Trả về danh sách mới + các khóa vừa áp (để ghi dấu đã nhận).
   */
  applyForTeacher(
    entries: AdminEditEntries,
    classes: Classroom[],
    students: Student[],
    applied: AppliedAdminEdits,
    homeroomClassIds: string[]
  ): { classes: Classroom[]; students: Student[]; newlyApplied: AppliedAdminEdits; changed: boolean } {
    const myIds = new Set(homeroomClassIds);
    const myByName = new Map(classes.filter(c => myIds.has(c.id)).map(c => [canonicalClassName(c.name), c.id]));
    const resolveMine = (cid?: string, cname?: string): string | null => {
      if (cid && myIds.has(cid)) return cid;
      const byName = cname ? myByName.get(canonicalClassName(cname)) : undefined;
      return byName || null;
    };
    let nextClasses = classes;
    let nextStudents = students;
    const newlyApplied: AppliedAdminEdits = {};
    let changed = false;

    const ordered = Object.entries(entries).sort((a, b) => a[1].at - b[1].at);
    for (const [k, e] of ordered) {
      if (!e || (applied[k] || 0) >= e.at) continue;
      if (e.kind === 'class') {
        const mine = resolveMine(e.id, e.className || e.data?.name);
        if (!mine) continue;
        if (e.deleted) {
          nextClasses = nextClasses.filter(c => c.id !== mine);
          nextStudents = nextStudents.filter(s => s.classId !== mine);
        } else {
          const { id: _ignore, ...patch } = e.data || {};
          nextClasses = nextClasses.map(c => (c.id === mine ? { ...c, ...patch, id: mine } : c));
        }
        newlyApplied[k] = e.at;
        changed = true;
        continue;
      }
      // student
      const current = nextStudents.find(s => s.id === e.id && myIds.has(s.classId));
      if (e.deleted) {
        if (current) {
          nextStudents = nextStudents.filter(s => s.id !== e.id);
          changed = true;
        }
        if (current || resolveMine(e.classId, e.className)) newlyApplied[k] = e.at;
        continue;
      }
      const target = resolveMine(e.data?.classId ?? e.classId, e.className);
      if (target) {
        const { id: _ignore, ...patch } = e.data || {};
        if (current) {
          nextStudents = nextStudents.map(s => (s.id === e.id ? { ...s, ...patch, classId: target } : s));
        } else if (patch.name) {
          const maxStt = nextStudents.filter(s => s.classId === target).reduce((m, s) => Math.max(m, s.stt || 0), 0);
          nextStudents = [...nextStudents, { points: 0, ...patch, id: e.id, classId: target, stt: maxStt + 1 } as Student];
        }
        newlyApplied[k] = e.at;
        changed = true;
      } else if (current) {
        // học sinh đã được chuyển sang lớp khác
        nextStudents = nextStudents.filter(s => s.id !== e.id);
        newlyApplied[k] = e.at;
        changed = true;
      }
    }
    return { classes: nextClasses, students: nextStudents, newlyApplied, changed };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 🏛️ DANH MỤC PHÂN HIỆU – ĐIỂM TRƯỜNG TRÊN DRIVE (phanhieu_truong.json)
// Bản web không có máy chủ/Supabase → lưu danh mục phân hiệu vào 1 tệp nhỏ dùng chung để mọi máy
// Quản trị / BGH thấy giống nhau. Cấu trúc: { version: 1, schools: { "<tên trường thường>": { schoolName, branches, updatedAt, by } } }
// ─────────────────────────────────────────────────────────────────────────────
export const SCHOOL_BRANCHES_FILE = 'phanhieu_truong.json';
let branchesCache: { at: number; schools: Record<string, any> } | null = null;

async function fetchBranchesFile(): Promise<Record<string, any>> {
  const t = driveTarget();
  if (!t) return {};
  const res = await fetch(
    `${t.url}${t.url.includes('?') ? '&' : '?'}action=getLatest&strict=1&folderId=${encodeURIComponent(t.folderId)}&fileName=${encodeURIComponent(SCHOOL_BRANCHES_FILE)}`
  );
  const json = await res.json();
  if (json && json.schools && typeof json.schools === 'object') return json.schools;
  if (json && json.success === false && /chưa có tệp/i.test(String(json.message || ''))) return {};
  throw new Error(json?.message || 'Không đọc được danh mục phân hiệu trên Drive.');
}

export const schoolBranchesDrive = {
  isAvailable(): boolean {
    const apiAvailable = typeof window !== 'undefined' ? (window as any).__lhhpApiAvailable : undefined;
    return apiAvailable !== true && Boolean(driveTarget());
  },

  /** undefined = Drive chưa có danh mục cho trường này (dùng nguồn khác); mảng = danh mục chung. */
  async load(schoolName: string, maxAgeMs = 30000): Promise<any[] | undefined> {
    if (!this.isAvailable()) return undefined;
    const key = (schoolName || '').trim().toLowerCase();
    if (!key) return undefined;
    if (!branchesCache || Date.now() - branchesCache.at > maxAgeMs) {
      branchesCache = { at: Date.now(), schools: await fetchBranchesFile() };
    }
    const rec = branchesCache.schools[key];
    return rec && Array.isArray(rec.branches) ? rec.branches : undefined;
  },

  async save(schoolName: string, branches: any[]): Promise<void> {
    if (!this.isAvailable() || !isManagementUser(sessionUser())) return;
    const key = (schoolName || '').trim().toLowerCase();
    const t = driveTarget();
    if (!key || !t) return;
    const schools = await fetchBranchesFile();
    schools[key] = { schoolName: schoolName.trim(), branches, updatedAt: Date.now(), by: sessionUser()?.username || '' };
    const res = await fetch(t.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveClassData', folderId: t.folderId, fileName: SCHOOL_BRANCHES_FILE, data: { version: 1, schools } })
    });
    const json = await res.json().catch(() => null);
    if (!json || json.success === false) throw new Error(json?.message || 'Không lưu được danh mục phân hiệu lên Drive.');
    branchesCache = { at: Date.now(), schools };
  }
};

// Adjustments stored from an earlier session / an offline period are sent on their own: when the network is
// back, and once a minute while something is waiting and a management account is signed in.
if (typeof window !== 'undefined') {
  const retry = () => { if (Object.keys(pending).length > 0 && adminEditsService.isActive()) scheduleFlush(0); };
  window.addEventListener('online', () => setTimeout(retry, 3000));
  setInterval(retry, 60000);
  setTimeout(retry, 8000);
}
