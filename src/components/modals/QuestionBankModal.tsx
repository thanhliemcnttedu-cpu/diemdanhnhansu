import React, { useState, useRef, useEffect } from 'react';
import { QuestionItem, QuestionType, QuestionMatchingPair } from '../../types';
import { 
  X, Plus, Trash2, Edit3, Upload, Image as ImageIcon, 
  Check, HelpCircle, Sparkles, BookOpen, Award, 
  RotateCcw, Save, Search, FileType, Layers, Tag,
  Maximize2, Minimize2, CheckSquare, ArrowUpDown, Shuffle,
  HelpCircle as QuestionIcon, CheckCircle2, XCircle, ArrowRight
} from 'lucide-react';
import { 
  parseDocxFile, parsePdfFile, parseImageFileWithAi, 
  parseQuestionsFromRawText, DEFAULT_QUESTIONS, saveQuizBank 
} from '../../utils/quizParser';
import { useClassroom } from '../../context/ClassroomContext';
import { requireQuizStorage, QuizStorageButton } from './QuizStorageModal';
import { QuestionEditor } from './question-editor/QuestionEditor';
import { QuestionPlayer } from './question-editor/QuestionPlayer';
import { isSampleQuestion, quizBankStore } from '../../services/quizBankStore';
import { PickQuestionsModal } from './question-editor/PickQuestionsModal';
import { ListPlus, FolderPlus } from 'lucide-react';
import { UserRound, Sparkles as SparklesIcon, Library } from 'lucide-react';
import { Play } from 'lucide-react';

interface QuestionBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: QuestionItem[];
  onSaveQuestions: (updated: QuestionItem[], latestSubject?: string) => void;
  initialEditQuestion?: QuestionItem | null;
}

const PRESET_SUBJECTS = [
  'Toán học',
  'Tiếng Việt',
  'Tiếng Anh',
  'Khoa học',
  'Lịch sử & Địa lý',
  'Tin học',
  'Đạo đức & Kỹ năng sống',
  'Âm nhạc',
  'Mỹ thuật',
  'Hoạt động trải nghiệm',
  'Giáo dục thể chất',
  'Đố vui IQ'
];

export const QuestionBankModal: React.FC<QuestionBankModalProps> = ({
  isOpen,
  onClose,
  questions,
  onSaveQuestions,
  initialEditQuestion
}) => {
  const { currentUser } = useClassroom();
  const [bank, setBank] = useState<QuestionItem[]>(questions);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Menu thả xuống: Nhập câu hỏi (tệp / dán văn bản) và Thêm (khôi phục mẫu)
  const [menu, setMenu] = useState<'' | 'import' | 'more'>('');
  // Tách nguồn câu hỏi: 'mine' = giáo viên tự soạn / đã sửa · 'sample' = câu mẫu có sẵn của phần mềm
  // Môn / bộ câu hỏi theo bài học do giáo viên tạo (giữ cả khi chưa có câu) + hộp Nhặt câu hỏi có sẵn
  const quizUser = currentUser?.username || 'guest';
  const [customSubjects, setCustomSubjects] = useState<string[]>(() => quizBankStore.getSubjects(quizUser));
  const [lessonMap, setLessonMap] = useState<Record<string, string[]>>(() => quizBankStore.getLessons(quizUser));
  useEffect(() => {
    const load = () => { setCustomSubjects(quizBankStore.getSubjects(quizUser)); setLessonMap(quizBankStore.getLessons(quizUser)); };
    load();
    return quizBankStore.subscribe(load);
  }, [quizUser]);
  const [newSubj, setNewSubj] = useState<string | null>(null);
  const [newLesson, setNewLesson] = useState<string | null>(null);
  // Bài học đang chọn trong môn: 'all' = mọi bài · '__none__' = câu chưa xếp bài · tên bài
  const [selectedLesson, setSelectedLesson] = useState<string>('all');
  const [uploadLesson, setUploadLesson] = useState<string>('');
  const [pickOpen, setPickOpen] = useState(false);
  const [source, setSource] = useState<'mine' | 'sample' | 'all'>(() => (questions.some(q => q && !isSampleQuestion(q)) ? 'mine' : 'all'));
  // Chơi thử (vai trò học sinh): danh sách câu + câu bắt đầu
  const [play, setPlay] = useState<{ list: QuestionItem[]; start: number; title: string } | null>(null);

  // Subject selector for uploading question sets
  const [uploadSubject, setUploadSubject] = useState<string>('Toán học');
  const [customSubjectName, setCustomSubjectName] = useState('');
  const [isCustomSubject, setIsCustomSubject] = useState(false);

  // Edit / Add state
  const [editingQuestion, setEditingQuestion] = useState<QuestionItem | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Raw text paste modal state
  const [isPastingText, setIsPastingText] = useState(false);
  const [pastedContent, setPastedContent] = useState('');

  // Refs for file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const questionImageInputRef = useRef<HTMLInputElement>(null);
  const answerImageInputRef = useRef<HTMLInputElement>(null);
  const optionImageInputRef = useRef<HTMLInputElement>(null);
  const activeOptionIndexForImageRef = useRef<number | null>(null);

  // Sync questions from props and open initialEditQuestion if provided
  useEffect(() => {
    setBank(questions);
  }, [questions]);

  useEffect(() => {
    if (isOpen && initialEditQuestion) {
      setEditingQuestion(initialEditQuestion);
      setIsCreatingNew(false);
    }
  }, [isOpen, initialEditQuestion]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Determine current target subject for upload
  const effectiveTargetSubject = isCustomSubject && customSubjectName.trim()
    ? customSubjectName.trim()
    : uploadSubject;

  // Filtered questions
  const filteredList = bank.filter(q => {
    const matchSearch = searchTerm.trim() === '' || 
      q.questionText.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (q.subject && q.subject.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchSubject = selectedSubject === 'all' || (q.subject || 'Tổng hợp') === selectedSubject;
    const matchLesson = selectedSubject === 'all' || selectedLesson === 'all' || (selectedLesson === '__none__' ? !q.lesson : q.lesson === selectedLesson);
    const matchType = selectedType === 'all' || q.type === selectedType;
    const matchSource = source === 'all' || (source === 'sample' ? isSampleQuestion(q) : !isSampleQuestion(q));
    return matchSearch && matchSubject && matchLesson && matchType && matchSource;
  });
  const sourceBank = bank.filter(q => source === 'all' || (source === 'sample' ? isSampleQuestion(q) : !isSampleQuestion(q)));
  const mineCount = bank.filter(q => !isSampleQuestion(q)).length;
  const sampleCount = bank.length - mineCount;
  const myQuestions = bank.filter(q => !isSampleQuestion(q));
  // Môn của giáo viên = danh sách giáo viên quản lý + môn đang có câu của giáo viên (không để câu "mồ côi")
  const mySubjects = Array.from(new Set([...customSubjects, ...myQuestions.map(q => q.subject || 'Tổng hợp')])).filter(Boolean);
  const sampleSubjects = Array.from(new Set(bank.filter(isSampleQuestion).map(q => q.subject || 'Tổng hợp')));
  const sideSubjects = source === 'sample' ? sampleSubjects : source === 'mine' ? mySubjects : Array.from(new Set([...mySubjects, ...sampleSubjects]));
  const lessonsOf = (sub: string) => Array.from(new Set([...(lessonMap[sub] || []), ...myQuestions.filter(q => (q.subject || 'Tổng hợp') === sub && q.lesson).map(q => q.lesson as string)]));
  const canManage = source !== 'sample';
  const myCountIn = (sub: string, les?: string) => myQuestions.filter(q => (q.subject || 'Tổng hợp') === sub && (les === undefined || (les === '__none__' ? !q.lesson : q.lesson === les))).length;
  const lessonCount = (sub: string, les: string) => sourceBank.filter(q => (q.subject || 'Tổng hợp') === sub && (les === '__none__' ? !q.lesson : q.lesson === les)).length;
  const saveList = (updated: QuestionItem[], sub?: string) => { setBank(updated); onSaveQuestions(updated, sub); saveQuizBank(updated); };

  const createSubject = () => {
    const n = (newSubj || '').trim();
    if (!n) return;
    quizBankStore.addSubject(quizUser, n);
    setNewSubj(null);
    if (source === 'sample') setSource('mine');
    setSelectedSubject(n); setSelectedLesson('all'); setUploadSubject(n); setUploadLesson(''); setIsCustomSubject(false);
    showToast(`Đã thêm môn [${n}]. Bấm "+ Thêm bài" để tạo bài học trong môn.`);
  };
  const deleteSubject = (sub: string) => {
    const n = myCountIn(sub);
    if (!confirm(n ? `Xóa môn [${sub}] và ${n} câu hỏi của bạn trong môn này?\n(Câu hỏi mẫu của phần mềm không bị xóa.)` : `Xóa môn [${sub}] khỏi danh sách môn của bạn?`)) return;
    quizBankStore.removeSubject(quizUser, sub);
    if (n) saveList(bank.filter(q => isSampleQuestion(q) || (q.subject || 'Tổng hợp') !== sub));
    setSelectedSubject('all'); setSelectedLesson('all');
    showToast(`Đã xóa môn [${sub}].`);
  };
  const createLesson = () => {
    const n = (newLesson || '').trim();
    if (!n || selectedSubject === 'all') return;
    quizBankStore.addLesson(quizUser, selectedSubject, n);
    setNewLesson(null);
    setSelectedLesson(n); setUploadLesson(n);
    showToast(`Đã thêm bài [${n}] vào môn [${selectedSubject}]. Bấm "Thêm câu mới" để soạn câu cho bài này.`);
  };
  const deleteLesson = (sub: string, les: string) => {
    const n = myCountIn(sub, les);
    if (!confirm(n ? `Xóa bài [${les}] và ${n} câu hỏi trong bài?` : `Xóa bài [${les}]?`)) return;
    quizBankStore.removeLesson(quizUser, sub, les);
    if (n) saveList(bank.filter(q => isSampleQuestion(q) || !((q.subject || 'Tổng hợp') === sub && q.lesson === les)));
    setSelectedLesson('all');
    showToast(`Đã xóa bài [${les}].`);
  };
  const handlePickConfirm = (target: string, lesson: string, picked: QuestionItem[]) => {
    const stamp = Date.now();
    const les = lesson.trim();
    const copies: QuestionItem[] = picked.map((q, i) => {
      const c: QuestionItem = { ...JSON.parse(JSON.stringify(q)), id: `q-custom-${stamp}-${i}-${Math.random().toString(36).slice(2, 5)}`, subject: target };
      if (les) c.lesson = les; else delete c.lesson;
      return c;
    });
    saveList([...copies, ...bank], target);
    quizBankStore.addSubject(quizUser, target);
    if (les) quizBankStore.addLesson(quizUser, target, les);
    setPickOpen(false);
    setSource('mine'); setSelectedSubject(target); setSelectedLesson(les || 'all'); setSelectedType('all');
    showToast(`Đã thêm ${copies.length} câu vào ${les ? `bài [${les}] – ` : ''}môn [${target}].`);
  };

  const allSubjects = Array.from(new Set(bank.map(q => q.subject || 'Tổng hợp'))).filter(Boolean);

  // Handle file uploads (Word, PDF, Images) with Subject tag
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingFile(true);
    const fileName = file.name.toLowerCase();
    const targetSubject = effectiveTargetSubject;

    try {
      let newQuestions: QuestionItem[] = [];

      if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
        newQuestions = await parseDocxFile(file, targetSubject);
        showToast(`Đã nhập thành công ${newQuestions.length} câu hỏi môn [${targetSubject}] từ file Word!`);
      } else if (fileName.endsWith('.pdf')) {
        newQuestions = await parsePdfFile(file, targetSubject);
        showToast(`Đã nhập thành công ${newQuestions.length} câu hỏi môn [${targetSubject}] từ file PDF!`);
      } else if (file.type.startsWith('image/')) {
        newQuestions = await parseImageFileWithAi(file, targetSubject);
        showToast(`Đã nhận diện thành công ${newQuestions.length} câu hỏi môn [${targetSubject}] từ Hình ảnh!`);
      } else {
        throw new Error('Định dạng file chưa được hỗ trợ. Vui lòng chọn file Word (.docx), PDF (.pdf) hoặc Hình ảnh (.png, .jpg).');
      }

      if (uploadLesson.trim()) newQuestions = newQuestions.map(q => ({ ...q, lesson: uploadLesson.trim() }));
      if (newQuestions.length > 0) {
        quizBankStore.addSubject(quizUser, targetSubject);
        if (uploadLesson.trim()) quizBankStore.addLesson(quizUser, targetSubject, uploadLesson.trim());
        const updated = [...newQuestions, ...bank];
        setBank(updated);
        onSaveQuestions(updated, targetSubject);
        saveQuizBank(updated);
        setSelectedSubject(targetSubject);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Lỗi khi nhập file câu hỏi.');
    } finally {
      setIsLoadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Text Paste import with Subject tag
  const handleImportPastedText = () => {
    if (!pastedContent.trim()) return;
    const targetSubject = effectiveTargetSubject;
    const parsed = parseQuestionsFromRawText(pastedContent, targetSubject).map(q => (uploadLesson.trim() ? { ...q, lesson: uploadLesson.trim() } : q));
    if (parsed.length) { quizBankStore.addSubject(quizUser, targetSubject); if (uploadLesson.trim()) quizBankStore.addLesson(quizUser, targetSubject, uploadLesson.trim()); }
    if (parsed.length === 0) {
      alert('Không nhận diện được câu hỏi. Hãy kiểm tra định dạng dán (VD: Câu 1: ... A. ... B. ... Đáp án: A)');
      return;
    }

    const updated = [...parsed, ...bank];
    setBank(updated);
    onSaveQuestions(updated, targetSubject);
    saveQuizBank(updated);
    setIsPastingText(false);
    setPastedContent('');
    setSelectedSubject(targetSubject);
    showToast(`Đã dán thành công ${parsed.length} câu hỏi môn [${targetSubject}]!`);
  };

  // Delete question
  const handleDeleteQuestion = (id: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa câu hỏi này khỏi kho đề?')) return;
    const updated = bank.filter(q => q.id !== id);
    setBank(updated);
    onSaveQuestions(updated);
    saveQuizBank(updated);
    showToast('Đã xóa câu hỏi khỏi bộ đề.');
  };

  // Delete all questions of selected subject
  const handleClearSubjectQuestions = () => {
    if (selectedSubject === 'all') return;
    if (!bank.some(q => (q.subject || 'Tổng hợp') === selectedSubject)) {
      quizBankStore.removeSubject(quizUser, selectedSubject);
      setSelectedSubject('all');
      showToast(`Đã xóa bộ câu hỏi [${selectedSubject}].`);
      return;
    }
    if (window.confirm(`Bạn có chắc muốn xóa tất cả câu hỏi của môn [${selectedSubject}]?`)) {
      quizBankStore.removeSubject(quizUser, selectedSubject);
      const updated = bank.filter(q => (q.subject || 'Tổng hợp') !== selectedSubject);
      setBank(updated);
      onSaveQuestions(updated);
      saveQuizBank(updated);
      setSelectedSubject('all');
      showToast(`Đã xóa bộ đề môn [${selectedSubject}].`);
    }
  };

  // Export questions of selected subject
  const handleExportSubjectJson = () => {
    const toExport = selectedSubject === 'all' ? bank : bank.filter(q => (q.subject || 'Tổng hợp') === selectedSubject);
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(toExport, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `bo-de-${selectedSubject.replace(/\s+/g, '_')}.json`);
    dlAnchor.click();
    showToast(`Đã xuất ${toExport.length} câu hỏi môn [${selectedSubject}] thành công!`);
  };

  // Reset to default sample questions
  const handleResetDefaults = () => {
    if (window.confirm('Bạn có chắc chắn muốn khôi phục kho câu hỏi mẫu phong phú ban đầu?')) {
      setBank(DEFAULT_QUESTIONS);
      onSaveQuestions(DEFAULT_QUESTIONS);
      saveQuizBank(DEFAULT_QUESTIONS);
      setSelectedSubject('all');
      showToast('Đã khôi phục bộ câu hỏi chuẩn!');
    }
  };

  // Lưu câu hỏi từ trình soạn (đã kiểm tra & làm gọn). addAnother = soạn ngay câu tiếp (giữ dạng câu + môn)
  const handleSaveFromEditor = (saved: QuestionItem, addAnother: boolean) => {
    const exists = bank.some(q => q.id === saved.id);
    const updatedList = exists ? bank.map(q => (q.id === saved.id ? saved : q)) : [saved, ...bank];
    const savedSub = saved.subject || effectiveTargetSubject;
    quizBankStore.addSubject(quizUser, savedSub);
    if (saved.lesson) quizBankStore.addLesson(quizUser, savedSub, saved.lesson);
    setBank(updatedList);
    onSaveQuestions(updatedList, savedSub);
    saveQuizBank(updatedList);
    if (addAnother) {
      setEditingQuestion(blankQuestion(saved.type, savedSub, saved.pointsReward, saved.lesson));
      setIsCreatingNew(true);
      showToast('Đã lưu câu hỏi. Soạn tiếp câu mới.');
    } else {
      setEditingQuestion(null);
      setIsCreatingNew(false);
      showToast('Đã lưu câu hỏi thành công!');
    }
  };

  // Thêm câu hỏi (soạn mới / tải tệp / dán văn bản): giáo viên phải cấu hình nơi lưu bộ câu hỏi trước
  const withStorage = async (action: () => void) => {
    if (await requireQuizStorage(currentUser)) action();
  };

  const blankQuestion = (type: QuestionItem['type'], subject: string, points?: number, lesson?: string): QuestionItem => ({
    ...(lesson ? { lesson } : {}),
    id: `q-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    subject,
    questionText: '',
    options: ['', '', '', ''],
    optionImages: ['', '', '', ''],
    correctOptionIndex: 0,
    teacherAnswerKey: '',
    pointsReward: points || 2
  });

  const handleStartCreateNew = () => {
    const defaultSub = selectedSubject !== 'all' ? selectedSubject : effectiveTargetSubject;
    const les = selectedSubject !== 'all' && selectedLesson !== 'all' && selectedLesson !== '__none__' ? selectedLesson : undefined;
    const newQ: QuestionItem = blankQuestion('multiple_choice', defaultSub, undefined, les);
    setEditingQuestion(newQ);
    setIsCreatingNew(true);
  };

  // Handle Question Image & Answer Image
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'image' | 'answerImage') => {
    const file = e.target.files?.[0];
    if (!file || !editingQuestion) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Kích thước ảnh không vượt quá 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setEditingQuestion({ ...editingQuestion, [field]: base64 });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveImage = (field: 'image' | 'answerImage') => {
    if (!editingQuestion) return;
    setEditingQuestion({ ...editingQuestion, [field]: undefined });
  };

  // Handle Option Image File Change for specific option index
  const handleOptionImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const optIdx = activeOptionIndexForImageRef.current;
    if (!file || !editingQuestion || optIdx === null) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Kích thước ảnh không vượt quá 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setEditingQuestion(prev => {
        if (!prev) return null;
        const currentOptImages = [...(prev.optionImages || [])];
        while (currentOptImages.length <= optIdx) {
          currentOptImages.push('');
        }
        currentOptImages[optIdx] = base64;
        return { ...prev, optionImages: currentOptImages };
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSetOptionImageUrl = (optIdx: number, url: string) => {
    setEditingQuestion(prev => {
      if (!prev) return null;
      const currentOptImages = [...(prev.optionImages || [])];
      while (currentOptImages.length <= optIdx) {
        currentOptImages.push('');
      }
      currentOptImages[optIdx] = url;
      return { ...prev, optionImages: currentOptImages };
    });
  };

  const handleRemoveOptionImage = (optIdx: number) => {
    setEditingQuestion(prev => {
      if (!prev) return null;
      const currentOptImages = [...(prev.optionImages || [])];
      if (currentOptImages[optIdx]) {
        currentOptImages[optIdx] = '';
      }
      return { ...prev, optionImages: currentOptImages };
    });
  };

  // Helper change question type
  const handleTypeChange = (newType: QuestionType) => {
    if (!editingQuestion) return;
    let nextQ: QuestionItem = {
      ...editingQuestion,
      type: newType
    };

    if (newType === 'multiple_choice') {
      nextQ.options = editingQuestion.options && editingQuestion.options.length >= 2 
        ? editingQuestion.options 
        : ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'];
      nextQ.correctOptionIndex = editingQuestion.correctOptionIndex ?? 0;
    } else if (newType === 'multi_select') {
      nextQ.options = editingQuestion.options && editingQuestion.options.length >= 2 
        ? editingQuestion.options 
        : ['Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3', 'Lựa chọn 4'];
      nextQ.correctOptionIndices = editingQuestion.correctOptionIndices || [0, 1];
    } else if (newType === 'true_false') {
      nextQ.isTrue = editingQuestion.isTrue ?? true;
    } else if (newType === 'fill_blank') {
      nextQ.blankAnswers = editingQuestion.blankAnswers || ['từ_đúng_1'];
      nextQ.distractorWords = editingQuestion.distractorWords || ['từ_nhiễu_1', 'từ_nhiễu_2'];
    } else if (newType === 'sequence_order') {
      nextQ.sequenceItems = editingQuestion.sequenceItems || ['Bước 1: ...', 'Bước 2: ...', 'Bước 3: ...'];
    } else if (newType === 'matching') {
      nextQ.matchingPairs = editingQuestion.matchingPairs || [
        { left: 'Mục 1 (Cột A)', right: 'Khớp 1 (Cột B)' },
        { left: 'Mục 2 (Cột A)', right: 'Khớp 2 (Cột B)' }
      ];
    }
    setEditingQuestion(nextQ);
  };

  const TYPE_FILTERS: Array<[string, string]> = [
    ['all', 'Tất cả dạng câu'], ['multiple_choice', 'Một đáp án'], ['multi_select', 'Nhiều đáp án'], ['true_false', 'Đúng / Sai'],
    ['fill_blank', 'Điền chỗ trống'], ['sequence_order', 'Sắp xếp thứ tự'], ['matching', 'Nối cột'], ['oral', 'Trả lời miệng'],
  ];
  const pickSubject = (sub: string) => {
    setSelectedSubject(sub); setSelectedLesson('all'); setNewLesson(null); setUploadLesson('');
    if (sub !== 'all') { setUploadSubject(sub); setIsCustomSubject(false); }
  };
  const subjectCount = (sub: string) => sourceBank.filter(q => (q.subject || 'Tổng hợp') === sub).length;
  const menuItem = 'no-hover-fx w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-100 flex items-start gap-2.5 text-sm text-slate-800';

  // Bảng bài học của môn đang chọn (máy tính: ngay dưới môn đó; điện thoại: dưới hàng môn)
  const lessonPanel = (
              <div className="mx-0 md:mx-0 mb-2 rounded-2xl border border-slate-200 bg-white p-2 space-y-1">
                <div className="flex items-center gap-1 px-1">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-600 flex-1 truncate" title={selectedSubject}>Bài học · {selectedSubject}</span>
                  {canManage && newLesson === null && (
                    <button type="button" onClick={() => setNewLesson('')} title="Thêm bài học trong môn này"
                      className="no-hover-fx h-8 px-2 rounded-lg text-xs font-black text-indigo-700 hover:bg-indigo-50 border border-indigo-200 inline-flex items-center gap-1 whitespace-nowrap">
                      <Plus className="w-3.5 h-3.5" /> Thêm bài
                    </button>
                  )}
                </div>
                {newLesson !== null && (
                  <div className="space-y-1.5 px-1">
                    <input autoFocus value={newLesson} onChange={(e) => setNewLesson(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') createLesson(); if (e.key === 'Escape') setNewLesson(null); }}
                      placeholder="VD: Bài 12 – Phép nhân" aria-label="Tên bài học mới"
                      className="w-full h-10 px-3 rounded-xl border border-indigo-400 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                    <div className="flex gap-1.5">
                      <button type="button" onClick={createLesson} disabled={!newLesson.trim()} className="no-hover-fx flex-1 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black disabled:opacity-40">Thêm bài</button>
                      <button type="button" onClick={() => setNewLesson(null)} className="no-hover-fx h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-700">Hủy</button>
                    </div>
                  </div>
                )}
                <div className="flex md:flex-col gap-1 overflow-x-auto">
                  {[['all', 'Tất cả bài', subjectCount(selectedSubject)] as [string, string, number],
                    ...(source === 'sample' ? [] : lessonsOf(selectedSubject).map(l => [l, l, lessonCount(selectedSubject, l)] as [string, string, number])),
                    ...(source !== 'sample' && lessonsOf(selectedSubject).length && lessonCount(selectedSubject, '__none__') ? [['__none__', 'Chưa xếp bài', lessonCount(selectedSubject, '__none__')] as [string, string, number]] : []),
                  ].map(([key, name, count]) => {
                    const on = selectedLesson === key;
                    return (
                      <div key={key} className={`group shrink-0 md:w-full flex items-center rounded-lg ${on ? 'bg-indigo-50 text-indigo-900 ring-1 ring-indigo-300' : 'text-slate-700 hover:bg-slate-50'}`}>
                        <button type="button" onClick={() => { setSelectedLesson(key); if (key !== 'all' && key !== '__none__') setUploadLesson(key); }} title={name}
                          className="no-hover-fx flex-1 min-w-0 flex items-center gap-2 pl-2.5 pr-1 h-9 text-sm text-left">
                          <span className={`truncate flex-1 whitespace-nowrap ${key === '__none__' ? 'italic' : ''} ${on ? 'font-black' : 'font-bold'}`}>{name}</span>
                          <span className="text-xs font-black tabular-nums text-slate-600">{count}</span>
                        </button>
                        {canManage && key !== 'all' && key !== '__none__' && (
                          <button type="button" onClick={() => deleteLesson(selectedSubject, key)} title={`Xóa bài ${name}`} aria-label={`Xóa bài ${name}`}
                            className="no-hover-fx w-7 h-7 mr-0.5 rounded-md text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center shrink-0 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {canManage && lessonsOf(selectedSubject).length === 0 && newLesson === null && (
                  <p className="text-xs text-slate-600 px-1">Chưa có bài. Bấm <strong>Thêm bài</strong> để chia câu hỏi theo bài học.</p>
                )}
                <button type="button" onClick={handleExportSubjectJson} className="no-hover-fx hidden md:inline-flex h-8 px-2 rounded-lg text-xs font-bold text-indigo-700 hover:bg-indigo-50 items-center gap-1.5"><Upload className="w-3.5 h-3.5 rotate-180" /> Xuất tệp môn này</button>
              </div>
  );

  return (
    <div className={`fixed inset-0 z-50 bg-sky-900/20 backdrop-blur-xs flex items-center justify-center select-none ${isFullscreen ? 'p-0' : 'p-2 sm:p-4'}`}>
      <div className={`bg-white w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in ${
        isFullscreen ? 'h-full rounded-none' : 'max-w-6xl h-[94vh] rounded-3xl'
      }`}>
        {/* Đầu: tên kho + nơi lưu + phóng to / đóng */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black text-slate-900">Kho câu hỏi</h2>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-black tabular-nums">{bank.length} câu</span>
            </div>
            <p className="text-sm text-slate-600 hidden sm:block truncate">7 dạng câu hỏi · ảnh, âm thanh · dùng cho các trò chơi gọi tên</p>
          </div>
          <QuizStorageButton compact className="max-sm:hidden" />
          <button type="button" onClick={() => setIsFullscreen(!isFullscreen)} className="no-hover-fx w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center" title={isFullscreen ? 'Thu nhỏ' : 'Phóng to toàn màn hình'} aria-label={isFullscreen ? 'Thu nhỏ' : 'Phóng to toàn màn hình'}>
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
          <button type="button" onClick={onClose} className="no-hover-fx w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center" title="Đóng cửa sổ" aria-label="Đóng">
            <X className="w-5 h-5" />
          </button>
        </div>

        {toastMessage && (
          <div role="status" className="bg-emerald-700 text-white text-sm font-bold px-4 py-2 text-center">{toastMessage}</div>
        )}

        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".docx,.doc,.pdf,image/*" className="hidden" />
        <input type="file" ref={questionImageInputRef} onChange={(e) => handleImageFileChange(e, 'image')} accept="image/*" className="hidden" />
        <input type="file" ref={answerImageInputRef} onChange={(e) => handleImageFileChange(e, 'answerImage')} accept="image/*" className="hidden" />
        <input type="file" ref={optionImageInputRef} onChange={handleOptionImageFileChange} accept="image/*" className="hidden" />

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[230px_minmax(0,1fr)]">
          {/* Cột môn học (bộ câu hỏi) */}
          <aside className="border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 md:overflow-y-auto">
            <div className="p-2 pb-1">
              <div className="grid grid-cols-3 md:grid-cols-1 gap-1" role="radiogroup" aria-label="Nguồn câu hỏi">
                {([
                  ['mine', 'Câu hỏi của tôi', mineCount, UserRound, 'Bạn tự soạn / đã sửa'],
                  ['sample', 'Câu hỏi mẫu', sampleCount, SparklesIcon, 'Có sẵn trong phần mềm'],
                  ['all', 'Tất cả', bank.length, Library, 'Của tôi + mẫu'],
                ] as Array<['mine' | 'sample' | 'all', string, number, React.ElementType, string]>).map(([k, name, n, Icon, hint]) => {
                  const on = source === k;
                  return (
                    <button key={k} type="button" role="radio" aria-checked={on} title={hint}
                      onClick={() => { setSource(k); setSelectedSubject('all'); }}
                      className={`no-hover-fx flex items-center gap-2 px-2.5 h-10 rounded-xl border-2 text-sm text-left transition-colors ${
                        on ? (k === 'mine' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : k === 'sample' ? 'border-slate-500 bg-white text-slate-900' : 'border-indigo-600 bg-indigo-50 text-indigo-900') : 'border-transparent text-slate-700 hover:bg-white'
                      }`}>
                      <Icon className="w-4 h-4 shrink-0 max-sm:hidden" />
                      <span className="flex-1 font-black truncate"><span className="md:hidden">{k === 'mine' ? 'Của tôi' : k === 'sample' ? 'Mẫu' : 'Tất cả'}</span><span className="hidden md:inline">{name}</span></span>
                      <span className="text-xs font-black tabular-nums px-1.5 rounded-md bg-white border border-slate-200 text-slate-700">{n}</span>
                    </button>
                  );
                })}
              </div>
              {source === 'mine' && mineCount === 0 && (
                <p className="mt-2 text-xs text-slate-700 bg-white border border-dashed border-slate-300 rounded-xl p-2.5">Bạn chưa có câu hỏi riêng. Bấm <strong>Thêm câu mới</strong> hoặc <strong>Nhập nhiều câu</strong>. Sửa một câu mẫu cũng thành câu của bạn.</p>
              )}
            </div>
            <div className="px-2 pt-2 pb-1 border-t border-slate-200 mx-2 flex items-center gap-1">
              <span className="text-xs font-black uppercase tracking-wide text-slate-600 hidden md:block px-1 flex-1 whitespace-nowrap">Môn học</span>
              {canManage && newSubj === null && (
                <button type="button" onClick={() => setNewSubj('')} title="Thêm môn học bạn dạy"
                  className="no-hover-fx h-8 px-2 rounded-lg text-xs font-black text-emerald-800 hover:bg-emerald-50 border border-emerald-300 bg-white inline-flex items-center gap-1 whitespace-nowrap">
                  <FolderPlus className="w-3.5 h-3.5" /> Thêm môn
                </button>
              )}
            </div>
            {newSubj !== null && (
              <div className="px-2 pb-1 space-y-1.5">
                <input autoFocus value={newSubj} onChange={(e) => setNewSubj(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createSubject(); if (e.key === 'Escape') setNewSubj(null); }}
                  placeholder="Tên môn, VD: Toán 3" aria-label="Tên môn học mới"
                  className="w-full h-10 px-3 rounded-xl border border-emerald-400 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
                <div className="flex gap-1.5">
                  <button type="button" onClick={createSubject} disabled={!newSubj.trim()} className="no-hover-fx flex-1 h-9 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black disabled:opacity-40">Thêm môn</button>
                  <button type="button" onClick={() => setNewSubj(null)} className="no-hover-fx h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-700">Hủy</button>
                </div>
              </div>
            )}
            <nav className="flex md:flex-col gap-1 p-2 overflow-x-auto" aria-label="Môn học">
              {[['all', 'Tất cả các môn', sourceBank.length] as [string, string, number], ...sideSubjects.map(sub => [sub, sub, subjectCount(sub)] as [string, string, number])].map(([key, name, count]) => {
                const on = selectedSubject === key;
                return (
                  <React.Fragment key={key}>
                  <div className={`group shrink-0 md:w-full flex items-center rounded-xl transition-colors ${on ? 'bg-indigo-600 text-white' : 'text-slate-800 hover:bg-white'}`}>
                    <button type="button" onClick={() => pickSubject(key)} aria-current={on ? 'true' : undefined} title={name}
                      className="no-hover-fx flex-1 min-w-0 flex items-center gap-2 pl-3 pr-1 h-10 text-sm text-left">
                      <span className={`truncate flex-1 whitespace-nowrap ${on ? 'font-black' : 'font-bold'}`}>{name}</span>
                      <span className={`text-xs font-black tabular-nums px-1.5 rounded-md ${on ? 'bg-white/25 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{count}</span>
                    </button>
                    {canManage && key !== 'all' && mySubjects.includes(key) && (
                      <button type="button" onClick={() => deleteSubject(key)} title={`Xóa môn ${name}`} aria-label={`Xóa môn ${name}`}
                        className={`no-hover-fx w-8 h-8 mr-1 rounded-lg inline-flex items-center justify-center shrink-0 ${on ? 'text-white hover:bg-white/20' : 'text-rose-700 hover:bg-rose-50 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100'}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    </div>
                    {on && key !== 'all' && <div className="hidden md:block mt-1 mb-1">{lessonPanel}</div>}
                  </React.Fragment>
                );
              })}
            </nav>

            {/* Bài học (điện thoại): dưới hàng môn */}
            {selectedSubject !== 'all' && <div className="md:hidden">{lessonPanel}</div>}
          </aside>

          {/* Khu chính: thanh công cụ + danh sách */}
          <div className="min-h-0 flex flex-col">
            <div className="px-3 sm:px-4 pt-2.5 pb-2 flex flex-wrap items-center gap-2 relative">
              <button type="button" onClick={() => withStorage(handleStartCreateNew)}
                className="no-hover-fx h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black inline-flex items-center gap-2 whitespace-nowrap">
                <Plus className="w-4 h-4" /> Thêm câu mới
              </button>
              <div className="relative">
                <button type="button" onClick={() => setMenu(menu === 'import' ? '' : 'import')} aria-expanded={menu === 'import'} aria-haspopup="menu"
                  className="no-hover-fx h-10 px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold inline-flex items-center gap-2 whitespace-nowrap">
                  <Upload className="w-4 h-4 text-indigo-700" /> {isLoadingFile ? 'Đang đọc tệp…' : 'Nhập nhiều câu'} <span aria-hidden className="text-slate-500">▾</span>
                </button>
                {menu === 'import' && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenu('')} />
                    <div role="menu" className="absolute left-0 top-12 z-20 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl p-2 space-y-1">
                      <div className="px-2 pt-1 pb-2 space-y-1.5">
                        <label className="block text-xs font-black uppercase tracking-wide text-slate-600">Nhập vào môn</label>
                        <select
                          value={isCustomSubject ? '__custom__' : uploadSubject}
                          onChange={(e) => { if (e.target.value === '__custom__') setIsCustomSubject(true); else { setIsCustomSubject(false); setUploadSubject(e.target.value); } }}
                          className="w-full h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800">
                          {Array.from(new Set([...mySubjects, uploadSubject])).filter(Boolean).map(sub => <option key={sub} value={sub}>{sub}</option>)}
                          <option value="__custom__">+ Môn mới (tự nhập)…</option>
                        </select>
                        {!isCustomSubject && (
                          <>
                            <label className="block text-xs font-black uppercase tracking-wide text-slate-600 pt-1">Vào bài</label>
                            <input list="qb-upload-lessons" value={uploadLesson} onChange={(e) => setUploadLesson(e.target.value)} placeholder="Không xếp bài (hoặc gõ tên bài mới)"
                              className="w-full h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800" aria-label="Nhập vào bài" />
                            <datalist id="qb-upload-lessons">{lessonsOf(uploadSubject).map(l => <option key={l} value={l} />)}</datalist>
                          </>
                        )}
                        {isCustomSubject && (
                          <input value={customSubjectName} onChange={(e) => setCustomSubjectName(e.target.value)} placeholder="Tên môn mới" autoFocus
                            className="w-full h-10 px-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-800" />
                        )}
                      </div>
                      <button type="button" role="menuitem" className={menuItem} onClick={() => { setMenu(''); withStorage(() => fileInputRef.current?.click()); }}>
                        <FileType className="w-4 h-4 mt-0.5 text-indigo-700 shrink-0" />
                        <span><strong className="block">Tải tệp Word / PDF / ảnh</strong><span className="text-xs text-slate-600">Tự nhận diện câu hỏi và phương án A, B, C, D</span></span>
                      </button>
                      <button type="button" role="menuitem" className={menuItem} onClick={() => { setMenu(''); withStorage(() => setIsPastingText(true)); }}>
                        <Edit3 className="w-4 h-4 mt-0.5 text-purple-700 shrink-0" />
                        <span><strong className="block">Dán văn bản</strong><span className="text-xs text-slate-600">Dán nhiều câu từ Word / trang web</span></span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              <button type="button" onClick={() => withStorage(() => setPickOpen(true))}
                title="Nhặt câu hỏi có sẵn trong kho (của bạn + câu mẫu) để tạo bộ câu hỏi cho bài học"
                className="no-hover-fx h-10 px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold inline-flex items-center gap-2 whitespace-nowrap">
                <ListPlus className="w-4 h-4 text-emerald-700" /> Nhặt câu có sẵn
              </button>
              <button type="button" disabled={filteredList.length === 0}
                onClick={() => setPlay({ list: filteredList, start: 0, title: selectedSubject === 'all' ? 'tất cả câu hỏi' : `môn ${selectedSubject}` })}
                title="Làm thử các câu đang hiển thị như học sinh" className="no-hover-fx h-10 px-3.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 text-sm font-bold inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-40">
                <Play className="w-4 h-4 fill-emerald-700" /> Chơi thử <span className="tabular-nums">({filteredList.length})</span>
              </button>
            </div>

            <div className="px-3 sm:px-4 pb-2.5 border-b border-slate-200 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input type="text" placeholder="Tìm câu hỏi…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label="Tìm câu hỏi"
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} aria-label="Lọc dạng câu"
                className="h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800">
                {TYPE_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <span className="text-sm text-slate-600 whitespace-nowrap tabular-nums">{filteredList.length} câu</span>
              <div className="relative">
                <button type="button" onClick={() => setMenu(menu === 'more' ? '' : 'more')} aria-expanded={menu === 'more'} aria-haspopup="menu" title="Thêm thao tác" aria-label="Thêm thao tác"
                  className="no-hover-fx w-10 h-10 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-lg font-black inline-flex items-center justify-center">⋯</button>
                {menu === 'more' && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenu('')} />
                    <div role="menu" className="absolute right-0 top-12 z-20 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl p-2">
                      <div className="sm:hidden px-1 pb-1"><QuizStorageButton compact className="w-full justify-center" /></div>
                      {selectedSubject !== 'all' && (
                        <>
                          <button type="button" role="menuitem" className={`${menuItem} md:hidden`} onClick={() => { setMenu(''); handleExportSubjectJson(); }}><Upload className="w-4 h-4 mt-0.5 rotate-180 shrink-0" /> Xuất tệp môn {selectedSubject}</button>
                          <button type="button" role="menuitem" className={`${menuItem} md:hidden text-rose-700`} onClick={() => { setMenu(''); handleClearSubjectQuestions(); }}><Trash2 className="w-4 h-4 mt-0.5 shrink-0" /> Xóa cả môn {selectedSubject}</button>
                        </>
                      )}
                      <button type="button" role="menuitem" className={menuItem} onClick={() => { setMenu(''); handleResetDefaults(); }}>
                        <RotateCcw className="w-4 h-4 mt-0.5 text-slate-600 shrink-0" />
                        <span><strong className="block">Khôi phục bộ câu hỏi mẫu</strong><span className="text-xs text-slate-600">Đưa kho về bộ câu hỏi mẫu ban đầu</span></span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

        {/* 4. Content Body: Question List or Editor Modal */}
        <div className="p-3 sm:p-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0 space-y-3">
          {editingQuestion ? (
            /* TRÌNH SOẠN CÂU HỎI (mở lớn, có xem trước) */
            <QuestionEditor
              question={editingQuestion}
              isNew={isCreatingNew}
              subjects={Array.from(new Set([...mySubjects, ...allSubjects]))}
              lessonsBySubject={Object.fromEntries(Array.from(new Set([...mySubjects, ...allSubjects])).map(sub => [sub, lessonsOf(sub)]))}
              onCancel={() => { setEditingQuestion(null); setIsCreatingNew(false); }}
              onSave={handleSaveFromEditor}
            />
          ) : isPastingText ? (
            /* PASTE TEXT MODAL VIEW */
            <div className="bg-slate-50 p-5 rounded-2xl border border-purple-200 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-purple-950 uppercase flex items-center gap-2">
                  <FileType className="w-4 h-4 text-purple-600" />
                  <span>DÁN VĂN BẢN ĐỀ THI VÀO MÔN: [{effectiveTargetSubject}]</span>
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                Dán nội dung câu hỏi từ Word, PDF hoặc website vào đây. Hệ thống tự động nhận diện câu hỏi và các phương án A, B, C, D:
              </p>
              <textarea
                rows={8}
                value={pastedContent}
                onChange={(e) => setPastedContent(e.target.value)}
                placeholder={`Ví dụ:\nCâu 1: Thủ đô nước ta là gì?\nA. Hà Nội\nB. Đà Nẵng\nC. Cần Thơ\nD. Huế\nĐáp án: A\n\nCâu 2: Kể 3 việc tốt em đã làm tuần này?\nĐáp án: Quét nhà, giúp bạn, học bài`}
                className="w-full text-xs bg-white border border-slate-300 rounded-xl p-3 font-mono text-slate-800 focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsPastingText(false); setPastedContent(''); }}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleImportPastedText}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Nhận Diện & Nhập Vào Môn [{effectiveTargetSubject}]</span>
                </button>
              </div>
            </div>
          ) : (
            /* QUESTIONS LIST */
            <div className="space-y-3">
              {filteredList.length === 0 ? (
                <div className="text-center py-12 px-4 text-slate-400 space-y-3 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                  <HelpCircle className="w-12 h-12 mx-auto text-indigo-400 opacity-60 animate-pulse" />
                  <div>
                    <p className="text-sm font-black text-slate-700">Chưa có câu hỏi nào phù hợp với bộ lọc hiện tại.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {selectedSubject !== 'all' && selectedType !== 'all' 
                        ? `Môn [${selectedSubject}] chưa có câu hỏi dạng [${selectedType}].`
                        : selectedSubject !== 'all'
                        ? `Môn [${selectedSubject}] chưa có câu hỏi.`
                        : `Chưa có câu hỏi dạng đã chọn.`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    {selectedSubject !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setSelectedSubject('all')}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        🔍 Xem dạng này trong tất cả các môn
                      </button>
                    )}
                    {selectedType !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setSelectedType('all')}
                        className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        🎯 Xem tất cả các dạng trong môn {selectedSubject !== 'all' ? selectedSubject : ''}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => withStorage(() => {
                        const sub = selectedSubject !== 'all' ? selectedSubject : effectiveTargetSubject;
                        setEditingQuestion(blankQuestion(selectedType !== 'all' ? (selectedType as QuestionType) : 'multiple_choice', sub, undefined, selectedLesson !== 'all' && selectedLesson !== '__none__' ? selectedLesson : undefined));
                        setIsCreatingNew(true);
                      })}
                      className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
                    >
                      + Thêm câu hỏi mới vào môn này
                    </button>
                    <button
                      type="button"
                      onClick={() => withStorage(() => setPickOpen(true))}
                      className="px-3.5 py-1.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-black transition-all cursor-pointer"
                    >
                      Nhặt câu hỏi có sẵn vào bộ này
                    </button>
                  </div>
                </div>
              ) : (
                filteredList.map((q, idx) => (
                  <div 
                    key={q.id}
                    className="p-4 bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 shadow-2xs space-y-2.5 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                        <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-black flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        
                        {isSampleQuestion(q) ? (
                          <span className="px-2 py-0.5 rounded-md text-xs font-black bg-slate-100 text-slate-700 border border-slate-300" title="Câu hỏi mẫu có sẵn của phần mềm">MẪU</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-300" title="Câu hỏi bạn tự soạn hoặc đã sửa">CỦA TÔI</span>
                        )}
                        {q.lesson && (
                          <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 max-w-[220px] truncate" title={`Bài: ${q.lesson}`}>Bài: {q.lesson}</span>
                        )}
                        {/* Type Badges */}
                        {q.type === 'multiple_choice' && (
                          <span className="px-2 py-0.5 rounded-md text-[12px] font-black uppercase bg-blue-50 text-blue-700 border border-blue-200">
                            Trắc nghiệm 1 đáp án ({q.options?.length || 4} phương án)
                          </span>
                        )}
                        {q.type === 'multi_select' && (
                          <span className="px-2 py-0.5 rounded-md text-[12px] font-black uppercase bg-purple-50 text-purple-700 border border-purple-200">
                            Nhiều đáp án đúng
                          </span>
                        )}
                        {q.type === 'true_false' && (
                          <span className="px-2 py-0.5 rounded-md text-[12px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200">
                            Đúng / Sai
                          </span>
                        )}
                        {q.type === 'fill_blank' && (
                          <span className="px-2 py-0.5 rounded-md text-[12px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Điền chỗ trống / Kéo thả
                          </span>
                        )}
                        {q.type === 'sequence_order' && (
                          <span className="px-2 py-0.5 rounded-md text-[12px] font-black uppercase bg-cyan-50 text-cyan-700 border border-cyan-200">
                            Sắp xếp thứ tự
                          </span>
                        )}
                        {q.type === 'matching' && (
                          <span className="px-2 py-0.5 rounded-md text-[12px] font-black uppercase bg-pink-50 text-pink-700 border border-pink-200">
                            Nối cột A - B
                          </span>
                        )}
                        {q.type === 'oral' && (
                          <span className="px-2 py-0.5 rounded-md text-[12px] font-black uppercase bg-slate-100 text-slate-700 border border-slate-200">
                            Trả lời bằng lời
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 text-[12px] font-black border border-indigo-200">
                          {q.subject || 'Tổng hợp'}
                        </span>
                        <span className="text-[12px] text-amber-700 font-bold flex items-center gap-0.5">
                          <Award className="w-3 h-3 text-amber-500" />
                          +{q.pointsReward || 2} xu
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setPlay({ list: filteredList, start: idx, title: selectedSubject === 'all' ? 'tất cả câu hỏi' : `môn ${selectedSubject}` })}
                          className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors"
                          title="Chơi thử câu này (vai trò học sinh)" aria-label="Chơi thử câu này"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setEditingQuestion(q); setIsCreatingNew(false); }}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                          title="Chỉnh sửa câu hỏi & hình ảnh"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                          title="Xóa câu hỏi này"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Question Text */}
                    <div className="text-xs md:text-sm font-black text-slate-900 leading-snug">
                      {q.questionText}
                    </div>

                    {/* Optional Question Image */}
                    {q.image && (
                      <div className="pt-1">
                        <img 
                          src={q.image} 
                          alt="Ảnh câu hỏi" 
                          className="max-h-36 rounded-xl border border-slate-200 object-contain bg-slate-50 shadow-2xs"
                        />
                      </div>
                    )}

                    {/* Multiple Choice & Multi Select Options Preview */}
                    {(q.type === 'multiple_choice' || q.type === 'multi_select') && q.options && q.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                        {q.options.map((opt, optIdx) => {
                          const isSingleCorrect = q.type === 'multiple_choice' && q.correctOptionIndex === optIdx;
                          const isMultiCorrect = q.type === 'multi_select' && (q.correctOptionIndices || []).includes(optIdx);
                          const isCorrect = isSingleCorrect || isMultiCorrect;
                          const optImage = q.optionImages?.[optIdx];

                          return (
                            <div 
                              key={optIdx}
                              className={`p-2.5 rounded-xl text-xs flex flex-col justify-between border ${
                                isCorrect 
                                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 font-bold' 
                                  : 'bg-slate-50 border-slate-200 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[12px] font-black shrink-0 ${
                                  isCorrect ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'
                                }`}>
                                  {String.fromCharCode(65 + optIdx)}
                                </span>
                                <span className="font-semibold truncate">{opt}</span>
                                {isCorrect && <Check className="w-3.5 h-3.5 text-emerald-600 ml-auto shrink-0" />}
                              </div>

                              {optImage && (
                                <div className="mt-2 pl-7">
                                  <img 
                                    src={optImage} 
                                    alt={`Ảnh đáp án ${String.fromCharCode(65 + optIdx)}`}
                                    className="max-h-20 rounded-lg border border-slate-200 object-contain bg-white p-0.5 shadow-2xs"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* True / False Preview */}
                    {q.type === 'true_false' && (
                      <div className="flex items-center gap-2 pt-1 text-xs font-bold">
                        <span className="text-slate-500">Đáp án chuẩn:</span>
                        <span className={`px-3 py-1 rounded-xl text-xs font-black ${
                          q.isTrue !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {q.isTrue !== false ? '✓ ĐÚNG (TRUE)' : '✕ SAI (FALSE)'}
                        </span>
                      </div>
                    )}

                    {/* Fill Blank Preview */}
                    {q.type === 'fill_blank' && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                        <span className="font-bold text-slate-500">Từ điền đúng:</span>
                        {(q.blankAnswers || []).map((w, i) => (
                          <span key={i} className="px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded-lg font-black border border-emerald-200">
                            [{w}]
                          </span>
                        ))}
                        {q.distractorWords && q.distractorWords.length > 0 && (
                          <>
                            <span className="font-bold text-slate-400 ml-2">Từ gây nhiễu:</span>
                            {q.distractorWords.map((w, i) => (
                              <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg text-[12px] font-semibold">
                                {w}
                              </span>
                            ))}
                          </>
                        )}
                      </div>
                    )}

                    {/* Sequence Order Preview */}
                    {q.type === 'sequence_order' && q.sequenceItems && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                        <span className="font-bold text-slate-500">Trình tự chuẩn:</span>
                        {q.sequenceItems.map((step, sIdx) => (
                          <span key={sIdx} className="px-2.5 py-1 bg-cyan-50 text-cyan-950 rounded-xl font-bold border border-cyan-200 flex items-center gap-1">
                            <span className="text-[12px] font-black text-cyan-700">#{sIdx + 1}</span>
                            <span>{step}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Matching Pairs Preview */}
                    {q.type === 'matching' && q.matchingPairs && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                        {q.matchingPairs.map((pair, pIdx) => (
                          <div key={pIdx} className="p-2 bg-pink-50/60 border border-pink-200 rounded-xl flex items-center justify-between font-bold">
                            <span className="text-amber-900">A{pIdx + 1}: {pair.left}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-pink-600" />
                            <span className="text-purple-900">B{pIdx + 1}: {pair.right}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Teacher Answer Key */}
                    {q.teacherAnswerKey && (
                      <div className="text-[12px] text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-start gap-1.5">
                        <strong className="text-slate-800 shrink-0">Đáp án GV:</strong>
                        <span className="italic">{q.teacherAnswerKey}</span>
                      </div>
                    )}

                    {/* Teacher Answer Image */}
                    {q.answerImage && (
                      <div className="pt-0.5 flex items-center gap-2">
                        <span className="text-[12px] font-bold text-amber-800 shrink-0">Ảnh đáp án GV:</span>
                        <img 
                          src={q.answerImage} 
                          alt="Ảnh đáp án giáo viên" 
                          className="max-h-24 rounded-lg border border-amber-200 object-contain bg-amber-50/40 p-0.5"
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

          </div>
        </div>

        {pickOpen && (
          <PickQuestionsModal bank={bank} targets={mySubjects}
            lessonsBySubject={Object.fromEntries(mySubjects.map(sub => [sub, lessonsOf(sub)]))}
            defaultTarget={selectedSubject !== 'all' && (source !== 'sample') ? selectedSubject : ''}
            defaultLesson={selectedSubject !== 'all' && source !== 'sample' && selectedLesson !== 'all' && selectedLesson !== '__none__' ? selectedLesson : ''}
            onClose={() => setPickOpen(false)} onConfirm={handlePickConfirm} />
        )}
        {play && <QuestionPlayer questions={play.list} startIndex={play.start} title={play.title} onClose={() => setPlay(null)} />}

        {/* Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-semibold">
            Đang hiển thị {filteredList.length} / {bank.length} câu hỏi · {source === 'mine' ? 'Câu hỏi của tôi' : source === 'sample' ? 'Câu hỏi mẫu' : 'Tất cả'}
            {selectedSubject !== 'all' && ` • Môn: ${selectedSubject}`}{selectedSubject !== 'all' && selectedLesson !== 'all' && ` • ${selectedLesson === '__none__' ? 'Chưa xếp bài' : `Bài: ${selectedLesson}`}`}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black uppercase cursor-pointer transition-all shadow-sm"
          >
            Đóng & Áp Dụng
          </button>
        </div>
      </div>
    </div>
  );
};
