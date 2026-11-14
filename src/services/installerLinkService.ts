/**
 * Download link of the desktop installer (setup.exe), set by the school's administrators and shown to
 * everyone on the school's web site (login screen + "Hướng dẫn sử dụng").
 *
 * Stored as one small file in the school's shared Drive folder (through the school's Apps Script), so every
 * computer that opens the school's site sees the same link. Without a school connection (folder link +
 * Apps Script link) there is nowhere to store it → the feature is neither configurable nor shown.
 */
import { googleDriveService } from './googleDriveService';

export interface InstallerLink {
  /** https link of the installer file (or of the page that offers it) */
  url: string;
  /** Version shown on the button, e.g. "1.2.0" */
  version: string;
  note?: string;
  updatedAt: number;
  updatedBy?: string;
}

const FILE_NAME = 'bocai_maytinh.json';
const CACHE_PREFIX = 'lhhp_installer_link:';
export const INSTALLER_LINK_EVENT = 'lhhp:installer-link-changed';

function target(): { url: string; folderId: string } | null {
  const c = googleDriveService.getConfig();
  const url = googleDriveService.normalizeScriptUrl(c.scriptUrl);
  const folderId = (c.folderId || '').trim();
  return url && folderId ? { url, folderId } : null;
}
const cacheKey = (folderId: string) => CACHE_PREFIX + folderId;

/** Only https links are accepted (no http:, javascript:, data:, file:…) */
export function normalizeInstallerUrl(raw: string): string {
  const v = String(raw || '').trim();
  if (!v) return '';
  const withProto = /^https?:\/\//i.test(v) ? v : (/^[\w-]+(\.[\w-]+)+/.test(v) ? `https://${v}` : '');
  try { const u = new URL(withProto); return u.protocol === 'https:' ? u.toString() : ''; } catch (_) { return ''; }
}

/** "…/QL_TRUONG_HOC_V_1.2.0.exe" or "…/desktop-v1.2.0/…" → "1.2.0" ('' when the link has no version) */
export function versionFromUrl(url: string): string {
  const m = /[Vv][_-]?(\d+(?:\.\d+){1,3})/.exec(String(url || ''));
  return m ? m[1] : '';
}

const clean = (j: any): InstallerLink | null => {
  const url = normalizeInstallerUrl(j?.url);
  if (!url) return null;
  return {
    url,
    version: String(j?.version || '').trim().replace(/^v/i, '').slice(0, 20),
    note: String(j?.note || '').slice(0, 200),
    updatedAt: Number(j?.updatedAt) || 0,
    updatedBy: j?.updatedBy ? String(j.updatedBy) : undefined,
  };
};

export const installerLinkService = {
  /** The school connection (shared folder + Apps Script) exists on this computer */
  isAvailable(): boolean {
    return Boolean(target());
  },

  /** Last link read on this computer for the current school (instant, also used when the network is down) */
  getCached(): InstallerLink | null {
    const t = target();
    if (!t) return null;
    try { return clean(JSON.parse(localStorage.getItem(cacheKey(t.folderId)) || 'null')); } catch (_) { return null; }
  },

  /** Read the link from the school's Drive; falls back to the cached one when Drive cannot be reached */
  async load(): Promise<InstallerLink | null> {
    const t = target();
    if (!t) return null;
    try {
      const res = await fetch(`${t.url}${t.url.includes('?') ? '&' : '?'}action=getLatest&strict=1&folderId=${encodeURIComponent(t.folderId)}&fileName=${encodeURIComponent(FILE_NAME)}`);
      const j = await res.json();
      // file not created yet / link removed → nothing to show
      if (j && (j.success === false || !j.url)) {
        try { localStorage.removeItem(cacheKey(t.folderId)); } catch (_) { /* ignore */ }
        return null;
      }
      const link = clean(j);
      try {
        if (link) localStorage.setItem(cacheKey(t.folderId), JSON.stringify(link));
        else localStorage.removeItem(cacheKey(t.folderId));
      } catch (_) { /* ignore */ }
      return link;
    } catch (_) {
      return this.getCached();
    }
  },

  /** Save (or, with an empty url, remove) the link for the whole school. Throws with a readable message. */
  async save(input: { url: string; version: string; note?: string }, by?: string): Promise<InstallerLink | null> {
    const t = target();
    if (!t) throw new Error('Máy này chưa kết nối thư mục Google Drive và Apps Script của nhà trường.');
    const raw = String(input.url || '').trim();
    const url = normalizeInstallerUrl(raw);
    if (raw && !url) throw new Error('Link chưa đúng. Hãy dán link bắt đầu bằng https://');
    const doc = url
      ? { version: String(input.version || versionFromUrl(url)).trim().replace(/^v/i, ''), url, note: String(input.note || '').trim(), updatedAt: Date.now(), updatedBy: by || '' }
      : { version: '', url: '', note: '', updatedAt: Date.now(), updatedBy: by || '' };
    const res = await fetch(t.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveClassData', folderId: t.folderId, fileName: FILE_NAME, data: doc }),
    });
    const json = await res.json().catch(() => null);
    if (!json || json.success === false) throw new Error(json?.message || 'Không lưu được lên Google Drive của trường.');
    const link = clean(doc);
    try {
      if (link) localStorage.setItem(cacheKey(t.folderId), JSON.stringify(link));
      else localStorage.removeItem(cacheKey(t.folderId));
    } catch (_) { /* ignore */ }
    try { window.dispatchEvent(new Event(INSTALLER_LINK_EVENT)); } catch (_) { /* ignore */ }
    return link;
  },
};
