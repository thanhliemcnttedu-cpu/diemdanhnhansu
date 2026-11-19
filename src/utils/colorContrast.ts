/**
 * Class / subject colours are picked freely by teachers (blue-500, pink-500, amber-500…). White text on those reads at
 * only 2–3.7:1. `readableBg` keeps the hue (so a class is still recognised by its colour) but darkens it just enough
 * for white text to reach the target contrast (WCAG AA 4.5:1 by default).
 */
const parseHex = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const luminance = ([r, g, b]: [number, number, number]) => {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/** Contrast ratio of white text on the given colour */
export const contrastWithWhite = (hex: string): number => {
  const rgb = parseHex(hex);
  return rgb ? 1.05 / (luminance(rgb) + 0.05) : 21;
};

const cache = new Map<string, string>();

export function readableBg(hex: string | undefined | null, fallback = '#4F46E5', target = 4.5): string {
  const src = parseHex(String(hex || '')) ? String(hex).trim() : fallback;
  const key = `${src}|${target}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let rgb = parseHex(src) as [number, number, number];
  // Darken in small steps toward black; hue and saturation ratios stay the same
  for (let i = 0; i < 40 && 1.05 / (luminance(rgb) + 0.05) < target; i++) {
    rgb = [Math.round(rgb[0] * 0.95), Math.round(rgb[1] * 0.95), Math.round(rgb[2] * 0.95)];
  }
  const out = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
  cache.set(key, out);
  return out;
}
