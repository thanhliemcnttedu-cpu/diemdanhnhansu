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
    const matchType = selectedType === 'all' || q.type === selectedType;
    return matchSearch && matchSubject && matchType;
  });

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

      if (newQuestions.length > 0) {
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
    const parsed = parseQuestionsFromRawText(pastedContent, targetSubject);
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
    if (window.confirm(`Bạn có chắc muốn xóa tất cả câu hỏi của môn [${selectedSubject}]?`)) {
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
    setBank(updatedList);
    onSaveQuestions(updatedList, savedSub);
    saveQuizBank(updatedList);
    if (addAnother) {
      setEditingQuestion(blankQuestion(saved.type, savedSub, saved.pointsReward));
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

  const blankQuestion = (type: QuestionItem['type'], subject: string, points?: number): QuestionItem => ({
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
    const newQ: QuestionItem = blankQuestion('multiple_choice', defaultSub);
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

  return (
    <div className={`fixed inset-0 z-50 bg-sky-900/20 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 select-none overflow-y-auto ${
      isFullscreen ? 'p-0' : ''
    }`}>
      <div className={`bg-white rounded-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col transition-all duration-200 animate-in fade-in ${
        isFullscreen ? 'h-full max-h-full rounded-none max-w-full' : 'max-w-5xl max-h-[92vh]'
      }`}>
        
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-700 text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center font-black shrink-0">
              <BookOpen className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base md:text-lg font-black uppercase tracking-wide">
                  QUẢN LÝ BỘ CÂU HỎI & KHO ĐỀ THEO MÔN HỌC
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[12px] font-black uppercase">
                  {bank.length} Câu hỏi
                </span>
              </div>
              <p className="text-xs text-white font-medium hidden sm:block">
                Hỗ trợ 7 dạng câu hỏi phong phú • Tùy biến số lượng đáp án • Chèn ảnh riêng cho từng phương án
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Toggle Fullscreen button */}
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-white/90 hover:text-white hover:bg-white/20 rounded-xl cursor-pointer transition-colors"
              title={isFullscreen ? 'Thu nhỏ giao diện' : 'Phóng to toàn màn hình'}
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-white/90 hover:text-white hover:bg-white/20 rounded-xl cursor-pointer transition-colors"
              title="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {toastMessage && (
          <div className="bg-emerald-700 text-white text-xs font-bold px-4 py-2 text-center animate-in fade-in duration-150">
            {toastMessage}
          </div>
        )}

        {/* 1. MỤC ĐƯA LÊN BỘ ĐỀ THEO MÔN */}
        <div className="px-4 py-2.5 bg-amber-50/70 border-b border-amber-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-amber-100/80 px-2.5 py-1 rounded-xl text-amber-950 font-black uppercase text-[12px]">
              <Layers className="w-3.5 h-3.5 text-amber-700" />
              <span>BỘ ĐỀ THEO MÔN:</span>
            </div>

            <select
              value={isCustomSubject ? '__custom__' : uploadSubject}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setIsCustomSubject(true);
                } else {
                  setIsCustomSubject(false);
                  setUploadSubject(e.target.value);
                }
              }}
              className="px-2.5 py-1.5 bg-white border border-amber-300 rounded-xl font-bold text-slate-800 cursor-pointer text-xs focus:outline-none focus:border-amber-500 shadow-2xs"
            >
              {PRESET_SUBJECTS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
              {allSubjects.filter(s => !PRESET_SUBJECTS.includes(s) && s !== 'Tổng hợp').map(s => (
                <option key={s} value={s}>📂 {s}</option>
              ))}
              <option value="__custom__">➕ Tự nhập môn học khác...</option>
            </select>

            {isCustomSubject && (
              <input
                type="text"
                value={customSubjectName}
                onChange={(e) => setCustomSubjectName(e.target.value)}
                placeholder="Nhập tên môn mới..."
                className="px-2.5 py-1.5 bg-white border border-amber-400 rounded-xl text-xs font-bold text-slate-800 w-48 shadow-2xs focus:outline-none"
                autoFocus
              />
            )}

            <span className="text-[12px] text-amber-900 font-semibold hidden md:inline">
              👉 Tải file Word/PDF/Ảnh sẽ tự gắn vào môn <strong className="text-indigo-700 underline font-black">{effectiveTargetSubject}</strong>
            </span>
          </div>

          <div className="text-[12px] text-slate-500 font-bold ml-auto flex items-center gap-1">
            <Tag className="w-3 h-3 text-indigo-500" />
            <span>Môn đang chọn: </span>
            <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-black">
              {effectiveTargetSubject}
            </span>
          </div>
        </div>

        {/* 2. Action Toolbar: Upload Buttons, Paste & Search */}
        <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          {/* Left Actions: Upload files & add manually */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".docx,.doc,.pdf,image/*"
              className="hidden"
            />
            <input
              type="file"
              ref={questionImageInputRef}
              onChange={(e) => handleImageFileChange(e, 'image')}
              accept="image/*"
              className="hidden"
            />
            <input
              type="file"
              ref={answerImageInputRef}
              onChange={(e) => handleImageFileChange(e, 'answerImage')}
              accept="image/*"
              className="hidden"
            />
            <input
              type="file"
              ref={optionImageInputRef}
              onChange={handleOptionImageFileChange}
              accept="image/*"
              className="hidden"
            />

            {/* Upload Button */}
            <button
              onClick={() => withStorage(() => fileInputRef.current?.click())}
              disabled={isLoadingFile}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all hover-zoom-btn uppercase cursor-pointer"
              title={`Tải file Word (.docx), PDF hoặc Hình ảnh bài tập vào môn [${effectiveTargetSubject}]`}
            >
              <Upload className="w-4 h-4" />
              <span>{isLoadingFile ? 'Đang đọc file...' : `Tải Bộ Đề Môn ${effectiveTargetSubject}`}</span>
            </button>

            {/* Paste Text Button */}
            <button
              onClick={() => withStorage(() => setIsPastingText(true))}
              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all hover-zoom-btn uppercase cursor-pointer"
              title="Dán văn bản câu hỏi trực tiếp"
            >
              <FileType className="w-4 h-4" />
              <span>Dán Văn Bản</span>
            </button>

            {/* Add Manually */}
            <button
              onClick={() => withStorage(handleStartCreateNew)}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all hover-zoom-btn uppercase cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Câu Mới</span>
            </button>

            {/* Restore Default */}
            <button
              onClick={handleResetDefaults}
              className="px-3 py-2 bg-white hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Nạp lại bộ câu hỏi mẫu chuẩn"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Khôi Phục Mẫu</span>
            </button>

            {/* Nơi lưu câu hỏi cá nhân: đổi thư mục, kết nối Drive cá nhân, xuất / nhập tệp, đọc lại từ thư mục */}
            <QuizStorageButton compact />
          </div>

          {/* Right Search & Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm câu hỏi..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 w-32 sm:w-44"
              />
            </div>

            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold text-slate-700 cursor-pointer shadow-2xs"
            >
              <option value="all">🎯 Tất cả dạng câu</option>
              <option value="multiple_choice">📝 Trắc nghiệm 1 đáp án</option>
              <option value="multi_select">☑️ Trắc nghiệm nhiều đáp án</option>
              <option value="true_false">⚖️ Đúng / Sai</option>
              <option value="fill_blank">🧩 Điền vào chỗ trống</option>
              <option value="sequence_order">🔢 Sắp xếp thứ tự các bước</option>
              <option value="matching">🔗 Nối cột A với cột B</option>
              <option value="oral">🗣️ Trả lời bằng lời / Tự luận</option>
            </select>
          </div>
        </div>

        {/* 3. Subject Filter Navigation Pills */}
        <div className="px-4 py-2 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center gap-1.5 overflow-x-auto">
          <span className="text-[12px] font-black uppercase text-slate-600 mr-1 shrink-0">LỌC MÔN HỌC:</span>
          <button
            onClick={() => setSelectedSubject('all')}
            className={`px-2.5 py-1 rounded-lg text-[12px] font-black transition-all shrink-0 cursor-pointer ${
              selectedSubject === 'all'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-200'
            }`}
          >
            Tất cả ({bank.length})
          </button>
          {allSubjects.map(sub => {
            const count = bank.filter(q => (q.subject || 'Tổng hợp') === sub).length;
            const isCurrent = selectedSubject === sub;
            return (
              <button
                key={sub}
                onClick={() => setSelectedSubject(sub)}
                className={`px-2.5 py-1 rounded-lg text-[12px] font-black transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                  isCurrent
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-200'
                }`}
              >
                <span>{sub}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[12px] font-bold ${
                  isCurrent ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}

          {selectedSubject !== 'all' && (
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleExportSubjectJson}
                className="px-2 py-1 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 rounded-lg text-[12px] font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                title={`Tải xuống file đề môn ${selectedSubject}`}
              >
                <span>📥 Xuất file môn</span>
              </button>
              <button
                type="button"
                onClick={handleClearSubjectQuestions}
                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[12px] font-bold flex items-center gap-1 cursor-pointer"
                title={`Xóa tất cả câu hỏi của môn ${selectedSubject}`}
              >
                <Trash2 className="w-3 h-3" />
                <span>Xóa bộ đề môn này</span>
              </button>
            </div>
          )}
        </div>

        {/* 4. Content Body: Question List or Editor Modal */}
        <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-4">
          {editingQuestion ? (
            /* TRÌNH SOẠN CÂU HỎI (mở lớn, có xem trước) */
            <QuestionEditor
              question={editingQuestion}
              isNew={isCreatingNew}
              subjects={Array.from(new Set([...PRESET_SUBJECTS, ...allSubjects]))}
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
                      onClick={() => {
                        handleStartCreateNew();
                        if (selectedType !== 'all') {
                          handleTypeChange(selectedType as QuestionType);
                        }
                      }}
                      className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
                    >
                      + Thêm câu hỏi mới vào môn này
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-black flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        
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

        {/* Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-semibold">
            Đang hiển thị {filteredList.length} / {bank.length} câu hỏi
            {selectedSubject !== 'all' && ` • Môn: ${selectedSubject}`}
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
