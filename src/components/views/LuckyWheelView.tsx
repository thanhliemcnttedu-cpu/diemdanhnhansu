import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { Student } from '../../types';
import {
  Sparkles, Award, Trash2, Trophy, Check, RotateCw, Compass, Palette, X
} from 'lucide-react';
import {
  playTickSound,
  playFanfareSound,
  playCoinSound,
  playApplauseSound,
  playYesSound,
  triggerFlowerConfetti
} from '../../utils/audio';
import { handleAvatarImgError } from '../../utils/avatarConfig';
import { CalledStudentModal } from './picker/CalledStudentModal';
import { useFairCall } from './picker/useFairCall';

type WheelItem = { id: string; name: string };

/** Bảng màu vòng quay ("Nền & Màu"): màu các múi + màu viền vàng + nền sân khấu. Chỉ dùng tông sáng. */
interface WheelTheme {
  id: string;
  name: string;
  colors: string[];
  /** Viền ngoài: [mép trong, giữa, mép ngoài] */
  ring: [string, string, string];
  bg: string;
  accent: string;
}

const WHEEL_THEMES: WheelTheme[] = [
  {
    id: 'rainbow', name: 'Cầu vồng',
    colors: ['#2563EB', '#7C3AED', '#DB2777', '#16A34A', '#EA580C', '#DC2626', '#0D9488', '#4F46E5', '#65A30D', '#0284C7', '#C026D3', '#D97706'],
    ring: ['#F59E0B', '#FDBA3B', '#B45309'], bg: 'linear-gradient(180deg,#FFF9E8 0%,#FFEFCB 100%)', accent: '#EA580C'
  },
  {
    id: 'candy', name: 'Kẹo ngọt',
    colors: ['#DB2777', '#9333EA', '#0891B2', '#E11D48', '#7C3AED', '#0D9488', '#C026D3', '#EA580C'],
    ring: ['#F472B6', '#FBCFE8', '#9D174D'], bg: 'linear-gradient(180deg,#FFF3F9 0%,#FDE4F1 100%)', accent: '#DB2777'
  },
  {
    id: 'ocean', name: 'Đại dương',
    colors: ['#0369A1', '#0E7490', '#1D4ED8', '#0F766E', '#4338CA', '#0284C7', '#155E75', '#2563EB'],
    ring: ['#38BDF8', '#BAE6FD', '#075985'], bg: 'linear-gradient(180deg,#F0FAFF 0%,#DDF1FD 100%)', accent: '#0284C7'
  },
  {
    id: 'forest', name: 'Rừng xanh',
    colors: ['#15803D', '#0F766E', '#4D7C0F', '#047857', '#166534', '#65A30D', '#0D9488', '#B45309'],
    ring: ['#4ADE80', '#BBF7D0', '#166534'], bg: 'linear-gradient(180deg,#F3FEF6 0%,#DDF8E6 100%)', accent: '#16A34A'
  },
  {
    id: 'sunset', name: 'Hoàng hôn',
    colors: ['#DC2626', '#EA580C', '#D97706', '#C026D3', '#BE123C', '#9333EA', '#E11D48', '#B45309'],
    ring: ['#FB923C', '#FED7AA', '#9A3412'], bg: 'linear-gradient(180deg,#FFF8F1 0%,#FFE9D2 100%)', accent: '#EA580C'
  }
];

/** Chỉ dùng emoji Unicode ≤ 12 (phông emoji Windows 10 hiển thị được, không ra ô vuông). */
const WHEEL_EMOJIS = ['😀', '😎', '🤩', '😺', '🐶', '🐱', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🦄', '🐙', '🦋', '🐢', '🐬', '⭐', '🚀', '🍀', '🌈', '🎈', '🎨', '⚽', '🍎', '🌻'];
const GROUP_EMOJIS = ['⭐', '🍀', '🔥', '🌊', '🌈', '🎈'];

const hashStr = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

const LS_THEME = 'lhhp_wheel_theme';
const LS_EMOJI = 'lhhp_wheel_emoji';
const readLS = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } };

const CANVAS_SIZE = 800;
const TWO_PI = Math.PI * 2;
const POINTER_ANGLE = 1.5 * Math.PI;
const mod2pi = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;

export const LuckyWheelView: React.FC = () => {
  const { currentClassStudents, awardPoints } = useClassroom();
  const fair = useFairCall();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pinRef = useRef<HTMLDivElement | null>(null);
  const rotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const [spinMode, setSpinMode] = useState<'individual' | 'groups'>('individual');
  const [isSpinning, setIsSpinning] = useState(false);
  const [winnerStudent, setWinnerStudent] = useState<Student | null>(null);
  const [winnerGroup, setWinnerGroup] = useState<string | null>(null);
  const [showWinnerPopup, setShowWinnerPopup] = useState(false);
  const [pointerName, setPointerName] = useState('');

  const [spinHistory, setSpinHistory] = useState<Array<{ name: string; time: string; type: string }>>([]);
  const [excludePreviousWinners, setExcludePreviousWinners] = useState(false);
  const [rewardXu, setRewardXu] = useState(3);
  const [hasAwardedWinner, setHasAwardedWinner] = useState(false);

  // Nền & Màu
  const [themeId, setThemeId] = useState<string>(() => {
    const v = readLS(LS_THEME);
    return WHEEL_THEMES.some(t => t.id === v) ? (v as string) : 'rainbow';
  });
  const [showEmoji, setShowEmoji] = useState<boolean>(() => readLS(LS_EMOJI) !== '0');
  const [showThemePanel, setShowThemePanel] = useState(false);
  const theme = WHEEL_THEMES.find(t => t.id === themeId) || WHEEL_THEMES[0];

  const groupsList = ['Tổ 1', 'Tổ 2', 'Tổ 3', 'Tổ 4'];

  const activeItems: WheelItem[] = useMemo(() => (
    spinMode === 'individual'
      ? (excludePreviousWinners ? currentClassStudents.filter(s => !fair.calledIds.includes(s.id)) : currentClassStudents)
      : groupsList.map((g, idx) => ({ id: `grp-${idx}`, name: g }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [spinMode, excludePreviousWinners, currentClassStudents, fair.calledIds]);

  // Các giá trị mới nhất cho vòng vẽ (tránh đóng băng giá trị cũ trong requestAnimationFrame)
  const itemsRef = useRef<WheelItem[]>(activeItems);
  const themeRef = useRef<WheelTheme>(theme);
  const emojiRef = useRef(showEmoji);
  const modeRef = useRef(spinMode);
  itemsRef.current = activeItems;
  themeRef.current = theme;
  emojiRef.current = showEmoji;
  modeRef.current = spinMode;

  const indexAtPointer = (angle: number, n: number) => {
    if (n === 0) return -1;
    const arc = TWO_PI / n;
    return Math.min(n - 1, Math.floor(mod2pi(POINTER_ANGLE - angle) / arc));
  };

  /** Vẽ vòng quay: viền vàng có đèn LED, các múi màu, tên xoay theo bán kính (kèm biểu tượng ở phía tâm). */
  const drawWheel = (angle: number, blink: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const items = itemsRef.current;
    const th = themeRef.current;
    const c = CANVAS_SIZE / 2;
    const rOut = c - 6;
    const ringW = 42;
    const rIn = rOut - ringW;
    const R = rIn - 8;
    const hubR = 92;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Viền vàng (chuyển sắc xuyên tâm)
    const g = ctx.createRadialGradient(c, c, rIn, c, c, rOut);
    g.addColorStop(0, th.ring[0]);
    g.addColorStop(0.5, th.ring[1]);
    g.addColorStop(1, th.ring[2]);
    ctx.beginPath();
    ctx.arc(c, c, rOut, 0, TWO_PI);
    ctx.arc(c, c, rIn, 0, TWO_PI, true);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = th.ring[2];
    ctx.beginPath(); ctx.arc(c, c, rOut - 1.5, 0, TWO_PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(c, c, rIn + 1.5, 0, TWO_PI); ctx.stroke();

    // Đèn LED trắng quanh viền (nhấp nháy xen kẽ khi đang quay)
    const leds = 36;
    for (let i = 0; i < leds; i++) {
      const a = (i / leds) * TWO_PI;
      const lit = blink < 0 || (i + blink) % 2 === 0;
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * (rIn + ringW / 2), c + Math.sin(a) * (rIn + ringW / 2), 6.5, 0, TWO_PI);
      ctx.fillStyle = lit ? '#ffffff' : 'rgba(255,255,255,0.4)';
      ctx.shadowColor = lit ? 'rgba(255,255,255,0.95)' : 'transparent';
      ctx.shadowBlur = lit ? 12 : 0;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // Nền khe giữa viền và múi
    ctx.beginPath(); ctx.arc(c, c, rIn - 4, 0, TWO_PI);
    ctx.fillStyle = '#ffffff'; ctx.fill();

    if (items.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 28px "Be Vietnam Pro", sans-serif';
      ctx.fillText('Chưa có học sinh để quay', c, c);
      return;
    }

    const n = items.length;
    const arc = TWO_PI / n;
    const useEmoji = emojiRef.current && n <= 36;
    // Ít múi thì chữ to hơn cho dễ đọc từ xa; nhiều múi thì thu nhỏ theo bề rộng múi
    const fsMax = n <= 6 ? 46 : n <= 12 ? 34 : 27;
    const fs = Math.max(12, Math.min(fsMax, Math.round(arc * R * 0.3)));
    const inner = hubR + 16;
    const outer = R - 16;
    const emojiW = useEmoji ? fs * 1.45 : 0;

    items.forEach((item, i) => {
      const a0 = angle + i * arc;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, R, a0, a0 + arc);
      ctx.closePath();
      ctx.fillStyle = th.colors[i % th.colors.length];
      ctx.fill();
      ctx.lineWidth = n > 30 ? 2 : 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.stroke();

      // Nhãn: luôn đọc xuôi (nửa phải đọc từ tâm ra, nửa trái đọc từ mép vào), biểu tượng nằm gần tâm
      const mid = a0 + arc / 2;
      const rightHalf = Math.cos(mid) >= 0;
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(rightHalf ? mid : mid + Math.PI);
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${fs}px "Be Vietnam Pro", sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.38)';
      ctx.shadowBlur = 4;

      const maxW = outer - inner - emojiW;
      let label = item.name;
      if (ctx.measureText(label).width > maxW) {
        while (label.length > 1 && ctx.measureText(label + '…').width > maxW) label = label.slice(0, -1);
        label = label.trimEnd() + '…';
      }
      const emoji = useEmoji
        ? (modeRef.current === 'groups' ? GROUP_EMOJIS[i % GROUP_EMOJIS.length] : WHEEL_EMOJIS[hashStr(item.id) % WHEEL_EMOJIS.length])
        : '';
      if (rightHalf) {
        ctx.textAlign = 'right';
        ctx.fillText(label, outer, 1);
        if (emoji) { ctx.shadowBlur = 0; ctx.textAlign = 'left'; ctx.font = `${Math.round(fs * 1.05)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; ctx.fillText(emoji, inner, 1); }
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(label, -outer, 1);
        if (emoji) { ctx.shadowBlur = 0; ctx.textAlign = 'right'; ctx.font = `${Math.round(fs * 1.05)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; ctx.fillText(emoji, -inner, 1); }
      }
      ctx.restore();
    });

    // Quầng sáng nhẹ cho khối cầu
    const shine = ctx.createRadialGradient(c - R * 0.35, c - R * 0.4, R * 0.1, c, c, R);
    shine.addColorStop(0, 'rgba(255,255,255,0.18)');
    shine.addColorStop(0.6, 'rgba(255,255,255,0)');
    shine.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.beginPath(); ctx.arc(c, c, R, 0, TWO_PI); ctx.fillStyle = shine; ctx.fill();
  };

  // Vẽ lại khi dữ liệu / bảng màu / phông chữ thay đổi (không can thiệp khi đang quay)
  useEffect(() => {
    if (!isSpinning) {
      drawWheel(rotationRef.current, -1);
      const n = activeItems.length;
      const idx = indexAtPointer(rotationRef.current, n);
      setPointerName(idx >= 0 ? activeItems[idx].name : '');
    }
  });

  useEffect(() => {
    let cancelled = false;
    (document as any).fonts?.ready?.then(() => { if (!cancelled && !isSpinning) drawWheel(rotationRef.current, -1); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const wigglePin = () => {
    const el = pinRef.current as any;
    if (el?.animate) el.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-16deg)' }, { transform: 'rotate(0deg)' }], { duration: 110, easing: 'ease-out' });
  };

  const spinWheel = () => {
    const items = activeItems;
    if (isSpinning || items.length === 0) return;

    setIsSpinning(true);
    setWinnerStudent(null);
    setWinnerGroup(null);
    setHasAwardedWinner(false);
    setShowThemePanel(false);

    const duration = 5200;
    const n = items.length;
    const winningIndex = Math.floor(Math.random() * n);
    const arc = TWO_PI / n;
    const targetSliceCenter = winningIndex * arc + arc / 2;
    const finalAngle = 8 * TWO_PI + (POINTER_ANGLE - targetSliceCenter);
    const startAngle = rotationRef.current % TWO_PI;
    const total = finalAngle - startAngle;

    const startTime = performance.now();
    let lastIdx = indexAtPointer(startAngle, n);

    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3.8);
      const cur = startAngle + total * ease;
      rotationRef.current = cur;
      drawWheel(cur, Math.floor(now / 130) % 2);

      const idx = indexAtPointer(cur, n);
      if (idx !== lastIdx) {
        lastIdx = idx;
        setPointerName(items[idx]?.name || '');
        playTickSound(800 + Math.random() * 200);
        wigglePin();
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      rafRef.current = null;
      rotationRef.current = cur;
      setIsSpinning(false);
      drawWheel(cur, -1);
      const selected = items[winningIndex];
      setPointerName(selected.name);

      playFanfareSound();
      playApplauseSound();
      playYesSound();
      triggerFlowerConfetti();

      const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (modeRef.current === 'individual') {
        const st = currentClassStudents.find(s => s.id === selected.id);
        if (st) { setWinnerStudent(st); setShowWinnerPopup(true); fair.markCalled(st.id, 'wheel'); }
        setSpinHistory(prev => [{ name: selected.name, time: timeStr, type: 'Cá nhân' }, ...prev]);
      } else {
        setWinnerGroup(selected.name);
        setSpinHistory(prev => [{ name: selected.name, time: timeStr, type: 'Tập thể' }, ...prev]);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
  };

  const handleAwardWinner = () => {
    if (winnerStudent) {
      awardPoints([winnerStudent.id], rewardXu, 'Khen thưởng qua Vòng quay May mắn');
      setHasAwardedWinner(true);
      playCoinSound();
    } else if (winnerGroup) {
      const groupStudents = currentClassStudents.filter(s => s.group === winnerGroup);
      if (groupStudents.length > 0) {
        awardPoints(groupStudents.map(s => s.id), rewardXu, `Khen thưởng tập thể ${winnerGroup}`);
        setHasAwardedWinner(true);
        playCoinSound();
      }
    }
  };

  const handleClearHistory = () => {
    setSpinHistory([]);
    fair.resetRound();
  };

  const pickTheme = (id: string) => { setThemeId(id); writeLS(LS_THEME, id); };
  const toggleEmoji = (on: boolean) => { setShowEmoji(on); writeLS(LS_EMOJI, on ? '1' : '0'); };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* Banner + chọn chế độ quay */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-600 shrink-0" />
            <h2 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight uppercase">
              Vòng quay may mắn (gọi tên &amp; chọn nhóm)
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1 uppercase font-semibold">
            Quay gọi tên ngẫu nhiên phát biểu và cộng xu trực tiếp
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-full self-start md:self-auto">
          <button
            type="button"
            onClick={() => { if (isSpinning) return; setSpinMode('individual'); setWinnerStudent(null); }}
            className={`px-3.5 py-2 rounded-full text-xs font-black uppercase whitespace-nowrap cursor-pointer ${spinMode === 'individual' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Từng học sinh ({currentClassStudents.length})
          </button>
          <button
            type="button"
            onClick={() => { if (isSpinning) return; setSpinMode('groups'); setWinnerStudent(null); }}
            className={`px-3.5 py-2 rounded-full text-xs font-black uppercase whitespace-nowrap cursor-pointer ${spinMode === 'groups' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Theo tổ ({groupsList.length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Sân khấu vòng quay */}
        <div
          className="lg:col-span-7 rounded-[32px] border-2 border-amber-200/80 p-4 sm:p-7 shadow-sm flex flex-col items-center"
          style={{ background: theme.bg }}
        >
          <div
            className="relative w-full max-w-[560px] aspect-square"
            style={{ containerType: 'inline-size' } as React.CSSProperties}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="absolute inset-0 w-full h-full drop-shadow-[0_16px_24px_rgba(120,53,15,0.28)]"
              aria-label="Vòng quay gọi tên"
            />

            {/* Kim chỉ (ghim đỏ) */}
            <div className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none" style={{ top: '-4.5%', width: '11%' }}>
              <div ref={pinRef} style={{ transformOrigin: '50% 8%' }} className="drop-shadow-[0_4px_5px_rgba(0,0,0,0.35)]">
                <svg viewBox="0 0 44 58" className="w-full h-auto block" aria-hidden>
                  <defs>
                    <linearGradient id="lhhp-pin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#F43F5E" />
                      <stop offset="1" stopColor="#BE123C" />
                    </linearGradient>
                  </defs>
                  <path d="M22 56 C22 56 3 34 3 21 A19 19 0 0 1 41 21 C41 34 22 56 22 56 Z" fill="url(#lhhp-pin)" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
                  <circle cx="22" cy="21" r="7" fill="#FDBA3B" stroke="#fff" strokeWidth="2.5" />
                </svg>
              </div>
            </div>

            {/* Nút QUAY ở giữa */}
            <button
              type="button"
              onClick={spinWheel}
              disabled={isSpinning || activeItems.length === 0}
              aria-label="Quay vòng"
              className="no-hover-fx absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 rounded-full flex flex-col items-center justify-center gap-[3%] text-white font-black cursor-pointer disabled:cursor-default disabled:opacity-90 active:scale-95 transition-transform"
              style={{
                width: '23%', height: '23%',
                background: 'radial-gradient(circle at 35% 30%, #FB7185 0%, #E11D48 55%, #C2410C 100%)',
                border: '0.9cqw solid #fff',
                boxShadow: `0 0 0 0.9cqw ${theme.ring[0]}, 0 1.2cqw 2.4cqw rgba(0,0,0,0.35)`,
                fontSize: '3.1cqw'
              }}
            >
              <RotateCw style={{ width: '4.6cqw', height: '4.6cqw' }} className={isSpinning ? 'animate-spin' : ''} />
              <span className="leading-none tracking-wide">QUAY</span>
            </button>
          </div>

          {/* Kim chỉ: tên đang nằm dưới ghim */}
          <div
            className="mt-5 max-w-full inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white border-2 shadow-xs"
            style={{ borderColor: theme.ring[0] }}
            aria-live="polite"
          >
            <Compass className="w-5 h-5 shrink-0" style={{ color: theme.accent }} />
            <span className="text-sm font-semibold text-slate-600 whitespace-nowrap">Kim chỉ:</span>
            <span className="text-sm sm:text-base font-black text-slate-900 min-w-0 truncate">{pointerName || '—'}</span>
          </div>

          {/* Nút hành động */}
          <div className="mt-4 w-full max-w-[560px] flex flex-col sm:flex-row items-stretch gap-3">
            <button
              type="button"
              onClick={spinWheel}
              disabled={isSpinning || activeItems.length === 0}
              className="flex-1 min-h-14 px-6 rounded-2xl font-black text-sm sm:text-base text-white bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 disabled:opacity-60 shadow-lg shadow-orange-500/30 inline-flex items-center justify-center gap-2.5 uppercase cursor-pointer"
            >
              <Sparkles className="w-5 h-5 shrink-0" />
              <span>{isSpinning ? 'Đang quay…' : 'Bấm để quay vòng!'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowThemePanel(v => !v)}
              aria-expanded={showThemePanel}
              className="min-h-14 px-5 rounded-2xl font-black text-sm text-violet-800 bg-white border-2 border-violet-200 hover:bg-violet-50 inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Palette className="w-5 h-5 shrink-0" />
              <span>Nền &amp; Màu</span>
            </button>
          </div>

          {/* Bảng chọn Nền & Màu */}
          {showThemePanel && (
            <div className="mt-3 w-full max-w-[560px] bg-white rounded-2xl border border-violet-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 uppercase">Chọn bảng màu vòng quay</span>
                <button type="button" onClick={() => setShowThemePanel(false)} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer" aria-label="Đóng bảng màu">
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {WHEEL_THEMES.map(t => {
                  const on = t.id === themeId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pickTheme(t.id)}
                      aria-pressed={on}
                      className={`rounded-xl border-2 p-2 text-left cursor-pointer ${on ? 'border-violet-600 bg-violet-50' : 'border-slate-200 hover:border-violet-300'}`}
                    >
                      <div className="flex h-5 rounded-md overflow-hidden mb-1.5">
                        {t.colors.slice(0, 6).map((col, i) => <span key={i} className="flex-1" style={{ background: col }} />)}
                      </div>
                      <div className="text-xs font-black text-slate-800 flex items-center gap-1">
                        {on && <Check className="w-3.5 h-3.5 text-violet-700" />}
                        <span>{t.name}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={showEmoji} onChange={(e) => toggleEmoji(e.target.checked)} className="rounded cursor-pointer" />
                <span>Hiện biểu tượng vui bên cạnh tên (tự ẩn khi lớp trên 36 bạn)</span>
              </label>
            </div>
          )}
        </div>

        {/* Cột phải: cấu hình, kết quả, lịch sử */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 gap-2">
              <span className="text-xs font-black text-slate-800 uppercase">Cấu hình vòng quay</span>
              <span className="px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-800 text-[12px] font-black whitespace-nowrap">
                {activeItems.length} đối tượng
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="text-xs font-bold text-slate-700 uppercase">Số xu thưởng khi trúng:</label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 5].map(pts => (
                  <button
                    key={pts}
                    type="button"
                    onClick={() => setRewardXu(pts)}
                    className={`px-3 py-1.5 rounded-full text-xs font-black cursor-pointer ${rewardXu === pts ? 'bg-amber-700 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    +{pts} xu
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2 text-xs font-bold text-slate-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={excludePreviousWinners}
                onChange={(e) => setExcludePreviousWinners(e.target.checked)}
                className="rounded text-violet-600 focus:ring-violet-500 cursor-pointer mt-0.5"
              />
              <span className="wrap-ok">Tạm loại trừ các bạn đã được quay trúng trong phiên này</span>
            </label>
          </div>

          <CalledStudentModal
            open={showWinnerPopup && Boolean(winnerStudent)}
            student={winnerStudent}
            title="Vòng quay may mắn gọi tên!"
            icon={<Trophy className="w-5 h-5 text-amber-200 shrink-0" />}
            badge="MAY MẮN"
            message={winnerStudent ? <>Vòng quay đã dừng ở tên <strong className="text-slate-900">{winnerStudent.name}</strong>. Chúc mừng em được gọi tên!</> : undefined}
            onAward={(pts) => {
              if (!winnerStudent || hasAwardedWinner) return;
              awardPoints([winnerStudent.id], pts, 'Khen thưởng qua Vòng quay May mắn');
              setRewardXu(pts);
              setHasAwardedWinner(true);
              playCoinSound();
            }}
            awarded={hasAwardedWinner}
            onClose={() => { setShowWinnerPopup(false); setWinnerStudent(null); }}
          />

          {/* Kết quả quay theo tổ */}
          {winnerGroup && (
            <div className="bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-3xl p-5 shadow-md animate-in zoom-in-95 duration-200 space-y-4">
              <div className="flex items-center gap-2 text-white text-xs font-black uppercase tracking-wider">
                <Trophy className="w-4 h-4 text-amber-300" />
                <span>Chúc mừng tổ chiến thắng!</span>
              </div>

              <div className="flex items-center gap-4">
                {winnerStudent ? (
                  <>
                    <img
                      src={winnerStudent.avatar} onError={(e) => handleAvatarImgError(e, winnerStudent?.gender, winnerStudent?.name)}
                      alt={winnerStudent.name}
                      className="w-16 h-16 rounded-full border-2 border-white object-cover object-center bg-white/20 shrink-0 shadow-inner"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <div className="text-xl font-extrabold text-white leading-tight uppercase">{winnerStudent.name}</div>
                      <div className="text-xs text-white mt-0.5 uppercase font-bold">STT #{winnerStudent.stt} · {winnerStudent.group || 'Chưa chia tổ'}</div>
                    </div>
                  </>
                ) : (
                  <div className="text-3xl font-black text-white uppercase">{winnerGroup}</div>
                )}
              </div>

              <div className="pt-3 border-t border-white/20 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white font-bold uppercase">Thưởng:</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={rewardXu}
                    onChange={(e) => setRewardXu(parseInt(e.target.value) || 1)}
                    className="w-14 px-2 py-1 rounded-lg bg-white/20 text-white font-bold text-center text-xs border border-white/30 tabular-nums"
                  />
                  <span className="text-xs font-black text-amber-300 uppercase">xu</span>
                </div>

                <button
                  type="button"
                  onClick={handleAwardWinner}
                  disabled={hasAwardedWinner}
                  className="px-4 py-2 rounded-full text-xs font-black bg-amber-400 hover:bg-amber-300 text-slate-900 shadow-xs flex items-center gap-1.5 disabled:bg-white/30 disabled:text-white/70 uppercase cursor-pointer"
                >
                  {hasAwardedWinner ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-800" />
                      <span>Đã cộng xu!</span>
                    </>
                  ) : (
                    <>
                      <Award className="w-4 h-4" />
                      <span>Cộng xu ngay</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Lịch sử */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black text-slate-800 uppercase">Lịch sử quay lượt này ({spinHistory.length})</h3>
              {spinHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="text-xs text-rose-700 hover:text-rose-800 flex items-center gap-1 font-bold uppercase cursor-pointer whitespace-nowrap"
                  title="Đặt lại lượt quay khi chuyển môn hoặc bài học mới"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa lịch sử</span>
                </button>
              )}
            </div>

            {spinHistory.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500 wrap-ok">
                Chưa có lượt quay nào. Bấm "Bấm để quay vòng!" để chọn học sinh ngẫu nhiên.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {spinHistory.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                    <div className="font-semibold text-slate-800 min-w-0 truncate">{item.name}</div>
                    <div className="text-[12px] text-slate-600 tabular-nums whitespace-nowrap">{item.time}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
