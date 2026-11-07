import React, { useState } from 'react';
import { 
  X, Save, RotateCcw, Clock, Settings, School, 
  Calendar, User, Sparkles, Check
} from 'lucide-react';
import confetti from 'canvas-confetti';

export interface TimetableDisplaySettings {
  title: string;
  schoolName: string;
  className: string;
  academicYear: string;
  semester: string;
  appliedDate: string;
  teacherName: string;
  slogan: string;
  showTimeSlots: boolean;
  showTeacherInfo: boolean;
  showSlogan: boolean;
  morningTimes: string[]; // e.g. ["07:15 - 07:55", "08:00 - 08:40", "09:00 - 09:40", "09:45 - 10:25", "10:30 - 11:10"]
  afternoonTimes: string[]; // e.g. ["13:45 - 14:25", "14:30 - 15:10", "15:25 - 16:05", "16:10 - 16:50"]
}

interface TimetableConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TimetableDisplaySettings;
  onSave: (newSettings: TimetableDisplaySettings, config: { morningPeriods: number; afternoonPeriods: number; hasSaturday: boolean }) => void;
  morningPeriods: number;
  afternoonPeriods: number;
  hasSaturday: boolean;
}

export const TimetableConfigModal: React.FC<TimetableConfigModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  morningPeriods: initialMorningPeriods,
  afternoonPeriods: initialAfternoonPeriods,
  hasSaturday: initialHasSaturday
}) => {
  const [localSettings, setLocalSettings] = useState<TimetableDisplaySettings>({ ...settings });
  const [morningPeriods, setMorningPeriods] = useState<number>(initialMorningPeriods);
  const [afternoonPeriods, setAfternoonPeriods] = useState<number>(initialAfternoonPeriods);
  const [hasSaturday, setHasSaturday] = useState<boolean>(initialHasSaturday);

  if (!isOpen) return null;

  const handleMorningTimeChange = (index: number, val: string) => {
    const updated = [...localSettings.morningTimes];
    updated[index] = val;
    setLocalSettings({ ...localSettings, morningTimes: updated });
  };

  const handleAfternoonTimeChange = (index: number, val: string) => {
    const updated = [...localSettings.afternoonTimes];
    updated[index] = val;
    setLocalSettings({ ...localSettings, afternoonTimes: updated });
  };

  const handleResetDefaults = () => {
    setLocalSettings({
      ...localSettings,
      morningTimes: [
        '07:15 - 07:55',
        '08:00 - 08:40',
        '09:00 - 09:40',
        '09:45 - 10:25',
        '10:30 - 11:10'
      ],
      afternoonTimes: [
        '13:45 - 14:25',
        '14:30 - 15:10',
        '15:25 - 16:05',
        '16:10 - 16:50'
      ],
      showTimeSlots: true,
      showTeacherInfo: true,
      showSlogan: true
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(localSettings, { morningPeriods, afternoonPeriods, hasSaturday });
    confetti({ particleCount: 30, spread: 60 });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-indigo-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shadow-inner">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Cấu Hình Thời Khóa Biểu</h2>
              <p className="text-xs text-indigo-100 font-medium">
                Thiết lập thông tin hiển thị, số tiết học và khung giờ chi tiết
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors hover-zoom-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-6 max-h-[78vh] overflow-y-auto">
          {/* Section 1: Thông tin hành chính bảng biểu */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wider flex items-center gap-2">
              <School className="w-4 h-4 text-indigo-600" />
              <span>1. Thông tin tiêu đề & Lớp học</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Tiêu đề bảng TKB:</label>
                <input
                  type="text"
                  value={localSettings.title}
                  onChange={(e) => setLocalSettings({ ...localSettings, title: e.target.value })}
                  placeholder="THỜI KHÓA BIỂU"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Tên trường:</label>
                <input
                  type="text"
                  value={localSettings.schoolName}
                  onChange={(e) => setLocalSettings({ ...localSettings, schoolName: e.target.value })}
                  placeholder="Trường Tiểu học..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Tên lớp:</label>
                <input
                  type="text"
                  value={localSettings.className}
                  onChange={(e) => setLocalSettings({ ...localSettings, className: e.target.value })}
                  placeholder="Lớp 4A1"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Năm học:</label>
                <input
                  type="text"
                  value={localSettings.academicYear}
                  onChange={(e) => setLocalSettings({ ...localSettings, academicYear: e.target.value })}
                  placeholder="2026 - 2027"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Học kỳ:</label>
                <select
                  value={localSettings.semester}
                  onChange={(e) => setLocalSettings({ ...localSettings, semester: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Học kỳ I">Học kỳ I</option>
                  <option value="Học kỳ II">Học kỳ II</option>
                  <option value="Cả năm">Cả năm</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Áp dụng từ ngày:</label>
                <input
                  type="text"
                  value={localSettings.appliedDate}
                  onChange={(e) => setLocalSettings({ ...localSettings, appliedDate: e.target.value })}
                  placeholder="05/09/2026"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-700 font-bold mb-1">Giáo viên chủ nhiệm (GVCN):</label>
                <input
                  type="text"
                  value={localSettings.teacherName}
                  onChange={(e) => setLocalSettings({ ...localSettings, teacherName: e.target.value })}
                  placeholder="Ví dụ: Thầy/Cô Nguyễn Văn A"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-slate-700 font-bold mb-1">Khẩu hiệu / Lời nhắc nhở học trò:</label>
                <input
                  type="text"
                  value={localSettings.slogan}
                  onChange={(e) => setLocalSettings({ ...localSettings, slogan: e.target.value })}
                  placeholder="Mỗi ngày đến trường là một ngày vui • Chăm ngoan - Học giỏi"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Cấu hình buổi & số tiết */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>2. Cấu hình số tiết & Ngày học</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
              <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-200/80">
                <label className="block text-amber-900 font-bold mb-1">Số tiết Buổi Sáng:</label>
                <select
                  value={morningPeriods}
                  onChange={(e) => setMorningPeriods(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl font-black text-amber-900 focus:outline-none"
                >
                  <option value={3}>3 tiết sáng</option>
                  <option value={4}>4 tiết sáng</option>
                  <option value={5}>5 tiết sáng (Chuẩn)</option>
                </select>
              </div>

              <div className="p-3 bg-blue-50/60 rounded-2xl border border-blue-200/80">
                <label className="block text-blue-900 font-bold mb-1">Số tiết Buổi Chiều:</label>
                <select
                  value={afternoonPeriods}
                  onChange={(e) => setAfternoonPeriods(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl font-black text-blue-900 focus:outline-none"
                >
                  <option value={0}>Không dạy chiều (Nghỉ)</option>
                  <option value={2}>2 tiết chiều</option>
                  <option value={3}>3 tiết chiều</option>
                  <option value={4}>4 tiết chiều (Chuẩn)</option>
                </select>
              </div>

              <div className="p-3 bg-indigo-50/60 rounded-2xl border border-indigo-200/80 flex items-center justify-between">
                <div>
                  <label className="block text-indigo-900 font-bold">Học Thứ Bảy:</label>
                  <span className="text-[11px] text-slate-500">Bật nếu có lịch dạy cuối tuần</span>
                </div>
                <input
                  type="checkbox"
                  checked={hasSaturday}
                  onChange={(e) => setHasSaturday(e.target.checked)}
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Checkbox toggles */}
            <div className="flex flex-wrap items-center gap-6 pt-1 text-xs font-semibold text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.showTimeSlots}
                  onChange={(e) => setLocalSettings({ ...localSettings, showTimeSlots: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Hiển thị khung giờ từng tiết (VD: 07:15 - 07:55)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.showTeacherInfo}
                  onChange={(e) => setLocalSettings({ ...localSettings, showTeacherInfo: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Hiển thị thông tin GVCN & Năm học</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.showSlogan}
                  onChange={(e) => setLocalSettings({ ...localSettings, showSlogan: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Hiển thị khẩu hiệu nhắc nhở</span>
              </label>
            </div>
          </div>

          {/* Section 3: Cấu hình khung giờ từng tiết học */}
          {localSettings.showTimeSlots && (
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  <span>3. Khung giờ học từng tiết (Giờ vào - Giờ ra)</span>
                </h3>
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 hover-zoom-btn"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Khung giờ chuẩn</span>
                </button>
              </div>

              {/* Morning times */}
              <div className="space-y-2">
                <span className="text-[11px] font-black text-amber-700 uppercase tracking-wider block">
                  BUỔI SÁNG (Tiết 1 đến Tiết {morningPeriods}):
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  {Array.from({ length: morningPeriods }).map((_, idx) => (
                    <div key={`m-time-${idx}`} className="bg-amber-50/40 p-2 rounded-xl border border-amber-200/60">
                      <span className="text-[10px] font-bold text-amber-800 block mb-1">Tiết {idx + 1}:</span>
                      <input
                        type="text"
                        value={localSettings.morningTimes[idx] || ''}
                        onChange={(e) => handleMorningTimeChange(idx, e.target.value)}
                        placeholder="07:15 - 07:55"
                        className="w-full px-2 py-1 bg-white border border-amber-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Afternoon times */}
              {afternoonPeriods > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-[11px] font-black text-blue-700 uppercase tracking-wider block">
                    BUỔI CHIỀU (Tiết 1 đến Tiết {afternoonPeriods}):
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {Array.from({ length: afternoonPeriods }).map((_, idx) => (
                      <div key={`a-time-${idx}`} className="bg-blue-50/40 p-2 rounded-xl border border-blue-200/60">
                        <span className="text-[10px] font-bold text-blue-800 block mb-1">Tiết {idx + 1}:</span>
                        <input
                          type="text"
                          value={localSettings.afternoonTimes[idx] || ''}
                          onChange={(e) => handleAfternoonTimeChange(idx, e.target.value)}
                          placeholder="13:45 - 14:25"
                          className="w-full px-2 py-1 bg-white border border-blue-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Mặc định ban đầu
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Đóng
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-600/25 flex items-center gap-1.5 transition-all hover-zoom-btn"
              >
                <Save className="w-4 h-4" />
                <span>Lưu Cấu Hình</span>
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
};
