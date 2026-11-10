import type { UserClassroomData, Student, Classroom } from '../types';

/**
 * 🧹 DỮ LIỆU MẪU (học sinh / lớp sinh tự động cho tài khoản mới) — bản web dùng Drive chung không được hiện / lưu dữ liệu giả.
 * - Học sinh mẫu: mã `hs-<mã lớp>-<số thứ tự>` (studentGenerator, initSubjectClasses). Học sinh thật: `hs-<thời gian>-…`.
 * - Lớp mẫu GV bộ môn: mã `class-sub-<tên>` + khẩu hiệu mặc định "Lớp <tên> • Học tập hăng say, rèn luyện chăm chỉ".
 * Chỉ bỏ học sinh mẫu ở lớp mà MỌI học sinh đều là mẫu (giáo viên chưa thêm em thật nào) — lớp có học sinh thật giữ nguyên.
 */
const SAMPLE_ID = /^hs-(class-.+)-(\d{1,3})$/;

export function isSampleStudent(s: Pick<Student, 'id' | 'classId'>): boolean {
  const m = SAMPLE_ID.exec(String(s?.id || ''));
  return Boolean(m && m[1] === s.classId);
}

const isSampleSubjectClass = (c: Classroom) =>
  /^class-sub-/.test(c.id || '') && String(c.slogan || '') === `Lớp ${c.name} • Học tập hăng say, rèn luyện chăm chỉ`;

export function stripSampleData<T extends Partial<UserClassroomData>>(data: T): { data: T; changed: boolean; removedStudents: number; removedClasses: number } {
  const students = Array.isArray(data.students) ? data.students : [];
  const classes = Array.isArray(data.classes) ? data.classes : [];
  if (!students.length && !classes.some(isSampleSubjectClass)) return { data, changed: false, removedStudents: 0, removedClasses: 0 };

  const byClass = new Map<string, Student[]>();
  students.forEach(s => byClass.set(s.classId, [...(byClass.get(s.classId) || []), s]));
  const sampleOnly = new Set<string>();
  byClass.forEach((list, cid) => { if (list.length > 0 && list.every(isSampleStudent)) sampleOnly.add(cid); });

  const keptStudents = students.filter(s => !sampleOnly.has(s.classId));
  // Lớp mẫu bộ môn: bỏ khi không còn học sinh thật nào
  const realClassIds = new Set(keptStudents.map(s => s.classId));
  const keptClasses = classes.filter(c => !(isSampleSubjectClass(c) && !realClassIds.has(c.id)));
  const removedStudentIds = new Set(students.filter(s => sampleOnly.has(s.classId)).map(s => s.id));
  const removedStudents = students.length - keptStudents.length;
  const removedClasses = classes.length - keptClasses.length;
  if (!removedStudents && !removedClasses) return { data, changed: false, removedStudents: 0, removedClasses: 0 };

  const next: any = { ...data, students: keptStudents, classes: keptClasses };
  if (Array.isArray(data.transactions)) next.transactions = data.transactions.filter((t: any) => !removedStudentIds.has(t?.studentId));
  if (data.activeClassId && !keptClasses.some(c => c.id === data.activeClassId)) next.activeClassId = keptClasses[0]?.id || '';
  return { data: next as T, changed: true, removedStudents, removedClasses };
}
