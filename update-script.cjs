const fs = require('fs');
let content = fs.readFileSync('src/components/views/ClassesStudentsView.tsx', 'utf8');

// 1. Add imports
content = content.replace(
  /} from 'lucide-react';/g,
  '  Eye, BarChart3, Users2, User\n} from \'lucide-react\';'
);

// 2. Add isClassStatsModalOpen state
content = content.replace(
  '  const [isInitSubjectClassesModalOpen, setIsInitSubjectClassesModalOpen] = useState(false);',
  '  const [isClassStatsModalOpen, setIsClassStatsModalOpen] = useState(false);\n  const [isInitSubjectClassesModalOpen, setIsInitSubjectClassesModalOpen] = useState(false);'
);

// 3. Update 'Card 3' UI
const card3Regex = /\{\/\* Card 3: Thống kê nhanh sĩ số từng lớp \*\/\}([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*\{\/\* 🏫 BỘ LỌC/;
const card3Match = content.match(card3Regex);

if (card3Match) {
  const newCard3 = `{/* Card 3: Thống kê nhanh sĩ số từng lớp */}
            <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 rounded-2xl p-3 sm:p-3.5 text-white shadow-sm shadow-orange-500/20 hover-zoom-card flex flex-col justify-between h-full space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-amber-100 uppercase tracking-wider block">CHI TIẾT SĨ SỐ TỪNG LỚP</span>
                <div className="p-1.5 rounded-lg bg-white/20 backdrop-blur-md text-white font-black shadow-xs shrink-0">
                  <BarChart3 className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-center justify-between mt-auto pt-1">
                <div>
                  <div className="text-lg font-black text-white mt-1">Bảng Tổng Hợp</div>
                  <div className="text-[11px] text-amber-100 font-semibold">{statsHomeroomClasses.length} lớp học đang hoạt động</div>
                </div>
                <button
                  onClick={() => setIsClassStatsModalOpen(true)}
                  className="px-3 py-2 bg-white text-orange-600 hover:bg-orange-50 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md transition-all hover:-translate-y-0.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  XEM CHI TIẾT
                </button>
              </div>
            </div>
          </div>

          {/* 🏫 BỘ LỌC`;
  content = content.replace(card3Regex, newCard3);
}

// 4. Modify Create Class Modal layout
const createClassModalRegex = /\{\/\* Chọn Ảnh đại diện của lớp & Tải từ máy tính \(User Request 1\) \*\/\}/;
content = content.replace(
  /<div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-\[90vh\] overflow-y-auto">[\s\S]*?\{\/\* Chọn Ảnh đại diện của lớp & Tải từ máy tính \(User Request 1\) \*\/\}/,
  `<div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-4xl w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[95vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-indigo-100 shrink-0">
              <div>
                <h3 className="text-lg font-black text-indigo-950">Tạo Lớp Học Mới</h3>
                <p className="text-xs font-semibold text-indigo-600 mt-0.5">Vui lòng điền đầy đủ các thông tin tổ chức của lớp học</p>
              </div>
              <button 
                type="button"
                onClick={() => setIsCreateClassOpen(false)}
                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClass} className="flex-1 overflow-y-auto pr-2 pb-2 space-y-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
                
                {/* --- CỘT 1: THÔNG TIN CƠ BẢN --- */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                    <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                      <School className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wide">Thông tin cơ bản</span>
                  </div>

              {/* Chọn Ảnh đại diện của lớp & Tải từ máy tính (User Request 1) */}`
);

// We need to inject the start of column 2 just before 'Khối lớp & Năm học' which starts with <div className="grid grid-cols-2 gap-3">
// Wait, there are multiple "grid grid-cols-2 gap-3". We want the one right before "Khối lớp".
// Let's use a specific regex.
const beforeColumn2Regex = /<div className="grid grid-cols-2 gap-3">\s*<div>\s*<label className="block text-xs font-bold text-slate-700 mb-1">Khối lớp<\/label>/;
content = content.replace(
  beforeColumn2Regex,
  `</div> {/* END CỘT 1 */}

                {/* --- CỘT 2: TỔ CHỨC & BAN PHỤ HUYNH --- */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                    <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <Users2 className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wide">Tổ chức & Ban phụ huynh</span>
                  </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Khối lớp</label>`
);

// Close the form properly. It ends with `<div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">`
const formEndRegex = /<div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">\s*<button/;
content = content.replace(
  formEndRegex,
  `</div> {/* END CỘT 2 */}
              </div> {/* END GRID */}

              <div className="flex items-center justify-end gap-2 pt-4 mt-6 border-t border-slate-200 shrink-0">
                <button`
);

// 5. Add ClassStatsModal at the end
const endTag = '</ClassroomProvider>';
const modalCode = `
      {/* MODAL: Bảng Tổng Hợp Chi Tiết Sĩ Số Từng Lớp */}
      {isClassStatsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-sm">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Bảng Tổng Hợp Sĩ Số Lớp Học</h3>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">Chi tiết phân bổ học sinh theo từng lớp thực tế</p>
                </div>
              </div>
              <button 
                onClick={() => setIsClassStatsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto mt-4 pr-1 scrollbar-thin">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4 font-black text-slate-600 text-xs uppercase tracking-wider rounded-tl-xl rounded-bl-xl border-b border-slate-200">STT</th>
                    <th className="py-3 px-4 font-black text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">Tên Lớp Học</th>
                    <th className="py-3 px-4 font-black text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">Giáo Viên Chủ Nhiệm</th>
                    <th className="py-3 px-4 font-black text-slate-600 text-xs uppercase tracking-wider text-right rounded-tr-xl rounded-br-xl border-b border-slate-200">Sĩ Số</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statsHomeroomClasses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 font-medium italic text-sm">
                        Chưa có dữ liệu lớp học chủ nhiệm.
                      </td>
                    </tr>
                  ) : (
                    statsHomeroomClasses.map((c, idx) => {
                      const num = students.filter(s => s.classId === c.id).length;
                      return (
                        <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-4 text-slate-500 font-bold text-xs">
                            {(idx + 1).toString().padStart(2, '0')}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shadow-xs" style={{ backgroundColor: c.color || '#3B82F6' }} />
                              <span className="font-bold text-indigo-700">Lớp {c.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <User className="w-3 h-3" />
                              </div>
                              <span className="font-semibold text-slate-700">{c.teacherName || 'Chưa phân công'}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg font-black text-xs">
                              {num} Học Sinh
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="pt-4 pb-2 mt-2 border-t border-slate-100 flex justify-between items-center shrink-0">
              <div className="text-xs font-bold text-slate-500">
                Tổng số lớp: <span className="text-indigo-600">{statsHomeroomClasses.length}</span>
              </div>
              <div className="text-sm font-black text-slate-800">
                Tổng số học sinh toàn trường: <span className="text-emerald-600">{statsTotalStudents} Em</span>
              </div>
            </div>
          </div>
        </div>
      )}
`;

content = content.replace(endTag, modalCode + endTag);

fs.writeFileSync('src/components/views/ClassesStudentsView.tsx', content);
console.log('Success');
