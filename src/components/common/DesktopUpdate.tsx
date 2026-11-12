import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, X, CheckCircle2, AlertTriangle, Loader2, MonitorDown } from 'lucide-react';

/**
 * Hot update of the UI in the installed desktop build (desktop-lite/updater.cjs).
 * On the web these components render nothing: the bridge `window.lhhpDesktop.update` only exists in the desktop shell.
 */
interface UpdateInfo {
  enabled: boolean;
  shellVersion: string;
  bundledVersion: string;
  uiVersion: string;
  lastCheck?: string;
  phase: 'idle' | 'off' | 'checking' | 'downloading' | 'ready' | 'up-to-date' | 'need-installer' | 'rolled-back' | 'error';
  message?: string;
  newVersion?: string;
  progress?: number;
  notes?: string;
}
interface UpdateBridge {
  getInfo: () => Promise<UpdateInfo | null>;
  check: () => Promise<UpdateInfo | null>;
  apply: () => Promise<boolean>;
  uiReady: () => Promise<boolean>;
  onState: (cb: (info: UpdateInfo) => void) => () => void;
}

const bridge = (): UpdateBridge | null =>
  (typeof window !== 'undefined' && (window as any).lhhpDesktop?.update) || null;

function useUpdateInfo(): UpdateInfo | null {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    const b = bridge();
    if (!b) return;
    let alive = true;
    b.getInfo().then((i) => { if (alive && i) setInfo(i); }).catch(() => {});
    const off = b.onState((i) => { if (alive) setInfo(i); });
    return () => { alive = false; off(); };
  }, []);
  return info;
}

/** Floating notice: a new version is downloaded / a new installer is needed / the update was rolled back */
export const DesktopUpdateNotice: React.FC = () => {
  const info = useUpdateInfo();
  const [hiddenFor, setHiddenFor] = useState('');
  const [applying, setApplying] = useState(false);

  // The UI rendered: tell the shell this version starts correctly (otherwise it rolls back after 2 failed starts)
  useEffect(() => {
    const b = bridge();
    if (!b) return;
    const t = setTimeout(() => { b.uiReady().catch(() => {}); }, 4000);
    return () => clearTimeout(t);
  }, []);

  if (!info || !['ready', 'need-installer', 'rolled-back'].includes(info.phase)) return null;
  const key = `${info.phase}:${info.newVersion || ''}`;
  if (hiddenFor === key) return null;
  const ready = info.phase === 'ready';

  return (
    <div role="status" className="fixed bottom-4 right-4 z-[90] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-indigo-200 bg-white shadow-2xl p-4 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
          {ready ? <Download className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-900">
            {ready ? `Đã có bản mới ${info.newVersion}` : info.phase === 'need-installer' ? 'Cần bộ cài đặt mới' : 'Đã quay về bản trước'}
          </p>
          <p className="text-xs font-semibold text-slate-700 break-words">
            {ready ? 'Bản mới đã tải xong. Bấm Cập nhật ngay để dùng, không cần cài lại. Dữ liệu được giữ nguyên.' : info.message}
          </p>
          {ready && info.notes && <p className="mt-1 text-xs text-slate-600 whitespace-pre-line break-words">{info.notes}</p>}
        </div>
        <button type="button" onClick={() => setHiddenFor(key)} className="no-hover-fx p-1 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer" aria-label="Đóng thông báo">
          <X className="w-4 h-4" />
        </button>
      </div>
      {ready && (
        <div className="flex gap-2">
          <button type="button" disabled={applying} onClick={() => { setApplying(true); bridge()?.apply().catch(() => setApplying(false)); }}
            className="no-hover-fx flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer">
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Cập nhật ngay
          </button>
          <button type="button" onClick={() => setHiddenFor(key)} className="no-hover-fx h-10 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-bold text-slate-800 cursor-pointer">
            Để sau
          </button>
        </div>
      )}
      {ready && <p className="text-xs text-slate-600">Chọn Để sau thì bản mới tự dùng ở lần mở phần mềm kế tiếp.</p>}
    </div>
  );
};

/** Version line + "check for updates" button (User guide page). Renders nothing on the web. */
export const DesktopVersionPanel: React.FC = () => {
  const info = useUpdateInfo();
  const [busy, setBusy] = useState(false);
  if (!info) return null;
  const working = busy || info.phase === 'checking' || info.phase === 'downloading';
  const tone = info.phase === 'error' || info.phase === 'need-installer' || info.phase === 'rolled-back' ? 'text-amber-800'
    : info.phase === 'ready' || info.phase === 'up-to-date' ? 'text-emerald-800' : 'text-slate-700';

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
      <p className="text-sm font-black text-slate-900 flex items-center gap-2"><MonitorDown className="w-4 h-4 text-indigo-700" /> Bản cài đặt trên máy tính</p>
      <p className="text-xs font-semibold text-slate-700">
        Phiên bản giao diện <strong className="text-slate-900">{info.uiVersion}</strong> • bộ cài <strong className="text-slate-900">{info.shellVersion}</strong>
        {info.lastCheck ? ` • kiểm tra lần cuối ${new Date(info.lastCheck).toLocaleString('vi-VN')}` : ''}
      </p>
      {info.message && (
        <p className={`text-xs font-bold flex items-start gap-1.5 ${tone}`}>
          {info.phase === 'up-to-date' || info.phase === 'ready' ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : null}
          <span className="break-words">{info.message}{info.phase === 'downloading' && info.progress ? ` ${info.progress}%` : ''}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {info.enabled && (
          <button type="button" disabled={working} onClick={() => { setBusy(true); (bridge()?.check() ?? Promise.resolve(null)).catch(() => {}).finally(() => setBusy(false)); }}
            className="no-hover-fx h-9 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-sm font-bold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer">
            <RefreshCw className={`w-4 h-4 ${working ? 'animate-spin' : ''}`} /> {working ? 'Đang kiểm tra…' : 'Kiểm tra cập nhật'}
          </button>
        )}
        {info.phase === 'ready' && (
          <button type="button" onClick={() => { bridge()?.apply().catch(() => {}); }}
            className="no-hover-fx h-9 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black inline-flex items-center gap-1.5 cursor-pointer">
            <Download className="w-4 h-4" /> Cập nhật ngay
          </button>
        )}
      </div>
    </div>
  );
};

export default DesktopUpdateNotice;
