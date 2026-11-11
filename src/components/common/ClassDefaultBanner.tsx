import React from 'react';

interface ClassDefaultBannerProps {
  /** Class name shown in the middle of the banner */
  name: string;
  /** Class identity color (hex). Only used as a light tint and for the line art. */
  color?: string;
  /** Small caption under the class name */
  caption?: string;
  className?: string;
}

/**
 * Default class banner (no photo uploaded yet): bright, modern "smart classroom" artwork.
 * Light tones only — the class color is mixed with white for the background and with navy for the text.
 */
export const ClassDefaultBanner: React.FC<ClassDefaultBannerProps> = ({ name, color, caption = 'Lớp học hạnh phúc', className = '' }) => {
  const c = color || '#6366F1';
  const ink = `color-mix(in srgb, ${c} 45%, #1e1b4b)`;
  const line = `color-mix(in srgb, ${c} 70%, #ffffff)`;
  const soft = `color-mix(in srgb, ${c} 22%, #ffffff)`;
  const softer = `color-mix(in srgb, ${c} 10%, #ffffff)`;
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, #ffffff 0%, ${softer} 45%, ${soft} 100%)` }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 320 140"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <pattern id={`dots-${uid}`} width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1" fill={line} opacity="0.35" />
          </pattern>
          <linearGradient id={`sun-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fde68a" />
            <stop offset="1" stopColor="#fbbf24" />
          </linearGradient>
        </defs>

        {/* soft shapes */}
        <circle cx="292" cy="18" r="46" fill={soft} opacity="0.9" />
        <circle cx="24" cy="128" r="40" fill={soft} opacity="0.8" />
        <rect x="0" y="0" width="320" height="140" fill={`url(#dots-${uid})`} />

        {/* circuit lines — left */}
        <g fill="none" stroke={line} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
          <path d="M0 44 H14 L22 52" />
          <path d="M0 96 H30 L40 106 H74" />
          <path d="M0 116 H52 L60 108" />
          <path d="M320 104 H300 L292 96" />
          <path d="M320 118 H296 L288 110" />
        </g>
        <g fill="#ffffff" stroke={line} strokeWidth="1.6">
          <circle cx="22" cy="52" r="2.6" />
          <circle cx="74" cy="106" r="3.2" />
          <circle cx="60" cy="108" r="2.6" />
          <circle cx="292" cy="96" r="2.6" />
          <circle cx="288" cy="110" r="2.6" />
        </g>

        {/* open book — left */}
        <g transform="translate(22 56)" stroke={ink} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.85">
          <path d="M0 4 C8 0 16 0 22 4 V24 C16 20 8 20 0 24 Z" fill="#ffffff" />
          <path d="M44 4 C36 0 28 0 22 4 V24 C28 20 36 20 44 24 Z" fill="#ffffff" />
          <path d="M5 10 H17 M5 15 H17 M27 10 H39 M27 15 H39" stroke={line} />
        </g>

        {/* screen with a smile — right */}
        <g transform="translate(250 48)" strokeLinejoin="round" strokeLinecap="round" opacity="0.9">
          <rect x="0" y="0" width="52" height="34" rx="5" fill="#ffffff" stroke={ink} strokeWidth="1.6" />
          <path d="M18 40 H34 M26 34 V40" stroke={ink} strokeWidth="1.6" fill="none" />
          <circle cx="18" cy="14" r="2.2" fill={ink} />
          <circle cx="34" cy="14" r="2.2" fill={ink} />
          <path d="M17 21 C21 27 31 27 35 21" stroke={ink} strokeWidth="1.8" fill="none" />
        </g>

        {/* sun / idea */}
        <g opacity="0.95">
          <circle cx="92" cy="50" r="7" fill={`url(#sun-${uid})`} />
          <g stroke="#f59e0b" strokeWidth="1.6" strokeLinecap="round">
            <path d="M92 39 V36 M92 64 V61 M81 50 H78 M106 50 H103 M84 42 L82 40 M100 58 L102 60 M100 42 L102 40 M84 58 L82 60" />
          </g>
        </g>

        {/* sparkles */}
        <g fill={line}>
          <path d="M228 44 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" opacity="0.9" />
          <path d="M214 112 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" opacity="0.8" />
          <path d="M108 116 l1.3 3.2 3.2 1.3 -3.2 1.3 -1.3 3.2 -1.3 -3.2 -3.2 -1.3 3.2 -1.3z" opacity="0.7" />
        </g>

        {/* atom orbit */}
        <g transform="translate(222 92)" fill="none" stroke={line} strokeWidth="1.3" opacity="0.8">
          <ellipse rx="15" ry="6" />
          <ellipse rx="15" ry="6" transform="rotate(60)" />
          <ellipse rx="15" ry="6" transform="rotate(-60)" />
          <circle r="2.4" fill={ink} stroke="none" />
        </g>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
        <span className="font-black text-2xl sm:text-3xl leading-none tracking-tight" style={{ color: ink }}>{name}</span>
        <span className="mt-1 text-[12px] font-bold uppercase tracking-wide" style={{ color: ink }}>{caption}</span>
      </div>
    </div>
  );
};

export default ClassDefaultBanner;
