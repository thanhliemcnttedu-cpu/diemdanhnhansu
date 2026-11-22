import { loadDecorativeFonts } from './decorativeFonts';

/**
 * Auto signature: draws a hand-written style signature from the teacher's name (usually the given name, e.g. "Hà")
 * as a transparent PNG, in blue ink with a flourish under it. Used when the teacher has not uploaded a real signature.
 * Deterministic for a given name + style, so the certificate looks the same every time.
 */
export const AUTO_SIGNATURE_FONTS = [
  '"Great Vibes", cursive',
  '"Dancing Script", cursive',
  '"Charm", cursive',
  '"Allura", cursive',
  '"Alex Brush", cursive',
  '"Pinyon Script", cursive',
];
export const AUTO_SIGNATURE_STYLES = AUTO_SIGNATURE_FONTS.length * 3;

/** Given name = last word of a Vietnamese full name ("Trần Thu Hà" -> "Hà") */
export function givenNameOf(fullName: string): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return Math.abs(h); };

export interface AutoSignature { url: string; aspect: number }

/**
 * @param text   what to sign (default: the given name of `fullName`)
 * @param style  0..AUTO_SIGNATURE_STYLES-1: font x flourish; if omitted, picked from the name so every teacher differs
 */
export async function makeAutoSignature(fullName: string, text?: string, style?: number): Promise<AutoSignature | null> {
  const word = (text ?? givenNameOf(fullName)).trim();
  if (!word || typeof document === 'undefined') return null;
  const st = (style ?? hash(fullName)) % AUTO_SIGNATURE_STYLES;
  const font = AUTO_SIGNATURE_FONTS[st % AUTO_SIGNATURE_FONTS.length];
  const swash = Math.floor(st / AUTO_SIGNATURE_FONTS.length) % 3;
  const h = hash(fullName + '|' + st);
  const tilt = -(5 + (h % 5)) * Math.PI / 180;       // signatures rise to the right
  const ink = ['#1e3a8a', '#1d4ed8', '#0f3b8c'][h % 3];

  try {
    await loadDecorativeFonts();
    await (document as any).fonts?.load?.(`80px ${font}`, word);
  } catch { /* offline: the browser falls back to a generic cursive */ }

  const W = 900, H = 360;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;

  // fit the word into ~640px wide
  let size = 230;
  ctx.font = `${size}px ${font}`;
  const w0 = ctx.measureText(word).width;
  if (w0 > 640) size = Math.max(70, Math.floor(size * 640 / w0));
  ctx.font = `${size}px ${font}`;
  const tw = ctx.measureText(word).width;

  ctx.save();
  ctx.translate(W / 2, H * 0.56);
  ctx.rotate(tilt);
  ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = Math.max(1.5, size * 0.012);       // a hair of stroke thickens thin script strokes like a pen
  ctx.strokeText(word, 0, 0);
  ctx.fillText(word, 0, 0);

  // flourish under the word
  const x0 = -tw / 2 - size * 0.08, x1 = tw / 2 + size * 0.22, y0 = size * 0.12;
  ctx.lineWidth = Math.max(3, size * 0.028);
  ctx.beginPath();
  if (swash === 0) {            // long underline sweeping out to the right
    ctx.moveTo(x0, y0 + size * 0.04);
    ctx.bezierCurveTo(x0 + tw * 0.3, y0 + size * 0.2, x0 + tw * 0.7, y0 - size * 0.04, x1, y0 - size * 0.1);
  } else if (swash === 1) {     // loop: underline that curls back
    ctx.moveTo(x0 + tw * 0.1, y0 + size * 0.1);
    ctx.bezierCurveTo(x0 + tw * 0.5, y0 + size * 0.28, x1 - tw * 0.05, y0 + size * 0.02, x1, y0 - size * 0.06);
    ctx.bezierCurveTo(x1 + size * 0.1, y0 - size * 0.2, x1 - size * 0.12, y0 - size * 0.24, x1 - size * 0.14, y0 - size * 0.1);
  } else {                      // double stroke
    ctx.moveTo(x0, y0 + size * 0.08);
    ctx.bezierCurveTo(x0 + tw * 0.35, y0 + size * 0.22, x0 + tw * 0.75, y0 + size * 0.02, x1, y0 - size * 0.08);
    ctx.stroke();
    ctx.lineWidth = Math.max(2, size * 0.016);
    ctx.beginPath();
    ctx.moveTo(x0 + tw * 0.25, y0 + size * 0.2);
    ctx.bezierCurveTo(x0 + tw * 0.5, y0 + size * 0.3, x0 + tw * 0.8, y0 + size * 0.2, x1 - size * 0.05, y0 + size * 0.1);
  }
  ctx.stroke();
  ctx.restore();

  // crop to the ink
  const data = ctx.getImageData(0, 0, W, H).data;
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] > 12) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX <= minX || maxY <= minY) return null;
  const pad = 8;
  const cw = maxX - minX + pad * 2, ch = maxY - minY + pad * 2;
  const out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  out.getContext('2d')!.drawImage(cv, minX - pad, minY - pad, cw, ch, 0, 0, cw, ch);
  return { url: out.toDataURL('image/png'), aspect: ch / cw };
}
