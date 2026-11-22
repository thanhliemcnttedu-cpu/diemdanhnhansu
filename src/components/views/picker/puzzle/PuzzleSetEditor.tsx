import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ImagePlus, Save, Trash2, CheckCircle2, AlertCircle, Puzzle, X } from 'lucide-react';
import { PIECE_LAYOUTS, newPuzzleId, type PuzzleQuestion, type PuzzleSet } from '../../../../services/puzzleStore';
import { shrinkImageDataUrl } from '../../../../utils/driveCompact';

/**
 * Trình soạn bộ ghép hình "Lật mảnh ghép": thông tin chung + ảnh bí mật + mỗi mảnh một câu hỏi trắc nghiệm A–D.
 * Thầy cô tự soạn, lưu vào kho cá nhân (thư mục máy / Drive cá nhân đã chọn ở "Nơi lưu câu hỏi").
 */
const SYMBOLS = ['x²', 'x³', '√', '½', '¼', '¾', '×', '÷', '±', '≤', '≥', '≠', '≈', 'π', '°', '²', '³', '→'];
const PIECE_OPTIONS = [3, 4, 6, 8, 9, 12];
const LETTERS = ['A', 'B', 'C', 'D'];

const blankQuestion = (): PuzzleQuestion => ({ id: newPuzzleId('q'), text: '', options: ['', '', '', ''], correct: 0 });
const fit = (list: PuzzleQuestion[], n: number): PuzzleQuestion[] => Array.from({ length: n }, (_, i) => list[i] || blankQuestion());

const readFile = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result || ''));
  r.onerror = () => reject(new Error('Không đọc được tệp ảnh'));
  r.readAsDataURL(file);
});

const isQuestionDone = (q: PuzzleQuestion) =>
  (q.text.trim() || q.image) && q.options.filter(o => o.trim()).length >= 2 && Boolean(q.options[q.correct]?.trim());

interface Props {
  initial: PuzzleSet | null;
  onSave: (set: PuzzleSet) => Promise<void> | void;
  onClose: () => void;
}

export const PuzzleSetEditor: React.FC<Props> = ({ initial, onSave, onClose }) => {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [pieces, setPieces] = useState(initial?.pieces || 6);
  const [mode, setMode] = useState<'retry' | 'lock'>(initial?.mode || 'retry');
  const [answer, setAnswer] = useState(initial?.answer || '');
  const [image, setImage] = useState(initial?.image || '');
  const [questions, setQuestions] = useState<PuzzleQuestion[]>(() => fit(initial?.questions || [], initial?.pieces || 6));
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const lastField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const layout = PIECE_LAYOUTS[pieces] || PIECE_LAYOUTS[6];
  const q = questions[Math.min(active, questions.length - 1)];
  const doneCount = useMemo(() => questions.filter(isQuestionDone).length, [questions]);

  const changePieces = (n: number) => {
    setPieces(n);
    setQuestions(prev => fit(prev, n));
    setActive(a => Math.min(a, n - 1));
  };
  const patchQ = (patch: Partial<PuzzleQuestion>) => setQuestions(prev => prev.map((x, i) => (i === active ? { ...x, ...patch } : x)));
  const patchOption = (i: number, v: string) => setQuestions(prev => prev.map((x, k) => (k === active ? { ...x, options: x.options.map((o, j) => (j === i ? v : o)) } : x)));

  const putSecretImage = async (file: File) => {
    try { setImage(await shrinkImageDataUrl(await readFile(file), 1280, 0.82)); setMessage(null); }
    catch (e: any) { setMessage(e?.message || 'Không đọc được ảnh.'); }
  };
  const putQuestionImage = async (file: File) => {
    try { patchQ({ image: await shrinkImageDataUrl(await readFile(file), 800, 0.82) }); }
    catch (e: any) { setMessage(e?.message || 'Không đọc được ảnh.'); }
  };

  // Dán ảnh bằng Ctrl+V: đang ở khung câu hỏi → ảnh câu hỏi; ngoài ra → ảnh bí mật
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files || []).find(f => f.type.startsWith('image/'));
      if (!file) return;
      e.preventDefault();
      const inRight = rightRef.current && document.activeElement && rightRef.current.contains(document.activeElement);
      if (inRight) putQuestionImage(file); else putSecretImage(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const insertSymbol = (sym: string) => {
    const el = lastField.current;
    if (!el || !el.isConnected) return;
    const f = el.dataset.f || '';
    const s = el.selectionStart ?? el.value.length;
    const e2 = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, s) + sym + el.value.slice(e2);
    if (f === 'q') patchQ({ text: next });
    else if (f === 'exp') patchQ({ explanation: next });
    else if (f.startsWith('o')) patchOption(Number(f.slice(1)), next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + sym.length, s + sym.length); });
  };
  const track = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { lastField.current = e.currentTarget; };

  const problems = (): string[] => {
    const out: string[] = [];
    if (!title.trim()) out.push('Chưa nhập tên bộ câu hỏi.');
    if (!image) out.push('Chưa tải ảnh bí mật.');
    if (!answer.trim()) out.push('Chưa nhập đáp án hình ảnh.');
    questions.forEach((x, i) => { if (!isQuestionDone(x)) out.push(`Mảnh ${i + 1}: cần có câu hỏi, ít nhất 2 phương án và chọn đáp án đúng (phải có chữ).`); });
    return out;
  };

  const save = async () => {
    const list = problems();
    if (list.length) { setMessage(list[0] + (list.length > 1 ? ` (còn ${list.length - 1} chỗ cần bổ sung)` : '')); return; }
    setBusy(true);
    try {
      await onSave({
        id: initial?.id && initial.id !== 'pz-sample' ? initial.id : newPuzzleId('pz'),
        title: title.trim(), description: description.trim() || undefined, pieces, mode, image, answer: answer.trim(),
        questions: questions.map(x => ({ ...x, text: x.text.trim(), options: x.options.map(o => o.trim()), explanation: x.explanation?.trim() || undefined })),
        updatedAt: Date.now(),
      });
    } finally { setBusy(false); }
  };

  const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400';
  const label = 'block text-xs font-black uppercase text-slate-700 mb-1';

  return (
    <div className="fixed inset-0 z-50 bg-sky-900/20 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Soạn bộ ghép hình">
      <div className="w-full max-w-6xl h-[94vh] bg-gradient-to-b from-sky-50 to-amber-50 rounded-3xl shadow-2xl border border-white flex flex-col overflow-hidden">
        {/* Đầu */}
        <div className="px-4 sm:px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
            <button type="button" onClick={onClose} className="min-h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-black text-slate-800 inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 whitespace-nowrap shrink-0">
              <ArrowLeft className="w-4 h-4" /><span>Quay lại</span>
            </button>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">{initial && initial.id !== 'pz-sample' ? 'Sửa bộ ghép hình' : 'Tạo bộ ghép hình mới'}</h2>
              <p className="text-xs font-semibold text-slate-600 wrap-ok">Mỗi mảnh ghép là một câu hỏi trắc nghiệm A, B, C, D. Lật hết mảnh để lộ bức ảnh bí mật.</p>
            </div>
          </div>
          <button type="button" onClick={save} disabled={busy}
            className="min-h-11 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-black uppercase inline-flex items-center gap-2 cursor-pointer disabled:opacity-60 shadow-md whitespace-nowrap">
            <Save className="w-4 h-4" /><span>{busy ? 'Đang lưu…' : 'Lưu bộ câu hỏi'}</span>
          </button>
        </div>
        {message && (
          <div className="mx-4 sm:mx-6 mt-3 rounded-xl bg-rose-50 border border-rose-300 px-3 py-2 text-sm font-bold text-rose-800 flex items-start gap-2 wrap-ok" role="alert">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span className="flex-1">{message}</span>
            <button type="button" aria-label="Đóng thông báo" onClick={() => setMessage(null)} className="cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 content-start">
          {/* Trái: thông tin + ảnh */}
          <div className="lg:col-span-5 space-y-4">
            <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 space-y-3 shadow-2xs">
              <h3 className="text-base font-black text-slate-900">1. Thông tin chung &amp; chế độ chơi</h3>
              <div>
                <label className={label} htmlFor="pz-title">Tên bộ câu hỏi *</label>
                <input id="pz-title" className={field} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Ôn tập Hình học lớp 6" />
              </div>
              <div>
                <label className={label} htmlFor="pz-desc">Mô tả / chủ đề / môn học</label>
                <input id="pz-desc" className={field} value={description} onChange={e => setDescription(e.target.value)} placeholder="Ví dụ: Toán 6 • Chương Tam giác đều" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="pz-n">Số lượng mảnh ghép</label>
                  <select id="pz-n" className={field} value={pieces} onChange={e => changePieces(Number(e.target.value))}>
                    {PIECE_OPTIONS.map(n => <option key={n} value={n}>{n} mảnh ({PIECE_LAYOUTS[n].cols} × {PIECE_LAYOUTS[n].rows})</option>)}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="pz-mode">Chế độ chơi</label>
                  <select id="pz-mode" className={field} value={mode} onChange={e => setMode(e.target.value as 'retry' | 'lock')}>
                    <option value="retry">Chế độ 1: Sai trả lời lại</option>
                    <option value="lock">Chế độ 2: Sai là khóa mảnh</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={label} htmlFor="pz-ans">Đáp án hình ảnh bí mật *</label>
                <input id="pz-ans" className={field} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Ví dụ: Đảo tri thức; Ngôi trường đảo bay" />
                <p className="mt-1 text-xs font-semibold text-slate-600 wrap-ok">Nhiều đáp án chấp nhận cách nhau bởi dấu ; hoặc |. Không phân biệt hoa thường và dấu.</p>
              </div>
            </section>

            <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-black text-slate-900">2. Ảnh bí mật (16:9) *</h3>
                <label className="min-h-10 px-3.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black uppercase inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0">
                  <ImagePlus className="w-4 h-4" /><span>Tải ảnh lên</span>
                  <input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) putSecretImage(f); e.target.value = ''; }} />
                </label>
              </div>
              <div className="relative rounded-2xl overflow-hidden border-2 border-dashed border-slate-300 bg-slate-100" style={{ aspectRatio: '16 / 9' }}>
                {image ? (
                  <>
                    <img src={image} alt="Ảnh bí mật" className="absolute inset-0 w-full h-full object-cover" />
                    {/* Lưới mảnh ghép xem trước */}
                    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, 1fr)`, gridTemplateRows: `repeat(${layout.rows}, 1fr)` }} aria-hidden>
                      {Array.from({ length: pieces }, (_, i) => (
                        <div key={i} className="border border-white/80 flex items-center justify-center">
                          <span className="w-7 h-7 rounded-full bg-black/45 text-white text-xs font-black flex items-center justify-center">{i + 1}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-600 text-center px-4">
                    <Puzzle className="w-8 h-8" />
                    <span className="text-sm font-bold">Tải ảnh lên, kéo thả hoặc dán (Ctrl+V)</span>
                  </div>
                )}
              </div>
              {image && (
                <button type="button" onClick={() => setImage('')} className="text-xs font-black text-rose-700 inline-flex items-center gap-1 cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" /><span>Bỏ ảnh</span>
                </button>
              )}
            </section>
          </div>

          {/* Phải: câu hỏi từng mảnh */}
          <div className="lg:col-span-7" ref={rightRef}>
            <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 space-y-3 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-black text-slate-900">3. Soạn câu hỏi trắc nghiệm</h3>
                <span className={`px-3 py-1 rounded-full text-xs font-black whitespace-nowrap ${doneCount === pieces ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                  {doneCount}/{pieces} câu hoàn chỉnh
                </span>
              </div>

              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Chọn mảnh ghép">
                {questions.map((x, i) => (
                  <button key={x.id} type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)}
                    className={`min-h-10 px-3.5 rounded-full text-sm font-black inline-flex items-center gap-1.5 cursor-pointer border ${i === active ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'}`}>
                    <span>Mảnh {i + 1}</span>
                    {isQuestionDone(x) ? <CheckCircle2 className={`w-3.5 h-3.5 ${i === active ? 'text-emerald-200' : 'text-emerald-600'}`} /> : <span className={`w-2 h-2 rounded-full ${i === active ? 'bg-amber-300' : 'bg-amber-500'}`} aria-label="Chưa hoàn chỉnh" />}
                  </button>
                ))}
              </div>

              {q && (
                <div className="space-y-3">
                  <div className="inline-flex px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-900 text-sm font-black">Mảnh ghép số {active + 1}</div>
                  <div>
                    <label className={label} htmlFor="pz-q">Nội dung câu hỏi</label>
                    <textarea id="pz-q" data-f="q" rows={3} className={field} value={q.text} onFocus={track} onChange={e => patchQ({ text: e.target.value })} placeholder="Nhập câu hỏi…" />
                  </div>

                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                    <div className="text-xs font-black uppercase text-slate-700 mb-2">Ký hiệu toán học (chèn vào ô đang chọn)</div>
                    <div className="flex flex-wrap gap-1.5">
                      {SYMBOLS.map(s => (
                        <button key={s} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insertSymbol(s)}
                          className="min-w-9 h-9 px-2 rounded-lg bg-white border border-slate-300 text-sm font-black text-slate-800 cursor-pointer hover:bg-indigo-50">{s}</button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 space-y-2">
                    <div className="text-xs font-black uppercase text-slate-800">4 phương án trắc nghiệm (chọn nút tròn để đánh dấu đáp án đúng)</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {LETTERS.map((L, i) => (
                        <label key={L} className={`flex items-center gap-2 rounded-xl border-2 bg-white px-2.5 py-1.5 ${q.correct === i ? 'border-emerald-500' : 'border-slate-200'}`}>
                          <input type="radio" name={`pz-correct-${q.id}`} checked={q.correct === i} onChange={() => patchQ({ correct: i })} className="w-4 h-4 accent-emerald-600 cursor-pointer" aria-label={`Đáp án ${L} là đúng`} />
                          <span className="font-black text-slate-800 w-4">{L}.</span>
                          <input data-f={`o${i}`} className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-slate-900 placeholder:text-slate-500 focus:outline-none py-1" value={q.options[i]} onFocus={track} onChange={e => patchOption(i, e.target.value)} placeholder={`Đáp án ${L}…`} />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className={label} htmlFor="pz-exp">Lời giải thích (không bắt buộc)</label>
                    <input id="pz-exp" data-f="exp" className={field} value={q.explanation || ''} onFocus={track} onChange={e => patchQ({ explanation: e.target.value })} placeholder="Hiện sau khi học sinh trả lời" />
                  </div>

                  <div className="rounded-2xl bg-sky-50 border border-sky-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="min-h-10 px-3.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black uppercase inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                        <ImagePlus className="w-4 h-4" /><span>{q.image ? 'Đổi ảnh minh họa' : 'Ảnh minh họa câu hỏi'}</span>
                        <input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) putQuestionImage(f); e.target.value = ''; }} />
                      </label>
                      {q.image && <button type="button" onClick={() => patchQ({ image: undefined })} className="text-xs font-black text-rose-700 inline-flex items-center gap-1 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /><span>Bỏ ảnh</span></button>}
                      <span className="text-xs font-semibold text-slate-600">Khi đang soạn câu hỏi, Ctrl+V sẽ dán ảnh vào câu hỏi này.</span>
                    </div>
                    {q.image && <img src={q.image} alt="Ảnh minh họa" className="mt-2 max-h-40 rounded-xl border border-white object-contain bg-white" />}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PuzzleSetEditor;
