import React, { useLayoutEffect, useRef, useState } from 'react';

/**
 * A real A4 sheet for the class infographic.
 *
 * - The sheet is ALWAYS exactly A4 (794 x 1123 px portrait, 1123 x 794 landscape at 96 dpi), whatever the screen size, so the
 *   preview, the PNG and the PDF are identical and the PDF never has to shrink an oversized page.
 * - "Fit": if the content is taller than the sheet it is scaled down uniformly (centred, never below MIN_FIT), so everything
 *   fits the page without cutting or spilling onto "extra paper".
 * - On small screens the whole sheet is only scaled down for viewing (an ancestor transform); the exporters capture the
 *   sheet element itself, unscaled.
 */
export const A4_PORTRAIT = { w: 794, h: 1123 };
export const A4_LANDSCAPE = { w: 1123, h: 794 };
const MIN_FIT = 0.4;   // safety floor: very long lists shrink instead of being cut off
const MIN_TEXT_PX = 6;
const PARAGRAPH_CHARS = 44;

/**
 * No broken short text on the sheet: every short text (names, labels, numbers, phone numbers, subjects, chips) is kept on ONE
 * line; if the line is wider than the box it sits in, its font shrinks (down to MIN_TEXT_PX) until it fits. Only real
 * paragraphs (longer than PARAGRAPH_CHARS, or marked data-para) may wrap onto several lines.
 */
export function fitShortTexts(root: HTMLElement) {
  const sheetRect = root.getBoundingClientRect();
  root.querySelectorAll<HTMLElement>('*').forEach(el => {
    if (el.children.length > 0) return;
    if (el.closest('svg, input, textarea, select, [data-para]')) return;
    const txt = (el.textContent || '').trim();
    if (!txt || txt.length > PARAGRAPH_CHARS) return;
    delete el.dataset.wrap2;
    el.style.removeProperty('text-wrap-style');
    el.style.fontSize = '';
    el.style.whiteSpace = 'nowrap';
    el.style.textOverflow = 'clip';
    el.style.overflow = 'visible';
    const parent = el.parentElement;
    if (!parent) return;
    const box = (parent.closest('td, th, [class*="rounded"]') as HTMLElement | null) || root;
    const bs = getComputedStyle(box);
    const br = box.getBoundingClientRect();
    const scale = br.width && box.offsetWidth ? br.width / box.offsetWidth : 1;
    const limRight = br.right - (parseFloat(bs.paddingRight) + parseFloat(bs.borderRightWidth)) * scale;
    const limLeft = br.left + (parseFloat(bs.paddingLeft) + parseFloat(bs.borderLeftWidth)) * scale;
    const base = parseFloat(getComputedStyle(el).fontSize) || 12;
    const range = document.createRange();
    const overflows = () => {
      // measure the INK of the text (a block element always spans its container, so its own box says nothing)
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return r.right > limRight + 1 || r.left < limLeft - 1 || r.right > sheetRect.right - 0.5;
    };
    const lineCount = () => {
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].filter(x => x.width > 1).map(x => Math.round(x.top))).size;
    };
    // 1) one line: shrink gently (to 80% of the size, never below 8px)
    const singleMin = Math.max(8, base * 0.8);
    let fs = base;
    let guard = 0;
    while (overflows() && fs > singleMin && guard++ < 40) { fs -= 0.5; el.style.fontSize = `${fs}px`; }
    if (!overflows() || fs <= MIN_TEXT_PX) return;
    // 2) a very long text (a long full name): two balanced lines at the normal size, still no clipping
    if (/\s/.test(txt)) {
      el.style.fontSize = '';
      el.style.whiteSpace = 'normal';
      el.style.setProperty('text-wrap-style', 'balance');
      el.dataset.wrap2 = '1';
      fs = base;
      guard = 0;
      while ((overflows() || lineCount() > 2) && fs > 8 && guard++ < 40) { fs -= 0.5; el.style.fontSize = `${fs}px`; }
      return;
    }
    // 3) one long word: keep shrinking
    while (overflows() && fs > MIN_TEXT_PX && guard++ < 80) { fs -= 0.5; el.style.fontSize = `${fs}px`; }
  });
}

interface A4PageProps {
  orientation: 'portrait' | 'landscape';
  id?: string;
  innerRef?: React.Ref<HTMLDivElement>;
  fontFamily?: string;
  /** Anything that changes the content: re-runs the fit even if React did not re-render this component */
  fitKey?: unknown;
  children: React.ReactNode;
  /** reports the fit scale (1 = no shrink) so the toolbar can show it */
  onFit?: (k: number) => void;
}

export const A4Page: React.FC<A4PageProps> = ({ orientation, id, innerRef, fontFamily, fitKey, children, onFit }) => {
  const dim = orientation === 'landscape' ? A4_LANDSCAPE : A4_PORTRAIT;
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const fitRef = useRef<HTMLDivElement | null>(null);
  const lastK = useRef(1);

  const setRefs = (el: HTMLDivElement | null) => {
    sheetRef.current = el;
    if (typeof innerRef === 'function') innerRef(el);
    else if (innerRef && 'current' in innerRef) (innerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  const runFit = () => {
    const fit = fitRef.current;
    if (!fit) return;
    // Content keeps the sheet's logical width (images and charts grow with the width, so re-flowing wider would not help);
    // only its height is measured, then everything is scaled down uniformly (centred) when it does not fit.
    fit.style.width = `${dim.w}px`;
    fit.style.minHeight = `${dim.h}px`;
    fit.style.transform = 'none';
    fitShortTexts(fit);
    const H = fit.scrollHeight;
    const k = H <= dim.h + 0.5 ? 1 : Math.max(MIN_FIT, dim.h / H);
    fit.style.transform = k === 1 ? 'none' : `scale(${k})`;
    if (Math.abs(k - lastK.current) > 0.002) { lastK.current = k; onFit?.(k); }
  };

  // fonts arrive late: measure again once they are ready
  useLayoutEffect(() => { (document as any).fonts?.ready?.then(() => runFit()); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-fit after every render of the page (content or options changed) ...
  useLayoutEffect(() => {
    runFit();
    // layout (images, tables, fonts) settles a moment after render: measure once more
    const t1 = window.setTimeout(runFit, 160);
    const t2 = window.setTimeout(runFit, 520);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  });
  // ... and when the content resizes by itself (images, fonts, async data)
  useLayoutEffect(() => {
    const fit = fitRef.current;
    if (!fit || typeof ResizeObserver === 'undefined') return;
    let busy = false;
    const ro = new ResizeObserver(() => {
      if (busy) return;
      busy = true;
      requestAnimationFrame(() => { runFit(); busy = false; });
    });
    ro.observe(fit);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientation, fitKey]);

  // viewing scale: the whole sheet shrinks on screens narrower than the sheet
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState(1);
  useLayoutEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const update = () => {
      const avail = (el.parentElement?.clientWidth || dim.w) - 4;
      setView(Math.max(0.3, Math.min(1, avail / dim.w)));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [dim.w]);

  return (
    <div ref={holderRef} style={{ width: dim.w * view, height: dim.h * view, margin: '0 auto', flex: 'none' }}>
      <div style={{ width: dim.w, height: dim.h, transform: view === 1 ? undefined : `scale(${view})`, transformOrigin: 'top left' }}>
        <div
          ref={setRefs}
          id={id}
          className="bg-white text-slate-800 shadow-2xl rounded-2xl border border-slate-300 relative overflow-hidden"
          style={{ width: dim.w, height: dim.h, fontFamily: fontFamily || "'Be Vietnam Pro', system-ui, -apple-system, sans-serif", boxSizing: 'border-box' }}
          data-a4={orientation}
        >
          <div ref={fitRef} className={`flex flex-col justify-between ${orientation === 'landscape' ? 'p-5' : 'p-6'}`} style={{ transformOrigin: 'top center', boxSizing: 'border-box' }} data-fit>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default A4Page;
