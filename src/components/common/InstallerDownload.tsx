/**
 * Download button for the desktop installer + the form where the school's administrators set its link.
 * See services/installerLinkService.ts. Both render nothing until the school connection (shared Drive folder
 * + Apps Script) is configured on this computer.
 *
 *  - <InstallerDownloadButton variant="login" />  on the login screen (web only)
 *  - <InstallerLinkPanel />                       on "Hướng dẫn sử dụng": button for everyone, form for
 *                                                 Quản trị cao nhất / Quản trị nhà trường
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, Loader2, MonitorDown, Save, Trash2, AlertTriangle } from 'lucide-react';
import type { UserAccount } from '../../types';
import { installerLinkService, INSTALLER_LINK_EVENT, InstallerLink, normalizeInstallerUrl, versionFromUrl } from '../../services/installerLinkService';

/** Inside the installed desktop app there is nothing to download */
const isDesktopApp = () => typeof window !== 'undefined' && Boolean((window as any).lhhpDesktop);

function useInstallerLink(enabled: boolean): { link: InstallerLink | null; reload: () => void } {
  const [link, setLink] = useState<InstallerLink | null>(() => (enabled ? installerLinkService.getCached() : null));
  const reload = useCallback(() => {
    if (!enabled || !installerLinkService.isAvailable()) { setLink(null); return; }
    setLink(installerLinkService.getCached());
    installerLinkService.load().then(setLink).catch(() => { /* keep the cached one */ });
  }, [enabled]);
  useEffect(() => {
    reload();
    window.addEventListener(INSTALLER_LINK_EVENT, reload);
    window.addEventListener('online', reload);
    return () => { window.removeEventListener(INSTALLER_LINK_EVENT, reload); window.removeEventListener('online', reload); };
  }, [reload]);
  return { link, reload };
}

const hostOf = (url: string) => { try { return new URL(url).host; } catch { return ''; } };

export const InstallerDownloadButton: React.FC<{ variant?: 'login' | 'card'; enabled?: boolean }> = ({ variant = 'card', enabled = true }) => {
  const { link } = useInstallerLink(enabled);
  if (!enabled || !link || isDesktopApp()) return null;
  const version = link.version ? `Phiên bản V${link.version}` : '';

  if (variant === 'login') {
    return (
      <a href={link.url} target="_blank" rel="noopener noreferrer"
        title={`Tải bộ cài đặt phần mềm cho máy tính Windows${version ? ` – ${version}` : ''} (tải từ ${hostOf(link.url)})`}
        className="mt-2 w-full px-3 py-2.5 rounded-2xl bg-white/95 hover:bg-white text-sky-900 shadow-sm flex items-center gap-2.5 text-left">
        <span className="w-9 h-9 rounded-xl bg-sky-700 text-white flex items-center justify-center shrink-0"><MonitorDown className="w-5 h-5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black uppercase leading-tight">Tải file cài đặt trên máy tính</span>
          <span className="block text-xs font-semibold text-slate-700 leading-tight">Thầy cô vui lòng bấm vào đây để tải về{version ? ` • ${version}` : ''}</span>
        </span>
        <Download className="w-5 h-5 text-sky-700 shrink-0" aria-hidden="true" />
      </a>
    );
  }

  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer"
      className="no-hover-fx w-full px-3 py-3 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 flex items-center gap-3 text-left">
      <span className="w-10 h-10 rounded-xl bg-sky-700 text-white flex items-center justify-center shrink-0"><MonitorDown className="w-5 h-5" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-slate-900">Tải file cài đặt trên máy tính</span>
        <span className="block text-xs text-slate-700">Thầy cô vui lòng bấm vào đây để tải về{version ? ` • ${version}` : ''}</span>
        <span className="block text-xs text-slate-600 truncate">Tải từ: {hostOf(link.url)}{link.note ? ` • ${link.note}` : ''}</span>
      </span>
      <Download className="w-5 h-5 text-sky-700 shrink-0" aria-hidden="true" />
    </a>
  );
};

/** Quản trị cao nhất and Quản trị nhà trường set the link; Ban giám hiệu and teachers only see the button */
const canEditInstallerLink = (u: UserAccount | null | undefined) => Boolean(
  u && (u.role === 'admin' || (u.username || '').toLowerCase() === 'adminquantri' || u.role === 'school_admin' || u.isSchoolAdmin)
);

export const InstallerLinkPanel: React.FC<{ currentUser: UserAccount | null }> = ({ currentUser }) => {
  const available = installerLinkService.isAvailable();
  const { link, reload } = useInstallerLink(available);
  const canEdit = available && canEditInstallerLink(currentUser);
  const [url, setUrl] = useState('');
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // show what is saved; re-filled whenever the saved link changes
  useEffect(() => { setUrl(link?.url || ''); setVersion(link?.version || ''); }, [link?.url, link?.version]);

  if (!available) return null;
  if (!canEdit && (!link || isDesktopApp())) return null;

  const save = async (remove = false) => {
    setMessage(null);
    if (!remove && !normalizeInstallerUrl(url)) { setMessage({ ok: false, text: 'Hãy dán link tải bộ cài bắt đầu bằng https://' }); return; }
    if (remove && !window.confirm('Xóa link tải bộ cài? Nút tải sẽ không còn hiện trên trang web của trường.')) return;
    setBusy(true);
    try {
      await installerLinkService.save(remove ? { url: '', version: '' } : { url, version: version || versionFromUrl(url) }, currentUser?.username);
      setMessage({ ok: true, text: remove ? 'Đã xóa link tải bộ cài.' : 'Đã lưu. Nút tải hiện trên màn đăng nhập của trang web trường cho mọi thầy cô.' });
      reload();
    } catch (e: any) {
      setMessage({ ok: false, text: e?.message || 'Không lưu được.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">
      <p className="text-sm font-black text-slate-900 flex items-center gap-2"><MonitorDown className="w-4 h-4 text-sky-700" aria-hidden="true" /> Bộ cài đặt cho máy tính</p>
      <InstallerDownloadButton variant="card" enabled={available} />
      {canEdit && (
        <div className="space-y-2">
          <p className="text-xs text-slate-700">
            Dán link tải bộ cài (tệp <strong>setup.exe</strong>) dành cho trường. Link được lưu trên Google Drive của trường; mọi thầy cô mở trang web của trường sẽ thấy nút tải ở màn đăng nhập, không phải tìm link trong tin nhắn.
          </p>
          <div>
            <label htmlFor="installer-link-url" className="block text-xs font-bold text-slate-900 mb-1">Link tải bộ cài</label>
            <input id="installer-link-url" value={url} onChange={(e) => { setUrl(e.target.value); if (!version) setVersion(versionFromUrl(e.target.value)); }}
              placeholder="https://github.com/.../QL_TRUONG_HOC_V_1.2.0.exe" autoComplete="off" spellCheck={false}
              className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-600" />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-36">
              <label htmlFor="installer-link-version" className="block text-xs font-bold text-slate-900 mb-1">Phiên bản</label>
              <input id="installer-link-version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.2.0" autoComplete="off"
                className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-500 tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-600" />
            </div>
            <button type="button" onClick={() => save(false)} disabled={busy}
              className="no-hover-fx h-10 px-4 rounded-xl bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white text-sm font-black inline-flex items-center gap-2 cursor-pointer">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />} Lưu link tải
            </button>
            {link && (
              <button type="button" onClick={() => save(true)} disabled={busy}
                className="no-hover-fx h-10 px-3 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 disabled:opacity-60 text-rose-800 text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer">
                <Trash2 className="w-4 h-4" aria-hidden="true" /> Xóa link
              </button>
            )}
          </div>
          {message && (
            <p role={message.ok ? 'status' : 'alert'} className={`text-xs font-bold flex items-start gap-1.5 ${message.ok ? 'text-emerald-800' : 'text-rose-800'}`}>
              {message.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />}
              <span>{message.text}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
};
