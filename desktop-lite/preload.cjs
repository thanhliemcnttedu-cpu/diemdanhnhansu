// Bản cài đặt gọn: KHÔNG cung cấp các cầu nối máy chủ/tệp cục bộ của bản cũ,
// để ứng dụng chạy đúng luồng của bản web (gọi thẳng Google Apps Script / Drive).
// Only the hot-update bridge is exposed (see updater.cjs): read state, check, apply, confirm start.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lhhpDesktop', {
  isDesktopLite: true,
  platform: process.platform,
  // Offline data folder (see main.cjs): relative paths only, confined to the folder the user chose
  offline: {
    info: () => ipcRenderer.invoke('lhhp-offline:info'),
    choose: () => ipcRenderer.invoke('lhhp-offline:choose'),
    useSuggested: () => ipcRenderer.invoke('lhhp-offline:use-suggested'),
    open: () => ipcRenderer.invoke('lhhp-offline:open'),
    read: (relPath) => ipcRenderer.invoke('lhhp-offline:read', relPath),
    write: (relPath, text) => ipcRenderer.invoke('lhhp-offline:write', relPath, text),
    list: (relDir) => ipcRenderer.invoke('lhhp-offline:list', relDir),
    remove: (relPath) => ipcRenderer.invoke('lhhp-offline:remove', relPath),
  },
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
