import React, { useEffect } from 'react';
import { X, Coins, Sparkles, Trophy, Camera } from 'lucide-react';
import { Student } from '../../../types';
import { handleAvatarImgError } from '../../../utils/avatarConfig';

/**
 * 🎉 HỘP CHÚC MỪNG HỌC SINH ĐƯỢC GỌI — dùng chung cho mọi trò chơi gọi tên
 * (mẫu "Bắt trọn ống kính may mắn": khung polaroid, tên, STT • tổ • giới tính, nút thưởng xu, nút tiếp tục).
 * Kích thước gọn để vừa màn 1366×768 và máy chiếu; Esc để đóng.
 */
export interface CalledStudentReward {
  pts: number;
  label: string;
  reason: string;
}

export const DEFAULT_CALL_REWARDS: CalledStudentReward[] = [
  { pts: 2, label: '+2 Xu thưởng', reason: 'Được gọi tên' },
  { pts: 3, label: '+3 Xu khen thưởng', reason: 'Được gọi tên – khen thưởng' },
  { pts: 5, label: '+5 Xu ngôi sao', reason: 'Được gọi tên – ngôi sao' }
];

const REWARD_STYLES = [
  { cls: 'bg-gradient-to-r from-amber-700 to-orange-700 hover:from-amber-800 hover:to-orange-800', Icon: Coins },
  { cls: 'bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-800 hover:to-teal-800', Icon: Sparkles },
  { cls: 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700', Icon: Trophy }
];

interface CalledStudentModalProps {
  student: Student | null;
  open: boolean;
  /** Tiêu đề trên thanh màu, ví dụ "Bắt trọn ống kính may mắn!" */
  title: string;
  icon?: React.ReactNode;
  /** Nhãn góc ảnh, ví dụ "POLAROID 4K", "QUÁN QUÂN" */
  badge?: string;
  /** Lời chúc dưới khung ảnh (mặc định: chúc mừng em được gọi) */
  message?: React.ReactNode;
  /** Nội dung thêm (thời gian về đích, bục vinh danh, câu hỏi…) */
  extra?: React.ReactNode;
  /** Bỏ trống thì không hiện nút thưởng xu */
  onAward?: (pts: number, reason: string) => void;
  awarded?: boolean;
  rewards?: CalledStudentReward[];
  /** Nút hành động thêm (ví dụ "Bốc câu hỏi", "Đua vòng mới") */
  secondaryAction?: { label: string; onClick: () => void; icon?: React.ReactNode };
  continueLabel?: string;
  onClose: () => void;
  classNameLabel?: string;
}

export const CalledStudentModal: React.FC<CalledStudentModalProps> = ({
  student, open, title, icon, badge, message, extra,
  onAward, awarded = false, rewards = DEFAULT_CALL_REWARDS,
  secondaryAction, continueLabel = 'Tiếp tục gọi em khác', onClose, classNameLabel
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !student) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} ${student.name}`}
    >
      <div className="bg-white rounded-3xl shadow-2xl border-4 border-amber-400 w-full max-w-md max-h-[94vh] overflow-y-auto animate-in zoom-in-95 duration-200 relative">
        {/* Header */}
        <div className="px-5 py-3 bg-gradient-to-r from-amber-700 via-orange-700 to-rose-600 text-white flex items-center justify-between gap-3 sticky top-0 z-10">
          <div className="flex items-center gap-2 min-w-0">
            {icon || <Camera className="w-5 h-5 text-amber-200 shrink-0" />}
            <h3 className="text-sm font-black uppercase tracking-tight truncate">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 text-white flex items-center justify-center shrink-0"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 text-center space-y-3.5">
          {/* Polaroid */}
          <div className="mx-auto w-52 sm:w-56 p-3 pb-4 bg-white rounded-2xl shadow-xl border border-slate-200 ring-4 ring-amber-200 -rotate-2">
            <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-50 border-2 border-slate-200 relative">
              <img
                src={student.avatar}
                alt={student.name}
                className="w-full h-full object-cover object-center"
                referrerPolicy="no-referrer"
                onError={(e) => handleAvatarImgError(e, student.gender, student.name)}
              />
              {badge && (
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[12px] font-black uppercase shadow-xs">
                  {badge}
                </div>
              )}
            </div>
            <div className="mt-2.5">
              <h4 className="text-lg font-black text-slate-900 tracking-tight leading-tight">{student.name}</h4>
              <p className="text-xs font-bold text-slate-600">
                STT: #{student.stt} • {student.group || 'Tổ 1'} • {student.gender || 'Nam'}
                {classNameLabel ? ` • ${classNameLabel}` : ''}
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-700 font-medium max-w-sm mx-auto">
            {message || <>Xin chúc mừng <strong className="text-slate-900">{student.name}</strong> đã được gọi tên trong tiết học!</>}
          </p>

          {extra}

          {onAward && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {rewards.map((r, i) => {
                const st = REWARD_STYLES[i % REWARD_STYLES.length];
                return (
                  <button
                    key={r.pts + r.label}
                    type="button"
                    disabled={awarded}
                    onClick={() => onAward(r.pts, r.reason)}
                    className={`px-4 py-2 ${st.cls} text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 disabled:opacity-50 uppercase`}
                  >
                    <st.Icon className="w-3.5 h-3.5" />
                    <span>{r.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {onAward && awarded && (
            <p className="text-xs font-bold text-emerald-700">✓ Đã trao xu thưởng</p>
          )}

          <div className="pt-1 flex flex-col sm:flex-row gap-2">
            {secondaryAction && (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black shadow-md uppercase flex items-center justify-center gap-1.5"
              >
                {secondaryAction.icon}
                <span>{secondaryAction.label}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-xs font-black uppercase"
            >
              {continueLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalledStudentModal;
