/**
 * 📘 HƯỚNG DẪN SỬ DỤNG — danh mục link / video / tệp PDF do Quản trị đưa lên, mọi tài khoản của trường đều xem được (11/2026).
 *
 * Nơi lưu (bản web dùng Google Drive chung của trường, không cần sửa Apps Script):
 *   - `huongdan_sudung.json`            : danh mục { items: [...] }
 *   - `huongdan_tep_<id>.json`          : nội dung 1 tệp PDF dạng base64 (Apps Script chỉ ghi tệp văn bản)
 * Chưa kết nối Drive → lưu tạm trong trình duyệt của máy này (chỉ máy này thấy).
 * Đọc: bộ nhớ đệm trước (hiện ngay), rồi Drive. Ghi: chỉ nút của Quản trị gọi.
 */
import { googleDriveService } from './googleDriveService';

export type GuideKind = 'video' | 'folder' | 'link' | 'file' | 'pdf';
export interface GuideItem {
  id: string;
  kind: GuideKind;
  title: string;
  /** link mở ở thẻ mới (video, thư mục, trang web, tệp trên mạng). Mục `pdf` không có url. */
  url?: string;
  note?: string;
  /** Tệp PDF đã tải lên phần mềm */
  pdf?: { storeName: string; fileName: string; sizeKb: number };
  updatedAt: number;
  updatedBy?: string;
}
export interface GuideDoc { version: 1; updatedAt: number; updatedBy?: string; items: GuideItem[] }

export const GUIDE_FILE = 'huongdan_sudung.json';
export const GUIDE_PDF_PREFIX = 'huongdan_tep_';
/** Giới hạn tệp PDF tải lên phần mềm (base64 làm tệp lớn thêm ~1/3; Apps Script xử lý tốt trong mức này) */
export const GUIDE_PDF_MAX_MB = 8;
const CACHE_KEY = 'lhhp_user_guide_cache_v1';
const LOCAL_PDF_KEY = 'lhhp_user_guide_pdf_';

export const GUIDE_KIND_META: Record<GuideKind, { label: string; hint: string }> = {
  video: { label: 'Video hướng dẫn', hint: 'Link YouTube, Google Drive, Zalo…' },
  folder: { label: 'Thư mục hướng dẫn', hint: 'Link thư mục Google Drive, OneDrive…' },
  link: { label: 'Trang hướng dẫn', hint: 'Link trang web, bài viết' },
  file: { label: 'Tệp hướng dẫn (link)', hint: 'Link tới tệp PDF, Word… trên mạng' },
  pdf: { label: 'Tệp PDF tải lên', hint: 'Tệp PDF lưu ngay trong phần mềm' },
};

function target(): { url: string; folderId: string } | null {
  const c = googleDriveService.getConfig();
  const url = googleDriveService.normalizeScriptUrl(c.scriptUrl);
  const folderId = (c.folderId || '').trim();
  return url && folderId ? { url, folderId } : null;
}
const emptyDoc = (): GuideDoc => ({ version: 1, updatedAt: 0, items: [] });
function cleanDoc(j: any): GuideDoc {
  const items = Array.isArray(j?.items) ? j.items.filter((x: any) => x && x.id && x.title) : [];
  return { version: 1, updatedAt: Number(j?.updatedAt) || 0, updatedBy: j?.updatedBy, items };
}
async function getFile(name: string): Promise<any> {
  const t = target();
  if (!t) return null;
  const res = await fetch(`${t.url}${t.url.includes('?') ? '&' : '?'}action=getLatest&strict=1&folderId=${encodeURIComponent(t.folderId)}&fileName=${encodeURIComponent(name)}`);
  return res.json();
}
async function postFile(name: string, data: any): Promise<void> {
  const t = target();
  if (!t) throw new Error('Chưa kết nối thư mục Google Drive của trường.');
  const res = await fetch(t.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'saveClassData', folderId: t.folderId, fileName: name, data }),
  });
  const json = await res.json().catch(() => null);
  if (!json || json.success === false) throw new Error(json?.message || 'Không lưu được lên Google Drive của trường.');
}

/** Chỉ nhận link http(s) — không cho javascript:, data:… */
export function normalizeGuideUrl(raw: string): string {
  const v = String(raw || '').trim();
  if (!v) return '';
  const withProto = /^https?:\/\//i.test(v) ? v : (/^[\w-]+(\.[\w-]+)+/.test(v) ? `https://${v}` : '');
  try { const u = new URL(withProto); return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : ''; } catch (_) { return ''; }
}

export const userGuideService = {
  /** Đã kết nối Drive của trường → mọi máy cùng thấy; chưa → chỉ lưu trên máy này */
  isShared(): boolean { return Boolean(target()); },

  getCached(): GuideDoc {
    try { return cleanDoc(JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')); } catch (_) { return emptyDoc(); }
  },

  async load(): Promise<{ doc: GuideDoc; shared: boolean; error?: string }> {
    const cached = this.getCached();
    if (!target()) return { doc: cached, shared: false };
    try {
      const j = await getFile(GUIDE_FILE);
      if (j && Array.isArray(j.items)) {
        const doc = cleanDoc(j);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(doc)); } catch (_) { /* ignore */ }
        return { doc, shared: true };
      }
      // Chưa có tệp trên Drive: coi như danh mục trống (không báo lỗi)
      if (j && j.success === false) return { doc: emptyDoc(), shared: true };
      return { doc: cached, shared: true, error: 'Không đọc được danh mục hướng dẫn trên Google Drive.' };
    } catch (e: any) {
      return { doc: cached, shared: true, error: 'Không kết nối được Google Drive — đang hiện bản đã lưu trên máy này.' };
    }
  },

  /** Quản trị lưu cả danh mục (thêm / sửa / xóa đều gọi hàm này với danh sách mới) */
  async save(items: GuideItem[], by?: string): Promise<GuideDoc> {
    const doc: GuideDoc = { version: 1, updatedAt: Date.now(), updatedBy: by, items };
    if (target()) await postFile(GUIDE_FILE, doc);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(doc)); } catch (_) { /* ignore */ }
    return doc;
  },

  /** Tải 1 tệp PDF lên phần mềm; trả về thông tin để gắn vào mục hướng dẫn */
  async uploadPdf(id: string, file: File): Promise<NonNullable<GuideItem['pdf']>> {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error('Chỉ nhận tệp PDF.');
    if (file.size > GUIDE_PDF_MAX_MB * 1024 * 1024) throw new Error(`Tệp quá lớn (${(file.size / 1048576).toFixed(1)} MB). Tối đa ${GUIDE_PDF_MAX_MB} MB — tệp lớn hơn hãy đưa lên Google Drive rồi dán link.`);
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
      r.onerror = () => reject(new Error('Không đọc được tệp PDF.'));
      r.readAsDataURL(file);
    });
    if (!base64) throw new Error('Không đọc được tệp PDF.');
    const storeName = `${GUIDE_PDF_PREFIX}${id}.json`;
    const payload = { kind: 'lhhp_guide_pdf', fileName: file.name, mime: 'application/pdf', size: file.size, base64, uploadedAt: Date.now() };
    if (target()) await postFile(storeName, payload);
    else {
      try { localStorage.setItem(LOCAL_PDF_KEY + id, JSON.stringify(payload)); }
      catch (_) { throw new Error('Bộ nhớ trình duyệt không đủ chỗ cho tệp này. Hãy kết nối Google Drive của trường hoặc dùng link tệp.'); }
    }
    return { storeName, fileName: file.name, sizeKb: Math.max(0.1, Math.round(file.size / 102.4) / 10) };
  },

  /** Người dùng tải tệp PDF về máy */
  async downloadPdf(item: GuideItem): Promise<void> {
    if (!item.pdf) throw new Error('Mục này không có tệp PDF.');
    let j: any = null;
    if (target()) j = await getFile(item.pdf.storeName);
    else { try { j = JSON.parse(localStorage.getItem(LOCAL_PDF_KEY + item.id) || 'null'); } catch (_) { j = null; } }
    if (!j || !j.base64) throw new Error('Không tải được tệp PDF (tệp đã bị gỡ hoặc mất kết nối Google Drive).');
    const bin = atob(String(j.base64));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    a.download = item.pdf.fileName || `${item.title}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },

  /** Gỡ nội dung tệp PDF khi xóa mục (Apps Script không có lệnh xóa tệp → ghi đè bằng tệp rỗng để giải phóng dung lượng) */
  async clearPdf(item: GuideItem): Promise<void> {
    if (!item.pdf) return;
    try {
      if (target()) await postFile(item.pdf.storeName, { kind: 'lhhp_guide_pdf', removed: true, removedAt: Date.now() });
      else localStorage.removeItem(LOCAL_PDF_KEY + item.id);
    } catch (_) { /* danh mục đã bỏ mục này; tệp rỗng không ảnh hưởng */ }
  },
};
