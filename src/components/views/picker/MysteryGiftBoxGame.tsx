import React, { useState } from 'react';
import { useClassroom } from '../../../context/ClassroomContext';
import { Student, QuestionItem } from '../../../types';
import { 
  Gift, Play, Award, RotateCcw, Sparkles, Check, 
  HelpCircle, ChevronRight, Volume2, ShieldCheck, Heart, Edit3
} from 'lucide-react';
import { 
  playTickSound, 
  playFanfareSound, 
  playCoinSound,
  triggerCorrectCelebration,
  triggerWrongFeedback
} from '../../../utils/audio';
import confetti from 'canvas-confetti';
import { QuestionBankModal } from '../../modals/QuestionBankModal';
import { loadQuizBank, saveQuizBank } from '../../../utils/quizParser';

interface GiftBoxItem {
  id: number;
  label: string;
  color: string;
  ribbonColor: string;
  gradient: string;
}

const GIFT_BOXES: GiftBoxItem[] = [
  { id: 1, label: 'Hộp Quà Đỏ Ruby', color: '#EF4444', ribbonColor: '#FDE047', gradient: 'from-rose-500 to-red-600' },
  { id: 2, label: 'Hộp Quà Vàng Kim', color: '#F59E0B', ribbonColor: '#FEF08A', gradient: 'from-amber-400 to-yellow-500' },
  { id: 3, label: 'Hộp Quà Ngọc Bích', color: '#10B981', ribbonColor: '#FDE047', gradient: 'from-emerald-500 to-teal-600' },
  { id: 4, label: 'Hộp Quà Đại Dương', color: '#3B82F6', ribbonColor: '#BAE6FD', gradient: 'from-blue-500 to-indigo-600' },
  { id: 5, label: 'Hộp Quà Thạch Anh', color: '#8B5CF6', ribbonColor: '#DDD6FE', gradient: 'from-purple-500 to-violet-600' },
  { id: 6, label: 'Hộp Quà Hoa Anh Đào', color: '#EC4899', ribbonColor: '#FCE7F3', gradient: 'from-pink-500 to-rose-500' },
  { id: 7, label: 'Hộp Quà Cam San Hô', color: '#F97316', ribbonColor: '#FED7AA', gradient: 'from-orange-500 to-amber-600' },
  { id: 8, label: 'Hộp Quà Lam Ngọc', color: '#06B6D4', ribbonColor: '#CFFAFE', gradient: 'from-cyan-500 to-blue-500' },
];

export const MysteryGiftBoxGame: React.FC = () => {
  const { currentClassStudents, awardPoints, quizBank, updateQuizBank } = useClassroom();

  // Mode: 'random' | 'coins' | 'quiz'
  const [callMode, setCallMode] = useState<'random' | 'coins' | 'quiz'>('random');
  const [spinDuration, setSpinDuration] = useState<number>(4); // 4 seconds standard

  // Game state
  const [isOpening, setIsOpening] = useState(false);
  const [selectedBoxId, setSelectedBoxId] = useState<number | null>(null);
  const [highlightedBoxId, setHighlightedBoxId] = useState<number>(1);
  const [isBoxOpened, setIsBoxOpened] = useState(false);
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

  const startOpenGift = () => {
    if (isOpening || activeList.length === 0) return;

    setIsOpening(true);
    setIsBoxOpened(false);
    setWinner(null);
    setHasAwarded(false);
    setSelectedOption(null);
    setShowTeacherKey(false);
    setIsAnswerCorrect(null);

    // Pick target winner and target box
    const targetWinner = activeList[Math.floor(Math.random() * activeList.length)];
    const chosenBox = GIFT_BOXES[Math.floor(Math.random() * GIFT_BOXES.length)];

    const totalDurationMs = spinDuration * 1000;
    const startTime = performance.now();
    let stepCount = 0;
    let boxIdx = 0;

    const shuffleBoxes = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / totalDurationMs, 1);

      boxIdx = (boxIdx + 1) % GIFT_BOXES.length;
      setHighlightedBoxId(GIFT_BOXES[boxIdx].id);
      stepCount++;

      if (stepCount % 2 === 0) {
        playTickSound(720 + (stepCount % 6) * 50);
      }

      if (progress < 1) {
        const nextDelay = 40 + Math.pow(progress, 2.5) * 200;
        setTimeout(() => {
          requestAnimationFrame(shuffleBoxes);
        }, nextDelay);
      } else {
        // Animation landed on chosen box
        setHighlightedBoxId(chosenBox.id);
        setSelectedBoxId(chosenBox.id);
        
        // Open lid with pop animation
        setTimeout(() => {
          setIsBoxOpened(true);
          setIsOpening(false);
          setWinner(targetWinner);
          playFanfareSound();
          confetti({ particleCount: 95, spread: 85, origin: { y: 0.55 } });

          if (autoExclude) {
            setExcludedIds(prev => [...prev, targetWinner.id]);
          }

          // If mode is Quiz, draw random question
          if (callMode === 'quiz' && quizBank.length > 0) {
            const q = quizBank[Math.floor(Math.random() * quizBank.length)];
            setCurrentQuestion(q);
          }
        }, 300);
      }
    };

    requestAnimationFrame(shuffleBoxes);
  };

  const handleAwardCoins = (amount = rewardXu) => {
    if (!winner || hasAwarded) return;
    awardPoints([winner.id], amount, 'Thưởng trò chơi Hộp Quà Bí Mật');
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
      triggerWrongFeedback();
      setShowTeacherKey(true);
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
      <div className="bg-white rounded-3xl p-4 md:p-5 border border-slate-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <Gift className="w-5 h-5 text-rose-600" />
            </span>
            <h2 className="text-base md:text-lg font-black text-slate-900 uppercase tracking-wide">
              HỘP QUÀ BÍ MẬT (MYSTERY GIFT BOX)
            </h2>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Các hộp quà may mắn rực rỡ sắc màu chứa đựng những gương mặt học sinh thân yêu
          </p>
        </div>

        {/* 3 Call Modes Switcher */}
        <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setCallMode('random')}
            className={`px-2 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-black transition-all cursor-pointer uppercase text-center ${
              callMode === 'random' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">1. Gọi Ngẫu Nhiên</span>
            <span className="sm:hidden">1. NGẪU NHIÊN</span>
          </button>
          <button
            type="button"
            onClick={() => setCallMode('coins')}
            className={`px-2 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-black transition-all cursor-pointer uppercase text-center ${
              callMode === 'coins' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">2. Gọi + Tặng Xu</span>
            <span className="sm:hidden">2. TẶNG XU</span>
          </button>
          <button
            type="button"
            onClick={() => setCallMode('quiz')}
            className={`px-2 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-black transition-all cursor-pointer uppercase text-center ${
              callMode === 'quiz' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">3. Gọi + Trả Lời Câu Hỏi</span>
            <span className="sm:hidden">3. CÂU HỎI</span>
          </button>
        </div>

        {/* Duration selection (4s) */}
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200">
          <span className="text-[11px] font-bold text-slate-500">Thời gian mở:</span>
          <select
            value={spinDuration}
            onChange={(e) => setSpinDuration(parseInt(e.target.value) || 4)}
            className="bg-transparent text-xs font-black text-rose-700 focus:outline-none cursor-pointer"
          >
            <option value={3}>3 giây</option>
            <option value={4}>4 giây (Chuẩn)</option>
            <option value={5}>5 giây</option>
            <option value={6}>6 giây</option>
          </select>
        </div>
      </div>

      {/* 2. MAIN GIFT BOXES STAGE */}
      <div className="bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-5 md:p-8 shadow-2xl border border-indigo-900/60 select-none relative overflow-hidden">
        {/* Decorative sparkles */}
        <div className="absolute top-4 left-6 text-amber-300 opacity-60 animate-ping">✨</div>
        <div className="absolute top-10 right-10 text-pink-300 opacity-50 animate-pulse">⭐</div>
        <div className="absolute bottom-6 left-12 text-cyan-300 opacity-40 animate-bounce">✨</div>

        {/* 8 Gift Boxes Display Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-6 my-4">
          {GIFT_BOXES.map((box) => {
            const isHighlighted = highlightedBoxId === box.id;
            const isWinningBox = selectedBoxId === box.id && isBoxOpened;

            return (
              <div
                key={box.id}
                className={`relative flex flex-col items-center justify-center p-4 rounded-3xl transition-all duration-300 cursor-pointer ${
                  isWinningBox 
                    ? 'scale-110 z-20 shadow-[0_0_50px_rgba(251,191,36,0.8)] ring-4 ring-amber-300 bg-amber-400/20' 
                    : isHighlighted 
                    ? 'scale-105 shadow-xl ring-2 ring-white/80 bg-white/10' 
                    : 'bg-white/5 hover:bg-white/10 opacity-80'
                }`}
              >
                {/* 3D Box Visual */}
                <div className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-tr ${box.gradient} shadow-lg relative flex items-center justify-center transition-transform ${
                  isOpening && isHighlighted ? 'animate-bounce' : ''
                }`}>
                  {/* Gift Ribbon Horizontal & Vertical */}
                  <div className="absolute inset-y-0 w-4 bg-amber-300/80 shadow-xs" />
                  <div className="absolute inset-x-0 h-4 bg-amber-300/80 shadow-xs" />

                  {/* Ribbon Bow on top */}
                  <div className="absolute -top-3 w-8 h-6 bg-amber-300 rounded-full shadow-md flex items-center justify-center text-amber-900 text-[10px] font-black">
                    🎀
                  </div>

                  {/* If opened, show winner picture inside! */}
                  {isWinningBox && winner && (
                    <div className="absolute inset-0 rounded-2xl overflow-hidden border-2 border-amber-300 bg-white z-10 animate-in zoom-in-50">
                      <img 
                        src={winner.avatar} 
                        alt={winner.name} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {!isWinningBox && (
                    <span className="relative z-10 text-white font-black text-sm font-mono opacity-90">
                      #{box.id}
                    </span>
                  )}
                </div>

                <div className="mt-2.5 text-center">
                  <div className="text-[11px] font-black text-white truncate max-w-[110px]">
                    {isWinningBox && winner ? winner.name : box.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Button */}
        <div className="pt-4">
          <button
            onClick={startOpenGift}
            disabled={isOpening || activeList.length === 0}
            className="w-full py-4 px-6 bg-gradient-to-r from-rose-500 via-amber-500 to-indigo-600 hover:from-rose-600 hover:to-indigo-700 text-white font-black text-sm md:text-base rounded-2xl shadow-lg shadow-rose-500/30 flex items-center justify-center gap-2.5 transition-all hover-zoom-btn disabled:opacity-50 uppercase cursor-pointer"
          >
            <Gift className={`w-5 h-5 ${isOpening ? 'animate-spin' : ''}`} />
            <span>{isOpening ? `🎁 ĐANG MỞ HỘP QUÀ BÍ MẬT (${spinDuration}S)...` : `🎁 BẤM MỞ HỘP QUÀ BÍ MẬT (${spinDuration} GIÂY)`}</span>
          </button>
        </div>
      </div>

      {/* 3. WINNER DISPLAY & 3 CALL MODES */}
      {winner && (
        <div className="bg-gradient-to-r from-rose-50 via-amber-50 to-indigo-50 border-2 border-rose-300 rounded-3xl p-5 md:p-6 shadow-md space-y-4 animate-in fade-in zoom-in-95 hover-zoom-card">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="relative shrink-0">
                <img 
                  src={winner.avatar} 
                  alt={winner.name} 
                  className="w-16 h-16 md:w-20 md:h-20 rounded-full aspect-square object-cover border-4 border-rose-400 bg-white shadow-lg"
                />
                <span className="absolute -bottom-1 -right-1 px-2 py-0.5 bg-rose-600 text-white font-black text-[10px] rounded-full">
                  #{winner.stt}
                </span>
              </div>

              <div>
                <div className="text-xs font-black text-rose-700 uppercase tracking-widest flex items-center gap-1.5 justify-center sm:justify-start">
                  <Sparkles className="w-4 h-4 text-amber-500 animate-spin" />
                  <span>CHÚC MỪNG HỌC SINH MỞ TRÚNG HỘP QUÀ!</span>
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
                    className="px-3 py-2 bg-white border border-rose-300 rounded-xl text-xs font-bold text-rose-900 focus:outline-none shadow-2xs"
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
                        : 'bg-rose-500 hover:bg-rose-600 text-white'
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
                  setSelectedBoxId(null);
                  setIsBoxOpened(false);
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
            <div className="bg-white rounded-2xl p-4 md:p-5 border border-rose-200 shadow-sm space-y-3 mt-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-black uppercase">
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
                    className="text-[11px] font-bold text-rose-600 hover:underline px-2 py-1 cursor-pointer"
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
                    alt="Ảnh minh họa câu hỏi" 
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
                      let btnStyle = 'bg-slate-50 border-slate-200 text-slate-800 hover:border-rose-400';

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
                          <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center font-black text-xs shrink-0">
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
                          <strong className="text-slate-900">Giải thích chi tiết:</strong> {currentQuestion.teacherAnswerKey}
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
                      className="text-xs font-bold text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
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
