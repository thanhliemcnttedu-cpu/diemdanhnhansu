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

import { handleAvatarImgError } from '../../../utils/avatarConfig';
import { CalledStudentModal } from './CalledStudentModal';
import { useFairCall } from './useFairCall';
import { QuestionChallengeModal } from './QuestionChallengeModal';
import { QuestionAudioButton } from './QuestionAudioButton';
import { useQuizSelection, QuizSelectionChip } from './QuizSetPicker';
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
  // Hộp chúc mừng kiểu Ống kính
  const [showWinnerPopup, setShowWinnerPopup] = useState(false);

  // Question challenge state (For mode 3: Gọi tên + Trả lời câu hỏi)
  const [currentQuestion, setCurrentQuestion] = useState<QuestionItem | null>(null);
  const [quizDrawToken, setQuizDrawToken] = useState(0);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [isQuestionBankOpen, setIsQuestionBankOpen] = useState(false);
  const [editTargetQuestion, setEditTargetQuestion] = useState<QuestionItem | null>(null);
  // Chế độ câu hỏi: giáo viên chọn kho + bộ câu hỏi trước khi chơi; chỉ bốc câu trong phần đã chọn
  const quizSel = useQuizSelection(() => { setEditTargetQuestion(null); setIsQuestionBankOpen(true); });
  const quizPool = quizSel.pool;

  // Exclude option
  const [autoExclude, setAutoExclude] = useState(true);
  // Shared fair-call log: students called in the current round (any game) are skipped while auto-exclude is on
  const fair = useFairCall();
  const excludedIds = autoExclude ? fair.calledIds : [];

  const pool = currentClassStudents.filter(s => !excludedIds.includes(s.id));
  const activeList = pool.length > 0 ? pool : currentClassStudents;

  const startOpenGift = () => {
    if (isOpening || activeList.length === 0) return;

    setIsOpening(true);
    setIsBoxOpened(false);
    setWinner(null);
    setShowWinnerPopup(false);
    setHasAwarded(false);

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
          setShowWinnerPopup(true);
          playFanfareSound();
          confetti({ particleCount: 95, spread: 85, origin: { y: 0.55 } });

          fair.markCalled(targetWinner.id, 'mystery_box');
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

  // Mode 3: draw a random question from the chosen set and show it wide-screen
  const drawQuestion = () => {
    if (quizPool.length === 0) { quizSel.request(); return; }
    setQuizDrawToken(n => n + 1);
    setIsQuizOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP CONTROL BAR: 3 CALL MODES + SPIN DURATION (4s) */}
      <div className="bg-white rounded-3xl p-4 md:p-5 border border-slate-200/90 shadow-xs flex flex-col lg:flex-row lg:flex-wrap lg:items-center justify-between gap-4">
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
            className={`px-2 sm:px-3 py-1.5 rounded-xl text-[12px] sm:text-xs font-black transition-all cursor-pointer uppercase text-center ${
              callMode === 'random' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">1. Gọi Ngẫu Nhiên</span>
            <span className="sm:hidden">1. NGẪU NHIÊN</span>
          </button>
          <button
            type="button"
            onClick={() => setCallMode('coins')}
            className={`px-2 sm:px-3 py-1.5 rounded-xl text-[12px] sm:text-xs font-black transition-all cursor-pointer uppercase text-center ${
              callMode === 'coins' ? 'bg-amber-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">2. Gọi + Tặng Xu</span>
            <span className="sm:hidden">2. TẶNG XU</span>
          </button>
          <button
            type="button"
            onClick={() => quizSel.request(() => setCallMode('quiz'))}
            className={`px-2 sm:px-3 py-1.5 rounded-xl text-[12px] sm:text-xs font-black transition-all cursor-pointer uppercase text-center ${
              callMode === 'quiz' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">3. Gọi + Trả Lời Câu Hỏi</span>
            <span className="sm:hidden">3. CÂU HỎI</span>
          </button>
        </div>

        {callMode === 'quiz' && (
          <div className="w-full lg:basis-full lg:order-last"><QuizSelectionChip label={quizSel.label} count={quizPool.length} onChange={() => quizSel.request()} /></div>
        )}

        {/* Duration selection (4s) */}
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200">
          <span className="text-[12px] font-bold text-slate-500">Thời gian mở:</span>
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
      <div className="bg-gradient-to-b from-sky-600 via-indigo-600 to-indigo-600 rounded-3xl p-5 md:p-8 shadow-2xl border border-indigo-900/60 select-none relative overflow-hidden">
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
                    : 'bg-white/5 hover:bg-white/10'
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
                  <div className="absolute -top-3 w-8 h-6 bg-amber-300 rounded-full shadow-md flex items-center justify-center text-amber-900 text-[12px] font-black">
                    🎀
                  </div>

                  {/* If opened, show winner picture inside! */}
                  {isWinningBox && winner && (
                    <div className="absolute inset-0 rounded-2xl overflow-hidden border-2 border-amber-300 bg-white z-10 animate-in zoom-in-50">
                      <img 
                        src={winner.avatar} onError={(e) => handleAvatarImgError(e, winner?.gender, winner?.name)} 
                        alt={winner.name} 
                        className="w-full h-full object-cover object-center"
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
                  <div className="text-[12px] font-black text-white truncate max-w-[110px] drop-shadow">
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
            className="w-full py-4 px-6 bg-gradient-to-r from-rose-600 via-amber-700 to-indigo-600 hover:from-rose-700 hover:to-indigo-700 text-white font-black text-sm md:text-base rounded-2xl shadow-lg shadow-rose-500/30 flex items-center justify-center gap-2.5 transition-all hover-zoom-btn disabled:opacity-50 uppercase cursor-pointer"
          >
            <Gift className={`w-5 h-5 ${isOpening ? 'animate-spin' : ''}`} />
            <span>{isOpening ? `🎁 ĐANG MỞ HỘP QUÀ BÍ MẬT (${spinDuration}S)...` : `🎁 BẤM MỞ HỘP QUÀ BÍ MẬT (${spinDuration} GIÂY)`}</span>
          </button>
        </div>
      </div>

      {/* 3. WINNER DISPLAY & 3 CALL MODES */}
      <CalledStudentModal
        open={showWinnerPopup && Boolean(winner)}
        student={winner}
        title="Mở hộp quà bí mật!"
        icon={<Gift className="w-5 h-5 text-amber-200 shrink-0" />}
        badge="QUÀ BÍ MẬT"
        message={winner ? <>Hộp quà bí mật đã gọi tên <strong className="text-slate-900">{winner.name}</strong>. Chúc mừng em!</> : undefined}
        onAward={callMode === 'quiz' ? undefined : (pts) => handleAwardCoins(pts)}
        awarded={hasAwarded}
        secondaryAction={callMode === 'quiz' ? { label: 'Bốc câu hỏi', icon: <Sparkles className="w-4 h-4" />, onClick: () => { setShowWinnerPopup(false); drawQuestion(); } } : undefined}
        continueLabel={callMode === 'quiz' ? 'Để sau' : 'Tiếp tục gọi em khác'}
        onClose={() => {
          setShowWinnerPopup(false);
          if (callMode !== 'quiz') { setWinner(null); setCurrentQuestion(null); }
        }}
      />
      {/* Thẻ dưới khu chơi: chỉ dùng cho chế độ câu hỏi */}
      {winner && (callMode as string) === 'quiz' && (
        <div className="bg-gradient-to-r from-rose-50 via-amber-50 to-indigo-50 border-2 border-rose-300 rounded-3xl p-5 md:p-6 shadow-md space-y-4 animate-in fade-in zoom-in-95 hover-zoom-card">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="relative shrink-0">
                <img 
                  src={winner.avatar} onError={(e) => handleAvatarImgError(e, winner?.gender, winner?.name)} 
                  alt={winner.name} 
                  className="w-16 h-16 md:w-20 md:h-20 rounded-full aspect-square object-cover object-center border-4 border-rose-400 bg-white shadow-lg"
                />
                <span className="absolute -bottom-1 -right-1 px-2 py-0.5 bg-rose-600 text-white font-black text-[12px] rounded-full">
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
                        ? 'bg-emerald-700 text-white'
                        : 'bg-rose-600 hover:bg-rose-700 text-white'
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

          {/* Mode 3: draw a question → wide-screen QuestionChallengeModal */}
          {callMode === 'quiz' && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={drawQuestion}
                className="flex-1 min-w-[240px] py-3.5 px-5 bg-purple-600 hover:bg-purple-700 text-white font-black text-sm md:text-base rounded-2xl shadow-md flex items-center justify-center gap-2.5 uppercase cursor-pointer"
              >
                <Sparkles className="w-5 h-5" />
                <span>{currentQuestion ? 'Bốc câu hỏi khác cho em này' : 'Bốc câu hỏi cho em này'}</span>
              </button>
              {currentQuestion && (
                <button
                  type="button"
                  onClick={() => setIsQuizOpen(true)}
                  className="px-4 py-3.5 bg-white hover:bg-purple-50 text-purple-800 font-bold text-sm rounded-2xl border border-purple-300 cursor-pointer"
                >
                  Xem lại câu đang mở
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <QuestionChallengeModal
        open={isQuizOpen}
        student={callMode === 'quiz' ? winner : null}
        pool={quizPool}
        drawToken={quizDrawToken}
        onClose={() => setIsQuizOpen(false)}
        closeLabel="🎁 HOÀN THÀNH & QUAY LẠI HỘP QUÀ"
        onEditQuestion={(q) => { setEditTargetQuestion(q); setIsQuestionBankOpen(true); }}
        onQuestionChange={setCurrentQuestion}
      />
      {quizSel.element}
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
