import React from 'react';

/**
 * 🪙 Biểu tượng đồng xu vẽ bằng SVG — thay emoji "🪙" (Unicode 13, phông emoji Windows 10 không có → hiện ô vuông).
 * Mặc định cao bằng cỡ chữ đang dùng (1em), canh giữa theo dòng chữ.
 */
export const CoinIcon: React.FC<{ className?: string; title?: string }> = ({ className = '', title }) => (
  <svg
    viewBox="0 0 24 24"
    className={`inline-block w-[1em] h-[1em] align-[-0.15em] shrink-0 ${className}`}
    role={title ? 'img' : undefined}
    aria-hidden={title ? undefined : true}
    aria-label={title}
  >
    <circle cx="12" cy="12" r="10.5" fill="#f59e0b" />
    <circle cx="12" cy="12" r="10.5" fill="none" stroke="#b45309" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="7" fill="#fbbf24" stroke="#d97706" strokeWidth="1.2" />
    <path d="M12 7.6l1.3 2.7 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z" fill="#fffbeb" />
  </svg>
);

export default CoinIcon;
