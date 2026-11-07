import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { HeadTiltQuizConfig, HeadTiltQuestion, HeadTiltQuizResult, HeadTiltAnswerRecord } from './types';
import { useHeadTracking } from './useHeadTracking';
import { 
  Volume2, VolumeX, Maximize2, Minimize2, ArrowLeft, 
  Check, X, AlertTriangle, Sparkles, Trophy, Camera, 
  HelpCircle, ChevronRight, Play, RefreshCw, Smile
} from 'lucide-react';
import { 
  playCoinSound, 
  playFanfareSound, 
  playTickSound, 
  playDeductSound,
  triggerCorrectCelebration,
  triggerWrongFeedback,
  triggerFlowerConfetti
} from '../../../../utils/audio';
import confetti from 'canvas-confetti';
import { HeadTiltReportModal } from './HeadTiltReportModal';

interface HeadTiltGamePlayViewProps {
  quiz: HeadTiltQuizConfig;
  onExit: () => void;
}

export const HeadTiltGamePlayView: React.FC<HeadTiltGamePlayViewProps> = ({
  quiz,
  onExit
}) => {
  // Game Flow States: 'guide' | 'playing' | 'completed'
  const [gameState, setGameState] = useState<'guide' | 'playing' | 'completed'>('guide');
  const [guideTab, setGuideTab] = useState<'tilt' | 'expression'>('tilt');

  // Fullscreen state
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Audio state
  const [isAudioEnabled, setIsAudioEnabled] = useState(quiz.bgMusicEnabled);

  // Active question index
  const [currentIndex, setCurrentIndex] = useState(0);

  // Prepare question list (support shuffle if configured)
  const questions: HeadTiltQuestion[] = useMemo(() => {
    let list = [...quiz.questions];
    if (quiz.shuffleQuestions) {
      list = list.sort(() => Math.random() - 0.5);
    }
    return list;
  }, [quiz]);

  const currentQuestion = questions[currentIndex] || questions[0];

  // Answer resolution states for the current question
  const [selectedAnswer, setSelectedAnswer] = useState<'A' | 'B' | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isCurrentCorrect, setIsCurrentCorrect] = useState<boolean | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(quiz.autoNextDelay || 3);

  // Aggregate results
  const [records, setRecords] = useState<HeadTiltAnswerRecord[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);

  // Auto-next timer ref
  const autoNextTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Confirm Answer Handler
  const handleConfirmAnswer = useCallback((direction: 'left' | 'right') => {
    if (isConfirmed || !currentQuestion) return;

    const answerChosen: 'A' | 'B' = direction === 'left' ? 'A' : 'B';
    setSelectedAnswer(answerChosen);
    setIsConfirmed(true);

    const isCorrect = answerChosen === currentQuestion.correctAnswer;
    setIsCurrentCorrect(isCorrect);

    if (isCorrect) {
      setCorrectCount(prev => prev + 1);
      if (isAudioEnabled) {
        triggerCorrectCelebration();
      } else {
        triggerFlowerConfetti();
      }
    } else {
      setWrongCount(prev => prev + 1);
      if (isAudioEnabled) {
        triggerWrongFeedback();
      }
    }

    // Save record
    const newRecord: HeadTiltAnswerRecord = {
      questionId: currentQuestion.id,
      questionText: currentQuestion.question,
      selectedAnswer: answerChosen,
      selectedText: answerChosen === 'A' ? currentQuestion.optionA : currentQuestion.optionB,
      correctAnswer: currentQuestion.correctAnswer,
      correctText: currentQuestion.correctAnswer === 'A' ? currentQuestion.optionA : currentQuestion.optionB,
      isCorrect
    };

    setRecords(prev => [...prev, newRecord]);

    // Start countdown for automatic question transition
    const autoDelay = quiz.autoNextDelay || 3;
    setCountdownSeconds(autoDelay);

    let remain = autoDelay;
    countdownIntervalRef.current = setInterval(() => {
      remain -= 1;
      setCountdownSeconds(remain);
      if (remain <= 0 && countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    }, 1000);

    autoNextTimerRef.current = setTimeout(() => {
      handleNextQuestion();
    }, autoDelay * 1000);
  }, [isConfirmed, currentQuestion, isAudioEnabled, quiz.autoNextDelay]);

  // Head Tracking Hook
  const {
    videoRef,
    isCameraActive,
    isModelLoaded,
    cameraError,
    tiltDirection,
    tiltAngle,
    holdProgress,
    engineType,
    startCamera,
    stopCamera,
    triggerManualTilt,
    resetTilt
  } = useHeadTracking({
    enabled: gameState === 'playing' && quiz.useCamera,
    sensitivity: quiz.tiltSensitivity || 18,
    holdDurationMs: 900,
    onConfirmed: handleConfirmAnswer
  });

  // Next Question or Finish
  const handleNextQuestion = useCallback(() => {
    if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setIsConfirmed(false);
      setIsCurrentCorrect(null);
      resetTilt();
    } else {
      // Completed all questions
      setGameState('completed');
    }
  }, [currentIndex, questions.length, resetTilt]);

  // Keyboard navigation fallback (ArrowLeft / ArrowRight)
  useEffect(() => {
    if (gameState !== 'playing' || isConfirmed) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handleConfirmAnswer('left');
      } else if (e.key === 'ArrowRight') {
        handleConfirmAnswer('right');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, isConfirmed, handleConfirmAnswer]);

  // Start Playing from Guide
  const handleStartPlaying = async () => {
    setGameState('playing');
    setCurrentIndex(0);
    setRecords([]);
    setCorrectCount(0);
    setWrongCount(0);
    setSelectedAnswer(null);
    setIsConfirmed(false);
    setIsCurrentCorrect(null);

    if (quiz.useCamera) {
      await startCamera();
    }
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(err => console.warn(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(err => console.warn(err));
      setIsFullscreen(false);
    }
  };

  // Restart Quiz
  const handleRestart = () => {
    handleStartPlaying();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full min-h-[640px] bg-slate-900 text-slate-100 flex flex-col justify-between overflow-hidden select-none"
    >
      {/* =========================================================================
       * 1. PRE-GAME GUIDE MODAL / VIEW (Page 12 trong PDF)
       * ========================================================================= */}
      {gameState === 'guide' && (
        <div className="absolute inset-0 z-40 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 flex items-center justify-center p-4">
          <div className="relative w-full max-w-xl bg-slate-800/90 backdrop-blur-xl border border-indigo-500/30 rounded-3xl p-6 md:p-8 shadow-2xl text-center flex flex-col items-center">
            
            {/* Header Icon */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-400 to-rose-500 flex items-center justify-center text-white mb-3 shadow-lg shadow-amber-500/20">
              <Smile className="w-9 h-9" />
            </div>

            <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-1">
              Cách chơi Quiz Nghiêng Đầu
            </h2>
            <p className="text-sm font-bold text-indigo-300 mb-5">
              {quiz.title}
            </p>

            {/* Two Tabs: Nghiêng đầu vs Biểu cảm mặt */}
            <div className="inline-flex items-center gap-1.5 p-1 bg-slate-900/80 rounded-xl mb-6 border border-slate-700/60">
              <button
                type="button"
                onClick={() => setGuideTab('tilt')}
                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  guideTab === 'tilt'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                📲 Nghiêng đầu
              </button>
              <button
                type="button"
                onClick={() => setGuideTab('expression')}
                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  guideTab === 'expression'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                😊 Biểu cảm mặt
              </button>
            </div>

            {/* Guide List matching exactly Page 12 */}
            <div className="w-full text-left space-y-3.5 mb-6 text-xs md:text-sm">
              <div className="flex items-start gap-3 bg-slate-700/40 p-3.5 rounded-2xl border border-slate-600/40">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black shrink-0 mt-0.5">
                  ✓
                </div>
                <div>
                  <div className="font-bold text-white mb-0.5">1. Cho phép truy cập camera</div>
                  <div className="text-slate-300 text-xs">
                    Trò chơi cần camera để nhận diện khuôn mặt. Bấm &quot;Cho phép&quot; (Allow) ở góc trên trình duyệt.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-700/40 p-3.5 rounded-2xl border border-slate-600/40">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black shrink-0 mt-0.5">
                  ✓
                </div>
                <div>
                  <div className="font-bold text-white mb-0.5">2. Nghiêng đầu để chọn đáp án</div>
                  <div className="text-slate-300 text-xs">
                    Nghiêng sang trái để chọn đáp án A, nghiêng sang phải để chọn đáp án B. Cần nghiêng hơn {quiz.tiltSensitivity || 20}° để xác nhận.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-700/40 p-3.5 rounded-2xl border border-slate-600/40">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black shrink-0 mt-0.5">
                  ✓
                </div>
                <div>
                  <div className="font-bold text-white mb-0.5">3. (Tùy chọn) Mỗi câu cho một học sinh khác nhau</div>
                  <div className="text-slate-300 text-xs">
                    Sau mỗi câu, học sinh tiếp theo lên thay thế. Giáo viên có thể bấm trực tiếp vào đáp án nếu muốn.
                  </div>
                </div>
              </div>
            </div>

            {/* Total questions count badge */}
            <div className="text-xs font-black uppercase text-indigo-400 tracking-wider mb-5">
              Gồm {questions.length} câu hỏi
            </div>

            {/* Bottom Buttons */}
            <div className="w-full flex items-center gap-3">
              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex-1 py-3 px-4 rounded-2xl border border-slate-600 bg-slate-700/50 hover:bg-slate-700 text-slate-200 font-bold transition-all text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
                TOÀN MÀN HÌNH
              </button>

              <button
                type="button"
                onClick={handleStartPlaying}
                className="flex-2 py-3 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-slate-950 font-black shadow-lg shadow-emerald-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                SẴN SÀNG CHƠI!
              </button>
            </div>

            <button
              type="button"
              onClick={onExit}
              className="mt-4 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              ← Quay lại danh sách bài học
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
       * 2. IN-GAME SCREEN (Pages 13 - 15 trong PDF)
       * ========================================================================= */}
      {gameState === 'playing' && (
        <div className="w-full h-full flex flex-col justify-between p-3 md:p-5 relative">
          
          {/* HEADER BAR */}
          <div className="w-full flex items-center justify-between gap-3 bg-slate-800/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-700/60 shadow-lg shrink-0">
            {/* Left: Question pill & Helper */}
            <div className="flex items-center gap-3">
              <div className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black text-xs md:text-sm tracking-wide shadow-md shadow-indigo-600/20">
                Câu {currentIndex + 1}/{questions.length}
              </div>
              <div className="hidden sm:flex items-center gap-1 text-xs font-bold text-amber-300">
                <span>👈👉</span>
                <span>Bấm hoặc nghiêng đầu để chọn</span>
              </div>
            </div>

            {/* Right: Audio toggle, Fullscreen, Scores, and Next Button */}
            <div className="flex items-center gap-2 md:gap-3">
              {/* Audio toggle */}
              <button
                type="button"
                onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-700/70 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Bật/Tắt nhạc"
              >
                {isAudioEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
                <span className="hidden md:inline">Nhạc: {isAudioEnabled ? 'BẬT' : 'TẮT'}</span>
              </button>

              {/* Fullscreen */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1.5 rounded-xl bg-slate-700/70 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                title="Toàn màn hình"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>

              {/* Real-time score tags */}
              <div className="flex items-center gap-1.5 text-xs font-black">
                <span className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ✓ {correctCount}
                </span>
                <span className="px-2 py-1 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  ✗ {wrongCount}
                </span>
              </div>

              {/* Next Question Button (Visible when answered) */}
              {isConfirmed && (
                <button
                  type="button"
                  onClick={handleNextQuestion}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black shadow-lg shadow-purple-600/30 animate-pulse transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span>CÂU TIẾP ({countdownSeconds})</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* QUESTION CARD (GIỮA MÀN HÌNH - TOP HALF) */}
          <div className="my-3 mx-auto w-full max-w-4xl bg-white rounded-3xl p-5 md:p-7 shadow-xl border border-slate-100 text-slate-900 text-center flex flex-col items-center justify-center shrink-0">
            <h1 className="text-xl md:text-3xl font-black text-slate-800 tracking-tight leading-relaxed">
              {currentQuestion?.question}
            </h1>
            {currentQuestion?.image && (
              <img
                src={currentQuestion.image}
                alt="Question visual"
                className="mt-3 max-h-40 rounded-xl object-contain shadow-sm border border-slate-200"
              />
            )}
          </div>

          {/* TWO ANSWER HALVES + CIRCULAR WEBCAM CONTAINER */}
          <div className="relative flex-1 w-full min-h-[300px] flex items-stretch gap-4 pb-2">
            
            {/* =========================================================================
             * LEFT ANSWER BLOCK (ĐÁP ÁN A - NGHIÊNG TRÁI)
             * Màu xanh dương nhạt #38bdf8 / bg-sky-400
             * ========================================================================= */}
            <div
              onClick={() => !isConfirmed && handleConfirmAnswer('left')}
              className={`flex-1 rounded-3xl p-6 md:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 relative overflow-hidden ${
                // Highlight when tilted left or selected
                tiltDirection === 'left' && !isConfirmed
                  ? 'bg-sky-400 ring-8 ring-cyan-300 shadow-2xl scale-[1.02]'
                  : isConfirmed && currentQuestion.correctAnswer === 'A'
                    ? 'bg-emerald-500 ring-8 ring-emerald-300 shadow-2xl'
                    : isConfirmed && selectedAnswer === 'A' && !isCurrentCorrect
                      ? 'bg-rose-500 ring-4 ring-rose-400 opacity-80'
                      : 'bg-sky-400 hover:bg-sky-500 shadow-lg'
              }`}
            >
              {/* Tilt indicator hand */}
              <div className="text-3xl md:text-5xl mb-3 animate-bounce">
                👈
              </div>

              {/* Answer label */}
              <div className="text-xs md:text-sm font-black uppercase text-white/90 tracking-wider mb-1">
                Đáp án A (Nghiêng trái)
              </div>

              {/* Answer text */}
              <div className="text-2xl md:text-4xl font-black text-white tracking-tight drop-shadow-sm">
                {currentQuestion?.optionA}
              </div>

              {/* Hold progress bar on the left block */}
              {tiltDirection === 'left' && !isConfirmed && (
                <div className="absolute bottom-4 left-6 right-6 h-2 rounded-full bg-white/30 overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-100"
                    style={{ width: `${holdProgress}%` }}
                  ></div>
                </div>
              )}
            </div>

            {/* =========================================================================
             * RIGHT ANSWER BLOCK (ĐÁP ÁN B - NGHIÊNG PHẢI)
             * Màu cam/đỏ #f97316 / bg-orange-500
             * ========================================================================= */}
            <div
              onClick={() => !isConfirmed && handleConfirmAnswer('right')}
              className={`flex-1 rounded-3xl p-6 md:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 relative overflow-hidden ${
                // Highlight when tilted right or selected
                tiltDirection === 'right' && !isConfirmed
                  ? 'bg-orange-500 ring-8 ring-amber-300 shadow-2xl scale-[1.02]'
                  : isConfirmed && currentQuestion.correctAnswer === 'B'
                    ? 'bg-emerald-500 ring-8 ring-emerald-300 shadow-2xl'
                    : isConfirmed && selectedAnswer === 'B' && !isCurrentCorrect
                      ? 'bg-rose-500 ring-4 ring-rose-400 opacity-80'
                      : 'bg-orange-500 hover:bg-orange-600 shadow-lg'
              }`}
            >
              {/* Tilt indicator hand */}
              <div className="text-3xl md:text-5xl mb-3 animate-bounce">
                👉
              </div>

              {/* Answer label */}
              <div className="text-xs md:text-sm font-black uppercase text-white/90 tracking-wider mb-1">
                Đáp án B (Nghiêng phải)
              </div>

              {/* Answer text */}
              <div className="text-2xl md:text-4xl font-black text-white tracking-tight drop-shadow-sm">
                {currentQuestion?.optionB}
              </div>

              {/* Hold progress bar on the right block */}
              {tiltDirection === 'right' && !isConfirmed && (
                <div className="absolute bottom-4 left-6 right-6 h-2 rounded-full bg-white/30 overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-100"
                    style={{ width: `${holdProgress}%` }}
                  ></div>
                </div>
              )}
            </div>

            {/* =========================================================================
             * CIRCULAR WEBCAM CAMERA FRAME (CHÍNH GIỮA 2 ĐÁP ÁN)
             * Vòng tròn đè lên giữa 2 khối đáp án đúng như Page 13-15
             * ========================================================================= */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none flex flex-col items-center">
              
              <div className="relative flex items-center justify-center">
                {/* SVG Circular Progress Ring for Hold Dwell Time */}
                {!isConfirmed && isCameraActive && tiltDirection !== 'none' && (
                  <svg className="absolute -inset-3 w-[calc(100%+24px)] h-[calc(100%+24px)] -rotate-90 z-10 pointer-events-none">
                    <circle
                      cx="50%"
                      cy="50%"
                      r="46%"
                      fill="none"
                      stroke={tiltDirection === 'left' ? '#38bdf8' : '#fb923c'}
                      strokeWidth="6"
                      strokeDasharray="290"
                      strokeDashoffset={290 - (290 * holdProgress) / 100}
                      strokeLinecap="round"
                      className="transition-all duration-75"
                    />
                  </svg>
                )}

                <div 
                  className={`relative w-40 h-40 md:w-52 md:h-52 rounded-full border-4 border-white shadow-2xl overflow-hidden transition-all duration-300 ${
                    isConfirmed && isCurrentCorrect
                      ? 'ring-8 ring-emerald-400 scale-105'
                      : isConfirmed && !isCurrentCorrect
                        ? 'ring-8 ring-rose-500 scale-105'
                        : tiltDirection === 'left'
                          ? 'ring-8 ring-cyan-300 -rotate-12'
                          : tiltDirection === 'right'
                            ? 'ring-8 ring-amber-400 rotate-12'
                            : 'ring-4 ring-slate-700/60'
                  }`}
                >
                  {/* Live Camera Video stream */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100 bg-slate-800"
                  />

                  {/* Horizontal Level Reference Line (Subtle) */}
                  {!isConfirmed && isCameraActive && (
                    <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-[1px] bg-white/20 pointer-events-none"></div>
                  )}

                  {/* Camera Fallback / Not Active Warning */}
                  {!isCameraActive && (
                    <div className="absolute inset-0 bg-slate-800 flex flex-col items-center justify-center p-3 text-center pointer-events-auto">
                      <Camera className="w-8 h-8 text-slate-400 mb-1" />
                      <span className="text-[10px] font-bold text-slate-300 leading-tight">
                        {cameraError ? cameraError : 'Camera chưa bật'}
                      </span>
                      <button
                        type="button"
                        onClick={() => startCamera()}
                        className="mt-2 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-black shadow-md cursor-pointer transition-all active:scale-95 flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Bật Camera ngay
                      </button>
                      <span className="text-[9px] text-amber-300 mt-1.5">
                        (Hoặc bấm vào đáp án để chọn)
                      </span>
                    </div>
                  )}

                  {/* Overlaid Feedback State when confirmed (Pages 14 & 15) */}
                  {isConfirmed && (
                    <div 
                      className={`absolute inset-0 flex items-center justify-center animate-in zoom-in-75 ${
                        isCurrentCorrect 
                           ? 'bg-emerald-500/90 text-white' 
                          : 'bg-rose-500/90 text-white'
                      }`}
                    >
                      {isCurrentCorrect ? (
                        <Check className="w-24 h-24 stroke-[3]" />
                      ) : (
                        <div className="text-7xl font-black">!</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Tilt degree & Hold progress ring */}
              {!isConfirmed && isCameraActive && (
                <div className="mt-2.5 px-3.5 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 backdrop-blur-md text-[11px] font-black tracking-wider flex items-center gap-1.5 text-white shadow-lg pointer-events-auto">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300 font-mono">
                    {engineType === 'mediapipe' ? 'AI MediaPipe' : 'AI Native CV'}
                  </span>
                  {tiltDirection === 'left' ? (
                    <span className="text-cyan-400">👈 Nghiêng trái: {Math.abs(tiltAngle)}° (Giữ: {holdProgress}%)</span>
                  ) : tiltDirection === 'right' ? (
                    <span className="text-amber-400">👉 Nghiêng phải: {Math.abs(tiltAngle)}° (Giữ: {holdProgress}%)</span>
                  ) : (
                    <span className="text-slate-300">👀 Giữ thẳng đầu ({tiltAngle}°) để sẵn sàng</span>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* BOTTOM BAR: THOÁT & ĐIỀU KHIỂN DỰ PHÒNG */}
          <div className="w-full flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onExit}
              className="py-1.5 px-3.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              THOÁT
            </button>

            {/* Quick Tilt Buttons for Teachers / Students */}
            {!isConfirmed && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => triggerManualTilt('left')}
                  className="px-3 py-1 bg-sky-500/30 hover:bg-sky-500/50 border border-sky-400/50 text-sky-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  👈 Nghiêng Trái (A)
                </button>
                <button
                  type="button"
                  onClick={() => triggerManualTilt('right')}
                  className="px-3 py-1 bg-orange-500/30 hover:bg-orange-500/50 border border-orange-400/50 text-orange-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  👉 Nghiêng Phải (B)
                </button>
              </div>
            )}

            <div className="text-[11px] text-slate-400 font-medium hidden sm:block">
              💡 Nghiêng đầu giữ 1s • Hoặc bấm phím mũi tên ⬅️ ➡️
            </div>
          </div>

        </div>
      )}

      {/* =========================================================================
       * 3. COMPLETED REPORT MODAL (Pages 16 - 17)
       * ========================================================================= */}
      {gameState === 'completed' && (
        <HeadTiltReportModal
          result={{
            quizTitle: quiz.title,
            totalQuestions: questions.length,
            correctCount,
            wrongCount,
            records,
            completedAt: new Date().toISOString()
          }}
          onRestart={handleRestart}
          onExit={onExit}
        />
      )}
    </div>
  );
};
