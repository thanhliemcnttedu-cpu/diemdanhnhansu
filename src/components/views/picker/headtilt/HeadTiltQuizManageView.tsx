import React, { useState, useEffect } from 'react';
import { HeadTiltQuizConfig, HEAD_TILT_STORAGE_KEY, DEFAULT_TRIAL_QUIZ } from './types';
import { 
  Play, Plus, Edit3, Trash2, Copy, Sparkles, 
  HelpCircle, BookOpen, Library, Award, ArrowLeft
} from 'lucide-react';
import { QuestionBankModal } from '../../../modals/QuestionBankModal';
import { useClassroom } from '../../../../context/ClassroomContext';

interface HeadTiltQuizManageViewProps {
  onPlayQuiz: (quiz: HeadTiltQuizConfig) => void;
  onCreateNewQuiz: () => void;
  onEditQuiz: (quiz: HeadTiltQuizConfig) => void;
  onBackToDashboard: () => void;
}

export const HeadTiltQuizManageView: React.FC<HeadTiltQuizManageViewProps> = ({
  onPlayQuiz,
  onCreateNewQuiz,
  onEditQuiz,
  onBackToDashboard
}) => {
  const { quizBank, updateQuizBank } = useClassroom();
  // Saved quizzes in localStorage
  const [quizzes, setQuizzes] = useState<HeadTiltQuizConfig[]>(() => {
    try {
      const saved = localStorage.getItem(HEAD_TILT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error reading head tilt quizzes', e);
    }
    return [DEFAULT_TRIAL_QUIZ];
  });

  const [activeTab, setActiveTab] = useState<'my_quizzes' | 'new' | 'bank'>('my_quizzes');
  const [isQuestionBankOpen, setIsQuestionBankOpen] = useState(false);

  // Sync to localStorage
  const saveQuizzes = (updated: HeadTiltQuizConfig[]) => {
    setQuizzes(updated);
    try {
      localStorage.setItem(HEAD_TILT_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Error saving head tilt quizzes', e);
    }
  };

  // Delete quiz
  const handleDeleteQuiz = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Bạn có chắc chắn muốn xóa bài quiz này?')) {
      const next = quizzes.filter(q => q.id !== id);
      saveQuizzes(next);
    }
  };

  // Duplicate quiz
  const handleDuplicateQuiz = (quiz: HeadTiltQuizConfig, e: React.MouseEvent) => {
    e.stopPropagation();
    const copy: HeadTiltQuizConfig = {
      ...quiz,
      id: `quiz-${Date.now()}`,
      title: `${quiz.title} (Bản sao)`,
      isTrial: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    saveQuizzes([...quizzes, copy]);
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      {/* Top Header & Navigation Tabs (Page 11) */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToDashboard}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              title="Quay lại danh sách game"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <span>Quiz Nghiêng Đầu</span>
                <span className="px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-black">
                  AI CAMERA
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-semibold">
                Quản lý các bài Quiz Nghiêng Đầu của bạn • Trả lời trắc nghiệm A/B bằng camera
              </p>
            </div>
          </div>
        </div>

        {/* Tab Buttons (Page 11) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCreateNewQuiz}
            className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tạo bài mới
          </button>
          
          <button
            type="button"
            onClick={() => setIsQuestionBankOpen(true)}
            className="px-4 py-2.5 rounded-2xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Library className="w-4 h-4" />
            Kho câu hỏi
          </button>
        </div>
      </div>

      {/* Main Quizzes List (Page 11) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-black uppercase text-slate-700 tracking-wider">
            Bài Học Của Tôi ({quizzes.length})
          </h2>
          <span className="text-xs text-slate-400 font-medium">
            Bấm nút &quot;Chơi&quot; để bắt đầu nhận diện camera
          </span>
        </div>

        {quizzes.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-slate-300">
            <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center mb-3">
              <BookOpen className="w-8 h-8" />
            </div>
            <h3 className="text-base font-black text-slate-800 mb-1">
              Chưa có bài Quiz nào
            </h3>
            <p className="text-xs text-slate-500 mb-6 max-w-sm mx-auto">
              Hãy bấm nút &quot;Tạo bài đầu tiên&quot; để thiết lập câu hỏi và trải nghiệm công nghệ nhận diện nghiêng đầu!
            </p>
            <button
              type="button"
              onClick={onCreateNewQuiz}
              className="py-3 px-6 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-wider shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition-all inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Tạo bài đầu tiên
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {quizzes.map(quiz => (
              <div
                key={quiz.id}
                className="bg-white rounded-3xl p-5 border border-slate-200/90 hover:border-indigo-300 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group"
              >
                <div>
                  {/* Badges & Actions */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {quiz.isTrial && (
                        <span className="px-2.5 py-0.5 rounded-lg bg-purple-100 text-purple-700 font-black text-[10px] uppercase">
                          Bản chạy thử
                        </span>
                      )}
                      <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-black text-[10px]">
                        {quiz.questions.length} câu hỏi
                      </span>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEditQuiz(quiz); }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                        title="Chỉnh sửa bài học"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDuplicateQuiz(quiz, e)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                        title="Nhân bản bài học"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteQuiz(quiz.id, e)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Xóa bài học"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-base font-black text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1 mb-1.5">
                    {quiz.title}
                  </h3>

                  {/* Description */}
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-4">
                    {quiz.description || 'Chơi thử để trải nghiệm tính năng trước khi tạo bài của bạn'}
                  </p>
                </div>

                {/* Play Button matching Page 11 */}
                <button
                  type="button"
                  onClick={() => onPlayQuiz(quiz)}
                  className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:to-purple-800 text-white font-black text-xs shadow-md shadow-indigo-600/20 hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  CHƠI
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Question Bank Modal */}
      {isQuestionBankOpen && (
        <QuestionBankModal
          isOpen={isQuestionBankOpen}
          onClose={() => setIsQuestionBankOpen(false)}
          questions={quizBank}
          onSaveQuestions={(updated) => updateQuizBank(updated)}
        />
      )}
    </div>
  );
};
