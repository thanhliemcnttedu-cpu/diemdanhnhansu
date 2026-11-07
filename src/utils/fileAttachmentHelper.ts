import JSZip from 'jszip';
import * as XLSX from 'xlsx';

export interface ProcessedAttachment {
  id: string;
  name: string;
  size: number;
  sizeFormatted: string;
  mimeType: string;
  extension: string;
  fileType: 'image' | 'pdf' | 'word' | 'excel' | 'text' | 'file';
  status: 'ready' | 'error';
  statusText: string;
  error?: string;
  previewUrl?: string;
  base64Data?: string; // For images & PDF
  textContent?: string; // For docx, txt, csv, xlsx
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function detectFileType(mimeType: string, fileName: string): 'image' | 'pdf' | 'word' | 'excel' | 'text' | 'file' {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) {
    return 'image';
  }
  if (mimeType === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    ['docx', 'doc'].includes(ext)
  ) {
    return 'word';
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    ['xlsx', 'xls'].includes(ext)
  ) {
    return 'excel';
  }
  if (mimeType.startsWith('text/') || ['txt', 'csv', 'md', 'json'].includes(ext)) {
    return 'text';
  }
  return 'file';
}

/**
 * Nén ảnh nếu kích thước lớn (> 1.5MB hoặc vượt quá 1600px) để tối ưu tốc độ và không gây lag ứng dụng.
 */
async function compressImageIfNeeded(file: File): Promise<{ base64: string; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh'));
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        reject(new Error('Dữ liệu ảnh trống'));
        return;
      }

      // Nếu ảnh nhỏ hơn 1.2MB, dùng trực tiếp
      if (file.size <= 1.2 * 1024 * 1024) {
        const cleanBase64 = dataUrl.split(',')[1] || '';
        resolve({ base64: cleanBase64, previewUrl: dataUrl });
        return;
      }

      // Nén ảnh qua Canvas
      const img = new Image();
      img.onerror = () => {
        // Fallback dùng ảnh gốc nếu canvas lỗi
        const cleanBase64 = dataUrl.split(',')[1] || '';
        resolve({ base64: cleanBase64, previewUrl: dataUrl });
      };
      img.onload = () => {
        try {
          const maxDimension = 1600;
          let width = img.width;
          let height = img.height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            const cleanBase64 = dataUrl.split(',')[1] || '';
            resolve({ base64: cleanBase64, previewUrl: dataUrl });
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const cleanBase64 = compressedDataUrl.split(',')[1] || '';
          resolve({ base64: cleanBase64, previewUrl: compressedDataUrl });
        } catch {
          const cleanBase64 = dataUrl.split(',')[1] || '';
          resolve({ base64: cleanBase64, previewUrl: dataUrl });
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Trích xuất toàn bộ văn bản từ tệp DOCX sử dụng JSZip cực nhanh (< 25ms)
 */
async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentXml = await zip.file('word/document.xml')?.async('text');

  if (!documentXml) {
    throw new Error('Tệp DOCX không chứa nội dung hợp lệ (word/document.xml).');
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(documentXml, 'text/xml');
  const paragraphs = xmlDoc.getElementsByTagName('w:p');
  const lines: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const textNodes = p.getElementsByTagName('w:t');
    let pText = '';
    for (let j = 0; j < textNodes.length; j++) {
      pText += textNodes[j].textContent || '';
    }
    if (pText.trim()) {
      lines.push(pText.trim());
    }
  }

  return lines.join('\n');
}

/**
 * Đọc bảng tính Excel (XLSX, XLS) chuyển thành dạng bảng văn bản
 */
async function extractExcelText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;
  const sections: string[] = [];

  for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (worksheet) {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      if (csv.trim()) {
        sections.push(`[Sheet: ${sheetName}]\n${csv}`);
      }
    }
  }

  return sections.join('\n\n');
}

/**
 * Đọc file PDF chuyển thành base64 để Gemini xử lý nguyên bản
 */
async function readPdfAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc tệp PDF'));
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const cleanBase64 = dataUrl.split(',')[1] || '';
      resolve(cleanBase64);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Xử lý tệp đính kèm: Kiểm tra kích thước, nhận diện định dạng và trích xuất dữ liệu phù hợp
 */
export async function processAttachmentFile(file: File): Promise<ProcessedAttachment> {
  const id = `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const fileType = detectFileType(file.type, file.name);
  const sizeFormatted = formatFileSize(file.size);

  // Kiểm tra kích thước giới hạn tối đa 10MB
  if (file.size > MAX_FILE_SIZE) {
    return {
      id,
      name: file.name,
      size: file.size,
      sizeFormatted,
      mimeType: file.type || 'application/octet-stream',
      extension: ext,
      fileType,
      status: 'error',
      statusText: 'Vượt quá 10MB',
      error: `Tệp "${file.name}" vượt quá kích thước cho phép (tối đa 10MB). Vui lòng chọn tệp nhỏ hơn.`,
    };
  }

  try {
    if (fileType === 'image') {
      const { base64, previewUrl } = await compressImageIfNeeded(file);
      return {
        id,
        name: file.name,
        size: file.size,
        sizeFormatted,
        mimeType: file.type || (ext === 'png' ? 'image/png' : 'image/jpeg'),
        extension: ext,
        fileType,
        status: 'ready',
        statusText: `Sẵn sàng • ${sizeFormatted}`,
        previewUrl,
        base64Data: base64,
      };
    }

    if (fileType === 'pdf') {
      const base64 = await readPdfAsBase64(file);
      return {
        id,
        name: file.name,
        size: file.size,
        sizeFormatted,
        mimeType: 'application/pdf',
        extension: ext,
        fileType,
        status: 'ready',
        statusText: `Sẵn sàng • ${sizeFormatted}`,
        base64Data: base64,
      };
    }

    if (fileType === 'word') {
      const textContent = await extractDocxText(file);
      return {
        id,
        name: file.name,
        size: file.size,
        sizeFormatted,
        mimeType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: ext,
        fileType,
        status: 'ready',
        statusText: `Đã đọc nội dung • ${sizeFormatted}`,
        textContent: textContent.slice(0, 45000), // An toàn hạn mức ký tự
      };
    }

    if (fileType === 'excel') {
      const textContent = await extractExcelText(file);
      return {
        id,
        name: file.name,
        size: file.size,
        sizeFormatted,
        mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: ext,
        fileType,
        status: 'ready',
        statusText: `Đã đọc bảng tính • ${sizeFormatted}`,
        textContent: textContent.slice(0, 45000),
      };
    }

    // Tệp văn bản thuần (TXT, CSV, MD...)
    const textContent = await file.text();
    return {
      id,
      name: file.name,
      size: file.size,
      sizeFormatted,
      mimeType: file.type || 'text/plain',
      extension: ext,
      fileType: 'text',
      status: 'ready',
      statusText: `Sẵn sàng • ${sizeFormatted}`,
      textContent: textContent.slice(0, 45000),
    };
  } catch (err: any) {
    console.error(`Lỗi xử lý tệp ${file.name}:`, err);
    return {
      id,
      name: file.name,
      size: file.size,
      sizeFormatted,
      mimeType: file.type || 'application/octet-stream',
      extension: ext,
      fileType,
      status: 'error',
      statusText: 'Lỗi đọc tệp',
      error: `Không thể đọc nội dung tệp "${file.name}": ${err?.message || 'Định dạng không được hỗ trợ hoặc tệp bị hỏng.'}`,
    };
  }
}
