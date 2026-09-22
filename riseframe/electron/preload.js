import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  platform: process.platform,
  arch: process.arch,
});

contextBridge.exposeInMainWorld('app', {
  isDev: process.env.NODE_ENV === 'development',
});
