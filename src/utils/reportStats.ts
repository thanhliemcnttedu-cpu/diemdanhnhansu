/**
 * Small, pure helpers shared by the statistics screens so every screen words a rate and its coverage the same way.
 * Rule: a rate is only ever "present ÷ enrolment of the classes that reported"; the coverage (how many classes / pupils
 * that is) is always shown next to it, and a rate over an incomplete sample is labelled "tạm tính" (provisional).
 */
export const pct1 = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export interface Coverage {
  reportedClasses: number; totalClasses: number;
  reportedStudents: number; totalStudents: number;
  /** share of classes / pupils that reported, 0–100 (one decimal) */
  classPct: number; studentPct: number;
  complete: boolean; empty: boolean;
}

export const coverageOf = (reportedClasses: number, totalClasses: number, reportedStudents: number, totalStudents: number): Coverage => ({
  reportedClasses, totalClasses, reportedStudents, totalStudents,
  classPct: pct1(reportedClasses, totalClasses) ?? 0,
  studentPct: pct1(reportedStudents, totalStudents) ?? 0,
  complete: totalClasses > 0 && reportedClasses >= totalClasses,
  empty: reportedClasses === 0,
});

/** "1/66 lớp • 34/1798 học sinh (1.9%)" */
export const coverageText = (c: Coverage): string =>
  `${c.reportedClasses}/${c.totalClasses} lớp • ${c.reportedStudents}/${c.totalStudents} học sinh (${c.studentPct}%)`;
