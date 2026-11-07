import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const mdPath = path.resolve('docs_export/LOP_HOC_HANH_PHUC_TAI_LIEU_MO_TA_CHI_TIET.md');
const htmlPath = path.resolve('docs_export/spec.html');
const pdfPath = path.resolve('docs_export/LOP_HOC_HANH_PHUC_TAI_LIEU_MO_TA_CHI_TIET.pdf');

const mdContent = fs.readFileSync(mdPath, 'utf-8');

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let inCode = false;
  let codeLang = '';
  let codeLines = [];
  let inTable = false;
  let tableRows = [];

  function flushTable() {
    if (!inTable || tableRows.length === 0) return;
    let html = '<div class="table-container"><table>\n';
    tableRows.forEach((row, idx) => {
      if (idx === 1 && row.every(c => c.trim().match(/^:?-+:?$/))) {
        // separator row, skip
        return;
      }
      const tag = idx === 0 ? 'th' : 'td';
      html += '  <tr>\n';
      row.forEach(cell => {
        html += `    <${tag}>${formatInline(cell.trim())}</${tag}>\n`;
      });
      html += '  </tr>\n';
    });
    html += '</table></div>\n';
    out.push(html);
    inTable = false;
    tableRows = [];
  }

  function formatInline(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<div class="img-box"><div class="img-placeholder">🖼️ $1 ($2)</div></div>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.trim().startsWith('```')) {
      if (!inCode) {
        flushTable();
        inCode = true;
        codeLang = line.trim().slice(3).trim();
        codeLines = [];
      } else {
        inCode = false;
        out.push(`<pre><code class="language-${codeLang}">${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    // Tables
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const cells = line.trim().slice(1, -1).split('|');
      tableRows.push(cells);
      inTable = true;
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Empty line
    if (!line.trim()) {
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      out.push(`<h1>${formatInline(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith('## ')) {
      out.push(`<h2>${formatInline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('### ')) {
      out.push(`<h3>${formatInline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('#### ')) {
      out.push(`<h4>${formatInline(line.slice(5))}</h4>`);
      continue;
    }

    // Horizontal Rule
    if (line.trim() === '---') {
      out.push('<hr />');
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      out.push(`<blockquote>${formatInline(line.slice(2))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (line.match(/^(\s*)[*+-]\s+(.*)$/)) {
      const m = line.match(/^(\s*)[*+-]\s+(.*)$/);
      const indent = m[1].length;
      out.push(`<li style="margin-left: ${indent * 12}px;">${formatInline(m[2])}</li>`);
      continue;
    }

    // Ordered list
    if (line.match(/^(\s*)\d+\.\s+(.*)$/)) {
      const m = line.match(/^(\s*)\d+\.\s+(.*)$/);
      const indent = m[1].length;
      out.push(`<li style="margin-left: ${indent * 12}px;">${formatInline(m[2])}</li>`);
      continue;
    }

    // Paragraph
    out.push(`<p>${formatInline(line)}</p>`);
  }

  flushTable();
  return out.join('\n');
}

const htmlBody = parseMarkdown(mdContent);

const fullHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Tài Liệu Đặc Tả Chi Tiết Hệ Thống - Lớp Học Hạnh Phúc v4.0</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

    @page {
      size: A4;
      margin: 15mm 15mm 18mm 15mm;
      @bottom-right {
        content: counter(page);
      }
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 10pt;
      line-height: 1.6;
      color: #1e293b;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
    }

    h1 {
      font-size: 18pt;
      font-weight: 800;
      color: #1e3a8a;
      border-bottom: 2.5px solid #2563eb;
      padding-bottom: 6px;
      margin-top: 28px;
      margin-bottom: 14px;
      page-break-after: avoid;
      text-transform: uppercase;
    }

    h2 {
      font-size: 13.5pt;
      font-weight: 700;
      color: #0369a1;
      border-left: 4px solid #0284c7;
      padding-left: 10px;
      margin-top: 24px;
      margin-bottom: 12px;
      page-break-after: avoid;
    }

    h3 {
      font-size: 11.5pt;
      font-weight: 600;
      color: #0f766e;
      margin-top: 18px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }

    h4 {
      font-size: 10.5pt;
      font-weight: 600;
      color: #475569;
      margin-top: 14px;
      margin-bottom: 6px;
      page-break-after: avoid;
    }

    p {
      margin: 0 0 10px 0;
      text-align: justify;
    }

    blockquote {
      border-left: 4px solid #3b82f6;
      background: #eff6ff;
      padding: 10px 14px;
      border-radius: 0 8px 8px 0;
      margin: 12px 0;
      color: #1e40af;
      font-size: 9.5pt;
    }

    hr {
      border: none;
      border-top: 1px solid #cbd5e1;
      margin: 20px 0;
    }

    /* Tables */
    .table-container {
      margin: 14px 0;
      page-break-inside: avoid;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      border-radius: 6px;
      overflow: hidden;
    }

    th, td {
      border: 1px solid #cbd5e1;
      padding: 7px 10px;
      text-align: left;
    }

    th {
      background-color: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 8.5pt;
    }

    tr:nth-child(even) {
      background-color: #f8fafc;
    }

    /* Code blocks */
    code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 8.5pt;
      background: #f1f5f9;
      color: #b91c1c;
      padding: 2px 5px;
      border-radius: 4px;
    }

    pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 12px 14px;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 8.2pt;
      line-height: 1.45;
      overflow-x: auto;
      margin: 10px 0;
      page-break-inside: avoid;
    }

    pre code {
      background: transparent;
      color: #f8fafc;
      padding: 0;
    }

    li {
      margin-bottom: 4px;
      list-style-type: disc;
    }

    .img-box {
      margin: 12px 0;
      page-break-inside: avoid;
      text-align: center;
    }

    .img-placeholder {
      display: inline-block;
      padding: 12px 20px;
      background: #f1f5f9;
      border: 2px dashed #94a3b8;
      border-radius: 8px;
      color: #334155;
      font-weight: 600;
      font-size: 9.5pt;
    }

    a {
      color: #2563eb;
      text-decoration: none;
    }
  </style>
</head>
<body>
  ${htmlBody}
</body>
</html>`;

fs.writeFileSync(htmlPath, fullHtml, 'utf-8');
console.log('Successfully wrote spec.html');

// Run Edge headless print
try {
  const edge = "C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe";
  const userData = "C:\\\\Users\\\\THANH_LIEM_PRO\\\\AppData\\\\Local\\\\Temp\\\\edge_pdf_profile";
  const cmd = `"${edge}" --headless --disable-gpu --no-first-run --user-data-dir="${userData}" --print-to-pdf="${pdfPath}" "${htmlPath}"`;
  execSync(cmd, { stdio: 'inherit' });
  const stat = fs.statSync(pdfPath);
  console.log(`Successfully generated PDF! Size: ${stat.size} bytes`);
} catch (err) {
  console.error('Error generating PDF:', err);
}
