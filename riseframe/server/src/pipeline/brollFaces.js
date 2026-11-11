// Rostos do B-roll (para o enquadramento automático — ver shared/brollFocus.js).
// Roda o broll_faces.py (OpenCV); sem Python/OpenCV, o detector em JavaScript (faceHaar.js).
// Sem rosto, devolve null e o B-roll fica com o enquadramento padrão: nunca trava o render.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolvePython } from './python.js';
import { detectFacesJs } from './faceHaar.js';
import { trackChild } from '../jobContext.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('broll-faces');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Rostos de um arquivo local (imagem, ou o quadro em `at` s de um vídeo).
 * @returns {Promise<{aspect:number, faces:Array<{x,y,w,h}>}|null>}
 */
export async function detectFaces(file, opts = {}) {
  const viaPy = await detectFacesPy(file, opts);
  if (viaPy !== undefined) return viaPy;
  // sem Python/OpenCV (app de PC): o detector em JavaScript, mesmo classificador do OpenCV
  try {
    return await detectFacesJs(file, opts);
  } catch (err) {
    log.info(`rostos não detectados (detector JS: ${err.message})`);
    return null;
  }
}

/** undefined = Python/OpenCV indisponível (quem chama tenta o detector JS). */
async function detectFacesPy(file, { at = 0.5, timeoutMs = 20000 } = {}) {
  const py = await resolvePython();
  if (!py) return undefined;
  const script = path.join(__dirname, 'broll_faces.py');
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let proc;
    try {
      proc = trackChild(spawn(py, [script, file, String(at)]));
    } catch {
      return resolve(undefined);
    }
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', () => { clearTimeout(timer); resolve(undefined); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 3) return resolve(undefined); // sem OpenCV 4.x
      if (code !== 0) {
        log.info(`rostos não detectados (${err.trim().split('\n').pop() || `code ${code}`})`);
        return resolve(null);
      }
      try {
        const d = JSON.parse(out);
        resolve(Number(d.aspect) > 0 && Array.isArray(d.faces) ? { aspect: Number(d.aspect), faces: d.faces } : null);
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Endereço público de imagem? Só http(s), sem localhost/rede interna (a rota baixa o que o
 * cliente manda: não pode virar porta para a rede do servidor).
 */
export function isPublicUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || ''));
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  const ipv = net.isIP(host);
  if (ipv === 4) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return false;
  } else if (ipv === 6) {
    if (host === '::1' || host === '::' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('::ffff:')) return false;
  }
  return true;
}

// Mesma imagem pedida de novo (trocar de momento, reabrir o projeto): não baixa outra vez.
const cache = new Map();
const CACHE_MAX = 500;

/**
 * Rostos de uma imagem da web (a miniatura que a prévia mostra). Baixa até 8 MB.
 * @param {(url:string, dest:string, caps:object) => Promise<string>} download
 */
export async function detectFacesAtUrl(url, download) {
  if (!isPublicUrl(url)) return null;
  if (cache.has(url)) return cache.get(url);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rf-faces-'));
  try {
    const dest = path.join(dir, 'img');
    await download(url, dest, { maxBytes: 8e6, timeoutMs: 15000 });
    const det = await detectFaces(dest);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(url, det);
    return det;
  } catch (err) {
    log.info(`miniatura do B-roll não baixou (${err.message})`);
    return null;
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
