// Bản cài đặt gọn: KHÔNG cung cấp các cầu nối máy chủ/tệp cục bộ của bản cũ,
// để ứng dụng chạy đúng luồng của bản web (gọi thẳng Google Apps Script / Drive).
// Only the hot-update bridge is exposed (see updater.cjs): read state, check, apply, confirm start.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lhhpDesktop', {
  isDesktopLite: true,
  platform: process.platform,
  update: {
    getInfo: () => ipcRenderer.invoke('lhhp-update:info'),
    check: () => ipcRenderer.invoke('lhhp-update:check'),
    apply: () => ipcRenderer.invoke('lhhp-update:apply'),
    uiReady: () => ipcRenderer.invoke('lhhp-update:ui-ready'),
    onState: (callback) => {
      const listener = (_event, info) => { try { callback(info); } catch (_) { /* ignore */ } };
      ipcRenderer.on('lhhp-update:state', listener);
      return () => ipcRenderer.removeListener('lhhp-update:state', listener);
    },
  },
});
