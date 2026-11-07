import React, { useState, useEffect } from 'react';
import { X, Sparkles, Image, Camera, Check, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import { AvatarSourceType, getAvatarPoolSummary, refreshAvatarListFromServer } from '../../utils/avatarConfig';
import confetti from 'canvas-confetti';
import { playCoinSound } from '../../utils/audio';

interface AutoAssignAvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  classNameTitle: string;
  classId: string;
  totalStudents: number;
  studentsWithoutAvatarCount: number;
  defaultType?: AvatarSourceType;
  onConfirm: (type: AvatarSourceType, overwrite: boolean) => void;
}

export const AutoAssignAvatarModal: React.FC<AutoAssignAvatarModalProps> = ({
  isOpen,
  onClose,
  classNameTitle,
  classId,
  totalStudents,
  studentsWithoutAvatarCount,
  defaultType = 'default',
  onConfirm
}) => {
  const [selectedType, setSelectedType] = useState<AvatarSourceType>(defaultType);
  const [overwrite, setOverwrite] = useState(false);
  const [poolSummary, setPoolSummary] = useState(getAvatarPoolSummary());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync latest images when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedType(defaultType);
      handleRefreshPool();
    }
  }, [isOpen, defaultType]);

  const handleRefreshPool = async () => {
    setIsRefreshing(true);
    try {
      await refreshAvatarListFromServer();
      setPoolSummary(getAvatarPoolSummary());
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!isOpen) return null;

  const studentsWithAvatar = totalStudents - studentsWithoutAvatarCount;
  const isDefault = selectedType === 'default';

  const handleExecute = () => {
    onConfirm(selectedType, overwrite);
    playCoinSound();
    confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight uppercase">
                Tự Động Gán Ảnh Đại Diện Học Sinh
              </h3>
              <p className="text-xs text-purple-100 font-medium">
                Áp dụng cho: <strong className="text-amber-300">{classNameTitle || 'Lớp học'}</strong> ({totalStudents} học sinh)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors hover-zoom-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Status Overview Card */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl">
              <span className="text-[10px] font-black uppercase text-indigo-700 block">Chưa Có Avatar</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl font-black text-indigo-900">{studentsWithoutAvatarCount}</span>
                <span className="text-xs text-indigo-600 font-medium">/ {totalStudents} HS</span>
              </div>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <span className="text-[10px] font-black uppercase text-emerald-700 block">Đã Có Avatar</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl font-black text-emerald-900">{studentsWithAvatar}</span>
                <span className="text-xs text-emerald-600 font-medium">/ {totalStudents} HS</span>
              </div>
            </div>
          </div>

          {/* Section 1: Choose Avatar Source Type */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                1. Chọn kho ảnh đại diện muốn sử dụng:
              </label>
              <button
                type="button"
                onClick={handleRefreshPool}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                title="Quét lại thư mục public/avatars/ để nhận diện ảnh mới thả vào"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Đang quét...' : 'Quét thư mục'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option 1: Default Cartoon / Vector */}
              <button
                type="button"
                onClick={() => setSelectedType('default')}
                className={`p-3.5 rounded-2xl border-2 text-left transition-all hover-zoom-btn relative flex flex-col justify-between ${
                  isDefault 
                    ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-300 shadow-sm' 
                    : 'border-slate-200 hover:border-indigo-300 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">🎨</span>
                    <strong className="text-xs font-black uppercase text-slate-800">Avatar Mặc Định</strong>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    Ảnh hoạt hình / vector, tự động chia theo Nam & Nữ.
                  </p>
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-bold text-indigo-700">
                  <span>Kho: {poolSummary.default.total} ảnh</span>
                  <span>Nam: {poolSummary.default.boysCount} • Nữ: {poolSummary.default.girlsCount}</span>
                </div>
                {isDefault && (
                  <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs shadow-xs font-bold">
                    ✓
                  </span>
                )}
              </button>

              {/* Option 2: Real Demo Photos */}
              <button
                type="button"
                onClick={() => setSelectedType('real_demo')}
                className={`p-3.5 rounded-2xl border-2 text-left transition-all hover-zoom-btn relative flex flex-col justify-between ${
                  !isDefault 
                    ? 'border-purple-600 bg-purple-50/70 ring-2 ring-purple-300 shadow-sm' 
                    : 'border-slate-200 hover:border-purple-300 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">📸</span>
                    <strong className="text-xs font-black uppercase text-slate-800">Avatar Ảnh Thật</strong>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    Ảnh thẻ chân dung học sinh sắc nét, sống động như thật.
                  </p>
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-bold text-purple-700">
                  <span>Kho: {poolSummary.real_demo.total} ảnh</span>
                  <span>Nam: {poolSummary.real_demo.boysCount} • Nữ: {poolSummary.real_demo.girlsCount}</span>
                </div>
                {!isDefault && (
                  <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs shadow-xs font-bold">
                    ✓
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Section 2: Overwrite Setting */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
            <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
              2. Chế độ gán vào danh sách học sinh:
            </label>

            <div className="space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer select-none p-2 rounded-xl hover:bg-slate-100 transition-colors">
                <input
                  type="radio"
                  name="overwriteOption"
                  checked={!overwrite}
                  onChange={() => setOverwrite(false)}
                  className="mt-0.5 w-4 h-4 text-indigo-600 accent-indigo-600 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-black text-slate-800 block">
                    Chỉ gán cho học sinh CHƯA CÓ avatar (Khuyên dùng)
                  </span>
                  <span className="text-[11px] text-slate-500 block leading-relaxed font-medium">
                    Giữ nguyên toàn bộ ảnh đại diện mà thầy/cô đã tải lên hoặc chụp trước đó cho {studentsWithAvatar} học sinh.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer select-none p-2 rounded-xl hover:bg-slate-100 transition-colors">
                <input
                  type="radio"
                  name="overwriteOption"
                  checked={overwrite}
                  onChange={() => setOverwrite(true)}
                  className="mt-0.5 w-4 h-4 text-purple-600 accent-purple-600 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-black text-purple-900 block">
                    Gán lại toàn bộ lớp (Ghi đè tất cả {totalStudents} học sinh)
                  </span>
                  <span className="text-[11px] text-slate-500 block leading-relaxed font-medium">
                    Thay thế toàn bộ ảnh hiện tại bằng bộ ảnh mới theo giới tính Nam/Nữ đồng bộ.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Developer Folder Hint */}
          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl text-[11px] text-amber-950 flex items-start gap-2">
            <span className="text-base shrink-0">💡</span>
            <div className="leading-relaxed">
              <strong>Tự động nhận diện thời gian thực:</strong> Thầy/Cô chỉ cần chép thêm ảnh mới vào thư mục <code>public/avatars/{selectedType}/boys/</code> hoặc <code>girls/</code>. Nhấn nút <em>"Quét thư mục"</em> để hệ thống tự động cập nhật ngay mà không cần sửa code!
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors uppercase"
          >
            Hủy Bỏ
          </button>

          <button
            type="button"
            onClick={handleExecute}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-black text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 rounded-2xl transition-all shadow-md shadow-purple-600/30 hover-zoom-btn uppercase"
          >
            <Check className="w-4 h-4" />
            <span>XÁC NHẬN CHÈN AVATAR</span>
          </button>
        </div>
      </div>
    </div>
  );
};
