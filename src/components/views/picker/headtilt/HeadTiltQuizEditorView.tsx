import React, { useState } from 'react';
import { HeadTiltQuizConfig, HeadTiltQuestion } from './types';
import { 
  ArrowLeft, Plus, Copy, Trash2, Save, Upload, 
  HelpCircle, Sparkles, Volume2, Music, Camera, 
  Shuffle, Sliders, CheckCircle2, FileSpreadsheet, Eye
} from 'lucide-react';
import { QuestionBankModal } from '../../../modals/QuestionBankModal';
import { QuestionItem } from '../../../../types';
import { useClassroom } from '../../../../context/ClassroomContext';

interface HeadTiltQuizEditorViewProps {
  initialConfig?: HeadTiltQuizConfig | null;
  onSave: (config: HeadTiltQuizConfig) => void;
  onCancel: () => void;
}

export const HeadTiltQuizEditorView: React.FC<HeadTiltQuizEditorViewProps> = ({
  initialConfig,
  onSave,
  onCancel
}) => {
  const { quizBank, updateQuizBank } = useClassroom();
  // Config state
  const [title, setTitle] = useState(initialConfig?.title || 'Bài Quiz Nghiêng Đầu Mới');
  const [description, setDescription] = useState(initialConfig?.description || '');
  const [shuffleQuestions, setShuffleQuestions] = useState(initialConfig?.shuffleQuestions ?? false);
  const [shuffleOptions, setShuffleOptions] = useState(initialConfig?.shuffleOptions ?? false);
  const [useCamera, setUseCamera] = useState(initialConfig?.useCamera ?? true);
  const [useAiVoice, setUseAiVoice] = useState(initialConfig?.useAiVoice ?? false);
  const [tiltSensitivity, setTiltSensitivity] = useState(initialConfig?.tiltSensitivity ?? 20);
  const [autoNextDelay, setAutoNextDelay] = useState(initialConfig?.autoNextDelay ?? 3);
  const [bgMusicPreset, setBgMusicPreset] = useState(initialConfig?.bgMusicPreset || 'default_fun');
  const [isQuestionBankOpen, setIsQuestionBankOpen] = useState(false);

  // Questions array
  const [questions, setQuestions] = useState<HeadTiltQuestion[]>(() => {
    if (initialConfig?.questions && initialConfig.questions.length > 0) {
      return JSON.parse(JSON.stringify(initialConfig.questions));
    }
    return [
      {
        id: `q-${Date.now()}-1`,
        question: 'Thủ đô của Việt Nam là thành phố nào?',
        optionA: 'Hà Nội',
        optionB: 'TP. Hồ Chí Minh',
        correctAnswer: 'A',
        explanation: 'Hà Nội là thủ đô của nước Cộng hòa Xã hội Chủ nghĩa Việt Nam.'
      }
    ];
  });

  // Add question
  const handleAddQuestion = () => {
    const newQ: HeadTiltQuestion = {
      id: `q-${Date.now()}-${questions.length + 1}`,
      question: '',
      optionA: '',
      optionB: '',
      correctAnswer: 'A'
    };
    setQuestions(prev => [...prev, newQ]);
  };

  // Duplicate question
  const handleDuplicateQuestion = (index: number) => {
    const target = questions[index];
    if (!target) return;
    const duplicated: HeadTiltQuestion = {
      ...target,
      id: `q-${Date.now()}-${questions.length + 1}`,
      question: `${target.question} (Bản sao)`
    };
    const nextList = [...questions];
    nextList.splice(index + 1, 0, duplicated);
    setQuestions(nextList);
  };

  // Remove question
  const handleRemoveQuestion = (index: number) => {
    if (questions.length <= 1) {
      alert('Bài học cần có ít nhất 1 câu hỏi!');
      return;
    }
    setQuestions(prev => prev.filter((_, i) => i !== index));
  };

  // Update specific question field
  const handleUpdateQuestion = (index: number, updates: Partial<HeadTiltQuestion>) => {
    setQuestions(prev => prev.map((q, i) => i === index ? { ...q, ...updates } : q));
  };

  // Add questions from QuestionBankModal
  const handleSelectFromBank = (selectedItems: QuestionItem[]) => {
    if (!selectedItems || selectedItems.length === 0) return;

    const convertedList: HeadTiltQuestion[] = selectedItems.map((item, idx) => {
      // Pick 2 options (correct and 1 distractor)
      let optA = 'Đáp án A';
      let optB = 'Đáp án B';
      let correct: 'A' | 'B' = 'A';

      if (item.options && item.options.length >= 2) {
        const correctIdx = item.correctOptionIndex ?? 0;
        const correctText = item.options[correctIdx] || item.options[0];
        const distractorIdx = correctIdx === 0 ? 1 : 0;
        const distractorText = item.options[distractorIdx] || item.options[1];

        // Randomize whether A or B is correct
        if (Math.random() > 0.5) {
          optA = correctText;
          optB = distractorText;
          correct = 'A';
        } else {
          optA = distractorText;
          optB = correctText;
          correct = 'B';
        }
      } else if (item.type === 'true_false') {
        optA = 'Đúng';
        optB = 'Sai';
        correct = item.isTrue ? 'A' : 'B';
      }

      return {
        id: `bank-q-${Date.now()}-${idx}`,
        question: item.questionText,
        image: item.image,
        optionA: optA,
        optionB: optB,
        correctAnswer: correct,
        explanation: item.teacherAnswerKey
      };
    });

    setQuestions(prev => [...prev, ...convertedList]);
    setIsQuestionBankOpen(false);
  };

  // Quick excel sample generator
  const handleImportSampleExcel = () => {
    const sampleQuestions: HeadTiltQuestion[] = [
      {
        id: `ex-${Date.now()}-1`,
        question: 'Mặt trời mọc ở hướng nào?',
        optionA: 'Hướng Đông',
        optionB: 'Hướng Tây',
        correctAnswer: 'A'
      },
      {
        id: `ex-${Date.now()}-2`,
        question: 'Loài chim nào không biết bay nhưng bơi rất giỏi?',
        optionA: 'Đà điểu',
        optionB: 'Chim cánh cụt',
        correctAnswer: 'B'
      },
      {
        id: `ex-${Date.now()}-3`,
        question: '7 x 8 bằng bao nhiêu?',
        optionA: '54',
        optionB: '56',
        correctAnswer: 'B'
      }
    ];
    setQuestions(prev => [...prev, ...sampleQuestions]);
    alert('Đã nhập thành công 3 câu hỏi mẫu!');
  };

  // Save Quiz
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('Vui lòng nhập Tên bài học!');
      return;
    }

    // Validate that questions have content
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) {
        alert(`Câu ${i + 1} chưa có nội dung câu hỏi!`);
        return;
      }
      if (!q.optionA.trim() || !q.optionB.trim()) {
        alert(`Câu ${i + 1} phải có đầy đủ Đáp án A và Đáp án B!`);
        return;
      }
    }

    const newQuizConfig: HeadTiltQuizConfig = {
      id: initialConfig?.id || `quiz-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      isTrial: false,
      shuffleQuestions,
      shuffleOptions,
      useCamera,
      useAiVoice,
      tiltSensitivity,
      autoNextDelay,
      bgMusicEnabled: true,
      bgMusicPreset,
      questions,
      createdAt: initialConfig?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSave(newQuizConfig);
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-white rounded-3xl p-5 border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">
              {initialConfig ? 'Chỉnh Sửa Bài Học' : 'Tạo Bài Học Mới'}
            </h1>
            <p className="text-xs text-slate-500 font-semibold">
              Quiz Nghiêng Đầu • Chỉ chấp nhận câu hỏi 2 đáp án (A và B)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
          >
            HỦY
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            LƯU BÀI HỌC
          </button>
        </div>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* =========================================================================
         * 1. CẤU HÌNH CHUNG & NÂNG CAO (Pages 2 & 3 trong PDF)
         * ========================================================================= */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
          <h2 className="text-sm font-black uppercase text-indigo-600 tracking-wider flex items-center gap-2">
            <Sliders className="w-4 h-4" />
            Cấu hình bài học
          </h2>

          {/* Tên bài học */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
              Tên bài học <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="VD: Quiz Nghiêng Đầu - Bản Chạy Thử hoặc Ôn tập Toán học..."
              className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 text-sm font-bold text-slate-900 transition-all outline-none"
            />
          </div>

          {/* Checkboxes Group */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={e => setShuffleQuestions(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-slate-800">Xáo trộn thứ tự câu hỏi</span>
                <p className="text-[11px] text-slate-500">Mỗi lần chơi, các câu hiện theo thứ tự ngẫu nhiên khác nhau.</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={shuffleOptions}
                onChange={e => setShuffleOptions(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-slate-800">Đảo đáp án khi vào chơi</span>
                <p className="text-[11px] text-slate-500">Hoán đổi vị trí A/B ngẫu nhiên mỗi câu — không ảnh hưởng đến đáp án đúng.</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={useCamera}
                onChange={e => setUseCamera(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-slate-800">Dùng camera (nghiêng đầu chọn đáp án)</span>
                <p className="text-[11px] text-slate-500">Bật: học sinh nghiêng đầu trước camera. Tắt: bấm tay vào đáp án, không cần camera.</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={useAiVoice}
                onChange={e => setUseAiVoice(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-slate-800">Giọng đọc AI (Text-to-Speech)</span>
                <p className="text-[11px] text-slate-500">Tự động đọc câu hỏi bằng AI nếu câu hỏi không có file audio đính kèm.</p>
              </div>
            </label>
          </div>

          {/* Sliders: Độ nhạy & Thời gian chuyển câu (Pages 2 & 3) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-slate-100">
            {/* Độ nhạy nghiêng đầu */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-700">Độ nhạy nghiêng đầu (số độ):</span>
                <span className="text-xs font-black text-indigo-600 font-mono">{tiltSensitivity}°</span>
              </div>
              <input
                type="range"
                min="10"
                max="35"
                step="1"
                value={tiltSensitivity}
                onChange={e => setTiltSensitivity(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Góc nghiêng để hệ thống nhận diện việc chọn đáp án. Giá trị càng nhỏ càng nhạy (mặc định 20°).
              </p>
            </div>

            {/* Thời gian tự động chuyển câu */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-700">Thời gian tự động chuyển câu:</span>
                <span className="text-xs font-black text-indigo-600 font-mono">{autoNextDelay} giây</span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={autoNextDelay}
                onChange={e => setAutoNextDelay(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Sau khi trả lời, hệ thống tự động chuyển sang câu tiếp theo sau thời gian này (mặc định 3 giây).
              </p>
            </div>
          </div>
        </div>

        {/* =========================================================================
         * 2. VÙNG NHẬP CÂU HỎI (Pages 3, 4, 9, 10 trong PDF)
         * ========================================================================= */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-black uppercase text-slate-800">
                Câu hỏi ({questions.length})
              </h2>
              <p className="text-xs text-slate-500">
                Mỗi câu hỏi cần có đáp án A (nghiêng trái) và đáp án B (nghiêng phải), chọn đáp án đúng.
              </p>
            </div>

            {/* 4 Action Buttons matching Page 3 */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsQuestionBankOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Chọn từ Kho hoặc AI
              </button>

              <button
                type="button"
                onClick={handleImportSampleExcel}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Nhập từ Excel
              </button>

              <button
                type="button"
                onClick={handleAddQuestion}
                className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Nhập thủ công
              </button>
            </div>
          </div>

          {/* List of Questions */}
          <div className="space-y-6">
            {questions.map((q, index) => (
              <div 
                key={q.id || index}
                className="p-5 rounded-2xl border border-slate-200 bg-slate-50/40 relative space-y-4"
              >
                {/* Header row for question */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="text-sm font-black text-slate-800">
                      Câu {index + 1}: {q.question ? (q.question.length > 40 ? `${q.question.substring(0, 40)}...` : q.question) : 'Đang soạn thảo...'}
                    </span>
                  </div>

                  {/* Actions: Duplicate, Delete */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDuplicateQuestion(index)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                      title="Nhân bản câu này"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(index)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Xóa câu này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Question input */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Nội dung câu hỏi:
                  </label>
                  <textarea
                    rows={2}
                    value={q.question}
                    onChange={e => handleUpdateQuestion(index, { question: e.target.value })}
                    placeholder="Nhập câu hỏi tại đây (VD: Thủ đô của Nhật Bản là thành phố nào?)..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm font-semibold text-slate-900 transition-all outline-none resize-none"
                  />
                </div>

                {/* Answers A & B (Tick radio to choose correct) */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">
                    Đáp án (tick chọn đáp án đúng):
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Option A (Left) */}
                    <div className={`p-4 rounded-2xl border transition-all ${
                      q.correctAnswer === 'A'
                        ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-200'
                        : 'border-slate-200 bg-white'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-sky-500 text-white font-black text-xs flex items-center justify-center">
                            A
                          </span>
                          <span className="text-xs font-black text-slate-700">
                            Nghiêng trái (👈)
                          </span>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold">
                          <input
                            type="radio"
                            name={`correct-${q.id}`}
                            checked={q.correctAnswer === 'A'}
                            onChange={() => handleUpdateQuestion(index, { correctAnswer: 'A' })}
                            className="text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span className={q.correctAnswer === 'A' ? 'text-emerald-700 font-black' : 'text-slate-500'}>
                            Đáp án đúng
                          </span>
                        </label>
                      </div>
                      <input
                        type="text"
                        value={q.optionA}
                        onChange={e => handleUpdateQuestion(index, { optionA: e.target.value })}
                        placeholder="Nội dung đáp án A..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-900 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none"
                      />
                    </div>

                    {/* Option B (Right) */}
                    <div className={`p-4 rounded-2xl border transition-all ${
                      q.correctAnswer === 'B'
                        ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-200'
                        : 'border-slate-200 bg-white'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-orange-500 text-white font-black text-xs flex items-center justify-center">
                            B
                          </span>
                          <span className="text-xs font-black text-slate-700">
                            Nghiêng phải (👉)
                          </span>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold">
                          <input
                            type="radio"
                            name={`correct-${q.id}`}
                            checked={q.correctAnswer === 'B'}
                            onChange={() => handleUpdateQuestion(index, { correctAnswer: 'B' })}
                            className="text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span className={q.correctAnswer === 'B' ? 'text-emerald-700 font-black' : 'text-slate-500'}>
                            Đáp án đúng
                          </span>
                        </label>
                      </div>
                      <input
                        type="text"
                        value={q.optionB}
                        onChange={e => handleUpdateQuestion(index, { optionB: e.target.value })}
                        placeholder="Nội dung đáp án B..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none"
                      />
                    </div>

                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add Question Button */}
          <div className="flex items-center justify-center pt-2">
            <button
              type="button"
              onClick={handleAddQuestion}
              className="py-3 px-6 rounded-2xl border-2 border-dashed border-indigo-300 hover:border-indigo-500 text-indigo-600 font-black text-xs uppercase tracking-wider hover:bg-indigo-50/50 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              + THÊM CÂU HỎI MỚI
            </button>
          </div>
        </div>

        {/* Bottom Save Bar */}
        <div className="flex items-center justify-between bg-white rounded-3xl p-5 border border-slate-200 shadow-sm">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-100 transition-colors cursor-pointer"
          >
            HỦY
          </button>

          <button
            type="submit"
            className="px-8 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-sm shadow-lg shadow-indigo-600/25 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-5 h-5" />
            LƯU BÀI HỌC ({questions.length} CÂU)
          </button>
        </div>

      </form>

      {/* Question Bank Modal */}
      {isQuestionBankOpen && (
        <QuestionBankModal
          isOpen={isQuestionBankOpen}
          onClose={() => setIsQuestionBankOpen(false)}
          questions={quizBank}
          onSaveQuestions={(updated) => {
            updateQuizBank(updated);
            handleSelectFromBank(updated);
          }}
        />
      )}
    </div>
  );
};
