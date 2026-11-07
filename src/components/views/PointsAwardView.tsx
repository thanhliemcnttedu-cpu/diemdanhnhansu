import React, { useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { 
  Award, PlusCircle, MinusCircle, Check, 
  Search, BookOpen, Clock, Plus, Filter, Sparkles, ShieldAlert
} from 'lucide-react';
import { handleAvatarImgError } from '../../utils/avatarConfig';

export const PointsAwardView: React.FC = () => {
  const { 
    currentClassStudents, criteria, addCriterion, 
    subjects, addSubject, awardPoints, deductPoints, 
    transactions, activeClassId, teacherRole, subjectTeacherConfig,
    canEvaluateEmulation, canConfigureCoinSubjects
  } = useClassroom();

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedCriterionId, setSelectedCriterionId] = useState<string>(criteria[0]?.id || '');
  const [customAmount, setCustomAmount] = useState<number>(3);
  const [customReason, setCustomReason] = useState<string>('Phát biểu xây dựng bài sôi nổi');
  
  // Subject filter
  const [isBySubject, setIsBySubject] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string>(
    teacherRole === 'subject' ? (subjectTeacherConfig.subjectName || 'TIN HỌC') : (subjects[0]?.name || 'GHI CHUNG / NỀ NẾP')
  );
  const [newSubjectName, setNewSubjectName] = useState('');
  const [isAddingSubject, setIsAddingSubject] = useState(false);

  // Criteria creation
  const [isAddingCriterion, setIsAddingCriterion] = useState(false);
  const [newCritTitle, setNewCritTitle] = useState('');
  const [newCritPoints, setNewCritPoints] = useState(3);
  const [newCritType, setNewCritType] = useState<'positive' | 'negative'>('positive');

  // Search in student list
  const [searchQuery, setSearchQuery] = useState('');

  const toggleStudentSelection = (id: string) => {
    setSelectedStudentIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedStudentIds.length === currentClassStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(currentClassStudents.map(s => s.id));
    }
  };

  const handleSelectCriterion = (critId: string) => {
    setSelectedCriterionId(critId);
    const crit = criteria.find(c => c.id === critId);
    if (crit) {
      setCustomAmount(Math.abs(crit.points));
      setCustomReason(crit.title);
    }
  };

  const handleExecuteAward = () => {
    if (!canEvaluateEmulation) return;
    if (selectedStudentIds.length === 0 || customAmount <= 0) return;
    const subName = isBySubject ? selectedSubject : undefined;
    awardPoints(selectedStudentIds, customAmount, customReason, subName);
    setSelectedStudentIds([]);
  };

  const handleExecuteDeduct = () => {
    if (!canEvaluateEmulation) return;
    if (selectedStudentIds.length === 0 || customAmount <= 0) return;
    const subName = isBySubject ? selectedSubject : undefined;
    deductPoints(selectedStudentIds, customAmount, customReason, subName);
    setSelectedStudentIds([]);
  };

  const handleCreateSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canConfigureCoinSubjects) return;
    if (!newSubjectName.trim()) return;
    addSubject(newSubjectName.trim());
    setSelectedSubject(newSubjectName.trim());
    setNewSubjectName('');
    setIsAddingSubject(false);
  };

  const handleCreateCriterion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCritTitle.trim()) return;
    addCriterion({
      title: newCritTitle.trim(),
      points: newCritType === 'positive' ? Math.abs(newCritPoints) : -Math.abs(newCritPoints),
      type: newCritType,
      category: 'Tự thiết lập'
    });
    setNewCritTitle('');
    setIsAddingCriterion(false);
  };

  const filteredStudents = currentClassStudents.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.stt.toString().includes(searchQuery)
  );

  const recentTransactions = transactions.filter(t => t.classId === activeClassId).slice(0, 10);

  return (
    <div className="p-2.5 sm:p-3.5 md:p-4 max-w-7xl mx-auto space-y-2.5 sm:space-y-3">
      {/* Thông báo phân quyền BGH / Quản trị nhà trường */}
      {!canEvaluateEmulation && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3.5 sm:p-4 flex items-start gap-3 text-amber-900 shadow-xs">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs sm:text-sm font-black uppercase tracking-tight">
              Chế độ Giám Sát / Theo Dõi Lịch Sử (Ban Giám Hiệu & Quản Trị Nhà Trường)
            </h4>
            <p className="text-xs text-amber-800 font-medium mt-1 leading-relaxed">
              Để đảm bảo tôn trọng quyền chủ động của Giáo viên chủ nhiệm, tài khoản Ban Giám Hiệu và Quản trị nhà trường không có quyền đánh giá, cộng trừ điểm thi đua của học sinh. Thầy cô có thể theo dõi danh sách, tổng xu và lịch sử ghi nhận thi đua tại đây.
            </p>
          </div>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            <h2 className="text-base sm:text-lg font-black text-slate-800 tracking-tight uppercase">
              TÍCH ĐIỂM THI ĐUA & THƯỞNG / TRỪ XU
            </h2>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 uppercase">
            GHI NHẬN NỖ LỰC HỌC SINH NGAY TRONG TIẾT DẠY · PHÂN TÁCH THEO MÔN HỌC VÀ LƯU LỊCH SỬ MINH BẠCH
          </p>
        </div>

        {/* Selected count and Quick Trigger */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="text-[11px] font-black px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 uppercase shrink-0">
            ĐÃ CHỌN: <strong className="text-blue-600 font-mono text-xs">{selectedStudentIds.length}</strong> HỌC SINH
          </div>

          <div className="flex items-center gap-2 flex-1 sm:flex-initial">
            <button
              onClick={handleExecuteAward}
              disabled={selectedStudentIds.length === 0 || !canEvaluateEmulation}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl shadow-xs transition-all hover-zoom-btn uppercase"
              title={!canEvaluateEmulation ? 'Chỉ GVCN mới có quyền đánh giá điểm thi đua' : undefined}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>THƯỞNG +{customAmount} XU</span>
            </button>

            <button
              onClick={handleExecuteDeduct}
              disabled={selectedStudentIds.length === 0 || !canEvaluateEmulation}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl shadow-xs transition-all hover-zoom-btn uppercase"
              title={!canEvaluateEmulation ? 'Chỉ GVCN mới có quyền đánh giá điểm thi đua' : undefined}
            >
              <MinusCircle className="w-3.5 h-3.5" />
              <span>TRỪ -{customAmount} XU</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4">
        {/* Left Column: Student Selection Grid (7 cols) */}
        <div className="lg:col-span-7 bg-white/95 rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-xs space-y-3 card-lift">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-800 uppercase">
                1. CHỌN HỌC SINH
              </h3>
              <button
                onClick={selectAll}
                className="text-xs text-blue-600 hover:text-blue-700 font-bold underline underline-offset-2 ml-2 uppercase"
              >
                {selectedStudentIds.length === currentClassStudents.length ? 'BỎ CHỌN TẤT CẢ' : 'CHỌN TẤT CẢ CẢ LỚP'}
              </button>
            </div>

            <div className="relative w-48">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm học sinh..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[500px] overflow-y-auto pr-1">
            {filteredStudents.map((student) => {
              const isSelected = selectedStudentIds.includes(student.id);
              return (
                <button
                  key={student.id}
                  onClick={() => toggleStudentSelection(student.id)}
                  className={`p-2.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all relative btn-lift ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/90 ring-2 ring-blue-400/30 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                  }`}
                >
                  <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0 bg-slate-100 border border-slate-200">
                    <img
                      src={student.avatar}
                      alt={student.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => handleAvatarImgError(e, student.gender, student.name)}
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-blue-600/80 flex items-center justify-center text-white">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-mono text-slate-500 font-bold">
                      STT {student.stt}
                    </div>
                    <div className="text-xs font-semibold text-slate-800 truncate" title={student.name}>
                      {student.name}
                    </div>
                    <div className="text-[10px] font-mono font-bold text-amber-700">
                      {student.points} xu
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Criteria, Subject, Custom Amount & Log (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Step 2: Subject & Criteria Configuration */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-800">
              2. Tiêu chí khen thưởng / kỷ luật
            </h3>

            {/* Checkbox Theo môn */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isBySubject}
                    onChange={(e) => setIsBySubject(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Gán theo môn học</span>
                </label>

                {canConfigureCoinSubjects && (
                  <button
                    onClick={() => setIsAddingSubject(!isAddingSubject)}
                    className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                  >
                    + Thêm môn học
                  </button>
                )}
              </div>

              {isAddingSubject && (
                <form onSubmit={handleCreateSubject} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Nhập môn mới (ví dụ: Địa lý, Đạo đức)..."
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    className="flex-1 px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                    required
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg"
                  >
                    Lưu
                  </button>
                </form>
              )}

              {isBySubject && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {subjects.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSubject(s.name)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        selectedSubject === s.name 
                          ? 'bg-blue-600 text-white shadow-2xs' 
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Criteria List */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Chọn tiêu chí mẫu hoặc tùy chỉnh:</span>
                <button
                  onClick={() => setIsAddingCriterion(!isAddingCriterion)}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Thêm tiêu chí
                </button>
              </div>

              {isAddingCriterion && (
                <form onSubmit={handleCreateCriterion} className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl space-y-2">
                  <input
                    type="text"
                    placeholder="Nội dung tiêu chí..."
                    value={newCritTitle}
                    onChange={(e) => setNewCritTitle(e.target.value)}
                    className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                    required
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={newCritType}
                      onChange={(e) => setNewCritType(e.target.value as 'positive' | 'negative')}
                      className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="positive">Thưởng (+)</option>
                      <option value="negative">Trừ (-)</option>
                    </select>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={newCritPoints}
                      onChange={(e) => setNewCritPoints(parseInt(e.target.value) || 1)}
                      className="w-16 px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                    />
                    <span className="text-xs text-slate-500">xu</span>
                    <button
                      type="submit"
                      className="ml-auto px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg"
                    >
                      Tạo
                    </button>
                  </div>
                </form>
              )}

              <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                {criteria.map(crit => {
                  const isPositive = crit.type === 'positive';
                  const isSelected = selectedCriterionId === crit.id;
                  return (
                    <button
                      key={crit.id}
                      onClick={() => handleSelectCriterion(crit.id)}
                      className={`w-full flex items-center justify-between p-2 rounded-xl border text-left text-xs transition-colors ${
                        isSelected 
                          ? 'border-blue-500 bg-blue-50/80 font-medium' 
                          : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate pr-2">{crit.title}</span>
                      <span className={`shrink-0 font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                        isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {crit.points > 0 ? `+${crit.points}` : crit.points} xu
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Coin & Reason Editor */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Tùy chỉnh số xu và lý do khen thưởng:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(parseInt(e.target.value) || 1)}
                  className="w-20 px-3 py-1.5 border border-slate-300 rounded-xl text-sm font-mono font-bold text-center text-slate-800"
                />
                <input
                  type="text"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Lý do cộng hoặc trừ điểm..."
                  className="flex-1 px-3 py-1.5 border border-slate-300 rounded-xl text-xs text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Recent Live Transactions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Lịch sử cộng/trừ xu gần đây</span>
              </div>
              <span className="text-[11px] text-slate-400">{recentTransactions.length} mục</span>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                Chưa có lượt cộng/trừ xu nào trong buổi học hôm nay.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {recentTransactions.map(tx => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-slate-800 truncate">
                        {tx.studentName}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {tx.reason} {tx.subjectName ? `· ${tx.subjectName}` : ''}
                      </div>
                    </div>

                    <div className={`font-mono font-bold text-xs shrink-0 ${
                      tx.amount > 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount} xu
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
