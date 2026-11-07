import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useClassroom } from '../../../context/ClassroomContext';
import { Student } from '../../../types';
import { 
  BarChart3, Download, Printer, Award, Trophy, 
  Users, School, Star, Sparkles, Filter, Search, 
  CheckCircle2, ArrowRight, ChevronRight, TrendingUp,
  FileSpreadsheet, ExternalLink, Calendar, Hash
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playFanfareSound } from '../../../utils/audio';

export const SubjectTeacherReportsView: React.FC<{ onNavigate?: (view: any) => void }> = ({ onNavigate }) => {
  const { 
    classes, activeClassId, setActiveClassId, students, 
    transactions, subjectTeacherConfig, teacherProfile,
    seedSample20SubjectClasses
  } = useClassroom();

  const [reportSubTab, setReportSubTab] = useState<'classes_summary' | 'student_details' | 'top_performers'>('classes_summary');
  const [selectedReportClassId, setSelectedReportClassId] = useState<string>(activeClassId || (classes[0]?.id || ''));
  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');

  const subjectName = subjectTeacherConfig.subjectName || 'TIN HỌC';

  // Calculate statistics across all classes for this subject
  const classesStats = classes.map((cls, idx) => {
    const clsStudents = students.filter(s => s.classId === cls.id);
    const sumCoins = clsStudents.reduce((acc, st) => acc + (st.subjectPoints?.[subjectName] || 0), 0);
    const avgCoins = clsStudents.length > 0 ? (sumCoins / clsStudents.length).toFixed(1) : '0';
    
    // Transactions for this class in this subject
    const clsTxns = transactions.filter(t => t.classId === cls.id && (t.subjectName ? t.subjectName.toUpperCase() === subjectName.toUpperCase() : true));
    
    // Top student of class in this subject
    const sortedBySubject = [...clsStudents].sort((a, b) => {
      const pB = b.subjectPoints?.[subjectName] || 0;
      const pA = a.subjectPoints?.[subjectName] || 0;
      return pB - pA;
    });
    const topSt = sortedBySubject[0];

    return {
      index: idx + 1,
      id: cls.id,
      name: cls.name,
      grade: cls.grade,
      color: cls.color || '#4F46E5',
      teacherName: cls.teacherName || 'GVCN',
      studentCount: clsStudents.length,
      totalCoins: sumCoins,
      avgCoins: parseFloat(avgCoins),
      txnCount: clsTxns.length,
      topStudent: topSt ? {
        name: topSt.name,
        coins: topSt.subjectPoints?.[subjectName] || 0,
        avatar: topSt.avatar
      } : null
    };
  }).sort((a, b) => b.totalCoins - a.totalCoins);

  // Overall totals
  const totalStudentsAll = students.length;
  const totalCoinsAll = classesStats.reduce((acc, c) => acc + c.totalCoins, 0);
  const avgCoinsAll = totalStudentsAll > 0 ? (totalCoinsAll / totalStudentsAll).toFixed(1) : '0';
  const totalTxnsAll = transactions.filter(t => t.subjectName ? t.subjectName.toUpperCase() === subjectName.toUpperCase() : true).length;

  // Selected class students list
  const selectedClass = classes.find(c => c.id === selectedReportClassId) || classes[0];
  const selectedClassStudents = students
    .filter(s => s.classId === selectedReportClassId)
    .sort((a, b) => (b.subjectPoints?.[subjectName] || 0) - (a.subjectPoints?.[subjectName] || 0));

  // Top 20 students overall across all classes in this subject
  const top20StudentsOverall = [...students]
    .sort((a, b) => (b.subjectPoints?.[subjectName] || 0) - (a.subjectPoints?.[subjectName] || 0))
    .slice(0, 20);

  // Export Excel Function
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Tổng hợp các lớp
    const summaryRows: any[] = [];
    summaryRows.push(['BÁO CÁO TỔNG HỢP KẾT QUẢ THI ĐUA BỘ MÔN']);
    summaryRows.push([`Môn: ${subjectName}`, `Giáo viên: ${teacherProfile.name.toUpperCase()}`, `Trường: ${teacherProfile.schoolName}`]);
    summaryRows.push([`Năm học: ${teacherProfile.academicYear || '2026–2027'}`, `Thời gian xuất: ${new Date().toLocaleString('vi-VN')}`]);
    summaryRows.push([]);
    summaryRows.push(['Hạng', 'Tên Lớp', 'Khối', 'Sĩ số', `Tổng Sao/Xu (${subjectName})`, 'Điểm TB/HS', 'Số Lượt Đánh Giá', 'Học Sinh Dẫn Đầu Lớp', 'Số Xu HS Dẫn Đầu']);

    classesStats.forEach((c, idx) => {
      summaryRows.push([
        idx + 1,
        `Lớp ${c.name}`,
        c.grade,
        c.studentCount,
        c.totalCoins,
        c.avgCoins,
        c.txnCount,
        c.topStudent?.name || '---',
        c.topStudent?.coins || 0
      ]);
    });

    summaryRows.push([]);
    summaryRows.push(['TỔNG CỘNG', `${classes.length} LỚP`, '---', totalStudentsAll, totalCoinsAll, avgCoinsAll, totalTxnsAll]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Tong_Hop_20_Lop');

    // Sheet 2: Chi tiết học sinh theo từng lớp
    const detailRows: any[] = [];
    detailRows.push(['DANH SÁCH CHI TIẾT HỌC SINH THEO MÔN']);
    detailRows.push([`Lớp: ${selectedClass?.name || 'Toàn trường'}`, `Môn: ${subjectName}`]);
    detailRows.push([]);
    detailRows.push(['STT', 'Lớp', 'Họ và Tên', 'Giới tính', 'Tổ', `Số Xu Môn ${subjectName}`, 'Tổng Xu Tất Cả Môn', 'Xếp Loại']);

    selectedClassStudents.forEach((st, idx) => {
      const coins = st.subjectPoints?.[subjectName] || 0;
      let tier = 'Cần cố gắng';
      if (coins >= 30) tier = 'Xuất sắc';
      else if (coins >= 20) tier = 'Tốt';
      else if (coins >= 10) tier = 'Đạt';

      detailRows.push([
        idx + 1,
        selectedClass?.name,
        st.name,
        st.gender,
        st.group || '---',
        coins,
        st.points,
        tier
      ]);
    });

    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, wsDetail, `Chi_Tiet_Lop_${selectedClass?.name || 'All'}`);

    XLSX.writeFile(wb, `Bao_Cao_Tong_Hop_Bo_Mon_${subjectName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    confetti({ particleCount: 40, spread: 60 });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="p-6 md:p-7 rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-xl bg-white/20 backdrop-blur-md text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-2xs">
                <span>📊</span>
                <span>BÁO CÁO TỔNG HỢP CHI TIẾT</span>
              </span>
              <span className="px-3 py-1 rounded-xl bg-amber-400 text-amber-950 font-black text-xs uppercase tracking-wider shadow-2xs">
                MÔN: {subjectName}
              </span>
              <span className="px-3 py-1 rounded-xl bg-emerald-500/80 text-white font-bold text-xs uppercase tracking-wider">
                {classes.length} LỚP PHỤ TRÁCH
              </span>
            </div>

            <h1 className="text-xl md:text-2xl font-black tracking-tight uppercase flex items-center gap-2">
              <Trophy className="w-7 h-7 text-amber-300" />
              <span>BÁO CÁO THỐNG KÊ THI ĐUA VÀ TÍCH XU BỘ MÔN</span>
            </h1>

            <p className="text-xs md:text-sm text-emerald-100 max-w-2xl font-medium leading-relaxed">
              Tổng hợp chi tiết kết quả khen thưởng sao thi đua và điểm xu của tất cả các lớp giảng dạy, so sánh xếp hạng các lớp, tra cứu học sinh theo lớp và xuất file Excel hoàn chỉnh.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleExportExcel}
              className="px-4 py-2.5 rounded-2xl bg-white text-emerald-950 hover:bg-emerald-50 font-black text-xs transition-all flex items-center gap-2 shadow-md hover-zoom-btn uppercase"
            >
              <Download className="w-4 h-4 text-emerald-700" />
              <span>Xuất Excel (.xlsx)</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-2xl bg-white/20 hover:bg-white/30 text-white font-black text-xs transition-all flex items-center gap-2 hover-zoom-btn border border-white/20 uppercase"
            >
              <Printer className="w-4 h-4" />
              <span>In Báo Cáo A4</span>
            </button>
          </div>
        </div>

        {/* 4 Summary KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-white/15">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/15 text-center">
            <div className="text-2xl font-black text-amber-300">{classes.length}</div>
            <div className="text-[10px] font-bold text-white/90 uppercase mt-0.5">Lớp Phụ Trách</div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/15 text-center">
            <div className="text-2xl font-black text-white">{totalStudentsAll}</div>
            <div className="text-[10px] font-bold text-white/90 uppercase mt-0.5">Tổng Học Sinh Dạy</div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/15 text-center">
            <div className="text-2xl font-black text-emerald-300">⭐ {totalCoinsAll}</div>
            <div className="text-[10px] font-bold text-white/90 uppercase mt-0.5">Tổng Sao/Xu Đã Trao</div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/15 text-center">
            <div className="text-2xl font-black text-white">{avgCoinsAll}</div>
            <div className="text-[10px] font-bold text-white/90 uppercase mt-0.5">Điểm TB / Học Sinh</div>
          </div>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setReportSubTab('classes_summary')}
            className={`px-3.5 py-2 rounded-lg font-black text-xs uppercase transition-all flex items-center gap-1.5 ${
              reportSubTab === 'classes_summary'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <School className="w-3.5 h-3.5" />
            <span>TỔNG HỢP {classes.length} LỚP DẠY</span>
          </button>

          <button
            onClick={() => setReportSubTab('student_details')}
            className={`px-3.5 py-2 rounded-lg font-black text-xs uppercase transition-all flex items-center gap-1.5 ${
              reportSubTab === 'student_details'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>CHI TIẾT THEO TỪNG LỚP</span>
          </button>

          <button
            onClick={() => setReportSubTab('top_performers')}
            className={`px-3.5 py-2 rounded-lg font-black text-xs uppercase transition-all flex items-center gap-1.5 ${
              reportSubTab === 'top_performers'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>TOP 20 XUẤT SẮC TOÀN TRƯỜNG</span>
          </button>
        </div>

        {classes.length < 5 && (
          <button
            onClick={() => {
              seedSample20SubjectClasses();
              playFanfareSound();
              confetti({ particleCount: 50, spread: 60 });
            }}
            className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 font-black text-xs uppercase flex items-center gap-1.5 shadow-2xs hover-zoom-btn"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Nạp Mẫu 20 Lớp Để Xem Báo Cáo</span>
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: BẢNG TỔNG HỢP TẤT CẢ CÁC LỚP PHỤ TRÁCH (20 LỚP)                    */}
      {/* ========================================================================= */}
      {reportSubTab === 'classes_summary' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden space-y-4 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase flex items-center gap-2">
                <School className="w-5 h-5 text-indigo-600" />
                <span>BẢNG XẾP HẠNG THI ĐUA VÀ TỔNG HỢP {classesStats.length} LỚP MÔN {subjectName}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Sắp xếp theo thứ tự tổng số sao/xu tích lũy từ cao xuống thấp
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Khối lớp:</span>
              <select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold bg-white text-slate-800"
              >
                <option value="all">TẤT CẢ CÁC KHỐI</option>
                <option value="Khối 1">Khối 1</option>
                <option value="Khối 2">Khối 2</option>
                <option value="Khối 3">Khối 3</option>
                <option value="Khối 4">Khối 4</option>
                <option value="Khối 5">Khối 5</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-xs font-black uppercase border-b border-slate-200">
                  <th className="py-3 px-3 text-center w-14">Hạng</th>
                  <th className="py-3 px-4">Lớp Học</th>
                  <th className="py-3 px-3 text-center">Khối</th>
                  <th className="py-3 px-3 text-center">Sĩ Số</th>
                  <th className="py-3 px-4 text-center">Tổng Sao/Xu Môn</th>
                  <th className="py-3 px-3 text-center">Điểm TB / HS</th>
                  <th className="py-3 px-4">Học Sinh Dẫn Đầu Lớp</th>
                  <th className="py-3 px-3 text-center">Thao Tác</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-xs">
                {classesStats
                  .filter(c => gradeFilter === 'all' || c.grade === gradeFilter)
                  .map((cls, idx) => {
                    const isTop3 = idx < 3;
                    const medals = ['🥇', '🥈', '🥉'];
                    return (
                      <tr key={cls.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3 text-center font-black">
                          {isTop3 ? (
                            <span className="text-base" title={`Hạng ${idx + 1}`}>{medals[idx]}</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-bold">{idx + 1}</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cls.color }} />
                            <div>
                              <div className="font-black text-slate-900 text-sm">Lớp {cls.name}</div>
                              <div className="text-[10px] text-slate-400 font-medium">{cls.teacherName}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center font-bold text-slate-600">
                          {cls.grade}
                        </td>

                        <td className="py-3 px-3 text-center font-bold text-slate-800">
                          {cls.studentCount} HS
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 font-black">
                            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                            <span>{cls.totalCoins} xu</span>
                          </span>
                        </td>

                        <td className="py-3 px-3 text-center font-mono font-bold text-indigo-700">
                          {cls.avgCoins} xu/em
                        </td>

                        <td className="py-3 px-4">
                          {cls.topStudent ? (
                            <div className="flex items-center gap-2">
                              <img 
                                src={cls.topStudent.avatar} 
                                alt="" 
                                className="w-6 h-6 rounded-full bg-slate-100" 
                              />
                              <span className="font-extrabold text-slate-800 truncate max-w-[130px]">
                                {cls.topStudent.name}
                              </span>
                              <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded">
                                ⭐ {cls.topStudent.coins}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Chưa có điểm</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedReportClassId(cls.id);
                                setReportSubTab('student_details');
                              }}
                              className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black text-[10px] uppercase transition-colors"
                              title="Xem danh sách điểm từng học sinh lớp này"
                            >
                              Chi tiết
                            </button>
                            <button
                              onClick={() => {
                                setActiveClassId(cls.id);
                                if (onNavigate) onNavigate('students');
                              }}
                              className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase transition-colors"
                              title="Chuyển sang chấm sao cho lớp này"
                            >
                              Chấm điểm
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: BÁO CÁO CHI TIẾT TỪNG HỌC SINH THEO LỚP ĐƯỢC CHỌN                   */}
      {/* ========================================================================= */}
      {reportSubTab === 'student_details' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <span>DANH SÁCH HỌC SINH LỚP {selectedClass?.name} – MÔN {subjectName}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Bảng điểm chi tiết từng học sinh trong lớp được chọn
              </p>
            </div>

            {/* Class Selector Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Chọn lớp:</span>
              <select
                value={selectedReportClassId}
                onChange={(e) => setSelectedReportClassId(e.target.value)}
                className="px-3.5 py-1.5 rounded-xl border border-indigo-200 text-xs font-black bg-indigo-50/60 text-indigo-900 uppercase"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    Lớp {c.name} ({c.grade})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Filter Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm học sinh theo họ tên..."
              className="w-full pl-10 pr-4 py-2 rounded-2xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-200 font-bold"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-xs font-black uppercase border-b border-slate-200">
                  <th className="py-3 px-3 text-center w-14">STT</th>
                  <th className="py-3 px-4">Học Sinh</th>
                  <th className="py-3 px-3 text-center">Giới Tính</th>
                  <th className="py-3 px-3 text-center">Tổ</th>
                  <th className="py-3 px-3 text-center">Chức Vụ</th>
                  <th className="py-3 px-4 text-center">Xu Môn {subjectName}</th>
                  <th className="py-3 px-4 text-center">Tổng Xu Tất Cả</th>
                  <th className="py-3 px-4 text-center">Xếp Loại Thi Đua</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-xs">
                {selectedClassStudents
                  .filter(s => !searchTerm || s.name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((st, idx) => {
                    const subjectCoins = st.subjectPoints?.[subjectName] || 0;
                    let tier = 'Cần cố gắng';
                    let tierColor = 'bg-slate-100 text-slate-700';

                    if (subjectCoins >= 30) {
                      tier = 'Xuất sắc';
                      tierColor = 'bg-amber-100 text-amber-900 border border-amber-300 font-black';
                    } else if (subjectCoins >= 20) {
                      tier = 'Tốt';
                      tierColor = 'bg-emerald-100 text-emerald-900 font-bold';
                    } else if (subjectCoins >= 10) {
                      tier = 'Đạt';
                      tierColor = 'bg-blue-100 text-blue-900';
                    }

                    return (
                      <tr key={st.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3 text-center font-bold text-slate-500">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <img src={st.avatar} alt="" className="w-7 h-7 rounded-full bg-slate-100 object-cover" />
                            <div>
                              <div className="font-black text-slate-900 text-xs">{st.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{st.birthDate || '---'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-slate-600">
                          {st.gender}
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-slate-600">
                          {st.group || '---'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {st.role ? (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase">
                              {st.role.split('•')[0]}
                            </span>
                          ) : <span className="text-slate-300">---</span>}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 font-black">
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                            <span>{subjectCoins} xu</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-600">
                          {st.points} xu
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] uppercase ${tierColor}`}>
                            {tier}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: TOP 20 HỌC SINH XUẤT SẮC TOÀN TRƯỜNG TRONG MÔN HỌC                 */}
      {/* ========================================================================= */}
      {reportSubTab === 'top_performers' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 space-y-4">
          <div>
            <h3 className="text-base font-black text-slate-900 uppercase flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              <span>BẢNG VÀNG: TOP 20 HỌC SINH XUẤT SẮC NHẤT MÔN {subjectName}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Vinh danh những học sinh tích lũy được nhiều sao và xu nhất trên toàn bộ {classes.length} lớp giảng dạy
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 pt-2">
            {top20StudentsOverall.map((st, idx) => {
              const matchingClass = classes.find(c => c.id === st.classId);
              const coins = st.subjectPoints?.[subjectName] || 0;
              const isTop3 = idx < 3;
              const medals = ['🥇 QUÁN QUÂN', '🥈 Á QUÂN', '🥉 QUÝ QUÂN'];

              return (
                <div
                  key={st.id}
                  className={`p-4 rounded-3xl border transition-all hover-zoom-card flex flex-col justify-between ${
                    isTop3
                      ? 'bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 border-amber-300 shadow-md ring-2 ring-amber-200'
                      : 'bg-slate-50/70 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      isTop3 ? 'bg-amber-400 text-amber-950' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {isTop3 ? medals[idx] : `HẠNG ${idx + 1}`}
                    </span>
                    <span 
                      className="px-2 py-0.5 rounded-md text-[10px] font-black text-white uppercase shadow-2xs"
                      style={{ backgroundColor: matchingClass?.color || '#4F46E5' }}
                    >
                      {matchingClass?.name || 'LỚP'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 my-2">
                    <img 
                      src={st.avatar} 
                      alt="" 
                      className="w-12 h-12 rounded-2xl bg-white shadow-2xs object-cover ring-2 ring-white" 
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-900 uppercase truncate">{st.name}</div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                        {matchingClass?.grade} • {st.group || 'Tổ 1'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Sao bộ môn:</span>
                    <span className="text-xs font-black text-amber-700 flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      <span>{coins} XU</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
