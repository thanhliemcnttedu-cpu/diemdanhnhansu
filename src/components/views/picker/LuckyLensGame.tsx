import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useClassroom } from '../../../context/ClassroomContext';
import { Student } from '../../../types';
import { 
  Camera, Play, Award, RotateCcw, Sparkles, Check, 
  Volume2, VolumeX, Eye, RefreshCw, Zap,
  X, Filter, Trophy, Coins, Target, CheckCircle2, ChevronRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  playTickSound, 
  playFanfareSound, 
  playCoinSound, 
  playCameraShutterSound
} from '../../../utils/audio';
import { handleAvatarImgError } from '../../../utils/avatarConfig';

interface DynamicPhoto {
  id: string;
  student: Student;
  angle: number;           // Current orbital angle (radians)
  baseRadius: number;      // Multi-tier resting radius
  currentRadius: number;   // Dynamic distance from center
  orbitSpeed: number;      // Base orbital velocity
  wobbleSpeed: number;     // Floating oscillation rate
  wobblePhase: number;     // Unique phase
  scale: number;           // Dynamic scale
  opacity: number;         // Dynamic opacity
  rotation: number;        // Card tilt rotation
  ringIndex: number;       // 0 = inner, 1 = middle, 2 = outer
  color: string;           // Neon badge border
  x: number;               // Screen X
  y: number;               // Screen Y
}

const NEON_COLORS = [
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', 
  '#f59e0b', '#10b981', '#14b8a6', '#f43f5e',
  '#eab308', '#a855f7', '#6366f1', '#22c55e'
];

interface LuckyLensGameProps {
  students?: Student[];
  onAward?: (ids: string[], pts: number, reason: string) => void;
}

export const LuckyLensGame: React.FC<LuckyLensGameProps> = ({ 
  students: propStudents, 
  onAward: propOnAward 
}) => {
  const { currentClassStudents, awardPoints, classes, activeClassId } = useClassroom();

  const activeClass = classes.find(c => c.id === activeClassId);
  const allStudents = propStudents || currentClassStudents;

  // Filter & Exclude states
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [autoExclude, setAutoExclude] = useState(true);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [historyList, setHistoryList] = useState<Array<{ student: Student; time: string; points: number }>>([]);

  // Game Mode: 'random' | 'coins'
  const [callMode, setCallMode] = useState<'random' | 'coins'>('random');
  const [rewardCoins, setRewardCoins] = useState(2);
  const [hasAwardedCoins, setHasAwardedCoins] = useState(false);

  // Sound state
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);

  // Animation & Shutter state
  const [isScanning, setIsScanning] = useState(false);
  const [scanPhaseText, setScanPhaseText] = useState<string>('SẴN SÀNG');
  const [flashActive, setFlashActive] = useState(false);
  const [focusedStudent, setFocusedStudent] = useState<Student | null>(null);
  const [winner, setWinner] = useState<Student | null>(null);
  const [shutterDuration] = useState<number>(4.8); // 4.8 seconds dramatic cycle

  // Stage & Dynamic Photos
  const stageRef = useRef<HTMLDivElement>(null);
  const photosRef = useRef<DynamicPhoto[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const scanStartTimeRef = useRef<number>(0);
  const targetWinnerRef = useRef<Student | null>(null);
  const [stageDimensions, setStageDimensions] = useState<{ width: number; height: number }>({ width: 900, height: 560 });

  // Filtered pool
  const groupFiltered = allStudents.filter(s => {
    if (selectedGroupFilter !== 'all' && (s.group || 'Tổ 1') !== selectedGroupFilter) return false;
    return true;
  });

  const availablePool = groupFiltered.filter(s => !excludedIds.includes(s.id));
  const activeStudents = availablePool.length > 0 ? availablePool : groupFiltered;

  // Measure stage dimensions
  useEffect(() => {
    const updateSize = () => {
      if (stageRef.current) {
        const rect = stageRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setStageDimensions({ width: rect.width, height: rect.height });
        }
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Multi-tier orbital initialization (Phân bổ 3 tầng quỹ đạo tránh đè chồng)
  useEffect(() => {
    if (stageDimensions.width <= 0 || stageDimensions.height <= 0) return;

    const list = activeStudents.length > 0 ? activeStudents : allStudents;
    const cx = stageDimensions.width / 2;
    const cy = stageDimensions.height / 2;

    // Determine 3 radius tiers based on stage size
    const maxR = Math.min(cx * 0.85, cy * 0.95);
    const tierRadii = [
      Math.max(130, maxR * 0.42), // Inner tier
      Math.max(200, maxR * 0.68), // Middle tier
      Math.max(270, maxR * 0.92)  // Outer tier
    ];

    photosRef.current = list.map((st, idx) => {
      // Alternate students across 3 rings
      const ringIndex = idx % 3;
      const countInRing = Math.ceil(list.length / 3);
      const indexInRing = Math.floor(idx / 3);

      // Evenly distribute within ring
      const baseAngle = (indexInRing / Math.max(1, countInRing)) * Math.PI * 2 + (ringIndex * 0.6);
      const baseRadius = tierRadii[ringIndex] + (Math.random() - 0.5) * 20;

      const initialX = cx + Math.cos(baseAngle) * baseRadius;
      const initialY = cy + Math.sin(baseAngle) * (baseRadius * 0.72);

      return {
        id: st.id,
        student: st,
        angle: baseAngle,
        baseRadius,
        currentRadius: baseRadius,
        orbitSpeed: (ringIndex % 2 === 0 ? 1 : -1) * (0.003 + (idx % 4) * 0.001),
        wobbleSpeed: 0.002 + Math.random() * 0.002,
        wobblePhase: Math.random() * Math.PI * 2,
        scale: 1,
        opacity: 1,
        rotation: (Math.random() - 0.5) * 12,
        ringIndex,
        color: NEON_COLORS[idx % NEON_COLORS.length],
        x: initialX,
        y: initialY
      };
    });
  }, [activeStudents, stageDimensions, allStudents]);

  // Spectacular Fireworks Trigger (Pháo hoa đa tầng bùng nổ hoành tráng)
  const triggerMassiveFireworks = useCallback(() => {
    // Đợt 1: Bùng nổ tâm màn hình (Center blast)
    confetti({
      particleCount: 100,
      spread: 90,
      origin: { x: 0.5, y: 0.5 },
      colors: ['#f59e0b', '#ec4899', '#3b82f6', '#10b981', '#ffffff', '#eab308']
    });

    // Đợt 2: Pháo hoa cánh gà trái bắn vút lên
    setTimeout(() => {
      confetti({
        particleCount: 70,
        angle: 60,
        spread: 75,
        origin: { x: 0.15, y: 0.75 },
        colors: ['#06b6d4', '#8b5cf6', '#f43f5e', '#eab308', '#ffffff']
      });
    }, 200);

    // Đợt 3: Pháo hoa cánh gà phải bắn vút lên
    setTimeout(() => {
      confetti({
        particleCount: 70,
        angle: 120,
        spread: 75,
        origin: { x: 0.85, y: 0.75 },
        colors: ['#06b6d4', '#8b5cf6', '#f43f5e', '#eab308', '#ffffff']
      });
    }, 380);

    // Đợt 4: Mưa sao băng kim tuyến rơi chậm lấp lánh (Golden shower)
    setTimeout(() => {
      confetti({
        particleCount: 110,
        spread: 120,
        origin: { x: 0.5, y: 0.25 },
        gravity: 0.7,
        scalar: 1.25,
        ticks: 350,
        colors: ['#eab308', '#f59e0b', '#ffffff', '#fbbf24', '#fef08a']
      });
    }, 600);
  }, []);

  // Main 60fps Dynamic Vortex Physics & Shuffling Animation Loop
  useEffect(() => {
    let lastTickTime = 0;

    const renderLoop = (time: number) => {
      if (!stageRef.current) {
        animFrameRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      const cx = stageDimensions.width / 2;
      const cy = stageDimensions.height / 2;
      const totalDurationMs = shutterDuration * 1000;

      if (!isScanning) {
        // --- 1. IDLE STATE: GENTLE ORBITAL DRIFTING ---
        photosRef.current.forEach(p => {
          p.angle += p.orbitSpeed;
          p.currentRadius = p.baseRadius + Math.sin(time * p.wobbleSpeed + p.wobblePhase) * 12;

          p.x = cx + Math.cos(p.angle) * p.currentRadius;
          p.y = cy + Math.sin(p.angle) * (p.currentRadius * 0.72);
          p.scale = 1 + Math.sin(time * 0.003 + p.wobblePhase) * 0.05;
          p.opacity = 1;

          const el = document.getElementById(`lucky-photo-${p.id}`);
          if (el) {
            el.style.transform = `translate3d(${p.x - 38}px, ${p.y - 46}px, 0) scale(${p.scale}) rotate(${p.rotation}deg)`;
            el.style.opacity = '1';
            el.style.zIndex = `${10 + p.ringIndex}`;
          }
        });
      } else {
        // --- 2. ACTIVE SCANNING: HIGH-SPEED VORTEX & SHUFFLE & DECELERATION ---
        const elapsed = Date.now() - scanStartTimeRef.current;
        const progress = Math.min(1, elapsed / totalDurationMs);
        const winnerStudent = targetWinnerRef.current;

        // Dynamic Speed Curve:
        // 0 -> 0.35: Tăng tốc cực nhanh (Acceleration vortex)
        // 0.35 -> 0.70: Tốc độ xáo trộn tối đa (Peak vortex swirl)
        // 0.70 -> 0.94: Giảm tốc kịch tính (Dramatic deceleration)
        // 0.94 -> 1.00: Khóa mục tiêu (Target lock-on)
        let angularVelocity = 0.02;
        let vortexBreathing = 0;

        if (progress < 0.35) {
          // Phase 1: Tăng tốc chóng mặt
          const pNorm = progress / 0.35;
          angularVelocity = 0.02 + pNorm * 0.11;
          vortexBreathing = Math.sin(pNorm * Math.PI * 3) * 35;
          setScanPhaseText('🚀 TĂNG TỐC XÁO TRỘN...');
        } else if (progress < 0.70) {
          // Phase 2: Đảo chiều xoay, xáo trộn hỗn loạn cực mạnh
          angularVelocity = 0.13 + Math.sin(elapsed * 0.008) * 0.03;
          vortexBreathing = Math.sin(elapsed * 0.006) * 50;
          setScanPhaseText('🌪️ ĐANG QUÉT KHUÔN MẶT...');
        } else if (progress < 0.94) {
          // Phase 3: Giảm tốc kịch tính (Ease-out)
          const pDecel = (progress - 0.70) / 0.24;
          const easeOut = Math.pow(1 - pDecel, 2.2);
          angularVelocity = 0.13 * easeOut + 0.006;
          vortexBreathing = (1 - pDecel) * 20;
          setScanPhaseText('🎯 ĐANG KHÓA MỤC TIÊU...');
        } else {
          // Phase 4: Khóa mục tiêu chuẩn xác 100%
          angularVelocity = 0.002;
          vortexBreathing = 0;
          setScanPhaseText('🔒 TARGET LOCKED 100%!');
        }

        // Sound Ticks: Rapid when fast, stretching apart as it slows down
        const tickInterval = progress < 0.70 ? 95 : 95 + (progress - 0.70) * 1200;
        if (time - lastTickTime > tickInterval && progress < 0.95) {
          lastTickTime = time;
          if (isSoundEnabled) {
            playTickSound(700 + (1 - progress) * 350);
          }
        }

        photosRef.current.forEach(p => {
          const isWinner = winnerStudent && p.student.id === winnerStudent.id;

          // Swirl angle
          p.angle += angularVelocity * (p.ringIndex % 2 === 0 ? 1 : -1.1);

          if (isWinner && progress >= 0.65) {
            // WINNER PHOTO: Smoothly pull directly into the center crosshair (cx, cy)!
            const winProgress = (progress - 0.65) / 0.35;
            p.currentRadius = (1 - winProgress) * p.baseRadius;
            p.x = cx + Math.cos(p.angle) * p.currentRadius;
            p.y = cy + Math.sin(p.angle) * (p.currentRadius * 0.72);
            p.scale = 1 + winProgress * 0.65; // Scales up to 1.65x!
            p.opacity = 1;
            p.rotation = (1 - winProgress) * p.rotation;
          } else {
            // OTHER PHOTOS: Swirl with vortex breathing, then push outwards and fade slightly
            if (progress >= 0.75) {
              const fadeOut = (progress - 0.75) / 0.25;
              p.currentRadius = p.baseRadius + fadeOut * 70;
              p.opacity = Math.max(0.25, 1 - fadeOut * 0.75);
              p.scale = Math.max(0.75, 1 - fadeOut * 0.25);
            } else {
              p.currentRadius = Math.max(70, p.baseRadius + vortexBreathing * (p.ringIndex === 0 ? -1 : 1));
              p.opacity = 1;
              p.scale = 0.95 + Math.sin(p.angle * 2) * 0.2;
            }

            p.x = cx + Math.cos(p.angle) * p.currentRadius;
            p.y = cy + Math.sin(p.angle) * (p.currentRadius * 0.72);
          }

          // Apply to DOM
          const el = document.getElementById(`lucky-photo-${p.id}`);
          if (el) {
            el.style.transform = `translate3d(${p.x - 38}px, ${p.y - 46}px, 0) scale(${p.scale}) rotate(${p.rotation}deg)`;
            el.style.opacity = `${p.opacity}`;
            el.style.zIndex = isWinner ? '40' : `${10 + p.ringIndex}`;
          }
        });
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isScanning, stageDimensions, shutterDuration, isSoundEnabled]);

  // Trigger Camera Snapshot Hunting Sequence
  const handleStartCapture = useCallback(() => {
    if (isScanning) return;
    const pool = activeStudents.length > 0 ? activeStudents : allStudents;
    if (pool.length === 0) {
      alert('Tất cả học sinh trong danh sách đã được gọi. Hãy nhấn "Đặt lại danh sách" để tiếp tục.');
      return;
    }

    setIsScanning(true);
    setWinner(null);
    setFlashActive(false);
    setHasAwardedCoins(false);

    // Pick winning student up front & store in ref
    const winningStudent = pool[Math.floor(Math.random() * pool.length)];
    targetWinnerRef.current = winningStudent;
    setFocusedStudent(winningStudent);
    scanStartTimeRef.current = Date.now();

    const totalDurationMs = shutterDuration * 1000;

    // Trigger Finish & Shutter at exactly shutterDuration
    setTimeout(() => {
      // Trigger Mechanical Shutter Sound & Whiteout Flash
      if (isSoundEnabled) {
        playCameraShutterSound();
      }
      setFlashActive(true);

      // Reveal winner & Trigger MASSIVE FIREWORKS!
      setTimeout(() => {
        setWinner(winningStudent);
        setIsScanning(false);
        setFlashActive(false);

        if (isSoundEnabled) {
          playFanfareSound();
        }

        // BẮN PHÁO HOA ĐA TẦNG HOÀNH TRÁNG
        triggerMassiveFireworks();

        // Add to history
        setHistoryList(prev => [
          {
            student: winningStudent,
            time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            points: callMode === 'coins' ? rewardCoins : 0
          },
          ...prev
        ]);

        // Auto exclude if enabled
        if (autoExclude) {
          setExcludedIds(prev => Array.from(new Set([...prev, winningStudent.id])));
        }
      }, 260);
    }, totalDurationMs);
  }, [
    isScanning, activeStudents, allStudents, shutterDuration, 
    isSoundEnabled, autoExclude, callMode, rewardCoins, triggerMassiveFireworks
  ]);

  // Spacebar key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isScanning && !winner) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && target.tagName !== 'SELECT') {
          e.preventDefault();
          handleStartCapture();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isScanning, winner, handleStartCapture]);

  // Award Points Handler
  const handleAwardWinner = (pts: number, reason: string) => {
    if (!winner || hasAwardedCoins) return;

    if (propOnAward) {
      propOnAward([winner.id], pts, reason);
    } else {
      awardPoints([winner.id], pts, reason);
    }

    if (isSoundEnabled) {
      playCoinSound();
    }
    setHasAwardedCoins(true);

    confetti({
      particleCount: 50,
      spread: 70,
      origin: { y: 0.7 }
    });
  };

  // Reset Excluded Students
  const handleResetExclusions = () => {
    setExcludedIds([]);
    setWinner(null);
  };

  // Close Winner Modal
  const handleCloseWinner = () => {
    setWinner(null);
    setHasAwardedCoins(false);
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 animate-in fade-in duration-200">
      
      {/* --- TOP CONTROL BAR --- */}
      <div className="bg-white rounded-3xl p-4 md:p-5 border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 text-white flex items-center justify-center font-black shadow-md shadow-cyan-500/25 shrink-0">
            <Camera className="w-6 h-6 animate-pulse text-cyan-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight uppercase">
                Ống Kính May Mắn • Lucky Camera Lens
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 text-[10px] font-black uppercase">
                Lớp {activeClass?.name || '4A1'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Các bức ảnh xáo trộn xoay vòng kịch tính, nhanh dần rồi chậm dần để bắt trọn gương mặt bạn học sinh may mắn!
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setCallMode('random')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                callMode === 'random' ? 'bg-white text-cyan-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🎲 Ngẫu Nhiên
            </button>
            <button
              type="button"
              onClick={() => setCallMode('coins')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                callMode === 'coins' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🪙 Kèm Thưởng Xu
            </button>
          </div>

          {/* Group Filter */}
          <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-2xl border border-slate-200">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedGroupFilter}
              onChange={(e) => setSelectedGroupFilter(e.target.value)}
              disabled={isScanning}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">Tất cả lớp ({allStudents.length} HS)</option>
              <option value="Tổ 1">Tổ 1</option>
              <option value="Tổ 2">Tổ 2</option>
              <option value="Tổ 3">Tổ 3</option>
              <option value="Tổ 4">Tổ 4</option>
            </select>
          </div>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setIsSoundEnabled(!isSoundEnabled)}
            className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-colors border ${
              isSoundEnabled 
                ? 'bg-slate-100 border-slate-200 text-cyan-700' 
                : 'bg-slate-200 border-slate-300 text-slate-400'
            }`}
            title={isSoundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
          >
            {isSoundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* --- MAIN CAMERA VIEWFINDER STAGE --- */}
      <div 
        ref={stageRef}
        className="w-full h-[540px] sm:h-[600px] bg-slate-950 rounded-3xl border-4 border-slate-800 shadow-2xl relative overflow-hidden flex flex-col justify-between p-4 sm:p-6 select-none"
      >
        {/* Camera Flash Screen (Triggered at moment of snapshot) */}
        {flashActive && (
          <div className="absolute inset-0 bg-white z-50 pointer-events-none animate-in fade-in duration-75" />
        )}

        {/* --- CAMERA HUD HEADER --- */}
        <div className="flex items-center justify-between text-white text-xs font-mono tracking-wider z-30 pointer-events-none">
          {/* Top Left: Recording status & Resolution */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-600/90 text-white font-black text-[11px] shadow-md uppercase">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>REC • 4K 60FPS</span>
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-slate-800/90 text-cyan-400 border border-slate-700 font-bold hidden sm:inline">
              {scanPhaseText}
            </span>
          </div>

          {/* Top Center: Viewfinder Crosshair Status */}
          <div className="hidden md:flex items-center gap-2 text-slate-400 text-[11px] font-bold">
            <span className="text-cyan-400">[ AF-C CONTINUOUS ]</span>
            <span>•</span>
            <span>SHUTTER: 1/1000s</span>
            <span>•</span>
            <span>ISO 400</span>
          </div>

          {/* Top Right: Pool Counter & Battery */}
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl bg-slate-800/90 text-amber-300 border border-slate-700 font-bold text-xs">
              Sẵn sàng: {activeStudents.length} / {groupFiltered.length} HS
            </span>
            <span className="text-emerald-400 font-black hidden sm:inline">
              [▮▮▮▯] 85%
            </span>
          </div>
        </div>

        {/* --- CAMERA VIEWFINDER CORNER BRACKETS --- */}
        <div className="absolute top-4 left-4 w-9 h-9 border-t-3 border-l-3 border-cyan-400/80 rounded-tl-xl pointer-events-none z-20" />
        <div className="absolute top-4 right-4 w-9 h-9 border-t-3 border-r-3 border-cyan-400/80 rounded-tr-xl pointer-events-none z-20" />
        <div className="absolute bottom-4 left-4 w-9 h-9 border-b-3 border-l-3 border-cyan-400/80 rounded-bl-xl pointer-events-none z-20" />
        <div className="absolute bottom-4 right-4 w-9 h-9 border-b-3 border-r-3 border-cyan-400/80 rounded-br-xl pointer-events-none z-20" />

        {/* Rule of Thirds Viewfinder Grid */}
        <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-15 z-10">
          <div className="border-r border-b border-cyan-300" />
          <div className="border-r border-b border-cyan-300" />
          <div className="border-b border-cyan-300" />
          <div className="border-r border-b border-cyan-300" />
          <div className="border-r border-b border-cyan-300" />
          <div className="border-b border-cyan-300" />
          <div className="border-r border-cyan-300" />
          <div className="border-r border-cyan-300" />
          <div />
        </div>

        {/* --- CENTER LENS FOCUS RETICLE (ỐNG KÍNH TRUNG TÂM) --- */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-52 h-52 sm:w-64 sm:h-64 rounded-full border-2 border-dashed pointer-events-none z-20 flex items-center justify-center transition-all duration-300 ${
          isScanning 
            ? 'border-cyan-400 shadow-[0_0_35px_rgba(6,182,212,0.4)] animate-spin [animation-duration:8s]' 
            : 'border-cyan-500/40'
        }`}>
          {/* Inner focus brackets */}
          <div className={`w-36 h-36 sm:w-44 sm:h-44 rounded-full border transition-all flex items-center justify-center ${
            isScanning ? 'border-amber-400/70' : 'border-cyan-400/30'
          }`}>
            <div className="w-5 h-5 rounded-full border-2 border-cyan-300/80 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            </div>
          </div>
        </div>

        {/* Crosshair Horizontal & Vertical Lines */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 sm:w-96 h-0.5 bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent pointer-events-none z-10" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-80 sm:h-96 w-0.5 bg-gradient-to-b from-transparent via-cyan-400/40 to-transparent pointer-events-none z-10" />

        {/* --- DYNAMIC FLOATING STUDENT PHOTO CARDS --- */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {photosRef.current.map(p => {
            const isTarget = isScanning && targetWinnerRef.current?.id === p.student.id;

            return (
              <div
                key={p.id}
                id={`lucky-photo-${p.id}`}
                className="absolute top-0 left-0 transition-transform duration-75 will-change-transform"
                style={{
                  transform: `translate3d(${p.x - 38}px, ${p.y - 46}px, 0) scale(${p.scale}) rotate(${p.rotation}deg)`,
                  opacity: p.opacity
                }}
              >
                {/* Floating Photo Card with Neon Glow */}
                <div 
                  className={`relative rounded-2xl p-1.5 transition-all duration-150 flex flex-col items-center shadow-lg ${
                    isTarget 
                      ? 'ring-4 ring-amber-400 scale-125 z-40 bg-slate-900 border-2 border-amber-300' 
                      : 'bg-slate-900/90 border-2'
                  }`}
                  style={{
                    borderColor: isTarget ? '#fbbf24' : p.color,
                    boxShadow: isTarget 
                      ? `0 0 30px #f59e0b, 0 0 10px #fbbf24` 
                      : `0 4px 14px rgba(0,0,0,0.6)`
                  }}
                >
                  {/* Photo Thumbnail */}
                  <div className="w-13 h-13 sm:w-15 sm:h-15 rounded-xl overflow-hidden bg-slate-800 border border-white/20">
                    <img
                      src={p.student.avatar}
                      alt={p.student.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => handleAvatarImgError(e, p.student.gender, p.student.name)}
                    />
                  </div>

                  {/* Student Name Label Below */}
                  <div className="mt-1 px-1.5 py-0.2 rounded-md bg-slate-950/95 text-white text-[9.5px] font-black truncate max-w-[72px] text-center shadow-xs border border-white/10">
                    {p.student.name}
                  </div>

                  {/* STT Pin */}
                  <div 
                    className="absolute -top-1.5 -left-1.5 w-4.5 h-4.5 rounded-full text-[9px] font-mono font-black text-slate-950 flex items-center justify-center shadow-md border border-white"
                    style={{ backgroundColor: isTarget ? '#fbbf24' : p.color }}
                  >
                    {p.student.stt}
                  </div>

                  {/* Scanning Crosshair overlay if winner */}
                  {isTarget && (
                    <div className="absolute inset-0 border-2 border-dashed border-amber-400 rounded-2xl animate-ping pointer-events-none" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* --- BOTTOM CONTROLS & BIG CAPTURE TRIGGER --- */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 z-30">
          
          {/* Left: Quick Settings Options */}
          <div className="flex items-center gap-3 text-white text-xs font-medium">
            <label className="flex items-center gap-1.5 cursor-pointer bg-slate-900/85 px-3.5 py-2 rounded-xl border border-slate-700/80 hover:bg-slate-800 transition-colors shadow-md">
              <input
                type="checkbox"
                checked={autoExclude}
                onChange={(e) => setAutoExclude(e.target.checked)}
                className="rounded accent-cyan-500 w-4 h-4"
              />
              <span className="text-slate-200 font-bold">Không gọi lại học sinh đã trúng</span>
            </label>

            {excludedIds.length > 0 && (
              <button
                type="button"
                onClick={handleResetExclusions}
                className="text-xs font-black text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-700"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Đặt lại ({excludedIds.length})</span>
              </button>
            )}
          </div>

          {/* Center / Right: BIG SHUTTER BUTTON */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isScanning || activeStudents.length === 0}
              onClick={handleStartCapture}
              className={`px-8 sm:px-10 py-3.5 sm:py-4 rounded-2xl text-xs sm:text-sm font-black tracking-wider text-white flex items-center gap-3 shadow-2xl transition-all duration-200 hover-zoom-btn uppercase disabled:opacity-50 cursor-pointer ${
                isScanning
                  ? 'bg-gradient-to-r from-amber-500 via-orange-600 to-rose-600 animate-pulse shadow-orange-500/50'
                  : 'bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-cyan-500/40 ring-4 ring-cyan-500/30'
              }`}
            >
              <Camera className={`w-5 h-5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'ĐANG SĂN TÌM MỤC TIÊU...' : 'BẤM MÁY CHỤP NGẪU NHIÊN'}</span>
            </button>
          </div>

        </div>

      </div>

      {/* --- RECENT SNAPSHOTS FILMSTRIP (DẢI PHIM HỌC SINH ĐÃ CHỤP) --- */}
      {historyList.length > 0 && (
        <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <strong className="text-xs font-black uppercase text-slate-800">
                Dải Phim Học Sinh Đã Lọt Ống Kính ({historyList.length} em)
              </strong>
            </div>
            <button
              type="button"
              onClick={() => setHistoryList([])}
              className="text-[11px] font-bold text-slate-400 hover:text-slate-600"
            >
              Xóa lịch sử
            </button>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto pb-1">
            {historyList.map((item, idx) => (
              <div 
                key={`${item.student.id}-${idx}`}
                className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-50 border border-slate-200 shrink-0"
              >
                <div className="w-7 h-7 rounded-lg overflow-hidden border border-slate-300 bg-white">
                  <img
                    src={item.student.avatar}
                    alt={item.student.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-black text-slate-800 block truncate max-w-[110px]">
                    {item.student.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    #{item.student.stt} • {item.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* --- POLAROID WINNER SPOTLIGHT MODAL (BỨC ẢNH VÀNG CỦA TIẾT HỌC) ---     */}
      {/* ========================================================================= */}
      {winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border-4 border-amber-400 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 relative">
            
            {/* Header */}
            <div className="px-6 py-3.5 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-amber-200 animate-bounce" />
                <h3 className="text-sm font-black uppercase tracking-tight">
                  Bắt Trọn Ống Kính May Mắn!
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseWinner}
                className="w-7 h-7 rounded-xl bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Polaroid Body */}
            <div className="p-6 text-center space-y-4">
              
              {/* 3D Polaroid Card */}
              <div className="mx-auto w-64 p-3.5 pb-5 bg-white rounded-2xl shadow-2xl border border-slate-200 ring-4 ring-amber-200 transform -rotate-2 hover:rotate-0 transition-transform duration-300">
                {/* Photo frame */}
                <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-900 border-2 border-slate-200 shadow-inner relative">
                  <img
                    src={winner.avatar}
                    alt={winner.name}
                    className="w-full h-full object-cover"
                    onError={(e) => handleAvatarImgError(e, winner.gender, winner.name)}
                  />
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[9px] font-black uppercase shadow-xs">
                    POLAROID 4K
                  </div>
                </div>

                {/* Polaroid Signature footer */}
                <div className="mt-3 text-center">
                  <h4 className="text-lg font-black text-slate-900 tracking-tight">
                    {winner.name}
                  </h4>
                  <p className="text-xs font-bold text-slate-500">
                    STT: #{winner.stt} • {winner.group || 'Tổ 1'} • {winner.gender || 'Nam'}
                  </p>
                </div>
              </div>

              {/* Congratulations text */}
              <p className="text-xs text-slate-600 font-medium max-w-sm mx-auto">
                Xin chúc mừng <strong className="text-slate-900">{winner.name}</strong> đã được ống kính máy ảnh bắt trọn gương mặt tỏa sáng trong tiết học!
              </p>

              {/* Award Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={hasAwardedCoins}
                  onClick={() => handleAwardWinner(2, 'Ống kính may mắn')}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-black shadow-md shadow-amber-500/20 transition-all hover-zoom-btn flex items-center gap-1.5 disabled:opacity-50 uppercase"
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span>+2 Xu Thưởng</span>
                </button>

                <button
                  type="button"
                  disabled={hasAwardedCoins}
                  onClick={() => handleAwardWinner(3, 'Ống kính may mắn xuất sắc')}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-500/20 transition-all hover-zoom-btn flex items-center gap-1.5 disabled:opacity-50 uppercase"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>+3 Xu Khen Thưởng</span>
                </button>

                <button
                  type="button"
                  disabled={hasAwardedCoins}
                  onClick={() => handleAwardWinner(5, 'Ngôi sao ống kính may mắn')}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-purple-600/20 transition-all hover-zoom-btn flex items-center gap-1.5 disabled:opacity-50 uppercase"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  <span>+5 Xu Ngôi Sao</span>
                </button>
              </div>

              {/* Close & Continue Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleCloseWinner}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black shadow-lg transition-colors uppercase"
                >
                  Tiếp Tục Chụp Em Khác
                </button>
              </div>

            </div>

          </div>
        </div>
      )}



    </div>
  );
};
