import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { makeLogger } from './logger.js';

const log = makeLogger('storage');

export async function ensureDirs() {
  for (const dir of [config.paths.uploads, config.paths.outputs, config.paths.work, config.paths.jobs, config.paths.cache]) {
    await fs.mkdir(dir, { recursive: true });
  }
}

export function workDirFor(jobId) {
  return path.join(config.paths.work, jobId);
}

/** Remove renders mais antigos que OUTPUT_TTL_HOURS (0 = desativado). */
export async function cleanupOldOutputs() {
  if (!config.outputTtlHours) return;
  const cutoff = Date.now() - config.outputTtlHours * 3600 * 1000;
  for (const dir of [config.paths.outputs, config.paths.uploads, config.paths.jobs, config.paths.cache]) {
    let entries = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name.startsWith('.') || name === '_demo.mp4') continue; // preserva o vídeo de exemplo
      const full = path.join(dir, name);
      try {
        const st = await fs.stat(full);
        if (st.mtimeMs < cutoff) {
          await fs.rm(full, { force: true });
          log.info(`removido antigo: ${name}`);
        }
      } catch {
        /* ignore */
      }
    }
  }
}

export function startCleanupTimer() {
  if (!config.outputTtlHours) return;
  cleanupOldOutputs().catch(() => {});
  setInterval(() => cleanupOldOutputs().catch(() => {}), 3600 * 1000).unref();
}

/** "50 GB", "512 MB"... para mensagens ao usuário. */
export function formatBytes(bytes) {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

/** Espaço livre (bytes) no disco da pasta; null se não der para saber. */
export async function freeDiskBytes(dir) {
  try {
    const s = await fs.statfs(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}
