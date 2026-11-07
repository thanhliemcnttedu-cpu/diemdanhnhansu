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
import { toPng } from 'html-to-image';
import confetti from 'canvas-confetti';
import { useClassroom } from '../../context/ClassroomContext';
import { APP_AUTHOR_INFO } from '../../data/initialData';
import { removeWhiteBackground } from '../../utils/imageProcessor';

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
}

// Fallback certificate templates strictly in /certificates/
const DEFAULT_CERTIFICATE_TEMPLATES: CertificateTemplate[] = [
  { id: 'cert-1.png', name: 'Mẫu Khen Thưởng 1', url: '/certificates/1.png', filename: '1.png' },
  { id: 'cert-2.png', name: 'Mẫu Khen Thưởng 2', url: '/certificates/2.png', filename: '2.png' },
  { id: 'cert-3.png', name: 'Mẫu Khen Thưởng 3', url: '/certificates/3.png', filename: '3.png' },
  { id: 'cert-4.png', name: 'Mẫu Khen Thưởng 4', url: '/certificates/4.png', filename: '4.png' },
  { id: 'cert-5.png', name: 'Mẫu Khen Thưởng 5', url: '/certificates/5.png', filename: '5.png' },
  { id: 'cert-7.png', name: 'Mẫu Khen Thưởng 7', url: '/certificates/7.png', filename: '7.png' },
  { id: 'cert-8.png', name: 'Mẫu Khen Thưởng 8', url: '/certificates/8.png', filename: '8.png' },
  { id: 'cert-9.png', name: 'Mẫu Khen Thưởng 9', url: '/certificates/9.png', filename: '9.png' },
  { id: 'cert-10.png', name: 'Mẫu Khen Thưởng 10', url: '/certificates/10.png', filename: '10.png' },
  { id: 'cert-11.png', name: 'Mẫu Khen Thưởng 11', url: '/certificates/11.png', filename: '11.png' },
  { id: 'cert-12.png', name: 'Mẫu Khen Thưởng 12', url: '/certificates/12.png', filename: '12.png' },
  { id: 'cert-13.png', name: 'Mẫu Khen Thưởng 13', url: '/certificates/13.png', filename: '13.png' },
  { id: 'cert-14.png', name: 'Mẫu Khen Thưởng 14', url: '/certificates/14.png', filename: '14.png' },
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

  // Compute live responsive scale factor based on container dimensions
  useEffect(() => {
    const updateScale = () => {
      if (previewContainerRef.current) {
        const containerW = previewContainerRef.current.clientWidth - 48;
        const containerH = previewContainerRef.current.clientHeight - 80;
        const scaleX = containerW / CANVAS_WIDTH;
        const scaleY = containerH / CANVAS_HEIGHT;
        const calculatedScale = Math.min(scaleX, scaleY);
        setPreviewScale(Math.max(0.18, Math.min(calculatedScale, 0.95)));
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

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
  // SMART RANDOMIZED AUTO-LAYOUT (ART DIRECTOR QUALITY 1920x1080)
  // Generates 1 of 3 distinct layout variations with randomized aesthetic fonts and colors:
  // - Layout 1 (Cổ điển): Avatar lớn ở giữa trên cùng, chữ căn giữa toàn bộ.
  // - Layout 2 (Hiện đại): Avatar lớn lệch trái, toàn bộ text căn lề trái nằm ở nửa bên phải.
  // - Layout 3 (Sáng tạo): Avatar lớn góc phải, Tên học sinh khổng lồ và nội dung bên trái.
  // =========================================================================
  // =========================================================================
  // SMART RANDOMIZED AUTO-LAYOUT V2 (ART DIRECTOR QUALITY 1920x1080)
  // Generates 1 of 3 distinct layout variations with randomized aesthetic fonts and colors:
  // - White space breathing room on Y-axis (No overlaps, generous vertical spacing)
  // - whiteSpace: 'nowrap' on ALL text elements (Guaranteed zero unexpected line-breaks)
  // - Paired harmonic palettes: Title color paired with Student Name & Accents
  // - Curated typography hierarchy: Serif/Playfair for Title, Cursive/Script for Student Name, Sans for body
  // =========================================================================
  const generateRandomizedLayout = useCallback((
    student = previewStudent,
    forceVariant?: 1 | 2 | 3
  ): { layout: CertificateElement[]; variant: 1 | 2 | 3 } => {
    const studentName = student?.name || 'Nguyễn Văn An';
    const studentAvatar = student?.originalAvatar || student?.avatar || '';
    const className = activeClass?.name ? `Lớp ${activeClass.name}` : 'Lớp 4A1';

    // Pick random variant 1, 2, or 3
    const variant: 1 | 2 | 3 = forceVariant || (Math.floor(Math.random() * 3) + 1 as 1 | 2 | 3);

    // Pick random curated script font for student name
    const scriptFonts = [
      '"Dancing Script", cursive',
      '"Great Vibes", cursive',
      '"Pattaya", cursive',
      '"Charm", cursive',
      '"Pacifico", cursive'
    ];
    const randomScriptFont = scriptFonts[Math.floor(Math.random() * scriptFonts.length)];

    // Pick paired artistic harmonic palette
    const palette = ARTISTIC_PALETTES[Math.floor(Math.random() * ARTISTIC_PALETTES.length)];

    let elementsResult: CertificateElement[] = [];

    if (variant === 1) {
      // -------------------------------------------------------------
      // LAYOUT 1: CỔ ĐIỂN ĐỐI XỨNG (CENTERPIECE HERO AVATAR 460px - WHITE SPACE CHUẨN MỰC)
      // Y: 75 -> Tên trường (Tracking rộng)
      // Y: 130 -> Tiêu đề THƯ KHEN (Playfair Display, Size 98)
      // Y: 235 -> Tiêu đề phụ (Tuần/Tháng)
      // Y: 285 -> Trung tâm Avatar 460x460 (Đáy Y: 745)
      // Y: 765 -> Lời dẫn "Trân trọng khen ngợi em:" (Lora italic)
      // Y: 810 -> Tên học sinh KHỔNG LỒ 145px (Cursive nghệ thuật, không rớt dòng)
      // Y: 955 -> Lớp học
      // Y: 995 -> Lý do khen thưởng
      // Chân trang: Y: 990 (Ngày tháng) & Y: 960-1000 (Giáo viên chủ nhiệm)
      // -------------------------------------------------------------
      const avatarSize = 460;
      const avatarX = Math.round((CANVAS_WIDTH - avatarSize) / 2); // 730

      elementsResult = [
        {
          id: 'school_header',
          type: 'text',
          content: schoolName.toUpperCase(),
          x: 260,
          y: 75,
          width: 1400,
          fontSize: 30,
          fontFamily: '"Montserrat", sans-serif',
          color: '#334155',
          fontWeight: 800,
          textAlign: 'center',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
        {
          id: 'title_master',
          type: 'text',
          content: 'THƯ KHEN',
          x: 360,
          y: 130,
          width: 1200,
          fontSize: 98,
          fontFamily: '"Playfair Display", serif',
          color: palette.titleColor,
          fontWeight: 900,
          textAlign: 'center',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
        {
          id: 'title_sub',
          type: 'text',
          content: certificateTitle,
          x: 360,
          y: 235,
          width: 1200,
          fontSize: 28,
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          color: palette.subColor,
          fontWeight: 800,
          textAlign: 'center',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
        // HERO AVATAR 460x460 WITH LUXURY BORDER & PAIRED GLOW
        {
          id: 'student_avatar',
          type: 'image',
          content: studentAvatar,
          x: avatarX,
          y: 285,
          width: avatarSize,
          height: avatarSize,
          isCircleImage: true,
          borderWidth: 10,
          borderColor: '#ffffff',
          boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.45), 0 0 0 5px ${palette.accentBorder}`,
        },
        {
          id: 'lead_text',
          type: 'text',
          content: 'Trân trọng khen ngợi em:',
          x: 460,
          y: 765,
          width: 1000,
          fontSize: 34,
          fontFamily: '"Lora", serif',
          fontStyle: 'italic',
          color: palette.leadColor,
          fontWeight: 600,
          textAlign: 'center',
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
        },
        // GIANT ARTISTIC STUDENT NAME (145px - Cursived & Non-breaking)
        {
          id: 'student_name',
          type: 'text',
          content: studentName,
          x: 160,
          y: 810,
          width: 1600,
          fontSize: 145,
          fontFamily: randomScriptFont,
          color: palette.nameColor,
          fontWeight: 700,
          letterSpacing: '0.02em',
          textAlign: 'center',
          whiteSpace: 'nowrap',
        },
        {
          id: 'student_class',
          type: 'text',
          content: `Học sinh ${className}`,
          x: 660,
          y: 955,
          width: 600,
          fontSize: 26,
          fontFamily: '"Montserrat", sans-serif',
          color: '#0f172a',
          fontWeight: 800,
          letterSpacing: '0.1em',
          textAlign: 'center',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
        {
          id: 'reason_body',
          type: 'text',
          content: `“${reason}”`,
          x: 260,
          y: 995,
          width: 1400,
          fontSize: 32,
          fontFamily: '"Be Vietnam Pro", sans-serif',
          fontStyle: 'italic',
          color: '#1e293b',
          fontWeight: 500,
          textAlign: 'center',
          lineHeight: 1.4,
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        },
        {
          id: 'date_text',
          type: 'text',
          content: formattedDate,
          x: 120,
          y: 990,
          width: 480,
          fontSize: 24,
          fontFamily: '"Be Vietnam Pro", sans-serif',
          color: '#475569',
          fontWeight: 600,
          textAlign: 'center',
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        },
        {
          id: 'teacher_title',
          type: 'text',
          content: 'GIÁO VIÊN CHỦ NHIỆM',
          x: 1340,
          y: 960,
          width: 480,
          fontSize: 25,
          fontFamily: '"Montserrat", sans-serif',
          color: '#334155',
          fontWeight: 800,
          textAlign: 'center',
          letterSpacing: '0.09em',
          whiteSpace: 'nowrap',
        },
        {
          id: 'teacher_signature',
          type: 'text',
          content: teacherName,
          x: 1340,
          y: 1000,
          width: 480,
          fontSize: 50,
          fontFamily: '"Dancing Script", cursive',
          color: palette.nameColor,
          fontWeight: 700,
          textAlign: 'center',
          letterSpacing: '0.03em',
          whiteSpace: 'nowrap',
        },
      ];

      // Tự động chèn chữ ký điện tử đã tách nền nếu bật
      if (teacherSignatureImage && autoInsertSignature) {
        elementsResult.push({
          id: 'signature',
          type: 'image',
          content: teacherSignatureImage,
          x: 1340,
          y: 915,
          width: 260,
          height: 120,
          isCircleImage: false,
          borderWidth: 0,
          boxShadow: 'none',
        });
      }
    } else if (variant === 2) {
      // -------------------------------------------------------------
      // LAYOUT 2: HIỆN ĐẠI (SPLIT: HERO AVATAR LỆCH TRÁI 480px, TEXT STACK PHẢI)
      // -------------------------------------------------------------
      const avatarSize = 480;

      elementsResult = [
        {
          id: 'school_header',
          type: 'text',
          content: schoolName.toUpperCase(),
          x: 150,
          y: 75,
          width: 1640,
          fontSize: 30,
          fontFamily: '"Montserrat", sans-serif',
          color: '#334155',
          fontWeight: 800,
          textAlign: 'left',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
        // HERO AVATAR ON LEFT
        {
          id: 'student_avatar',
          type: 'image',
          content: studentAvatar,
          x: 160,
          y: 200,
          width: avatarSize,
          height: avatarSize,
          isCircleImage: true,
          borderWidth: 12,
          borderColor: '#ffffff',
          boxShadow: `0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 0 5px ${palette.accentBorder}`,
        },
        // TEXT STACK ON RIGHT (X: 740, ALIGNED LEFT)
        {
          id: 'title_master',
          type: 'text',
          content: 'THƯ KHEN',
          x: 740,
          y: 160,
          width: 1060,
          fontSize: 98,
          fontFamily: '"Playfair Display", serif',
          color: palette.titleColor,
          fontWeight: 900,
          textAlign: 'left',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
        {
          id: 'title_sub',
          type: 'text',
          content: certificateTitle,
          x: 740,
          y: 265,
          width: 1060,
          fontSize: 30,
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          color: palette.subColor,
          fontWeight: 800,
          textAlign: 'left',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
        {
          id: 'lead_text',
          type: 'text',
          content: 'Trân trọng khen ngợi em:',
          x: 740,
          y: 335,
          width: 1060,
          fontSize: 32,
          fontFamily: '"Lora", serif',
          fontStyle: 'italic',
          color: palette.leadColor,
          fontWeight: 600,
          textAlign: 'left',
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
        },
        // GIANT ARTISTIC STUDENT NAME
        {
          id: 'student_name',
          type: 'text',
          content: studentName,
          x: 740,
          y: 385,
          width: 1100,
          fontSize: 145,
          fontFamily: randomScriptFont,
          color: palette.nameColor,
          fontWeight: 700,
          letterSpacing: '0.02em',
          textAlign: 'left',
          whiteSpace: 'nowrap',
        },
        {
          id: 'student_class',
          type: 'text',
          content: `Học sinh ${className}`,
          x: 740,
          y: 535,
          width: 1060,
          fontSize: 28,
          fontFamily: '"Montserrat", sans-serif',
          color: '#0f172a',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textAlign: 'left',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
        {
          id: 'reason_body',
          type: 'text',
          content: `“${reason}”`,
          x: 740,
          y: 590,
          width: 1060,
          fontSize: 34,
          fontFamily: '"Be Vietnam Pro", sans-serif',
          fontStyle: 'italic',
          color: '#1e293b',
          fontWeight: 500,
          textAlign: 'left',
          lineHeight: 1.4,
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        },
        // BOTTOM FOOTER
        {
          id: 'date_text',
          type: 'text',
          content: formattedDate,
          x: 160,
          y: 760,
          width: 480,
          fontSize: 24,
          fontFamily: '"Be Vietnam Pro", sans-serif',
          color: '#475569',
          fontWeight: 600,
          textAlign: 'center',
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        },
        {
          id: 'teacher_title',
          type: 'text',
          content: 'GIÁO VIÊN CHỦ NHIỆM',
          x: 1300,
          y: 770,
          width: 480,
          fontSize: 25,
          fontFamily: '"Montserrat", sans-serif',
          color: '#334155',
          fontWeight: 800,
          textAlign: 'center',
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap',
        },
        {
          id: 'teacher_signature',
          type: 'text',
          content: teacherName,
          x: 1300,
          y: 815,
          width: 480,
          fontSize: 50,
          fontFamily: '"Dancing Script", cursive',
          color: palette.nameColor,
          fontWeight: 700,
          textAlign: 'center',
          letterSpacing: '0.03em',
          whiteSpace: 'nowrap',
        },
      ];

      // Tự động chèn chữ ký điện tử đã tách nền nếu bật
      if (teacherSignatureImage && autoInsertSignature) {
        elementsResult.push({
          id: 'signature',
          type: 'image',
          content: teacherSignatureImage,
          x: 1300,
          y: 730,
          width: 260,
          height: 120,
          isCircleImage: false,
          borderWidth: 0,
          boxShadow: 'none',
        });
      }
    } else {
      // -------------------------------------------------------------
      // LAYOUT 3: SÁNG TẠO (HERO AVATAR BÊN PHẢI 480px, TYPOGRAPHY BÊN TRÁI)
      // -------------------------------------------------------------
      const avatarSize = 480;

      elementsResult = [
        {
          id: 'school_header',
          type: 'text',
          content: schoolName.toUpperCase(),
          x: 160,
          y: 75,
          width: 1600,
          fontSize: 30,
          fontFamily: '"Montserrat", sans-serif',
          color: '#334155',
          fontWeight: 800,
          textAlign: 'left',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
        // TEXT STACK ON LEFT (X: 160)
        {
          id: 'title_master',
          type: 'text',
          content: 'THƯ KHEN',
          x: 160,
          y: 160,
          width: 1040,
          fontSize: 98,
          fontFamily: '"Playfair Display", serif',
          color: palette.titleColor,
          fontWeight: 900,
          textAlign: 'left',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
        {
          id: 'title_sub',
          type: 'text',
          content: certificateTitle,
          x: 160,
          y: 265,
          width: 1040,
          fontSize: 30,
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          color: palette.subColor,
          fontWeight: 800,
          textAlign: 'left',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
        // HERO AVATAR ON RIGHT (X: 1260)
        {
          id: 'student_avatar',
          type: 'image',
          content: studentAvatar,
          x: 1260,
          y: 200,
          width: avatarSize,
          height: avatarSize,
          isCircleImage: true,
          borderWidth: 12,
          borderColor: '#ffffff',
          boxShadow: `0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 0 5px ${palette.accentBorder}`,
        },
        {
          id: 'lead_text',
          type: 'text',
          content: 'Trân trọng khen ngợi em:',
          x: 160,
          y: 335,
          width: 1040,
          fontSize: 32,
          fontFamily: '"Lora", serif',
          fontStyle: 'italic',
          color: palette.leadColor,
          fontWeight: 600,
          textAlign: 'left',
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
        },
        // GIANT ARTISTIC STUDENT NAME
        {
          id: 'student_name',
          type: 'text',
          content: studentName,
          x: 160,
          y: 385,
          width: 1080,
          fontSize: 145,
          fontFamily: randomScriptFont,
          color: palette.nameColor,
          fontWeight: 700,
          letterSpacing: '0.02em',
          textAlign: 'left',
          whiteSpace: 'nowrap',
        },
        {
          id: 'student_class',
          type: 'text',
          content: `Học sinh ${className}`,
          x: 160,
          y: 535,
          width: 1040,
          fontSize: 28,
          fontFamily: '"Montserrat", sans-serif',
          color: '#0f172a',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textAlign: 'left',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
        {
          id: 'reason_body',
          type: 'text',
          content: `“${reason}”`,
          x: 160,
          y: 590,
          width: 1040,
          fontSize: 34,
          fontFamily: '"Be Vietnam Pro", sans-serif',
          fontStyle: 'italic',
          color: '#1e293b',
          fontWeight: 500,
          textAlign: 'left',
          lineHeight: 1.4,
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        },
        // BOTTOM FOOTER
        {
          id: 'date_text',
          type: 'text',
          content: formattedDate,
          x: 160,
          y: 760,
          width: 480,
          fontSize: 24,
          fontFamily: '"Be Vietnam Pro", sans-serif',
          color: '#475569',
          fontWeight: 600,
          textAlign: 'left',
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        },
        {
          id: 'teacher_title',
          type: 'text',
          content: 'GIÁO VIÊN CHỦ NHIỆM',
          x: 1260,
          y: 770,
          width: 480,
          fontSize: 25,
          fontFamily: '"Montserrat", sans-serif',
          color: '#334155',
          fontWeight: 800,
          textAlign: 'center',
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap',
        },
        {
          id: 'teacher_signature',
          type: 'text',
          content: teacherName,
          x: 1260,
          y: 815,
          width: 480,
          fontSize: 50,
          fontFamily: '"Dancing Script", cursive',
          color: palette.nameColor,
          fontWeight: 700,
          textAlign: 'center',
          letterSpacing: '0.03em',
          whiteSpace: 'nowrap',
        },
      ];

      // Tự động chèn chữ ký điện tử đã tách nền nếu bật
      if (teacherSignatureImage && autoInsertSignature) {
        elementsResult.push({
          id: 'signature',
          type: 'image',
          content: teacherSignatureImage,
          x: 1260,
          y: 730,
          width: 260,
          height: 120,
          isCircleImage: false,
          borderWidth: 0,
          boxShadow: 'none',
        });
      }
    }

    return { layout: elementsResult, variant };
  }, [previewStudent, schoolName, certificateTitle, activeClass, reason, formattedDate, teacherName, teacherSignatureImage, autoInsertSignature]);

  // Initial layout initialization on mount
  useEffect(() => {
    const { layout, variant } = generateRandomizedLayout(previewStudent, 1);
    setElements(layout);
    setCurrentLayoutVariant(variant);
  }, [generateRandomizedLayout]);

  // Update dynamic content in elements while preserving user-adjusted coordinates
  const updateStudentInElements = useCallback((student: any, existingElements: CertificateElement[]): CertificateElement[] => {
    const studentName = student?.name || 'Nguyễn Văn An';
    const studentAvatar = student?.originalAvatar || student?.avatar || '';
    const className = activeClass?.name ? `Lớp ${activeClass.name}` : 'Lớp 4A1';

    return existingElements.map(el => {
      if (el.id === 'student_name') return { ...el, content: studentName };
      if (el.id === 'student_avatar') return { ...el, content: studentAvatar };
      if (el.id === 'student_class') return { ...el, content: `Học sinh ${className}` };
      if (el.id === 'reason_body') return { ...el, content: `“${reason}”` };
      if (el.id === 'school_header') return { ...el, content: schoolName.toUpperCase() };
      if (el.id === 'title_sub') return { ...el, content: certificateTitle };
      if (el.id === 'date_text') return { ...el, content: formattedDate };
      if (el.id === 'teacher_signature') return { ...el, content: teacherName };
      return el;
    });
  }, [activeClass, reason, schoolName, certificateTitle, formattedDate, teacherName]);

  // Keep elements content in sync when form fields change
  useEffect(() => {
    setElements(prev => updateStudentInElements(previewStudent, prev));
  }, [previewStudent, updateStudentInElements]);

  // ==========================================
  // ACTION BUTTON 1: TẠO THƯ KHEN (Randomizes Layout 1, 2 or 3)
  // ==========================================
  const handleAutoLayout = () => {
    let nextVariant: 1 | 2 | 3 = (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3;
    if (nextVariant === currentLayoutVariant) {
      nextVariant = (currentLayoutVariant % 3 + 1) as 1 | 2 | 3;
    }
    const { layout, variant } = generateRandomizedLayout(previewStudent, nextVariant);
    setElements(layout);
    setCurrentLayoutVariant(variant);
    setActiveElementId(null);
    confetti({ particleCount: 75, spread: 65, origin: { y: 0.6 } });
  };

  // ==========================================
  // ACTION BUTTON 2: TẠO LẠI (Clears & Resets with random variations)
  // ==========================================
  const handleResetLayout = () => {
    setElements([]); // Clear
    setTimeout(() => {
      const { layout, variant } = generateRandomizedLayout(previewStudent);
      setElements(layout);
      setCurrentLayoutVariant(variant);
      setActiveElementId(null);
    }, 20);
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
  const handleDownloadSingle = async () => {
    if (!certificatePrintRef.current) return;
    setIsExporting(true);
    setExportProgress(50);
    setExportMessage(`Đang xuất ảnh thư khen ${previewStudent?.name || ''}...`);

    try {
      // CLEAR ACTIVE ELEMENT FOCUS BEFORE EXPORTING
      setActiveElementId(null);
      await waitForNextFrame(180);

      const dataUrl = await toPng(certificatePrintRef.current, {
        quality: 1,
        pixelRatio: 1,
        canvasWidth: CANVAS_WIDTH,
        canvasHeight: CANVAS_HEIGHT,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left',
        },
        cacheBust: true,
      });

      const studentNameClean = previewStudent?.name || 'HocSinh';
      const link = document.createElement('a');
      link.download = `ThuKhen_${studentNameClean.replace(/\s+/g, '_')}_1920x1080.png`;
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
  // 2. MASTER TEMPLATE BULK EXPORT (CONSISTENT BATCH RENDERING)
  // Tuyệt đối không sinh lại layout ngẫu nhiên trong vòng lặp.
  // Sử dụng Deep Copy của elements hiện tại làm Master Template bất biến,
  // chỉ hoán đổi nội dung (Name, Avatar, Reason, Class) của từng học sinh,
  // bảo toàn 100% tọa độ, font chữ, màu sắc, chữ ký mà giáo viên đã căn chỉnh.
  // =========================================================================
  const handleExportBatch = async () => {
    if (!certificatePrintRef.current || selectedStudents.length === 0) return;

    setIsExporting(true);
    setExportProgress(0);
    setActiveElementId(null);
    setIsEditMode(false); // Khóa chế độ chỉnh sửa để ngăn click/drag làm lệch tọa độ

    // BƯỚC 1: Lấy mảng elements hiện tại làm Master Template (Deep Copy bất biến)
    const masterTemplate: CertificateElement[] = JSON.parse(JSON.stringify(elements));
    const initialPreviewStudentId = previewStudentId;
    const totalCount = selectedStudents.length;

    try {
      let exportedCount = 0;

      // BƯỚC 2: Bắt đầu vòng lặp qua danh sách học sinh được chọn
      for (let i = 0; i < totalCount; i++) {
        const studentId = selectedStudents[i];
        const student = currentClassStudents.find(s => s.id === studentId);
        const studentNameClean = student?.name || `Học sinh ${i + 1}`;
        const studentAvatar = student?.originalAvatar || student?.avatar || '';
        const className = activeClass?.name ? `Lớp ${activeClass.name}` : 'Lớp 4A1';

        setExportMessage(`Đang xuất thư khen (${i + 1}/${totalCount}): ${studentNameClean}`);
        setPreviewStudentId(studentId);

        // BƯỚC 3 (Cloning & Mapping): Biến đổi content từ masterTemplate
        const currentStudentElements: CertificateElement[] = masterTemplate.map(el => {
          // Tên học sinh: Giữ nguyên x, y, font, color, letterSpacing... CHỈ đổi content
          if (el.id === 'student_name' || el.id === 'studentName') {
            return { ...el, content: studentNameClean };
          }
          // Avatar học sinh: Giữ nguyên x, y, size, border, shadow... CHỈ đổi content
          if (el.id === 'student_avatar' || el.id === 'avatar') {
            return { ...el, content: studentAvatar };
          }
          // Lý do khen thưởng: CHỈ đổi content
          if (el.id === 'reason_body' || el.id === 'reason') {
            return { ...el, content: `“${reason}”` };
          }
          // Lớp học sinh: Cập nhật tên lớp hiện tại
          if (el.id === 'student_class' || el.id === 'studentClass') {
            return { ...el, content: `Học sinh ${className}` };
          }
          // Các element khác (Tiêu đề, Chữ ký, Ngày tháng, Lời dẫn, Tên trường, GVCN...) Giữ nguyên 100%
          return { ...el };
        });

        // BƯỚC 4: setElements(currentStudentElements) để Canvas cập nhật
        setElements(currentStudentElements);

        // BƯỚC 5: Chờ DOM render & nạp ảnh hoàn tất bức thư khen mới (600ms theo đúng đặc tả)
        await new Promise(r => setTimeout(r, 600));

        // BƯỚC 6: Chụp ảnh bằng html-to-image (1920x1080 Full HD) và tải xuống
        if (certificatePrintRef.current) {
          const dataUrl = await toPng(certificatePrintRef.current, {
            quality: 1,
            pixelRatio: 1,
            canvasWidth: CANVAS_WIDTH,
            canvasHeight: CANVAS_HEIGHT,
            style: {
              transform: 'scale(1)',
              transformOrigin: 'top left',
            },
            cacheBust: true,
          });

          const link = document.createElement('a');
          const safeName = studentNameClean.replace(/\s+/g, '_');
          link.download = `ThuKhen_${safeName}_${activeClass?.name || 'Lop'}.png`;
          link.href = dataUrl;
          link.click();
        }

        exportedCount++;
        setExportProgress(Math.round((exportedCount / totalCount) * 100));
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      setExportMessage('Hoàn tất xuất tất cả thư khen!');
      confetti({ particleCount: 150, spread: 85, origin: { y: 0.6 } });
    } catch (error) {
      console.error('Lỗi khi xuất thư khen hàng loạt:', error);
      alert('Có lỗi xảy ra trong quá trình xuất thư khen hàng loạt.');
    } finally {
      // BƯỚC 7: Restore lại layout Master Template ban đầu và học sinh preview để giao diện không bị kẹt
      setElements(masterTemplate);
      if (initialPreviewStudentId) {
        setPreviewStudentId(initialPreviewStudentId);
      }
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
        return { ...el, ...updates };
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
                TRÌNH THIẾT KẾ THƯ KHEN PRO • 1920 × 1080
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-700 uppercase tracking-wider">
                LAYOUT {currentLayoutVariant === 1 ? 'CỔ ĐIỂN' : currentLayoutVariant === 2 ? 'HIỆN ĐẠI' : 'SÁNG TẠO'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Bảng công cụ cố định • Focus Ring trực quan • Click & Drag độc lập • Xuất chuẩn 1920x1080 không lệch góc
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
            title="Ngẫu nhiên đổi 1 trong 3 layout mỹ thuật (Cổ điển, Hiện đại, Sáng tạo)"
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
            title="Khôi phục vị trí mặc định ban đầu"
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
            disabled={isExporting || selectedStudents.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white bg-gradient-to-r from-emerald-600 via-teal-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-md shadow-emerald-600/20 transition-all hover-zoom-btn disabled:opacity-50 disabled:cursor-not-allowed uppercase"
            title="Xuất ảnh cho toàn bộ học sinh được chọn, giữ nguyên vị trí đã chỉnh sửa"
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Đang xuất ({exportProgress}%)</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>TẢI HÀNG LOẠT ({selectedStudents.length})</span>
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
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200/80 text-[11px] text-slate-600 space-y-2">
                <strong className="text-indigo-950 font-black block uppercase text-[10px] tracking-wider">
                  🎨 Chọn nhanh 3 Bố Cục Nghệ Thuật:
                </strong>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 1, label: 'Cổ điển' },
                    { id: 2, label: 'Hiện đại' },
                    { id: 3, label: 'Sáng tạo' },
                  ].map(b => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        const { layout, variant } = generateRandomizedLayout(previewStudent, b.id as 1 | 2 | 3);
                        setElements(layout);
                        setCurrentLayoutVariant(variant);
                        setActiveElementId(null);
                      }}
                      className={`py-1.5 px-1 rounded-xl text-[10px] font-black border transition-all ${
                        currentLayoutVariant === b.id
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
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
        <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
          
          {/* =========================================================================
              1. PERSISTENT PROPERTIES PANEL (Fixed Toolbar at the top of Right Column)
              - Always rendered when isEditMode === true
              - Empty state: Informative guidance message
              - Active state: Immediate two-way binding controls for Text or Image
          ========================================================================= */}
          {isEditMode && (
            <div className="bg-slate-800 border-b border-slate-700/80 px-5 py-2.5 flex items-center justify-between text-white shadow-md z-20 shrink-0 min-h-[52px]">
              {activeElement ? (
                <div className="flex items-center gap-3.5 flex-wrap w-full">
                  <div className="flex items-center gap-1.5 text-xs font-black text-indigo-400 uppercase border-r border-slate-600 pr-3 shrink-0">
                    <Sliders className="w-4 h-4 text-indigo-400" />
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
                        <span className="text-[11px] font-bold text-slate-300">Nội dung:</span>
                        <input
                          type="text"
                          value={activeElement.content}
                          onChange={e => updateActiveElement({ content: e.target.value })}
                          className="text-xs font-bold bg-slate-900 border border-slate-600 focus:border-indigo-500 rounded-lg px-2.5 py-1 text-white outline-none w-48 sm:w-64"
                          placeholder="Nhập nội dung chữ..."
                        />
                      </div>

                      {/* Font Family Dropdown with preview font styling */}
                      <div className="flex items-center gap-1.5 border-l border-slate-700 pl-3 shrink-0">
                        <span className="text-[11px] font-bold text-slate-300">Phông chữ:</span>
                        <select
                          value={activeElement.fontFamily}
                          onChange={e => updateActiveElement({ fontFamily: e.target.value })}
                          className="text-xs font-bold bg-slate-900 border border-slate-600 focus:border-indigo-500 rounded-lg px-2.5 py-1 text-white outline-none cursor-pointer max-w-[210px]"
                        >
                          <optgroup label="── Ký tên & Nghệ thuật (Cursive) ──" className="text-amber-400 bg-slate-950 font-bold">
                            {CERT_FONTS.filter(f => f.category === 'cursive').map(f => (
                              <option key={f.id} value={f.font} style={{ fontFamily: f.font }} className="text-white py-1">
                                {f.name}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="── Sang trọng & Cổ điển (Serif) ──" className="text-sky-400 bg-slate-950 font-bold">
                            {CERT_FONTS.filter(f => f.category === 'serif').map(f => (
                              <option key={f.id} value={f.font} style={{ fontFamily: f.font }} className="text-white py-1">
                                {f.name}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="── Hiện đại & Chuẩn mực (Sans) ──" className="text-emerald-400 bg-slate-950 font-bold">
                            {CERT_FONTS.filter(f => f.category === 'sans').map(f => (
                              <option key={f.id} value={f.font} style={{ fontFamily: f.font }} className="text-white py-1">
                                {f.name}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>

                      {/* Font Size Input & Slider */}
                      <div className="flex items-center gap-2 border-l border-slate-700 pl-3 shrink-0">
                        <span className="text-[11px] font-bold text-slate-300">Cỡ chữ:</span>
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
                          className="w-14 text-xs font-mono font-bold bg-slate-900 border border-slate-600 rounded-lg px-1.5 py-1 text-center text-indigo-300 outline-none"
                        />
                      </div>

                      {/* Letter Spacing Slider & Input (Giãn khoảng cách chữ) */}
                      <div className="flex items-center gap-2 border-l border-slate-700 pl-3 shrink-0">
                        <span className="text-[11px] font-bold text-slate-300">Giãn chữ:</span>
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
                        <span className="text-xs font-mono font-bold text-indigo-300 w-14 text-center">
                          {activeElement.letterSpacing || '0em'}
                        </span>
                      </div>

                      {/* Color Picker */}
                      <div className="flex items-center gap-2 border-l border-slate-700 pl-3 shrink-0">
                        <span className="text-[11px] font-bold text-slate-300">Màu chữ:</span>
                        <input
                          type="color"
                          value={activeElement.color || '#1e3a8a'}
                          onChange={e => updateActiveElement({ color: e.target.value })}
                          className="w-7 h-7 rounded-lg cursor-pointer border border-slate-600 bg-transparent p-0"
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
                            <span className="text-[11px] font-bold text-slate-300">Độ dày viền:</span>
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
                            <span className="text-xs font-mono font-bold text-indigo-300 w-10">
                              {activeElement.borderWidth !== undefined ? activeElement.borderWidth : 10}px
                            </span>
                          </div>

                          {/* Border Color Picker */}
                          <div className="flex items-center gap-2 border-l border-slate-700 pl-3 shrink-0">
                            <span className="text-[11px] font-bold text-slate-300">Màu viền:</span>
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
                              className="w-7 h-7 rounded-lg cursor-pointer border border-slate-600 bg-transparent p-0"
                              title="Chọn màu viền"
                            />
                          </div>

                          {/* Avatar Size Slider */}
                          <div className="flex items-center gap-2 border-l border-slate-700 pl-3 shrink-0">
                            <span className="text-[11px] font-bold text-slate-300">Kích thước:</span>
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
                            <span className="text-xs font-mono font-bold text-indigo-300 w-12">
                              {activeElement.width || 460}px
                            </span>
                          </div>
                        </>
                      ) : (
                        /* DIGITAL SIGNATURE & LOGO CONTROLS */
                        <>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-bold text-slate-300">
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
                            <span className="text-xs font-mono font-bold text-indigo-300 w-12 text-center">
                              {activeElement.width || (activeElement.id === 'school_logo' ? 140 : 260)}px
                            </span>
                          </div>

                          {/* Quick Scale Buttons */}
                          <div className="flex items-center gap-1.5 border-l border-slate-700 pl-3 shrink-0">
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
                              className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs font-bold text-slate-200 transition-colors"
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
                              className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs font-bold text-slate-200 transition-colors"
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
                      className="px-2.5 py-1 text-xs font-bold text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                    >
                      Bỏ chọn
                    </button>
                    <button
                      type="button"
                      onClick={deleteActiveElement}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-rose-400 hover:text-white rounded-lg hover:bg-rose-600 transition-colors border border-rose-500/40"
                      title="Xóa đối tượng này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* EMPTY STATE GUIDANCE */
                <div className="flex items-center justify-between w-full text-slate-400 text-xs">
                  <div className="flex items-center gap-2">
                    <MousePointer className="w-4 h-4 text-indigo-400 animate-bounce" />
                    <span className="font-medium text-slate-300">
                      Vui lòng click chọn một đoạn chữ hoặc hình ảnh trên thư khen để chỉnh sửa.
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[11px] text-slate-400">
                    <button
                      type="button"
                      onClick={() => appendLogoToCanvas()}
                      disabled={isExporting}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-600/80 hover:bg-amber-600 disabled:opacity-50 disabled:pointer-events-none text-white text-[11px] font-bold transition-all shadow-xs cursor-pointer"
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
                    <span>Di chuột: <strong className="text-indigo-300">Kéo vị trí</strong></span>
                    <span>•</span>
                    <span>Tỷ lệ Zoom: <strong className="text-emerald-300">{Math.round(previewScale * 100)}%</strong></span>
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
              className="relative shadow-2xl rounded-2xl overflow-hidden ring-4 ring-white/10 shrink-0"
              style={{
                width: `${CANVAS_WIDTH * previewScale}px`,
                height: `${CANVAS_HEIGHT * previewScale}px`,
              }}
            >
              <div
                ref={certificatePrintRef}
                id="certificate-print-node-1920"
                className="select-none overflow-hidden relative bg-white"
                style={{
                  width: `${CANVAS_WIDTH}px`,
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
                          whiteSpace: 'nowrap',
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

            {/* Bottom Export Overlay Progress (Visible during batch export) */}
            {isExporting && (
              <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white animate-in fade-in">
                <div className="w-20 h-20 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin flex items-center justify-center mb-6">
                  <Award className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="text-xl font-black uppercase tracking-wider mb-2">
                  ĐANG KẾT XUẤT THƯ KHEN FULL HD (1920 × 1080)
                </h2>
                <p className="text-sm text-slate-300 font-medium mb-4">
                  {exportMessage}
                </p>
                
                {/* Progress Bar */}
                <div className="w-80 h-3 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-green-400 transition-all duration-300"
                    style={{ width: `${exportProgress}%` }}
                  ></div>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400 mt-2">
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
