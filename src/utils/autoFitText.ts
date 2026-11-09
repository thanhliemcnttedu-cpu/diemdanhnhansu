/**
 * 🔤 TỰ CO CHỮ CHO VỪA 1 DÒNG (toàn hệ thống)
 * Nhãn ngắn (nút, thẻ chuyển, tiêu đề cột, nhãn tròn, tiêu đề thẻ… ≤ 40 ký tự) mà bị XUỐNG DÒNG hoặc BỊ CẮT (…)
 * → giữ trên 1 dòng và giảm cỡ chữ từng nấc 0,5px, KHÔNG nhỏ hơn 12px (quy định giao diện).
 * Nếu tới 12px vẫn không vừa → trả lại như cũ (cho xuống dòng) để không mất chữ.
 * Bỏ qua: mẫu in / thiết kế có cỡ chữ riêng (thẻ có style font-size / font-family), vùng [data-no-autofit],
 * phần tử có chữ con khác cỡ (để giữ nguyên kiểu chữ to – nhỏ có chủ đích).
 * Chạy lại khi đổi màn hình (MutationObserver, gom 250ms) và khi đổi kích thước cửa sổ.
 */
const SELECTOR = [
  'button', 'a', 'th', '[role="tab"]', 'label', 'h1', 'h2', 'h3', 'h4', 'dt', 'legend',
  'span[class*="rounded-full"]', 'span[class*="rounded-md"]', 'span[class*="rounded-lg"]',
].join(',');
const MIN_PX = 12;
const MAX_TEXT = 40;
const checked = new WeakMap<HTMLElement, string>();

/** Số dòng chữ thật (2 mẩu chữ chồng lấn theo chiều dọc = cùng 1 dòng) */
function countLines(el: HTMLElement): number {
  const lines: Array<{ top: number; bottom: number }> = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (!n.textContent || !n.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const rc = rects[i];
      if (rc.width < 2) continue;
      if (!lines.some(l => rc.top < l.bottom - 3 && rc.bottom > l.top + 3)) lines.push({ top: rc.top, bottom: rc.bottom });
    }
  }
  return lines.length;
}

/** Chữ con có cỡ khác phần tử cha (kiểu "8 (53%)" số to chữ nhỏ) → không co để giữ kiểu */
function hasMixedFontSizes(el: HTMLElement, base: string): boolean {
  const kids = el.querySelectorAll<HTMLElement>('*');
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    if (k instanceof SVGElement) continue;
    if (k.textContent && k.textContent.trim() && getComputedStyle(k).fontSize !== base) return true;
  }
  return false;
}

function overflows(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

function fitOne(el: HTMLElement) {
  if (!el.isConnected) return;
  const raw = el.innerText || '';
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text || text.length > MAX_TEXT || raw.trim().indexOf('\n') >= 0) return;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const sig = `${text}|${Math.round(rect.width)}|${window.innerWidth}`;
  if (checked.get(el) === sig) return;
  if (el.closest('[data-no-autofit],[contenteditable="true"]')) return;

  // đã chỉnh trước đó (vd. đổi kích thước cửa sổ) → trả về như cũ rồi đo lại
  if (el.dataset.autofit) {
    el.style.removeProperty('font-size');
    el.style.removeProperty('white-space');
    delete el.dataset.autofit;
  }
  // mẫu in / thiết kế tự đặt cỡ chữ, phông chữ → không đụng
  if (el.closest('[style*="font-size"],[style*="font-family"]')) { checked.set(el, sig); return; }

  const cs = getComputedStyle(el);
  const clipped = (cs.textOverflow === 'ellipsis' || cs.overflowX === 'hidden') && overflows(el);
  const wrapped = cs.whiteSpace !== 'nowrap' && countLines(el) > 1;
  if (!clipped && !wrapped) { checked.set(el, sig); return; }

  const base = cs.fontSize;
  let size = parseFloat(base);
  const mixed = hasMixedFontSizes(el, base);
  el.dataset.autofit = '1';
  el.style.whiteSpace = 'nowrap';
  const fits = () => !overflows(el) && countLines(el) <= 1;
  if (!mixed) {
    while (!fits() && size - 0.5 >= MIN_PX) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
  }
  if (!fits()) {
    // không vừa ở 12px → để xuống dòng như cũ (không cắt mất chữ)
    el.style.removeProperty('font-size');
    el.style.removeProperty('white-space');
    delete el.dataset.autofit;
  }
  checked.set(el, `${text}|${Math.round(el.getBoundingClientRect().width)}|${window.innerWidth}`);
}

function scan(root: ParentNode) {
  const list: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches(SELECTOR)) list.push(root);
  root.querySelectorAll<HTMLElement>(SELECTOR).forEach(el => list.push(el));
  for (const el of list) {
    try { fitOne(el); } catch (_) { /* bỏ qua phần tử lỗi */ }
  }
}

let installed = false;
export function installAutoFitText() {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;
  let pending = new Set<ParentNode>();
  let timer: number | undefined;
  const flush = () => {
    timer = undefined;
    const roots = Array.from(pending);
    pending = new Set();
    // gom: nếu có body thì quét cả trang 1 lần
    if (roots.some(r => r === document.body)) { scan(document.body); return; }
    roots.forEach(r => { if ((r as Node).isConnected) scan(r); });
  };
  const queue = (root: ParentNode) => {
    pending.add(root);
    if (timer === undefined) timer = window.setTimeout(flush, 250);
  };
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      const t = m.target.nodeType === 1 ? (m.target as HTMLElement) : m.target.parentElement;
      if (!t) continue;
      // phần tử do chính bộ co chữ sửa style → bỏ qua
      if (m.type === 'attributes') continue;
      queue(t.closest(SELECTOR)?.parentElement || t);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  let rt: number | undefined;
  window.addEventListener('resize', () => {
    if (rt) clearTimeout(rt);
    rt = window.setTimeout(() => queue(document.body), 300);
  });
  if (document.fonts?.ready) document.fonts.ready.then(() => queue(document.body)).catch(() => queue(document.body));
  queue(document.body);
}
