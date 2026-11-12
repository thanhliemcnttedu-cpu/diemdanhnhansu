import React, { useEffect, useState } from 'react';
import { HardDrive, Pencil, Check, X, AlertTriangle } from 'lucide-react';

/**
 * Shows WHERE the picked folder lives (drive + full address).
 * Browsers never reveal the full path of a picked folder (only its name), so the user pastes the address
 * once from File Explorer; it is kept in localStorage on this machine as a reminder and shown from then on.
 * The note is dropped automatically when another folder is picked.
 */
interface Props {
  /** Unique per feature + account, e.g. "quiz:79100000" */
  storageKey: string;
  /** Name of the folder the browser reports (last part of the path) */
  folderName: string;
}

const PREFIX = 'lhhp_folder_path:';
const clean = (s: string) => s.trim().replace(/^["']+|["']+$/g, '').replace(/[\\/]+$/, '');
const lastPart = (p: string) => clean(p).split(/[\\/]/).filter(Boolean).pop() || '';
/** "C:" for C:\..., "Mạng \\server" for \\server\share, '' otherwise */
const driveOf = (p: string) => {
  const m = /^([a-zA-Z]):/.exec(p);
  if (m) return `Ổ ${m[1].toUpperCase()}:`;
  const n = /^\\\\([^\\]+)/.exec(p);
  return n ? `Ổ mạng ${n[1]}` : '';
};

function read(key: string, folderName: string): string {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return '';
    const d = JSON.parse(raw);
    return d && d.folderName === folderName && typeof d.path === 'string' ? d.path : '';
  } catch (_) { return ''; }
}

export const FolderPathNote: React.FC<Props> = ({ storageKey, folderName }) => {
  const [path, setPath] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const p = read(storageKey, folderName);
    setPath(p); setDraft(p); setEditing(false);
  }, [storageKey, folderName]);

  const save = () => {
    const p = clean(draft);
    try {
      if (p) localStorage.setItem(PREFIX + storageKey, JSON.stringify({ folderName, path: p }));
      else localStorage.removeItem(PREFIX + storageKey);
    } catch (_) { /* storage blocked: keep it for this view only */ }
    setPath(p); setEditing(false);
  };

  const mismatch = (p: string) => !!p && lastPart(p).toLowerCase() !== folderName.trim().toLowerCase();

  if (path && !editing) {
    const drive = driveOf(path);
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-slate-800 space-y-1">
        <div className="flex items-start gap-2">
          <HardDrive className="w-4 h-4 mt-0.5 shrink-0 text-sky-700" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              Bạn đã cấu hình lưu vào{drive ? <> <span className="font-black text-sky-800">{drive}</span> —</> : ''} địa chỉ thư mục:
            </p>
            <p className="font-black text-slate-900 break-all select-all">{path}</p>
          </div>
          <button type="button" onClick={() => { setDraft(path); setEditing(true); }} className="no-hover-fx shrink-0 h-8 px-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 inline-flex items-center gap-1 cursor-pointer">
            <Pencil className="w-3.5 h-3.5" /> Sửa
          </button>
        </div>
        {mismatch(path) && (
          <p className="text-xs font-bold text-amber-800 flex items-start gap-1">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Địa chỉ này không kết thúc bằng "{folderName}" — thư mục phần mềm đang ghi tên là "{folderName}". Hãy kiểm tra lại.
          </p>
        )}
        <p className="text-xs text-slate-600">Địa chỉ do bạn ghi lại trên máy này; phần mềm ghi tệp vào thư mục bạn đã chọn trong hộp chọn thư mục.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-800 space-y-1.5">
      <p className="font-bold flex items-start gap-2">
        <HardDrive className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
        <span>Ghi lại địa chỉ đầy đủ của thư mục "{folderName}" để lần sau biết đang lưu ở ổ đĩa nào</span>
      </p>
      <p className="text-xs text-slate-700">
        Trình duyệt chỉ cho phần mềm biết <strong>tên</strong> thư mục, không cho biết ổ đĩa và đường dẫn. Mở thư mục đó trong File Explorer, bấm vào thanh địa chỉ, sao chép rồi dán vào ô dưới (ví dụ <span className="font-bold">C:\Users\TenMay\Documents\{folderName}</span>).
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
          placeholder={`D:\\...\\${folderName}`}
          aria-label="Địa chỉ đầy đủ của thư mục lưu"
          className="flex-1 min-w-[12rem] h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button type="button" onClick={save} disabled={!clean(draft) && !path} className="no-hover-fx h-10 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-black inline-flex items-center gap-1.5 cursor-pointer">
          <Check className="w-4 h-4" /> Lưu địa chỉ
        </button>
        {editing && (
          <button type="button" onClick={() => { setDraft(path); setEditing(false); }} className="no-hover-fx h-10 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-bold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer">
            <X className="w-4 h-4" /> Hủy
          </button>
        )}
      </div>
      {mismatch(draft) && (
        <p className="text-xs font-bold text-amber-800">Địa chỉ nên kết thúc bằng tên thư mục đã chọn: "{folderName}".</p>
      )}
    </div>
  );
};

export default FolderPathNote;
