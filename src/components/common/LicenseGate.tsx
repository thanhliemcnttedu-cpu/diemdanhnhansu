import React, { useEffect, useState } from 'react';
import { KeyRound, Lock, Loader2 } from 'lucide-react';
import { licenseService, currentLicenseFolderId } from '../../services/licenseService';
import { licenseSyncService, type SchoolLicenseStatus } from '../../services/licenseSyncService';
import { LICENSE_REQUIRED_EVENT } from '../../utils/licenseGate';
import { APP_AUTHOR_INFO } from '../../data/initialData';

/**
 * Shows its children only when the school has a licence; otherwise a "locked in trial mode" panel.
 *
 * A school that HAS a licence must never be locked out by a network problem, so the lock only closes on a definite
 * answer:
 *  - in the app: this machine is not activated AND (it is not connected to a school folder, or the school's Apps Script
 *    answered that there is no licence). Connected but unreachable / too old to answer → open.
 *  - stand-alone staff check-in page (`conn` given): the page shows at once and locks only when the school's Apps
 *    Script answers that there is no licence.
 */
interface Props {
  feature: string;
  /** Stand-alone page opened from a link: the school's connection (no login, no Drive config on this device) */
  conn?: { scriptUrl: string; folderId: string } | null;
  standalone?: boolean;
  children: React.ReactNode;
}

export const LicenseGate: React.FC<Props> = ({ feature, conn, standalone = false, children }) => {
  const [activated, setActivated] = useState(() => licenseService.isActivated());
  const [status, setStatus] = useState<SchoolLicenseStatus | 'checking'>('checking');

  useEffect(() => licenseService.subscribe((d) => setActivated(d.isActivated)), []);

  useEffect(() => {
    if (activated) return;
    let alive = true;
    setStatus('checking');
    const job = standalone ? licenseSyncService.checkFor(conn || null) : licenseSyncService.check();
    job.then((s) => { if (alive) setStatus(s); }).catch(() => { if (alive) setStatus('unknown'); });
    return () => { alive = false; };
  }, [activated, standalone, conn?.scriptUrl, conn?.folderId]);

  if (activated || status === 'licensed') return <>{children}</>;
  if (standalone) {
    if (status !== 'unlicensed') return <>{children}</>;
  } else {
    if (status === 'checking') {
      return (
        <div className="min-h-[40vh] flex items-center justify-center gap-2 text-sm font-bold text-slate-700" role="status">
          <Loader2 className="w-4 h-4 animate-spin" /> Đang kiểm tra bản quyền…
        </div>
      );
    }
    if (status === 'unknown' && currentLicenseFolderId()) return <>{children}</>;
  }

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-amber-300 bg-white shadow-sm p-5 space-y-3 text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center"><Lock className="w-6 h-6" /></div>
        <h2 className="text-lg font-black text-slate-900">{feature} cần kích hoạt bản quyền</h2>
        <p className="text-sm font-semibold text-slate-700">
          Phần mềm đang ở chế độ dùng thử nên mục này bị khóa. {standalone
            ? 'Quản trị nhà trường kích hoạt bản quyền trong phần mềm là trang này dùng được ngay.'
            : 'Quản trị nhà trường kích hoạt bản quyền một lần là mọi máy của trường dùng được.'}
        </p>
        {!standalone && (
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(LICENSE_REQUIRED_EVENT, { detail: { feature } }))}
            className="no-hover-fx h-11 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer">
            <KeyRound className="w-4 h-4" /> Nhập mã bản quyền
          </button>
        )}
        <p className="text-xs text-slate-600">Nhận mã bản quyền: {APP_AUTHOR_INFO.name} – Zalo {APP_AUTHOR_INFO.zalo}. Dữ liệu của trường vẫn được giữ nguyên.</p>
      </div>
    </div>
  );
};

export default LicenseGate;
