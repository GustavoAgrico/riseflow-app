// Pastas temporárias e servidores de teste que SEMPRE são apagados/parados no fim do arquivo
// de teste — mesmo quando um teste falha. Sem isso cada `node --test` deixava centenas de MB
// em /tmp/rf-* (o servidor baixava o yt-dlp, ~40 MB, em cada DATA_DIR) e o disco enchia.
//
// Fica fora de test/ de propósito: o `node --test` roda todo .js dentro de test/.
import { after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dirs = new Set();
const procs = new Set();

/**
 * Variáveis de ambiente para um servidor de teste (`spawn(..., 'src/index.js')`): nada de
 * baixar o executável do yt-dlp/Deno da internet na subida — os testes não usam.
 */
export const TEST_SERVER_ENV = Object.freeze({ YTDLP_AUTO_DOWNLOAD: '0' });

/** `fs.mkdtempSync` em os.tmpdir() com limpeza garantida no fim do arquivo de teste. */
export function tmpDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.add(dir);
  return dir;
}

/** Marca um caminho (arquivo ou pasta) para ser apagado no fim do arquivo de teste. */
export function cleanupLater(p) {
  dirs.add(p);
  return p;
}

/** Registra um processo filho (servidor) para ser parado antes de apagar as pastas. */
export function trackProc(proc) {
  procs.add(proc);
  proc.once('exit', () => procs.delete(proc));
  return proc;
}

const running = (p) => p.exitCode === null && p.signalCode === null;

async function stop(proc) {
  if (!running(proc)) return;
  const exited = new Promise((resolve) => proc.once('exit', resolve));
  proc.kill('SIGTERM');
  const timer = setTimeout(() => { if (running(proc)) proc.kill('SIGKILL'); }, 5000);
  await exited;
  clearTimeout(timer);
}

function removeAll() {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch { /* segue */ }
  }
  dirs.clear();
}

// Para os servidores ANTES de apagar: um servidor ainda vivo escreveria de novo na pasta.
after(async () => {
  await Promise.all([...procs].map(stop));
  removeAll();
});

// Reserva: se o processo do teste sair sem passar pelo `after` (erro fatal, process.exit).
process.once('exit', () => {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { /* já saiu */ } }
  removeAll();
});
