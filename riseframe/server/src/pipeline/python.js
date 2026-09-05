import { spawn } from 'node:child_process';

/**
 * Resolve o executável Python correto para a plataforma. No Windows o comando
 * costuma ser `python` (ou o launcher `py`), NÃO `python3` — por isso o spawn de
 * `python3` fixo falhava lá e o ASR/reframe caíam no fallback. Pode ser forçado
 * com a variável de ambiente PYTHON_BIN.
 */
const CANDIDATES = process.env.PYTHON_BIN
  ? [process.env.PYTHON_BIN]
  : process.platform === 'win32'
    ? ['python', 'py', 'python3']
    : ['python3', 'python'];

let cached;

function works(bin) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(bin, ['--version'], { stdio: 'ignore' });
    } catch {
      return resolve(false);
    }
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Retorna o primeiro executável Python que responde (memoizado por processo),
 * ou null se nenhum estiver disponível no PATH.
 * @returns {Promise<string|null>}
 */
export async function resolvePython() {
  if (cached !== undefined) return cached;
  for (const bin of CANDIDATES) {
    // eslint-disable-next-line no-await-in-loop
    if (await works(bin)) {
      cached = bin;
      return bin;
    }
  }
  cached = null;
  return null;
}
