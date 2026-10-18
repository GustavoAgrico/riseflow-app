import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Qual job está rodando neste trecho de código (atravessa os awaits do pipeline) e os
 * processos (ffmpeg, Whisper…) que ele abriu — para Pausar/Cancelar pararem na hora.
 */
export const jobContext = new AsyncLocalStorage();
const children = new Map(); // jobId → Set<ChildProcess>
const stopped = new Set(); // jobs mandados parar: processo novo deles já nasce morto

/** Registra um processo aberto pelo job atual (se houver). Devolve o próprio processo. */
export function trackChild(proc) {
  const id = jobContext.getStore()?.jobId;
  if (!id || !proc) return proc;
  if (stopped.has(id)) {
    try { proc.kill('SIGKILL'); } catch { /* já saiu */ }
    return proc;
  }
  if (!children.has(id)) children.set(id, new Set());
  const set = children.get(id);
  set.add(proc);
  proc.once('close', () => set.delete(proc));
  proc.once('error', () => set.delete(proc));
  return proc;
}

/** Para tudo que o job está rodando (e o que ele tentar abrir depois). */
export function stopJob(id) {
  stopped.add(id);
  for (const p of children.get(id) || []) {
    try { p.kill('SIGKILL'); } catch { /* já saiu */ }
  }
}

/** O job terminou (de qualquer jeito): esquece os registros. */
export function releaseJob(id) {
  stopped.delete(id);
  children.delete(id);
}

export const jobStopped = (id) => stopped.has(id);
