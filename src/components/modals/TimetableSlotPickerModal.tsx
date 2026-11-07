import React, { useState } from 'react';
import { X, Check, Trash2, BookOpen, Sparkles } from 'lucide-react';
import { Subject } from '../../types';

export const PRIMARY_SUBJECT_PRESETS = [
  { name: 'Toán', color: '#2563EB', icon: '📐', bg: 'bg-blue-50 text-blue-800 border-blue-200' },
  { name: 'Tiếng Việt', color: '#DC2626', icon: '📖', bg: 'bg-red-50 text-red-800 border-red-200' },
  { name: 'Tiếng Anh', color: '#7C3AED', icon: '🌍', bg: 'bg-purple-50 text-purple-800 border-purple-200' },
  { name: 'Đạo đức', color: '#059669', icon: '❤️', bg: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { name: 'Tự nhiên & Xã hội', color: '#16A34A', icon: '🌱', bg: 'bg-green-50 text-green-800 border-green-200' },
  { name: 'Khoa học', color: '#0284C7', icon: '🔬', bg: 'bg-sky-50 text-sky-800 border-sky-200' },
  { name: 'Lịch sử & Địa lí', color: '#D97706', icon: '🗺️', bg: 'bg-amber-50 text-amber-800 border-amber-200' },
  { name: 'Tin học', color: '#4F46E5', icon: '💻', bg: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  { name: 'Công nghệ', color: '#EA580C', icon: '⚙️', bg: 'bg-orange-50 text-orange-800 border-orange-200' },
  { name: 'GDTC (Thể dục)', color: '#0D9488', icon: '⚽', bg: 'bg-teal-50 text-teal-800 border-teal-200' },
  { name: 'Âm nhạc', color: '#DB2777', icon: '🎵', bg: 'bg-pink-50 text-pink-800 border-pink-200' },
  { name: 'Mĩ thuật', color: '#E11D48', icon: '🎨', bg: 'bg-rose-50 text-rose-800 border-rose-200' },
  { name: 'HĐTN (Trải nghiệm)', color: '#65A30D', icon: '🎒', bg: 'bg-lime-50 text-lime-800 border-lime-200' },
  { name: 'Chào cờ', color: '#CA8A04', icon: '🚩', bg: 'bg-yellow-50 text-yellow-900 border-yellow-200' },
  { name: 'Sinh hoạt lớp', color: '#6366F1', icon: '⭐', bg: 'bg-indigo-50 text-indigo-900 border-indigo-200' },
  { name: 'Đọc sách thư viện', color: '#0891B2', icon: '📚', bg: 'bg-cyan-50 text-cyan-800 border-cyan-200' },
  { name: 'Tự học có hướng dẫn', color: '#64748B', icon: '✏️', bg: 'bg-slate-100 text-slate-800 border-slate-300' }
];

interface TimetableSlotPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  dayLabel: string;
  session: 'morning' | 'afternoon';
  period: number;
  currentValue: string;
  onSelect: (subjectName: string) => void;
  customSubjects?: Subject[];
}

export const TimetableSlotPickerModal: React.FC<TimetableSlotPickerModalProps> = ({
  isOpen,
  onClose,
  dayLabel,
  session,
  period,
  currentValue,
  onSelect,
  customSubjects = []
}) => {
  const [customInput, setCustomInput] = useState(currentValue);

  if (!isOpen) return null;

  const handlePick = (subjectName: string) => {
    onSelect(subjectName);
    onClose();
  };

  const handleSaveCustom = (e: React.FormEvent) => {
    e.preventDefault();
    onSelect(customInput.trim());
    onClose();
  };

  const handleClear = () => {
    onSelect('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-indigo-100 overflow-hidden my-auto animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight">Chọn Môn Học Cho Tiết</h3>
              <p className="text-[11px] text-indigo-100 font-medium">
                {dayLabel} • {session === 'morning' ? 'Buổi Sáng' : 'Buổi Chiều'} • Tiết {period}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Custom Input */}
          <form onSubmit={handleSaveCustom} className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Nhập môn học tùy chỉnh hoặc chọn nhanh danh mục bên dưới:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Nhập tên môn học..."
                autoFocus
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all hover-zoom-btn"
              >
                Lưu
              </button>
            </div>
          </form>

          {/* Quick Preset Buttons */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
              Danh mục môn học Tiểu học thông dụng:
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRIMARY_SUBJECT_PRESETS.map((sub) => {
                const isSelected = currentValue === sub.name;
                return (
                  <button
                    key={sub.name}
                    type="button"
                    onClick={() => handlePick(sub.name)}
                    className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all flex items-center gap-2 hover-zoom-btn ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20 shadow-xs'
                        : `${sub.bg} hover:brightness-95`
                    }`}
                  >
                    <span className="text-base shrink-0">{sub.icon}</span>
                    <span className="truncate">{sub.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Additional class custom subjects if available */}
          {customSubjects.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                Môn học được thiết lập riêng của trường:
              </span>
              <div className="flex flex-wrap gap-2">
                {customSubjects.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => handlePick(sub.name)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sub.color || '#3B82F6' }} />
                    <span>{sub.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-1 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa môn (Tiết trống)</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};
