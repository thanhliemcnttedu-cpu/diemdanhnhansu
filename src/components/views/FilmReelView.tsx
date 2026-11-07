import React, { useState, useEffect, useRef } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { Student, QuestionItem } from '../../types';
import { 
  Film, Play, Award, RotateCcw, Sparkles, Trash2, 
  Volume2, ArrowDown, ArrowUp, Check, HelpCircle, 
  BookOpen, ChevronRight, Clock, ShieldCheck, Eye, EyeOff, Edit3,
  RefreshCw, Maximize2, X, CheckSquare
} from 'lucide-react';
import { 
  playTickSound, 
  playFanfareSound, 
  playCoinSound, 
  triggerCorrectCelebration, 
  triggerWrongFeedback 
} from '../../utils/audio';
import confetti from 'canvas-confetti';
import { QuestionBankModal } from '../modals/QuestionBankModal';
import { loadQuizBank, saveQuizBank } from '../../utils/quizParser';

const FRAME_WIDTH = 155; // Width of each 35mm film frame
const FRAME_GAP = 14; // Gap between frames
const TOTAL_FRAME_SPACE = FRAME_WIDTH + FRAME_GAP; // 169px

export const FilmReelView: React.FC = () => {
  const { classes, activeClassId, currentClassStudents, awardPoints, quizBank, updateQuizBank } = useClassroom();
  const currentClass = classes.find(c => c.id === activeClassId);
  
  // 3 Modes: 'random' | 'coins' | 'quiz'
  const [callMode, setCallMode] = useState<'random' | 'coins' | 'quiz'>('random');

  // Selectable Spin Duration (Default: 4 seconds as requested)
  const [spinDuration, setSpinDuration] = useState<number>(4);

  const [isRolling, setIsRolling] = useState(false);
  const [winner, setWinner] = useState<Student | null>(null);
  const [rewardXu, setRewardXu] = useState(2);
  const [hasAwarded, setHasAwarded] = useState(false);

  // Settings & History
  const [autoExclude, setAutoExclude] = useState(true);
  const [excludedStudentIds, setExcludedStudentIds] = useState<string[]>([]);
  const [history, setHistory] = useState<Array<{ name: string; avatar: string; time: string; points: number }>>([]);

  // Animated sliding strip state (Transits from Right to Left)
  const [translateX, setTranslateX] = useState<number>(0);
  const [reelStudents, setReelStudents] = useState<Student[]>([]);

  // Question challenge state for Mode 3 (Gọi tên + Trả lời câu hỏi)
  const [selectedQuizSubject, setSelectedQuizSubject] = useState<string>('all');
  const [currentQuestion, setCurrentQuestion] = useState<QuestionItem | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showTeacherKey, setShowTeacherKey] = useState(false);
  const [isAnswerCorrect, setIsAnswerCorrect] = useState<boolean | null>(null);
  const [oralStatus, setOralStatus] = useState<'pending' | 'correct' | 'incorrect'>('pending');
  const [customOralPoints, setCustomOralPoints] = useState<number>(2);
  const [isQuestionBankOpen, setIsQuestionBankOpen] = useState(false);
  const [editTargetQuestion, setEditTargetQuestion] = useState<QuestionItem | null>(null);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string } | null>(null);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);

  // States for Interactive Advanced Question Types:
  const [selectedMultiOptions, setSelectedMultiOptions] = useState<number[]>([]);
  const [selectedTrueFalse, setSelectedTrueFalse] = useState<boolean | null>(null);
  const [filledBlankWords, setFilledBlankWords] = useState<Record<number, string>>({});
  const [shuffledSequence, setShuffledSequence] = useState<string[]>([]);
  const [shuffledRightMatching, setShuffledRightMatching] = useState<Array<{ id: number; text: string }>>([]);
  const [selectedLeftMatchIndex, setSelectedLeftMatchIndex] = useState<number | null>(null);
  const [userMatches, setUserMatches] = useState<Record<number, number>>({}); // leftIdx -> rightId

  // Available subjects in quizBank
  const quizSubjects = Array.from(new Set(quizBank.map(q => q.subject || 'Tổng hợp'))).filter(Boolean);

  const getCandidateQuestions = (subject = selectedQuizSubject) => {
    if (subject === 'all') return quizBank;
    const filtered = quizBank.filter(q => (q.subject || 'Tổng hợp') === subject);
    return filtered.length > 0 ? filtered : quizBank;
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTickFrameRef = useRef<number>(-1);

  // Eligible pool of students
  const activeStudents = currentClassStudents.filter(s => !excludedStudentIds.includes(s.id));
  const pool = activeStudents.length > 0 ? activeStudents : currentClassStudents;

  // Initialize reel with repeated students for continuous multiple visible frames display
  useEffect(() => {
    if (pool.length > 0 && reelStudents.length === 0) {
      const initial: Student[] = [];
      while (initial.length < 35) {
        initial.push(...pool);
      }
      setReelStudents(initial.slice(0, 45));
    }
  }, [pool, reelStudents.length]);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Keyboard shortcut: Space to roll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isRolling && pool.length > 0) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        e.preventDefault();
        startFilmReel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRolling, pool, spinDuration]);

  // START FILM REEL: Slides from RIGHT to LEFT with selected duration (4s default)
  const startFilmReel = () => {
    if (isRolling || pool.length === 0) return;

    setIsRolling(true);
    setWinner(null);
    setHasAwarded(false);
    setSelectedOption(null);
    setShowTeacherKey(false);
    setIsAnswerCorrect(null);
    setOralStatus('pending');
    setCustomOralPoints(2);

    // Pick random winner from eligible pool
    const selectedWinner = pool[Math.floor(Math.random() * pool.length)];

    // Build strip sequence of 65 frames with winner located at index 50
    const sequenceLength = 65;
    const targetIndex = 50;
    const newReel: Student[] = [];

    for (let i = 0; i < sequenceLength; i++) {
      if (i === targetIndex) {
        newReel.push(selectedWinner);
      } else {
        const randomOther = pool[Math.floor(Math.random() * pool.length)];
        newReel.push(randomOther);
      }
    }
    setReelStudents(newReel);

    // Calculate center of viewport
    const containerWidth = containerRef.current ? containerRef.current.clientWidth : 720;
    const centerPoint = containerWidth / 2;

    // Center of frame i is: i * TOTAL_FRAME_SPACE + (FRAME_WIDTH / 2)
    // Moving from right to left means translateX starts at initial position and decreases to finalOffset
    const startOffset = centerPoint - (FRAME_WIDTH / 2); // Initial Frame 0 at center
    const finalOffset = centerPoint - (targetIndex * TOTAL_FRAME_SPACE + FRAME_WIDTH / 2); // Final offset (negative)
    setTranslateX(startOffset);

    const startTime = performance.now();
    const duration = spinDuration * 1000; // 4000ms standard
    lastTickFrameRef.current = -1;

    // Authentic cubic bezier easing curve: rapid start, gradual silky stop
    const easeOutCubic = (t: number): number => {
      return 1 - Math.pow(1 - t, 3.6);
    };

    const animateRoll = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      // Slides from Right to Left as translateX decreases
      const currentX = startOffset + (finalOffset - startOffset) * easedProgress;
      setTranslateX(currentX);

      // Play tick sound when crossing each film frame boundary
      const currentPassedIndex = Math.floor(Math.abs(currentX - startOffset) / TOTAL_FRAME_SPACE);
      if (currentPassedIndex !== lastTickFrameRef.current) {
        lastTickFrameRef.current = currentPassedIndex;
        playTickSound(680 + (currentPassedIndex % 6) * 40);
      }

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animateRoll);
      } else {
        // Animation finished at exact center!
        setTranslateX(finalOffset);
        setIsRolling(false);
        setWinner(selectedWinner);
        playFanfareSound();
        confetti({ particleCount: 95, spread: 85, origin: { y: 0.6 } });

        // Record history
        const nowTime = new Date();
        const timeStr = `${String(nowTime.getHours()).padStart(2, '0')}:${String(nowTime.getMinutes()).padStart(2, '0')}`;
        setHistory(prev => [
          { name: selectedWinner.name, avatar: selectedWinner.avatar, time: timeStr, points: selectedWinner.points },
          ...prev
        ]);

        // Auto exclude if checked
        if (autoExclude) {
          setExcludedStudentIds(prev => [...prev, selectedWinner.id]);
        }

        // Ở Chế độ 3 (Trả lời câu hỏi): Không tự động mở câu hỏi ngay, chờ giáo viên bấm "Bốc câu hỏi ngẫu nhiên"
        setIsQuestionModalOpen(false);
        setCurrentQuestion(null);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animateRoll);
  };

  // Helper: Khởi tạo dữ liệu tương tác cho câu hỏi mới
  const setupQuestionState = (q: QuestionItem) => {
    setCurrentQuestion(q);
    setSelectedOption(null);
    setShowTeacherKey(false);
    setIsAnswerCorrect(null);
    setOralStatus('pending');
    setCustomOralPoints(q.pointsReward || 2);
    setHasAwarded(false);

    // Init interactive states
    setSelectedMultiOptions([]);
    setSelectedTrueFalse(null);
    setFilledBlankWords({});
    setSelectedLeftMatchIndex(null);
    setUserMatches({});

    if (q.type === 'sequence_order' && q.sequenceItems) {
      // Xáo trộn các bước
      const copy = [...q.sequenceItems];
      const shuffled = copy.sort(() => Math.random() - 0.5);
      setShuffledSequence(shuffled);
    } else {
      setShuffledSequence([]);
    }

    if (q.type === 'matching' && q.matchingPairs) {
      // Xáo trộn Cột B
      const rightItems = q.matchingPairs.map((pair, idx) => ({ id: idx, text: pair.right }));
      setShuffledRightMatching(rightItems.sort(() => Math.random() - 0.5));
    } else {
      setShuffledRightMatching([]);
    }
  };

  // Mở câu hỏi ngẫu nhiên ở chế độ MÀN HÌNH RỘNG theo yêu cầu người dùng
  const handleOpenRandomQuestion = (subject = selectedQuizSubject) => {
    const candidates = getCandidateQuestions(subject);
    if (candidates.length === 0) {
      setIsQuestionBankOpen(true);
      return;
    }
    const q = candidates[Math.floor(Math.random() * candidates.length)];
    setupQuestionState(q);
    setIsQuestionModalOpen(true);
  };

  const handleChangeSubject = (newSubject: string) => {
    setSelectedQuizSubject(newSubject);
    const candidates = getCandidateQuestions(newSubject);
    if (candidates.length > 0) {
      const q = candidates[Math.floor(Math.random() * candidates.length)];
      setupQuestionState(q);
    }
  };

  const handleAward = (amount = rewardXu, reason = 'Thưởng gọi tên qua Cuộn Phim 35mm') => {
    if (!winner || hasAwarded) return;
    const targetSub = currentQuestion?.subject || 'Ghi chung';
    awardPoints([winner.id], amount, reason, targetSub);
    playCoinSound();
    setHasAwarded(true);
    confetti({ particleCount: 50, spread: 60 });
  };

  // 1. Trắc nghiệm đơn: ĐÚNG được cộng xu, SAI KHÔNG ĐƯỢC CỘNG XU
  const handleSelectOption = (idx: number) => {
    if (!currentQuestion || selectedOption !== null || !winner) return;
    setSelectedOption(idx);
    const correct = idx === currentQuestion.correctOptionIndex;
    setIsAnswerCorrect(correct);

    if (correct) {
      triggerCorrectCelebration();
      const ptsToAward = customOralPoints || currentQuestion.pointsReward || 2;
      handleAward(
        ptsToAward, 
        `Trả lời đúng trắc nghiệm môn ${currentQuestion.subject || 'Tổng hợp'}`
      );
    } else {
      setShowTeacherKey(true);
      triggerWrongFeedback();
    }
  };

  // 2. Trắc nghiệm nhiều đáp án (Multi-select submit)
  const handleSubmitMultiSelect = () => {
    if (!currentQuestion || !winner || isAnswerCorrect !== null) return;
    const correctIndices = (currentQuestion.correctOptionIndices || []).slice().sort();
    const userIndices = selectedMultiOptions.slice().sort();

    const isCorrect = correctIndices.length === userIndices.length &&
      correctIndices.every((val, idx) => val === userIndices[idx]);

    setIsAnswerCorrect(isCorrect);
    if (isCorrect) {
      triggerCorrectCelebration();
      const pts = customOralPoints || currentQuestion.pointsReward || 3;
      handleAward(pts, `Trả lời đúng câu nhiều đáp án môn ${currentQuestion.subject || 'Tổng hợp'}`);
    } else {
      setShowTeacherKey(true);
      triggerWrongFeedback();
    }
  };

  // 3. Đúng / Sai
  const handleSelectTrueFalse = (userChoice: boolean) => {
    if (!currentQuestion || selectedTrueFalse !== null || !winner) return;
    setSelectedTrueFalse(userChoice);
    const correct = userChoice === (currentQuestion.isTrue ?? true);
    setIsAnswerCorrect(correct);

    if (correct) {
      triggerCorrectCelebration();
      const pts = customOralPoints || currentQuestion.pointsReward || 2;
      handleAward(pts, `Trả lời đúng câu Đúng/Sai môn ${currentQuestion.subject || 'Tổng hợp'}`);
    } else {
      setShowTeacherKey(true);
      triggerWrongFeedback();
    }
  };

  // 4. Kéo thả / Điền chỗ trống
  const handleSubmitFillBlank = () => {
    if (!currentQuestion || !winner || isAnswerCorrect !== null) return;
    const expected = currentQuestion.blankAnswers || [];
    let allCorrect = true;
    for (let i = 0; i < expected.length; i++) {
      const userVal = (filledBlankWords[i] || '').trim().toLowerCase();
      const expVal = (expected[i] || '').trim().toLowerCase();
      if (userVal !== expVal) {
        allCorrect = false;
        break;
      }
    }

    setIsAnswerCorrect(allCorrect);
    if (allCorrect) {
      triggerCorrectCelebration();
      const pts = customOralPoints || currentQuestion.pointsReward || 3;
      handleAward(pts, `Điền đúng chỗ trống môn ${currentQuestion.subject || 'Tổng hợp'}`);
    } else {
      setShowTeacherKey(true);
      triggerWrongFeedback();
    }
  };

  // 5. Sắp xếp thứ tự
  const handleSubmitSequence = () => {
    if (!currentQuestion || !winner || isAnswerCorrect !== null) return;
    const expected = currentQuestion.sequenceItems || [];
    const isCorrect = expected.length === shuffledSequence.length &&
      expected.every((item, idx) => item === shuffledSequence[idx]);

    setIsAnswerCorrect(isCorrect);
    if (isCorrect) {
      triggerCorrectCelebration();
      const pts = customOralPoints || currentQuestion.pointsReward || 4;
      handleAward(pts, `Sắp xếp đúng thứ tự môn ${currentQuestion.subject || 'Tổng hợp'}`);
    } else {
      setShowTeacherKey(true);
      triggerWrongFeedback();
    }
  };

  // 6. Nối cột A với cột B
  const handleSubmitMatching = () => {
    if (!currentQuestion || !winner || isAnswerCorrect !== null) return;
    const pairs = currentQuestion.matchingPairs || [];
    let isCorrect = true;

    for (let i = 0; i < pairs.length; i++) {
      if (userMatches[i] !== i) {
        isCorrect = false;
        break;
      }
    }

    setIsAnswerCorrect(isCorrect);
    if (isCorrect) {
      triggerCorrectCelebration();
      const pts = customOralPoints || currentQuestion.pointsReward || 4;
      handleAward(pts, `Nối đúng cột A-B môn ${currentQuestion.subject || 'Tổng hợp'}`);
    } else {
      setShowTeacherKey(true);
      triggerWrongFeedback();
    }
  };

  // Cho phép làm lại câu hỏi hiện tại
  const handleRetryQuestion = () => {
    if (!currentQuestion) return;
    setupQuestionState(currentQuestion);
  };

  // Tự luận: Giáo viên xác nhận cộng xu nếu học sinh trả lời đúng
  const handleConfirmOralCorrect = (pts?: number) => {
    if (!winner || !currentQuestion || hasAwarded) return;
    const finalPts = pts ?? customOralPoints ?? currentQuestion.pointsReward ?? 2;
    setOralStatus('correct');
    handleAward(
      finalPts, 
      `Giáo viên xác nhận trả lời đúng câu tự luận môn ${currentQuestion.subject || 'Tổng hợp'}`
    );
    playFanfareSound();
    confetti({ particleCount: 65, spread: 75 });
  };

  // Tự luận: Giáo viên xác nhận trả lời sai / chưa đạt -> KHÔNG CỘNG XU
  const handleConfirmOralIncorrect = () => {
    if (!winner || !currentQuestion) return;
    setOralStatus('incorrect');
    setShowTeacherKey(true);
    playTickSound(260);
  };

  // Đặt lại trạng thái chấm tự luận
  const handleResetOralEvaluation = () => {
    setOralStatus('pending');
    setShowTeacherKey(false);
  };

  const handlePickAnotherQuestion = () => {
    const candidates = getCandidateQuestions(selectedQuizSubject);
    if (candidates.length === 0) return;
    const remaining = candidates.filter(q => q.id !== currentQuestion?.id);
    const poolQ = remaining.length > 0 ? remaining : candidates;
    const q = poolQ[Math.floor(Math.random() * poolQ.length)];
    setupQuestionState(q);
  };

  const handleRestoreStudent = (id: string) => {
    setExcludedStudentIds(prev => prev.filter(x => x !== id));
  };

  const handleRestoreAll = () => {
    setExcludedStudentIds([]);
  };

  const excludedStudents = currentClassStudents.filter(s => excludedStudentIds.includes(s.id));

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* 1. TOP CONTROL BAR: 3 CALL MODES + SPIN DURATION (4s Standard) */}
      <div className="bg-white rounded-3xl p-4 md:p-5 border border-slate-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold">
              <Film className="w-5 h-5 text-amber-700" />
            </span>
            <h2 className="text-base md:text-lg font-black text-slate-900 uppercase tracking-wide">
              CUỘN PHIM GỌI TÊN ĐIỆN ẢNH 35MM
            </h2>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Dải phim quay mượt mà từ Phải sang Trái • Hiển thị nhiều học sinh • 3 Chế độ gọi tên & Bộ đề thi linh hoạt
          </p>
        </div>

        {/* 3 Call Modes Switcher (User request: 1. Ngẫu nhiên, 2. Tặng xu, 3. Trả lời câu hỏi) */}
        <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setCallMode('random')}
            className={`px-2 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-black transition-all cursor-pointer uppercase text-center ${
              callMode === 'random' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">1. Gọi Ngẫu Nhiên</span>
            <span className="sm:hidden">1. NGẪU NHIÊN</span>
          </button>
          <button
            type="button"
            onClick={() => setCallMode('coins')}
            className={`px-2 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-black transition-all cursor-pointer uppercase text-center ${
              callMode === 'coins' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">2. Gọi + Tặng Xu</span>
            <span className="sm:hidden">2. TẶNG XU</span>
          </button>
          <button
            type="button"
            onClick={() => setCallMode('quiz')}
            className={`px-2 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-black transition-all cursor-pointer uppercase text-center ${
              callMode === 'quiz' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">3. Gọi + Trả Lời Câu Hỏi</span>
            <span className="sm:hidden">3. CÂU HỎI</span>
          </button>
        </div>

        {/* Mode 3 Subject Selector (User requirement: lựa chọn bộ câu hỏi ngẫu nhiên từ kho đề hoặc theo môn học vừa tải lên) */}
        {callMode === 'quiz' && (
          <div className="flex items-center gap-1.5 bg-purple-50 px-3 py-1.5 rounded-2xl border border-purple-200 animate-in fade-in duration-150">
            <BookOpen className="w-4 h-4 text-purple-700 shrink-0" />
            <span className="text-[11px] font-black uppercase text-purple-900 shrink-0">BỘ ĐỀ:</span>
            <select
              value={selectedQuizSubject}
              onChange={(e) => handleChangeSubject(e.target.value)}
              className="bg-transparent text-xs font-black text-purple-900 focus:outline-none cursor-pointer"
            >
              <option value="all">🎲 Ngẫu nhiên toàn kho ({quizBank.length} câu)</option>
              {quizSubjects.map(sub => {
                const count = quizBank.filter(q => (q.subject || 'Tổng hợp') === sub).length;
                return (
                  <option key={sub} value={sub}>
                    📖 Môn {sub} ({count} câu)
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              onClick={() => {
                setEditTargetQuestion(null);
                setIsQuestionBankOpen(true);
              }}
              className="ml-1 px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-[10px] font-black uppercase cursor-pointer transition-all shadow-xs"
              title="Mở kho đề để tải lên bộ đề theo môn học mới"
            >
              + Nạp Bộ Đề Môn
            </button>
          </div>
        )}

        {/* Duration selection (User request: lựa chọn 4 giây) */}
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200">
          <Clock className="w-4 h-4 text-amber-600" />
          <span className="text-[11px] font-bold text-slate-500">Thời gian quay:</span>
          <select
            value={spinDuration}
            onChange={(e) => setSpinDuration(parseInt(e.target.value) || 4)}
            className="bg-transparent text-xs font-black text-indigo-700 focus:outline-none cursor-pointer"
          >
            <option value={3}>3 giây</option>
            <option value={4}>4 giây (Chuẩn)</option>
            <option value={5}>5 giây</option>
            <option value={6}>6 giây</option>
          </select>
        </div>
      </div>

      {/* Main Grid: Left Stage (Film Reel Strip) & Right Stage (History) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Authentic 35mm Cinema Film Reel Stage */}
        <div className="lg:col-span-8 space-y-5">
          
          {/* Main Film Projector Strip Box */}
          <div className="bg-slate-950 rounded-3xl p-4 md:p-6 shadow-2xl border-4 border-amber-900/60 relative select-none hover-zoom-card overflow-hidden">
            
            {/* Top Header Label */}
            <div className="flex items-center justify-between pb-3 px-2 text-amber-400">
              <div className="flex items-center gap-2">
                <Film className="w-5 h-5 text-amber-400 animate-pulse" />
                <span className="font-mono text-xs font-black uppercase tracking-widest text-amber-300">
                  CUỘN PHIM TOÀN CẢNH • KODAK VISION3 35MM
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {isRolling ? `Đang trượt từ phải sang trái (${spinDuration}s)...` : 'Sẵn sàng quay (Phím cách)'}
              </span>
            </div>

            {/* Mode 3 Subject Banner Indicator */}
            {callMode === 'quiz' && (
              <div className="mb-3 py-1.5 px-3 rounded-xl bg-purple-950/80 border border-purple-500/40 flex items-center justify-between text-[11px] text-purple-200">
                <div className="flex items-center gap-1.5 font-bold flex-wrap">
                  <BookOpen className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>BỘ ĐỀ ĐANG DÙNG:</span>
                  <span className="px-2 py-0.5 rounded bg-purple-700 text-white font-black">
                    {selectedQuizSubject === 'all' ? '🎲 Ngẫu nhiên toàn kho' : `📖 Môn ${selectedQuizSubject}`}
                  </span>
                  <span className="text-purple-300">({getCandidateQuestions().length} câu hỏi sẵn sàng)</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditTargetQuestion(null);
                    setIsQuestionBankOpen(true);
                  }}
                  className="text-purple-300 hover:text-white underline cursor-pointer text-[10px] font-bold shrink-0 ml-2"
                >
                  + Nạp thêm câu hỏi
                </button>
              </div>
            )}

            {/* Sprocket Perforations - Top */}
            <div className="w-full flex items-center justify-between pb-3 border-b-2 border-dashed border-amber-600/30 overflow-hidden">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="w-3.5 h-4.5 rounded-xs bg-slate-900 border border-amber-600/40 shadow-inner shrink-0 mx-1" />
              ))}
            </div>

            {/* The Panoramic Cinematic Film Strip Viewport (Hiển thị nhiều học sinh cùng lúc) */}
            <div 
              ref={containerRef}
              className="relative my-4 overflow-hidden h-[245px] flex items-center bg-black/70 rounded-2xl border border-slate-800 shadow-inner"
            >
              {/* Stationary Center Target Indicator Frame (Khung Ngắm Trung Tâm) */}
              <div 
                className="absolute z-30 pointer-events-none top-0 bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-between"
                style={{ width: `${FRAME_WIDTH + 8}px` }}
              >
                {/* Top Indicator Arrow */}
                <div className="pt-1 flex flex-col items-center animate-bounce">
                  <div className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 font-black text-[9px] uppercase tracking-wider shadow-md">
                    CHỌN
                  </div>
                  <ArrowDown className="w-5 h-5 text-amber-400 fill-amber-400 -mt-0.5" />
                </div>

                {/* Center Glowing Reticle */}
                <div className="w-full h-[180px] rounded-2xl border-4 border-amber-400/90 shadow-[0_0_35px_rgba(251,191,36,0.7)] bg-amber-400/10 pointer-events-none" />

                {/* Bottom Indicator Arrow */}
                <div className="pb-1 flex flex-col items-center animate-bounce">
                  <ArrowUp className="w-5 h-5 text-amber-400 fill-amber-400 -mb-0.5" />
                </div>
              </div>

              {/* The Sliding Strip of Student Frames (Chuyển động từ PHẢI SANG TRÁI) */}
              <div 
                className="flex items-center absolute left-0 top-0 bottom-0 will-change-transform"
                style={{
                  transform: `translateX(${translateX}px)`,
                  transition: isRolling ? 'none' : 'transform 0.15s ease-out'
                }}
              >
                {reelStudents.map((student, idx) => {
                  return (
                    <div
                      key={`${student.id}-${idx}`}
                      style={{ 
                        width: `${FRAME_WIDTH}px`, 
                        marginRight: `${FRAME_GAP}px` 
                      }}
                      className="shrink-0 h-[215px] rounded-2xl bg-gradient-to-b from-slate-900 via-slate-850 to-slate-900 border-2 border-slate-700 p-2.5 flex flex-col items-center justify-between shadow-lg relative group"
                    >
                      {/* Frame STT & Gender badge */}
                      <div className="w-full flex items-center justify-between text-[10px] font-mono px-1">
                        <span className="text-amber-400 font-bold">#{student.stt}</span>
                        <span className={`px-1.5 py-0.2 rounded-md text-[9px] font-black ${
                          student.gender === 'Nam' ? 'bg-blue-900 text-blue-300' : 'bg-pink-900 text-pink-300'
                        }`}>
                          {student.gender}
                        </span>
                      </div>

                      {/* Large Clear Student Avatar */}
                      <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-amber-400/60 bg-slate-800 shadow-md my-1 relative shrink-0">
                        <img
                          src={student.avatar}
                          alt={student.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      {/* Student Name */}
                      <div className="w-full text-center px-1">
                        <div className="text-xs font-black text-white truncate leading-tight" title={student.name}>
                          {student.name}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {student.group || 'Tổ 1'} • 🪙 {student.points}x
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sprocket Perforations - Bottom */}
            <div className="w-full flex items-center justify-between pt-3 border-t-2 border-dashed border-amber-600/30 overflow-hidden">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="w-3.5 h-4.5 rounded-xs bg-slate-900 border border-amber-600/40 shadow-inner shrink-0 mx-1" />
              ))}
            </div>
          </div>

          {/* Winner Celebration Card (Hiển thị khi phim dừng) */}
          {winner && (() => {
            const currentWinner = currentClassStudents.find(s => s.id === winner.id) || winner;
            const classNameDisplay = currentClass?.name ? `(${currentClass.name})` : '';
            return (
            <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-100/90 border-2 border-amber-300 rounded-3xl p-5 md:p-6 shadow-lg space-y-4 animate-in fade-in zoom-in-95 hover-zoom-card">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-center sm:text-left">
                  <div className="relative shrink-0">
                    <img 
                      src={currentWinner.avatar} 
                      alt={currentWinner.name} 
                      className="w-16 h-16 md:w-20 md:h-20 rounded-2xl object-cover border-4 border-amber-400 bg-white shadow-md"
                    />
                    <span className="absolute -bottom-1 -right-1 px-2 py-0.5 bg-amber-500 text-white font-black text-[10px] rounded-full shadow-xs">
                      #{currentWinner.stt}
                    </span>
                  </div>

                  <div>
                    <div className="text-xs font-black text-amber-700 uppercase tracking-wider flex items-center gap-1.5 justify-center sm:justify-start">
                      <span>🎉 CHÚC MỪNG HỌC SINH ĐƯỢC CHỌN!</span>
                    </div>
                    <h3 className="text-xl md:text-2xl font-black text-slate-900 mt-0.5 uppercase tracking-tight">
                      {currentWinner.name} {classNameDisplay}
                    </h3>
                    <p className="text-xs text-slate-600 font-semibold mt-0.5">
                      {currentWinner.gender || 'Học sinh'} • {currentWinner.group || 'Tổ 1'} • Hiện có: <strong className="text-amber-800 font-black">{currentWinner.points} xu</strong>
                    </p>
                  </div>
                </div>

                {/* Mode Actions */}
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {/* Mode 2: Tặng xu */}
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
                        onClick={() => handleAward(rewardXu)}
                        disabled={hasAwarded}
                        className={`px-5 py-2.5 rounded-2xl text-xs font-black shadow-md flex items-center gap-1.5 transition-all hover-zoom-btn uppercase ${
                          hasAwarded
                            ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                            : 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/25'
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
                      setHasAwarded(false);
                      setCurrentQuestion(null);
                      setOralStatus('pending');
                    }}
                    className="p-2.5 bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-amber-200 rounded-2xl text-xs font-bold hover-zoom-btn shadow-2xs"
                    title="Đóng kết quả"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Mode 3: Gọi Tên + Trả Lời Câu Hỏi -> Hiển thị nút bốc câu hỏi ngẫu nhiên màn hình rộng */}
              {callMode === 'quiz' && (
                <div className="bg-white/95 rounded-2xl p-4 md:p-5 border-2 border-purple-200 shadow-sm space-y-3 mt-2 animate-in fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full bg-purple-600 text-white text-[11px] font-black uppercase tracking-wide flex items-center gap-1.5 shadow-xs">
                          <HelpCircle className="w-3.5 h-3.5 text-amber-300" />
                          <span>CHẾ ĐỘ: GỌI TÊN + TRẢ LỜI CÂU HỎI</span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium mt-1.5">
                        Học sinh <strong>{currentWinner.name}</strong> đã được chọn. Thầy/cô bấm nút bên dưới để bốc ngẫu nhiên câu hỏi ở chế độ màn hình rộng.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-2 bg-purple-50/80 px-3 py-2 rounded-xl border border-purple-200">
                        <BookOpen className="w-4 h-4 text-purple-700 shrink-0" />
                        <span className="text-[11px] font-black uppercase text-purple-900">BỘ ĐỀ:</span>
                        <select
                          value={selectedQuizSubject}
                          onChange={(e) => setSelectedQuizSubject(e.target.value)}
                          className="bg-transparent text-xs font-bold text-purple-900 focus:outline-none cursor-pointer"
                        >
                          <option value="all">🎲 Ngẫu nhiên toàn kho ({quizBank.length} câu)</option>
                          {quizSubjects.map(sub => {
                            const count = quizBank.filter(q => (q.subject || 'Tổng hợp') === sub).length;
                            return (
                              <option key={sub} value={sub}>
                                📖 Môn {sub} ({count} câu)
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="pt-1 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleOpenRandomQuestion()}
                      className="flex-1 py-3.5 px-5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white font-black text-xs sm:text-sm md:text-base rounded-2xl shadow-md shadow-purple-500/25 flex items-center justify-center gap-2.5 transition-all hover-zoom-btn uppercase cursor-pointer"
                    >
                      <Sparkles className="w-5 h-5 text-amber-300 animate-spin" />
                      <span>🎲 BỐC VÀ HIỂN THỊ CÂU HỎI NGẪU NHIÊN (MÀN HÌNH RỘNG)</span>
                      <Maximize2 className="w-4 h-4 text-purple-200 ml-1" />
                    </button>

                    {currentQuestion && (
                      <button
                        type="button"
                        onClick={() => setIsQuestionModalOpen(true)}
                        className="px-4 py-3 bg-purple-50 hover:bg-purple-100 text-purple-800 font-bold text-xs rounded-2xl border border-purple-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Mở lại câu hỏi đang trả lời của học sinh này"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Xem lại câu đang mở</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setEditTargetQuestion(null);
                        setIsQuestionBankOpen(true);
                      }}
                      className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <BookOpen className="w-4 h-4 text-purple-600" />
                      <span>Kho đề ({quizBank.length})</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
          })()}

          {/* Big Action Trigger Button: "BẤM QUAY CUỘN PHIM" */}
          <button
            onClick={startFilmReel}
            disabled={isRolling || pool.length === 0}
            className="w-full py-3.5 sm:py-4 px-4 sm:px-6 bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 text-white font-black text-xs sm:text-base rounded-2xl sm:rounded-3xl shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2 transition-all hover-zoom-btn disabled:opacity-50 uppercase cursor-pointer"
          >
            <Play className={`w-4 h-4 sm:w-5 sm:h-5 fill-white shrink-0 ${isRolling ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">
              {isRolling ? `🎬 CUỘN PHIM ĐANG TRƯỢT TỪ PHẢI SANG TRÁI (${spinDuration}S)...` : `🎬 BẤM QUAY CUỘN PHIM (${spinDuration} GIÂY • PHÍM CÁCH)`}
            </span>
            <span className="sm:hidden">
              {isRolling ? `🎬 ĐANG QUAY (${spinDuration}S)...` : `🎬 BẤM QUAY CUỘN PHIM (${spinDuration}S)`}
            </span>
          </button>

          {/* Controls & Exclude Checkbox */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-2">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer hover-zoom-interactive">
              <input
                type="checkbox"
                checked={autoExclude}
                onChange={(e) => setAutoExclude(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>Tự động loại học sinh sau khi gọi (để không trùng lặp)</span>
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsQuestionBankOpen(true)}
                className="text-xs font-bold text-purple-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Kho đề thi ({quizBank.length} câu)</span>
              </button>

              <span className="text-xs text-slate-500 font-semibold">
                Còn lại trong cuộn phim: <strong className="text-indigo-600 font-black">{pool.length}</strong> / {currentClassStudents.length} học sinh
              </span>
            </div>
          </div>

          {/* Excluded list pills */}
          {excludedStudents.length > 0 && (
            <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-xs space-y-2.5 hover-zoom-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase">
                  ĐÃ ĐƯỢC GỌI ({excludedStudents.length} EM) – BẤM TÊN ĐỂ ĐƯA LẠI VÀO CUỘN PHIM:
                </span>
                <button
                  onClick={handleRestoreAll}
                  className="text-xs font-black text-indigo-600 hover:underline hover-zoom-interactive uppercase"
                >
                  ĐƯA TẤT CẢ VÀO LẠI
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {excludedStudents.map(st => (
                  <button
                    key={st.id}
                    onClick={() => handleRestoreStudent(st.id)}
                    className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors hover-zoom-interactive"
                    title="Bấm để đưa học sinh này vào lại cuộn phim"
                  >
                    + {st.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: History of Called Students */}
        <div className="lg:col-span-4 bg-white rounded-3xl p-5 border border-slate-200/90 shadow-xs space-y-4 hover-zoom-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Lịch Sử Gọi Tên ({history.length})</span>
              </h3>
              {history.length > 0 && (
                <button
                  onClick={() => setHistory([])}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 hover-zoom-interactive cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa lịch sử</span>
                </button>
              )}
            </div>

            {history.length > 0 ? (
              <div className="space-y-2.5 mt-3 max-h-[460px] overflow-y-auto pr-1">
                {history.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-100 transition-colors hover-zoom-interactive"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={h.avatar}
                        alt={h.name}
                        className="w-9 h-9 rounded-xl object-cover bg-white ring-1 ring-slate-200 shrink-0"
                      />
                      <div className="truncate">
                        <div className="text-xs font-black text-slate-900 truncate">{h.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{h.time}</div>
                      </div>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 ml-2" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center text-slate-400 space-y-2">
                <Film className="w-12 h-12 mx-auto text-slate-300" />
                <p className="text-xs font-medium">Chưa có lượt quay nào</p>
                <p className="text-[10px] text-slate-400">Bấm nút &quot;Quay Cuộn Phim&quot; để bắt đầu</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* QUESTION BANK MODAL */}
      <QuestionBankModal
        isOpen={isQuestionBankOpen}
        initialEditQuestion={editTargetQuestion}
        onClose={() => {
          setIsQuestionBankOpen(false);
          setEditTargetQuestion(null);
        }}
        questions={quizBank}
        onSaveQuestions={(updated, latestSubject) => {
          updateQuizBank(updated);
          saveQuizBank(updated);
          if (latestSubject) {
            setSelectedQuizSubject(latestSubject);
            const subQuestions = updated.filter(q => (q.subject || 'Tổng hợp') === latestSubject);
            if (subQuestions.length > 0) {
              const q = subQuestions[Math.floor(Math.random() * subQuestions.length)];
              setCurrentQuestion(q);
              setSelectedOption(null);
              setShowTeacherKey(false);
              setIsAnswerCorrect(null);
              setHasAwarded(false);
            }
          } else if (currentQuestion) {
            const updatedCur = updated.find(q => q.id === currentQuestion.id);
            if (updatedCur) {
              setCurrentQuestion(updatedCur);
            }
          }
        }}
      />

      {/* 4. CHẾ ĐỘ MÀN HÌNH RỘNG: TRẢ LỜI CÂU HỎI CHO HỌC SINH ĐƯỢC GỌI (User Requirement) */}
      {isQuestionModalOpen && currentQuestion && winner && (() => {
        const currentWinner = currentClassStudents.find(s => s.id === winner.id) || winner;
        const hasOptionImages = Boolean(currentQuestion.optionImages && currentQuestion.optionImages.some(img => Boolean(img)));
        const hasAnyImage = Boolean(currentQuestion.image || hasOptionImages || currentQuestion.answerImage);

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in zoom-in-95 duration-150 select-none">
            <div className={`bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-amber-400/90 rounded-3xl w-full max-w-5xl md:max-w-6xl max-h-[98vh] overflow-y-auto shadow-[0_0_60px_rgba(251,191,36,0.3)] text-white flex flex-col justify-between ${
              hasAnyImage ? 'p-3.5 sm:p-5 space-y-2.5' : 'p-5 sm:p-7 md:p-8 space-y-4 sm:space-y-5'
            }`}>
              
              {/* Header Màn Hình Rộng: Học sinh + Đổi môn + Nút ĐỔI CÂU HỎI KHÁC + Nút Đóng */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pb-2.5 border-b border-amber-500/30">
                {/* Thông tin học sinh đang được gọi */}
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <img
                      src={currentWinner.avatar}
                      alt={currentWinner.name}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl object-cover border-2 border-amber-400 bg-slate-800 shadow-md"
                    />
                    <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 bg-amber-500 text-slate-950 font-black text-[10px] rounded-full shadow-xs">
                      #{currentWinner.stt}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-300 font-mono text-[10px] font-black uppercase tracking-wider border border-amber-400/40">
                        🎬 ĐANG TRẢ LỜI CÂU HỎI
                      </span>
                      <span className="text-xs text-slate-300">
                        {currentWinner.group || 'Tổ 1'} • 🪙 <strong className="text-amber-300 font-black">{currentWinner.points} xu</strong>
                      </span>
                    </div>
                    <h3 className="text-lg sm:text-2xl font-black text-white uppercase tracking-wide mt-0.5">
                      {currentWinner.name}
                    </h3>
                  </div>
                </div>

                {/* Các nút điều khiển hàng đầu: Đổi môn + NÚT ĐỔI CÂU HỎI KHÁC + Đóng */}
                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {/* Dropdown môn học */}
                  <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl">
                    <BookOpen className="w-4 h-4 text-purple-400 shrink-0" />
                    <select
                      value={selectedQuizSubject}
                      onChange={(e) => handleChangeSubject(e.target.value)}
                      className="bg-transparent text-xs font-bold text-purple-200 focus:outline-none cursor-pointer"
                    >
                      <option value="all" className="bg-slate-900 text-white">🎲 Toàn bộ môn ({quizBank.length})</option>
                      {quizSubjects.map(sub => {
                        const count = quizBank.filter(q => (q.subject || 'Tổng hợp') === sub).length;
                        return (
                          <option key={sub} value={sub} className="bg-slate-900 text-white">
                            📖 Môn {sub} ({count})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* NÚT ĐỔI CÂU HỎI KHÁC */}
                  <button
                    type="button"
                    onClick={handlePickAnotherQuestion}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-700 text-slate-950 font-black text-xs sm:text-sm rounded-xl flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer transition-all hover-zoom-btn uppercase"
                    title="Đổi ngay câu hỏi khác cho học sinh này"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>ĐỔI CÂU HỎI KHÁC 🔄</span>
                  </button>

                  {/* Nút sửa câu hỏi */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditTargetQuestion(currentQuestion);
                      setIsQuestionBankOpen(true);
                    }}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 cursor-pointer"
                    title="Chỉnh sửa câu hỏi này"
                  >
                    <Edit3 className="w-4 h-4 text-amber-400" />
                  </button>

                  {/* Nút đóng màn hình rộng */}
                  <button
                    type="button"
                    onClick={() => setIsQuestionModalOpen(false)}
                    className="p-2 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-white rounded-xl text-xs font-bold border border-slate-700 cursor-pointer"
                    title="Thu nhỏ / Quay lại Cuộn Phim"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Thông tin loại câu hỏi & Xu thưởng */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-800/80 border border-slate-700 text-xs">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-xl bg-purple-600 text-white font-black text-[11px] uppercase tracking-wide shadow-xs">
                    {currentQuestion.type === 'multiple_choice' && '📝 Trắc Nghiệm 1 Đáp Án'}
                    {currentQuestion.type === 'multi_select' && '☑️ Trắc Nghiệm Nhiều Đáp Án'}
                    {currentQuestion.type === 'true_false' && '⚖️ Câu Hỏi Đúng / Sai'}
                    {currentQuestion.type === 'fill_blank' && '🧩 Kéo Thả / Điền Chỗ Trống'}
                    {currentQuestion.type === 'sequence_order' && '🔢 Sắp Xếp Thứ Tự Các Bước'}
                    {currentQuestion.type === 'matching' && '🔗 Nối Cột A Với Cột B'}
                    {currentQuestion.type === 'oral' && '🗣️ Tự Luận / Bằng Lời'}
                  </span>
                  <span className="text-slate-300 font-medium text-xs">
                    Môn: <strong className="text-purple-300">{currentQuestion.subject || 'Tổng hợp'}</strong>
                  </span>
                </div>

                {/* Chọn mức xu thưởng */}
                <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-xl border border-slate-700">
                  <Award className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-[11px] font-black text-amber-300 uppercase">Xu thưởng:</span>
                  {[1, 2, 3, 4, 5, 10].map((pts) => (
                    <button
                      key={pts}
                      type="button"
                      disabled={isAnswerCorrect !== null || (currentQuestion.type === 'oral' && oralStatus !== 'pending')}
                      onClick={() => setCustomOralPoints(pts)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                        customOralPoints === pts 
                          ? 'bg-amber-400 text-slate-950 shadow-xs' 
                          : 'text-amber-300 hover:bg-slate-800'
                      }`}
                      title={`Đặt mức thưởng ${pts} xu`}
                    >
                      +{pts}
                    </button>
                  ))}
                </div>
              </div>

              {/* NỘI DUNG CÂU HỎI (Tự động tăng cỡ chữ cực đại khi không có ảnh để giáo viên & học sinh dễ đọc) */}
              <div className={`bg-slate-950/85 rounded-2xl md:rounded-3xl border border-slate-800 shadow-inner ${
                hasAnyImage ? 'p-3.5 sm:p-4 space-y-2.5' : 'p-5 sm:p-7 md:p-8 space-y-3'
              }`}>
                <div className={`font-black text-amber-200 leading-snug tracking-wide ${
                  hasAnyImage 
                    ? 'text-base sm:text-lg md:text-xl' 
                    : 'text-xl sm:text-2xl md:text-3xl lg:text-4xl'
                }`}>
                  {currentQuestion.questionText}
                </div>

                {/* Ảnh minh họa câu hỏi nếu có */}
                {currentQuestion.image && (
                  <div className="pt-0.5 flex justify-center">
                    <div className="relative inline-block group">
                      <img 
                        src={currentQuestion.image} 
                        alt="Ảnh minh họa câu hỏi" 
                        onClick={() => setZoomedImage({ url: currentQuestion.image!, title: 'Ảnh minh họa câu hỏi' })}
                        className="max-h-36 sm:max-h-44 rounded-xl border-2 border-slate-700 object-contain bg-slate-900 shadow-md cursor-zoom-in hover:opacity-95 transition-opacity"
                      />
                      <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                        🔍 Phóng to
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* DẠNG 1: TRẮC NGHIỆM ĐƠN (1 ĐÁP ÁN ĐÚNG) - Tự động phóng to chữ & thẻ đáp án khi không có ảnh */}
              {currentQuestion.type === 'multiple_choice' && currentQuestion.options && (
                <div className={hasAnyImage ? 'space-y-2 pt-0.5' : 'space-y-3 pt-1'}>
                  <div className={`grid grid-cols-1 sm:grid-cols-2 ${
                    hasAnyImage ? 'gap-2 sm:gap-2.5' : 'gap-3 sm:gap-4 md:gap-5'
                  }`}>
                    {currentQuestion.options.map((opt, idx) => {
                      const isSelected = selectedOption === idx;
                      const isCorrect = currentQuestion.correctOptionIndex === idx;
                      const optImage = currentQuestion.optionImages?.[idx];
                      let btnStyle = 'bg-slate-800/90 border-slate-700 text-white hover:border-amber-400 hover:bg-slate-800';

                      if (selectedOption !== null) {
                        if (isCorrect) {
                          btnStyle = 'bg-emerald-950/90 border-emerald-400 text-emerald-100 font-bold ring-2 ring-emerald-400/50';
                        } else if (isSelected) {
                          btnStyle = 'bg-rose-950/90 border-rose-500 text-rose-100';
                        }
                      }

                      return (
                        <div
                          key={idx}
                          role="button"
                          tabIndex={selectedOption !== null ? -1 : 0}
                          onClick={() => {
                            if (selectedOption === null) handleSelectOption(idx);
                          }}
                          className={`rounded-2xl border-2 text-left transition-all cursor-pointer shadow-md select-none flex flex-col justify-between ${
                            hasAnyImage ? 'p-2.5 sm:p-3 text-xs sm:text-sm' : 'p-4 sm:p-5 md:p-6 text-base sm:text-lg md:text-xl'
                          } ${btnStyle}`}
                        >
                          <div className="w-full flex items-center gap-3">
                            <span className={`rounded-xl flex items-center justify-center font-black shrink-0 ${
                              hasAnyImage ? 'w-6 h-6 sm:w-7 sm:h-7 text-xs' : 'w-9 h-9 sm:w-11 sm:h-11 text-base sm:text-lg shadow-sm'
                            } ${
                              selectedOption !== null && isCorrect 
                                ? 'bg-emerald-500 text-white shadow-xs' 
                                : selectedOption !== null && isSelected
                                ? 'bg-rose-500 text-white'
                                : 'bg-slate-700 text-amber-300'
                            }`}>
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span className={`flex-1 font-bold leading-snug ${
                              hasAnyImage ? 'text-xs sm:text-sm truncate sm:whitespace-normal' : 'text-base sm:text-lg md:text-xl'
                            }`}>
                              {opt}
                            </span>
                            {selectedOption !== null && isCorrect && (
                              <Check className={hasAnyImage ? 'w-5 h-5 text-emerald-400 shrink-0' : 'w-7 h-7 text-emerald-400 shrink-0'} />
                            )}
                          </div>

                          {optImage && (
                            <div className="mt-2 w-full bg-slate-900/90 rounded-xl p-1.5 border border-slate-700 flex flex-col items-center justify-center overflow-hidden">
                              <img 
                                src={optImage} 
                                alt={`Ảnh đáp án ${String.fromCharCode(65 + idx)}`} 
                                className="max-h-24 sm:max-h-28 max-w-full rounded-lg object-contain cursor-zoom-in hover:scale-105 transition-transform"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setZoomedImage({ url: optImage, title: `Ảnh đáp án ${String.fromCharCode(65 + idx)}: ${opt}` });
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* DẠNG 2: TRẮC NGHIỆM NHIỀU ĐÁP ÁN ĐÚNG (MULTI-SELECT) */}
              {currentQuestion.type === 'multi_select' && currentQuestion.options && (
                <div className={hasAnyImage ? 'space-y-2 pt-0.5' : 'space-y-3 pt-1'}>
                  <div className={`font-bold text-indigo-300 flex items-center gap-2 ${
                    hasAnyImage ? 'text-[11px]' : 'text-xs sm:text-sm'
                  }`}>
                    <CheckSquare className={hasAnyImage ? 'w-3.5 h-3.5 text-indigo-400' : 'w-5 h-5 text-indigo-400'} />
                    <span>Em hãy tick chọn TẤT CẢ các phương án đúng, sau đó bấm nút &quot;Kiểm tra đáp án&quot;:</span>
                  </div>

                  <div className={`grid grid-cols-1 sm:grid-cols-2 ${
                    hasAnyImage ? 'gap-2 sm:gap-2.5' : 'gap-3 sm:gap-4 md:gap-5'
                  }`}>
                    {currentQuestion.options.map((opt, idx) => {
                      const isChecked = selectedMultiOptions.includes(idx);
                      const isCorrectAnswer = (currentQuestion.correctOptionIndices || []).includes(idx);
                      const optImage = currentQuestion.optionImages?.[idx];

                      let cardStyle = isChecked 
                        ? 'bg-indigo-950/80 border-indigo-400 ring-2 ring-indigo-400/40 text-white' 
                        : 'bg-slate-800/90 border-slate-700 text-slate-200 hover:border-slate-500';

                      if (isAnswerCorrect !== null) {
                        if (isCorrectAnswer) {
                          cardStyle = 'bg-emerald-950/90 border-emerald-400 text-emerald-100 font-bold ring-2 ring-emerald-400/50';
                        } else if (isChecked && !isCorrectAnswer) {
                          cardStyle = 'bg-rose-950/90 border-rose-500 text-rose-100';
                        }
                      }

                      return (
                        <div
                          key={idx}
                          role="button"
                          tabIndex={isAnswerCorrect !== null ? -1 : 0}
                          onClick={() => {
                            if (isAnswerCorrect !== null) return;
                            if (isChecked) {
                              setSelectedMultiOptions(selectedMultiOptions.filter(i => i !== idx));
                            } else {
                              setSelectedMultiOptions([...selectedMultiOptions, idx]);
                            }
                          }}
                          className={`rounded-2xl border-2 text-left transition-all cursor-pointer shadow-md select-none flex flex-col justify-between ${
                            hasAnyImage ? 'p-2.5 sm:p-3 text-xs sm:text-sm' : 'p-4 sm:p-5 md:p-6 text-base sm:text-lg md:text-xl'
                          } ${cardStyle}`}
                        >
                          <div className="w-full flex items-center gap-3">
                            <span className={`rounded-xl flex items-center justify-center font-black shrink-0 ${
                              hasAnyImage ? 'w-6 h-6 sm:w-7 sm:h-7 text-xs' : 'w-9 h-9 sm:w-11 sm:h-11 text-base sm:text-lg shadow-sm'
                            } ${
                              isChecked ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'
                            }`}>
                              {isChecked ? '✓' : String.fromCharCode(65 + idx)}
                            </span>
                            <span className={`flex-1 font-bold leading-snug ${
                              hasAnyImage ? 'text-xs sm:text-sm' : 'text-base sm:text-lg md:text-xl'
                            }`}>
                              {opt}
                            </span>
                            {isAnswerCorrect !== null && isCorrectAnswer && (
                              <Check className={hasAnyImage ? 'w-5 h-5 text-emerald-400 shrink-0' : 'w-7 h-7 text-emerald-400 shrink-0'} />
                            )}
                          </div>

                          {optImage && (
                            <div className="mt-2 w-full bg-slate-900/90 rounded-xl p-1.5 border border-slate-700 flex flex-col items-center justify-center overflow-hidden">
                              <img 
                                src={optImage} 
                                alt={`Ảnh đáp án ${String.fromCharCode(65 + idx)}`} 
                                className="max-h-24 sm:max-h-28 max-w-full rounded-lg object-contain cursor-zoom-in hover:scale-105 transition-transform"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setZoomedImage({ url: optImage, title: `Ảnh đáp án ${String.fromCharCode(65 + idx)}: ${opt}` });
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {isAnswerCorrect === null && (
                    <div className="pt-2 flex justify-center">
                      <button
                        type="button"
                        disabled={selectedMultiOptions.length === 0}
                        onClick={handleSubmitMultiSelect}
                        className={`bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-40 text-white font-black rounded-xl shadow-md cursor-pointer transition-all hover-zoom-btn uppercase ${
                          hasAnyImage ? 'px-6 py-2 text-xs sm:text-sm' : 'px-8 py-3 text-sm sm:text-base'
                        }`}
                      >
                        ✓ KIỂM TRA ĐÁP ÁN ĐÃ CHỌN ({selectedMultiOptions.length})
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* DẠNG 3: ĐÚNG / SAI (TRUE / FALSE) */}
              {currentQuestion.type === 'true_false' && (
                <div className="space-y-2 pt-0.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={selectedTrueFalse !== null}
                      onClick={() => handleSelectTrueFalse(true)}
                      className={`p-4 sm:p-5 rounded-2xl font-black text-sm sm:text-lg flex items-center justify-center gap-2.5 border-2 sm:border-4 cursor-pointer transition-all shadow-md ${
                        selectedTrueFalse !== null
                          ? currentQuestion.isTrue === true
                            ? 'bg-emerald-600 text-white border-emerald-400 ring-2 sm:ring-4 ring-emerald-400/50'
                            : selectedTrueFalse === true
                            ? 'bg-rose-600 text-white border-rose-400'
                            : 'bg-slate-800 text-slate-500 border-slate-700'
                          : 'bg-slate-800/90 text-emerald-300 border-emerald-500/50 hover:bg-emerald-950/80 hover:border-emerald-400'
                      }`}
                    >
                      <Check className="w-6 h-6 sm:w-7 sm:h-7" />
                      <span>ĐÚNG (TRUE)</span>
                    </button>

                    <button
                      type="button"
                      disabled={selectedTrueFalse !== null}
                      onClick={() => handleSelectTrueFalse(false)}
                      className={`p-4 sm:p-5 rounded-2xl font-black text-sm sm:text-lg flex items-center justify-center gap-2.5 border-2 sm:border-4 cursor-pointer transition-all shadow-md ${
                        selectedTrueFalse !== null
                          ? currentQuestion.isTrue === false
                            ? 'bg-emerald-600 text-white border-emerald-400 ring-2 sm:ring-4 ring-emerald-400/50'
                            : selectedTrueFalse === false
                            ? 'bg-rose-600 text-white border-rose-400'
                            : 'bg-slate-800 text-slate-500 border-slate-700'
                          : 'bg-slate-800/90 text-rose-300 border-rose-500/50 hover:bg-rose-950/80 hover:border-rose-400'
                      }`}
                    >
                      <X className="w-6 h-6 sm:w-7 sm:h-7" />
                      <span>SAI (FALSE)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* DẠNG 4: KÉO THẢ / ĐIỀN CHỖ TRỐNG */}
              {currentQuestion.type === 'fill_blank' && (
                <div className="space-y-2.5 pt-0.5">
                  {/* Word bank pool to choose from */}
                  {isAnswerCorrect === null && (
                    <div className="p-2.5 sm:p-3 bg-slate-900/90 rounded-2xl border border-slate-700 space-y-1.5">
                      <div className="text-[11px] font-bold text-amber-300 uppercase">
                        👉 Bấm vào các từ bên dưới để điền vào ô trống:
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {Array.from(new Set([...(currentQuestion.blankAnswers || []), ...(currentQuestion.distractorWords || [])]))
                          .sort(() => 0.5 - Math.sin(1))
                          .map((word, wIdx) => {
                            const isUsed = Object.values(filledBlankWords).includes(word);
                            return (
                              <button
                                key={wIdx}
                                type="button"
                                disabled={isUsed}
                                onClick={() => {
                                  // Find first empty slot
                                  const totalSlots = (currentQuestion.blankAnswers || []).length || 1;
                                  for (let s = 0; s < totalSlots; s++) {
                                    if (!filledBlankWords[s]) {
                                      setFilledBlankWords({ ...filledBlankWords, [s]: word });
                                      break;
                                    }
                                  }
                                }}
                                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer shadow-sm ${
                                  isUsed 
                                    ? 'bg-slate-800 text-slate-600 border border-slate-700 opacity-40' 
                                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white border border-indigo-400 hover-zoom-btn'
                                }`}
                              >
                                {word}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Slot Answers Display */}
                  <div className="p-2.5 sm:p-3 bg-slate-800/90 rounded-2xl border border-slate-700 space-y-2">
                    <div className="text-[11px] font-bold text-slate-300 uppercase">Các vị trí cần điền:</div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {(currentQuestion.blankAnswers || ['']).map((_, sIdx) => {
                        const filled = filledBlankWords[sIdx];
                        return (
                          <div key={sIdx} className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-400 font-bold">Vị trí {sIdx + 1}:</span>
                            <div className="flex items-center gap-1">
                              <span className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-black border-2 min-w-[100px] text-center ${
                                filled 
                                  ? 'bg-purple-950 border-purple-400 text-amber-200' 
                                  : 'bg-slate-900 border-dashed border-slate-600 text-slate-500'
                              }`}>
                                {filled || '[ Trống ]'}
                              </span>
                              {filled && isAnswerCorrect === null && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = { ...filledBlankWords };
                                    delete next[sIdx];
                                    setFilledBlankWords(next);
                                  }}
                                  className="p-1 bg-slate-700 hover:bg-rose-900 text-slate-300 rounded-lg text-xs"
                                  title="Gỡ từ này ra"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {isAnswerCorrect === null && (
                    <div className="pt-1 flex justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setFilledBlankWords({})}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl"
                      >
                        Làm lại
                      </button>
                      <button
                        type="button"
                        disabled={Object.keys(filledBlankWords).length < (currentQuestion.blankAnswers || []).length}
                        onClick={handleSubmitFillBlank}
                        className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-40 text-white font-black text-xs sm:text-sm rounded-xl shadow-md cursor-pointer transition-all hover-zoom-btn uppercase"
                      >
                        ✓ KIỂM TRA CÂU TRẢ LỜI
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* DẠNG 5: SẮP XẾP THỨ TỰ CÁC BƯỚC */}
              {currentQuestion.type === 'sequence_order' && (
                <div className="space-y-2 pt-0.5">
                  <div className="text-[11px] font-bold text-cyan-300">
                    Sắp xếp theo đúng trình tự (bấm mũi tên ↑ / ↓):
                  </div>

                  <div className="space-y-1.5">
                    {shuffledSequence.map((step, idx) => (
                      <div 
                        key={idx}
                        className="p-2.5 bg-slate-800/90 border border-slate-700 hover:border-cyan-400 rounded-xl flex items-center justify-between gap-2.5 text-white transition-all shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-cyan-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-xs sm:text-sm leading-snug">{step}</span>
                        </div>

                        {isAnswerCorrect === null && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => {
                                const newSeq = [...shuffledSequence];
                                const temp = newSeq[idx - 1];
                                newSeq[idx - 1] = newSeq[idx];
                                newSeq[idx] = temp;
                                setShuffledSequence(newSeq);
                              }}
                              className="px-2.5 py-1 bg-slate-700 hover:bg-cyan-600 disabled:opacity-20 text-white font-black text-xs rounded-lg cursor-pointer"
                              title="Di chuyển lên trên"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={idx === shuffledSequence.length - 1}
                              onClick={() => {
                                const newSeq = [...shuffledSequence];
                                const temp = newSeq[idx + 1];
                                newSeq[idx + 1] = newSeq[idx];
                                newSeq[idx] = temp;
                                setShuffledSequence(newSeq);
                              }}
                              className="px-2.5 py-1 bg-slate-700 hover:bg-cyan-600 disabled:opacity-20 text-white font-black text-xs rounded-lg cursor-pointer"
                              title="Di chuyển xuống dưới"
                            >
                              ↓
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {isAnswerCorrect === null && (
                    <div className="pt-1 flex justify-center">
                      <button
                        type="button"
                        onClick={handleSubmitSequence}
                        className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-black text-xs sm:text-sm rounded-xl shadow-md cursor-pointer transition-all hover-zoom-btn uppercase"
                      >
                        ✓ KIỂM TRA THỨ TỰ
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* DẠNG 6: NỐI CỘT A VỚI CỘT B */}
              {currentQuestion.type === 'matching' && (
                <div className="space-y-2.5 pt-0.5">
                  <div className="text-[11px] font-bold text-pink-300">
                    Bấm chọn 1 mục ở Cột A bên trái, sau đó chọn 1 mục ở Cột B bên phải để nối:
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Cột A */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-black uppercase text-amber-400 pb-0.5 border-b border-slate-700">
                        📌 CỘT A:
                      </div>
                      {(currentQuestion.matchingPairs || []).map((pair, leftIdx) => {
                        const isSelected = selectedLeftMatchIndex === leftIdx;
                        const matchedRightId = userMatches[leftIdx];
                        const matchedRightObj = shuffledRightMatching.find(r => r.id === matchedRightId);

                        return (
                          <div
                            key={leftIdx}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (isAnswerCorrect !== null) return;
                              setSelectedLeftMatchIndex(leftIdx);
                            }}
                            className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all shadow-xs ${
                              isSelected
                                ? 'bg-amber-950 border-amber-400 ring-2 ring-amber-400/50'
                                : matchedRightId !== undefined
                                ? 'bg-slate-800 border-indigo-500/80'
                                : 'bg-slate-800/90 border-slate-700 hover:border-slate-500'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-md bg-amber-500 text-slate-950 font-black text-[11px] flex items-center justify-center shrink-0">
                                  A{leftIdx + 1}
                                </span>
                                <span className="text-xs sm:text-sm font-bold text-white leading-snug">{pair.left}</span>
                              </div>
                              {matchedRightObj && (
                                <span className="text-[10px] px-2 py-0.5 bg-purple-900/80 text-purple-200 border border-purple-400 rounded-md font-bold truncate max-w-[120px]">
                                  🔗 {matchedRightObj.text}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Cột B */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-black uppercase text-purple-400 pb-0.5 border-b border-slate-700">
                        🎯 CỘT B:
                      </div>
                      {shuffledRightMatching.map((rightItem, rIdx) => {
                        const isLinkedToLeft = Object.entries(userMatches).find(([_, rId]) => rId === rightItem.id);

                        return (
                          <div
                            key={rIdx}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (isAnswerCorrect !== null) return;
                              if (selectedLeftMatchIndex !== null) {
                                setUserMatches({ ...userMatches, [selectedLeftMatchIndex]: rightItem.id });
                                setSelectedLeftMatchIndex(null);
                              }
                            }}
                            className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all shadow-xs ${
                              isLinkedToLeft
                                ? 'bg-purple-950 border-purple-400 ring-2 ring-purple-400/40 text-purple-100'
                                : selectedLeftMatchIndex !== null
                                ? 'bg-slate-800 border-slate-600 hover:border-purple-400 hover:bg-slate-700'
                                : 'bg-slate-800/90 border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-md bg-purple-600 text-white font-black text-[11px] flex items-center justify-center shrink-0">
                                B{rIdx + 1}
                              </span>
                              <span className="text-xs sm:text-sm font-bold text-white leading-snug">{rightItem.text}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {isAnswerCorrect === null && (
                    <div className="pt-1 flex justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => { setUserMatches({}); setSelectedLeftMatchIndex(null); }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl"
                      >
                        Nối lại
                      </button>
                      <button
                        type="button"
                        disabled={Object.keys(userMatches).length < (currentQuestion.matchingPairs || []).length}
                        onClick={handleSubmitMatching}
                        className="px-6 py-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 disabled:opacity-40 text-white font-black text-xs sm:text-sm rounded-xl shadow-md cursor-pointer transition-all hover-zoom-btn uppercase"
                      >
                        ✓ KIỂM TRA CẶP NỐI
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* PHẦN KẾT QUẢ CHUNG CHO CÁC DẠNG TƯƠNG TÁC (Multi, TF, Fill, Seq, Match, MC) */}
              {currentQuestion.type !== 'oral' && isAnswerCorrect !== null && (
                <div className="space-y-3 pt-2 animate-in fade-in duration-150">
                  {isAnswerCorrect ? (
                    <div className="p-4 bg-emerald-950/90 border-2 border-emerald-400 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black shrink-0 shadow-md">
                          <Check className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-sm sm:text-base font-black text-emerald-200 uppercase">
                            🎉 CHÍNH XÁC! {currentWinner.name} ĐÃ ĐƯỢC CỘNG +{customOralPoints || currentQuestion.pointsReward || 2} XU!
                          </div>
                          <p className="text-xs text-emerald-400 font-medium mt-0.5">
                            Điểm xu hiện tại của học sinh: <strong className="text-emerald-200 font-black">{currentWinner.points} xu</strong>
                          </p>
                        </div>
                      </div>
                      <span className="px-4 py-2 bg-emerald-500 text-slate-950 rounded-xl text-xs sm:text-sm font-black shrink-0 shadow-md uppercase">
                        +{customOralPoints || currentQuestion.pointsReward || 2} Xu 🪙
                      </span>
                    </div>
                  ) : (
                    <div className="p-4 bg-rose-950/90 border-2 border-rose-400 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black shrink-0 shadow-md text-base">
                          ✕
                        </div>
                        <div>
                          <div className="text-sm sm:text-base font-black text-rose-200 uppercase">
                            ❌ RẤT TIẾC, CHƯA CHÍNH XÁC! KHÔNG ĐƯỢC CỘNG XU (0 XU)
                          </div>
                          <p className="text-xs text-rose-400 font-medium mt-0.5">
                            Học sinh chưa hoàn thành câu trả lời đúng. Lượt này không cộng xu.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleRetryQuestion}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-200 border border-rose-500/50 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        >
                          Cho làm lại 🔄
                        </button>
                        <button
                          type="button"
                          onClick={handlePickAnotherQuestion}
                          className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black transition-colors cursor-pointer"
                        >
                          Đổi câu khác 🔄
                        </button>
                        <button
                          type="button"
                          disabled={hasAwarded}
                          onClick={() => handleAward(1, `Thưởng động viên câu hỏi môn ${currentQuestion.subject || 'Tổng hợp'}`)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                            hasAwarded 
                              ? 'bg-slate-800 text-slate-500' 
                              : 'bg-amber-600 hover:bg-amber-700 text-white'
                          }`}
                          title="Tặng 1 xu động viên học sinh đã nỗ lực"
                        >
                          {hasAwarded ? 'Đã tặng +1 xu động viên' : 'Động viên (+1 xu) 🪙'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lời giải chi tiết */}
                  {(currentQuestion.teacherAnswerKey || currentQuestion.answerImage) && (
                    <div className="p-2.5 sm:p-3 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-slate-200 space-y-1">
                      {currentQuestion.teacherAnswerKey && (
                        <div>
                          <strong className="text-amber-300">Giải thích / Đáp án chuẩn:</strong> {currentQuestion.teacherAnswerKey}
                        </div>
                      )}
                      {currentQuestion.answerImage && (
                        <div className="pt-0.5">
                          <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Ảnh minh họa lời giải:</span>
                          <img
                            src={currentQuestion.answerImage}
                            alt="Ảnh minh họa đáp án"
                            onClick={() => setZoomedImage({ url: currentQuestion.answerImage!, title: 'Ảnh minh họa lời giải chi tiết' })}
                            className="max-h-28 sm:max-h-36 rounded-lg border border-slate-600 object-contain bg-slate-900 shadow-sm cursor-zoom-in"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* DẠNG 7: PHẦN CÂU HỎI TỰ LUẬN / BẰNG LỜI */}
              {currentQuestion.type === 'oral' && (
                <div className="space-y-2 pt-0.5">
                  {/* Xem đáp án & gợi ý chấm */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setShowTeacherKey(!showTeacherKey)}
                      className="text-xs font-bold text-amber-300 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>{showTeacherKey ? 'Ẩn gợi ý đáp án' : '👁️ Xem đáp án & gợi ý chấm của giáo viên'}</span>
                    </button>
                  </div>

                  {showTeacherKey && (
                    <div className="p-2.5 sm:p-3 bg-slate-800/90 border border-amber-500/40 rounded-xl text-xs text-amber-200 space-y-1.5 animate-in fade-in">
                      {currentQuestion.teacherAnswerKey && (
                        <div>
                          <strong>Gợi ý chấm của giáo viên:</strong> {currentQuestion.teacherAnswerKey}
                        </div>
                      )}
                      {currentQuestion.answerImage && (
                        <div className="pt-0.5">
                          <img
                            src={currentQuestion.answerImage}
                            alt="Ảnh đáp án giáo viên"
                            onClick={() => setZoomedImage({ url: currentQuestion.answerImage!, title: 'Ảnh đáp án giáo viên' })}
                            className="max-h-28 sm:max-h-36 rounded-lg border border-amber-400/40 object-contain bg-slate-900 shadow-md cursor-zoom-in"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Giáo viên xác nhận tự luận */}
                  {oralStatus === 'pending' && (
                    <div className="p-3 bg-slate-800/90 border border-slate-700 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="text-xs text-slate-200">
                        <strong className="block text-xs sm:text-sm font-black text-amber-300 uppercase">Học sinh đang trả lời trước lớp:</strong>
                        <span className="text-slate-400 text-[11px]">Thầy/cô lắng nghe và bấm xác nhận để cộng điểm:</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleConfirmOralCorrect(customOralPoints)}
                          className="px-4 py-2 rounded-xl text-xs sm:text-sm font-black shadow-md bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 cursor-pointer uppercase hover-zoom-btn"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>XÁC NHẬN ĐÚNG (+{customOralPoints} XU)</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmOralIncorrect}
                          className="px-3 py-2 rounded-xl text-xs font-bold border border-rose-500/50 bg-slate-900 hover:bg-rose-950 text-rose-300 flex items-center gap-1 cursor-pointer"
                        >
                          <span>✕ Chưa đúng (0 xu)</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Kết quả tự luận đúng */}
                  {oralStatus === 'correct' && (
                    <div className="p-3 bg-emerald-950/90 border-2 border-emerald-400 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black shrink-0 shadow-md">
                          <Check className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs sm:text-sm font-black text-emerald-200 uppercase">
                            🎉 GIÁO VIÊN ĐÃ XÁC NHẬN: TRẢ LỜI ĐÚNG VÀ CỘNG +{customOralPoints} XU!
                          </div>
                          <p className="text-[11px] text-emerald-400 font-medium mt-0.5">
                            Đã cộng vào tài khoản của <strong>{currentWinner.name}</strong>. Tổng điểm xu: <strong className="text-emerald-200 font-black">{currentWinner.points} xu</strong>
                          </p>
                        </div>
                      </div>
                      <span className="px-3 py-1.5 bg-emerald-500 text-slate-950 rounded-xl text-xs font-black shrink-0 uppercase">
                        +{customOralPoints} Xu 🪙
                      </span>
                    </div>
                  )}

                  {/* Kết quả tự luận chưa đúng */}
                  {oralStatus === 'incorrect' && (
                    <div className="p-3 bg-rose-950/90 border-2 border-rose-400 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black shrink-0 shadow-md text-sm">
                          ✕
                        </div>
                        <div>
                          <div className="text-xs sm:text-sm font-black text-rose-200 uppercase">
                            ❌ CHƯA ĐẠT YÊU CẦU – KHÔNG CỘNG XU
                          </div>
                          <p className="text-[11px] text-rose-400 font-medium mt-0.5">
                            Học sinh chưa hoàn thành câu trả lời. Lượt này không cộng xu.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleResetOralEvaluation}
                          className="px-2.5 py-1 bg-slate-800 text-rose-200 border border-rose-500/50 rounded-lg text-xs font-bold cursor-pointer"
                        >
                          Chấm lại 🔄
                        </button>
                        <button
                          type="button"
                          onClick={handlePickAnotherQuestion}
                          className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-black cursor-pointer"
                        >
                          Đổi câu khác 🔄
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Chân Modal: Nút Hoàn thành & Quay lại Cuộn Phim */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handlePickAnotherQuestion}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Đổi câu hỏi khác cho em này</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsQuestionModalOpen(false)}
                  className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-xs sm:text-sm rounded-xl shadow-md cursor-pointer transition-all hover-zoom-btn uppercase"
                >
                  <span>🎬 HOÀN THÀNH & QUAY LẠI CUỘN PHIM</span>
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* FULL-SCREEN ZOOMED IMAGE LIGHTBOX MODAL */}
      {zoomedImage && (
        <div 
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 cursor-zoom-out select-none animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl p-4 max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-700"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h4 className="text-xs font-black text-slate-800 uppercase truncate pr-4">
                {zoomedImage.title}
              </h4>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="p-1 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-2 flex items-center justify-center overflow-auto max-h-[75vh]">
              <img 
                src={zoomedImage.url} 
                alt={zoomedImage.title}
                className="max-h-[70vh] max-w-full rounded-2xl object-contain shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
