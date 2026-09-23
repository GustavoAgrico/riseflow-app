import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron';
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

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

function findNodePath() {
  // Em desenvolvimento, usa 'node' do PATH
  if (isDev) {
    console.log('Modo desenvolvimento: usando "node" do PATH');
    return 'node';
  }

  console.log('=== Procurando Node.js ===');

  // Método 1: Tentar 'where node' no Windows
  try {
    const result = spawnSync('where', ['node'], {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 5000
    });
    if (result.stdout && result.status === 0) {
      const nodePath = result.stdout.trim().split('\n')[0];
      if (nodePath && existsSync(nodePath)) {
        console.log(`✓ Encontrado via 'where': ${nodePath}`);
        // Valida se o caminho funciona
        try {
          const versionResult = spawnSync(nodePath, ['--version'], {
            encoding: 'utf-8',
            timeout: 5000
          });
          if (versionResult.status === 0) {
            console.log(`✓ Node.js validado: ${versionResult.stdout.trim()}`);
            return nodePath;
          }
        } catch (e) {
          console.warn(`⚠ Node encontrado mas não validado: ${e.message}`);
        }
      }
    } else {
      console.warn(`⚠ 'where node' retornou erro ou vazio (status: ${result.status})`);
    }
  } catch (e) {
    console.warn(`⚠ Erro ao executar 'where node': ${e.message}`);
  }

  // Método 2: Caminhos comuns no Windows
  const commonPaths = [
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
    path.join(process.env.APPDATA || '', '..', 'Local', 'Programs', 'nodejs', 'node.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
    path.join(process.env.ProgramW6432 || '', 'nodejs', 'node.exe'),
  ];

  for (const p of commonPaths) {
    if (p && existsSync(p)) {
      console.log(`✓ Encontrado em caminho comum: ${p}`);
      // Valida se funciona
      try {
        const versionResult = spawnSync(p, ['--version'], {
          encoding: 'utf-8',
          timeout: 5000
        });
        if (versionResult.status === 0) {
          console.log(`✓ Node.js validado: ${versionResult.stdout.trim()}`);
          return p;
        }
      } catch (e) {
        console.warn(`⚠ Encontrado mas não validado: ${p}`);
      }
    }
  }

  // Método 3: Procurar no registro do Windows
  try {
    const { execSync } = require('child_process');
    const result = execSync('reg query "HKLM\\Software\\Node.js" /v InstallPath 2>nul', {
      encoding: 'utf-8'
    }).match(/InstallPath\s+REG_SZ\s+(.+)/);

    if (result && result[1]) {
      const installPath = path.join(result[1].trim(), 'node.exe');
      if (existsSync(installPath)) {
        console.log(`✓ Encontrado no registro: ${installPath}`);
        const versionResult = spawnSync(installPath, ['--version'], {
          encoding: 'utf-8',
          timeout: 5000
        });
        if (versionResult.status === 0) {
          console.log(`✓ Node.js validado: ${versionResult.stdout.trim()}`);
          return installPath;
        }
      }
    }
  } catch (e) {
    console.warn(`⚠ Registro do Windows não encontrado`);
  }

  console.warn('⚠⚠ Node.js NÃO ENCONTRADO! Usando fallback "node"');
  console.warn('   O app pode não funcionar sem Node.js instalado globalmente.');
  console.warn('   Instale de: https://nodejs.org/');

  return 'node';
}

function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(projectRoot, 'server/src/index.js');
    const nodePath = findNodePath();

    console.log(`\n=== Iniciando Express Server ===`);
    console.log(`Node.js: ${nodePath}`);
    console.log(`Servidor: ${serverPath}`);
    console.log(`Diretório de dados: ${dataDir}`);

    // Verifica se o arquivo do servidor existe
    if (!existsSync(serverPath)) {
      const error = new Error(`Arquivo do servidor não encontrado: ${serverPath}`);
      console.error('✗ ERRO:', error.message);
      reject(error);
      return;
    }

    // Passa variáveis de ambiente necessárias
    const env = {
      ...process.env,
      NODE_ENV: isDev ? 'development' : 'production',
      PORT: 3333,
      CORS_ORIGIN: 'http://localhost:5174,http://localhost:3000',
      DATA_DIR: dataDir,
      WHISPER_MODEL: 'base',
      TRANSCRIBE_PROVIDER: 'whisper-local',
      BILLING_MODE: 'off', // app local: sem limites de créditos/planos
    };

    console.log('Spawning processo...');

    serverProcess = spawn(nodePath, [serverPath], {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
      detached: false,
    });

    serverProcess.on('error', (error) => {
      console.error('\n✗✗✗ ERRO AO INICIAR SERVIDOR ✗✗✗');
      console.error(`Código do erro: ${error.code}`);
      console.error(`Mensagem: ${error.message}`);
      console.error(`Path: ${nodePath}`);

      if (error.code === 'ENOENT') {
        console.error('\n⚠ Node.js não encontrado! Possíveis soluções:');
        console.error('  1. Instale Node.js de https://nodejs.org/');
        console.error('  2. Adicione Node.js ao PATH do Windows');
        console.error('  3. Reinicie o computador após instalar Node.js');
      }

      reject(error);
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(`\nServidor encerrado (código: ${code}, sinal: ${signal})`);
    });

    // Aguarda um pouco para o servidor inicializar
    setTimeout(() => {
      console.log('✓ Servidor iniciado com sucesso');
      resolve();
    }, 2000);
  });
}

app.on('ready', async () => {
  try {
    await startServer();
    await createWindow();
  } catch (error) {
    console.error('\n✗✗✗ ERRO CRÍTICO ✗✗✗');
    console.error(error);

    // Mostra erro em dialog para o usuário
    dialog.showErrorBox(
      'Erro ao Iniciar Riseframe',
      `Não foi possível iniciar o aplicativo.\n\nErro: ${error.message}\n\n` +
      `Verifique se você tem Node.js instalado em seu sistema.\n` +
      `Baixe de: https://nodejs.org/\n\n` +
      `Após instalar Node.js, reinicie o computador e tente novamente.`
    );

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
