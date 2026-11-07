import React, { useState, useEffect, useRef } from 'react';
import { 
  Timer, Play, Pause, RotateCcw, Maximize2, Minimize2, 
  Volume2, VolumeX, ChevronUp, ChevronDown, Check, Sparkles,
  Clock, Calendar as CalendarIcon, LayoutGrid, Split, Bell
} from 'lucide-react';
import { playWarningTick, playTimerAlarm, playTenSecondTimerAlarm, playCoinSound } from '../../utils/audio';

const QUICK_PRESETS = [
  { label: '30 giây', seconds: 30 },
  { label: '1 phút', seconds: 60 },
  { label: '3 phút', seconds: 180 },
  { label: '5 phút', seconds: 300 },
  { label: '10 phút', seconds: 600 },
  { label: '15 phút', seconds: 900 },
  { label: '20 phút', seconds: 1200 },
  { label: '25 phút', seconds: 1500 },
  { label: '30 phút', seconds: 1800 },
  { label: '45 phút', seconds: 2700 },
  { label: '1 giờ', seconds: 3600 },
];

const THEME_COLORS = [
  { name: 'Xanh tím', bg: '#4f46e5', ring: '#6366f1' },
  { name: 'Xanh dương', bg: '#2563eb', ring: '#3b82f6' },
  { name: 'Hồng cam', bg: '#e11d48', ring: '#f43f5e' },
  { name: 'Xanh lục', bg: '#059669', ring: '#10b981' },
];

type TimerViewMode = 'countdown' | 'analog' | 'split';

export const TimerView: React.FC = () => {
  const [viewMode, setViewMode] = useState<TimerViewMode>('split');
  const [totalSeconds, setTotalSeconds] = useState(300); // 5 mins default
  const [remainingSeconds, setRemainingSeconds] = useState(300);
  const [isRunning, setIsRunning] = useState(false);
  const [tick10s, setTick10s] = useState(true);
  const [hasSound, setHasSound] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState(THEME_COLORS[0]);

  // 10-second Alarm & Flashing Red Alert State
  const [isAlarmActive, setIsAlarmActive] = useState(false);
  const [alarmSecondsLeft, setAlarmSecondsLeft] = useState(0);
  const alarmControlRef = useRef<{ stop: () => void } | null>(null);
  const alarmIntervalRef = useRef<number | null>(null);

  // Real-time live date and time for Analog Clock
  const [now, setNow] = useState(new Date());

  // Spinners for H:M:S
  const [setHours, setSetHours] = useState(0);
  const [setMins, setSetMins] = useState(5);
  const [setSecs, setSetSecs] = useState(0);

  const timerRef = useRef<number | null>(null);

  // Stop active 10-second alarm
  const stopAlarm = () => {
    setIsAlarmActive(false);
    setAlarmSecondsLeft(0);
    if (alarmControlRef.current) {
      alarmControlRef.current.stop();
      alarmControlRef.current = null;
    }
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
  };

  // Manage 10-second alarm countdown
  useEffect(() => {
    if (isAlarmActive) {
      alarmIntervalRef.current = window.setInterval(() => {
        setAlarmSecondsLeft(prev => {
          if (prev <= 1) {
            setIsAlarmActive(false);
            if (alarmControlRef.current) {
              alarmControlRef.current.stop();
              alarmControlRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
    };
  }, [isAlarmActive]);

  // Live Clock Ticker
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setNow(new Date());
    }, 250);

    return () => clearInterval(clockInterval);
  }, []);

  // Countdown Ticker
  useEffect(() => {
    if (isRunning && remainingSeconds > 0) {
      timerRef.current = window.setInterval(() => {
        setRemainingSeconds((prev) => {
          const next = prev - 1;
          if (tick10s && hasSound && next <= 10 && next > 0) {
            playWarningTick();
          }
          if (next <= 0) {
            setIsRunning(false);
            setIsAlarmActive(true);
            setAlarmSecondsLeft(10);
            if (hasSound) {
              if (alarmControlRef.current) alarmControlRef.current.stop();
              alarmControlRef.current = playTenSecondTimerAlarm();
            }
            return 0;
          }
          return next;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, tick10s, hasSound]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (alarmControlRef.current) {
        alarmControlRef.current.stop();
        alarmControlRef.current = null;
      }
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleApplyCustomTime = () => {
    stopAlarm();
    const total = setHours * 3600 + setMins * 60 + setSecs;
    if (total > 0) {
      setTotalSeconds(total);
      setRemainingSeconds(total);
      setIsRunning(false);
      playCoinSound();
    }
  };

  const handleSelectPreset = (secs: number) => {
    stopAlarm();
    setTotalSeconds(secs);
    setRemainingSeconds(secs);
    setSetHours(Math.floor(secs / 3600));
    setSetMins(Math.floor((secs % 3600) / 60));
    setSetSecs(secs % 60);
    setIsRunning(false);
  };

  const handleStartQuick30s = () => {
    stopAlarm();
    setTotalSeconds(30);
    setRemainingSeconds(30);
    setSetHours(0);
    setSetMins(0);
    setSetSecs(30);
    setIsRunning(true);
    playCoinSound();
  };

  const handleAdjustSeconds = (delta: number) => {
    stopAlarm();
    setRemainingSeconds(prev => Math.max(0, prev + delta));
    setTotalSeconds(prev => Math.max(0, prev + delta));
  };

  const handleReset = () => {
    stopAlarm();
    setIsRunning(false);
    setRemainingSeconds(totalSeconds);
  };

  // SVG Ring Progress
  const progressRatio = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
  const radius = 130;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progressRatio * circumference;

  // Real-time Analog Clock calculations
  const curHours = now.getHours();
  const curMinutes = now.getMinutes();
  const curSeconds = now.getSeconds();
  const curMs = now.getMilliseconds();

  const secondAngle = (curSeconds + curMs / 1000) * 6; // 360 / 60
  const minuteAngle = (curMinutes + curSeconds / 60) * 6;
  const hourAngle = ((curHours % 12) + curMinutes / 60) * 30; // 360 / 12

  // Vietnamese Date formatting
  const DAYS_VI = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dayOfWeekVi = DAYS_VI[now.getDay()];
  const dateFormattedVi = `Ngày ${String(now.getDate()).padStart(2, '0')} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;
  const digitalTimeVi = `${String(curHours).padStart(2, '0')}:${String(curMinutes).padStart(2, '0')}:${String(curSeconds).padStart(2, '0')}`;

  // Clock numbers positions 1..12
  const clockNumbers = Array.from({ length: 12 }, (_, i) => {
    const num = i + 1;
    const angleRad = (num * 30 - 90) * (Math.PI / 180);
    const x = 150 + 105 * Math.cos(angleRad);
    const y = 150 + 105 * Math.sin(angleRad);
    return { num, x, y };
  });

  // Clock tick marks 60
  const clockTicks = Array.from({ length: 60 }, (_, i) => {
    const isHour = i % 5 === 0;
    const angleRad = (i * 6 - 90) * (Math.PI / 180);
    const rOuter = 138;
    const rInner = isHour ? 124 : 130;
    return {
      x1: 150 + rInner * Math.cos(angleRad),
      y1: 150 + rInner * Math.sin(angleRad),
      x2: 150 + rOuter * Math.cos(angleRad),
      y2: 150 + rOuter * Math.sin(angleRad),
      isHour
    };
  });

  return (
    <div className="p-3 md:p-5 max-w-7xl mx-auto space-y-4">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 hover-zoom-card">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
              <Timer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-black text-slate-900 flex items-center gap-2">
                <span>Đồng Hồ Lớp Học & Đếm Ngược</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200">
                  Thời Gian Thực
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Đồng hồ kim thời gian thực, ngày tháng năm chuẩn sư phạm và đồng hồ đếm ngược báo giờ giảng dạy!
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher Tabs & Audio/Fullscreen Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl">
            <button
              onClick={() => setViewMode('split')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all hover-zoom-btn ${
                viewMode === 'split' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Split className="w-3.5 h-3.5" />
              <span>SONG SONG</span>
            </button>
            <button
              onClick={() => setViewMode('analog')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all hover-zoom-btn uppercase ${
                viewMode === 'analog' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>ĐỒNG HỒ KIM</span>
            </button>
            <button
              onClick={() => setViewMode('countdown')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all hover-zoom-btn uppercase ${
                viewMode === 'countdown' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Timer className="w-3.5 h-3.5" />
              <span>ĐẾM NGƯỢC</span>
            </button>
          </div>

          <button
            onClick={() => setHasSound(!hasSound)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 border transition-all hover-zoom-btn uppercase ${
              hasSound 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            {hasSound ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{hasSound ? 'CÓ CHUÔNG' : 'TẮT CHUÔNG'}</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className="px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 hover-zoom-btn uppercase"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>TOÀN MÀN HÌNH</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* ANALOG CLOCK STAGE (ĐỒNG HỒ KIM THỜI GIAN THỰC & NGÀY THÁNG NĂM)      */}
      {/* ===================================================================== */}
      {(viewMode === 'analog' || viewMode === 'split') && (
        <div className={`bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 rounded-3xl p-4 sm:p-6 md:p-8 text-white shadow-xl border border-indigo-500/20 relative overflow-hidden hover-zoom-card ${viewMode === 'analog' ? 'max-w-3xl mx-auto' : ''}`}>
          {/* Subtle Ambient Lights */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6 relative z-10">
            {/* Left: The Realistic Analog Clock Face */}
            <div className="flex flex-col items-center shrink-0">
              <div className="relative w-48 h-48 sm:w-64 sm:h-64 md:w-72 md:h-72 flex items-center justify-center">
                <svg className="w-full h-full drop-shadow-2xl" viewBox="0 0 300 300">
                  {/* Outer Bezel */}
                  <circle cx="150" cy="150" r="146" fill="#1e293b" stroke="#6366f1" strokeWidth="4" />
                  <circle cx="150" cy="150" r="142" fill="#0f172a" stroke="#334155" strokeWidth="2" />
                  <circle cx="150" cy="150" r="138" fill="#ffffff" />

                  {/* 60 Minute/Second Tick Marks */}
                  {clockTicks.map((t, idx) => (
                    <line
                      key={idx}
                      x1={t.x1}
                      y1={t.y1}
                      x2={t.x2}
                      y2={t.y2}
                      stroke={t.isHour ? '#0f172a' : '#94a3b8'}
                      strokeWidth={t.isHour ? '3' : '1.2'}
                      strokeLinecap="round"
                    />
                  ))}

                  {/* 12 Hour Numbers */}
                  {clockNumbers.map((cn) => (
                    <text
                      key={cn.num}
                      x={cn.x}
                      y={cn.y + 6}
                      textAnchor="middle"
                      fill="#0f172a"
                      fontSize="19"
                      fontWeight="900"
                      fontFamily="Cabinet Grotesk, sans-serif"
                    >
                      {cn.num}
                    </text>
                  ))}

                  {/* Inner Pedagogical Brand Text */}
                  <text x="150" y="98" textAnchor="middle" fill="#6366f1" fontSize="9" fontWeight="800" letterSpacing="1">
                    LỚP HỌC HẠNH PHÚC
                  </text>
                  <text x="150" y="215" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="700">
                    QUARTZ • VIỆT NAM
                  </text>

                  {/* Hour Hand */}
                  <line
                    x1="150"
                    y1="150"
                    x2={150 + 60 * Math.sin(hourAngle * Math.PI / 180)}
                    y2={150 - 60 * Math.cos(hourAngle * Math.PI / 180)}
                    stroke="#1e293b"
                    strokeWidth="6.5"
                    strokeLinecap="round"
                  />

                  {/* Minute Hand */}
                  <line
                    x1="150"
                    y1="150"
                    x2={150 + 95 * Math.sin(minuteAngle * Math.PI / 180)}
                    y2={150 - 95 * Math.cos(minuteAngle * Math.PI / 180)}
                    stroke="#3b82f6"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />

                  {/* Second Hand (Red with counterweight tail) */}
                  <line
                    x1={150 - 24 * Math.sin(secondAngle * Math.PI / 180)}
                    y1={150 + 24 * Math.cos(secondAngle * Math.PI / 180)}
                    x2={150 + 115 * Math.sin(secondAngle * Math.PI / 180)}
                    y2={150 - 115 * Math.cos(secondAngle * Math.PI / 180)}
                    stroke="#ef4444"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />

                  {/* Center Pivot Cap */}
                  <circle cx="150" cy="150" r="7" fill="#ef4444" />
                  <circle cx="150" cy="150" r="3.5" fill="#facc15" />
                </svg>
              </div>
            </div>

            {/* Right: Date, Day of Week & Digital Time Banner */}
            <div className="flex-1 text-center md:text-left space-y-2.5 sm:space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-[11px] sm:text-xs font-black uppercase tracking-wider">
                <CalendarIcon className="w-3.5 h-3.5 text-amber-300" />
                <span>Thời Gian Hiện Tại • Năm Học 2026 - 2027</span>
              </div>

              {/* Day of Week & Full Date */}
              <div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-amber-300 tracking-tight">
                  {dayOfWeekVi}
                </h2>
                <p className="text-sm sm:text-lg md:text-xl font-bold text-slate-100 mt-0.5 sm:mt-1">
                  {dateFormattedVi}
                </p>
              </div>

              {/* Big Digital Clock */}
              <div className="inline-block bg-slate-950/70 border border-indigo-500/30 px-4 sm:px-6 py-1.5 sm:py-2.5 rounded-2xl shadow-inner font-mono text-2xl sm:text-3xl md:text-4xl font-black tracking-widest text-cyan-300">
                {digitalTimeVi}
              </div>

              <p className="text-[11px] sm:text-xs text-indigo-200/80 font-medium">
                Đồng hồ kim và lịch ngày tháng tự động đồng bộ chính xác theo giờ hệ thống của máy tính và lớp học.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* COUNTDOWN TIMER STAGE (ĐỒNG HỒ ĐẾM NGƯỢC GIỜ HỌC)                     */}
      {/* ===================================================================== */}
      {(viewMode === 'countdown' || viewMode === 'split') && (
        <div className="space-y-4">
          {/* Cảnh báo nhấp nháy nền màu đỏ nội dung "HẾT GIỜ" và chuông reo trong 10 giây */}
          {isAlarmActive && (
            <div className="w-full bg-red-600 animate-flash-red text-white py-4 px-6 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl border-4 border-red-300">
              <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center animate-bounce shrink-0">
                  <Bell className="w-8 h-8 text-white" />
                </div>
                <div>
                  <div className="text-3xl sm:text-4xl font-black tracking-widest uppercase flex items-center justify-center sm:justify-start gap-3">
                    <span>⏰ HẾT GIỜ</span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-white text-red-700 font-black tracking-normal shadow-sm">
                      {alarmSecondsLeft}s
                    </span>
                  </div>
                  <p className="text-sm font-bold text-red-100 mt-1">
                    Chuông báo hiệu đang reo trong 10 giây (còn {alarmSecondsLeft} giây)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={stopAlarm}
                  className="px-5 py-2.5 bg-white text-red-700 hover:bg-red-50 rounded-2xl font-black text-xs shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                >
                  <VolumeX className="w-4 h-4" />
                  <span>TẮT CHUÔNG BÁO</span>
                </button>
                <button
                  type="button"
                  onClick={handleStartQuick30s}
                  className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-900 rounded-2xl font-black text-xs shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                >
                  <Sparkles className="w-4 h-4 text-amber-900" />
                  <span>ĐẾM LẠI 30 GIÂY</span>
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Stage: Big Circular Ring */}
            <div className={`lg:col-span-7 bg-white rounded-3xl p-4 border shadow-xs flex flex-col items-center justify-center space-y-4 hover-zoom-card transition-colors ${
              isAlarmActive ? 'border-red-400 shadow-red-200' : 'border-slate-200/90'
            }`}>
              {/* Circular Countdown SVG */}
              <div className="relative w-44 h-44 sm:w-56 sm:h-56 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 300 300">
                  {/* Background Track */}
                  <circle
                    cx="150"
                    cy="150"
                    r={radius}
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="14"
                  />
                  {/* Progress Ring */}
                  <circle
                    cx="150"
                    cy="150"
                    r={radius}
                    fill="none"
                    stroke={remainingSeconds === 0 ? '#ef4444' : selectedTheme.ring}
                    strokeWidth="14"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className={`transition-all duration-500 ${isAlarmActive ? 'animate-pulse' : ''}`}
                  />
                </svg>

                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3 sm:p-4">
                  {remainingSeconds === 0 ? (
                    <div className={`flex flex-col items-center justify-center ${isAlarmActive ? 'animate-bounce' : ''}`}>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-600 animate-flash-red text-white text-[10px] sm:text-[11px] font-black uppercase mb-1 shadow-md">
                        <Bell className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
                        <span>CẢNH BÁO</span>
                      </div>
                      <span className="text-3xl sm:text-4xl md:text-5xl font-black tracking-widest text-red-600 animate-pulse drop-shadow-sm">
                        HẾT GIỜ
                      </span>
                      {isAlarmActive ? (
                        <span className="text-[11px] sm:text-xs font-black text-red-600 mt-1 flex items-center gap-1">
                          <Bell className="w-3 h-3 text-red-500 animate-pulse" /> Chuông reo: còn {alarmSecondsLeft}s
                        </span>
                      ) : (
                        <span className="text-[11px] sm:text-xs font-bold text-slate-400 mt-0.5">
                          ĐÃ HOÀN THÀNH
                        </span>
                      )}
                    </div>
                  ) : (
                    <>
                      <span className="text-2xl sm:text-3xl md:text-4xl font-black font-mono tracking-tight text-slate-900">
                        {formatTime(remainingSeconds)}
                      </span>
                      <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-widest text-slate-400 mt-0.5 sm:mt-1">
                        {isRunning ? 'ĐANG CHẠY' : 'SẴN SÀNG'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Quick Controls: -30s, Reset, Start/Pause, +30s in a perfect responsive row */}
              <div className="flex items-center justify-center gap-1.5 sm:gap-2.5 w-full max-w-sm px-1 sm:px-2">
                <button
                  type="button"
                  onClick={() => handleAdjustSeconds(-30)}
                  className="px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 hover-zoom-btn shrink-0"
                >
                  - 30s
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="p-2 sm:p-2.5 rounded-xl text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 hover-zoom-btn shrink-0"
                  title="Đặt lại từ đầu"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopAlarm();
                    setIsRunning(!isRunning);
                  }}
                  className={`flex-1 min-w-[110px] sm:min-w-[130px] px-3 sm:px-8 py-2.5 sm:py-3 rounded-2xl font-black text-xs sm:text-sm text-white shadow-md flex items-center justify-center gap-1.5 sm:gap-2 hover-zoom-btn ${
                    isRunning
                      ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/25'
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/25'
                  }`}
                >
                  {isRunning ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
                  <span>{isRunning ? 'Tạm dừng' : 'Bắt đầu'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAdjustSeconds(30)}
                  className="px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 hover-zoom-btn shrink-0"
                >
                  + 30s
                </button>
              </div>

              {/* Toggle "Tiếng tick cuối 10 giây" */}
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-600 pt-2 hover-zoom-interactive">
                <input
                  type="checkbox"
                  checked={tick10s}
                  onChange={(e) => setTick10s(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Tiếng tick cuối 10 giây</span>
              </label>
            </div>

            {/* Right Stage: Time Configuration */}
            <div className="lg:col-span-5 space-y-3">
              {/* Thiết lập thời gian (Hours, Mins, Secs) */}
              <div className="bg-white rounded-3xl p-3.5 sm:p-4 border border-slate-200/90 shadow-xs space-y-2.5 sm:space-y-3 hover-zoom-card">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Timer className="w-4 h-4 text-indigo-600" />
                  <span>Thiết lập thời gian đếm ngược</span>
                </h3>

                {/* 3 Column Spinners */}
                <div className="flex items-center justify-center gap-2.5 sm:gap-4 py-1.5 sm:py-2">
                  {/* Hours */}
                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => setSetHours(prev => Math.min(23, prev + 1))}
                      className="p-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 hover-zoom-btn"
                    >
                      <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                    <span className="text-xl sm:text-2xl font-black font-mono my-0.5 sm:my-1 text-slate-800 w-10 sm:w-12 text-center">
                      {setHours}
                    </span>
                    <span className="text-[9.5px] sm:text-[10px] text-slate-400 font-bold uppercase">Giờ</span>
                    <button
                      type="button"
                      onClick={() => setSetHours(prev => Math.max(0, prev - 1))}
                      className="p-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 hover-zoom-btn"
                    >
                      <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  </div>

                  <span className="text-lg sm:text-xl font-bold text-slate-300 -mt-3 sm:-mt-4">:</span>

                  {/* Mins */}
                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => setSetMins(prev => Math.min(59, prev + 1))}
                      className="p-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 hover-zoom-btn"
                    >
                      <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                    <span className="text-xl sm:text-2xl font-black font-mono my-0.5 sm:my-1 text-slate-800 w-10 sm:w-12 text-center">
                      {setMins}
                    </span>
                    <span className="text-[9.5px] sm:text-[10px] text-slate-400 font-bold uppercase">Phút</span>
                    <button
                      type="button"
                      onClick={() => setSetMins(prev => Math.max(0, prev - 1))}
                      className="p-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 hover-zoom-btn"
                    >
                      <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  </div>

                  <span className="text-lg sm:text-xl font-bold text-slate-300 -mt-3 sm:-mt-4">:</span>

                  {/* Secs */}
                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => setSetSecs(prev => Math.min(59, prev + 1))}
                      className="p-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 hover-zoom-btn"
                    >
                      <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                    <span className="text-xl sm:text-2xl font-black font-mono my-0.5 sm:my-1 text-slate-800 w-10 sm:w-12 text-center">
                      {setSecs}
                    </span>
                    <span className="text-[9.5px] sm:text-[10px] text-slate-400 font-bold uppercase">Giây</span>
                    <button
                      type="button"
                      onClick={() => setSetSecs(prev => Math.max(0, prev - 1))}
                      className="p-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 hover-zoom-btn"
                    >
                      <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleApplyCustomTime}
                  className="w-full py-2 sm:py-2.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all hover-zoom-btn flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Áp dụng thời gian</span>
                </button>
              </div>

              {/* Mẫu nhanh (Quick Presets) */}
              <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-xs space-y-2 hover-zoom-card">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Mẫu nhanh
                  </h3>
                  <button
                    type="button"
                    onClick={handleStartQuick30s}
                    className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-[11px] font-black flex items-center gap-1 hover-zoom-btn transition-colors"
                  >
                    <Play className="w-3 h-3 fill-amber-800" />
                    <span>Bắt đầu 30s ngay</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {QUICK_PRESETS.map((p) => {
                    const isActive = totalSeconds === p.seconds && !isRunning;
                    const is30s = p.seconds === 30;
                    return (
                      <button
                        key={p.seconds}
                        type="button"
                        onClick={() => handleSelectPreset(p.seconds)}
                        className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all hover-zoom-btn relative ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-300'
                            : is30s
                              ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {is30s && (
                          <span className="absolute -top-1.5 -right-1 px-1 py-0.2 bg-red-500 text-[8px] text-white font-extrabold rounded-full">
                            HOT
                          </span>
                        )}
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Màu chủ đề (Themes) */}
              <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-xs space-y-2 hover-zoom-card">
                <h3 className="text-sm font-bold text-slate-900">
                  Màu chủ đề
                </h3>
                <div className="flex items-center gap-3">
                  {THEME_COLORS.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => setSelectedTheme(t)}
                      className={`w-8 h-8 rounded-full border-2 transition-transform hover-zoom-btn ${
                        selectedTheme.name === t.name ? 'scale-125 border-slate-800 ring-2 ring-indigo-200' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: t.bg }}
                      title={t.name}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
