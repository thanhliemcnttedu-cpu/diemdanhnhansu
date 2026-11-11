/**
 * 📊 TỔNG QUAN DỮ LIỆU TRÊN GOOGLE DRIVE DÙNG CHUNG (bản web — không có máy chủ Express)
 * Dùng cho 2 thẻ của màn Quản trị tài khoản: Mô hình lớp & HS, Data JSON & năm học.
 * - listFiles (Apps Script) trả mọi tệp .json kèm kích thước + giờ cập nhật (trừ tệp được bảo vệ / báo cáo).
 * - Đọc tệp lớp gvcn_*.json / gvbm_*.json (metadata: giáo viên, lớp, sĩ số) và tệp tài khoản quản lý.
 * Chỉ đọc, không ghi gì lên Drive. Bộ nhớ đệm 60 giây.
 */
import { MANAGER_DATA_MS, cacheFor } from '../utils/liveSync';
import { googleDriveService } from './googleDriveService';
import type { UserAccount } from '../types';

export interface DriveFileInfo {
  name: string;
  sizeBytes: number;
  updatedAt: string;
  kind: 'homeroom' | 'subject' | 'account' | 'report' | 'system' | 'other';
  teacherUsername?: string;
  teacherName?: string;
  className?: string;
  grade?: string;
  branch?: string | null;
  campus?: string | null;
  studentCount?: number;
  classId?: string;
}

export interface DriveOverview {
  at: number;
  files: DriveFileInfo[];
  totalBytes: number;
}

// ───────────────────────────── Đọc tổng quan Drive
let cache: { key: string; data: DriveOverview } | null = null;
let inflight: Promise<DriveOverview | null> | null = null;
const TTL = cacheFor(MANAGER_DATA_MS); // chu kỳ 60 s (utils/liveSync)

const kindOf = (name: string): DriveFileInfo['kind'] => {
  const n = name.toLowerCase();
  if (n.startsWith('gvcn_')) return 'homeroom';
  if (n.startsWith('gvbm_')) return 'subject';
  if (n.startsWith('bc_')) return 'report';
  if (/^(dieuchinh_quantri|phanhieu_truong|kekhai_tietday)\.json$/.test(n)) return 'system';
  return 'account';
};

export const driveOverviewService = {
  isAvailable(): boolean {
    const api = typeof window !== 'undefined' ? (window as any).__lhhpApiAvailable : undefined;
    return api !== true && Boolean(googleDriveService.getConfig().scriptUrl);
  },

  invalidate() { cache = null; },

  async load(force = false): Promise<DriveOverview | null> {
    const cfg = googleDriveService.getConfig();
    const scriptUrl = googleDriveService.normalizeScriptUrl(cfg.scriptUrl);
    const folderId = cfg.folderId?.trim() || '';
    if (!scriptUrl) return null;
    const key = `${scriptUrl}|${folderId}`;
    if (!force && cache && cache.key === key && Date.now() - cache.data.at < TTL) return cache.data;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const sep = scriptUrl.includes('?') ? '&' : '?';
        const res = await fetch(`${scriptUrl}${sep}action=listFiles&folderId=${encodeURIComponent(folderId)}`);
        const list = await res.json();
        if (!list || !Array.isArray(list.files)) return cache?.data || null;
        const files: DriveFileInfo[] = list.files.map((f: any) => ({
          name: String(f.name || ''), sizeBytes: Number(f.sizeBytes) || 0,
          updatedAt: String(f.updatedAt || f.updated || ''), kind: kindOf(String(f.name || '')),
        }));
        // Đọc nội dung tệp lớp (lấy metadata, sĩ số) — tối đa 5 tệp cùng lúc
        const toRead = files.filter(f => f.kind === 'homeroom' || f.kind === 'subject');
        let cursor = 0;
        const worker = async () => {
          while (cursor < toRead.length) {
            const f = toRead[cursor++];
            try {
              const r = await fetch(`${scriptUrl}${sep}action=getLatest&strict=1&folderId=${encodeURIComponent(folderId)}&fileName=${encodeURIComponent(f.name)}`);
              const raw = await r.json();
              if (!raw || raw.success === false) continue;
              const md = raw.metadata || {};
              f.teacherUsername = String(md.teacherUsername || raw.username || '').toLowerCase() || undefined;
              f.teacherName = md.teacherName || undefined;
              if (f.kind !== 'account') {
                f.className = md.className || raw.classInfo?.name || undefined;
                f.classId = raw.classInfo?.id || undefined;
                f.grade = md.grade || raw.classInfo?.grade || undefined;
                f.branch = md.branch ?? raw.classInfo?.branch ?? null;
                f.campus = md.campus ?? raw.classInfo?.campus ?? null;
                f.studentCount = Array.isArray(raw.students) ? raw.students.length : (Number(md.totalStudents) || 0);
              }
            } catch (_) { /* tệp lỗi: bỏ qua */ }
          }
        };
        await Promise.all(Array.from({ length: Math.min(5, toRead.length) }, worker));
        const data: DriveOverview = { at: Date.now(), files, totalBytes: files.reduce((s, f) => s + f.sizeBytes, 0) };
        cache = { key, data };
        return data;
      } catch (_) {
        return cache?.data || null;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },

  /** Tóm tắt theo giáo viên cho thẻ "Mô hình lớp & HS" (cùng dạng UserSummaryItem) */
  summaries(ov: DriveOverview, users: UserAccount[]) {
    const classFiles = ov.files.filter(f => f.kind === 'homeroom' || f.kind === 'subject');
    return users.map(u => {
      const un = u.username.toLowerCase();
      const mine = classFiles.filter(f => f.teacherUsername === un);
      const latest = mine.reduce((m, f) => Math.max(m, Date.parse(f.updatedAt) || 0), 0);
      return {
        id: u.id || `user-${un}`, username: u.username, fullName: u.fullName, role: u.role,
        assignedClassName: u.assignedClassName, subjectName: u.subjectName, schoolName: u.schoolName, status: u.status,
        classCount: mine.length,
        studentCount: mine.filter(f => f.kind === 'homeroom').reduce((s, f) => s + (f.studentCount || 0), 0),
        lastUpdated: latest || undefined,
        classes: mine.map(f => ({
          id: f.classId || f.name, name: (f.className || f.name.replace(/^gv(cn|bm)_|\.json$/gi, '')).toUpperCase(),
          grade: f.grade, studentCount: f.studentCount || 0,
          branch: f.branch || null, campus: f.campus || null, kind: f.kind,
        })),
      };
    });
  },
};
