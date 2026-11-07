import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Student, Classroom, TeacherProfile } from '../../types';
import { 
  X, Download, Printer, FileSpreadsheet, Check, 
  Users, Award, Calendar, Sparkles, Filter, Eye
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { exportElementToPdf, downloadPrintableHtml } from '../../utils/printHelper';

interface ExportStudentListModalProps {
  isOpen: boolean;
  onClose: () => void;
  classroom: Classroom;
  students: Student[];
  teacherProfile: TeacherProfile;
}

export const ExportStudentListModal: React.FC<ExportStudentListModalProps> = ({
  isOpen,
  onClose,
  classroom,
  students,
  teacherProfile
}) => {
  const [exportType, setExportType] = useState<'admin' | 'full' | 'attendance'>('full');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [includeDate, setIncludeDate] = useState(true);
  const [includeSignBlock, setIncludeSignBlock] = useState(true);
  const [customTitle, setCustomTitle] = useState(`DANH SÁCH HỌC SINH LỚP ${classroom.name.toUpperCase()}`);
  const [customSchool, setCustomSchool] = useState(teacherProfile.schoolName || 'Trường Tiểu học');
  const [customTeacher, setCustomTeacher] = useState(classroom.teacherName || teacherProfile.name || '');
  const [customYear, setCustomYear] = useState(classroom.academicYear || teacherProfile.academicYear || '2026 - 2027');
  const [isPreviewPrintOpen, setIsPreviewPrintOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const filteredStudents = students.filter(s => {
    if (selectedGroupFilter !== 'all' && (s.group || 'Tổ 1') !== selectedGroupFilter) return false;
    return true;
  }).sort((a, b) => a.stt - b.stt);

  const maleCount = filteredStudents.filter(s => s.gender === 'Nam').length;
  const femaleCount = filteredStudents.filter(s => s.gender === 'Nữ').length;

  const handleExportExcel = () => {
    // 1. Build header rows
    const today = new Date();
    const dateFormatted = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    const rows: any[] = [];

    // Metadata lines
    rows.push({ 'A': customSchool.toUpperCase(), 'B': '', 'C': '', 'D': '', 'E': '', 'F': `NĂM HỌC: ${customYear}` });
    rows.push({ 'A': `LỚP: ${classroom.name}`, 'B': '', 'C': '', 'D': '', 'E': '', 'F': `GVCN: ${customTeacher}` });
    rows.push({ 'A': customTitle, 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' });
    rows.push({ 'A': `Sĩ số: ${filteredStudents.length} học sinh (Nam: ${maleCount} - Nữ: ${femaleCount})`, 'B': '', 'C': '', 'D': '', 'E': '', 'F': `Ngày xuất: ${dateFormatted}` });
    rows.push({}); // Empty blank line

    // Table data based on exportType
    if (exportType === 'admin') {
      filteredStudents.forEach((st, idx) => {
        rows.push({
          'STT': idx + 1,
          'Mã Học Sinh': `HS-${st.stt < 10 ? '0' + st.stt : st.stt}`,
          'Họ và tên': st.name,
          'Ngày tháng năm sinh': st.birthDate || 'Chưa cập nhật',
          'Giới tính': st.gender,
          'Tổ': st.group || 'Tổ 1',
          'Ghi chú': ''
        });
      });
    } else if (exportType === 'full') {
      filteredStudents.forEach((st, idx) => {
        rows.push({
          'STT': idx + 1,
          'Mã Học Sinh': `HS-${st.stt < 10 ? '0' + st.stt : st.stt}`,
          'Họ và tên': st.name,
          'Ngày tháng năm sinh': st.birthDate || 'Chưa cập nhật',
          'Giới tính': st.gender,
          'Tổ': st.group || 'Tổ 1',
          'Xu Thưởng Tích Lũy': st.points || 0,
          'Sao Vinh Danh': Math.floor((st.points || 0) / 10),
          'Ghi chú': ''
        });
      });
    } else {
      // Attendance & Signature tracker
      filteredStudents.forEach((st, idx) => {
        rows.push({
          'STT': idx + 1,
          'Họ và tên': st.name,
          'Ngày sinh': st.birthDate || '',
          'Giới tính': st.gender,
          'Tổ': st.group || 'Tổ 1',
          'Thứ Hai': '',
          'Thứ Ba': '',
          'Thứ Tư': '',
          'Thứ Năm': '',
          'Thứ Sáu': '',
          'Ký nhận / Ghi chú': ''
        });
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: true });

    // Auto column widths
    if (exportType === 'admin') {
      ws['!cols'] = [
        { wch: 8 },  // STT
        { wch: 14 }, // Mã HS
        { wch: 28 }, // Họ và tên
        { wch: 22 }, // Ngày tháng năm sinh
        { wch: 12 }, // Giới tính
        { wch: 12 }, // Tổ
        { wch: 25 }  // Ghi chú
      ];
    } else if (exportType === 'full') {
      ws['!cols'] = [
        { wch: 8 },  // STT
        { wch: 14 }, // Mã HS
        { wch: 28 }, // Họ và tên
        { wch: 22 }, // Ngày tháng năm sinh
        { wch: 12 }, // Giới tính
        { wch: 12 }, // Tổ
        { wch: 18 }, // Xu thưởng
        { wch: 16 }, // Sao vinh danh
        { wch: 25 }  // Ghi chú
      ];
    } else {
      ws['!cols'] = [
        { wch: 6 },  // STT
        { wch: 26 }, // Họ tên
        { wch: 14 }, // Ngày sinh
        { wch: 10 }, // Giới tính
        { wch: 10 }, // Tổ
        { wch: 10 }, // T2
        { wch: 10 }, // T3
        { wch: 10 }, // T4
        { wch: 10 }, // T5
        { wch: 10 }, // T6
        { wch: 20 }  // Ký nhận
      ];
    }

    const wb = XLSX.utils.book_new();
    const sheetName = `Lop_${classroom.name}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const fileName = `Danh_Sach_Hoc_Sinh_Lop_${classroom.name.replace(/\s+/g, '_')}_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.xlsx`;
    XLSX.writeFile(wb, fileName);

    confetti({ particleCount: 45, spread: 60, origin: { y: 0.7 } });
  };

  const handlePrint = async () => {
    try {
      setIsExportingPdf(true);
      const fileName = `Danh_Sach_${classroom.name.replace(/\s+/g, '_')}_A4.pdf`;
      const title = `${customTitle} - Lớp ${classroom.name}`;
      const ok = await exportElementToPdf('printable-student-list', fileName, 'portrait', title);
      if (ok) {
        confetti({ particleCount: 30, spread: 50 });
      }
    } catch (err) {
      console.error('Lỗi khi xuất PDF danh sách:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-indigo-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shadow-inner">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Xuất Danh Sách Học Sinh</h2>
              <p className="text-xs text-emerald-100 font-semibold">
                Lớp <span className="text-amber-300 font-black">{classroom.name}</span> • Sĩ số: {filteredStudents.length} học sinh
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors hover-zoom-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Options Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Format choice 1: Standard Full */}
            <div 
              onClick={() => setExportType('full')}
              className={`p-4 rounded-2xl border-2 cursor-pointer transition-all hover-zoom-card ${
                exportType === 'full' 
                  ? 'border-emerald-500 bg-emerald-50/60 shadow-md ring-2 ring-emerald-500/20' 
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center">
                  <Award className="w-4 h-4" />
                </span>
                {exportType === 'full' && (
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                )}
              </div>
              <h4 className="text-sm font-black text-slate-800">Danh Sách Kèm Điểm & Sao</h4>
              <p className="text-xs text-slate-500 mt-1">
                Bao gồm STT, Họ tên, Ngày sinh, Giới tính, Tổ, Điểm xu tích lũy và Sao vinh danh.
              </p>
            </div>

            {/* Format choice 2: Administrative */}
            <div 
              onClick={() => setExportType('admin')}
              className={`p-4 rounded-2xl border-2 cursor-pointer transition-all hover-zoom-card ${
                exportType === 'admin' 
                  ? 'border-indigo-500 bg-indigo-50/60 shadow-md ring-2 ring-indigo-500/20' 
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </span>
                {exportType === 'admin' && (
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                )}
              </div>
              <h4 className="text-sm font-black text-slate-800">Sơ Yếu Lý Lịch Chuẩn</h4>
              <p className="text-xs text-slate-500 mt-1">
                Bản hành chính nộp nhà trường: STT, Mã HS, Họ và tên, Ngày tháng năm sinh, Giới tính, Tổ.
              </p>
            </div>

            {/* Format choice 3: Attendance tracker */}
            <div 
              onClick={() => setExportType('attendance')}
              className={`p-4 rounded-2xl border-2 cursor-pointer transition-all hover-zoom-card ${
                exportType === 'attendance' 
                  ? 'border-amber-500 bg-amber-50/60 shadow-md ring-2 ring-amber-500/20' 
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 font-bold flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </span>
                {exportType === 'attendance' && (
                  <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                )}
              </div>
              <h4 className="text-sm font-black text-slate-800">Mẫu Điểm Danh & Ký Nhận</h4>
              <p className="text-xs text-slate-500 mt-1">
                Bao gồm Họ tên, Ngày sinh và các cột theo dõi Thứ 2 đến Thứ 6 để giáo viên đánh dấu ký tên.
              </p>
            </div>
          </div>

          {/* Filter & Customization Controls */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-4 text-xs">
            <h4 className="font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Filter className="w-4 h-4 text-indigo-600" />
              <span>Tùy chỉnh thông tin xuất và in ấn</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Lọc theo Tổ:</label>
                <select
                  value={selectedGroupFilter}
                  onChange={(e) => setSelectedGroupFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Tất cả các Tổ ({students.length} em)</option>
                  <option value="Tổ 1">Tổ 1</option>
                  <option value="Tổ 2">Tổ 2</option>
                  <option value="Tổ 3">Tổ 3</option>
                  <option value="Tổ 4">Tổ 4</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Tên trường học:</label>
                <input
                  type="text"
                  value={customSchool}
                  onChange={(e) => setCustomSchool(e.target.value)}
                  placeholder="Trường Tiểu học..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Giáo viên chủ nhiệm:</label>
                <input
                  type="text"
                  value={customTeacher}
                  onChange={(e) => setCustomTeacher(e.target.value)}
                  placeholder="Thầy/Cô..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Năm học:</label>
                <input
                  type="text"
                  value={customYear}
                  onChange={(e) => setCustomYear(e.target.value)}
                  placeholder="2026 - 2027"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Table Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">
                Xem trước danh sách ({filteredStudents.length} học sinh • {maleCount} Nam, {femaleCount} Nữ):
              </span>
              <button
                onClick={() => setIsPreviewPrintOpen(!isPreviewPrintOpen)}
                className="text-indigo-600 hover:text-indigo-800 font-bold underline"
              >
                {isPreviewPrintOpen ? 'Thu gọn xem trước' : 'Xem dạng bản in A4'}
              </button>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-12">STT</th>
                    <th className="py-2.5 px-3">Họ và tên</th>
                    <th className="py-2.5 px-3 text-center">Ngày sinh</th>
                    <th className="py-2.5 px-3 text-center">Giới tính</th>
                    <th className="py-2.5 px-3 text-center">Tổ</th>
                    {exportType === 'full' && (
                      <>
                        <th className="py-2.5 px-3 text-center text-amber-700">Điểm Xu</th>
                        <th className="py-2.5 px-3 text-center text-indigo-700">Sao</th>
                      </>
                    )}
                    {exportType === 'attendance' && (
                      <th className="py-2.5 px-3 text-center">Ghi chú chuyên cần</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((st, i) => (
                    <tr key={st.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-center font-bold text-slate-500">{i + 1}</td>
                      <td className="py-2 px-3 font-bold text-slate-800">{st.name}</td>
                      <td className="py-2 px-3 text-center font-mono text-slate-600">{st.birthDate || '—'}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${st.gender === 'Nam' ? 'bg-sky-50 text-sky-700' : 'bg-pink-50 text-pink-700'}`}>
                          {st.gender}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center text-slate-600 font-semibold">{st.group || 'Tổ 1'}</td>
                      {exportType === 'full' && (
                        <>
                          <td className="py-2 px-3 text-center font-black text-amber-600 font-mono">
                            🪙 {st.points || 0}
                          </td>
                          <td className="py-2 px-3 text-center font-black text-indigo-600 font-mono">
                            ⭐ {Math.floor((st.points || 0) / 10)}
                          </td>
                        </>
                      )}
                      {exportType === 'attendance' && (
                        <td className="py-2 px-3 text-center text-slate-400">........................</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Printable Preview Block (Always in DOM for reliable printing) */}
          <div className={`p-6 bg-white border-2 border-dashed border-slate-300 rounded-2xl space-y-4 ${isPreviewPrintOpen ? 'block' : 'hidden print:block'}`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <span className="text-xs font-black text-slate-700 uppercase">Mẫu hiển thị khi in ấn (Khổ A4)</span>
              <span className="text-[11px] text-slate-500">Chuẩn mực sư phạm, tự động căn chỉnh lề</span>
            </div>

            <div id="printable-student-list" ref={printAreaRef} className="space-y-4 text-slate-900 bg-white p-4">
                {/* Print Title Header */}
                <div className="grid grid-cols-2 text-xs font-bold leading-relaxed">
                  <div>
                    <p className="uppercase">{customSchool}</p>
                    <p>LỚP: {classroom.name.toUpperCase()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                    <p className="italic font-normal">Độc lập - Tự do - Hạnh phúc</p>
                  </div>
                </div>

                <div className="text-center pt-2 pb-1">
                  <h3 className="text-base font-black tracking-wide uppercase">{customTitle}</h3>
                  <p className="text-xs italic text-slate-700 mt-0.5">
                    Năm học: {customYear} • Sĩ số: {filteredStudents.length} học sinh (Nam: {maleCount}, Nữ: {femaleCount})
                  </p>
                </div>

                {/* Printable Table */}
                <table className="w-full text-xs border-collapse border border-slate-400">
                  <thead>
                    <tr className="bg-slate-100 border border-slate-400 text-center font-bold">
                      <th className="border border-slate-400 py-1.5 px-2 w-10">STT</th>
                      <th className="border border-slate-400 py-1.5 px-3 text-left">Họ và tên</th>
                      <th className="border border-slate-400 py-1.5 px-2 w-24">Ngày sinh</th>
                      <th className="border border-slate-400 py-1.5 px-2 w-14">Giới tính</th>
                      <th className="border border-slate-400 py-1.5 px-2 w-16">Tổ</th>
                      {exportType === 'full' ? (
                        <>
                          <th className="border border-slate-400 py-1.5 px-2 w-18">Điểm Xu</th>
                          <th className="border border-slate-400 py-1.5 px-2 w-16">Sao</th>
                          <th className="border border-slate-400 py-1.5 px-2 w-28">Ghi chú</th>
                        </>
                      ) : exportType === 'attendance' ? (
                        <>
                          <th className="border border-slate-400 py-1.5 px-2 w-12">T2</th>
                          <th className="border border-slate-400 py-1.5 px-2 w-12">T3</th>
                          <th className="border border-slate-400 py-1.5 px-2 w-12">T4</th>
                          <th className="border border-slate-400 py-1.5 px-2 w-12">T5</th>
                          <th className="border border-slate-400 py-1.5 px-2 w-12">T6</th>
                          <th className="border border-slate-400 py-1.5 px-2 w-24">Ký nhận</th>
                        </>
                      ) : (
                        <th className="border border-slate-400 py-1.5 px-2 w-36">Ghi chú</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((st, i) => (
                      <tr key={st.id} className="border border-slate-400">
                        <td className="border border-slate-400 py-1.5 px-2 text-center font-medium">{i + 1}</td>
                        <td className="border border-slate-400 py-1.5 px-3 font-semibold">{st.name}</td>
                        <td className="border border-slate-400 py-1.5 px-2 text-center">{st.birthDate || ''}</td>
                        <td className="border border-slate-400 py-1.5 px-2 text-center">{st.gender}</td>
                        <td className="border border-slate-400 py-1.5 px-2 text-center">{st.group || 'Tổ 1'}</td>
                        {exportType === 'full' ? (
                          <>
                            <td className="border border-slate-400 py-1.5 px-2 text-center font-bold">{st.points || 0}</td>
                            <td className="border border-slate-400 py-1.5 px-2 text-center font-bold">{Math.floor((st.points || 0) / 10)}</td>
                            <td className="border border-slate-400 py-1.5 px-2"></td>
                          </>
                        ) : exportType === 'attendance' ? (
                          <>
                            <td className="border border-slate-400 py-1.5 px-2"></td>
                            <td className="border border-slate-400 py-1.5 px-2"></td>
                            <td className="border border-slate-400 py-1.5 px-2"></td>
                            <td className="border border-slate-400 py-1.5 px-2"></td>
                            <td className="border border-slate-400 py-1.5 px-2"></td>
                            <td className="border border-slate-400 py-1.5 px-2"></td>
                          </>
                        ) : (
                          <td className="border border-slate-400 py-1.5 px-2"></td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Signature footer */}
                <div className="pt-6 grid grid-cols-2 text-xs">
                  <div></div>
                  <div className="text-center space-y-1">
                    <p className="italic">
                      ......., ngày {new Date().getDate()} tháng {new Date().getMonth() + 1} năm {new Date().getFullYear()}
                    </p>
                    <p className="font-bold uppercase">GIÁO VIÊN CHỦ NHIỆM</p>
                    <p className="text-[11px] italic text-slate-500">(Ký và ghi rõ họ tên)</p>
                    <div className="h-16"></div>
                    <p className="font-bold text-slate-800">{customTeacher}</p>
                  </div>
                </div>
              </div>
            </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 font-medium">
            Tùy chọn tải về dạng Excel (.xlsx) hoặc In trực tiếp ra giấy A4
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => downloadPrintableHtml('printable-student-list', `Danh_Sach_${classroom.name}_A4.html`, `${customTitle} - Lớp ${classroom.name}`)}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all hover-zoom-btn"
              title="Tải file HTML chuẩn A4 để mở in bất kỳ lúc nào"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Tải HTML A4</span>
            </button>

            <button
              onClick={handlePrint}
              disabled={isExportingPdf}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all hover-zoom-btn shadow-md shadow-indigo-600/20 disabled:opacity-50"
              title="Xuất file danh sách học sinh ra file PDF chuẩn khổ A4"
            >
              <Download className="w-4 h-4 text-white" />
              <span>{isExportingPdf ? 'Đang xuất PDF...' : 'Xuất File In PDF (A4)'}</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black flex items-center gap-2 transition-all hover-zoom-btn shadow-md shadow-emerald-600/25"
            >
              <Download className="w-4 h-4" />
              <span>Tải File Excel (.xlsx)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
