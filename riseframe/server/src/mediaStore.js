import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { referencedFiles } from './projects.js';

/**
 * Registro das mídias que o usuário usa na timeline (imagens, vídeos e músicas
 * próprias): id → { path, kind, ... } para resolver na hora do render.
 *
 * Gravado em disco (data/media.json): as mídias de um projeto continuam valendo depois
 * de reiniciar o app. No app de PC a mídia aponta para o ARQUIVO ORIGINAL no computador
 * (`linked`, como no CapCut): se ele for apagado ou movido, a mídia fica "offline" e o
 * editor pede para localizar o arquivo de novo.
 */
const store = new Map();
const FILE = () => path.join(config.paths.data, 'media.json');
const TTL_MS = Math.max(1, config.outputTtlHours || 24) * 60 * 60 * 1000;

(function load() {
  try {
    for (const m of JSON.parse(fs.readFileSync(FILE(), 'utf8'))) if (m?.id && m.path) store.set(m.id, m);
  } catch {
    /* primeira vez: sem registro */
  }
})();

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(config.paths.data, { recursive: true });
      fs.writeFileSync(`${FILE()}.tmp`, JSON.stringify([...store.values()]));
      fs.renameSync(`${FILE()}.tmp`, FILE());
    } catch {
      /* disco cheio/somente leitura: segue em memória */
    }
  }, 300);
  saveTimer.unref?.();
}

let refCache = { at: 0, set: new Set() };
function referenced() {
  if (Date.now() - refCache.at > 60_000) refCache = { at: Date.now(), set: referencedFiles() };
  return refCache.set;
}

/** Tira do registro as mídias expiradas que nenhum projeto usa (arquivo sumido não conta: fica offline). */
function prune() {
  const now = Date.now();
  let changed = false;
  for (const [id, m] of store) {
    if (m.linked) continue; // original no computador do usuário: nunca expira
    if (now - m.createdAt > TTL_MS && !referenced().has(id)) {
      store.delete(id);
      changed = true;
    }
  }
  if (changed) persist();
}

/** Registra uma mídia recém-enviada (ou ligada ao original). Retorna a entrada pública. */
export function registerMedia({ id, filePath, kind, originalname, durationSec, linked = false }) {
  store.set(id, {
    id,
    path: filePath,
    kind, // 'image' | 'video' | 'audio'
    originalname: originalname || '',
    durationSec: Number.isFinite(durationSec) ? durationSec : null,
    createdAt: Date.now(),
    linked: Boolean(linked),
  });
  persist();
  return publicMedia(id);
}

/** Troca o arquivo de uma mídia (relink): mesmo id, o projeto continua igual. */
export function relinkMedia(id, { filePath, linked = false, durationSec }) {
  const m = store.get(id);
  if (!m) return null;
  m.path = filePath;
  m.linked = Boolean(linked);
  m.createdAt = Date.now();
  if (Number.isFinite(durationSec)) m.durationSec = durationSec;
  persist();
  return publicMedia(id);
}

/** Caminho permitido? Upload: dentro da pasta de uploads. Original (app de PC): qualquer um. */
function allowedPath(m) {
  const resolved = path.resolve(m.path);
  if (m.linked) return config.desktop ? resolved : null;
  const base = path.resolve(config.paths.uploads);
  return resolved.startsWith(base + path.sep) || resolved === base ? resolved : null;
}

/** Resolve um id para a entrada COMPLETA (com o caminho do arquivo) ou null (sumiu/offline). */
export function resolveMedia(id) {
  if (typeof id !== 'string' || !id) return null;
  prune();
  const m = store.get(id);
  if (!m) return null;
  const resolved = allowedPath(m);
  if (!resolved || !fs.existsSync(resolved)) return null;
  return { ...m, path: resolved };
}

/** Situação de uma mídia: ok, offline (registro existe, arquivo não) ou desconhecida. */
export function mediaStatus(id) {
  const m = typeof id === 'string' ? store.get(id) : null;
  if (!m) return { status: 'missing' };
  return { status: resolveMedia(id) ? 'ok' : 'offline', ...publicMedia(id) };
}

/** Versão sem o caminho, segura para devolver ao cliente. */
export function publicMedia(id) {
  const m = store.get(id);
  if (!m) return null;
  return { id: m.id, kind: m.kind, filename: m.originalname, durationSec: m.durationSec, linked: m.linked };
}
