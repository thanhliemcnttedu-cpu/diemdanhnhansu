import React, { useEffect, useState } from 'react';
import { Award, BookOpen, Check, CheckSquare, Edit3, RefreshCw, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useClassroom } from '../../../context/ClassroomContext';
import { Student, QuestionItem } from '../../../types';
import { CoinIcon } from '../../common/CoinIcon';
import { playTickSound, playFanfareSound, playCoinSound, triggerCorrectCelebration, triggerWrongFeedback } from '../../../utils/audio';
import { handleAvatarImgError } from '../../../utils/avatarConfig';
import { shuffleAvoid, shuffleMatching } from '../../../utils/shuffle';
import { QuestionAudioButton } from './QuestionAudioButton';
import { SequenceBoard, MatchingBoard } from './AnswerBoards';

/**
 * Wide-screen "answer a question" dialog shared by the name-calling games
 * (Cuộn phim, Tàu vũ trụ, Hộp quà). It owns the whole question state: draws a random
 * question from `pool` every time `drawToken` changes, handles the 7 question types,
 * and awards coins to `student`. The game only decides when to draw and when to show it.
 */
export interface QuestionChallengeModalProps {
  open: boolean;
  student: Student | null;
  /** Questions of the question set the teacher chose (useQuizSelection().pool) */
  pool: QuestionItem[];
  /** Increase to draw a new random question for the current student */
  drawToken: number;
  onClose: () => void;
  closeLabel?: string;
  /** Subject filter inside the pool; uncontrolled when omitted */
  subject?: string;
  onSubjectChange?: (subject: string) => void;
  onEditQuestion?: (q: QuestionItem) => void;
  /** Tells the game which question is currently drawn (null = none yet) */
  onQuestionChange?: (q: QuestionItem | null) => void;
}

export const QuestionChallengeModal: React.FC<QuestionChallengeModalProps> = ({
  open, student, pool, drawToken, onClose, closeLabel = 'HOÀN THÀNH & QUAY LẠI TRÒ CHƠI',
  subject, onSubjectChange, onEditQuestion, onQuestionChange,
}) => {
  const { currentClassStudents, awardPoints } = useClassroom();
  const winner = student;
  const quizPool = pool;

  const [innerSubject, setInnerSubject] = useState<string>('all');
  const selectedQuizSubject = subject ?? innerSubject;
  const setSelectedQuizSubject = (s: string) => { setInnerSubject(s); onSubjectChange?.(s); };

  const [currentQuestion, setCurrentQuestion] = useState<QuestionItem | null>(null);
  const [hasAwarded, setHasAwarded] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showTeacherKey, setShowTeacherKey] = useState(false);
  const [isAnswerCorrect, setIsAnswerCorrect] = useState<boolean | null>(null);
  const [oralStatus, setOralStatus] = useState<'pending' | 'correct' | 'incorrect'>('pending');
  const [customOralPoints, setCustomOralPoints] = useState<number>(2);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string } | null>(null);
  const [selectedMultiOptions, setSelectedMultiOptions] = useState<number[]>([]);
  const [selectedTrueFalse, setSelectedTrueFalse] = useState<boolean | null>(null);
  const [filledBlankWords, setFilledBlankWords] = useState<Record<number, string>>({});
  const [, setShuffledSequence] = useState<string[]>([]);
  const [shuffledRightMatching, setShuffledRightMatching] = useState<Array<{ id: number; text: string }>>([]);
  const [leftMatchOrder, setLeftMatchOrder] = useState<number[]>([]);
  const [seqPool, setSeqPool] = useState<number[]>([]);
  const [seqAnswer, setSeqAnswer] = useState<number[]>([]);
  const [selectedLeftMatchIndex, setSelectedLeftMatchIndex] = useState<number | null>(null);
  const [userMatches, setUserMatches] = useState<Record<number, number>>({}); // leftIdx -> rightIdx

  const quizSubjects = Array.from(new Set(quizPool.map(q => q.subject || 'Tổng hợp'))).filter(Boolean);

  const getCandidateQuestions = (sub = selectedQuizSubject) => {
    if (sub === 'all') return quizPool;
    const filtered = quizPool.filter(q => (q.subject || 'Tổng hợp') === sub);
    return filtered.length > 0 ? filtered : quizPool;
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
      setShuffledSequence(shuffleAvoid(q.sequenceItems));
      setSeqPool(shuffleAvoid(q.sequenceItems.map((_, i) => i)));
      setSeqAnswer([]);
    } else {
      setShuffledSequence([]);
    }

    if (q.type === 'matching' && q.matchingPairs) {
      // Xáo trộn CẢ cột A và cột B (không để các cặp đúng nằm thẳng hàng)
      const pairs = q.matchingPairs;
      const order = shuffleMatching(pairs.length);
      setLeftMatchOrder(order.left);
      setShuffledRightMatching(order.right.map(idx => ({ id: idx, text: pairs[idx].right })));
    } else {
      setShuffledRightMatching([]);
      setLeftMatchOrder([]);
    }
  };

  const handleChangeSubject = (newSubject: string) => {
    setSelectedQuizSubject(newSubject);
    const candidates = getCandidateQuestions(newSubject);
    if (candidates.length > 0) setupQuestionState(candidates[Math.floor(Math.random() * candidates.length)]);
  };

  const handleAward = (amount: number, reason: string) => {
    if (!winner || hasAwarded) return;
    awardPoints([winner.id], amount, reason, currentQuestion?.subject || 'Ghi chung');
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
    const isCorrect = expected.length === seqAnswer.length && seqAnswer.every((v, idx) => v === idx || (expected[v] === expected[idx] && (currentQuestion.sequenceImages?.[v] || '') === (currentQuestion.sequenceImages?.[idx] || '')));

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

  useEffect(() => { onQuestionChange?.(currentQuestion); }, [currentQuestion]); // eslint-disable-line react-hooks/exhaustive-deps

  // A newly called student starts without a question
  useEffect(() => { setCurrentQuestion(null); }, [student?.id]);

  // Draw a random question (not the one on screen) each time the game asks for one
  useEffect(() => {
    if (drawToken <= 0 || !student) return;
    const candidates = getCandidateQuestions();
    if (candidates.length === 0) return;
    const others = candidates.filter(q => q.id !== currentQuestion?.id);
    const from = others.length > 0 ? others : candidates;
    setupQuestionState(from[Math.floor(Math.random() * from.length)]);
  }, [drawToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // The question was edited in the question bank → show the new content
  useEffect(() => {
    if (!currentQuestion) return;
    const updated = pool.find(q => q.id === currentQuestion.id);
    if (updated && updated !== currentQuestion) setCurrentQuestion(updated);
  }, [pool]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !currentQuestion || !winner) return null;

        const currentWinner = currentClassStudents.find(s => s.id === winner.id) || winner;
        const hasOptionImages = Boolean(currentQuestion.optionImages && currentQuestion.optionImages.some(img => Boolean(img)));
        const hasAnyImage = Boolean(currentQuestion.image || hasOptionImages || currentQuestion.answerImage);

  return (
    <>
          <div className="fixed inset-0 z-50 bg-sky-900/20 backdrop-blur-xs flex flex-col items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in zoom-in-95 duration-150 select-none">
            <div className={`bg-gradient-to-b from-sky-50 via-white to-indigo-50 border-2 border-sky-300 rounded-3xl w-full max-w-5xl md:max-w-6xl max-h-[98vh] overflow-y-auto shadow-2xl text-slate-900 flex flex-col justify-between ${
              hasAnyImage ? 'p-3.5 sm:p-5 space-y-2.5' : 'p-5 sm:p-7 md:p-8 space-y-4 sm:space-y-5'
            }`}>
              
              {/* Header Màn Hình Rộng: Học sinh + Đổi môn + Nút ĐỔI CÂU HỎI KHÁC + Nút Đóng */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200">
                {/* Thông tin học sinh đang được gọi */}
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <img
                      src={currentWinner.avatar} onError={(e) => handleAvatarImgError(e, currentWinner?.gender, currentWinner?.name)}
                      alt={currentWinner.name}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl object-cover object-center border-2 border-amber-400 bg-slate-100 shadow-md"
                    />
                    <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 bg-amber-500 text-slate-950 font-black text-[12px] rounded-full shadow-xs">
                      #{currentWinner.stt}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[12px] font-black uppercase tracking-wider border border-amber-300">
                        🎬 ĐANG TRẢ LỜI CÂU HỎI
                      </span>
                      <span className="text-xs text-slate-700">
                        {currentWinner.group || 'Tổ 1'} • <CoinIcon /> <strong className="text-amber-800 font-black">{currentWinner.points} xu</strong>
                      </span>
                    </div>
                    <h3 className="text-lg sm:text-2xl font-black text-slate-900 uppercase tracking-wide mt-0.5">
                      {currentWinner.name}
                    </h3>
                  </div>
                </div>

                {/* Các nút điều khiển hàng đầu: Đổi môn + NÚT ĐỔI CÂU HỎI KHÁC + Đóng */}
                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {/* Dropdown môn học */}
                  <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl">
                    <BookOpen className="w-4 h-4 text-purple-600 shrink-0" />
                    <select
                      value={selectedQuizSubject}
                      onChange={(e) => handleChangeSubject(e.target.value)}
                      className="bg-transparent text-xs font-bold text-purple-700 focus:outline-none cursor-pointer"
                    >
                      <option value="all" className="bg-white text-slate-800">🎲 Toàn bộ môn ({quizPool.length})</option>
                      {quizSubjects.map(sub => {
                        const count = quizPool.filter(q => (q.subject || 'Tổng hợp') === sub).length;
                        return (
                          <option key={sub} value={sub} className="bg-white text-slate-800">
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
                      onEditQuestion?.(currentQuestion);
                    }}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold border border-slate-200 cursor-pointer"
                    title="Chỉnh sửa câu hỏi này"
                  >
                    <Edit3 className="w-4 h-4 text-amber-600" />
                  </button>

                  {/* Nút đóng màn hình rộng */}
                  <button
                    type="button"
                    onClick={() => onClose()}
                    className="p-2 bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-slate-800 rounded-xl text-xs font-bold border border-slate-200 cursor-pointer"
                    title="Thu nhỏ màn câu hỏi"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Thông tin loại câu hỏi & Xu thưởng */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-100/80 border border-slate-200 text-xs">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-xl bg-purple-600 text-white font-black text-[12px] uppercase tracking-wide shadow-xs">
                    {currentQuestion.type === 'multiple_choice' && '📝 Trắc Nghiệm 1 Đáp Án'}
                    {currentQuestion.type === 'multi_select' && '☑️ Trắc Nghiệm Nhiều Đáp Án'}
                    {currentQuestion.type === 'true_false' && '⚖️ Câu Hỏi Đúng / Sai'}
                    {currentQuestion.type === 'fill_blank' && '🧩 Kéo Thả / Điền Chỗ Trống'}
                    {currentQuestion.type === 'sequence_order' && '🔢 Sắp Xếp Thứ Tự Các Bước'}
                    {currentQuestion.type === 'matching' && '🔗 Nối Cột A Với Cột B'}
                    {currentQuestion.type === 'oral' && '🗣️ Tự Luận / Bằng Lời'}
                  </span>
                  <span className="text-slate-600 font-medium text-xs">
                    Môn: <strong className="text-purple-600">{currentQuestion.subject || 'Tổng hợp'}</strong>
                  </span>
                </div>

                {/* Chọn mức xu thưởng */}
                <div className="flex items-center gap-1.5 bg-white/80 px-2.5 py-1 rounded-xl border border-slate-200">
                  <Award className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-[12px] font-black text-amber-700 uppercase">Xu thưởng:</span>
                  {[1, 2, 3, 4, 5, 10].map((pts) => (
                    <button
                      key={pts}
                      type="button"
                      disabled={isAnswerCorrect !== null || (currentQuestion.type === 'oral' && oralStatus !== 'pending')}
                      onClick={() => setCustomOralPoints(pts)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                        customOralPoints === pts 
                          ? 'bg-amber-400 text-slate-950 shadow-xs' 
                          : 'text-amber-800 hover:bg-amber-100'
                      }`}
                      title={`Đặt mức thưởng ${pts} xu`}
                    >
                      +{pts}
                    </button>
                  ))}
                </div>
              </div>

              {/* NỘI DUNG CÂU HỎI (Tự động tăng cỡ chữ cực đại khi không có ảnh để giáo viên & học sinh dễ đọc) */}
              <div className={`bg-white rounded-2xl md:rounded-3xl border-2 border-sky-200 shadow-sm ${
                hasAnyImage ? 'p-3.5 sm:p-4 space-y-2.5' : 'p-5 sm:p-7 md:p-8 space-y-3'
              }`}>
                <div className={`font-black text-slate-900 leading-snug ${
                  hasAnyImage 
                    ? 'text-base sm:text-lg md:text-xl' 
                    : 'text-xl sm:text-2xl md:text-3xl lg:text-4xl'
                }`}>
                  {currentQuestion.questionText}
                </div>

                {/* Ảnh minh họa câu hỏi nếu có */}
                <QuestionAudioButton src={currentQuestion.audio} className="pt-1" />
                {currentQuestion.image && (
                  <div className="pt-0.5 flex justify-center">
                    <div className="relative inline-block group">
                      <img 
                        src={currentQuestion.image} 
                        alt="Ảnh minh họa câu hỏi" 
                        onClick={() => setZoomedImage({ url: currentQuestion.image!, title: 'Ảnh minh họa câu hỏi' })}
                        className="max-h-36 sm:max-h-44 rounded-xl border-2 border-slate-200 object-contain bg-white shadow-md cursor-zoom-in hover:opacity-95 transition-opacity"
                      />
                      <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[12px] font-bold px-1.5 py-0.5 rounded-md pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
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
                      let btnStyle = 'bg-white border-slate-300 text-slate-900 hover:border-indigo-500 hover:bg-indigo-50';

                      if (selectedOption !== null) {
                        if (isCorrect) {
                          btnStyle = 'bg-emerald-600/90 border-emerald-400 text-white font-bold ring-2 ring-emerald-400/50';
                        } else if (isSelected) {
                          btnStyle = 'bg-rose-600/90 border-rose-500 text-white';
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
                                ? 'bg-emerald-700 text-white shadow-xs' 
                                : selectedOption !== null && isSelected
                                ? 'bg-rose-600 text-white'
                                : 'bg-slate-200 text-amber-700'
                            }`}>
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span className={`flex-1 font-bold leading-snug ${
                              hasAnyImage ? 'text-xs sm:text-sm truncate sm:whitespace-normal' : 'text-base sm:text-lg md:text-xl'
                            }`}>
                              {opt}
                            </span>
                            {selectedOption !== null && isCorrect && (
                              <Check className={hasAnyImage ? 'w-5 h-5 text-white shrink-0' : 'w-7 h-7 text-white shrink-0'} />
                            )}
                          </div>

                          {optImage && (
                            <div className="mt-2 w-full bg-white/90 rounded-xl p-1.5 border border-slate-200 flex flex-col items-center justify-center overflow-hidden">
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
                  <div className={`font-bold text-indigo-800 flex items-center gap-2 ${
                    hasAnyImage ? 'text-[12px]' : 'text-xs sm:text-sm'
                  }`}>
                    <CheckSquare className={hasAnyImage ? 'w-3.5 h-3.5 text-indigo-700' : 'w-5 h-5 text-indigo-700'} />
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
                        ? 'bg-indigo-600/80 border-indigo-400 ring-2 ring-indigo-400/40 text-white' 
                        : 'bg-white border-slate-300 text-slate-900 hover:border-indigo-500 hover:bg-indigo-50';

                      if (isAnswerCorrect !== null) {
                        if (isCorrectAnswer) {
                          cardStyle = 'bg-emerald-600/90 border-emerald-400 text-white font-bold ring-2 ring-emerald-400/50';
                        } else if (isChecked && !isCorrectAnswer) {
                          cardStyle = 'bg-rose-600/90 border-rose-500 text-white';
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
                              isChecked ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {isChecked ? '✓' : String.fromCharCode(65 + idx)}
                            </span>
                            <span className={`flex-1 font-bold leading-snug ${
                              hasAnyImage ? 'text-xs sm:text-sm' : 'text-base sm:text-lg md:text-xl'
                            }`}>
                              {opt}
                            </span>
                            {isAnswerCorrect !== null && isCorrectAnswer && (
                              <Check className={hasAnyImage ? 'w-5 h-5 text-white shrink-0' : 'w-7 h-7 text-white shrink-0'} />
                            )}
                          </div>

                          {optImage && (
                            <div className="mt-2 w-full bg-white/90 rounded-xl p-1.5 border border-slate-200 flex flex-col items-center justify-center overflow-hidden">
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
                            ? 'bg-emerald-700 text-white border-emerald-400 ring-2 sm:ring-4 ring-emerald-400/50'
                            : selectedTrueFalse === true
                            ? 'bg-rose-600 text-white border-rose-400'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                          : 'bg-white text-emerald-800 border-emerald-600 hover:bg-emerald-50'
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
                            ? 'bg-emerald-700 text-white border-emerald-400 ring-2 sm:ring-4 ring-emerald-400/50'
                            : selectedTrueFalse === false
                            ? 'bg-rose-600 text-white border-rose-400'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                          : 'bg-white text-rose-700 border-rose-600 hover:bg-rose-50'
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
                    <div className="p-2.5 sm:p-3 bg-white/90 rounded-2xl border border-slate-200 space-y-1.5">
                      <div className="text-[12px] font-bold text-amber-700 uppercase">
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
                                    ? 'bg-slate-100 text-slate-600 border border-slate-200 opacity-40' 
                                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white border border-indigo-400 hover-zoom-btn'
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
                  <div className="p-2.5 sm:p-3 bg-white rounded-2xl border border-slate-200 space-y-2">
                    <div className="text-[12px] font-bold text-slate-600 uppercase">Các vị trí cần điền:</div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {(currentQuestion.blankAnswers || ['']).map((_, sIdx) => {
                        const filled = filledBlankWords[sIdx];
                        return (
                          <div key={sIdx} className="flex items-center gap-1.5">
                            <span className="text-[12px] text-slate-500 font-bold">Vị trí {sIdx + 1}:</span>
                            <div className="flex items-center gap-1">
                              <span className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-black border-2 min-w-[100px] text-center ${
                                filled 
                                  ? 'bg-purple-600 border-purple-400 text-white' 
                                  : 'bg-white border-dashed border-slate-200 text-slate-500'
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
                                  className="p-1 bg-slate-200 hover:bg-rose-100 text-slate-600 rounded-lg text-xs"
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
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl"
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
                  <SequenceBoard
                    items={(currentQuestion.sequenceItems || []).map((t, k) => ({ text: t, image: currentQuestion.sequenceImages?.[k] || undefined }))}
                    pool={seqPool.length === (currentQuestion.sequenceItems || []).length ? seqPool : (currentQuestion.sequenceItems || []).map((_, k) => k)}
                    order={seqAnswer} onChange={setSeqAnswer} locked={isAnswerCorrect !== null} textSize="text-sm sm:text-base" />

                  {isAnswerCorrect === null && (
                    <div className="pt-1 flex justify-center">
                      <button
                        type="button"
                        onClick={handleSubmitSequence}
                        disabled={seqAnswer.length < (currentQuestion.sequenceItems || []).length}
                        className="disabled:opacity-40 px-6 py-2 bg-gradient-to-r from-cyan-700 to-blue-600 hover:from-cyan-800 hover:to-blue-700 text-white font-black text-xs sm:text-sm rounded-xl shadow-md cursor-pointer transition-all hover-zoom-btn uppercase"
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
                  <div className="text-sm font-bold text-slate-800">
                    Bấm chọn 1 ô ở Cột A, sau đó bấm ô cần nối ở Cột B (bấm lại ô A để nối lại):
                  </div>
                  <MatchingBoard
                    left={(currentQuestion.matchingPairs || []).map(p => ({ text: p.left, image: p.leftImage }))}
                    right={(currentQuestion.matchingPairs || []).map(p => ({ text: p.right, image: p.rightImage }))}
                    leftOrder={leftMatchOrder.length === (currentQuestion.matchingPairs || []).length ? leftMatchOrder : (currentQuestion.matchingPairs || []).map((_, k) => k)}
                    rightOrder={shuffledRightMatching.length === (currentQuestion.matchingPairs || []).length ? shuffledRightMatching.map(r => r.id) : (currentQuestion.matchingPairs || []).map((_, k) => k)}
                    matches={userMatches}
                    selected={selectedLeftMatchIndex}
                    onSelect={setSelectedLeftMatchIndex}
                    onMatch={(l, r) => setUserMatches(m => ({ ...m, [l]: r }))}
                    onUnmatch={(l) => setUserMatches(m => { const n = { ...m }; delete n[l]; return n; })}
                    locked={isAnswerCorrect !== null} />

                  {isAnswerCorrect === null && (
                    <div className="pt-1 flex justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => { setUserMatches({}); setSelectedLeftMatchIndex(null); }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl"
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
                    <div className="p-4 bg-emerald-700/90 border-2 border-emerald-400 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-black shrink-0 shadow-md">
                          <Check className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-sm sm:text-base font-black text-white uppercase">
                            🎉 CHÍNH XÁC! {currentWinner.name} ĐÃ ĐƯỢC CỘNG +{customOralPoints || currentQuestion.pointsReward || 2} XU!
                          </div>
                          <p className="text-xs text-emerald-50 font-medium mt-0.5">
                            Điểm xu hiện tại của học sinh: <strong className="text-white font-black">{currentWinner.points} xu</strong>
                          </p>
                        </div>
                      </div>
                      <span className="px-4 py-2 bg-emerald-500 text-slate-950 rounded-xl text-xs sm:text-sm font-black shrink-0 shadow-md uppercase">
                        +{customOralPoints || currentQuestion.pointsReward || 2} Xu <CoinIcon />
                      </span>
                    </div>
                  ) : (
                    <div className="p-4 bg-rose-600/90 border-2 border-rose-400 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black shrink-0 shadow-md text-base">
                          ✕
                        </div>
                        <div>
                          <div className="text-sm sm:text-base font-black text-white uppercase">
                            ❌ RẤT TIẾC, CHƯA CHÍNH XÁC! KHÔNG ĐƯỢC CỘNG XU (0 XU)
                          </div>
                          <p className="text-xs text-rose-50 font-medium mt-0.5">
                            Học sinh chưa hoàn thành câu trả lời đúng. Lượt này không cộng xu.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleRetryQuestion}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-rose-700 border border-rose-500/50 rounded-xl text-xs font-bold transition-colors cursor-pointer"
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
                              ? 'bg-slate-100 text-slate-500' 
                              : 'bg-amber-700 hover:bg-amber-800 text-white'
                          }`}
                          title="Tặng 1 xu động viên học sinh đã nỗ lực"
                        >
                          {hasAwarded ? 'Đã tặng +1 xu động viên' : 'Động viên (+1 xu) 💰'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lời giải chi tiết */}
                  {(currentQuestion.teacherAnswerKey || currentQuestion.answerImage) && (
                    <div className="p-2.5 sm:p-3 bg-slate-100/80 border border-slate-200 rounded-xl text-xs text-slate-700 space-y-1">
                      {currentQuestion.teacherAnswerKey && (
                        <div>
                          <strong className="text-amber-700">Giải thích / Đáp án chuẩn:</strong> {currentQuestion.teacherAnswerKey}
                        </div>
                      )}
                      {currentQuestion.answerImage && (
                        <div className="pt-0.5">
                          <span className="text-[12px] font-black uppercase text-slate-500 block mb-0.5">Ảnh minh họa lời giải:</span>
                          <img
                            src={currentQuestion.answerImage}
                            alt="Ảnh minh họa đáp án"
                            onClick={() => setZoomedImage({ url: currentQuestion.answerImage!, title: 'Ảnh minh họa lời giải chi tiết' })}
                            className="max-h-28 sm:max-h-36 rounded-lg border border-slate-200 object-contain bg-white shadow-sm cursor-zoom-in"
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
                      className="text-sm font-bold text-amber-800 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>{showTeacherKey ? 'Ẩn gợi ý đáp án' : '👁️ Xem đáp án & gợi ý chấm của giáo viên'}</span>
                    </button>
                  </div>

                  {showTeacherKey && (
                    <div className="p-2.5 sm:p-3 bg-white border border-amber-500/40 rounded-xl text-xs text-amber-700 space-y-1.5 animate-in fade-in">
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
                            className="max-h-28 sm:max-h-36 rounded-lg border border-amber-400/40 object-contain bg-white shadow-md cursor-zoom-in"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Giáo viên xác nhận tự luận */}
                  {oralStatus === 'pending' && (
                    <div className="p-3 bg-white border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="text-xs text-slate-700">
                        <strong className="block text-xs sm:text-sm font-black text-amber-700 uppercase">Học sinh đang trả lời trước lớp:</strong>
                        <span className="text-slate-500 text-[12px]">Thầy/cô lắng nghe và bấm xác nhận để cộng điểm:</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleConfirmOralCorrect(customOralPoints)}
                          className="px-4 py-2 rounded-xl text-xs sm:text-sm font-black shadow-md bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1 cursor-pointer uppercase hover-zoom-btn"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>XÁC NHẬN ĐÚNG (+{customOralPoints} XU)</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmOralIncorrect}
                          className="px-3 py-2 rounded-xl text-xs font-bold border border-rose-500/50 bg-white hover:bg-rose-50 text-rose-600 flex items-center gap-1 cursor-pointer"
                        >
                          <span>✕ Chưa đúng (0 xu)</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Kết quả tự luận đúng */}
                  {oralStatus === 'correct' && (
                    <div className="p-3 bg-emerald-700/90 border-2 border-emerald-400 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-black shrink-0 shadow-md">
                          <Check className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs sm:text-sm font-black text-white uppercase">
                            🎉 GIÁO VIÊN ĐÃ XÁC NHẬN: TRẢ LỜI ĐÚNG VÀ CỘNG +{customOralPoints} XU!
                          </div>
                          <p className="text-[12px] text-emerald-50 font-medium mt-0.5">
                            Đã cộng vào tài khoản của <strong>{currentWinner.name}</strong>. Tổng điểm xu: <strong className="text-white font-black">{currentWinner.points} xu</strong>
                          </p>
                        </div>
                      </div>
                      <span className="px-3 py-1.5 bg-emerald-500 text-slate-950 rounded-xl text-xs font-black shrink-0 uppercase">
                        +{customOralPoints} Xu <CoinIcon />
                      </span>
                    </div>
                  )}

                  {/* Kết quả tự luận chưa đúng */}
                  {oralStatus === 'incorrect' && (
                    <div className="p-3 bg-rose-600/90 border-2 border-rose-400 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black shrink-0 shadow-md text-sm">
                          ✕
                        </div>
                        <div>
                          <div className="text-xs sm:text-sm font-black text-white uppercase">
                            ❌ CHƯA ĐẠT YÊU CẦU – KHÔNG CỘNG XU
                          </div>
                          <p className="text-[12px] text-rose-50 font-medium mt-0.5">
                            Học sinh chưa hoàn thành câu trả lời. Lượt này không cộng xu.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleResetOralEvaluation}
                          className="px-2.5 py-1 bg-slate-100 text-rose-700 border border-rose-500/50 rounded-lg text-xs font-bold cursor-pointer"
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
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handlePickAnotherQuestion}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-amber-700 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Đổi câu hỏi khác cho em này</span>
                </button>

                <button
                  type="button"
                  onClick={() => onClose()}
                  className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-xs sm:text-sm rounded-xl shadow-md cursor-pointer transition-all hover-zoom-btn uppercase"
                >
                  <span>{closeLabel}</span>
                </button>
              </div>

            </div>
          </div>
      {/* FULL-SCREEN ZOOMED IMAGE LIGHTBOX MODAL */}
      {zoomedImage && (
        <div 
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-[60] bg-sky-900/20 backdrop-blur-xs flex flex-col items-center justify-center p-4 cursor-zoom-out select-none animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl p-4 max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200"
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
    </>
  );
};
