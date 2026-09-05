import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { makeLogger } from './logger.js';

const log = makeLogger('storage');

export async function ensureDirs() {
  for (const dir of [config.paths.uploads, config.paths.outputs, config.paths.work]) {
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
  for (const dir of [config.paths.outputs, config.paths.uploads]) {
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
