import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

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

// Auto-Update (habilitado quando distribuído via GitHub)
// Será ativado depois, quando tiver GitHub Release setup

// IPC Handlers
ipcMain.handle('get-data-dir', () => dataDir);
ipcMain.handle('get-version', () => app.getVersion());
