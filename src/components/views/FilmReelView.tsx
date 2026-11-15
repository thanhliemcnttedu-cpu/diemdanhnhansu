import { CoinIcon } from '../common/CoinIcon';
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

import { handleAvatarImgError } from '../../utils/avatarConfig';
import { CalledStudentModal } from './picker/CalledStudentModal';
import { QuestionAudioButton } from './picker/QuestionAudioButton';
import { shuffleAvoid, shuffleMatching } from '../../utils/shuffle';
import { QuestionChallengeModal } from './picker/QuestionChallengeModal';
import { useQuizSelection } from './picker/QuizSetPicker';
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
  // Hộp chúc mừng kiểu Ống kính hiện trên màn hình khi phim dừng
  const [showWinnerPopup, setShowWinnerPopup] = useState(false);

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
  const [isQuestionBankOpen, setIsQuestionBankOpen] = useState(false);
  const [editTargetQuestion, setEditTargetQuestion] = useState<QuestionItem | null>(null);
  // Chế độ câu hỏi: giáo viên chọn kho + bộ câu hỏi trước khi chơi; chỉ bốc câu trong phần đã chọn
  const quizSel = useQuizSelection(() => { setEditTargetQuestion(null); setIsQuestionBankOpen(true); });
  const quizPool = quizSel.pool;
  const [quizDrawToken, setQuizDrawToken] = useState(0);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);


  // Available subjects in quizBank
  const quizSubjects = Array.from(new Set(quizPool.map(q => q.subject || 'Tổng hợp'))).filter(Boolean);

  const getCandidateQuestions = (subject = selectedQuizSubject) => {
    if (subject === 'all') return quizPool;
    const filtered = quizPool.filter(q => (q.subject || 'Tổng hợp') === subject);
    return filtered.length > 0 ? filtered : quizPool;
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
    setShowWinnerPopup(false);
    setHasAwarded(false);

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
        setShowWinnerPopup(true);
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

  // Draw a random question and show it wide-screen (QuestionChallengeModal owns the question state)
  const handleOpenRandomQuestion = (subject = selectedQuizSubject) => {
    if (getCandidateQuestions(subject).length === 0) {
      setIsQuestionBankOpen(true);
      return;
    }
    setQuizDrawToken(t => t + 1);
    setIsQuestionModalOpen(true);
  };

  const handleChangeSubject = (newSubject: string) => setSelectedQuizSubject(newSubject);


  const handleAward = (amount = rewardXu, reason = 'Thưởng gọi tên qua Cuộn Phim 35mm') => {
    if (!winner || hasAwarded) return;
    const targetSub = currentQuestion?.subject || 'Ghi chung';
    awardPoints([winner.id], amount, reason, targetSub);
    playCoinSound();
    setHasAwarded(true);
    confetti({ particleCount: 50, spread: 60 });
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
            className={`px-2 sm:px-3.5 py-1.5 rounded-xl text-[12px] sm:text-xs font-black transition-all cursor-pointer uppercase text-center ${
              callMode === 'random' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">1. Gọi Ngẫu Nhiên</span>
            <span className="sm:hidden">1. NGẪU NHIÊN</span>
          </button>
          <button
            type="button"
            onClick={() => setCallMode('coins')}
            className={`px-2 sm:px-3.5 py-1.5 rounded-xl text-[12px] sm:text-xs font-black transition-all cursor-pointer uppercase text-center ${
              callMode === 'coins' ? 'bg-amber-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">2. Gọi + Tặng Xu</span>
            <span className="sm:hidden">2. TẶNG XU</span>
          </button>
          <button
            type="button"
            onClick={() => quizSel.request(() => { setSelectedQuizSubject('all'); setCallMode('quiz'); })}
            className={`px-2 sm:px-3.5 py-1.5 rounded-xl text-[12px] sm:text-xs font-black transition-all cursor-pointer uppercase text-center ${
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
            <span className="text-[12px] font-black uppercase text-purple-900 shrink-0">BỘ ĐỀ:</span>
            <select
              value={selectedQuizSubject}
              onChange={(e) => handleChangeSubject(e.target.value)}
              className="bg-transparent text-xs font-black text-purple-900 focus:outline-none cursor-pointer"
            >
              <option value="all">🎲 Ngẫu nhiên cả bộ đã chọn ({quizPool.length} câu)</option>
              {quizSubjects.map(sub => {
                const count = quizPool.filter(q => (q.subject || 'Tổng hợp') === sub).length;
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
              className="ml-1 px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-[12px] font-black uppercase cursor-pointer transition-all shadow-xs"
              title="Mở kho đề để tải lên bộ đề theo môn học mới"
            >
              + Nạp Bộ Đề Môn
            </button>
          </div>
        )}

        {/* Duration selection (User request: lựa chọn 4 giây) */}
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200">
          <Clock className="w-4 h-4 text-amber-600" />
          <span className="text-[12px] font-bold text-slate-500">Thời gian quay:</span>
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
          <div className="bg-white rounded-3xl p-4 md:p-6 shadow-2xl border-4 border-amber-900/60 relative select-none hover-zoom-card overflow-hidden">
            
            {/* Top Header Label */}
            <div className="flex items-center justify-between pb-3 px-2 text-amber-700">
              <div className="flex items-center gap-2">
                <Film className="w-5 h-5 text-amber-600 animate-pulse" />
                <span className="font-mono text-xs font-black uppercase tracking-widest text-amber-700">
                  CUỘN PHIM TOÀN CẢNH • KODAK VISION3 35MM
                </span>
              </div>
              <span className="text-[12px] font-mono text-slate-500">
                {isRolling ? `Đang trượt từ phải sang trái (${spinDuration}s)...` : 'Sẵn sàng quay (Phím cách)'}
              </span>
            </div>

            {/* Mode 3 Subject Banner Indicator */}
            {callMode === 'quiz' && (
              <div className="mb-3 py-1.5 px-3 rounded-xl bg-purple-600/80 border border-purple-500/40 flex items-center justify-between text-[12px] text-white">
                <div className="flex items-center gap-1.5 font-bold flex-wrap">
                  <BookOpen className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>BỘ ĐỀ ĐANG DÙNG:</span>
                  <span className="px-2 py-0.5 rounded bg-purple-700 text-white font-black">
                    {selectedQuizSubject === 'all' ? quizSel.label : `📖 Môn ${selectedQuizSubject}`}
                  </span>
                  <span className="text-purple-300">({getCandidateQuestions().length} câu hỏi sẵn sàng)</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditTargetQuestion(null);
                    setIsQuestionBankOpen(true);
                  }}
                  className="text-purple-300 hover:text-white underline cursor-pointer text-[12px] font-bold shrink-0 ml-2"
                >
                  + Nạp thêm câu hỏi
                </button>
                <button
                  type="button"
                  onClick={() => quizSel.request(() => setSelectedQuizSubject('all'))}
                  className="no-hover-fx px-2 py-0.5 rounded-lg bg-white text-purple-800 hover:bg-purple-50 cursor-pointer text-[12px] font-black shrink-0 ml-2 whitespace-nowrap"
                >
                  Đổi bộ câu hỏi
                </button>
              </div>
            )}

            {/* Sprocket Perforations - Top */}
            <div className="w-full flex items-center justify-between pb-3 border-b-2 border-dashed border-amber-600/30 overflow-hidden">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="w-3.5 h-4.5 rounded-xs bg-white border border-amber-600/40 shadow-inner shrink-0 mx-1" />
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
                  <div className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 font-black text-[12px] uppercase tracking-wider shadow-md">
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
                      className="shrink-0 h-[215px] rounded-2xl bg-gradient-to-b from-sky-600 via-blue-600 to-indigo-600 border-2 border-blue-300 p-2.5 flex flex-col items-center justify-between shadow-lg relative group"
                    >
                      {/* Frame STT & Gender badge */}
                      <div className="w-full flex items-center justify-between text-[12px] font-mono px-1">
                        <span className="text-amber-400 font-bold">#{student.stt}</span>
                        <span className={`px-1.5 py-0.2 rounded-md text-[12px] font-black ${
                          student.gender === 'Nam' ? 'bg-blue-600 text-white' : 'bg-pink-600 text-white'
                        }`}>
                          {student.gender}
                        </span>
                      </div>

                      {/* Large Clear Student Avatar */}
                      <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-amber-400/60 bg-slate-100 shadow-md my-1 relative shrink-0">
                        <img
                          src={student.avatar} onError={(e) => handleAvatarImgError(e, student?.gender, student?.name)}
                          alt={student.name}
                          className="w-full h-full object-cover object-center"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      {/* Student Name */}
                      <div className="w-full text-center px-1">
                        <div className="text-xs font-black text-white truncate leading-tight" title={student.name}>
                          {student.name}
                        </div>
                        <div className="text-[12px] text-white truncate mt-0.5">
                          {student.group || 'Tổ 1'} • <CoinIcon /> {student.points}x
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
                <div key={i} className="w-3.5 h-4.5 rounded-xs bg-white border border-amber-600/40 shadow-inner shrink-0 mx-1" />
              ))}
            </div>
          </div>

          {/* Hộp chúc mừng học sinh được gọi (giống Ống kính) */}
          <CalledStudentModal
            open={showWinnerPopup && Boolean(winner)}
            student={winner ? (currentClassStudents.find(s => s.id === winner.id) || winner) : null}
            title="Cuộn phim gọi tên!"
            icon={<Film className="w-5 h-5 text-amber-200 shrink-0" />}
            badge="35MM"
            classNameLabel={currentClass?.name ? `Lớp ${currentClass.name}` : undefined}
            message={winner ? <>Cuộn phim đã dừng đúng khung hình của <strong className="text-slate-900">{winner.name}</strong>. Chúc mừng em được gọi tên!</> : undefined}
            onAward={callMode === 'quiz' ? undefined : (pts, reason) => handleAward(pts, `Thưởng gọi tên qua Cuộn Phim 35mm – ${reason}`)}
            awarded={hasAwarded}
            secondaryAction={callMode === 'quiz' ? {
              label: 'Bốc câu hỏi',
              icon: <HelpCircle className="w-4 h-4" />,
              onClick: () => { setShowWinnerPopup(false); handleOpenRandomQuestion(); }
            } : undefined}
            continueLabel={callMode === 'quiz' ? 'Để sau' : 'Tiếp tục gọi em khác'}
            onClose={() => {
              setShowWinnerPopup(false);
              if (callMode !== 'quiz') {
                setWinner(null);
                setHasAwarded(false);
                setCurrentQuestion(null);
              }
            }}
          />

          {/* Thẻ câu hỏi dưới cuộn phim: chỉ dùng cho chế độ Gọi tên + Trả lời câu hỏi */}
          {winner && (callMode as string) === 'quiz' && (() => {
            const currentWinner = currentClassStudents.find(s => s.id === winner.id) || winner;
            const classNameDisplay = currentClass?.name ? `(${currentClass.name})` : '';
            return (
            <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-100/90 border-2 border-amber-300 rounded-3xl p-5 md:p-6 shadow-lg space-y-4 animate-in fade-in zoom-in-95 hover-zoom-card">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-center sm:text-left">
                  <div className="relative shrink-0">
                    <img 
                      src={currentWinner.avatar} onError={(e) => handleAvatarImgError(e, currentWinner?.gender, currentWinner?.name)} 
                      alt={currentWinner.name} 
                      className="w-16 h-16 md:w-20 md:h-20 rounded-2xl object-cover object-center border-4 border-amber-400 bg-white shadow-md"
                    />
                    <span className="absolute -bottom-1 -right-1 px-2 py-0.5 bg-amber-700 text-white font-black text-[12px] rounded-full shadow-xs">
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
                            ? 'bg-emerald-700 text-white shadow-emerald-600/20'
                            : 'bg-amber-700 hover:bg-amber-800 text-white shadow-amber-500/25'
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
                        <span className="px-3 py-1 rounded-full bg-purple-600 text-white text-[12px] font-black uppercase tracking-wide flex items-center gap-1.5 shadow-xs">
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
                        <span className="text-[12px] font-black uppercase text-purple-900">BỘ ĐỀ:</span>
                        <select
                          value={selectedQuizSubject}
                          onChange={(e) => setSelectedQuizSubject(e.target.value)}
                          className="bg-transparent text-xs font-bold text-purple-900 focus:outline-none cursor-pointer"
                        >
                          <option value="all">🎲 Ngẫu nhiên cả bộ đã chọn ({quizPool.length} câu)</option>
                          {quizSubjects.map(sub => {
                            const count = quizPool.filter(q => (q.subject || 'Tổng hợp') === sub).length;
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
                      className="flex-1 py-3.5 px-5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-800 hover:to-indigo-700 text-white font-black text-xs sm:text-sm md:text-base rounded-2xl shadow-md shadow-purple-500/25 flex items-center justify-center gap-2.5 transition-all hover-zoom-btn uppercase cursor-pointer"
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
            className="w-full py-3.5 sm:py-4 px-4 sm:px-6 bg-gradient-to-r from-amber-700 via-rose-600 to-indigo-600 hover:from-amber-800 hover:to-indigo-700 text-white font-black text-xs sm:text-base rounded-2xl sm:rounded-3xl shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2 transition-all hover-zoom-btn disabled:opacity-50 uppercase cursor-pointer"
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
                  className="text-[12px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 hover-zoom-interactive cursor-pointer"
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
                        src={h.avatar} onError={(e) => handleAvatarImgError(e, undefined, h?.name)}
                        alt={h.name}
                        className="w-9 h-9 rounded-xl object-cover object-center bg-white ring-1 ring-slate-200 shrink-0"
                      />
                      <div className="truncate">
                        <div className="text-xs font-black text-slate-900 truncate">{h.name}</div>
                        <div className="text-[12px] text-slate-400 font-mono">{h.time}</div>
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
                <p className="text-[12px] text-slate-400">Bấm nút &quot;Quay Cuộn Phim&quot; để bắt đầu</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* QUESTION BANK MODAL */}
      {quizSel.element}
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
          } else if (currentQuestion) {
            const updatedCur = updated.find(q => q.id === currentQuestion.id);
            if (updatedCur) {
              setCurrentQuestion(updatedCur);
            }
          }
        }}
      />

      {/* 4. Wide-screen question dialog for the called student */}
      <QuestionChallengeModal
        open={isQuestionModalOpen}
        student={callMode === 'quiz' ? winner : null}
        pool={quizPool}
        drawToken={quizDrawToken}
        subject={selectedQuizSubject}
        onSubjectChange={setSelectedQuizSubject}
        onClose={() => setIsQuestionModalOpen(false)}
        closeLabel="🎬 HOÀN THÀNH & QUAY LẠI CUỘN PHIM"
        onEditQuestion={(q) => { setEditTargetQuestion(q); setIsQuestionBankOpen(true); }}
        onQuestionChange={setCurrentQuestion}
      />
    </div>
  );
};
