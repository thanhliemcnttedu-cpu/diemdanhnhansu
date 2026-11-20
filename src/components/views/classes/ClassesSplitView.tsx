import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Calendar, Edit3, LayoutGrid, Search, Trash2 } from 'lucide-react';
import { CoinIcon } from '../../common/CoinIcon';
import type { Classroom, Student } from '../../../types';

/**
 * "Management" design language (flat, one blue accent, list + detail) for the classes tab.
 * Same behaviour as StudentsSplitView:
 * - desktop / landscape tablet (>= 1024px): class list on the left, the selected class on the right
 * - portrait tablet / phone: list only; a class opens as a full page with a back button
 * It only re-arranges what the card grid already offers: every action is delegated to the parent's handlers,
 * and an action is shown only when the parent passes both the handler and its `can…` flag.
 */
export interface ClassesSplitViewProps {
  classes: Classroom[];
  /** All pupils the parent holds; they are grouped by `classId` here. */
  students: Student[];
  activeClassId?: string | null;
  /** Resolves the teacher's display name the same way the card grid does. */
  teacherNameOf?: (c: Classroom) => string;
  canOpen?: boolean;
  canSchedule?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onOpen?: (c: Classroom) => void;
  onSchedule?: (c: Classroom) => void;
  onEdit?: (c: Classroom) => void;
  onDelete?: (c: Classroom) => void;
  onBackToCards: () => void;
}

const norm = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const displayNameOf = (c: Classroom) => { const n = String(c.name || '').trim(); return /^lớp\s+/i.test(n) ? n : `Lớp ${n}`; };
const gradeOf = (c: Classroom) => String(c.grade || '').trim();

const outline = 'no-hover-fx h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer';

export const ClassesSplitView: React.FC<ClassesSplitViewProps> = (p) => {
  const [grade, setGrade] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const teacherOf = (c: Classroom) => (p.teacherNameOf ? p.teacherNameOf(c) : c.teacherName) || '';

  const byClass = useMemo(() => {
    const map = new Map<string, Student[]>();
    p.students.forEach(s => { const arr = map.get(s.classId); if (arr) arr.push(s); else map.set(s.classId, [s]); });
    return map;
  }, [p.students]);
  const pupilsOf = (id: string) => byClass.get(id) || [];

  const grades = useMemo(() => {
    const counts = new Map<string, number>();
    p.classes.forEach(c => { const g = gradeOf(c); if (g) counts.set(g, (counts.get(g) || 0) + 1); });
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0], 'vi', { numeric: true }));
  }, [p.classes]);
  // A grade that disappeared (parent filter changed) falls back to "all"
  const activeGrade = grade !== 'all' && !grades.some(([g]) => g === grade) ? 'all' : grade;

  const list = useMemo(() => {
    const q = norm(query.trim());
    return p.classes.filter(c => {
      if (activeGrade !== 'all' && gradeOf(c) !== activeGrade) return false;
      return !q || norm(c.name).includes(q) || norm(teacherOf(c)).includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.classes, p.teacherNameOf, activeGrade, query]);

  // Keep a class selected on wide screens so the right pane is never empty
  const selected = p.classes.find(c => c.id === selectedId) || list[0] || null;
  useEffect(() => { if (!p.classes.some(c => c.id === selectedId)) { setSelectedId(null); setMobileOpen(false); } }, [p.classes, selectedId]);

  const showOpen = Boolean(p.canOpen && p.onOpen);
  const showSchedule = Boolean(p.canSchedule && p.onSchedule);
  const showEdit = Boolean(p.canEdit && p.onEdit);
  const showDelete = Boolean(p.canDelete && p.onDelete);

  const detail = selected && (() => {
    const pupils = pupilsOf(selected.id).slice().sort((a, b) => (a.stt || 0) - (b.stt || 0));
    const male = pupils.filter(s => s.gender === 'Nam').length;
    const female = pupils.filter(s => s.gender === 'Nữ').length;
    const place = [selected.branch, selected.campus].map(x => String(x || '').trim()).filter(Boolean).join(' · ');
    const rows: Array<[string, string]> = [
      ['Khối', gradeOf(selected) || 'Chưa nhập'],
      ['Giáo viên', teacherOf(selected) || 'Chưa phân công'],
      ['Năm học', selected.academicYear || 'Chưa nhập'],
      ['Sĩ số', `${pupils.length} học sinh`],
      ['Nam', String(male)],
      ['Nữ', String(female)],
      ['Phân hiệu / Điểm trường', place || 'Chưa gán phân hiệu'],
    ];
    if (selected.slogan) rows.push(['Khẩu hiệu', selected.slogan]);
    return (
      <div className="min-w-0 space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-1.5 self-stretch min-h-[3rem] rounded-full shrink-0" style={{ background: selected.color || '#2563EB' }} aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="normal-case text-xl font-bold text-slate-900 leading-snug break-words">{displayNameOf(selected)}</h3>
            <p className="text-sm text-slate-600">
              {[gradeOf(selected), selected.academicYear].filter(Boolean).join(' · ')}
              {selected.id === p.activeClassId && <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 text-xs font-semibold">Đang chọn</span>}
            </p>
          </div>
        </div>

        <dl className="rounded-2xl border border-slate-200 divide-y divide-slate-100 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="px-3.5 py-2.5 flex items-start justify-between gap-4">
              <dt className="normal-case tracking-normal text-slate-600 shrink-0">{k}</dt>
              <dd className="font-semibold text-slate-900 text-right break-words min-w-0">{v}</dd>
            </div>
          ))}
        </dl>

        {(showOpen || showSchedule || showEdit || showDelete) && (
          <div className="flex flex-wrap gap-2">
            {showOpen && (
              <button type="button" onClick={() => p.onOpen?.(selected)} title="Chọn lớp này và mở danh sách học sinh"
                className="no-hover-fx h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer">
                Vào lớp học <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            {showSchedule && <button type="button" onClick={() => p.onSchedule?.(selected)} className={outline}><Calendar className="w-4 h-4 text-blue-700" aria-hidden="true" /> Thời khóa biểu</button>}
            {showEdit && <button type="button" onClick={() => p.onEdit?.(selected)} className={outline}><Edit3 className="w-4 h-4 text-blue-700" aria-hidden="true" /> Sửa thông tin</button>}
            {showDelete && <button type="button" onClick={() => p.onDelete?.(selected)} className={`${outline} !text-red-700 !border-red-200 hover:!bg-red-50`}><Trash2 className="w-4 h-4" aria-hidden="true" /> Xóa lớp</button>}
          </div>
        )}

        <section aria-label="Học sinh của lớp" className="min-w-0">
          <h4 className="normal-case text-sm font-bold text-slate-900 mb-2">Học sinh của lớp <span className="tabular-nums text-slate-500 font-semibold">{pupils.length}</span></h4>
          {pupils.length === 0 ? <p className="text-sm text-slate-600">Lớp chưa có học sinh nào.</p> : (
            <ul className="rounded-2xl border border-slate-200 divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {pupils.map(s => (
                <li key={s.id} className="px-3 py-2 flex items-center gap-3">
                  <span className="shrink-0 w-7 text-xs text-slate-500 tabular-nums text-right">{s.stt}</span>
                  <span className="min-w-0 flex-1 text-sm text-slate-900 truncate">{s.name}</span>
                  <span className="shrink-0 text-sm font-bold text-slate-900 tabular-nums inline-flex items-center gap-1"><CoinIcon /> {s.points || 0}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  })();

  const pill = (id: string, label: string, n: number) => (
    <button key={id} type="button" role="tab" aria-selected={activeGrade === id} onClick={() => setGrade(id)}
      className={`no-hover-fx h-10 px-3 rounded-full text-sm font-semibold whitespace-nowrap cursor-pointer ${activeGrade === id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-700 hover:text-slate-900'}`}>
      {label} <span className="tabular-nums text-slate-500">{n}</span>
    </button>
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden" data-classes-split>
      {/* Filter row: grade pills + search + way back to the card layout */}
      <div className="px-3 sm:px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
        <div className="inline-flex p-1 rounded-full bg-slate-100 max-w-full lg:max-w-[34rem] overflow-x-auto" role="tablist" aria-label="Lọc lớp theo khối">
          {pill('all', 'Tất cả', p.classes.length)}
          {grades.map(([g, n]) => pill(g, g, n))}
        </div>
        <label className="relative flex-1 min-w-[180px]">
          <span className="sr-only">Tìm lớp theo tên lớp hoặc tên giáo viên</span>
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm theo tên lớp, giáo viên"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600" />
        </label>
        <button type="button" onClick={p.onBackToCards} className={`${outline} !h-10`} title="Quay về giao diện thẻ như trước">
          <LayoutGrid className="w-4 h-4" aria-hidden="true" /> Dạng thẻ
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)]">
        {/* List */}
        <ul className="lg:border-r lg:border-slate-200 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto divide-y divide-slate-100" aria-label="Danh sách lớp học">
          {list.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-600">Không có lớp học phù hợp.</li>}
          {list.map(c => {
            const on = selected?.id === c.id;
            const sub = [gradeOf(c), teacherOf(c), String(c.branch || '').trim()].filter(Boolean).join(' · ');
            return (
              <li key={c.id}>
                <button type="button" onClick={() => { setSelectedId(c.id); setMobileOpen(true); }} aria-current={on ? 'true' : undefined}
                  className={`no-hover-fx w-full min-h-[3.5rem] text-left pl-0 pr-3 py-2.5 flex items-center gap-3 cursor-pointer ${on ? 'lg:bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <span className="self-stretch w-1.5 rounded-r shrink-0" style={{ background: c.color || '#2563EB' }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold text-slate-900 truncate">{displayNameOf(c)}</span>
                    {sub && <span className="block text-xs text-slate-600 truncate">{sub}</span>}
                    {c.id === p.activeClassId && <span className="mt-0.5 inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 text-xs font-semibold">Đang chọn</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-bold text-slate-900 tabular-nums">{pupilsOf(c.id).length}</span>
                    <span className="block text-xs text-slate-600">học sinh</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Detail: right pane on wide screens */}
        <div className="max-lg:hidden p-5 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto">
          {detail || <p className="text-sm text-slate-600">Chọn một lớp ở danh sách bên trái để xem chi tiết.</p>}
        </div>
      </div>

      {/* Detail: full page on phone / portrait tablet */}
      {mobileOpen && selected && (
        <div className="lg:hidden fixed inset-0 z-50 bg-white flex flex-col" role="dialog" aria-modal="true" aria-label={`Chi tiết ${displayNameOf(selected)}`}>
          <div className="h-14 px-2 flex items-center gap-1 bg-blue-600 text-white shrink-0">
            <button type="button" onClick={() => setMobileOpen(false)} className="no-hover-fx w-11 h-11 rounded-full hover:bg-white/15 inline-flex items-center justify-center cursor-pointer" aria-label="Quay lại danh sách">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-base font-bold truncate">Lớp học</p>
              <p className="text-xs text-white truncate">{displayNameOf(selected)}</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{detail}</div>
        </div>
      )}
    </div>
  );
};

export default ClassesSplitView;
