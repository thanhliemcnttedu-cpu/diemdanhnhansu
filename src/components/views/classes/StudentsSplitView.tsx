import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Crown, Edit3, LayoutGrid, Minus, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useClassroom } from '../../../context/ClassroomContext';
import { CoinIcon } from '../../common/CoinIcon';
import type { Student } from '../../../types';

/**
 * SAMPLE of the "management" design language (flat, one blue accent, list + detail):
 * - desktop / landscape tablet (>= 1024px): pupil list on the left, the selected pupil on the right
 * - very wide screens (>= 1536px): the coin history becomes a third column
 * - portrait tablet / phone: list only; a pupil opens as a full page with a back button
 * It only re-arranges what the card view already offers: every action is delegated to the parent's handlers.
 */
export interface StudentsSplitViewProps {
  students: Student[];
  className?: string;
  classColor?: string;
  activeSubject?: string;
  canEvaluate: boolean;
  canAssignRole: boolean;
  canEdit: boolean;
  onPlusOne: (s: Student) => void;
  onAdd: (s: Student) => void;
  onDeduct: (s: Student) => void;
  onStar: (s: Student) => void;
  onRole: (s: Student) => void;
  onEdit: (s: Student) => void;
  onDelete: (s: Student) => void;
  onBackToCards: () => void;
}

type Filter = 'all' | 'male' | 'female' | 'officer';
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Tất cả' }, { id: 'male', label: 'Nam' }, { id: 'female', label: 'Nữ' }, { id: 'officer', label: 'Cán bộ lớp' },
];
const norm = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const rolesOf = (s: Student) => (s.roles && s.roles.length ? s.roles : String(s.role || '').split(/[•,;\n]+/).map(x => x.trim()).filter(Boolean));
const dayLabel = (ms: number) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
const timeLabel = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

const outline = 'no-hover-fx h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer';

export const StudentsSplitView: React.FC<StudentsSplitViewProps> = (p) => {
  const { transactions } = useClassroom();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const accent = p.classColor || '#2563EB';

  const list = useMemo(() => {
    const q = norm(query.trim());
    return p.students.filter(s => {
      if (filter === 'male' && String(s.gender) === 'Nữ') return false;
      if (filter === 'female' && String(s.gender) !== 'Nữ') return false;
      if (filter === 'officer' && rolesOf(s).length === 0) return false;
      return !q || norm(s.name).includes(q);
    });
  }, [p.students, filter, query]);
  const count = (f: Filter) => p.students.filter(s => (f === 'all' ? true : f === 'male' ? String(s.gender) !== 'Nữ' : f === 'female' ? String(s.gender) === 'Nữ' : rolesOf(s).length > 0)).length;

  // Keep a pupil selected on wide screens so the right pane is never empty
  const selected = p.students.find(s => s.id === selectedId) || list[0] || null;
  useEffect(() => { if (!p.students.some(s => s.id === selectedId)) { setSelectedId(null); setMobileOpen(false); } }, [p.students, selectedId]);

  const history = useMemo(() => {
    if (!selected) return [] as Array<{ day: string; items: typeof transactions }>;
    const mine = transactions.filter(t => t.studentId === selected.id).sort((a, b) => b.timestamp - a.timestamp).slice(0, 40);
    const groups: Array<{ day: string; items: typeof transactions }> = [];
    mine.forEach(t => { const d = dayLabel(t.timestamp); const g = groups[groups.length - 1]; if (g && g.day === d) g.items.push(t); else groups.push({ day: d, items: [t] }); });
    return groups;
  }, [transactions, selected]);

  const subjectCoins = selected ? Object.entries(selected.subjectPoints || {}).filter(([, v]) => Number(v) > 0) : [];

  const historyBlock = (
    <section aria-label="Lịch sử xu" className="min-w-0">
      <h4 className="normal-case text-sm font-bold text-slate-900 mb-2">Lịch sử cộng, trừ xu</h4>
      {history.length === 0 ? <p className="text-sm text-slate-600">Chưa có lần cộng hoặc trừ xu nào.</p> : (
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          {history.map(g => (
            <div key={g.day}>
              <p className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 tabular-nums">{g.day}</p>
              <ul className="divide-y divide-slate-100">
                {g.items.map(t => (
                  <li key={t.id} className="px-3 py-2 flex items-start gap-3">
                    <span className={`shrink-0 min-w-[2.75rem] text-sm font-bold tabular-nums ${t.amount < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{t.amount > 0 ? '+' : ''}{t.amount}</span>
                    <span className="min-w-0 flex-1 text-sm text-slate-800 break-words">{t.reason || (t.amount < 0 ? 'Trừ xu' : 'Cộng xu')}</span>
                    <span className="shrink-0 text-xs text-slate-500 tabular-nums">{timeLabel(t.timestamp)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  const detail = selected && (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <div className="flex items-center gap-4">
          <img src={selected.avatar} alt="" className="w-20 h-20 rounded-2xl object-cover bg-slate-100 border border-slate-200 shrink-0" />
          <div className="min-w-0">
            <h3 className="normal-case text-xl font-bold text-slate-900 leading-snug break-words">{selected.name}</h3>
            <p className="text-sm text-slate-600">{p.className ? `Lớp ${p.className} · ` : ''}Số thứ tự {selected.stt}</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-base font-bold text-slate-900 tabular-nums"><CoinIcon /> {selected.points || 0} xu thi đua</p>
          </div>
        </div>

        <dl className="rounded-2xl border border-slate-200 divide-y divide-slate-100 text-sm">
          {([
            ['Giới tính', String(selected.gender) === 'Nữ' ? 'Nữ' : 'Nam'],
            ['Ngày sinh', selected.birthDate || 'Chưa nhập'],
            ['Tổ', selected.group || 'Chưa xếp tổ'],
            ['Chức vụ', rolesOf(selected).join(', ') || 'Không'],
            ['Xu theo môn', subjectCoins.length ? subjectCoins.map(([k, v]) => `${k}: ${v}`).join(' · ') : 'Chưa có'],
          ] as Array<[string, string]>).map(([k, v]) => (
            <div key={k} className="px-3.5 py-2.5 flex items-start justify-between gap-4">
              <dt className="normal-case tracking-normal text-slate-600 shrink-0">{k}</dt>
              <dd className="font-semibold text-slate-900 text-right break-words min-w-0">{v}</dd>
            </div>
          ))}
        </dl>

        {p.canEvaluate && (
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => p.onPlusOne(selected)} title={`Cộng nhanh 1 xu${p.activeSubject ? ` môn ${p.activeSubject}` : ''}`}
              className="no-hover-fx h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer">
              <Plus className="w-4 h-4" aria-hidden="true" /> 1 xu
            </button>
            <button type="button" onClick={() => p.onAdd(selected)} className={outline}><Plus className="w-4 h-4 text-emerald-700" aria-hidden="true" /> Cộng xu</button>
            <button type="button" onClick={() => p.onDeduct(selected)} className={outline}><Minus className="w-4 h-4 text-red-700" aria-hidden="true" /> Trừ xu</button>
          </div>
        )}
        {(p.canEvaluate || p.canAssignRole || p.canEdit) && (
          <div className="flex flex-wrap gap-2">
            {p.canEvaluate && <button type="button" onClick={() => p.onStar(selected)} className={outline}><Star className="w-4 h-4 text-amber-600" aria-hidden="true" /> Tặng sao</button>}
            {p.canAssignRole && <button type="button" onClick={() => p.onRole(selected)} className={outline}><Crown className="w-4 h-4 text-blue-700" aria-hidden="true" /> Chức vụ</button>}
            {p.canEdit && <button type="button" onClick={() => p.onEdit(selected)} className={outline}><Edit3 className="w-4 h-4 text-blue-700" aria-hidden="true" /> Sửa thông tin</button>}
            {p.canEdit && <button type="button" onClick={() => p.onDelete(selected)} className={`${outline} !text-red-700 !border-red-200 hover:!bg-red-50`}><Trash2 className="w-4 h-4" aria-hidden="true" /> Xóa</button>}
          </div>
        )}
      </div>
      {historyBlock}
    </div>
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden" data-students-split>
      {/* Filter row: pills + search + way back to the card layout */}
      <div className="px-3 sm:px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
        <div className="inline-flex p-1 rounded-full bg-slate-100 max-w-full overflow-x-auto" role="tablist" aria-label="Lọc học sinh">
          {FILTERS.map(f => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
              className={`no-hover-fx h-9 px-3 rounded-full text-sm font-semibold whitespace-nowrap cursor-pointer ${filter === f.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-700 hover:text-slate-900'}`}>
              {f.label} <span className="tabular-nums text-slate-500">{count(f.id)}</span>
            </button>
          ))}
        </div>
        <label className="relative flex-1 min-w-[180px]">
          <span className="sr-only">Tìm học sinh theo tên</span>
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm theo tên học sinh"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600" />
        </label>
        <button type="button" onClick={p.onBackToCards} className={`${outline} !h-10`} title="Quay về giao diện thẻ như trước">
          <LayoutGrid className="w-4 h-4" aria-hidden="true" /> Dạng thẻ
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)]">
        {/* List */}
        <ul className="lg:border-r lg:border-slate-200 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto divide-y divide-slate-100" aria-label="Danh sách học sinh">
          {list.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-600">Không có học sinh phù hợp.</li>}
          {list.map(s => {
            const on = selected?.id === s.id;
            return (
              <li key={s.id}>
                <button type="button" onClick={() => { setSelectedId(s.id); setMobileOpen(true); }} aria-current={on ? 'true' : undefined}
                  className={`no-hover-fx w-full text-left pl-0 pr-3 py-2.5 flex items-center gap-3 cursor-pointer ${on ? 'lg:bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <span className="self-stretch w-1 rounded-r shrink-0" style={{ background: on ? '#2563EB' : accent, opacity: on ? 1 : 0.55 }} aria-hidden="true" />
                  <img src={s.avatar} alt="" loading="lazy" className="w-11 h-11 rounded-xl object-cover bg-slate-100 border border-slate-200 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-slate-900 truncate">{s.name}</span>
                    <span className="block text-xs text-slate-600 truncate">Số {s.stt}{s.group ? ` · ${s.group}` : ''}{s.birthDate ? ` · ${s.birthDate}` : ''}</span>
                    {rolesOf(s).length > 0 && <span className="mt-0.5 inline-block max-w-full truncate px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 text-xs font-semibold">{rolesOf(s)[0]}{rolesOf(s).length > 1 ? ` +${rolesOf(s).length - 1}` : ''}</span>}
                  </span>
                  <span className="shrink-0 text-sm font-bold text-slate-900 tabular-nums inline-flex items-center gap-1"><CoinIcon /> {s.points || 0}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Detail: right pane on wide screens */}
        <div className="max-lg:hidden p-5 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto">
          {detail || <p className="text-sm text-slate-600">Chọn một học sinh ở danh sách bên trái để xem chi tiết.</p>}
        </div>
      </div>

      {/* Detail: full page on phone / portrait tablet */}
      {mobileOpen && selected && (
        <div className="lg:hidden fixed inset-0 z-50 bg-white flex flex-col" role="dialog" aria-modal="true" aria-label={`Chi tiết học sinh ${selected.name}`}>
          <div className="h-14 px-2 flex items-center gap-1 bg-blue-600 text-white shrink-0">
            <button type="button" onClick={() => setMobileOpen(false)} className="no-hover-fx w-11 h-11 rounded-full hover:bg-white/15 inline-flex items-center justify-center cursor-pointer" aria-label="Quay lại danh sách">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-base font-bold truncate">Học sinh</p>
              <p className="text-xs text-white truncate">{p.className ? `Lớp ${p.className}` : 'Chi tiết'}</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{detail}</div>
        </div>
      )}
    </div>
  );
};

export default StudentsSplitView;
