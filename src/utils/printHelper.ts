/**
 * Dedicated A4 PDF Export & Print Helper for AI Studio and browser iframe environments.
 * Uses jsPDF and html-to-image to generate real downloadable PDF files without sandbox/iframe restrictions.
 */

import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';

/**
 * Directly exports an HTML element to a standard A4 PDF file.
 * Handles both 'portrait' and 'landscape' orientations.
 */
export async function exportElementToPdf(
  elementIdOrElement: string | HTMLElement,
  fileName = 'Tai_Lieu_In_A4.pdf',
  orientation: 'portrait' | 'landscape' = 'portrait',
  title = 'Tài Liệu In Chuẩn A4'
): Promise<boolean> {
  const el = typeof elementIdOrElement === 'string'
    ? document.getElementById(elementIdOrElement)
    : elementIdOrElement;

  if (!el) {
    console.error(`Không tìm thấy phần tử để xuất PDF:`, elementIdOrElement);
    return false;
  }

  try {
    // 1. Render element to crisp PNG
    const dataUrl = await toPng(el, {
      quality: 0.98,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      filter: (node) => {
        // Exclude elements marked no-print or buttons
        if (node instanceof HTMLElement) {
          if (node.classList.contains('no-print') || node.classList.contains('no-pdf')) {
            return false;
          }
        }
        return true;
      }
    });

    // 2. Initialize jsPDF
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pageWidth = orientation === 'landscape' ? 297 : 210;
    const pageHeight = orientation === 'landscape' ? 210 : 297;
    // Tinh chỉnh lề in ấn tối thiểu 0.25cm (2.5mm) theo chuẩn in ấn để tận dụng tối đa diện tích khổ A4
    const margin = 2.5;
    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;

    // 3. Calculate dimension preserving aspect ratio
    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });

    const imgWidth = img.naturalWidth || el.offsetWidth || 1;
    const imgHeight = img.naturalHeight || el.offsetHeight || 1;
    const aspectRatio = imgWidth / imgHeight;
    const targetAspect = printableWidth / printableHeight;

    let renderWidth = printableWidth;
    let renderHeight = renderWidth / aspectRatio;

    // Tự động căn chuẩn nếu tỷ lệ khung gần khớp với khổ A4 (sai lệch < 7%) để vừa khít 100% không thừa giấy
    if (Math.abs(aspectRatio - targetAspect) / targetAspect < 0.07) {
      renderWidth = printableWidth;
      renderHeight = printableHeight;
    } else if (renderHeight > printableHeight) {
      renderHeight = printableHeight;
      renderWidth = renderHeight * aspectRatio;
    }

    const posX = margin + (printableWidth - renderWidth) / 2;
    const posY = margin + (printableHeight - renderHeight) / 2;

    pdf.setProperties({
      title: title,
      subject: 'Lớp Học Hạnh Phúc - Hệ Sinh Thái Quản Lý Lớp Học',
      author: 'Lớp Học Hạnh Phúc',
      creator: 'Lớp Học Hạnh Phúc'
    });

    pdf.addImage(dataUrl, 'PNG', posX, posY, renderWidth, renderHeight, undefined, 'FAST');
    
    // Ensure filename ends with .pdf
    const finalFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    pdf.save(finalFileName);

    return true;
  } catch (err) {
    console.error('Lỗi khi xuất file PDF bằng jsPDF:', err);
    // Fallback to printable HTML download
    downloadPrintableHtml(
      typeof elementIdOrElement === 'string' ? elementIdOrElement : el.id || 'printable-area',
      fileName.replace(/\.pdf$/, '.html'),
      title,
      orientation
    );
    return false;
  }
}

export interface ExportImageOptions {
  forceA4Ratio?: boolean;
  pixelRatio?: number;
  width?: number;
  backgroundColor?: string;
}

/**
 * Directly exports an HTML element to a high-resolution PNG image file.
 * Handles both 'portrait' and 'landscape' synthesized formats with 2x retina clarity.
 * Supports forceA4Ratio to guarantee exact 297:210 (Landscape) or 210:297 (Portrait) A4 proportions.
 */
export async function exportElementToImagePng(
  elementIdOrElement: string | HTMLElement,
  fileName = 'Bao_Cao_Tong_Hop.png',
  orientation: 'portrait' | 'landscape' = 'landscape',
  title = 'Báo Cáo Điểm Danh Tổng Hợp',
  options?: ExportImageOptions
): Promise<boolean> {
  const el = typeof elementIdOrElement === 'string'
    ? document.getElementById(elementIdOrElement)
    : elementIdOrElement;

  if (!el) {
    console.error(`Không tìm thấy phần tử để xuất ảnh PNG:`, elementIdOrElement);
    return false;
  }

  try {
    const targetWidth = options?.width || (orientation === 'landscape' ? 1414 : 1000);
    const customStyle: Record<string, string> = options?.forceA4Ratio ? {
      width: `${targetWidth}px`,
      maxWidth: `${targetWidth}px`,
      minWidth: `${targetWidth}px`,
      margin: '0',
      borderRadius: '0px',
      boxShadow: 'none'
    } : {};

    const dataUrl = await toPng(el, {
      quality: 1,
      pixelRatio: options?.pixelRatio || 2, // High resolution for clear Vietnamese typography and tables
      backgroundColor: options?.backgroundColor || '#ffffff',
      style: options?.forceA4Ratio ? customStyle : undefined,
      filter: (node) => {
        if (node instanceof HTMLElement) {
          if (
            node.classList.contains('no-print') || 
            node.classList.contains('no-pdf') || 
            node.classList.contains('no-png') ||
            node.classList.contains('no-export')
          ) {
            return false;
          }
        }
        return true;
      }
    });

    const finalFileName = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
    const link = document.createElement('a');
    link.download = finalFileName;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (err) {
    console.error('Lỗi khi xuất file ảnh PNG:', err);
    return false;
  }
}

/**
 * Exports multiple HTML elements as sequential pages in a single A4 PDF file.
 * Perfect for 2-page or multi-page A4 Infographics and student rosters.
 */
export async function exportMultipleElementsToPdf(
  elementIdsOrElements: (string | HTMLElement)[],
  fileName = 'Infographic_Lop_A4.pdf',
  orientation: 'portrait' | 'landscape' = 'portrait',
  title = 'Infographic Lớp Học Toàn Diện'
): Promise<boolean> {
  try {
    const validElements: HTMLElement[] = [];
    for (const item of elementIdsOrElements) {
      const el = typeof item === 'string' ? document.getElementById(item) : item;
      if (el) validElements.push(el);
    }

    if (validElements.length === 0) {
      console.error('Không tìm thấy phần tử nào để xuất PDF nhiều trang');
      return false;
    }

    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pageWidth = orientation === 'landscape' ? 297 : 210;
    const pageHeight = orientation === 'landscape' ? 210 : 297;
    // Tinh chỉnh lề in ấn tối thiểu 0.25cm (2.5mm) theo chuẩn in ấn để tận dụng tối đa diện tích khổ A4
    const margin = 2.5;
    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;

    pdf.setProperties({
      title: title,
      subject: 'Lớp Học Hạnh Phúc - Hệ Sinh Thái Quản Lý Lớp Học',
      author: 'Lớp Học Hạnh Phúc',
      creator: 'Lớp Học Hạnh Phúc'
    });

    for (let i = 0; i < validElements.length; i++) {
      const el = validElements[i];

      if (i > 0) {
        pdf.addPage('a4', orientation);
      }

      const dataUrl = await toPng(el, {
        quality: 0.98,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });

      const img = new Image();
      img.src = dataUrl;
      await new Promise((res) => {
        img.onload = res;
        img.onerror = res;
      });

      const imgWidth = img.naturalWidth || el.offsetWidth || 1;
      const imgHeight = img.naturalHeight || el.offsetHeight || 1;
      const aspectRatio = imgWidth / imgHeight;
      const targetAspect = printableWidth / printableHeight;

      let renderWidth = printableWidth;
      let renderHeight = renderWidth / aspectRatio;

      // Tự động căn chuẩn nếu tỷ lệ khung gần khớp với khổ A4 (sai lệch < 7%) để vừa khít 100% không thừa giấy
      if (Math.abs(aspectRatio - targetAspect) / targetAspect < 0.07) {
        renderWidth = printableWidth;
        renderHeight = printableHeight;
      } else if (renderHeight > printableHeight) {
        renderHeight = printableHeight;
        renderWidth = renderHeight * aspectRatio;
      }

      const posX = margin + (printableWidth - renderWidth) / 2;
      const posY = margin + (printableHeight - renderHeight) / 2;

      pdf.addImage(dataUrl, 'PNG', posX, posY, renderWidth, renderHeight, undefined, 'FAST');
    }

    const finalFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    pdf.save(finalFileName);
    return true;
  } catch (err) {
    console.error('Lỗi khi xuất nhiều trang PDF:', err);
    return false;
  }
}

/**
 * Enhanced print function: tries direct PDF export first to prevent iframe crashes,
 * or handles iframe safe printing if requested.
 */
export async function printHtmlElement(
  elementId: string, 
  title = 'In Bản A4', 
  orientation: 'portrait' | 'landscape' = 'portrait'
) {
  // Directly export as PDF by default to avoid browser iframe printing bugs
  const fileName = `${title.replace(/[\s\/\\]+/g, '_')}_A4.pdf`;
  const success = await exportElementToPdf(elementId, fileName, orientation, title);
  if (!success) {
    // If PDF export fails, fallback to browser print portal
    const sourceEl = document.getElementById(elementId);
    if (!sourceEl) {
      window.print();
      return;
    }

    let printPortal = document.getElementById('app-print-portal');
    if (!printPortal) {
      printPortal = document.createElement('div');
      printPortal.id = 'app-print-portal';
      document.body.appendChild(printPortal);
    }

    const contentClone = sourceEl.cloneNode(true) as HTMLElement;
    contentClone.style.display = 'block';
    contentClone.style.visibility = 'visible';

    printPortal.innerHTML = '';
    const pageStyle = document.createElement('style');
    pageStyle.id = 'dynamic-print-page-style';
    pageStyle.textContent = `
      @page {
        size: A4 ${orientation};
        margin: ${orientation === 'landscape' ? '2.5mm' : '3mm'};
      }
    `;
    printPortal.appendChild(pageStyle);
    printPortal.appendChild(contentClone);

    const prevTitle = document.title;
    document.title = title;
    document.body.classList.add('app-is-printing');

    const cleanup = () => {
      document.body.classList.remove('app-is-printing');
      document.title = prevTitle;
      const dynamicStyle = document.getElementById('dynamic-print-page-style');
      if (dynamicStyle) dynamicStyle.remove();
      if (printPortal) printPortal.innerHTML = '';
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);

    setTimeout(() => {
      try {
        window.print();
      } catch (e) {
        console.warn('Direct print error:', e);
      } finally {
        setTimeout(cleanup, 2500);
      }
    }, 120);
  }
}

/**
 * Downloads a standalone, self-contained printable HTML file for offline printing
 */
export function downloadPrintableHtml(
  elementId: string, 
  fileName = 'Ban_In_A4.html', 
  title = 'Bản In Chuẩn A4',
  orientation: 'portrait' | 'landscape' = 'portrait'
) {
  const sourceEl = document.getElementById(elementId);
  if (!sourceEl) return;

  const content = sourceEl.innerHTML;
  const fullHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 ${orientation};
      margin: ${orientation === 'landscape' ? '2.5mm' : '3mm'};
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: 'Be Vietnam Pro', system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 15px;
      color: #0f172a;
      background: #ffffff;
      font-size: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
    }
    th, td {
      border: 1px solid #64748b;
      padding: 6px 8px;
    }
    th {
      background-color: #f1f5f9 !important;
      font-weight: bold;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .font-bold { font-weight: 700; }
    .font-black { font-weight: 900; }
    .uppercase { text-transform: uppercase; }
    .italic { font-style: italic; }
    .grid { display: grid; }
    .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .flex { display: flex; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .no-print { display: none !important; }
  </style>
</head>
<body onload="window.print()">
  ${content}
</body>
</html>`;

  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Xuất lần lượt nhiều trang thành các ảnh PNG khổ ngang chuẩn A4 (2, 3 hoặc 4 ảnh).
 * Tự động tải về tuần tự từng file ảnh sắc nét 2x Retina với tỷ lệ chuẩn 297mm x 210mm.
 */
export async function exportMultipleElementsToImagesPng(
  elements: (HTMLElement | null)[],
  baseFileName = 'Bao_Cao_A4_Ngang',
  options?: ExportImageOptions
): Promise<number> {
  let count = 0;
  const validElements = elements.filter(Boolean) as HTMLElement[];
  if (validElements.length === 0) return 0;

  for (let i = 0; i < validElements.length; i++) {
    const el = validElements[i];
    const pageIndex = i + 1;
    const fileName = `${baseFileName}_Trang_${pageIndex}.png`;
    const ok = await exportElementToImagePng(
      el,
      fileName,
      'landscape',
      `Báo Cáo Thống Kê Trang ${pageIndex}`,
      { forceA4Ratio: true, pixelRatio: 2, ...options }
    );
    if (ok) count++;
    // Đợi 400ms giữa các lần tải để trình duyệt tải đủ các ảnh mà không bị chặn pop-up
    await new Promise(r => setTimeout(r, 400));
  }
  return count;
}
