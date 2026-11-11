import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, X, GripVertical, CheckCircle2, XCircle } from 'lucide-react';

/**
 * Bảng trả lời dùng chung cho trò chơi (Cuộn phim) và Chơi thử (11/2026):
 * - SequenceBoard: bấm các bước theo thứ tự → vào "Thứ tự của em"; trước khi trả lời có thể KÉO THẢ hoặc ↑ ↓ để đổi chỗ, × để bỏ.
 * - MatchingBoard: bấm ô cột A rồi bấm ô cột B để nối — vẽ ĐƯỜNG NỐI giữa hai ô; bấm lại ô A để nối lại.
 * Cả hai hiển thị được ảnh (sequenceImages, matchingPairs.leftImage / rightImage).
 */

export interface BoardItem { text: string; image?: string }

const ItemBody: React.FC<{ item: BoardItem; big?: boolean }> = ({ item, big }) => (
  <span className="flex items-center gap-2 min-w-0 flex-1">
    {item.image && <img src={item.image} alt={item.text || 'Ảnh'} className={`${big ? 'h-16 w-20' : 'h-12 w-16'} object-contain rounded-lg bg-white border border-slate-200 shrink-0`} draggable={false} />}
    {item.text && <span className="font-bold text-slate-900 leading-snug break-words min-w-0">{item.text}</span>}
  </span>
);

// ───────────────────────────── SẮP XẾP
interface SeqProps {
  items: BoardItem[];          // theo thứ tự ĐÚNG
  pool: number[];              // thứ tự hiển thị các bước (đã xáo)
  order: number[];             // thứ tự học sinh đã chọn (chỉ số trong items)
  onChange: (order: number[]) => void;
  locked?: boolean;            // đã kiểm tra → tô đúng / sai từng vị trí
  textSize?: string;
}

export const SequenceBoard: React.FC<SeqProps> = ({ items, pool, order, onChange, locked, textSize = 'text-base' }) => {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= order.length) return;
    const a = [...order]; const [x] = a.splice(from, 1); a.splice(to, 0, x); onChange(a);
  };
  const remaining = pool.filter(i => !order.includes(i));

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${textSize}`}>
      <div className="space-y-2">
        <p className="text-sm font-bold text-slate-700">① Bấm lần lượt các bước theo thứ tự:</p>
        {remaining.length === 0 && !locked && <p className="text-sm text-emerald-800 font-bold">Đã chọn đủ các bước. Có thể kéo thả để đổi chỗ rồi bấm Kiểm tra.</p>}
        {remaining.map(i => (
          <button key={i} type="button" disabled={locked} onClick={() => onChange([...order, i])}
            className="no-hover-fx w-full text-left rounded-xl border-2 border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50/40 px-3 py-2 flex items-center gap-2 disabled:opacity-50">
            <ItemBody item={items[i]} />
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-bold text-slate-700">② Thứ tự của em {order.length > 1 && !locked && <span className="font-normal text-slate-600">(kéo thả hoặc ↑ ↓ để đổi chỗ)</span>}</p>
        {order.length === 0 && <p className="text-sm text-slate-500 italic rounded-xl border-2 border-dashed border-slate-200 px-3 py-4 text-center">Chưa chọn bước nào</p>}
        {order.map((i, pos) => {
          const ok = locked ? i === pos : null;
          return (
            <div key={i}
              draggable={!locked}
              onDragStart={(e) => { setDragFrom(pos); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { if (dragFrom === null) return; e.preventDefault(); setDragOver(pos); }}
              onDragLeave={() => setDragOver(d => (d === pos ? null : d))}
              onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) move(dragFrom, pos); setDragFrom(null); setDragOver(null); }}
              onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
              className={`rounded-xl border-2 px-2 py-2 flex items-center gap-2 transition-colors ${
                ok === true ? 'border-emerald-600 bg-emerald-50' : ok === false ? 'border-rose-600 bg-rose-50'
                  : dragOver === pos ? 'border-indigo-600 bg-indigo-100' : dragFrom === pos ? 'border-indigo-300 bg-indigo-50 opacity-60' : 'border-indigo-300 bg-indigo-50'
              } ${!locked ? 'cursor-grab active:cursor-grabbing' : ''}`}>
              {!locked && <GripVertical className="w-4 h-4 text-indigo-400 shrink-0" />}
              <span className={`w-7 h-7 rounded-lg text-sm font-black inline-flex items-center justify-center shrink-0 ${ok === true ? 'bg-emerald-600 text-white' : ok === false ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>{pos + 1}</span>
              <ItemBody item={items[i]} />
              {locked ? (ok ? <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" /> : <XCircle className="w-5 h-5 text-rose-700 shrink-0" />) : (
                <span className="flex items-center gap-0.5 shrink-0">
                  <button type="button" onClick={() => move(pos, pos - 1)} disabled={pos === 0} aria-label="Đưa lên" title="Đưa lên" className="no-hover-fx w-8 h-8 rounded-lg hover:bg-white text-slate-700 inline-flex items-center justify-center disabled:opacity-25"><ArrowUp className="w-4 h-4" /></button>
                  <button type="button" onClick={() => move(pos, pos + 1)} disabled={pos === order.length - 1} aria-label="Đưa xuống" title="Đưa xuống" className="no-hover-fx w-8 h-8 rounded-lg hover:bg-white text-slate-700 inline-flex items-center justify-center disabled:opacity-25"><ArrowDown className="w-4 h-4" /></button>
                  <button type="button" onClick={() => onChange(order.filter(x => x !== i))} aria-label="Bỏ bước này" title="Bỏ bước này" className="no-hover-fx w-8 h-8 rounded-lg hover:bg-rose-100 text-rose-700 inline-flex items-center justify-center"><X className="w-4 h-4" /></button>
                </span>
              )}
            </div>
          );
        })}
        {locked && order.some((v, p) => v !== p) && (
          <div className="rounded-xl bg-white border border-slate-200 p-2.5 text-sm text-slate-800">
            <strong>Thứ tự đúng:</strong> {items.map((it, k) => `${k + 1}. ${it.text || '(ảnh)'}`).join('  ·  ')}
          </div>
        )}
      </div>
    </div>
  );
};

// ───────────────────────────── NỐI CỘT
interface MatchProps {
  left: BoardItem[];            // cột A theo cặp gốc (chỉ số i ↔ right[i] là đúng)
  right: BoardItem[];
  leftOrder: number[];          // thứ tự hiển thị (đã xáo)
  rightOrder: number[];
  matches: Record<number, number>;   // leftIdx → rightIdx
  selected: number | null;           // ô cột A đang chọn
  onSelect: (leftIdx: number | null) => void;
  onMatch: (leftIdx: number, rightIdx: number) => void;
  onUnmatch: (leftIdx: number) => void;
  locked?: boolean;
}

const LINE_COLORS = ['#4f46e5', '#0891b2', '#c026d3', '#ea580c', '#16a34a', '#db2777', '#2563eb', '#ca8a04'];

export const MatchingBoard: React.FC<MatchProps> = ({ left, right, leftOrder, rightOrder, matches, selected, onSelect, onMatch, onUnmatch, locked }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const leftRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const rightRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const [lines, setLines] = useState<Array<{ l: number; x1: number; y1: number; x2: number; y2: number }>>([]);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const box = wrap.getBoundingClientRect();
    const out: typeof lines = [];
    Object.entries(matches).forEach(([l, r]) => {
      const a = leftRefs.current[Number(l)], b = rightRefs.current[r];
      if (!a || !b) return;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      out.push({ l: Number(l), x1: ra.right - box.left, y1: ra.top + ra.height / 2 - box.top, x2: rb.left - box.left, y2: rb.top + rb.height / 2 - box.top });
    });
    setLines(out);
  }, [matches]);

  useLayoutEffect(() => {
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener('resize', measure);
    const t = setTimeout(measure, 300); // ảnh tải xong làm đổi chiều cao
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); clearTimeout(t); };
  }, [measure]);

  const colorOf = (l: number) => {
    if (locked) return matches[l] === l ? '#059669' : '#e11d48';
    const order = leftOrder.filter(x => matches[x] !== undefined);
    return LINE_COLORS[order.indexOf(l) % LINE_COLORS.length];
  };
  const ownerOf = (r: number) => { const k = Object.keys(matches).find(x => matches[Number(x)] === r); return k === undefined ? undefined : Number(k); };

  return (
    <div ref={wrapRef} className="relative grid grid-cols-2 gap-x-14 sm:gap-x-20 gap-y-0">
      <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" aria-hidden>
        {lines.map(ln => {
          const c = colorOf(ln.l);
          const dx = (ln.x2 - ln.x1) / 2;
          return (
            <g key={ln.l}>
              <path d={`M ${ln.x1} ${ln.y1} C ${ln.x1 + dx} ${ln.y1}, ${ln.x2 - dx} ${ln.y2}, ${ln.x2} ${ln.y2}`} fill="none" stroke={c} strokeWidth={3.5} strokeLinecap="round" />
              <circle cx={ln.x1} cy={ln.y1} r={5} fill={c} />
              <circle cx={ln.x2} cy={ln.y2} r={5} fill={c} />
            </g>
          );
        })}
      </svg>
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-wide text-amber-800">Cột A</p>
        {leftOrder.map((li, pos) => {
          const matched = matches[li] !== undefined;
          const ok = locked && matched ? matches[li] === li : null;
          const c = matched ? colorOf(li) : undefined;
          return (
            <button key={li} ref={el => { leftRefs.current[li] = el; }} type="button" disabled={locked}
              onClick={() => { if (matched) onUnmatch(li); onSelect(selected === li && !matched ? null : li); }}
              style={c ? { borderColor: c } : undefined}
              className={`no-hover-fx relative z-[1] w-full text-left rounded-xl border-2 px-2.5 py-2 flex items-center gap-2 min-h-12 transition-colors ${
                ok === true ? 'bg-emerald-50' : ok === false ? 'bg-rose-50' : selected === li ? 'border-indigo-600 bg-indigo-100 ring-2 ring-indigo-300' : matched ? 'bg-white' : 'border-slate-200 bg-white hover:border-indigo-400'
              }`}>
              <span className="w-7 h-7 rounded-lg bg-amber-500 text-white text-xs font-black inline-flex items-center justify-center shrink-0">A{pos + 1}</span>
              <ItemBody item={left[li]} />
            </button>
          );
        })}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-wide text-sky-800">Cột B</p>
        {rightOrder.map((ri, pos) => {
          const owner = ownerOf(ri);
          const c = owner !== undefined ? colorOf(owner) : undefined;
          return (
            <button key={ri} ref={el => { rightRefs.current[ri] = el; }} type="button" disabled={locked || selected === null}
              onClick={() => {
                if (selected === null) return;
                if (owner !== undefined) onUnmatch(owner);
                onMatch(selected, ri);
                onSelect(null);
              }}
              style={c ? { borderColor: c } : undefined}
              className={`no-hover-fx relative z-[1] w-full text-left rounded-xl border-2 px-2.5 py-2 flex items-center gap-2 min-h-12 transition-colors disabled:cursor-default ${
                owner !== undefined ? 'bg-white' : selected !== null ? 'border-sky-400 bg-sky-50 hover:bg-sky-100' : 'border-slate-200 bg-white'
              }`}>
              <span className="w-7 h-7 rounded-lg bg-sky-600 text-white text-xs font-black inline-flex items-center justify-center shrink-0">B{pos + 1}</span>
              <ItemBody item={right[ri]} />
            </button>
          );
        })}
      </div>
    </div>
  );
};
