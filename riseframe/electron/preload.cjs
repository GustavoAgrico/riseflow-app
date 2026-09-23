// Preload em CommonJS: o Electron não carrega preload ESM (.js com "type": "module").
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  platform: process.platform,
  arch: process.arch,
});
