import React, { useEffect, useState } from 'react';
import { X, Copy, Check, ExternalLink, Phone, ScanLine } from 'lucide-react';
import { APP_AUTHOR_INFO } from '../../data/initialData';

/** Mở hộp mã QR Zalo của tác giả từ bất kỳ đâu: window.dispatchEvent(new Event(OPEN_ZALO_QR_EVENT)) */
export const OPEN_ZALO_QR_EVENT = 'lhhp:open-zalo-qr';

const AUTHOR_ZALO_DIGITS = APP_AUTHOR_INFO.zalo.replace(/\D/g, '');

/**
 * Hộp mã QR Zalo liên hệ tác giả.
 * Mọi liên kết tới zalo.me/<số tác giả> trong app (thanh bên, trang chủ, đăng nhập, dữ liệu…) được
 * tự động chặn và mở hộp này, để người dùng quét QR bằng điện thoại. Nút "Mở Zalo" vẫn mở trang Zalo.
 */
export const ZaloQrModal: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const openModal = () => { setCopied(false); setOpen(true); };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.dataset.zaloDirect === '1') return;
      const href = a.getAttribute('href') || '';
      if (/zalo\.me\//i.test(href) && href.replace(/\D/g, '').includes(AUTHOR_ZALO_DIGITS)) {
        e.preventDefault();
        e.stopPropagation();
        openModal();
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener(OPEN_ZALO_QR_EVENT, openModal);
    document.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(OPEN_ZALO_QR_EVENT, openModal);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!open) return null;

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(AUTHOR_ZALO_DIGITS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked: ignore */ }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-sky-900/30 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Mã QR Zalo liên hệ tác giả"
    >
      <div
        className="relative w-full max-w-[340px] bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-sky-600 px-5 pt-4 pb-10 text-white">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider">
            <ScanLine className="w-4 h-4" /> Liên hệ tác giả qua Zalo
          </div>
          <p className="text-[11px] text-white/90 mt-1 leading-snug">Mở Zalo trên điện thoại → biểu tượng quét mã → hướng camera vào mã bên dưới.</p>
        </div>

        {/* QR card */}
        <div className="-mt-7 mx-5 bg-white rounded-2xl border border-slate-200 shadow-lg p-3 flex justify-center">
          <img
            src="/zalo_qr.png"
            alt={`Mã QR Zalo ${APP_AUTHOR_INFO.name}`}
            className="w-[235px] max-w-full h-auto select-none"
            draggable={false}
          />
        </div>

        {/* Info + actions */}
        <div className="px-5 pt-3 pb-5 space-y-3">
          <div className="text-center">
            <div className="text-sm font-black text-slate-900">{APP_AUTHOR_INFO.name}</div>
            <div className="text-[11px] text-slate-600 font-semibold">{APP_AUTHOR_INFO.schoolName}</div>
            <div className="mt-1 inline-flex items-center gap-1.5 text-blue-700 font-mono font-black text-base">
              <Phone className="w-4 h-4" /> {APP_AUTHOR_INFO.zalo}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copyNumber}
              className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Đã sao chép' : 'Sao chép số'}</span>
            </button>
            <a
              href={APP_AUTHOR_INFO.zaloUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-zalo-direct="1"
              className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center justify-center gap-1.5"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Mở Zalo</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
