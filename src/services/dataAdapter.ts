import { UserClassroomData, Student, Classroom, DailyAttendance, DailyBoardingMeal, PointTransaction, UserAccount } from '../types';
import { 
  StandardClassroomJson, 
  StandardStudent, 
  StandardDailyRecord, 
  StandardDailyAttendanceRecord, 
  StandardDailyBoardingRecord 
} from '../types/driveSync';

/**
 * 🛠️ DATA ADAPTER & SMART MERGE ENGINE V2.0
 * Thực thi các nguyên tắc cốt lõi:
 * 1. Chuẩn hóa 01 file JSON duy nhất: du_lieu_lop_hoc_hanh_phuc.json
 * 2. Non-Destructive Smart Merge: Tuyệt đối không xóa đè dữ liệu cũ
 * 3. Rolling Daily Backup: Lưu trữ lăn chu kỳ 7 - 10 ngày
 */

export const STANDARD_DB_FILENAME = 'du_lieu_lop_hoc_hanh_phuc.json';
export const ROLLING_BACKUP_PREFIX = 'lop_hoc_rolling_backup_';
export const MAX_ROLLING_BACKUP_DAYS = 10;

export const dataAdapter = {
  /**
   * 1. 📤 Chuyển đổi UserClassroomData sang StandardClassroomJson chuẩn Google Drive
   */
  toStandardClassroomJson(
    userData: UserClassroomData,
    currentUser: UserAccount,
    targetClassId?: string
  ): StandardClassroomJson {
    const activeId = targetClassId || userData.activeClassId || (userData.classes?.[0]?.id) || 'class-default';
    const activeClass = userData.classes?.find(c => c.id === activeId) || userData.classes?.[0] || {
      id: activeId,
      name: currentUser.assignedClassName || 'Lớp Học Hạnh Phúc',
      grade: '1',
      color: '#4f46e5',
      academicYear: '2026 - 2027'
    };

    // Lọc danh sách học sinh của lớp hiện tại
    const classStudents = (userData.students || []).filter(s => s.classId === activeClass.id);

    // Chuyển đổi học sinh sang chuẩn StandardStudent
    const standardStudents: StandardStudent[] = classStudents.map(s => ({
      id: s.id,
      stt: s.stt,
      fullName: s.name,
      gender: s.gender,
      dob: s.birthDate,
      isBoarding: true, // Mặc định hoặc dựa trên lịch sử
      parentPhone: '',
      avatar: s.avatar,
      points: s.points,
      group: s.group,
      role: s.role,
      roles: s.roles,
      updatedAt: userData.updatedAt || Date.now()
    }));

    // Tổng hợp dailyRecords từ attendanceRecords & boardingRecords
    const dailyRecords: Record<string, StandardDailyRecord> = {};

    // Điểm danh
    if (Array.isArray(userData.attendanceRecords)) {
      for (const rec of userData.attendanceRecords) {
        if (rec.classId && rec.classId !== activeClass.id) continue;
        const date = rec.date;
        if (!date) continue;

        let present = 0;
        let excused = 0;
        let unexcused = 0;
        let late = 0;
        const absentStudentIds: string[] = [];
        const details: Record<string, string> = {};

        for (const [studentId, status] of Object.entries(rec.records || {})) {
          details[studentId] = status;
          if (status === 'present') {
            present++;
          } else if (status === 'excused' || status === 'sick' || status === 'other') {
            excused++;
            absentStudentIds.push(studentId);
          } else if (status === 'unexcused') {
            unexcused++;
            absentStudentIds.push(studentId);
          } else if (status === 'late') {
            late++;
            present++; // Đi muộn vẫn tính là có mặt
          }
        }

        const attRecord: StandardDailyAttendanceRecord = {
          present,
          excused,
          unexcused,
          late,
          absentStudentIds,
          details
        };

        if (!dailyRecords[date]) {
          dailyRecords[date] = {
            attendance: attRecord,
            notes: rec.notes,
            updatedAt: new Date().toISOString()
          };
        } else {
          dailyRecords[date].attendance = attRecord;
        }
      }
    }

    // Bán trú
    if (Array.isArray(userData.boardingRecords)) {
      for (const rec of userData.boardingRecords) {
        if (rec.classId && rec.classId !== activeClass.id) continue;
        const date = rec.date;
        if (!date) continue;

        let registered = 0;
        let actual = 0;
        const canceledStudentIds: string[] = [];
        const details: Record<string, string> = {};

        for (const [studentId, status] of Object.entries(rec.records || {})) {
          details[studentId] = status;
          registered++;
          if (status === 'eating') {
            actual++;
          } else {
            canceledStudentIds.push(studentId);
          }
        }

        const boardingRecord: StandardDailyBoardingRecord = {
          registered,
          actual,
          canceledStudentIds,
          details
        };

        if (!dailyRecords[date]) {
          dailyRecords[date] = {
            boarding: boardingRecord,
            notes: rec.notes,
            updatedAt: new Date().toISOString()
          };
        } else {
          dailyRecords[date].boarding = boardingRecord;
        }
      }
    }

    const standardJson: StandardClassroomJson = {
      version: '2.0',
      format: 'lop_hoc_hanh_phuc_backup',
      scope: 'google_drive_sync',
      exportedAt: new Date().toISOString(),
      metadata: {
        schoolName: currentUser.schoolName || activeClass.schoolName || 'Trường Tiểu học',
        className: activeClass.name,
        teacherName: currentUser.fullName,
        teacherUsername: currentUser.username,
        academicYear: activeClass.academicYear || '2026 - 2027',
        totalStudents: classStudents.length,
        grade: activeClass.grade,
        branch: activeClass.branch || null,
        campus: activeClass.campus || null
      },
      classInfo: {
        id: activeClass.id,
        name: activeClass.name,
        grade: activeClass.grade,
        schoolName: currentUser.schoolName || activeClass.schoolName,
        branch: activeClass.branch || null,
        campus: activeClass.campus || null,
        academicYear: activeClass.academicYear || '2026 - 2027',
        slogan: activeClass.slogan
      },
      students: standardStudents,
      dailyRecords,
      // Đính kèm dữ liệu toàn diện để tương thích 16 view
      fullClassroomData: userData
    };

    // 🏛️ ĐÓNG GÓI DỮ LIỆU PHÂN CẤP THEO VAI TRÒ
    try {
      const uname = (currentUser.username || '').toLowerCase();
      const role = currentUser.role || '';
      const isSuperAdmin = uname === 'adminquantri' || role === 'admin';
      const isSchoolAdmin = role === 'school_admin' || currentUser.isSchoolAdmin;

      // Đọc CSDL trường từ localStorage
      let cachedSchools: any[] = [];
      try {
        const rawS = localStorage.getItem('lop_hoc_schools_list_v1');
        if (rawS) cachedSchools = JSON.parse(rawS);
      } catch (_) {}

      // Đọc tài khoản từ localStorage
      let cachedUsers: any[] = [];
      try {
        const rawU = localStorage.getItem('LHHP_USERS');
        if (rawU) cachedUsers = JSON.parse(rawU);
      } catch (_) {}
      // 🔒 Tệp Drive đọc được bởi ai có link Apps Script: tuyệt đối không kèm mật khẩu.
      // (Đăng nhập dùng CSDL nhà trường csdl_truong.json có mật khẩu băm, được Apps Script bảo vệ.)
      cachedUsers = (Array.isArray(cachedUsers) ? cachedUsers : []).map(u => {
        if (!u || typeof u !== 'object') return u;
        const { password: _pw, passwordHash: _h, salt: _s, ...safe } = u;
        return safe;
      });

      if (isSuperAdmin) {
        // Cấp 0: Quản trị Tối Cao (adminquantri) -> Đóng gói toàn bộ CSDL trường & tài khoản Quản trị trường, BGH
        standardJson.hierarchyLevel = 'master_admin';
        standardJson.systemSchools = cachedSchools;
        standardJson.systemUsers = cachedUsers;
        standardJson.systemClasses = userData.classes || [];
      } else if (isSchoolAdmin) {
        // Cấp 1: Quản trị Nhà Trường -> Đóng gói tài khoản GVCN, GVBM và các lớp học của trường
        standardJson.hierarchyLevel = 'school_admin';
        const curSchool = (currentUser.schoolName || '').trim().toLowerCase();
        standardJson.systemUsers = cachedUsers.filter(u => {
          const uSchool = (u.schoolName || '').trim().toLowerCase();
          return !curSchool || !uSchool || uSchool === curSchool;
        });
        standardJson.systemClasses = userData.classes || [];
      } else {
        standardJson.hierarchyLevel = 'teacher';
      }
    } catch (_) {}

    return standardJson;
  },

  /**
   * 2. 📥 Khôi phục / Trích xuất UserClassroomData từ StandardClassroomJson
   */
  fromStandardClassroomJson(
    standardJson: StandardClassroomJson,
    existingData?: UserClassroomData
  ): UserClassroomData {
    // Nếu có trường fullClassroomData bảo toàn, dùng làm khung sườn ưu tiên
    if (standardJson.fullClassroomData) {
      if (!existingData) {
        return standardJson.fullClassroomData as UserClassroomData;
      }
      return this.smartMergeClassroomData(existingData, standardJson);
    }

    // Tự sinh cấu trúc UserClassroomData từ StandardClassroomJson
    const classId = standardJson.classInfo?.id || 'class-' + Date.now();
    const reconstructedClass: Classroom = {
      id: classId,
      name: standardJson.classInfo?.name || standardJson.metadata?.className || 'Lớp Học Hạnh Phúc',
      grade: String(standardJson.classInfo?.grade || standardJson.metadata?.grade || '1'),
      color: '#4f46e5',
      academicYear: standardJson.metadata?.academicYear || '2026 - 2027',
      schoolName: standardJson.metadata?.schoolName,
      branch: standardJson.classInfo?.branch || standardJson.metadata?.branch || null,
      campus: standardJson.classInfo?.campus || standardJson.metadata?.campus || null,
      teacherName: standardJson.metadata?.teacherName,
      teacherUsername: standardJson.metadata?.teacherUsername,
      teacherRole: 'homeroom',
      isHomeroom: true
    };

    const reconstructedStudents: Student[] = (standardJson.students || []).map((s, idx) => ({
      id: s.id || `student-${classId}-${idx + 1}`,
      classId: classId,
      stt: s.stt || idx + 1,
      name: s.fullName || 'Học sinh',
      birthDate: s.dob || '',
      gender: (s.gender === 'Nữ' || s.gender === 'female') ? 'Nữ' : 'Nam',
      avatar: s.avatar || '',
      avatarScale: 1,
      avatarPosition: { x: 0, y: 0 },
      points: s.points || 0,
      group: s.group || 'Tổ 1',
      role: s.role || '',
      roles: s.roles || []
    }));

    // Tái tạo attendanceRecords & boardingRecords
    const attendanceRecords: DailyAttendance[] = [];
    const boardingRecords: DailyBoardingMeal[] = [];

    if (standardJson.dailyRecords) {
      for (const [date, rec] of Object.entries(standardJson.dailyRecords)) {
        if (rec.attendance?.details) {
          attendanceRecords.push({
            date,
            classId,
            records: rec.attendance.details as any,
            notes: rec.notes
          });
        }
        if (rec.boarding?.details) {
          boardingRecords.push({
            date,
            classId,
            records: rec.boarding.details as any,
            notes: rec.notes
          });
        }
      }
    }

    const initialResult: UserClassroomData = {
      classes: [reconstructedClass],
      activeClassId: classId,
      students: reconstructedStudents,
      subjects: existingData?.subjects || [],
      criteria: existingData?.criteria || [],
      transactions: existingData?.transactions || [],
      rewards: existingData?.rewards || [],
      redemptions: existingData?.redemptions || [],
      seatingColumns: existingData?.seatingColumns || 4,
      deskCountsPerColumn: existingData?.deskCountsPerColumn || [4, 4, 4, 4],
      deskNumberingOrder: existingData?.deskNumberingOrder || 'vertical',
      teacherDeskPos: existingData?.teacherDeskPos || 'left',
      doorPos: existingData?.doorPos || 'right',
      blackboardPos: existingData?.blackboardPos || 'center',
      seatingAssignments: existingData?.seatingAssignments || {},
      attendanceRecords,
      boardingRecords,
      timetable: existingData?.timetable || [],
      timetableConfig: existingData?.timetableConfig || { morningPeriods: 5, afternoonPeriods: 4, hasSaturday: false },
      teacherRole: 'homeroom',
      subjectTeacherConfig: existingData?.subjectTeacherConfig || {
        subjectName: 'Tin học',
        roomDefault: 'Phòng máy',
        scheduleScope: 'semester',
        periodName: 'Học kì I',
        morningPeriods: 5,
        afternoonPeriods: 4,
        hasSaturday: false
      },
      subjectTimetable: existingData?.subjectTimetable || [],
      quickLinks: existingData?.quickLinks || [],
      teacherProfile: existingData?.teacherProfile || {
        name: standardJson.metadata?.teacherName || '',
        role: 'Giáo viên chủ nhiệm',
        teachingSubject: 'Tiểu học',
        schoolName: standardJson.metadata?.schoolName || '',
        avatar: ''
      },
      updatedAt: Date.now()
    };

    if (existingData) {
      return this.smartMergeClassroomData(existingData, standardJson);
    }
    return initialResult;
  },

  /**
   * 🏛️ TỰ ĐỘNG NẠP VÀ ĐỒNG BỘ CSDL TRƯỜNG & TÀI KHOẢN PHÂN CẤP TỪ GOOGLE DRIVE
   */
  syncIncomingHierarchy(incomingJson: StandardClassroomJson): { schoolsAdded: number; usersAdded: number; classesAdded: number } {
    let schoolsAdded = 0;
    let usersAdded = 0;
    let classesAdded = 0;

    // 1. Nạp danh sách trường học (systemSchools)
    if (Array.isArray(incomingJson.systemSchools) && incomingJson.systemSchools.length > 0) {
      try {
        const rawS = localStorage.getItem('lop_hoc_schools_list_v1');
        const currentSchools: any[] = rawS ? JSON.parse(rawS) : [];
        const schoolMap = new Map<string, any>();
        currentSchools.forEach(s => {
          if (s && s.id) schoolMap.set(s.id, s);
          else if (s && s.name) schoolMap.set(s.name.trim().toLowerCase(), s);
        });

        incomingJson.systemSchools.forEach(s => {
          if (!s || !s.name) return;
          const key = s.id || s.name.trim().toLowerCase();
          if (!schoolMap.has(key)) {
            schoolMap.set(key, s);
            schoolsAdded++;
          } else {
            schoolMap.set(key, { ...schoolMap.get(key), ...s });
          }
        });

        const mergedSchools = Array.from(schoolMap.values());
        localStorage.setItem('lop_hoc_schools_list_v1', JSON.stringify(mergedSchools));

        // Đồng bộ từng trường vào server Express nếu có
        incomingJson.systemSchools.forEach(s => {
          fetch('/api/schools', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(s)
          }).catch(() => {});
        });
      } catch (_) {}
    }

    // 2. Nạp danh sách tài khoản (systemUsers)
    if (Array.isArray(incomingJson.systemUsers) && incomingJson.systemUsers.length > 0) {
      try {
        const rawU = localStorage.getItem('LHHP_USERS');
        const currentUsers: any[] = rawU ? JSON.parse(rawU) : [];
        const userMap = new Map<string, any>();
        currentUsers.forEach(u => {
          if (u && u.username) userMap.set(u.username.trim().toLowerCase(), u);
        });

        const toPushServer: any[] = [];
        incomingJson.systemUsers.forEach(u => {
          if (!u || !u.username) return;
          const uKey = u.username.trim().toLowerCase();
          if (!userMap.has(uKey)) {
            userMap.set(uKey, u);
            toPushServer.push(u);
            usersAdded++;
          } else {
            userMap.set(uKey, { ...userMap.get(uKey), ...u });
          }
        });

        const mergedUsers = Array.from(userMap.values());
        localStorage.setItem('LHHP_USERS', JSON.stringify(mergedUsers));

        if (toPushServer.length > 0) {
          fetch('/api/users/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ users: toPushServer })
          }).catch(() => {});
        }
      } catch (_) {}
    }

    return { schoolsAdded, usersAdded, classesAdded };
  },

  /**
   * 3. 🛡️ THUẬT TOÁN NON-DESTRUCTIVE SMART MERGE (HỢP NHẤT THÔNG MINH)
   * Tuyệt đối không xóa đè dữ liệu cũ. So khớp id và updatedAt.
   */
  smartMergeClassroomData(
    localData: UserClassroomData,
    incomingJson: StandardClassroomJson
  ): UserClassroomData {
    // Tự động nạp CSDL trường và tài khoản nếu có trong file
    this.syncIncomingHierarchy(incomingJson);

    const incomingFull = incomingJson.fullClassroomData;

    // 1. Hợp nhất Danh sách Lớp học (Classes)
    const localClassesMap = new Map<string, Classroom>();
    for (const cls of localData.classes || []) {
      localClassesMap.set(cls.id, { ...cls });
    }

    const incomingClasses = incomingFull?.classes || incomingJson.systemClasses || (incomingJson.classInfo ? [{
      id: incomingJson.classInfo.id,
      name: incomingJson.classInfo.name,
      grade: String(incomingJson.classInfo.grade || '1'),
      color: '#4f46e5',
      academicYear: incomingJson.metadata?.academicYear || '2026 - 2027',
      schoolName: incomingJson.metadata?.schoolName,
      branch: incomingJson.classInfo.branch || null,
      campus: incomingJson.classInfo.campus || null,
      teacherName: incomingJson.metadata?.teacherName,
      teacherUsername: incomingJson.metadata?.teacherUsername,
      teacherRole: 'homeroom' as const,
      isHomeroom: true
    }] : []);

    for (const inCls of incomingClasses) {
      if (!localClassesMap.has(inCls.id)) {
        localClassesMap.set(inCls.id, inCls);
      } else {
        const existing = localClassesMap.get(inCls.id)!;
        localClassesMap.set(inCls.id, {
          ...existing,
          ...inCls,
          // Bảo tồn ảnh avatar nếu incoming không có
          avatar: inCls.avatar || existing.avatar,
          originalAvatar: inCls.originalAvatar || existing.originalAvatar
        });
      }
    }

    // 2. Hợp nhất Danh sách Học sinh (Students)
    const localStudentsMap = new Map<string, Student>();
    for (const stu of localData.students || []) {
      localStudentsMap.set(stu.id, { ...stu });
    }

    const incomingStudents: Student[] = incomingFull?.students || (incomingJson.students || []).map((s, idx) => ({
      id: s.id,
      classId: incomingJson.classInfo?.id || localData.activeClassId,
      stt: s.stt || idx + 1,
      name: s.fullName,
      birthDate: s.dob || '',
      gender: (s.gender === 'Nữ' || s.gender === 'female') ? 'Nữ' : 'Nam',
      avatar: s.avatar || '',
      avatarScale: 1,
      avatarPosition: { x: 0, y: 0 },
      points: s.points || 0,
      group: s.group || 'Tổ 1',
      role: s.role || '',
      roles: s.roles || []
    }));

    for (const inStu of incomingStudents) {
      if (!localStudentsMap.has(inStu.id)) {
        // Học sinh mới được thêm vào, không xóa học sinh cũ
        localStudentsMap.set(inStu.id, inStu);
      } else {
        const existing = localStudentsMap.get(inStu.id)!;
        // Giữ lại điểm cao hơn hoặc ưu tiên dữ liệu có hình ảnh
        localStudentsMap.set(inStu.id, {
          ...existing,
          ...inStu,
          avatar: inStu.avatar || existing.avatar,
          originalAvatar: inStu.originalAvatar || existing.originalAvatar,
          points: Math.max(existing.points || 0, inStu.points || 0),
          roles: (inStu.roles && inStu.roles.length > 0) ? inStu.roles : (existing.roles || []),
          role: inStu.role || existing.role
        });
      }
    }

    // 3. Hợp nhất Điểm danh (Attendance Records)
    const localAttendanceMap = new Map<string, DailyAttendance>();
    for (const att of localData.attendanceRecords || []) {
      const key = `${att.classId || 'default'}_${att.date}`;
      localAttendanceMap.set(key, { ...att });
    }

    const incomingAttendanceList: DailyAttendance[] = incomingFull?.attendanceRecords || [];
    // Nạp thêm từ dailyRecords của standard JSON
    if (incomingJson.dailyRecords) {
      for (const [date, rec] of Object.entries(incomingJson.dailyRecords)) {
        if (rec.attendance?.details) {
          incomingAttendanceList.push({
            date,
            classId: incomingJson.classInfo?.id || localData.activeClassId,
            records: rec.attendance.details as any,
            notes: rec.notes
          });
        }
      }
    }

    for (const inAtt of incomingAttendanceList) {
      const key = `${inAtt.classId || 'default'}_${inAtt.date}`;
      if (!localAttendanceMap.has(key)) {
        localAttendanceMap.set(key, inAtt);
      } else {
        const existing = localAttendanceMap.get(key)!;
        localAttendanceMap.set(key, {
          ...existing,
          ...inAtt,
          records: {
            ...existing.records,
            ...inAtt.records
          },
          notes: inAtt.notes || existing.notes
        });
      }
    }

    // 4. Hợp nhất Bán trú (Boarding Records)
    const localBoardingMap = new Map<string, DailyBoardingMeal>();
    for (const bm of localData.boardingRecords || []) {
      const key = `${bm.classId || 'default'}_${bm.date}`;
      localBoardingMap.set(key, { ...bm });
    }

    const incomingBoardingList: DailyBoardingMeal[] = incomingFull?.boardingRecords || [];
    if (incomingJson.dailyRecords) {
      for (const [date, rec] of Object.entries(incomingJson.dailyRecords)) {
        if (rec.boarding?.details) {
          incomingBoardingList.push({
            date,
            classId: incomingJson.classInfo?.id || localData.activeClassId,
            records: rec.boarding.details as any,
            notes: rec.notes
          });
        }
      }
    }

    for (const inBm of incomingBoardingList) {
      const key = `${inBm.classId || 'default'}_${inBm.date}`;
      if (!localBoardingMap.has(key)) {
        localBoardingMap.set(key, inBm);
      } else {
        const existing = localBoardingMap.get(key)!;
        localBoardingMap.set(key, {
          ...existing,
          ...inBm,
          records: {
            ...existing.records,
            ...inBm.records
          },
          notes: inBm.notes || existing.notes
        });
      }
    }

    // 5. Hợp nhất Lịch sử giao dịch Xu (Transactions)
    const localTxMap = new Map<string, PointTransaction>();
    for (const tx of localData.transactions || []) {
      localTxMap.set(tx.id, tx);
    }
    for (const inTx of incomingFull?.transactions || []) {
      if (!localTxMap.has(inTx.id)) {
        localTxMap.set(inTx.id, inTx);
      }
    }

    // 6. Đảm bảo cấu hình sơ đồ lớp, TKB, Quà tặng
    return {
      ...localData,
      classes: Array.from(localClassesMap.values()),
      students: Array.from(localStudentsMap.values()),
      attendanceRecords: Array.from(localAttendanceMap.values()),
      boardingRecords: Array.from(localBoardingMap.values()),
      transactions: Array.from(localTxMap.values()),
      subjects: incomingFull?.subjects && incomingFull.subjects.length > 0 ? incomingFull.subjects : localData.subjects,
      rewards: incomingFull?.rewards && incomingFull.rewards.length > 0 ? incomingFull.rewards : localData.rewards,
      timetable: incomingFull?.timetable && incomingFull.timetable.length > 0 ? incomingFull.timetable : localData.timetable,
      seatingAssignments: {
        ...localData.seatingAssignments,
        ...(incomingFull?.seatingAssignments || {})
      },
      // Két cá nhân (link Drive cá nhân đã mã hóa): bản mới hơn thắng
      personalQuizVault: ((incomingFull as any)?.personalQuizVault?.at || 0) > ((localData as any).personalQuizVault?.at || 0)
        ? (incomingFull as any).personalQuizVault
        : (localData as any).personalQuizVault,
      updatedAt: Date.now()
    };
  },

  /**
   * 4. 🔄 ROLLING DAILY BACKUP (SAO LƯU LĂN CHU KỲ 7 - 10 NGÀY)
   * Tự động tạo 1 file snapshot mỗi ngày, giữ lại tối đa 10 ngày gần nhất
   */
  async createDailyRollingBackup(username: string, data: UserClassroomData): Promise<void> {
    if (!username) return;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const storageKey = `${ROLLING_BACKUP_PREFIX}${username}_${today}`;

    const snapshot = {
      date: today,
      username,
      timestamp: Date.now(),
      data
    };

    // 1. Lưu snapshot ngày hôm nay vào localStorage
    try {
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
    } catch (_) {
      // LocalStorage đầy: tự dọn dẹp các ngày cũ
    }

    // 2. Quét danh sách các snapshot hiện có để dọn dẹp vượt quá 10 ngày
    try {
      const keysToDelete: string[] = [];
      const userBackupDates: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${ROLLING_BACKUP_PREFIX}${username}_`)) {
          const datePart = key.replace(`${ROLLING_BACKUP_PREFIX}${username}_`, '');
          userBackupDates.push(datePart);
        }
      }

      // Sắp xếp giảm dần theo ngày (mới nhất trước)
      userBackupDates.sort().reverse();

      // Nếu nhiều hơn MAX_ROLLING_BACKUP_DAYS (10 ngày), xóa các ngày cũ hơn
      if (userBackupDates.length > MAX_ROLLING_BACKUP_DAYS) {
        const expiredDates = userBackupDates.slice(MAX_ROLLING_BACKUP_DAYS);
        for (const expDate of expiredDates) {
          localStorage.removeItem(`${ROLLING_BACKUP_PREFIX}${username}_${expDate}`);
        }
      }
    } catch (_) {}

    // 3. Gửi sang máy chủ nội bộ để ghi file vật lý nếu đang kết nối local server
    try {
      await fetch('/api/backup/rolling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          date: today,
          snapshot
        })
      });
    } catch (_) {}
  },

  /**
   * Lấy danh sách các bản sao lưu lăn chu kỳ hiện có của người dùng
   */
  getRollingBackupsList(username: string): Array<{ date: string; timestamp: number; key: string }> {
    const list: Array<{ date: string; timestamp: number; key: string }> = [];
    if (!username) return list;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${ROLLING_BACKUP_PREFIX}${username}_`)) {
          const datePart = key.replace(`${ROLLING_BACKUP_PREFIX}${username}_`, '');
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              list.push({
                date: datePart,
                timestamp: parsed.timestamp || 0,
                key
              });
            }
          } catch (_) {
            list.push({ date: datePart, timestamp: 0, key });
          }
        }
      }
    } catch (_) {}

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }
};
