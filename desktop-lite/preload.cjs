// Bản cài đặt gọn: KHÔNG cung cấp các cầu nối máy chủ/tệp cục bộ của bản cũ,
// để ứng dụng chạy đúng luồng của bản web (gọi thẳng Google Apps Script / Drive).
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('lhhpDesktop', {
  isDesktopLite: true,
  platform: process.platform,
});
