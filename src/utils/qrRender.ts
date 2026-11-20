/**
 * Draws a QR code, optionally with a logo, on a canvas / as SVG text.
 * Logo positions:
 *  - 'center': on top of the code. The code is always built with the highest error correction (H) when a centered logo is used.
 *  - 'tl' | 'tr' | 'bl' | 'br': in the corner OUTSIDE the data area. The picture gets an extra margin and the logo sits on the
 *    corner of the code's white border, so it never covers the three position squares or the data.
 */
export type LogoPos = 'center' | 'tl' | 'tr' | 'bl' | 'br';
export const LOGO_POSITIONS: { id: LogoPos; label: string }[] = [
  { id: 'center', label: 'Trung tâm' },
  { id: 'tl', label: 'Trên trái' },
  { id: 'tr', label: 'Trên phải' },
  { id: 'bl', label: 'Dưới trái' },
  { id: 'br', label: 'Dưới phải' },
];
export const LOGO_SIZES: { id: 1 | 2 | 3; label: string }[] = [
  { id: 1, label: 'Nhỏ' },
  { id: 2, label: 'Vừa' },
  { id: 3, label: 'Lớn' },
];

const QUIET = 4;
const CENTER_FRAC: Record<number, number> = { 1: 0.16, 2: 0.2, 3: 0.24 };
const CORNER_MODULES: Record<number, number> = { 1: 6, 2: 7, 3: 8 };

export interface QrLogoOpts { logo?: string; pos?: LogoPos; size?: 1 | 2 | 3 }

/** Geometry in "cells" (one QR module = 1 cell) */
export function qrGeometry(n: number, hasLogo: boolean, pos: LogoPos = 'center', size: 1 | 2 | 3 = 2) {
  const corner = hasLogo && pos !== 'center';
  const ext = corner ? QUIET : 0;                  // extra white margin around the code, only for corner logos
  const total = n + QUIET * 2 + ext * 2;
  let logo: { x: number; y: number; w: number } | null = null;
  if (hasLogo) {
    if (pos === 'center') {
      const w = Math.max(4, Math.round(n * CENTER_FRAC[size]));
      logo = { w, x: total / 2 - w / 2, y: total / 2 - w / 2 };
    } else {
      const w = CORNER_MODULES[size];
      const left = pos === 'tl' || pos === 'bl';
      const top = pos === 'tl' || pos === 'tr';
      const cx = left ? ext : total - ext;          // centre of the logo = corner of the code's white border
      const cy = top ? ext : total - ext;
      logo = { w, x: cx - w / 2, y: cy - w / 2 };
    }
  }
  return { total, offset: QUIET + ext, logo };
}

const imgCache = new Map<string, Promise<HTMLImageElement>>();
export function loadLogo(src: string): Promise<HTMLImageElement> {
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('logo'));
      im.src = src;
    });
    imgCache.set(src, p);
    if (imgCache.size > 60) imgCache.delete(imgCache.keys().next().value as string);
  }
  return p;
}

/** Fit the image inside a square (keeps proportions) */
function drawFit(ctx: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number) {
  const r = Math.min(w / im.naturalWidth, w / im.naturalHeight);
  const dw = im.naturalWidth * r, dh = im.naturalHeight * r;
  ctx.drawImage(im, x + (w - dw) / 2, y + (w - dh) / 2, dw, dh);
}

/** Paints the code (and logo) into the square [0,side] × [0,side] of the canvas at (ox, oy) */
export function paintQr(ctx: CanvasRenderingContext2D, matrix: boolean[][], side: number, ox: number, oy: number, opts: QrLogoOpts & { logoImg?: HTMLImageElement | null }) {
  const n = matrix.length;
  const hasLogo = Boolean(opts.logoImg);
  const g = qrGeometry(n, hasLogo, opts.pos, opts.size);
  // Whole-pixel modules: fractional cells leave hairline seams between modules that make dense codes harder to scan
  const cell = Math.max(1, Math.floor(side / g.total));
  const used = cell * g.total;
  const px = ox + Math.floor((side - used) / 2), py = oy + Math.floor((side - used) / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ox, oy, side, side);
  ctx.fillStyle = '#0f172a';
  matrix.forEach((row, r) => row.forEach((on, c) => {
    if (on) ctx.fillRect(px + (c + g.offset) * cell, py + (r + g.offset) * cell, cell, cell);
  }));
  if (g.logo && opts.logoImg) {
    const pad = cell * 0.6;
    const x = px + g.logo.x * cell, y = py + g.logo.y * cell, w = g.logo.w * cell;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const rr = Math.min(w * 0.18, pad * 3);
    const bx = x - pad, by = y - pad, bw = w + pad * 2;
    ctx.moveTo(bx + rr, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bw, rr);
    ctx.arcTo(bx + bw, by + bw, bx, by + bw, rr);
    ctx.arcTo(bx, by + bw, bx, by, rr);
    ctx.arcTo(bx, by, bx + bw, by, rr);
    ctx.closePath();
    ctx.fill();
    drawFit(ctx, opts.logoImg, x, y, w);
  }
}

/** PNG blob: code + optional caption under it */
export async function renderQrPng(matrix: boolean[][], size: number, caption: string, opts: QrLogoOpts): Promise<Blob | null> {
  let logoImg: HTMLImageElement | null = null;
  if (opts.logo) { try { logoImg = await loadLogo(opts.logo); } catch (_) { logoImg = null; } }
  // Picture side = whole number of pixels per module (close to the requested size)
  const total = qrGeometry(matrix.length, Boolean(logoImg), opts.pos, opts.size).total;
  const side = Math.max(1, Math.round(size / total)) * total;
  const pad = caption ? Math.round(side * 0.14) : 0;
  const canvas = document.createElement('canvas');
  canvas.width = side; canvas.height = side + pad;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  paintQr(ctx, matrix, side, 0, 0, { ...opts, logoImg });
  if (caption) {
    let fs = Math.round(pad * 0.5);
    ctx.fillStyle = '#0f172a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${fs}px "Be Vietnam Pro", sans-serif`;
    while (fs > 12 && ctx.measureText(caption).width > side * 0.9) { fs -= 2; ctx.font = `700 ${fs}px "Be Vietnam Pro", sans-serif`; }
    ctx.fillText(caption, side / 2, side + pad * 0.45, side * 0.92);
  }
  return new Promise(res => canvas.toBlob(b => res(b), 'image/png'));
}

/** SVG text (vector). The logo is embedded as an image. */
export function renderQrSvg(matrix: boolean[][], opts: QrLogoOpts): string {
  const n = matrix.length;
  const hasLogo = Boolean(opts.logo);
  const g = qrGeometry(n, hasLogo, opts.pos, opts.size);
  let d = '';
  matrix.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + g.offset} ${r + g.offset}h1v1h-1z`; }));
  let logo = '';
  if (g.logo && opts.logo) {
    const pad = 0.6;
    const l = g.logo;
    logo = `<rect x="${l.x - pad}" y="${l.y - pad}" width="${l.w + pad * 2}" height="${l.w + pad * 2}" rx="${Math.min(l.w * 0.18, pad * 3)}" fill="#ffffff"/>`
      + `<image href="${opts.logo}" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.w}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${g.total} ${g.total}" width="1024" height="1024" shape-rendering="crispEdges"><rect width="${g.total}" height="${g.total}" fill="#ffffff"/><path d="${d}" fill="#0f172a"/>${logo}</svg>`;
}

/** Read an image file / blob and shrink it to a small PNG data URL (keeps transparency) */
export async function logoFromBlob(blob: Blob, maxSide = 192): Promise<string> {
  if (!/^image\//.test(blob.type)) throw new Error('not-image');
  if (blob.size > 8 * 1024 * 1024) throw new Error('too-big');
  const url = URL.createObjectURL(blob);
  try {
    const im = await loadLogo(url);
    const r = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(1, Math.round(im.naturalWidth * r)), h = Math.max(1, Math.round(im.naturalHeight * r));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(im, 0, 0, w, h);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
