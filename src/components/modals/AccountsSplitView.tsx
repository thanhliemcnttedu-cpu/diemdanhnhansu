import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRightLeft, Briefcase, ClipboardCheck, Edit3, KeyRound, LogIn, Search, Table2, Trash2 } from 'lucide-react';
import type { UserAccount } from '../../types';

/**
 * "List + detail" layout for the account list, same design language as StudentsSplitView:
 * - >= 1024px: account list on the left, the selected account on the right
 * - below: list only; an account opens as a full page (above the modal) with a back button
 * Purely presentational: every action is delegated to the parent's handlers, and an action
 * only renders when `readOnly` is false AND its handler was passed (AND its `can…` check passes).
 * SECURITY: this component never reads or renders passwords, hashes, CDKEY values or tokens.
 */
export type AccountFlagKey = 'staffReportViewer' | 'nonTeaching';

export interface AccountsSplitViewProps {
  /** The SAME filtered / scoped list the account table renders */
  users: UserAccount[];
  /** View-only (Ban giám hiệu): no action button is rendered */
  readOnly: boolean;
  /** Key of the signed-in account (id or username), to mark "Bạn" */
  currentUserKey?: string;
  onOpenWorkspace?: (user: UserAccount) => void;
  onEdit?: (user: UserAccount) => void;
  onTransfer?: (user: UserAccount) => void;
  onToggleFlag?: (user: UserAccount, key: AccountFlagKey) => void;
  onResetPassword?: (user: UserAccount) => void;
  onDelete?: (user: UserAccount) => void;
  /** Per-account visibility, mirroring the table row conditions (default: visible) */
  canTransfer?: (user: UserAccount) => boolean;
  canToggleFlag?: (user: UserAccount, key: AccountFlagKey) => boolean;
  canDelete?: (user: UserAccount) => boolean;
  onBackToTable: () => void;
}

type Group = 'homeroom' | 'subject' | 'bgh' | 'admin';
type Filter = 'all' | Group;
const GROUP_TABS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'homeroom', label: 'Giáo viên chủ nhiệm' },
  { id: 'subject', label: 'Giáo viên bộ môn' },
  { id: 'bgh', label: 'Ban giám hiệu' },
  { id: 'admin', label: 'Quản trị' },
];

const norm = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
// Accounts loaded from Drive may have no id: fall back to the username (same rule as the modal's uidOf)
const keyOf = (u: UserAccount) => u.id || u.username || '';

// Same precedence as the role label of the account table
const roleOf = (u: UserAccount): { label: string; group: Group } => {
  if (u.role === 'admin') return { label: 'Quản trị tối cao', group: 'admin' };
  if (u.role === 'school_admin') return { label: 'Quản trị nhà trường', group: 'admin' };
  if (u.role === 'bgh' || u.isBgh) return { label: 'Ban giám hiệu', group: 'bgh' };
  if (u.role === 'guest_admin') return { label: 'Quản trị cá nhân', group: 'admin' };
  if (u.role === 'subject' && u.nonTeaching) return { label: 'Nhân viên', group: 'subject' };
  if (u.role === 'subject') return { label: 'GV bộ môn', group: 'subject' };
  return { label: 'GV chủ nhiệm', group: 'homeroom' };
};

const assignedOf = (u: UserAccount): string => {
  if (u.role === 'homeroom') return u.assignedClassName || '';
  if (u.role === 'subject' && !u.nonTeaching) return u.subjectName ? `Môn ${u.subjectName}` : '';
  return '';
};
const scopeOf = (u: UserAccount): string => {
  if (u.role === 'admin') return 'Toàn hệ thống';
  if (u.role === 'school_admin' || u.role === 'bgh' || u.isBgh) return 'Toàn trường';
  if (u.role === 'homeroom') return u.assignedClassName || 'Chưa gán lớp';
  if (u.role === 'subject' && u.nonTeaching) return 'Không quản lý lớp';
  if (u.role === 'subject') return `Môn: ${u.subjectName || 'Bộ môn'}`;
  return 'Chưa gán';
};
const schoolOf = (u: UserAccount): string => (u.tenantType === 'guest' ? 'Giáo viên cá nhân (vãng lai)' : (u.schoolName || 'Chưa rõ'));
const isLocked = (u: UserAccount) => u.status === 'locked';
const isDisabled = (u: UserAccount) => Boolean(u.disabled);
const statusOf = (u: UserAccount): string => [isLocked(u) ? 'Đã khóa' : '', isDisabled(u) ? 'Ngừng hoạt động' : ''].filter(Boolean).join(' · ') || 'Hoạt động';
const initialsOf = (u: UserAccount): string => {
  const parts = String(u.fullName || u.username || '').trim().split(/\s+/).filter(Boolean);
  return (parts.length ? parts[parts.length - 1].charAt(0) : '?').toUpperCase();
};
const dateLabel = (ms?: number): string => {
  if (!ms) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const outline = 'no-hover-fx h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer';
const roleTag = 'inline-block max-w-full truncate px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 text-xs font-semibold';
const stateTag = 'inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold whitespace-nowrap';

const Avatar: React.FC<{ user: UserAccount; size: string; text: string }> = ({ user, size, text }) => (
  user.avatar
    ? <img src={user.avatar} alt="" loading="lazy" className={`${size} rounded-xl object-cover bg-slate-100 border border-slate-200 shrink-0`} />
    : <span className={`${size} ${text} rounded-xl bg-blue-50 border border-blue-100 text-blue-800 font-bold inline-flex items-center justify-center shrink-0`} aria-hidden="true">{initialsOf(user)}</span>
);

export const AccountsSplitView: React.FC<AccountsSplitViewProps> = (p) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: p.users.length, homeroom: 0, subject: 0, bgh: 0, admin: 0 };
    p.users.forEach(u => { c[roleOf(u).group] += 1; });
    return c;
  }, [p.users]);
  // Only role groups that have at least one account
  const tabs = GROUP_TABS.filter(t => t.id === 'all' || counts[t.id] > 0);
  const activeFilter: Filter = filter !== 'all' && counts[filter] === 0 ? 'all' : filter;

  const list = useMemo(() => {
    const q = norm(query.trim());
    return p.users.filter(u => {
      if (activeFilter !== 'all' && roleOf(u).group !== activeFilter) return false;
      return !q || norm(u.fullName).includes(q) || norm(u.username).includes(q);
    });
  }, [p.users, activeFilter, query]);

  // Keep an account selected on wide screens so the right pane is never empty
  const selected = p.users.find(u => keyOf(u) === selectedKey) || list[0] || null;
  useEffect(() => {
    if (selectedKey !== null && !p.users.some(u => keyOf(u) === selectedKey)) { setSelectedKey(null); setMobileOpen(false); }
  }, [p.users, selectedKey]);

  // Close the full-page detail first: the parent's confirm dialogs and notices live in the modal underneath it
  const run = (fn: () => void) => { setMobileOpen(false); fn(); };

  const renderDetail = (u: UserAccount) => {
    const role = roleOf(u);
    const isSelf = Boolean(p.currentUserKey) && keyOf(u) === p.currentUserKey;
    const branch = [u.assignedBranch, u.assignedCampus].filter(Boolean).join(' · ');
    const rows: Array<[string, string]> = [
      ['Họ tên', u.fullName || 'Chưa cập nhật'],
      ['Tên đăng nhập', u.username],
      ['Vai trò', role.label],
      ['Trường', schoolOf(u)],
      ['Lớp được giao', scopeOf(u)],
      ...(branch ? [['Phân hiệu, điểm trường', branch] as [string, string]] : []),
      ['Trạng thái', statusOf(u)],
      ['Số điện thoại', u.phone || 'Chưa cập nhật'],
      ['Email', u.email || 'Chưa cập nhật'],
      ...(u.staffCode ? [['Tài khoản chấm công', 'Dùng chung với chấm công nhân sự'] as [string, string]] : []),
      ...(u.staffReportViewer ? [['Báo cáo chấm công', 'Được xem và xuất báo cáo (chỉ đọc)'] as [string, string]] : []),
      ...(dateLabel(u.createdAt) ? [['Ngày tạo', dateLabel(u.createdAt)] as [string, string]] : []),
      ...(dateLabel(u.lastLoginAt) ? [['Đăng nhập gần nhất', dateLabel(u.lastLoginAt)] as [string, string]] : []),
    ];

    const onOpenWorkspace = p.onOpenWorkspace;
    const onEdit = p.onEdit;
    const onTransfer = p.onTransfer;
    const onToggleFlag = p.onToggleFlag;
    const onResetPassword = p.onResetPassword;
    const onDelete = p.onDelete;
    const flagVisible = (key: AccountFlagKey) => Boolean(onToggleFlag) && (p.canToggleFlag ? p.canToggleFlag(u, key) : true);
    const showEdit = !p.readOnly && Boolean(onEdit);
    const showWorkspace = !p.readOnly && Boolean(onOpenWorkspace);
    const showTransfer = !p.readOnly && Boolean(onTransfer) && (p.canTransfer ? p.canTransfer(u) : true);
    const showReport = !p.readOnly && flagVisible('staffReportViewer');
    const showStaff = !p.readOnly && flagVisible('nonTeaching');
    const showReset = !p.readOnly && Boolean(onResetPassword);
    const showDelete = !p.readOnly && Boolean(onDelete) && (p.canDelete ? p.canDelete(u) : true);
    const anyAction = showEdit || showWorkspace || showTransfer || showReport || showStaff || showReset || showDelete;

    return (
      <div className="min-w-0 space-y-4 max-w-2xl">
        <div className="flex items-center gap-4">
          <Avatar user={u} size="w-16 h-16" text="text-2xl" />
          <div className="min-w-0">
            <h3 className="normal-case text-xl font-bold text-slate-900 leading-snug break-words">{u.fullName || u.username}</h3>
            <p className="text-sm text-slate-600 break-words">{u.username}{assignedOf(u) ? ` · ${assignedOf(u)}` : ''}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={roleTag}>{role.label}</span>
              {isSelf && <span className={stateTag}>Bạn</span>}
              {isLocked(u) && <span className={stateTag}>Đã khóa</span>}
              {isDisabled(u) && <span className={stateTag}>Ngừng hoạt động</span>}
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

        {p.readOnly && <p className="text-sm text-slate-600">Tài khoản của bạn chỉ được xem danh sách tài khoản.</p>}

        {anyAction && (
          <div className="flex flex-wrap gap-2">
            {showEdit && onEdit && (
              <button type="button" onClick={() => run(() => onEdit(u))} title="Sửa thông tin hoặc gán lại quyền"
                className="no-hover-fx h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer">
                <Edit3 className="w-4 h-4" aria-hidden="true" /> Sửa thông tin
              </button>
            )}
            {showReset && onResetPassword && (
              <button type="button" onClick={() => run(() => onResetPassword(u))} className={outline} title="Đặt lại mật khẩu cho tài khoản này">
                <KeyRound className="w-4 h-4 text-blue-700" aria-hidden="true" /> Đặt lại mật khẩu
              </button>
            )}
            {showWorkspace && onOpenWorkspace && (
              <button type="button" onClick={() => run(() => onOpenWorkspace(u))} className={outline} title="Xem không gian làm việc của tài khoản này">
                <LogIn className="w-4 h-4 text-blue-700" aria-hidden="true" /> Xem không gian làm việc
              </button>
            )}
            {showReport && onToggleFlag && (
              <button type="button" onClick={() => run(() => onToggleFlag(u, 'staffReportViewer'))} aria-pressed={Boolean(u.staffReportViewer)} className={outline}
                title="Quyền xem và xuất báo cáo mục Chấm công nhân sự (chỉ đọc)">
                <ClipboardCheck className="w-4 h-4 text-blue-700" aria-hidden="true" /> {u.staffReportViewer ? 'Thu hồi quyền xem báo cáo chấm công' : 'Cấp quyền xem báo cáo chấm công'}
              </button>
            )}
            {showStaff && onToggleFlag && (
              <button type="button" onClick={() => run(() => onToggleFlag(u, 'nonTeaching'))} aria-pressed={Boolean(u.nonTeaching)} className={outline}
                title="Tài khoản Nhân viên không có chức năng quản lý lớp học">
                <Briefcase className="w-4 h-4 text-blue-700" aria-hidden="true" /> {u.nonTeaching ? 'Chuyển lại thành GV bộ môn' : 'Chuyển thành Nhân viên'}
              </button>
            )}
            {showTransfer && onTransfer && (
              <button type="button" onClick={() => run(() => onTransfer(u))} className={outline} title="Chuyển toàn bộ dữ liệu của tài khoản sang một trường">
                <ArrowRightLeft className="w-4 h-4 text-blue-700" aria-hidden="true" /> {u.tenantType === 'guest' ? 'Gán vào trường' : 'Chuyển trường'}
              </button>
            )}
            {showDelete && onDelete && (
              <button type="button" onClick={() => run(() => onDelete(u))} className={`${outline} !text-red-700 !border-red-200 hover:!bg-red-50`} title="Xóa tài khoản này">
                <Trash2 className="w-4 h-4" aria-hidden="true" /> Xóa
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden" data-accounts-split>
      {/* Filter row: role pills + search + way back to the table layout */}
      <div className="px-3 sm:px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
        <div className="inline-flex p-1 rounded-full bg-slate-100 max-w-full overflow-x-auto" role="tablist" aria-label="Lọc tài khoản theo vai trò">
          {tabs.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={activeFilter === t.id} onClick={() => setFilter(t.id)}
              className={`no-hover-fx h-10 px-3 rounded-full text-sm font-semibold whitespace-nowrap cursor-pointer ${activeFilter === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-700 hover:text-slate-900'}`}>
              {t.label} <span className="tabular-nums text-slate-500">{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <label className="relative flex-1 min-w-[180px]">
          <span className="sr-only">Tìm tài khoản theo họ tên hoặc tên đăng nhập</span>
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm theo họ tên, tên đăng nhập"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600" />
        </label>
        <button type="button" onClick={p.onBackToTable} className={`${outline} !h-10`} title="Quay về bảng tài khoản như trước">
          <Table2 className="w-4 h-4" aria-hidden="true" /> Dạng bảng
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)]">
        {/* List */}
        <ul className="lg:border-r lg:border-slate-200 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto divide-y divide-slate-100" aria-label="Danh sách tài khoản">
          {list.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-600">Không có tài khoản phù hợp.</li>}
          {list.map(u => {
            const on = selected !== null && keyOf(selected) === keyOf(u);
            const assigned = assignedOf(u);
            return (
              <li key={keyOf(u)}>
                <button type="button" onClick={() => { setSelectedKey(keyOf(u)); setMobileOpen(true); }} aria-current={on ? 'true' : undefined}
                  className={`no-hover-fx w-full text-left pl-0 pr-3 py-2.5 flex items-center gap-3 cursor-pointer ${on ? 'lg:bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <span className={`self-stretch w-1 rounded-r shrink-0 ${on ? 'bg-blue-600' : 'bg-transparent'}`} aria-hidden="true" />
                  <Avatar user={u} size="w-11 h-11" text="text-base" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-slate-900 truncate">{u.fullName || u.username}</span>
                    <span className="block text-xs text-slate-600 truncate">{u.username}{assigned ? ` · ${assigned}` : ''}</span>
                  </span>
                  <span className="shrink-0 max-w-[45%] flex flex-col items-end gap-1">
                    <span className={roleTag}>{roleOf(u).label}</span>
                    {isLocked(u) && <span className={stateTag}>Đã khóa</span>}
                    {isDisabled(u) && <span className={stateTag}>Ngừng hoạt động</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Detail: right pane on wide screens */}
        <div className="max-lg:hidden p-5 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto">
          {selected ? renderDetail(selected) : <p className="text-sm text-slate-600">Chọn một tài khoản ở danh sách bên trái để xem chi tiết.</p>}
        </div>
      </div>

      {/* Detail: full page on phone / portrait tablet, above the account modal (z-50) */}
      {mobileOpen && selected && (
        <div className="lg:hidden fixed inset-0 z-[60] bg-white flex flex-col" role="dialog" aria-modal="true" aria-label={`Chi tiết tài khoản ${selected.fullName || selected.username}`}>
          <div className="h-14 px-2 flex items-center gap-1 bg-blue-600 text-white shrink-0">
            <button type="button" onClick={() => setMobileOpen(false)} className="no-hover-fx w-11 h-11 rounded-full hover:bg-white/15 inline-flex items-center justify-center cursor-pointer" aria-label="Quay lại danh sách">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-base font-bold truncate">Tài khoản</p>
              <p className="text-xs text-white truncate">{roleOf(selected).label}</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{renderDetail(selected)}</div>
        </div>
      )}
    </div>
  );
};

export default AccountsSplitView;
