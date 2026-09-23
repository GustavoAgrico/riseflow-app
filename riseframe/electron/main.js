import { app, BrowserWindow, Menu, ipcMain, dialog, shell } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import net from 'net';
import http from 'http';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'fs';

// Riseframe Desktop: sobe o servidor do Riseframe (o mesmo do site) em segundo plano e
// abre a janela apontando para ele. Não precisa de Node.js instalado: o servidor roda
// com o próprio Node embutido no Electron (ELECTRON_RUN_AS_NODE).

const isDev = !app.isPackaged;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const userDataPath = app.getPath('userData');
// Dados (vídeos, contas) ficam fora da pasta do programa: sobrevivem a reinstalações.
const dataDir = path.join(userDataPath, 'riseframe-data');
const logsDir = path.join(userDataPath, 'logs');
const logFile = path.join(logsDir, 'server.log');
// Chaves de API do usuário (Deepgram, Pexels, Anthropic...). Menu → Configurar chaves.
const keysFile = path.join(userDataPath, 'chaves.env');

for (const dir of [dataDir, logsDir]) mkdirSync(dir, { recursive: true });

const KEYS_TEMPLATE = `# Chaves do Riseframe (este arquivo fica só no seu computador).
# Preencha depois do "=" e salve. Depois feche e abra o Riseframe de novo.

# Transcrição (legendas). Com a chave da Deepgram fica rápido e preciso.
# Sem ela, o app tenta o Whisper local (precisa de Python + faster-whisper).
DEEPGRAM_API_KEY=

# B-roll automático (vídeos do Pexels)
PEXELS_API_KEY=

# IA: análise do vídeo, escolha de B-roll e correção de fala (Claude)
ANTHROPIC_API_KEY=

# Imagens do Google no B-roll (opcional)
GOOGLE_CSE_KEY=
GOOGLE_CSE_ID=
`;

let mainWindow = null;
let serverProcess = null;
let serverPort = 0;

/** Lê um arquivo KEY=valor (ignora comentários e linhas vazias). */
function readEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    val = val.replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '');
    if (val) out[key] = val;
  }
  return out;
}

function ensureKeysFile() {
  if (!existsSync(keysFile)) writeFileSync(keysFile, KEYS_TEMPLATE, 'utf-8');
}

// Porta fixa: o login fica salvo por endereço, então mudar de porta a cada abertura
// deslogaria o usuário. Só cai para uma porta livre se esta estiver ocupada.
const PREFERRED_PORT = 47321;

function listenOn(port) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => {
      const { port: got } = srv.address();
      srv.close(() => resolve(got));
    });
  });
}

async function freePort() {
  try {
    return await listenOn(PREFERRED_PORT);
  } catch {
    return listenOn(0);
  }
}

/** Espera o servidor responder em /api/health (ou falha se ele cair antes). */
function waitForServer(port, timeoutMs = 90_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (!serverProcess || serverProcess.exitCode !== null) {
        reject(new Error('o servidor fechou logo ao iniciar'));
        return;
      }
      const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) reject(new Error('o servidor demorou demais para responder'));
      else setTimeout(tick, 400);
    };
    tick();
  });
}

async function startServer() {
  const serverPath = path.join(projectRoot, 'server', 'src', 'index.js');
  if (!existsSync(serverPath)) throw new Error(`arquivo do servidor não encontrado: ${serverPath}`);

  serverPort = await freePort();
  const keys = readEnvFile(keysFile);
  const origin = `http://127.0.0.1:${serverPort}`;
  const env = {
    ...process.env,
    ...keys,
    ELECTRON_RUN_AS_NODE: '1', // roda o Electron como Node puro (sem instalar Node.js)
    NODE_ENV: 'production',
    PORT: String(serverPort),
    CORS_ORIGIN: `${origin},http://localhost:${serverPort}`,
    APP_URL: origin,
    DATA_DIR: dataDir,
    BILLING_MODE: 'off', // app local: sem limites de créditos/planos
    TRANSCRIBE_PROVIDER: keys.TRANSCRIBE_PROVIDER || (keys.DEEPGRAM_API_KEY ? 'deepgram' : 'whisper-local'),
  };

  const log = createWriteStream(logFile, { flags: 'w' });
  log.write(`Riseframe ${app.getVersion()} · ${new Date().toISOString()}\nservidor: ${serverPath}\nporta: ${serverPort}\ndados: ${dataDir}\n\n`);

  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: path.join(projectRoot, 'server'),
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.pipe(log, { end: false });
  serverProcess.stderr.pipe(log, { end: false });
  if (isDev) {
    serverProcess.stdout.pipe(process.stdout);
    serverProcess.stderr.pipe(process.stderr);
  }
  serverProcess.on('exit', (code) => log.write(`\n[servidor encerrado · código ${code}]\n`));

  await waitForServer(serverPort);
}

function lastLogLines(n = 12) {
  try {
    return readFileSync(logFile, 'utf-8').trim().split(/\r?\n/).slice(-n).join('\n');
  } catch {
    return '';
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0b0b10',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  // Links externos (pagamento, ajuda) abrem no navegador, não dentro do app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  // Em desenvolvimento (npm run dev:all) o Vite serve o site em :5174 com o servidor em :4000.
  mainWindow.loadURL(isDev && !serverProcess ? 'http://localhost:5174' : `http://127.0.0.1:${serverPort}`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function stopServer() {
  if (serverProcess && serverProcess.exitCode === null) serverProcess.kill();
  serverProcess = null;
}

app.on('ready', async () => {
  ensureKeysFile();
  buildMenu();
  // Em dev, o `npm run dev:all` já sobe o servidor; só abrimos a janela.
  if (isDev && process.env.RISEFRAME_SPAWN_SERVER !== '1') {
    createWindow();
    return;
  }
  try {
    await startServer();
    createWindow();
  } catch (error) {
    stopServer();
    const tail = lastLogLines();
    dialog.showErrorBox(
      'Não foi possível iniciar o Riseframe',
      `Erro: ${error.message}\n\n${tail ? `Últimas linhas do registro:\n${tail}\n\n` : ''}` +
        `Registro completo: ${logFile}\nMande um print desta mensagem para o suporte.`,
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', stopServer);

app.on('activate', () => {
  if (mainWindow === null && serverPort) createWindow();
});

function buildMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Configurar chaves (Deepgram, Pexels, IA)…',
          click: async () => {
            ensureKeysFile();
            await shell.openPath(keysFile);
            dialog.showMessageBox({
              type: 'info',
              message: 'Preencha as chaves no arquivo que abriu, salve e depois feche e abra o Riseframe de novo.',
            });
          },
        },
        { label: 'Abrir pasta dos vídeos e dados', click: () => shell.openPath(dataDir) },
        { label: 'Abrir registro do servidor (log)', click: () => shell.openPath(logFile) },
        { type: 'separator' },
        { label: 'Sair', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('get-data-dir', () => dataDir);
ipcMain.handle('get-version', () => app.getVersion());
