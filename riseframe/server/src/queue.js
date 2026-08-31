import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { runPipeline } from './pipeline/index.js';
import { config } from './config.js';
import { makeLogger } from './logger.js';

const log = makeLogger('queue');

/**
 * Fila em memória com um worker único (processa um job por vez — coerente com o
 * modelo "processamento sob demanda" do brief). Emite eventos 'update' para SSE.
 */
class JobQueue extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.pending = [];
    this.active = null;
  }

  create({ filename, inputPath, workDir, options }) {
    const id = nanoid(12);
    const job = {
      id,
      status: 'queued',
      progress: 0,
      stage: 'queued',
      stageLabel: 'Na fila',
      filename,
      inputPath,
      workDir,
      outputsDir: config.paths.outputs,
      options,
      report: null,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
    };
    this.jobs.set(id, job);
    this.pending.push(id);
    this.emit('update', this.public(job));
    log.info(`job ${id} criado (${filename}) — ${this.pending.length} na fila`);
    this._drain();
    return job;
  }

  get(id) {
    return this.jobs.get(id) || null;
  }

  list() {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((j) => this.public(j));
  }

  /** Versão serializável (sem caminhos internos de disco). */
  public(job) {
    const { inputPath, workDir, outputsDir, ...rest } = job;
    const queuePosition =
      job.status === 'queued' ? this.pending.indexOf(job.id) + (this.active ? 1 : 0) : 0;
    return {
      ...rest,
      queuePosition,
      downloadUrl: job.status === 'done' ? `/api/jobs/${job.id}/download` : null,
    };
  }

  _patch(job, patch) {
    Object.assign(job, patch);
    this.emit('update', this.public(job));
  }

  async _drain() {
    if (this.active) return;
    const id = this.pending.shift();
    if (!id) return;
    const job = this.jobs.get(id);
    if (!job) return this._drain();

    this.active = id;
    this._patch(job, { status: 'processing', startedAt: Date.now(), stage: 'starting', stageLabel: 'Iniciando' });
    log.info(`processando job ${id}`);

    try {
      const report = await runPipeline(job, (patch) => this._patch(job, patch));
      this._patch(job, {
        status: 'done',
        progress: 100,
        stage: 'done',
        stageLabel: 'Concluído',
        report,
        finishedAt: Date.now(),
      });
      log.ok(`job ${id} concluído em ${((job.finishedAt - job.startedAt) / 1000).toFixed(1)}s`);
    } catch (err) {
      this._patch(job, {
        status: 'error',
        stage: 'error',
        stageLabel: 'Falhou',
        error: err.message,
        finishedAt: Date.now(),
      });
      log.error(`job ${id} falhou: ${err.message}`);
    } finally {
      // Limpa arquivos de trabalho intermediários (mantém upload e output).
      fs.rm(job.workDir, { recursive: true, force: true }).catch(() => {});
      this.active = null;
      this._drain();
    }
  }
}

export const queue = new JobQueue();
