import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { 
  Sparkles, Brain, Award, MessageSquare, Copy, Check, 
  RotateCcw, Send, HelpCircle, Users, HeartHandshake,
  Lightbulb, ChevronRight, ChevronLeft, Play, CheckCircle2, AlertCircle, Eye, EyeOff,
  Dice5, Shuffle, BookOpen, BookMarked, Sliders, CheckSquare, Square, ThumbsUp, ThumbsDown,
  Paperclip, FileText, X, Trash2, Maximize2, Minimize2, ChevronDown, ChevronUp
} from 'lucide-react';
import { 
  callGeminiAi, 
  generateSmartRemarksFallback, 
  generateSmartParentMessageFallback, 
  generateSmartWarmupQuizFallback,
  generateKetNoiTriThucQuiz,
  generateKetNoiTriThucQuizFallback,
  shuffleMatchingRight
} from '../../services/aiService';
import { processAttachmentFile, ProcessedAttachment } from '../../utils/fileAttachmentHelper';
import { QuizQuestion, QuizQuestionType, QuizDifficulty, QuizGenerationConfig } from '../../types/quiz';
import { playPointClink, playFanfare } from '../../utils/audio';
import confetti from 'canvas-confetti';
import { EnergizerGameArena, EnergizerGame } from './ai/EnergizerGameArena';

const ENERGIZER_GAMES: EnergizerGame[] = [
  {
    id: 'game-1',
    title: 'Trò chơi "Vỗ tay theo nhịp Hạnh Phúc"',
    duration: '3 phút',
    durationSeconds: 180,
    benefit: 'Khởi động sự tập trung tức thì, giải phóng năng lượng uể oải',
    rules: 'Giáo viên vỗ 1 nhịp = Cả lớp đứng lên vỗ 2 nhịp; Giáo viên vỗ 2 nhịp = Cả lớp cười ha ha. Bạn nào nhầm vỗ phạt cười thật to!'
  },
  {
    id: 'game-2',
    title: 'Thử thách "Bức tượng tĩnh lặng"',
    duration: '2 phút',
    durationSeconds: 120,
    benefit: 'Ổn định trật tự khi lớp đang quá ồn ào hoặc sau giờ ra chơi',
    rules: 'Giáo viên bấm chuông chống ồn, cả lớp hóa thành tượng bất động trong 60 giây. Tổ nào giữ trật tự 100% nhận ngay +3 xu thi đua!'
  },
  {
    id: 'game-3',
    title: 'Vòng quay "Chiếc hộp bí mật"',
    duration: '5 phút',
    durationSeconds: 300,
    benefit: 'Ôn tập kiến thức cũ thông qua hình thức bốc thăm may mắn',
    rules: 'Dùng Vòng quay may mắn gọi tên 3 bạn. Mỗi bạn giải đúng 1 câu đố nhanh sẽ nhận ngay 1 món quà hoặc +5 xu thi đua.'
  },
  {
    id: 'game-4',
    title: 'Trò chơi "Gió thổi - Gió thổi"',
    duration: '4 phút',
    durationSeconds: 240,
    benefit: 'Gắn kết học sinh, rèn luyện phản xạ nhanh nhạy',
    rules: 'Giáo viên hô "Gió thổi, gió thổi!", học sinh đáp "Thổi ai, thổi ai?". Giáo viên: "Thổi những bạn mang áo trắng đổi chỗ cho nhau!".'
  },
  {
    id: 'game-5',
    title: 'Bức thư "Lời khen giấu tên"',
    duration: '5 phút',
    durationSeconds: 300,
    benefit: 'Xây dựng lòng nhân ái, nuôi dưỡng tình bạn hạnh phúc',
    rules: 'Mỗi học sinh viết 1 lời khen dễ thương gửi cho bạn ngồi cạnh. Cuối giờ giáo viên đọc 3 lời khen ấm áp nhất trước lớp.'
  },
  {
    id: 'game-6',
    title: 'Thử thách "Đồng hồ cát 10 giây"',
    duration: '10 giây',
    durationSeconds: 10,
    benefit: 'Rèn tác phong thu dọn đồ dùng học tập nhanh gọn',
    rules: 'Bật đồng hồ đếm ngược 10 giây. Tất cả học sinh phải cất sách cũ, lấy vở mới ra bàn trước khi tiếng chuông reng.'
  }
];

type AiTab = 'remarks' | 'quiz' | 'seating' | 'energizers' | 'advisor';

export const AiAssistantView: React.FC = () => {
  const { 
    classes, activeClassId, students, subjects, awardPoints,
    assignSeat, seatingColumns
  } = useClassroom();

  const activeClass = classes.find(c => c.id === activeClassId);
  const classStudents = students.filter(s => s.classId === activeClassId);

  const [activeTab, setActiveTab] = useState<AiTab>('remarks');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(classStudents[0]?.id || '');
  const [selectedSubject, setSelectedSubject] = useState<string>('Toán');
  const [gradeLevel, setGradeLevel] = useState<string>(activeClass?.grade || 'Khối 4');
  
  // Loading & Outputs
  const [isLoading, setIsLoading] = useState(false);
  const [aiRemarkResult, setAiRemarkResult] = useState<string>('');
  const [aiParentMessageResult, setAiParentMessageResult] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Active Energizer Game State
  const [activeEnergizerGame, setActiveEnergizerGame] = useState<EnergizerGame | null>(null);

  // -------------------------------------------------------------
  // CẤU HÌNH & TRẠNG THÁI CÂU HỎI KHỞI ĐỘNG & ĐỐ VUI (SGK KẾT NỐI TRI THỨC)
  // -------------------------------------------------------------
  const [quizConfig, setQuizConfig] = useState<QuizGenerationConfig>({
    questionCount: 3,
    subject: 'Toán',
    grade: activeClass?.grade || 'Khối 4',
    curriculum: 'Bộ sách Kết nối tri thức với cuộc sống',
    semester: 'Học kỳ 1',
    topic: '',
    topicDescription: '',
    questionType: 'all',
    difficulty: 'DỄ',
    rewardCoins: 5,
  });

  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(() => 
    generateKetNoiTriThucQuizFallback({
      questionCount: 3,
      subject: 'Toán',
      grade: activeClass?.grade || 'Khối 4',
      curriculum: 'Bộ sách Kết nối tri thức với cuộc sống',
      semester: 'Học kỳ 1',
      topic: 'Phép tính & Tư duy khởi động',
      topicDescription: '',
      questionType: 'all',
      difficulty: 'DỄ',
      rewardCoins: 5,
    })
  );
  const [activeQuizIndex, setActiveQuizIndex] = useState(0);

  // Student answer interaction states
  const [userSingleAnswer, setUserSingleAnswer] = useState<number | null>(null);
  const [userMultipleAnswers, setUserMultipleAnswers] = useState<number[]>([]);
  const [userTrueFalseAnswer, setUserTrueFalseAnswer] = useState<boolean | null>(null);
  const [userMatches, setUserMatches] = useState<Record<string, string>>({});
  const [selectedMatchingLeft, setSelectedMatchingLeft] = useState<string | null>(null);
  const [userEssayAnswer, setUserEssayAnswer] = useState<string>('');
  const [essayTeacherDecision, setEssayTeacherDecision] = useState<'correct' | 'incorrect' | null>(null);

  // Evaluation & Results
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [isAnswerCorrect, setIsAnswerCorrect] = useState<boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [rewardAwarded, setRewardAwarded] = useState(false);

  // Random Student Picker State
  const [isSpinningStudent, setIsSpinningStudent] = useState(false);
  const [spinningStudentName, setSpinningStudentName] = useState<string>('');
  const [pickedAnnouncement, setPickedAnnouncement] = useState<string | null>(null);
  const [quizNotice, setQuizNotice] = useState<{ message: string; sub?: string; count?: number } | null>(null);

  // Per-question answer session storage to support seamless review and "Trả lời lại bộ câu hỏi"
  interface QuestionAnswerState {
    singleAnswer: number | null;
    multipleAnswers: number[];
    trueFalseAnswer: boolean | null;
    matches: Record<string, string>;
    selectedMatchingLeft: string | null;
    essayAnswer: string;
    essayTeacherDecision: 'correct' | 'incorrect' | null;
    isAnswerChecked: boolean;
    isAnswerCorrect: boolean | null;
    showExplanation: boolean;
    rewardAwarded: boolean;
  }

  const defaultQuestionAnswerState: QuestionAnswerState = {
    singleAnswer: null,
    multipleAnswers: [],
    trueFalseAnswer: null,
    matches: {},
    selectedMatchingLeft: null,
    essayAnswer: '',
    essayTeacherDecision: null,
    isAnswerChecked: false,
    isAnswerCorrect: null,
    showExplanation: false,
    rewardAwarded: false,
  };

  const [answersByQuestion, setAnswersByQuestion] = useState<Record<number, QuestionAnswerState>>({});

  // Reset interactive inputs when changing questions or restarting
  const resetCurrentAnswerState = () => {
    setUserSingleAnswer(null);
    setUserMultipleAnswers([]);
    setUserTrueFalseAnswer(null);
    setUserMatches({});
    setSelectedMatchingLeft(null);
    setUserEssayAnswer('');
    setEssayTeacherDecision(null);
    setIsAnswerChecked(false);
    setIsAnswerCorrect(null);
    setShowExplanation(false);
    setRewardAwarded(false);
  };

  // Switch between questions while preserving student responses
  const switchQuestion = (targetIdx: number) => {
    if (targetIdx === activeQuizIndex) return;

    // 1. Snapshot current active state
    setAnswersByQuestion(prev => ({
      ...prev,
      [activeQuizIndex]: {
        singleAnswer: userSingleAnswer,
        multipleAnswers: userMultipleAnswers,
        trueFalseAnswer: userTrueFalseAnswer,
        matches: userMatches,
        selectedMatchingLeft,
        essayAnswer: userEssayAnswer,
        essayTeacherDecision,
        isAnswerChecked,
        isAnswerCorrect,
        showExplanation,
        rewardAwarded,
      }
    }));

    // 2. Load target state
    const targetState = answersByQuestion[targetIdx] || defaultQuestionAnswerState;
    setUserSingleAnswer(targetState.singleAnswer);
    setUserMultipleAnswers(targetState.multipleAnswers);
    setUserTrueFalseAnswer(targetState.trueFalseAnswer);
    setUserMatches(targetState.matches);
    setSelectedMatchingLeft(targetState.selectedMatchingLeft);
    setUserEssayAnswer(targetState.essayAnswer);
    setEssayTeacherDecision(targetState.essayTeacherDecision);
    setIsAnswerChecked(targetState.isAnswerChecked);
    setIsAnswerCorrect(targetState.isAnswerCorrect);
    setShowExplanation(targetState.showExplanation);
    setRewardAwarded(targetState.rewardAwarded);

    setActiveQuizIndex(targetIdx);
  };

  // BỔ SUNG CHỨC NĂNG THỰC HIỆN TRẢ LỜI LẠI BỘ CÂU HỎI
  const handleRestartQuiz = () => {
    // 1. Xóa toàn bộ kết quả và trạng thái câu trả lời đã lưu của cả bộ
    setAnswersByQuestion({});

    // 2. Reset trạng thái tương tác của câu hỏi hiện tại
    resetCurrentAnswerState();

    // 3. Đưa vị trí về câu đầu tiên (Câu 1)
    setActiveQuizIndex(0);

    // 4. Nếu có câu hỏi dạng nối cột, xáo trộn lại Cột B để tạo trải nghiệm mới mẻ, không nối ngang
    setQuizQuestions(prevQuestions =>
      prevQuestions.map(q => {
        if (q.type === 'matching' && q.matchingPairs && q.matchingPairs.length > 0) {
          return {
            ...q,
            shuffledRightOptions: shuffleMatchingRight(q.matchingPairs),
          };
        }
        return q;
      })
    );

    // 5. Thông báo nổi bật và chúc mừng tinh thần học tập
    setQuizNotice({
      message: `🔄 Đã làm mới! Sẵn sàng trả lời lại bộ ${quizQuestions.length} câu hỏi từ đầu!`,
      sub: `Toàn bộ lựa chọn đã được xóa sạch. Thầy/Cô có thể mời lượt học sinh mới trả lời từ Câu 1.`,
      count: quizQuestions.length,
    });

    playFanfare();
    confetti({ particleCount: 40, spread: 70, origin: { y: 0.55 } });

    // 6. Cuộn mượt về khu vực bảng câu hỏi
    setTimeout(() => {
      const arena = document.getElementById('quiz-arena-section');
      if (arena) {
        arena.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Làm lại riêng câu hỏi hiện tại
  const handleRetryCurrentQuestion = () => {
    resetCurrentAnswerState();
    setAnswersByQuestion(prev => {
      const next = { ...prev };
      delete next[activeQuizIndex];
      return next;
    });

    const currentQ = quizQuestions[activeQuizIndex];
    if (currentQ && currentQ.type === 'matching' && currentQ.matchingPairs) {
      const newShuffled = shuffleMatchingRight(currentQ.matchingPairs);
      setQuizQuestions(prev =>
        prev.map((q, idx) => (idx === activeQuizIndex ? { ...q, shuffledRightOptions: newShuffled } : q))
      );
    }

    playPointClink();
  };

  // Tổng số câu đã kiểm tra đáp án và số câu đúng
  const totalCheckedCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < quizQuestions.length; i++) {
      const st = i === activeQuizIndex ? { isAnswerChecked } : answersByQuestion[i];
      if (st?.isAnswerChecked) count++;
    }
    return count;
  }, [quizQuestions.length, activeQuizIndex, isAnswerChecked, answersByQuestion]);

  const totalCorrectCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < quizQuestions.length; i++) {
      const st = i === activeQuizIndex ? { isAnswerChecked, isAnswerCorrect } : answersByQuestion[i];
      if (st?.isAnswerChecked && st?.isAnswerCorrect) count++;
    }
    return count;
  }, [quizQuestions.length, activeQuizIndex, isAnswerChecked, isAnswerCorrect, answersByQuestion]);

  // Fullscreen and Compact Layout States for Warm-up Quiz & Mini-game
  const [isQuizFullscreen, setIsQuizFullscreen] = useState(false);
  const [isConfigCollapsed, setIsConfigCollapsed] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsQuizFullscreen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isQuizFullscreen) {
        setIsQuizFullscreen(false);
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isQuizFullscreen]);

  const toggleQuizFullscreen = () => {
    if (!isQuizFullscreen) {
      setIsQuizFullscreen(true);
      try {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } catch (err) {}
    } else {
      setIsQuizFullscreen(false);
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      } catch (err) {}
    }
  };

  // AI Chat Advisor
  interface ChatMessage {
    sender: 'user' | 'ai';
    text: string;
    attachments?: Array<{
      name: string;
      sizeFormatted: string;
      fileType: string;
      previewUrl?: string;
    }>;
  }

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      sender: 'ai',
      text: `Xin chào Thầy/Cô! Tôi là Trợ lý AI của "Lớp Học Hạnh Phúc". Tôi có thể hỗ trợ Thầy/Cô soạn lời phê, thiết kế trò chơi thi đua 5 phút, tư vấn giải pháp kỷ luật tích cực và tạo môi trường học tập tràn đầy tiếng cười. Thầy/Cô cũng có thể đính kèm ảnh (PNG, JPG), tài liệu PDF, bài tập DOCX, Excel để tôi cùng phân tích nhé! Hôm nay lớp học của Thầy/Cô cần hỗ trợ điều gì?`
    }
  ]);
  const [userChatInput, setUserChatInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<ProcessedAttachment[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingFiles(true);
    const newFiles: ProcessedAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const processed = await processAttachmentFile(file);
      newFiles.push(processed);
    }

    setAttachedFiles(prev => [...prev, ...newFiles]);
    setIsProcessingFiles(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== id));
  };

  // AI Seating Proposal
  const [seatingProposal, setSeatingProposal] = useState<{
    rationale: string;
    pairs: Array<{ student1: string; student2: string; reason: string }>;
  } | null>(null);

  const selectedStudent = classStudents.find(s => s.id === selectedStudentId);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // 1. Generate Smart Remark
  const handleGenerateRemark = async () => {
    if (!selectedStudent) return;
    setIsLoading(true);
    setAiRemarkResult('');
    setAiParentMessageResult('');

    const prompt = `Bạn là chuyên gia sư phạm tiểu học và trung học tâm lý hàng đầu tại Việt Nam theo triết lý "Lớp Học Hạnh Phúc" (Happy Classroom).
Hãy tạo lời nhận xét học bạ / sổ theo dõi chi tiết và một bức thư khen ấm áp gửi phụ huynh cho học sinh sau:
- Tên học sinh: ${selectedStudent.name}
- Giới tính: ${selectedStudent.gender}
- Điểm xu thi đua hiện tại: ${selectedStudent.points} xu
- Lớp: ${activeClass?.name || 'Lớp học'}

Yêu cầu cụ thể:
1. "LỜI NHẬN XÉT SƯ PHẠM": Khen ngợi cụ thể tinh thần học tập, nêu bật sự cố gắng, dùng ngôn từ tích cực khích lệ, chỉ ra 1 điểm cần rèn luyện thêm nhẹ nhàng.
2. "THƯ GỬI PHỤ HUYNH QUA ZALO": Ngắn gọn, ấm áp, kết nối tình cảm gia đình - nhà trường, động viên phụ huynh khen ngợi con.`;

    try {
      const response = await callGeminiAi({ prompt });
      const parts = response.split(/THƯ GỬI PHỤ HUYNH/i);
      if (parts.length > 1) {
        setAiRemarkResult(parts[0].replace(/LỜI NHẬN XÉT SƯ PHẠM:?/i, '').trim());
        setAiParentMessageResult(parts[1].trim());
      } else {
        setAiRemarkResult(response);
        setAiParentMessageResult(generateSmartParentMessageFallback(activeClass?.name || '', selectedStudent.name, selectedStudent.points));
      }
    } catch {
      setAiRemarkResult(generateSmartRemarksFallback(selectedStudent.name, selectedStudent.points));
      setAiParentMessageResult(generateSmartParentMessageFallback(activeClass?.name || '', selectedStudent.name, selectedStudent.points));
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Generate Warm-up Quiz with "Bộ sách Kết nối tri thức với cuộc sống"
  const handleGenerateQuiz = async () => {
    setIsLoading(true);
    setQuizNotice(null);
    setAnswersByQuestion({});
    resetCurrentAnswerState();

    try {
      const questions = await generateKetNoiTriThucQuiz(quizConfig);
      if (questions && questions.length > 0) {
        setQuizQuestions(questions);
        setActiveQuizIndex(0);
        setQuizNotice({
          message: `🎉 Đã tạo và cập nhật ngay bộ ${questions.length} câu hỏi khởi động AI (${quizConfig.subject} - ${quizConfig.difficulty})!`,
          sub: `Nội dung bám sát SGK Kết nối tri thức. Thầy/Cô có thể bốc thăm học sinh và tiến hành chơi ngay.`,
          count: questions.length,
        });
      } else {
        const fallbackList = generateKetNoiTriThucQuizFallback(quizConfig);
        setQuizQuestions(fallbackList);
        setActiveQuizIndex(0);
        setQuizNotice({
          message: `✨ Đã cập nhật bộ ${fallbackList.length} câu hỏi khởi động thông minh (${quizConfig.subject} - ${quizConfig.difficulty})!`,
          sub: `Bộ câu hỏi đã được hiển thị trên màn hình để sử dụng ngay.`,
          count: fallbackList.length,
        });
      }
      playFanfare();
      confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
      setTimeout(() => {
        const arena = document.getElementById('quiz-arena-section');
        if (arena) {
          arena.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 120);
    } catch (err) {
      console.warn('Using Ket Noi Tri Thuc fallback questions:', err);
      const fallbackList = generateKetNoiTriThucQuizFallback(quizConfig);
      setQuizQuestions(fallbackList);
      setActiveQuizIndex(0);
      setQuizNotice({
        message: `✨ Đã cập nhật bộ ${fallbackList.length} câu hỏi khởi động (${quizConfig.subject} - ${quizConfig.difficulty})!`,
        sub: `Bộ câu hỏi đã sẵn sàng hiển thị trên màn hình để thầy cô sử dụng.`,
        count: fallbackList.length,
      });
      playFanfare();
      setTimeout(() => {
        const arena = document.getElementById('quiz-arena-section');
        if (arena) {
          arena.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 120);
    } finally {
      setIsLoading(false);
    }
  };

  // Pick a random student with rolling animation
  const handlePickRandomStudent = () => {
    if (classStudents.length === 0) return;
    setIsSpinningStudent(true);
    setPickedAnnouncement(null);

    let count = 0;
    const totalSteps = 16;
    const interval = setInterval(() => {
      const randIdx = Math.floor(Math.random() * classStudents.length);
      setSpinningStudentName(classStudents[randIdx].name);
      count++;
      if (count >= totalSteps) {
        clearInterval(interval);
        const chosen = classStudents[Math.floor(Math.random() * classStudents.length)];
        setSelectedStudentId(chosen.id);
        setSpinningStudentName(chosen.name);
        setIsSpinningStudent(false);
        setPickedAnnouncement(`🎯 Mời em #${chosen.stt} - ${chosen.name} trả lời câu hỏi khởi động!`);
        playFanfare();
        confetti({ particleCount: 45, spread: 65, origin: { y: 0.6 } });
      }
    }, 85);
  };

  // Check answer for current question
  const handleCheckAnswer = () => {
    const currentQ = quizQuestions[activeQuizIndex];
    if (!currentQ) return;

    let correct = false;

    if (currentQ.type === 'single_choice') {
      const correctIdx = currentQ.correctOptionIndices?.[0] ?? 0;
      correct = userSingleAnswer === correctIdx;
    } else if (currentQ.type === 'multiple_choice') {
      const correctSet = new Set(currentQ.correctOptionIndices || []);
      if (userMultipleAnswers.length === 2) {
        correct = userMultipleAnswers.length === correctSet.size && userMultipleAnswers.every(i => correctSet.has(i));
      } else {
        correct = false;
      }
    } else if (currentQ.type === 'true_false') {
      correct = userTrueFalseAnswer === currentQ.isTrue;
    } else if (currentQ.type === 'matching') {
      if (currentQ.matchingPairs && currentQ.matchingPairs.length > 0) {
        correct = currentQ.matchingPairs.every(p => userMatches[p.id] === p.right);
      }
    } else if (currentQ.type === 'essay') {
      correct = essayTeacherDecision === 'correct';
    }

    setIsAnswerChecked(true);
    setIsAnswerCorrect(correct);

    let willAward = false;
    if (correct) {
      playFanfare();
      confetti({ particleCount: 50, spread: 75, origin: { y: 0.6 } });
      // Thưởng xu cho học sinh nếu được chọn và chưa thưởng
      if (selectedStudent && !rewardAwarded) {
        const coinsToAdd = currentQ.rewardCoins || quizConfig.rewardCoins || 5;
        awardPoints(
          [selectedStudent.id],
          coinsToAdd,
          `Trả lời đúng câu hỏi khởi động: "${currentQ.question.slice(0, 45)}..." (${currentQ.subject} - Sách Kết nối tri thức)`,
          currentQ.subject
        );
        setRewardAwarded(true);
        willAward = true;
        playPointClink();
      }
    } else {
      // Trả lời sai: KHÔNG cộng điểm
    }

    setAnswersByQuestion(prev => ({
      ...prev,
      [activeQuizIndex]: {
        singleAnswer: userSingleAnswer,
        multipleAnswers: userMultipleAnswers,
        trueFalseAnswer: userTrueFalseAnswer,
        matches: userMatches,
        selectedMatchingLeft,
        essayAnswer: userEssayAnswer,
        essayTeacherDecision,
        isAnswerChecked: true,
        isAnswerCorrect: correct,
        showExplanation,
        rewardAwarded: rewardAwarded || willAward,
      }
    }));
  };

  // Award coin manually for quiz answer
  const handleAwardQuizCoin = () => {
    if (!selectedStudent || rewardAwarded) return;
    const currentQ = quizQuestions[activeQuizIndex];
    const coins = currentQ?.rewardCoins || quizConfig.rewardCoins || 5;
    awardPoints(
      [selectedStudent.id],
      coins,
      `Trả lời đúng câu hỏi khởi động (${currentQ?.subject || quizConfig.subject} - Sách Kết nối tri thức)`,
      currentQ?.subject || quizConfig.subject
    );
    setRewardAwarded(true);
    playPointClink();
    confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });

    setAnswersByQuestion(prev => ({
      ...prev,
      [activeQuizIndex]: {
        ...(prev[activeQuizIndex] || defaultQuestionAnswerState),
        rewardAwarded: true,
      }
    }));
  };

  // 3. AI Smart Seating Optimizer
  const handleGenerateSeating = async () => {
    setIsLoading(true);
    const sortedStudents = [...classStudents].sort((a, b) => b.points - a.points);
    const topHalf = sortedStudents.slice(0, Math.ceil(sortedStudents.length / 2));
    const bottomHalf = sortedStudents.slice(Math.ceil(sortedStudents.length / 2)).reverse();

    const pairs: Array<{ student1: string; student2: string; reason: string }> = [];
    for (let i = 0; i < Math.min(topHalf.length, bottomHalf.length); i++) {
      pairs.push({
        student1: topHalf[i].name,
        student2: bottomHalf[i].name,
        reason: `Mô hình 'Đôi bạn cùng tiến': ${topHalf[i].name} (${topHalf[i].points} xu) hỗ trợ và truyền cảm hứng học tập cho ${bottomHalf[i].name} (${bottomHalf[i].points} xu).`
      });
    }

    setSeatingProposal({
      rationale: `AI đã phân tích ${classStudents.length} học sinh của lớp ${activeClass?.name}. Phương án áp dụng nguyên lý 'Đôi bạn cùng tiến' kết hợp đan xen nam - nữ, ghép các bạn có điểm thi đua tích cực với các bạn cần kèm cặp để kéo đều phong trào lớp học.`,
      pairs
    });
    setIsLoading(false);
  };

  const handleApplySeatingProposal = () => {
    if (!seatingProposal) return;
    let studentIndex = 0;
    const shuffled = [...classStudents].sort((a, b) => b.points - a.points);
    
    // Assign across columns
    const cols = seatingColumns || 3;
    const maxRows = Math.ceil(shuffled.length / (cols * 2)) || 5;

    for (let r = 0; r < maxRows; r++) {
      for (let c = 0; c < cols; c++) {
        // Seat left
        if (studentIndex < shuffled.length) {
          assignSeat(`${c}-${r}-0`, shuffled[studentIndex].id);
          studentIndex++;
        }
        // Seat right
        if (studentIndex < shuffled.length) {
          assignSeat(`${c}-${r}-1`, shuffled[studentIndex].id);
          studentIndex++;
        }
      }
    }
    playFanfare();
    confetti({ particleCount: 80, spread: 80 });
  };

  // 4. AI Chat advisor
  const handleSendChat = async () => {
    const validAttachments = attachedFiles.filter(f => f.status === 'ready');
    if ((!userChatInput.trim() && validAttachments.length === 0) || isLoading || isProcessingFiles) return;

    let userText = userChatInput.trim();
    if (!userText && validAttachments.length > 0) {
      userText = `Phân tích tệp đính kèm (${validAttachments.map(f => f.name).join(', ')}) và nêu các nội dung trọng tâm cần lưu ý.`;
    }

    const currentAttachmentsSnapshot = validAttachments.map(f => ({
      name: f.name,
      sizeFormatted: f.sizeFormatted,
      fileType: f.fileType,
      previewUrl: f.previewUrl,
    }));

    setUserChatInput('');
    setAttachedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setChatMessages(prev => [
      ...prev,
      {
        sender: 'user',
        text: userText,
        attachments: currentAttachmentsSnapshot.length > 0 ? currentAttachmentsSnapshot : undefined,
      }
    ]);
    setIsLoading(true);

    const systemInstruction = `Bạn là Trợ lý Cố vấn Sư phạm 24/7 của hệ thống "Lớp Học Hạnh Phúc".
QUY TẮC BẮT BUỘC:
1. TRẢ LỜI ĐÚNG TRỌNG TÂM: Chỉ phân tích và trả lời chính xác những gì giáo viên hỏi hoặc yêu cầu từ tệp đính kèm. Đi thẳng vào vấn đề.
2. TIẾT KIỆM THỜI GIAN VÀ DỮ LIỆU: TUYỆT ĐỐI KHÔNG mở bài chào hỏi xã giao dài dòng, không xin lỗi, không đưa ra các lời khuyên lan man ngoài câu hỏi.
3. CẤU TRÚC RÕ RÀNG: Trình bày súc tích, ngắn gọn, dùng gạch đầu dòng rõ ràng để giáo viên nắm bắt tức thì.
4. TỆP ĐÍNH KÈM (nếu có): Chỉ tập trung phân tích đúng nội dung trong tệp được yêu cầu (như sửa lỗi, giải bài, trích xuất ý chính, góp ý giáo án).`;

    const prompt = validAttachments.length > 0
      ? `Tệp đính kèm: ${validAttachments.map(f => `${f.name} (${f.sizeFormatted})`).join(', ')}\nYêu cầu cụ thể: ${userText}\n\nHãy phân tích và trả lời đúng trọng tâm yêu cầu trên, ngắn gọn và trực tiếp nhất.`
      : `Yêu cầu cụ thể: ${userText}\n\nHãy trả lời đúng trọng tâm, ngắn gọn và trực tiếp nhất.`;

    const filesPayload = validAttachments.map(f => ({
      name: f.name,
      mimeType: f.mimeType,
      data: f.base64Data,
      textContent: f.textContent,
      sizeFormatted: f.sizeFormatted,
    }));

    try {
      const response = await callGeminiAi({
        prompt,
        systemInstruction,
        files: filesPayload.length > 0 ? filesPayload : undefined,
        model: 'gemini-3.8-flash',
      });
      setChatMessages(prev => [...prev, { sender: 'ai', text: response }]);
    } catch (err: any) {
      const fallbackText = validAttachments.length > 0
        ? `Nội dung trọng tâm từ tệp (${validAttachments.map(f => f.name).join(', ')}):\n• Kiểm tra tính chính xác và mục tiêu yêu cầu của nội dung.\n• Điều chỉnh phù hợp với khả năng học sinh lớp ${activeClass?.name || ''}.\n• Cộng xu thi đua khích lệ khi hoàn thành tốt.`
        : `Giải pháp trọng tâm:\n• Nhắc nhở ngắn gọn, xác định rõ hành vi cần điều chỉnh.\n• Giao nhiệm vụ cụ thể 3-5 phút để tạo sự tập trung.\n• Thưởng điểm thi đua cho cá nhân/tổ thực hiện tốt.`;

      setChatMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: fallbackText,
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Render câu hỏi tương tác dùng chung cho cả giao diện thường (gọn) và chế độ Toàn màn hình
  const renderQuestionInteractive = (currentQ: QuizQuestion, isFullscreen: boolean = false) => {
    if (!currentQ) return null;

    return (
      <div className={isFullscreen ? "space-y-6" : "space-y-4"}>
        {/* DẠNG 1: Trắc nghiệm 4 lựa chọn có 1 đáp án đúng */}
        {currentQ.type === 'single_choice' && currentQ.options && (
          <div className="space-y-3">
            <div className={`flex items-center justify-between font-bold ${
              isFullscreen ? 'text-sm text-slate-300' : 'text-xs text-slate-600'
            }`}>
              <span>Bấm chọn 1 đáp án chính xác:</span>
              {userSingleAnswer !== null && (
                <span className={isFullscreen ? 'text-amber-300 font-extrabold' : 'text-blue-600 font-bold'}>
                  Đã chọn: {String.fromCharCode(65 + userSingleAnswer)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {currentQ.options.map((opt, optIdx) => {
                const isSelected = userSingleAnswer === optIdx;
                const isCorrect = (currentQ.correctOptionIndices || [0]).includes(optIdx);

                let btnClass = isFullscreen
                  ? 'bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/40'
                  : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-blue-50 hover:border-blue-300';

                if (isAnswerChecked) {
                  if (isCorrect) {
                    btnClass = isFullscreen
                      ? 'bg-emerald-600 border-emerald-400 text-white font-black shadow-xl ring-2 ring-emerald-300 scale-[1.01]'
                      : 'bg-emerald-500 border-emerald-600 text-white font-black shadow-md';
                  } else if (isSelected && !isCorrect) {
                    btnClass = isFullscreen
                      ? 'bg-rose-600 border-rose-400 text-white font-bold'
                      : 'bg-rose-500 border-rose-600 text-white font-bold';
                  } else if (isFullscreen) {
                    btnClass = 'bg-white/5 border-white/10 text-white/50';
                  }
                } else if (isSelected) {
                  btnClass = isFullscreen
                    ? 'bg-blue-600 border-blue-400 text-white font-black shadow-xl ring-2 ring-blue-300'
                    : 'bg-blue-600 border-blue-600 text-white font-black shadow-md';
                }

                return (
                  <button
                    key={optIdx}
                    type="button"
                    onClick={() => {
                      if (!isAnswerChecked) {
                        setUserSingleAnswer(optIdx);
                      }
                    }}
                    className={`rounded-2xl border text-left transition-all hover-zoom-interactive flex items-start gap-3 cursor-pointer ${
                      isFullscreen ? 'p-4 md:p-5 text-sm md:text-base' : 'p-3 md:p-3.5 text-xs md:text-sm'
                    } ${btnClass}`}
                  >
                    <span className={`rounded-xl flex items-center justify-center font-black shrink-0 ${
                      isFullscreen ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-xs'
                    } ${
                      isSelected || (isAnswerChecked && isCorrect)
                        ? 'bg-white/20 text-white'
                        : isFullscreen ? 'bg-white/10 text-white/80' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {String.fromCharCode(65 + optIdx)}
                    </span>
                    <span className="flex-1 leading-snug">{opt}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* DẠNG 2: Trắc nghiệm 4 lựa chọn có 2 đáp án đúng */}
        {currentQ.type === 'multiple_choice' && currentQ.options && (
          <div className="space-y-3">
            <div className={`flex items-center justify-between font-bold ${
              isFullscreen ? 'text-sm text-slate-300' : 'text-xs text-slate-700'
            }`}>
              <span>
                Chọn ĐÚNG 2 đáp án (Đã chọn: <strong className={isFullscreen ? 'text-amber-300' : 'text-blue-600'}>{userMultipleAnswers.length}/2</strong>):
              </span>
              <span className={`text-[11px] italic ${isFullscreen ? 'text-slate-400' : 'text-slate-500'}`}>
                Học sinh cần chọn đủ và đúng 2 phương án
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {currentQ.options.map((opt, optIdx) => {
                const isSelected = userMultipleAnswers.includes(optIdx);
                const isCorrect = (currentQ.correctOptionIndices || []).includes(optIdx);

                let btnClass = isFullscreen
                  ? 'bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/40'
                  : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-indigo-50 hover:border-indigo-300';

                if (isAnswerChecked) {
                  if (isCorrect) {
                    btnClass = isFullscreen
                      ? 'bg-emerald-600 border-emerald-400 text-white font-black shadow-xl ring-2 ring-emerald-300 scale-[1.01]'
                      : 'bg-emerald-500 border-emerald-600 text-white font-black shadow-md';
                  } else if (isSelected && !isCorrect) {
                    btnClass = isFullscreen
                      ? 'bg-rose-600 border-rose-400 text-white font-bold'
                      : 'bg-rose-500 border-rose-600 text-white font-bold';
                  } else if (isFullscreen) {
                    btnClass = 'bg-white/5 border-white/10 text-white/50';
                  }
                } else if (isSelected) {
                  btnClass = isFullscreen
                    ? 'bg-indigo-600 border-indigo-400 text-white font-black shadow-xl ring-2 ring-indigo-300'
                    : 'bg-indigo-600 border-indigo-600 text-white font-black shadow-md';
                }

                return (
                  <button
                    key={optIdx}
                    type="button"
                    onClick={() => {
                      if (isAnswerChecked) return;
                      if (isSelected) {
                        setUserMultipleAnswers(prev => prev.filter(i => i !== optIdx));
                      } else {
                        if (userMultipleAnswers.length < 2) {
                          setUserMultipleAnswers(prev => [...prev, optIdx]);
                        } else {
                          setUserMultipleAnswers([userMultipleAnswers[1], optIdx]);
                        }
                      }
                    }}
                    className={`rounded-2xl border text-left transition-all hover-zoom-interactive flex items-start gap-3 cursor-pointer ${
                      isFullscreen ? 'p-4 md:p-5 text-sm md:text-base' : 'p-3 md:p-3.5 text-xs md:text-sm'
                    } ${btnClass}`}
                  >
                    <div className="mt-0.5">
                      {isSelected ? (
                        <CheckSquare className={isFullscreen ? "w-6 h-6 text-white shrink-0" : "w-5 h-5 shrink-0"} />
                      ) : (
                        <Square className={isFullscreen ? "w-6 h-6 text-white/40 shrink-0" : "w-5 h-5 text-slate-400 shrink-0"} />
                      )}
                    </div>
                    <div className="flex-1 leading-snug">
                      <strong className="mr-1.5">{String.fromCharCode(65 + optIdx)}.</strong>
                      {opt}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* DẠNG 3: Câu hỏi Đúng / Sai */}
        {currentQ.type === 'true_false' && (
          <div className={isFullscreen ? "space-y-5" : "space-y-4"}>
            {currentQ.statement && (
              <div className={`rounded-2xl border font-semibold leading-relaxed ${
                isFullscreen
                  ? 'p-4 md:p-5 bg-white/10 border-white/20 text-white text-sm md:text-base'
                  : 'p-3 md:p-3.5 bg-slate-50 border-slate-200 text-slate-800 text-xs md:text-sm'
              }`}>
                <strong className={isFullscreen ? 'text-amber-300' : 'text-blue-700'}>Nhận định: </strong>
                {currentQ.statement}
              </div>
            )}

            <div className={`font-bold ${isFullscreen ? 'text-sm text-slate-300' : 'text-xs text-slate-600'}`}>
              Em hãy đánh giá nhận định trên là ĐÚNG hay SAI:
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => !isAnswerChecked && setUserTrueFalseAnswer(true)}
                className={`rounded-2xl border-2 text-center transition-all hover-zoom-interactive cursor-pointer ${
                  isFullscreen ? 'p-6 md:p-8' : 'p-4 md:p-5'
                } ${
                  isAnswerChecked
                    ? currentQ.isTrue === true
                      ? 'bg-emerald-500 border-emerald-400 text-white font-black shadow-xl ring-2 ring-emerald-300 scale-[1.02]'
                      : userTrueFalseAnswer === true
                      ? 'bg-rose-500 border-rose-400 text-white font-bold'
                      : isFullscreen ? 'bg-white/5 border-white/10 text-white/30' : 'bg-slate-50 border-slate-200 text-slate-400'
                    : userTrueFalseAnswer === true
                    ? 'bg-emerald-600 border-emerald-400 text-white font-black shadow-lg ring-2 ring-emerald-300'
                    : isFullscreen
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200 hover:bg-emerald-900/60 font-bold'
                    : 'bg-emerald-50/50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 font-bold'
                }`}
              >
                <div className={isFullscreen ? "text-4xl mb-2" : "text-2xl mb-1"}>✅</div>
                <div className={isFullscreen ? "text-xl md:text-2xl font-black uppercase" : "text-base font-black uppercase"}>ĐÚNG</div>
                <div className="text-[11px] opacity-80 mt-0.5">Nhận định này hoàn toàn chính xác</div>
              </button>

              <button
                type="button"
                onClick={() => !isAnswerChecked && setUserTrueFalseAnswer(false)}
                className={`rounded-2xl border-2 text-center transition-all hover-zoom-interactive cursor-pointer ${
                  isFullscreen ? 'p-6 md:p-8' : 'p-4 md:p-5'
                } ${
                  isAnswerChecked
                    ? currentQ.isTrue === false
                      ? 'bg-emerald-500 border-emerald-400 text-white font-black shadow-xl ring-2 ring-emerald-300 scale-[1.02]'
                      : userTrueFalseAnswer === false
                      ? 'bg-rose-500 border-rose-400 text-white font-bold'
                      : isFullscreen ? 'bg-white/5 border-white/10 text-white/30' : 'bg-slate-50 border-slate-200 text-slate-400'
                    : userTrueFalseAnswer === false
                    ? 'bg-rose-600 border-rose-400 text-white font-black shadow-lg ring-2 ring-rose-300'
                    : isFullscreen
                    ? 'bg-rose-950/40 border-rose-500/40 text-rose-200 hover:bg-rose-900/60 font-bold'
                    : 'bg-rose-50/50 border-rose-200 text-rose-800 hover:bg-rose-100 font-bold'
                }`}
              >
                <div className={isFullscreen ? "text-4xl mb-2" : "text-2xl mb-1"}>❌</div>
                <div className={isFullscreen ? "text-xl md:text-2xl font-black uppercase" : "text-base font-black uppercase"}>SAI</div>
                <div className="text-[11px] opacity-80 mt-0.5">Nhận định này chưa chính xác</div>
              </button>
            </div>
          </div>
        )}

        {/* DẠNG 4: Câu hỏi Nối cột (Ghép cặp Cột A với Cột B) */}
        {currentQ.type === 'matching' && currentQ.matchingPairs && (
          (() => {
            const shuffledRightList = (currentQ.shuffledRightOptions && currentQ.shuffledRightOptions.length === currentQ.matchingPairs.length)
              ? currentQ.shuffledRightOptions
              : shuffleMatchingRight(currentQ.matchingPairs);

            return (
              <div className="space-y-3.5">
                <div className={`flex items-center justify-between font-bold ${
                  isFullscreen ? 'text-sm text-slate-300' : 'text-xs text-slate-700'
                }`}>
                  <span>Em hãy ghép mỗi ý ở Cột A với nội dung tương ứng ở Cột B:</span>
                  <span className={`px-2.5 py-1 rounded-lg border font-bold ${
                    isFullscreen ? 'bg-blue-900/60 border-blue-400/40 text-blue-200' : 'bg-blue-50 text-blue-600 border-blue-100'
                  }`}>
                    Đã nối: {Object.keys(userMatches).length} / {currentQ.matchingPairs.length} cặp
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Cột A */}
                  <div className="space-y-2">
                    <div className={`text-xs font-extrabold uppercase px-2 flex items-center justify-between ${
                      isFullscreen ? 'text-blue-300' : 'text-blue-800'
                    }`}>
                      <span>📌 Cột A (Bấm chọn trước)</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isFullscreen ? 'bg-blue-900/80 text-blue-200' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {selectedMatchingLeft ? 'Đang chọn' : 'Chưa chọn'}
                      </span>
                    </div>
                    {currentQ.matchingPairs.map((pair, idx) => {
                      const matchedRight = userMatches[pair.id];
                      const isCurrentSelected = selectedMatchingLeft === pair.id;
                      const isPairCorrect = isAnswerChecked ? matchedRight === pair.right : null;

                      let boxClass = isFullscreen
                        ? 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                        : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100';

                      if (isAnswerChecked) {
                        if (isPairCorrect) {
                          boxClass = isFullscreen
                            ? 'bg-emerald-900/60 border-emerald-400 text-emerald-100 font-bold ring-1 ring-emerald-400'
                            : 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold shadow-xs';
                        } else {
                          boxClass = isFullscreen
                            ? 'bg-rose-900/60 border-rose-400 text-rose-100 font-medium ring-1 ring-rose-400'
                            : 'bg-rose-50 border-rose-300 text-rose-950 font-medium';
                        }
                      } else if (isCurrentSelected) {
                        boxClass = isFullscreen
                          ? 'bg-blue-600 border-blue-400 text-white font-black ring-2 ring-blue-300'
                          : 'bg-blue-100 border-blue-500 ring-2 ring-blue-300 text-blue-950 font-black';
                      } else if (matchedRight) {
                        boxClass = isFullscreen
                          ? 'bg-indigo-900/50 border-indigo-400 text-indigo-100 font-bold'
                          : 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-bold';
                      }

                      return (
                        <div
                          key={pair.id}
                          onClick={() => !isAnswerChecked && setSelectedMatchingLeft(pair.id)}
                          className={`rounded-xl border transition-all cursor-pointer ${
                            isFullscreen ? 'p-3 md:p-4 text-xs md:text-sm' : 'p-2.5 md:p-3 text-xs'
                          } ${boxClass}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`font-extrabold mr-2 shrink-0 ${isFullscreen ? 'text-blue-300' : 'text-blue-700'}`}>A{idx + 1}.</span>
                            <span className="flex-1 font-semibold">{pair.left}</span>
                          </div>
                          {matchedRight && (
                            <div className={`mt-1.5 pt-1.5 border-t text-[11px] font-bold flex items-center justify-between gap-1 ${
                              isFullscreen ? 'border-white/10' : 'border-slate-200/60'
                            }`}>
                              <div className="flex items-center gap-1">
                                <span className={isFullscreen ? 'text-slate-400' : 'text-slate-500'}>➔ Nối với:</span>
                                <span className={`italic ${isFullscreen ? 'text-purple-300' : 'text-purple-700'}`}>"{matchedRight}"</span>
                              </div>
                              {isAnswerChecked && (
                                <span className={isPairCorrect ? 'text-emerald-400 font-black' : 'text-rose-400 font-bold'}>
                                  {isPairCorrect ? '✅ Đúng' : `❌ Sai (Đáp án: ${pair.right})`}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Cột B */}
                  <div className="space-y-2">
                    <div className={`text-xs font-extrabold uppercase px-2 flex items-center justify-between ${
                      isFullscreen ? 'text-purple-300' : 'text-purple-800'
                    }`}>
                      <span>🎯 Cột B (Bấm chọn để nối với Cột A)</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isFullscreen ? 'bg-purple-900/80 text-purple-200' : 'bg-purple-100 text-purple-700'
                      }`}>
                        Đã xáo trộn thứ tự
                      </span>
                    </div>
                    {shuffledRightList.map((rightText, idx) => {
                      const matchedLeftId = Object.keys(userMatches).find(k => userMatches[k] === rightText);
                      const matchedLeftPair = matchedLeftId ? currentQ.matchingPairs?.find(p => p.id === matchedLeftId) : null;
                      const matchedLeftIdx = matchedLeftPair ? currentQ.matchingPairs?.findIndex(p => p.id === matchedLeftId) : -1;

                      return (
                        <button
                          key={`right-${idx}-${rightText.substring(0, 15)}`}
                          type="button"
                          onClick={() => {
                            if (isAnswerChecked) return;
                            if (selectedMatchingLeft) {
                              setUserMatches(prev => ({
                                ...prev,
                                [selectedMatchingLeft]: rightText,
                              }));
                              setSelectedMatchingLeft(null);
                            }
                          }}
                          className={`w-full rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer ${
                            isFullscreen ? 'p-3 md:p-4 text-xs md:text-sm' : 'p-2.5 md:p-3 text-xs'
                          } ${
                            matchedLeftPair
                              ? isFullscreen
                                ? 'bg-purple-900/60 border-purple-400 text-purple-100 font-bold'
                                : 'bg-purple-50/90 border-purple-300 text-purple-950 font-bold shadow-xs'
                              : selectedMatchingLeft
                              ? isFullscreen
                                ? 'border-purple-400 bg-white/15 hover:bg-purple-900/40 text-white'
                                : 'border-purple-200 bg-white hover:bg-purple-50 hover:border-purple-400 text-slate-800'
                              : isFullscreen
                              ? 'border-white/20 bg-white/10 hover:bg-white/20 text-white'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className={`rounded-md font-black text-[11px] flex items-center justify-center shrink-0 ${
                            isFullscreen ? 'w-6 h-6' : 'w-5 h-5'
                          } ${
                            matchedLeftPair
                              ? 'bg-purple-600 text-white'
                              : isFullscreen ? 'bg-purple-900/80 text-purple-200' : 'bg-purple-100 text-purple-800'
                          }`}>
                            B{idx + 1}
                          </span>
                          <div className="flex-1">
                            <div className="leading-snug">{rightText}</div>
                            {matchedLeftPair && (
                              <div className={`mt-1 text-[11px] font-semibold flex items-center gap-1 ${
                                isFullscreen ? 'text-purple-300' : 'text-purple-700'
                              }`}>
                                <span>➔ Đã ghép với:</span>
                                <span className="font-bold underline">A{matchedLeftIdx! + 1}. {matchedLeftPair.left}</span>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {!isAnswerChecked && Object.keys(userMatches).length > 0 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMatches({});
                        setSelectedMatchingLeft(null);
                      }}
                      className={`text-xs font-bold flex items-center gap-1 hover:underline cursor-pointer ${
                        isFullscreen ? 'text-rose-400 hover:text-rose-300' : 'text-rose-600 hover:text-rose-800'
                      }`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Làm lại / Xóa các cặp đã nối
                    </button>
                  </div>
                )}
              </div>
            );
          })()
        )}

        {/* DẠNG 5: Câu hỏi Tự luận / Trả lời ngắn */}
        {currentQ.type === 'essay' && (
          <div className="space-y-3.5">
            <div>
              <label className={`block font-bold mb-1.5 ${
                isFullscreen ? 'text-sm text-slate-300' : 'text-xs text-slate-700'
              }`}>
                Học sinh trả lời bằng lời hoặc gõ câu trả lời vào đây:
              </label>
              <textarea
                rows={isFullscreen ? 3 : 2}
                value={userEssayAnswer}
                onChange={(e) => setUserEssayAnswer(e.target.value)}
                placeholder="Học sinh nhập hoặc phát biểu ý kiến trả lời của mình..."
                className={`w-full rounded-2xl border text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed ${
                  isFullscreen
                    ? 'p-3.5 md:p-4 bg-white/10 border-white/20 text-white placeholder-slate-400'
                    : 'p-3 md:p-3.5 bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
            </div>

            {/* Barem gợi ý cho giáo viên */}
            <div className={`rounded-2xl border space-y-1.5 ${
              isFullscreen
                ? 'p-3.5 md:p-4 bg-amber-950/40 border-amber-500/30 text-amber-200 text-xs md:text-sm'
                : 'p-3 md:p-3.5 bg-amber-50/70 border-amber-200 text-amber-950 text-xs'
            }`}>
              <div className={`font-black flex items-center gap-1.5 ${
                isFullscreen ? 'text-amber-300' : 'text-amber-900'
              }`}>
                <Lightbulb className="w-4 h-4 text-amber-500" />
                Gợi ý đáp án & Tiêu chí công nhận đúng:
              </div>
              <p className="leading-relaxed">
                <strong>Đáp án mẫu:</strong> {currentQ.sampleAnswer || 'Học sinh nêu được đúng trọng tâm nội dung câu hỏi.'}
              </p>
              {currentQ.scoringCriteria && (
                <p className={`text-[11px] leading-snug ${isFullscreen ? 'text-amber-300/80' : 'text-amber-800'}`}>
                  <strong>Tiêu chí:</strong> {currentQ.scoringCriteria}
                </p>
              )}
            </div>

            {/* Thầy cô xác nhận ĐÚNG / SAI cho câu tự luận */}
            <div className={`rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${
              isFullscreen
                ? 'p-3 md:p-4 bg-white/10 border-white/20 text-white'
                : 'p-3 md:p-3.5 bg-slate-50 border-slate-200 text-slate-800'
            }`}>
              <span className={`font-bold ${isFullscreen ? 'text-sm' : 'text-xs'}`}>
                Thầy/Cô đánh giá câu trả lời của học sinh:
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEssayTeacherDecision('correct')}
                  className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                    essayTeacherDecision === 'correct'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : isFullscreen
                      ? 'bg-emerald-950/60 text-emerald-200 border border-emerald-500/40 hover:bg-emerald-900/60'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  <ThumbsUp className="w-4 h-4" />
                  <span>Chính xác (+xu)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEssayTeacherDecision('incorrect')}
                  className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                    essayTeacherDecision === 'incorrect'
                      ? 'bg-rose-600 text-white shadow-md'
                      : isFullscreen
                      ? 'bg-rose-950/60 text-rose-200 border border-rose-500/40 hover:bg-rose-900/60'
                      : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                  }`}
                >
                  <ThumbsDown className="w-4 h-4" />
                  <span>Chưa đúng (Không cộng điểm)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-8 -bottom-8 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner hover-zoom-btn">
              <Brain className="w-8 h-8 text-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs font-bold text-amber-200 mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                Trí Tuệ Nhân Tạo AI Thông Minh
              </div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight">
                Trợ Lý Sư Phạm & Lớp Học Hạnh Phúc
              </h1>
              <p className="text-xs md:text-sm text-blue-100 mt-0.5">
                Tự động hóa lời phê, khởi tạo trò chơi thi đua 5 phút, tối ưu sơ đồ bàn học và tư vấn giáo dục tích cực
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/15">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-xs font-semibold text-white">
              Lớp đang chọn: <strong className="text-amber-200">{activeClass?.name}</strong> ({classStudents.length} học sinh)
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs with Hover Zoom-To */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-white rounded-2xl shadow-sm border border-slate-200">
        {[
          { id: 'remarks', label: 'LỜI PHÊ & SỔ LIÊN LẠC', icon: Award },
          { id: 'quiz', label: 'CÂU HỎI KHỞI ĐỘNG & ĐỐ VUI', icon: Play },
          { id: 'seating', label: 'AI XẾP SƠ ĐỒ CHỖ NGỒI', icon: Users },
          { id: 'energizers', label: 'TRÒ CHƠI 5 PHÚT NẠP NĂNG LƯỢNG', icon: Lightbulb },
          { id: 'advisor', label: 'CỐ VẤN SƯ PHẠM 24/7', icon: MessageSquare },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as AiTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-black transition-all hover-zoom-btn uppercase ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Smart Remarks & Parent Message */}
      {activeTab === 'remarks' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls & Student Selection */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4 hover-zoom-card">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-blue-600" />
              Chọn Học Sinh & Tạo Lời Phê
            </h2>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Học sinh cần nhận xét:
              </label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 hover-zoom-interactive"
              >
                {classStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.stt} - {s.name} ({s.points} xu - {s.gender})
                  </option>
                ))}
              </select>
            </div>

            {selectedStudent && (
              <div className="p-3.5 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-3">
                <img
                  src={selectedStudent.avatar}
                  alt={selectedStudent.name}
                  className="w-12 h-12 rounded-xl object-cover bg-white shadow-xs"
                />
                <div>
                  <div className="text-sm font-black text-slate-900">{selectedStudent.name}</div>
                  <div className="text-xs text-blue-700 font-semibold mt-0.5">
                    🪙 {selectedStudent.points} xu thi đua · {selectedStudent.gender}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleGenerateRemark}
              disabled={isLoading || !selectedStudent}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 hover-zoom-btn disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'AI Đang Suy Nghĩ & Soạn Lời Phê...' : 'Tạo Lời Phê & Thư Khen AI'}
            </button>

            <div className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
              💡 <strong>Gợi ý:</strong> AI sẽ tự động phân tích số xu thi đua, giới tính và nề nếp của em để soạn lời phê chân thành, mang tính xây dựng cao và thư Zalo cho phụ huynh.
            </div>
          </div>

          {/* Result Output */}
          <div className="lg:col-span-2 space-y-4">
            {/* Remark Card */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3 hover-zoom-card">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Lời Nhận Xét Học Bạ / Sổ Theo Dõi
                </h3>
                {aiRemarkResult && (
                  <button
                    onClick={() => handleCopy(aiRemarkResult, 'remark')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 hover-zoom-btn"
                  >
                    {copiedKey === 'remark' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'remark' ? 'Đã sao chép!' : 'Sao chép'}</span>
                  </button>
                )}
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs md:text-sm text-slate-800 leading-relaxed whitespace-pre-line min-h-[100px] flex items-center">
                {aiRemarkResult || (
                  <span className="text-slate-400 italic">
                    Chưa có nội dung. Vui lòng bấm "Tạo Lời Phê & Thư Khen AI" để bắt đầu.
                  </span>
                )}
              </div>
            </div>

            {/* Parent Message Card */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3 hover-zoom-card">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <HeartHandshake className="w-4 h-4 text-pink-600" />
                  Thư Khen / Tin Nhắn Gửi Phụ Huynh Qua Zalo
                </h3>
                {aiParentMessageResult && (
                  <button
                    onClick={() => handleCopy(aiParentMessageResult, 'parent')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-50 hover:bg-pink-100 text-pink-700 rounded-lg text-xs font-bold hover-zoom-btn"
                  >
                    {copiedKey === 'parent' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'parent' ? 'Đã sao chép!' : 'Sao chép gửi Zalo'}</span>
                  </button>
                )}
              </div>

              <div className="p-4 bg-pink-50/50 rounded-2xl border border-pink-100 text-xs md:text-sm text-slate-800 leading-relaxed whitespace-pre-line min-h-[120px] flex items-center">
                {aiParentMessageResult || (
                  <span className="text-slate-400 italic">
                    Nội dung tin nhắn Zalo gửi phụ huynh sẽ xuất hiện ở đây...
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Warm-up Quiz & Mini-game (SGK Kết Nối Tri Thức Với Cuộc Sống) */}
      {activeTab === 'quiz' && (
        <div className="space-y-4">
          {/* ========================================================================= */}
          {/* FULLSCREEN ARENA OVERLAY (KHI BẬT TOÀN MÀN HÌNH)                          */}
          {/* ========================================================================= */}
          {isQuizFullscreen && quizQuestions.length > 0 && quizQuestions[activeQuizIndex] && (
            <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white flex flex-col overflow-y-auto animate-fadeIn select-none">
              {/* FULLSCREEN TOP BAR */}
              <div className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md px-4 md:px-6 py-2.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-black text-amber-300 shadow-md">
                    <Play className="w-4 h-4 fill-current" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-amber-300 bg-amber-400/20 px-2 py-0.5 rounded-full border border-amber-400/30">
                        SGK KẾT NỐI TRI THỨC
                      </span>
                      <span className="text-xs font-bold text-slate-300">
                        {quizConfig.subject} · {quizConfig.grade} ({quizConfig.semester})
                      </span>
                    </div>
                    <h2 className="text-xs md:text-sm font-black text-white truncate max-w-md">
                      {quizQuestions[activeQuizIndex]?.topic || quizConfig.topic || 'Đấu Trường Khởi Động & Đố Vui Đầu Giờ'}
                    </h2>
                  </div>
                </div>

                {/* Random Student Caller in Fullscreen */}
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-2xl border border-white/15">
                  {selectedStudent ? (
                    <img
                      src={selectedStudent.avatar}
                      alt={selectedStudent.name}
                      className="w-7 h-7 rounded-lg object-cover bg-white ring-2 ring-amber-400 shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center font-bold text-amber-300 text-xs">
                      ?
                    </div>
                  )}
                  <div className="text-left">
                    <div className="text-[9px] text-blue-200 font-bold uppercase leading-none">Học sinh trả lời:</div>
                    <div className="text-xs font-black text-white leading-tight">
                      {isSpinningStudent ? (
                        <span className="text-amber-300 animate-pulse">{spinningStudentName}...</span>
                      ) : selectedStudent ? (
                        <>#{selectedStudent.stt} - {selectedStudent.name} ({selectedStudent.points} xu)</>
                      ) : (
                        'Chưa chọn'
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handlePickRandomStudent}
                    disabled={isSpinningStudent || classStudents.length === 0}
                    className="ml-1 px-2.5 py-1 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-slate-950 font-black text-xs rounded-lg flex items-center gap-1 shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50 transition-all hover-zoom-btn"
                  >
                    <Dice5 className={`w-3.5 h-3.5 ${isSpinningStudent ? 'animate-spin' : ''}`} />
                    <span>{isSpinningStudent ? 'Đang quay...' : '🎲 Bốc thăm'}</span>
                  </button>

                  <select
                    value={selectedStudentId}
                    onChange={(e) => {
                      setSelectedStudentId(e.target.value);
                      setPickedAnnouncement(null);
                    }}
                    className="px-2 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold border border-white/20 focus:outline-none cursor-pointer"
                  >
                    <option value="" className="text-slate-900">-- Chỉ định khác --</option>
                    {classStudents.map(s => (
                      <option key={s.id} value={s.id} className="text-slate-900">
                        #{s.stt} - {s.name} ({s.points} xu)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Question Numbers & Exit Fullscreen Button */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {quizQuestions.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => switchQuestion(idx)}
                        className={`w-7 h-7 rounded-lg text-xs font-black transition-all cursor-pointer ${
                          activeQuizIndex === idx 
                            ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-300' 
                            : 'bg-white/10 text-white/80 hover:bg-white/20'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={toggleQuizFullscreen}
                    className="px-3 py-1 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer ml-1"
                    title="Thu nhỏ hoặc nhấn phím Esc"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Thoát toàn màn hình (Esc)</span>
                  </button>
                </div>
              </div>

              {/* FULLSCREEN CENTER ARENA */}
              <div className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 flex flex-col justify-center space-y-4 my-auto">
                {(() => {
                  const currentQ = quizQuestions[activeQuizIndex];
                  return (
                    <div className="space-y-4">
                      {/* Badges bar */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-white/10">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-3 py-0.5 rounded-full bg-blue-600 text-white font-black text-xs shadow-md">
                            CÂU {activeQuizIndex + 1} / {quizQuestions.length}
                          </span>

                          <span className="px-2.5 py-0.5 rounded-full bg-purple-900/60 border border-purple-400/40 text-purple-200 font-bold text-xs">
                            {currentQ.type === 'single_choice' && '🎯 Trắc nghiệm 1 đáp án đúng'}
                            {currentQ.type === 'multiple_choice' && '✨ Trắc nghiệm 2 đáp án đúng'}
                            {currentQ.type === 'true_false' && '⚖️ Đúng / Sai'}
                            {currentQ.type === 'matching' && '🔗 Nối cột'}
                            {currentQ.type === 'essay' && '✍️ Tự luận'}
                          </span>

                          <span className={`px-2 py-0.5 rounded-md font-extrabold text-xs ${
                            currentQ.difficulty === 'DỄ' 
                              ? 'bg-emerald-900/60 border border-emerald-400/40 text-emerald-200' 
                              : currentQ.difficulty === 'TRUNG BÌNH' 
                              ? 'bg-sky-900/60 border border-sky-400/40 text-sky-200' 
                              : 'bg-rose-900/60 border border-rose-400/40 text-rose-200'
                          }`}>
                            Mức độ: {currentQ.difficulty}
                          </span>
                        </div>

                        <div className="text-amber-300 font-black text-xs md:text-sm flex items-center gap-1.5 bg-amber-400/10 px-3 py-1 rounded-xl border border-amber-400/20">
                          <span>🪙 Thưởng: +{currentQ.rewardCoins || quizConfig.rewardCoins || 5} xu</span>
                        </div>
                      </div>

                      {/* Big Question Box */}
                      <div className="p-5 md:p-7 bg-gradient-to-r from-blue-900/50 via-indigo-900/50 to-purple-900/50 rounded-2xl md:rounded-3xl border border-white/20 shadow-2xl backdrop-blur-md">
                        <h3 className="text-base md:text-xl lg:text-2xl font-black text-white text-center leading-relaxed drop-shadow-sm">
                          {currentQ.question}
                        </h3>
                      </div>

                      {/* Question Interactive Options in Fullscreen */}
                      {renderQuestionInteractive(currentQ, true)}

                      {/* Result Banner in Fullscreen */}
                      {isAnswerChecked && (
                        <div className={`p-4 rounded-2xl border text-xs md:text-sm leading-relaxed transition-all shadow-xl ${
                          isAnswerCorrect
                            ? 'bg-emerald-950/80 border-emerald-400 text-emerald-100'
                            : 'bg-rose-950/80 border-rose-400 text-rose-100'
                        }`}>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="text-2xl md:text-3xl">
                                {isAnswerCorrect ? '🎉' : '💡'}
                              </div>
                              <div>
                                <div className="font-black text-sm md:text-base">
                                  {isAnswerCorrect
                                    ? `CHÍNH XÁC! Chúc mừng em ${selectedStudent?.name || ''} đã trả lời đúng!`
                                    : 'Chưa chính xác rồi! Cố gắng ở câu tiếp theo nhé!'}
                                </div>
                                <div className="text-xs opacity-90 mt-0.5">
                                  {isAnswerCorrect ? (
                                    rewardAwarded ? (
                                      <span className="font-bold text-amber-300">
                                        🪙 Đã cộng +{currentQ.rewardCoins || quizConfig.rewardCoins || 5} xu thi đua vào sổ học sinh thành công!
                                      </span>
                                    ) : (
                                      <span>Bấm nút "Tặng xu thưởng" để cộng điểm thi đua cho học sinh.</span>
                                    )
                                  ) : (
                                    <span>Thầy/Cô hãy động viên nhẹ nhàng và tiếp tục câu hỏi tiếp theo nhé!</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {isAnswerCorrect && selectedStudent && (
                              <button
                                type="button"
                                onClick={handleAwardQuizCoin}
                                disabled={rewardAwarded}
                                className={`px-4 py-2 rounded-xl text-xs md:text-sm font-black flex items-center gap-2 hover-zoom-btn shrink-0 transition-all cursor-pointer ${
                                  rewardAwarded
                                    ? 'bg-emerald-800 text-emerald-200 cursor-default'
                                    : 'bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-slate-950 shadow-lg shadow-amber-500/30'
                                }`}
                              >
                                <Award className="w-4 h-4" />
                                <span>
                                  {rewardAwarded 
                                    ? `✓ Đã tặng +${currentQ.rewardCoins || quizConfig.rewardCoins || 5} xu!` 
                                    : `Tặng +${currentQ.rewardCoins || quizConfig.rewardCoins || 5} xu cho ${selectedStudent.name}`}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Explanation Box in Fullscreen */}
                      {showExplanation && (
                        <div className="p-4 bg-blue-950/80 rounded-2xl border border-blue-400/40 text-xs md:text-sm text-blue-100 leading-relaxed space-y-2 shadow-xl">
                          <div className="font-black text-amber-300 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>Đáp án & Lời giải thích sư phạm:</span>
                          </div>
                          <p className="whitespace-pre-line pl-6 font-medium text-slate-200">
                            {currentQ.explanation}
                          </p>
                          {currentQ.type === 'matching' && currentQ.matchingPairs && (
                            <div className="pl-6 pt-2 border-t border-blue-800/60 space-y-1.5">
                              <div className="font-bold text-amber-300">Đáp án nối ghép chuẩn xác:</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {currentQ.matchingPairs.map((p, pIdx) => (
                                  <div key={p.id} className="p-2 rounded-lg bg-white/10 border border-white/15 flex items-center gap-2 text-xs">
                                    <span className="w-5 h-5 rounded-md bg-blue-600 text-white font-bold flex items-center justify-center shrink-0">
                                      A{pIdx + 1}
                                    </span>
                                    <span className="font-semibold text-slate-200">{p.left}</span>
                                    <span className="text-amber-400 font-black">➔</span>
                                    <span className="font-bold text-emerald-300">{p.right}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* FULLSCREEN BOTTOM CONTROL BAR */}
              <div className="sticky bottom-0 z-30 bg-slate-900/95 backdrop-blur-md px-4 md:px-6 py-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCheckAnswer}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-black text-xs md:text-sm rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-500/30 hover-zoom-btn cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Kiểm tra đáp án</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowExplanation(!showExplanation)}
                    className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 hover-zoom-btn cursor-pointer"
                  >
                    {showExplanation ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-blue-400" />}
                    <span>{showExplanation ? 'Ẩn lời giải' : 'Hiện lời giải'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRetryCurrentQuestion}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white font-bold text-xs rounded-xl flex items-center gap-1 hover-zoom-btn cursor-pointer"
                    title="Làm lại câu hỏi này"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Làm lại</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (activeQuizIndex > 0) {
                        switchQuestion(activeQuizIndex - 1);
                      }
                    }}
                    disabled={activeQuizIndex === 0}
                    className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl flex items-center gap-1 hover-zoom-btn disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Câu trước</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (activeQuizIndex < quizQuestions.length - 1) {
                        switchQuestion(activeQuizIndex + 1);
                      }
                    }}
                    disabled={activeQuizIndex === quizQuestions.length - 1}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1 hover-zoom-btn disabled:opacity-40 cursor-pointer shadow-md shadow-blue-500/30"
                  >
                    <span>Câu tiếp theo</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* IN-PAGE COMPACT BANNER & STUDENT PICKER                                   */}
          {/* ========================================================================= */}
          <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 rounded-2xl md:rounded-3xl p-3.5 md:p-4 text-white shadow-md space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-black text-amber-200">
                  <BookOpen className="w-3 h-3" />
                  SGK KẾT NỐI TRI THỨC VỚI CUỘC SỐNG
                </div>
                <h2 className="text-base md:text-lg font-black tracking-tight flex items-center gap-2">
                  <Play className="w-4 h-4 md:w-5 md:h-5 text-amber-300" />
                  Đấu Trường Khởi Động & Đố Vui Đầu Giờ
                </h2>
                <p className="text-xs text-blue-100 max-w-xl truncate hidden sm:block">
                  Khởi động hào hứng, kích hoạt tư duy, gọi tên học sinh ngẫu nhiên & cộng xu thưởng ngay!
                </p>
              </div>

              {/* Student Caller + Fullscreen & Collapse Controls */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* Caller Info */}
                <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 flex items-center gap-2.5">
                  {selectedStudent ? (
                    <img
                      src={selectedStudent.avatar}
                      alt={selectedStudent.name}
                      className="w-8 h-8 rounded-lg object-cover bg-white ring-2 ring-amber-300 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-bold text-amber-300 text-xs">
                      ?
                    </div>
                  )}
                  <div className="text-left">
                    <div className="text-[10px] text-blue-200 font-bold uppercase leading-none">Học sinh được gọi:</div>
                    <div className="text-xs font-black text-white leading-tight">
                      {isSpinningStudent ? (
                        <span className="text-amber-300 animate-pulse">{spinningStudentName}...</span>
                      ) : selectedStudent ? (
                        <>#{selectedStudent.stt} - {selectedStudent.name} ({selectedStudent.points} xu)</>
                      ) : (
                        'Chưa chọn'
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handlePickRandomStudent}
                    disabled={isSpinningStudent || classStudents.length === 0}
                    className="ml-1 px-2.5 py-1.5 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-slate-950 font-black text-xs rounded-lg flex items-center gap-1 shadow-xs cursor-pointer disabled:opacity-50 transition-all hover-zoom-btn"
                    title="Bốc thăm ngẫu nhiên một bạn trong lớp"
                  >
                    <Dice5 className={`w-3.5 h-3.5 ${isSpinningStudent ? 'animate-spin' : ''}`} />
                    <span>{isSpinningStudent ? 'Đang quay...' : 'Bốc thăm'}</span>
                  </button>

                  <select
                    value={selectedStudentId}
                    onChange={(e) => {
                      setSelectedStudentId(e.target.value);
                      setPickedAnnouncement(null);
                    }}
                    title="Chỉ định học sinh cụ thể từ danh sách lớp"
                    className="px-2 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold border border-white/20 focus:outline-none cursor-pointer"
                  >
                    <option value="" className="text-slate-900">-- Chỉ định khác --</option>
                    {classStudents.map(s => (
                      <option key={s.id} value={s.id} className="text-slate-900">
                        #{s.stt} - {s.name} ({s.points} xu)
                      </option>
                    ))}
                  </select>
                </div>

                {/* NÚT TOÀN MÀN HÌNH NỔI BẬT */}
                <button
                  type="button"
                  onClick={toggleQuizFullscreen}
                  className="px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-black text-xs md:text-sm rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-500/30 transition-all hover-zoom-btn cursor-pointer shrink-0"
                  title="Xem toàn màn hình để chiếu lớp học và thao tác dễ dàng trực quan"
                >
                  <Maximize2 className="w-4 h-4" />
                  <span>Toàn màn hình</span>
                </button>

                {/* Nút Ẩn/Hiện Cấu hình */}
                <button
                  type="button"
                  onClick={() => setIsConfigCollapsed(!isConfigCollapsed)}
                  className="px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                  title={isConfigCollapsed ? 'Mở rộng bảng cài đặt cấu hình câu hỏi' : 'Thu gọn bảng cài đặt để xem câu hỏi rộng hơn'}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{isConfigCollapsed ? 'Hiện cài đặt' : 'Ẩn cài đặt'}</span>
                </button>
              </div>
            </div>

            {pickedAnnouncement && (
              <div className="py-2 px-3 bg-amber-400 text-slate-950 rounded-xl text-xs md:text-sm font-black flex items-center justify-between shadow-xs animate-bounce">
                <span>{pickedAnnouncement}</span>
                <span className="text-[11px] font-semibold bg-white/60 px-2 py-0.5 rounded-md">
                  Trả lời đúng được cộng xu thi đua!
                </span>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* MAIN LAYOUT: COMPACT CONFIGURATION + EXPANDABLE ARENA                     */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Sidebar: Compact Quiz Settings (KNTT) */}
            {!isConfigCollapsed && (
              <div className="lg:col-span-4 space-y-3">
                <div className="bg-white rounded-2xl md:rounded-3xl p-4 border border-slate-200 shadow-xs space-y-3 hover-zoom-card">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <h3 className="text-xs md:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-blue-600" />
                      Cấu Hình Câu Hỏi Khởi Động
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-extrabold text-[10px]">
                        KNTT
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsConfigCollapsed(true)}
                        className="text-slate-400 hover:text-slate-700 text-xs p-1 rounded-md hover:bg-slate-100 cursor-pointer"
                        title="Thu gọn bảng cấu hình"
                      >
                        ◀ Thu gọn
                      </button>
                    </div>
                  </div>

                  {/* 1. Môn học */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      1. Môn học:
                    </label>
                    <select
                      value={quizConfig.subject}
                      onChange={(e) => {
                        const newSubject = e.target.value;
                        setQuizConfig(prev => ({ ...prev, subject: newSubject, topic: '' }));
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 hover-zoom-interactive"
                    >
                      {[
                        'Toán',
                        'Tiếng Việt',
                        'Tiếng Anh',
                        'Khoa học',
                        'Tự nhiên và Xã hội',
                        'Lịch sử và Địa lí',
                        'Đạo đức',
                        'Tin học và Công nghệ',
                        'Hoạt động trải nghiệm',
                        'Âm nhạc',
                        'Mĩ thuật'
                      ].map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Khối lớp & Học kỳ */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        2. Khối lớp:
                      </label>
                      <select
                        value={quizConfig.grade}
                        onChange={(e) => setQuizConfig(prev => ({ ...prev, grade: e.target.value }))}
                        className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 hover-zoom-interactive"
                      >
                        {['Khối 1', 'Khối 2', 'Khối 3', 'Khối 4', 'Khối 5', 'Khối 6', 'Khối 7', 'Khối 8', 'Khối 9'].map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        3. Học kỳ:
                      </label>
                      <select
                        value={quizConfig.semester}
                        onChange={(e) => setQuizConfig(prev => ({ ...prev, semester: e.target.value as any }))}
                        className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 hover-zoom-interactive"
                      >
                        <option value="Học kỳ 1">Học kỳ 1</option>
                        <option value="Học kỳ 2">Học kỳ 2</option>
                        <option value="Cả năm">Cả năm</option>
                      </select>
                    </div>
                  </div>

                  {/* 3. Dạng câu hỏi */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      4. Dạng câu hỏi:
                    </label>
                    <select
                      value={quizConfig.questionType}
                      onChange={(e) => setQuizConfig(prev => ({ ...prev, questionType: e.target.value as any }))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 hover-zoom-interactive"
                    >
                      <option value="all">🌟 Đa dạng tổng hợp các dạng</option>
                      <option value="single_choice">1. Trắc nghiệm: 1 đáp án đúng</option>
                      <option value="multiple_choice">2. Trắc nghiệm: 2 đáp án đúng</option>
                      <option value="true_false">3. Câu hỏi Đúng / Sai</option>
                      <option value="matching">4. Câu hỏi Nối cột</option>
                      <option value="essay">5. Câu hỏi Tự luận</option>
                    </select>
                  </div>

                  {/* 4. Mức độ nhận thức */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      5. Mức độ:
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['DỄ', 'TRUNG BÌNH', 'KHÓ'] as QuizDifficulty[]).map((level) => {
                        const isActive = quizConfig.difficulty === level;
                        let colorClass = 'border-slate-200 text-slate-700 hover:bg-slate-50';
                        if (isActive) {
                          if (level === 'DỄ') colorClass = 'bg-emerald-600 border-emerald-600 text-white font-black shadow-xs';
                          else if (level === 'TRUNG BÌNH') colorClass = 'bg-blue-600 border-blue-600 text-white font-black shadow-xs';
                          else colorClass = 'bg-rose-600 border-rose-600 text-white font-black shadow-xs';
                        }
                        return (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setQuizConfig(prev => ({ ...prev, difficulty: level }))}
                            className={`py-1.5 rounded-lg border text-[11px] text-center transition-all hover-zoom-btn cursor-pointer ${colorClass}`}
                          >
                            {level}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 5. Số lượng câu hỏi */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      6. Số lượng câu:
                    </label>
                    <div className="flex items-center gap-1.5">
                      {[3, 5, 8, 10].map(cnt => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => setQuizConfig(prev => ({ ...prev, questionCount: cnt }))}
                          className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all hover-zoom-btn cursor-pointer ${
                            quizConfig.questionCount === cnt
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {cnt} câu
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 6. Chủ đề bài học */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      7. Chủ đề bài học (SGK KNTT):
                    </label>
                    <input
                      type="text"
                      value={quizConfig.topic}
                      onChange={(e) => setQuizConfig(prev => ({ ...prev, topic: e.target.value }))}
                      placeholder="VD: Bài 14: Ôn tập phép nhân chia..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 hover-zoom-interactive"
                    />

                    {/* Quick suggestion pills */}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(quizConfig.subject.includes('Toán')
                        ? ['Bảng nhân chia', 'Phân số', 'Hình học & Đo lường']
                        : quizConfig.subject.includes('Tiếng Việt')
                        ? ['Danh - Động - Tính từ', 'Biện pháp so sánh', 'Chính tả']
                        : quizConfig.subject.includes('Anh')
                        ? ['Vocabulary', 'Family & School', 'Animals']
                        : ['Môi trường', 'Lớp học hạnh phúc', 'Khoa học quanh ta']
                      ).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setQuizConfig(prev => ({ ...prev, topic: preset }))}
                          className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-100 text-[10px] font-medium text-slate-600 hover:text-blue-700 transition-colors cursor-pointer"
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 7. Mô tả chi tiết nội dung */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      8. Mô tả yêu cầu (tùy chọn):
                    </label>
                    <textarea
                      rows={2}
                      value={quizConfig.topicDescription}
                      onChange={(e) => setQuizConfig(prev => ({ ...prev, topicDescription: e.target.value }))}
                      placeholder="Mô tả cụ thể (VD: đố mẹo vui vẻ, câu hỏi gắn với thực tiễn...)"
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 hover-zoom-interactive leading-relaxed"
                    />
                  </div>

                  {/* Mức thưởng xu */}
                  <div className="flex items-center justify-between p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-amber-600" />
                      Thưởng đúng:
                    </div>
                    <div className="flex items-center gap-1">
                      {[3, 5, 10].map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setQuizConfig(prev => ({ ...prev, rewardCoins: c }))}
                          className={`px-2 py-0.5 rounded-md text-xs font-black transition-all cursor-pointer ${
                            quizConfig.rewardCoins === c
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'bg-white text-amber-800 border border-amber-200'
                          }`}
                        >
                          +{c} xu
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Submit generate */}
                  <button
                    type="button"
                    onClick={handleGenerateQuiz}
                    disabled={isLoading}
                    className="w-full py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-black text-xs md:text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/25 hover-zoom-btn disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <Sparkles className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    {isLoading ? 'AI Đang Biên Soạn...' : `Tạo Bộ ${quizConfig.questionCount} Câu Hỏi Khởi Động AI`}
                  </button>

                  {/* Trả lời lại bộ câu hỏi */}
                  {quizQuestions.length > 0 && (
                    <button
                      type="button"
                      onClick={handleRestartQuiz}
                      className="w-full py-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover-zoom-btn transition-all cursor-pointer shadow-2xs"
                      title="Bắt đầu trả lời lại toàn bộ câu hỏi từ Câu 1"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                      <span>Trả lời lại bộ câu hỏi ({quizQuestions.length} câu)</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Right Panel: Interactive Warm-up Arena */}
            <div id="quiz-arena-section" className={`${isConfigCollapsed ? 'lg:col-span-12' : 'lg:col-span-8'} space-y-3.5`}>
              {/* Collapsed Config Summary Bar */}
              {isConfigCollapsed && (
                <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white text-[11px] font-black">
                      {quizConfig.subject} · {quizConfig.grade}
                    </span>
                    <span className="text-slate-600">
                      {quizConfig.semester} · Mức độ: <strong className="text-blue-700">{quizConfig.difficulty}</strong> · {quizQuestions.length} câu
                    </span>
                    {quizConfig.topic && (
                      <span className="text-purple-700 hidden sm:inline">
                        · Chủ đề: {quizConfig.topic}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsConfigCollapsed(false)}
                      className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-all hover-zoom-btn"
                    >
                      <Sliders className="w-3 h-3" />
                      <span>Mở lại cài đặt</span>
                    </button>

                    {quizQuestions.length > 0 && (
                      <button
                        type="button"
                        onClick={handleRestartQuiz}
                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-all hover-zoom-btn"
                      >
                        <RotateCcw className="w-3 h-3 text-amber-600" />
                        <span>Trả lời lại</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Notification Banner when Quiz is Generated */}
              {quizNotice && (
                <div className="p-3 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-300 rounded-2xl flex items-center justify-between gap-3 shadow-xs animate-fadeIn">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                      ✨
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs md:text-sm font-black text-emerald-950">
                          {quizNotice.message}
                        </h4>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-black uppercase">
                          MỚI CẬP NHẬT
                        </span>
                      </div>
                      {quizNotice.sub && (
                        <p className="text-[11px] font-semibold text-emerald-800">
                          {quizNotice.sub}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuizNotice(null)}
                    className="p-1 rounded-lg hover:bg-emerald-200/70 text-emerald-800 text-xs font-bold shrink-0 cursor-pointer"
                    title="Đóng thông báo"
                  >
                    ✕
                  </button>
                </div>
              )}

              {quizQuestions.length > 0 && quizQuestions[activeQuizIndex] ? (
                (() => {
                  const currentQ = quizQuestions[activeQuizIndex];
                  return (
                    <div key={currentQ.id} className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-5 border border-slate-200 shadow-sm space-y-4 hover-zoom-card">
                      {/* Arena Header: Badges, Pagination & Fullscreen Toggle */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full bg-blue-600 text-white font-black text-xs shadow-xs">
                            CÂU {activeQuizIndex + 1} / {quizQuestions.length}
                          </span>

                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1">
                            <BookOpen className="w-3 h-3 text-blue-600" />
                            {currentQ.subject} · {currentQ.grade}
                          </span>

                          {/* Question Type Tag */}
                          <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold text-xs">
                            {currentQ.type === 'single_choice' && '🎯 Trắc nghiệm 1 đáp án đúng'}
                            {currentQ.type === 'multiple_choice' && '✨ Trắc nghiệm 2 đáp án đúng'}
                            {currentQ.type === 'true_false' && '⚖️ Đúng / Sai'}
                            {currentQ.type === 'matching' && '🔗 Nối cột'}
                            {currentQ.type === 'essay' && '✍️ Tự luận'}
                          </span>

                          {/* Difficulty Tag */}
                          <span className={`px-2 py-0.5 rounded-md font-extrabold text-[11px] ${
                            currentQ.difficulty === 'DỄ' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : currentQ.difficulty === 'TRUNG BÌNH' 
                              ? 'bg-sky-100 text-sky-800' 
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {currentQ.difficulty}
                          </span>

                          <span className="text-amber-600 font-bold text-xs">
                            🪙 +{currentQ.rewardCoins || quizConfig.rewardCoins || 5} xu
                          </span>
                        </div>

                        {/* Pagination Buttons & Header Fullscreen Button */}
                        <div className="flex items-center gap-1.5">
                          {quizQuestions.map((_, idx) => (
                            <button
                              key={idx}
                              onClick={() => switchQuestion(idx)}
                              className={`w-7 h-7 rounded-lg text-xs font-black transition-all hover-zoom-badge cursor-pointer ${
                                activeQuizIndex === idx 
                                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-300' 
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {idx + 1}
                            </button>
                          ))}

                          <button
                            type="button"
                            onClick={toggleQuizFullscreen}
                            className="ml-1 px-2.5 py-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold text-xs rounded-lg flex items-center gap-1 shadow-xs hover-zoom-btn cursor-pointer"
                            title="Mở toàn màn hình để chiếu lớp học"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Toàn màn hình</span>
                          </button>
                        </div>
                      </div>

                      {/* Topic & Question Box */}
                      <div className="space-y-2">
                        {currentQ.topic && (
                          <div className="text-xs text-slate-500 font-semibold">
                            Chủ đề SGK KNTT: <strong className="text-slate-800">{currentQ.topic}</strong>
                          </div>
                        )}

                        <div className="p-3.5 md:p-4 bg-gradient-to-br from-blue-50/90 via-indigo-50/60 to-purple-50/40 rounded-2xl border border-blue-100 shadow-2xs">
                          <h3 className="text-sm md:text-base font-bold text-slate-900 leading-relaxed">
                            {currentQ.question}
                          </h3>
                        </div>
                      </div>

                      {/* Interactive Answer Component */}
                      {renderQuestionInteractive(currentQ, false)}

                      {/* Action Bar: Check, Explanation, Next, Reward */}
                      <div className="pt-3 border-t border-slate-100 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Check Answer Button */}
                            <button
                              type="button"
                              onClick={handleCheckAnswer}
                              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs md:text-sm rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-500/25 hover-zoom-btn transition-all cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Kiểm tra đáp án</span>
                            </button>

                            {/* Toggle Explanation */}
                            <button
                              type="button"
                              onClick={() => setShowExplanation(!showExplanation)}
                              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl flex items-center gap-1.5 hover-zoom-btn transition-all cursor-pointer"
                            >
                              {showExplanation ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-blue-600" />}
                              <span>{showExplanation ? 'Ẩn lời giải' : 'Hiện lời giải chi tiết'}</span>
                            </button>

                            {/* Retry Current Question */}
                            <button
                              type="button"
                              onClick={handleRetryCurrentQuestion}
                              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1 hover-zoom-btn transition-all cursor-pointer"
                              title="Làm lại câu hỏi này"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                              <span>Làm lại</span>
                            </button>
                          </div>

                          {/* Navigation: Prev / Next */}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (activeQuizIndex > 0) {
                                  switchQuestion(activeQuizIndex - 1);
                                }
                              }}
                              disabled={activeQuizIndex === 0}
                              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1 hover-zoom-btn disabled:opacity-40 transition-all cursor-pointer"
                            >
                              <ChevronLeft className="w-4 h-4" />
                              <span>Câu trước</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (activeQuizIndex < quizQuestions.length - 1) {
                                  switchQuestion(activeQuizIndex + 1);
                                }
                              }}
                              disabled={activeQuizIndex === quizQuestions.length - 1}
                              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1 hover-zoom-btn disabled:opacity-40 transition-all cursor-pointer shadow-xs"
                            >
                              <span>Câu tiếp</span>
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* RESULT BANNER */}
                        {isAnswerChecked && (
                          <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed transition-all ${
                            isAnswerCorrect
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                              : 'bg-rose-50 border-rose-200 text-rose-950'
                          }`}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              <div className="flex items-start sm:items-center gap-2">
                                <div className="text-xl">
                                  {isAnswerCorrect ? '🎉' : '💡'}
                                </div>
                                <div>
                                  <div className="font-black text-xs md:text-sm">
                                    {isAnswerCorrect
                                      ? `CHÍNH XÁC! Chúc mừng em ${selectedStudent?.name || ''} đã trả lời đúng!`
                                      : 'Chưa chính xác rồi! Cố gắng ở câu tiếp theo nhé!'}
                                  </div>
                                  <div className="text-[11px] opacity-90 mt-0.5">
                                    {isAnswerCorrect ? (
                                      rewardAwarded ? (
                                        <span className="font-bold text-emerald-700">
                                          🪙 Đã cộng +{currentQ.rewardCoins || quizConfig.rewardCoins || 5} xu thi đua vào sổ học sinh thành công!
                                        </span>
                                      ) : (
                                        <span>Bấm nút "Tặng xu thưởng" để cộng điểm cho học sinh.</span>
                                      )
                                    ) : (
                                      <span className="text-rose-700 font-semibold">
                                        Học sinh trả lời sai không cộng điểm. Thầy/Cô hãy động viên nhẹ nhàng nhé!
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {isAnswerCorrect && selectedStudent && (
                                <button
                                  type="button"
                                  onClick={handleAwardQuizCoin}
                                  disabled={rewardAwarded}
                                  className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 hover-zoom-btn shrink-0 transition-all cursor-pointer ${
                                    rewardAwarded
                                      ? 'bg-emerald-200 text-emerald-900 cursor-default'
                                      : 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/25'
                                  }`}
                                >
                                  <Award className="w-4 h-4" />
                                  <span>
                                    {rewardAwarded 
                                      ? `✓ Đã tặng +${currentQ.rewardCoins || quizConfig.rewardCoins || 5} xu!` 
                                      : `Tặng +${currentQ.rewardCoins || quizConfig.rewardCoins || 5} xu cho ${selectedStudent.name}`}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* EXPLANATION BOX */}
                        {showExplanation && (
                          <div className="p-3.5 bg-blue-50/80 rounded-2xl border border-blue-200 text-xs text-blue-950 leading-relaxed space-y-2">
                            <div className="font-black text-blue-900 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-blue-600" />
                              <span>Đáp án & Lời giải thích sư phạm:</span>
                            </div>
                            <p className="whitespace-pre-line pl-5 font-medium text-slate-800">
                              {currentQ.explanation}
                            </p>
                            {currentQ.type === 'matching' && currentQ.matchingPairs && (
                              <div className="pl-5 pt-2 border-t border-blue-200/60 space-y-1">
                                <div className="font-bold text-blue-900">Đáp án nối ghép chuẩn xác theo SGK:</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                  {currentQ.matchingPairs.map((p, pIdx) => (
                                    <div key={p.id} className="p-1.5 rounded-lg bg-white border border-blue-200 flex items-center gap-2 text-[11px]">
                                      <span className="w-4 h-4 rounded bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                                        A{pIdx + 1}
                                      </span>
                                      <span className="font-semibold text-slate-800">{p.left}</span>
                                      <span className="text-blue-500 font-black">➔</span>
                                      <span className="font-bold text-emerald-800">{p.right}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="bg-white rounded-2xl md:rounded-3xl p-10 border border-slate-200 text-center text-slate-400 space-y-3">
                  <Play className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-xs md:text-sm font-semibold">
                    Chưa có câu hỏi nào. Vui lòng bấm "Tạo Bộ Câu Hỏi Khởi Động AI" ở cột bên trái để bắt đầu.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Smart AI Seating Optimizer */}
      {activeTab === 'seating' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6 hover-zoom-card">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Đề Xuất Sắp Xếp Sơ Đồ Bàn Học Thông Minh
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Phân tích học lực, tính cách và điểm xu thi đua để ghép cặp bàn đôi "Đôi Bạn Cùng Tiến"
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateSeating}
                disabled={isLoading}
                className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-blue-500/25 hover-zoom-btn disabled:opacity-50"
              >
                <Brain className="w-4 h-4" />
                {isLoading ? 'AI Đang Phân Tích Lớp...' : 'Phân Tích & Tạo Đề Xuất'}
              </button>

              {seatingProposal && (
                <button
                  onClick={handleApplySeatingProposal}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-emerald-600/25 hover-zoom-btn"
                >
                  <Check className="w-4 h-4" />
                  Áp Dụng Vào Sơ Đồ Lớp
                </button>
              )}
            </div>
          </div>

          {seatingProposal ? (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-100 text-xs md:text-sm text-blue-950 leading-relaxed">
                <strong>💡 Nguyên lý sư phạm: </strong>
                {seatingProposal.rationale}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {seatingProposal.pairs.map((pair, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 hover-zoom-card space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-extrabold text-[10px]">
                        Bàn đôi #{idx + 1}
                      </span>
                      <HeartHandshake className="w-3.5 h-3.5 text-pink-500" />
                    </div>
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <span className="text-blue-600">{pair.student1}</span>
                      <span className="text-slate-400">cùng</span>
                      <span className="text-indigo-600">{pair.student2}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">
                      {pair.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 space-y-3">
              <Users className="w-12 h-12 mx-auto text-slate-300" />
              <p className="text-xs md:text-sm font-medium">
                Bấm nút "Phân Tích & Tạo Đề Xuất" để AI tối ưu hóa vị trí ngồi theo mô hình đôi bạn cùng tiến.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: 5-Minute Energizers */}
      {activeTab === 'energizers' && (
        activeEnergizerGame ? (
          <EnergizerGameArena
            game={activeEnergizerGame}
            onBack={() => setActiveEnergizerGame(null)}
            classStudents={classStudents}
            activeClassName={activeClass?.name}
            awardPoints={awardPoints}
          />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
              <div>
                <h2 className="text-sm md:text-base font-black text-slate-900 flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-amber-500" />
                  Kho Trò Chơi 5 Phút Nạp Năng Lượng & Kích Hoạt Tập Trung
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Nhấn "KÍCH HOẠT" để mở đấu trường trò chơi riêng với đồng hồ đếm ngược, nút điều khiển và tặng xu thi đua trực tiếp
                </p>
              </div>
              <span className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold rounded-xl w-fit">
                6 Trò chơi sẵn sàng
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {ENERGIZER_GAMES.map((game) => (
                <div
                  key={game.id}
                  className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-200 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                        ⏱️ {game.duration}
                      </span>
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                    </div>
                    <h3 className="text-sm font-black text-slate-900 leading-snug">
                      {game.title}
                    </h3>
                    <p className="text-xs text-blue-600 font-semibold">
                      🎯 {game.benefit}
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed p-3 bg-slate-50 rounded-xl border border-slate-100">
                      {game.rules}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveEnergizerGame(game)}
                    className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>KÍCH HOẠT TRÒ CHƠI NÀY</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* TAB 5: AI Pedagogical Advisor Chat */}
      {activeTab === 'advisor' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[560px] hover-zoom-card">
          {/* Messages */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-slate-50/50">
            {chatMessages.map((msg, index) => (
              <div
                key={index}
                className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                    <Brain className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] p-4 rounded-2xl text-xs md:text-sm leading-relaxed whitespace-pre-line ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white font-medium rounded-tr-none'
                      : 'bg-white text-slate-800 border border-slate-200 shadow-xs rounded-tl-none'
                  }`}
                >
                  {/* File Attachment Badges in Sent Message */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2 pb-2 border-b border-blue-400/40">
                      {msg.attachments.map((att, attIdx) => (
                        <div
                          key={attIdx}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-700/70 border border-blue-400/50 text-[11px] font-semibold text-white shadow-xs"
                        >
                          {att.previewUrl ? (
                            <img src={att.previewUrl} alt={att.name} className="w-5 h-5 rounded object-cover border border-white/30 shrink-0" />
                          ) : (
                            <FileText className="w-3.5 h-3.5 text-blue-200 shrink-0" />
                          )}
                          <span className="truncate max-w-[130px]" title={att.name}>{att.name}</span>
                          <span className="text-[10px] text-blue-200">({att.sizeFormatted})</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 items-center text-xs text-slate-500 italic">
                <Brain className="w-4 h-4 animate-spin text-blue-600" />
                AI đang suy nghĩ và phân tích dữ liệu sư phạm...
              </div>
            )}
          </div>

          {/* File Attachments Tray Before Sending */}
          {(attachedFiles.length > 0 || isProcessingFiles) && (
            <div className="px-4 py-2 bg-slate-100/95 border-t border-slate-200 flex flex-wrap items-center gap-2 max-h-36 overflow-y-auto">
              {attachedFiles.map((f) => (
                <div
                  key={f.id}
                  className={`flex items-center gap-2 py-1 px-2.5 rounded-xl border text-xs font-semibold shadow-xs transition-all ${
                    f.status === 'ready'
                      ? 'bg-white border-blue-200 text-slate-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {/* Thumbnail / File icon */}
                  {f.previewUrl ? (
                    <img src={f.previewUrl} alt={f.name} className="w-6 h-6 rounded object-cover border border-slate-200 shrink-0" />
                  ) : f.fileType === 'pdf' ? (
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-black text-[9px] shrink-0">PDF</span>
                  ) : f.fileType === 'word' ? (
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-black text-[9px] shrink-0">DOCX</span>
                  ) : f.fileType === 'excel' ? (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-black text-[9px] shrink-0">XLS</span>
                  ) : (
                    <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                  )}

                  {/* Name and Status */}
                  <div className="flex flex-col min-w-0">
                    <span className="truncate max-w-[140px] sm:max-w-[200px] font-bold text-[11px] text-slate-800" title={f.name}>
                      {f.name}
                    </span>
                    <span className={`text-[10px] font-medium ${f.status === 'ready' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {f.status === 'ready' ? `✓ ${f.statusText}` : `✕ ${f.error || f.statusText}`}
                    </span>
                  </div>

                  {/* Remove attachment button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(f.id)}
                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-rose-600 transition-colors shrink-0 cursor-pointer ml-1"
                    title="Xóa tệp đính kèm này trước khi gửi"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {isProcessingFiles && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-50 text-blue-700 text-xs font-semibold animate-pulse">
                  <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>Đang đọc và xử lý tệp...</span>
                </div>
              )}
            </div>
          )}

          {/* Chat Input */}
          <div className="p-3.5 bg-white border-t border-slate-200 flex items-center gap-2">
            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isProcessingFiles}
              className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-600 hover:text-blue-600 transition-all hover-zoom-btn flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
              title="Đính kèm tệp: PNG, JPG, PDF, DOCX, TXT, Excel (Tối đa 10MB)"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.pdf,.docx,.doc,.xlsx,.xls,.txt,.csv,image/png,image/jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleFileSelect}
            />

            <input
              type="text"
              value={userChatInput}
              onChange={(e) => setUserChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
              placeholder={
                attachedFiles.length > 0 
                  ? "Nhập câu hỏi hoặc yêu cầu về tệp đính kèm (hoặc bấm Gửi ngay)..." 
                  : "Nhập tình huống lớp học hoặc bấm 📎 đính kèm ảnh, PDF, DOCX..."
              }
              className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSendChat}
              disabled={isLoading || isProcessingFiles || (!userChatInput.trim() && attachedFiles.filter(f => f.status === 'ready').length === 0)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs md:text-sm font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/25 hover-zoom-btn disabled:opacity-50 transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Gửi</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
