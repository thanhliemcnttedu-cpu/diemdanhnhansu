import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, ClipboardPaste, Link, Trash2, Mic, Square, Upload, Music, Loader2 } from 'lucide-react';
import { shrinkImageDataUrl } from '../../../utils/driveCompact';

/**
 * Ô ẢNH / ÂM THANH dùng trong trình soạn câu hỏi (11/2026).
 * Ảnh: dán từ Clipboard (Ctrl+V khi ô đang chọn, hoặc nút "Dán ảnh"), kéo thả, chọn tệp, hoặc dán link ảnh.
 * Ảnh được thu nhỏ trước khi lưu (cạnh ≤ maxSide) để kho câu hỏi gọn.
 * Âm thanh: chọn tệp (mp3, m4a, wav, ogg…) hoặc ghi âm trực tiếp bằng micro.
 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

export const readFileAsDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result || ''));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

/** Ảnh (File/Blob) → dataURL đã thu nhỏ */
export async function imageFileToDataUrl(file: Blob, maxSide: number): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Ảnh lớn hơn 8 MB. Hãy chọn ảnh nhỏ hơn.');
  const url = await readFileAsDataUrl(file);
  // GIF động giữ nguyên (thu nhỏ sẽ mất chuyển động)
  if (/^data:image\/gif/i.test(url)) return url;
  return shrinkImageDataUrl(url, maxSide, 0.85);
}

/** Lấy ảnh đầu tiên trong dữ liệu dán (Ctrl+V) */
export function imageFromClipboardEvent(e: React.ClipboardEvent | ClipboardEvent): File | null {
  const items = (e as ClipboardEvent).clipboardData?.items || [];
  for (const it of Array.from(items)) {
    if (it.kind === 'file' && it.type.startsWith('image/')) return it.getAsFile();
  }
  return null;
}

interface ImageSlotProps {
  value?: string;
  onChange: (v: string | undefined) => void;
  label: string;
  maxSide?: number;
  compact?: boolean;          // ô nhỏ (ảnh đáp án)
  slotKey: string;            // để trình soạn biết ô nào đang được chọn khi dán ảnh
  onActivate?: (key: string) => void;
  active?: boolean;
  onError?: (msg: string) => void;
}

export const ImageSlot: React.FC<ImageSlotProps> = ({ value, onChange, label, maxSide = 1280, compact, slotKey, onActivate, active, onError }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [url, setUrl] = useState('');

  const take = async (file: Blob | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { onError?.('Tệp này không phải ảnh.'); return; }
    setBusy(true);
    try { onChange(await imageFileToDataUrl(file, maxSide)); } catch (e: any) { onError?.(e?.message || 'Không đọc được ảnh.'); } finally { setBusy(false); }
  };
  const pasteButton = async () => {
    onActivate?.(slotKey);
    try {
      const items = await (navigator.clipboard as any).read();
      for (const it of items) {
        const t = it.types.find((x: string) => x.startsWith('image/'));
        if (t) { await take(await it.getType(t)); return; }
      }
      onError?.('Bộ nhớ tạm (Clipboard) chưa có ảnh. Hãy sao chép ảnh (chuột phải → Sao chép hình ảnh, hoặc chụp màn hình Win + Shift + S) rồi bấm lại.');
    } catch (_) {
      onError?.('Trình duyệt chưa cho đọc Clipboard. Hãy bấm vào ô ảnh rồi nhấn Ctrl + V.');
    }
  };

  const h = compact ? 'min-h-[84px]' : 'min-h-[132px]';
  return (
    <div
      data-media-slot={slotKey}
      tabIndex={0}
      role="group"
      aria-label={label}
      onFocus={() => onActivate?.(slotKey)}
      onClick={() => onActivate?.(slotKey)}
      onPaste={(e) => { const f = imageFromClipboardEvent(e); if (f) { e.preventDefault(); e.stopPropagation(); take(f); } }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onActivate?.(slotKey); take(e.dataTransfer.files?.[0]); }}
      className={`relative rounded-2xl border-2 border-dashed transition-colors outline-none ${h} ${
        drag ? 'border-indigo-500 bg-indigo-50' : active ? 'border-indigo-400 bg-indigo-50/40' : 'border-slate-300 bg-slate-50 hover:border-indigo-300'
      } focus-visible:ring-2 focus-visible:ring-indigo-400`}
    >
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; take(f); }} />
      {busy ? (
        <div className={`flex items-center justify-center gap-2 text-sm text-slate-600 ${h}`}><Loader2 className="w-4 h-4 animate-spin" /> Đang xử lý ảnh…</div>
      ) : value ? (
        <div className="p-2 flex items-center gap-3">
          <img src={value} alt={label} className={`${compact ? 'h-16 w-24' : 'h-28 w-40'} object-contain rounded-xl bg-white border border-slate-200 shrink-0`} />
          <div className="flex flex-col gap-1.5 min-w-0">
            <span className="text-xs font-bold text-slate-600 truncate">{label}</span>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} className="no-hover-fx h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 inline-flex items-center gap-1"><ImagePlus className="w-3.5 h-3.5" /> Đổi ảnh</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onChange(undefined); }} className="no-hover-fx h-8 px-2.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-xs font-bold text-rose-700 inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Bỏ ảnh</button>
            </div>
          </div>
        </div>
      ) : (
        <div className={`flex flex-col items-center justify-center gap-1.5 p-2 text-center ${h}`}>
          {!compact && <ImagePlus className="w-6 h-6 text-indigo-500" />}
          <div className="text-xs text-slate-600"><strong className="text-slate-800">{label}</strong>{!compact && <> — bấm vào ô rồi <kbd className="px-1 rounded border border-slate-300 bg-white font-sans">Ctrl+V</kbd> để dán, hoặc kéo thả ảnh</>}</div>
          <div className="flex flex-wrap justify-center gap-1.5">
            <button type="button" onClick={(e) => { e.stopPropagation(); pasteButton(); }} className="no-hover-fx h-8 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1"><ClipboardPaste className="w-3.5 h-3.5" /> Dán ảnh</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} className="no-hover-fx h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 inline-flex items-center gap-1"><Upload className="w-3.5 h-3.5" /> Chọn ảnh</button>
            {!compact && (
              <button type="button" onClick={(e) => { e.stopPropagation(); setShowUrl(v => !v); }} className="no-hover-fx h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 inline-flex items-center gap-1"><Link className="w-3.5 h-3.5" /> Link ảnh</button>
            )}
          </div>
          {showUrl && (
            <div className="flex w-full max-w-md gap-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/anh.jpg" className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-slate-300 text-xs" aria-label="Link ảnh" />
              <button type="button" disabled={!/^https?:\/\//i.test(url.trim())} onClick={() => { onChange(url.trim()); setUrl(''); setShowUrl(false); }} className="no-hover-fx h-8 px-3 rounded-lg bg-slate-800 text-white text-xs font-bold disabled:opacity-40">Dùng</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface AudioSlotProps { value?: string; onChange: (v: string | undefined) => void; onError?: (msg: string) => void }

export const AudioSlot: React.FC<AudioSlotProps> = ({ value, onChange, onError }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    try { recRef.current?.stream.getTracks().forEach(t => t.stop()); } catch (_) { /* ignore */ }
  }, []);

  const takeFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|ogg|aac|webm)$/i.test(file.name)) { onError?.('Tệp này không phải âm thanh.'); return; }
    if (file.size > MAX_AUDIO_BYTES) { onError?.('Tệp âm thanh lớn hơn 3 MB. Hãy cắt ngắn (dưới ~2 phút) hoặc ghi âm trực tiếp.'); return; }
    try { onChange(await readFileAsDataUrl(file)); } catch (_) { onError?.('Không đọc được tệp âm thanh.'); }
  };
  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { onError?.('Trình duyệt không hỗ trợ ghi âm. Hãy chọn tệp âm thanh.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size > MAX_AUDIO_BYTES) { onError?.('Bản ghi quá dài (trên 3 MB). Hãy ghi ngắn hơn.'); return; }
        onChange(await readFileAsDataUrl(blob));
      };
      recRef.current = rec;
      rec.start();
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => setSeconds(s => {
        if (s + 1 >= 120) { try { rec.stop(); } catch (_) { /* ignore */ } }
        return s + 1;
      }), 1000);
    } catch (_) {
      onError?.('Không mở được micro. Hãy cho phép trình duyệt dùng micro (biểu tượng ổ khóa cạnh thanh địa chỉ).');
    }
  };
  const stop = () => { try { recRef.current?.stop(); } catch (_) { /* ignore */ } };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5 flex flex-wrap items-center gap-2">
      <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; takeFile(f); }} />
      <Music className="w-4 h-4 text-violet-600 shrink-0" />
      {value ? (
        <>
          <audio src={value} controls className="h-9 flex-1 min-w-[200px]" />
          <button type="button" onClick={() => onChange(undefined)} className="no-hover-fx h-8 px-2.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-xs font-bold text-rose-700 inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Bỏ âm thanh</button>
        </>
      ) : recording ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-700"><span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" /> Đang ghi âm… {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
          <button type="button" onClick={stop} className="no-hover-fx h-8 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1"><Square className="w-3.5 h-3.5 fill-white" /> Dừng</button>
        </>
      ) : (
        <>
          <span className="text-xs text-slate-600 mr-auto">Âm thanh cho câu hỏi (đọc đề, nghe – chọn, tiếng Anh…) — tối đa 2 phút</span>
          <button type="button" onClick={start} className="no-hover-fx h-8 px-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold inline-flex items-center gap-1"><Mic className="w-3.5 h-3.5" /> Ghi âm</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="no-hover-fx h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 inline-flex items-center gap-1"><Upload className="w-3.5 h-3.5" /> Chọn tệp</button>
        </>
      )}
    </div>
  );
};

/** Ô ảnh nhỏ gọn (bước sắp xếp, ô nối cột): Dán ảnh từ Clipboard / Chọn tệp; có ảnh thì hiện ảnh thu nhỏ + nút bỏ */
export const MiniImage: React.FC<{ value?: string; onChange: (v: string | undefined) => void; label: string; onError?: (m: string) => void; maxSide?: number }> = ({ value, onChange, label, onError, maxSide = 600 }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const take = async (file?: Blob | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { onError?.('Tệp này không phải ảnh.'); return; }
    setBusy(true);
    try { onChange(await imageFileToDataUrl(file, maxSide)); } catch (e: any) { onError?.(e?.message || 'Không đọc được ảnh.'); } finally { setBusy(false); }
  };
  const paste = async () => {
    try {
      const items = await (navigator.clipboard as any).read();
      for (const it of items) { const t = it.types.find((x: string) => x.startsWith('image/')); if (t) { await take(await it.getType(t)); return; } }
      onError?.('Clipboard chưa có ảnh. Sao chép ảnh rồi bấm lại (hoặc nhấn Ctrl+V trong ô chữ bên cạnh).');
    } catch (_) { onError?.('Trình duyệt chưa cho đọc Clipboard. Hãy bấm vào ô chữ bên cạnh rồi nhấn Ctrl+V.'); }
  };
  const btn = 'no-hover-fx w-9 h-9 rounded-lg border inline-flex items-center justify-center shrink-0';
  if (busy) return <span className={`${btn} border-slate-200 text-slate-500`}><Loader2 className="w-4 h-4 animate-spin" /></span>;
  if (value) return (
    <span className="relative shrink-0" title={label}>
      <img src={value} alt={label} className="w-10 h-10 rounded-lg object-cover border border-slate-300 bg-white" />
      <button type="button" onClick={() => onChange(undefined)} aria-label={`Bỏ ${label}`} title={`Bỏ ${label}`}
        className="no-hover-fx absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white inline-flex items-center justify-center shadow"><Trash2 className="w-3 h-3" /></button>
    </span>
  );
  return (
    <span className="flex items-center gap-1 shrink-0">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; take(f); }} />
      <button type="button" onClick={paste} title={`Dán ${label} từ Clipboard`} aria-label={`Dán ${label}`} className={`${btn} border-indigo-200 text-indigo-700 hover:bg-indigo-50`}><ClipboardPaste className="w-4 h-4" /></button>
      <button type="button" onClick={() => fileRef.current?.click()} title={`Chọn ${label} từ máy`} aria-label={`Chọn ${label}`} className={`${btn} border-slate-300 text-slate-700 hover:bg-slate-50`}><ImagePlus className="w-4 h-4" /></button>
    </span>
  );
};
