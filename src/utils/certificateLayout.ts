import { loadDecorativeFonts } from './decorativeFonts';
/**
 * 🎨 BỘ MÁY BỐ CỤC THƯ KHEN THEO ẢNH NỀN
 *
 * 1. analyzeTemplate(): đọc ảnh nền ở độ phân giải thấp → lưới "vùng bận" (hoa văn, khung viền, huy chương,
 *    nhân vật, mảng màu đậm) + màu giấy + bảng màu lấy từ chính ảnh nền (đã chỉnh đủ tương phản để đọc).
 * 2. buildCertificateLayout(): xếp chữ & ảnh vào vùng trống lớn nhất, mỗi dòng được co giãn theo khoảng trống
 *    thực tế ở đúng độ cao đó (tránh góc trang trí chéo), khối chân trang (ngày tháng, GVCN) được đặt vào chỗ trống
 *    thấp nhất hai bên (ví dụ hai bên huy chương), chữ tự thu nhỏ cho vừa.
 * 3. fitElementsToContent(): khi đổi học sinh (xuất hàng loạt) giữ nguyên vị trí, chỉ thu nhỏ cỡ chữ tên nếu tên dài.
 *
 * Mọi toạ độ tính trên khung thư khen cao 1080px, chiều rộng theo đúng tỉ lệ ảnh nền (không kéo méo ảnh).
 */

export interface CertLayoutElement {
  id: string;
  type: 'text' | 'image';
  content: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  maxFontSize?: number;
  fontFamily?: string;
  color?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  textAlign?: 'left' | 'center' | 'right';
  letterSpacing?: string;
  lineHeight?: number | string;
  textTransform?: 'uppercase' | 'none' | 'capitalize';
  whiteSpace?: 'nowrap' | 'normal' | string;
  textShadow?: string;
  isCircleImage?: boolean;
  borderWidth?: number;
  borderColor?: string;
  boxShadow?: string;
}

export interface CertPalette {
  title: string;
  name: string;
  sub: string;
  ornament: string;
  text: string;
  muted: string;
}

export interface TemplateAnalysis {
  url: string;
  canvasW: number;
  canvasH: number;
  gw: number;
  gh: number;
  busy: Uint8Array; // 1 = có hoạ tiết (đã nới 1 ô)
  paper: [number, number, number];
  palette: CertPalette;
  safe: { x: number; y: number; w: number; h: number };
}

export type CertComposition = 'center' | 'left' | 'right';

export interface CertContent {
  schoolName: string;
  title: string;
  subtitle: string;
  lead: string;
  studentName: string;
  avatar: string;
  className: string;
  reason: string;
  date: string;
  teacherTitle: string;
  teacherName: string;
  signature?: string | null;
  signatureAspect?: number;
  logo?: string | null;
  logoAspect?: number;
}

export interface CertTypography {
  id: string;
  label: string;
  title: { family: string; weight: number; tracking: number };
  name: { family: string; weight: number; scale: number };
  body: string; // serif italic for lead / reason
  sans: string;
}

export const CERT_TYPOGRAPHY: CertTypography[] = [
  {
    id: 'royal', label: 'Hoàng gia',
    title: { family: '"Playfair Display", serif', weight: 900, tracking: 0.12 },
    name: { family: '"Great Vibes", cursive', weight: 400, scale: 1.12 },
    body: '"Lora", serif', sans: '"Montserrat", sans-serif',
  },
  {
    id: 'classic', label: 'Cổ điển',
    title: { family: '"Merriweather", serif', weight: 900, tracking: 0.1 },
    name: { family: '"Dancing Script", cursive', weight: 700, scale: 1 },
    body: '"Lora", serif', sans: '"Be Vietnam Pro", sans-serif',
  },
  {
    id: 'modern', label: 'Hiện đại',
    title: { family: '"Montserrat", sans-serif', weight: 900, tracking: 0.16 },
    name: { family: '"Charm", cursive', weight: 700, scale: 1 },
    body: '"Lora", serif', sans: '"Plus Jakarta Sans", sans-serif',
  },
  {
    id: 'friendly', label: 'Thân thiện',
    title: { family: '"Playfair Display", serif', weight: 800, tracking: 0.08 },
    name: { family: '"Pattaya", cursive', weight: 400, scale: 0.86 },
    body: '"Lora", serif', sans: '"Be Vietnam Pro", sans-serif',
  },
];

const CANVAS_H = 1080;
const GRID_W = 128;
const TEXT_PAD_X = 10; // padding ngang của khối chữ trên canvas
const TEXT_PAD_Y = 6;

// ---------------------------------------------------------------- colour helpers
type RGB = [number, number, number];
const toHex = (c: RGB) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const relLum = (c: RGB) => {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contrast = (a: RGB, b: RGB) => { const la = relLum(a), lb = relLum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
const darkenTo = (c: RGB, bg: RGB, ratio: number): RGB => {
  let cur: RGB = [...c] as RGB;
  for (let i = 0; i < 40 && contrast(cur, bg) < ratio; i++) cur = cur.map(v => v * 0.92) as RGB;
  return cur;
};
const rgbToHsv = (c: RGB) => {
  const [r, g, b] = c.map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: mx ? d / mx : 0, v: mx };
};

// ---------------------------------------------------------------- analysis
const analysisCache = new Map<string, Promise<TemplateAnalysis>>();

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = url;
});

const FALLBACK_PALETTE: CertPalette = {
  title: '#7f1d1d', name: '#1e3a8a', sub: '#92400e', ornament: '#d4a017', text: '#1e293b', muted: '#475569',
};

export function analyzeTemplate(url: string): Promise<TemplateAnalysis> {
  const cached = analysisCache.get(url);
  if (cached) return cached;
  const p = doAnalyze(url).catch(() => fallbackAnalysis(url, 1920));
  analysisCache.set(url, p);
  return p;
}

function fallbackAnalysis(url: string, canvasW: number): TemplateAnalysis {
  const gw = GRID_W, gh = Math.round(GRID_W * CANVAS_H / canvasW);
  const busy = new Uint8Array(gw * gh);
  const m = 0.08;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (x < gw * m || x >= gw * (1 - m) || y < gh * m || y >= gh * (1 - m)) busy[y * gw + x] = 1;
  }
  return {
    url, canvasW, canvasH: CANVAS_H, gw, gh, busy, paper: [255, 255, 255], palette: FALLBACK_PALETTE,
    safe: { x: canvasW * m, y: CANVAS_H * m, w: canvasW * (1 - 2 * m), h: CANVAS_H * (1 - 2 * m) },
  };
}

async function doAnalyze(url: string): Promise<TemplateAnalysis> {
  const img = await loadImage(url);
  const nw = img.naturalWidth || 1920, nh = img.naturalHeight || 1080;
  const canvasW = Math.round(CANVAS_H * nw / nh);
  const gw = GRID_W, gh = Math.max(20, Math.round(GRID_W * nh / nw));
  const cv = document.createElement('canvas');
  cv.width = gw; cv.height = gh;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fallbackAnalysis(url, canvasW);
  ctx.drawImage(img, 0, 0, gw, gh);
  const data = ctx.getImageData(0, 0, gw, gh).data;
  const n = gw * gh;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];

  // Màu giấy = trung vị vùng giữa
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = Math.floor(gh * 0.3); y < gh * 0.7; y++) for (let x = Math.floor(gw * 0.3); x < gw * 0.7; x++) {
    const i = (y * gw + x) * 4; rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
  }
  const med = (a: number[]) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)] || 255;
  const paper: RGB = [med(rs), med(gs), med(bs)];

  // Ô "bận": cạnh mạnh, quá tối, hoặc màu đậm (mảng nhạt / ánh sáng mờ vẫn coi là trống)
  const raw = new Uint8Array(n);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const i = y * gw + x;
    let g = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) g = Math.max(g, Math.abs(L[i] - L[yy * gw + xx]));
    }
    const r = data[i * 4], gg = data[i * 4 + 1], b = data[i * 4 + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const sat = mx ? (mx - mn) / mx : 0;
    raw[i] = (g > 24 || L[i] < 170 || (sat > 0.42 && L[i] < 238)) ? 1 : 0;
  }
  const busy = new Uint8Array(n);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let v = 0;
    for (let dy = -1; dy <= 1 && !v; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < gh && xx >= 0 && xx < gw && raw[yy * gw + xx]) { v = 1; break; }
    }
    busy[y * gw + x] = v;
  }

  // Hình chữ nhật trống lớn nhất (thuật toán histogram)
  const hist = new Int32Array(gw);
  let best = { area: 0, x: 0, y: 0, w: gw, h: gh };
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) hist[x] = busy[y * gw + x] ? 0 : hist[x] + 1;
    const st: Array<[number, number]> = [];
    for (let x = 0; x <= gw; x++) {
      const hh = x < gw ? hist[x] : 0;
      let start = x;
      while (st.length && st[st.length - 1][1] >= hh) {
        const [sx, sh] = st.pop()!;
        const area = sh * (x - sx);
        if (area > best.area) best = { area, x: sx, y: y - sh + 1, w: x - sx, h: sh };
        start = sx;
      }
      st.push([start, hh]);
    }
  }
  const sx = canvasW / gw, sy = CANVAS_H / gh;
  let safe = { x: best.x * sx, y: best.y * sy, w: best.w * sx, h: best.h * sy };
  if (safe.w * safe.h < canvasW * CANVAS_H * 0.12) {
    safe = { x: canvasW * 0.1, y: CANVAS_H * 0.1, w: canvasW * 0.8, h: CANVAS_H * 0.8 };
  }

  return { url, canvasW, canvasH: CANVAS_H, gw, gh, busy, paper, palette: derivePalette(data, raw, paper), safe };
}

function derivePalette(data: Uint8ClampedArray, raw: Uint8Array, paper: RGB): CertPalette {
  const bins = Array.from({ length: 18 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let darkW = 0; const dark = [0, 0, 0];
  for (let i = 0; i < raw.length; i++) {
    if (!raw[i]) continue;
    const c: RGB = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    const { h, s, v } = rgbToHsv(c);
    if (v < 0.38) { darkW++; dark[0] += c[0]; dark[1] += c[1]; dark[2] += c[2]; continue; }
    if (s < 0.28 || v > 0.97 && s < 0.4) continue;
    const bin = bins[Math.floor(h / 20) % 18];
    const w = s * s;
    bin.w += w; bin.r += c[0] * w; bin.g += c[1] * w; bin.b += c[2] * w;
  }
  const accents = bins.filter(b => b.w > 0.5).sort((a, b) => b.w - a.w).slice(0, 3)
    .map(b => [b.r / b.w, b.g / b.w, b.b / b.w] as RGB);
  const candidates: RGB[] = [...accents];
  if (darkW > 25) candidates.push([dark[0] / darkW, dark[1] / darkW, dark[2] / darkW]);
  if (candidates.length === 0) return FALLBACK_PALETTE;

  const isWarm = (c: RGB) => { const { h } = rgbToHsv(c); return h >= 25 && h <= 55; };
  const ornamentRaw = accents.find(isWarm) || accents[0] || candidates[0];
  // Tiêu đề: màu đậm nhất (xanh than, đỏ đô, xanh lá…) – tương phản ≥ 7
  const titleBase = [...candidates].sort((a, b) => relLum(a) - relLum(b))[0];
  // Tên: ưu tiên tông vàng kim/cam ấm khác tiêu đề, nếu không có thì một màu nhấn khác
  const nameBase = accents.find(c => isWarm(c) && c !== titleBase)
    || accents.find(c => c !== titleBase && Math.abs(rgbToHsv(c).h - rgbToHsv(titleBase).h) > 30)
    || titleBase;
  const title = darkenTo(titleBase, paper, 7);
  const name = darkenTo(nameBase, paper, 4.8);
  const sub = darkenTo(nameBase === titleBase ? (accents[1] || titleBase) : nameBase, paper, 4.6);
  return {
    title: toHex(title), name: toHex(name), sub: toHex(sub), ornament: toHex(ornamentRaw),
    text: '#1e293b', muted: '#475569',
  };
}

// ---------------------------------------------------------------- measuring
let measureCtx: CanvasRenderingContext2D | null = null;
const getMeasureCtx = () => {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
};
const trackingEm = (ls?: string) => {
  if (!ls) return 0;
  const m = /([\d.]+)em/.exec(ls);
  return m ? parseFloat(m[1]) : 0;
};

export function measureTextWidth(text: string, el: Pick<CertLayoutElement, 'fontFamily' | 'fontWeight' | 'fontStyle' | 'letterSpacing' | 'textTransform'>, fontSize: number) {
  const ctx = getMeasureCtx();
  const t = el.textTransform === 'uppercase' ? text.toLocaleUpperCase('vi-VN') : text;
  if (!ctx) return t.length * fontSize * 0.55;
  ctx.font = `${el.fontStyle || 'normal'} ${el.fontWeight || 400} ${fontSize}px ${el.fontFamily || 'sans-serif'}`;
  return ctx.measureText(t).width + Math.max(0, t.length - 1) * trackingEm(el.letterSpacing) * fontSize;
}

/** Cỡ chữ lớn nhất ≤ maxSize để dòng chữ vừa chiều rộng ô */
export function fitFontSize(text: string, el: CertLayoutElement, boxWidth: number, maxSize: number, minSize = 12) {
  const avail = Math.max(10, boxWidth - TEXT_PAD_X * 2 - 6);
  const w = measureTextWidth(text, el, maxSize);
  if (w <= avail) return maxSize;
  return Math.max(minSize, Math.floor(maxSize * avail / w));
}

/** Nạp sẵn các phông dùng trên thư khen để đo chữ chính xác */
export async function ensureCertificateFonts() {
  if (typeof document === 'undefined' || !(document as any).fonts?.load) return;
  await loadDecorativeFonts();
  const specs = new Set<string>();
  CERT_TYPOGRAPHY.forEach(t => {
    specs.add(`${t.title.weight} 64px ${t.title.family}`);
    specs.add(`${t.name.weight} 64px ${t.name.family}`);
    specs.add(`italic 500 32px ${t.body}`);
    specs.add(`800 24px ${t.sans}`);
    specs.add(`600 24px ${t.sans}`);
  });
  specs.add('700 48px "Dancing Script"');
  try {
    await Promise.all([...specs].map(s => (document as any).fonts.load(s, 'ẮÂĐỆỐƯàáạ')));
  } catch (_) { /* offline: dùng phông dự phòng */ }
}

// ---------------------------------------------------------------- free-space queries
function makeSpace(a: TemplateAnalysis) {
  const cx2g = a.gw / a.canvasW, cy2g = a.gh / a.canvasH;
  const rowFree = (gx: number, y0: number, y1: number) => {
    for (let gy = y0; gy <= y1; gy++) if (a.busy[gy * a.gw + gx]) return false;
    return true;
  };
  const band = (y: number, h: number) => {
    const y0 = Math.max(0, Math.floor(y * cy2g)), y1 = Math.min(a.gh - 1, Math.floor((y + h) * cy2g));
    return [y0, y1] as const;
  };
  /** khoảng trống đối xứng quanh trục cx trong dải y..y+h, giới hạn bởi [minX,maxX] */
  const symmetricSpan = (cx: number, y: number, h: number, minX: number, maxX: number) => {
    const [y0, y1] = band(y, h);
    const gc = Math.min(a.gw - 1, Math.max(0, Math.floor(cx * cx2g)));
    if (!rowFree(gc, y0, y1)) return 0;
    let l = gc, r = gc;
    while (l - 1 >= 0 && rowFree(l - 1, y0, y1)) l--;
    while (r + 1 < a.gw && rowFree(r + 1, y0, y1)) r++;
    const left = Math.max(minX, l / cx2g), right = Math.min(maxX, (r + 1) / cx2g);
    return Math.max(0, 2 * Math.min(cx - left, right - cx));
  };
  const boxFree = (x: number, y: number, w: number, h: number) => {
    if (x < 0 || y < 0 || x + w > a.canvasW || y + h > a.canvasH) return false;
    const gx0 = Math.floor(x * cx2g), gx1 = Math.min(a.gw - 1, Math.floor((x + w) * cx2g));
    const [y0, y1] = band(y, h);
    for (let gx = gx0; gx <= gx1; gx++) if (!rowFree(gx, y0, y1)) return false;
    return true;
  };
  return { symmetricSpan, boxFree };
}

// ---------------------------------------------------------------- layout
interface Row {
  id: string;
  kind: 'text' | 'avatar' | 'logo' | 'gap';
  text?: string;
  size: number; // font size (text) / diameter (avatar) / height (gap, logo)
  style?: Partial<CertLayoutElement>;
  wrap?: boolean;
  maxWidth?: number;
  fit?: boolean;
}

const lineH = (size: number, lh = 1.25) => size * lh + TEXT_PAD_Y * 2;

export function buildCertificateLayout(
  a: TemplateAnalysis,
  c: CertContent,
  composition: CertComposition,
  typo: CertTypography = CERT_TYPOGRAPHY[0],
): CertLayoutElement[] {
  const P = a.palette;
  const space = makeSpace(a);
  const W = a.canvasW, H = a.canvasH;
  const pad = H * 0.022;
  // Lề tối thiểu của trang: 5% chiều rộng, 5% chiều cao
  const mX = W * 0.05, mY = H * 0.05;
  const sx0 = Math.max(a.safe.x + pad, mX), sy0 = Math.max(a.safe.y + pad, mY);
  const sx1 = Math.min(a.safe.x + a.safe.w - pad, W - mX), sy1 = Math.min(a.safe.y + a.safe.h - pad, H - mY);
  const S = { x: sx0, y: sy0, w: Math.max(W * 0.3, sx1 - sx0), h: Math.max(H * 0.3, sy1 - sy0) };
  const u = H / 100;
  const split = composition !== 'center';

  // ----- Footer blocks (ngày tháng + giáo viên): tìm chỗ trống thấp nhất mỗi bên
  const sigH = c.signature ? 11 * u : 0;
  const teacherBlockW = Math.min(34 * u * 1.35, W * 0.3);
  const teacherBlockH = lineH(2.3 * u) + sigH + lineH(4.6 * u, 1.15);
  const dateBlockW = Math.min(30 * u * 1.3, W * 0.28);
  const dateBlockH = lineH(2.4 * u);
  type FootSpot = { x: number; y: number; score: number };
  const findFooter = (bw: number, bh: number, side: "left" | "right"): FootSpot | null => {
    const targetX = side === 'left' ? S.x + S.w * 0.2 : S.x + S.w * 0.8;
    const step = H / a.gh;
    let best = null as FootSpot | null;
    for (let y = H - mY - bh; y >= S.y + S.h * 0.35; y -= step) {
      for (let x = side === 'left' ? mX : W / 2; x + bw <= (side === 'left' ? W / 2 + bw * 0.25 : W - mX); x += step) {
        if (!space.boxFree(x - pad * 0.5, y - pad * 0.5, bw + pad, bh + pad)) continue;
        const score = y * 1.0 - Math.abs(x + bw / 2 - targetX) * 0.35;
        if (!best || score > best.score) best = { x, y, score };
      }
      if (best && y < best.y - H * 0.12) break;
    }
    return best;
  };
  const tFoot = findFooter(teacherBlockW, teacherBlockH, 'right');
  const dFoot = findFooter(dateBlockW, Math.max(dateBlockH, teacherBlockH * 0.5), 'left');
  // Chân trang chiếm phần đáy vùng an toàn nếu không tìm được chỗ riêng
  let stackBottom = S.y + S.h;
  const footerTop = Math.min(tFoot ? tFoot.y : stackBottom - teacherBlockH, dFoot ? dFoot.y : stackBottom);
  const teacherX = tFoot ? tFoot.x : S.x + S.w - teacherBlockW;
  const teacherY = tFoot ? tFoot.y : S.y + S.h - teacherBlockH;

  // ----- Columns
  let avatarCol: { x: number; w: number } | null = null;
  let textCol = { x: S.x, w: S.w };
  if (split) {
    // Cụm (ảnh + cột chữ) có kích thước vừa phải và được đặt giữa vùng trống
    const aw = Math.min(S.w * 0.34, S.h * 0.72, 48 * u);
    const gutter = 4 * u;
    const tw = Math.min(S.w - aw - gutter, Math.max(W * 0.42, 70 * u));
    const gx = S.x + (S.w - (aw + gutter + tw)) / 2;
    avatarCol = composition === 'left' ? { x: gx, w: aw } : { x: gx + tw + gutter, w: aw };
    textCol = composition === 'left' ? { x: gx + aw + gutter, w: tw } : { x: gx, w: tw };
  }
  const cx = textCol.x + textCol.w / 2;
  // Khối chữ giữa có chạm chân trang không? (giao theo chiều ngang)
  const overlapsX = (bx: number, bw: number) => bx < textCol.x + textCol.w * 0.82 && bx + bw > textCol.x + textCol.w * 0.18;
  if (tFoot && overlapsX(teacherX, teacherBlockW)) stackBottom = Math.min(stackBottom, teacherY - 1.5 * u);
  if (dFoot && overlapsX(dFoot.x, dateBlockW)) stackBottom = Math.min(stackBottom, dFoot.y - 1.5 * u);
  if (!tFoot) stackBottom = Math.min(stackBottom, footerTop - 1.5 * u);

  // ----- Rows (cỡ chữ theo đơn vị u = 1% chiều cao)
  const rows: Row[] = [];
  if (c.logo && !split) rows.push({ id: 'school_logo', kind: 'logo', size: 9 * u });
  rows.push({ id: 'school_header', kind: 'text', text: c.schoolName.toUpperCase(), size: 2.5 * u, fit: true,
    style: { fontFamily: typo.sans, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: P.muted } });
  rows.push({ id: 'gap1', kind: 'gap', size: 1.2 * u });
  rows.push({ id: 'title_master', kind: 'text', text: c.title, size: 10.5 * u, fit: true,
    style: { fontFamily: typo.title.family, fontWeight: typo.title.weight, letterSpacing: `${typo.title.tracking}em`, textTransform: 'uppercase', color: P.title, textShadow: '0 2px 0 rgba(255,255,255,0.65)' } });
  rows.push({ id: 'title_sub', kind: 'text', text: c.subtitle, size: 2.6 * u, fit: true,
    style: { fontFamily: typo.sans, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: P.sub } });
  rows.push({ id: 'ornament_divider', kind: 'text', text: '━━━━━  ✦  ━━━━━', size: 2.2 * u,
    style: { fontFamily: 'Arial, sans-serif', fontWeight: 400, letterSpacing: '0.05em', color: P.ornament } });
  rows.push({ id: 'gap2', kind: 'gap', size: 1.6 * u });
  if (!split) rows.push({ id: 'student_avatar', kind: 'avatar', size: 27 * u });
  if (!split) rows.push({ id: 'gap3', kind: 'gap', size: 1.6 * u });
  rows.push({ id: 'lead_text', kind: 'text', text: c.lead, size: 3.1 * u, fit: true,
    style: { fontFamily: typo.body, fontStyle: 'italic', fontWeight: 500, letterSpacing: '0.02em', color: P.muted } });
  rows.push({ id: 'student_name', kind: 'text', text: c.studentName, size: 12.5 * u * typo.name.scale, fit: true,
    style: { fontFamily: typo.name.family, fontWeight: typo.name.weight, letterSpacing: '0.01em', color: P.name, lineHeight: 1.15 } });
  rows.push({ id: 'student_class', kind: 'text', text: c.className, size: 2.5 * u, fit: true,
    style: { fontFamily: typo.sans, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: P.text } });
  rows.push({ id: 'gap4', kind: 'gap', size: 1.0 * u });
  rows.push({ id: 'reason_body', kind: 'text', text: c.reason, size: 3.2 * u, wrap: true,
    style: { fontFamily: typo.body, fontStyle: 'italic', fontWeight: 500, letterSpacing: '0.01em', color: P.text, lineHeight: 1.35 } });

  // Chiều cao từng dòng (lý do: tối đa 2 dòng)
  const reasonLines = (size: number, width: number) => {
    const w = measureTextWidth(c.reason, { fontFamily: typo.body, fontStyle: 'italic', fontWeight: 500, letterSpacing: '0.01em' }, size);
    return Math.min(2, Math.max(1, Math.ceil(w / Math.max(50, width - TEXT_PAD_X * 2))));
  };
  const rowHeight = (r: Row, k: number, width: number) => {
    const s = r.size * k;
    if (r.kind === 'gap') return s;
    if (r.kind === 'avatar') return r.size * Math.sqrt(k);
    if (r.kind === 'logo') return s;
    const lh = Number(r.style?.lineHeight) || 1.25;
    if (r.wrap) return s * lh * reasonLines(s, width) + TEXT_PAD_Y * 2;
    return lineH(s, lh);
  };
  const availH = stackBottom - S.y;
  const colWidth = Math.min(textCol.w, W * 0.78);
  let k = 1;
  for (let i = 0; i < 30; i++) {
    const total = rows.reduce((sum, r) => sum + rowHeight(r, k, colWidth), 0);
    if (total <= availH) break;
    k *= 0.96;
  }
  const total = rows.reduce((sum, r) => sum + rowHeight(r, k, colWidth), 0);
  const extra = Math.max(0, availH - total);
  // khoảng thở: 35% trên, 30% chia vào các khoảng gap, 35% dưới
  const gaps = rows.filter(r => r.kind === 'gap');
  const gapBonus = gaps.length ? (extra * 0.3) / gaps.length : 0;
  let y = S.y + extra * (split ? 0.5 : 0.35) - (split ? 0 : 0);
  if (split) y = S.y + extra * 0.4;

  const out: CertLayoutElement[] = [];
  const textBox = (r: Row, yy: number, h: number) => {
    const span = space.symmetricSpan(cx, yy, h, textCol.x - (split ? 0 : S.w * 0.15), textCol.x + textCol.w + (split ? 0 : S.w * 0.15));
    const width = Math.max(colWidth * 0.5, Math.min(span || colWidth, r.maxWidth || W * 0.86));
    return { width, x: cx - width / 2 };
  };

  for (const r of rows) {
    const h = rowHeight(r, k, colWidth);
    if (r.kind === 'gap') { y += h + gapBonus; continue; }
    if (r.kind === 'avatar') {
      const d = r.size * Math.sqrt(k);
      out.push(avatarEl(c.avatar, cx - d / 2, y, d, P));
      y += h; continue;
    }
    if (r.kind === 'logo') {
      const lw = r.size * k / (c.logoAspect || 1);
      out.push({ id: 'school_logo', type: 'image', content: c.logo || '', x: cx - lw / 2, y, width: lw, height: r.size * k, isCircleImage: false, borderWidth: 0, boxShadow: 'none' });
      y += h + 0.6 * u; continue;
    }
    const size = r.size * k;
    const { width, x } = textBox(r, y, h);
    const el: CertLayoutElement = {
      id: r.id, type: 'text', content: r.text || '', x, y, width,
      textAlign: 'center', whiteSpace: r.wrap ? 'normal' : 'nowrap', lineHeight: 1.25,
      ...r.style,
    } as CertLayoutElement;
    el.fontSize = r.fit ? fitFontSize(el.content, el, width, Math.round(size)) : Math.round(size);
    el.maxFontSize = Math.round(size);
    out.push(el);
    y += h;
  }

  // ----- Ảnh học sinh & logo ở bố cục chia cột
  if (split && avatarCol) {
    const top = out.find(e => e.id === 'title_master')?.y ?? S.y;
    const bottom = y;
    let d = Math.min(avatarCol.w * 0.92, (stackBottom - S.y) * 0.72, 46 * u);
    let ay = Math.max(S.y, (top + bottom) / 2 - d / 2);
    const ax = avatarCol.x + (avatarCol.w - d) / 2;
    // tránh chạm hoạ tiết: thu nhỏ dần nếu ô không trống
    for (let i = 0; i < 10 && !space.boxFree(ax + d * 0.1, ay + d * 0.1, d * 0.8, d * 0.8); i++) { d *= 0.92; ay += d * 0.04; }
    out.push(avatarEl(c.avatar, avatarCol.x + (avatarCol.w - d) / 2, ay, d, P));
    if (c.logo) {
      const lh = 8 * u, lw = lh / (c.logoAspect || 1);
      out.push({ id: 'school_logo', type: 'image', content: c.logo, x: avatarCol.x + (avatarCol.w - lw) / 2, y: Math.max(S.y - 2 * u, ay - lh - 2 * u), width: lw, height: lh, isCircleImage: false, borderWidth: 0, boxShadow: 'none' });
    }
  }

  // ----- Chân trang
  const tY = teacherY;
  const tW = teacherBlockW;
  const titleEl: CertLayoutElement = {
    id: 'teacher_title', type: 'text', content: c.teacherTitle, x: teacherX, y: tY, width: tW,
    fontFamily: typo.sans, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: P.text,
    textAlign: 'center', whiteSpace: 'nowrap',
  };
  titleEl.fontSize = fitFontSize(c.teacherTitle, titleEl, tW, Math.round(2.3 * u));
  titleEl.maxFontSize = titleEl.fontSize;
  out.push(titleEl);
  let ty = tY + lineH(2.3 * u);
  if (c.signature) {
    const sh = sigH, sw = Math.min(tW * 0.8, sh / (c.signatureAspect || 0.45));
    out.push({ id: 'signature', type: 'image', content: c.signature, x: teacherX + (tW - sw) / 2, y: ty, width: sw, height: sh, isCircleImage: false, borderWidth: 0, boxShadow: 'none' });
    ty += sh;
  }
  const nameEl: CertLayoutElement = {
    id: 'teacher_signature', type: 'text', content: c.teacherName, x: teacherX, y: ty, width: tW,
    fontFamily: '"Dancing Script", cursive', fontWeight: 700, color: P.name, textAlign: 'center', whiteSpace: 'nowrap', lineHeight: 1.15,
  };
  nameEl.fontSize = fitFontSize(c.teacherName, nameEl, tW, Math.round(4.6 * u));
  nameEl.maxFontSize = Math.round(4.6 * u);
  out.push(nameEl);

  // Ngày tháng thẳng hàng với tên giáo viên (nếu chỗ đó trống), không thì dùng chỗ trống tìm được
  const nameRowY = ty + (lineH(4.6 * u, 1.15) - dateBlockH) / 2;
  let dX = dFoot ? dFoot.x : S.x;
  let dY = dFoot ? dFoot.y : Math.max(S.y, teacherY + teacherBlockH - dateBlockH);
  const mirrorX = W - (teacherX + teacherBlockW / 2) - dateBlockW / 2;
  const alignCandidates = [mirrorX, dX];
  for (const cxDate of alignCandidates) {
    if (space.boxFree(cxDate, nameRowY, dateBlockW, dateBlockH) && cxDate + dateBlockW < teacherX - 2 * u) { dX = cxDate; dY = nameRowY; break; }
  }
  const dateEl: CertLayoutElement = {
    id: 'date_text', type: 'text', content: c.date, x: dX, y: dY, width: dateBlockW,
    fontFamily: typo.body, fontStyle: 'italic', fontWeight: 500, color: P.muted, textAlign: 'center', whiteSpace: 'nowrap',
  };
  dateEl.fontSize = fitFontSize(c.date, dateEl, dateBlockW, Math.round(2.6 * u));
  dateEl.maxFontSize = Math.round(2.6 * u);
  out.push(dateEl);

  return out.map(e => ({ ...e, x: Math.round(e.x), y: Math.round(e.y), width: e.width ? Math.round(e.width) : e.width, height: e.height ? Math.round(e.height) : e.height }));
}

function avatarEl(src: string, x: number, y: number, d: number, P: CertPalette): CertLayoutElement {
  const bw = Math.max(6, Math.round(d * 0.028));
  return {
    id: 'student_avatar', type: 'image', content: src, x, y, width: d, height: d, isCircleImage: true,
    borderWidth: bw, borderColor: '#ffffff',
    boxShadow: `0 0 0 ${Math.max(3, Math.round(d * 0.012))}px ${P.ornament}, 0 18px 40px -14px rgba(15, 23, 42, 0.45)`,
  };
}

/** Composition mặc định theo hình dạng vùng trống */
export function preferredComposition(a: TemplateAnalysis): CertComposition {
  return a.safe.w / a.safe.h >= 1.5 ? 'left' : 'center';
}

/**
 * Giữ nguyên vị trí/kiểu của mẫu, chỉ thay nội dung; chữ một dòng tự thu nhỏ (không vượt cỡ gốc) để vừa khung.
 */
export function fitElementsToContent<T extends CertLayoutElement>(els: T[], contentById: Record<string, string>): T[] {
  return els.map(el => {
    if (!(el.id in contentById)) return el;
    const content = contentById[el.id];
    if (el.type !== 'text' || !el.width || el.whiteSpace === 'normal') return { ...el, content };
    const max = el.maxFontSize || el.fontSize || 32;
    return { ...el, content, fontSize: fitFontSize(content, el, el.width, max) };
  });
}
