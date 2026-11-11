import React, { useMemo, useState } from 'react';
import { X, Search, CheckSquare, Square, ListPlus } from 'lucide-react';
import type { QuestionItem } from '../../../types';
import { isSampleQuestion } from '../../../services/quizBankStore';
import { typeLabel } from './QuestionEditor';

/**
 * NHẶT CÂU HỎI CÓ SẴN vào một môn / bộ câu hỏi theo bài học (11/2026).
 * Lọc toàn bộ kho (của tôi / mẫu / tất cả, theo môn, dạng, từ khóa) → tích chọn → "Thêm vào bộ …".
 * Câu được nhặt là BẢN SAO (mã mới, môn = bộ đích) → thuộc "Câu hỏi của tôi"; câu gốc giữ nguyên.
 */
interface Props {
  bank: QuestionItem[];
  targets: string[];              // các môn / bộ của giáo viên
  defaultTarget?: string;
  onClose: () => void;
  onConfirm: (target: string, picked: QuestionItem[]) => void;
}

const subjectOf = (q: QuestionItem) => q.subject || 'Tổng hợp';

export const PickQuestionsModal: React.FC<Props> = ({ bank, targets, defaultTarget, onClose, onConfirm }) => {
  const [source, setSource] = useState<'all' | 'mine' | 'sample'>('all');
  const [subject, setSubject] = useState('all');
  const [type, setType] = useState('all');
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [target, setTarget] = useState(defaultTarget || '');

  const subjects = useMemo(() => Array.from(new Set(bank.map(subjectOf))).sort((a, b) => a.localeCompare(b, 'vi')), [bank]);
  const list = useMemo(() => bank.filter(q => {
    if (source !== 'all' && (source === 'sample') !== isSampleQuestion(q)) return false;
    if (subject !== 'all' && subjectOf(q) !== subject) return false;
    if (type !== 'all' && q.type !== type) return false;
    const t = term.trim().toLowerCase();
    return !t || (q.questionText || '').toLowerCase().includes(t) || subjectOf(q).toLowerCase().includes(t);
  }), [bank, source, subject, type, term]);

  const allOn = list.length > 0 && list.every(q => picked.includes(q.id));
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const toggleAll = () => setPicked(p => (allOn ? p.filter(id => !list.some(q => q.id === id)) : Array.from(new Set([...p, ...list.map(q => q.id)]))));
  const tgt = target.trim();
  const sel = 'h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800';

  return (
    <div className="fixed inset-0 z-[60] bg-sky-900/20 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="pick-title">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><ListPlus className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <h2 id="pick-title" className="text-base font-black text-slate-900">Nhặt câu hỏi có sẵn vào bộ câu hỏi</h2>
            <p className="text-sm text-slate-600 truncate">Chọn câu từ toàn bộ kho (của bạn + câu mẫu). Câu được nhặt là bản sao, câu gốc giữ nguyên.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="no-hover-fx w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-4 sm:px-5 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <select value={source} onChange={(e) => setSource(e.target.value as any)} className={sel} aria-label="Nguồn câu hỏi">
            <option value="all">Cả kho</option>
            <option value="mine">Câu hỏi của tôi</option>
            <option value="sample">Câu hỏi mẫu</option>
          </select>
          <select value={subject} onChange={(e) => setSubject(e.target.value)} className={sel} aria-label="Môn học">
            <option value="all">Mọi môn</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className={sel} aria-label="Dạng câu">
            <option value="all">Mọi dạng câu</option>
            {(['multiple_choice', 'multi_select', 'true_false', 'fill_blank', 'sequence_order', 'matching', 'oral'] as const).map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Tìm câu hỏi…" aria-label="Tìm câu hỏi" className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 text-sm" />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-3 space-y-1.5">
          <button type="button" onClick={toggleAll} disabled={list.length === 0} className="no-hover-fx h-9 px-2 rounded-lg text-sm font-bold text-indigo-700 hover:bg-indigo-50 inline-flex items-center gap-2 disabled:opacity-40">
            {allOn ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />} {allOn ? 'Bỏ chọn tất cả đang hiện' : `Chọn tất cả đang hiện (${list.length})`}
          </button>
          {list.length === 0 && <p className="text-sm text-slate-600 py-8 text-center">Không có câu hỏi nào khớp bộ lọc.</p>}
          {list.map(q => {
            const on = picked.includes(q.id);
            const thumb = q.image || (q.optionImages || []).find(Boolean) || (q.sequenceImages || []).find(Boolean) || (q.matchingPairs || []).map(p => p.leftImage || p.rightImage).find(Boolean);
            return (
              <button key={q.id} type="button" onClick={() => toggle(q.id)} aria-pressed={on}
                className={`no-hover-fx w-full text-left rounded-xl border-2 px-3 py-2 flex items-center gap-3 transition-colors ${on ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-300'}`}>
                {on ? <CheckSquare className="w-5 h-5 text-emerald-700 shrink-0" /> : <Square className="w-5 h-5 text-slate-400 shrink-0" />}
                {thumb && <img src={thumb} alt="" className="w-10 h-10 rounded-lg object-contain bg-white border border-slate-200 shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                    <span className={`px-1.5 rounded ${isSampleQuestion(q) ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800'}`}>{isSampleQuestion(q) ? 'MẪU' : 'CỦA TÔI'}</span>
                    <span className="text-purple-800">{typeLabel(q.type)}</span>
                    <span className="text-slate-600">· {subjectOf(q)}</span>
                  </span>
                  <span className="block text-sm font-bold text-slate-900 truncate">{q.questionText || '(Câu hỏi bằng ảnh / âm thanh)'}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-4 sm:px-5 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center gap-2">
          <label htmlFor="pick-target" className="text-sm font-bold text-slate-700 whitespace-nowrap">Thêm vào bộ:</label>
          <input id="pick-target" list="pick-targets" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Tên môn / bài học, VD: Toán 3 – Bài 12"
            className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-900 flex-1 min-w-[200px]" />
          <datalist id="pick-targets">{targets.map(t => <option key={t} value={t} />)}</datalist>
          <span className="text-sm text-slate-700 tabular-nums whitespace-nowrap">Đã chọn <strong>{picked.length}</strong> câu</span>
          <button type="button" onClick={onClose} className="no-hover-fx h-10 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-bold text-slate-700">Hủy</button>
          <button type="button" disabled={!tgt || picked.length === 0}
            onClick={() => onConfirm(tgt, bank.filter(q => picked.includes(q.id)))}
            className="no-hover-fx h-10 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black inline-flex items-center gap-2 disabled:opacity-40">
            <ListPlus className="w-4 h-4" /> Thêm {picked.length || ''} câu vào bộ
          </button>
        </div>
      </div>
    </div>
  );
};

export default PickQuestionsModal;
