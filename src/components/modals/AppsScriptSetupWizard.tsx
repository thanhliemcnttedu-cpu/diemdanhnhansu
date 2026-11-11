import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Copy, CheckCheck, ExternalLink, FolderOpen, Code2, Rocket, Link2, Loader2, CheckCircle2, XCircle, AlertTriangle, ChevronRight, Wand2, MinusCircle,
} from 'lucide-react';
import { googleDriveService } from '../../services/googleDriveService';
import { appsScriptSetupService, OPEN_APPS_SCRIPT_WIZARD_EVENT, SetupCheck, versionLabel } from '../../services/appsScriptSetupService';
import { useClassroom } from '../../context/ClassroomContext';
import { openReinitSchoolDb } from './ReinitSchoolDbModal';

/**
 * 🧭 TRÌNH CÀI ĐẶT APPS SCRIPT "1 TRANG"
 * Cài mới: Thư mục → Sao chép mã → Mở script.new, dán, lưu → Triển khai ứng dụng web (Bất kỳ ai) → Dán link /exec → Kiểm tra tự động → Lưu.
 * Cập nhật: Sao chép mã mới → dán vào dự án cũ → Quản lý triển khai → Phiên bản mới → Kiểm tra (đúng phiên bản chưa).
 * Mở bằng sự kiện OPEN_APPS_SCRIPT_WIZARD_EVENT (detail.mode = 'install' | 'update').
 */

/** "Nút" mô phỏng giao diện Google để người dùng dễ nhận ra */
const G: React.FC<{ children: React.ReactNode; primary?: boolean }> = ({ children, primary }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold whitespace-nowrap border ${primary ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-800 border-slate-300'}`}>{children}</span>
);
const Arrow = () => <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />;

const StepCard: React.FC<{ n: number; title: string; done?: boolean; icon: React.ReactNode; children: React.ReactNode }> = ({ n, title, done, icon, children }) => (
  <section className={`rounded-2xl border p-3 space-y-2 ${done ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}>
    <div className="flex items-center gap-2.5">
      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${done ? 'bg-emerald-700 text-white' : 'bg-indigo-600 text-white'}`}>{done ? <CheckCheck className="w-4 h-4" /> : n}</span>
      <span className="text-indigo-600 shrink-0">{icon}</span>
      <p className="text-sm font-black text-slate-900">{title}</p>
    </div>
    <div className="lg:pl-9 space-y-2 text-sm text-slate-700">{children}</div>
  </section>
);

export const AppsScriptSetupWizard: React.FC = () => {
  const { currentUser } = useClassroom();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'install' | 'update'>('install');
  const [folderInput, setFolderInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ checks: SetupCheck[]; url: string; version: string; allOk: boolean } | null>(null);
  const [saved, setSaved] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const latest = useMemo(() => appsScriptSetupService.getBundledVersion(), []);

  useEffect(() => {
    const handler = (e: Event) => {
      const cfg = googleDriveService.getConfig();
      const wanted = (e as CustomEvent).detail?.mode as 'install' | 'update' | undefined;
      setMode(wanted || (cfg.scriptUrl ? 'update' : 'install'));
      setFolderInput(cfg.folderUrl || cfg.folderId || '');
      setUrlInput(cfg.scriptUrl || '');
      setCopied(false); setOpened(false); setResult(null); setSaved(false); setShareCopied(false);
      setOpen(true);
    };
    window.addEventListener(OPEN_APPS_SCRIPT_WIZARD_EVENT, handler);
    return () => window.removeEventListener(OPEN_APPS_SCRIPT_WIZARD_EVENT, handler);
  }, []);

  if (!open) return null;

  const folderId = googleDriveService.extractFolderIdFromUrl(folderInput) || '';
  const isUpdate = mode === 'update';

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(appsScriptSetupService.buildCode(folderId));
      setCopied(true);
    } catch (_) {
      alert('Trình duyệt không cho sao chép tự động. Hãy mở Google Drive → Dữ liệu → "Xem & Sao chép mã".');
    }
  };

  const runCheck = async () => {
    setChecking(true); setSaved(false);
    try { setResult(await appsScriptSetupService.diagnose(urlInput, folderId)); }
    finally { setChecking(false); }
  };

  const saveConfig = () => {
    if (!result?.allOk) return;
    googleDriveService.saveConfig({
      scriptUrl: result.url,
      ...(folderId ? { folderId, folderUrl: folderInput.includes('drive.google.com') ? folderInput.trim() : `https://drive.google.com/drive/folders/${folderId}` } : {}),
    } as any);
    appsScriptSetupService.clearUpdateCache();
    window.dispatchEvent(new Event('lhhp:apps-script-updated'));
    setSaved(true);
  };

  const icon = (s: SetupCheck['state']) => s === 'ok' ? <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
    : s === 'fail' ? <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
    : s === 'warn' ? <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
    : <MinusCircle className="w-5 h-5 text-slate-400 shrink-0" />;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Trình cài đặt Apps Script">
      <div className="bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[96vh] flex flex-col overflow-hidden">
        <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-slate-900 inline-flex items-center gap-2 whitespace-nowrap"><Wand2 className="w-5 h-5 text-indigo-600" /> Trình cài đặt Apps Script</p>
            <p className="text-xs text-slate-600 truncate">Mã trong phần mềm: <strong className="text-indigo-700">{versionLabel(latest)}</strong> • Làm lần lượt 5 bước, bước cuối phần mềm tự kiểm tra giúp.</p>
          </div>
          <div className="flex gap-1 bg-slate-200/70 p-1 rounded-xl order-3 w-full md:order-none md:w-auto" role="tablist" aria-label="Chế độ">
            {([['install', 'Cài mới (lần đầu)'], ['update', 'Cập nhật bản mới']] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => { setMode(id); setResult(null); }}
                className={`no-hover-fx flex-1 px-4 py-1.5 rounded-lg text-sm font-black whitespace-nowrap ${mode === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
            ))}
          </div>
          <button type="button" onClick={() => setOpen(false)} className="no-hover-fx w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center shrink-0" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-3 sm:p-4 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          <div className="space-y-3">

          {/* Bước 1: thư mục */}
          <StepCard n={1} title="Thư mục Google Drive dùng chung" done={Boolean(folderId)} icon={<FolderOpen className="w-5 h-5" />}>
            {!isUpdate && <p>Tạo 1 thư mục trên Google Drive (ví dụ <code className="font-mono font-bold text-emerald-800">DuLieu_LopHocHanhPhuc</code>), mở thư mục rồi sao chép link trên thanh địa chỉ.</p>}
            <input value={folderInput} onChange={(e) => { setFolderInput(e.target.value); setCopied(false); }} placeholder="https://drive.google.com/drive/folders/…"
              aria-label="Link thư mục Google Drive" className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-mono" />
            <p className={`text-xs font-bold ${folderId ? 'text-emerald-800' : 'text-slate-500'}`}>{folderId ? `✓ Mã thư mục: ${folderId}` : 'Dán link thư mục để phần mềm điền sẵn vào mã.'}</p>
          </StepCard>

          {/* Bước 2: sao chép mã */}
          <StepCard n={2} title="Sao chép mã Apps Script" done={copied} icon={<Code2 className="w-5 h-5" />}>
            <p>Mã đã điền sẵn mã thư mục của trường ({versionLabel(latest).toLowerCase()}).</p>
            <button type="button" onClick={copyCode} disabled={!folderId}
              className="no-hover-fx h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black inline-flex items-center gap-2 disabled:opacity-50">
              {copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Đã sao chép mã' : 'Sao chép mã'}
            </button>
          </StepCard>

          {/* Bước 3: dán vào Apps Script */}
          <StepCard n={3} title={isUpdate ? 'Dán mã mới vào dự án Apps Script đang dùng' : 'Mở Apps Script mới, dán mã và lưu'} done={opened} icon={<ExternalLink className="w-5 h-5" />}>
            <a href={isUpdate ? 'https://script.google.com/home' : 'https://script.new'} target="_blank" rel="noreferrer" onClick={() => setOpened(true)}
              className="no-hover-fx h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black inline-flex items-center gap-2">
              <ExternalLink className="w-4 h-4" /> {isUpdate ? 'Mở danh sách dự án Apps Script' : 'Mở Apps Script mới (script.new)'}
            </a>
            <ol className="list-decimal pl-5 space-y-0.5">
              {isUpdate && <li>Mở đúng dự án đang dùng cho trường (dự án đã triển khai link /exec hiện tại).</li>}
              <li>Bấm vào vùng mã, chọn hết <kbd className="px-1 rounded border border-slate-300 bg-white text-xs font-bold">Ctrl + A</kbd> rồi <kbd className="px-1 rounded border border-slate-300 bg-white text-xs font-bold">Delete</kbd>.</li>
              <li>Dán mã vừa sao chép <kbd className="px-1 rounded border border-slate-300 bg-white text-xs font-bold">Ctrl + V</kbd>, bấm Lưu <kbd className="px-1 rounded border border-slate-300 bg-white text-xs font-bold">Ctrl + S</kbd>.</li>
              {!isUpdate && <li>Đặt tên dự án, ví dụ <strong>Lop Hoc Hanh Phuc</strong>.</li>}
            </ol>
          </StepCard>

          </div>
          <div className="space-y-3">
          {/* Bước 4: triển khai */}
          <StepCard n={4} title={isUpdate ? 'Tạo phiên bản mới (giữ nguyên link)' : 'Triển khai thành ứng dụng web'} icon={<Rocket className="w-5 h-5" />}>
            {isUpdate ? (
              <>
                <p className="flex flex-wrap items-center gap-1.5"><G>Triển khai ▾</G><Arrow /><G>Quản lý các tùy chọn triển khai</G><Arrow /><G>✏️ (bút chì)</G><Arrow />Phiên bản:<G>Phiên bản mới</G><Arrow /><G primary>Triển khai</G></p>
                <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-amber-950 text-sm"><AlertTriangle className="w-4 h-4 inline mr-1 text-amber-700" /><strong>Không</strong> bấm "Tùy chọn triển khai mới" — làm vậy Google tạo link khác và link cũ vẫn chạy mã cũ.</p>
              </>
            ) : (
              <>
                <p className="flex flex-wrap items-center gap-1.5"><G>Triển khai ▾</G><Arrow /><G>Tùy chọn triển khai mới</G><Arrow /><G>⚙ Chọn loại</G><Arrow /><G>Ứng dụng web</G></p>
                <p className="flex flex-wrap items-center gap-1.5">Thực thi với tư cách:<G>Tôi</G><span className="text-slate-400">•</span>Người có quyền truy cập:<G>Bất kỳ ai</G><Arrow /><G primary>Triển khai</G></p>
                <p className="flex flex-wrap items-center gap-1.5">Lần đầu Google hỏi quyền:<G>Cấp quyền truy cập</G><Arrow />chọn tài khoản<Arrow /><G>Nâng cao</G><Arrow /><G>Đi tới … (không an toàn)</G><Arrow /><G primary>Cho phép</G></p>
                <p>Cuối cùng sao chép <strong>"URL ứng dụng web"</strong> (đuôi <code className="font-mono">/exec</code>).</p>
              </>
            )}
          </StepCard>

          {/* Bước 5: dán link & kiểm tra */}
          <StepCard n={5} title="Dán link /exec và kiểm tra tự động" done={Boolean(result?.allOk)} icon={<Link2 className="w-5 h-5" />}>
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={urlInput} onChange={(e) => { setUrlInput(e.target.value); setResult(null); }} placeholder="https://script.google.com/macros/s/…/exec"
                aria-label="Link ứng dụng web Apps Script" className="flex-1 h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-mono" />
              <button type="button" onClick={runCheck} disabled={checking || !urlInput.trim()}
                className="no-hover-fx h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50">
                {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} {checking ? 'Đang kiểm tra…' : result ? 'Kiểm tra lại' : 'Kiểm tra'}
              </button>
            </div>
            {result && (
              <ul className="space-y-1.5" aria-live="polite">
                {result.checks.map(c => (
                  <li key={c.key} className={`flex items-start gap-2 rounded-xl px-3 py-2 border ${c.state === 'ok' ? 'bg-emerald-50 border-emerald-200' : c.state === 'fail' ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                    {icon(c.state)}
                    <span><strong className="text-slate-900">{c.label}:</strong> {c.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            {result?.allOk && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={saveConfig} disabled={saved}
                  className="no-hover-fx h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black inline-flex items-center gap-2 disabled:opacity-70">
                  <CheckCheck className="w-4 h-4" /> {saved ? 'Đã lưu cho máy này' : 'Lưu và dùng kết nối này'}
                </button>
                {saved && (
                  <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(googleDriveService.buildConnectionShareText(currentUser?.schoolName)); setShareCopied(true); } catch (_) { /* ignore */ } }}
                    className="no-hover-fx h-10 px-4 rounded-xl border border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-800 text-sm font-black inline-flex items-center gap-2">
                    {shareCopied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {shareCopied ? 'Đã sao chép tin nhắn' : 'Sao chép tin nhắn kết nối gửi toàn trường'}
                  </button>
                )}
              </div>
            )}
            {result?.checks.some(c => c.key === 'folder' && c.state === 'ok' && /chưa có CSDL/.test(c.detail)) && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-950 space-y-2">
                <p>Thư mục chưa có cơ sở dữ liệu nhà trường (<code className="font-mono">csdl_truong.json</code>). Nếu tệp đã bị xóa, khởi tạo lại từ dữ liệu trên máy này (sau khi đã Lưu kết nối).</p>
                <button type="button" onClick={() => { if (!saved && result?.allOk) saveConfig(); setOpen(false); openReinitSchoolDb(); }}
                  className="no-hover-fx h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold whitespace-nowrap">Khởi tạo lại CSDL trường</button>
              </div>
            )}
            {saved && isUpdate && <p className="text-sm font-bold text-emerald-800">Đã cập nhật xong. Link giữ nguyên nên giáo viên, nhân viên không phải làm gì thêm.</p>}
          </StepCard>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppsScriptSetupWizard;
