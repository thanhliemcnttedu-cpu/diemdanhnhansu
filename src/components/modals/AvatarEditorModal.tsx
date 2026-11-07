import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, X, ZoomIn, ZoomOut, Check, Move, RotateCcw, 
  Sparkles, Loader2, Camera, CameraOff, RefreshCw, FlipHorizontal, Info, Users 
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playCoinSound } from '../../utils/audio';
import { compressImage, bakeCropFromFullImage } from '../../utils/imageCompressor';

const FRAME_SIZE = 260;

interface AvatarEditorModalProps {
  isOpen: boolean;
  studentName: string;
  currentAvatar: string;
  originalAvatar?: string;
  currentScale?: number;
  currentPosition?: { x: number; y: number };
  currentFlipX?: boolean;
  onOpenGroupPhoto?: () => void;
  onClose: () => void;
  onSave: (
    croppedAvatarUrl: string, 
    originalAvatarUrl: string, 
    scale: number, 
    position: { x: number; y: number },
    flipX?: boolean
  ) => void;
}

export const AvatarEditorModal: React.FC<AvatarEditorModalProps> = ({
  isOpen,
  studentName,
  currentAvatar,
  originalAvatar,
  currentScale = 1,
  currentPosition = { x: 0, y: 0 },
  currentFlipX = false,
  onOpenGroupPhoto,
  onClose,
  onSave
}) => {
  const [sourceImage, setSourceImage] = useState(originalAvatar || currentAvatar);
  const [scale, setScale] = useState(currentScale || 1);
  const [position, setPosition] = useState(currentPosition || { x: 0, y: 0 });
  const [flipX, setFlipX] = useState(currentFlipX || false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Camera Webcam States
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop camera tracks cleanly
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (_) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
    setCameraLoading(false);
    setCameraError(null);
  }, []);

  // Safe wrapper for closing modal
  const handleSafeClose = useCallback(() => {
    stopCameraStream();
    onClose();
  }, [stopCameraStream, onClose]);

  // Start Webcam Video Stream
  const startCameraStream = async (desiredFacingMode = facingMode) => {
    try {
      setCameraError(null);
      setCameraLoading(true);
      setIsCameraOpen(true);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Trình duyệt không hỗ trợ truy cập máy ảnh hoặc chưa chạy trên giao thức an toàn (HTTPS/localhost).');
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: desiredFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraLoading(false);
    } catch (err: any) {
      console.error('Lỗi khi mở camera:', err);
      let errorMsg = 'Không thể mở Camera của máy tính. Vui lòng cho phép quyền camera trên trình duyệt.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Quyền truy cập Camera bị từ chối. Vui lòng cấp quyền camera trên thanh địa chỉ.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'Không tìm thấy thiết bị Camera trên máy tính này.';
      }
      setCameraError(errorMsg);
      setCameraLoading(false);
    }
  };

  const handleSwitchCamera = () => {
    const nextFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacingMode);
    startCameraStream(nextFacingMode);
  };

  // Capture frame from active video stream into Base64
  const handleCapturePhoto = () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, width, height);
      const capturedBase64 = canvas.toDataURL('image/jpeg', 0.95);

      setSourceImage(capturedBase64);
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setFlipX(false);
      stopCameraStream();
      playCoinSound();
    } catch (err) {
      console.error('Lỗi khi chụp ảnh từ camera:', err);
    }
  };

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  // Sync state whenever modal opens or props update
  useEffect(() => {
    if (isOpen) {
      const initial = originalAvatar || currentAvatar;
      setSourceImage(initial);
      setScale(currentScale || 1);
      setPosition(currentPosition || { x: 0, y: 0 });
      setFlipX(currentFlipX || false);
    } else {
      stopCameraStream();
    }
  }, [isOpen, originalAvatar, currentAvatar, currentScale, currentPosition, currentFlipX, stopCameraStream]);

  // Load natural dimensions
  useEffect(() => {
    if (!sourceImage) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImgNaturalSize({
        width: img.naturalWidth || FRAME_SIZE,
        height: img.naturalHeight || FRAME_SIZE
      });
    };
    img.onerror = () => {
      setImgNaturalSize({ width: FRAME_SIZE, height: FRAME_SIZE });
    };
    img.src = sourceImage;
  }, [sourceImage]);

  if (!isOpen) return null;

  const s0 = imgNaturalSize.width > 0 && imgNaturalSize.height > 0
    ? Math.max(FRAME_SIZE / imgNaturalSize.width, FRAME_SIZE / imgNaturalSize.height)
    : 1;
  const baseWidth = Math.round((imgNaturalSize.width || FRAME_SIZE) * s0);
  const baseHeight = Math.round((imgNaturalSize.height || FRAME_SIZE) * s0);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setIsProcessing(true);
        const compressed = await compressImage(file, 1200, 1200, 0.9);
        if (compressed) {
          setSourceImage(compressed);
          setScale(1);
          setPosition({ x: 0, y: 0 });
          setFlipX(false);
        }
        setIsProcessing(false);
      } catch (err) {
        console.error('Lỗi khi nạp ảnh học sinh:', err);
        setIsProcessing(false);
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
    // Invert horizontal drag direction when image is flipped
    const dx = (e.clientX - dragStartRef.current.startX) * (flipX ? -1 : 1);
    const dy = e.clientY - dragStartRef.current.startY;
    setPosition({
      x: dragStartRef.current.posX + dx,
      y: dragStartRef.current.posY + dy
    });
  };

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
    // Invert horizontal drag direction when image is flipped
    const dx = (e.touches[0].clientX - dragStartRef.current.startX) * (flipX ? -1 : 1);
    const dy = e.touches[0].clientY - dragStartRef.current.startY;
    setPosition({
      x: dragStartRef.current.posX + dx,
      y: dragStartRef.current.posY + dy
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setFlipX(false);
  };

  const handleFit = () => {
    if (imgNaturalSize.width > 0 && imgNaturalSize.height > 0) {
      const fitRatio = Math.min(FRAME_SIZE / imgNaturalSize.width, FRAME_SIZE / imgNaturalSize.height);
      const targetScale = fitRatio / s0;
      setScale(Math.max(0.2, Math.round(targetScale * 100) / 100));
      setPosition({ x: 0, y: 0 });
    } else {
      setScale(0.8);
      setPosition({ x: 0, y: 0 });
    }
  };

  const handleCover = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleCloseUp = () => {
    setScale(1.5);
    setPosition({ x: 0, y: 0 });
  };

  const handleToggleFlip = () => {
    setFlipX(prev => !prev);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    setScale(prev => Math.min(3.5, Math.max(0.2, Math.round((prev + delta) * 100) / 100)));
  };

  // ONLY crop when user clicks confirm!
  const handleConfirmCrop = async () => {
    try {
      setIsProcessing(true);
      let finalCroppedUrl = sourceImage;
      // Bake the crop from the full uncropped image including horizontal flip
      finalCroppedUrl = await bakeCropFromFullImage(sourceImage, FRAME_SIZE, position, scale, 360, flipX);

      onSave(finalCroppedUrl, sourceImage, scale, position, flipX);
      playCoinSound();
      confetti({ particleCount: 40, spread: 65, origin: { y: 0.6 } });
      onClose();
    } catch (err) {
      console.error('Lỗi khi crop ảnh học sinh:', err);
      onSave(sourceImage, sourceImage, scale, position, flipX);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onMouseUp={handleMouseUp}
        onTouchEnd={handleMouseUp}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black tracking-tight uppercase">
                Thu Phóng, Căn Chỉnh & Lật Ảnh Học Sinh
              </h3>
              <p className="text-xs text-blue-100 font-medium">
                Học sinh: <strong className="text-amber-300">{studentName || 'Học sinh'}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={handleSafeClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors hover-zoom-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2-Column Responsive Body */}
        <div className="p-5 sm:p-6 flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 gap-6 items-center min-h-0">
          
          {/* COLUMN 1 (LEFT): Canvas Preview, Controls & Zoom Slider */}
          <div className="md:col-span-7 flex flex-col items-center justify-center space-y-3">
            
            {/* Interactive Stage: Camera Mode OR Crop/Zoom Stage */}
            {isCameraOpen ? (
              <div className="relative w-[240px] h-[240px] sm:w-[260px] sm:h-[260px] rounded-3xl border-4 border-rose-500 overflow-hidden shadow-xl bg-black select-none ring-4 ring-rose-200 shrink-0">
                {cameraLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white z-20 gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-rose-400" />
                    <span className="text-xs font-bold">Đang kết nối Camera...</span>
                  </div>
                )}

                {cameraError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-900 text-center text-white z-20 gap-2">
                    <CameraOff className="w-8 h-8 text-rose-400" />
                    <p className="text-[11px] text-rose-200 font-medium leading-relaxed">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => startCameraStream()}
                      className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase transition-colors"
                    >
                      Thử lại
                    </button>
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
                  />
                )}

                {/* Circular avatar framing guide */}
                <div className="absolute inset-0 pointer-events-none rounded-full border-2 border-dashed border-rose-400/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]" />

                {/* Live Indicator Badge */}
                <div className="absolute top-2.5 left-2.5 bg-rose-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  <span>Live</span>
                </div>

                {/* Switch Camera */}
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  title="Đổi camera trước / sau"
                  className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white flex items-center justify-center transition-all shadow-md hover-zoom-btn"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-rose-300" />
                </button>

                {/* Camera Snap Buttons Floating */}
                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
                  <button
                    type="button"
                    disabled={cameraLoading || !!cameraError}
                    onClick={handleCapturePhoto}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-black text-white bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 shadow-md transition-all hover-zoom-btn disabled:opacity-50 uppercase"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>CHỤP ẢNH</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopCameraStream}
                    className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white bg-slate-800/80 hover:bg-slate-900 border border-white/20 transition-colors uppercase hover-zoom-btn"
                  >
                    HỦY
                  </button>
                </div>
              </div>
            ) : (
              <div 
                className="relative w-[240px] h-[240px] sm:w-[260px] sm:h-[260px] rounded-3xl border-4 border-indigo-600 overflow-hidden shadow-xl bg-slate-900 cursor-grab active:cursor-grabbing select-none touch-none ring-4 ring-indigo-100 shrink-0"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onWheel={handleWheel}
                title="Cuộn chuột để zoom • Kéo rê để căn chỉnh ảnh"
              >
                {/* Full uncropped image with Pan, Zoom and FlipHorizontal */}
                {imgNaturalSize.width > 0 ? (
                  <img
                    src={sourceImage}
                    alt="Student Avatar Preview"
                    className="pointer-events-none select-none transition-transform duration-75"
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      width: `${baseWidth}px`,
                      height: `${baseHeight}px`,
                      maxWidth: 'none',
                      maxHeight: 'none',
                      transform: `translate(-50%, -50%) scaleX(${flipX ? -1 : 1}) translate(${position.x}px, ${position.y}px) scale(${scale})`,
                      transformOrigin: 'center center'
                    }}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  </div>
                )}

                {/* Circular avatar framing guide overlay */}
                <div className="absolute inset-0 pointer-events-none rounded-full border-2 border-dashed border-indigo-500/60 shadow-[0_0_0_9999px_rgba(15,23,42,0.15)]" />

                {/* Rule of thirds grid overlay */}
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-indigo-300/40 rounded-3xl">
                  <div className="border-r border-b border-indigo-300/30" />
                  <div className="border-r border-b border-indigo-300/30" />
                  <div className="border-b border-indigo-300/30" />
                  <div className="border-r border-b border-indigo-300/30" />
                  <div className="border-r border-b border-indigo-300/30" />
                  <div className="border-b border-indigo-300/30" />
                  <div className="border-r border-b border-indigo-300/30" />
                  <div className="border-r border-b border-indigo-300/30" />
                  <div />
                </div>

                {/* Flip Indicator Badge */}
                {flipX && (
                  <div className="absolute top-2.5 left-2.5 bg-purple-600/90 text-white text-[9.5px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md uppercase backdrop-blur-xs">
                    <FlipHorizontal className="w-3 h-3" />
                    <span>Đã lật ảnh</span>
                  </div>
                )}

                {/* Floating Helper Pill */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-slate-900/80 text-white text-[9.5px] font-bold px-2.5 py-0.5 rounded-full pointer-events-none flex items-center gap-1.5 backdrop-blur-xs whitespace-nowrap shadow-md">
                  <Move className="w-3 h-3 text-amber-300" />
                  <span>Kéo để căn chỉnh • Cuộn chuột để zoom</span>
                </div>
              </div>
            )}

            {/* Quick Framing Buttons & Flip Image Button */}
            <div className="grid grid-cols-5 gap-1.5 w-full max-w-md">
              <button
                type="button"
                onClick={handleFit}
                className="px-1.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-[10px] font-black transition-all border border-slate-200 hover:border-indigo-300 uppercase shadow-2xs hover-zoom-btn text-center"
                title="Vừa khít trọn vẹn toàn bộ bức ảnh"
              >
                VỪA KHÍT
              </button>
              <button
                type="button"
                onClick={handleCover}
                className="px-1.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-[10px] font-black transition-all border border-slate-200 hover:border-indigo-300 uppercase shadow-2xs hover-zoom-btn text-center"
                title="Phủ đầy toàn bộ khung ảnh"
              >
                PHỦ ĐẦY
              </button>
              <button
                type="button"
                onClick={handleCloseUp}
                className="px-1.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-[10px] font-black transition-all border border-slate-200 hover:border-indigo-300 uppercase shadow-2xs hover-zoom-btn text-center"
                title="Cận cảnh 150%"
              >
                150%
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-1.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-[10px] font-black transition-all border border-slate-200 hover:border-indigo-300 uppercase shadow-2xs hover-zoom-btn flex items-center justify-center gap-1 text-center"
                title="Đặt lại vị trí căn giữa"
              >
                <RotateCcw className="w-3 h-3" />
                <span>CĂN GIỮA</span>
              </button>
              {/* FLIP HORIZONTAL BUTTON */}
              <button
                type="button"
                onClick={handleToggleFlip}
                className={`px-1.5 py-1.5 rounded-xl text-[10px] font-black transition-all border uppercase shadow-2xs hover-zoom-btn flex items-center justify-center gap-1 text-center ${
                  flipX
                    ? 'bg-purple-600 text-white border-purple-600 shadow-purple-500/20'
                    : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                }`}
                title="Lật ngược ảnh theo chiều ngang (Mirror / Flip Horizontal)"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
                <span>LẬT ẢNH</span>
              </button>
            </div>

            {/* Zoom Slider and Controls */}
            <div className="w-full max-w-sm space-y-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScale(prev => Math.max(0.2, Math.round((prev - 0.1) * 100) / 100))}
                  className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors shrink-0"
                  title="Thu nhỏ ảnh"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>

                <input
                  type="range"
                  min="0.2"
                  max="3.5"
                  step="0.05"
                  value={scale}
                  onChange={(e) => setScale(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />

                <button
                  type="button"
                  onClick={() => setScale(prev => Math.min(3.5, Math.round((prev + 0.1) * 100) / 100))}
                  className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors shrink-0"
                  title="Phóng to ảnh"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                <span className="text-[11px] font-mono font-black text-indigo-700 w-11 text-right shrink-0">
                  {Math.round(scale * 100)}%
                </span>
              </div>
            </div>
          </div>

          {/* COLUMN 2 (RIGHT): Elegant & Vertically Balanced Source Actions */}
          <div className="md:col-span-5 flex flex-col justify-center items-stretch gap-5 bg-gradient-to-b from-slate-50 to-indigo-50/30 p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-xs h-full">
            
            {/* Header / Title Block */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600/10 text-indigo-700 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Nguồn Ảnh Đại Diện
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">
                  Chọn ảnh từ máy tính hoặc chụp ảnh trực tiếp
                </p>
              </div>
            </div>

            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />

            {/* Action Cards */}
            <div className="space-y-3">
              {/* Card 1: Upload from Computer */}
              <button
                type="button"
                onClick={() => {
                  stopCameraStream();
                  fileInputRef.current?.click();
                }}
                className="group w-full p-4 rounded-2xl bg-white hover:bg-indigo-50/60 border-2 border-indigo-200/80 hover:border-indigo-500 text-left transition-all hover-zoom-btn shadow-sm flex items-center gap-3.5 relative overflow-hidden"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-100 group-hover:bg-indigo-600 group-hover:text-white text-indigo-700 flex items-center justify-center transition-colors shrink-0 shadow-xs">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <strong className="text-xs font-black uppercase text-slate-800 group-hover:text-indigo-700 block transition-colors">
                    CHỌN ẢNH TỪ MÁY TÍNH
                  </strong>
                  <span className="text-[11px] text-slate-500 block leading-snug font-medium mt-0.5">
                    Tải ảnh thẻ, ảnh chân dung sẵn có (JPG, PNG, WebP)
                  </span>
                </div>
              </button>

              {/* Card 2: Webcam Capture */}
              <button
                type="button"
                onClick={() => startCameraStream()}
                className="group w-full p-4 rounded-2xl bg-white hover:bg-rose-50/60 border-2 border-rose-200/80 hover:border-rose-500 text-left transition-all hover-zoom-btn shadow-sm flex items-center gap-3.5 relative overflow-hidden"
              >
                <div className="w-12 h-12 rounded-xl bg-rose-100 group-hover:bg-rose-600 group-hover:text-white text-rose-700 flex items-center justify-center transition-colors shrink-0 shadow-xs">
                  <Camera className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <strong className="text-xs font-black uppercase text-slate-800 group-hover:text-rose-700 block transition-colors">
                    CHỤP TRỰC TIẾP TỪ WEBCAM
                  </strong>
                  <span className="text-[11px] text-slate-500 block leading-snug font-medium mt-0.5">
                    Bật camera máy tính để chụp ảnh học sinh tức thì
                  </span>
                </div>
              </button>

              {/* Card 3: Crop from Class Group Photo */}
              {onOpenGroupPhoto && (
                <button
                  type="button"
                  onClick={() => {
                    stopCameraStream();
                    handleSafeClose();
                    onOpenGroupPhoto();
                  }}
                  className="group w-full p-4 rounded-2xl bg-white hover:bg-emerald-50/70 border-2 border-emerald-300 hover:border-emerald-500 text-left transition-all hover-zoom-btn shadow-sm flex items-center gap-3.5 relative overflow-hidden ring-1 ring-emerald-200"
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 group-hover:bg-emerald-600 group-hover:text-white text-emerald-700 flex items-center justify-center transition-colors shrink-0 shadow-xs">
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <strong className="text-xs font-black uppercase text-slate-800 group-hover:text-emerald-700 block transition-colors flex items-center gap-1.5">
                      <span>CẮT TỪ ẢNH TẬP THỂ</span>
                      <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase">MỚI</span>
                    </strong>
                    <span className="text-[11px] text-slate-500 block leading-snug font-medium mt-0.5">
                      Tải ảnh chụp tập thể cả lớp và khoanh chọn khuôn mặt
                    </span>
                  </div>
                </button>
              )}
            </div>

            {/* Compact Info Advice Pill */}
            <div className="p-3 bg-blue-50/90 border border-blue-200/80 rounded-2xl text-[11px] text-blue-950 flex items-start gap-2.5 shadow-2xs">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-relaxed">
                <strong className="font-bold block text-blue-900">Mẹo căn chỉnh ảnh đẹp:</strong>
                <p className="text-slate-600 font-medium">
                  Ảnh gốc được bảo toàn nét cao. Bạn có thể kéo khuôn mặt vào giữa vòng tròn, thu phóng và bấm <strong>"LẬT ẢNH"</strong> nếu muốn lật đối xứng gương.
                </p>
              </div>
            </div>

          </div>

        </div>

        {/* Footer with Explicit Confirmation */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleSafeClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors uppercase"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleConfirmCrop}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-black text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 rounded-xl transition-all shadow-md shadow-indigo-600/30 hover-zoom-btn disabled:opacity-50 uppercase"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>XÁC NHẬN THU PHÓNG & CẮT ẢNH</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
