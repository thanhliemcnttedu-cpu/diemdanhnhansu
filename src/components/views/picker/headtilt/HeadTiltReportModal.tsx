import React, { useState } from 'react';
import { HeadTiltQuizResult } from './types';
import { Check, X, RotateCcw, FileText, ArrowLeft, Trophy, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

interface HeadTiltReportModalProps {
  result: HeadTiltQuizResult;
  onRestart: () => void;
  onExit: () => void;
}

export const HeadTiltReportModal: React.FC<HeadTiltReportModalProps> = ({
  result,
  onRestart,
  onExit
}) => {
  const [viewMode, setViewMode] = useState<'summary' | 'detail'>('summary');
  const percent = Math.round((result.correctCount / Math.max(1, result.totalQuestions)) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      {viewMode === 'summary' ? (
        /* MÀN HÌNH HOÀN THÀNH TỔNG KẾT (Page 16 trong PDF) */
        <div className="relative w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-slate-100 text-center animate-in zoom-in-95">
          {/* Confetti icon header */}
          <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-tr from-amber-400 to-rose-400 flex items-center justify-center shadow-lg shadow-amber-500/30 text-white">
            <Trophy className="w-10 h-10" />
          </div>

          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">
            Hoàn thành!
          </h2>

          <div className="my-5 p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="text-3xl font-black text-emerald-600 mb-1">
              Trả lời đúng: {result.correctCount}/{result.totalQuestions} câu
            </div>
            <div className="text-sm font-bold text-slate-500">
              Sai: {result.wrongCount} câu • Tỷ lệ chính xác: {percent}%
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onExit}
                className="py-3 px-4 rounded-2xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 transition-all cursor-pointer text-sm"
              >
                THOÁT
              </button>
              <button
                type="button"
                onClick={() => setViewMode('detail')}
                className="py-3 px-4 rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100 transition-all cursor-pointer flex items-center justify-center gap-1.5 text-sm"
              >
                <FileText className="w-4 h-4" />
                XEM BÁO CÁO
              </button>
            </div>

            <button
              type="button"
              onClick={onRestart}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-black shadow-lg shadow-indigo-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-5 h-5" />
              CHƠI LẠI
            </button>
          </div>
        </div>
      ) : (
        /* MÀN HÌNH BÁO CÁO CHI TIẾT TỪNG CÂU (Page 17 trong PDF) */
        <div className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95">
          {/* Header */}
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-purple-50 to-indigo-50">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">
                  Báo Cáo • {result.correctCount}/{result.totalQuestions} đúng
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {result.quizTitle}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setViewMode('summary')}
              className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              QUAY LẠI
            </button>
          </div>

          {/* List of Questions and Answers */}
          <div className="p-6 overflow-y-auto space-y-3.5 divide-y-0">
            {result.records.map((rec, index) => (
              <div
                key={rec.questionId || index}
                className={`p-4 rounded-2xl border transition-all ${
                  rec.isCorrect
                    ? 'bg-emerald-50/60 border-emerald-200/80'
                    : 'bg-rose-50/60 border-rose-200/80'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-7 h-7 rounded-xl shrink-0 flex items-center justify-center font-black text-xs text-white ${
                      rec.isCorrect ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  >
                    {rec.isCorrect ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  </div>

                  <div className="flex-1">
                    <div className="text-xs font-black uppercase text-slate-400 mb-0.5">
                      Câu {index + 1}
                    </div>
                    <div className="text-sm font-bold text-slate-900 mb-2">
                      {rec.questionText}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                      <span className="text-slate-500">Đã chọn:</span>
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold ${
                          rec.isCorrect
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {rec.selectedAnswer ? `${rec.selectedAnswer}: ${rec.selectedText}` : '(Chưa chọn)'}
                      </span>

                      {!rec.isCorrect && (
                        <>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-500">Đáp án đúng:</span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">
                            {rec.correctAnswer}: {rec.correctText}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <button
              type="button"
              onClick={onExit}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Thoát ra bài học
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Chơi lại
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
