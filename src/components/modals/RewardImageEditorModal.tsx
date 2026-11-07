import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, X, ZoomIn, ZoomOut, Check, Move, RotateCw, RotateCcw, 
  FlipHorizontal, Crop, Sparkles, Loader2, Image as ImageIcon,
  RefreshCw, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Grid
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { compressImage } from '../../utils/imageCompressor';

// Mẫu ảnh minh họa quà tặng học tập phong phú chất lượng cao có sẵn
export const PRESET_REWARD_IMAGES = [
  {
    id: 'rew-pen',
    name: 'Bút dạ quang pastel',
    category: 'Dụng cụ học tập',
    url: 'https://images.unsplash.com/photo-1585336261026-70e06001ec46?w=600&auto=format&fit=crop&q=80'
  },
  {
    id: 'rew-notebook',
    name: 'Sổ tay lò xo bìa xinh',
    category: 'Vở viết',
    url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80'
  },
  {
    id: 'rew-pencil-case',
    name: 'Hộp bút đa năng nhiều ngăn',
    category: 'Dụng cụ học tập',
    url: 'https://images.unsplash.com/photo-1569683795645-b62e50fbf103?w=600&auto=format&fit=crop&q=80'
  },
  {
    id: 'rew-crayons',
    name: 'Bộ sáp màu mỹ thuật cao cấp',
    category: 'Mỹ thuật',
    url: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&auto=format&fit=crop&q=80'
  },
  {
    id: 'rew-bottle',
    name: 'Bình nước giữ nhiệt học sinh',
    category: 'Đồ dùng cá nhân',
    url: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&auto=format&fit=crop&q=80'
  },
  {
    id: 'rew-backpack',
    name: 'Balo học sinh chống gù',
    category: 'Cặp sách',
    url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&auto=format&fit=crop&q=80'
  },
  {
    id: 'rew-bear',
    name: 'Gấu bông khen thưởng chăm ngoan',
    category: 'Đồ chơi & Lưu niệm',
    url: 'https://images.unsplash.com/photo-1559454403-b8fb88521f11?w=600&auto=format&fit=crop&q=80'
  },
  {
    id: 'rew-clock',
    name: 'Đồng hồ đếm ngược Pomodoro',
    category: 'Thiết bị học tập',
    url: 'https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?w=600&auto=format&fit=crop&q=80'
  },
  {
    id: 'rew-badge',
    name: 'Huy hiệu Ngôi sao Thi đua',
    category: 'Đồ chơi & Lưu niệm',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80'
  },
  {
    id: 'rew-stickers',
    name: 'Tập sticker dán sticker thưởng',
    category: 'Dụng cụ học tập',
    url: 'https://images.unsplash.com/photo-1572375992501-4b0892d50c69?w=600&auto=format&fit=crop&q=80'
  }
];

export type CropAspectRatio = '4:3' | '1:1' | '16:9';

interface RewardImageEditorModalProps {
  isOpen: boolean;
  rewardName?: string;
  initialImage?: string;
  onClose: () => void;
  onSave: (croppedImageUrl: string) => void;
}

export const RewardImageEditorModal: React.FC<RewardImageEditorModalProps> = ({
  isOpen,
  rewardName = 'phần quà',
  initialImage = '',
  onClose,
  onSave
}) => {
  const [sourceImage, setSourceImage] = useState<string>(initialImage || PRESET_REWARD_IMAGES[0].url);
  const [aspectRatio, setAspectRatio] = useState<CropAspectRatio>('4:3');
  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [flipH, setFlipH] = useState<boolean>(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState<boolean>(true);
  
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'presets' | 'url'>('upload');
  const [inputUrl, setInputUrl] = useState<string>('');
  
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Kích thước khung cắt xem trước
  const frameWidth = 380;
  const frameHeight = aspectRatio === '4:3' ? 285 : aspectRatio === '1:1' ? 380 : 214;

  // Kích thước ảnh xuất chuẩn nhẹ nhàng (500x375 hoặc 480x480)
  const outputWidth = 560;
  const outputHeight = aspectRatio === '4:3' ? 420 : aspectRatio === '1:1' ? 480 : 315;

  // Đồng bộ khi mở modal
  useEffect(() => {
    if (isOpen) {
      if (initialImage) {
        setSourceImage(initialImage);
      } else {
        setSourceImage(PRESET_REWARD_IMAGES[0].url);
      }
      setScale(1);
      setRotation(0);
      setFlipH(false);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen, initialImage]);

  // Đọc kích thước tự nhiên của ảnh gốc
  useEffect(() => {
    if (!sourceImage) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImgNaturalSize({
        width: img.naturalWidth || 600,
        height: img.naturalHeight || 400
      });
    };
    img.onerror = () => {
      setImgNaturalSize({ width: 600, height: 400 });
    };
    img.src = sourceImage;
  }, [sourceImage]);

  if (!isOpen) return null;

  // Tính tỷ lệ hiển thị cơ bản (Cover fit)
  const isRotated90or270 = rotation === 90 || rotation === 270;
  const effectiveNatW = isRotated90or270 ? imgNaturalSize.height : imgNaturalSize.width;
  const effectiveNatH = isRotated90or270 ? imgNaturalSize.width : imgNaturalSize.height;

  const s0 = effectiveNatW > 0 && effectiveNatH > 0
    ? Math.max(frameWidth / effectiveNatW, frameHeight / effectiveNatH)
    : 1;

  const imgDisplayW = Math.round((imgNaturalSize.width || 600) * s0);
  const imgDisplayH = Math.round((imgNaturalSize.height || 400) * s0);

  // Xử lý nạp ảnh từ máy tính/điện thoại
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setIsProcessing(true);
        const reader = new FileReader();
        reader.onload = async (evt) => {
          const rawData = (evt.target?.result as string) || '';
          if (rawData) {
            // Nén nhẹ ảnh nếu file quá lớn (> 2MB) để tối ưu RAM
            let finalImage = rawData;
            if (file.size > 2 * 1024 * 1024) {
              finalImage = await compressImage(file, 1600, 1600, 0.92);
            }
            setSourceImage(finalImage);
            setScale(1);
            setRotation(0);
            setFlipH(false);
            setPosition({ x: 0, y: 0 });
          }
          setIsProcessing(false);
        };
        reader.onerror = () => setIsProcessing(false);
        reader.readAsDataURL(file);
      } catch (err) {
        console.error('Lỗi khi tải ảnh phần quà:', err);
        setIsProcessing(false);
      } finally {
        e.target.value = '';
      }
    }
  };

  // Kéo thả chuột di chuyển vị trí ảnh (Pan)
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
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
      x: Math.round(dragStartRef.current.posX + dx),
      y: Math.round(dragStartRef.current.posY + dy)
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Chạm cảm ứng trên điện thoại/máy tính bảng
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
      x: Math.round(dragStartRef.current.posX + dx),
      y: Math.round(dragStartRef.current.posY + dy)
    });
  };

  // Zoom bằng cuộn chuột
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    setScale(prev => Math.min(3.5, Math.max(0.2, Number((prev + delta).toFixed(2)))));
  };

  // Các thao tác nhanh
  const handleRotateRight = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleRotateLeft = () => {
    setRotation(prev => (prev - 90 + 360) % 360);
  };

  const handleFlipHorizontal = () => {
    setFlipH(prev => !prev);
  };

  const handleReset = () => {
    setScale(1);
    setRotation(0);
    setFlipH(false);
    setPosition({ x: 0, y: 0 });
  };

  const handleNudge = (dx: number, dy: number) => {
    setPosition(prev => ({
      x: prev.x + dx,
      y: prev.y + dy
    }));
  };

  // XỬ LÝ LƯU ẢNH SAU KHI CẮT (BAKE CHUẨN XÁC ĐÚNG VÙNG ĐÃ CHỈNH)
  const handleSaveCrop = async () => {
    if (!sourceImage) return;

    try {
      setIsProcessing(true);

      const croppedDataUrl = await new Promise<string>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = outputWidth;
            canvas.height = outputHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              resolve(sourceImage);
              return;
            }

            // Nền trắng tinh khôi chống rách ảnh
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, outputWidth, outputHeight);

            // Hệ số phóng từ preview frame sang canvas xuất
            const R = outputWidth / frameWidth;

            ctx.save();
            // Dịch về tâm khung
            ctx.translate(outputWidth / 2, outputHeight / 2);
            // Dịch theo tọa độ kéo chuột của người dùng
            ctx.translate(position.x * R, position.y * R);
            // Xoay góc
            ctx.rotate((rotation * Math.PI) / 180);
            // Lật và Zoom
            const sX = (flipH ? -scale : scale) * s0 * R;
            const sY = scale * s0 * R;
            ctx.scale(sX, sY);

            // Vẽ ảnh gốc từ tâm
            const nw = img.naturalWidth || imgNaturalSize.width || 600;
            const nh = img.naturalHeight || imgNaturalSize.height || 400;
            ctx.drawImage(img, -nw / 2, -nh / 2, nw, nh);
            ctx.restore();

            // Xuất ảnh JPEG chất lượng cao 88%, dung lượng siêu nhẹ ~35KB-55KB
            const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
            resolve(dataUrl);
          } catch (err) {
            console.error('Lỗi khi vẽ canvas crop:', err);
            resolve(sourceImage);
          }
        };

        img.onerror = () => {
          resolve(sourceImage);
        };

        img.src = sourceImage;
      });

      onSave(croppedDataUrl);
      confetti({ particleCount: 35, spread: 60, origin: { y: 0.6 } });
      onClose();
    } catch (err) {
      console.error('Lỗi xuất ảnh sau khi chỉnh:', err);
      onSave(sourceImage);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-3xl max-w-2xl w-full p-3.5 sm:p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[88dvh] overflow-hidden"
        onMouseUp={handleMouseUp}
        onTouchEnd={handleMouseUp}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shadow-2xs">
              <Crop className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <span>CHỈNH SỬA & CẮT ẢNH MINH HỌA QUÀ</span>
              </h3>
              <p className="text-xs text-slate-500">
                Tải ảnh, zoom, xoay, kéo di chuyển vị trí và cắt ảnh sắc nét cho: <strong>{rewardName}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1">
          {/* Tabs: Tải ảnh từ máy / Mẫu có sẵn / Nhập link */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  activeTab === 'upload' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                📁 Tải ảnh từ máy
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('presets')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  activeTab === 'presets' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                🎁 Mẫu quà có sẵn ({PRESET_REWARD_IMAGES.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('url')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  activeTab === 'url' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                🔗 Nhập link URL
              </button>
            </div>

            {/* Chọn tỉ lệ khung cắt */}
            <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
              <span className="text-[10px] text-slate-400 uppercase hidden sm:inline">Khung cắt:</span>
              <button
                type="button"
                onClick={() => setAspectRatio('4:3')}
                className={`px-2 py-0.5 rounded-lg border transition-all ${
                  aspectRatio === '4:3' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-black' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                4:3 (Chuẩn)
              </button>
              <button
                type="button"
                onClick={() => setAspectRatio('1:1')}
                className={`px-2 py-0.5 rounded-lg border transition-all ${
                  aspectRatio === '1:1' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-black' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                1:1 (Vuông)
              </button>
              <button
                type="button"
                onClick={() => setAspectRatio('16:9')}
                className={`px-2 py-0.5 rounded-lg border transition-all ${
                  aspectRatio === '16:9' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-black' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                16:9 (Rộng)
              </button>
            </div>
          </div>

          {/* Tab Content 1: Tải ảnh từ máy */}
          {activeTab === 'upload' && (
            <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-xs">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-xs transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>CHỌN ẢNH TỪ MÁY TÍNH / ĐIỆN THOẠI</span>
              </button>
              <span className="text-[11px] text-slate-500">
                Hỗ trợ JPG, PNG, WEBP. Ảnh tự động nén tối ưu dung lượng siêu nhẹ (~40KB).
              </span>
            </div>
          )}

          {/* Tab Content 2: Mẫu quà có sẵn */}
          {activeTab === 'presets' && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 max-h-32 overflow-y-auto p-1 bg-slate-50 rounded-2xl border border-slate-200">
              {PRESET_REWARD_IMAGES.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  onClick={() => {
                    setSourceImage(preset.url);
                    setScale(1);
                    setRotation(0);
                    setFlipH(false);
                    setPosition({ x: 0, y: 0 });
                  }}
                  className={`p-1.5 rounded-xl border text-left flex flex-col items-center gap-1 transition-all ${
                    sourceImage === preset.url ? 'bg-indigo-100 border-indigo-600 ring-2 ring-indigo-500/20 shadow-xs' : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <img
                    src={preset.url}
                    alt={preset.name}
                    className="w-12 h-12 object-cover rounded-lg"
                    referrerPolicy="no-referrer"
                  />
                  <span className="text-[10px] font-bold text-slate-700 text-center line-clamp-1 w-full" title={preset.name}>
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Tab Content 3: Nhập link URL */}
          {activeTab === 'url' && (
            <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-xs">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="Dán link ảnh internet (https://...)..."
                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white"
              />
              <button
                type="button"
                onClick={() => {
                  if (inputUrl.trim()) {
                    setSourceImage(inputUrl.trim());
                    setScale(1);
                    setRotation(0);
                    setFlipH(false);
                    setPosition({ x: 0, y: 0 });
                  }
                }}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl font-bold text-xs"
              >
                Tải ảnh
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* KHUNG XEM TRƯỚC VÀ CẮT ẢNH TRỰC QUAN (LIVE CROP VIEWPORT) */}
          {/* ========================================================================= */}
          <div className="flex flex-col items-center justify-center p-3 bg-slate-900 rounded-3xl border border-slate-800 shadow-inner relative overflow-hidden select-none">
            {/* Thanh thông báo hướng dẫn di chuyển */}
            <div className="absolute top-2 left-3 right-3 flex items-center justify-between text-[10px] text-slate-400 z-10 pointer-events-none">
              <span className="flex items-center gap-1 text-amber-300 font-bold bg-slate-950/70 px-2 py-0.5 rounded-lg border border-slate-700">
                <Move className="w-3 h-3" />
                <span>GIỮ & KÉO CHUỘT / CHẠM ĐỂ DI CHUYỂN VỊ TRÍ ẢNH</span>
              </span>
              <span className="bg-slate-950/70 px-2 py-0.5 rounded-lg text-slate-300 font-mono">
                Zoom: {Math.round(scale * 100)}% • Xoay: {rotation}°
              </span>
            </div>

            {/* VÙNG KHUNG CẮT CHÍNH */}
            <div 
              className="relative overflow-hidden rounded-2xl shadow-2xl border-2 border-indigo-400/90 cursor-grab active:cursor-grabbing bg-slate-950 mt-4"
              style={{
                width: `${frameWidth}px`,
                height: `${frameHeight}px`
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onWheel={handleWheel}
            >
              {/* Hình ảnh thực tế đang được Zoom, Rotate, Flip & Pan */}
              {sourceImage ? (
                <img
                  src={sourceImage}
                  alt="Ảnh phần quà"
                  draggable={false}
                  referrerPolicy="no-referrer"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: `${imgDisplayW}px`,
                    height: `${imgDisplayH}px`,
                    maxWidth: 'none',
                    userSelect: 'none',
                    transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${flipH ? -scale : scale}, ${scale})`,
                    transformOrigin: 'center center',
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                  }}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                  <ImageIcon className="w-8 h-8 opacity-40" />
                  <span className="text-xs">Chưa có ảnh nào</span>
                </div>
              )}

              {/* Lưới chia ba (Rule of Thirds Grid) hỗ trợ căn bố cục */}
              {showGrid && (
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-white/20">
                  <div className="border-r border-b border-white/25"></div>
                  <div className="border-r border-b border-white/25"></div>
                  <div className="border-b border-white/25"></div>
                  <div className="border-r border-b border-white/25"></div>
                  <div className="border-r border-b border-white/25"></div>
                  <div className="border-b border-white/25"></div>
                  <div className="border-r border-white/25"></div>
                  <div className="border-r border-white/25"></div>
                  <div></div>
                </div>
              )}

              {/* Viền góc căn chỉnh thẩm mỹ */}
              <div className="absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 border-white pointer-events-none"></div>
              <div className="absolute top-1 right-1 w-4 h-4 border-t-2 border-r-2 border-white pointer-events-none"></div>
              <div className="absolute bottom-1 left-1 w-4 h-4 border-b-2 border-l-2 border-white pointer-events-none"></div>
              <div className="absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 border-white pointer-events-none"></div>
            </div>

            {/* Thanh điều khiển nhanh góc dưới ảnh */}
            <div className="flex items-center justify-between w-full max-w-[380px] mt-2 text-[10px] text-slate-400">
              <button
                type="button"
                onClick={() => setShowGrid(!showGrid)}
                className={`px-2 py-0.5 rounded-lg border transition-all ${
                  showGrid ? 'bg-indigo-900/60 border-indigo-500 text-indigo-200' : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <Grid className="w-3 h-3 inline mr-1" />
                <span>{showGrid ? 'Ẩn lưới' : 'Hiện lưới'}</span>
              </button>

              <div className="flex items-center gap-1 font-mono text-[10px]">
                <span>Tọa độ: X: {position.x}px • Y: {position.y}px</span>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              >
                <RefreshCw className="w-3 h-3 inline mr-1" />
                <span>Đặt lại</span>
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BỘ CÔNG CỤ ĐIỀU CHỈNH: ZOOM, XOAY, LẬT & DI CHUYỂN */}
          {/* ========================================================================= */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-3 text-xs">
            {/* 1. Zoom Slider & Buttons */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <ZoomIn className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Thu nhỏ / Phóng to (Zoom):</span>
                </span>
                <span className="font-mono text-indigo-600">{Math.round(scale * 100)}%</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScale(prev => Math.max(0.2, Number((prev - 0.1).toFixed(2))))}
                  className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold shadow-2xs"
                  title="Thu nhỏ 10%"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>

                <input
                  type="range"
                  min="0.2"
                  max="3.5"
                  step="0.05"
                  value={scale}
                  onChange={(e) => setScale(parseFloat(e.target.value))}
                  className="flex-1 accent-indigo-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
                />

                <button
                  type="button"
                  onClick={() => setScale(prev => Math.min(3.5, Number((prev + 0.1).toFixed(2))))}
                  className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold shadow-2xs"
                  title="Phóng to 10%"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

                {/* Các nút zoom nhanh */}
                <button
                  type="button"
                  onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }}
                  className="px-2 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-700 shadow-2xs"
                >
                  100%
                </button>
                <button
                  type="button"
                  onClick={() => { setScale(1.4); }}
                  className="px-2 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-700 shadow-2xs"
                >
                  Cận cảnh
                </button>
              </div>
            </div>

            {/* 2. Xoay ảnh & Lật ngang */}
            <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <RotateCw className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Xoay & Lật:</span>
                </span>
                
                <button
                  type="button"
                  onClick={handleRotateLeft}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold shadow-2xs"
                  title="Xoay trái 90 độ"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>-90°</span>
                </button>

                <button
                  type="button"
                  onClick={handleRotateRight}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold shadow-2xs"
                  title="Xoay phải 90 độ"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>+90°</span>
                </button>

                <button
                  type="button"
                  onClick={handleFlipHorizontal}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold shadow-2xs transition-all ${
                    flipH ? 'bg-indigo-100 border-indigo-500 text-indigo-800' : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                  title="Lật ảnh theo chiều ngang"
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  <span>Lật ngang</span>
                </button>
              </div>

              {/* 3. Tinh chỉnh di chuyển vị trí (Fine Nudge) */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold text-slate-500 mr-1">Dịch vị trí:</span>
                <button
                  type="button"
                  onClick={() => handleNudge(-15, 0)}
                  className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 shadow-2xs"
                  title="Sang trái"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge(15, 0)}
                  className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 shadow-2xs"
                  title="Sang phải"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge(0, -15)}
                  className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 shadow-2xs"
                  title="Lên trên"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge(0, 15)}
                  className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 shadow-2xs"
                  title="Xuống dưới"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPosition({ x: 0, y: 0 })}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600 shadow-2xs"
                  title="Căn giữa khung"
                >
                  Giữa
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-100 shrink-0 bg-white">
          <div className="text-[10.5px] sm:text-[11px] text-slate-500">
            Ảnh sau khi lưu sẽ được cắt chuẩn xác và tối ưu nhẹ, không làm ứng dụng chậm.
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleSaveCrop}
              disabled={isProcessing || !sourceImage}
              className="inline-flex items-center justify-center gap-1.5 px-4 sm:px-5 py-2.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer uppercase flex-1 sm:flex-initial"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>ĐANG XỬ LÝ...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>LƯU ẢNH</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
