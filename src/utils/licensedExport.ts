import * as XLSX from 'xlsx';
import { requireLicense } from './licenseGate';

/**
 * XLSX.writeFile for REPORT exports: locked in trial mode (the licence dialog opens instead of the download).
 * Blank import templates and account lists keep using XLSX.writeFile directly — they are needed to set a school up.
 * Returns true when the file was written.
 */
export function writeReportXlsx(workbook: XLSX.WorkBook, fileName: string, options?: XLSX.WritingOptions): boolean {
  if (!requireLicense('Xuất tệp Excel')) return false;
  XLSX.writeFile(workbook, fileName, options);
  return true;
}
