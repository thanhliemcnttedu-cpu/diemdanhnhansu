import { useMemo } from 'react';
import { useClassroom } from '../../../context/ClassroomContext';

/**
 * "Gọi công bằng": every picker game shares one call log per class.
 * A round = calls since the class's round mark; once everybody has been called the round restarts by itself,
 * so each student is called once before anyone is called twice, even when the teacher switches game or reloads.
 */
export function useFairCall() {
  const { currentClassStudents, activeClassId, callLog, callRounds, recordCall, resetCallRound } = useClassroom();

  const roundStart = callRounds[activeClassId] || 0;

  const { calledIds, roundNo, fullyCalled } = useMemo(() => {
    const ids = new Set(currentClassStudents.map(s => s.id));
    const called = new Set<string>();
    callLog.forEach(e => { if (e.classId === activeClassId && e.ts >= roundStart && ids.has(e.studentId)) called.add(e.studentId); });
    const all = ids.size > 0 && called.size >= ids.size;
    return { calledIds: all ? [] : [...called], roundNo: roundStart, fullyCalled: all };
  }, [callLog, activeClassId, roundStart, currentClassStudents]);

  return {
    /** students already called in the current round (empty again once everyone has been called) */
    calledIds,
    roundNo,
    fullyCalled,
    total: currentClassStudents.length,
    /** write one call into the shared log (call it for every winner, whether or not exclusion is on) */
    markCalled: (studentId: string, game: string) => recordCall(activeClassId, studentId, game),
    resetRound: () => resetCallRound(activeClassId),
  };
}
