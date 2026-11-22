/**
 * Phông trang trí (Thư khen, mẫu Thời khóa biểu sang trọng) chỉ nạp KHI CẦN, để màn hình khác mở nhanh hơn.
 * Giao diện chung chỉ dùng Be Vietnam Pro (nạp sẵn trong index.html).
 * Các phông trang trí được ĐÓNG GÓI SẴN trong phần mềm (public/fonts/cert), không cần mạng, không cần cài vào máy.
 * Thẻ <link> có crossorigin để html-to-image đọc được CSS phông khi xuất ảnh/PDF.
 */
// Fonts are bundled with the app (public/fonts/cert, SIL Open Font License): they work offline and on any computer.
const DECORATIVE_FONTS_HREF = `${(import.meta as any).env?.BASE_URL ?? './'}fonts/cert/fonts.css`;

let loading: Promise<void> | null = null;

export function loadDecorativeFonts(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>(resolve => {
    const existing = document.querySelector<HTMLLinkElement>('link[data-lhhp-decorative-fonts]');
    if (existing) { resolve(); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.crossOrigin = 'anonymous';
    link.href = DECORATIVE_FONTS_HREF;
    link.dataset.lhhpDecorativeFonts = '1';
    const done = () => resolve();
    link.onload = done;
    link.onerror = done; // mất mạng: dùng phông dự phòng, không chặn giao diện
    setTimeout(done, 6000);
    document.head.appendChild(link);
  });
  return loading;
}
