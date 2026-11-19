import React, { useState } from 'react';
import { Loader2, UserCheck } from 'lucide-react';
import { useClassroom } from '../../../context/ClassroomContext';
import { schoolDriveDbService } from '../../../services/schoolDriveDbService';

/** Builds the message shown after pulling rosters from the homeroom classes */
export const rosterResultText = (r: { added: number; updated: number; classes: number; missing: string[] }) => {
  const parts: string[] = [];
  if (r.added) parts.push(`Đã thêm ${r.added} học sinh từ danh sách của giáo viên chủ nhiệm (${r.classes} lớp).`);
  if (r.updated) parts.push(`Đã cập nhật thông tin ${r.updated} học sinh theo danh sách gốc.`);
  if (!r.added && !r.updated && !r.missing.length) parts.push('Danh sách học sinh đã khớp với lớp chủ nhiệm, không có gì cần thêm.');
  if (r.missing.length) parts.push(`Chưa có danh sách của giáo viên chủ nhiệm trên Drive: ${r.missing.join(', ')}. Các lớp này có thể nhập bằng tệp Excel.`);
  return parts.join('\n');
};

/**
 * Subject teacher: pull the real pupil list of every subject class from the homeroom teacher's class file
 * on the school's Drive (adds missing pupils only; coins and groups already recorded are kept).
 */
export const SyncHomeroomRosterButton: React.FC<{ className?: string }> = ({ className }) => {
  const { syncSubjectRosters, teacherRole, classes } = useClassroom();
  const [busy, setBusy] = useState(false);
  if (teacherRole !== 'subject' || !syncSubjectRosters || !schoolDriveDbService.isConfigured() || classes.length === 0) return null;
  const run = async () => {
    setBusy(true);
    try { alert(rosterResultText(await syncSubjectRosters())); }
    catch (e: any) { alert(e?.message || 'Không lấy được danh sách từ Drive của trường.'); }
    finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={run} disabled={busy}
      title="Lấy danh sách học sinh thật của các lớp từ giáo viên chủ nhiệm trên Drive của trường. Chỉ thêm học sinh còn thiếu, không xóa và không đổi số xu."
      className={className || 'px-4 py-2.5 rounded-2xl font-black text-xs md:text-sm flex items-center gap-2 uppercase bg-white border border-emerald-600 text-emerald-800 hover:bg-emerald-50 disabled:opacity-60 whitespace-nowrap'}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
      <span>{busy ? 'Đang lấy danh sách…' : 'Lấy học sinh từ lớp chủ nhiệm'}</span>
    </button>
  );
};

export default SyncHomeroomRosterButton;
