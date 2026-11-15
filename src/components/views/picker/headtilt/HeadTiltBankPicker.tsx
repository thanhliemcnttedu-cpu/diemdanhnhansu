import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckSquare, ChevronDown, ChevronRight, Library, MinusSquare, Play, Plus, Search, Sparkles, Square, UserRound, X } from 'lucide-react';
import { isSampleQuestion } from '../../../../services/quizBankStore';
import type { QuestionItem } from '../../../../types';
import type { HeadTiltQuestion } from './types';

/**
 * Pick questions from the question bank for a "Quiz Nghiêng Đầu" lesson:
 * choose the bank (mine / sample / all), then tick a whole subject, a whole lesson or single questions.
 * Head-tilt questions have exactly two answers, so only single-choice and true/false questions can be picked;
 * the other types are listed greyed out so the teacher sees why they are missing.
 */
type Source = 'all' | 'mine' | 'sample';
const NO_LESSON = 'Chưa xếp bài';
const subjectOf = (q: QuestionItem) => q.subject || 'Tổng hợp';
const lessonOf = (q: QuestionItem) => q.lesson || NO_LESSON;

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm', true_false: 'Đúng / Sai', multi_select: 'Nhiều đáp án',
  fill_blank: 'Điền chỗ trống', sequence_order: 'Sắp xếp', matching: 'Nối cột', oral: 'Tự luận',
};

/** A question fits the game when it can be reduced to one right and one wrong answer */
export const isHeadTiltUsable = (q: QuestionItem) =>
  q.type === 'true_false' || (q.type === 'multiple_choice' && (q.options || []).filter(o => String(o || '').trim()).length >= 2);

/** Bank question → two-answer question: the right answer + one random wrong answer, on a random side */
export function toHeadTiltQuestion(item: QuestionItem, idx = 0): HeadTiltQuestion | null {
  if (!isHeadTiltUsable(item)) return null;
  let right = 'Đúng', wrong = 'Sai', rightOnA = true;
  if (item.type === 'true_false') {
    rightOnA = item.isTrue ?? true;   // "Đúng" always stays on the left
    return {
      id: `bank-${item.id}-${Date.now()}-${idx}`, question: item.questionText, image: item.image, audio: item.audio,
      optionA: 'Đúng', optionB: 'Sai', correctAnswer: rightOnA ? 'A' : 'B', explanation: item.teacherAnswerKey,
    };
  }
  const options = item.options || [];
  const correctIdx = item.correctOptionIndex ?? 0;
  right = options[correctIdx] || options[0];
  const wrongs = options.filter((o, i) => i !== correctIdx && String(o || '').trim());
  wrong = wrongs[Math.floor(Math.random() * wrongs.length)] || '';
  if (!String(right || '').trim() || !wrong) return null;
  rightOnA = Math.random() > 0.5;
  return {
    id: `bank-${item.id}-${Date.now()}-${idx}`, question: item.questionText, image: item.image, audio: item.audio,
    optionA: rightOnA ? right : wrong, optionB: rightOnA ? wrong : right, correctAnswer: rightOnA ? 'A' : 'B',
    explanation: item.teacherAnswerKey,
  };
}

interface Props {
  bank: QuestionItem[];
  onClose: () => void;
  /** Add the picked questions to the lesson being edited */
  onAdd?: (questions: HeadTiltQuestion[], subjects: string[]) => void;
  /** Play right away with the picked questions */
  onPlay?: (questions: HeadTiltQuestion[], subjects: string[]) => void;
  /** Open the question bank (write new questions, import files, generate with AI) */
  onOpenBank?: () => void;
  addLabel?: string;
}

const SOURCES: Array<{ key: Source; label: string; icon: React.ElementType }> = [
  { key: 'mine', label: 'Kho của tôi', icon: UserRound },
  { key: 'sample', label: 'Kho mẫu', icon: Sparkles },
  { key: 'all', label: 'Tất cả', icon: Library },
];

const Tick: React.FC<{ state: 'all' | 'some' | 'none' }> = ({ state }) =>
  state === 'all' ? <CheckSquare className="w-4.5 h-4.5 text-indigo-700 shrink-0" aria-hidden="true" />
    : state === 'some' ? <MinusSquare className="w-4.5 h-4.5 text-indigo-700 shrink-0" aria-hidden="true" />
      : <Square className="w-4.5 h-4.5 text-slate-500 shrink-0" aria-hidden="true" />;

export const HeadTiltBankPicker: React.FC<Props> = ({ bank, onClose, onAdd, onPlay, onOpenBank, addLabel = 'Thêm vào bài học' }) => {
  const [source, setSource] = useState<Source>('all');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const inSource = (q: QuestionItem) => source === 'all' || (source === 'sample' ? isSampleQuestion(q) : !isSampleQuestion(q));
  const counts = useMemo(() => ({
    mine: bank.filter(q => q && !isSampleQuestion(q)).length,
    sample: bank.filter(q => q && isSampleQuestion(q)).length,
    all: bank.filter(Boolean).length,
  }), [bank]);

  // subject → lesson → questions (after the bank + search filters)
  const tree = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const map = new Map<string, Map<string, QuestionItem[]>>();
    bank.forEach(q => {
      if (!q || !inSource(q)) return;
      if (needle && !`${q.questionText} ${subjectOf(q)} ${q.lesson || ''}`.toLowerCase().includes(needle)) return;
      const lessons = map.get(subjectOf(q)) || new Map<string, QuestionItem[]>();
      lessons.set(lessonOf(q), [...(lessons.get(lessonOf(q)) || []), q]);
      map.set(subjectOf(q), lessons);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'vi')).map(([subject, lessons]) => ({
      subject,
      lessons: Array.from(lessons.entries())
        .sort((a, b) => (a[0] === NO_LESSON ? 1 : b[0] === NO_LESSON ? -1 : a[0].localeCompare(b[0], 'vi', { numeric: true })))
        .map(([lesson, items]) => ({ lesson, items })),
    }));
  }, [bank, source, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const usableIds = (items: QuestionItem[]) => items.filter(isHeadTiltUsable).map(q => q.id);
  const stateOf = (ids: string[]): 'all' | 'some' | 'none' => {
    const n = ids.filter(id => picked.has(id)).length;
    return ids.length > 0 && n === ids.length ? 'all' : n > 0 ? 'some' : 'none';
  };
  const toggleMany = (ids: string[]) => setPicked(prev => {
    const next = new Set(prev);
    const allOn = ids.length > 0 && ids.every(id => next.has(id));
    ids.forEach(id => (allOn ? next.delete(id) : next.add(id)));
    return next;
  });
  const toggleOpen = (s: string) => setOpenSubjects(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const visible = tree.flatMap(s => s.lessons.flatMap(l => l.items));
  const visibleUsable = usableIds(visible);
  const pickedItems = bank.filter(q => q && picked.has(q.id) && isHeadTiltUsable(q));
  const searching = search.trim().length > 0;

  const build = () => {
    const questions = pickedItems.map((q, i) => toHeadTiltQuestion(q, i)).filter(Boolean) as HeadTiltQuestion[];
    return { questions, subjects: Array.from(new Set(pickedItems.map(subjectOf))) };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="ht-picker-title">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-start gap-3 px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center shrink-0"><BookOpen className="w-5 h-5" aria-hidden="true" /></div>
          <div className="flex-1 min-w-0">
            <h3 id="ht-picker-title" className="text-base font-black text-slate-900">Chọn câu hỏi từ kho</h3>
            <p className="text-sm text-slate-700 mt-0.5">Tích cả môn, cả bài, hoặc mở ra để tích từng câu. Trò nghiêng đầu chỉ dùng câu <strong>trắc nghiệm 1 đáp án</strong> và <strong>Đúng / Sai</strong>.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="no-hover-fx w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-700 inline-flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 pt-4 space-y-3">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Kho câu hỏi">
            {SOURCES.map(({ key, label, icon: Icon }) => {
              const active = source === key;
              return (
                <button key={key} type="button" role="radio" aria-checked={active} onClick={() => setSource(key)}
                  className={`no-hover-fx rounded-2xl border-2 px-3 py-2 text-left cursor-pointer transition-colors ${active ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-300'}`}>
                  <span className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-indigo-700' : 'text-slate-600'}`} aria-hidden="true" />
                    <span className="text-sm font-black text-slate-900 leading-tight">{label}</span>
                  </span>
                  <span className={`block text-sm font-bold tabular-nums mt-0.5 ${active ? 'text-indigo-800' : 'text-slate-700'}`}>{counts[key]} câu</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm theo nội dung câu hỏi, môn, bài…" aria-label="Tìm câu hỏi"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-600" />
            </div>
            <button type="button" onClick={() => toggleMany(visibleUsable)} disabled={visibleUsable.length === 0}
              className="no-hover-fx h-10 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-bold text-slate-800 inline-flex items-center gap-2 cursor-pointer disabled:opacity-50">
              <Tick state={stateOf(visibleUsable)} /> Chọn tất cả ({visibleUsable.length})
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-3 space-y-2 min-h-[160px]">
          {tree.length === 0 && (
            <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-4 text-center">
              {searching ? 'Không có câu hỏi nào khớp từ khóa.' : 'Kho này chưa có câu hỏi. Bấm "Mở kho câu hỏi" để soạn, tải tệp hoặc tạo câu hỏi bằng AI.'}
            </p>
          )}
          {tree.map(({ subject, lessons }) => {
            const all = lessons.flatMap(l => l.items);
            const ids = usableIds(all);
            const st = stateOf(ids);
            const open = searching || openSubjects.has(subject);
            const onlyNoLesson = lessons.length === 1 && lessons[0].lesson === NO_LESSON;
            return (
              <div key={subject} className={`rounded-2xl border ${st !== 'none' ? 'border-indigo-400 bg-indigo-50/40' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center gap-1 pr-2">
                  <button type="button" onClick={() => toggleMany(ids)} disabled={ids.length === 0} aria-pressed={st === 'all'}
                    title={ids.length === 0 ? 'Môn này không có câu dùng được cho trò nghiêng đầu' : 'Chọn cả môn'}
                    className="no-hover-fx flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2.5 text-left cursor-pointer disabled:cursor-default disabled:opacity-60">
                    <Tick state={st} />
                    <span className="text-sm font-black text-slate-900 truncate">{subject}</span>
                    <span className="text-xs font-bold text-slate-700 tabular-nums whitespace-nowrap">
                      {ids.filter(id => picked.has(id)).length}/{ids.length} câu dùng được{all.length > ids.length ? ` • ${all.length - ids.length} câu dạng khác` : ''}
                    </span>
                  </button>
                  <button type="button" onClick={() => toggleOpen(subject)} aria-expanded={open} aria-label={`${open ? 'Thu gọn' : 'Mở'} môn ${subject}`}
                    className="no-hover-fx h-9 px-2.5 rounded-xl hover:bg-slate-100 text-sm font-bold text-indigo-800 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap">
                    {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} {open ? 'Thu gọn' : 'Xem câu hỏi'}
                  </button>
                </div>
                {open && (
                  <div className="px-3 pb-3 space-y-2">
                    {lessons.map(({ lesson, items }) => {
                      const lids = usableIds(items);
                      return (
                        <div key={lesson} className="rounded-xl border border-slate-200 bg-white">
                          {!onlyNoLesson && (
                            <button type="button" onClick={() => toggleMany(lids)} disabled={lids.length === 0} aria-pressed={stateOf(lids) === 'all'}
                              className="no-hover-fx w-full flex items-center gap-2.5 px-3 py-2 text-left border-b border-slate-100 cursor-pointer disabled:cursor-default disabled:opacity-60">
                              <Tick state={stateOf(lids)} />
                              <span className="text-sm font-bold text-slate-900 truncate flex-1">{lesson}</span>
                              <span className="text-xs font-bold text-slate-700 tabular-nums whitespace-nowrap">{lids.filter(id => picked.has(id)).length}/{lids.length} câu</span>
                            </button>
                          )}
                          <ul className="divide-y divide-slate-100">
                            {items.map(q => {
                              const usable = isHeadTiltUsable(q);
                              const on = picked.has(q.id);
                              return (
                                <li key={q.id}>
                                  <button type="button" disabled={!usable} onClick={() => toggleMany([q.id])} aria-pressed={on}
                                    title={usable ? undefined : 'Dạng câu này không dùng được cho trò nghiêng đầu (cần đúng 2 đáp án)'}
                                    className={`no-hover-fx w-full flex items-start gap-2.5 px-3 py-2 text-left cursor-pointer disabled:cursor-not-allowed ${on ? 'bg-indigo-50' : usable ? 'hover:bg-slate-50' : 'bg-slate-50'}`}>
                                    <span className="mt-0.5"><Tick state={on ? 'all' : 'none'} /></span>
                                    <span className={`flex-1 min-w-0 text-sm leading-snug ${usable ? 'text-slate-900' : 'text-slate-600'}`}>{q.questionText}</span>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg whitespace-nowrap ${usable ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                                      {TYPE_LABEL[q.type] || q.type}{usable ? '' : ' • không dùng được'}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-3xl">
          <span className="text-sm font-bold text-slate-900 mr-auto" role="status">Đã chọn <span className="tabular-nums text-indigo-800">{pickedItems.length}</span> câu</span>
          {onOpenBank && (
            <button type="button" onClick={onOpenBank} className="no-hover-fx h-10 px-3 rounded-xl text-sm font-bold inline-flex items-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 whitespace-nowrap cursor-pointer">
              <Plus className="w-4 h-4" /> Mở kho / tạo bằng AI
            </button>
          )}
          {onPlay && (
            <button type="button" disabled={pickedItems.length === 0} onClick={() => { const b = build(); onPlay(b.questions, b.subjects); }}
              className="no-hover-fx h-10 px-4 rounded-xl text-sm font-black inline-flex items-center gap-2 border-2 border-indigo-600 bg-white hover:bg-indigo-50 text-indigo-800 disabled:opacity-50 whitespace-nowrap cursor-pointer">
              <Play className="w-4 h-4" /> Chơi ngay
            </button>
          )}
          {onAdd && (
            <button type="button" disabled={pickedItems.length === 0} onClick={() => { const b = build(); onAdd(b.questions, b.subjects); }}
              className="no-hover-fx h-10 px-4 rounded-xl text-sm font-black inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 whitespace-nowrap cursor-pointer">
              <Plus className="w-4 h-4" /> {addLabel} ({pickedItems.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
