import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { toPng } from 'html-to-image';
import { useClassroom } from '../../context/ClassroomContext';
import { 
  Calendar, ExternalLink, Plus, Trash2, 
  Settings, Download, Save, Check, Globe,
  Printer, Image as ImageIcon, Sparkles, RefreshCw,
  Edit2, Eye, LayoutGrid, CheckCircle2, ChevronRight,
  BookOpen, Star, HelpCircle, FileSpreadsheet, AlertTriangle,
  ArrowUp, ArrowDown, Upload, Pencil, X
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  TimetableConfigModal, 
  TimetableDisplaySettings 
} from '../modals/TimetableConfigModal';
import { 
  TimetableSlotPickerModal, 
  PRIMARY_SUBJECT_PRESETS 
} from '../modals/TimetableSlotPickerModal';
import { exportElementToPdf, downloadPrintableHtml } from '../../utils/printHelper';
import { playDeductSound } from '../../utils/audio';
import { SubjectTeacherTimetableView } from './schedule/SubjectTeacherTimetableView';
import { ModernTimetable, MODERN_TIMETABLE_THEMES, type ModernTimetableTheme } from './schedule/ModernTimetableTemplates';

export const DAYS_OF_WEEK = [
  { day: 2, label: 'Thứ Hai', short: 'T2', badgeColor: 'bg-sky-500 text-white', pastelBg: 'bg-sky-50 border-sky-200 text-sky-900', icon: '☀️' },
  { day: 3, label: 'Thứ Ba', short: 'T3', badgeColor: 'bg-emerald-500 text-white', pastelBg: 'bg-emerald-50 border-emerald-200 text-emerald-900', icon: '🌱' },
  { day: 4, label: 'Thứ Tư', short: 'T4', badgeColor: 'bg-amber-500 text-white', pastelBg: 'bg-amber-50 border-amber-200 text-amber-900', icon: '⭐' },
  { day: 5, label: 'Thứ Năm', short: 'T5', badgeColor: 'bg-purple-500 text-white', pastelBg: 'bg-purple-50 border-purple-200 text-purple-900', icon: '🚀' },
  { day: 6, label: 'Thứ Sáu', short: 'T6', badgeColor: 'bg-pink-500 text-white', pastelBg: 'bg-pink-50 border-pink-200 text-pink-900', icon: '🎈' },
  { day: 7, label: 'Thứ Bảy', short: 'T7', badgeColor: 'bg-orange-500 text-white', pastelBg: 'bg-orange-50 border-orange-200 text-orange-900', icon: '🎨' }
];

export type TimetableTemplateId = 
  | 'pedagogical'      // 1. Tiêu Chuẩn Sư Phạm Hiện Đại
  | 'rainbow_train'    // 2. Cầu Vồng & Chuyến Tàu Tuổi Thơ (Ảnh đính kèm 9)
  | 'peacock_blossom'  // 3. Chim Công & Vườn Hoa Nhiệt Đới (Ảnh đính kèm 3)
  | 'chalkboard_wood'  // 4. Bảng Phấn & Khung Gỗ Học Trò (Ảnh đính kèm 2)
  | 'dreamy_sky'       // 5. Bầu Trời Ước Mơ & Khinh Khí Cầu (Ảnh đính kèm)
  | 'vibrant_cards'    // 6. Thẻ Tuần Sinh Động PPTX (Ảnh đính kèm 1)
  | 'minimalist_a4'    // 7. Tối Giản Thanh Lịch In A4
  | 'cosmic_galaxy'    // 8. Vũ Trụ & Phi Hành Gia (Mẫu Mới 1)
  | 'jungle_safari'    // 9. Rừng Xanh & Muông Thú Safari (Mẫu Mới 2)
  | 'pastel_castle'    // 10. Lâu Đài Cổ Tích Pastel Kẹo Ngọt (Mẫu Mới 3)
  | ModernTimetableTheme; // 11–15. Bộ mẫu hiện đại (ModernTimetableTemplates.tsx)

interface TemplateMeta {
  id: TimetableTemplateId;
  name: string;
  badge: string;
  description: string;
  icon: string;
  tagColor: string;
}

const MODERN_TAG_COLORS: Record<ModernTimetableTheme, string> = {
  subject_color: 'from-blue-600 via-violet-600 to-pink-600',
  luxe_navy: 'from-slate-800 to-amber-600',
  pastel_soft: 'from-rose-400 to-violet-400',
  minimal_mono: 'from-slate-700 to-slate-500',
  day_cards: 'from-sky-600 to-emerald-600',
};
const isModernTheme = (id: string): id is ModernTimetableTheme => MODERN_TIMETABLE_THEMES.some(t => t.id === id);

// 5 mẫu thời khóa biểu (người dùng chọn 11/2026), đánh số Mẫu 1 → Mẫu 5; các mẫu khác đã bỏ
const MODERN_META = (id: ModernTimetableTheme) => MODERN_TIMETABLE_THEMES.find(t => t.id === id)!;
const TEMPLATES: TemplateMeta[] = [
  { id: 'pastel_soft', name: 'Mẫu 1 • Trang nhã Pastel', badge: 'Mẫu 1', description: MODERN_META('pastel_soft').description, icon: MODERN_META('pastel_soft').icon, tagColor: MODERN_TAG_COLORS.pastel_soft },
  { id: 'luxe_navy', name: 'Mẫu 2 • Sang trọng Navy', badge: 'Mẫu 2', description: MODERN_META('luxe_navy').description, icon: MODERN_META('luxe_navy').icon, tagColor: MODERN_TAG_COLORS.luxe_navy },
  {
    id: 'pedagogical',
    name: 'Mẫu 3 • Chuẩn Sư phạm',
    badge: 'Mẫu 3',
    description: 'Bảng lưới hiện đại, khoa học, phân định sáng chiều rõ ràng',
    icon: '🏫',
    tagColor: 'from-blue-600 to-indigo-600'
  },
  {
    id: 'jungle_safari',
    name: 'Mẫu 4 • Rừng xanh Safari',
    badge: 'Mẫu 4',
    description: 'Muông thú nhiệt đới tinh nghịch, khung lá dừa & tre xanh mát mắt',
    icon: '🦁',
    tagColor: 'from-emerald-600 via-teal-700 to-green-500'
  },
  {
    id: 'minimalist_a4',
    name: 'Mẫu 5 • Tối giản in A4',
    badge: 'Mẫu 5',
    description: 'Kẻ bảng đen trắng sắc nét chuẩn văn phòng, có chỗ ký duyệt BGH',
    icon: '📄',
    tagColor: 'from-slate-700 to-indigo-500'
  }
];
const TEMPLATE_IDS = TEMPLATES.map(t => t.id);
const templateNo = (id: TimetableTemplateId) => Math.max(1, TEMPLATE_IDS.indexOf(id) + 1);

interface ScheduleLinksViewProps {
  defaultTab?: 'schedule' | 'links';
  onNavigate?: (view: any) => void;
}

export const ScheduleLinksView: React.FC<ScheduleLinksViewProps> = ({ defaultTab = 'schedule', onNavigate }) => {
  const { 
    classes, activeClassId, setActiveClassId,
    timetable, timetableConfig, setTimetableConfig, 
    updateTimetableSlot, quickLinks, addQuickLink, deleteQuickLink, updateQuickLink, reorderQuickLinks,
    teacherProfile, subjects, teacherRole, subjectTeacherConfig, currentUser
  } = useClassroom();

  const [activeTab, setActiveTab] = useState<'schedule' | 'links'>(defaultTab);
  const [selectedClassId, setSelectedClassId] = useState<string>(activeClassId || (classes[0]?.id || ''));
  const [saveToast, setSaveToast] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [subjectScheduleMode, setSubjectScheduleMode] = useState<'subject_overall' | 'class_detail'>('subject_overall');

  // Active Template
  const [selectedTemplate, setSelectedTemplate] = useState<TimetableTemplateId>(() => {
    const saved = localStorage.getItem('lop_hoc_tkb_template') as TimetableTemplateId | null;
    return saved && TEMPLATE_IDS.includes(saved) ? saved : TEMPLATE_IDS[0];
  });

  const handleSelectTemplate = (id: TimetableTemplateId) => {
    setSelectedTemplate(id);
    localStorage.setItem('lop_hoc_tkb_template', id);
  };

  const selectedClass = classes.find(c => c.id === selectedClassId) || classes[0];

  // Display Settings for Header / Times / Slogan (cau hinh tkb1.jpg & cau hinh tbk.jpg)
  const [displaySettings, setDisplaySettings] = useState<TimetableDisplaySettings>(() => {
    const saved = localStorage.getItem(`lop_hoc_tkb_settings_${selectedClassId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // fallback
      }
    }
    return {
      title: 'THỜI KHÓA BIỂU',
      schoolName: teacherProfile.schoolName || 'TRƯỜNG TIỂU HỌC',
      className: selectedClass ? `LỚP ${selectedClass.name.toUpperCase()}` : 'LỚP HỌC',
      academicYear: teacherProfile.academicYear || '2026 – 2027',
      semester: 'Học kỳ I',
      appliedDate: '05/09/2026',
      teacherName: selectedClass?.teacherName || teacherProfile.name || (currentUser?.fullName || ''),
      slogan: selectedClass?.slogan || 'Mỗi ngày đến trường là một ngày vui • Chăm ngoan - Học giỏi',
      showTimeSlots: true,
      showTeacherInfo: true,
      showSlogan: true,
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
      ]
    };
  });

  // Sync selectedClassId with activeClassId when switched from other views
  useEffect(() => {
    if (activeClassId && activeClassId !== selectedClassId) {
      setSelectedClassId(activeClassId);
    }
  }, [activeClassId]);

  // Sync display settings when class changes
  useEffect(() => {
    if (selectedClass) {
      setDisplaySettings(prev => ({
        ...prev,
        className: `LỚP ${selectedClass.name.toUpperCase()}`,
        teacherName: selectedClass.teacherName || prev.teacherName
      }));
    }
  }, [selectedClassId]);

  // Persist settings
  const handleSaveSettings = (newSettings: TimetableDisplaySettings, newConfig: { morningPeriods: number; afternoonPeriods: number; hasSaturday: boolean }) => {
    setDisplaySettings(newSettings);
    setTimetableConfig(newConfig);
    localStorage.setItem(`lop_hoc_tkb_settings_${selectedClassId}`, JSON.stringify(newSettings));
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  // Modals
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [slotPickerState, setSlotPickerState] = useState<{
    isOpen: boolean;
    day: number;
    dayLabel: string;
    session: 'morning' | 'afternoon';
    period: number;
    currentValue: string;
  } | null>(null);

  // Link form state
  const [isAddLinkOpen, setIsAddLinkOpen] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkCategory, setLinkCategory] = useState('Học liệu số');
  const [linkDescription, setLinkDescription] = useState('');
  const [linkIconUrl, setLinkIconUrl] = useState('');

  // Edit link state
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editLinkTitle, setEditLinkTitle] = useState('');
  const [editLinkUrl, setEditLinkUrl] = useState('');
  const [editLinkCategory, setEditLinkCategory] = useState('');
  const [editLinkDescription, setEditLinkDescription] = useState('');
  const [editLinkIconUrl, setEditLinkIconUrl] = useState('');
  const linkFileInputRef = useRef<HTMLInputElement>(null);
  const editLinkFileInputRef = useRef<HTMLInputElement>(null);

  const timetableContainerRef = useRef<HTMLDivElement>(null);

  const daysToShow = timetableConfig.hasSaturday ? DAYS_OF_WEEK : DAYS_OF_WEEK.slice(0, 5);

  const handleOpenSlotPicker = (day: number, dayLabel: string, session: 'morning' | 'afternoon', period: number, val: string) => {
    setSlotPickerState({
      isOpen: true,
      day,
      dayLabel,
      session,
      period,
      currentValue: val
    });
  };

  const handleSaveSlot = (subjectName: string) => {
    if (!slotPickerState) return;
    updateTimetableSlot(slotPickerState.day, slotPickerState.session, slotPickerState.period, subjectName, selectedClassId);
  };

  // Quick Seed Sample Timetable for Primary School
  const handleSeedSampleTimetable = () => {
    const sampleGrid: Record<string, string> = {
      // Day 2 (Thứ Hai)
      '2-m-1': 'Chào cờ', '2-m-2': 'Tiếng Việt', '2-m-3': 'Tiếng Việt', '2-m-4': 'Toán', '2-m-5': 'Đạo đức',
      '2-a-1': 'Tiếng Anh', '2-a-2': 'Tiếng Anh', '2-a-3': 'Tự học có hướng dẫn', '2-a-4': 'HĐTN',
      // Day 3 (Thứ Ba)
      '3-m-1': 'Toán', '3-m-2': 'Tiếng Việt', '3-m-3': 'Tiếng Việt', '3-m-4': 'Tự nhiên & Xã hội', '3-m-5': 'GDTC (Thể dục)',
      '3-a-1': 'Tin học', '3-a-2': 'Tin học', '3-a-3': 'Đọc sách thư viện', '3-a-4': 'Kỹ năng sống',
      // Day 4 (Thứ Tư)
      '4-m-1': 'Toán', '4-m-2': 'Tiếng Việt', '4-m-3': 'Tiếng Anh', '4-m-4': 'Âm nhạc', '4-m-5': 'Khoa học',
      '4-a-1': 'Công nghệ', '4-a-2': 'Mĩ thuật', '4-a-3': 'HĐTN', '4-a-4': 'Tự học có hướng dẫn',
      // Day 5 (Thứ Năm)
      '5-m-1': 'Toán', '5-m-2': 'Tiếng Việt', '5-m-3': 'Tiếng Việt', '5-m-4': 'Lịch sử & Địa lí', '5-m-5': 'GDTC (Thể dục)',
      '5-a-1': 'Tiếng Anh', '5-a-2': 'Tiếng Anh', '5-a-3': 'Tự học có hướng dẫn', '5-a-4': 'Đọc sách thư viện',
      // Day 6 (Thứ Sáu)
      '6-m-1': 'Toán', '6-m-2': 'Tiếng Việt', '6-m-3': 'Tiếng Việt', '6-m-4': 'Khoa học', '6-m-5': 'Sinh hoạt lớp',
      '6-a-1': 'HĐTN', '6-a-2': 'Hoạt động trải nghiệm', '6-a-3': 'Vệ sinh lớp học', '6-a-4': 'Tổng kết tuần'
    };

    daysToShow.forEach(d => {
      for (let p = 1; p <= timetableConfig.morningPeriods; p++) {
        const val = sampleGrid[`${d.day}-m-${p}`] || 'Tự học';
        updateTimetableSlot(d.day, 'morning', p, val, selectedClassId);
      }
      for (let p = 1; p <= timetableConfig.afternoonPeriods; p++) {
        const val = sampleGrid[`${d.day}-a-${p}`] || '';
        updateTimetableSlot(d.day, 'afternoon', p, val, selectedClassId);
      }
    });

    confetti({ particleCount: 50, spread: 70 });
  };

  // Clear Timetable Confirmation Flow
  const handleOpenClearModal = () => {
    setIsClearConfirmOpen(true);
  };

  const handleConfirmClearTimetable = () => {
    daysToShow.forEach(d => {
      for (let p = 1; p <= 5; p++) {
        updateTimetableSlot(d.day, 'morning', p, '', selectedClassId);
        updateTimetableSlot(d.day, 'afternoon', p, '', selectedClassId);
      }
    });
    setIsClearConfirmOpen(false);
    playDeductSound();
    confetti({ particleCount: 30, spread: 60 });
  };

  // Export PDF Timetable (Standard Vietnamese School A4 Landscape)
  const handlePrint = async () => {
    const fileName = `Thoi_Khoa_Bieu_Lop_${selectedClass?.name || '4A1'}_A4.pdf`;
    const title = `Thời Khóa Biểu Lớp ${selectedClass?.name || '4A1'}`;
    const ok = await exportElementToPdf('printable-timetable', fileName, 'landscape', title);
    if (ok) {
      confetti({ particleCount: 30, spread: 60 });
    }
  };

  // Download Image (PNG) via html-to-image
  const handleDownloadImage = async () => {
    if (!timetableContainerRef.current) return;
    try {
      setIsExportingImage(true);
      const dataUrl = await toPng(timetableContainerRef.current, {
        quality: 0.98,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });
      const link = document.createElement('a');
      link.download = `Thoi_Khoa_Bieu_${selectedClass?.name || 'Lop'}_Mau_${templateNo(selectedTemplate)}.png`;
      link.href = dataUrl;
      link.click();
      confetti({ particleCount: 35, spread: 60 });
    } catch (err) {
      console.error('Lỗi khi tải ảnh thời khóa biểu:', err);
    } finally {
      setIsExportingImage(false);
    }
  };

  // Export Excel (.xlsx)
  const handleExportExcel = () => {
    const rows: any[] = [];
    rows.push({ 'A': displaySettings.schoolName.toUpperCase(), 'B': '', 'C': '', 'D': '', 'E': '', 'F': `NĂM HỌC: ${displaySettings.academicYear}` });
    rows.push({ 'A': `LỚP: ${selectedClass?.name || displaySettings.className}`, 'B': '', 'C': '', 'D': '', 'E': '', 'F': `GVCN: ${displaySettings.teacherName}` });
    rows.push({ 'A': displaySettings.title, 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' });
    rows.push({ 'A': `${displaySettings.semester} • ${displaySettings.appliedDate}`, 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' });
    rows.push({});

    const headerObj: any = { 'Buổi': 'Buổi', 'Tiết': 'Tiết', 'Khung giờ': 'Khung giờ' };
    daysToShow.forEach(d => {
      headerObj[d.label] = d.label;
    });
    rows.push(headerObj);

    // Morning rows
    for (let p = 1; p <= timetableConfig.morningPeriods; p++) {
      const rowObj: any = {
        'Buổi': 'SÁNG',
        'Tiết': `Tiết ${p}`,
        'Khung giờ': displaySettings.morningTimes[p - 1] || ''
      };
      daysToShow.forEach(d => {
        const slot = timetable.find(t => (t.classId ? t.classId === selectedClassId : true) && t.day === d.day && t.session === 'morning' && t.period === p);
        rowObj[d.label] = slot?.subject || '';
      });
      rows.push(rowObj);
    }

    // Afternoon rows
    for (let p = 1; p <= timetableConfig.afternoonPeriods; p++) {
      const rowObj: any = {
        'Buổi': 'CHIỀU',
        'Tiết': `Tiết ${p}`,
        'Khung giờ': displaySettings.afternoonTimes[p - 1] || ''
      };
      daysToShow.forEach(d => {
        const slot = timetable.find(t => (t.classId ? t.classId === selectedClassId : true) && t.day === d.day && t.session === 'afternoon' && t.period === p);
        rowObj[d.label] = slot?.subject || '';
      });
      rows.push(rowObj);
    }

    const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: true });
    ws['!cols'] = [
      { wch: 10 },
      { wch: 10 },
      { wch: 16 },
      ...daysToShow.map(() => ({ wch: 20 }))
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Thoi_Khoa_Bieu");
    XLSX.writeFile(wb, `Thoi_Khoa_Bieu_Lop_${selectedClass?.name || '4A1'}.xlsx`);
    confetti({ particleCount: 35, spread: 60 });
  };

  // Helper to get subject color/icon preset
  const getSubjectMeta = (subjectName: string) => {
    if (!subjectName) return null;
    const match = PRIMARY_SUBJECT_PRESETS.find(p => p.name.toLowerCase() === subjectName.trim().toLowerCase());
    if (match) return match;
    // Check if matches partial
    const partial = PRIMARY_SUBJECT_PRESETS.find(p => subjectName.toLowerCase().includes(p.name.toLowerCase()));
    if (partial) return partial;
    return { name: subjectName, color: '#4F46E5', icon: '📚', bg: 'bg-indigo-50 text-indigo-900 border-indigo-200' };
  };

  // Add Link Submit
  const handleAddLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkTitle.trim() || !linkUrl.trim()) return;

    let validUrl = linkUrl.trim();
    if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
      validUrl = 'https://' + validUrl;
    }

    addQuickLink({
      title: linkTitle.trim(),
      url: validUrl,
      category: linkCategory,
      description: linkDescription.trim(),
      iconUrl: linkIconUrl.trim() || undefined
    });

    setLinkTitle('');
    setLinkUrl('');
    setLinkDescription('');
    setLinkIconUrl('');
    setIsAddLinkOpen(false);
  };

  // Open Edit Link Modal
  const handleOpenEditLink = (link: typeof quickLinks[0]) => {
    setEditingLinkId(link.id);
    setEditLinkTitle(link.title);
    setEditLinkUrl(link.url);
    setEditLinkCategory(link.category);
    setEditLinkDescription(link.description || '');
    setEditLinkIconUrl(link.iconUrl || '');
  };

  // Save Edit Link
  const handleSaveEditLink = () => {
    if (!editingLinkId || !editLinkTitle.trim() || !editLinkUrl.trim()) return;
    let validUrl = editLinkUrl.trim();
    if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
      validUrl = 'https://' + validUrl;
    }
    updateQuickLink(editingLinkId, {
      title: editLinkTitle.trim(),
      url: validUrl,
      category: editLinkCategory,
      description: editLinkDescription.trim(),
      iconUrl: editLinkIconUrl.trim() || undefined
    });
    setEditingLinkId(null);
  };

  // Reorder Links
  const handleMoveLink = (index: number, direction: 'up' | 'down') => {
    const newLinks = [...quickLinks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newLinks.length) return;
    [newLinks[index], newLinks[targetIndex]] = [newLinks[targetIndex], newLinks[index]];
    reorderQuickLinks(newLinks);
  };

  // Handle file upload for link icon (converts to base64)
  const handleLinkIconFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'add' | 'edit') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Ảnh quá lớn. Vui lòng chọn ảnh dưới 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (target === 'add') {
        setLinkIconUrl(result);
      } else {
        setEditLinkIconUrl(result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-3xl border border-indigo-100/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 hover-zoom-card">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-indigo-950 tracking-tight uppercase">
                THỜI KHÓA BIỂU NGHỆ THUẬT & KHO HỌC LIỆU
              </h2>
              <p className="text-xs text-indigo-600/90 font-bold mt-0.5 uppercase">
                5 MẪU TRÌNH BÀY (MẪU 1 → MẪU 5) • IN ẤN A4 & TẢI ẢNH
              </p>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center bg-indigo-50/70 p-1.5 rounded-2xl border border-indigo-100">
          <button
            onClick={() => setActiveTab('schedule')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 hover-zoom-btn uppercase ${
              activeTab === 'schedule' 
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25' 
                : 'text-indigo-900 hover:text-indigo-950 hover:bg-white/60'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>MẪU THỜI KHÓA BIỂU</span>
          </button>

          <button
            onClick={() => setActiveTab('links')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 hover-zoom-btn uppercase ${
              activeTab === 'links' 
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25' 
                : 'text-indigo-900 hover:text-indigo-950 hover:bg-white/60'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>KHO LIÊN KẾT BÀI DẠY ({quickLinks.length})</span>
          </button>
        </div>
      </div>

      {saveToast && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200 shadow-sm">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Đã lưu cài đặt thời khóa biểu thành công!</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: SCHEDULE VIEW WITH MULTIPLE PRESENTATION TEMPLATES */}
      {/* ========================================================================= */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          {/* Sub-mode switcher for Subject Teachers */}
          {teacherRole === 'subject' && (
            <div className="bg-white p-3.5 rounded-2xl border border-emerald-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-black text-emerald-950 uppercase">CHẾ ĐỘ XEM THỜI KHÓA BIỂU:</span>
                <span className="text-slate-500 font-semibold">Giáo viên bộ môn ({classes.length} lớp phụ trách)</span>
              </div>
              <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  onClick={() => setSubjectScheduleMode('subject_overall')}
                  className={`px-3 py-1.5 rounded-lg font-black text-xs transition-all uppercase flex items-center gap-1.5 ${
                    subjectScheduleMode === 'subject_overall'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>💻</span>
                  <span>TKB BỘ MÔN ({classes.length} LỚP)</span>
                </button>
                <button
                  onClick={() => setSubjectScheduleMode('class_detail')}
                  className={`px-3 py-1.5 rounded-lg font-black text-xs transition-all uppercase flex items-center gap-1.5 ${
                    subjectScheduleMode === 'class_detail'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>🎨</span>
                  <span>XEM MẪU NGHỆ THUẬT TỪNG LỚP</span>
                </button>
              </div>
            </div>
          )}

          {teacherRole === 'subject' && subjectScheduleMode === 'subject_overall' ? (
            <SubjectTeacherTimetableView onNavigate={onNavigate || (setActiveTab as any)} />
          ) : (
            <>
          {/* Class Selector Bar */}
          {classes.length > 1 && (
            <div className="bg-white p-3.5 rounded-2xl border border-indigo-100/90 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-black text-indigo-950 uppercase tracking-wide">Thời khóa biểu của lớp:</span>
                <span className="text-slate-500 font-semibold">Chọn lớp cần soạn lịch và in ấn</span>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto">
                {classes.map(cls => (
                  <button
                    key={cls.id}
                    onClick={() => {
                      setSelectedClassId(cls.id);
                      setActiveClassId(cls.id);
                    }}
                    className={`px-3.5 py-1.5 rounded-xl font-black transition-all text-xs flex items-center gap-2 hover-zoom-btn ${
                      selectedClassId === cls.id
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-600/30'
                        : 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full ring-2 ring-white/70" style={{ backgroundColor: cls.color || '#3B82F6' }} />
                    <span>Lớp {cls.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TEMPLATE PICKER BAR (User Request 2: "ngoài mẫu trình bày hiện có bổ sung các mẫu trình bày khác theo ảnh đính kèm") */}
          <div className="bg-white rounded-3xl border border-indigo-100/90 p-4 sm:p-5 shadow-2xs space-y-3 hover-zoom-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h3 className="text-xs font-black text-indigo-950 uppercase tracking-wider">
                  CHỌN MẪU TRÌNH BÀY THỜI KHÓA BIỂU ({TEMPLATES.length} MẪU):
                </h3>
              </div>
              <span className="text-[12px] font-bold text-indigo-600">
                Đang dùng: <strong className="text-indigo-900">{TEMPLATES.find(t => t.id === selectedTemplate)?.name}</strong>
              </span>
            </div>

            {/* Template Buttons Carousel / Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-2.5">
              {TEMPLATES.map((tmpl) => {
                const isSelected = selectedTemplate === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    onClick={() => handleSelectTemplate(tmpl.id)}
                    className={`p-2 sm:p-3 rounded-2xl border text-left transition-all relative flex flex-col justify-between hover-zoom-btn ${
                      isSelected
                        ? 'border-indigo-600 bg-gradient-to-b from-indigo-50 to-violet-50/50 shadow-md ring-2 ring-indigo-500/20'
                        : 'border-slate-200/90 hover:border-indigo-300 bg-slate-50/40 hover:bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xl">{tmpl.icon}</span>
                        {isSelected && (
                          <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-black text-slate-800 leading-tight">
                        {tmpl.name}
                      </h4>
                      <p className="text-[12px] text-slate-400 font-medium line-clamp-1 mt-0.5">
                        {tmpl.description}
                      </p>
                    </div>

                    <div className="mt-2 pt-1 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[12px] font-extrabold px-1.5 py-0.5 rounded-md bg-indigo-100/70 text-indigo-800">
                        {tmpl.badge}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action & Configuration Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {/* Nút Cấu hình TKB (theo cau hinh tkb1.jpg & cau hinh tbk.jpg) */}
              <button
                onClick={() => setIsConfigOpen(true)}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-black flex items-center gap-1.5 transition-all hover-zoom-btn"
                title="Cài đặt tiêu đề, trường, lớp, giáo viên và khung giờ từng tiết"
              >
                <Settings className="w-4 h-4 text-indigo-600" />
                <span>⚙️ Cấu Hình Thời Khóa Biểu</span>
              </button>

              {/* Nút Nạp TKB Gợi Ý Mẫu */}
              <button
                onClick={handleSeedSampleTimetable}
                className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl font-bold flex items-center gap-1.5 transition-all hover-zoom-btn"
                title="Nạp nhanh các môn học tiểu học chuẩn của Bộ Giáo Dục"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Nạp Mẫu Chuẩn Bộ GD</span>
              </button>

              {/* Nút Xóa Trắng */}
              <button
                onClick={handleOpenClearModal}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold flex items-center gap-1.5 transition-all hover-zoom-btn"
                title="Xóa trắng toàn bộ môn học trong thời khóa biểu để nhập lại"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa trắng</span>
              </button>
            </div>

            {/* Export & Print Buttons */}
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {/* Tải HTML A4 */}
              <button
                onClick={() => downloadPrintableHtml('printable-timetable', `Thoi_Khoa_Bieu_${selectedClass?.name || '4A1'}_A4.html`, `Thời Khóa Biểu - Lớp ${selectedClass?.name || '4A1'}`, 'landscape')}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl font-bold flex items-center gap-1.5 transition-all hover-zoom-btn"
                title="Tải file HTML chuẩn A4 để mở in bất kỳ lúc nào"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Tải HTML A4</span>
              </button>

              {/* Xuất PDF A4 */}
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all hover-zoom-btn"
                title="Xuất thời khóa biểu ra file PDF chuẩn khổ A4"
              >
                <Download className="w-4 h-4 text-white" />
                <span>Xuất File In PDF (A4)</span>
              </button>

              {/* Tải ảnh PNG */}
              <button
                onClick={handleDownloadImage}
                disabled={isExportingImage}
                className="px-4 py-2 bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-800 hover:to-teal-800 text-white rounded-xl font-black flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 transition-all hover-zoom-btn disabled:opacity-50"
                title="Tải ảnh PNG sắc nét để gửi vào nhóm Zalo phụ huynh hoặc lưu trữ"
              >
                <ImageIcon className="w-4 h-4" />
                <span>{isExportingImage ? 'Đang xuất ảnh...' : 'Tải Ảnh Gửi Zalo'}</span>
              </button>

              {/* Xuất Excel */}
              <button
                onClick={handleExportExcel}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold flex items-center gap-1.5 transition-all hover-zoom-btn"
                title="Xuất file Excel (.xlsx)"
              >
                <Download className="w-4 h-4 text-slate-700" />
                <span>Xuất Excel</span>
              </button>
            </div>
          </div>

          {/* Quick Notice Hint */}
          <div className="bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-100 text-xs text-indigo-800 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span>💡</span>
              <span><strong>Mẹo:</strong> Nhấp chuột vào bất kỳ ô tiết học nào để chọn nhanh môn học hoặc gõ môn tùy ý.</span>
            </span>
            <span className="text-[12px] font-bold text-indigo-600">
              Sáng: {timetableConfig.morningPeriods} tiết • Chiều: {timetableConfig.afternoonPeriods} tiết
            </span>
          </div>

          {/* ===================================================================== */}
          {/* TIMETABLE RENDERER CONTAINER (Capture target for Image & Print) */}
          {/* ===================================================================== */}
          <div id="printable-timetable" ref={timetableContainerRef} className="bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden p-4 sm:p-6 space-y-6">
            
            {/* BỘ MẪU HIỆN ĐẠI (11–15) */}
            {isModernTheme(selectedTemplate) && (
              <ModernTimetable
                theme={selectedTemplate}
                settings={{ ...displaySettings, className: selectedClass?.name || displaySettings.className }}
                days={daysToShow}
                morningPeriods={timetableConfig.morningPeriods}
                afternoonPeriods={timetableConfig.afternoonPeriods}
                getSubject={(day, session, period) => timetable.find(t => (t.classId ? t.classId === selectedClassId : true) && t.day === day && t.session === session && t.period === period)?.subject || ''}
                getMeta={(sub) => getSubjectMeta(sub)}
                onSlotClick={handleOpenSlotPicker}
              />
            )}

            {/* ------------------------------------------------------------- */}
            {/* TEMPLATE 1: TIÊU CHUẨN SƯ PHẠM HIỆN ĐẠI                       */}
            {/* ------------------------------------------------------------- */}
            {selectedTemplate === 'pedagogical' && (
              <div className="space-y-4">
                {/* Header */}
                <div className="border-b-2 border-indigo-600 pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase text-indigo-600 tracking-wider">
                      {displaySettings.schoolName}
                    </p>
                    <h2 className="text-2xl sm:text-3xl font-black text-indigo-950 uppercase tracking-tight">
                      {displaySettings.title} • {displaySettings.className}
                    </h2>
                    {displaySettings.showSlogan && (
                      <p className="text-xs italic text-indigo-700 font-semibold mt-0.5">
                        « {displaySettings.slogan} »
                      </p>
                    )}
                  </div>

                  <div className="text-left sm:text-right text-xs text-slate-600 space-y-0.5">
                    {displaySettings.showTeacherInfo && (
                      <p>
                        GVCN: <strong className="text-indigo-900 font-black">{displaySettings.teacherName}</strong>
                      </p>
                    )}
                    <p className="font-semibold text-slate-500">
                      {displaySettings.semester} • Năm học: {displaySettings.academicYear} • Áp dụng: {displaySettings.appliedDate}
                    </p>
                  </div>
                </div>

                {/* Gợi ý cuộn ngang trên điện thoại */}
                <div className="sm:hidden flex items-center gap-1.5 text-[12px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-xl font-bold w-fit mb-2">
                  <span>⇄ Vuốt ngang để xem đủ thời khóa biểu từ Thứ Hai đến Thứ Bảy</span>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-2xl border border-indigo-200 scrollbar-thin">
                  <table className="min-w-[760px] w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-gradient-to-r from-indigo-700 to-violet-700 text-white font-black uppercase text-[12px]">
                        <th className="py-3 px-3 w-16 text-center border-r border-indigo-600/50 whitespace-nowrap">Buổi</th>
                        <th className="py-3 px-2 w-14 text-center border-r border-indigo-600/50 whitespace-nowrap">Tiết</th>
                        {displaySettings.showTimeSlots && (
                          <th className="py-3 px-2 w-28 text-center border-r border-indigo-600/50 whitespace-nowrap">Khung Giờ</th>
                        )}
                        {daysToShow.map(d => (
                          <th key={d.day} className="py-3 px-3 text-center border-r border-indigo-600/50 last:border-r-0 min-w-[130px] whitespace-nowrap">
                            {d.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-indigo-100">
                      {/* Morning */}
                      {Array.from({ length: timetableConfig.morningPeriods }).map((_, pIdx) => {
                        const period = pIdx + 1;
                        return (
                          <tr key={`ped-m-${period}`} className="hover:bg-indigo-50/30">
                            {pIdx === 0 && (
                              <td 
                                rowSpan={timetableConfig.morningPeriods} 
                                className="py-3 px-2 text-center font-black text-amber-800 bg-amber-50/70 border-r border-indigo-100 uppercase text-[12px] tracking-wider"
                              >
                                SÁNG
                              </td>
                            )}
                            <td className="py-2.5 px-2 text-center font-mono font-black text-indigo-900 border-r border-indigo-100 bg-slate-50/50">
                              Tiết {period}
                            </td>
                            {displaySettings.showTimeSlots && (
                              <td className="py-2.5 px-2 text-center font-mono text-[12px] font-bold text-slate-500 border-r border-indigo-100 bg-slate-50/30">
                                {displaySettings.morningTimes[pIdx] || ''}
                              </td>
                            )}
                            {daysToShow.map(d => {
                              const slot = timetable.find(t => (t.classId ? t.classId === selectedClassId : true) && t.day === d.day && t.session === 'morning' && t.period === period);
                              const subMeta = getSubjectMeta(slot?.subject || '');
                              return (
                                <td 
                                  key={d.day} 
                                  onClick={() => handleOpenSlotPicker(d.day, d.label, 'morning', period, slot?.subject || '')}
                                  className="p-1.5 border-r border-indigo-100 last:border-r-0 cursor-pointer hover:bg-indigo-100/50 transition-colors"
                                >
                                  {slot?.subject ? (
                                    <div className="w-full py-2 px-2.5 rounded-xl bg-white border border-indigo-200 shadow-2xs text-center font-black text-indigo-950 flex items-center justify-center gap-1.5 hover-zoom-btn">
                                      <span>{subMeta?.icon || '📘'}</span>
                                      <span>{slot.subject}</span>
                                    </div>
                                  ) : (
                                    <div className="w-full py-2 rounded-xl text-center text-slate-500 font-medium hover:text-indigo-600">
                                      + Chọn môn
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}

                      {/* Afternoon */}
                      {timetableConfig.afternoonPeriods > 0 && Array.from({ length: timetableConfig.afternoonPeriods }).map((_, pIdx) => {
                        const period = pIdx + 1;
                        return (
                          <tr key={`ped-a-${period}`} className="hover:bg-indigo-50/30 border-t-2 border-indigo-200">
                            {pIdx === 0 && (
                              <td 
                                rowSpan={timetableConfig.afternoonPeriods} 
                                className="py-3 px-2 text-center font-black text-blue-800 bg-blue-50/70 border-r border-indigo-100 uppercase text-[12px] tracking-wider"
                              >
                                CHIỀU
                              </td>
                            )}
                            <td className="py-2.5 px-2 text-center font-mono font-black text-indigo-900 border-r border-indigo-100 bg-slate-50/50">
                              Tiết {period}
                            </td>
                            {displaySettings.showTimeSlots && (
                              <td className="py-2.5 px-2 text-center font-mono text-[12px] font-bold text-slate-500 border-r border-indigo-100 bg-slate-50/30">
                                {displaySettings.afternoonTimes[pIdx] || ''}
                              </td>
                            )}
                            {daysToShow.map(d => {
                              const slot = timetable.find(t => (t.classId ? t.classId === selectedClassId : true) && t.day === d.day && t.session === 'afternoon' && t.period === period);
                              const subMeta = getSubjectMeta(slot?.subject || '');
                              return (
                                <td 
                                  key={d.day} 
                                  onClick={() => handleOpenSlotPicker(d.day, d.label, 'afternoon', period, slot?.subject || '')}
                                  className="p-1.5 border-r border-indigo-100 last:border-r-0 cursor-pointer hover:bg-indigo-100/50 transition-colors"
                                >
                                  {slot?.subject ? (
                                    <div className="w-full py-2 px-2.5 rounded-xl bg-white border border-blue-200 shadow-2xs text-center font-black text-blue-950 flex items-center justify-center gap-1.5 hover-zoom-btn">
                                      <span>{subMeta?.icon || '📘'}</span>
                                      <span>{slot.subject}</span>
                                    </div>
                                  ) : (
                                    <div className="w-full py-2 rounded-xl text-center text-slate-500 font-medium hover:text-indigo-600">
                                      + Chọn môn
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TEMPLATE 7: TỐI GIẢN THANH LỊCH CHUẨN IN A4 (MONOCHROME)     */}
            {/* ------------------------------------------------------------- */}
            {selectedTemplate === 'minimalist_a4' && (
              <div className="space-y-4 p-4 text-slate-900 bg-white">
                {/* Formal Header */}
                <div className="grid grid-cols-2 text-xs font-bold leading-relaxed border-b border-slate-300 pb-3">
                  <div>
                    <p className="uppercase">{displaySettings.schoolName}</p>
                    <p>LỚP: {selectedClass?.name || displaySettings.className}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                    <p className="italic font-normal">Độc lập - Tự do - Hạnh phúc</p>
                  </div>
                </div>

                <div className="text-center pt-2 pb-2">
                  <h2 className="text-xl sm:text-2xl font-black uppercase tracking-wider">
                    {displaySettings.title}
                  </h2>
                  <p className="text-xs italic text-slate-700 mt-0.5">
                    Năm học: {displaySettings.academicYear} • {displaySettings.semester} • Áp dụng từ ngày: {displaySettings.appliedDate}
                  </p>
                </div>

                {/* Monochrome Printable Grid */}
                <div className="overflow-x-auto border border-slate-800 rounded-xl scrollbar-thin">
                  <table className="min-w-[760px] w-full text-xs border-collapse border border-slate-800">
                  <thead>
                    <tr className="bg-slate-100 border border-slate-800 font-bold text-center">
                      <th className="border border-slate-800 py-2 px-2 w-16">Buổi</th>
                      <th className="border border-slate-800 py-2 px-2 w-14">Tiết</th>
                      {displaySettings.showTimeSlots && (
                        <th className="border border-slate-800 py-2 px-2 w-28">Khung Giờ</th>
                      )}
                      {daysToShow.map(d => (
                        <th key={d.day} className="border border-slate-800 py-2 px-3">
                          {d.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Morning */}
                    {Array.from({ length: timetableConfig.morningPeriods }).map((_, pIdx) => {
                      const period = pIdx + 1;
                      return (
                        <tr key={`min-m-${period}`} className="border border-slate-800">
                          {pIdx === 0 && (
                            <td 
                              rowSpan={timetableConfig.morningPeriods} 
                              className="border border-slate-800 py-2 px-2 text-center font-bold bg-slate-50 uppercase text-[12px]"
                            >
                              SÁNG
                            </td>
                          )}
                          <td className="border border-slate-800 py-2 px-2 text-center font-mono font-bold">
                            Tiết {period}
                          </td>
                          {displaySettings.showTimeSlots && (
                            <td className="border border-slate-800 py-2 px-2 text-center font-mono text-[12px]">
                              {displaySettings.morningTimes[pIdx] || ''}
                            </td>
                          )}
                          {daysToShow.map(d => {
                            const slot = timetable.find(t => (t.classId ? t.classId === selectedClassId : true) && t.day === d.day && t.session === 'morning' && t.period === period);
                            return (
                              <td 
                                key={d.day} 
                                onClick={() => handleOpenSlotPicker(d.day, d.label, 'morning', period, slot?.subject || '')}
                                className="border border-slate-800 p-2 text-center font-bold cursor-pointer hover:bg-slate-100"
                              >
                                {slot?.subject || '—'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}

                    {/* Afternoon */}
                    {timetableConfig.afternoonPeriods > 0 && Array.from({ length: timetableConfig.afternoonPeriods }).map((_, pIdx) => {
                      const period = pIdx + 1;
                      return (
                        <tr key={`min-a-${period}`} className="border border-slate-800">
                          {pIdx === 0 && (
                            <td 
                              rowSpan={timetableConfig.afternoonPeriods} 
                              className="border border-slate-800 py-2 px-2 text-center font-bold bg-slate-50 uppercase text-[12px]"
                            >
                              CHIỀU
                            </td>
                          )}
                          <td className="border border-slate-800 py-2 px-2 text-center font-mono font-bold">
                            Tiết {period}
                          </td>
                          {displaySettings.showTimeSlots && (
                            <td className="border border-slate-800 py-2 px-2 text-center font-mono text-[12px]">
                              {displaySettings.afternoonTimes[pIdx] || ''}
                            </td>
                          )}
                          {daysToShow.map(d => {
                            const slot = timetable.find(t => (t.classId ? t.classId === selectedClassId : true) && t.day === d.day && t.session === 'afternoon' && t.period === period);
                            return (
                              <td 
                                key={d.day} 
                                onClick={() => handleOpenSlotPicker(d.day, d.label, 'afternoon', period, slot?.subject || '')}
                                className="border border-slate-800 p-2 text-center font-bold cursor-pointer hover:bg-slate-100"
                              >
                                {slot?.subject || '—'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>

                {/* Signatures */}
                <div className="pt-6 grid grid-cols-2 text-xs">
                  <div className="text-center space-y-1">
                    <p className="font-bold uppercase">DUYỆT CỦA BAN GIÁM HIỆU</p>
                    <p className="text-[12px] italic text-slate-500">(Ký và đóng dấu)</p>
                    <div className="h-16"></div>
                  </div>

                  <div className="text-center space-y-1">
                    <p className="italic">
                      ......., ngày {new Date().getDate()} tháng {new Date().getMonth() + 1} năm {new Date().getFullYear()}
                    </p>
                    <p className="font-bold uppercase">GIÁO VIÊN CHỦ NHIỆM</p>
                    <p className="text-[12px] italic text-slate-500">(Ký và ghi rõ họ tên)</p>
                    <div className="h-14"></div>
                    <p className="font-bold text-slate-800">{displaySettings.teacherName}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TEMPLATE 9: RỪNG XANH SAFARI & MUÔNG THÚ                      */}
            {/* ------------------------------------------------------------- */}
            {selectedTemplate === 'jungle_safari' && (
              <div className="space-y-4 rounded-3xl p-5 sm:p-6 bg-gradient-to-b from-emerald-50 via-lime-50/50 to-teal-50 border-2 border-emerald-300 shadow-md relative overflow-hidden">
                {/* Header */}
                <div className="border-b-2 border-emerald-500 pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-emerald-800 text-xs font-black tracking-wider uppercase">
                      <span>🦁 {displaySettings.schoolName}</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 font-bold text-[12px]">SAFARI KIDS</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-emerald-950 uppercase tracking-tight mt-1 flex items-center gap-2">
                      <span>🌿</span>
                      <span>{displaySettings.title} • {displaySettings.className}</span>
                    </h2>
                    {displaySettings.showSlogan && (
                      <p className="text-xs text-emerald-700 font-semibold italic mt-0.5">
                        « {displaySettings.slogan} »
                      </p>
                    )}
                  </div>

                  <div className="text-right text-xs text-emerald-900 space-y-0.5">
                    {displaySettings.showTeacherInfo && (
                      <p>
                        GVCN: <strong className="text-emerald-950 font-black">{displaySettings.teacherName}</strong>
                      </p>
                    )}
                    <p className="font-semibold text-emerald-700">
                      {displaySettings.semester} • {displaySettings.academicYear} • Áp dụng: {displaySettings.appliedDate}
                    </p>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-2xl border border-emerald-300 bg-white">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-gradient-to-r from-emerald-700 to-teal-700 text-white font-black text-[12px] uppercase">
                        <th className="py-3 px-3 w-16 text-center border-r border-emerald-600/50">Buổi</th>
                        <th className="py-3 px-2 w-14 text-center border-r border-emerald-600/50">Tiết</th>
                        {displaySettings.showTimeSlots && (
                          <th className="py-3 px-2 w-24 text-center border-r border-emerald-600/50">Giờ Học</th>
                        )}
                        {daysToShow.map(d => (
                          <th key={d.day} className="py-3 px-3 text-center border-r border-emerald-600/50 last:border-r-0 min-w-[130px]">
                            {d.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-100">
                      {/* Morning */}
                      {Array.from({ length: timetableConfig.morningPeriods }).map((_, pIdx) => {
                        const period = pIdx + 1;
                        return (
                          <tr key={`jun-m-${period}`} className="hover:bg-emerald-50/40">
                            {pIdx === 0 && (
                              <td 
                                rowSpan={timetableConfig.morningPeriods} 
                                className="py-3 px-2 text-center font-black text-amber-800 bg-amber-100/70 border-r border-emerald-100 uppercase text-[12px]"
                              >
                                ☀️ SÁNG
                              </td>
                            )}
                            <td className="py-2.5 px-2 text-center font-mono font-black text-emerald-900 border-r border-emerald-100 bg-emerald-50/30">
                              Tiết {period}
                            </td>
                            {displaySettings.showTimeSlots && (
                              <td className="py-2.5 px-2 text-center font-mono text-[12px] text-slate-500 border-r border-emerald-100">
                                {displaySettings.morningTimes[pIdx] || ''}
                              </td>
                            )}
                            {daysToShow.map(d => {
                              const slot = timetable.find(t => (t.classId ? t.classId === selectedClassId : true) && t.day === d.day && t.session === 'morning' && t.period === period);
                              const subMeta = getSubjectMeta(slot?.subject || '');
                              return (
                                <td 
                                  key={d.day} 
                                  onClick={() => handleOpenSlotPicker(d.day, d.label, 'morning', period, slot?.subject || '')}
                                  className="p-1.5 border-r border-emerald-100 last:border-r-0 cursor-pointer hover:bg-emerald-100/40 transition-colors"
                                >
                                  {slot?.subject ? (
                                    <div className="w-full py-2 px-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center font-black text-emerald-900 flex items-center justify-center gap-1.5 hover-zoom-btn">
                                      <span>{subMeta?.icon || '🌴'}</span>
                                      <span>{slot.subject}</span>
                                    </div>
                                  ) : (
                                    <div className="w-full py-2 rounded-xl text-center text-slate-500 font-medium hover:text-emerald-700">
                                      + Chọn môn
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}

                      {/* Afternoon */}
                      {timetableConfig.afternoonPeriods > 0 && Array.from({ length: timetableConfig.afternoonPeriods }).map((_, pIdx) => {
                        const period = pIdx + 1;
                        return (
                          <tr key={`jun-a-${period}`} className="hover:bg-emerald-50/40">
                            {pIdx === 0 && (
                              <td 
                                rowSpan={timetableConfig.afternoonPeriods} 
                                className="py-3 px-2 text-center font-black text-teal-800 bg-teal-100/70 border-r border-emerald-100 uppercase text-[12px]"
                              >
                                🌴 CHIỀU
                              </td>
                            )}
                            <td className="py-2.5 px-2 text-center font-mono font-black text-teal-900 border-r border-emerald-100 bg-emerald-50/30">
                              Tiết {period}
                            </td>
                            {displaySettings.showTimeSlots && (
                              <td className="py-2.5 px-2 text-center font-mono text-[12px] text-slate-500 border-r border-emerald-100">
                                {displaySettings.afternoonTimes[pIdx] || ''}
                              </td>
                            )}
                            {daysToShow.map(d => {
                              const slot = timetable.find(t => (t.classId ? t.classId === selectedClassId : true) && t.day === d.day && t.session === 'afternoon' && t.period === period);
                              const subMeta = getSubjectMeta(slot?.subject || '');
                              return (
                                <td 
                                  key={d.day} 
                                  onClick={() => handleOpenSlotPicker(d.day, d.label, 'afternoon', period, slot?.subject || '')}
                                  className="p-1.5 border-r border-emerald-100 last:border-r-0 cursor-pointer hover:bg-teal-100/40 transition-colors"
                                >
                                  {slot?.subject ? (
                                    <div className="w-full py-2 px-2.5 rounded-xl bg-teal-50 border border-teal-200 text-center font-black text-teal-900 flex items-center justify-center gap-1.5 hover-zoom-btn">
                                      <span>{subMeta?.icon || '🐾'}</span>
                                      <span>{slot.subject}</span>
                                    </div>
                                  ) : (
                                    <div className="w-full py-2 rounded-xl text-center text-slate-500 font-medium hover:text-teal-700">
                                      + Chọn môn
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="pt-3 flex items-center justify-between text-xs text-emerald-800 font-bold">
                  <span>🐾 Mỗi ngày đến trường là một chuyến khám phá kỳ thú!</span>
                  <span>GVCN: {displaySettings.teacherName}</span>
                </div>
              </div>
            )}

          </div>
          </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: USEFUL LINKS VAULT (KHO LIÊN KẾT BÀI DẠY)                           */}
      {/* ========================================================================= */}
      {activeTab === 'links' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Danh mục liên kết bài giảng & công cụ học tập trực tuyến
              </h3>
              <p className="text-xs text-slate-500">
                Lưu trữ các website giáo án điện tử, bài tập, slide PowerPoint để truy cập một chạm khi giảng dạy
              </p>
            </div>
            <button
              onClick={() => setIsAddLinkOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 rounded-xl shadow-md shadow-indigo-600/25 transition-all hover-zoom-btn self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm liên kết mới</span>
            </button>
          </div>

          {quickLinks.length === 0 && (
            <div className="text-center py-12 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <Globe className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-600">Chưa có liên kết nào</p>
              <p className="text-xs text-slate-400 mt-1">Bấm "Thêm liên kết mới" để bắt đầu</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {quickLinks.map((link, index) => (
              <div key={link.id} className="bg-white rounded-3xl border border-indigo-100 p-5 shadow-2xs hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between hover-zoom-card">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[12px] font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">{link.category}</span>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => handleMoveLink(index, 'up')} disabled={index === 0} className={`p-1 rounded-lg transition-colors ${index === 0 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`} title="Di chuyển lên"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleMoveLink(index, 'down')} disabled={index === quickLinks.length - 1} className={`p-1 rounded-lg transition-colors ${index === quickLinks.length - 1 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`} title="Di chuyển xuống"><ArrowDown className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleOpenEditLink(link)} className="p-1 text-slate-400 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors" title="Chỉnh sửa"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteQuickLink(link.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Xóa"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    {link.iconUrl ? (
                      <img src={link.iconUrl} alt={link.title} className="w-10 h-10 rounded-xl object-cover border border-slate-200 shadow-xs shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><Globe className="w-5 h-5" /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-black text-slate-900 line-clamp-1">{link.title}</h4>
                      {link.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{link.description}</p>}
                    </div>
                  </div>
                  <p className="text-[12px] font-mono text-indigo-600 truncate mt-2 font-semibold">{link.url}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <a href={link.url} target="_blank" rel="noreferrer" className="w-full py-2.5 px-3 rounded-xl text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-all flex items-center justify-center gap-1.5 hover-zoom-btn">
                    <span>Mở truy cập ngay</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Modal: Add Quick Link (Upgraded with Image) */}
          {isAddLinkOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4">
              <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-slate-800">Thêm liên kết trực tuyến mới</h3>
                  <button onClick={() => setIsAddLinkOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
                </div>
                <form onSubmit={handleAddLinkSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tên liên kết *</label>
                    <input type="text" placeholder="Ví dụ: Bài giảng PowerPoint..." value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Đường dẫn URL *</label>
                    <input type="text" placeholder="https://..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Danh mục</label>
                    <select value={linkCategory} onChange={(e) => setLinkCategory(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold">
                      <option value="Học liệu số">Học liệu số</option>
                      <option value="Luyện tập & Đề thi">Luyện tập & Đề thi</option>
                      <option value="Trò chơi & Quiz">Trò chơi & Quiz</option>
                      <option value="Giáo án & Slide">Giáo án & Slide</option>
                      <option value="Video bài học">Video bài học</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Ảnh / Logo (tùy chọn)</label>
                    <div className="flex items-center gap-2">
                      <input type="text" placeholder="Dán link ảnh..." value={linkIconUrl} onChange={(e) => setLinkIconUrl(e.target.value)} className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono" />
                      <input ref={linkFileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleLinkIconFileUpload(e, 'add')} />
                      <button type="button" onClick={() => linkFileInputRef.current?.click()} className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0"><Upload className="w-3 h-3" /><span>Tải lên</span></button>
                    </div>
                    {linkIconUrl && (
                      <div className="mt-2 flex items-center gap-2">
                        <img src={linkIconUrl} alt="preview" className="w-8 h-8 rounded-lg object-cover border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <button type="button" onClick={() => setLinkIconUrl('')} className="text-[12px] text-rose-600 font-bold hover:underline">Xóa ảnh</button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi chú</label>
                    <textarea rows={2} placeholder="Mô tả nội dung..." value={linkDescription} onChange={(e) => setLinkDescription(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs" />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setIsAddLinkOpen(false)} className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl">Hủy</button>
                    <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs">Lưu liên kết</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal: Edit Quick Link */}
          {editingLinkId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-xs p-4">
              <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Pencil className="w-4 h-4 text-amber-500" /> Chỉnh sửa liên kết</h3>
                  <button onClick={() => setEditingLinkId(null)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tên liên kết *</label>
                    <input type="text" value={editLinkTitle} onChange={(e) => setEditLinkTitle(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-bold" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Đường dẫn URL *</label>
                    <input type="text" value={editLinkUrl} onChange={(e) => setEditLinkUrl(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Danh mục</label>
                    <select value={editLinkCategory} onChange={(e) => setEditLinkCategory(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold">
                      <option value="Học liệu số">Học liệu số</option>
                      <option value="Luyện tập & Đề thi">Luyện tập & Đề thi</option>
                      <option value="Trò chơi & Quiz">Trò chơi & Quiz</option>
                      <option value="Giáo án & Slide">Giáo án & Slide</option>
                      <option value="Video bài học">Video bài học</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Ảnh / Logo</label>
                    <div className="flex items-center gap-2">
                      <input type="text" placeholder="Dán link ảnh..." value={editLinkIconUrl} onChange={(e) => setEditLinkIconUrl(e.target.value)} className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono" />
                      <input ref={editLinkFileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleLinkIconFileUpload(e, 'edit')} />
                      <button type="button" onClick={() => editLinkFileInputRef.current?.click()} className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0"><Upload className="w-3 h-3" /><span>Tải lên</span></button>
                    </div>
                    {editLinkIconUrl && (
                      <div className="mt-2 flex items-center gap-2">
                        <img src={editLinkIconUrl} alt="preview" className="w-8 h-8 rounded-lg object-cover border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <button type="button" onClick={() => setEditLinkIconUrl('')} className="text-[12px] text-rose-600 font-bold hover:underline">Xóa ảnh</button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi chú</label>
                    <textarea rows={2} value={editLinkDescription} onChange={(e) => setEditLinkDescription(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs" />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setEditingLinkId(null)} className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl">Hủy</button>
                    <button type="button" onClick={handleSaveEditLink} className="px-4 py-2 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-xl shadow-xs flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /><span>Lưu thay đổi</span></button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS: CONFIGURATION, SLOT PICKER & CLEAR CONFIRMATION                   */}
      {/* ========================================================================= */}
      {/* Modal 0: Confirm Clear Timetable (Replaces window.confirm) */}
      {isClearConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-sky-900/20 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Xóa Trắng Thời Khóa Biểu?
                </h3>
                <p className="text-xs text-slate-500 font-semibold">
                  Lớp: <span className="text-rose-600 font-bold">{selectedClass?.name || '4A1'}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-rose-50/70 p-3.5 rounded-2xl border border-rose-100">
              Bạn có chắc chắn muốn xóa toàn bộ môn học trong thời khóa biểu của lớp này? Sau khi xóa các ô sẽ trở về trạng thái trống để bạn nhập mới từ đầu hoặc bấm nút <strong>"Nạp Mẫu Chuẩn Bộ GD"</strong>.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsClearConfirmOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmClearTimetable}
                className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20 transition-all hover-zoom-btn flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xác Nhận Xóa Trắng</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Timetable Configuration (cau hinh tkb1.jpg & cau hinh tbk.jpg) */}
      {isConfigOpen && (
        <TimetableConfigModal
          isOpen={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
          settings={displaySettings}
          onSave={handleSaveSettings}
          morningPeriods={timetableConfig.morningPeriods}
          afternoonPeriods={timetableConfig.afternoonPeriods}
          hasSaturday={timetableConfig.hasSaturday}
        />
      )}

      {/* Modal 2: Slot Subject Picker Popover */}
      {slotPickerState?.isOpen && (
        <TimetableSlotPickerModal
          isOpen={slotPickerState.isOpen}
          onClose={() => setSlotPickerState(null)}
          dayLabel={slotPickerState.dayLabel}
          session={slotPickerState.session}
          period={slotPickerState.period}
          currentValue={slotPickerState.currentValue}
          onSelect={handleSaveSlot}
          customSubjects={subjects}
        />
      )}
    </div>
  );
};
