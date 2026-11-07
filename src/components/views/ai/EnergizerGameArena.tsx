import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Play, Pause, Square, RotateCcw, ArrowLeft, Award, Users, User, 
  Sparkles, CheckCircle2, Clock, Volume2, VolumeX, Shuffle, Check, Flame, Trophy,
  Music, Heart, Gift, Wind, Smile, Hourglass, Bell
} from 'lucide-react';
import { Student } from '../../../types';
import { playPointClink, playFanfare, playTimerAlarm, playApplauseSound } from '../../../utils/audio';
import { 
  startEnergizerBgm, stopEnergizerBgm, setEnergizerMuted, getEnergizerMuted,
  playClapSound, playZenSingingBowl, playMysteryBoxOpenSound, 
  playWindWhooshSound, playComplimentHeartChime, playSandHourglassTick 
} from '../../../utils/energizerAudio';
import confetti from 'canvas-confetti';

export interface EnergizerGame {
  id: string;
  title: string;
  duration: string;
  durationSeconds: number;
  benefit: string;
  rules: string;
  tips?: string;
  icon?: string;
}

interface EnergizerGameArenaProps {
  game: EnergizerGame;
  onBack: () => void;
  classStudents: Student[];
  activeClassName?: string;
  awardPoints: (studentIds: string[], amount: number, reason: string, subjectName?: string) => void;
}

interface AwardRecord {
  id: string;
  type: 'class' | 'group' | 'student';
  title: string;
  amount: number;
  count: number;
  timestamp: string;
}

export const EnergizerGameArena: React.FC<EnergizerGameArenaProps> = ({
  game,
  onBack,
  classStudents,
  activeClassName = 'Lớp học',
  awardPoints,
}) => {
  // Timer States
  const [timeLeft, setTimeLeft] = useState<number>(game.durationSeconds);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => getEnergizerMuted());

  // Interactive Game Stage States
  const [clappingStep, setClappingStep] = useState<number>(1);
  const [isBoxOpen, setIsBoxOpen] = useState<boolean>(false);
  const [boxRewardText, setBoxRewardText] = useState<string>('');
  const [windPromptText, setWindPromptText] = useState<string>('Thổi những bạn mang áo trắng đổi chỗ cho nhau!');
  const [complimentCardText, setComplimentCardText] = useState<string>('Bạn là người bạn luôn nhiệt tình giúp đỡ mọi người!');
  const [sandGrains, setSandGrains] = useState<number>(100);

  // Coin Awarding Configuration
  const [selectedCoinAmount, setSelectedCoinAmount] = useState<number>(3);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(classStudents[0]?.id || '');
  
  // Awarding Session History
  const [awardHistory, setAwardHistory] = useState<AwardRecord[]>([]);
  const [recentlyAwardedText, setRecentlyAwardedText] = useState<string | null>(null);

  // Stop BGM when unmounting
  useEffect(() => {
    return () => {
      stopEnergizerBgm();
    };
  }, []);

  // Sync BGM with running state
  useEffect(() => {
    if (isRunning && !isMuted && !isFinished) {
      startEnergizerBgm();
    } else {
      stopEnergizerBgm();
    }
  }, [isRunning, isMuted, isFinished]);

  // Group students into Tổ 1, Tổ 2, Tổ 3, Tổ 4
  const groups = useMemo(() => {
    const map: Record<string, Student[]> = {
      'Tổ 1': [],
      'Tổ 2': [],
      'Tổ 3': [],
      'Tổ 4': [],
    };

    classStudents.forEach((s) => {
      let g = s.group?.trim();
      if (!g || !map[g]) {
        const grpNum = ((s.stt - 1) % 4) + 1;
        g = `Tổ ${grpNum}`;
      }
      if (!map[g]) {
        map[g] = [];
      }
      map[g].push(s);
    });

    return map;
  }, [classStudents]);

  // Total coins awarded in this specific game session
  const totalCoinsAwarded = useMemo(() => {
    return awardHistory.reduce((sum, item) => sum + item.amount * item.count, 0);
  }, [awardHistory]);

  const uniqueStudentsAwardedCount = useMemo(() => {
    const studentIdSet = new Set<string>();
    awardHistory.forEach(item => {
      if (item.type === 'class') {
        classStudents.forEach(s => studentIdSet.add(s.id));
      } else if (item.type === 'group') {
        const grp = groups[item.title];
        if (grp) grp.forEach(s => studentIdSet.add(s.id));
      } else if (item.type === 'student') {
        const found = classStudents.find(s => s.name === item.title);
        if (found) studentIdSet.add(found.id);
      }
    });
    return studentIdSet.size;
  }, [awardHistory, classStudents, groups]);

  // Timer Tick Interval
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isRunning && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            // Timer Finished
            setIsRunning(false);
            setIsFinished(true);
            stopEnergizerBgm();
            playTimerAlarm();
            setTimeout(() => {
              playApplauseSound();
              confetti({ particleCount: 75, spread: 85, origin: { y: 0.55 } });
            }, 300);
            return 0;
          }
          // Special sound for 10s hourglass game
          if (game.id === 'game-6' && prev <= 10) {
            playSandHourglassTick();
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRunning, timeLeft, game.id]);

  // Format MM:SS
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Toggle Mute
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    setEnergizerMuted(nextMuted);
    if (nextMuted) {
      stopEnergizerBgm();
    } else if (isRunning && !isFinished) {
      startEnergizerBgm();
    }
  };

  // Timer Controls
  const handleStart = () => {
    if (timeLeft === 0) {
      setTimeLeft(game.durationSeconds);
      setIsFinished(false);
    }
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
    stopEnergizerBgm();
  };

  const handleFinish = () => {
    setIsRunning(false);
    setIsFinished(true);
    stopEnergizerBgm();
    playApplauseSound();
    confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 } });
  };

  const handleReset = () => {
    setIsRunning(false);
    setIsFinished(false);
    stopEnergizerBgm();
    setTimeLeft(game.durationSeconds);
  };

  // 1. Tặng xu cho CẢ LỚP
  const handleAwardWholeClass = () => {
    if (classStudents.length === 0) return;
    const studentIds = classStudents.map(s => s.id);
    awardPoints(
      studentIds,
      selectedCoinAmount,
      `Tham gia tích cực trò chơi nạp năng lượng: ${game.title}`,
      'HOẠT ĐỘNG TRẢI NGHIỆM'
    );

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    setAwardHistory(prev => [
      {
        id: `rec-${Date.now()}`,
        type: 'class',
        title: `Cả lớp (${activeClassName})`,
        amount: selectedCoinAmount,
        count: classStudents.length,
        timestamp: timeStr,
      },
      ...prev,
    ]);

    setRecentlyAwardedText(`🎉 Đã cộng +${selectedCoinAmount} xu cho tất cả ${classStudents.length} học sinh cả lớp!`);
    playFanfare();
    confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
    setTimeout(() => setRecentlyAwardedText(null), 3500);
  };

  // 2. Tặng xu cho NHÓM / TỔ
  const handleAwardGroup = (groupName: string) => {
    const groupStudents = groups[groupName] || [];
    if (groupStudents.length === 0) return;
    const studentIds = groupStudents.map(s => s.id);

    awardPoints(
      studentIds,
      selectedCoinAmount,
      `Xuất sắc trong trò chơi nạp năng lượng: ${game.title}`,
      'HOẠT ĐỘNG TRẢI NGHIỆM'
    );

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    setAwardHistory(prev => [
      {
        id: `rec-${Date.now()}`,
        type: 'group',
        title: groupName,
        amount: selectedCoinAmount,
        count: groupStudents.length,
        timestamp: timeStr,
      },
      ...prev,
    ]);

    setRecentlyAwardedText(`⭐ Đã cộng +${selectedCoinAmount} xu cho ${groupName} (${groupStudents.length} học sinh)!`);
    playPointClink();
    confetti({ particleCount: 35, spread: 55, origin: { y: 0.65 } });
    setTimeout(() => setRecentlyAwardedText(null), 3500);
  };

  // 3. Tặng xu cho HỌC SINH CỤ THỂ
  const handleAwardStudent = () => {
    const target = classStudents.find(s => s.id === selectedStudentId);
    if (!target) return;

    awardPoints(
      [target.id],
      selectedCoinAmount,
      `Tuyên dương phản xạ xuất sắc trong trò chơi: ${game.title}`,
      'HOẠT ĐỘNG TRẢI NGHIỆM'
    );

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    setAwardHistory(prev => [
      {
        id: `rec-${Date.now()}`,
        type: 'student',
        title: target.name,
        amount: selectedCoinAmount,
        count: 1,
        timestamp: timeStr,
      },
      ...prev,
    ]);

    setRecentlyAwardedText(`🪙 Đã thưởng +${selectedCoinAmount} xu cho em #${target.stt} - ${target.name}!`);
    playPointClink();
    setTimeout(() => setRecentlyAwardedText(null), 3500);
  };

  // Chọn ngẫu nhiên 1 bạn để tuyên dương hoặc gọi lên làm mẫu
  const handlePickRandomStudent = () => {
    if (classStudents.length === 0) return;
    const rand = classStudents[Math.floor(Math.random() * classStudents.length)];
    setSelectedStudentId(rand.id);
    playPointClink();
  };

  // Progress percentage
  const progressPercent = Math.max(0, Math.min(100, (timeLeft / (game.durationSeconds || 1)) * 100));

  // Game-Specific Interactive Actions
  // 1. Clapping trigger
  const handleTriggerClap = (step: number) => {
    setClappingStep(step);
    playClapSound(step === 1 ? 1 : step === 2 ? 2 : 3);
  };

  // 2. Zen Bowl trigger
  const handleTriggerZenBowl = () => {
    playZenSingingBowl();
  };

  // 3. Mystery Box trigger
  const handleTriggerMysteryBox = () => {
    setIsBoxOpen(true);
    playMysteryBoxOpenSound();
    confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
    const surprises = [
      '🎉 BÍ MẬT 1: Tổ nào đồng thanh hô to "LỚP HỌC HẠNH PHÚC" nhận ngay +3 xu!',
      '⭐ BÍ MẬT 2: Mời 1 bạn xung phong kể 1 việc tốt vừa làm hôm nay để nhận +5 xu!',
      '🎁 BÍ MẬT 3: Cả lớp cùng đứng lên vỗ tay nhịp nhàng 3 cái nhận ngay +2 xu cả lớp!',
      '💎 BÍ MẬT 4: Mời bạn có số thứ tự may mắn lên mở quà nhận +5 xu thi đua!',
    ];
    setBoxRewardText(surprises[Math.floor(Math.random() * surprises.length)]);
  };

  // 4. Wind trigger
  const handleTriggerWind = () => {
    playWindWhooshSound();
    const windCommands = [
      'Gió thổi! Gió thổi những bạn mang áo trắng đổi chỗ cho nhau! 💨',
      'Gió thổi! Gió thổi các bạn sinh vào tháng chẵn bắt tay bạn ngồi cạnh! 🍃',
      'Gió thổi! Gió thổi những bạn đeo đồng hồ hoặc mang giày thể thao vẫy tay thật cao! 💨',
      'Gió thổi! Gió thổi tất cả các bạn có nụ cười rạng rỡ nở nụ cười thật tươi! 😄',
    ];
    setWindPromptText(windCommands[Math.floor(Math.random() * windCommands.length)]);
  };

  // 5. Compliment trigger
  const handleTriggerCompliment = () => {
    playComplimentHeartChime();
    const compliments = [
      '💌 "Cảm ơn bạn đã luôn nhiệt tình chia sẻ đồ dùng học tập cùng tớ!"',
      '💌 "Nụ cười rạng rỡ của bạn giúp cả lớp mình luôn tràn ngập năng lượng!"',
      '💌 "Bạn là người bạn luôn biết lắng nghe và chân thành nhất của tớ!"',
      '💌 "Tớ rất khâm phục sự chăm chỉ và cố gắng của bạn trong mỗi giờ học!"',
    ];
    setComplimentCardText(compliments[Math.floor(Math.random() * compliments.length)]);
  };

  // Render Game-Specific Graphics & Thematic Interactive Element
  const renderGameThemeGraphics = () => {
    switch (game.id) {
      case 'game-1': // Vỗ tay theo nhịp Hạnh Phúc
        return (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-900 flex items-center gap-1.5 uppercase">
                <Music className="w-4 h-4 text-amber-600" />
                Đồ họa nhịp điệu & Tiếng vỗ tay
              </span>
              <span className="text-[11px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-lg">
                Nhịp {clappingStep}
              </span>
            </div>

            {/* Visual Graphic Representation */}
            <div className="p-3.5 bg-white rounded-xl border border-amber-100 flex items-center justify-around text-center">
              <div className={`p-2.5 rounded-2xl transition-all ${clappingStep === 1 ? 'bg-amber-100 ring-2 ring-amber-400 scale-105' : 'bg-slate-50'}`}>
                <div className="text-2xl">👏</div>
                <div className="text-[11px] font-black text-slate-800 mt-1">Nhịp 1</div>
                <div className="text-[10px] text-slate-500">Đứng lên vỗ 2 cái</div>
              </div>

              <div className="text-xl font-black text-amber-400">➔</div>

              <div className={`p-2.5 rounded-2xl transition-all ${clappingStep === 2 ? 'bg-amber-100 ring-2 ring-amber-400 scale-105' : 'bg-slate-50'}`}>
                <div className="text-2xl">😄</div>
                <div className="text-[11px] font-black text-slate-800 mt-1">Nhịp 2</div>
                <div className="text-[10px] text-slate-500">Cười HA HA!</div>
              </div>

              <div className="text-xl font-black text-amber-400">➔</div>

              <div className={`p-2.5 rounded-2xl transition-all ${clappingStep === 3 ? 'bg-amber-100 ring-2 ring-amber-400 scale-105' : 'bg-slate-50'}`}>
                <div className="text-2xl">🎉</div>
                <div className="text-[11px] font-black text-slate-800 mt-1">Nhịp 3</div>
                <div className="text-[10px] text-slate-500">Hô "Hạnh Phúc"</div>
              </div>
            </div>

            {/* Interactive Clapping Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleTriggerClap(1)}
                className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-xs hover-zoom-btn flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>👏 Gõ Nhịp 1</span>
              </button>
              <button
                type="button"
                onClick={() => handleTriggerClap(2)}
                className="flex-1 py-2 px-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black shadow-xs hover-zoom-btn flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>😄 Gõ Nhịp 2</span>
              </button>
              <button
                type="button"
                onClick={() => handleTriggerClap(3)}
                className="flex-1 py-2 px-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-black shadow-xs hover-zoom-btn flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>🎉 Gõ Nhịp 3</span>
              </button>
            </div>
          </div>
        );

      case 'game-2': // Bức tượng tĩnh lặng
        return (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-teal-900 flex items-center gap-1.5 uppercase">
                <Bell className="w-4 h-4 text-teal-600" />
                Đồ họa Thiền Tĩnh Lặng & Chuông Định Tâm
              </span>
              <span className="text-[11px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-lg">
                100% Yên Tĩnh
              </span>
            </div>

            {/* Zen Statue Visual Graphic */}
            <div className="p-4 bg-white rounded-xl border border-teal-100 flex items-center gap-3.5 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center text-3xl shadow-inner shrink-0">
                🧘‍♂️
              </div>
              <div className="space-y-1">
                <div className="text-xs font-black text-slate-800">
                  Thử thách "Bức tượng tĩnh lặng 60 giây"
                </div>
                <div className="text-[11px] text-slate-600 leading-snug">
                  Cả lớp giữ bất động như tượng đá, hít thở sâu và cảm nhận sự êm dịu của lớp học.
                </div>
              </div>
            </div>

            {/* Sound Button */}
            <button
              type="button"
              onClick={handleTriggerZenBowl}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black shadow-xs hover-zoom-btn flex items-center justify-center gap-2 cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              <span>GÕ CHUÔNG TĨNH TÂM THIỀN ĐỊNH 🔔</span>
            </button>
          </div>
        );

      case 'game-3': // Vòng quay "Chiếc hộp bí mật"
        return (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-purple-900 flex items-center gap-1.5 uppercase">
                <Gift className="w-4 h-4 text-purple-600" />
                Đồ họa Hộp Quà Ma Thuật 3D
              </span>
              <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-lg">
                Bí Mật Bất Ngờ
              </span>
            </div>

            {/* Gift Box Graphic */}
            <div className="p-4 bg-white rounded-xl border border-purple-100 flex flex-col sm:flex-row items-center gap-3.5 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-500 to-pink-500 text-white flex items-center justify-center text-3xl shadow-md shrink-0">
                🎁
              </div>
              <div className="space-y-1 text-center sm:text-left flex-1">
                <div className="text-xs font-black text-purple-900">
                  {isBoxOpen ? '✨ HỘP QUÀ ĐÃ MỞ BÍ MẬT:' : 'Hộp quà ma thuật đang chờ Thầy/Cô mở:'}
                </div>
                <div className="text-[11px] text-slate-700 font-semibold leading-snug">
                  {boxRewardText || 'Nhấn nút bên dưới để mở điều bí mật dành cho học sinh trong tiết học!'}
                </div>
              </div>
            </div>

            {/* Open Box Button */}
            <button
              type="button"
              onClick={handleTriggerMysteryBox}
              className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl text-xs font-black shadow-xs hover-zoom-btn flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>MỞ HỘP QUÀ BÍ MẬT NGAY 🎁</span>
            </button>
          </div>
        );

      case 'game-4': // Trò chơi "Gió thổi - Gió thổi"
        return (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-cyan-900 flex items-center gap-1.5 uppercase">
                <Wind className="w-4 h-4 text-cyan-600" />
                Đồ họa Cơn Gió Vui Nhộn & Lá Rơi
              </span>
              <span className="text-[11px] font-bold text-cyan-700 bg-cyan-100 px-2 py-0.5 rounded-lg">
                Phản Xạ Nhanh
              </span>
            </div>

            {/* Wind Graphic Display */}
            <div className="p-4 bg-white rounded-xl border border-cyan-100 flex items-center gap-3.5 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500 text-white flex items-center justify-center text-3xl shadow-md shrink-0">
                💨
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-bold text-cyan-700 uppercase">Khẩu lệnh của giáo viên:</div>
                <div className="text-xs font-black text-slate-900 leading-snug">
                  {windPromptText}
                </div>
              </div>
            </div>

            {/* Change Wind Prompt Button */}
            <button
              type="button"
              onClick={handleTriggerWind}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-black shadow-xs hover-zoom-btn flex items-center justify-center gap-2 cursor-pointer"
            >
              <Wind className="w-4 h-4" />
              <span>TẠO LỆNH "GIÓ THỔI" MỚI VÀ HIỆU ỨNG GIÓ 🍃</span>
            </button>
          </div>
        );

      case 'game-5': // Bức thư "Lời khen giấu tên"
        return (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-50 to-red-50 border border-rose-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-rose-900 flex items-center gap-1.5 uppercase">
                <Heart className="w-4 h-4 text-rose-600" />
                Đồ họa Phong Thư Trái Tim Ấm Áp
              </span>
              <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-lg">
                Tình Bạn Hạnh Phúc
              </span>
            </div>

            {/* Letter Envelope Graphic */}
            <div className="p-4 bg-white rounded-xl border border-rose-100 flex items-center gap-3.5 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-rose-500 text-white flex items-center justify-center text-3xl shadow-md shrink-0">
                💌
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-bold text-rose-700 uppercase">Lời khen ấm áp mẫu:</div>
                <div className="text-xs font-bold text-slate-800 italic leading-snug">
                  {complimentCardText}
                </div>
              </div>
            </div>

            {/* New Compliment Button */}
            <button
              type="button"
              onClick={handleTriggerCompliment}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-xs hover-zoom-btn flex items-center justify-center gap-2 cursor-pointer"
            >
              <Heart className="w-4 h-4" />
              <span>GỢI Ý LỜI KHEN MỚI & TIẾNG ĐÀN HARP 💖</span>
            </button>
          </div>
        );

      case 'game-6': // Thử thách "Đồng hồ cát 10 giây"
        return (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-yellow-50 to-amber-50 border border-amber-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-900 flex items-center gap-1.5 uppercase">
                <Hourglass className="w-4 h-4 text-amber-600" />
                Đồ họa Đồng Hồ Cát Chảy Nhanh
              </span>
              <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg">
                Tác Phong Nhanh Gọn
              </span>
            </div>

            {/* Hourglass Graphic */}
            <div className="p-4 bg-white rounded-xl border border-amber-100 flex items-center gap-3.5 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-3xl shadow-md shrink-0">
                ⏳
              </div>
              <div className="space-y-1">
                <div className="text-xs font-black text-slate-900">
                  Thử thách tác phong 10 giây:
                </div>
                <div className="text-[11px] text-slate-600 leading-snug">
                  1. Cất sách vở cũ • 2. Lấy sách vở mới • 3. Ngồi ngay ngắn trước tiếng chuông!
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                playSandHourglassTick();
                handleStart();
              }}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black shadow-xs hover-zoom-btn flex items-center justify-center gap-2 cursor-pointer"
            >
              <Hourglass className="w-4 h-4" />
              <span>BẮT ĐẦU ĐẾM 10 GIÂY VÀ TIẾNG TÍCH TẮC ⚡</span>
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
        <button
          type="button"
          onClick={() => {
            stopEnergizerBgm();
            onBack();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all hover-zoom-btn w-fit cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Danh Sách Trò Chơi</span>
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Audio BGM Toggle Button */}
          <button
            type="button"
            onClick={handleToggleMute}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all hover-zoom-btn cursor-pointer ${
              !isMuted
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            title={!isMuted ? 'Tắt nhạc nền' : 'Bật nhạc nền sôi nổi'}
          >
            {!isMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span>{!isMuted ? 'Nhạc nền: ĐANG BẬT 🎵' : 'Nhạc nền: TẮT 🔇'}</span>
          </button>

          <span className="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-emerald-600" />
            ĐANG CHƠI TRÒ CHƠI NẠP NĂNG LƯỢNG
          </span>

          <span className="text-xs font-semibold text-slate-600">
            Lớp: <strong className="text-blue-700">{activeClassName}</strong> ({classStudents.length} học sinh)
          </span>
        </div>
      </div>

      {/* RESULT MODAL / BANNER KHI KẾT THÚC TRÒ CHƠI */}
      {isFinished && (
        <div className="p-6 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white rounded-3xl shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 shadow-inner">
                <Trophy className="w-8 h-8 text-yellow-200" />
              </div>
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-yellow-100 text-[10px] font-black uppercase">
                  Hoàn Thành Trò Chơi 5 Phút
                </span>
                <h2 className="text-xl md:text-2xl font-black tracking-tight mt-0.5">
                  TỔNG KẾT KẾT QUẢ: {game.title.toUpperCase()}
                </h2>
                <p className="text-xs md:text-sm text-yellow-100 font-medium">
                  Cả lớp đã hoàn thành trọn vẹn thử thách nạp năng lượng tràn đầy tiếng cười và hào hứng!
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2.5 bg-white text-slate-900 rounded-xl text-xs font-black shadow-md hover-zoom-btn flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-amber-600" />
                <span>Chơi Lại Trò Này</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  stopEnergizerBgm();
                  onBack();
                }}
                className="px-4 py-2.5 bg-black/20 hover:bg-black/30 text-white rounded-xl text-xs font-black border border-white/20 hover-zoom-btn cursor-pointer"
              >
                Đổi Trò Chơi Khác
              </button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3.5 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20">
              <div className="text-[11px] text-yellow-200 font-bold uppercase">Tổng xu đã tặng trong lượt chơi</div>
              <div className="text-2xl font-black text-white mt-0.5">+{totalCoinsAwarded} xu</div>
              <div className="text-[10px] text-yellow-100 mt-0.5">Đã cập nhật trực tiếp vào hệ thống</div>
            </div>

            <div className="p-3.5 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20">
              <div className="text-[11px] text-yellow-200 font-bold uppercase">Số học sinh được vinh danh</div>
              <div className="text-2xl font-black text-white mt-0.5">{uniqueStudentsAwardedCount} / {classStudents.length} bạn</div>
              <div className="text-[10px] text-yellow-100 mt-0.5">Tạo động lực thi đua tự giác</div>
            </div>

            <div className="p-3.5 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20">
              <div className="text-[11px] text-yellow-200 font-bold uppercase">Tổng số lượt tặng xu</div>
              <div className="text-2xl font-black text-white mt-0.5">{awardHistory.length} lượt</div>
              <div className="text-[10px] text-yellow-100 mt-0.5">Ghi nhận minh bạch vào sổ thi đua</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Arena: Left Timer & Rules, Right Coin Awarding Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Game Title, Thematic Graphics, Countdown Timer & Controls */}
        <div className="lg:col-span-5 space-y-5">
          {/* Game Title & Rules Card */}
          <div className="p-5 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-[11px] font-black">
                ⏱️ Thời lượng chuẩn: {game.duration}
              </span>
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Nạp Năng Lượng Tức Thì
              </span>
            </div>

            <div>
              <h2 className="text-lg md:text-xl font-black text-slate-900 leading-snug">
                {game.title}
              </h2>
              <p className="text-xs text-blue-600 font-semibold mt-1">
                🎯 {game.benefit}
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Luật chơi chi tiết:</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                {game.rules}
              </p>
            </div>
          </div>

          {/* THEMATIC GRAPHICS & INTERACTIVE GAME WIDGET */}
          {renderGameThemeGraphics()}

          {/* Countdown Timer Display & Controls */}
          <div className="p-6 bg-gradient-to-b from-slate-900 to-slate-950 text-white rounded-3xl shadow-lg space-y-5 text-center">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Thời Gian Đếm Ngược
            </div>

            {/* Digital Clock */}
            <div className="py-2">
              <div className={`font-mono text-5xl md:text-6xl font-black tracking-wider transition-colors ${
                timeLeft <= 10 && timeLeft > 0 ? 'text-rose-400 animate-pulse' : 'text-amber-300'
              }`}>
                {formatTime(timeLeft)}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {isRunning ? (
                  <span className="text-emerald-400 font-semibold flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Trò chơi đang diễn ra sôi nổi 🎵
                  </span>
                ) : isFinished ? (
                  <span className="text-amber-400 font-bold">Đã hoàn thành thời gian trò chơi</span>
                ) : (
                  <span>Sẵn sàng bấm BẮT ĐẦU</span>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-400 to-yellow-500 h-2.5 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Timer Control Action Buttons */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {/* Nút BẮT ĐẦU */}
              <button
                type="button"
                onClick={handleStart}
                disabled={isRunning}
                className="py-3 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs md:text-sm flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30 hover-zoom-btn disabled:opacity-40 transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Bắt Đầu</span>
              </button>

              {/* Nút TẠM DỪNG */}
              <button
                type="button"
                onClick={handlePause}
                disabled={!isRunning}
                className="py-3 px-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs md:text-sm flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/30 hover-zoom-btn disabled:opacity-40 transition-all cursor-pointer"
              >
                <Pause className="w-4 h-4 fill-slate-950" />
                <span>Tạm Dừng</span>
              </button>

              {/* Nút KẾT THÚC */}
              <button
                type="button"
                onClick={handleFinish}
                disabled={isFinished}
                className="py-3 px-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs md:text-sm flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/30 hover-zoom-btn disabled:opacity-40 transition-all cursor-pointer"
              >
                <Square className="w-4 h-4 fill-white" />
                <span>Kết Thúc</span>
              </button>
            </div>

            {/* Quick Adjustment Options */}
            <div className="flex items-center justify-center gap-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400">
              <span>Chỉnh giờ:</span>
              <button
                type="button"
                onClick={() => setTimeLeft(prev => prev + 30)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg hover-zoom-btn"
              >
                +30s
              </button>
              <button
                type="button"
                onClick={() => setTimeLeft(prev => Math.max(0, prev - 30))}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg hover-zoom-btn"
              >
                -30s
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg hover-zoom-btn flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Đặt lại
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Coin Awarding Panel (Cả lớp, Nhóm/Tổ, Học sinh) */}
        <div className="lg:col-span-7 space-y-5">
          <div className="p-5 md:p-6 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-5">
            {/* Header of Coin Reward Panel */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
              <div>
                <h3 className="text-sm md:text-base font-black text-slate-900 flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" />
                  Khen Thưởng Xu Thi Đua Trực Tiếp
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cập nhật ngay vào bảng điểm thi đua và sổ theo dõi của lớp
                </p>
              </div>

              {/* Coin Amount Selector */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <span className="text-[11px] font-bold text-slate-600 px-2">Mức xu:</span>
                {[1, 2, 3, 5, 10].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSelectedCoinAmount(amt)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      selectedCoinAmount === amt
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    +{amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Notification alert when awarded */}
            {recentlyAwardedText && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs md:text-sm font-bold flex items-center gap-2 shadow-xs animate-bounce">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{recentlyAwardedText}</span>
              </div>
            )}

            {/* SECTION 1: TẶNG XU CHO CẢ LỚP */}
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50/60 rounded-2xl border border-blue-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-blue-900 flex items-center gap-1.5 uppercase">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  1. Tặng Xu Cho Cả Lớp
                </span>
                <span className="text-xs text-blue-700 font-semibold">
                  Sĩ số: {classStudents.length} học sinh
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Thưởng đồng loạt cho tinh thần hào hứng và sự tham gia 100% của cả tập thể lớp.
              </p>
              <button
                type="button"
                onClick={handleAwardWholeClass}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs md:text-sm font-black flex items-center justify-center gap-2 shadow-md shadow-blue-500/25 hover-zoom-btn transition-all cursor-pointer"
              >
                <Award className="w-4 h-4" />
                <span>TẶNG +{selectedCoinAmount} XU CHO CẢ LỚP ({classStudents.length} HỌC SINH)</span>
              </button>
            </div>

            {/* SECTION 2: TẶNG XU CHO NHÓM / TỔ */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5 uppercase">
                  <Users className="w-4 h-4 text-indigo-600" />
                  2. Tặng Xu Cho Nhóm / Tổ Thi Đua
                </span>
                <span className="text-[11px] text-slate-500">Bấm nút để thưởng nhanh cho tổ</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {['Tổ 1', 'Tổ 2', 'Tổ 3', 'Tổ 4'].map((grpName) => {
                  const grpMembers = groups[grpName] || [];
                  return (
                    <button
                      key={grpName}
                      type="button"
                      onClick={() => handleAwardGroup(grpName)}
                      className="p-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-2xl text-center space-y-1 hover-zoom-card transition-all cursor-pointer"
                    >
                      <div className="text-xs font-black text-slate-800">{grpName}</div>
                      <div className="text-[11px] text-slate-500 font-medium">{grpMembers.length} học sinh</div>
                      <div className="pt-1 text-[11px] font-black text-indigo-600">
                        +{selectedCoinAmount} xu / bạn
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION 3: TẶNG XU CHO HỌC SINH CỤ THỂ */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5 uppercase">
                  <User className="w-4 h-4 text-amber-600" />
                  3. Tặng Xu Cho Học Sinh Xuất Sắc
                </span>
                <button
                  type="button"
                  onClick={handlePickRandomStudent}
                  className="text-[11px] text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  Chọn ngẫu nhiên 1 bạn
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2.5">
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full sm:flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {classStudents.map(s => (
                    <option key={s.id} value={s.id}>
                      #{s.stt} - {s.name} ({s.points} xu · {s.group || 'Chưa chia tổ'})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleAwardStudent}
                  className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/25 hover-zoom-btn shrink-0 cursor-pointer"
                >
                  <Award className="w-4 h-4" />
                  <span>Tặng +{selectedCoinAmount} Xu</span>
                </button>
              </div>
            </div>

            {/* Live Award Log for this Game Session */}
            {awardHistory.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">Lịch sử tặng xu trong lượt chơi này:</span>
                  <span className="font-extrabold text-blue-700">Đã tặng: +{totalCoinsAwarded} xu</span>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                  {awardHistory.map(rec => (
                    <div
                      key={rec.id}
                      className="p-2 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="font-bold text-slate-800">{rec.title}</span>
                        {rec.count > 1 && (
                          <span className="text-[10px] text-slate-500">({rec.count} bạn)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-amber-600">+{rec.amount * rec.count} xu</span>
                        <span className="text-[10px] text-slate-400">{rec.timestamp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
