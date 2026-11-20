/**
 * "Xem số liệu" account: a staff member (not a teacher) who was assigned a report duty. It uses the Ban giám hiệu role so the
 * school-wide figures load, but it is read-only: no account management, no class / student editing, no settings.
 * Marked by role 'bgh' + nonTeaching + staffReportViewer (a real Ban giám hiệu account never carries nonTeaching).
 */
export const isStatsViewerAccount = (u?: { role?: string; isBgh?: boolean; nonTeaching?: boolean; staffReportViewer?: boolean } | null): boolean =>
  Boolean(u && (u.role === 'bgh' || u.isBgh) && u.nonTeaching === true && u.staffReportViewer === true);
