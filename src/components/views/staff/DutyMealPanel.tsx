import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { staffAttendanceService } from '../../../services/staffAttendanceService';
import { SchoolMealReportPanel, MealReportData } from '../reports/SchoolMealReportPanel';

/**
 * Boarding meal report for a staff member who was given the "bán trú" duty (accountant, treasurer…).
 * Read-only: the numbers stay the homeroom teachers'. Data comes from the school's Apps Script (`mealReport`, 1.1.14)
 * one day at a time, authorised by the duty session set on the check-in page.
 */
export const DutyMealPanel: React.FC<{ today: string }> = ({ today }) => {
  const [date, setDate] = useState(today);
  const [data, setData] = useState<MealReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    staffAttendanceService.mealReport(date).then(r => {
      if (!alive) return;
      setLoading(false);
      if (!r?.success) {
        setError(/Hành động không hợp lệ|tổng hợp chấm công/i.test(String(r?.message || ''))
          ? 'Biểu báo ăn cho người được giao nhiệm vụ cần Apps Script của trường từ phiên bản 1.1.14. Vui lòng báo Quản trị nhà trường cập nhật.'
          : (r?.message || 'Không tải được biểu báo ăn.'));
        return;
      }
      setData({ classes: r.classes || [], students: r.students || [], attendanceRecords: r.attendanceRecords || [], boardingRecords: r.boardingRecords || [], schoolName: r.schoolName || '' });
    }).catch(() => { if (alive) { setLoading(false); setError('Không kết nối được máy chủ của trường.'); } });
    return () => { alive = false; };
  }, [date]);

  return (
    <div className="space-y-3">
      {loading && <p className="text-sm text-slate-600 inline-flex items-center gap-2" role="status"><Loader2 className="w-4 h-4 animate-spin" /> Đang tải biểu báo ăn…</p>}
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800" role="alert">{error}</p>}
      {data && <SchoolMealReportPanel data={data} date={date} onDateChange={setDate} />}
    </div>
  );
};

export default DutyMealPanel;
