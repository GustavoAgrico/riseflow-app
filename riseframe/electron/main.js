import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import isDev from 'electron-is-dev';
import { autoUpdater } from 'electron-updater';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const userDataPath = app.getPath('userData');
const dataDir = path.join(userDataPath, 'riseframe-data');

// Garante que o diretório de dados existe
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

let mainWindow;
let serverProcess;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  });

  const startUrl = isDev
    ? 'http://localhost:5174'
    : `file://${path.join(__dirname, '../web/dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(projectRoot, 'server/src/index.js');

    // Passa variáveis de ambiente necessárias
    const env = {
      ...process.env,
      NODE_ENV: isDev ? 'development' : 'production',
      PORT: 3333,
      CORS_ORIGIN: 'http://localhost:5174,http://localhost:3000',
      DATA_DIR: dataDir,
      WHISPER_MODEL: 'base',
      TRANSCRIBE_PROVIDER: 'whisper-local',
    };

    serverProcess = spawn('node', [serverPath], {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
    });

    serverProcess.on('error', (error) => {
      console.error('Erro ao iniciar servidor:', error);
      reject(error);
    });

    // Aguarda um pouco para o servidor inicializar
    setTimeout(() => resolve(), 2000);
  });
}

app.on('ready', async () => {
  try {
    await startServer();
    await createWindow();
    setupAutoUpdate();
  } catch (error) {
    console.error('Erro ao iniciar aplicação:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Menu
const template = [
  {
    label: 'Arquivo',
    submenu: [
      {
        label: 'Sair',
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          app.quit();
        },
      },
    ],
  },
  {
    label: 'Editar',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
    ],
  },
  {
    label: 'Ver',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  },
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

// Auto-Update
function setupAutoUpdate() {
  if (isDev) return;

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Atualização Disponível',
      message: 'Uma nova versão do Riseframe está disponível.',
      detail: 'A atualização será instalada quando você fechar a aplicação.',
      buttons: ['OK'],
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Atualização Pronta',
        message: 'A atualização foi baixada e está pronta para instalar.',
        detail: 'A aplicação será reiniciada agora.',
        buttons: ['Reiniciar Agora', 'Depois'],
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on('error', (error) => {
    console.error('Erro ao atualizar:', error);
  });
}

// IPC Handlers
ipcMain.handle('get-data-dir', () => dataDir);
ipcMain.handle('get-version', () => app.getVersion());
ipcMain.handle('check-for-updates', async () => {
  const result = await autoUpdater.checkForUpdates();
  return result;
});
