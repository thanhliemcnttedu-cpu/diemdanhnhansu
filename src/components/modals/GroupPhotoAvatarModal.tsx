import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Upload, X, ZoomIn, ZoomOut, Check, Move, RotateCcw, 
  Sparkles, Loader2, Camera, RefreshCw, Users, Search, 
  CheckCircle2, AlertCircle, Eye, Trash2, ArrowRight, Crop, HelpCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Student } from '../../types';
import { playCoinSound } from '../../utils/audio';

interface Box {
  x: number;      // Natural pixel x on original image
  y: number;      // Natural pixel y on original image
  width: number;  // Natural pixel width
  height: number; // Natural pixel height
}

interface FaceAssignment {
  studentId: string;
  box: Box;
  avatarUrl: string; // Base64 dataUrl preview
}

interface GroupPhotoAvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  classNameTitle: string;
  classImage?: string;
  onSave: (assignments: Array<{ studentId: string; avatar: string }>) => Promise<void> | void;
}

export const GroupPhotoAvatarModal: React.FC<GroupPhotoAvatarModalProps> = ({
  isOpen,
  onClose,
  students,
  classNameTitle,
  classImage,
  onSave
}) => {
  // Image state
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mode, setMode] = useState<'select' | 'pan'>('select');

  // Interactive Box Drawing / Selection State
  const [activeBox, setActiveBox] = useState<Box | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ natX: number; natY: number } | null>(null);

  // Box Moving / Resizing State
  const [isDraggingBox, setIsDraggingBox] = useState(false);
  const [dragBoxStart, setDragBoxStart] = useState<{ mouseX: number; mouseY: number; box: Box } | null>(null);
  const [activeHandle, setActiveHandle] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null);

  // Pan dragging state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Face Assignments Map: studentId -> FaceAssignment
  const [assignments, setAssignments] = useState<Record<string, FaceAssignment>>({});
  const [highlightedStudentId, setHighlightedStudentId] = useState<string | null>(null);

  // Sidebar student list filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'unassigned' | 'assigned'>('all');

  // Saving state
  const [isSaving, setIsSaving] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeCropCanvasRef = useRef<HTMLCanvasElement>(null);

  // Reset or initialize when modal opens
  useEffect(() => {
    if (isOpen) {
      // If modal opens, keep state or reset if needed
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setActiveBox(null);
      setIsDrawing(false);
      setIsPanning(false);
    }
  }, [isOpen]);

  // Load natural dimensions of group photo
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgNaturalSize({
      width: img.naturalWidth,
      height: img.naturalHeight
    });
    setImageLoaded(true);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Handle uploading group photo file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp định dạng hình ảnh (.jpg, .png, .webp).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setSourceImage(result);
        setImageLoaded(false);
        setActiveBox(null);
        setAssignments({});
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Use current class image if available
  const handleUseClassImage = () => {
    if (classImage) {
      setSourceImage(classImage);
      setImageLoaded(false);
      setActiveBox(null);
      setAssignments({});
    }
  };

  // Convert mouse screen coordinates to natural image coordinates
  const getNaturalCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!imageRef.current || !imgNaturalSize.width || !imgNaturalSize.height) return null;
    const rect = imageRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    const natX = (relX / rect.width) * imgNaturalSize.width;
    const natY = (relY / rect.height) * imgNaturalSize.height;

    return {
      x: Math.max(0, Math.min(imgNaturalSize.width, natX)),
      y: Math.max(0, Math.min(imgNaturalSize.height, natY))
    };
  }, [imgNaturalSize]);

  // Crop face box from original image into high quality avatar Base64
  const cropFaceToAvatarUrl = useCallback((box: Box): string => {
    if (!imageRef.current || !imgNaturalSize.width || !imgNaturalSize.height) return '';

    const canvas = document.createElement('canvas');
    const OUTPUT_SIZE = 240; // Standard crisp avatar resolution
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Make crop square centered on the selected box with subtle padding (15%) for natural portrait
    const maxSide = Math.max(box.width, box.height);
    const paddedSide = maxSide * 1.18;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    const srcX = Math.max(0, centerX - paddedSide / 2);
    const srcY = Math.max(0, centerY - paddedSide / 2);
    const srcW = Math.min(imgNaturalSize.width - srcX, paddedSide);
    const srcH = Math.min(imgNaturalSize.height - srcY, paddedSide);

    // Fill white background for safety
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    try {
      ctx.drawImage(
        imageRef.current,
        srcX, srcY, srcW, srcH,
        0, 0, OUTPUT_SIZE, OUTPUT_SIZE
      );
      return canvas.toDataURL('image/jpeg', 0.90);
    } catch (err) {
      console.warn('cropFaceToAvatarUrl error:', err);
      return '';
    }
  }, [imgNaturalSize]);

  // Update active preview canvas whenever activeBox changes
  useEffect(() => {
    if (!activeBox || !activeCropCanvasRef.current || !imageRef.current || !imgNaturalSize.width) return;
    const canvas = activeCropCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 120;
    canvas.width = size;
    canvas.height = size;

    const maxSide = Math.max(activeBox.width, activeBox.height);
    const paddedSide = maxSide * 1.18;
    const centerX = activeBox.x + activeBox.width / 2;
    const centerY = activeBox.y + activeBox.height / 2;

    const srcX = Math.max(0, centerX - paddedSide / 2);
    const srcY = Math.max(0, centerY - paddedSide / 2);
    const srcW = Math.min(imgNaturalSize.width - srcX, paddedSide);
    const srcH = Math.min(imgNaturalSize.height - srcY, paddedSide);

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, size, size);

    try {
      ctx.drawImage(imageRef.current, srcX, srcY, srcW, srcH, 0, 0, size, size);
    } catch (_) {}
  }, [activeBox, imgNaturalSize]);

  // Mouse handlers for Drawing & Panning
  const handleMouseDown = (e: React.MouseEvent) => {
    // If clicking on a handle or moving active box, skip drawing
    if (activeHandle || isDraggingBox) return;

    if (mode === 'pan' || e.button === 1 || e.altKey) {
      // Pan mode
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (mode === 'select' && e.button === 0) {
      // Start drawing crop box
      const coords = getNaturalCoords(e.clientX, e.clientY);
      if (!coords) return;

      setIsDrawing(true);
      setDrawStart({ natX: coords.x, natY: coords.y });
      // Initiate minimal box
      setActiveBox({
        x: coords.x,
        y: coords.y,
        width: 1,
        height: 1
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // 1. Panning viewport
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
      return;
    }

    // 2. Dragging entire active box
    if (isDraggingBox && dragBoxStart && activeBox && imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      const scaleX = imgNaturalSize.width / rect.width;
      const scaleY = imgNaturalSize.height / rect.height;

      const deltaX = (e.clientX - dragBoxStart.mouseX) * scaleX;
      const deltaY = (e.clientY - dragBoxStart.mouseY) * scaleY;

      const newX = Math.max(0, Math.min(imgNaturalSize.width - activeBox.width, dragBoxStart.box.x + deltaX));
      const newY = Math.max(0, Math.min(imgNaturalSize.height - activeBox.height, dragBoxStart.box.y + deltaY));

      setActiveBox({
        ...activeBox,
        x: newX,
        y: newY
      });
      return;
    }

    // 3. Resizing active box with handles
    if (activeHandle && activeBox && imageRef.current) {
      const coords = getNaturalCoords(e.clientX, e.clientY);
      if (!coords) return;

      let { x, y, width, height } = activeBox;
      if (activeHandle === 'br') {
        width = Math.max(30, coords.x - x);
        height = Math.max(30, coords.y - y);
      } else if (activeHandle === 'bl') {
        const right = x + width;
        x = Math.max(0, Math.min(right - 30, coords.x));
        width = right - x;
        height = Math.max(30, coords.y - y);
      } else if (activeHandle === 'tr') {
        const bottom = y + height;
        y = Math.max(0, Math.min(bottom - 30, coords.y));
        height = bottom - y;
        width = Math.max(30, coords.x - x);
      } else if (activeHandle === 'tl') {
        const right = x + width;
        const bottom = y + height;
        x = Math.max(0, Math.min(right - 30, coords.x));
        y = Math.max(0, Math.min(bottom - 30, coords.y));
        width = right - x;
        height = bottom - y;
      }

      setActiveBox({ x, y, width, height });
      return;
    }

    // 4. Drawing new box
    if (isDrawing && drawStart) {
      const current = getNaturalCoords(e.clientX, e.clientY);
      if (!current) return;

      const x = Math.min(drawStart.natX, current.x);
      const y = Math.min(drawStart.natY, current.y);
      const width = Math.abs(current.x - drawStart.natX);
      const height = Math.abs(current.y - drawStart.natY);

      setActiveBox({ x, y, width, height });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDraggingBox) {
      setIsDraggingBox(false);
      setDragBoxStart(null);
      return;
    }

    if (activeHandle) {
      setActiveHandle(null);
      return;
    }

    if (isDrawing) {
      setIsDrawing(false);
      if (activeBox) {
        // If teacher just clicked without dragging (tiny box < 15px), create a nice default face box
        if (activeBox.width < 15 || activeBox.height < 15) {
          const coords = getNaturalCoords(e.clientX, e.clientY);
          if (coords) {
            // Adaptive default face box (~10% of image size or 100px)
            const defaultSize = Math.max(70, Math.min(imgNaturalSize.width, imgNaturalSize.height) * 0.12);
            setActiveBox({
              x: Math.max(0, coords.x - defaultSize / 2),
              y: Math.max(0, coords.y - defaultSize / 2),
              width: defaultSize,
              height: defaultSize
            });
          }
        }
      }
      setDrawStart(null);
    }
  };

  // Zoom handlers
  const handleZoomIn = () => setZoom(prev => Math.min(3.5, Math.round((prev + 0.25) * 100) / 100));
  const handleZoomOut = () => setZoom(prev => Math.max(0.5, Math.round((prev - 0.25) * 100) / 100));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Assign current active box to a student
  const handleAssignFaceToStudent = (student: Student) => {
    if (!activeBox) {
      alert('Vui lòng khoanh chọn khuôn mặt của học sinh trên ảnh trước.');
      return;
    }

    if (activeBox.width < 15 || activeBox.height < 15) {
      alert('Vùng khuôn mặt quá nhỏ. Vui lòng kéo một khung rõ ràng hơn.');
      return;
    }

    // Crop avatar URL
    const avatarUrl = cropFaceToAvatarUrl(activeBox);
    if (!avatarUrl) {
      alert('Không thể cắt ảnh từ vùng chọn. Vui lòng thử lại.');
      return;
    }

    setAssignments(prev => ({
      ...prev,
      [student.id]: {
        studentId: student.id,
        box: { ...activeBox },
        avatarUrl
      }
    }));

    // Audio effect & small feedback
    playCoinSound();

    // Clear active box so teacher can immediately select next student
    setActiveBox(null);
    setHighlightedStudentId(student.id);

    // Auto clear highlight after 1.5s
    setTimeout(() => {
      setHighlightedStudentId(null);
    }, 1500);
  };

  // Remove assignment for a student
  const handleRemoveAssignment = (studentId: string) => {
    setAssignments(prev => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
  };

  // Focus view onto a student's assigned face box
  const handleFocusStudentFace = (studentId: string) => {
    const item = assignments[studentId];
    if (!item || !imgNaturalSize.width || !containerRef.current) return;

    // Pan container to center on this face box
    setZoom(Math.max(1.5, zoom));
    setHighlightedStudentId(studentId);

    // Activate this box for editing if desired
    setActiveBox({ ...item.box });
  };

  // Save all assignments to classroom
  const handleSaveAll = async () => {
    const list = Object.values(assignments);
    if (list.length === 0) {
      alert('Chưa có học sinh nào được gán ảnh. Vui lòng chọn ít nhất một khuôn mặt.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = list.map(a => ({
        studentId: a.studentId,
        avatar: a.avatarUrl
      }));

      await onSave(payload);

      playCoinSound();
      confetti({
        particleCount: 70,
        spread: 80,
        origin: { y: 0.6 }
      });

      alert(`Đã lưu thành công ảnh đại diện cho ${list.length} học sinh từ ảnh tập thể!`);
      onClose();
    } catch (err) {
      console.error('Lỗi lưu ảnh đại diện tập thể:', err);
      alert('Có lỗi xảy ra khi lưu ảnh đại diện. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered students list for sidebar
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const hasAssignment = !!assignments[s.id];
      if (filterTab === 'assigned' && !hasAssignment) return false;
      if (filterTab === 'unassigned' && hasAssignment) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = s.name.toLowerCase().includes(q);
        const matchStt = s.stt.toString().includes(q);
        return matchName || matchStt;
      }
      return true;
    });
  }, [students, assignments, filterTab, searchQuery]);

  const assignedCount = Object.keys(assignments).length;
  const totalCount = students.length;
  const progressPercent = totalCount > 0 ? Math.round((assignedCount / totalCount) * 100) : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-7xl h-[94vh] flex flex-col overflow-hidden">
        
        {/* --- MODAL HEADER --- */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-white/15 flex items-center justify-center border border-white/20 shadow-xs">
              <Users className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black tracking-tight uppercase">
                  Cắt & Ghép Ảnh Đại Diện Từ Ảnh Tập Thể Cả Lớp
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black uppercase">
                  Lớp: {classNameTitle}
                </span>
              </div>
              <p className="text-xs text-emerald-100 font-medium">
                Khoanh chọn từng khuôn mặt trên ảnh tập thể ➔ Ghép với tên học sinh trong danh sách
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {sourceImage && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white border border-white/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 hover-zoom-btn"
                title="Tải lên ảnh tập thể khác"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-200" />
                <span className="hidden sm:inline">Đổi ảnh tập thể</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors hover-zoom-btn"
              title="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* --- MODAL CONTENT BODY --- */}
        {!sourceImage ? (
          /* STEP 1: UPLOAD GROUP PHOTO SCREEN */
          <div className="flex-1 p-6 sm:p-10 flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 via-white to-emerald-50/20 overflow-y-auto">
            <div className="max-w-xl w-full text-center space-y-6">
              
              <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center shadow-xl shadow-emerald-500/20 animate-bounce duration-1000">
                <Camera className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-800 uppercase tracking-tight">
                  Tải Lên Ảnh Chụp Tập Thể Cả Lớp
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">
                  Hệ thống sẽ yêu cầu thầy cô tải lên ảnh chụp tập thể của cả lớp. Sau đó thầy cô chỉ cần lần lượt chọn khuôn mặt của từng em và ghép với tên học sinh tương ứng.
                </p>
              </div>

              {/* Upload Dropzone Box */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-3 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50/80 rounded-3xl p-8 sm:p-10 text-center cursor-pointer transition-all hover-zoom-btn group relative"
              >
                <Upload className="w-12 h-12 mx-auto text-emerald-600 group-hover:scale-110 transition-transform mb-3" />
                <strong className="block text-sm sm:text-base font-black text-emerald-950 uppercase">
                  Bấm Để Chọn Ảnh Tập Thể Từ Máy Tính
                </strong>
                <p className="text-xs text-slate-500 mt-1">
                  Hỗ trợ định dạng JPG, PNG, WEBP (Khuyến khích ảnh góc rộng, rõ nét gương mặt)
                </p>
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition-colors uppercase">
                  <Upload className="w-4 h-4" />
                  <span>Chọn Tệp Ảnh Tập Thể</span>
                </div>
              </div>

              {/* Alternative: Use existing class cover image if available */}
              {classImage && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleUseClassImage}
                    className="inline-flex items-center gap-2 text-xs font-black text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 px-4 py-2 rounded-xl border border-teal-200 transition-colors"
                  >
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Dùng ảnh bìa tập thể hiện tại của lớp ({classNameTitle})</span>
                  </button>
                </div>
              )}

              {/* Helpful Tips Card */}
              <div className="p-4 bg-amber-50/80 border border-amber-200/90 rounded-2xl text-left text-xs text-amber-900 space-y-1.5 shadow-xs">
                <div className="flex items-center gap-1.5 font-black text-amber-950 uppercase text-[11px]">
                  <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Mẹo để ảnh đại diện học sinh đẹp nhất:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-700 text-[11.5px] leading-relaxed">
                  <li>Chọn ảnh chụp tập thể rõ mặt, đủ ánh sáng, không bị mờ nhòe.</li>
                  <li>Sau khi tải ảnh lên, bạn có thể <strong>phóng to (Zoom)</strong> vào từng hàng để khoanh mặt các em học sinh ở phía sau thật sắc nét.</li>
                </ul>
              </div>

            </div>
          </div>
        ) : (
          /* STEP 2: INTERACTIVE FACE CROPPING & STUDENT MATCHING STUDIO */
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
            
            {/* === LEFT COLUMN: INTERACTIVE GROUP PHOTO CANVAS (70%) === */}
            <div className="flex-1 flex flex-col bg-slate-900 border-r border-slate-200 overflow-hidden relative">
              
              {/* Photo Toolbar */}
              <div className="px-4 py-2.5 bg-slate-800/95 backdrop-blur-xs border-b border-slate-700 text-white flex flex-wrap items-center justify-between gap-2 shrink-0 z-20">
                {/* Mode Selector */}
                <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setMode('select')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${
                      mode === 'select'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                    title="Chế độ khoanh chọn khuôn mặt học sinh"
                  >
                    <Crop className="w-3.5 h-3.5 text-emerald-200" />
                    <span>✂️ Khoanh Mặt</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('pan')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${
                      mode === 'pan'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                    title="Chế độ kéo di chuyển ảnh (khi phóng to)"
                  >
                    <Move className="w-3.5 h-3.5 text-indigo-200" />
                    <span>✋ Di Chuyển Ảnh</span>
                  </button>
                </div>

                {/* Quick Hint */}
                <div className="hidden md:flex items-center gap-1.5 text-xs text-emerald-300 font-medium bg-emerald-950/60 px-3 py-1 rounded-lg border border-emerald-800">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>Kéo chuột khoanh mặt ➔ Bấm chọn học sinh bên phải để ghép</span>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center justify-center transition-colors"
                    title="Thu nhỏ"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>

                  <input
                    type="range"
                    min="0.5"
                    max="3.5"
                    step="0.1"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="w-20 sm:w-28 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />

                  <button
                    type="button"
                    onClick={handleZoomIn}
                    className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center justify-center transition-colors"
                    title="Phóng to"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={handleResetZoom}
                    className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-[10px] font-black text-slate-200 transition-colors uppercase"
                    title="Vừa khung nhìn"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                </div>
              </div>

              {/* Viewport Container */}
              <div 
                ref={containerRef}
                className={`flex-1 overflow-auto relative flex items-center justify-center p-4 select-none ${
                  mode === 'select' ? 'cursor-crosshair' : isPanning ? 'cursor-grabbing' : 'cursor-grab'
                }`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                {/* Scaled & Panned Group Photo Wrapper */}
                <div 
                  className="relative transition-transform duration-75 origin-center inline-block"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'center center'
                  }}
                >
                  <img
                    ref={imageRef}
                    src={sourceImage}
                    alt="Group Photo"
                    className="max-w-none rounded-xl shadow-2xl pointer-events-none select-none"
                    style={{
                      maxHeight: '75vh',
                      width: 'auto',
                      height: 'auto'
                    }}
                    onLoad={handleImageLoad}
                    draggable={false}
                  />

                  {/* Render ALL Assigned Faces Badges directly on the photo */}
                  {imageLoaded && imgNaturalSize.width > 0 && Object.values(assignments).map(a => {
                    const st = students.find(s => s.id === a.studentId);
                    if (!st) return null;

                    const leftPct = (a.box.x / imgNaturalSize.width) * 100;
                    const topPct = (a.box.y / imgNaturalSize.height) * 100;
                    const widthPct = (a.box.width / imgNaturalSize.width) * 100;
                    const heightPct = (a.box.height / imgNaturalSize.height) * 100;

                    const isHighlighted = highlightedStudentId === st.id;

                    return (
                      <div
                        key={st.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFocusStudentFace(st.id);
                        }}
                        style={{
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                          width: `${widthPct}%`,
                          height: `${heightPct}%`
                        }}
                        className={`absolute border-2 rounded-xl transition-all z-10 cursor-pointer group ${
                          isHighlighted
                            ? 'border-amber-400 bg-amber-400/25 ring-4 ring-amber-400/50 scale-105'
                            : 'border-emerald-400 bg-emerald-500/20 hover:border-emerald-300 hover:bg-emerald-500/30'
                        }`}
                        title={`Khuôn mặt của: ${st.name} (Bấm để xem hoặc chỉnh sửa)`}
                      >
                        {/* Circular avatar preview circle inside box */}
                        <div className="absolute inset-0 rounded-full border border-dashed border-white/60 pointer-events-none" />

                        {/* Pin Tag Badge floating above box */}
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[9.5px] font-black rounded-full shadow-md whitespace-nowrap flex items-center gap-1 border border-white/80 pointer-events-auto">
                          <span>#{st.stt}. {st.name}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveAssignment(st.id);
                            }}
                            className="w-3.5 h-3.5 rounded-full bg-white/20 hover:bg-red-500 text-white flex items-center justify-center transition-colors ml-0.5"
                            title="Hủy gán khuôn mặt này"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Render Current Active/Drawing Selection Box */}
                  {imageLoaded && activeBox && imgNaturalSize.width > 0 && (
                    <div
                      style={{
                        left: `${(activeBox.x / imgNaturalSize.width) * 100}%`,
                        top: `${(activeBox.y / imgNaturalSize.height) * 100}%`,
                        width: `${(activeBox.width / imgNaturalSize.width) * 100}%`,
                        height: `${(activeBox.height / imgNaturalSize.height) * 100}%`
                      }}
                      className="absolute border-2 border-amber-300 bg-amber-400/20 rounded-xl shadow-lg ring-2 ring-amber-400/60 z-30 select-none animate-pulse"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setIsDraggingBox(true);
                        setDragBoxStart({
                          mouseX: e.clientX,
                          mouseY: e.clientY,
                          box: { ...activeBox }
                        });
                      }}
                    >
                      {/* Avatar Round Cutout Preview Guide */}
                      <div className="absolute inset-0 rounded-full border-2 border-dashed border-white pointer-events-none" />

                      {/* Floating Indicator */}
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-amber-500 text-slate-900 text-[10px] font-black rounded-full shadow-md whitespace-nowrap pointer-events-none flex items-center gap-1">
                        <Crop className="w-3 h-3" />
                        <span>Khuôn mặt đang chọn</span>
                      </div>

                      {/* Resize Corner Handles */}
                      <div
                        onMouseDown={(e) => { e.stopPropagation(); setActiveHandle('tl'); }}
                        className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-amber-500 rounded-full cursor-nwse-resize z-40"
                      />
                      <div
                        onMouseDown={(e) => { e.stopPropagation(); setActiveHandle('tr'); }}
                        className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-amber-500 rounded-full cursor-nesw-resize z-40"
                      />
                      <div
                        onMouseDown={(e) => { e.stopPropagation(); setActiveHandle('bl'); }}
                        className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-amber-500 rounded-full cursor-nesw-resize z-40"
                      />
                      <div
                        onMouseDown={(e) => { e.stopPropagation(); setActiveHandle('br'); }}
                        className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-amber-500 rounded-full cursor-nwse-resize z-40"
                      />
                    </div>
                  )}

                </div>
              </div>

              {/* Floating Bottom Live Preview of Selected Face */}
              {activeBox && (
                <div className="absolute bottom-4 left-4 z-30 p-2.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-amber-300 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-amber-500 bg-slate-100 shadow-inner shrink-0">
                    <canvas
                      ref={activeCropCanvasRef}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="text-[11px] font-black text-slate-800 uppercase flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Khuôn mặt vừa khoanh</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Bấm vào học sinh bên phải để ghép
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveBox(null)}
                      className="text-[10px] font-bold text-red-600 hover:text-red-700 hover:underline mt-0.5 block"
                    >
                      Hủy vùng chọn này
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* === RIGHT COLUMN: STUDENT LIST & MATCHING PANEL (30%) === */}
            <div className="w-full lg:w-96 flex flex-col bg-slate-50 border-l border-slate-200 shrink-0 overflow-hidden">
              
              {/* Header Progress Card */}
              <div className="p-4 bg-white border-b border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-black uppercase text-slate-700 block">
                      Tiến Độ Ghép Ảnh
                    </span>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-2xl font-black text-emerald-600">{assignedCount}</span>
                      <span className="text-xs text-slate-500 font-bold">/ {totalCount} học sinh</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-black px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {progressPercent}%
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {/* Status Hint Callout */}
                {activeBox ? (
                  <div className="p-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl text-amber-950 text-xs font-bold flex items-center gap-2 animate-pulse">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Bấm vào học sinh bên dưới để ghép khuôn mặt!</span>
                  </div>
                ) : (
                  <div className="p-2.5 bg-indigo-50/80 border border-indigo-200 rounded-xl text-indigo-900 text-xs font-medium flex items-center gap-2">
                    <Crop className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Khoanh chọn khuôn mặt trên ảnh để bắt đầu ghép.</span>
                  </div>
                )}
              </div>

              {/* Search & Filter Toolbar */}
              <div className="p-3 bg-white border-b border-slate-200 space-y-2">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm theo tên hoặc số thứ tự..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Filter Tabs */}
                <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setFilterTab('all')}
                    className={`py-1 rounded-lg text-[10.5px] font-black transition-all ${
                      filterTab === 'all'
                        ? 'bg-white text-slate-800 shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Tất cả ({totalCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('unassigned')}
                    className={`py-1 rounded-lg text-[10.5px] font-black transition-all ${
                      filterTab === 'unassigned'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Chưa gán ({totalCount - assignedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('assigned')}
                    className={`py-1 rounded-lg text-[10.5px] font-black transition-all ${
                      filterTab === 'assigned'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Đã gán ({assignedCount})
                  </button>
                </div>
              </div>

              {/* Students Scrollable List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredStudents.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <span>Không tìm thấy học sinh phù hợp.</span>
                  </div>
                ) : (
                  filteredStudents.map(student => {
                    const assignment = assignments[student.id];
                    const isAssigned = !!assignment;
                    const isHighlighted = highlightedStudentId === student.id;

                    return (
                      <div
                        key={student.id}
                        className={`p-2.5 rounded-2xl border transition-all flex items-center justify-between gap-2.5 ${
                          isHighlighted
                            ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300 shadow-md'
                            : isAssigned
                            ? 'bg-emerald-50/60 border-emerald-200 hover:border-emerald-300'
                            : activeBox
                            ? 'bg-white border-amber-300 hover:border-amber-500 hover:bg-amber-50/40 shadow-xs cursor-pointer'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                        onClick={() => {
                          if (activeBox) {
                            handleAssignFaceToStudent(student);
                          } else if (isAssigned) {
                            handleFocusStudentFace(student.id);
                          }
                        }}
                      >
                        {/* Student Avatar / Thumbnail */}
                        <div className="relative shrink-0">
                          {isAssigned ? (
                            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-emerald-500 shadow-xs bg-white">
                              <img
                                src={assignment.avatarUrl}
                                alt={student.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400 font-black text-xs">
                              {student.stt}
                            </div>
                          )}

                          {isAssigned && (
                            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px] shadow-xs">
                              ✓
                            </span>
                          )}
                        </div>

                        {/* Student Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono font-bold text-slate-400">
                              #{student.stt}
                            </span>
                            <strong className="text-xs font-black text-slate-800 truncate">
                              {student.name}
                            </strong>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                            <span className={`px-1.5 py-0.2 rounded-md font-bold ${
                              student.gender === 'Nữ' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {student.gender}
                            </span>
                            <span>• {student.group || 'Tổ 1'}</span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="shrink-0 flex items-center gap-1">
                          {isAssigned ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFocusStudentFace(student.id);
                                }}
                                className="w-7 h-7 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 flex items-center justify-center transition-colors"
                                title="Xem vị trí khuôn mặt trên ảnh"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveAssignment(student.id);
                                }}
                                className="w-7 h-7 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 flex items-center justify-center transition-colors"
                                title="Hủy gán khuôn mặt này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : activeBox ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAssignFaceToStudent(student);
                              }}
                              className="px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-[10.5px] font-black shadow-xs flex items-center gap-1 transition-all hover-zoom-btn uppercase"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Ghép</span>
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 italic">
                              Chưa gán
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

            </div>

          </div>
        )}

        {/* --- MODAL FOOTER --- */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg">
          <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
            <span className="font-black text-slate-800">
              Đã ghép: <span className="text-emerald-600">{assignedCount}</span> / {totalCount} học sinh
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500 hidden sm:inline">
              Nhấn <strong>Xong và chọn Lưu</strong> để hoàn tất cập nhật vào danh sách lớp.
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-black text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 transition-colors uppercase hover-zoom-btn"
            >
              Đóng
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving || assignedCount === 0}
              className="px-6 py-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md shadow-emerald-600/30 transition-all hover-zoom-btn disabled:opacity-50 uppercase cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>ĐANG LƯU CÀI ĐẶT...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-emerald-200" />
                  <span>XONG & LƯU CÀI ĐẶT ({assignedCount} HS)</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
