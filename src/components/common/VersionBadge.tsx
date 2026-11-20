import React, { useEffect, useState } from 'react';
import { APP_PRODUCT_NAME, APP_VERSION_LABEL, formatBuiltAt } from '../../utils/appVersion';

/**
 * Version block shown on the web and in the installed desktop app (sidebar, sign-in screen).
 * Desktop only: also names the installer ("bộ cài"), read from the shell bridge when it exists.
 */
function useShellVersion(): string {
  const [v, setV] = useState('');
  useEffect(() => {
    const b = typeof window !== 'undefined' ? (window as any).lhhpDesktop?.update : null;
    if (!b?.getInfo) return;
    let alive = true;
    Promise.resolve(b.getInfo()).then((i: any) => { if (alive && i?.shellVersion) setV(String(i.shellVersion)); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return v;
}

export const VersionBadge: React.FC<{ variant?: 'block' | 'line'; className?: string }> = ({ variant = 'block', className = '' }) => {
  const shell = useShellVersion();
  const built = formatBuiltAt();
  const text = `Phiên bản ${APP_VERSION_LABEL}${built ? ` • Phát hành lúc ${built}` : ''}${shell ? ` • Bộ cài V.${shell}` : ''}`;
  if (variant === 'line') {
    return <span className={className} title={`${APP_PRODUCT_NAME} — ${text}`}>{APP_PRODUCT_NAME} • {text}</span>;
  }
  return (
    <div className={className} title={`${APP_PRODUCT_NAME} — ${text}`}>
      {/* every line is a unit that never wraps: the name is split on purpose, the date goes on its own line */}
      <p className="font-bold text-slate-800 leading-snug whitespace-nowrap">Cơ sở dữ liệu quản lý</p>
      <p className="font-bold text-slate-800 leading-snug whitespace-nowrap">Lớp Học Hạnh Phúc</p>
      <p className="leading-snug whitespace-nowrap"><span className="font-black text-blue-700">Phiên bản {APP_VERSION_LABEL}</span>{shell ? <span className="text-slate-700"> • Bộ cài V.{shell}</span> : null}</p>
      {built && <p className="text-slate-600 leading-snug whitespace-nowrap">Phát hành lúc {built.split(' ngày ')[0]}</p>}
      {built && <p className="text-slate-600 leading-snug whitespace-nowrap">ngày {built.split(' ngày ')[1]}</p>}
    </div>
  );
};

export default VersionBadge;
