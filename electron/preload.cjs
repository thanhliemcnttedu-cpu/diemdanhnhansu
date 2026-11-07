const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  getInstalledRole: () => ipcRenderer.invoke('get-installed-role'),
  saveRoleFile: (params) => ipcRenderer.invoke('save-role-file', params),
  readRoleFile: (params) => ipcRenderer.invoke('read-role-file', params),
  proxyDriveSync: (params) => ipcRenderer.invoke('proxy-drive-sync', params),
  proxyDrivePing: (params) => ipcRenderer.invoke('proxy-drive-ping', params),
  proxyDrivePull: (params) => ipcRenderer.invoke('proxy-drive-pull', params),
  proxyDriveAggregate: (params) => ipcRenderer.invoke('proxy-drive-aggregate', params),
  listRoleFiles: (params) => ipcRenderer.invoke('list-role-files', params)
});

