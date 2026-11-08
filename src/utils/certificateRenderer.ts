/**
 * 🖨️ VẼ THƯ KHEN TRỰC TIẾP LÊN CANVAS (dùng khi tải ảnh / xuất hàng loạt)
 *
 * Vì sao không chụp DOM bằng html-to-image: phông Google (khác nguồn) không nhúng được vào ảnh → chữ nghệ thuật
 * bị rơi về phông mặc định, và nhúng thủ công làm ảnh SVG quá nặng (treo). Canvas dùng thẳng phông đã nạp trên trang,
 * nhanh (cả lớp vài giây) và khớp vị trí với bản xem trước (cùng quy tắc: padding 6px/10px, line-height, căn lề).
 */
import type { CertLayoutElement } from './certificateLayout';

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImg(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  const hit = imgCache.get(src);
  if (hit) return hit;
  const p = new Promise<HTMLImageElement | null>(resolve => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
  imgCache.set(src, p);
  p.then(v => { if (!v) imgCache.delete(src); });
  return p;
}

const TEXT_PAD_X = 10;
const TEXT_PAD_Y = 6;

const emOf = (ls?: string) => {
  const m = /(-?[\d.]+)em/.exec(ls || '');
  return m ? parseFloat(m[1]) : 0;
};

function parseShadows(v?: string) {
  if (!v || v === 'none') return [] as Array<{ x: number; y: number; blur: number; spread: number; color: string }>;
  const parts = v.split(/,(?![^(]*\))/).map(p => p.trim());
  return parts.map(p => {
    const color = (p.match(/(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}|[a-z]+)$/)?.[1]) || 'rgba(0,0,0,0.3)';
    const nums = (p.replace(color, '').match(/-?[\d.]+(px)?/g) || []).map(n => parseFloat(n));
    return { x: nums[0] || 0, y: nums[1] || 0, blur: nums[2] || 0, spread: nums[3] || 0, color };
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

const zOf = (el: CertLayoutElement) => (el.id === 'school_logo' || el.id === 'signature' ? 30 : 20);

export async function renderCertificateCanvas(
  elements: CertLayoutElement[],
  backgroundUrl: string,
  width: number,
  height: number,
  fallbackInitial = 'A',
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas không khả dụng');

  // Nạp phông đúng kiểu/độ đậm đang dùng
  const fonts = (document as any).fonts;
  if (fonts?.load) {
    await Promise.all(elements.filter(e => e.type === 'text' && e.fontFamily).map(e =>
      fonts.load(`${e.fontStyle || 'normal'} ${e.fontWeight || 400} ${Math.round(e.fontSize || 32)}px ${e.fontFamily}`, e.content || 'Aă').catch(() => null)));
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  const bg = await loadImg(backgroundUrl);
  if (bg) ctx.drawImage(bg, 0, 0, width, height);

  const ordered = elements.map((e, i) => ({ e, i })).sort((a, b) => zOf(a.e) - zOf(b.e) || a.i - b.i).map(x => x.e);
  for (const el of ordered) {
    if (el.type === 'image') await drawImageEl(ctx, el, fallbackInitial);
    else drawTextEl(ctx, el);
  }
  return canvas;
}

function drawTextEl(ctx: CanvasRenderingContext2D, el: CertLayoutElement) {
  const fs = el.fontSize || 32;
  const raw = el.content || '';
  const text = el.textTransform === 'uppercase' ? raw.toLocaleUpperCase('vi-VN')
    : el.textTransform === 'capitalize' ? raw.replace(/(^|\s)\S/g, s => s.toLocaleUpperCase('vi-VN')) : raw;
  ctx.save();
  ctx.font = `${el.fontStyle || 'normal'} ${el.fontWeight || 'normal'} ${fs}px ${el.fontFamily || 'sans-serif'}`;
  const ls = emOf(el.letterSpacing) * fs;
  const anyCtx = ctx as any;
  if ('letterSpacing' in anyCtx) anyCtx.letterSpacing = `${ls}px`;
  const lh = (Number(el.lineHeight) || 1.3) * fs;
  const measured = ctx.measureText(text).width + (('letterSpacing' in anyCtx) ? 0 : ls * text.length);
  const boxW = el.width || measured + TEXT_PAD_X * 2;
  const contentW = boxW - TEXT_PAD_X * 2;
  const lines = el.whiteSpace === 'normal' ? wrapLines(ctx, text, contentW) : [text];
  const m = ctx.measureText('ẮgHỹ');
  const asc = m.fontBoundingBoxAscent ?? fs * 0.8;
  const desc = m.fontBoundingBoxDescent ?? fs * 0.2;
  const align = el.textAlign || 'center';
  ctx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
  ctx.textBaseline = 'alphabetic';
  // CSS cộng khoảng chữ cả sau ký tự cuối → bù nửa khoảng khi căn giữa
  const ax = align === 'left' ? el.x + TEXT_PAD_X : align === 'right' ? el.x + boxW - TEXT_PAD_X - ls : el.x + TEXT_PAD_X + contentW / 2 - ls / 2;
  const sh = parseShadows(el.textShadow)[0];
  if (sh) { ctx.shadowOffsetX = sh.x; ctx.shadowOffsetY = sh.y; ctx.shadowBlur = sh.blur; ctx.shadowColor = sh.color; }
  ctx.fillStyle = el.color || '#0f172a';
  lines.forEach((line, i) => {
    const top = el.y + TEXT_PAD_Y + i * lh;
    const baseline = top + (lh - (asc + desc)) / 2 + asc;
    ctx.fillText(line, ax, baseline);
  });
  ctx.restore();
}

async function drawImageEl(ctx: CanvasRenderingContext2D, el: CertLayoutElement, fallbackInitial: string) {
  const isAvatar = Boolean(el.isCircleImage);
  const img = await loadImg(el.content);
  if (isAvatar) {
    const w = el.width || 460, h = el.height || 460;
    const r = Math.min(w, h) / 2;
    const cx = el.x + w / 2, cy = el.y + h / 2;
    const bw = el.borderWidth !== undefined ? el.borderWidth : 10;
    const shadows = parseShadows(el.boxShadow || '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 4px #fbbf24');
    // bóng đổ mềm
    shadows.filter(s => s.blur > 0).forEach(s => {
      ctx.save();
      ctx.shadowColor = s.color; ctx.shadowBlur = s.blur; ctx.shadowOffsetX = s.x; ctx.shadowOffsetY = s.y;
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, r + s.spread), 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
    });
    // vòng viền màu (spread)
    shadows.filter(s => s.blur === 0 && s.spread > 0).forEach(s => {
      ctx.beginPath(); ctx.arc(cx, cy, r + s.spread, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill();
    });
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = el.borderColor || '#ffffff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, r - bw), 0, Math.PI * 2); ctx.clip();
    const inner = (r - bw) * 2;
    if (img) {
      const s = Math.max(inner / img.naturalWidth, inner / img.naturalHeight);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    } else {
      ctx.fillStyle = '#e0e7ff'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = '#4338ca'; ctx.font = `900 ${Math.round(r * 0.8)}px "Be Vietnam Pro", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(fallbackInitial, cx, cy);
    }
    ctx.restore();
    return;
  }
  if (!img) return;
  const w = el.width || (el.id === 'school_logo' ? 140 : 260);
  const h = el.height || (w * img.naturalHeight / img.naturalWidth);
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  ctx.drawImage(img, el.x + (w - dw) / 2, el.y + (h - dh) / 2, dw, dh);
}
