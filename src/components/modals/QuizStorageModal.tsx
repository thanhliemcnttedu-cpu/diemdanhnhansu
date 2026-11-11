import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, X, HardDrive, Download, Upload, Cloud, CheckCircle2, AlertTriangle, Loader2, Copy, ExternalLink, RefreshCw, Unplug, FolderOpen, ShieldCheck, ArrowRight } from 'lucide-react';
import { useClassroom } from '../../context/ClassroomContext';
import { quizBankStore, countCustom, isPersonalQuizAccount, supportsLocalFolder } from '../../services/quizBankStore';
import { googleDriveService } from '../../services/googleDriveService';
import { isViewOnly } from '../../utils/viewOnlyMode';
import type { UserAccount } from '../../types';

/** Mở hộp "Nơi lưu câu hỏi": window.dispatchEvent(new Event(OPEN_QUIZ_STORAGE_EVENT)) */
export const OPEN_QUIZ_STORAGE_EVENT = 'lhhp:open-quiz-storage';

/**
 * Gọi khi giáo viên bấm nút THÊM câu hỏi. Chưa cấu hình nơi lưu (thư mục máy tính / Drive cá nhân) → mở hộp
 * "Nơi lưu câu hỏi" ở chế độ bắt buộc, trả về true khi giáo viên đã cấu hình xong. Đã cấu hình → true ngay
 * (và xin lại quyền ghi thư mục nếu trình duyệt đã quên). Tài khoản quản lý / chế độ chỉ xem: không áp dụng.
 */
export function requireQuizStorage(user: UserAccount | null | undefined): Promise<boolean> {
  if (!user || !isPersonalQuizAccount(user) || isViewOnly()) return Promise.resolve(true);
  if (quizBankStore.isConfigured(user.username)) {
    quizBankStore.ensureLocalPermission(user.username).catch(() => {});
    return Promise.resolve(true);
  }
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent(OPEN_QUIZ_STORAGE_EVENT, { detail: { required: true, resolve } }));
  });
}

/**
 * 📚 NƠI LƯU CÂU HỎI CỦA TÔI — bộ câu hỏi trò chơi là dữ liệu CÁ NHÂN của giáo viên, không nằm trong thư mục trường.
 * Trên máy (IndexedDB, luôn bật) · Xuất / Nhập tệp .json · Google Drive cá nhân (tùy chọn, Apps Script cá nhân).
 */
export const QuizStorageModal: React.FC = () => {
  const { currentUser, quizBank, updateQuizBank } = useClassroom();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [folderUrl, setFolderUrl] = useState('');
  const [scriptUrl, setScriptUrl] = useState('');
  const [, force] = useState(0);
  const [required, setRequired] = useState(false);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const username = currentUser?.username || '';

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent).detail as { required?: boolean; resolve?: (ok: boolean) => void } | undefined;
      if (resolverRef.current) resolverRef.current(false);
      resolverRef.current = d?.resolve || null;
      setRequired(Boolean(d?.required));
      setOpen(true); setMsg(null);
    };
    window.addEventListener(OPEN_QUIZ_STORAGE_EVENT, onOpen);
    const unsub = quizBankStore.subscribe(() => force(n => n + 1));
    return () => { window.removeEventListener(OPEN_QUIZ_STORAGE_EVENT, onOpen); unsub(); };
  }, []);

  const cfg = username ? quizBankStore.getDriveConfig(username) : null;
  useEffect(() => {
    if (!open) return;
    setFolderUrl(cfg?.folderUrl || '');
    setScriptUrl(cfg?.scriptUrl || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const custom = useMemo(() => countCustom(quizBank), [quizBank]);
  const sizeKB = useMemo(() => Math.round(new Blob([JSON.stringify(quizBank.filter(q => q))]).size / 1024), [quizBank]);

  if (!open || !username) return null;
  const configured = quizBankStore.isConfigured(username);
  const local = quizBankStore.getLocalInfo(username);
  const canFolder = supportsLocalFolder();
  const close = () => {
    setOpen(false);
    const r = resolverRef.current;
    resolverRef.current = null;
    if (r) r(quizBankStore.isConfigured(username));
  };
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setMsg(null); try { await fn(); } finally { setBusy(''); } };

  const onExport = () => run('export', async () => {
    const n = await quizBankStore.exportFile(username, quizBank, currentUser?.fullName);
    setMsg({ type: 'ok', text: `Đã xuất bộ câu hỏi (${n} câu tự soạn / đã sửa; câu mẫu của phần mềm luôn có sẵn). Hãy lưu tệp vào thư mục máy tính hoặc USB.` });
  });
  const onImport = (file: File) => run('import', async () => {
    try {
      const imported = quizBankStore.parseImport(await file.text());
      if (!imported.length) { setMsg({ type: 'err', text: 'Tệp không có câu hỏi nào.' }); return; }
      const r = quizBankStore.mergeImport(quizBank, imported);
      updateQuizBank(r.questions);
      setMsg({ type: 'ok', text: `Đã nhập: thêm ${r.added} câu mới, cập nhật ${r.replaced} câu cùng mã. Các câu đang có được giữ nguyên.` });
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || 'Không đọc được tệp bộ câu hỏi.' });
    }
  });
  const onCopyCode = async () => {
    const fid = googleDriveService.extractFolderIdFromUrl(folderUrl.trim()) || '';
    if (!fid) { setMsg({ type: 'err', text: 'Dán link thư mục Google Drive CÁ NHÂN ở bước 1 trước, để mã Apps Script điền sẵn mã thư mục.' }); return; }
    try {
      await navigator.clipboard.writeText(googleDriveService.generateAppsScriptCode(fid));
      setMsg({ type: 'ok', text: 'Đã sao chép mã Apps Script (đã điền sẵn thư mục cá nhân). Dán vào dự án mới ở script.new.' });
    } catch (_) { setMsg({ type: 'err', text: 'Trình duyệt chặn sao chép. Hãy thử lại.' }); }
  };
  const onConnect = () => run('connect', async () => {
    const r = await quizBankStore.testDrive(scriptUrl, folderUrl);
    if (!r.ok || !r.cfg) { setMsg({ type: 'err', text: r.message }); return; }
    quizBankStore.setDriveConfig(username, r.cfg);
    const remote = await quizBankStore.pullDrive(username);
    if (remote) updateQuizBank(remote);
    else await quizBankStore.pushDrive(username);
    setMsg({ type: 'ok', text: `${r.message} Bộ câu hỏi sẽ tự đồng bộ vào tệp ${quizBankStore.remoteFileName(username)} trong thư mục cá nhân.` });
  });
  const onSync = () => run('sync', async () => {
    const remote = await quizBankStore.pullDrive(username);
    if (remote) { updateQuizBank(remote); setMsg({ type: 'ok', text: 'Đã lấy bộ câu hỏi mới hơn từ Google Drive cá nhân.' }); return; }
    const p = await quizBankStore.pushDrive(username);
    setMsg({ type: p.ok ? 'ok' : 'err', text: p.message });
  });
  const onPickFolder = () => run('folder', async () => {
    const r = await quizBankStore.pickLocalFolder(username);
    if (!r.ok) { if (r.message) setMsg({ type: 'err', text: r.message }); return; }
    if (r.existing && r.existing.length) {
      const m = quizBankStore.mergeImport(quizBank, r.existing);
      updateQuizBank(m.questions);
      setMsg({ type: 'ok', text: `${r.message} Thư mục đã có tệp câu hỏi: thêm ${m.added} câu, cập nhật ${m.replaced} câu.` });
    } else {
      setMsg({ type: 'ok', text: r.message });
    }
  });
  const onGrantFolder = () => run('grant', async () => {
    const w = await quizBankStore.writeLocalFolder(username, true);
    setMsg({ type: w.ok ? 'ok' : 'err', text: w.ok ? 'Đã cho phép ghi thư mục. ' + w.message : w.message });
  });
  const onReadFolder = () => run('readFolder', async () => {
    const list = await quizBankStore.readLocalFolder(username, true);
    if (!list) { setMsg({ type: 'err', text: 'Chưa đọc được tệp câu hỏi trong thư mục (chưa có tệp hoặc chưa cho phép).' }); return; }
    const m = quizBankStore.mergeImport(quizBank, list);
    updateQuizBank(m.questions);
    setMsg({ type: 'ok', text: `Đã đọc tệp trong thư mục: thêm ${m.added} câu, cập nhật ${m.replaced} câu.` });
  });
  const onClearLocal = () => run('clearLocal', async () => {
    if (!confirm('Bỏ chọn nơi lưu trên máy tính? Tệp trong thư mục và câu hỏi trên máy vẫn được giữ.')) return;
    await quizBankStore.clearLocal(username);
    setMsg({ type: 'ok', text: 'Đã bỏ chọn thư mục. Bộ câu hỏi vẫn còn trên máy này.' });
  });
  const onBrowserOnly = () => {
    quizBankStore.useBrowserOnly(username);
    setMsg({ type: 'ok', text: 'Đã chọn lưu trong bộ nhớ phần mềm trên máy này. Nhớ Xuất bộ câu hỏi định kỳ để sao lưu.' });
  };

  const onDisconnect = () => {
    if (!confirm('Ngắt kết nối Google Drive cá nhân? Bộ câu hỏi vẫn còn trên máy này và tệp trên Drive cá nhân không bị xóa.')) return;
    quizBankStore.setDriveConfig(username, null);
    setMsg({ type: 'ok', text: 'Đã ngắt kết nối. Bộ câu hỏi tiếp tục lưu trên máy này.' });
  };

  const btn = 'no-hover-fx h-10 px-4 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="quiz-storage-title">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-start gap-3 px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center shrink-0"><BookOpen className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <h3 id="quiz-storage-title" className="text-base font-black text-slate-900">Nơi lưu câu hỏi của tôi</h3>
            <p className="text-sm text-slate-600 mt-0.5">Bộ câu hỏi trò chơi là dữ liệu <strong>riêng của bạn</strong>, không lưu vào thư mục chung của nhà trường.</p>
          </div>
          <button type="button" onClick={close} aria-label="Đóng" className="no-hover-fx w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {required && (
            configured ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 flex flex-wrap items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                <p className="text-sm font-bold text-emerald-900 flex-1 min-w-[200px]">Đã cấu hình nơi lưu bộ câu hỏi. Bạn có thể thêm câu hỏi.</p>
                <button type="button" onClick={close} className="no-hover-fx h-10 px-4 rounded-xl text-sm font-bold inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white whitespace-nowrap">
                  Tiếp tục thêm câu hỏi <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-950"><strong>Cần cấu hình nơi lưu bộ câu hỏi trước khi thêm câu hỏi.</strong> Chọn <strong>một thư mục trên máy tính</strong> hoặc kết nối <strong>Google Drive cá nhân</strong> bên dưới. Chỉ cần làm một lần trên máy này.</p>
              </div>
            )
          )}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Câu tự soạn / đã sửa', value: String(custom), tone: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
              { label: 'Tổng câu dùng được', value: String(quizBank.length), tone: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
              { label: 'Dung lượng (ước tính)', value: sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`, tone: 'bg-amber-50 border-amber-200 text-amber-800' },
            ].map(t => (
              <div key={t.label} className={`rounded-2xl border p-3 ${t.tone}`}>
                <div className="text-xs font-bold uppercase tracking-wide">{t.label}</div>
                <div className="text-xl font-black text-slate-900 tabular-nums mt-0.5">{t.value}</div>
              </div>
            ))}
          </div>

          {msg && (
            <p role="status" className={`rounded-xl border px-3 py-2 text-sm font-bold flex items-start gap-2 ${msg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
              {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />} {msg.text}
            </p>
          )}

          <section className={`rounded-2xl border p-4 space-y-2 ${local ? 'border-emerald-200' : required ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2 mr-auto"><FolderOpen className="w-4 h-4 text-indigo-700" /> Thư mục trên máy tính</h4>
              {local?.mode === 'folder' && <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Đang lưu vào "{local.folderName}"{local.lastWriteAt ? ` • ${new Date(local.lastWriteAt).toLocaleString('vi-VN')}` : ''}</span>}
              {local?.mode === 'browser' && <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Bộ nhớ phần mềm trên máy này</span>}
            </div>
            <p className="text-sm text-slate-600">
              Chọn một thư mục (ví dụ <em>Tài liệu › Câu hỏi lớp học</em>, hoặc thư mục OneDrive / USB). Mỗi lần lưu, phần mềm tự ghi tệp <code>{quizBankStore.remoteFileName(username)}</code> vào thư mục đó; trên máy mới, chọn lại đúng thư mục là có lại bộ câu hỏi.
            </p>
            {local?.lastError && <p className="text-sm text-rose-700 font-bold">⚠ {local.lastError}</p>}
            {local?.mode === 'folder' && local.needsPermission && <p className="text-sm text-amber-800 font-bold">Trình duyệt cần bạn cho phép lại quyền ghi vào thư mục (sau khi mở lại trình duyệt).</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              {canFolder ? (
                <button type="button" onClick={onPickFolder} disabled={!!busy} className={`${btn} ${local?.mode === 'folder' ? 'border border-slate-300 bg-white hover:bg-slate-50 text-slate-800' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
                  {busy === 'folder' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />} {local?.mode === 'folder' ? 'Đổi thư mục' : 'Chọn thư mục lưu'}
                </button>
              ) : (
                <>
                  <p className="text-sm text-amber-800 w-full">Trình duyệt này không cho chọn thư mục (hãy dùng Chrome hoặc Edge). Bạn có thể lưu trong bộ nhớ phần mềm trên máy này, hoặc dùng Google Drive cá nhân.</p>
                  {local?.mode !== 'browser' && (
                    <button type="button" onClick={onBrowserOnly} disabled={!!busy} className={`${btn} bg-indigo-600 hover:bg-indigo-700 text-white`}>
                      <HardDrive className="w-4 h-4" /> Lưu trong bộ nhớ máy này
                    </button>
                  )}
                </>
              )}
              {local?.mode === 'folder' && (
                <>
                  {local.needsPermission && (
                    <button type="button" onClick={onGrantFolder} disabled={!!busy} className={`${btn} bg-amber-600 hover:bg-amber-700 text-white`}>
                      {busy === 'grant' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Cho phép ghi thư mục
                    </button>
                  )}
                  <button type="button" onClick={onReadFolder} disabled={!!busy} className={`${btn} border border-slate-300 bg-white hover:bg-slate-50 text-slate-800`}>
                    {busy === 'readFolder' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Đọc lại từ thư mục
                  </button>
                </>
              )}
              {local && (
                <button type="button" onClick={onClearLocal} disabled={!!busy} className={`${btn} border border-rose-200 bg-white hover:bg-rose-50 text-rose-700`}>
                  <Unplug className="w-4 h-4" /> Bỏ chọn
                </button>
              )}
            </div>
            <p className="text-xs text-slate-600 flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5" /> Ngoài ra phần mềm luôn giữ một bản trong bộ nhớ riêng của trình duyệt trên máy này (ảnh câu hỏi được nén gọn).</p>
          </section>

          <section className="rounded-2xl border border-slate-200 p-4 space-y-2">
            <h4 className="text-sm font-black text-slate-900 flex items-center gap-2"><Download className="w-4 h-4 text-emerald-700" /> Tệp trên máy tính / USB</h4>
            <p className="text-sm text-slate-600">Xuất bộ câu hỏi thành tệp <code>.json</code> để cất vào thư mục máy tính, USB, chuyển sang máy khác hoặc chia sẻ đồng nghiệp. Nhập tệp: câu mới được thêm, câu cùng mã được cập nhật, câu đang có giữ nguyên.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={onExport} disabled={!!busy} className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}>
                {busy === 'export' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Xuất bộ câu hỏi (.json)
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className={`${btn} border border-slate-300 bg-white hover:bg-slate-50 text-slate-800`}>
                {busy === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Nhập bộ câu hỏi
              </button>
              <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); }} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2 mr-auto"><Cloud className="w-4 h-4 text-sky-700" /> Google Drive cá nhân <span className="text-xs font-bold text-slate-600">(tùy chọn — dùng chung trên nhiều máy)</span></h4>
              {cfg && <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Đã kết nối{cfg.lastSyncAt ? ` • đồng bộ ${new Date(cfg.lastSyncAt).toLocaleString('vi-VN')}` : ''}</span>}
            </div>
            {cfg?.lastError && <p className="text-sm text-rose-700 font-bold">⚠ {cfg.lastError}</p>}
            <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-5">
              <li>
                Trên <strong>tài khoản Google của bạn</strong> (không dùng thư mục của trường), tạo một thư mục, ví dụ "Câu hỏi lớp học", rồi dán link thư mục:
                <input value={folderUrl} onChange={(e) => setFolderUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/..."
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 text-sm" aria-label="Link thư mục Google Drive cá nhân" />
              </li>
              <li className="space-y-1">
                <span>Sao chép mã Apps Script (đã điền sẵn thư mục), mở <strong>script.new</strong>, xóa mã mẫu, dán mã rồi bấm Lưu.</span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={onCopyCode} className={`${btn} h-9 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800`}><Copy className="w-4 h-4" /> Sao chép mã</button>
                  <a href="https://script.new" target="_blank" rel="noreferrer" className={`${btn} h-9 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800`}><ExternalLink className="w-4 h-4" /> Mở script.new</a>
                </div>
              </li>
              <li>Bấm <strong>Triển khai → Tùy chọn triển khai mới → Ứng dụng web</strong>, "Người có quyền truy cập": <strong>Bất kỳ ai</strong> → Triển khai → cho phép quyền → sao chép link kết thúc bằng <code>/exec</code>.</li>
              <li>
                Dán link Apps Script cá nhân:
                <input value={scriptUrl} onChange={(e) => setScriptUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec"
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 text-sm" aria-label="Link Apps Script cá nhân" />
              </li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onConnect} disabled={!!busy || !folderUrl.trim() || !scriptUrl.trim()} className={`${btn} bg-sky-700 hover:bg-sky-800 text-white`}>
                {busy === 'connect' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Kiểm tra & kết nối
              </button>
              {cfg && (
                <>
                  <button type="button" onClick={onSync} disabled={!!busy} className={`${btn} border border-slate-300 bg-white hover:bg-slate-50 text-slate-800`}>
                    {busy === 'sync' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Đồng bộ ngay
                  </button>
                  <button type="button" onClick={onDisconnect} disabled={!!busy} className={`${btn} border border-rose-200 bg-white hover:bg-rose-50 text-rose-700`}>
                    <Unplug className="w-4 h-4" /> Ngắt kết nối
                  </button>
                </>
              )}
            </div>
            <p className="text-xs text-slate-600">Khi đã kết nối: mỗi lần sửa câu hỏi, phần mềm tự đẩy lên Drive cá nhân sau ~10 giây; mở phần mềm trên máy khác là tự lấy bản mới hơn.</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default QuizStorageModal;
