/**
 * Version and release time of the running build.
 * Both values are injected by Vite at build time (`define` in vite.config.ts): the version comes from package.json,
 * the release time is the moment the bundle was built. The desktop UI package is built from the same bundle,
 * so the installed app shows the same numbers as the web.
 */
declare const __APP_VERSION__: string;
declare const __APP_BUILT_AT__: string;

export const APP_PRODUCT_NAME = 'Cơ sở dữ liệu quản lý Lớp Học Hạnh Phúc';
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
export const APP_BUILT_AT: string = typeof __APP_BUILT_AT__ !== 'undefined' ? __APP_BUILT_AT__ : '';

const pad = (n: number) => String(n).padStart(2, '0');

/** "14:32:10 ngày 20/11/2026" (local time of the viewer) */
export function formatBuiltAt(iso: string = APP_BUILT_AT): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ngày ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export const APP_VERSION_LABEL = `V.${APP_VERSION}`;
