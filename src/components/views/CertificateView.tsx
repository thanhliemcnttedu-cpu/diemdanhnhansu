import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Award, Download, RefreshCw, CheckSquare, Square, 
  Image as ImageIcon, Sparkles, Check, 
  Filter, BookOpen, Users,
  Eye, GraduationCap, RotateCcw, Move,
  Type, Palette, Trash2, Edit3, Lock, Unlock, Shuffle,
  Sliders, Info, MousePointer, ShieldCheck,
  PenTool, Upload, FileSignature, X
} from 'lucide-react';
import { toPng, toJpeg } from 'html-to-image';
import confetti from 'canvas-confetti';
import { useClassroom } from '../../context/ClassroomContext';
import { APP_AUTHOR_INFO } from '../../data/initialData';
import { removeWhiteBackground } from '../../utils/imageProcessor';
import {
  analyzeTemplate, buildCertificateLayout, ensureCertificateFonts, fitElementsToContent, preferredComposition,
  CERT_TYPOGRAPHY, type TemplateAnalysis, type CertComposition, type CertContent,
} from '../../utils/certificateLayout';
import { renderCertificateCanvas } from '../../utils/certificateRenderer';
import { loadDecorativeFonts } from '../../utils/decorativeFonts';

// Canvas Native Resolution 1920 x 1080 Full HD
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

// Dynamic Template Item Interface
export interface CertificateTemplate {
  id: string;
  name: string;
  url: string;
  filename: string;
}

// Draggable Certificate Element Definition
export interface CertificateElement {
  id: string;
  type: 'text' | 'image';
  content: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  textAlign?: 'left' | 'center' | 'right';
  letterSpacing?: string;
  lineHeight?: number | string;
  textTransform?: 'uppercase' | 'none' | 'capitalize';
  whiteSpace?: 'nowrap' | 'normal' | string;
  isCircleImage?: boolean;
  borderWidth?: number;
  borderColor?: string;
  border?: string;
  boxShadow?: string;
  maxFontSize?: number;
  textShadow?: string;
}

// Fallback certificate templates strictly in /certificates/
const DEFAULT_CERTIFICATE_TEMPLATES: CertificateTemplate[] = [
  { id: 'cert-1.jpg', name: 'Mẫu Khen Thưởng 1', url: '/certificates/1.jpg', filename: '1.jpg' },
  { id: 'cert-2.jpg', name: 'Mẫu Khen Thưởng 2', url: '/certificates/2.jpg', filename: '2.jpg' },
  { id: 'cert-3.jpg', name: 'Mẫu Khen Thưởng 3', url: '/certificates/3.jpg', filename: '3.jpg' },
  { id: 'cert-4.jpg', name: 'Mẫu Khen Thưởng 4', url: '/certificates/4.jpg', filename: '4.jpg' },
  { id: 'cert-5.jpg', name: 'Mẫu Khen Thưởng 5', url: '/certificates/5.jpg', filename: '5.jpg' },
  { id: 'cert-7.jpg', name: 'Mẫu Khen Thưởng 7', url: '/certificates/7.jpg', filename: '7.jpg' },
  { id: 'cert-8.jpg', name: 'Mẫu Khen Thưởng 8', url: '/certificates/8.jpg', filename: '8.jpg' },
  { id: 'cert-9.jpg', name: 'Mẫu Khen Thưởng 9', url: '/certificates/9.jpg', filename: '9.jpg' },
  { id: 'cert-10.jpg', name: 'Mẫu Khen Thưởng 10', url: '/certificates/10.jpg', filename: '10.jpg' },
  { id: 'cert-11.jpg', name: 'Mẫu Khen Thưởng 11', url: '/certificates/11.jpg', filename: '11.jpg' },
  { id: 'cert-12.jpg', name: 'Mẫu Khen Thưởng 12', url: '/certificates/12.jpg', filename: '12.jpg' },
  { id: 'cert-13.jpg', name: 'Mẫu Khen Thưởng 13', url: '/certificates/13.jpg', filename: '13.jpg' },
  { id: 'cert-14.jpg', name: 'Mẫu Khen Thưởng 14', url: '/certificates/14.jpg', filename: '14.jpg' },
];

// Helper to format friendly template display names from filenames
const formatTemplateName = (rawFilename: string, index: number): string => {
  const cleanName = rawFilename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  if (/^tpl\s*\d+$/i.test(cleanName)) {
    const num = cleanName.match(/\d+/)?.[0] || String(index + 1);
    const friendlyMap: Record<string, string> = {
      '1': 'Mẫu Học Tập',
      '2': 'Mẫu Cổ Điển',
      '3': 'Mẫu Bầu Trời',
      '4': 'Mẫu Cắm Trại',
    };
    return friendlyMap[num] || `Mẫu Khen Thưởng ${num}`;
  }

  return cleanName.length > 0
    ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1)
    : `Mẫu Thư Khen ${index + 1}`;
};

// Available artistic fonts categorized by typography styles
export interface CertFontOption {
  id: string;
  name: string;
  font: string;
  category: 'cursive' | 'serif' | 'sans';
}

const CERT_FONTS: CertFontOption[] = [
  // Nhóm Ký tên / Cursive nghệ thuật (Dành cho Tên học sinh & Chữ ký)
  { id: 'dancing', name: 'Nghệ thuật (Dancing Script)', font: '"Dancing Script", cursive', category: 'cursive' },
  { id: 'great_vibes', name: 'Ký tên Quý phái (Great Vibes)', font: '"Great Vibes", cursive', category: 'cursive' },
  { id: 'pattaya', name: 'Mềm mại Bay bổng (Pattaya)', font: '"Pattaya", cursive', category: 'cursive' },
  { id: 'charm', name: 'Thanh lịch Duyên dáng (Charm)', font: '"Charm", cursive', category: 'cursive' },
  { id: 'pacifico', name: 'Trẻ trung Phóng khoáng (Pacifico)', font: '"Pacifico", cursive', category: 'cursive' },

  // Nhóm Sang trọng & Cổ điển (Serif - Dành cho Tiêu đề THƯ KHEN & Lời dẫn)
  { id: 'playfair', name: 'Sang trọng Hoàng gia (Playfair Display)', font: '"Playfair Display", serif', category: 'serif' },
  { id: 'lora', name: 'Trang nhã Học thuật (Lora)', font: '"Lora", serif', category: 'serif' },
  { id: 'merriweather', name: 'Cổ điển Đậm đà (Merriweather)', font: '"Merriweather", serif', category: 'serif' },
  { id: 'times', name: 'Truyền thống (Times New Roman)', font: '"Times New Roman", serif', category: 'serif' },

  // Nhóm Hiện đại & Chuẩn mực (Sans-Serif - Dành cho Trường học, Lớp, Lý do)
  { id: 'montserrat', name: 'Hiện đại Đẳng cấp (Montserrat)', font: '"Montserrat", sans-serif', category: 'sans' },
  { id: 'jakarta', name: 'Hiện đại Tinh tế (Plus Jakarta Sans)', font: '"Plus Jakarta Sans", sans-serif', category: 'sans' },
  { id: 'be_vietnam', name: 'Việt hóa Chuẩn mực (Be Vietnam Pro)', font: '"Be Vietnam Pro", sans-serif', category: 'sans' },
  { id: 'arial', name: 'Tiêu chuẩn Cơ bản (Arial)', font: 'Arial, sans-serif', category: 'sans' },
];

// Curated Artistic Palettes (Paired Harmony: Title + Student Name + Accents)
export interface ArtisticPalette {
  name: string;
  titleColor: string;
  nameColor: string;
  subColor: string;
  leadColor: string;
  accentBorder: string;
}

const ARTISTIC_PALETTES: ArtisticPalette[] = [
  {
    name: 'Hoàng Gia (Vàng Kim & Xanh Navy)',
    titleColor: '#d4af37', // Vàng Kim Hoàng Gia
    nameColor: '#000080',  // Xanh Navy Đậm
    subColor: '#b45309',   // Vàng Nâu Đậm
    leadColor: '#475569',
    accentBorder: '#fbbf24',
  },
  {
    name: 'Quý Phái (Đỏ Đô & Vàng Ánh Kim)',
    titleColor: '#800000', // Đỏ Đô Quý Phái
    nameColor: '#b45309',  // Vàng Kim / Nâu Vàng
    subColor: '#c2410c',   // Cam Đồng
    leadColor: '#475569',
    accentBorder: '#f59e0b',
  },
  {
    name: 'Emerald (Xanh Ngọc & Đỏ Rượu)',
    titleColor: '#065f46', // Xanh Ngọc Emerald
    nameColor: '#881337',  // Đỏ Rượu Vang
    subColor: '#0d9488',   // Teal
    leadColor: '#475569',
    accentBorder: '#10b981',
  },
  {
    name: 'Tím Quý Tộc & Sapphire',
    titleColor: '#581c87', // Tím Hoàng Gia
    nameColor: '#1e3a8a',  // Xanh Royal Sapphire
    subColor: '#7c3aed',   // Tím Sáng
    leadColor: '#475569',
    accentBorder: '#a855f7',
  },
  {
    name: 'Ruby Cổ Điển & Xanh Đậm',
    titleColor: '#b91c1c', // Ruby Đỏ Rực
    nameColor: '#0a2540',  // Xanh Đêm Thẳm
    subColor: '#c2410c',   // Cam Nâu
    leadColor: '#475569',
    accentBorder: '#f43f5e',
  },
];

export const CertificateView: React.FC = () => {
  const { classes, activeClassId, setActiveClassId, students, teacherProfile, currentUser } = useClassroom();

  const currentClassStudents = useMemo(() => {
    return students.filter(s => s.classId === activeClassId);
  }, [students, activeClassId]);

  const activeClass = useMemo(() => {
    return classes.find(c => c.id === activeClassId);
  }, [classes, activeClassId]);

  // Dynamic template scanning state from /api/certificates
  const [templates, setTemplates] = useState<CertificateTemplate[]>(DEFAULT_CERTIFICATE_TEMPLATES);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    DEFAULT_CERTIFICATE_TEMPLATES[0]?.id || 'cert-tpl_1.jpg'
  );
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  // Form Fields
  const [certType, setCertType] = useState<'Tuần' | 'Tháng' | 'Học Kì' | 'Năm Học' | 'Đột Xuất'>('Tuần');
  const [certTypeDetail, setCertTypeDetail] = useState('1');
  const [academicYear, setAcademicYear] = useState('2026–2027');
  const [reason, setReason] = useState('Đã có nhiều tiến bộ vượt bậc trong học tập và rèn luyện');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Mặc định trung tính (tên trường / giáo viên lấy từ hồ sơ tài khoản đang đăng nhập)
  const defaultSchool = 'TRƯỜNG HỌC';
  const defaultTeacherName = 'GIÁO VIÊN CHỦ NHIỆM';

  const [schoolName, setSchoolName] = useState(() => {
    return teacherProfile?.schoolName || defaultSchool;
  });

  const [teacherName, setTeacherName] = useState(() => {
    return teacherProfile?.name || currentUser?.fullName || defaultTeacherName;
  });

  // Student Selection & Preview
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [previewStudentId, setPreviewStudentId] = useState<string | null>(null);
  const [coinThreshold, setCoinThreshold] = useState(50);
  const [isFilterSettingsOpen, setIsFilterSettingsOpen] = useState(false);
  const [isSidebarSection, setIsSidebarSection] = useState<'templates' | 'content' | 'students'>('templates');

  // Canvas Scaling State (Live Preview responsive scaling)
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.5);
  const canvasWidthRef = useRef(CANVAS_WIDTH);
  const [scaleTick, setScaleTick] = useState(0);

  // Draggable Elements Canvas State
  const [elements, setElements] = useState<CertificateElement[]>([]);
  const [activeElementId, setActiveElementId] = useState<string | null>(null);

  // Edit Mode Toggle: Khi bật, cho phép click chọn và hiển thị Fixed Properties Panel
  const [isEditMode, setIsEditMode] = useState(true);

  // Current Layout Variant tracking: 1 (Cổ điển), 2 (Hiện đại), 3 (Sáng tạo)
  const [currentLayoutVariant, setCurrentLayoutVariant] = useState<1 | 2 | 3>(1);

  // Drag interaction state
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number }>({
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
  });

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState('');

  const certificatePrintRef = useRef<HTMLDivElement>(null);

  // =========================================================================
  // DIGITAL SIGNATURE & SCHOOL LOGO SMART BACKGROUND REMOVAL (CANVAS 2D)
  // =========================================================================
  const SIGNATURE_STORAGE_KEY = 'lhhp_cert_teacher_signature';
  const AUTO_SIGNATURE_KEY = 'lhhp_cert_auto_signature';
  const LOGO_STORAGE_KEY = 'lhhp_cert_school_logo';

  const [teacherSignatureImage, setTeacherSignatureImage] = useState<string | null>(() => {
    return localStorage.getItem(SIGNATURE_STORAGE_KEY) || null;
  });

  const [schoolLogoImage, setSchoolLogoImage] = useState<string | null>(() => {
    return localStorage.getItem(LOGO_STORAGE_KEY) || null;
  });

  const [autoInsertSignature, setAutoInsertSignature] = useState<boolean>(() => {
    const saved = localStorage.getItem(AUTO_SIGNATURE_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  const [isProcessingSignature, setIsProcessingSignature] = useState(false);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const signatureFileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  // Thuật toán tách nền trắng bằng Canvas API 2D từ imageProcessor utility
  // Áp dụng chung cho cả Chữ Ký Tay và Logo Nhà Trường
  const processImageBackground = (img: HTMLImageElement): Promise<string> => {
    return removeWhiteBackground(img);
  };

  // =========================================================================
  // 1A. NON-DESTRUCTIVE SIGNATURE INJECTION
  // Chèn chữ ký độc lập vào Canvas (như đóng con dấu vào trang viết dở)
  // Tuyệt đối KHÔNG gọi lại layout generator, giữ nguyên vẹn 100% tọa độ các element khác.
  // =========================================================================
  const appendSignatureToCanvas = (signatureBase64: string = (teacherSignatureImage || ''), initialAspect: number = 0.5) => {
    if (!signatureBase64) {
      signatureFileInputRef.current?.click();
      return;
    }

    const defaultWidth = 280;
    const defaultHeight = Math.round(defaultWidth * initialAspect);

    const newSignatureElement: CertificateElement = {
      id: 'signature',
      type: 'image',
      content: signatureBase64,
      x: 1300,
      y: 800,
      width: defaultWidth,
      height: defaultHeight,
      isCircleImage: false,
      borderWidth: 0,
      boxShadow: 'none',
    };

    setElements(prev => {
      // Đặt ở cuối mảng để luôn render ở lớp trên cùng
      const filtered = prev.filter(el => el.id !== 'signature' && el.id !== 'teacher_signature_img');
      return [...filtered, newSignatureElement];
    });
    setActiveElementId('signature');
  };

  // =========================================================================
  // 1B. NON-DESTRUCTIVE LOGO INJECTION
  // Chèn Logo nhà trường độc lập vào Canvas ở góc trên (Lớp trên cùng)
  // Tuyệt đối KHÔNG gọi lại layout generator, giữ nguyên vẹn 100% tọa độ các element khác.
  // =========================================================================
  const appendLogoToCanvas = (logoBase64: string = (schoolLogoImage || ''), initialAspect: number = 1) => {
    if (!logoBase64) {
      logoFileInputRef.current?.click();
      return;
    }

    const defaultWidth = 140;
    const defaultHeight = Math.round(defaultWidth * initialAspect);

    const newLogoElement: CertificateElement = {
      id: 'school_logo',
      type: 'image',
      content: logoBase64,
      x: 160,
      y: 80,
      width: defaultWidth,
      height: defaultHeight,
      isCircleImage: false,
      borderWidth: 0,
      boxShadow: 'none',
    };

    setElements(prev => {
      // Đặt ở cuối mảng để luôn render ở lớp trên cùng
      const filtered = prev.filter(el => el.id !== 'school_logo');
      return [...filtered, newLogoElement];
    });
    setActiveElementId('school_logo');
  };

  // Hàm tải ảnh chữ ký lên và tự động tách nền
  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingSignature(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          const cleanSignature = await processImageBackground(img);
          setTeacherSignatureImage(cleanSignature);
          localStorage.setItem(SIGNATURE_STORAGE_KEY, cleanSignature);

          const aspect = (img.naturalWidth && img.naturalHeight) ? (img.naturalHeight / img.naturalWidth) : 0.5;

          // NON-DESTRUCTIVE: Chỉ gắn thêm con dấu chữ ký vào bản vẽ hiện tại, KHÔNG reset layout
          if (autoInsertSignature) {
            appendSignatureToCanvas(cleanSignature, aspect);
          }
          confetti({ particleCount: 50, spread: 50, origin: { y: 0.7 } });
        } catch (err) {
          console.error('Lỗi tách nền chữ ký:', err);
          alert('Không thể tách nền chữ ký. Vui lòng thử lại với ảnh chụp rõ nét hơn!');
        } finally {
          setIsProcessingSignature(false);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Hàm tải ảnh Logo lên và tự động tách nền
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingLogo(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          const cleanLogo = await processImageBackground(img);
          setSchoolLogoImage(cleanLogo);
          localStorage.setItem(LOGO_STORAGE_KEY, cleanLogo);

          const aspect = (img.naturalWidth && img.naturalHeight) ? (img.naturalHeight / img.naturalWidth) : 1;

          // NON-DESTRUCTIVE: Thêm ngay vào canvas hiện tại, không reset layout
          appendLogoToCanvas(cleanLogo, aspect);
          confetti({ particleCount: 50, spread: 50, origin: { y: 0.6 } });
        } catch (err) {
          console.error('Lỗi tách nền logo:', err);
          alert('Không thể tách nền logo. Vui lòng thử lại với ảnh rõ nét hơn!');
        } finally {
          setIsProcessingLogo(false);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Hàm xóa chữ ký đã lưu
  const handleRemoveSavedSignature = () => {
    setTeacherSignatureImage(null);
    localStorage.removeItem(SIGNATURE_STORAGE_KEY);
    setElements(prev => prev.filter(el => el.id !== 'signature' && el.id !== 'teacher_signature_img'));
    if (activeElementId === 'signature' || activeElementId === 'teacher_signature_img') {
      setActiveElementId(null);
    }
  };

  // Hàm xóa logo đã lưu
  const handleRemoveSavedLogo = () => {
    setSchoolLogoImage(null);
    localStorage.removeItem(LOGO_STORAGE_KEY);
    setElements(prev => prev.filter(el => el.id !== 'school_logo'));
    if (activeElementId === 'school_logo') {
      setActiveElementId(null);
    }
  };

  // Fetch dynamic templates from public/certificates/
  const refreshTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const res = await fetch('/api/certificates');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.templates) && data.templates.length > 0) {
          const formattedList: CertificateTemplate[] = data.templates.map((item: any, idx: number) => ({
            id: item.id || `cert-${item.filename}`,
            name: formatTemplateName(item.filename, idx),
            url: item.url.startsWith('/') ? item.url : `/${item.url}`,
            filename: item.filename
          }));
          setTemplates(formattedList);
          if (!formattedList.some(t => t.id === selectedTemplateId)) {
            setSelectedTemplateId(formattedList[0].id);
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch /api/certificates, using fallback in /certificates/:', err);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [selectedTemplateId]);

  useEffect(() => {
    refreshTemplates();
  }, []);

  useEffect(() => { loadDecorativeFonts(); }, []);

  // Compute live responsive scale factor based on container dimensions
  useEffect(() => {
    const updateScale = () => {
      if (previewContainerRef.current) {
        const containerW = previewContainerRef.current.clientWidth - 48;
        const containerH = previewContainerRef.current.clientHeight - 80;
        const scaleX = containerW / canvasWidthRef.current;
        const scaleY = containerH / CANVAS_HEIGHT;
        const calculatedScale = Math.min(scaleX, scaleY);
        setPreviewScale(Math.max(0.18, Math.min(calculatedScale, 0.95)));
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [scaleTick]);

  // Auto-select eligible students when class changes
  useEffect(() => {
    if (currentClassStudents.length > 0) {
      const eligible = currentClassStudents.filter(s => s.points >= coinThreshold).map(s => s.id);
      const initialSelection = eligible.length > 0 ? eligible : [currentClassStudents[0].id];
      setSelectedStudents(initialSelection);
      setPreviewStudentId(initialSelection[0] || currentClassStudents[0].id);
    } else {
      setSelectedStudents([]);
      setPreviewStudentId(null);
    }
  }, [activeClassId, currentClassStudents.length, coinThreshold]);

  // Active Template
  const activeTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedTemplateId) || templates[0] || DEFAULT_CERTIFICATE_TEMPLATES[0];
  }, [templates, selectedTemplateId]);

  // Currently previewed student
  const previewStudent = useMemo(() => {
    return currentClassStudents.find(s => s.id === previewStudentId) || currentClassStudents[0] || null;
  }, [currentClassStudents, previewStudentId]);

  // Formatted Title
  const certificateTitle = useMemo(() => {
    if (certType === 'Tuần') return `THƯ KHEN TUẦN ${certTypeDetail || '1'}`;
    if (certType === 'Tháng') return `THƯ KHEN THÁNG ${certTypeDetail || '1'}`;
    if (certType === 'Học Kì') return `THƯ KHEN HỌC KÌ ${certTypeDetail || '1'} • NĂM HỌC ${academicYear}`;
    if (certType === 'Năm Học') return `THƯ KHEN XUẤT SẮC NĂM HỌC ${academicYear}`;
    return 'THƯ KHEN ĐỘT XUẤT';
  }, [certType, certTypeDetail, academicYear]);

  // Formatted Date
  const formattedDate = useMemo(() => {
    try {
      const [year, month, day] = issueDate.split('-');
      if (year && month && day) {
        return `Ngày ${parseInt(day, 10)} tháng ${parseInt(month, 10)} năm ${year}`;
      }
    } catch {
      // fallback
    }
    const now = new Date();
    return `Ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;
  }, [issueDate]);

  // =========================================================================
  // 🎨 BỐ CỤC TỰ ĐỘNG THEO ẢNH NỀN (src/utils/certificateLayout.ts)
  // - Đọc ảnh nền: vùng trống, khung viền, huy chương, nhân vật, màu chủ đạo.
  // - Khung thư khen giữ đúng tỉ lệ ảnh nền (không kéo méo), cao 1080px.
  // - 3 bố cục: Căn giữa / Ảnh bên trái / Ảnh bên phải + 4 bộ phông nghệ thuật.
  // =========================================================================
  const [templateAnalysis, setTemplateAnalysis] = useState<TemplateAnalysis | null>(null);
  const [typoIndex, setTypoIndex] = useState(0);
  const canvasW = templateAnalysis?.canvasW || CANVAS_WIDTH;
  const [signatureAspect, setSignatureAspect] = useState(0.45);
  const [logoAspect, setLogoAspect] = useState(1);

  useEffect(() => {
    canvasWidthRef.current = canvasW;
    setScaleTick(t => t + 1);
  }, [canvasW]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [analysis] = await Promise.all([analyzeTemplate(activeTemplate.url), ensureCertificateFonts()]);
      if (!cancelled) setTemplateAnalysis(analysis);
    })();
    return () => { cancelled = true; };
  }, [activeTemplate.url]);

  useEffect(() => {
    const measure = (src: string | null, set: (v: number) => void, fallback: number) => {
      if (!src) return;
      const img = new Image();
      img.onload = () => set(img.naturalWidth ? img.naturalHeight / img.naturalWidth : fallback);
      img.src = src;
    };
    measure(teacherSignatureImage, setSignatureAspect, 0.45);
    measure(schoolLogoImage, setLogoAspect, 1);
  }, [teacherSignatureImage, schoolLogoImage]);

  const VARIANT_TO_COMPOSITION: Record<1 | 2 | 3, CertComposition> = { 1: 'center', 2: 'left', 3: 'right' };
  const COMPOSITION_TO_VARIANT: Record<CertComposition, 1 | 2 | 3> = { center: 1, left: 2, right: 3 };

  const classLabel = activeClass?.name ? `Lớp ${activeClass.name}` : 'Lớp';

  /** Nội dung thay đổi theo từng học sinh (dùng khi đổi học sinh xem trước & xuất hàng loạt) */
  const contentMapFor = useCallback((student: any): Record<string, string> => ({
    student_name: student?.name || 'Nguyễn Văn An',
    student_avatar: student?.originalAvatar || student?.avatar || '',
    student_class: `Học sinh ${classLabel}`,
    reason_body: `“${reason}”`,
    school_header: schoolName.toUpperCase(),
    title_sub: certificateTitle,
    date_text: formattedDate,
    teacher_signature: teacherName,
  }), [classLabel, reason, schoolName, certificateTitle, formattedDate, teacherName]);

  const generateRandomizedLayout = useCallback((
    student = previewStudent,
    forceVariant?: 1 | 2 | 3,
    typo: number = typoIndex,
  ): { layout: CertificateElement[]; variant: 1 | 2 | 3 } => {
    const analysis = templateAnalysis;
    if (!analysis) return { layout: elements, variant: currentLayoutVariant };
    const variant = forceVariant || COMPOSITION_TO_VARIANT[preferredComposition(analysis)];
    const content: CertContent = {
      schoolName,
      title: 'Thư khen',
      subtitle: certificateTitle,
      lead: 'Trân trọng khen ngợi em',
      studentName: student?.name || 'Nguyễn Văn An',
      avatar: student?.originalAvatar || student?.avatar || '',
      className: `Học sinh ${classLabel}`,
      reason: `“${reason}”`,
      date: formattedDate,
      teacherTitle: 'Giáo viên chủ nhiệm',
      teacherName,
      signature: teacherSignatureImage && autoInsertSignature ? teacherSignatureImage : null,
      signatureAspect,
      logo: schoolLogoImage,
      logoAspect,
    };
    const layout = buildCertificateLayout(analysis, content, VARIANT_TO_COMPOSITION[variant], CERT_TYPOGRAPHY[typo % CERT_TYPOGRAPHY.length]);
    return { layout: layout as CertificateElement[], variant };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateAnalysis, previewStudent, typoIndex, schoolName, certificateTitle, classLabel, reason, formattedDate, teacherName, teacherSignatureImage, autoInsertSignature, signatureAspect, schoolLogoImage, logoAspect]);

  // Dựng lại bố cục khi đổi ảnh nền (phân tích xong). Đổi học sinh / sửa nội dung KHÔNG làm mất vị trí đã chỉnh.
  const generateRef = useRef(generateRandomizedLayout);
  generateRef.current = generateRandomizedLayout;
  useEffect(() => {
    if (!templateAnalysis) return;
    const { layout, variant } = generateRef.current();
    setElements(layout);
    setCurrentLayoutVariant(variant);
    setActiveElementId(null);
  }, [templateAnalysis]);

  // Update dynamic content in elements while preserving user-adjusted coordinates (chữ dài tự thu nhỏ)
  const updateStudentInElements = useCallback((student: any, existingElements: CertificateElement[]): CertificateElement[] => {
    return fitElementsToContent(existingElements, contentMapFor(student));
  }, [contentMapFor]);

  // Keep elements content in sync when form fields change
  useEffect(() => {
    setElements(prev => updateStudentInElements(previewStudent, prev));
  }, [previewStudent, updateStudentInElements]);

  // ==========================================
  // NÚT "TẠO THƯ KHEN": đổi sang bố cục + bộ phông khác, vẫn tự né hoạ tiết của ảnh nền
  // ==========================================
  const handleAutoLayout = () => {
    const variants: Array<1 | 2 | 3> = [1, 2, 3];
    const choices = variants.filter(v => v !== currentLayoutVariant);
    const nextVariant = choices[Math.floor(Math.random() * choices.length)];
    let nextTypo = Math.floor(Math.random() * CERT_TYPOGRAPHY.length);
    if (nextTypo === typoIndex) nextTypo = (nextTypo + 1) % CERT_TYPOGRAPHY.length;
    setTypoIndex(nextTypo);
    const { layout, variant } = generateRandomizedLayout(previewStudent, nextVariant, nextTypo);
    setElements(layout);
    setCurrentLayoutVariant(variant);
    setActiveElementId(null);
    confetti({ particleCount: 75, spread: 65, origin: { y: 0.6 } });
  };

  // ==========================================
  // NÚT "TẠO LẠI": về bố cục đề xuất cho ảnh nền này
  // ==========================================
  const handleResetLayout = () => {
    const { layout, variant } = generateRandomizedLayout(previewStudent);
    setElements(layout);
    setCurrentLayoutVariant(variant);
    setActiveElementId(null);
  };

  const applyVariant = (v: 1 | 2 | 3, typo: number = typoIndex) => {
    const { layout, variant } = generateRandomizedLayout(previewStudent, v, typo);
    setElements(layout);
    setCurrentLayoutVariant(variant);
    setActiveElementId(null);
  };

  // ==========================================
  // CLICK-TO-SELECT & SEPARATE MOUSE DRAG EVENT HANDLERS
  // - Click (onClick): Select object (activeElementId)
  // - MouseDown + MouseMove: Drag and move position (X, Y)
  // ==========================================
  const handleElementMouseDown = (e: React.MouseEvent, id: string) => {
    if (!isEditMode || isExporting) return;
    e.stopPropagation();
    setActiveElementId(id);

    const targetElement = elements.find(el => el.id === id);
    if (!targetElement) return;

    isDraggingRef.current = true;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: targetElement.x,
      initialY: targetElement.y,
    };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!isEditMode || isExporting || !isDraggingRef.current || !activeElementId) return;

    const deltaX = (e.clientX - dragStartRef.current.startX) / previewScale;
    const deltaY = (e.clientY - dragStartRef.current.startY) / previewScale;

    const newX = Math.round(dragStartRef.current.initialX + deltaX);
    const newY = Math.round(dragStartRef.current.initialY + deltaY);

    setElements(prev => prev.map(el => {
      if (el.id === activeElementId) {
        return { ...el, x: newX, y: newY };
      }
      return el;
    }));
  };

  const handleCanvasMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Helper wait for DOM update
  const waitForNextFrame = (ms: number = 320) => new Promise(resolve => setTimeout(resolve, ms));

  // =========================================================================
  // ACTION BUTTON 3: TẢI THƯ KHEN (FLAWLESS 1920x1080 EXPORT)
  // Fixes corner shrink bug using html-to-image override options:
  // canvasWidth: 1920, canvasHeight: 1080, style: { transform: 'scale(1)', transformOrigin: 'top left' }
  // =========================================================================
  /**
   * Tạo ảnh thư khen: vẽ trực tiếp lên canvas (giữ đúng phông nghệ thuật, nhanh);
   * nếu không được (ví dụ ảnh học sinh từ nguồn chặn CORS) thì chụp bản xem trước như cách cũ.
   */
  const renderCertificateImage = async (els: CertificateElement[], type: 'png' | 'jpeg', initial: string): Promise<string> => {
    try {
      const cv = await renderCertificateCanvas(els, activeTemplate.url, canvasW, CANVAS_HEIGHT, initial);
      return type === 'png' ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.95);
    } catch (err) {
      console.warn('Vẽ canvas thất bại, chụp bản xem trước:', err);
      const node = certificatePrintRef.current;
      if (!node) throw err;
      await waitForImages(node);
      const opts = {
        quality: type === 'png' ? 1 : 0.95,
        pixelRatio: 1,
        canvasWidth: canvasW,
        canvasHeight: CANVAS_HEIGHT,
        backgroundColor: '#ffffff',
        style: { transform: 'scale(1)', transformOrigin: 'top left' },
        cacheBust: true,
      };
      return type === 'png' ? toPng(node, opts) : toJpeg(node, opts);
    }
  };

  const waitForImages = async (node: HTMLElement) => {
    const imgs = Array.from(node.querySelectorAll('img'));
    await Promise.all(imgs.map(img => (img.complete && img.naturalWidth > 0)
      ? Promise.resolve()
      : new Promise<void>(resolve => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        setTimeout(done, 4000);
      })));
  };

  const handleDownloadSingle = async () => {
    if (!certificatePrintRef.current) return;
    setIsExporting(true);
    setExportProgress(50);
    setExportMessage(`Đang xuất ảnh thư khen ${previewStudent?.name || ''}...`);

    try {
      // CLEAR ACTIVE ELEMENT FOCUS BEFORE EXPORTING
      setActiveElementId(null);
      await waitForNextFrame(180);

      const dataUrl = await renderCertificateImage(elements, 'png', previewStudent?.name?.charAt(0) || 'A');

      const studentNameClean = previewStudent?.name || 'HocSinh';
      const link = document.createElement('a');
      link.download = `ThuKhen_${studentNameClean.replace(/\s+/g, '_')}.png`;
      link.href = dataUrl;
      link.click();

      confetti({ particleCount: 110, spread: 75, origin: { y: 0.6 } });
    } catch (err) {
      console.error('Error downloading certificate:', err);
      alert('Không thể tạo file ảnh. Vui lòng thử lại!');
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setExportMessage('');
    }
  };

  // =========================================================================
  // 2. XUẤT HÀNG LOẠT: cùng một mẫu, cùng vị trí – chỉ thay ảnh, tên (tự co chữ nếu tên dài)
  //    Kết quả gói gọn trong 1 tệp: ZIP (ảnh JPG) hoặc PDF (mỗi trang một thư khen, để in).
  // =========================================================================
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchScope, setBatchScope] = useState<'selected' | 'all'>('selected');
  const [batchFormat, setBatchFormat] = useState<'zip' | 'pdf'>('zip');

  const handleExportBatch = () => {
    setBatchScope(selectedStudents.length > 0 && selectedStudents.length < currentClassStudents.length ? 'selected' : 'all');
    setShowBatchDialog(true);
  };

  const runBatchExport = async () => {
    const node = certificatePrintRef.current;
    const ids = batchScope === 'all'
      ? currentClassStudents.map(s => s.id)
      : currentClassStudents.filter(s => selectedStudents.includes(s.id)).map(s => s.id);
    if (!node || ids.length === 0) return;
    setShowBatchDialog(false);

    const wasEditMode = isEditMode;
    setIsExporting(true);
    setExportProgress(0);
    setActiveElementId(null);
    setIsEditMode(false);

    // Mẫu gốc bất biến (vị trí, phông, màu do thầy cô đã căn chỉnh)
    const masterTemplate: CertificateElement[] = JSON.parse(JSON.stringify(elements));
    const lopName = activeClass?.name || 'Lop';
    try {
      const zip = batchFormat === 'zip' ? new (await import('jszip')).default() : null;
      const pdf = batchFormat === 'pdf'
        ? new (await import('jspdf')).jsPDF({ orientation: 'landscape', unit: 'px', format: [canvasW, CANVAS_HEIGHT], compress: true })
        : null;

      for (let i = 0; i < ids.length; i++) {
        const student = currentClassStudents.find(s => s.id === ids[i]);
        const studentName = student?.name || `Hoc sinh ${i + 1}`;
        setExportMessage(`Đang tạo thư khen (${i + 1}/${ids.length}): ${studentName}`);
        const studentEls = fitElementsToContent(masterTemplate, contentMapFor(student));
        setElements(studentEls);
        await waitForNextFrame(30);
        const dataUrl = await Promise.race([
          renderCertificateImage(studentEls, 'jpeg', studentName.charAt(0) || 'A'),
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Quá thời gian tạo ảnh')), 60000)),
        ]);
        const fileName = `${String(i + 1).padStart(2, '0')}_ThuKhen_${studentName.replace(/\s+/g, '_')}.jpg`;
        if (zip) zip.file(fileName, dataUrl.split(',')[1], { base64: true });
        if (pdf) {
          if (i > 0) pdf.addPage([canvasW, CANVAS_HEIGHT], 'landscape');
          pdf.addImage(dataUrl, 'JPEG', 0, 0, canvasW, CANVAS_HEIGHT);
        }
        setExportProgress(Math.round(((i + 1) / ids.length) * 100));
      }

      setExportMessage('Đang đóng gói tệp…');
      const baseName = `ThuKhen_Lop${lopName}_${ids.length}HS`;
      if (zip) {
        const blob = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${baseName}.zip`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 5000);
      }
      if (pdf) pdf.save(`${baseName}.pdf`);
      confetti({ particleCount: 150, spread: 85, origin: { y: 0.6 } });
    } catch (error) {
      console.error('Lỗi khi xuất thư khen hàng loạt:', error);
      alert('Có lỗi xảy ra trong quá trình xuất thư khen hàng loạt. Vui lòng thử lại.');
    } finally {
      setElements(fitElementsToContent(masterTemplate, contentMapFor(previewStudent)));
      setIsEditMode(wasEditMode);
      setIsExporting(false);
      setExportProgress(0);
      setExportMessage('');
    }
  };

  // Update properties of the currently active element (Two-way realtime binding)
  const updateActiveElement = (updates: Partial<CertificateElement>) => {
    if (!activeElementId) return;
    setElements(prev => prev.map(el => {
      if (el.id === activeElementId) {
        const next = { ...el, ...updates };
        if (updates.fontSize) next.maxFontSize = updates.fontSize;
        return next;
      }
      return el;
    }));
  };

  // Remove the currently active element
  const deleteActiveElement = () => {
    if (!activeElementId) return;
    setElements(prev => prev.filter(el => el.id !== activeElementId));
    setActiveElementId(null);
  };

  const activeElement = elements.find(el => el.id === activeElementId);

  // Student selection helpers
  const handleToggleStudent = (studentId: string) => {
    setSelectedStudents(prev => {
      const exists = prev.includes(studentId);
      const next = exists ? prev.filter(id => id !== studentId) : [...prev, studentId];
      if (!exists && !previewStudentId) {
        setPreviewStudentId(studentId);
      }
      return next;
    });
    setPreviewStudentId(studentId);
  };

  const handleSelectAll = () => {
    if (selectedStudents.length === currentClassStudents.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(currentClassStudents.map(s => s.id));
      if (currentClassStudents.length > 0 && !previewStudentId) {
        setPreviewStudentId(currentClassStudents[0].id);
      }
    }
  };

  const handleSelectEligible = () => {
    const eligible = currentClassStudents.filter(s => s.points >= coinThreshold).map(s => s.id);
    setSelectedStudents(eligible);
    if (eligible.length > 0) setPreviewStudentId(eligible[0]);
  };

  // Preset reason recommendations
  const presetReasons = [
    'Đã có nhiều tiến bộ vượt bậc trong học tập và rèn luyện',
    'Tích cực hăng hái phát biểu xây dựng bài trong tuần',
    'Hoàn thành xuất sắc nhiệm vụ và đạt điểm thi đua cao nhất',
    'Chăm ngoan, lễ phép, tích cực giúp đỡ bạn bè trong lớp',
    'Đạt danh hiệu Học sinh Tiêu biểu - Lớp học Hạnh phúc',
  ];

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden select-none">
      
      {/* TOP HEADER */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shadow-xs z-20 shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-slate-800 tracking-tight uppercase">
                TRÌNH THIẾT KẾ THƯ KHEN PRO • {canvasW} × 1080
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-700 uppercase tracking-wider">
                {currentLayoutVariant === 1 ? 'CĂN GIỮA' : currentLayoutVariant === 2 ? 'ẢNH BÊN TRÁI' : 'ẢNH BÊN PHẢI'} • {CERT_TYPOGRAPHY[typoIndex].label.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Tự bố trí theo ảnh nền (né khung viền, huy chương, hoạ tiết) • Kéo thả chỉnh tay • Xuất hàng loạt ZIP/PDF
            </p>
          </div>
        </div>

        {/* 4 ACTION BUTTONS + TOGGLE EDIT MODE */}
        <div className="flex items-center gap-2">
          {/* Class selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 mr-1">
            <GraduationCap className="w-4 h-4 text-indigo-600" />
            <select
              value={activeClassId || ''}
              onChange={(e) => setActiveClassId(e.target.value)}
              className="bg-transparent text-xs font-black text-indigo-700 outline-none cursor-pointer"
            >
              <option value="" disabled>-- Chọn Lớp --</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>Lớp {c.name}</option>
              ))}
            </select>
          </div>

          {/* TOGGLE EDIT MODE BUTTON */}
          <button
            type="button"
            onClick={() => {
              setIsEditMode(!isEditMode);
              if (isEditMode) setActiveElementId(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black border transition-all ${
              isEditMode 
                ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-2xs' 
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
            }`}
            title={isEditMode ? 'Đang mở chế độ chỉnh sửa/kéo thả' : 'Đang khóa chế độ chỉnh sửa (tránh vô tình kéo lệch)'}
          >
            {isEditMode ? <Unlock className="w-3.5 h-3.5 text-amber-600" /> : <Lock className="w-3.5 h-3.5 text-slate-500" />}
            <span>{isEditMode ? 'CHỈNH SỬA: BẬT' : 'CHỈNH SỬA: TẮT'}</span>
          </button>

          {/* BUTTON 1: TẠO THƯ KHEN (Randomizes Layout 1, 2 or 3) */}
          <button
            type="button"
            onClick={handleAutoLayout}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 shadow-2xs transition-all hover-zoom-btn disabled:opacity-50 disabled:pointer-events-none uppercase"
            title="Phần mềm đọc ảnh nền rồi tự bố trí lại: đổi bố cục (căn giữa / ảnh trái / ảnh phải) và bộ phông chữ"
          >
            <Shuffle className="w-4 h-4 text-indigo-600" />
            <span>TẠO THƯ KHEN</span>
          </button>

          {/* BUTTON 2: TẠO LẠI (Reset Layout) */}
          <button
            type="button"
            onClick={handleResetLayout}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all hover-zoom-btn disabled:opacity-50 disabled:pointer-events-none uppercase"
            title="Về bố cục đề xuất cho ảnh nền đang chọn"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>TẠO LẠI</span>
          </button>

          {/* BUTTON 3: TẢI THƯ KHEN (Single Download) */}
          <button
            type="button"
            onClick={handleDownloadSingle}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all hover-zoom-btn disabled:opacity-50 uppercase"
            title="Tải ảnh thư khen học sinh đang chọn chuẩn 1920x1080"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>TẢI THƯ KHEN</span>
          </button>

          {/* BUTTON 4: TẢI HÀNG LOẠT (Batch Export) */}
          <button
            type="button"
            onClick={handleExportBatch}
            disabled={isExporting || currentClassStudents.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white bg-gradient-to-r from-emerald-600 via-teal-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-md shadow-emerald-600/20 transition-all hover-zoom-btn disabled:opacity-50 disabled:cursor-not-allowed uppercase"
            title="Tạo thư khen cho nhiều em hoặc cả lớp: cùng mẫu, cùng vị trí, gói trong 1 tệp ZIP hoặc PDF"
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Đang xuất ({exportProgress}%)</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>TẢI HÀNG LOẠT</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* MAIN TWO-COLUMN WORKSPACE */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT COLUMN: Configuration Toolbar */}
        <div className="w-96 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden shadow-sm z-10">
          
          {/* Navigation Sub-Tabs */}
          <div className="grid grid-cols-3 p-2 bg-slate-100/80 border-b border-slate-200 gap-1 text-center shrink-0">
            <button
              type="button"
              onClick={() => setIsSidebarSection('templates')}
              className={`py-2 px-1 rounded-xl text-xs font-black transition-all uppercase flex items-center justify-center gap-1.5 ${
                isSidebarSection === 'templates'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Mẫu ({templates.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSidebarSection('content')}
              className={`py-2 px-1 rounded-xl text-xs font-black transition-all uppercase flex items-center justify-center gap-1.5 ${
                isSidebarSection === 'content'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Nội Dung</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSidebarSection('students')}
              className={`py-2 px-1 rounded-xl text-xs font-black transition-all uppercase flex items-center justify-center gap-1.5 ${
                isSidebarSection === 'students'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Học Sinh ({selectedStudents.length})</span>
            </button>
          </div>

          {/* Section 1: Dynamic Templates Grid */}
          {isSidebarSection === 'templates' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Thư Viện Ảnh Mẫu Quét Động
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Lưu tại thư mục <code className="text-indigo-600 font-mono font-bold">public/certificates/</code>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={refreshTemplates}
                  disabled={isLoadingTemplates}
                  className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
                  title="Làm mới danh sách mẫu"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTemplates ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Grid of scanned template cards */}
              <div className="grid grid-cols-2 gap-3">
                {templates.map((tpl) => {
                  const isSelected = selectedTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(tpl.id)}
                      className={`group relative rounded-2xl p-1.5 border-2 text-left transition-all overflow-hidden flex flex-col ${
                        isSelected
                          ? 'border-indigo-600 ring-4 ring-indigo-500/15 shadow-md bg-indigo-50/50'
                          : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="aspect-[16/9] w-full rounded-xl overflow-hidden bg-slate-100 relative">
                        <img
                          src={tpl.url}
                          alt={tpl.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      <div className="pt-2 px-1">
                        <p className={`text-xs font-black truncate ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                          {tpl.name}
                        </p>
                        <span className="text-[10px] text-slate-400 font-mono truncate block">
                          {tpl.filename}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Layout Switcher helper */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200/80 text-xs text-slate-700 space-y-2.5">
                <strong className="text-indigo-950 font-black block uppercase text-xs tracking-wide">
                  🎨 Bố cục (tự né hoạ tiết ảnh nền)
                </strong>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 1, label: 'Căn giữa' },
                    { id: 2, label: 'Ảnh trái' },
                    { id: 3, label: 'Ảnh phải' },
                  ].map(b => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => applyVariant(b.id as 1 | 2 | 3)}
                      className={`py-1.5 px-1 rounded-xl text-xs font-black border transition-all ${
                        currentLayoutVariant === b.id
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                <strong className="text-indigo-950 font-black block uppercase text-xs tracking-wide pt-1">
                  ✒️ Bộ phông chữ
                </strong>
                <div className="grid grid-cols-2 gap-1.5">
                  {CERT_TYPOGRAPHY.map((t, idx) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { setTypoIndex(idx); applyVariant(currentLayoutVariant, idx); }}
                      className={`py-1.5 px-2 rounded-xl border transition-all text-left ${
                        typoIndex === idx
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="block text-xs font-black">{t.label}</span>
                      <span className="block text-base leading-tight truncate" style={{ fontFamily: t.name.family }}>Nguyễn An</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-600 leading-snug">
                  Màu chữ được lấy từ chính ảnh nền và tự chỉnh đủ đậm để dễ đọc. Kéo thả để chỉnh tay; bấm “Tạo lại” để về bố cục đề xuất.
                </p>
              </div>
            </div>
          )}

          {/* Section 2: Certificate Content Form */}
          {isSidebarSection === 'content' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              {/* Certificate Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                  Loại Thư Khen Thưởng
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Tuần', 'Tháng', 'Học Kì', 'Năm Học', 'Đột Xuất'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setCertType(type)}
                      className={`py-1.5 px-2 rounded-xl text-[11px] font-black transition-all border ${
                        certType === type
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Number / Semester / Academic Year Detail */}
              {certType !== 'Đột Xuất' && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      {certType === 'Tuần' ? 'Số tuần' : certType === 'Tháng' ? 'Tháng số' : 'Học kì'}
                    </label>
                    <input
                      type="text"
                      value={certTypeDetail}
                      onChange={e => setCertTypeDetail(e.target.value)}
                      placeholder="Ví dụ: 1"
                      className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      Năm học
                    </label>
                    <input
                      type="text"
                      value={academicYear}
                      onChange={e => setAcademicYear(e.target.value)}
                      placeholder="2026–2027"
                      className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Reason Form */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                    Nội Dung / Lý Do Khen Ngợi
                  </label>
                  <span className="text-[10px] text-indigo-600 font-bold">Gợi ý nhanh</span>
                </div>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full p-2.5 text-xs font-medium rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 outline-none resize-none leading-relaxed"
                  placeholder="Nhập lý do khen ngợi..."
                />
                
                {/* Reason Quick Pills */}
                <div className="flex flex-col gap-1 pt-1">
                  {presetReasons.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setReason(r)}
                      className="text-left text-[11px] text-slate-600 hover:text-indigo-700 bg-slate-50 hover:bg-indigo-50/60 p-1.5 rounded-lg border border-slate-200 truncate transition-colors font-medium"
                    >
                      • {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* School and Teacher Signature defaults */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-600 block mb-1">
                    Đơn vị / Tên Trường
                  </label>
                  <input
                    type="text"
                    value={schoolName}
                    onChange={e => setSchoolName(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-black uppercase text-slate-600 block mb-1">
                      Giáo Viên Khen
                    </label>
                    <input
                      type="text"
                      value={teacherName}
                      onChange={e => setTeacherName(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-black uppercase text-slate-600 block mb-1">
                      Ngày Khen
                    </label>
                    <input
                      type="date"
                      value={issueDate}
                      onChange={e => setIssueDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-bold rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>
                </div>

                {/* ========================================================= */}
                {/* MODULE 1: TẢI LÊN LOGO NHÀ TRƯỜNG (TÁCH NỀN TRONG SUỐT) */}
                {/* ========================================================= */}
                <div className="space-y-2.5 pt-3 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-amber-600" />
                      <span>Logo Nhà Trường</span>
                    </label>
                    <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      Tách nền Canvas 2D
                    </span>
                  </div>

                  {/* Hidden logo file input */}
                  <input
                    type="file"
                    ref={logoFileInputRef}
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />

                  {/* Button 1: Tải lên Logo */}
                  <button
                    type="button"
                    onClick={() => logoFileInputRef.current?.click()}
                    disabled={isProcessingLogo}
                    className="w-full py-2.5 px-3 rounded-xl border-2 border-dashed border-amber-300 hover:border-amber-500 bg-amber-50/50 hover:bg-amber-50 text-amber-800 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs group cursor-pointer"
                  >
                    {isProcessingLogo ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
                        <span>Đang quét & tách nền logo...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-amber-600 group-hover:-translate-y-0.5 transition-transform" />
                        <span>{schoolLogoImage ? 'Thay đổi ảnh Logo khác' : 'Tải lên Logo nhà trường'}</span>
                      </>
                    )}
                  </button>

                  {/* Logo Preview & Action */}
                  {schoolLogoImage && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Logo đã tách nền trong suốt:
                        </span>
                        <button
                          type="button"
                          onClick={handleRemoveSavedLogo}
                          className="text-slate-400 hover:text-rose-500 p-0.5 transition-colors cursor-pointer"
                          title="Xóa logo đã lưu"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div 
                        className="h-16 w-full rounded-lg border border-slate-300 flex items-center justify-center p-1.5 overflow-hidden shadow-2xs"
                        style={{
                          backgroundImage: 'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                          backgroundSize: '12px 12px',
                          backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                          backgroundColor: '#ffffff'
                        }}
                      >
                        <img
                          src={schoolLogoImage}
                          alt="Logo đã tách nền"
                          className="max-h-full max-w-full object-contain filter drop-shadow-xs"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => appendLogoToCanvas()}
                        disabled={isExporting}
                        className="w-full py-1.5 px-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:pointer-events-none text-white text-[11px] font-bold transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span>Chèn Logo vào bản thiết kế ngay</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* ========================================================= */}
                {/* MODULE 2: TẢI LÊN CHỮ KÝ TAY (TÁCH NỀN TRONG SUỐT) */}
                {/* ========================================================= */}
                <div className="space-y-2.5 pt-3 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <FileSignature className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Chữ Ký Điện Tử</span>
                    </label>
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Tách nền Canvas 2D
                    </span>
                  </div>

                  {/* Hidden signature file input */}
                  <input
                    type="file"
                    ref={signatureFileInputRef}
                    accept="image/*"
                    onChange={handleSignatureUpload}
                    className="hidden"
                  />

                  {/* Button 2: Tải lên Chữ ký tay */}
                  <button
                    type="button"
                    onClick={() => signatureFileInputRef.current?.click()}
                    disabled={isProcessingSignature}
                    className="w-full py-2.5 px-3 rounded-xl border-2 border-dashed border-indigo-300 hover:border-indigo-500 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-700 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs group cursor-pointer"
                  >
                    {isProcessingSignature ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                        <span>Đang quét & tách nền chữ ký...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-indigo-600 group-hover:-translate-y-0.5 transition-transform" />
                        <span>{teacherSignatureImage ? 'Thay đổi ảnh chữ ký khác' : 'Tải lên Chữ ký tay'}</span>
                      </>
                    )}
                  </button>

                  {/* Auto-Insert Checkbox */}
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-700 pt-0.5">
                    <input
                      type="checkbox"
                      checked={autoInsertSignature}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setAutoInsertSignature(val);
                        localStorage.setItem(AUTO_SIGNATURE_KEY, String(val));
                      }}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                    />
                    <span>Tự động chèn chữ ký khi Tạo thư khen</span>
                  </label>

                  {/* Signature Preview & Action */}
                  {teacherSignatureImage ? (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Chữ ký đã tách nền trong suốt:
                        </span>
                        <button
                          type="button"
                          onClick={handleRemoveSavedSignature}
                          className="text-slate-400 hover:text-rose-500 p-0.5 transition-colors cursor-pointer"
                          title="Xóa chữ ký đã lưu"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div 
                        className="h-16 w-full rounded-lg border border-slate-300 flex items-center justify-center p-1.5 overflow-hidden shadow-2xs"
                        style={{
                          backgroundImage: 'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                          backgroundSize: '12px 12px',
                          backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                          backgroundColor: '#ffffff'
                        }}
                      >
                        <img
                          src={teacherSignatureImage}
                          alt="Chữ ký đã tách nền"
                          className="max-h-full max-w-full object-contain filter drop-shadow-xs"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => appendSignatureToCanvas()}
                        disabled={isExporting}
                        className="w-full py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none text-white text-[11px] font-bold transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        <span>Chèn Chữ ký vào bản thiết kế ngay</span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">
                      💡 Mẹo: Chụp ảnh chữ ký hoặc logo trên giấy trắng, thuật toán sẽ tự động xóa sạch nền và giữ nguyên nét mực trong suốt.
                    </p>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* Section 3: Student Selection List */}
          {isSidebarSection === 'students' && (
            <div className="flex-1 flex flex-col overflow-hidden p-4">
              
              {/* Selection Controls */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1.5"
                  >
                    {selectedStudents.length === currentClassStudents.length ? (
                      <CheckSquare className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span>Chọn tất cả ({currentClassStudents.length})</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsFilterSettingsOpen(!isFilterSettingsOpen)}
                  className={`p-1.5 rounded-lg border text-xs font-bold transition-colors flex items-center gap-1 ${
                    isFilterSettingsOpen
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Lọc học sinh theo xu"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>Lọc Xu</span>
                </button>
              </div>

              {/* Coin Threshold Filter Sub-bar */}
              {isFilterSettingsOpen && (
                <div className="p-2.5 my-2 rounded-xl bg-blue-50 border border-blue-200 text-xs flex items-center gap-2 shrink-0">
                  <span className="font-bold text-blue-900">Điểm xu &ge;</span>
                  <input
                    type="number"
                    value={coinThreshold}
                    onChange={e => setCoinThreshold(Number(e.target.value) || 0)}
                    className="w-16 px-2 py-1 rounded-lg border border-blue-300 text-center font-bold text-blue-900 bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleSelectEligible}
                    className="ml-auto px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
                  >
                    Áp dụng
                  </button>
                </div>
              )}

              {/* Student Scrollable List */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pt-3">
                {currentClassStudents.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    Lớp chưa có học sinh. Vui lòng thêm học sinh ở phân hệ Lớp học.
                  </div>
                ) : (
                  currentClassStudents.map(student => {
                    const isSelected = selectedStudents.includes(student.id);
                    const isPreview = previewStudentId === student.id;

                    return (
                      <div
                        key={student.id}
                        onClick={() => setPreviewStudentId(student.id)}
                        className={`p-2 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                          isPreview
                            ? 'bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-200 shadow-2xs'
                            : 'bg-white border-slate-200 hover:border-indigo-200 hover:bg-slate-50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStudent(student.id);
                          }}
                          className="text-slate-400 hover:text-indigo-600"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>

                        <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 shrink-0 border border-slate-300">
                          {student.avatar ? (
                            <img src={student.avatar} alt={student.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs font-bold">
                              {student.name.charAt(0)}
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            {student.name}
                          </p>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {student.points} xu tích lũy
                          </span>
                        </div>

                        {isPreview && (
                          <div className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
                            <Eye className="w-3 h-3" />
                            <span>Xem</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          )}

        </div>

        {/* RIGHT COLUMN: Fixed Toolbar + Interactive Canvas Preview */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          
          {/* =========================================================================
              1. PERSISTENT PROPERTIES PANEL (Fixed Toolbar at the top of Right Column)
              - Always rendered when isEditMode === true
              - Empty state: Informative guidance message
              - Active state: Immediate two-way binding controls for Text or Image
          ========================================================================= */}
          {isEditMode && (
            <div className="bg-slate-100 border-b border-slate-200 px-5 py-2.5 flex items-center justify-between text-slate-800 shadow-md z-20 shrink-0 min-h-[52px]">
              {activeElement ? (
                <div className="flex items-center gap-3.5 flex-wrap w-full">
                  <div className="flex items-center gap-1.5 text-xs font-black text-indigo-600 uppercase border-r border-slate-200 pr-3 shrink-0">
                    <Sliders className="w-4 h-4 text-indigo-600" />
                    <span>
                      {activeElement.type === 'text' 
                        ? 'ĐỐI TƯỢNG VĂN BẢN' 
                        : activeElement.isCircleImage 
                          ? 'ĐỐI TƯỢNG ẢNH AVATAR' 
                          : 'ĐỐI TƯỢNG CHỮ KÝ ĐIỆN TỬ'}
                    </span>
                  </div>

                  {/* TOOLS FOR TEXT ELEMENT */}
                  {activeElement.type === 'text' && (
                    <>
                      {/* Text Input */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-slate-600">Nội dung:</span>
                        <input
                          type="text"
                          value={activeElement.content}
                          onChange={e => updateActiveElement({ content: e.target.value })}
                          className="text-xs font-bold bg-white border border-slate-200 focus:border-indigo-500 rounded-lg px-2.5 py-1 text-slate-800 outline-none w-48 sm:w-64"
                          placeholder="Nhập nội dung chữ..."
                        />
                      </div>

                      {/* Font Family Dropdown with preview font styling */}
                      <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3 shrink-0">
                        <span className="text-[11px] font-bold text-slate-600">Phông chữ:</span>
                        <select
                          value={activeElement.fontFamily}
                          onChange={e => updateActiveElement({ fontFamily: e.target.value })}
                          className="text-xs font-bold bg-white border border-slate-200 focus:border-indigo-500 rounded-lg px-2.5 py-1 text-slate-800 outline-none cursor-pointer max-w-[210px]"
                        >
                          <optgroup label="── Ký tên & Nghệ thuật (Cursive) ──" className="text-amber-600 bg-white font-bold">
                            {CERT_FONTS.filter(f => f.category === 'cursive').map(f => (
                              <option key={f.id} value={f.font} style={{ fontFamily: f.font }} className="text-slate-800 py-1">
                                {f.name}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="── Sang trọng & Cổ điển (Serif) ──" className="text-sky-600 bg-white font-bold">
                            {CERT_FONTS.filter(f => f.category === 'serif').map(f => (
                              <option key={f.id} value={f.font} style={{ fontFamily: f.font }} className="text-slate-800 py-1">
                                {f.name}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="── Hiện đại & Chuẩn mực (Sans) ──" className="text-emerald-600 bg-white font-bold">
                            {CERT_FONTS.filter(f => f.category === 'sans').map(f => (
                              <option key={f.id} value={f.font} style={{ fontFamily: f.font }} className="text-slate-800 py-1">
                                {f.name}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>

                      {/* Font Size Input & Slider */}
                      <div className="flex items-center gap-2 border-l border-slate-200 pl-3 shrink-0">
                        <span className="text-[11px] font-bold text-slate-600">Cỡ chữ:</span>
                        <input
                          type="range"
                          min="18"
                          max="220"
                          value={activeElement.fontSize || 32}
                          onChange={e => updateActiveElement({ fontSize: Number(e.target.value) })}
                          className="w-20 accent-indigo-500 cursor-pointer"
                        />
                        <input
                          type="number"
                          min="18"
                          max="220"
                          value={activeElement.fontSize || 32}
                          onChange={e => updateActiveElement({ fontSize: Number(e.target.value) })}
                          className="w-14 text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-center text-indigo-600 outline-none"
                        />
                      </div>

                      {/* Letter Spacing Slider & Input (Giãn khoảng cách chữ) */}
                      <div className="flex items-center gap-2 border-l border-slate-200 pl-3 shrink-0">
                        <span className="text-[11px] font-bold text-slate-600">Giãn chữ:</span>
                        <input
                          type="range"
                          min="-0.05"
                          max="0.4"
                          step="0.01"
                          value={parseFloat(activeElement.letterSpacing || '0') || 0}
                          onChange={e => {
                            const val = Number(e.target.value);
                            updateActiveElement({ letterSpacing: `${val.toFixed(2)}em` });
                          }}
                          className="w-20 accent-indigo-500 cursor-pointer"
                          title="Khoảng cách giữa các chữ cái (Tracking)"
                        />
                        <span className="text-xs font-mono font-bold text-indigo-600 w-14 text-center">
                          {activeElement.letterSpacing || '0em'}
                        </span>
                      </div>

                      {/* Color Picker */}
                      <div className="flex items-center gap-2 border-l border-slate-200 pl-3 shrink-0">
                        <span className="text-[11px] font-bold text-slate-600">Màu chữ:</span>
                        <input
                          type="color"
                          value={activeElement.color || '#1e3a8a'}
                          onChange={e => updateActiveElement({ color: e.target.value })}
                          className="w-7 h-7 rounded-lg cursor-pointer border border-slate-200 bg-transparent p-0"
                          title="Chọn màu chữ"
                        />
                      </div>
                    </>
                  )}

                  {/* TOOLS FOR IMAGE ELEMENT: AVATAR vs CHỮ KÝ */}
                  {activeElement.type === 'image' && (
                    <>
                      {activeElement.isCircleImage ? (
                        /* AVATAR CONTROLS */
                        <>
                          {/* Border Width Slider */}
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-bold text-slate-600">Độ dày viền:</span>
                            <input
                              type="range"
                              min="0"
                              max="24"
                              value={activeElement.borderWidth !== undefined ? activeElement.borderWidth : 10}
                              onChange={e => {
                                const bw = Number(e.target.value);
                                updateActiveElement({ 
                                  borderWidth: bw,
                                  border: `${bw}px solid ${activeElement.borderColor || '#ffffff'}`
                                });
                              }}
                              className="w-28 accent-indigo-500 cursor-pointer"
                            />
                            <span className="text-xs font-mono font-bold text-indigo-600 w-10">
                              {activeElement.borderWidth !== undefined ? activeElement.borderWidth : 10}px
                            </span>
                          </div>

                          {/* Border Color Picker */}
                          <div className="flex items-center gap-2 border-l border-slate-200 pl-3 shrink-0">
                            <span className="text-[11px] font-bold text-slate-600">Màu viền:</span>
                            <input
                              type="color"
                              value={activeElement.borderColor || '#ffffff'}
                              onChange={e => {
                                const bc = e.target.value;
                                const bw = activeElement.borderWidth !== undefined ? activeElement.borderWidth : 10;
                                updateActiveElement({ 
                                  borderColor: bc,
                                  border: `${bw}px solid ${bc}`
                                });
                              }}
                              className="w-7 h-7 rounded-lg cursor-pointer border border-slate-200 bg-transparent p-0"
                              title="Chọn màu viền"
                            />
                          </div>

                          {/* Avatar Size Slider */}
                          <div className="flex items-center gap-2 border-l border-slate-200 pl-3 shrink-0">
                            <span className="text-[11px] font-bold text-slate-600">Kích thước:</span>
                            <input
                              type="range"
                              min="200"
                              max="650"
                              value={activeElement.width || 460}
                              onChange={e => {
                                const val = Number(e.target.value);
                                updateActiveElement({ width: val, height: val });
                              }}
                              className="w-28 accent-indigo-500 cursor-pointer"
                            />
                            <span className="text-xs font-mono font-bold text-indigo-600 w-12">
                              {activeElement.width || 460}px
                            </span>
                          </div>
                        </>
                      ) : (
                        /* DIGITAL SIGNATURE & LOGO CONTROLS */
                        <>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-bold text-slate-600">
                              Kích thước {activeElement.id === 'school_logo' ? 'Logo' : (activeElement.id === 'signature' ? 'chữ ký' : 'ảnh')}:
                            </span>
                            <input
                              type="range"
                              min="60"
                              max="600"
                              value={activeElement.width || (activeElement.id === 'school_logo' ? 140 : 260)}
                              onChange={e => {
                                const val = Number(e.target.value);
                                // Can thiệp vào width, giữ nguyên tỷ lệ aspect ratio gốc hoặc để height auto
                                if (activeElement.width && activeElement.height) {
                                  const ratio = activeElement.height / activeElement.width;
                                  updateActiveElement({ width: val, height: Math.round(val * ratio) });
                                } else {
                                  updateActiveElement({ width: val, height: undefined });
                                }
                              }}
                              className="w-32 accent-indigo-500 cursor-pointer"
                            />
                            <span className="text-xs font-mono font-bold text-indigo-600 w-12 text-center">
                              {activeElement.width || (activeElement.id === 'school_logo' ? 140 : 260)}px
                            </span>
                          </div>

                          {/* Quick Scale Buttons */}
                          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const currentW = activeElement.width || (activeElement.id === 'school_logo' ? 140 : 260);
                                const nextW = Math.max(60, currentW - 20);
                                if (activeElement.width && activeElement.height) {
                                  const ratio = activeElement.height / activeElement.width;
                                  updateActiveElement({ width: nextW, height: Math.round(nextW * ratio) });
                                } else {
                                  updateActiveElement({ width: nextW, height: undefined });
                                }
                              }}
                              className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-600 text-xs font-bold text-slate-700 transition-colors"
                              title="Thu nhỏ 20px"
                            >
                              -20px
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const currentW = activeElement.width || (activeElement.id === 'school_logo' ? 140 : 260);
                                const nextW = Math.min(600, currentW + 20);
                                if (activeElement.width && activeElement.height) {
                                  const ratio = activeElement.height / activeElement.width;
                                  updateActiveElement({ width: nextW, height: Math.round(nextW * ratio) });
                                } else {
                                  updateActiveElement({ width: nextW, height: undefined });
                                }
                              }}
                              className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-600 text-xs font-bold text-slate-700 transition-colors"
                              title="Phóng to 20px"
                            >
                              +20px
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {/* Delete Element Button */}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveElementId(null)}
                      className="px-2.5 py-1 text-xs font-bold text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                      Bỏ chọn
                    </button>
                    <button
                      type="button"
                      onClick={deleteActiveElement}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-rose-600 hover:text-slate-800 rounded-lg hover:bg-rose-600 transition-colors border border-rose-500/40"
                      title="Xóa đối tượng này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* EMPTY STATE GUIDANCE */
                <div className="flex items-center justify-between w-full text-slate-500 text-xs">
                  <div className="flex items-center gap-2">
                    <MousePointer className="w-4 h-4 text-indigo-600 animate-bounce" />
                    <span className="font-medium text-slate-600">
                      Vui lòng click chọn một đoạn chữ hoặc hình ảnh trên thư khen để chỉnh sửa.
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[11px] text-slate-500">
                    <button
                      type="button"
                      onClick={() => appendLogoToCanvas()}
                      disabled={isExporting}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 disabled:opacity-50 disabled:pointer-events-none text-white text-[11px] font-bold transition-all shadow-xs cursor-pointer"
                      title="Chèn logo nhà trường đã tách nền vào bản vẽ"
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>{schoolLogoImage ? 'Chèn Logo ngay' : 'Tải & chèn Logo'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => appendSignatureToCanvas()}
                      disabled={isExporting}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 disabled:opacity-50 disabled:pointer-events-none text-white text-[11px] font-bold transition-all shadow-xs cursor-pointer"
                      title="Chèn chữ ký điện tử đã tách nền vào bản vẽ"
                    >
                      <FileSignature className="w-3.5 h-3.5" />
                      <span>{teacherSignatureImage ? 'Chèn chữ ký ngay' : 'Tải & chèn chữ ký'}</span>
                    </button>
                    <span>•</span>
                    <span>Di chuột: <strong className="text-indigo-600">Kéo vị trí</strong></span>
                    <span>•</span>
                    <span>Tỷ lệ Zoom: <strong className="text-emerald-600">{Math.round(previewScale * 100)}%</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              2. CANVAS WORKSPACE (Centering & Scaling 1920x1080)
          ========================================================================= */}
          <div 
            ref={previewContainerRef}
            className="flex-1 flex items-center justify-center p-4 sm:p-6 overflow-hidden relative cursor-default"
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onClick={() => setActiveElementId(null)}
          >
            {/* MASTER 1920x1080 CANVAS CONTAINER */}
            <div
              className="relative shadow-2xl rounded-2xl overflow-hidden ring-4 ring-slate-200 shrink-0"
              style={{
                width: `${canvasW * previewScale}px`,
                height: `${CANVAS_HEIGHT * previewScale}px`,
              }}
            >
              <div
                ref={certificatePrintRef}
                id="certificate-print-node-1920"
                className="select-none overflow-hidden relative bg-white"
                style={{
                  width: `${canvasW}px`,
                  height: `${CANVAS_HEIGHT}px`,
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                  backgroundImage: `url(${activeTemplate.url})`,
                  backgroundSize: '100% 100%',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }}
              >
                
                {/* RENDER DRAGGABLE & SELECTABLE ELEMENTS */}
                {elements.map(el => {
                  const isActive = activeElementId === el.id;

                  if (el.type === 'text') {
                    return (
                      <div
                        key={el.id}
                        onClick={(e) => {
                          if (!isEditMode) return;
                          e.stopPropagation();
                          setActiveElementId(el.id);
                        }}
                        onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                        className={`absolute select-none transition-shadow ${
                          isEditMode ? 'cursor-move' : 'cursor-default'
                        } ${
                          /* FOCUS RING: Viền nét đứt màu xanh dương bao quanh khi active */
                          isActive && isEditMode
                            ? 'ring-4 ring-blue-500 ring-offset-4 ring-offset-transparent border-2 border-dashed border-blue-400 bg-blue-500/10 rounded-xl shadow-xl' 
                            : isEditMode ? 'hover:ring-2 hover:ring-indigo-300/70 rounded-md bg-transparent' : 'bg-transparent'
                        }`}
                        style={{
                          left: `${el.x}px`,
                          top: `${el.y}px`,
                          width: el.width ? `${el.width}px` : 'auto',
                          fontSize: `${el.fontSize}px`,
                          fontFamily: el.fontFamily,
                          color: el.color,
                          fontWeight: el.fontWeight || 'normal',
                          fontStyle: el.fontStyle || 'normal',
                          textAlign: el.textAlign || 'center',
                          letterSpacing: el.letterSpacing || 'normal',
                          lineHeight: el.lineHeight || 1.3,
                          textTransform: el.textTransform || 'none',
                          whiteSpace: (el.whiteSpace as any) || 'nowrap',
                          textShadow: el.textShadow,
                          zIndex: isActive ? 40 : 20,
                          padding: '6px 10px',
                        }}
                      >
                        {el.content}
                      </div>
                    );
                  }

                  if (el.type === 'image') {
                    const bw = el.borderWidth !== undefined ? el.borderWidth : 10;
                    const bc = el.borderColor || '#ffffff';
                    const isAvatar = Boolean(el.isCircleImage);

                    return (
                      <div
                        key={el.id}
                        onClick={(e) => {
                          if (!isEditMode) return;
                          e.stopPropagation();
                          setActiveElementId(el.id);
                        }}
                        onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                        className={`absolute select-none transition-all ${
                          isEditMode ? 'cursor-move' : 'cursor-default'
                        } ${
                          /* FOCUS RING: Viền nét đứt màu xanh dương bao quanh khi active */
                          isActive && isEditMode
                            ? isAvatar
                              ? 'ring-8 ring-blue-500 ring-offset-8 ring-offset-transparent shadow-2xl scale-105'
                              : 'ring-4 ring-blue-500 ring-offset-2 ring-offset-transparent border-2 border-dashed border-blue-400 bg-blue-500/10 rounded-xl shadow-lg'
                            : isEditMode 
                              ? isAvatar ? 'hover:ring-4 hover:ring-indigo-300' : 'hover:ring-2 hover:ring-indigo-300/70 rounded-lg'
                              : ''
                        }`}
                        style={{
                          left: `${el.x}px`,
                          top: `${el.y}px`,
                          width: `${el.width || (isAvatar ? 460 : (el.id === 'school_logo' ? 140 : 260))}px`,
                          height: isAvatar 
                            ? `${el.height || 460}px` 
                            : (el.height ? `${el.height}px` : 'auto'),
                          borderRadius: isAvatar ? '50%' : '0px',
                          overflow: isAvatar ? 'hidden' : 'visible',
                          border: isAvatar ? `${bw}px solid ${bc}` : (bw > 0 ? `${bw}px solid ${bc}` : 'none'),
                          boxShadow: isAvatar ? (el.boxShadow || '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 4px #fbbf24') : 'none',
                          backgroundColor: isAvatar ? '#e2e8f0' : 'transparent',
                          zIndex: isActive ? 40 : (el.id === 'school_logo' || el.id === 'signature' ? 30 : 20),
                        }}
                      >
                        {el.content ? (
                          <img
                            src={el.content}
                            alt={isAvatar ? "Student Avatar" : (el.id === 'school_logo' ? "Logo nhà trường" : "Chữ ký giáo viên")}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: isAvatar ? 'cover' : 'contain',
                            }}
                            className="pointer-events-none block"
                            draggable={false}
                          />
                        ) : isAvatar ? (
                          <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 font-black text-7xl">
                            {previewStudent?.name?.charAt(0) || 'A'}
                          </div>
                        ) : null}
                      </div>
                    );
                  }

                  return null;
                })}

              </div>
            </div>

            {/* HỘP THOẠI XUẤT HÀNG LOẠT */}
            {showBatchDialog && (
              <div
                className="fixed inset-0 z-[60] flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4"
                role="dialog"
                aria-modal="true"
                aria-label="Tạo thư khen hàng loạt"
                onClick={(e) => { e.stopPropagation(); setShowBatchDialog(false); }}
              >
                <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <div className="px-5 py-3.5 bg-gradient-to-r from-emerald-700 to-teal-700 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      <h3 className="text-sm font-black uppercase tracking-tight">Tạo thư khen hàng loạt</h3>
                    </div>
                    <button type="button" onClick={() => setShowBatchDialog(false)} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center" aria-label="Đóng">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-5 space-y-4">
                    <p className="text-sm text-slate-700">
                      Mọi thư khen dùng <strong>cùng mẫu nền, cùng vị trí ảnh và chữ, cùng nội dung khen</strong> như bản đang thiết kế; chỉ thay ảnh và tên từng em (tên dài tự thu nhỏ cho vừa).
                    </p>

                    <div className="space-y-2">
                      <div className="text-xs font-black uppercase tracking-wide text-slate-700">Khen cho</div>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { id: 'selected', label: 'Các em đã chọn', count: selectedStudents.length },
                          { id: 'all', label: `Cả lớp ${activeClass?.name || ''}`, count: currentClassStudents.length },
                        ] as const).map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={opt.count === 0}
                            onClick={() => setBatchScope(opt.id)}
                            className={`p-3 rounded-2xl border-2 text-left transition-colors disabled:opacity-50 ${batchScope === opt.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}
                          >
                            <span className="block text-sm font-black text-slate-900">{opt.label}</span>
                            <span className="block text-xs font-bold text-slate-600">{opt.count} học sinh</span>
                          </button>
                        ))}
                      </div>
                      {batchScope === 'selected' && (
                        <button type="button" onClick={() => { setShowBatchDialog(false); setIsSidebarSection('students'); }} className="text-xs font-bold text-indigo-700 hover:underline">
                          Chọn lại danh sách học sinh ở thẻ “Học sinh” →
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-black uppercase tracking-wide text-slate-700">Định dạng tệp</div>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { id: 'zip', label: 'Tệp ZIP ảnh', desc: 'Mỗi em 1 ảnh JPG, gửi Zalo/in lẻ' },
                          { id: 'pdf', label: 'Tệp PDF để in', desc: 'Mỗi trang 1 thư khen, in cả loạt' },
                        ] as const).map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setBatchFormat(opt.id)}
                            className={`p-3 rounded-2xl border-2 text-left transition-colors ${batchFormat === opt.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}
                          >
                            <span className="block text-sm font-black text-slate-900">{opt.label}</span>
                            <span className="block text-xs font-medium text-slate-600">{opt.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => setShowBatchDialog(false)} className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black uppercase">
                        Để sau
                      </button>
                      <button
                        type="button"
                        onClick={runBatchExport}
                        disabled={(batchScope === 'all' ? currentClassStudents.length : selectedStudents.length) === 0}
                        className="flex-[2] py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <Download className="w-4 h-4" />
                        <span>Tạo {batchScope === 'all' ? currentClassStudents.length : selectedStudents.length} thư khen</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Export Overlay Progress (Visible during batch export) */}
            {isExporting && (
              <div className="absolute inset-0 bg-white/85 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-slate-800 animate-in fade-in">
                <div className="w-20 h-20 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin flex items-center justify-center mb-6">
                  <Award className="w-8 h-8 text-emerald-600" />
                </div>
                <h2 className="text-xl font-black uppercase tracking-wider mb-2">
                  ĐANG KẾT XUẤT THƯ KHEN FULL HD (1920 × 1080)
                </h2>
                <p className="text-sm text-slate-600 font-medium mb-4">
                  {exportMessage}
                </p>
                
                {/* Progress Bar */}
                <div className="w-80 h-3 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-green-400 transition-all duration-300"
                    style={{ width: `${exportProgress}%` }}
                  ></div>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-600 mt-2">
                  {exportProgress}% hoàn thành
                </span>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
