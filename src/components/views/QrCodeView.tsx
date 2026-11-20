import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clipboard, Copy, Download, Eraser, ExternalLink, ImagePlus, Link2, Pencil, Plus, QrCode, Save, Search, Trash2, Upload, X } from 'lucide-react';
import { useClassroom } from '../../context/ClassroomContext';
import { buildQrMatrix } from './staff/StaffCheckInQr';
import { isViewOnly } from '../../utils/viewOnlyMode';
import { LOGO_POSITIONS, LOGO_SIZES, LogoPos, loadLogo, logoFromBlob, paintQr, renderQrPng, renderQrSvg } from '../../utils/qrRender';
import type { SavedQrCode } from '../../types';

/**
 * Tạo mã QR từ đường link (thư mục Drive, tệp tài liệu, trang web…).
 * - Mã được tạo ngay trên máy (thư viện qrcode-generator): link của thầy cô không gửi ra dịch vụ ngoài.
 * - Có thể gắn logo (chọn ảnh hoặc dán ảnh) ở trung tâm hoặc 4 góc.
 * - Lưu vào tài khoản (cùng chỗ với dữ liệu lớp, đồng bộ theo tài khoản) để sau này mở lại, sửa link, tải lại.
 * - Tải ảnh PNG / SVG về máy.
 * Dùng được ở mọi vai trò đăng nhập.
 */
type Level = 'M' | 'Q' | 'H';
const LEVELS: { id: Level; label: string; hint: string }[] = [
  { id: 'M', label: 'Thường', hint: 'Gọn, dễ quét — dùng cho đa số link' },
  { id: 'Q', label: 'Cao', hint: 'Chịu được vết bẩn, in nhỏ' },
  { id: 'H', label: 'Rất cao', hint: 'Dùng khi in lên bề mặt dễ hỏng' },
];
const PNG_SIZES = [512, 1024, 2048];
const MAX_LEN = 1000;

/** Add https:// when the text looks like a web address typed without it */
export function normalizeQrText(raw: string): { text: string; kind: 'link' | 'text' | 'empty' } {
  const t = String(raw || '').trim();
  if (!t) return { text: '', kind: 'empty' };
  // Web addresses with accented characters are percent-encoded so every scanner opens the same page
  const encodeWeb = (u: string) => { if (!/[^\u0000-\u007f]/.test(u)) return u; try { return new URL(u).href; } catch (_) { return u; } };
  if (/^(https?:\/\/|mailto:|tel:|sms:|zalo:|ftp:\/\/)/i.test(t)) return { text: /^https?:/i.test(t) ? encodeWeb(t) : t, kind: 'link' };
  if (!/\s/.test(t) && /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(t)) return { text: encodeWeb(`https://${t}`), kind: 'link' };
  return { text: t, kind: 'text' };
}

const slug = (s: string) =>
  (s || 'ma-qr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ma-qr';

const fmtTime = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const safeMatrix = (text: string, level: Level): boolean[][] | null => {
  if (!text) return null;
  try { return buildQrMatrix(text, level); } catch (_) { return null; }
};

/** A centered logo needs the strongest error correction so the code still scans */
const effLevel = (level: Level, logo?: string, pos?: LogoPos): Level => (logo && (pos || 'center') === 'center' ? 'H' : level);

/** Canvas drawing of one code (with its logo) */
const QrCanvas: React.FC<{ matrix: boolean[][]; size: number; logo?: string; pos?: LogoPos; logoSize?: 1 | 2 | 3; title?: string }> = ({ matrix, size, logo, pos, logoSize, title }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    const draw = async () => {
      const cv = ref.current;
      if (!cv) return;
      let img: HTMLImageElement | null = null;
      if (logo) { try { img = await loadLogo(logo); } catch (_) { img = null; } }
      if (!alive) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      paintQr(ctx, matrix, cv.width, 0, 0, { logoImg: img, pos, size: logoSize });
    };
    draw();
    return () => { alive = false; };
  }, [matrix, size, logo, pos, logoSize]);
  return <canvas ref={ref} role="img" aria-label={title || 'Mã QR'} style={{ width: size, height: size }} />;
};

export const QrCodeView: React.FC = () => {
  const { qrCodes, addQrCode, updateQrCode, deleteQrCode } = useClassroom();
  const readOnly = isViewOnly();

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [level, setLevel] = useState<Level>('M');
  const [showCaption, setShowCaption] = useState(true);
  const [pngSize, setPngSize] = useState(1024);
  const [logo, setLogo] = useState<string>('');
  const [logoPos, setLogoPos] = useState<LogoPos>('center');
  const [logoSize, setLogoSize] = useState<1 | 2 | 3>(2);
  const [dropping, setDropping] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const say = (text: string, tone: 'ok' | 'warn' = 'ok') => {
    setNotice({ tone, text });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4500);
  };

  const norm = useMemo(() => normalizeQrText(url), [url]);
  const tooLong = norm.text.length > MAX_LEN;
  const level2 = effLevel(level, logo, logoPos);
  const matrix = useMemo(() => (tooLong ? null : safeMatrix(norm.text, level2)), [norm.text, level2, tooLong]);
  const editing = editingId ? qrCodes.find(q => q.id === editingId) || null : null;
  const dirty = editing
    ? (editing.url !== norm.text || editing.title !== title.trim() || (editing.level || 'M') !== level || (editing.showCaption !== false) !== showCaption
      || (editing.logo || '') !== logo || (logo ? ((editing.logoPos || 'center') !== logoPos || (editing.logoSize || 2) !== logoSize) : false))
    : false;

  const reset = () => { setEditingId(null); setTitle(''); setUrl(''); setLevel('M'); setShowCaption(true); setLogo(''); setLogoPos('center'); setLogoSize(2); };

  const loadForEdit = (q: SavedQrCode) => {
    setEditingId(q.id); setTitle(q.title); setUrl(q.url); setLevel(q.level || 'M'); setShowCaption(q.showCaption !== false);
    setLogo(q.logo || ''); setLogoPos(q.logoPos || 'center'); setLogoSize(q.logoSize || 2);
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  const clearLink = () => { setUrl(''); urlRef.current?.focus(); };

  // ---- logo: choose a file, drop one, or paste one (Ctrl+V anywhere on this screen) ----
  const takeLogo = async (blob: Blob | null | undefined) => {
    if (!blob) return;
    try { setLogo(await logoFromBlob(blob)); say('Đã gắn logo. Chọn vị trí và cỡ logo bên dưới, rồi quét thử bằng điện thoại trước khi in.'); }
    catch (e: any) { say(e?.message === 'too-big' ? 'Ảnh logo quá lớn (trên 8 MB). Hãy chọn ảnh nhỏ hơn.' : 'Không đọc được ảnh này. Hãy chọn tệp PNG, JPG hoặc SVG.', 'warn'); }
  };
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; takeLogo(f); };
  const pasteFromClipboard = async () => {
    try {
      const items = await (navigator.clipboard as any).read();
      for (const it of items) {
        const type = (it.types as string[]).find(t => t.startsWith('image/'));
        if (type) { await takeLogo(await it.getType(type)); return; }
      }
      say('Trong bộ nhớ tạm chưa có ảnh. Hãy sao chép một ảnh (Ctrl+C) rồi bấm lại.', 'warn');
    } catch (_) { say('Trình duyệt chưa cho đọc ảnh đã sao chép. Hãy bấm vào màn hình này rồi nhấn Ctrl+V.', 'warn'); }
  };
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter(f => f.type.startsWith('image/'));
      if (files.length === 0) return;                       // plain text paste goes to the input as usual
      e.preventDefault();
      takeLogo(files[0]);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  const handleSave = () => {
    if (readOnly) return say('Đang ở chế độ chỉ xem nên không lưu được vào tài khoản.', 'warn');
    if (!norm.text) return say('Hãy dán đường link trước khi lưu.', 'warn');
    if (!matrix) return say('Link quá dài để tạo mã QR. Hãy rút gọn link rồi thử lại.', 'warn');
    const name = title.trim() || norm.text.replace(/^https?:\/\//i, '').slice(0, 60);
    const data = { title: name, url: norm.text, level, showCaption, logo: logo || undefined, logoPos: logo ? logoPos : undefined, logoSize: logo ? logoSize : undefined };
    if (editing) {
      updateQrCode(editing.id, data);
      say(norm.text !== editing.url ? 'Đã cập nhật link. Mã QR đã in hoặc đã gửi trước đó vẫn trỏ về link cũ — hãy tải và gửi ảnh mới.' : 'Đã cập nhật mã QR.');
      setTitle(name);
    } else {
      const id = addQrCode(data);
      setEditingId(id); setTitle(name);
      say('Đã lưu mã QR vào tài khoản. Thầy cô có thể mở lại và sửa link bất cứ lúc nào.');
    }
  };

  const download = async (m: boolean[][] | null, name: string, caption: string, o: { logo?: string; pos?: LogoPos; size?: 1 | 2 | 3 }, size = pngSize) => {
    if (!m) return say('Chưa có mã QR để tải.', 'warn');
    const blob = await renderQrPng(m, size, caption, o);
    if (!blob) return say('Trình duyệt không tạo được ảnh. Hãy thử tải SVG.', 'warn');
    saveBlob(blob, `${slug(name)}.png`);
  };
  const downloadSvg = (m: boolean[][] | null, name: string, o: { logo?: string; pos?: LogoPos; size?: 1 | 2 | 3 }) => {
    if (!m) return say('Chưa có mã QR để tải.', 'warn');
    saveBlob(new Blob([renderQrSvg(m, o)], { type: 'image/svg+xml' }), `${slug(name)}.svg`);
  };
  const copyText = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(c => (c === key ? null : c)), 1800); }
    catch (_) { say('Không sao chép được. Hãy bôi đen link rồi nhấn Ctrl+C.', 'warn'); }
  };

  const list = useMemo(() => {
    const k = filter.trim().toLowerCase();
    return qrCodes.slice().sort((a, b) => b.updatedAt - a.updatedAt)
      .filter(q => !k || q.title.toLowerCase().includes(k) || q.url.toLowerCase().includes(k));
  }, [qrCodes, filter]);

  const inputCls = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const btnPrimary = 'no-hover-fx inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-black disabled:opacity-50 disabled:cursor-not-allowed';
  const btnGhost = 'no-hover-fx inline-flex items-center justify-center gap-1.5 h-11 px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed';
  const chip = (on: boolean) => `no-hover-fx h-10 px-3 rounded-xl text-sm font-bold border ${on ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`;
  const logoOpts = { logo: logo || undefined, pos: logoPos, size: logoSize };
  const lockedH = Boolean(logo) && logoPos === 'center';

  return (
    <div className="space-y-4 pb-6">
      <div className="rounded-3xl bg-white border border-slate-200 shadow-sm px-4 sm:px-5 py-4">
        <h2 className="normal-case text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
          <QrCode className="w-6 h-6 text-blue-600 shrink-0" /> <span>Tạo mã QR từ link</span>
        </h2>
        <p className="text-sm text-slate-700 mt-1">
          Dán link thư mục, tệp tài liệu hoặc trang web để tạo mã QR cho học sinh và phụ huynh quét. Mã được tạo ngay trên máy, lưu theo tài khoản để sau này sửa link và tải lại.
        </p>
      </div>

      {notice && (
        <div role="status" className={`rounded-2xl border px-4 py-2.5 text-sm font-bold ${notice.tone === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
        {/* Editor */}
        <section className="xl:col-span-2 rounded-3xl bg-white border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4" aria-label="Tạo và sửa mã QR">
          <div className="flex items-center justify-between gap-2">
            <h3 className="normal-case text-base font-black text-slate-900">{editing ? 'Đang sửa mã QR' : 'Mã QR mới'}</h3>
            {editing && <button type="button" onClick={reset} className={btnGhost + ' !h-10 !px-3'}><X className="w-4 h-4" /> Bỏ sửa</button>}
          </div>

          <label className="block">
            <span className="text-sm font-bold text-slate-800">Tên gợi nhớ <span className="font-medium text-slate-600">(không bắt buộc)</span></span>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} className={inputCls + ' mt-1'} placeholder="Ví dụ: Thư mục bài giảng Toán 3" />
          </label>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="qr-link" className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><Link2 className="w-4 h-4 text-blue-600" /> Đường link</label>
              <button type="button" onClick={clearLink} disabled={!url} className="no-hover-fx inline-flex items-center gap-1 h-10 px-3 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-800 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed">
                <Eraser className="w-4 h-4" /> Xóa link
              </button>
            </div>
            <textarea id="qr-link" ref={urlRef} value={url} onChange={e => setUrl(e.target.value)} rows={3} className={inputCls + ' mt-1 resize-y'} placeholder="Dán link Google Drive, YouTube, Zalo, trang web…" />
            <span className="text-xs text-slate-600 block mt-1 break-all">
              {norm.kind === 'text' ? 'Nội dung này không phải link — mã QR sẽ hiện đúng dòng chữ đó khi quét.' : norm.kind === 'link' && norm.text !== url.trim() ? `Đã chuẩn hóa → ${norm.text}` : `${norm.text.length}/${MAX_LEN} ký tự`}
            </span>
          </div>
          {tooLong && <p className="text-sm font-bold text-amber-900 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2">Link dài hơn {MAX_LEN} ký tự, mã QR sẽ quá dày để quét. Hãy dùng link rút gọn.</p>}

          {/* Logo */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
            <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><ImagePlus className="w-4 h-4 text-blue-600" /> Logo trên mã QR <span className="font-medium text-slate-600">(không bắt buộc)</span></span>
            <div
              onDragOver={e => { e.preventDefault(); setDropping(true); }}
              onDragLeave={() => setDropping(false)}
              onDrop={e => { e.preventDefault(); setDropping(false); takeLogo(e.dataTransfer.files?.[0]); }}
              className={`rounded-xl border-2 border-dashed p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${dropping ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white'}`}>
              <div className="w-16 h-16 shrink-0 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden mx-auto sm:mx-0">
                {logo ? <img src={logo} alt="Logo đã chọn" className="max-w-full max-h-full object-contain" /> : <ImagePlus className="w-7 h-7 text-slate-400" aria-hidden="true" />}
              </div>
              <div className="flex flex-wrap gap-2 flex-1">
                <button type="button" onClick={() => fileRef.current?.click()} className={btnGhost}><Upload className="w-4 h-4" /> Chọn ảnh logo</button>
                <button type="button" onClick={pasteFromClipboard} className={btnGhost}><Clipboard className="w-4 h-4" /> Dán ảnh</button>
                {logo && <button type="button" onClick={() => setLogo('')} className="no-hover-fx inline-flex items-center justify-center gap-1.5 h-11 px-3.5 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-800 text-sm font-bold"><Trash2 className="w-4 h-4" /> Bỏ logo</button>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" aria-label="Chọn ảnh logo" />
            </div>
            <p className="text-xs text-slate-600">Chọn tệp, kéo thả ảnh vào khung này, hoặc sao chép ảnh rồi nhấn Ctrl+V.</p>

            {logo && (
              <>
                <div>
                  <span className="text-sm font-bold text-slate-800">Vị trí logo</span>
                  <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Vị trí logo">
                    {LOGO_POSITIONS.map(p => (
                      <button key={p.id} type="button" role="radio" aria-checked={logoPos === p.id} onClick={() => setLogoPos(p.id)} className={chip(logoPos === p.id)}>{p.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-sm font-bold text-slate-800">Cỡ logo</span>
                  <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cỡ logo">
                    {LOGO_SIZES.map(s => (
                      <button key={s.id} type="button" role="radio" aria-checked={logoSize === s.id} onClick={() => setLogoSize(s.id)} className={chip(logoSize === s.id)}>{s.label}</button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-700">
                  {lockedH
                    ? 'Logo đè lên giữa mã nên mã tự chuyển sang độ chắc “Rất cao”. Nên quét thử bằng điện thoại trước khi in.'
                    : 'Logo nằm ở góc ngoài viền mã, không che dữ liệu nên vẫn quét như bình thường.'}
                </p>
              </>
            )}
          </div>

          <div>
            <span className="text-sm font-bold text-slate-800">Độ chắc của mã</span>
            <div className="mt-1 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Độ chắc của mã">
              {LEVELS.map(l => (
                <button key={l.id} type="button" role="radio" aria-checked={level2 === l.id} disabled={lockedH && l.id !== 'H'} title={l.hint} onClick={() => setLevel(l.id)}
                  className={chip(level2 === l.id) + ' disabled:opacity-50 disabled:cursor-not-allowed'}>{l.label}</button>
              ))}
            </div>
            <span className="text-xs text-slate-600 block mt-1">{LEVELS.find(l => l.id === level2)?.hint}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-bold text-slate-800">Cỡ ảnh tải về</span>
              <select value={pngSize} onChange={e => setPngSize(Number(e.target.value))} className={inputCls + ' mt-1'}>
                {PNG_SIZES.map(s => <option key={s} value={s}>{s} × {s} điểm ảnh</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-800 sm:mt-6 cursor-pointer">
              <input type="checkbox" checked={showCaption} onChange={e => setShowCaption(e.target.checked)} className="w-5 h-5 accent-blue-600" />
              In tên dưới mã trong ảnh
            </label>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={handleSave} disabled={!matrix || readOnly || (!!editing && !dirty)} className={btnPrimary}>
              <Save className="w-4 h-4" /> {editing ? 'Cập nhật mã QR' : 'Lưu vào tài khoản'}
            </button>
            {editing && <button type="button" onClick={reset} className={btnGhost}><Plus className="w-4 h-4" /> Tạo mã mới</button>}
          </div>
          {readOnly && <p className="text-xs font-bold text-amber-900">Chế độ chỉ xem: vẫn tạo và tải mã được, nhưng không lưu vào tài khoản.</p>}
        </section>

        {/* Preview */}
        <section className="xl:col-span-3 rounded-3xl bg-white border border-slate-200 shadow-sm p-4 sm:p-5" aria-label="Xem trước mã QR">
          <h3 className="normal-case text-base font-black text-slate-900 mb-3">Xem trước</h3>
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            <div className="mx-auto sm:mx-0 shrink-0 rounded-2xl border border-slate-200 bg-white p-2 w-[236px] h-[236px] flex items-center justify-center">
              {matrix ? <QrCanvas matrix={matrix} size={220} logo={logo || undefined} pos={logoPos} logoSize={logoSize} title={title || 'Mã QR'} /> : (
                <p className="text-sm text-slate-600 text-center px-4">Dán link ở khung bên trái, mã QR sẽ hiện ngay tại đây.</p>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-black text-slate-900 break-words">{title.trim() || (matrix ? 'Chưa đặt tên' : '')}</p>
              <p className="text-sm text-slate-700 break-all line-clamp-3">{norm.text}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" disabled={!matrix} onClick={() => download(matrix, title || norm.text, showCaption ? (title.trim() || '') : '', logoOpts)} className={btnPrimary}><Download className="w-4 h-4" /> Tải ảnh PNG</button>
                <button type="button" disabled={!matrix} onClick={() => downloadSvg(matrix, title || norm.text, logoOpts)} className={btnGhost}><Download className="w-4 h-4" /> Tải SVG</button>
                <button type="button" disabled={!norm.text} onClick={() => copyText('cur', norm.text)} className={btnGhost}>{copied === 'cur' ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />} {copied === 'cur' ? 'Đã chép' : 'Chép link'}</button>
                {norm.kind === 'link' && /^https?:\/\//i.test(norm.text) && (
                  <a href={norm.text} target="_blank" rel="noreferrer" className={btnGhost}><ExternalLink className="w-4 h-4" /> Mở thử link</a>
                )}
              </div>
              <p className="text-xs text-slate-600">Mã QR mã hóa trực tiếp link nên chỉ cần quét bằng camera điện thoại hoặc Zalo. Đổi link thì phải gửi ảnh mã mới.</p>
            </div>
          </div>
        </section>
      </div>

      {/* Saved list */}
      <section className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden" aria-label="Mã QR đã lưu">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="normal-case text-base font-black text-slate-900">Mã QR đã lưu trong tài khoản <span className="text-blue-700">({qrCodes.length})</span></h3>
          <label className="relative sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={filter} onChange={e => setFilter(e.target.value)} className={inputCls + ' !pl-9 !py-2'} placeholder="Tìm theo tên hoặc link" aria-label="Tìm mã QR" />
          </label>
        </div>
        {qrCodes.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-700 text-center">Chưa có mã QR nào được lưu. Tạo mã ở trên rồi bấm “Lưu vào tài khoản”.</p>
        ) : list.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-700 text-center">Không có mã nào khớp “{filter}”.</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 p-3 sm:p-4">
            {list.map(q => {
              const m = safeMatrix(q.url, effLevel(q.level || 'M', q.logo, q.logoPos));
              const isCur = editingId === q.id;
              const o = { logo: q.logo, pos: q.logoPos, size: q.logoSize };
              return (
                <li key={q.id} className={`rounded-2xl border p-3 flex gap-3 ${isCur ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 bg-white'}`}>
                  <div className="shrink-0 w-[84px] h-[84px] rounded-xl border border-slate-200 bg-white p-0.5">
                    {m ? <QrCanvas matrix={m} size={78} logo={q.logo} pos={q.logoPos} logoSize={q.logoSize} title={q.title} /> : <span className="text-xs text-slate-500 p-1 block">Lỗi mã</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900 truncate" title={q.title}>{q.title}</p>
                    <p className="text-xs text-slate-700 truncate" title={q.url}>{q.url}</p>
                    <p className="text-xs text-slate-600 mt-0.5">Cập nhật {fmtTime(q.updatedAt)}{q.logo ? ' • có logo' : ''}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <button type="button" onClick={() => loadForEdit(q)} className="no-hover-fx inline-flex items-center gap-1 h-10 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-black"><Pencil className="w-3.5 h-3.5" /> Sửa link</button>
                      <button type="button" onClick={() => download(m, q.title, q.showCaption === false ? '' : q.title, o)} className="no-hover-fx inline-flex items-center gap-1 h-10 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold"><Download className="w-3.5 h-3.5" /> PNG</button>
                      <button type="button" onClick={() => copyText(q.id, q.url)} className="no-hover-fx inline-flex items-center gap-1 h-10 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold">{copied === q.id ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />} {copied === q.id ? 'Đã chép' : 'Chép link'}</button>
                      {confirmDel === q.id ? (
                        <>
                          <button type="button" disabled={readOnly} onClick={() => { deleteQrCode(q.id); setConfirmDel(null); if (editingId === q.id) reset(); say('Đã xóa mã QR khỏi tài khoản.'); }} className="no-hover-fx inline-flex items-center gap-1 h-10 px-2.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-black">Xóa hẳn</button>
                          <button type="button" onClick={() => setConfirmDel(null)} className="no-hover-fx inline-flex items-center h-10 px-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-bold">Hủy</button>
                        </>
                      ) : (
                        <button type="button" disabled={readOnly} onClick={() => setConfirmDel(q.id)} className="no-hover-fx inline-flex items-center gap-1 h-10 px-2.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-800 text-xs font-bold disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /> Xóa</button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default QrCodeView;
