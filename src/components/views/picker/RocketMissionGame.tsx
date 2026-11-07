import React, { useState, useEffect, useRef } from 'react';
import { useClassroom } from '../../../context/ClassroomContext';
import { Student, QuestionItem } from '../../../types';
import { 
  Rocket, Play, Award, RotateCcw, Sparkles, Check, 
  HelpCircle, ChevronRight, Volume2, ShieldCheck, Compass, Edit3
} from 'lucide-react';
import { 
  playTickSound, 
  playFanfareSound, 
  playCoinSound, 
  playRocketLaunchSound,
  triggerCorrectCelebration, 
  triggerWrongFeedback 
} from '../../../utils/audio';
import confetti from 'canvas-confetti';
import { QuestionBankModal } from '../../modals/QuestionBankModal';
import { loadQuizBank, saveQuizBank } from '../../../utils/quizParser';

export const RocketMissionGame: React.FC = () => {
  const { currentClassStudents, awardPoints, quizBank, updateQuizBank } = useClassroom();

  // Mode: 'random' | 'coins' | 'quiz'
  const [callMode, setCallMode] = useState<'random' | 'coins' | 'quiz'>('random');
  const [spinDuration, setSpinDuration] = useState<number>(4); // 4 seconds standard

  // Game state
  const [isLaunching, setIsLaunching] = useState(false);
  const [currentPlanetIndex, setCurrentPlanetIndex] = useState(0);
  const [winner, setWinner] = useState<Student | null>(null);
  const [rewardXu, setRewardXu] = useState(2);
  const [hasAwarded, setHasAwarded] = useState(false);

  // Question challenge state (For mode 3: Gọi tên + Trả lời câu hỏi)
  const [currentQuestion, setCurrentQuestion] = useState<QuestionItem | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showTeacherKey, setShowTeacherKey] = useState(false);
  const [isAnswerCorrect, setIsAnswerCorrect] = useState<boolean | null>(null);
  const [isQuestionBankOpen, setIsQuestionBankOpen] = useState(false);
  const [editTargetQuestion, setEditTargetQuestion] = useState<QuestionItem | null>(null);

  // Exclude option
  const [autoExclude, setAutoExclude] = useState(true);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

  const pool = currentClassStudents.filter(s => !excludedIds.includes(s.id));
  const activeList = pool.length > 0 ? pool : currentClassStudents;

  // Space Canvas Starfield animation
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const stars: Array<{ x: number; y: number; size: number; speed: number; opacity: number }> = [];
    const numStars = 65;

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 800;
      canvas.height = 360;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < numStars; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 0.5 + 0.2,
        opacity: Math.random() * 0.8 + 0.2
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      stars.forEach(s => {
        s.y += s.speed;
        if (s.y > canvas.height) {
          s.y = 0;
          s.x = Math.random() * canvas.width;
        }
        ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      });

      animId = requestAnimationFrame(render);
    };

    render();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const launchRocket = () => {
    if (isLaunching || activeList.length === 0) return;

    setIsLaunching(true);
    setWinner(null);
    setHasAwarded(false);
    setSelectedOption(null);
    setShowTeacherKey(false);
    setIsAnswerCorrect(null);

    const targetWinner = activeList[Math.floor(Math.random() * activeList.length)];
    const totalDurationMs = spinDuration * 1000;
    const startTime = performance.now();

    let stepCount = 0;
    let currentIdx = Math.floor(Math.random() * activeList.length);

    const sweep = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / totalDurationMs, 1);

      // Fast at start, progressively decelerate
      currentIdx = (currentIdx + 1) % activeList.length;
      setCurrentPlanetIndex(currentIdx);
      stepCount++;

      if (stepCount % 2 === 0) {
        playTickSound(700 + (stepCount % 5) * 60);
      }

      if (progress < 1) {
        const nextDelay = 35 + Math.pow(progress, 2.5) * 220;
        setTimeout(() => {
          requestAnimationFrame(sweep);
        }, nextDelay);
      } else {
        // Land on target!
        const finalWinnerIdx = activeList.findIndex(s => s.id === targetWinner.id);
        setCurrentPlanetIndex(finalWinnerIdx >= 0 ? finalWinnerIdx : 0);
        setWinner(targetWinner);
        setIsLaunching(false);
        triggerCorrectCelebration();

        if (autoExclude) {
          setExcludedIds(prev => [...prev, targetWinner.id]);
        }

        // If mode is Quiz, draw random question
        if (callMode === 'quiz' && quizBank.length > 0) {
          const q = quizBank[Math.floor(Math.random() * quizBank.length)];
          setCurrentQuestion(q);
        }
      }
    };

    requestAnimationFrame(sweep);
  };

  const handleAwardCoins = (amount = rewardXu) => {
    if (!winner || hasAwarded) return;
    awardPoints([winner.id], amount, 'Thưởng trò chơi Tàu Vũ Trụ Khám Phá');
    playCoinSound();
    setHasAwarded(true);
    confetti({ particleCount: 50, spread: 60 });
  };

  const handleSelectOption = (idx: number) => {
    if (!currentQuestion || selectedOption !== null) return;
    setSelectedOption(idx);
    const correct = idx === currentQuestion.correctOptionIndex;
    setIsAnswerCorrect(correct);

    if (correct) {
      triggerCorrectCelebration();
      handleAwardCoins(currentQuestion.pointsReward || 2);
    } else {
      setShowTeacherKey(true);
      triggerWrongFeedback();
    }
  };

  const handlePickAnotherQuestion = () => {
    if (quizBank.length === 0) return;
    const remaining = quizBank.filter(q => q.id !== currentQuestion?.id);
    const poolQ = remaining.length > 0 ? remaining : quizBank;
    const q = poolQ[Math.floor(Math.random() * poolQ.length)];
    setCurrentQuestion(q);
    setSelectedOption(null);
    setShowTeacherKey(false);
    setIsAnswerCorrect(null);
    setHasAwarded(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP CONTROL BAR: 3 CALL MODES + SPIN DURATION (4s) */}
      <div className="bg-slate-900 rounded-3xl p-4 md:p-5 border border-indigo-900/60 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-white">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center font-bold">
              <Rocket className="w-5 h-5 text-amber-300" />
            </span>
            <h2 className="text-base md:text-lg font-black uppercase tracking-wide">
              TÀU VŨ TRỤ KHÁM PHÁ (ROCKET LAUNCH)
            </h2>
          </div>
          <p className="text-xs text-indigo-200/80 font-medium mt-0.5">
            Phi thuyền lướt qua dải ngân hà đáp xuống trạm vũ trụ học sinh may mắn
          </p>
        </div>

        {/* 3 Call Modes Switcher (User request: 1. Ngẫu nhiên, 2. Tặng xu, 3. Trả lời câu hỏi) */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-800 p-1.5 rounded-2xl border border-slate-700">
          <button
            type="button"
            onClick={() => setCallMode('random')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer uppercase ${
              callMode === 'random' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            1. Gọi Ngẫu Nhiên
          </button>
          <button
            type="button"
            onClick={() => setCallMode('coins')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer uppercase ${
              callMode === 'coins' ? 'bg-amber-500 text-amber-950 shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            2. Gọi + Tặng Xu
          </button>
          <button
            type="button"
            onClick={() => setCallMode('quiz')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer uppercase ${
              callMode === 'quiz' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            3. Gọi + Trả Lời Câu Hỏi
          </button>
        </div>

        {/* Duration selection (User request: lựa chọn 4 giây) */}
        <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-2xl border border-slate-700">
          <span className="text-[11px] font-bold text-slate-300">Thời gian quay:</span>
          <select
            value={spinDuration}
            onChange={(e) => setSpinDuration(parseInt(e.target.value) || 4)}
            className="bg-transparent text-xs font-black text-amber-300 focus:outline-none cursor-pointer"
          >
            <option value={3} className="bg-slate-900 text-white">3 giây</option>
            <option value={4} className="bg-slate-900 text-white">4 giây (Chuẩn)</option>
            <option value={5} className="bg-slate-900 text-white">5 giây</option>
            <option value={6} className="bg-slate-900 text-white">6 giây</option>
          </select>
        </div>
      </div>

      {/* 2. MAIN SPACE LAUNCH STAGE */}
      <div className="bg-slate-950 rounded-3xl border-2 border-indigo-900/60 shadow-2xl relative overflow-hidden select-none p-4 md:p-6 min-h-[380px] flex flex-col justify-between">
        {/* Background Starfield Canvas */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Top Space Station Header */}
        <div className="relative z-10 flex items-center justify-between text-indigo-300 text-xs font-mono pb-2 border-b border-indigo-900/40">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-cyan-400 animate-spin" />
            <span className="font-black text-cyan-300 tracking-wider">RADAR QUÉT TRẠM VŨ TRỤ LỚP HỌC</span>
          </div>
          <span>Sĩ số khả dụng: {activeList.length} học sinh</span>
        </div>

        {/* Center Space Visual: The Rocket and Orbit Planets */}
        <div className="relative z-10 my-4 flex flex-col items-center justify-center">
          {/* Main Central Rocket */}
          <div className={`relative transition-all duration-300 ${isLaunching ? 'scale-110 -translate-y-2' : ''}`}>
            <div className={`w-24 h-24 md:w-28 md:h-28 rounded-full bg-gradient-to-tr from-indigo-900 via-indigo-700 to-cyan-500 border-4 border-cyan-400/80 p-1 flex items-center justify-center shadow-[0_0_40px_rgba(6,182,212,0.6)] ${isLaunching ? 'animate-pulse' : ''}`}>
              <Rocket className={`w-12 h-12 md:w-14 md:h-14 text-white -rotate-45 ${isLaunching ? 'animate-bounce' : ''}`} />
            </div>
            {/* Rocket Thruster Flame */}
            {isLaunching && (
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-gradient-to-b from-amber-400 via-rose-500 to-transparent rounded-full blur-xs animate-ping" />
            )}
          </div>

          {/* Current Scanned Planet Banner */}
          <div className="mt-5 text-center">
            {activeList[currentPlanetIndex] && (
              <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-slate-900/90 border-2 border-cyan-500/60 rounded-full shadow-xl backdrop-blur-md">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-cyan-300 shadow-md shadow-cyan-400/50 aspect-square shrink-0 ring-2 ring-cyan-500/30">
                  <img
                    src={activeList[currentPlanetIndex].avatar}
                    alt={activeList[currentPlanetIndex].name}
                    className="w-full h-full object-cover rounded-full"
                  />
                </div>
                <div className="text-left">
                  <div className="text-[10px] text-cyan-300 font-mono font-bold">HÀNH TINH #{activeList[currentPlanetIndex].stt}</div>
                  <div className="text-base font-black text-white">{activeList[currentPlanetIndex].name}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Launch Trigger Button */}
        <div className="relative z-10 pt-2">
          <button
            onClick={launchRocket}
            disabled={isLaunching || activeList.length === 0}
            className="w-full py-4 px-6 bg-gradient-to-r from-indigo-600 via-cyan-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-black text-sm md:text-base rounded-2xl shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2.5 transition-all hover-zoom-btn disabled:opacity-50 uppercase cursor-pointer"
          >
            <Play className={`w-5 h-5 fill-white ${isLaunching ? 'animate-spin' : ''}`} />
            <span>{isLaunching ? `🚀 PHI THUYỀN ĐANG KHÁM PHÁ (${spinDuration}S)...` : `🚀 BẤM PHÓNG TÀU VŨ TRỤ (${spinDuration} GIÂY)`}</span>
          </button>
        </div>
      </div>

      {/* 3. WINNER BANNER & 3 CALL MODES ACTION */}
      {winner && (
        <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-amber-50 border-2 border-indigo-300 rounded-3xl p-5 md:p-6 shadow-md space-y-4 animate-in fade-in zoom-in-95 hover-zoom-card">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="relative shrink-0">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-4 border-indigo-500 bg-white shadow-2xl ring-4 ring-amber-400/70 aspect-square">
                  <img 
                    src={winner.avatar} 
                    alt={winner.name} 
                    className="w-full h-full object-cover rounded-full"
                  />
                </div>
                <span className="absolute -bottom-1 -right-1 px-2.5 py-0.5 bg-indigo-600 text-white font-black text-xs rounded-full shadow-md">
                  #{winner.stt}
                </span>
              </div>

              <div>
                <div className="text-xs font-black text-indigo-700 uppercase tracking-widest flex items-center gap-1.5 justify-center sm:justify-start">
                  <Sparkles className="w-4 h-4 text-amber-500 animate-spin" />
                  <span>PHI THUYỀN ĐÁP XUỐNG THÀNH CÔNG!</span>
                </div>
                <h3 className="text-xl md:text-2xl font-black text-slate-900 mt-0.5">
                  {winner.name}
                </h3>
                <p className="text-xs text-slate-600 font-medium">
                  {winner.gender} • {winner.group || 'Tổ 1'} • Hiện có: <strong className="text-amber-800 font-black">{winner.points} xu</strong>
                </p>
              </div>
            </div>

            {/* Mode Actions */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* Mode 2: Gọi + Tặng xu */}
              {callMode === 'coins' && (
                <>
                  <select
                    value={rewardXu}
                    onChange={(e) => setRewardXu(parseInt(e.target.value) || 2)}
                    className="px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-bold text-amber-900 focus:outline-none shadow-2xs"
                  >
                    <option value={1}>+1 xu</option>
                    <option value={2}>+2 xu</option>
                    <option value={5}>+5 xu</option>
                    <option value={10}>+10 xu</option>
                  </select>

                  <button
                    onClick={() => handleAwardCoins(rewardXu)}
                    disabled={hasAwarded}
                    className={`px-5 py-2.5 rounded-2xl text-xs font-black shadow-md flex items-center gap-1.5 transition-all hover-zoom-btn uppercase ${
                      hasAwarded
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                  >
                    {hasAwarded ? <Check className="w-4 h-4" /> : <Award className="w-4 h-4" />}
                    <span>{hasAwarded ? 'ĐÃ TRAO XU THƯỞNG!' : `TRAO +${rewardXu} XU`}</span>
                  </button>
                </>
              )}

              {/* Reset/Dismiss winner */}
              <button
                onClick={() => {
                  setWinner(null);
                  setCurrentQuestion(null);
                }}
                className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-xs font-bold"
                title="Đóng kết quả"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mode 3: Gọi + Trả Lời Câu Hỏi (Question Challenge Box) */}
          {callMode === 'quiz' && currentQuestion && (
            <div className="bg-white rounded-2xl p-4 md:p-5 border border-indigo-200 shadow-sm space-y-3 mt-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 text-[10px] font-black uppercase">
                    {currentQuestion.type === 'multiple_choice' ? '📝 Câu hỏi Trắc nghiệm' : '🗣️ Câu hỏi Bằng lời'}
                  </span>
                  <span className="text-xs font-bold text-slate-600">{currentQuestion.subject || 'Tổng hợp'}</span>
                  <span className="text-xs font-bold text-amber-600">Thưởng +{currentQuestion.pointsReward || 2} xu</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditTargetQuestion(currentQuestion);
                      setIsQuestionBankOpen(true);
                    }}
                    className="text-[11px] font-bold text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Edit3 className="w-3 h-3 text-amber-600" />
                    <span>Sửa câu hỏi</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePickAnotherQuestion}
                    className="text-[11px] font-bold text-indigo-600 hover:underline px-2 py-1 cursor-pointer"
                  >
                    Đổi câu khác
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditTargetQuestion(null);
                      setIsQuestionBankOpen(true);
                    }}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 px-2 py-1 cursor-pointer"
                  >
                    Kho đề
                  </button>
                </div>
              </div>

              {/* Question Text */}
              <div className="text-sm md:text-base font-black text-slate-900">
                {currentQuestion.questionText}
              </div>

              {/* Question Image */}
              {currentQuestion.image && (
                <div className="pt-1">
                  <img 
                    src={currentQuestion.image} 
                    alt="Ảnh câu hỏi" 
                    className="max-h-40 rounded-xl border border-slate-200 object-contain bg-slate-50"
                  />
                </div>
              )}

              {/* Multiple Choice Options */}
              {currentQuestion.type === 'multiple_choice' && currentQuestion.options && (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {currentQuestion.options.map((opt, idx) => {
                      const isSelected = selectedOption === idx;
                      const isCorrect = currentQuestion.correctOptionIndex === idx;
                      let btnStyle = 'bg-slate-50 border-slate-200 text-slate-800 hover:border-indigo-400';

                      if (selectedOption !== null) {
                        if (isCorrect) {
                          btnStyle = 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold';
                        } else if (isSelected) {
                          btnStyle = 'bg-rose-50 border-rose-400 text-rose-950';
                        }
                      }

                      return (
                        <button
                          key={idx}
                          disabled={selectedOption !== null}
                          onClick={() => handleSelectOption(idx)}
                          className={`p-3 rounded-xl text-xs flex items-center gap-2.5 border text-left transition-all cursor-pointer ${btnStyle}`}
                        >
                          <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center font-black text-xs shrink-0">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="flex-1">{opt}</span>
                          {selectedOption !== null && isCorrect && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Explanation & Answer Image */}
                  {selectedOption !== null && (currentQuestion.teacherAnswerKey || currentQuestion.answerImage) && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 space-y-1.5 animate-in fade-in duration-150">
                      {currentQuestion.teacherAnswerKey && (
                        <div>
                          <strong className="text-slate-900">Giải thích:</strong> {currentQuestion.teacherAnswerKey}
                        </div>
                      )}
                      {currentQuestion.answerImage && (
                        <div className="pt-1">
                          <span className="text-[10px] font-black uppercase text-slate-600 block mb-1">Ảnh minh họa đáp án:</span>
                          <img
                            src={currentQuestion.answerImage}
                            alt="Ảnh đáp án"
                            className="max-h-40 rounded-xl border border-slate-300 object-contain bg-white shadow-2xs"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Oral question answer key toggle */}
              {currentQuestion.type === 'oral' && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowTeacherKey(!showTeacherKey)}
                      className="text-xs font-bold text-indigo-700 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>{showTeacherKey ? 'Ẩn đáp án giáo viên' : '👁️ Xem đáp án & gợi ý chấm của giáo viên'}</span>
                    </button>

                    <button
                      onClick={() => handleAwardCoins(currentQuestion.pointsReward || 2)}
                      disabled={hasAwarded}
                      className={`px-4 py-1.5 rounded-xl text-xs font-black shadow-xs flex items-center gap-1 transition-all ${
                        hasAwarded ? 'bg-emerald-600 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{hasAwarded ? 'Đã tặng xu đúng' : `✓ Trả lời đúng (+${currentQuestion.pointsReward || 2} xu)`}</span>
                    </button>
                  </div>

                  {showTeacherKey && (
                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-950 font-medium space-y-2 animate-in fade-in duration-150">
                      {currentQuestion.teacherAnswerKey && (
                        <div>
                          <strong>Đáp án / Hướng dẫn giáo viên:</strong> {currentQuestion.teacherAnswerKey}
                        </div>
                      )}
                      {currentQuestion.answerImage && (
                        <div className="pt-1">
                          <span className="text-[10px] font-black uppercase text-amber-900 block mb-1">Ảnh minh họa đáp án giáo viên:</span>
                          <img
                            src={currentQuestion.answerImage}
                            alt="Ảnh đáp án giáo viên"
                            className="max-h-44 rounded-xl border border-amber-300 object-contain bg-white shadow-2xs"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* QUESTION BANK MODAL */}
      <QuestionBankModal
        isOpen={isQuestionBankOpen}
        initialEditQuestion={editTargetQuestion}
        onClose={() => {
          setIsQuestionBankOpen(false);
          setEditTargetQuestion(null);
        }}
        questions={quizBank}
        onSaveQuestions={(updated) => {
          updateQuizBank(updated);
          saveQuizBank(updated);
          if (currentQuestion) {
            const updatedCur = updated.find(q => q.id === currentQuestion.id);
            if (updatedCur) {
              setCurrentQuestion(updatedCur);
            }
          }
        }}
      />
    </div>
  );
};
