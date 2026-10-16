// Preload em CommonJS: o Electron não carrega preload ESM (.js com "type": "module").
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Caminho do arquivo escolhido no computador (o Electron 32 não expõe mais File.path):
  // o projeto guarda o original, como no CapCut, em vez de uma cópia que expira.
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch {
      return '';
    }
  },
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  platform: process.platform,
  arch: process.arch,
});
