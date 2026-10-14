import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { config } from './config.js';
import { formatBytes, freeDiskBytes } from './storage.js';
import { makeLogger } from './logger.js';

const log = makeLogger('upload');

/**
 * Upload RETOMÁVEL, em pedaços: o navegador manda o vídeo em partes de até 16 MB e, se a
 * conexão cair (Wi-Fi, 4G, notebook dormiu), continua de onde parou em vez de recomeçar.
 *  POST /uploads {name, size}       → {id, received:0}
 *  GET  /uploads/:id                → {id, received, size}   (para retomar)
 *  PUT  /uploads/:id  (X-Offset: n) → {received}             (corpo = bytes da parte)
 * Quando tudo chegou, o job é criado com {uploadId} no lugar do arquivo (multipart).
 * O estado fica num .json ao lado do .part — sobrevive a um reinício do servidor.
 */
export const CHUNK_MAX = 16 * 1024 ** 2;
const ALLOWED = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);
const STALE_MS = 48 * 3600 * 1000;
const DISK_MARGIN = 2 * 1024 ** 3;

const dir = () => config.paths.uploads;
const metaPath = (id) => path.join(dir(), `${id}.part.json`);
const validId = (id) => /^[A-Za-z0-9_-]{8,32}$/.test(String(id || ''));

function readMeta(id) {
  if (!validId(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath(id), 'utf8'));
  } catch {
    return null;
  }
}
function writeMeta(m) {
  fs.writeFileSync(metaPath(m.id), JSON.stringify(m));
}
function receivedOf(m) {
  try {
    return fs.statSync(m.part).size;
  } catch {
    return 0;
  }
}

/** Começa um upload. Valida formato, tamanho e espaço em disco. */
export async function startUpload(userId, { name, size }) {
  const ext = path.extname(String(name || '')).toLowerCase();
  const total = Math.floor(Number(size));
  if (!ALLOWED.has(ext)) return { status: 400, body: { error: `formato não suportado: ${ext || 'desconhecido'}` } };
  if (!(total > 0)) return { status: 400, body: { error: 'tamanho do arquivo inválido' } };
  if (config.maxUploadBytes && total > config.maxUploadBytes) {
    return { status: 413, body: { error: `arquivo maior que o limite (${formatBytes(config.maxUploadBytes)})` } };
  }
  const free = await freeDiskBytes(dir()).catch(() => null);
  if (free !== null && total + DISK_MARGIN > free) {
    return { status: 507, body: { error: `sem espaço em disco para este vídeo (${formatBytes(total)}; livre: ${formatBytes(free)}). Tente mais tarde.` } };
  }
  fs.mkdirSync(dir(), { recursive: true });
  const id = nanoid(16);
  const m = { id, userId, name: String(name).slice(0, 200), ext, size: total, part: path.join(dir(), `${id}${ext}.part`), createdAt: Date.now() };
  fs.writeFileSync(m.part, '');
  writeMeta(m);
  return { status: 201, body: { id, received: 0, size: total, chunkMax: CHUNK_MAX } };
}

export function uploadStatus(userId, id) {
  const m = readMeta(id);
  if (!m || m.userId !== userId) return { status: 404, body: { error: 'upload não encontrado (expirou?)' } };
  return { status: 200, body: { id, received: receivedOf(m), size: m.size } };
}

/** Recebe uma parte (stream do corpo) e anexa no fim do arquivo, se o offset bater. */
export function receiveChunk(req, res) {
  const m = readMeta(req.params.id);
  if (!m || m.userId !== req.user.id) return res.status(404).json({ error: 'upload não encontrado (expirou?)' });
  const have = receivedOf(m);
  const offset = Number(req.headers['x-offset']);
  const len = Number(req.headers['content-length']) || 0;
  // fora de ordem (ex.: a parte anterior chegou mas a resposta se perdeu): diz onde está
  if (offset !== have) return res.status(409).json({ error: 'offset diferente do recebido', received: have });
  if (len > CHUNK_MAX + 1024 || have + len > m.size) return res.status(413).json({ error: 'parte grande demais', received: have });
  const out = fs.createWriteStream(m.part, { flags: 'a' });
  let got = 0;
  let failed = false;
  req.on('data', (d) => {
    got += d.length;
    if (got > CHUNK_MAX + 1024) {
      failed = true;
      req.destroy();
    }
  });
  req.pipe(out);
  const fail = () => {
    if (failed) return;
    failed = true;
    out.destroy();
    // parte incompleta: corta de volta ao último ponto bom (a próxima tentativa refaz a parte)
    try {
      fs.truncateSync(m.part, have);
    } catch {
      /* arquivo já removido */
    }
  };
  req.on('aborted', fail);
  req.on('error', fail);
  out.on('finish', () => {
    if (failed) {
      try {
        fs.truncateSync(m.part, have);
      } catch {
        /* ignora */
      }
      if (!res.headersSent) res.status(400).json({ error: 'parte inválida', received: have });
      return;
    }
    res.json({ received: receivedOf(m), size: m.size });
  });
}

/**
 * Upload completo → arquivo final (como se tivesse vindo pelo multer). Null se o id não é
 * deste usuário ou ainda faltam bytes.
 */
export function finishUpload(userId, id) {
  const m = readMeta(id);
  if (!m || m.userId !== userId) return null;
  if (receivedOf(m) !== m.size) return null;
  const final = path.join(dir(), `${m.id}${m.ext}`);
  fs.renameSync(m.part, final);
  fs.rmSync(metaPath(m.id), { force: true });
  log.ok(`upload em partes concluído: ${m.name} (${formatBytes(m.size)})`);
  return { originalname: m.name, path: final, size: m.size };
}

/** Middleware: job criado com {uploadId} (JSON) em vez do arquivo (multipart). */
export function fromChunkedUpload(req, res, next) {
  if (req.file || !req.body?.uploadId) return next();
  const f = finishUpload(req.user.id, req.body.uploadId);
  if (!f) return res.status(400).json({ error: 'o envio do vídeo não terminou — tente de novo (ele continua de onde parou)' });
  req.file = f;
  next();
}

/** Remove uploads abandonados (mais de 48 h). */
export function cleanStaleUploads() {
  let n = 0;
  try {
    for (const f of fs.readdirSync(dir())) {
      if (!f.endsWith('.part.json')) continue;
      const m = readMeta(f.replace(/\.part\.json$/, ''));
      if (m && Date.now() - m.createdAt > STALE_MS) {
        fs.rmSync(m.part, { force: true });
        fs.rmSync(metaPath(m.id), { force: true });
        n++;
      }
    }
  } catch {
    /* pasta ainda não existe */
  }
  if (n) log.info(`${n} upload(s) abandonado(s) removido(s)`);
}
setInterval(cleanStaleUploads, 3600 * 1000).unref();
