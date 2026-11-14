import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DesktopVersionPanel } from '../common/DesktopUpdate';
import { InstallerLinkPanel } from '../common/InstallerDownload';
import {
  BookOpen, PlayCircle, FolderOpen, Link2, FileText, FileDown, QrCode, ExternalLink, Pencil, Trash2, Plus, Save, X,
  Loader2, CheckCircle2, AlertTriangle, Copy, Check, RefreshCw, Phone, MessageCircle, Globe, Upload, KeyRound, Sparkles,
} from 'lucide-react';
import { useClassroom } from '../../context/ClassroomContext';
import { APP_AUTHOR_INFO } from '../../data/initialData';
import { buildQrMatrix, QrSvg } from './staff/StaffCheckInQr';
import {
  userGuideService, normalizeGuideUrl, GUIDE_KIND_META, GUIDE_PDF_MAX_MB,
  type GuideItem, type GuideKind,
} from '../../services/userGuideService';

/**
 * 📘 HƯỚNG DẪN SỬ DỤNG
 * - Mọi tài khoản: xem danh mục, bấm link mở ở thẻ mới, quét mã QR, tải tệp PDF; thông tin tác giả và liên hệ hỗ trợ.
 * - Tài khoản quản trị (canManageAccounts): thêm / cập nhật / xóa link video, thư mục, trang, tệp; tải tệp PDF lên phần mềm.
 */

const KIND_ICON: Record<GuideKind, React.ComponentType<{ className?: string }>> = {
  video: PlayCircle, folder: FolderOpen, link: Link2, file: FileText, pdf: FileDown,
};
const KIND_TONE: Record<GuideKind, string> = {
  video: 'bg-rose-100 text-rose-700', folder: 'bg-amber-100 text-amber-800', link: 'bg-sky-100 text-sky-700',
  file: 'bg-indigo-100 text-indigo-700', pdf: 'bg-emerald-100 text-emerald-800',
};
const LINK_KINDS: GuideKind[] = ['video', 'folder', 'link'];
const FILE_KINDS: GuideKind[] = ['file', 'pdf'];

type Draft = { id: string; kind: GuideKind; title: string; url: string; note: string; file: File | null };
const emptyDraft = (kind: GuideKind = 'video'): Draft => ({ id: '', kind, title: '', url: '', note: '', file: null });
const hostOf = (url?: string) => { try { return url ? new URL(url).host.replace(/^www\./, '') : ''; } catch (_) { return ''; } };

export const UserGuideView: React.FC = () => {
  const { currentUser, canManageAccounts, setIsCdKeyModalOpen, setIsRegistrationModalOpen, isCdKeyActivated } = useClassroom();
  const canEdit = Boolean(canManageAccounts);
  const [items, setItems] = useState<GuideItem[]>(() => userGuideService.getCached().items);
  const [shared, setShared] = useState(userGuideService.isShared());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [formOpen, setFormOpen] = useState(false);
  const [qrFor, setQrFor] = useState<string>('');
  const [copied, setCopied] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setLoading(true); setLoadError('');
    const r = await userGuideService.load();
    setItems(r.doc.items); setShared(r.shared); setLoadError(r.error || '');
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const linkItems = useMemo(() => items.filter(i => LINK_KINDS.includes(i.kind)), [items]);
  const fileItems = useMemo(() => items.filter(i => FILE_KINDS.includes(i.kind)), [items]);
  const editing = Boolean(draft.id);

  const openAdd = (kind: GuideKind) => { setDraft(emptyDraft(kind)); setFormOpen(true); setMsg(null); };
  const openEdit = (it: GuideItem) => {
    setDraft({ id: it.id, kind: it.kind, title: it.title, url: it.url || '', note: it.note || '', file: null });
    setFormOpen(true); setMsg(null);
    setTimeout(() => document.getElementById('guide-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };
  const closeForm = () => { setFormOpen(false); setDraft(emptyDraft()); if (fileRef.current) fileRef.current.value = ''; };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const title = draft.title.trim();
    if (!title) { setMsg({ type: 'err', text: 'Hãy nhập tên hướng dẫn.' }); return; }
    const old = items.find(i => i.id === draft.id);
    const id = draft.id || `hd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    let url = '';
    let pdf = old?.kind === 'pdf' && draft.kind === 'pdf' ? old.pdf : undefined;
    if (draft.kind === 'pdf') {
      if (!draft.file && !pdf) { setMsg({ type: 'err', text: 'Hãy chọn tệp PDF để tải lên.' }); return; }
    } else {
      url = normalizeGuideUrl(draft.url);
      if (!url) { setMsg({ type: 'err', text: 'Link chưa đúng. Hãy dán đường link đầy đủ, ví dụ https://drive.google.com/… hoặc https://youtu.be/…' }); return; }
    }
    setBusy('save'); setMsg(null);
    try {
      if (draft.kind === 'pdf' && draft.file) pdf = await userGuideService.uploadPdf(id, draft.file);
      // đổi từ PDF sang link → gỡ nội dung tệp cũ
      if (old?.pdf && draft.kind !== 'pdf') await userGuideService.clearPdf(old);
      const next: GuideItem = {
        id, kind: draft.kind, title, note: draft.note.trim() || undefined,
        ...(draft.kind === 'pdf' ? { pdf } : { url }),
        updatedAt: Date.now(), updatedBy: currentUser?.fullName || currentUser?.username,
      };
      const list = old ? items.map(i => (i.id === id ? next : i)) : [...items, next];
      const doc = await userGuideService.save(list, currentUser?.username);
      setItems(doc.items);
      setMsg({ type: 'ok', text: old ? `Đã cập nhật "${title}".` : `Đã thêm "${title}".${userGuideService.isShared() ? ' Mọi tài khoản của trường đều xem được.' : ''}` });
      closeForm();
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.message || 'Không lưu được hướng dẫn.' });
    } finally { setBusy(''); }
  };

  const remove = async (it: GuideItem) => {
    if (busy) return;
    if (!window.confirm(`Xóa hướng dẫn "${it.title}"?${it.pdf ? '\n\nTệp PDF đã tải lên cũng bị gỡ.' : ''}`)) return;
    setBusy(`del:${it.id}`); setMsg(null);
    try {
      const doc = await userGuideService.save(items.filter(i => i.id !== it.id), currentUser?.username);
      await userGuideService.clearPdf(it);
      setItems(doc.items);
      if (draft.id === it.id) closeForm();
      setMsg({ type: 'ok', text: `Đã xóa "${it.title}".` });
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.message || 'Không xóa được.' });
    } finally { setBusy(''); }
  };

  const download = async (it: GuideItem) => {
    if (busy) return;
    setBusy(`dl:${it.id}`); setMsg(null);
    try { await userGuideService.downloadPdf(it); }
    catch (err: any) { setMsg({ type: 'err', text: err?.message || 'Không tải được tệp.' }); }
    finally { setBusy(''); }
  };

  const copyLink = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1600); } catch (_) { /* ignore */ }
  };

  const btnLight = 'no-hover-fx h-9 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60';
  const iconBtn = 'no-hover-fx w-9 h-9 rounded-xl border bg-white inline-flex items-center justify-center cursor-pointer disabled:opacity-50';

  const Row: React.FC<{ it: GuideItem }> = ({ it }) => {
    const Icon = KIND_ICON[it.kind];
    const showQr = qrFor === it.id && Boolean(it.url);
    return (
      <li className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${KIND_TONE[it.kind]}`}><Icon className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1 basis-56">
            {it.url ? (
              <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-sm font-black text-indigo-800 hover:underline break-words">{it.title}</a>
            ) : (
              <p className="text-sm font-black text-slate-900 break-words">{it.title}</p>
            )}
            <p className="text-xs text-slate-600 break-words">
              {GUIDE_KIND_META[it.kind].label}
              {it.url ? ` • ${hostOf(it.url)}` : it.pdf ? ` • ${it.pdf.fileName} • ${it.pdf.sizeKb >= 1024 ? `${(it.pdf.sizeKb / 1024).toFixed(1)} MB` : `${it.pdf.sizeKb} KB`}` : ''}
            </p>
            {it.note && <p className="text-xs text-slate-700 mt-0.5 break-words">{it.note}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {it.url && (
              <a href={it.url} target="_blank" rel="noopener noreferrer" className="no-hover-fx h-9 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black inline-flex items-center gap-1.5 whitespace-nowrap">
                <ExternalLink className="w-4 h-4" /> {it.kind === 'video' ? 'Xem video' : 'Mở'}
              </a>
            )}
            {it.pdf && (
              <button type="button" onClick={() => download(it)} disabled={Boolean(busy)} className="no-hover-fx h-9 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60">
                {busy === `dl:${it.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Tải về
              </button>
            )}
            {it.url && (
              <button type="button" onClick={() => setQrFor(showQr ? '' : it.id)} aria-expanded={showQr} className={btnLight} title="Hiện mã QR để quét bằng điện thoại">
                <QrCode className="w-4 h-4" /> Mã QR
              </button>
            )}
            {canEdit && (
              <>
                <button type="button" onClick={() => openEdit(it)} className={`${iconBtn} border-slate-300 text-slate-800 hover:bg-slate-50`} title="Sửa" aria-label={`Sửa ${it.title}`}><Pencil className="w-4 h-4" /></button>
                <button type="button" onClick={() => remove(it)} disabled={Boolean(busy)} className={`${iconBtn} border-rose-200 text-rose-700 hover:bg-rose-50`} title="Xóa" aria-label={`Xóa ${it.title}`}>
                  {busy === `del:${it.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </>
            )}
          </div>
        </div>
        {showQr && it.url && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-4">
            <div className="rounded-xl border border-slate-200 p-1 bg-white shrink-0"><QrSvg matrix={buildQrMatrix(it.url)} size={160} title={`Mã QR mở ${it.title}`} /></div>
            <div className="min-w-0 flex-1 basis-56 space-y-2">
              <p className="text-sm font-bold text-slate-800">Mở camera hoặc Zalo trên điện thoại, quét mã để xem hướng dẫn.</p>
              <p className="text-xs font-mono text-slate-700 break-all bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">{it.url}</p>
              <button type="button" onClick={() => copyLink(it.id, it.url!)} className={btnLight}>
                {copied === it.id ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />} {copied === it.id ? 'Đã sao chép' : 'Sao chép link'}
              </button>
            </div>
          </div>
        )}
      </li>
    );
  };

  const Section: React.FC<{ title: string; hint: string; list: GuideItem[]; addKind: GuideKind; addLabel: string; empty: string }> = ({ title, hint, list, addKind, addLabel, empty }) => (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-slate-900 uppercase">{title} <span className="text-slate-600 normal-case font-bold">({list.length})</span></h3>
          <p className="text-xs text-slate-600">{hint}</p>
        </div>
        {canEdit && (
          <button type="button" onClick={() => openAdd(addKind)} className="no-hover-fx h-9 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer">
            <Plus className="w-4 h-4" /> {addLabel}
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-600 text-center">{empty}</p>
      ) : (
        <ul className="space-y-2">{list.map(it => <Row key={it.id} it={it} />)}</ul>
      )}
    </section>
  );

  return (
    <div className="p-3 md:p-4 max-w-7xl mx-auto space-y-3">
      <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0"><BookOpen className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base md:text-lg font-black text-slate-900">Hướng dẫn sử dụng</h2>
          <p className="text-xs text-slate-600">Video, tài liệu hướng dẫn do nhà trường cung cấp • thông tin tác giả và liên hệ hỗ trợ.</p>
        </div>
        <button type="button" onClick={reload} disabled={loading} className={btnLight}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
        </button>
      </div>

      {canEdit && !shared && (
        <p className="rounded-xl bg-amber-50 border border-amber-300 px-3 py-2 text-sm text-amber-950">
          <strong>Chưa kết nối Google Drive của trường:</strong> hướng dẫn thêm lúc này chỉ lưu trên máy này, giáo viên chưa xem được. Hãy kết nối ở mục Dữ liệu rồi thêm lại.
        </p>
      )}
      {loadError && <p role="alert" className="rounded-xl bg-amber-50 border border-amber-300 px-3 py-2 text-sm font-bold text-amber-950 flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {loadError}</p>}
      {msg && (
        <p role="status" className={`rounded-xl border px-3 py-2 text-sm font-bold flex items-center gap-2 ${msg.type === 'ok' ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
          {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />} {msg.text}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        <div className="lg:col-span-2 space-y-3">
          {canEdit && formOpen && (
            <form id="guide-form" onSubmit={submit} className="rounded-2xl border-2 border-indigo-300 bg-white p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-black text-slate-900 uppercase">{editing ? 'Cập nhật hướng dẫn' : 'Thêm hướng dẫn'}</h3>
                <button type="button" onClick={closeForm} className={`${iconBtn} border-slate-300 text-slate-700 hover:bg-slate-50`} aria-label="Đóng"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-slate-700">Loại hướng dẫn</span>
                  <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as GuideKind, file: null })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800">
                    {(Object.keys(GUIDE_KIND_META) as GuideKind[]).map(k => <option key={k} value={k}>{GUIDE_KIND_META[k].label}</option>)}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-slate-700">Tên hiển thị</span>
                  <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value.slice(0, 120) })} placeholder="Ví dụ: Hướng dẫn điểm danh học sinh"
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm text-slate-800" />
                </label>
              </div>
              {draft.kind === 'pdf' ? (
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-700">Tệp PDF (tối đa {GUIDE_PDF_MAX_MB} MB)</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className={btnLight}>
                      <Upload className="w-4 h-4" /> {draft.file || items.find(i => i.id === draft.id)?.pdf ? 'Chọn tệp khác' : 'Chọn tệp PDF'}
                      <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setDraft({ ...draft, file: e.target.files?.[0] || null })} />
                    </label>
                    <span className="text-sm text-slate-700 break-all">
                      {draft.file ? `${draft.file.name} • ${(draft.file.size / 1048576).toFixed(2)} MB` : (items.find(i => i.id === draft.id)?.pdf?.fileName || 'Chưa chọn tệp')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">Tệp lưu trong thư mục Google Drive của trường; giáo viên bấm Tải về để lấy. Tệp lớn hơn nên đưa lên Google Drive rồi dùng loại "Tệp hướng dẫn (link)".</p>
                </div>
              ) : (
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-slate-700">Đường link — {GUIDE_KIND_META[draft.kind].hint}</span>
                  <input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://…" inputMode="url"
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-mono text-slate-800" />
                </label>
              )}
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-700">Ghi chú (không bắt buộc)</span>
                <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value.slice(0, 200) })} placeholder="Ví dụ: Dành cho giáo viên chủ nhiệm"
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm text-slate-800" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={Boolean(busy)} className="no-hover-fx h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black inline-flex items-center gap-2 cursor-pointer disabled:opacity-60">
                  {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {busy === 'save' ? 'Đang lưu…' : editing ? 'Cập nhật' : 'Lưu'}
                </button>
                <button type="button" onClick={closeForm} disabled={Boolean(busy)} className={btnLight}>Hủy</button>
                {editing && (
                  <button type="button" onClick={() => { const it = items.find(i => i.id === draft.id); if (it) remove(it); }} disabled={Boolean(busy)}
                    className="no-hover-fx h-10 px-3.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60">
                    <Trash2 className="w-4 h-4" /> Xóa hướng dẫn này
                  </button>
                )}
              </div>
            </form>
          )}

          <Section title="Video và link hướng dẫn" hint="Bấm vào tên hoặc nút Mở để xem ở thẻ mới; bấm Mã QR để quét bằng điện thoại."
            list={linkItems} addKind="video" addLabel="Thêm link / video"
            empty={loading ? 'Đang tải danh mục hướng dẫn…' : canEdit ? 'Chưa có link hướng dẫn. Bấm "Thêm link / video" để thêm.' : 'Nhà trường chưa đưa link hướng dẫn nào.'} />
          <Section title="Tệp hướng dẫn" hint="Tệp PDF tải về máy, hoặc link tới tệp hướng dẫn."
            list={fileItems} addKind="pdf" addLabel="Thêm tệp / PDF"
            empty={loading ? 'Đang tải…' : canEdit ? 'Chưa có tệp hướng dẫn. Bấm "Thêm tệp / PDF" để tải tệp PDF lên hoặc dán link tệp.' : 'Nhà trường chưa đưa tệp hướng dẫn nào.'} />
        </div>

        {/* Một khung: Tác giả & hỗ trợ ở trên, Bản quyền & đăng ký ở dưới */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
          <div className="space-y-3">
          <h3 className="text-sm font-black text-slate-900 uppercase">Tác giả & hỗ trợ</h3>
          <div>
            <p className="text-xs font-bold text-slate-600">Tác giả phần mềm</p>
            <p className="text-base font-black text-indigo-900">{APP_AUTHOR_INFO.name}</p>
            <p className="text-sm text-slate-700">{APP_AUTHOR_INFO.schoolName}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-600">Liên hệ hỗ trợ</p>
            <a href={APP_AUTHOR_INFO.zaloUrl} target="_blank" rel="noopener noreferrer" className="no-hover-fx w-full h-10 px-3 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-sm font-black inline-flex items-center justify-center gap-2">
              <MessageCircle className="w-4 h-4" /> Zalo {APP_AUTHOR_INFO.zalo}
            </a>
            <a href={`tel:${APP_AUTHOR_INFO.zalo.replace(/\D/g, '')}`} className={`${btnLight} w-full h-10`}>
              <Phone className="w-4 h-4 text-emerald-700" /> Gọi {APP_AUTHOR_INFO.zalo}
            </a>
            <a href={APP_AUTHOR_INFO.facebook} target="_blank" rel="noopener noreferrer" className={`${btnLight} w-full h-10`}>
              <Globe className="w-4 h-4 text-indigo-700" /> Facebook tác giả
            </a>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-1 shrink-0"><QrSvg matrix={buildQrMatrix(APP_AUTHOR_INFO.zaloUrl)} size={104} title="Mã QR Zalo hỗ trợ" /></div>
            <p className="text-xs text-slate-700">Quét mã bằng Zalo để nhắn tin hỗ trợ trực tiếp với tác giả.</p>
          </div>
          {!canEdit && <p className="text-xs text-slate-600">Cần thêm tài liệu hướng dẫn? Hãy báo quản trị nhà trường để đưa lên mục này.</p>}
          </div>
          <DesktopVersionPanel />
          {/* Link tải bộ cài cho máy tính: mọi người thấy nút tải; Quản trị cao nhất / Quản trị nhà trường đặt link */}
          <InstallerLinkPanel currentUser={currentUser} />
          <div className="space-y-2 pt-4 border-t border-slate-200">
            <h3 className="text-sm font-black text-slate-900 uppercase">Bản quyền & đăng ký</h3>
            <button type="button" onClick={() => setIsCdKeyModalOpen(true)}
              className={`no-hover-fx w-full px-3 py-2.5 rounded-xl border text-left flex items-center gap-2.5 cursor-pointer ${isCdKeyActivated ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100' : 'border-amber-300 bg-amber-50 hover:bg-amber-100'}`}>
              <KeyRound className={`w-5 h-5 shrink-0 ${isCdKeyActivated ? 'text-emerald-700' : 'text-amber-800'}`} />
              <span className="min-w-0">
                <span className="block text-sm font-black text-slate-900">{isCdKeyActivated ? 'Bản quyền PRO' : 'Kích hoạt CDKEY'}</span>
                <span className="block text-xs text-slate-700">{isCdKeyActivated ? 'Đã kích hoạt — xem thông tin bản quyền' : 'Nhập CDKEY để mở đầy đủ tính năng'}</span>
              </span>
            </button>
            <button type="button" onClick={() => setIsRegistrationModalOpen(true)}
              className="no-hover-fx w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-left flex items-center gap-2.5 cursor-pointer">
              <Sparkles className="w-5 h-5 shrink-0 text-indigo-700" />
              <span className="min-w-0">
                <span className="block text-sm font-black text-slate-900">Đăng ký sử dụng</span>
                <span className="block text-xs text-slate-700">Gửi đơn đăng ký dùng phần mềm, bản quyền cho trường</span>
              </span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default UserGuideView;
