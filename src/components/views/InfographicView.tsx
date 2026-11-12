import React, { useState, useRef, useEffect } from 'react';
import { requireLicense } from '../../utils/licenseGate';
import { useClassroom } from '../../context/ClassroomContext';
import { 
  Sparkles, Download, Printer, Settings, Check, 
  Grid3X3, Calendar, Users, Award, Heart, Phone, 
  User, CheckSquare, Layers, Eye, EyeOff, RefreshCw, FileText,
  School, BookOpen, ChevronDown, Palette, Wand2, ArrowRight,
  ShieldCheck, Star, Clock, Image as ImageIcon,
  Edit3, Trash2, ArrowUp, ArrowDown, ZoomIn, ZoomOut,
  Maximize2, Minimize2, Plus, GripVertical, Type,
  AlignLeft, AlignCenter, AlignRight, Sliders, RotateCcw,
  Move, MoveHorizontal, MoveVertical, Settings2, Crosshair, ShieldAlert
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { toPng } from 'html-to-image';
import { exportElementToPdf, exportMultipleElementsToPdf } from '../../utils/printHelper';
import { DAYS_OF_WEEK } from './ScheduleLinksView';

export type InfographicSeatingStyle = 
  | 'wood_3d' 
  | 'mint_3d' 
  | 'navy_3d' 
  | 'standard_2d' 
  | 'rainbow_2d';

export type InfographicTimetableStyle = 
  | 'pedagogical' 
  | 'rainbow' 
  | 'wood' 
  | 'sky' 
  | 'minimal';

export type InfographicPageCount = 1 | 2 | 3;
export type InfographicOrientation = 'portrait' | 'landscape';

export type LayerType = 
  | 'header' 
  | 'slogan' 
  | 'teacher_parents' 
  | 'seating' 
  | 'timetable' 
  | 'class_goals'
  | 'students' 
  | 'signatures' 
  | 'custom_text';

export interface InfographicLayer {
  id: string;
  type: LayerType;
  title: string;
  page: 1 | 2 | 3;
  order: number;
  visible: boolean;
  scale: number; // 0.75 to 1.3
  width: '100%' | '75%' | '50%';
  customContent?: {
    heading?: string;
    body?: string;
    bgColor?: string;
    textColor?: string;
    align?: 'left' | 'center' | 'right';
  };
}

export interface InfographicConfig {
  selectedClassId: string;
  pageCount: InfographicPageCount;       // 1, 2 hoặc 3 trang
  orientation: InfographicOrientation;   // 'portrait' (dọc) hoặc 'landscape' (ngang)
  includeHeader: boolean;
  includeSlogan: boolean;
  includeTeacherInfo: boolean;
  includeParentCommittee: boolean;
  includeStudentStats: boolean;
  includeSeatingChart: boolean;
  seatingChartStyle: InfographicSeatingStyle;
  includeTimetable: boolean;
  timetableStyle: InfographicTimetableStyle;
}

export const InfographicView: React.FC = () => {
  const { 
    classes, activeClassId, setActiveClassId,
    students, currentClassStudents, teacherProfile,
    seatingColumns, deskCountsPerColumn, deskNumberingOrder, seatingAssignments, teacherDeskPos, doorPos,
    timetable, timetableConfig,
    canCreateClassInfographic, updateClass
  } = useClassroom();

  // Selected class for Infographic
  const [targetClassId, setTargetClassId] = useState<string>(activeClassId || (classes[0]?.id || ''));

  useEffect(() => {
    if (activeClassId && !targetClassId) {
      setTargetClassId(activeClassId);
    }
  }, [activeClassId]);

  const targetClass = classes.find(c => c.id === targetClassId) || classes[0];

  // Filter students belonging to target class
  const classStudents = students.filter(s => s.classId === targetClass?.id);
  const maleCount = classStudents.filter(s => s.gender === 'Nam').length;
  const femaleCount = classStudents.filter(s => s.gender === 'Nữ').length;

  // Wizard / Config State
  const [config, setConfig] = useState<InfographicConfig>({
    selectedClassId: targetClass?.id || '',
    pageCount: 2, // Mặc định 2 trang A4 chuẩn đã hoàn thành
    orientation: 'portrait', // Mặc định khổ dọc
    includeHeader: true,
    includeSlogan: true,
    includeTeacherInfo: true,
    includeParentCommittee: true,
    includeStudentStats: true,
    includeSeatingChart: true,
    seatingChartStyle: 'wood_3d',
    includeTimetable: true,
    timetableStyle: 'pedagogical'
  });

  // Layer editing mode
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'all' | 'page1' | 'page2' | 'page3'>('all');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [isLayerManagerOpen, setIsLayerManagerOpen] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingPng, setIsExportingPng] = useState<boolean>(false);
  
  // A4 Fit & Spacing density state (Dàn nội dung vừa khít A4, không để giấy thừa)
  const [pageDensity, setPageDensity] = useState<'fit' | 'compact' | 'spacious'>('fit');
  const [studentListColumns, setStudentListColumns] = useState<'auto' | '1col' | '2col'>('auto');
  
  // Custom edited editable texts
  const [customSlogan, setCustomSlogan] = useState<string>(targetClass?.slogan || 'Lớp học hạnh phúc • Chăm ngoan, sáng tạo, tự tin tỏa sáng');
  const [customTeacherName, setCustomTeacherName] = useState<string>(targetClass?.teacherName || teacherProfile.name);
  const [customTeacherPhone, setCustomTeacherPhone] = useState<string>(() => {
    try { return localStorage.getItem(`lhhp_infographic_teacher_phone_${activeClassId || ''}`) || teacherProfile.phone || ''; } catch (_) { return teacherProfile.phone || ''; }
  });
  const [isClassInfoModalOpen, setIsClassInfoModalOpen] = useState(false);

  // Parent committee state (editable)
  const [parentCommittee, setParentCommittee] = useState({
    head: { name: targetClass?.parentCommittee?.head?.name || '', phone: targetClass?.parentCommittee?.head?.phone || '' },
    deputy: { name: targetClass?.parentCommittee?.deputy?.name || '', phone: targetClass?.parentCommittee?.deputy?.phone || '' },
    member1: { name: targetClass?.parentCommittee?.member1?.name || '', phone: targetClass?.parentCommittee?.member1?.phone || '' },
    member2: { name: targetClass?.parentCommittee?.member2?.name || '', phone: targetClass?.parentCommittee?.member2?.phone || '' }
  });

  useEffect(() => {
    if (targetClass) {
      if (targetClass.slogan) setCustomSlogan(targetClass.slogan);
      if (targetClass.teacherName) setCustomTeacherName(targetClass.teacherName);
      if (targetClass.parentCommittee) {
        setParentCommittee({
          head: { ...targetClass.parentCommittee.head },
          deputy: { ...targetClass.parentCommittee.deputy },
          member1: { ...targetClass.parentCommittee.member1 },
          member2: { ...targetClass.parentCommittee.member2 }
        });
      }
    }
  }, [targetClass]);

  // Mục tiêu & Quy tắc lớp học (Editable state cho Trang 1 lấp đầy chuẩn A4)
  const [classGoals, setClassGoals] = useState<{
    heading: string;
    items: { icon: string; title: string; desc: string }[];
  }>({
    heading: 'MỤC TIÊU PHẤN ĐẤU & QUY TẮC LỚP HỌC HẠNH PHÚC',
    items: [
      { icon: '🎯', title: 'HỌC TẬP CHỦ ĐỘNG', desc: '100% học sinh hoàn thành tốt nội dung học tập, tích cực phát biểu xây dựng bài' },
      { icon: '🤝', title: 'YÊU THƯƠNG ĐOÀN KẾT', desc: 'Tôn trọng, sẻ chia, không bạo lực học đường, giúp đỡ bạn bè cùng tiến bộ' },
      { icon: '🌸', title: 'KỶ LUẬT TÍCH CỰC', desc: 'Thực hiện tốt 5 điều Bác Hồ dạy, đi học đúng giờ, lễ phép với thầy cô' },
      { icon: '🌿', title: 'XANH - SẠCH - ĐẸP', desc: 'Giữ gìn vệ sinh chung, bảo quản bàn ghế thiết bị, phân loại rác đúng quy định' }
    ]
  });

  // Tự động tối ưu dàn đều nội dung vừa khít A4, không để giấy thừa
  const handleAutoFitA4 = () => {
    setPageDensity('fit');
    setSeatingTransform(prev => ({
      ...prev,
      width: config.orientation === 'landscape' ? 1040 : 760,
      minHeight: config.orientation === 'landscape' ? 580 : 780,
      isAutoWidth: true,
      isAutoHeight: true,
      scaleX: 1.0,
      scaleY: 1.0,
      offsetX: 0,
      offsetY: 0,
      rowSpacing: config.orientation === 'landscape' ? 12 : 16
    }));
    confetti({ particleCount: 40, spread: 60, origin: { y: 0.5 } });
  };

  // Seating Diagram Layout & Transform State (kéo dãn ngang, dãn dọc, thiết đặt số kích thước cụ thể, kéo di chuyển căn chỉnh vị trí trên trang)
  const [seatingTransform, setSeatingTransform] = useState<{
    width: number;        // width in px (default 760)
    minHeight: number;    // height in px (default 780-800 để vừa khít Trang 2 A4, không để giấy thừa)
    isAutoWidth: boolean; // auto 100%
    isAutoHeight: boolean;// auto height
    scaleX: number;       // dãn ngang (0.5 to 2.0, default 1.0)
    scaleY: number;       // dãn dọc (0.5 to 2.0, default 1.0)
    offsetX: number;      // px shift left/right (-400 to +400, default 0)
    offsetY: number;      // px shift up/down (-300 to +600, default 0)
    rowSpacing: number;   // row spacing gap in px (default 16)
  }>({
    width: 760,
    minHeight: 780,
    isAutoWidth: true,
    isAutoHeight: true,
    scaleX: 1.0,
    scaleY: 1.0,
    offsetX: 0,
    offsetY: 0,
    rowSpacing: 16
  });

  const [isSeatingTransformPanelOpen, setIsSeatingTransformPanelOpen] = useState<boolean>(true);
  const [isDraggingSeating, setIsDraggingSeating] = useState<boolean>(false);
  const seatingDiagramRef = useRef<HTMLDivElement>(null);

  const handleSeatingPointerDown = (
    e: React.PointerEvent,
    action: 'move' | 'stretch-width' | 'stretch-height' | 'stretch-both'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSeating(true);

    const container = seatingDiagramRef.current;
    const rect = container?.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = rect ? rect.width : (seatingTransform.isAutoWidth ? 760 : seatingTransform.width);
    const startHeight = rect ? rect.height : (seatingTransform.isAutoHeight ? 520 : seatingTransform.minHeight);
    const startOffsetX = seatingTransform.offsetX;
    const startOffsetY = seatingTransform.offsetY;

    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      if (action === 'move') {
        setSeatingTransform(prev => ({
          ...prev,
          offsetX: Math.round(startOffsetX + dx),
          offsetY: Math.round(startOffsetY + dy)
        }));
      } else if (action === 'stretch-width') {
        const newWidth = Math.max(300, Math.min(1300, Math.round(startWidth + dx)));
        setSeatingTransform(prev => ({
          ...prev,
          isAutoWidth: false,
          width: newWidth
        }));
      } else if (action === 'stretch-height') {
        const newHeight = Math.max(200, Math.min(1200, Math.round(startHeight + dy)));
        setSeatingTransform(prev => ({
          ...prev,
          isAutoHeight: false,
          minHeight: newHeight
        }));
      } else if (action === 'stretch-both') {
        const newWidth = Math.max(300, Math.min(1300, Math.round(startWidth + dx)));
        const newHeight = Math.max(200, Math.min(1200, Math.round(startHeight + dy)));
        setSeatingTransform(prev => ({
          ...prev,
          isAutoWidth: false,
          isAutoHeight: false,
          width: newWidth,
          minHeight: newHeight
        }));
      }
    };

    const onPointerUp = () => {
      setIsDraggingSeating(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Initial layer generator according to page count (Dàn đều vừa khít A4, không để giấy thừa)
  const createDefaultLayers = (pages: InfographicPageCount): InfographicLayer[] => {
    if (pages === 3) {
      // 3 Trang A4 Chuẩn Toàn Diện:
      // Trang 1: Thông tin lớp, Slogan, GVCN & Ban PH, Thời khóa biểu, Mục tiêu nề nếp
      // Trang 2: Ảnh sơ đồ chỗ ngồi đã tạo (nguyên bản, vừa khít A4) & Chữ ký xác nhận
      // Trang 3: Danh sách 100% học sinh & Chữ ký phê duyệt
      return [
        { id: 'header', type: 'header', title: '1. Đồ họa Tiêu đề & Sĩ số', page: 1, order: 1, visible: true, scale: 1, width: '100%' },
        { id: 'slogan', type: 'slogan', title: '2. Khẩu hiệu / Slogan lớp', page: 1, order: 2, visible: true, scale: 1, width: '100%' },
        { id: 'teacher_parents', type: 'teacher_parents', title: '3. GVCN & Ban Phụ Huynh', page: 1, order: 3, visible: true, scale: 1, width: '100%' },
        { id: 'timetable', type: 'timetable', title: '4. Thời Khóa Biểu Của Lớp', page: 1, order: 4, visible: true, scale: 1, width: '100%' },
        { id: 'class_goals', type: 'class_goals', title: '5. Mục Tiêu & Nề Nếp Lớp Học', page: 1, order: 5, visible: true, scale: 1, width: '100%' },
        { id: 'seating', type: 'seating', title: '6. Sơ Đồ Chỗ Ngồi Lớp Học', page: 2, order: 1, visible: true, scale: 1, width: '100%' },
        { id: 'signatures', type: 'signatures', title: '7. Chữ Ký Xác Nhận 3 Bên', page: 2, order: 2, visible: true, scale: 1, width: '100%' },
        { id: 'students', type: 'students', title: '8. Danh Sách 100% Học Sinh', page: 3, order: 1, visible: true, scale: 1, width: '100%' },
        { id: 'signatures_p3', type: 'signatures', title: '9. Chữ Ký Xác Nhận Phê Duyệt', page: 3, order: 2, visible: true, scale: 1, width: '100%' },
      ];
    } else if (pages === 2) {
      // 2 Trang A4 Chuẩn (Dàn nội dung vừa khít kích thước A4, không để giấy thừa):
      // Trang 1: Thông tin lớp, Slogan, GVCN & Ban PH, Thời khóa biểu toàn diện, Mục tiêu phấn đấu lớp học hạnh phúc
      // Trang 2: Sơ đồ chỗ ngồi nguyên bản (dàn khít A4, bàn ghế avatar rõ ràng) & Chữ ký xác nhận 3 bên
      return [
        { id: 'header', type: 'header', title: '1. Đồ họa Tiêu đề & Sĩ số', page: 1, order: 1, visible: true, scale: 1, width: '100%' },
        { id: 'slogan', type: 'slogan', title: '2. Khẩu hiệu / Slogan lớp', page: 1, order: 2, visible: true, scale: 1, width: '100%' },
        { id: 'teacher_parents', type: 'teacher_parents', title: '3. GVCN & Ban Phụ Huynh', page: 1, order: 3, visible: true, scale: 1, width: '100%' },
        { id: 'timetable', type: 'timetable', title: '4. Thời Khóa Biểu Của Lớp', page: 1, order: 4, visible: true, scale: 1, width: '100%' },
        { id: 'class_goals', type: 'class_goals', title: '5. Mục Tiêu & Nề Nếp Lớp Học', page: 1, order: 5, visible: true, scale: 1, width: '100%' },
        { id: 'seating', type: 'seating', title: '6. Sơ Đồ Chỗ Ngồi Lớp Học', page: 2, order: 1, visible: true, scale: 1, width: '100%' },
        { id: 'signatures', type: 'signatures', title: '7. Chữ Ký Xác Nhận 3 Bên', page: 2, order: 2, visible: true, scale: 1, width: '100%' },
        { id: 'students', type: 'students', title: '8. Danh Sách 100% Học Sinh', page: 2, order: 3, visible: false, scale: 1, width: '100%' },
      ];
    } else {
      // 1 Trang rút gọn:
      return [
        { id: 'header', type: 'header', title: '1. Đồ họa Tiêu đề & Sĩ số', page: 1, order: 1, visible: true, scale: 1, width: '100%' },
        { id: 'slogan', type: 'slogan', title: '2. Khẩu hiệu / Slogan lớp', page: 1, order: 2, visible: true, scale: 0.95, width: '100%' },
        { id: 'teacher_parents', type: 'teacher_parents', title: '3. GVCN & Ban Phụ Huynh', page: 1, order: 3, visible: true, scale: 0.95, width: '100%' },
        { id: 'seating', type: 'seating', title: '4. Sơ Đồ Chỗ Ngồi Lớp Học', page: 1, order: 4, visible: true, scale: 0.9, width: '100%' },
        { id: 'timetable', type: 'timetable', title: '5. Thời Khóa Biểu Của Lớp', page: 1, order: 5, visible: true, scale: 0.9, width: '100%' },
        { id: 'signatures', type: 'signatures', title: '6. Chữ Ký Xác Nhận 3 Bên', page: 1, order: 6, visible: true, scale: 0.9, width: '100%' },
      ];
    }
  };

  const [layers, setLayers] = useState<InfographicLayer[]>(() => createDefaultLayers(config.pageCount));

  // Sync layers when user changes page count in settings
  const handlePageCountChange = (newCount: InfographicPageCount) => {
    setConfig(prev => ({ ...prev, pageCount: newCount }));
    setLayers(createDefaultLayers(newCount));
    setActiveTab('all');
  };

  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  const page3Ref = useRef<HTMLDivElement>(null);

  // Layer Operations
  const moveLayer = (layerId: string, direction: 'up' | 'down') => {
    setLayers(prev => {
      const target = prev.find(l => l.id === layerId);
      if (!target) return prev;
      
      const pageLayers = prev.filter(l => l.page === target.page).sort((a, b) => a.order - b.order);
      const currentIndex = pageLayers.findIndex(l => l.id === layerId);
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      
      if (targetIndex < 0 || targetIndex >= pageLayers.length) return prev;
      
      const swapLayer = pageLayers[targetIndex];
      const newLayers = prev.map(l => {
        if (l.id === target.id) return { ...l, order: swapLayer.order };
        if (l.id === swapLayer.id) return { ...l, order: target.order };
        return l;
      });
      return newLayers;
    });
  };

  const moveLayerToPage = (layerId: string, targetPage: 1 | 2 | 3) => {
    if (targetPage > config.pageCount) return;
    setLayers(prev => {
      const pageLayers = prev.filter(l => l.page === targetPage);
      const maxOrder = pageLayers.length > 0 ? Math.max(...pageLayers.map(l => l.order)) : 0;
      return prev.map(l => l.id === layerId ? { ...l, page: targetPage, order: maxOrder + 1 } : l);
    });
  };

  const toggleLayerVisibility = (layerId: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, visible: !l.visible } : l));
  };

  const deleteLayer = (layerId: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, visible: false } : l));
  };

  const adjustLayerScale = (layerId: string, delta: number) => {
    setLayers(prev => prev.map(l => {
      if (l.id === layerId) {
        const newScale = Math.min(1.4, Math.max(0.65, Number((l.scale + delta).toFixed(2))));
        return { ...l, scale: newScale };
      }
      return l;
    }));
  };

  const adjustLayerWidth = (layerId: string, width: '100%' | '75%' | '50%') => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, width } : l));
  };

  const addCustomTextLayer = (targetPage: 1 | 2 | 3 = 1) => {
    const id = `custom_text_${Date.now()}`;
    const pageLayers = layers.filter(l => l.page === targetPage);
    const maxOrder = pageLayers.length > 0 ? Math.max(...pageLayers.map(l => l.order)) : 0;
    const newLayer: InfographicLayer = {
      id,
      type: 'custom_text',
      title: 'Khung Ghi Chú / Thông Báo Mới',
      page: targetPage,
      order: maxOrder + 1,
      visible: true,
      scale: 1,
      width: '100%',
      customContent: {
        heading: 'THÔNG BÁO / GHI CHÚ ĐẶC BIỆT CỦA LỚP',
        body: 'Nội dung nhắc nhở học sinh và phụ huynh. Có thể chỉnh sửa trực tiếp trên thiết kế.',
        bgColor: '#f8fafc',
        textColor: '#1e293b',
        align: 'left'
      }
    };
    setLayers(prev => [...prev, newLayer]);
    confetti({ particleCount: 20, spread: 40 });
  };

  // Export PDF
  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      const isLandscape = config.orientation === 'landscape';
      const orientationParam = isLandscape ? 'landscape' : 'portrait';
      const fileName = `Infographic_Lop_${targetClass?.name || '4A1'}_${config.pageCount}Trang_${config.orientation.toUpperCase()}.pdf`;
      const title = `Infographic Lớp ${targetClass?.name || '4A1'} - Năm học ${targetClass?.academicYear || teacherProfile.academicYear}`;

      const elements: HTMLElement[] = [];
      if (page1Ref.current) elements.push(page1Ref.current);
      if (config.pageCount >= 2 && page2Ref.current) elements.push(page2Ref.current);
      if (config.pageCount >= 3 && page3Ref.current) elements.push(page3Ref.current);

      if (elements.length > 0) {
        const success = await exportMultipleElementsToPdf(elements, fileName, orientationParam, title);
        if (success) {
          confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
        }
      }
    } catch (err) {
      console.error('Lỗi khi xuất PDF Infographic:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Export PNG
  const handleExportPng = async (which: 'page1' | 'page2' | 'page3' | 'all' = 'all') => {
    if (!requireLicense('Xuất ảnh infographic')) return;
    try {
      setIsExportingPng(true);

      const downloadOne = async (el: HTMLElement, pageNum: number) => {
        const dataUrl = await toPng(el, {
          quality: 0.98,
          pixelRatio: 2,
          backgroundColor: '#ffffff'
        });
        const link = document.createElement('a');
        link.download = `Infographic_Lop_${targetClass?.name || '4A1'}_Trang_${pageNum}_${config.orientation}.png`;
        link.href = dataUrl;
        link.click();
      };

      if ((which === 'page1' || which === 'all') && page1Ref.current) {
        await downloadOne(page1Ref.current, 1);
      }

      if (config.pageCount >= 2 && (which === 'page2' || which === 'all') && page2Ref.current) {
        await new Promise(r => setTimeout(r, 400));
        await downloadOne(page2Ref.current, 2);
      }

      if (config.pageCount >= 3 && (which === 'page3' || which === 'all') && page3Ref.current) {
        await new Promise(r => setTimeout(r, 400));
        await downloadOne(page3Ref.current, 3);
      }

      confetti({ particleCount: 35, spread: 60 });
    } catch (err) {
      console.error('Lỗi khi xuất ảnh Infographic:', err);
    } finally {
      setIsExportingPng(false);
    }
  };

  // Reset to default
  const handleResetToDefault = () => {
    setConfig({
      selectedClassId: targetClass?.id || '',
      pageCount: 2,
      orientation: 'portrait',
      includeHeader: true,
      includeSlogan: true,
      includeTeacherInfo: true,
      includeParentCommittee: true,
      includeStudentStats: true,
      includeSeatingChart: true,
      seatingChartStyle: 'wood_3d',
      includeTimetable: true,
      timetableStyle: 'pedagogical'
    });
    setLayers(createDefaultLayers(2));
    setCustomSlogan(targetClass?.slogan || 'Lớp học hạnh phúc • Chăm ngoan, sáng tạo, tự tin tỏa sáng');
    setCustomTeacherName(targetClass?.teacherName || teacherProfile.name);
    setCustomTeacherPhone(teacherProfile.phone || '');
    confetti({ particleCount: 25, spread: 50 });
  };

  const daysToShow = DAYS_OF_WEEK.slice(0, 5);

  // Timetable Themes
  const getTimetableThemeClasses = (style: InfographicTimetableStyle) => {
    switch (style) {
      case 'rainbow':
        return {
          header: 'bg-gradient-to-r from-violet-600 via-pink-600 to-amber-500 text-white',
          morningHeader: 'bg-amber-100 text-amber-900 border-amber-200',
          afternoonHeader: 'bg-indigo-100 text-indigo-900 border-indigo-200',
          cellBg: 'hover:bg-pink-50/50'
        };
      case 'wood':
        return {
          header: 'bg-gradient-to-r from-[#946338] via-[#7d512a] to-[#946338] text-white',
          morningHeader: 'bg-[#f4e7d4] text-[#7a4e21] border-[#cdae86]',
          afternoonHeader: 'bg-[#ebdcc8] text-[#7a4e21] border-[#cdae86]',
          cellBg: 'hover:bg-[#faf3e8]'
        };
      case 'sky':
        return {
          header: 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white',
          morningHeader: 'bg-sky-100 text-sky-900 border-sky-200',
          afternoonHeader: 'bg-cyan-100 text-cyan-900 border-cyan-200',
          cellBg: 'hover:bg-sky-50'
        };
      case 'minimal':
        return {
          header: 'bg-slate-100 text-slate-800',
          morningHeader: 'bg-slate-100 text-slate-900 border-slate-300 font-black',
          afternoonHeader: 'bg-slate-200 text-slate-900 border-slate-300 font-black',
          cellBg: 'hover:bg-slate-50'
        };
      case 'pedagogical':
      default:
        return {
          header: 'bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-500 text-white',
          morningHeader: 'bg-blue-50 text-blue-900 border-blue-200',
          afternoonHeader: 'bg-indigo-50 text-indigo-900 border-indigo-200',
          cellBg: 'hover:bg-blue-50/40'
        };
    }
  };

  const ttClasses = getTimetableThemeClasses(config.timetableStyle);

  // Seating Themes
  const getSeatingStyleClasses = (style: InfographicSeatingStyle) => {
    switch (style) {
      case 'mint_3d':
        return {
          wrap: 'bg-[#eaf7f5] border-2 border-[#2dd4bf]',
          board: 'bg-gradient-to-b from-[#0d9488] to-[#0f766e] text-white border-2 border-[#2dd4bf]',
          desk: 'bg-white border-[#5eead4] text-teal-900',
          badge: 'bg-white text-slate-800'
        };
      case 'navy_3d':
        return {
          wrap: 'bg-[#edf2fa] border-2 border-[#3b82f6]',
          board: 'bg-gradient-to-b from-[#1d4ed8] to-[#2563eb] text-white border-2 border-[#fbbf24]',
          desk: 'bg-white border-[#93c5fd] text-blue-900',
          badge: 'bg-white text-slate-800'
        };
      case 'standard_2d':
        return {
          wrap: 'bg-white border-2 border-slate-300',
          board: 'bg-emerald-800 text-white border-2 border-emerald-950',
          desk: 'bg-slate-50 border-slate-300 text-slate-800',
          badge: 'bg-slate-200 text-slate-800'
        };
      case 'rainbow_2d':
        return {
          wrap: 'bg-gradient-to-br from-indigo-50 via-pink-50 to-amber-50 border-2 border-purple-300',
          board: 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white border-2 border-amber-300',
          desk: 'bg-white/90 border-purple-200 text-purple-900',
          badge: 'bg-purple-600 text-white'
        };
      case 'wood_3d':
      default:
        return {
          wrap: 'bg-[#f4ece1] border-2 border-[#c5a880]',
          board: 'bg-gradient-to-b from-[#2f8f5b] to-[#237a4b] text-white border-2 border-[#8e6b3e]',
          desk: 'bg-[#fdf7ee] border-[#c5a880] text-[#7a4e21]',
          badge: 'bg-[#7d512a] text-white'
        };
    }
  };

  const seatingStyleConfig = getSeatingStyleClasses(config.seatingChartStyle);

  // Exact desk numbering matching Sơ Đồ Lớp
  const getDeskNumber = (colIdx: number, rowIdx: number): number => {
    if (deskNumberingOrder === 'horizontal') {
      const maxRows = Math.max(...Array.from({ length: seatingColumns }).map((_, c) => deskCountsPerColumn[c] || 4), 4);
      let count = 1;
      for (let r = 0; r < maxRows; r++) {
        for (let c = 0; c < seatingColumns; c++) {
          const colLimit = deskCountsPerColumn[c] || 4;
          if (r < colLimit) {
            if (c === colIdx && r === rowIdx) {
              return count;
            }
            count++;
          }
        }
      }
      return rowIdx + 1;
    } else {
      let prevCount = 0;
      for (let c = 0; c < colIdx; c++) {
        prevCount += (deskCountsPerColumn[c] || 4);
      }
      return prevCount + rowIdx + 1;
    }
  };

  // Dimensions based on orientation & A4 standard proportions (210mm x 297mm)
  // Portrait: max-w-[800px] min-h-[1130px] flex flex-col justify-between
  // Landscape: max-w-[1140px] min-h-[794px] flex flex-col justify-between
  const isLandscape = config.orientation === 'landscape';
  const effectiveStudentCols = studentListColumns === 'auto'
    ? (isLandscape ? 2 : 1)
    : (studentListColumns === '2col' ? 2 : 1);

  const pageContainerClass = isLandscape
    ? 'w-full max-w-[1140px] min-h-[794px] p-2.5 sm:p-5 flex flex-col justify-between shadow-2xl rounded-2xl border border-slate-300'
    : 'w-full max-w-[800px] min-h-[1130px] p-2 sm:p-6 flex flex-col justify-between shadow-2xl rounded-2xl border border-slate-300';

  // Render Layer Action Controls (Shown only when in Edit Mode)
  const renderLayerControls = (layer: InfographicLayer) => {
    if (!isEditMode) return null;
    return (
      <div className="no-print no-pdf flex items-center justify-between gap-1 p-1 bg-white/90 text-slate-800 rounded-xl shadow-md text-xs mb-2 select-none border border-slate-200 animate-in fade-in">
        <div className="flex items-center gap-1.5 pl-2 font-black text-amber-600">
          <GripVertical className="w-3.5 h-3.5 text-slate-500" />
          <span className="truncate max-w-[140px]">{layer.title}</span>
          <span className="px-1.5 py-0.2 rounded bg-indigo-500/40 text-[10px] text-white">
            Trang {layer.page} • {Math.round(layer.scale * 100)}%
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Di chuyển lên/xuống */}
          <button
            type="button"
            onClick={() => moveLayer(layer.id, 'up')}
            title="Di chuyển lên trên"
            className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => moveLayer(layer.id, 'down')}
            title="Di chuyển xuống dưới"
            className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>

          {/* Chuyển trang */}
          {config.pageCount > 1 && (
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg">
              {[1, 2, 3].slice(0, config.pageCount).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => moveLayerToPage(layer.id, p as 1 | 2 | 3)}
                  title={`Chuyển sang Trang ${p}`}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-black transition-all ${
                    layer.page === p ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  T{p}
                </button>
              ))}
            </div>
          )}

          {/* Thu nhỏ / Phóng to */}
          <button
            type="button"
            onClick={() => adjustLayerScale(layer.id, -0.05)}
            title="Thu nhỏ kích thước"
            className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => adjustLayerScale(layer.id, 0.05)}
            title="Phóng to kích thước"
            className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* Thay đổi kích thước chiều rộng */}
          <button
            type="button"
            onClick={() => adjustLayerWidth(layer.id, layer.width === '100%' ? '75%' : layer.width === '75%' ? '50%' : '100%')}
            title={`Đổi chiều rộng khung (Hiện tại: ${layer.width})`}
            className="px-1.5 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700 transition-all cursor-pointer"
          >
            {layer.width}
          </button>

          {/* Xóa thành phần */}
          <button
            type="button"
            onClick={() => deleteLayer(layer.id)}
            title="Xóa thành phần này khỏi Infographic"
            className="p-1 rounded-lg bg-rose-600/60 hover:bg-rose-700 text-white transition-all cursor-pointer ml-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  // Render Exact Seating Chart from SƠ ĐỒ LỚP (Nguyên bản sơ đồ đã tạo, cho phép kéo dãn ngang/dọc/cả 2, nhập số kích thước cụ thể, kéo di chuyển vị trí)
  const renderSeatingChartComponent = () => {
    return (
      <div className="space-y-3 flex-1 flex flex-col justify-between h-full">
        {/* THANH ĐIỀU KHIỂN KÍCH THƯỚC & VỊ TRÍ SƠ ĐỒ (Hiện khi ở Chế độ Thiết kế) */}
        {isEditMode && (
          <div className="no-print no-pdf bg-white text-slate-800 rounded-2xl p-3.5 shadow-xl border border-indigo-500/40 space-y-3 animate-in fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-xs">
                  <Move className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-amber-600 uppercase tracking-wide">
                    ĐIỀU CHỈNH KÍCH THƯỚC & VỊ TRÍ SƠ ĐỒ CHỖ NGỒI (TRANG 2 / 3)
                  </h4>
                  <p className="text-[10px] text-slate-500">
                    Kéo dãn ngang/dọc, thiết đặt số kích thước cụ thể, kéo di chuyển căn chỉnh vị trí trên trang
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsSeatingTransformPanelOpen(!isSeatingTransformPanelOpen)}
                  className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{isSeatingTransformPanelOpen ? 'Thu gọn bảng số' : 'Mở bảng số kích thước'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSeatingTransform({
                    width: 760,
                    minHeight: config.orientation === 'landscape' ? 580 : 780,
                    isAutoWidth: true,
                    isAutoHeight: true,
                    scaleX: 1.0,
                    scaleY: 1.0,
                    offsetX: 0,
                    offsetY: 0,
                    rowSpacing: config.orientation === 'landscape' ? 10 : 16
                  })}
                  className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-amber-600 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  title="Khôi phục về kích thước chuẩn ban đầu"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Đặt lại gốc</span>
                </button>
              </div>
            </div>

            {/* Quick stretch buttons */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">Kéo dãn nhanh:</span>
              <button
                type="button"
                onClick={() => setSeatingTransform({
                  width: 760,
                  minHeight: config.orientation === 'landscape' ? 580 : 800,
                  isAutoWidth: true,
                  isAutoHeight: true,
                  scaleX: 1.0,
                  scaleY: 1.0,
                  offsetX: 0,
                  offsetY: 0,
                  rowSpacing: config.orientation === 'landscape' ? 10 : 16
                })}
                className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 text-[10px] font-black shadow-xs flex items-center gap-1 cursor-pointer"
                title="Tự động mở rộng và dàn đều toàn bộ sơ đồ kín hết chiều cao và chiều rộng trang A4"
              >
                <span>👑 Dàn Đều Vừa Khít Trang A4</span>
              </button>
              <button
                type="button"
                onClick={() => setSeatingTransform(prev => ({ ...prev, isAutoWidth: true, scaleX: 1.0 }))}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
              >
                ↔ Chiều ngang 100%
              </button>
              <button
                type="button"
                onClick={() => setSeatingTransform(prev => ({
                  ...prev,
                  isAutoWidth: false,
                  width: prev.isAutoWidth ? 820 : prev.width + 30
                }))}
                className="px-2 py-1 rounded-lg bg-indigo-600/60 hover:bg-indigo-800 text-white text-[10px] font-bold"
              >
                + Kéo rộng (+30px)
              </button>
              <button
                type="button"
                onClick={() => setSeatingTransform(prev => ({
                  ...prev,
                  isAutoWidth: false,
                  width: Math.max(350, (prev.isAutoWidth ? 760 : prev.width) - 30)
                }))}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
              >
                - Thu hẹp (-30px)
              </button>
              <button
                type="button"
                onClick={() => setSeatingTransform(prev => ({
                  ...prev,
                  isAutoHeight: false,
                  minHeight: (prev.isAutoHeight ? 520 : prev.minHeight) + 40,
                  rowSpacing: Math.min(24, prev.rowSpacing + 2)
                }))}
                className="px-2 py-1 rounded-lg bg-emerald-600/60 hover:bg-emerald-800 text-white text-[10px] font-bold"
              >
                ↕ Kéo cao (+40px)
              </button>
              <button
                type="button"
                onClick={() => setSeatingTransform(prev => ({
                  ...prev,
                  isAutoHeight: false,
                  minHeight: Math.max(250, (prev.isAutoHeight ? 520 : prev.minHeight) - 40),
                  rowSpacing: Math.max(4, prev.rowSpacing - 2)
                }))}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
              >
                ↕ Thu ngắn (-40px)
              </button>
              <button
                type="button"
                onClick={() => setSeatingTransform(prev => ({
                  ...prev,
                  scaleX: Number((prev.scaleX + 0.1).toFixed(2)),
                  scaleY: Number((prev.scaleY + 0.1).toFixed(2))
                }))}
                className="px-2 py-1 rounded-lg bg-purple-600/60 hover:bg-purple-800 text-white text-[10px] font-bold"
              >
                ⤡ Phóng to cả 2 (+10%)
              </button>
              <button
                type="button"
                onClick={() => setSeatingTransform(prev => ({
                  ...prev,
                  scaleX: Math.max(0.6, Number((prev.scaleX - 0.1).toFixed(2))),
                  scaleY: Math.max(0.6, Number((prev.scaleY - 0.1).toFixed(2)))
                }))}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
              >
                ⤡ Thu nhỏ cả 2 (-10%)
              </button>
            </div>

            {/* Căn chỉnh vị trí trên trang */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1 border-t border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">Căn vị trí trên trang:</span>
              <button
                type="button"
                onClick={() => setSeatingTransform(prev => ({ ...prev, offsetX: -60 }))}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
              >
                ⬅ Căn Trái
              </button>
              <button
                type="button"
                onClick={() => setSeatingTransform(prev => ({ ...prev, offsetX: 0 }))}
                className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold"
              >
                ↔ Căn Giữa Ngang
              </button>
              <button
                type="button"
                onClick={() => setSeatingTransform(prev => ({ ...prev, offsetX: 60 }))}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
              >
                ➡ Căn Phải
              </button>
              <button
                type="button"
                onClick={() => setSeatingTransform(prev => ({ ...prev, offsetY: -50 }))}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
              >
                ⬆ Dịch Lên Trên
              </button>
              <button
                type="button"
                onClick={() => setSeatingTransform(prev => ({ ...prev, offsetY: 0 }))}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
              >
                ↕ Giữa Dọc (Y=0)
              </button>
              <button
                type="button"
                onClick={() => setSeatingTransform(prev => ({ ...prev, offsetY: 60 }))}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
              >
                ⬇ Dịch Xuống Dưới
              </button>
            </div>

            {/* BẢNG THIẾT ĐẶT SỐ KÍCH THƯỚC CỤ THỂ (Inputs) */}
            {isSeatingTransformPanelOpen && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-200 text-[11px]">
                {/* 1. Chiều rộng cụ thể */}
                <div className="bg-slate-100/80 p-2 rounded-xl border border-slate-200 space-y-1">
                  <label className="text-slate-500 font-bold block text-[10px]">
                    Chiều Ngang Rộng (px):
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={300}
                      max={1400}
                      step={10}
                      value={seatingTransform.isAutoWidth ? 760 : seatingTransform.width}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 760;
                        setSeatingTransform(prev => ({ ...prev, isAutoWidth: false, width: val }));
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-800 font-mono font-bold text-xs"
                    />
                    <span className="text-[10px] text-slate-500">px</span>
                  </div>
                </div>

                {/* 2. Chiều dọc cụ thể */}
                <div className="bg-slate-100/80 p-2 rounded-xl border border-slate-200 space-y-1">
                  <label className="text-slate-500 font-bold block text-[10px]">
                    Chiều Dọc Cao (px):
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={200}
                      max={1300}
                      step={10}
                      value={seatingTransform.isAutoHeight ? 520 : seatingTransform.minHeight}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 520;
                        setSeatingTransform(prev => ({ ...prev, isAutoHeight: false, minHeight: val }));
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-800 font-mono font-bold text-xs"
                    />
                    <span className="text-[10px] text-slate-500">px</span>
                  </div>
                </div>

                {/* 3. Tỉ lệ dãn ngang Scale X */}
                <div className="bg-slate-100/80 p-2 rounded-xl border border-slate-200 space-y-1">
                  <label className="text-slate-500 font-bold block text-[10px]">
                    Tỉ Lệ Dãn Ngang Scale X (%):
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={50}
                      max={200}
                      step={5}
                      value={Math.round(seatingTransform.scaleX * 100)}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 100;
                        setSeatingTransform(prev => ({ ...prev, scaleX: val / 100 }));
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-800 font-mono font-bold text-xs"
                    />
                    <span className="text-[10px] text-slate-500">%</span>
                  </div>
                </div>

                {/* 4. Tỉ lệ dãn dọc Scale Y */}
                <div className="bg-slate-100/80 p-2 rounded-xl border border-slate-200 space-y-1">
                  <label className="text-slate-500 font-bold block text-[10px]">
                    Tỉ Lệ Dãn Dọc Scale Y (%):
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={50}
                      max={200}
                      step={5}
                      value={Math.round(seatingTransform.scaleY * 100)}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 100;
                        setSeatingTransform(prev => ({ ...prev, scaleY: val / 100 }));
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-800 font-mono font-bold text-xs"
                    />
                    <span className="text-[10px] text-slate-500">%</span>
                  </div>
                </div>

                {/* 5. Tọa độ X vị trí */}
                <div className="bg-slate-100/80 p-2 rounded-xl border border-slate-200 space-y-1">
                  <label className="text-slate-500 font-bold block text-[10px]">
                    Độ Lệch Ngang X (px):
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={-400}
                      max={400}
                      step={5}
                      value={seatingTransform.offsetX}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setSeatingTransform(prev => ({ ...prev, offsetX: val }));
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-800 font-mono font-bold text-xs"
                    />
                    <span className="text-[10px] text-slate-500">px</span>
                  </div>
                </div>

                {/* 6. Tọa độ Y vị trí */}
                <div className="bg-slate-100/80 p-2 rounded-xl border border-slate-200 space-y-1">
                  <label className="text-slate-500 font-bold block text-[10px]">
                    Độ Lệch Dọc Y (px):
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={-300}
                      max={600}
                      step={5}
                      value={seatingTransform.offsetY}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setSeatingTransform(prev => ({ ...prev, offsetY: val }));
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-800 font-mono font-bold text-xs"
                    />
                    <span className="text-[10px] text-slate-500">px</span>
                  </div>
                </div>

                {/* 7. Giãn khoảng cách các hàng bàn */}
                <div className="col-span-2 bg-slate-100/80 p-2 rounded-xl border border-slate-200 space-y-1">
                  <label className="text-slate-500 font-bold block text-[10px]">
                    Độ Giãn Khoảng Cách Các Hàng Bàn (px):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={4}
                      max={26}
                      step={1}
                      value={seatingTransform.rowSpacing}
                      onChange={(e) => setSeatingTransform(prev => ({ ...prev, rowSpacing: parseInt(e.target.value) }))}
                      className="flex-1 accent-indigo-500"
                    />
                    <span className="font-mono font-bold text-xs text-amber-600 w-8 text-right">
                      {seatingTransform.rowSpacing}px
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* KHUNG SƠ ĐỒ CHỖ NGỒI (Áp dụng Transform & Dàn đều vừa khít Trang 2 A4) */}
        <div 
          className="relative transition-all duration-75 flex-1 flex flex-col justify-between w-full h-full"
          style={{
            transform: `translate(${seatingTransform.offsetX}px, ${seatingTransform.offsetY}px) scale(${seatingTransform.scaleX}, ${seatingTransform.scaleY})`,
            transformOrigin: 'top center',
            width: seatingTransform.isAutoWidth ? '100%' : `${seatingTransform.width}px`,
            maxWidth: '100%',
            margin: '0 auto',
            flex: 1
          }}
        >
          {/* SƠ ĐỒ GỐC NGUYÊN BẢN */}
          <div 
            ref={seatingDiagramRef}
            className={`p-1.5 sm:p-4 rounded-2xl ${seatingStyleConfig.wrap} shadow-sm space-y-1.5 sm:space-y-3 relative group select-none flex-1 flex flex-col justify-between w-full h-full`}
            style={{
              minHeight: seatingTransform.isAutoHeight 
                ? (config.orientation === 'landscape' ? '580px' : '780px') 
                : `${seatingTransform.minHeight}px`
            }}
          >
            {/* THANH KÉO DI CHUYỂN VỊ TRÍ SƠ ĐỒ TRÊN TRANG (MOVE HANDLE) */}
            {isEditMode && (
              <div
                onPointerDown={(e) => handleSeatingPointerDown(e, 'move')}
                className="no-print no-pdf p-1.5 rounded-xl bg-white/90 hover:bg-slate-100 text-slate-800 text-[10px] font-bold flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing border border-indigo-400/50 shadow-md select-none transition-all"
                title="Bấm giữ chuột và kéo để di chuyển sơ đồ tới vị trí mong muốn trên trang"
              >
                <div className="flex items-center gap-1.5 text-amber-600">
                  <Move className="w-3.5 h-3.5" />
                  <span>✥ GIỮ & KÉO ĐỂ DI CHUYỂN VỊ TRÍ SƠ ĐỒ TRÊN TRANG</span>
                </div>
                <div className="text-[9px] text-slate-600 font-mono">
                  X: {seatingTransform.offsetX}px • Y: {seatingTransform.offsetY}px
                </div>
              </div>
            )}

            {/* Tiêu đề & Thông tin Sơ đồ */}
            <div className="flex items-center justify-between text-[10px] sm:text-xs font-black uppercase gap-1 flex-wrap">
              <div className="flex items-center gap-1 text-slate-900">
                <Grid3X3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 shrink-0" />
                <span className="truncate">SƠ ĐỒ CHỖ NGỒI ({seatingColumns} DÃY BÀN)</span>
              </div>
              <div className="flex items-center gap-1 text-[8.5px] sm:text-[10px] font-bold">
                <span className="px-1.5 py-0.2 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 whitespace-nowrap">
                  {deskNumberingOrder === 'vertical' ? 'Đánh số dọc' : 'Đánh số ngang'}
                </span>
                <span className="px-1.5 py-0.2 rounded-md bg-white border border-slate-200 text-slate-700 whitespace-nowrap hidden sm:inline-block">
                  {config.seatingChartStyle.includes('3d') ? 'Phối cảnh 3D Bàn Gỗ' : 'Sơ đồ 2D Sư Phạm'}
                </span>
              </div>
            </div>

            {/* BỤC GIẢNG CHÍNH ĐỒNG BỘ 100% VỚI MỤC SƠ ĐỒ LỚP */}
            <div className="grid grid-cols-12 gap-1 sm:gap-2 items-center text-[8px] sm:text-[10px] font-bold">
              {/* Cột Trái */}
              <div className={`col-span-3 py-1 sm:py-1.5 text-center rounded-lg sm:rounded-xl shadow-2xs border truncate ${
                doorPos === 'left' 
                  ? 'bg-amber-100 border-amber-300 text-amber-900 font-black' 
                  : teacherDeskPos === 'left' 
                  ? 'bg-amber-50 border-amber-300 text-amber-900 font-black' 
                  : 'bg-white border-slate-200 text-slate-700'
              }`}>
                {doorPos === 'left' ? '🚪 CỬA RA VÀO' : (teacherDeskPos === 'left' ? '⭐ BÀN GV' : '⭐ BỤC GIẢNG')}
              </div>

              {/* Bảng Lớp Xanh Ở Giữa */}
              <div className={`col-span-6 py-1.5 sm:py-2 text-center rounded-lg sm:rounded-xl font-black tracking-wide shadow-xs truncate text-[9px] sm:text-xs ${seatingStyleConfig.board}`}>
                ★ BẢNG LỚP HỌC HẠNH PHÚC ★
              </div>

              {/* Cột Phải */}
              <div className={`col-span-3 py-1 sm:py-1.5 text-center rounded-lg sm:rounded-xl shadow-2xs border truncate ${
                doorPos === 'right' 
                  ? 'bg-amber-100 border-amber-300 text-amber-900 font-black' 
                  : teacherDeskPos === 'right' 
                  ? 'bg-amber-50 border-amber-300 text-amber-900 font-black' 
                  : 'bg-white border-slate-200 text-slate-700'
              }`}>
                {doorPos === 'right' ? '🚪 CỬA RA VÀO' : (teacherDeskPos === 'right' ? '⭐ BÀN GV' : '⭐ BỤC GIẢNG')}
              </div>
            </div>

            {/* LƯỚI CÁC DÃY BÀN & CHỖ NGỒI HỌC SINH (NGUYÊN BẢN TỪ MỤC SƠ ĐỒ LỚP - DÀN ĐỀU 100% CHIỀU CAO TRANG) */}
            <div 
              className="grid gap-1 sm:gap-2.5 pt-1 flex-1 items-stretch"
              style={{
                gridTemplateColumns: `repeat(${seatingColumns}, minmax(0, 1fr))`
              }}
            >
              {Array.from({ length: seatingColumns }).map((_, colIdx) => {
                const colDeskCount = deskCountsPerColumn[colIdx] || 4;
                return (
                  <div key={colIdx} className="space-y-1 sm:space-y-2 p-1 sm:p-2.5 rounded-lg sm:rounded-xl bg-white/85 border border-slate-200 shadow-2xs flex flex-col justify-between flex-1 min-w-0">
                    {/* Column Badge */}
                    <div className={`text-center py-0.5 sm:py-1 text-[8.5px] sm:text-[10px] font-black rounded-md sm:rounded-lg flex items-center justify-between px-1 sm:px-2 ${seatingStyleConfig.badge}`}>
                      <span>DÃY {colIdx + 1}</span>
                      <span className="text-[7.5px] sm:text-[9px] opacity-90">{colDeskCount} bàn</span>
                    </div>

                    {/* Rows for this column with dynamic row spacing */}
                    <div 
                      className="flex-1 flex flex-col justify-between pt-0.5"
                      style={{ gap: `${Math.max(4, Math.min(seatingTransform.rowSpacing, 16))}px` }}
                    >
                      {Array.from({ length: colDeskCount }).map((_, rIdx) => {
                        const deskNumber = getDeskNumber(colIdx, rIdx);
                        const seatLKey = `${colIdx}-${rIdx}-0`;
                        const seatRKey = `${colIdx}-${rIdx}-1`;
                        const sLId = seatingAssignments[seatLKey];
                        const sRId = seatingAssignments[seatRKey];
                        const sL = classStudents.find(s => s.id === sLId);
                        const sR = classStudents.find(s => s.id === sRId);

                        return (
                          <div key={rIdx} className={`p-1 sm:p-2 rounded-lg sm:rounded-xl border ${seatingStyleConfig.desk} shadow-2xs space-y-0.5 sm:space-y-1 flex flex-col justify-between flex-1 min-w-0`}>
                            {/* Desk Header Badge */}
                            <div className="flex items-center justify-between text-[7px] sm:text-[8.5px] font-black text-slate-500 px-0.5 sm:px-1 border-b border-slate-200/60 pb-0.5">
                              <span className="text-amber-800">BÀN {deskNumber}</span>
                              <span>Hàng {rIdx + 1}</span>
                            </div>

                            {/* 2 Chỗ ngồi: Ghế Trái & Ghế Phải (Chỉ hiển thị Ảnh Avatar & Họ và Tên, KHÔNG hiển thị xu) */}
                            <div className="grid grid-cols-2 gap-0.5 sm:gap-1.5 flex-1 items-stretch">
                              {/* Ghế Trái */}
                              <div className={`p-0.5 sm:p-1.5 rounded sm:rounded-lg border text-center flex flex-col items-center justify-center transition-all min-w-0 ${
                                sL ? 'bg-white border-amber-200 shadow-2xs' : 'border-dashed border-slate-200 bg-slate-50/60'
                              }`}>
                                {sL ? (
                                  <>
                                    <img
                                      src={sL.avatar}
                                      alt={sL.name}
                                      className="w-6 h-6 sm:w-9 sm:h-9 rounded-full object-cover border border-amber-300 bg-sky-100 shadow-2xs mb-0.5 shrink-0"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=100&auto=format&fit=crop&q=80';
                                      }}
                                    />
                                    <span className="text-[7.5px] sm:text-[9.5px] font-black text-slate-900 line-clamp-2 leading-[1.1] text-center px-0.5 break-words w-full" title={sL.name}>
                                      {sL.name}
                                    </span>
                                  </>
                                ) : (
                                  <div className="py-0.5 sm:py-1 text-center text-slate-400">
                                    <Users className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 mx-auto opacity-40 mb-0.5" />
                                    <span className="text-[6.5px] sm:text-[8px] font-medium block">Ghế Trái</span>
                                  </div>
                                )}
                              </div>

                              {/* Ghế Phải */}
                              <div className={`p-0.5 sm:p-1.5 rounded sm:rounded-lg border text-center flex flex-col items-center justify-center transition-all min-w-0 ${
                                sR ? 'bg-white border-amber-200 shadow-2xs' : 'border-dashed border-slate-200 bg-slate-50/60'
                              }`}>
                                {sR ? (
                                  <>
                                    <img
                                      src={sR.avatar}
                                      alt={sR.name}
                                      className="w-6 h-6 sm:w-9 sm:h-9 rounded-full object-cover border border-amber-300 bg-sky-100 shadow-2xs mb-0.5 shrink-0"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=100&auto=format&fit=crop&q=80';
                                      }}
                                    />
                                    <span className="text-[7.5px] sm:text-[9.5px] font-black text-slate-900 line-clamp-2 leading-[1.1] text-center px-0.5 break-words w-full" title={sR.name}>
                                      {sR.name}
                                    </span>
                                  </>
                                ) : (
                                  <div className="py-0.5 sm:py-1 text-center text-slate-400">
                                    <Users className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 mx-auto opacity-40 mb-0.5" />
                                    <span className="text-[6.5px] sm:text-[8px] font-medium block">Ghế Phải</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Tựa ghế gỗ 3D dưới bàn */}
                            <div className="flex justify-around px-2 pt-0.5">
                              <div className="w-7 h-1.5 rounded-b bg-[#c5a880] border border-[#a38054]/50"></div>
                              <div className="w-7 h-1.5 rounded-b bg-[#c5a880] border border-[#a38054]/50"></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* INTERACTIVE RESIZE HANDLES TRÊN VIỀN KHUNG (HIỂN THỊ KHI CHỈNH SỬA) */}
            {isEditMode && (
              <>
                {/* 1. Mép phải: Kéo dãn chiều ngang */}
                <div
                  onPointerDown={(e) => handleSeatingPointerDown(e, 'stretch-width')}
                  className="no-print no-pdf absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-6 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center cursor-ew-resize shadow-lg z-20 transition-all hover:scale-110 active:scale-95"
                  title="⇄ Bấm giữ và kéo sang ngang để dãn rộng hoặc thu hẹp sơ đồ"
                >
                  <MoveHorizontal className="w-4 h-4 text-white pointer-events-none" />
                </div>

                {/* 2. Mép đáy: Kéo dãn chiều dọc */}
                <div
                  onPointerDown={(e) => handleSeatingPointerDown(e, 'stretch-height')}
                  className="no-print no-pdf absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 h-6 w-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full flex items-center justify-center cursor-ns-resize shadow-lg z-20 transition-all hover:scale-110 active:scale-95"
                  title="↕ Bấm giữ và kéo xuống dưới để dãn cao hoặc thu ngắn sơ đồ"
                >
                  <MoveVertical className="w-4 h-4 text-white pointer-events-none" />
                </div>

                {/* 3. Góc dưới phải: Kéo dãn cả 2 chiều */}
                <div
                  onPointerDown={(e) => handleSeatingPointerDown(e, 'stretch-both')}
                  className="no-print no-pdf absolute bottom-0 right-0 translate-x-1/3 translate-y-1/3 w-8 h-8 bg-purple-600 hover:bg-purple-700 text-white rounded-full flex items-center justify-center cursor-nwse-resize shadow-xl z-30 transition-all hover:scale-115 active:scale-95"
                  title="⤡ Bấm giữ và kéo chéo góc để dãn đồng thời cả 2 chiều ngang và dọc"
                >
                  <Maximize2 className="w-4 h-4 text-white pointer-events-none" />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render Individual Layer Content
  const renderLayerContent = (layer: InfographicLayer) => {
    switch (layer.type) {
      case 'header':
        return (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-500 text-white p-5 shadow-md">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] uppercase tracking-wider">
                    INFOGRAPHIC LỚP HỌC HẠNH PHÚC
                  </span>
                  <span className="text-white text-xs font-bold">
                    • {targetClass?.academicYear || teacherProfile.academicYear}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                  <span>LỚP {targetClass?.name}</span>
                  <span className="text-sm font-bold text-white bg-white/20 px-2.5 py-0.5 rounded-xl">
                    {targetClass?.grade || 'Khối 4'}
                  </span>
                </h1>
                <p className="text-xs text-white font-medium">
                  {teacherProfile.schoolName || 'Trường học'}
                </p>
              </div>

              {/* Sĩ số Badge */}
              <div className="bg-white/15 backdrop-blur-md rounded-2xl p-3 border border-white/20 flex items-center gap-3">
                <div className="text-center px-2">
                  <div className="text-2xl font-black text-amber-300 font-mono">
                    {classStudents.length}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-white font-bold">
                    Học sinh
                  </div>
                </div>
                <div className="h-8 w-px bg-white/30"></div>
                <div className="text-xs space-y-0.5 text-white">
                  <div>👦 Nam: <strong>{maleCount}</strong></div>
                  <div>👧 Nữ: <strong>{femaleCount}</strong></div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'slogan':
        return (
          <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 border-2 border-dashed border-amber-300 rounded-2xl p-3 text-center shadow-2xs group relative">
            <div className="text-[11px] font-black uppercase text-amber-800 tracking-wider flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>SLOGAN & PHƯƠNG CHÂM HÀNH ĐỘNG</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            </div>
            {isEditMode ? (
              <input
                type="text"
                value={customSlogan}
                onChange={(e) => setCustomSlogan(e.target.value)}
                placeholder="Nhập khẩu hiệu slogan của lớp..."
                className="w-full text-center text-sm sm:text-base font-black text-[#78350f] mt-1 italic bg-amber-100/70 border border-amber-300 rounded-xl px-2 py-1 focus:ring-2 focus:ring-amber-500"
              />
            ) : (
              <div className="text-sm sm:text-base font-black text-[#78350f] mt-0.5 italic">
                "{customSlogan}"
              </div>
            )}
          </div>
        );

      case 'teacher_parents':
        return (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
            {/* THÔNG TIN GIÁO VIÊN */}
            <div className="md:col-span-5 p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-black text-indigo-950 uppercase">
                <User className="w-3.5 h-3.5 text-indigo-600" />
                <span>Giáo Viên Chủ Nhiệm</span>
              </div>

              <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-indigo-100 shadow-2xs">
                <img
                  src={teacherProfile.avatar}
                  alt="Avatar Giáo viên"
                  className="w-14 h-14 rounded-xl object-cover border-2 border-indigo-300 shadow-xs"
                />
                <div className="min-w-0 flex-1">
                  {isEditMode ? (
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={customTeacherName}
                        onChange={(e) => setCustomTeacherName(e.target.value)}
                        placeholder="Họ tên GV..."
                        className="text-xs font-black text-slate-900 w-full border border-indigo-200 rounded px-1.5 py-0.5"
                      />
                      <input
                        type="text"
                        value={customTeacherPhone}
                        onChange={(e) => setCustomTeacherPhone(e.target.value)}
                        placeholder="Số ĐT..."
                        className="text-[10px] text-slate-600 w-full border border-indigo-200 rounded px-1.5 py-0.5"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-black text-slate-900 truncate">
                        {customTeacherName ? (customTeacherName.startsWith('Cô ') ? customTeacherName : `Cô ${customTeacherName}`) : `Cô ${teacherProfile.name}`}
                      </div>
                      <div className="text-[11px] text-indigo-700 font-bold">
                        {teacherProfile.role || 'Giáo viên phụ trách lớp'}
                      </div>
                      {customTeacherPhone && (
                        <div className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-500" />
                          <span>{customTeacherPhone}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* BAN ĐẠI DIỆN CHA MẸ HỌC SINH */}
            <div className="md:col-span-7 p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200/80 space-y-2">
              <div className="flex items-center justify-between text-xs font-black text-rose-950 uppercase">
                <div className="flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-rose-600" />
                  <span>Ban Đại Diện Cha Mẹ Học Sinh Lớp</span>
                </div>
                <span className="text-[10px] text-rose-600 font-bold bg-white px-2 py-0.5 rounded-full border border-rose-200">
                  {[parentCommittee.head, parentCommittee.deputy, parentCommittee.member1, parentCommittee.member2].filter(m => m.name).length || 4} Thành viên
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {/* Trưởng ban */}
                <div className="bg-white p-2 rounded-xl border border-rose-100 shadow-2xs">
                  <span className="text-[10px] font-black text-rose-700 uppercase block">Trưởng Ban PH:</span>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={parentCommittee.head.name}
                      onChange={(e) => setParentCommittee(prev => ({ ...prev, head: { ...prev.head, name: e.target.value } }))}
                      className="font-bold text-xs w-full border border-rose-200 rounded px-1"
                    />
                  ) : (
                    parentCommittee.head.name
                      ? <div className="font-bold text-slate-900 truncate">{parentCommittee.head.name}</div>
                      : <div className="mt-2 border-b border-dotted border-slate-400 h-3" aria-label="Chỗ ghi tên" />
                  )}
                  {parentCommittee.head.phone && <div className="text-slate-600 font-mono text-[10px]">☎ {parentCommittee.head.phone}</div>}
                </div>

                {/* Phó ban */}
                <div className="bg-white p-2 rounded-xl border border-rose-100 shadow-2xs">
                  <span className="text-[10px] font-black text-amber-700 uppercase block">Phó Ban PH:</span>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={parentCommittee.deputy.name}
                      onChange={(e) => setParentCommittee(prev => ({ ...prev, deputy: { ...prev.deputy, name: e.target.value } }))}
                      className="font-bold text-xs w-full border border-rose-200 rounded px-1"
                    />
                  ) : (
                    parentCommittee.deputy.name
                      ? <div className="font-bold text-slate-900 truncate">{parentCommittee.deputy.name}</div>
                      : <div className="mt-2 border-b border-dotted border-slate-400 h-3" aria-label="Chỗ ghi tên" />
                  )}
                  {parentCommittee.deputy.phone && <div className="text-slate-600 font-mono text-[10px]">☎ {parentCommittee.deputy.phone}</div>}
                </div>

                {/* Ủy viên 1 */}
                <div className="bg-white p-2 rounded-xl border border-rose-100 shadow-2xs">
                  <span className="text-[10px] font-black text-slate-600 uppercase block">Ủy Viên 1:</span>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={parentCommittee.member1.name}
                      onChange={(e) => setParentCommittee(prev => ({ ...prev, member1: { ...prev.member1, name: e.target.value } }))}
                      className="font-bold text-xs w-full border border-rose-200 rounded px-1"
                    />
                  ) : (
                    parentCommittee.member1.name
                      ? <div className="font-bold text-slate-900 truncate">{parentCommittee.member1.name}</div>
                      : <div className="mt-2 border-b border-dotted border-slate-400 h-3" aria-label="Chỗ ghi tên" />
                  )}
                  {parentCommittee.member1.phone && <div className="text-slate-600 font-mono text-[10px]">☎ {parentCommittee.member1.phone}</div>}
                </div>

                {/* Ủy viên 2 */}
                <div className="bg-white p-2 rounded-xl border border-rose-100 shadow-2xs">
                  <span className="text-[10px] font-black text-slate-600 uppercase block">Ủy Viên 2:</span>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={parentCommittee.member2.name}
                      onChange={(e) => setParentCommittee(prev => ({ ...prev, member2: { ...prev.member2, name: e.target.value } }))}
                      className="font-bold text-xs w-full border border-rose-200 rounded px-1"
                    />
                  ) : (
                    parentCommittee.member2.name
                      ? <div className="font-bold text-slate-900 truncate">{parentCommittee.member2.name}</div>
                      : <div className="mt-2 border-b border-dotted border-slate-400 h-3" aria-label="Chỗ ghi tên" />
                  )}
                  {parentCommittee.member2.phone && <div className="text-slate-600 font-mono text-[10px]">☎ {parentCommittee.member2.phone}</div>}
                </div>
              </div>
            </div>
          </div>
        );

      case 'seating':
        return renderSeatingChartComponent();

      case 'timetable': {
        // Số tiết & khung giờ lấy đúng theo cài đặt ở mục Thời khóa biểu (nếu có)
        let savedTkb: any = null;
        try { savedTkb = JSON.parse(localStorage.getItem(`lop_hoc_tkb_settings_${targetClass?.id}`) || 'null'); } catch (_) { savedTkb = null; }
        const morningCount = Math.max(1, Math.min(6, timetableConfig?.morningPeriods || 5));
        const afternoonCount = Math.max(0, Math.min(5, timetableConfig?.afternoonPeriods ?? 4));
        const periodTimesMorning: string[] = Array.isArray(savedTkb?.morningTimes) && savedTkb.morningTimes.length ? savedTkb.morningTimes : ['07:45 - 08:25', '08:30 - 09:10', '09:35 - 10:15', '10:20 - 11:00', '11:05 - 11:45', ''];
        const periodTimesAfternoon: string[] = Array.isArray(savedTkb?.afternoonTimes) && savedTkb.afternoonTimes.length ? savedTkb.afternoonTimes : ['14:00 - 14:40', '14:45 - 15:25', '15:40 - 16:20', '16:25 - 17:00', ''];
        const morningList = Array.from({ length: morningCount }, (_, i) => i + 1);
        const afternoonList = Array.from({ length: afternoonCount }, (_, i) => i + 1);
        const hasAnySubject = timetable.some(t => (!t.classId || t.classId === targetClass?.id) && t.subject && t.subject !== '—');

        const getSubjectBadge = (subject: string | undefined) => {
          if (!subject || subject === '—') return <span className="text-slate-500 font-normal">—</span>;
          let colorClass = 'bg-slate-100 text-slate-700';
          if (subject.includes('Toán')) colorClass = 'bg-blue-100/90 text-blue-900 border border-blue-200/80 font-bold';
          else if (subject.includes('Tiếng Việt') || subject.includes('Tập đọc') || subject.includes('Chính tả')) colorClass = 'bg-amber-100/90 text-amber-900 border border-amber-200/80 font-bold';
          else if (subject.includes('Tiếng Anh') || subject.includes('Anh')) colorClass = 'bg-emerald-100/90 text-emerald-900 border border-emerald-200/80 font-bold';
          else if (subject.includes('Tin')) colorClass = 'bg-cyan-100/90 text-cyan-900 border border-cyan-200/80 font-bold';
          else if (subject.includes('Khoa') || subject.includes('TNXH')) colorClass = 'bg-teal-100/90 text-teal-900 border border-teal-200/80 font-bold';
          else if (subject.includes('Đạo đức') || subject.includes('Kỹ năng') || subject.includes('HĐTN')) colorClass = 'bg-rose-100/90 text-rose-900 border border-rose-200/80 font-bold';
          else if (subject.includes('Âm nhạc') || subject.includes('Mỹ thuật')) colorClass = 'bg-purple-100/90 text-purple-900 border border-purple-200/80 font-bold';
          else if (subject.includes('Thể dục') || subject.includes('GDTC')) colorClass = 'bg-orange-100/90 text-orange-900 border border-orange-200/80 font-bold';
          else if (subject.includes('Chào cờ') || subject.includes('Sinh hoạt')) colorClass = 'bg-red-100/90 text-red-900 border border-red-200/80 font-black';

          return (
            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] leading-tight ${colorClass}`}>
              {subject}
            </span>
          );
        };

        return (
          <div className="p-3 sm:p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-black text-slate-900 uppercase">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Thời Khóa Biểu Học Tập Trong Tuần</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                  Áp dụng Học Kỳ I
                </span>
                <span>Năm học {targetClass?.academicYear || teacherProfile.academicYear}</span>
              </div>
            </div>

            {!hasAnySubject ? (
              <div className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 px-4 py-6 text-center space-y-1">
                <p className="text-sm font-black text-blue-900">Lớp chưa nhập thời khóa biểu</p>
                <p className="text-xs text-slate-600">Vào mục <strong>Thời khóa biểu</strong> để chọn môn cho từng tiết (hoặc bấm “Nạp mẫu chuẩn Bộ GD”), Infographic sẽ tự cập nhật.</p>
              </div>
            ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-[10px] text-center border-collapse">
                <thead>
                  <tr className={ttClasses.header}>
                    <th className="py-1 px-1 border-r border-white/20 w-12">Buổi</th>
                    <th className="py-1 px-1 border-r border-white/20 w-16">Tiết & Giờ</th>
                    {daysToShow.map(d => (
                      <th key={d.day} className="py-1 px-1 border-r border-white/20">
                        {d.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Sáng: 5 Tiết */}
                  {morningList.map((period, idx) => (
                    <tr key={`m-${period}`} className="border-b border-slate-100">
                      {idx === 0 && (
                        <td rowSpan={morningCount} className={`py-1 px-1 font-black ${ttClasses.morningHeader} border-r border-slate-200`}>
                          SÁNG
                        </td>
                      )}
                      <td className="py-1 px-1 font-bold text-slate-600 border-r border-slate-200 bg-slate-50">
                        <div className="font-bold text-xs">{period}</div>
                        <div className="text-[8px] text-slate-400 font-mono hidden sm:block">{periodTimesMorning[period - 1]}</div>
                      </td>
                      {daysToShow.map(d => {
                        const slot = timetable.find(t => 
                          t.day === d.day && 
                          t.period === period && 
                          t.session === 'morning' &&
                          (!t.classId || t.classId === targetClass?.id)
                        );
                        return (
                          <td key={d.day} className={`py-1 px-1 border-r border-slate-100 font-semibold ${ttClasses.cellBg}`}>
                            {getSubjectBadge(slot?.subject)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* Chiều: 4 Tiết */}
                  {afternoonList.map((period, idx) => (
                    <tr key={`a-${period}`} className="border-b border-slate-100">
                      {idx === 0 && (
                        <td rowSpan={afternoonCount} className={`py-1 px-1 font-black ${ttClasses.afternoonHeader} border-r border-slate-200`}>
                          CHIỀU
                        </td>
                      )}
                      <td className="py-1 px-1 font-bold text-slate-600 border-r border-slate-200 bg-slate-50">
                        <div className="font-bold text-xs">{period}</div>
                        <div className="text-[8px] text-slate-400 font-mono hidden sm:block">{periodTimesAfternoon[period - 1]}</div>
                      </td>
                      {daysToShow.map(d => {
                        const slot = timetable.find(t => 
                          t.day === d.day && 
                          t.period === period && 
                          t.session === 'afternoon' &&
                          (!t.classId || t.classId === targetClass?.id)
                        );
                        return (
                          <td key={d.day} className={`py-1 px-1 border-r border-slate-100 font-semibold ${ttClasses.cellBg}`}>
                            {getSubjectBadge(slot?.subject)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}

            {/* Dòng thời gian nề nếp sinh hoạt */}
            <div className="pt-1.5 border-t border-slate-100 flex flex-wrap items-center justify-between text-[9px] sm:text-[10px] text-slate-500 font-medium px-1">
              <div className="flex items-center gap-1.5 text-blue-800 font-bold">
                <span>⏰ Nề nếp trong ngày:</span>
                <span className="font-normal text-slate-600">Đón HS 07h00 • Truy bài 07h15-07h30 • Ra chơi 09h10-09h35 • Bán trú 11h30-13h30 • Tan học 16h30</span>
              </div>
              <div className="text-slate-400 italic">Thực hiện nghiêm túc giờ giấc</div>
            </div>
          </div>
        );
      }

      case 'class_goals':
        return (
          <div className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-amber-50/90 via-white to-blue-50/90 border border-amber-200/80 shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-black uppercase">
              <div className="flex items-center gap-1.5 text-indigo-950">
                <Award className="w-3.5 h-3.5 text-amber-500" />
                {isEditMode ? (
                  <input
                    type="text"
                    value={classGoals.heading}
                    onChange={(e) => setClassGoals(prev => ({ ...prev, heading: e.target.value }))}
                    className="font-black text-xs border border-amber-300 rounded px-1.5 py-0.5 bg-white"
                  />
                ) : (
                  <span>{classGoals.heading}</span>
                )}
              </div>
              <span className="text-[10px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-200">
                4 Tiêu Chí Vàng
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
              {classGoals.items.map((item, idx) => (
                <div key={idx} className="bg-white/95 p-2.5 rounded-xl border border-slate-200/80 shadow-2xs space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{item.icon}</span>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          setClassGoals(prev => ({
                            ...prev,
                            items: prev.items.map((it, i) => i === idx ? { ...it, title: val } : it)
                          }));
                        }}
                        className="font-black text-[10px] border border-slate-300 rounded px-1 w-full"
                      />
                    ) : (
                      <span className="text-[10px] sm:text-[11px] font-black text-slate-900 uppercase tracking-tight">{item.title}</span>
                    )}
                  </div>
                  {isEditMode ? (
                    <textarea
                      value={item.desc}
                      onChange={(e) => {
                        const val = e.target.value;
                        setClassGoals(prev => ({
                          ...prev,
                          items: prev.items.map((it, i) => i === idx ? { ...it, desc: val } : it)
                        }));
                      }}
                      rows={2}
                      className="text-[9px] border border-slate-300 rounded p-1 w-full"
                    />
                  ) : (
                    <p className="text-[9px] sm:text-[10px] text-slate-600 leading-snug">{item.desc}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case 'students':
        return (
          <div className="space-y-3">
            {/* Header Danh sách học sinh */}
            <div className="rounded-2xl bg-gradient-to-r from-emerald-700 via-teal-700 to-blue-500 text-white p-4 shadow-md relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-300 text-slate-950 font-black text-[10px] uppercase tracking-wider">
                    HỒ SƠ HỌC SINH LỚP HỌC
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1">
                    DANH SÁCH THÀNH VIÊN LỚP {targetClass?.name?.toUpperCase()}
                  </h2>
                  <p className="text-xs text-white font-medium">
                    Năm học: {targetClass?.academicYear || teacherProfile.academicYear} • GVCN: Cô {customTeacherName}
                  </p>
                </div>

                <div className="bg-white/15 backdrop-blur-md rounded-2xl p-2.5 border border-white/20 text-right text-xs">
                  <div className="font-black text-amber-300">
                    TỔNG SỐ: {classStudents.length} HỌC SINH
                  </div>
                  <div className="text-[11px] text-white mt-0.5">
                    Nam: {maleCount} • Nữ: {femaleCount}
                  </div>
                </div>
              </div>
            </div>

            {/* Bảng Chi Tiết 100% Học Sinh */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
              <table className="w-full text-[11px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 border-b border-slate-200 text-[10px] uppercase font-black">
                    <th className="py-2 px-1.5 text-center w-8 border-r border-slate-200">STT</th>
                    <th className="py-2 px-1 text-center w-10 border-r border-slate-200">Ảnh</th>
                    <th className="py-2 px-2 text-center w-16 border-r border-slate-200">Mã HS</th>
                    <th className="py-2 px-2.5 border-r border-slate-200">Họ và Tên</th>
                    <th className="py-2 px-2 text-center w-20 border-r border-slate-200">Ngày sinh</th>
                    <th className="py-2 px-1.5 text-center w-14 border-r border-slate-200">Giới tính</th>
                    <th className="py-2 px-1.5 text-center w-14 border-r border-slate-200">Tổ</th>
                    <th className="py-2 px-2 border-r border-slate-200">Chức vụ / Nhiệm vụ</th>
                    <th className="py-2 px-2 text-center w-20">Xếp loại</th>
                  </tr>
                </thead>
                <tbody>
                  {classStudents.map((st, index) => {
                    let role = 'Thành viên';
                    if (st.stt === 1) role = 'Lớp trưởng';
                    else if (st.stt === 2) role = 'Lớp phó học tập';
                    else if (st.stt === 3) role = 'Lớp phó phong trào';
                    else if (st.stt === 4) role = 'Tổ trưởng Tổ 1';
                    else if (st.stt === 5) role = 'Tổ trưởng Tổ 2';
                    else if (st.stt === 6) role = 'Tổ trưởng Tổ 3';
                    else if (st.stt === 7) role = 'Tổ trưởng Tổ 4';

                    const groupName = st.group || `Tổ ${((st.stt - 1) % 4) + 1}`;
                    const ranking = st.points >= 25 ? 'Xuất sắc' : st.points >= 15 ? 'Tốt' : st.points >= 8 ? 'Khá' : 'Chăm ngoan';

                    return (
                      <tr 
                        key={st.id} 
                        className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                          index % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'
                        }`}
                      >
                        <td className="py-1.5 px-1.5 text-center font-bold text-slate-500 border-r border-slate-100">
                          {st.stt}
                        </td>
                        <td className="py-1 px-1 text-center border-r border-slate-100">
                          <img
                            src={st.avatar}
                            alt={st.name}
                            className="w-6 h-6 rounded-full object-cover border border-slate-200 mx-auto shadow-2xs"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=100&auto=format&fit=crop&q=80';
                            }}
                          />
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-600 text-[10px] border-r border-slate-100">
                          HS{String(st.stt).padStart(2, '0')}
                        </td>
                        <td className="py-1.5 px-2.5 font-bold text-slate-900 border-r border-slate-100">
                          {st.name}
                        </td>
                        <td className="py-1.5 px-2 text-center text-slate-600 font-mono text-[10px] border-r border-slate-100">
                          {st.birthDate || '—'}
                        </td>
                        <td className="py-1.5 px-1.5 text-center border-r border-slate-100">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black ${
                            st.gender === 'Nam' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'
                          }`}>
                            {st.gender}
                          </span>
                        </td>
                        <td className="py-1.5 px-1.5 text-center text-slate-700 font-medium border-r border-slate-100 text-[10px]">
                          {groupName}
                        </td>
                        <td className="py-1.5 px-2 text-slate-700 border-r border-slate-100 text-[10px]">
                          <span className={`font-semibold ${
                            role !== 'Thành viên' ? 'text-indigo-700 font-bold' : 'text-slate-600'
                          }`}>
                            {role}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-center text-[10px] font-bold">
                          <span className={`px-1.5 py-0.5 rounded ${
                            ranking === 'Xuất sắc'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ranking === 'Tốt'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {ranking}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'signatures':
        return (
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="grid grid-cols-3 gap-4 text-center text-xs">
              {/* Ban Phụ Huynh */}
              <div className="space-y-1">
                <div className="font-bold text-slate-600 uppercase text-[10px]">
                  ĐẠI DIỆN BAN PHỤ HUYNH
                </div>
                <div className="text-[10px] text-slate-400 italic">
                  (Ký và ghi rõ họ tên)
                </div>
                <div className="h-12"></div>
                <div className="font-black text-slate-900 text-xs">
                  {parentCommittee.head.name}
                </div>
              </div>

              {/* Ban Giám Hiệu */}
              <div className="space-y-1">
                <div className="font-bold text-slate-600 uppercase text-[10px]">
                  BAN GIÁM HIỆU NHÀ TRƯỜNG
                </div>
                <div className="text-[10px] text-slate-400 italic">
                  (Ký duyệt và đóng dấu)
                </div>
                <div className="h-12"></div>
                <div className="font-black text-slate-900 text-xs">
                  Hiệu trưởng
                </div>
              </div>

              {/* Giáo viên chủ nhiệm */}
              <div className="space-y-1">
                <div className="font-bold text-slate-600 uppercase text-[10px]">
                  GIÁO VIÊN CHỦ NHIỆM
                </div>
                <div className="text-[10px] text-slate-400 italic">
                  (Ký và ghi rõ họ tên)
                </div>
                <div className="h-12"></div>
                <div className="font-black text-slate-900 text-xs">
                  Cô {customTeacherName}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
              <div>Hệ sinh thái quản lý lớp học • Hồ sơ nội bộ</div>
              <div>Phát hành: {new Date().toLocaleDateString('vi-VN')}</div>
            </div>
          </div>
        );

      case 'custom_text':
        return (
          <div 
            className="p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1.5"
            style={{ 
              backgroundColor: layer.customContent?.bgColor || '#f8fafc',
              color: layer.customContent?.textColor || '#1e293b',
              textAlign: layer.customContent?.align || 'left'
            }}
          >
            {isEditMode ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={layer.customContent?.heading || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLayers(prev => prev.map(l => l.id === layer.id ? {
                      ...l,
                      customContent: { ...l.customContent, heading: val }
                    } : l));
                  }}
                  placeholder="Tiêu đề khung..."
                  className="w-full text-xs font-black uppercase border border-slate-300 rounded-lg p-1.5 bg-white"
                />
                <textarea
                  value={layer.customContent?.body || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLayers(prev => prev.map(l => l.id === layer.id ? {
                      ...l,
                      customContent: { ...l.customContent, body: val }
                    } : l));
                  }}
                  rows={2}
                  placeholder="Nội dung ghi chú..."
                  className="w-full text-xs border border-slate-300 rounded-lg p-1.5 bg-white"
                />
              </div>
            ) : (
              <>
                <div className="text-xs font-black uppercase tracking-wide">
                  {layer.customContent?.heading || 'GHI CHÚ / THÔNG BÁO'}
                </div>
                <div className="text-xs font-medium whitespace-pre-wrap">
                  {layer.customContent?.body || 'Nội dung thông báo của lớp.'}
                </div>
              </>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // Render a full page with its active layers
  const renderPage = (pageNum: 1 | 2 | 3, ref: React.RefObject<HTMLDivElement | null>) => {
    const pageLayers = layers
      .filter(l => l.page === pageNum && l.visible)
      .sort((a, b) => a.order - b.order);

    return (
      <div 
        ref={ref}
        id={`printable-infographic-page-${pageNum}`}
        className={`bg-white text-slate-800 shadow-2xl rounded-2xl border border-slate-300 ${pageContainerClass} relative overflow-hidden`}
        style={{
          fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, sans-serif"
        }}
      >
        {pageLayers.length === 0 ? (
          <div className="py-20 text-center text-slate-400 space-y-2">
            <Layers className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-xs font-bold text-slate-600">Trang {pageNum} hiện chưa có thành phần nào.</p>
            {isEditMode && (
              <button
                type="button"
                onClick={() => addCustomTextLayer(pageNum)}
                className="text-xs text-indigo-600 hover:underline font-bold"
              >
                + Thêm thành phần vào Trang {pageNum}
              </button>
            )}
          </div>
        ) : (
          <div className={`flex-1 flex flex-col justify-between w-full h-full ${
            pageDensity === 'compact' ? 'gap-1.5' : pageDensity === 'spacious' ? 'gap-4' : 'gap-2.5 sm:gap-3'
          }`}>
            {pageLayers.map(layer => {
              const widthClass = layer.width === '50%' ? 'w-1/2' : layer.width === '75%' ? 'w-3/4' : 'w-full';
              return (
                <div 
                  key={layer.id}
                  className={`transition-all duration-200 ${widthClass} mx-auto ${
                    layer.type === 'signatures' ? 'mt-auto' : ''
                  } ${
                    layer.type === 'seating' ? 'flex-1 flex flex-col justify-between w-full h-full' : ''
                  } ${
                    isEditMode ? 'p-1 rounded-2xl border-2 border-dashed border-indigo-300/80 hover:border-indigo-500 my-1' : ''
                  }`}
                  style={{
                    transform: layer.scale !== 1 ? `scale(${layer.scale})` : undefined,
                    transformOrigin: 'top center'
                  }}
                >
                  {renderLayerControls(layer)}
                  {renderLayerContent(layer)}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer ghi chú của trang */}
        <div className="pt-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between text-[10px] text-slate-500 font-semibold no-print no-pdf mt-auto">
          <div>
            Infographic Lớp {targetClass?.name} • Năm học {targetClass?.academicYear || teacherProfile.academicYear}
          </div>
          <div>
            Trang {pageNum} / {config.pageCount} • Khổ {config.orientation === 'landscape' ? 'Ngang' : 'Dọc'} A4
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Thông báo phân quyền BGH / Quản trị nhà trường */}
      {!canCreateClassInfographic && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-4 sm:p-5 flex items-start gap-3.5 text-amber-900 shadow-xs">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-black uppercase tracking-tight">
              Chế độ Giám Sát / Xem Mẫu Infographic (Ban Giám Hiệu & Quản Trị Nhà Trường)
            </h4>
            <p className="text-xs text-amber-800 font-medium mt-1 leading-relaxed">
              Để đảm bảo tôn trọng quyền chủ động của Giáo viên chủ nhiệm, chức năng tạo và thiết kế Infographic báo cáo lớp học thuộc thẩm quyền của GVCN lớp. Tài khoản Ban Giám Hiệu và Quản trị nhà trường đang ở chế độ xem mẫu báo cáo.
            </p>
          </div>
        </div>
      )}

      {/* Top Banner Toolbar */}
      <div className="bg-white/95 backdrop-blur-md p-5 rounded-3xl border border-indigo-100 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover-zoom-card">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white flex items-center justify-center shadow-md shadow-indigo-600/25">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-indigo-950 tracking-tight flex items-center gap-2 uppercase">
                <span>TRÌNH CHỈNH SỬA & XUẤT INFOGRAPHIC</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                  {config.pageCount} TRANG A4 {config.orientation === 'landscape' ? 'NGANG' : 'DỌC'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 font-medium uppercase">
                THIẾT KẾ DẠNG LAYER: KÉO THẢ, SỬA, XÓA, PHÓNG TO, THU NHỎ, TÙY CHỌN 1-2-3 TRANG VÀ KHỔ GIẤY A4
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Nút Bật/Tắt Chế độ chỉnh sửa Layer */}
          {canCreateClassInfographic && (
            <button
              type="button"
              onClick={() => setIsEditMode(!isEditMode)}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-black rounded-2xl shadow-xs transition-all hover-zoom-btn ${
                isEditMode 
                  ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/25 ring-2 ring-amber-300' 
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
              }`}
              title="Bật/Tắt chế độ chỉnh sửa layer trực tiếp trên trang thiết kế"
            >
              <Edit3 className="w-4 h-4 shrink-0" />
              <span className="truncate">{isEditMode ? 'ĐANG CHỈNH SỬA' : 'CHẾ ĐỘ THIẾT KẾ'}</span>
            </button>
          )}

          {/* Quản lý Layer */}
          {canCreateClassInfographic && (
            <button
              type="button"
              onClick={() => setIsLayerManagerOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-black text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-2xl shadow-xs transition-all hover-zoom-btn"
              title="Mở danh sách các layer, khôi phục thành phần đã xóa hoặc thêm mới"
            >
              <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="truncate">LAYER ({layers.filter(l => l.visible).length})</span>
            </button>
          )}

          {/* Cấu hình Wizard */}
          {canCreateClassInfographic && (
            <button
              type="button"
              onClick={() => setIsConfigModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-black text-white bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:to-indigo-700 rounded-2xl shadow-md shadow-indigo-600/20 transition-all hover-zoom-btn uppercase"
              title="Cấu hình số trang (1, 2, 3), khổ giấy A4 dọc/ngang, chọn mẫu sơ đồ và TKB"
            >
              <Wand2 className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="truncate">KHỔ & TRANG</span>
            </button>
          )}

          {/* Nút Tải PNG */}
          <button
            type="button"
            onClick={() => handleExportPng('all')}
            disabled={isExportingPng}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-black text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-2xl shadow-xs transition-all hover-zoom-btn disabled:opacity-50 uppercase"
            title="Tải ảnh PNG sắc nét từng trang hoặc toàn bộ các trang"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">{isExportingPng ? 'ĐANG XUẤT...' : 'TẢI ẢNH PNG'}</span>
          </button>

          {/* Nút Xuất PDF (trải rộng full width trên mobile) */}
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-md shadow-indigo-600/20 transition-all hover-zoom-btn disabled:opacity-50 uppercase"
            title="Xuất file Infographic chuẩn in PDF A4 (1, 2 hoặc 3 trang theo định dạng dọc/ngang đã chọn)"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isExportingPdf ? 'ĐANG XUẤT PDF...' : `XUẤT PDF (${config.pageCount} TRANG A4)`}</span>
          </button>
        </div>
      </div>

      {/* ✅ KIỂM TRA DỮ LIỆU: infographic tự lấy từ dữ liệu lớp – chỉ ra phần còn thiếu để bản in không bị trống */}
      {canCreateClassInfographic && (() => {
        const withPhoto = classStudents.filter(st => st.avatar && !/placeholder/i.test(st.avatar)).length;
        const ttCount = timetable.filter(t => (!t.classId || t.classId === targetClass?.id) && t.subject && t.subject !== '—').length;
        const seatCount = Object.values(seatingAssignments || {}).filter(id => classStudents.some(st => st.id === id)).length;
        const parentsCount = [parentCommittee.head, parentCommittee.deputy, parentCommittee.member1, parentCommittee.member2].filter(m => (m.name || '').trim()).length;
        const items: Array<{ ok: boolean; label: string; detail: string; action?: { label: string; onClick: () => void } }> = [
          { ok: classStudents.length > 0, label: 'Học sinh', detail: `${classStudents.length} em • ${withPhoto} em có ảnh` },
          { ok: ttCount > 0, label: 'Thời khóa biểu', detail: ttCount > 0 ? `${ttCount} tiết đã nhập` : 'Chưa nhập – vào mục Thời khóa biểu' },
          { ok: seatCount > 0, label: 'Sơ đồ chỗ ngồi', detail: seatCount > 0 ? `${seatCount}/${classStudents.length} em đã xếp chỗ` : 'Chưa xếp – vào mục Sơ đồ lớp' },
          { ok: parentsCount > 0, label: 'Ban phụ huynh', detail: `${parentsCount}/4 thành viên`, action: { label: parentsCount > 0 ? 'Sửa' : 'Nhập ngay', onClick: () => setIsClassInfoModalOpen(true) } },
          { ok: Boolean(customTeacherPhone), label: 'SĐT GVCN', detail: customTeacherPhone || 'Chưa có', action: { label: customTeacherPhone ? 'Sửa' : 'Nhập ngay', onClick: () => setIsClassInfoModalOpen(true) } },
        ];
        const missing = items.filter(i => !i.ok).length;
        return (
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-black uppercase tracking-wide text-slate-800">
                Dữ liệu tự động cho Infographic {missing === 0
                  ? <span className="ml-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">Đầy đủ</span>
                  : <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200">Còn thiếu {missing} mục</span>}
              </div>
              <button type="button" onClick={() => setIsClassInfoModalOpen(true)} className="text-xs font-bold text-indigo-700 hover:underline">
                Sửa thông tin lớp (GVCN, Ban phụ huynh)
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {items.map(it => (
                <div key={it.label} className={`rounded-xl border px-2.5 py-2 ${it.ok ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-300 bg-amber-50/70'}`}>
                  <div className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white ${it.ok ? 'bg-emerald-700' : 'bg-amber-700'}`}>{it.ok ? '✓' : '!'}</span>
                    {it.label}
                  </div>
                  <div className="text-xs text-slate-700 mt-0.5 truncate" title={it.detail}>{it.detail}</div>
                  {it.action && (
                    <button type="button" onClick={it.action.onClick} className="mt-1 text-xs font-black text-indigo-700 hover:underline">{it.action.label}</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {isClassInfoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-label="Thông tin lớp cho Infographic" onClick={() => setIsClassInfoModalOpen(false)}>
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3.5 bg-gradient-to-r from-indigo-700 to-violet-700 text-white flex items-center justify-between sticky top-0">
              <h3 className="text-sm font-black uppercase">Thông tin lớp {targetClass?.name}</h3>
              <button type="button" onClick={() => setIsClassInfoModalOpen(false)} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center" aria-label="Đóng">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-black text-slate-700 uppercase">Họ tên GVCN</span>
                  <input value={customTeacherName} onChange={(e) => setCustomTeacherName(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-black text-slate-700 uppercase">Số điện thoại GVCN</span>
                  <input value={customTeacherPhone} onChange={(e) => setCustomTeacherPhone(e.target.value)} inputMode="tel" placeholder="Để trống nếu không muốn in" className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
                </label>
              </div>
              <label className="space-y-1 block">
                <span className="text-xs font-black text-slate-700 uppercase">Khẩu hiệu lớp</span>
                <input value={customSlogan} onChange={(e) => setCustomSlogan(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
              </label>
              <div className="space-y-2">
                <div className="text-xs font-black text-rose-800 uppercase">Ban đại diện cha mẹ học sinh</div>
                {([
                  ['head', 'Trưởng ban'], ['deputy', 'Phó ban'], ['member1', 'Ủy viên 1'], ['member2', 'Ủy viên 2'],
                ] as const).map(([key, label]) => (
                  <div key={key} className="grid grid-cols-[90px_1fr_140px] gap-2 items-center">
                    <span className="text-xs font-bold text-slate-700">{label}</span>
                    <input value={parentCommittee[key].name} placeholder="Họ tên phụ huynh"
                      onChange={(e) => setParentCommittee(prev => ({ ...prev, [key]: { ...prev[key], name: e.target.value } }))}
                      className="px-3 py-2 rounded-xl border border-slate-300 text-sm" />
                    <input value={parentCommittee[key].phone} placeholder="SĐT" inputMode="tel"
                      onChange={(e) => setParentCommittee(prev => ({ ...prev, [key]: { ...prev[key], phone: e.target.value } }))}
                      className="px-3 py-2 rounded-xl border border-slate-300 text-sm" />
                  </div>
                ))}
                <p className="text-xs text-slate-600">Ô để trống sẽ in thành dòng chấm để ghi tay.</p>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setIsClassInfoModalOpen(false)} className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black uppercase">Đóng</button>
                <button
                  type="button"
                  onClick={() => {
                    if (targetClass) {
                      updateClass(targetClass.id, { parentCommittee, slogan: customSlogan, teacherName: customTeacherName });
                      try { localStorage.setItem(`lhhp_infographic_teacher_phone_${targetClass.id}`, customTeacherPhone); } catch (_) { /* ignore */ }
                    }
                    setIsClassInfoModalOpen(false);
                    confetti({ particleCount: 30, spread: 50 });
                  }}
                  className="flex-[2] py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase"
                >
                  Lưu vào hồ sơ lớp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Layout Quick-Bar (Orientation & Page Count Quick Switch) */}
      <div className="bg-white/85 backdrop-blur-xs p-3 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Nút Tối ưu vừa khít A4, không để giấy thừa */}
          <button
            type="button"
            onClick={handleAutoFitA4}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl font-black text-xs shadow-xs transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Tự động cân đối tỷ lệ, giãn cách hàng và dàn nội dung vừa vặn toàn bộ trang giấy A4, không để giấy thừa"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-200 animate-spin" />
            <span>TỐI ƯU VỪA KHÍT A4 (KHÔNG THỪA GIẤY)</span>
          </button>

          {/* Khổ giấy: Dọc / Ngang */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <span className="text-[10px] text-slate-500 uppercase px-1.5">Khổ giấy:</span>
            <button
              type="button"
              onClick={() => setConfig(prev => ({ ...prev, orientation: 'portrait' }))}
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                config.orientation === 'portrait' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              📄 A4 Dọc
            </button>
            <button
              type="button"
              onClick={() => setConfig(prev => ({ ...prev, orientation: 'landscape' }))}
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                config.orientation === 'landscape' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              📑 A4 Ngang
            </button>
          </div>

          {/* Chọn số trang: 1, 2, 3 */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <span className="text-[10px] text-slate-500 uppercase px-1.5">Bố cục trang:</span>
            <button
              type="button"
              onClick={() => handlePageCountChange(1)}
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                config.pageCount === 1 ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              1 Trang A4
            </button>
            <button
              type="button"
              onClick={() => handlePageCountChange(2)}
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                config.pageCount === 2 ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              2 Trang A4 (Chuẩn)
            </button>
            <button
              type="button"
              onClick={() => handlePageCountChange(3)}
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                config.pageCount === 3 ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              3 Trang A4 (Toàn diện)
            </button>
          </div>

          {/* Căn lề / Mật độ dàn A4 */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <span className="text-[10px] text-slate-500 uppercase px-1.5">Mật độ:</span>
            <button
              type="button"
              onClick={() => setPageDensity('fit')}
              className={`px-2 py-1 rounded-lg text-xs font-black transition-all ${
                pageDensity === 'fit' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
              }`}
              title="Cân đối dàn đều vừa vặn kích thước A4 không để giấy thừa"
            >
              Vừa khít A4
            </button>
            <button
              type="button"
              onClick={() => setPageDensity('spacious')}
              className={`px-2 py-1 rounded-lg text-xs font-black transition-all ${
                pageDensity === 'spacious' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
              }`}
              title="Dàn rộng thoáng"
            >
              Thoáng
            </button>
            <button
              type="button"
              onClick={() => setPageDensity('compact')}
              className={`px-2 py-1 rounded-lg text-xs font-black transition-all ${
                pageDensity === 'compact' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
              }`}
              title="Dàn cô đọng"
            >
              Gọn
            </button>
          </div>
        </div>

        {/* View Tabs */}
        {config.pageCount > 1 && (
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'all' ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              Xem tất cả ({config.pageCount} trang)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('page1')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'page1' ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              Trang 1
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('page2')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'page2' ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              Trang 2
            </button>
            {config.pageCount >= 3 && (
              <button
                type="button"
                onClick={() => setActiveTab('page3')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'page3' ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Trang 3
              </button>
            )}
          </div>
        )}
      </div>

      {/* EDIT MODE QUICK BAR NOTICE */}
      {isEditMode && (
        <div className="bg-amber-50 border-2 border-amber-300 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2 font-bold">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>
              <strong>CHẾ ĐỘ THIẾT KẾ LAYER ĐANG BẬT:</strong> Bạn có thể bấm nút ▲ ▼ để đổi thứ tự, T1/T2/T3 để chuyển trang, + / - để phóng to thu nhỏ, và nút Thùng rác 🗑️ để xóa thành phần!
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => addCustomTextLayer(1)}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm Ghi Chú / Text Mới</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEditMode(false)}
              className="px-3 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold text-xs"
            >
              Hoàn Tất Chỉnh Sửa
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CANVAS KHỔ GIẤY A4 (1, 2 HOẶC 3 TRANG; KHỔ DỌC HOẶC KHỔ NGANG) */}
      {/* ========================================================================= */}
      <div className="flex flex-col items-center gap-6 sm:gap-8 bg-slate-200/50 p-1 sm:p-6 rounded-3xl border border-slate-300/80 w-full overflow-x-hidden sm:overflow-x-auto">
        
        {/* ======================== TRANG 1 ======================== */}
        {(activeTab === 'all' || activeTab === 'page1') && (
          <div className="w-full flex flex-col items-center">
            {config.pageCount > 1 && (
              <div className="w-full max-w-[820px] flex items-center justify-between text-xs font-black text-slate-600 mb-2 px-2">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>TRANG 1 / {config.pageCount}: THÔNG TIN LỚP, GVCN, BAN PHỤ HUYNH & THỜI KHÓA BIỂU TOÀN DIỆN</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleExportPng('page1')}
                  className="text-indigo-600 hover:underline flex items-center gap-1 text-[11px]"
                >
                  <Download className="w-3 h-3" />
                  <span>Tải ảnh Trang 1</span>
                </button>
              </div>
            )}
            {renderPage(1, page1Ref)}
          </div>
        )}

        {/* ======================== TRANG 2 ======================== */}
        {config.pageCount >= 2 && (activeTab === 'all' || activeTab === 'page2') && (
          <div className="w-full flex flex-col items-center">
            <div className="w-full max-w-[820px] flex items-center justify-between text-xs font-black text-slate-600 mb-2 px-2">
              <span className="flex items-center gap-1.5">
                <Award className="w-4 h-4 text-emerald-600" />
                <span>TRANG 2 / {config.pageCount}: ẢNH SƠ ĐỒ CHỖ NGỒI ĐÃ TẠO (NGUYÊN BẢN) & CHỮ KÝ XÁC NHẬN</span>
              </span>
              <button
                type="button"
                onClick={() => handleExportPng('page2')}
                className="text-emerald-600 hover:underline flex items-center gap-1 text-[11px]"
              >
                <Download className="w-3 h-3" />
                <span>Tải ảnh Trang 2</span>
              </button>
            </div>
            {renderPage(2, page2Ref)}
          </div>
        )}

        {/* ======================== TRANG 3 ======================== */}
        {config.pageCount >= 3 && (activeTab === 'all' || activeTab === 'page3') && (
          <div className="w-full flex flex-col items-center">
            <div className="w-full max-w-[820px] flex items-center justify-between text-xs font-black text-slate-600 mb-2 px-2">
              <span className="flex items-center gap-1.5">
                <Award className="w-4 h-4 text-purple-600" />
                <span>TRANG 3 / 3: DANH SÁCH 100% HỌC SINH & CHỮ KÝ PHÊ DUYỆT HỒ SƠ</span>
              </span>
              <button
                type="button"
                onClick={() => handleExportPng('page3')}
                className="text-purple-600 hover:underline flex items-center gap-1 text-[11px]"
              >
                <Download className="w-3 h-3" />
                <span>Tải ảnh Trang 3</span>
              </button>
            </div>
            {renderPage(3, page3Ref)}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* LAYER MANAGER DRAWER / MODAL */}
      {/* ========================================================================= */}
      {isLayerManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-indigo-100 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase">
                    Quản Lý Các Layer Infographic
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sắp xếp thứ tự, ẩn/hiện, xóa hoặc khôi phục các thành phần
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLayerManagerOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* List layers grouped by page */}
            <div className="space-y-4 text-xs">
              {[1, 2, 3].slice(0, config.pageCount).map(p => {
                const pageL = layers.filter(l => l.page === p).sort((a, b) => a.order - b.order);
                return (
                  <div key={p} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between font-black text-slate-900 uppercase">
                      <span>Trang {p} ({pageL.filter(l => l.visible).length} thành phần hiển thị)</span>
                      <button
                        type="button"
                        onClick={() => addCustomTextLayer(p as 1 | 2 | 3)}
                        className="text-[10px] text-indigo-600 hover:underline flex items-center gap-1 font-bold"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Thêm ghi chú</span>
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {pageL.map(layer => (
                        <div 
                          key={layer.id}
                          className={`p-2 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                            layer.visible ? 'bg-white border-slate-200' : 'bg-slate-100 border-dashed border-slate-300 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleLayerVisibility(layer.id)}
                              title={layer.visible ? 'Ẩn layer này' : 'Hiện layer này'}
                              className="text-slate-400 hover:text-indigo-600"
                            >
                              {layer.visible ? <Eye className="w-4 h-4 text-indigo-600" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
                            </button>
                            <span className="font-bold text-slate-800">{layer.title}</span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveLayer(layer.id, 'up')}
                              className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                              title="Lên trên"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveLayer(layer.id, 'down')}
                              className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                              title="Xuống dưới"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteLayer(layer.id)}
                              className="p-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-600"
                              title="Xóa thành phần"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hidden layers to restore */}
            {layers.some(l => !l.visible) && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 space-y-2 text-xs">
                <div className="font-black text-amber-950 uppercase flex items-center justify-between">
                  <span>Các thành phần đang bị ẩn / đã xóa:</span>
                  <button
                    type="button"
                    onClick={() => setLayers(prev => prev.map(l => ({ ...l, visible: true })))}
                    className="text-[10px] text-amber-700 underline font-bold"
                  >
                    Hiện lại tất cả
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {layers.filter(l => !l.visible).map(layer => (
                    <button
                      key={layer.id}
                      type="button"
                      onClick={() => toggleLayerVisibility(layer.id)}
                      className="px-2 py-1 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg text-amber-900 font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3 text-amber-600" />
                      <span>{layer.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleResetToDefault}
                className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Đặt lại bố cục gốc</span>
              </button>
              <button
                type="button"
                onClick={() => setIsLayerManagerOpen(false)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs shadow-md"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* WIZARD MODAL: TÙY BIẾN KHỔ GIẤY, SỐ TRANG & CHỦ ĐỀ SƠ ĐỒ LỚP */}
      {/* ========================================================================= */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-indigo-100 space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Wand2 className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Tùy Biến Khổ Giấy, Số Trang & Chủ Đề
                  </h3>
                  <p className="text-xs text-slate-500">
                    Chọn khổ giấy A4 dọc/ngang, hiển thị 1-2-3 trang và chủ đề sơ đồ chỗ ngồi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Form Selections */}
            <div className="space-y-4 text-xs">
              {/* 1. KHỔ GIẤY A4: DỌC HOẶC NGANG */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/80 border border-indigo-200 space-y-2">
                <label className="font-black text-indigo-950 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>1. Khổ giấy in ấn A4 (Dọc hoặc Ngang):</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, orientation: 'portrait' }))}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                      config.orientation === 'portrait'
                        ? 'bg-indigo-100 border-indigo-600 ring-2 ring-indigo-500/20 font-black'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <span className="text-2xl">📄</span>
                    <div>
                      <div className="font-black text-slate-900 text-xs">Khổ A4 Dọc (Portrait)</div>
                      <div className="text-[10px] text-slate-500">210mm × 297mm • Tiêu chuẩn in ấn</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, orientation: 'landscape' }))}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                      config.orientation === 'landscape'
                        ? 'bg-indigo-100 border-indigo-600 ring-2 ring-indigo-500/20 font-black'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <span className="text-2xl">📑</span>
                    <div>
                      <div className="font-black text-slate-900 text-xs">Khổ A4 Ngang (Landscape)</div>
                      <div className="text-[10px] text-slate-500">297mm × 210mm • Rộng rãi cho sơ đồ</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* 2. CHỌN TRÌNH BÀY THEO 1 TRANG, 2 TRANG HOẶC 3 TRANG */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between font-black text-emerald-950">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-emerald-600" />
                    <span>2. Chọn trình bày theo số trang A4:</span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                    Tùy chọn linh hoạt
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* 1 Trang */}
                  <button
                    type="button"
                    onClick={() => handlePageCountChange(1)}
                    className={`p-2.5 rounded-xl border text-left space-y-1 transition-all ${
                      config.pageCount === 1
                        ? 'bg-emerald-100 border-emerald-600 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-black text-slate-900 text-xs">1 Trang A4</div>
                    <div className="text-[10px] text-slate-600">
                      Gói gọn tổng quan trong 1 trang duy nhất để dán cửa lớp.
                    </div>
                  </button>

                  {/* 2 Trang */}
                  <button
                    type="button"
                    onClick={() => handlePageCountChange(2)}
                    className={`p-2.5 rounded-xl border text-left space-y-1 transition-all ${
                      config.pageCount === 2
                        ? 'bg-emerald-100 border-emerald-600 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-black text-slate-900 text-xs flex items-center justify-between">
                      <span>2 Trang A4</span>
                      <span className="px-1 py-0.2 bg-emerald-600 text-white rounded text-[8px] font-black">Chuẩn</span>
                    </div>
                    <div className="text-[10px] text-slate-600">
                      T1: Thông tin lớp, GVCN, Ban PH, TKB & Mục tiêu. T2: Ảnh sơ đồ lớp nguyên bản & Chữ ký.
                    </div>
                  </button>

                  {/* 3 Trang */}
                  <button
                    type="button"
                    onClick={() => handlePageCountChange(3)}
                    className={`p-2.5 rounded-xl border text-left space-y-1 transition-all ${
                      config.pageCount === 3
                        ? 'bg-emerald-100 border-emerald-600 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-black text-slate-900 text-xs flex items-center justify-between">
                      <span>3 Trang A4</span>
                      <span className="px-1 py-0.2 bg-purple-600 text-white rounded text-[8px] font-black">Toàn diện</span>
                    </div>
                    <div className="text-[10px] text-slate-600">
                      T1: Thông tin + TKB. T2: Ảnh sơ đồ lớp nguyên bản. T3: Danh sách HS.
                    </div>
                  </button>
                </div>
              </div>

              {/* 3. CHỌN MẪU SƠ ĐỒ CHỖ NGỒI (2D / 3D) */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="font-black text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Grid3X3 className="w-4 h-4 text-blue-600" />
                    <span>3. Chọn phong cách Sơ đồ chỗ ngồi:</span>
                  </span>
                  <span className="text-[10px] text-blue-600 font-bold">5 chủ đề</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { id: 'wood_3d', label: '3D Bàn Gỗ Tự Nhiên', desc: 'Ấm cúng, đồng bộ mẫu Sơ Đồ Lớp', icon: '🪑' },
                    { id: 'mint_3d', label: '3D Xanh Ngọc Hiện Đại', desc: 'Trẻ trung, tươi sáng', icon: '🌿' },
                    { id: 'navy_3d', label: '3D Hoàng Gia Xanh Navy', desc: 'Sang trọng, tương phản nổi bật', icon: '👑' },
                    { id: 'standard_2d', label: '2D Sư Phạm Tiêu Chuẩn', desc: 'Tối ưu độ nét khi in trắng đen', icon: '📄' },
                    { id: 'rainbow_2d', label: '2D Sắc Màu Sinh Động', desc: 'Đa sắc màu, phân tổ rõ ràng', icon: '🌈' },
                  ].map(style => (
                    <button
                      type="button"
                      key={style.id}
                      onClick={() => setConfig({ ...config, seatingChartStyle: style.id as InfographicSeatingStyle })}
                      className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all ${
                        config.seatingChartStyle === style.id
                          ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-lg">{style.icon}</span>
                      <div>
                        <div className="font-black text-slate-900 text-xs">{style.label}</div>
                        <div className="text-[10px] text-slate-500">{style.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. CHỌN MẪU THỜI KHÓA BIỂU */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="font-black text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span>4. Chọn mẫu trình bày Thời khóa biểu:</span>
                  </span>
                  <span className="text-[10px] text-indigo-600 font-bold">5 màu sắc</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'pedagogical', label: 'Sư Phạm Chuẩn', icon: '📚' },
                    { id: 'rainbow', label: 'Cầu Vồng', icon: '🌈' },
                    { id: 'wood', label: 'Gỗ Ấm Cúng', icon: '🪑' },
                    { id: 'sky', label: 'Bầu Trời', icon: '🌤️' },
                    { id: 'minimal', label: 'Tối Giản Mực In', icon: '📋' },
                  ].map(style => (
                    <button
                      type="button"
                      key={style.id}
                      onClick={() => setConfig({ ...config, timetableStyle: style.id as InfographicTimetableStyle })}
                      className={`p-2 rounded-xl border text-center flex flex-col items-center gap-1 transition-all ${
                        config.timetableStyle === style.id
                          ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20 font-black'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-base">{style.icon}</span>
                      <span className="text-[11px] font-bold text-slate-800">{style.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleResetToDefault}
                className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Đặt lại mặc định</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsConfigModalOpen(false);
                    confetti({ particleCount: 30, spread: 50 });
                  }}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs shadow-md shadow-indigo-600/20 hover-zoom-btn flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Áp Dụng Thiết Kế</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
