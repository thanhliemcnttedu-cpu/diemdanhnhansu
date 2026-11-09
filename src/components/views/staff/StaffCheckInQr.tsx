import React, { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { Download, Printer, QrCode, X, Copy, Check } from 'lucide-react';
import { staffAttendanceService } from '../../../services/staffAttendanceService';

/**
 * 📱 MÃ QR ĐIỂM DANH GIÁO VIÊN – NHÂN VIÊN
 * Tạo ngay trên máy (thư viện qrcode-generator, không gửi link của trường ra dịch vụ ngoài).
 * - Hiển thị trên màn hình để quét trực tiếp bằng Zalo / camera điện thoại.
 * - Tải ảnh QR (gửi nhóm Zalo) • Tải poster A4 • In poster dán phòng hội đồng / cổng trường.
 */

export function buildQrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

export const QrSvg: React.FC<{ matrix: boolean[][]; size?: number; title?: string }> = ({ matrix, size = 240, title }) => {
  const n = matrix.length;
  const quiet = 4;
  const total = n + quiet * 2;
  let d = '';
  matrix.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + quiet} ${r + quiet}h1v1h-1z`; }));
  return (
    <svg viewBox={`0 0 ${total} ${total}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label={title || 'Mã QR'}>
      <rect width={total} height={total} fill="#ffffff" />
      <path d={d} fill="#0f172a" />
    </svg>
  );
};

const drawQr = (ctx: CanvasRenderingContext2D, matrix: boolean[][], x: number, y: number, size: number) => {
  const n = matrix.length, quiet = 4, cell = size / (n + quiet * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#0f172a';
  matrix.forEach((row, r) => row.forEach((on, c) => {
    if (on) ctx.fillRect(Math.floor(x + (c + quiet) * cell), Math.floor(y + (r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
  }));
};

const wrap = (ctx: CanvasRenderingContext2D, text: string, maxW: number) => {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  words.forEach(w => { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur);
  return lines;
};

/** Ảnh vuông 1080px: QR + dòng chữ — để gửi nhóm Zalo */
export function renderQrSquare(matrix: boolean[][], schoolName: string): string {
  const W = 1080, H = 1240;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#047857'; ctx.fillRect(0, 0, W, 150);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
  ctx.font = '900 54px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText('QUÉT MÃ ĐỂ ĐIỂM DANH', W / 2, 92);
  drawQr(ctx, matrix, 140, 190, 800);
  ctx.fillStyle = '#0f172a'; ctx.font = '800 40px "Be Vietnam Pro", Arial, sans-serif';
  wrap(ctx, (schoolName || 'Giáo viên – nhân viên').toUpperCase(), W - 120).slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, 1060 + i * 50));
  ctx.fillStyle = '#475569'; ctx.font = '500 30px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText('Mở Zalo → Quét mã QR • Nhập số CCCD + mật khẩu điểm danh', W / 2, 1180);
  return cv.toDataURL('image/png');
}

/** Poster A4 (1240×1754, 150dpi) để in dán */
export function renderQrPoster(matrix: boolean[][], schoolName: string): string {
  const W = 1240, H = 1754;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#047857'; ctx.lineWidth = 14; ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#047857'; ctx.font = '800 40px "Be Vietnam Pro", Arial, sans-serif';
  wrap(ctx, (schoolName || '').toUpperCase(), W - 200).slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, 150 + i * 52));
  ctx.fillStyle = '#0f172a'; ctx.font = '900 76px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText('ĐIỂM DANH', W / 2, 300);
  ctx.font = '900 56px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText('GIÁO VIÊN – NHÂN VIÊN', W / 2, 375);
  drawQr(ctx, matrix, 220, 430, 800);
  const steps = [
    '1. Mở Zalo (hoặc camera điện thoại) → Quét mã QR',
    '2. Nhập số căn cước công dân + mật khẩu điểm danh',
    '3. Chọn: Có mặt / Nghỉ ốm có phép / Nghỉ việc riêng',
    '4. Bấm "Xác nhận điểm danh" (chỉ cho ngày hôm nay)',
  ];
  ctx.textAlign = 'left'; ctx.fillStyle = '#1e293b'; ctx.font = '600 38px "Be Vietnam Pro", Arial, sans-serif';
  steps.forEach((t, i) => ctx.fillText(t, 150, 1330 + i * 64));
  ctx.textAlign = 'center'; ctx.fillStyle = '#64748b'; ctx.font = '500 28px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText('Lớp Học Hạnh Phúc • Dữ liệu lưu trên Google Drive của nhà trường', W / 2, H - 90);
  return cv.toDataURL('image/png');
}

const download = (dataUrl: string, name: string) => {
  const a = document.createElement('a');
  a.href = dataUrl; a.download = name; a.click();
};

export const StaffCheckInQrCard: React.FC<{ link: string; schoolName: string; size?: number; showLink?: boolean }> = ({ link, schoolName, size = 260, showLink = true }) => {
  const matrix = useMemo(() => buildQrMatrix(link), [link]);
  const [copied, setCopied] = useState(false);
  const slug = (schoolName || 'Truong').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '_');

  const printPoster = () => {
    const img = renderQrPoster(matrix, schoolName);
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { download(img, `Poster_QR_DiemDanh_${slug}.png`); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Poster mã QR điểm danh</title>
      <style>@page{size:A4;margin:0}html,body{margin:0}img{width:100%;height:auto;display:block}</style></head>
      <body><img src="${img}" onload="setTimeout(function(){window.print();},200)"></body></html>`);
    w.document.close();
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="p-3 rounded-2xl bg-white border-2 border-emerald-600 shadow-sm shrink-0">
        <QrSvg matrix={matrix} size={size} title="Mã QR điểm danh giáo viên – nhân viên" />
      </div>
      <div className="space-y-2.5 text-sm text-slate-700 w-full">
        <p className="text-base font-black text-slate-900">Quét mã để điểm danh</p>
        <p>Giáo viên, nhân viên mở <strong>Zalo → Quét mã QR</strong> (hoặc camera điện thoại) trỏ vào mã này, rồi nhập <strong>số CCCD + mật khẩu điểm danh</strong>. Không cần nhập link thư mục hay link script.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => download(renderQrSquare(matrix, schoolName), `QR_DiemDanh_${slug}.png`)}
            className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black inline-flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Tải ảnh QR gửi Zalo
          </button>
          <button type="button" onClick={() => download(renderQrPoster(matrix, schoolName), `Poster_QR_DiemDanh_${slug}.png`)}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold inline-flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Tải poster A4
          </button>
          <button type="button" onClick={printPoster}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold inline-flex items-center gap-1.5">
            <Printer className="w-4 h-4" /> In poster
          </button>
          {showLink && (
            <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (_) { /* ignore */ } }}
              className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold inline-flex items-center gap-1.5">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Đã sao chép' : 'Sao chép link'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/** Hộp mã QR dùng ở màn hình đăng nhập (máy tính đã kết nối CSDL nhà trường) */
export const StaffCheckInQrModal: React.FC<{ open: boolean; onClose: () => void; schoolName?: string }> = ({ open, onClose, schoolName }) => {
  if (!open) return null;
  const conn = staffAttendanceService.resolveConnection();
  const name = schoolName || conn?.schoolName || '';
  const link = staffAttendanceService.buildCheckInLink(name);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-label="Mã QR điểm danh" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 bg-emerald-700 text-white rounded-t-3xl flex items-center justify-between">
          <h3 className="text-sm font-black uppercase inline-flex items-center gap-2"><QrCode className="w-5 h-5" /> Mã QR điểm danh giáo viên – nhân viên</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center" aria-label="Đóng"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">
          {link ? <StaffCheckInQrCard link={link} schoolName={name} size={280} showLink={false} /> : (
            <p className="text-sm text-amber-950 bg-amber-50 border border-amber-300 rounded-2xl p-4">
              Máy này chưa có địa chỉ trang web của trường nên chưa tạo được mã QR. Quản trị nhà trường vào <strong>Chấm công nhân sự → Link điểm danh</strong> và nhập địa chỉ web (ví dụ https://tentruong.vercel.app).
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaffCheckInQrCard;
