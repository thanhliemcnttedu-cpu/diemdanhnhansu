import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, X, Library, UserRound, Sparkles, Layers, Play, CheckSquare, Square, Plus } from 'lucide-react';
import { useClassroom } from '../../../context/ClassroomContext';
import { isSampleQuestion } from '../../../services/quizBankStore';
import type { QuestionItem } from '../../../types';

/**
 * 🎯 CHỌN KHO + BỘ CÂU HỎI TRƯỚC KHI CHƠI (chế độ "Gọi + Trả lời câu hỏi" của Cuộn phim / Tàu vũ trụ / Hộp quà, 11/2026).
 * Kho câu hỏi: "Kho của tôi" (câu tự soạn / câu mẫu đã sửa) · "Kho mẫu của phần mềm" · "Tất cả".
 * Bộ câu hỏi: một hoặc nhiều môn học trong kho đã chọn. Trò chơi chỉ bốc câu trong phần đã chọn (`pool`).
 * Lựa chọn được nhớ theo tài khoản (localStorage `lhhp_quiz_selection:<tài khoản>`), dùng chung cho các trò chơi.
 */
export type QuizSource = 'all' | 'mine' | 'sample';
export interface QuizSelection { source: QuizSource; subjects: string[] }  // subjects rỗng = mọi môn

const KEY = 'lhhp_quiz_selection:';
const DEFAULT_SEL: QuizSelection = { source: 'all', subjects: [] };
const subjectOf = (q: QuestionItem) => q.subject || 'Tổng hợp';
const inSource = (q: QuestionItem, source: QuizSource) => source === 'all' || (source === 'sample' ? isSampleQuestion(q) : !isSampleQuestion(q));

export function filterQuizPool(bank: QuestionItem[], sel: QuizSelection): QuestionItem[] {
  return (bank || []).filter(q => q && inSource(q, sel.source) && (sel.subjects.length === 0 || sel.subjects.includes(subjectOf(q))));
}

const SOURCE_META: Record<QuizSource, { label: string; desc: string; icon: React.ElementType }> = {
  mine: { label: 'Kho của tôi', desc: 'Câu hỏi bạn tự soạn / đã sửa', icon: UserRound },
  sample: { label: 'Kho mẫu của phần mềm', desc: 'Câu hỏi có sẵn', icon: Sparkles },
  all: { label: 'Tất cả', desc: 'Kho của tôi + kho mẫu', icon: Library },
};

export const selectionLabel = (sel: QuizSelection) =>
  `${SOURCE_META[sel.source].label} • ${sel.subjects.length === 0 ? 'Mọi môn' : sel.subjects.join(', ')}`;

interface PickerProps {
  bank: QuestionItem[];
  initial: QuizSelection;
  onConfirm: (sel: QuizSelection) => void;
  onCancel: () => void;
  onOpenBank?: () => void;
}

export const QuizSetPickerModal: React.FC<PickerProps> = ({ bank, initial, onConfirm, onCancel, onOpenBank }) => {
  const [source, setSource] = useState<QuizSource>(initial.source);
  const [subjects, setSubjects] = useState<string[]>(initial.subjects);

  const counts = useMemo(() => ({
    mine: bank.filter(q => q && !isSampleQuestion(q)).length,
    sample: bank.filter(q => q && isSampleQuestion(q)).length,
    all: bank.filter(Boolean).length,
  }), [bank]);
  const subjectCounts = useMemo(() => {
    const m = new Map<string, number>();
    bank.forEach(q => { if (q && inSource(q, source)) m.set(subjectOf(q), (m.get(subjectOf(q)) || 0) + 1); });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'vi'));
  }, [bank, source]);
  // Bỏ môn không còn trong kho đã chọn
  const validSubjects = subjects.filter(s => subjectCounts.some(([n]) => n === s));
  const total = filterQuizPool(bank, { source, subjects: validSubjects }).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const toggle = (s: string) => setSubjects(prev => {
    const base = prev.filter(x => subjectCounts.some(([n]) => n === x));
    return base.includes(s) ? base.filter(x => x !== s) : [...base, s];
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="quiz-set-title">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-start gap-3 px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="w-11 h-11 rounded-2xl bg-purple-50 border border-purple-100 text-purple-700 flex items-center justify-center shrink-0"><BookOpen className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <h3 id="quiz-set-title" className="text-base font-black text-slate-900">Chọn bộ câu hỏi cho trò chơi</h3>
            <p className="text-sm text-slate-600 mt-0.5">Học sinh được gọi sẽ trả lời câu hỏi lấy ngẫu nhiên trong bộ câu hỏi bạn chọn.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Đóng" className="no-hover-fx w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <section className="space-y-2">
            <h4 className="text-sm font-black text-slate-900">1. Kho câu hỏi</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Kho câu hỏi">
              {(['mine', 'sample', 'all'] as QuizSource[]).map(k => {
                const meta = SOURCE_META[k];
                const Icon = meta.icon;
                const active = source === k;
                return (
                  <button key={k} type="button" role="radio" aria-checked={active} onClick={() => setSource(k)}
                    className={`no-hover-fx text-left rounded-2xl border-2 p-3 transition-colors ${active ? 'border-purple-600 bg-purple-50' : 'border-slate-200 bg-white hover:border-purple-300'}`}>
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-purple-700' : 'text-slate-500'}`} />
                      <span className="text-sm font-black text-slate-900 leading-tight">{meta.label}</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">{meta.desc}</div>
                    <div className={`text-lg font-black tabular-nums mt-1 ${active ? 'text-purple-800' : 'text-slate-800'}`}>{counts[k]} câu</div>
                  </button>
                );
              })}
            </div>
            {source === 'mine' && counts.mine === 0 && (
              <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                Bạn chưa có câu hỏi riêng. Bấm <strong>Mở kho câu hỏi</strong> → <strong>Thêm câu mới</strong> (hoặc tải tệp Word / PDF) để tạo bộ câu hỏi của mình.
              </p>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-black text-slate-900 mr-auto flex items-center gap-2"><Layers className="w-4 h-4 text-purple-700" /> 2. Bộ câu hỏi (môn học)</h4>
              {subjectCounts.length > 0 && (
                <button type="button" onClick={() => setSubjects([])} className="no-hover-fx text-sm font-bold text-purple-700 hover:underline">
                  {validSubjects.length === 0 ? 'Đang dùng mọi môn' : 'Dùng mọi môn'}
                </button>
              )}
            </div>
            {subjectCounts.length === 0 ? (
              <p className="text-sm text-slate-600">Kho này chưa có câu hỏi.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {subjectCounts.map(([name, n]) => {
                  const on = validSubjects.length === 0 || validSubjects.includes(name);
                  const explicit = validSubjects.includes(name);
                  return (
                    <button key={name} type="button" onClick={() => toggle(name)} aria-pressed={explicit}
                      className={`no-hover-fx flex items-center gap-2 rounded-xl border px-3 py-2 text-left ${explicit ? 'border-purple-600 bg-purple-50' : 'border-slate-200 bg-white hover:border-purple-300'}`}>
                      {explicit ? <CheckSquare className="w-4 h-4 text-purple-700 shrink-0" /> : <Square className={`w-4 h-4 shrink-0 ${on ? 'text-slate-400' : 'text-slate-300'}`} />}
                      <span className="text-sm font-bold text-slate-900 flex-1 truncate" title={name}>{name}</span>
                      <span className="text-xs font-bold text-slate-600 tabular-nums whitespace-nowrap">{n} câu</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-slate-600">Không tích môn nào = dùng mọi môn trong kho. Tích một hoặc nhiều môn để chỉ hỏi các môn đó.</p>
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-3xl">
          <span className="text-sm font-bold text-slate-800 mr-auto">Sẽ dùng <span className="tabular-nums text-purple-800">{total}</span> câu hỏi</span>
          {onOpenBank && (
            <button type="button" onClick={onOpenBank} className="no-hover-fx h-10 px-4 rounded-xl text-sm font-bold inline-flex items-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 whitespace-nowrap">
              <Plus className="w-4 h-4" /> Mở kho câu hỏi
            </button>
          )}
          <button type="button" onClick={onCancel} className="no-hover-fx h-10 px-4 rounded-xl text-sm font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 whitespace-nowrap">Hủy</button>
          <button type="button" disabled={total === 0} onClick={() => onConfirm({ source, subjects: validSubjects })}
            className="no-hover-fx h-10 px-5 rounded-xl text-sm font-black inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 whitespace-nowrap">
            <Play className="w-4 h-4 fill-white" /> Dùng bộ câu hỏi này
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Dùng trong trò chơi: `request(fn)` mở hộp chọn, xác nhận xong gọi `fn` (vd. chuyển sang chế độ câu hỏi);
 * `pool` = các câu hỏi thuộc kho + bộ đã chọn; đặt `element` ngay TRƯỚC QuestionBankModal của trò chơi
 * (để kho câu hỏi mở chồng lên hộp chọn).
 */
export function useQuizSelection(onOpenBank?: () => void) {
  const { quizBank, currentUser } = useClassroom();
  const storeKey = KEY + String(currentUser?.username || '').toLowerCase();
  const [sel, setSel] = useState<QuizSelection>(DEFAULT_SEL);
  const [open, setOpen] = useState(false);
  const pendingRef = useRef<((s: QuizSelection) => void) | null>(null);

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(storeKey) || 'null');
      setSel(v && ['all', 'mine', 'sample'].includes(v.source) && Array.isArray(v.subjects) ? { source: v.source, subjects: v.subjects.map(String) } : DEFAULT_SEL);
    } catch (_) { setSel(DEFAULT_SEL); }
  }, [storeKey]);

  const pool = useMemo(() => filterQuizPool(quizBank, sel), [quizBank, sel]);

  const request = (onConfirm?: (s: QuizSelection) => void) => {
    pendingRef.current = onConfirm || null;
    setOpen(true);
  };
  const confirm = (s: QuizSelection) => {
    setSel(s);
    try { localStorage.setItem(storeKey, JSON.stringify(s)); } catch (_) { /* ignore */ }
    setOpen(false);
    const fn = pendingRef.current;
    pendingRef.current = null;
    if (fn) fn(s);
  };

  const element = open ? (
    <QuizSetPickerModal bank={quizBank} initial={sel} onConfirm={confirm} onCancel={() => { pendingRef.current = null; setOpen(false); }} onOpenBank={onOpenBank} />
  ) : null;

  return { selection: sel, pool, request, element, label: selectionLabel(sel) };
}

/** Nhãn "Bộ câu hỏi đang dùng" + nút Đổi, hiện khi trò chơi ở chế độ câu hỏi */
export const QuizSelectionChip: React.FC<{ label: string; count: number; onChange: () => void }> = ({ label, count, onChange }) => (
  <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-2xl px-3 py-1.5 min-w-0 max-w-full">
    <BookOpen className="w-4 h-4 text-purple-700 shrink-0" />
    <span className="text-xs font-bold text-purple-900 truncate" title={label}>{label}</span>
    <span className="text-xs font-black text-purple-800 tabular-nums whitespace-nowrap">({count} câu)</span>
    <button type="button" onClick={onChange} className="no-hover-fx text-xs font-black text-purple-700 hover:underline whitespace-nowrap">Đổi bộ câu hỏi</button>
  </div>
);
