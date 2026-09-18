import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/**
 * Registro em memória das mídias que o usuário sobe para usar na timeline
 * (imagens, vídeos e músicas próprias). O arquivo fica em uploads/; aqui
 * guardamos só o mapa id → { path, kind, ... } para resolver na hora do render.
 *
 * É proposital que seja em memória: o app roda localmente e o fluxo normal é
 * "subo a mídia → gero o vídeo" na mesma sessão. Se o servidor reiniciar, o
 * usuário sobe de novo (o mesmo que acontece com o upload do vídeo principal).
 */
const store = new Map();

const TTL_MS = Math.max(1, config.outputTtlHours || 24) * 60 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [id, m] of store) {
    if (now - m.createdAt > TTL_MS || !fs.existsSync(m.path)) store.delete(id);
  }
}

/** Registra uma mídia recém-enviada. Retorna a entrada pública (sem o caminho). */
export function registerMedia({ id, filePath, kind, originalname, durationSec }) {
  store.set(id, {
    id,
    path: filePath,
    kind, // 'image' | 'video' | 'audio'
    originalname: originalname || '',
    durationSec: Number.isFinite(durationSec) ? durationSec : null,
    createdAt: Date.now(),
  });
  return publicMedia(id);
}

/** Resolve um id para a entrada COMPLETA (com o caminho do arquivo) ou null. */
export function resolveMedia(id) {
  if (typeof id !== 'string' || !id) return null;
  prune();
  const m = store.get(id);
  if (!m) return null;
  // Trava de segurança: o arquivo tem de estar dentro da pasta de uploads.
  const resolved = path.resolve(m.path);
  const base = path.resolve(config.paths.uploads);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return null;
  if (!fs.existsSync(resolved)) {
    store.delete(id);
    return null;
  }
  return m;
}

/** Versão sem o caminho, segura para devolver ao cliente. */
export function publicMedia(id) {
  const m = store.get(id);
  if (!m) return null;
  return { id: m.id, kind: m.kind, filename: m.originalname, durationSec: m.durationSec };
}
