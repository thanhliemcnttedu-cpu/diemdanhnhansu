/**
 * Phông trang trí (Thư khen, mẫu Thời khóa biểu sang trọng) chỉ nạp KHI CẦN, để màn hình khác mở nhanh hơn.
 * Giao diện chung chỉ dùng Be Vietnam Pro (nạp sẵn trong index.html).
 * Thẻ <link> có crossorigin để html-to-image đọc được CSS phông khi xuất ảnh/PDF.
 */
const DECORATIVE_FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Charm:wght@400;700&family=Dancing+Script:wght@500;600;700&family=Great+Vibes&family=Lora:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Merriweather:ital,wght@0,400;0,700;0,900;1,400&family=Montserrat:ital,wght@0,500;0,600;0,700;0,800;0,900;1,500&family=Pacifico&family=Pattaya&family=Playfair+Display:ital,wght@0,600;0,700;0,800;0,900;1,600;1,700&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap';

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
