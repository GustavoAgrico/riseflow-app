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
  // Menu Ver › Abas do editor: o editor informa as abas e recebe os cliques do menu
  setEditorTabs: (state) => ipcRenderer.send('editor-tabs-state', state),
  // Menu Exportar: 'export' abre a janela de exportação; 'format:9:16' muda o formato
  onEditorCommand: (cb) => {
    const h = (_e, cmd) => cb(cmd);
    ipcRenderer.on('editor-command', h);
    return () => ipcRenderer.removeListener('editor-command', h);
  },
  onEditorTabToggle: (cb) => {
    const h = (_e, id) => cb(id);
    ipcRenderer.on('editor-tab-toggle', h);
    return () => ipcRenderer.removeListener('editor-tab-toggle', h);
  },
  platform: process.platform,
  arch: process.arch,
});
