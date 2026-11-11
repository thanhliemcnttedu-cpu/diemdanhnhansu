import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleDot, ListChecks, ToggleLeft, TextCursorInput, ListOrdered, Link2, MessageSquareText,
  Plus, Trash2, Check, X, Save, ArrowUp, ArrowDown, Eye, Lightbulb, Coins, BookOpen, AlertTriangle, Volume2,
} from 'lucide-react';
import type { QuestionItem, QuestionType, QuestionMatchingPair } from '../../../types';
import { ImageSlot, AudioSlot, imageFromClipboardEvent, imageFileToDataUrl } from './MediaInputs';
import { QuestionPlayer } from './QuestionPlayer';
import { Play } from 'lucide-react';

/**
 * ✏️ TRÌNH SOẠN CÂU HỎI (thiết kế lại 11/2026, theo góc nhìn giáo viên):
 * - Mở to gần toàn màn hình: bên trái soạn, bên phải XEM TRƯỚC như học sinh thấy (cập nhật ngay).
 * - Chọn dạng câu bằng thẻ có biểu tượng + mô tả; đổi dạng giữ lại nội dung chung.
 * - Ô trống thật (không còn chữ mẫu "Phương án A" phải xóa); bấm chữ cái để đánh dấu đáp án đúng.
 * - Ảnh: dán Ctrl+V (vào ô ảnh, hoặc đang gõ ở ô phương án nào thì ảnh vào phương án đó), kéo thả, chọn tệp, link.
 * - Âm thanh câu hỏi: ghi âm bằng micro hoặc chọn tệp (`audio`).
 * - Điền chỗ trống: nút "Chèn chỗ trống" + ô đáp án cho từng chỗ; từ gây nhiễu nhập dạng thẻ.
 * - Lưu / Lưu & soạn câu tiếp; Ctrl + Enter để lưu. Kiểm tra thiếu sót trước khi lưu.
 * Dữ liệu giữ nguyên cấu trúc QuestionItem (trò chơi đọc như cũ).
 */

const LETTERS = 'ABCDEF';
const BLANK_RE = /\[[^\]]*\]/g;

const TYPES: Array<{ id: QuestionType; label: string; desc: string; icon: React.ElementType }> = [
  { id: 'multiple_choice', label: 'Một đáp án', desc: 'Chọn 1 đáp án đúng', icon: CircleDot },
  { id: 'multi_select', label: 'Nhiều đáp án', desc: 'Chọn tất cả đáp án đúng', icon: ListChecks },
  { id: 'true_false', label: 'Đúng / Sai', desc: 'Nhận định đúng hay sai', icon: ToggleLeft },
  { id: 'fill_blank', label: 'Điền chỗ trống', desc: 'Kéo từ vào ô trống', icon: TextCursorInput },
  { id: 'sequence_order', label: 'Sắp xếp', desc: 'Xếp các bước đúng thứ tự', icon: ListOrdered },
  { id: 'matching', label: 'Nối cột', desc: 'Nối cột A với cột B', icon: Link2 },
  { id: 'oral', label: 'Trả lời miệng', desc: 'Tự luận, giáo viên chấm', icon: MessageSquareText },
];
export const typeLabel = (t: QuestionType) => TYPES.find(x => x.id === t)?.label || t;

/** Chuẩn hóa câu hỏi theo dạng: đủ mảng cần thiết, giữ nội dung đang có */
function shapeFor(q: QuestionItem, type: QuestionType): QuestionItem {
  const next: QuestionItem = { ...q, type };
  if (type === 'multiple_choice' || type === 'multi_select') {
    const opts = q.options && q.options.length >= 2 ? [...q.options] : ['', '', '', ''];
    next.options = opts;
    next.optionImages = opts.map((_, i) => q.optionImages?.[i] || '');
    if (type === 'multiple_choice') next.correctOptionIndex = Math.min(q.correctOptionIndex ?? 0, opts.length - 1);
    else next.correctOptionIndices = (q.correctOptionIndices || (q.correctOptionIndex !== undefined ? [q.correctOptionIndex] : [])).filter(i => i < opts.length);
  } else if (type === 'true_false') {
    next.isTrue = q.isTrue ?? true;
  } else if (type === 'fill_blank') {
    next.blankAnswers = q.blankAnswers || [];
    next.distractorWords = q.distractorWords || [];
  } else if (type === 'sequence_order') {
    next.sequenceItems = q.sequenceItems && q.sequenceItems.length ? [...q.sequenceItems] : ['', '', ''];
  } else if (type === 'matching') {
    next.matchingPairs = q.matchingPairs && q.matchingPairs.length ? q.matchingPairs.map(p => ({ ...p })) : [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }];
  }
  return next;
}

/** Kiểm tra + làm gọn trước khi lưu. Trả về lỗi (chuỗi) hoặc câu hỏi đã làm gọn. */
function finalize(q: QuestionItem): { error?: string; section?: string; question?: QuestionItem } {
  const out: QuestionItem = { ...q, questionText: (q.questionText || '').trim(), subject: (q.subject || '').trim() || 'Tổng hợp' };
  if (!out.questionText && !out.image && !out.audio) return { error: 'Hãy nhập nội dung câu hỏi, hoặc chèn ảnh / âm thanh làm câu hỏi.', section: 'question' };
  if (q.type === 'multiple_choice' || q.type === 'multi_select') {
    const opts = (q.options || []).map((t, i) => ({ t: (t || '').trim(), img: q.optionImages?.[i] || '', i }));
    const kept = opts.filter(o => o.t || o.img);
    if (kept.length < 2) return { error: 'Cần ít nhất 2 phương án (có chữ hoặc ảnh).', section: 'answers' };
    const map = new Map(kept.map((o, ni) => [o.i, ni]));
    out.options = kept.map(o => o.t);
    out.optionImages = kept.map(o => o.img);
    if (q.type === 'multiple_choice') {
      const ci = map.get(q.correctOptionIndex ?? -1);
      if (ci === undefined) return { error: 'Hãy bấm vào chữ cái của phương án ĐÚNG.', section: 'answers' };
      out.correctOptionIndex = ci;
    } else {
      const cis = (q.correctOptionIndices || []).map(i => map.get(i)).filter((x): x is number => x !== undefined);
      if (!cis.length) return { error: 'Hãy đánh dấu ít nhất 1 phương án ĐÚNG.', section: 'answers' };
      out.correctOptionIndices = Array.from(new Set(cis)).sort((a, b) => a - b);
    }
  } else if (q.type === 'fill_blank') {
    const n = (out.questionText.match(BLANK_RE) || []).length;
    if (!n) return { error: 'Câu điền chỗ trống cần ít nhất 1 chỗ trống — bấm "Chèn chỗ trống" trong nội dung câu hỏi.', section: 'question' };
    const ans = (q.blankAnswers || []).slice(0, n).map(a => (a || '').trim());
    if (ans.length < n || ans.some(a => !a)) return { error: `Hãy nhập đủ từ đúng cho ${n} chỗ trống.`, section: 'answers' };
    out.blankAnswers = ans;
    out.distractorWords = (q.distractorWords || []).map(w => w.trim()).filter(Boolean);
  } else if (q.type === 'sequence_order') {
    const items = (q.sequenceItems || []).map(s => (s || '').trim()).filter(Boolean);
    if (items.length < 2) return { error: 'Cần ít nhất 2 bước để sắp xếp.', section: 'answers' };
    out.sequenceItems = items;
  } else if (q.type === 'matching') {
    const pairs = (q.matchingPairs || []).map(p => ({ left: (p.left || '').trim(), right: (p.right || '').trim() }));
    if (pairs.some(p => (p.left && !p.right) || (!p.left && p.right))) return { error: 'Có cặp nối mới nhập 1 bên — hãy nhập đủ cả cột A và cột B (hoặc xóa cặp đó).', section: 'answers' };
    const full = pairs.filter(p => p.left && p.right);
    if (full.length < 2) return { error: 'Cần ít nhất 2 cặp nối.', section: 'answers' };
    out.matchingPairs = full;
  }
  out.teacherAnswerKey = (q.teacherAnswerKey || '').trim();
  if (!out.image) delete out.image;
  if (!out.answerImage) delete out.answerImage;
  if (!out.audio) delete out.audio;
  return { question: out };
}

interface Props {
  question: QuestionItem;
  isNew: boolean;
  subjects: string[];
  onCancel: () => void;
  onSave: (q: QuestionItem, addAnother: boolean) => void;
}

export const QuestionEditor: React.FC<Props> = ({ question, isNew, subjects, onCancel, onSave }) => {
  const [q, setQ] = useState<QuestionItem>(() => shapeFor(question, question.type || 'multiple_choice'));
  const [active, setActive] = useState<string>('image');
  const [error, setError] = useState<{ text: string; section?: string } | null>(null);
  const [note, setNote] = useState('');
  const [showPreviewMobile, setShowPreviewMobile] = useState(false);
  const [tryQ, setTryQ] = useState<QuestionItem | null>(null); // Chơi thử câu đang soạn
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [distractorDraft, setDistractorDraft] = useState('');
  const initialJson = useRef(JSON.stringify(question));

  useEffect(() => { setQ(shapeFor(question, question.type || 'multiple_choice')); initialJson.current = JSON.stringify(question); setError(null); }, [question]);

  const patch = (p: Partial<QuestionItem>) => { setQ(prev => ({ ...prev, ...p })); setError(null); };
  const flash = (t: string) => { setNote(t); window.setTimeout(() => setNote(n => (n === t ? '' : n)), 3000); };
  const fail = (t: string) => setError({ text: t });

  const blanks = useMemo(() => (q.questionText.match(BLANK_RE) || []).length, [q.questionText]);

  // ---- ảnh vào đúng ô
  const setSlotImage = (slot: string, v: string | undefined) => {
    if (slot === 'image') patch({ image: v });
    else if (slot === 'answer') patch({ answerImage: v });
    else if (slot.startsWith('opt-')) {
      const i = Number(slot.slice(4));
      setQ(prev => { const imgs = [...(prev.optionImages || [])]; while (imgs.length <= i) imgs.push(''); imgs[i] = v || ''; return { ...prev, optionImages: imgs }; });
    }
  };
  const slotLabel = (slot: string) => slot === 'image' ? 'ảnh câu hỏi' : slot === 'answer' ? 'ảnh lời giải' : `ảnh phương án ${LETTERS[Number(slot.slice(4))] || ''}`;
  const onRootPaste = async (e: React.ClipboardEvent) => {
    const file = imageFromClipboardEvent(e);
    if (!file) return;
    const text = e.clipboardData.getData('text/plain');
    const target = e.target as HTMLElement;
    const inField = target.closest('input, textarea');
    if (inField && text.trim()) return; // dán chữ (kể cả từ Word) → giữ nguyên hành vi dán chữ
    e.preventDefault();
    const slot = (target.closest('[data-paste-slot]') as HTMLElement | null)?.dataset.pasteSlot || active || 'image';
    const max = slot.startsWith('opt-') ? 600 : 1280;
    try { setSlotImage(slot, await imageFileToDataUrl(file, max)); setActive(slot); flash(`Đã dán ảnh vào ${slotLabel(slot)}.`); } catch (err: any) { fail(err?.message || 'Không dán được ảnh.'); }
  };

  // ---- đổi dạng câu
  const changeType = (t: QuestionType) => { if (t !== q.type) { setQ(prev => shapeFor(prev, t)); setError(null); } };

  // ---- phương án
  const opts = q.options || [];
  const setOpt = (i: number, v: string) => setQ(prev => { const o = [...(prev.options || [])]; o[i] = v; return { ...prev, options: o }; });
  const isCorrect = (i: number) => q.type === 'multiple_choice' ? q.correctOptionIndex === i : (q.correctOptionIndices || []).includes(i);
  const toggleCorrect = (i: number) => {
    setError(null);
    if (q.type === 'multiple_choice') patch({ correctOptionIndex: i });
    else { const cur = q.correctOptionIndices || []; patch({ correctOptionIndices: cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i].sort((a, b) => a - b) }); }
  };
  const addOpt = () => { if (opts.length >= 6) return; setQ(prev => ({ ...prev, options: [...(prev.options || []), ''], optionImages: [...(prev.optionImages || []), ''] })); };
  const removeOpt = (i: number) => {
    if (opts.length <= 2) return;
    setQ(prev => {
      const shift = (x: number) => (x > i ? x - 1 : x);
      return {
        ...prev,
        options: (prev.options || []).filter((_, k) => k !== i),
        optionImages: (prev.optionImages || []).filter((_, k) => k !== i),
        correctOptionIndex: prev.correctOptionIndex === i ? 0 : shift(prev.correctOptionIndex ?? 0),
        correctOptionIndices: (prev.correctOptionIndices || []).filter(x => x !== i).map(shift),
      };
    });
  };

  // ---- chỗ trống
  const insertBlank = () => {
    const el = textRef.current;
    const t = q.questionText;
    const s = el ? el.selectionStart : t.length, en = el ? el.selectionEnd : t.length;
    const sel = t.slice(s, en).trim();
    const before = t.slice(0, s), after = t.slice(en);
    const pad = (x: string, side: 'l' | 'r') => (side === 'l' ? (x && !/\s$/.test(x) ? ' ' : '') : (x && !/^[\s.,;:!?)\]]/.test(x) ? ' ' : ''));
    const marker = '[___]';
    const nextText = `${before}${pad(before, 'l')}${marker}${pad(after, 'r')}${after}`;
    // chỗ trống thứ mấy → nếu đang bôi đen 1 từ thì từ đó thành đáp án của chỗ trống
    const idx = (before.match(BLANK_RE) || []).length;
    const ans = [...(q.blankAnswers || [])];
    ans.splice(idx, 0, sel || '');
    patch({ questionText: nextText, blankAnswers: ans });
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = before.length + pad(before, 'l').length + marker.length;
      el.focus(); el.setSelectionRange(pos, pos);
    });
  };
  const addDistractor = (raw: string) => {
    const words = raw.split(/[,;\n]/).map(w => w.trim()).filter(Boolean);
    if (!words.length) return;
    const cur = q.distractorWords || [];
    patch({ distractorWords: [...cur, ...words.filter(w => !cur.includes(w))] });
    setDistractorDraft('');
  };

  // ---- sắp xếp / nối
  const seq = q.sequenceItems || [];
  const moveSeq = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= seq.length) return; const a = [...seq]; [a[i], a[j]] = [a[j], a[i]]; patch({ sequenceItems: a }); };
  const pairs = q.matchingPairs || [];
  const setPair = (i: number, side: keyof QuestionMatchingPair, v: string) => { const a = pairs.map(p => ({ ...p })); a[i][side] = v; patch({ matchingPairs: a }); };

  // ---- lưu
  const save = (addAnother: boolean) => {
    const r = finalize(q);
    if (r.error || !r.question) {
      setError({ text: r.error || 'Chưa lưu được.', section: r.section });
      document.getElementById(`qe-${r.section || 'question'}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    onSave(r.question, addAnother);
  };
  const tryPlay = () => {
    const r = finalize(q);
    if (r.error || !r.question) {
      setError({ text: `Chưa chơi thử được: ${r.error}`, section: r.section });
      document.getElementById(`qe-${r.section || 'question'}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setTryQ(r.question);
  };
  const cancel = () => {
    if (JSON.stringify(q) !== initialJson.current && (q.questionText || q.image || (q.options || []).some(Boolean))) {
      if (!confirm('Bỏ các thay đổi chưa lưu của câu hỏi này?')) return;
    }
    onCancel();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const label = 'block text-xs font-black uppercase tracking-wide text-slate-700 mb-1.5';
  const input = 'w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
  const smallBtn = 'no-hover-fx h-9 px-3 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 whitespace-nowrap';
  const iconBtn = 'no-hover-fx w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0 disabled:opacity-30';

  return (
    <div className="fixed inset-0 z-[55] bg-sky-900/20 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="qe-title" onPaste={onRootPaste}>
      <div className="bg-white w-full max-w-6xl h-[96vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Đầu: tiêu đề + dạng câu */}
        <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-slate-100 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center shrink-0"><BookOpen className="w-5 h-5" /></div>
            <div className="flex-1 min-w-0">
              <h2 id="qe-title" className="text-base font-black text-slate-900">{isNew ? 'Soạn câu hỏi mới' : 'Sửa câu hỏi'}</h2>
              <p className="text-sm text-slate-600 hidden sm:block">Dán ảnh bằng <kbd className="px-1 rounded border border-slate-300 bg-slate-50 font-sans text-xs">Ctrl+V</kbd> · lưu nhanh <kbd className="px-1 rounded border border-slate-300 bg-slate-50 font-sans text-xs">Ctrl+Enter</kbd></p>
            </div>
            <button type="button" onClick={() => setShowPreviewMobile(v => !v)} className={`${smallBtn} lg:hidden border border-slate-300 bg-white text-slate-700`}><Eye className="w-4 h-4" /> {showPreviewMobile ? 'Soạn' : 'Xem trước'}</button>
            <button type="button" onClick={cancel} aria-label="Đóng" className={`${iconBtn} hover:bg-slate-100 text-slate-600`}><X className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5" role="radiogroup" aria-label="Dạng câu hỏi">
            {TYPES.map(t => {
              const Icon = t.icon; const on = q.type === t.id;
              return (
                <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => changeType(t.id)} title={t.desc}
                  className={`no-hover-fx rounded-xl border-2 px-2 py-2 flex flex-col items-center gap-1 text-center transition-colors ${on ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'}`}>
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-black leading-tight">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Thân: soạn | xem trước */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className={`overflow-y-auto px-4 sm:px-5 py-4 space-y-5 ${showPreviewMobile ? 'hidden lg:block' : ''}`}>
            {/* Câu hỏi */}
            <section id="qe-question" className="space-y-2.5">
              <div className="flex flex-wrap items-end gap-2">
                <label htmlFor="qe-text" className={`${label} mb-0 mr-auto`}>Nội dung câu hỏi</label>
                {q.type === 'fill_blank' && (
                  <button type="button" onClick={insertBlank} className={`${smallBtn} bg-purple-600 hover:bg-purple-700 text-white`} title="Chèn ô trống tại vị trí con trỏ. Bôi đen 1 từ rồi bấm: từ đó thành đáp án.">
                    <Plus className="w-4 h-4" /> Chèn chỗ trống
                  </button>
                )}
              </div>
              <textarea id="qe-text" ref={textRef} data-paste-slot="image" rows={3} value={q.questionText}
                onChange={(e) => patch({ questionText: e.target.value })}
                placeholder={q.type === 'fill_blank' ? 'Ví dụ: Thủ đô của Việt Nam là [___]. (bôi đen một từ rồi bấm "Chèn chỗ trống")' : 'Nhập câu hỏi… (có thể bỏ trống nếu dùng ảnh / âm thanh làm câu hỏi)'}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-base text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 resize-y" />
              {q.type === 'fill_blank' && (
                <p className="text-sm text-slate-600">Chỗ trống ghi là <code className="px-1 rounded bg-slate-100">[___]</code>. Hiện có <strong>{blanks}</strong> chỗ trống.</p>
              )}
              <ImageSlot value={q.image} onChange={(v) => patch({ image: v })} label="Ảnh câu hỏi / ảnh minh họa" slotKey="image" active={active === 'image'} onActivate={setActive} onError={fail} />
              <AudioSlot value={q.audio} onChange={(v) => patch({ audio: v })} onError={fail} />
            </section>

            {/* Đáp án theo dạng */}
            <section id="qe-answers" className="space-y-2.5">
              {(q.type === 'multiple_choice' || q.type === 'multi_select') && (
                <>
                  <div className="flex flex-wrap items-end gap-2">
                    <span className={`${label} mb-0 mr-auto`}>Các phương án</span>
                    <span className="text-sm text-slate-600">{q.type === 'multiple_choice' ? 'Bấm chữ cái để chọn đáp án ĐÚNG' : 'Bấm chữ cái để đánh dấu các đáp án ĐÚNG'}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {opts.map((o, i) => {
                      const ok = isCorrect(i);
                      return (
                        <div key={i} className={`rounded-2xl border-2 p-2.5 space-y-2 transition-colors ${ok ? 'border-emerald-500 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => toggleCorrect(i)} aria-pressed={ok} title={ok ? 'Đáp án đúng (bấm để bỏ)' : 'Bấm để chọn làm đáp án đúng'}
                              className={`no-hover-fx w-10 h-10 rounded-xl text-base font-black shrink-0 inline-flex items-center justify-center border-2 transition-colors ${ok ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-emerald-500'}`}>
                              {ok ? <Check className="w-5 h-5" /> : LETTERS[i]}
                            </button>
                            <input value={o} data-paste-slot={`opt-${i}`} onFocus={() => setActive(`opt-${i}`)} onChange={(e) => setOpt(i, e.target.value)}
                              placeholder={`Phương án ${LETTERS[i]}${q.optionImages?.[i] ? ' (có thể chỉ dùng ảnh)' : ''}`} className={input} aria-label={`Phương án ${LETTERS[i]}`} />
                            <button type="button" onClick={() => removeOpt(i)} disabled={opts.length <= 2} title="Xóa phương án" aria-label={`Xóa phương án ${LETTERS[i]}`} className={`${iconBtn} text-rose-700 hover:bg-rose-50`}><Trash2 className="w-4 h-4" /></button>
                          </div>
                          <ImageSlot compact value={q.optionImages?.[i] || undefined} onChange={(v) => setSlotImage(`opt-${i}`, v)} label={`Ảnh phương án ${LETTERS[i]}`} maxSide={600} slotKey={`opt-${i}`} active={active === `opt-${i}`} onActivate={setActive} onError={fail} />
                        </div>
                      );
                    })}
                  </div>
                  {opts.length < 6 && <button type="button" onClick={addOpt} className={`${smallBtn} border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50`}><Plus className="w-4 h-4" /> Thêm phương án {LETTERS[opts.length]}</button>}
                </>
              )}

              {q.type === 'true_false' && (
                <>
                  <span className={label}>Nhận định trên là</span>
                  <div className="grid grid-cols-2 gap-3 max-w-md">
                    {[true, false].map(v => {
                      const on = (q.isTrue ?? true) === v;
                      return (
                        <button key={String(v)} type="button" onClick={() => patch({ isTrue: v })} aria-pressed={on}
                          className={`no-hover-fx h-16 rounded-2xl border-2 text-lg font-black inline-flex items-center justify-center gap-2 ${on ? (v ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-rose-600 border-rose-600 text-white') : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'}`}>
                          {on && <Check className="w-5 h-5" />} {v ? 'ĐÚNG' : 'SAI'}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {q.type === 'fill_blank' && (
                <>
                  <span className={label}>Từ đúng cho từng chỗ trống</span>
                  {blanks === 0 ? (
                    <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Chưa có chỗ trống. Đặt con trỏ vào nội dung câu hỏi (hoặc bôi đen từ cần ẩn) rồi bấm <strong>Chèn chỗ trống</strong>.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Array.from({ length: blanks }).map((_, i) => (
                        <label key={i} className="flex items-center gap-2">
                          <span className="w-9 h-9 rounded-xl bg-purple-600 text-white text-sm font-black inline-flex items-center justify-center shrink-0">{i + 1}</span>
                          <input value={q.blankAnswers?.[i] || ''} onChange={(e) => { const a = [...(q.blankAnswers || [])]; while (a.length <= i) a.push(''); a[i] = e.target.value; patch({ blankAnswers: a }); }}
                            placeholder={`Từ đúng của chỗ trống ${i + 1}`} className={input} />
                        </label>
                      ))}
                    </div>
                  )}
                  <span className={`${label} pt-2`}>Từ gây nhiễu (thêm lựa chọn sai để học sinh suy nghĩ)</span>
                  <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-300 bg-white p-1.5 min-h-[44px]">
                    {(q.distractorWords || []).map(w => (
                      <span key={w} className="inline-flex items-center gap-1 h-8 pl-2.5 pr-1 rounded-lg bg-slate-100 text-sm font-bold text-slate-800">
                        {w}
                        <button type="button" onClick={() => patch({ distractorWords: (q.distractorWords || []).filter(x => x !== w) })} aria-label={`Bỏ từ ${w}`} className="no-hover-fx w-6 h-6 rounded-md hover:bg-slate-200 inline-flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
                      </span>
                    ))}
                    <input value={distractorDraft} onChange={(e) => setDistractorDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addDistractor(distractorDraft); } else if (e.key === 'Backspace' && !distractorDraft && (q.distractorWords || []).length) patch({ distractorWords: (q.distractorWords || []).slice(0, -1) }); }}
                      onBlur={() => addDistractor(distractorDraft)}
                      placeholder="Gõ từ rồi nhấn Enter…" className="flex-1 min-w-[160px] h-8 px-2 text-sm focus:outline-none" aria-label="Thêm từ gây nhiễu" />
                  </div>
                </>
              )}

              {q.type === 'sequence_order' && (
                <>
                  <div className="flex flex-wrap items-end gap-2">
                    <span className={`${label} mb-0 mr-auto`}>Các bước theo THỨ TỰ ĐÚNG</span>
                    <span className="text-sm text-slate-600">Khi chơi, phần mềm tự xáo trộn</span>
                  </div>
                  <div className="space-y-2">
                    {seq.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-9 h-9 rounded-xl bg-indigo-600 text-white text-sm font-black inline-flex items-center justify-center shrink-0">{i + 1}</span>
                        <input value={s} onChange={(e) => { const a = [...seq]; a[i] = e.target.value; patch({ sequenceItems: a }); }} placeholder={`Bước ${i + 1}`} className={input} aria-label={`Bước ${i + 1}`} />
                        <button type="button" onClick={() => moveSeq(i, -1)} disabled={i === 0} title="Đưa lên" aria-label={`Đưa bước ${i + 1} lên`} className={`${iconBtn} text-slate-600 hover:bg-slate-100`}><ArrowUp className="w-4 h-4" /></button>
                        <button type="button" onClick={() => moveSeq(i, 1)} disabled={i === seq.length - 1} title="Đưa xuống" aria-label={`Đưa bước ${i + 1} xuống`} className={`${iconBtn} text-slate-600 hover:bg-slate-100`}><ArrowDown className="w-4 h-4" /></button>
                        <button type="button" onClick={() => patch({ sequenceItems: seq.filter((_, k) => k !== i) })} disabled={seq.length <= 2} title="Xóa bước" aria-label={`Xóa bước ${i + 1}`} className={`${iconBtn} text-rose-700 hover:bg-rose-50`}><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => patch({ sequenceItems: [...seq, ''] })} className={`${smallBtn} border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50`}><Plus className="w-4 h-4" /> Thêm bước</button>
                </>
              )}

              {q.type === 'matching' && (
                <>
                  <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
                    <span className={`${label} mb-0`}>Cột A</span><span />
                    <span className={`${label} mb-0`}>Cột B (nối đúng)</span><span />
                    {pairs.map((p, i) => (
                      <React.Fragment key={i}>
                        <input value={p.left} onChange={(e) => setPair(i, 'left', e.target.value)} placeholder={`A${i + 1}`} className={input} aria-label={`Cột A dòng ${i + 1}`} />
                        <Link2 className="w-4 h-4 text-slate-400" />
                        <input value={p.right} onChange={(e) => setPair(i, 'right', e.target.value)} placeholder={`B${i + 1}`} className={input} aria-label={`Cột B dòng ${i + 1}`} />
                        <button type="button" onClick={() => patch({ matchingPairs: pairs.filter((_, k) => k !== i) })} disabled={pairs.length <= 2} title="Xóa cặp" aria-label={`Xóa cặp ${i + 1}`} className={`${iconBtn} text-rose-700 hover:bg-rose-50`}><Trash2 className="w-4 h-4" /></button>
                      </React.Fragment>
                    ))}
                  </div>
                  <button type="button" onClick={() => patch({ matchingPairs: [...pairs, { left: '', right: '' }] })} className={`${smallBtn} border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50`}><Plus className="w-4 h-4" /> Thêm cặp nối</button>
                </>
              )}

              {q.type === 'oral' && (
                <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">Học sinh trả lời bằng lời, giáo viên chấm Đúng / Sai khi chơi. Ghi gợi ý đáp án ở mục bên dưới để đối chiếu.</p>
              )}
            </section>

            {/* Đáp án / lời giải */}
            <section id="qe-key" className="space-y-2.5 rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
              <span className="text-xs font-black uppercase tracking-wide text-amber-900 flex items-center gap-1.5"><Lightbulb className="w-4 h-4" /> Đáp án / lời giải của giáo viên (không bắt buộc)</span>
              <textarea rows={2} value={q.teacherAnswerKey || ''} data-paste-slot="answer" onFocus={() => setActive('answer')} onChange={(e) => patch({ teacherAnswerKey: e.target.value })}
                placeholder="Giải thích ngắn để đọc cho cả lớp sau khi học sinh trả lời…" className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-sm text-slate-900 focus:outline-none focus:border-amber-500 resize-y" />
              <ImageSlot compact value={q.answerImage} onChange={(v) => patch({ answerImage: v })} label="Ảnh lời giải" slotKey="answer" active={active === 'answer'} onActivate={setActive} onError={fail} />
            </section>

            {/* Môn + xu */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="qe-subject" className={label}>Môn học / bộ câu hỏi</label>
                <input id="qe-subject" list="qe-subjects" value={q.subject || ''} onChange={(e) => patch({ subject: e.target.value })} placeholder="Ví dụ: Toán học" className={input} />
                <datalist id="qe-subjects">{subjects.map(s => <option key={s} value={s} />)}</datalist>
              </div>
              <div>
                <span className={label}>Xu thưởng khi trả lời đúng</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[1, 2, 3, 5, 10].map(n => (
                    <button key={n} type="button" onClick={() => patch({ pointsReward: n })} aria-pressed={(q.pointsReward || 2) === n}
                      className={`no-hover-fx h-10 min-w-10 px-3 rounded-xl border-2 text-sm font-black ${(q.pointsReward || 2) === n ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-amber-400'}`}>{n}</button>
                  ))}
                  <input type="number" min={1} max={50} value={q.pointsReward || 2} onChange={(e) => patch({ pointsReward: Math.max(1, Math.min(50, parseInt(e.target.value) || 1)) })} className={`${input} w-20`} aria-label="Số xu khác" />
                </div>
              </div>
            </section>
          </div>

          {/* Xem trước */}
          <aside className={`border-l border-slate-100 bg-slate-50 overflow-y-auto px-4 py-4 ${showPreviewMobile ? '' : 'hidden lg:block'}`} aria-label="Xem trước">
            <div className="text-xs font-black uppercase tracking-wide text-slate-600 mb-2 flex items-center gap-1.5"><Eye className="w-4 h-4" /> Xem trước — đáp án đúng tô xanh</div>
            <p className="text-xs text-slate-600 mb-2">Bấm <strong>Chơi thử</strong> để tự làm câu này như học sinh (thứ tự được xáo trộn như khi chơi).</p>
            <QuestionPreview q={q} />
          </aside>
        </div>

        {/* Chân: lưu */}
        <div className="px-4 sm:px-5 py-3 border-t border-slate-100 bg-white flex flex-wrap items-center gap-2">
          <div className="mr-auto min-w-0 flex-1">
            {error ? (
              <p role="alert" className="text-sm font-bold text-rose-700 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error.text}</p>
            ) : note ? (
              <p role="status" className="text-sm font-bold text-emerald-800 flex items-center gap-1.5"><Check className="w-4 h-4 shrink-0" /> {note}</p>
            ) : (
              <p className="text-sm text-slate-600 truncate">{typeLabel(q.type)} · {q.subject || 'Chưa có môn'} · {q.pointsReward || 2} xu</p>
            )}
          </div>
          <button type="button" onClick={cancel} className={`${smallBtn} h-10 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700`}>Hủy</button>
          <button type="button" onClick={tryPlay} className={`${smallBtn} h-10 border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800`} title="Làm thử câu này như học sinh để kiểm tra"><Play className="w-4 h-4 fill-emerald-700" /> Chơi thử</button>
          <button type="button" onClick={() => save(true)} className={`${smallBtn} h-10 border border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-800`} title="Lưu câu này rồi soạn ngay câu tiếp theo (giữ dạng câu và môn học)"><Plus className="w-4 h-4" /> Lưu & soạn câu tiếp</button>
          <button type="button" onClick={() => save(false)} className={`${smallBtn} h-10 px-5 bg-indigo-600 hover:bg-indigo-700 text-white`}><Save className="w-4 h-4" /> Lưu câu hỏi</button>
        </div>
      </div>
      {tryQ && <QuestionPlayer questions={[tryQ]} title="câu đang soạn" onClose={() => setTryQ(null)} />}
    </div>
  );
};

/** Bản xem trước gọn (cách hiển thị gần với trò chơi) */
const QuestionPreview: React.FC<{ q: QuestionItem }> = ({ q }) => {
  const parts = (q.questionText || '').split(BLANK_RE);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
        <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200">{typeLabel(q.type)}</span>
        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{q.subject || 'Chưa có môn'}</span>
        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1"><Coins className="w-3.5 h-3.5" /> +{q.pointsReward || 2} xu</span>
      </div>
      {q.questionText ? (
        <p className="text-lg font-bold text-slate-900 leading-snug whitespace-pre-wrap">
          {q.type === 'fill_blank'
            ? parts.map((p, i) => (
              <React.Fragment key={i}>{p}{i < parts.length - 1 && <span className="inline-block min-w-16 mx-1 px-2 border-b-2 border-purple-500 text-purple-700 text-center">___</span>}</React.Fragment>
            ))
            : q.questionText}
        </p>
      ) : !q.image && !q.audio ? <p className="text-base text-slate-400 italic">(Chưa có nội dung câu hỏi)</p> : null}
      {q.image && <img src={q.image} alt="Ảnh câu hỏi" className="w-full max-h-56 object-contain rounded-xl border border-slate-200 bg-white" />}
      {q.audio && <div className="flex items-center gap-2"><Volume2 className="w-4 h-4 text-violet-600 shrink-0" /><audio src={q.audio} controls className="h-9 w-full" /></div>}

      {(q.type === 'multiple_choice' || q.type === 'multi_select') && (
        <div className={`grid gap-2 ${(q.optionImages || []).some(Boolean) ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {(q.options || []).map((o, i) => {
            const img = q.optionImages?.[i];
            if (!o && !img) return null;
            const ok = q.type === 'multiple_choice' ? q.correctOptionIndex === i : (q.correctOptionIndices || []).includes(i);
            return (
              <div key={i} className={`rounded-xl border-2 p-2 flex flex-col gap-1.5 ${ok ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-7 h-7 rounded-lg text-sm font-black inline-flex items-center justify-center shrink-0 ${ok ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{LETTERS[i]}</span>
                  <span className="text-sm font-bold text-slate-900">{o}</span>
                </div>
                {img && <img src={img} alt={`Ảnh ${LETTERS[i]}`} className="w-full h-24 object-contain rounded-lg bg-white" />}
              </div>
            );
          })}
        </div>
      )}
      {q.type === 'true_false' && (
        <div className="grid grid-cols-2 gap-2">
          {[true, false].map(v => <div key={String(v)} className={`h-11 rounded-xl border-2 text-sm font-black flex items-center justify-center ${(q.isTrue ?? true) === v ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700'}`}>{v ? 'ĐÚNG' : 'SAI'}</div>)}
        </div>
      )}
      {q.type === 'fill_blank' && (
        <div className="flex flex-wrap gap-1.5">
          {[...(q.blankAnswers || []).filter(Boolean), ...(q.distractorWords || [])].map((w, i) => <span key={i} className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-sm font-bold">{w}</span>)}
        </div>
      )}
      {q.type === 'sequence_order' && (
        <ol className="space-y-1.5">{(q.sequenceItems || []).filter(Boolean).map((s, i) => <li key={i} className="flex items-center gap-2 text-sm text-slate-800"><span className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-800 text-xs font-black inline-flex items-center justify-center">{i + 1}</span>{s}</li>)}</ol>
      )}
      {q.type === 'matching' && (
        <div className="space-y-1.5">{(q.matchingPairs || []).filter(p => p.left || p.right).map((p, i) => <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-sm"><span className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-slate-900">{p.left}</span><Link2 className="w-4 h-4 text-slate-400" /><span className="px-2 py-1 rounded-lg bg-sky-50 border border-sky-200 text-slate-900">{p.right}</span></div>)}</div>
      )}
      {(q.teacherAnswerKey || q.answerImage) && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 space-y-1.5">
          <div className="text-xs font-black uppercase text-amber-900">Lời giải (giáo viên)</div>
          {q.teacherAnswerKey && <p className="text-sm text-slate-800 whitespace-pre-wrap">{q.teacherAnswerKey}</p>}
          {q.answerImage && <img src={q.answerImage} alt="Ảnh lời giải" className="w-full max-h-32 object-contain rounded-lg bg-white" />}
        </div>
      )}
    </div>
  );
};

export default QuestionEditor;
