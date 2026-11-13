import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft, MonitorPlay, KeyRound, Lock, UserCheck, ArrowRight } from 'lucide-react';
import type { NavigationMenuId } from './Sidebar';

/**
 * ⌘ TÌM NHANH (Ctrl + K): gõ vài chữ (có dấu hoặc không dấu) để mở ngay chức năng cần dùng.
 * Mở bằng Ctrl+K, phím "/" hoặc nút "Tìm nhanh" trên thanh trên (sự kiện OPEN_COMMAND_PALETTE_EVENT).
 */
export const OPEN_COMMAND_PALETTE_EVENT = 'lhhp:open-command-palette';

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  run: () => void;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

interface Props {
  isMacroAdmin: boolean;
  isSubjectTeacher: boolean;
  onNavigate: (id: NavigationMenuId) => void;
  onPresentation: () => void;
  onOpenCdKey: () => void;
  onChangePassword: () => void;
  /** Tài khoản Nhân viên (không quản lý lớp): chỉ liệt kê các màn này, không có lệnh trình chiếu */
  onlyViewIds?: NavigationMenuId[];
}

const VIEWS: Array<{ id: NavigationMenuId; label: string; group: string; keywords: string; classroomOnly?: boolean; homeroomOnly?: boolean; managerOnly?: boolean }> = [
  { id: 'dashboard', label: 'Trang chủ', group: 'Lớp học', keywords: 'tong quan home' },
  { id: 'classes', label: 'Lớp học', group: 'Lớp học', keywords: 'danh sach lop' },
  { id: 'students', label: 'Học sinh', group: 'Lớp học', keywords: 'hoc sinh ho so anh xu' },
  { id: 'attendance', label: 'Điểm danh học sinh', group: 'Lớp học', keywords: 'diem danh vang ban tru chuyen can', classroomOnly: true, homeroomOnly: true },
  { id: 'seating', label: 'Sơ đồ lớp', group: 'Lớp học', keywords: 'cho ngoi so do ban', classroomOnly: true, homeroomOnly: true },
  { id: 'schedule', label: 'Thời khóa biểu', group: 'Lớp học', keywords: 'tkb lich hoc', classroomOnly: true },
  { id: 'picker', label: 'Gọi tên học sinh (7 trò chơi)', group: 'Hoạt động trong lớp', keywords: 'goi ten vong quay cuon phim dua vit ong kinh hop qua tau vu tru', classroomOnly: true },
  { id: 'rewards', label: 'Đổi quà', group: 'Hoạt động trong lớp', keywords: 'doi thuong qua xu', classroomOnly: true },
  { id: 'certificate', label: 'Tạo thư khen', group: 'Hoạt động trong lớp', keywords: 'thu khen giay khen', classroomOnly: true },
  { id: 'infographic', label: 'Infographic lớp', group: 'Hoạt động trong lớp', keywords: 'poster pdf a4', classroomOnly: true, homeroomOnly: true },
  { id: 'noise', label: 'Chống ồn', group: 'Hoạt động trong lớp', keywords: 'am thanh on micro', classroomOnly: true },
  { id: 'timer', label: 'Đếm ngược', group: 'Hoạt động trong lớp', keywords: 'dong ho bam gio', classroomOnly: true },
  { id: 'reports', label: 'Thống kê', group: 'Quản lý & báo cáo', keywords: 'bao cao so lieu' },
  { id: 'staff_attendance', label: 'Chấm công nhân sự', group: 'Quản lý & báo cáo', keywords: 'cham cong giao vien nhan vien diem danh nhan su', managerOnly: true },
  { id: 'my_checkin', label: 'Chấm công của tôi', group: 'Quản lý & báo cáo', keywords: 'cham cong diem danh di lam ke khai tiet day', classroomOnly: true },
  { id: 'data', label: 'Dữ liệu', group: 'Quản lý & báo cáo', keywords: 'sao luu drive excel' },
  { id: 'links', label: 'Liên kết', group: 'Quản lý & báo cáo', keywords: 'link lien ket' },
  { id: 'guide', label: 'Hướng dẫn sử dụng', group: 'Quản lý & báo cáo', keywords: 'huong dan su dung video tai lieu pdf ho tro tac gia' },
  { id: 'ai', label: 'Trợ lý AI', group: 'Quản lý & báo cáo', keywords: 'ai tro ly gemini' },
];

export const CommandPalette: React.FC<Props> = ({ isMacroAdmin, isSubjectTeacher, onNavigate, onPresentation, onOpenCdKey, onChangePassword, onlyViewIds }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o); }
      else if (e.key === '/' && !typing && !open) { e.preventDefault(); setOpen(true); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen); };
  }, [open]);

  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const views = (onlyViewIds
      ? VIEWS.filter(v => onlyViewIds.includes(v.id))
      : VIEWS
        .filter(v => !(isMacroAdmin && v.classroomOnly))
        .filter(v => !(isSubjectTeacher && v.homeroomOnly))
        .filter(v => !(v.managerOnly && !isMacroAdmin)))
      .map(v => ({ id: `view:${v.id}`, label: v.label, group: v.group, keywords: v.keywords, icon: <ArrowRight className="w-4 h-4" />, run: () => onNavigate(v.id) }));
    const actions: PaletteCommand[] = [
      ...(!isMacroAdmin && !onlyViewIds ? [{ id: 'act:present', label: 'Bật chế độ trình chiếu lớp học', group: 'Thao tác', keywords: 'trinh chieu may chieu toan man hinh present', icon: <MonitorPlay className="w-4 h-4" />, shortcut: 'Ctrl Shift F', run: onPresentation }] : []),
      { id: 'act:checkin', label: 'Mở trang điểm danh giáo viên – nhân viên', group: 'Thao tác', keywords: 'diem danh nhan su cham cong cccd', icon: <UserCheck className="w-4 h-4" />, run: () => { window.location.href = '/diemdanh'; } },
      { id: 'act:cdkey', label: 'Nhập CDKEY bản quyền', group: 'Thao tác', keywords: 'cdkey ban quyen kich hoat', icon: <KeyRound className="w-4 h-4" />, run: onOpenCdKey },
      { id: 'act:password', label: 'Đổi mật khẩu', group: 'Thao tác', keywords: 'doi mat khau password', icon: <Lock className="w-4 h-4" />, run: onChangePassword },
    ];
    return [...views, ...actions];
  }, [isMacroAdmin, isSubjectTeacher, onNavigate, onPresentation, onOpenCdKey, onChangePassword, onlyViewIds]);

  const results = useMemo(() => {
    const t = fold(q.trim());
    if (!t) return commands;
    const words = t.split(/\s+/);
    return commands
      .map(c => { const hay = fold(`${c.label} ${c.keywords || ''} ${c.group}`); const ok = words.every(w => hay.includes(w)); return ok ? { c, score: fold(c.label).startsWith(words[0]) ? 0 : 1 } : null; })
      .filter(Boolean)
      .sort((a, b) => a!.score - b!.score)
      .map(x => x!.c);
  }, [q, commands]);

  useEffect(() => { setSel(0); }, [q]);

  if (!open) return null;
  const runAt = (i: number) => { const c = results[i]; if (!c) return; setOpen(false); c.run(); };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-sky-900/20 backdrop-blur-xs p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Tìm nhanh chức năng" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 border-b border-slate-200">
          <Search className="w-5 h-5 text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(results.length - 1, s + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); runAt(sel); }
            }}
            placeholder="Tìm chức năng… (vd: diem danh, thu khen, goi ten)"
            className="flex-1 py-3.5 text-base outline-none bg-transparent text-slate-900"
            aria-label="Tìm chức năng"
          />
          <kbd className="text-xs font-bold text-slate-500 border border-slate-200 rounded-md px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul className="max-h-[52vh] overflow-y-auto py-1.5" role="listbox">
          {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-600">Không tìm thấy chức năng phù hợp.</li>}
          {results.map((c, i) => {
            const header = !q.trim() && c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <React.Fragment key={c.id}>
                {header && <li className="px-4 pt-2.5 pb-1 text-xs font-bold uppercase tracking-wider text-slate-500" role="presentation">{header}</li>}
                <li
                  role="option"
                  aria-selected={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => runAt(i)}
                  className={`mx-1.5 px-3 py-2.5 rounded-xl flex items-center gap-3 cursor-pointer ${i === sel ? 'bg-indigo-50 text-indigo-900' : 'text-slate-800'}`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${i === sel ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{c.icon}</span>
                  <span className="flex-1 text-sm font-semibold">{c.label}</span>
                  {c.shortcut && <span className="text-xs text-slate-500">{c.shortcut}</span>}
                  {i === sel && <CornerDownLeft className="w-4 h-4 text-indigo-600" />}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
        <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-600 flex gap-4">
          <span>↑↓ chọn</span><span>Enter mở</span><span>Ctrl + K bật/tắt</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
