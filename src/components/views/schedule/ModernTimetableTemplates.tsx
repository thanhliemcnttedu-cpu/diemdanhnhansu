import React from 'react';
import type { TimetableDisplaySettings } from '../../modals/TimetableConfigModal';

/**
 * 🎨 5 MẪU THỜI KHÓA BIỂU HIỆN ĐẠI (dùng chung một bộ dựng, khác nhau ở "chủ đề")
 * - Chữ to, tương phản cao để học sinh nhìn rõ từ xa; mỗi môn một màu cố định + biểu tượng.
 * - Ô trống không in chữ "Chọn môn" (bản in/ảnh gửi Zalo sạch), vẫn bấm để chọn môn khi soạn.
 */

export type ModernTimetableTheme = 'luxe_navy' | 'subject_color' | 'pastel_soft' | 'minimal_mono' | 'day_cards';

export const MODERN_TIMETABLE_THEMES: Array<{ id: ModernTimetableTheme; name: string; badge: string; description: string; icon: string }> = [
  { id: 'subject_color', name: 'Màu Theo Môn', badge: 'Dễ nhìn nhất', description: 'Mỗi môn một màu & biểu tượng, chữ to, học sinh nhìn là nhận ra', icon: '🎨' },
  { id: 'luxe_navy', name: 'Sang Trọng Navy', badge: 'Sang trọng', description: 'Xanh than viền vàng kim, chữ có chân thanh lịch, treo bảng lớp', icon: '🏛️' },
  { id: 'pastel_soft', name: 'Trang Nhã Pastel', badge: 'Trang nhã', description: 'Mỗi ngày một thẻ dọc nền pastel dịu mắt, bo góc mềm mại', icon: '🌸' },
  { id: 'minimal_mono', name: 'Hiện Đại Tối Giản', badge: 'In tiết kiệm', description: 'Đường kẻ mảnh, chữ đậm rõ, chấm màu môn — in đen trắng vẫn đẹp', icon: '◻️' },
  { id: 'day_cards', name: 'Thẻ Theo Ngày', badge: 'Gửi Zalo', description: 'Thẻ từng ngày như ứng dụng điện thoại, phụ huynh xem nhanh', icon: '📱' },
];

export interface SubjectMeta { name: string; color: string; icon: string }

interface Props {
  theme: ModernTimetableTheme;
  settings: TimetableDisplaySettings;
  days: Array<{ day: number; label: string; short: string }>;
  morningPeriods: number;
  afternoonPeriods: number;
  getSubject: (day: number, session: 'morning' | 'afternoon', period: number) => string;
  getMeta: (subject: string) => SubjectMeta | null;
  onSlotClick: (day: number, dayLabel: string, session: 'morning' | 'afternoon', period: number, current: string) => void;
}

// ------------------------------------------------------------------ colour helpers
const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};
const tint = (hex: string, a: number) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; };
const shade = (hex: string, k: number) => { const [r, g, b] = hexToRgb(hex); return `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`; };

const DAY_ACCENTS = ['#1d4ed8', '#047857', '#b45309', '#6d28d9', '#be185d', '#c2410c'];

// ------------------------------------------------------------------ shared pieces
const Header: React.FC<{ settings: TimetableDisplaySettings; theme: ModernTimetableTheme }> = ({ settings, theme }) => {
  if (theme === 'luxe_navy') {
    return (
      <div className="text-center space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8a6d1f' }}>{settings.schoolName}</p>
        <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-[0.08em]" style={{ fontFamily: '"Playfair Display", serif', color: '#1e2a4a' }}>
          {settings.title}
        </h2>
        <div className="flex items-center justify-center gap-3" aria-hidden="true">
          <span className="h-px w-16" style={{ background: '#c9a43a' }} />
          <span style={{ color: '#c9a43a' }}>✦</span>
          <span className="h-px w-16" style={{ background: '#c9a43a' }} />
        </div>
        <p className="text-sm font-bold" style={{ color: '#1e2a4a' }}>
          Lớp <span className="text-lg font-black">{settings.className}</span>
          {settings.showTeacherInfo && <> • GVCN: <span className="font-black">{settings.teacherName}</span></>}
        </p>
        <p className="text-xs font-semibold text-slate-600">{settings.semester} • Năm học {settings.academicYear} • Áp dụng: {settings.appliedDate}</p>
        {settings.showSlogan && <p className="text-sm italic" style={{ fontFamily: '"Lora", serif', color: '#8a6d1f' }}>« {settings.slogan} »</p>}
      </div>
    );
  }
  if (theme === 'pastel_soft') {
    return (
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-700">{settings.schoolName}</p>
          <h2 className="text-3xl font-bold text-slate-900" style={{ fontFamily: '"Lora", serif' }}>
            {settings.title} <span className="text-rose-700">• Lớp {settings.className}</span>
          </h2>
          {settings.showSlogan && <p className="text-sm italic text-slate-600" style={{ fontFamily: '"Lora", serif' }}>{settings.slogan}</p>}
        </div>
        <div className="text-sm text-slate-700 sm:text-right">
          {settings.showTeacherInfo && <p>GVCN: <strong className="text-slate-900">{settings.teacherName}</strong></p>}
          <p className="text-xs font-semibold text-slate-600">{settings.semester} • {settings.academicYear} • Áp dụng: {settings.appliedDate}</p>
        </div>
      </div>
    );
  }
  if (theme === 'minimal_mono') {
    return (
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b-2 border-slate-900 pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-600">{settings.schoolName}</p>
          <h2 className="text-3xl font-black uppercase tracking-tight text-slate-950" style={{ fontFamily: '"Montserrat", sans-serif' }}>
            {settings.title}
          </h2>
        </div>
        <div className="text-sm text-slate-800 sm:text-right" style={{ fontFamily: '"Montserrat", sans-serif' }}>
          <p className="text-2xl font-black text-slate-950">LỚP {settings.className}</p>
          <p className="text-xs font-semibold text-slate-600">
            {settings.showTeacherInfo && <>GVCN {settings.teacherName} • </>}{settings.semester} • {settings.academicYear}
          </p>
        </div>
      </div>
    );
  }
  // subject_color & day_cards: dải tiêu đề màu
  return (
    <div className="rounded-2xl px-5 py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      style={{ background: 'linear-gradient(120deg, #1d4ed8 0%, #4338ca 55%, #7e22ce 100%)' }}>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-100">{settings.schoolName}</p>
        <h2 className="text-3xl font-black uppercase tracking-tight">{settings.title} • Lớp {settings.className}</h2>
        {settings.showSlogan && <p className="text-sm font-semibold text-indigo-50">« {settings.slogan} »</p>}
      </div>
      <div className="text-sm sm:text-right">
        {settings.showTeacherInfo && <p>GVCN: <strong>{settings.teacherName}</strong></p>}
        <p className="text-xs font-semibold text-indigo-100">{settings.semester} • Năm học {settings.academicYear}</p>
        <p className="text-xs font-semibold text-indigo-100">Áp dụng: {settings.appliedDate}</p>
      </div>
    </div>
  );
};

const Legend: React.FC<{ subjects: SubjectMeta[]; dark?: boolean }> = ({ subjects }) => {
  if (subjects.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <span className="text-xs font-black uppercase tracking-wide text-slate-600">Môn học:</span>
      {subjects.map(s => (
        <span key={s.name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border"
          style={{ background: tint(s.color, 0.1), borderColor: tint(s.color, 0.35), color: shade(s.color, 0.62) }}>
          <span>{s.icon}</span>{s.name}
        </span>
      ))}
    </div>
  );
};

// ------------------------------------------------------------------ main component
export const ModernTimetable: React.FC<Props> = ({ theme, settings, days, morningPeriods, afternoonPeriods, getSubject, getMeta, onSlotClick }) => {
  const sessions: Array<{ id: 'morning' | 'afternoon'; label: string; count: number; times: string[] }> = [
    { id: 'morning', label: 'Sáng', count: morningPeriods, times: settings.morningTimes },
    { id: 'afternoon', label: 'Chiều', count: afternoonPeriods, times: settings.afternoonTimes },
  ].filter(s => s.count > 0) as any;

  // Danh sách môn đang dùng (chú thích)
  const used: SubjectMeta[] = [];
  days.forEach(d => sessions.forEach(s => {
    for (let p = 1; p <= s.count; p++) {
      const sub = getSubject(d.day, s.id, p);
      if (sub && !used.some(u => u.name === sub)) { const m = getMeta(sub); used.push({ name: sub, color: m?.color || '#4f46e5', icon: m?.icon || '📘' }); }
    }
  }));

  const chip = (sub: string, big = false) => {
    if (!sub) return null;
    const m = getMeta(sub);
    const color = m?.color || '#4f46e5';
    const icon = m?.icon || '📘';
    switch (theme) {
      case 'subject_color':
        return (
          <div className={`w-full rounded-xl border-2 px-2 ${big ? 'py-2.5' : 'py-2'} flex items-center justify-center gap-1.5 text-center font-black leading-tight`}
            style={{ background: tint(color, 0.13), borderColor: tint(color, 0.45), color: shade(color, 0.6) }}>
            <span className="text-lg">{icon}</span><span className="text-[15px]">{sub}</span>
          </div>
        );
      case 'luxe_navy':
        return (
          <div className="w-full py-2 px-2 text-center font-bold text-[15px] leading-tight border-l-4 bg-white" style={{ borderColor: color, color: '#1e2a4a' }}>
            {sub}
          </div>
        );
      case 'pastel_soft':
        return (
          <div className="flex items-center gap-2 font-semibold text-[15px] text-slate-900">
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0" style={{ background: tint(color, 0.18) }}>{icon}</span>
            <span className="leading-tight">{sub}</span>
          </div>
        );
      case 'minimal_mono':
        return (
          <div className="flex items-center justify-center gap-1.5 font-extrabold text-[15px] text-slate-950" style={{ fontFamily: '"Montserrat", sans-serif' }}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="leading-tight">{sub}</span>
          </div>
        );
      case 'day_cards':
        return (
          <span className="inline-flex items-center gap-1.5 font-bold text-[15px]" style={{ color: shade(color, 0.6) }}>
            <span>{icon}</span>{sub}
          </span>
        );
    }
  };

  const cellBtn = (d: { day: number; label: string }, s: 'morning' | 'afternoon', p: number, className: string, content: React.ReactNode, cur: string) => (
    <td key={d.day} className={className} onClick={() => onSlotClick(d.day, d.label, s, p, cur)} title={cur ? `${d.label} • tiết ${p}: ${cur}` : `Bấm để chọn môn (${d.label}, tiết ${p})`}>
      {content}
    </td>
  );

  // ============================================================ DAY CARDS & PASTEL (cột theo ngày)
  if (theme === 'day_cards' || theme === 'pastel_soft') {
    const pastelBgs = ['#fff1f2', '#ecfdf5', '#fffbeb', '#f5f3ff', '#eff6ff', '#fff7ed'];
    return (
      <div className={`space-y-4 ${theme === 'pastel_soft' ? 'p-5 rounded-3xl' : ''}`}
        style={theme === 'pastel_soft' ? { background: 'linear-gradient(160deg, #fffaf5 0%, #fdf2f8 60%, #f5f3ff 100%)' } : undefined}>
        <Header settings={settings} theme={theme} />
        <div className={`grid gap-3 ${days.length > 5 ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5'}`}>
          {days.map((d, di) => {
            const accent = DAY_ACCENTS[di % DAY_ACCENTS.length];
            return (
              <div key={d.day} className="rounded-2xl overflow-hidden border shadow-xs flex flex-col"
                style={{ borderColor: tint(accent, 0.3), background: theme === 'pastel_soft' ? pastelBgs[di % pastelBgs.length] : '#ffffff' }}>
                <div className="px-3 py-2 flex items-center justify-between"
                  style={theme === 'day_cards' ? { background: accent, color: '#fff' } : { borderBottom: `2px solid ${tint(accent, 0.35)}` }}>
                  <span className={`font-black uppercase tracking-wide ${theme === 'pastel_soft' ? 'text-slate-900' : ''}`}
                    style={theme === 'pastel_soft' ? { fontFamily: '"Lora", serif', color: shade(accent, 0.7) } : undefined}>{d.label}</span>
                  <span className={`text-xs font-bold ${theme === 'day_cards' ? 'text-white/90' : 'text-slate-600'}`}>{d.short}</span>
                </div>
                <div className="p-2.5 space-y-1 flex-1">
                  {sessions.map(s => (
                    <div key={s.id} className="space-y-1">
                      <div className="text-xs font-black uppercase tracking-wider text-slate-600 pt-1">{s.label}</div>
                      {Array.from({ length: s.count }).map((_, i) => {
                        const p = i + 1;
                        const sub = getSubject(d.day, s.id, p);
                        return (
                          <button type="button" key={p} onClick={() => onSlotClick(d.day, d.label, s.id, p, sub)}
                            className="no-hover-fx w-full flex items-center gap-2 text-left rounded-lg px-1.5 py-1 hover:bg-white/80 min-h-[34px]">
                            <span className="w-6 text-xs font-black text-slate-600 shrink-0">T{p}</span>
                            <span className="flex-1 min-w-0">{chip(sub) || <span className="text-sm text-slate-400">—</span>}</span>
                            {settings.showTimeSlots && theme === 'day_cards' && <span className="text-[12px] font-mono text-slate-500 shrink-0">{(s.times[i] || '').split('-')[0].trim()}</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <Legend subjects={used} />
      </div>
    );
  }

  // ============================================================ TABLE THEMES
  const isLuxe = theme === 'luxe_navy';
  const isMono = theme === 'minimal_mono';
  const wrapStyle: React.CSSProperties = isLuxe
    ? { background: '#fdfbf6', border: '3px double #c9a43a', boxShadow: 'inset 0 0 0 6px #fdfbf6, inset 0 0 0 7px rgba(201,164,58,0.45)' }
    : {};

  return (
    <div className={`space-y-4 ${isLuxe ? 'p-6 rounded-2xl' : ''}`} style={wrapStyle}>
      <Header settings={settings} theme={theme} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-sm" style={isMono ? { fontFamily: '"Montserrat", sans-serif' } : undefined}>
          <thead>
            <tr>
              <th className="py-3 px-2 w-16 text-xs font-black uppercase"
                style={isLuxe ? { background: '#1e2a4a', color: '#f3dc9b' } : isMono ? { borderBottom: '2px solid #0f172a', color: '#0f172a' } : { background: '#eef2ff', color: '#312e81' }}>Buổi</th>
              <th className="py-3 px-2 w-24 text-xs font-black uppercase"
                style={isLuxe ? { background: '#1e2a4a', color: '#f3dc9b' } : isMono ? { borderBottom: '2px solid #0f172a', color: '#0f172a' } : { background: '#eef2ff', color: '#312e81' }}>Tiết</th>
              {days.map((d, di) => {
                const accent = DAY_ACCENTS[di % DAY_ACCENTS.length];
                return (
                  <th key={d.day} className="py-3 px-2 text-sm font-black uppercase tracking-wide"
                    style={isLuxe ? { background: '#1e2a4a', color: '#ffffff', fontFamily: '"Playfair Display", serif', letterSpacing: '0.06em' }
                      : isMono ? { borderBottom: '2px solid #0f172a', color: '#0f172a' }
                      : { background: accent, color: '#ffffff', borderLeft: '3px solid #ffffff' }}>
                    {d.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, si) => Array.from({ length: s.count }).map((_, i) => {
              const p = i + 1;
              const rowBorder = isLuxe ? '1px solid rgba(201,164,58,0.35)' : isMono ? '1px solid #cbd5e1' : '1px solid #e2e8f0';
              const sessionTop = i === 0 && si > 0 ? (isLuxe ? '2px solid #c9a43a' : isMono ? '2px solid #0f172a' : '3px solid #c7d2fe') : undefined;
              return (
                <tr key={`${s.id}-${p}`} style={{ borderBottom: rowBorder, borderTop: sessionTop }}>
                  {i === 0 && (
                    <td rowSpan={s.count} className="text-center font-black uppercase text-xs tracking-widest"
                      style={isLuxe ? { color: '#8a6d1f', fontFamily: '"Playfair Display", serif', fontSize: 15, borderRight: rowBorder }
                        : isMono ? { color: '#0f172a', borderRight: rowBorder }
                        : { color: s.id === 'morning' ? '#92400e' : '#1e3a8a', background: s.id === 'morning' ? '#fffbeb' : '#eff6ff' }}>
                      {s.label}
                    </td>
                  )}
                  <td className="text-center py-1.5 px-1" style={{ borderRight: rowBorder }}>
                    <div className="font-black text-slate-900">Tiết {p}</div>
                    {settings.showTimeSlots && <div className="text-[12px] font-mono font-semibold text-slate-600">{s.times[i] || ''}</div>}
                  </td>
                  {days.map(d => {
                    const sub = getSubject(d.day, s.id, p);
                    return cellBtn(d, s.id, p,
                      `p-1.5 cursor-pointer transition-colors ${isLuxe ? 'hover:bg-amber-50' : 'hover:bg-slate-50'} ${sub ? '' : 'h-12'}`,
                      chip(sub), sub);
                  })}
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
      {!isLuxe && <Legend subjects={used} />}
    </div>
  );
};

export default ModernTimetable;
