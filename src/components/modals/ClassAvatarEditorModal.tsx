import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, ZoomIn, ZoomOut, Check, Move, RotateCw, RotateCcw, Sparkles, Loader2 } from 'lucide-react';
import { compressImage } from '../../utils/imageCompressor';

export const CLASS_AVATARS_PRESET = [
  { id: 'ca-1', label: 'Tên Lửa', icon: '🚀', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=RocketClass&backgroundColor=6366f1' },
  { id: 'ca-2', label: 'Cúp Vàng', icon: '🏆', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=ChampionCup&backgroundColor=f59e0b' },
  { id: 'ca-3', label: 'Sách Vở', icon: '📚', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=BookClass&backgroundColor=3b82f6' },
  { id: 'ca-4', label: 'Ngôi Sao', icon: '⭐', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=StarClass&backgroundColor=ec4899' },
  { id: 'ca-5', label: 'Khoa Học', icon: '🔬', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=ScienceClass&backgroundColor=06b6d4' },
  { id: 'ca-6', label: 'Mầm Xanh', icon: '🌱', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=PlantClass&backgroundColor=10b981' },
  { id: 'ca-7', label: 'Trái Đất', icon: '🌍', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=EarthClass&backgroundColor=8b5cf6' },
  { id: 'ca-8', label: 'Họa Sĩ', icon: '🎨', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=ArtClass&backgroundColor=ef4444' }
];

interface ClassAvatarEditorModalProps {
  isOpen: boolean;
  classNameTitle: string;
  currentAvatar: string;
  originalAvatar?: string;
  currentScale?: number;
  currentPosition?: { x: number; y: number };
  colorTheme?: string;
  onClose: () => void;
  onSave: (avatarUrl: string, scale: number, position: { x: number; y: number }, originalUrl?: string) => void;
}

export const ClassAvatarEditorModal: React.FC<ClassAvatarEditorModalProps> = ({
  isOpen,
  classNameTitle,
  currentAvatar,
  originalAvatar,
  currentScale = 1,
  currentPosition = { x: 0, y: 0 },
  colorTheme = '#6366F1',
  onClose,
  onSave
}) => {
  // Ưu tiên dùng originalAvatar (ảnh chất lượng cao ban đầu) để khi chỉnh sửa lại không bị giảm độ phân giải
  const initialSource = originalAvatar || currentAvatar;
  const [selectedAvatar, setSelectedAvatar] = useState(initialSource);
  const [sourceOriginalUrl, setSourceOriginalUrl] = useState(initialSource);
  const [scale, setScale] = useState(currentScale);
  const [position, setPosition] = useState(currentPosition);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const imageElementRef = useRef<HTMLImageElement>(null);

  // Đồng bộ state mỗi khi mở modal với props mới
  useEffect(() => {
    if (isOpen) {
      const src = originalAvatar || currentAvatar;
      setSelectedAvatar(src);
      setSourceOriginalUrl(src);
      setScale(currentScale || 1);
      setPosition(currentPosition || { x: 0, y: 0 });
      setRotation(0);
      setIsSaving(false);
    }
  }, [isOpen, currentAvatar, originalAvatar, currentScale, currentPosition]);

  if (!isOpen) return null;

  // Xử lý upload ảnh mới: Đảm bảo độ nét siêu cao (2048x1536, chất lượng 0.94) để zoom lên 350% vẫn sắc nét từng chi tiết
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const highResBase64 = await compressImage(file, 2048, 1536, 0.94);
        setSelectedAvatar(highResBase64);
        setSourceOriginalUrl(highResBase64);
        setScale(1);
        setPosition({ x: 0, y: 0 });
        setRotation(0);
      } catch (err) {
        console.error('Lỗi khi nén ảnh lớp, chuyển sang đọc trực tiếp file:', err);
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            const rawBase64 = event.target.result as string;
            setSelectedAvatar(rawBase64);
            setSourceOriginalUrl(rawBase64);
            setScale(1);
            setPosition({ x: 0, y: 0 });
            setRotation(0);
          }
        };
        reader.readAsDataURL(file);
      } finally {
        e.target.value = '';
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    setPosition({
      x: dragStartRef.current.posX + dx,
      y: dragStartRef.current.posY + dy
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Hỗ trợ cảm ứng trên thiết bị di động / màn hình cảm ứng
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        posX: position.x,
        posY: position.y
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStartRef.current.startX;
    const dy = e.touches[0].clientY - dragStartRef.current.startY;
    setPosition({
      x: dragStartRef.current.posX + dx,
      y: dragStartRef.current.posY + dy
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleResetPosition = () => {
    setPosition({ x: 0, y: 0 });
    setScale(1);
    setRotation(0);
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  // Canvas export: Cắt chuẩn xác từng pixel theo đúng góc nhìn preview và xuất Full HD sắc nét
  const handleConfirmAndCrop = () => {
    const img = imageElementRef.current;
    const container = previewBoxRef.current;

    // Nếu là vector SVG từ DiceBear thì không cần crop qua canvas
    if (!img || !container || selectedAvatar.includes('api.dicebear.com')) {
      onSave(selectedAvatar, scale, position, sourceOriginalUrl);
      onClose();
      return;
    }

    try {
      setIsSaving(true);
      const containerRect = container.getBoundingClientRect();
      const cw = containerRect.width;
      const ch = containerRect.height;

      if (cw <= 0 || ch <= 0) {
        onSave(selectedAvatar, scale, position, sourceOriginalUrl);
        onClose();
        return;
      }

      // Tỷ lệ khung hình của container preview
      const boxAspect = cw / ch;

      // Độ phân giải cao cho banner lớp học (1600px Full HD, tỷ lệ đồng nhất 100% với container preview)
      const targetWidth = 1600;
      const targetHeight = Math.round(targetWidth / boxAspect);

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        // Nền trắng tinh khiết
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // Kích thước thật của ảnh gốc
        const naturalWidth = img.naturalWidth || cw;
        const naturalHeight = img.naturalHeight || ch;
        const imgAspect = naturalWidth / naturalHeight;

        // Tính kích thước vẽ cơ sở theo CSS object-cover trên Canvas
        let drawW = targetWidth;
        let drawH = targetWidth / imgAspect;
        if (drawH < targetHeight) {
          drawH = targetHeight;
          drawW = targetHeight * imgAspect;
        }

        // Hệ số phóng đại từ màn hình container lên canvas (độ nét cao)
        const k = targetWidth / cw;

        ctx.save();
        // 1. Dời gốc tọa độ về tâm của Canvas
        ctx.translate(targetWidth / 2, targetHeight / 2);

        // 2. Dời tiếp theo khoảng cách kéo chuột của người dùng (ở hệ tọa độ màn hình nhân với tỷ lệ k, ĐỘC LẬP VỚI SCALE)
        ctx.translate(position.x * k, position.y * k);

        // 3. Xoay quanh tâm
        if (rotation !== 0) {
          ctx.rotate((rotation * Math.PI) / 180);
        }

        // 4. Phóng to quanh tâm
        ctx.scale(scale, scale);

        // 5. Cấu hình làm mịn cao cấp của trình duyệt để ảnh sắc nét nhất
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // 6. Vẽ ảnh với tâm tại (0, 0)
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();

        // Xuất ảnh chất lượng cao 0.94 (đảm bảo cực nét, dung lượng tối ưu ~120KB-160KB)
        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.94);
        
        // Lưu ảnh crop mới với scale = 1, position = {0,0} và lưu ảnh gốc sourceOriginalUrl để chỉnh sửa lại sau này
        onSave(croppedDataUrl, 1, { x: 0, y: 0 }, sourceOriginalUrl);
        onClose();
        return;
      }
    } catch (err) {
      console.warn('Canvas crop fallback:', err);
    } finally {
      setIsSaving(false);
    }

    // Fallback save with scale & position
    onSave(selectedAvatar, scale, position, sourceOriginalUrl);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-3 md:p-6 animate-in fade-in duration-150 overflow-y-auto"
      onMouseUp={handleMouseUp}
      onTouchEnd={handleTouchEnd}
    >
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden my-auto"
        onMouseUp={handleMouseUp}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div 
              className="w-9 h-9 rounded-2xl flex items-center justify-center text-white shadow-xs font-black"
              style={{ backgroundColor: colorTheme }}
            >
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 leading-tight">
                Chỉnh Sửa & Thu Phóng Ảnh Lớp Học
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Lớp: <strong className="text-slate-800 font-bold">{classNameTitle}</strong> • Kéo di chuyển và thanh trượt để zoom
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 md:p-6 space-y-4">
          {/* Large Preview Stage (Khung Banner chuẩn tỷ lệ 16:8 - 2:1 đồng bộ tuyệt đối với Thẻ lớp học) */}
          <div className="flex flex-col items-center">
            <div 
              ref={previewBoxRef}
              className="relative w-full max-w-lg aspect-[16/8] rounded-2xl md:rounded-3xl overflow-hidden shadow-xl border-4 bg-slate-950 cursor-grab active:cursor-grabbing select-none transition-shadow"
              style={{ borderColor: colorTheme }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
            >
              <img
                ref={imageElementRef}
                src={selectedAvatar}
                alt="Xem trước ảnh lớp"
                className="w-full h-full object-cover pointer-events-none transition-transform duration-75 select-none"
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center'
                }}
                referrerPolicy="no-referrer"
                draggable={false}
              />

              {/* Lưới căn chỉnh 1/3 (Rule of Thirds) & Khung hướng dẫn */}
              <div className="absolute inset-0 pointer-events-none">
                {/* 2 đường kẻ ngang */}
                <div className="absolute left-0 right-0 top-1/3 border-b border-white/20 border-dashed" />
                <div className="absolute left-0 right-0 top-2/3 border-b border-white/20 border-dashed" />
                {/* 2 đường kẻ dọc */}
                <div className="absolute top-0 bottom-0 left-1/3 border-r border-white/20 border-dashed" />
                <div className="absolute top-0 bottom-0 left-2/3 border-r border-white/20 border-dashed" />
                {/* 4 góc canh nét */}
                <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-amber-300 rounded-tl-sm" />
                <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-amber-300 rounded-tr-sm" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-amber-300 rounded-bl-sm" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-amber-300 rounded-br-sm" />
              </div>
              
              {/* Badge instruction */}
              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 bg-black/75 text-white text-[11px] font-bold px-3 py-1 rounded-full pointer-events-none flex items-center gap-1.5 backdrop-blur-xs shadow-md">
                <Move className="w-3 h-3 text-amber-400" />
                <span>Nhấp & kéo ảnh để chỉnh góc nhìn đẹp nhất</span>
              </div>

              {/* Top Banner info */}
              <div className="absolute top-2.5 left-2.5 bg-black/65 text-amber-300 text-[10px] font-black uppercase px-2 py-0.5 rounded-lg pointer-events-none backdrop-blur-xs flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>TỈ LỆ BANNER 2:1 (FULL HD)</span>
              </div>

              {/* Zoom & Rotation indicator */}
              <div className="absolute top-2.5 right-2.5 bg-black/65 text-white text-[10px] font-mono px-2 py-0.5 rounded-lg pointer-events-none backdrop-blur-xs font-bold">
                {Math.round(scale * 100)}% {rotation !== 0 ? `• ${rotation}°` : ''}
              </div>
            </div>

            {/* Quick action buttons row below preview */}
            <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
              <button
                type="button"
                onClick={handleRotate}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
                title="Xoay ảnh 90 độ"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Xoay 90°</span>
              </button>

              <button
                type="button"
                onClick={handleResetPosition}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
                title="Căn giữa lại ảnh và đặt zoom 100%"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Căn giữa & 100%</span>
              </button>

              <button
                type="button"
                onClick={() => setScale(prev => Math.min(prev + 0.25, 3.5))}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                title="Phóng to"
              >
                +25%
              </button>

              <button
                type="button"
                onClick={() => setScale(prev => Math.max(prev - 0.25, 0.5))}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                title="Thu nhỏ"
              >
                -25%
              </button>
            </div>

            {/* Zoom Slider Control */}
            <div className="w-full max-w-lg mt-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-black text-slate-700">
                <span className="flex items-center gap-1.5">
                  <ZoomIn className="w-4 h-4 text-indigo-600" />
                  <span>ĐIỀU CHỈNH ĐỘ PHÓNG TO / THU NHỎ (ZOOM):</span>
                </span>
                <span className="font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200 font-bold">
                  {Math.round(scale * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-3">
                <ZoomOut 
                  className="w-4 h-4 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0" 
                  onClick={() => setScale(prev => Math.max(prev - 0.1, 0.5))}
                />
                <input
                  type="range"
                  min="0.5"
                  max="3.5"
                  step="0.05"
                  value={scale}
                  onChange={(e) => setScale(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <ZoomIn 
                  className="w-4 h-4 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0" 
                  onClick={() => setScale(prev => Math.min(prev + 0.1, 3.5))}
                />
              </div>

              <div className="flex justify-between text-[10px] text-slate-400 font-bold px-1">
                <span>50% (Thu nhỏ)</span>
                <span>100% (Chuẩn)</span>
                <span>200%</span>
                <span>350% (Phóng to cực đại)</span>
              </div>
            </div>
          </div>

          {/* Upload Button from Computer */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                Tải ảnh mới từ máy tính:
              </span>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-black flex items-center gap-2 transition-all hover-zoom-btn"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Chọn tệp ảnh khác từ máy tính...</span>
              </button>
            </div>

            {/* Quick Presets */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 block mb-1.5">
                Hoặc chọn biểu tượng lớp học sinh động có sẵn:
              </span>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {CLASS_AVATARS_PRESET.map((av) => (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => {
                      setSelectedAvatar(av.url);
                      setSourceOriginalUrl(av.url);
                      setScale(1);
                      setPosition({ x: 0, y: 0 });
                      setRotation(0);
                    }}
                    className={`w-11 h-11 rounded-2xl overflow-hidden border-2 transition-transform shrink-0 ${
                      selectedAvatar === av.url ? 'scale-110 ring-2 ring-indigo-500 border-indigo-500' : 'border-slate-200'
                    }`}
                    title={av.label}
                  >
                    <img src={av.url} alt={av.label} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleConfirmAndCrop}
            disabled={isSaving}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md shadow-indigo-600/20 hover-zoom-btn transition-all disabled:opacity-70"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang xử lý & Lưu ảnh...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Lưu & Cập Nhật Ảnh Lớp</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
