import React, { useState, useRef, useEffect } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { Student } from '../../types';
import { 
  Sparkles, RotateCcw, Award, Users, 
  Trash2, Volume2, Trophy, Check, ArrowRight
} from 'lucide-react';
import { 
  playTickSound, 
  playFanfareSound, 
  playCoinSound,
  playApplauseSound,
  playYesSound,
  triggerFlowerConfetti
} from '../../utils/audio';
import confetti from 'canvas-confetti';

const SLICE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
  '#8B5CF6', '#06B6D4', '#EC4899', '#14B8A6',
  '#6366F1', '#84CC16', '#F97316', '#A855F7'
];

export const LuckyWheelView: React.FC = () => {
  const { currentClassStudents, awardPoints } = useClassroom();
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Selection mode: Individual students vs Groups (Tổ)
  const [spinMode, setSpinMode] = useState<'individual' | 'groups'>('individual');
  
  // Spin state
  const [isSpinning, setIsSpinning] = useState(false);
  const [currentRotation, setCurrentRotation] = useState(0);
  const [winnerStudent, setWinnerStudent] = useState<Student | null>(null);
  const [winnerGroup, setWinnerGroup] = useState<string | null>(null);
  
  // History of spins in this session
  const [spinHistory, setSpinHistory] = useState<Array<{ name: string; time: string; type: string }>>([]);
  const [excludePreviousWinners, setExcludePreviousWinners] = useState(false);

  // Direct Reward on modal
  const [rewardXu, setRewardXu] = useState(3);
  const [hasAwardedWinner, setHasAwardedWinner] = useState(false);

  // Group items list
  const groupsList = ['Tổ 1', 'Tổ 2', 'Tổ 3', 'Tổ 4'];

  // Current items for the wheel
  const activeItems = spinMode === 'individual'
    ? (excludePreviousWinners 
        ? currentClassStudents.filter(s => !spinHistory.some(h => h.name === s.name))
        : currentClassStudents)
    : groupsList.map((g, idx) => ({ id: `grp-${idx}`, name: g }));

  // Draw wheel on canvas
  const drawWheel = (angle: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const radius = width / 2 - 15;
    const center = width / 2;

    ctx.clearRect(0, 0, width, height);

    if (activeItems.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.font = '14px Plus Jakarta Sans';
      ctx.fillText('Không có dữ liệu quay', center, center);
      return;
    }

    const arc = (2 * Math.PI) / activeItems.length;

    // Draw slices
    activeItems.forEach((item, i) => {
      const sliceAngle = angle + i * arc;
      ctx.beginPath();
      ctx.fillStyle = SLICE_COLORS[i % SLICE_COLORS.length];
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, sliceAngle, sliceAngle + arc);
      ctx.lineTo(center, center);
      ctx.fill();

      // Border line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Text label
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(sliceAngle + arc / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = activeItems.length > 20 ? 'bold 10px Plus Jakarta Sans' : 'bold 13px Plus Jakarta Sans';
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 3;
      
      const textToDisplay = item.name.length > 16 ? item.name.slice(0, 14) + '...' : item.name;
      ctx.fillText(textToDisplay, radius - 20, 5);
      ctx.restore();
    });

    // Outer decorative border
    ctx.beginPath();
    ctx.arc(center, center, radius + 4, 0, 2 * Math.PI);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Center peg hub
    ctx.beginPath();
    ctx.arc(center, center, 32, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.fillText('QUAY', center, center + 4);
  };

  useEffect(() => {
    drawWheel(currentRotation);
  }, [currentRotation, activeItems, spinMode]);

  // Spin trigger
  const spinWheel = () => {
    if (isSpinning || activeItems.length === 0) return;

    setIsSpinning(true);
    setWinnerStudent(null);
    setWinnerGroup(null);
    setHasAwardedWinner(false);

    const duration = 4800; // 4.8 seconds smooth spin

    // Pick random winner
    const winningIndex = Math.floor(Math.random() * activeItems.length);
    const arc = (2 * Math.PI) / activeItems.length;

    // Target angle so winning slice lands at pointer (pointer is at TOP: 3*PI/2)
    const pointerAngle = 1.5 * Math.PI;
    const targetSliceCenter = winningIndex * arc + arc / 2;
    const extraRounds = 8 * 2 * Math.PI;
    
    const finalAngle = extraRounds + (pointerAngle - targetSliceCenter);
    const startAngle = currentRotation % (2 * Math.PI);
    const totalRotationChange = finalAngle - startAngle;

    const startTime = performance.now();
    let lastTickAngle = startAngle;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Silky smooth natural deceleration curve
      const ease = 1 - Math.pow(1 - progress, 3.8);

      const currentAngle = startAngle + totalRotationChange * ease;
      setCurrentRotation(currentAngle);
      drawWheel(currentAngle);

      // Sound ticks when passing slice boundaries
      if (Math.abs(currentAngle - lastTickAngle) > arc * 0.5) {
        playTickSound(800 + Math.random() * 200);
        lastTickAngle = currentAngle;
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setIsSpinning(false);
        const selected = activeItems[winningIndex];
        
        // Announce winner
        playFanfareSound();
        playApplauseSound();
        playYesSound();
        triggerFlowerConfetti();

        const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        if (spinMode === 'individual') {
          const st = currentClassStudents.find(s => s.name === selected.name);
          if (st) setWinnerStudent(st);
          setSpinHistory(prev => [{ name: selected.name, time: timeStr, type: 'Cá nhân' }, ...prev]);
        } else {
          setWinnerGroup(selected.name);
          setSpinHistory(prev => [{ name: selected.name, time: timeStr, type: 'Tập thể' }, ...prev]);
        }
      }
    };

    requestAnimationFrame(animate);
  };

  const handleAwardWinner = () => {
    if (winnerStudent) {
      awardPoints([winnerStudent.id], rewardXu, 'Khen thưởng qua Vòng quay May mắn');
      setHasAwardedWinner(true);
      playCoinSound();
    } else if (winnerGroup) {
      // Award all students in this group
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
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-600" />
            <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase">
              VÒNG QUAY MAY MẮN (GỌI TÊN & CHỌN NHÓM)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 uppercase font-medium">
            QUAY GỌI TÊN NGẪU NHIÊN PHÁT BIỂU VÀ CỘNG XU TRỰC TIẾP · BẢO TOÀN DANH SÁCH & KẾT QUẢ
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => { setSpinMode('individual'); setWinnerStudent(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors uppercase ${
              spinMode === 'individual' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            TỪNG HỌC SINH ({currentClassStudents.length})
          </button>
          <button
            onClick={() => { setSpinMode('groups'); setWinnerStudent(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors uppercase ${
              spinMode === 'groups' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            THEO TỔ / NHÓM ({groupsList.length} TỔ)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Interactive Canvas Wheel (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 shadow-2xs flex flex-col items-center justify-center relative min-h-[380px] sm:min-h-[550px]">
          {/* Wheel Pointer at Top */}
          <div className="absolute top-4 sm:top-8 z-20 flex flex-col items-center pointer-events-none">
            <div className="w-0 h-0 border-l-[12px] sm:border-l-[14px] border-l-transparent border-r-[12px] sm:border-r-[14px] border-r-transparent border-t-[24px] sm:border-t-[28px] border-t-rose-600 filter drop-shadow-md" />
          </div>

          {/* Canvas with responsive dimension */}
          <div className="relative mt-2 sm:mt-4 flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={460}
              height={460}
              className="w-[280px] h-[280px] sm:w-[420px] sm:h-[420px] max-w-full drop-shadow-lg"
            />
          </div>

          {/* Controls */}
          <div className="mt-4 sm:mt-6 flex flex-wrap items-center justify-center gap-3 w-full">
            <button
              onClick={spinWheel}
              disabled={isSpinning || activeItems.length === 0}
              className="w-full sm:w-auto px-8 py-3 rounded-2xl font-black text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0 uppercase cursor-pointer text-center"
            >
              {isSpinning ? 'ĐANG QUAY...' : 'BẮT ĐẦU QUAY NGAY'}
            </button>
          </div>
        </div>

        {/* Right: Settings & Winner Card & History (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Spin Settings */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-black text-slate-800 uppercase">
                CẤU HÌNH VÒNG QUAY MAY MẮN
              </span>
              <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 text-[10px] font-black uppercase">
                {activeItems.length} đối tượng
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-bold text-slate-700 uppercase">
                Số xu thưởng khi trúng:
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 5].map(pts => (
                  <button
                    key={pts}
                    type="button"
                    onClick={() => setRewardXu(pts)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      rewardXu === pts ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    +{pts} xu
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer pt-1 uppercase">
              <input
                type="checkbox"
                checked={excludePreviousWinners}
                onChange={(e) => setExcludePreviousWinners(e.target.checked)}
                className="rounded text-violet-600 focus:ring-violet-500 cursor-pointer"
              />
              <span>TẠM LOẠI TRỪ CÁC BẠN ĐÃ QUAY TRÚNG TRONG PHIÊN NÀY</span>
            </label>
          </div>

          {/* Winner Showcase Card */}
          {(winnerStudent || winnerGroup) && (
            <div className="bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-2xl p-5 shadow-md animate-in zoom-in-95 duration-200 space-y-4">
              <div className="flex items-center gap-2 text-violet-200 text-xs font-black uppercase tracking-wider">
                <Trophy className="w-4 h-4 text-amber-300" />
                <span>CHÚC MỪNG NGƯỜI CHIẾN THẮNG!</span>
              </div>

              <div className="flex items-center gap-4">
                {winnerStudent ? (
                  <>
                    <img
                      src={winnerStudent.avatar}
                      alt={winnerStudent.name}
                      className="w-16 h-16 rounded-full border-2 border-white object-cover bg-white/20 shrink-0 shadow-inner"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <div className="text-xl font-extrabold text-white leading-tight uppercase">
                        {winnerStudent.name}
                      </div>
                      <div className="text-xs text-violet-200 mt-0.5 uppercase font-bold">
                        STT #{winnerStudent.stt} · {winnerStudent.group || 'Chưa chia tổ'}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-2xl font-black text-white uppercase">
                    {winnerGroup}
                  </div>
                )}
              </div>

              {/* Direct Reward on Winner Screen */}
              <div className="pt-3 border-t border-white/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-violet-100 font-bold uppercase">THƯỞNG:</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={rewardXu}
                    onChange={(e) => setRewardXu(parseInt(e.target.value) || 1)}
                    className="w-14 px-2 py-1 rounded-lg bg-white/20 text-white font-mono font-bold text-center text-xs border border-white/30"
                  />
                  <span className="text-xs font-black text-amber-300 uppercase">XU</span>
                </div>

                <button
                  onClick={handleAwardWinner}
                  disabled={hasAwardedWinner}
                  className="px-4 py-2 rounded-xl text-xs font-black bg-amber-400 hover:bg-amber-300 text-slate-900 shadow-xs transition-colors flex items-center gap-1.5 disabled:bg-white/30 disabled:text-white/70 uppercase hover-zoom-btn"
                >
                  {hasAwardedWinner ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-800" />
                      <span>ĐÃ CỘNG XU!</span>
                    </>
                  ) : (
                    <>
                      <Award className="w-4 h-4" />
                      <span>CỘNG XU NGAY</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Spin History & Reset */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-800 uppercase">
                LỊCH SỬ QUAY LƯỢT NÀY ({spinHistory.length})
              </h3>
              {spinHistory.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1 font-bold uppercase hover-zoom-interactive"
                  title="Reset lượt quay khi chuyển môn hoặc bài học mới"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>XÓA LỊCH SỬ</span>
                </button>
              )}
            </div>

            {spinHistory.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                Chưa có lượt quay nào. Bấm "Bắt đầu quay ngay" để chọn học sinh ngẫu nhiên.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {spinHistory.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                  >
                    <div className="font-semibold text-slate-800">{item.name}</div>
                    <div className="text-[11px] font-mono text-slate-400">{item.time}</div>
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
