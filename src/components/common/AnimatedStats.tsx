import React, { useEffect, useRef, useState } from 'react';

/**
 * Hiệu ứng cho bảng số liệu thống kê: số "chạy" từ giá trị cũ lên giá trị mới, vòng tròn / thanh tiến độ đầy dần.
 * Lần đầu hiện thì chạy từ 0; khi số liệu đổi (đổi kỳ, đổi bộ lọc, dữ liệu mới về) thì chạy từ số đang hiển thị tới số mới.
 * Người dùng bật "giảm chuyển động" của hệ điều hành thì hiện thẳng số cuối, không chạy.
 */
const prefersReducedMotion = () => {
  try { return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function useCountUp(target: number, duration = 1100): number {
  const safe = Number.isFinite(target) ? target : 0;
  const [value, setValue] = useState(prefersReducedMotion() ? safe : 0);
  const fromRef = useRef(prefersReducedMotion() ? safe : 0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (prefersReducedMotion()) { setValue(safe); fromRef.current = safe; return; }
    const from = fromRef.current;
    if (from === safe) { setValue(safe); return; }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const v = from + (safe - from) * easeOutCubic(p);
      fromRef.current = v;
      setValue(v);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else { fromRef.current = safe; rafRef.current = null; }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [safe, duration]);
  return value;
}

/** Số chạy. decimals = số chữ số thập phân; suffix như "%" . Giá trị cuối luôn đúng bằng `value`. */
export const CountUp: React.FC<{ value: number; decimals?: number; suffix?: string; duration?: number; className?: string }> = ({ value, decimals = 0, suffix = '', duration = 1100, className }) => {
  const v = useCountUp(value, duration);
  return <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>{v.toFixed(decimals)}{suffix}</span>;
};

/** Cung tròn tiến độ (vòng đồng hồ) đầy dần theo phần trăm; đặt trong <svg viewBox="0 0 100 100"> đã xoay -90° */
export const RingArc: React.FC<{ percent: number; r: number; color: string; strokeWidth: number; duration?: number }> = ({ percent, r, color, strokeWidth, duration = 1300 }) => {
  const p = useCountUp(Math.max(0, Math.min(100, percent || 0)), duration);
  const C = 2 * Math.PI * r;
  return <circle cx="50" cy="50" r={r} fill="transparent" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C - (C * p) / 100} />;
};

/** Thanh tiến độ đầy dần */
export const GrowBar: React.FC<{ percent: number; className?: string; barClassName?: string; duration?: number }> = ({ percent, className = '', barClassName = '', duration = 1100 }) => {
  const p = useCountUp(Math.max(0, Math.min(100, percent || 0)), duration);
  return (
    <div className={`h-2 rounded-full bg-slate-200 overflow-hidden ${className}`} aria-hidden>
      <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${p}%` }} />
    </div>
  );
};

/** Một đoạn của thanh cột chồng, rộng dần từ 0 tới tỷ lệ cần hiện */
export const GrowSegment: React.FC<{ pct: number; className?: string; title?: string; duration?: number }> = ({ pct, className = '', title, duration = 1000 }) => {
  const p = useCountUp(Math.max(0, Math.min(100, pct || 0)), duration);
  return <div className={className} style={{ width: `${p}%` }} title={title} />;
};
