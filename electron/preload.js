const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPort: () => ipcRenderer.invoke('get-port'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (_event, data) => callback(data));
  },
});
