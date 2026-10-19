import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { runPipeline } from './pipeline/index.js';
import { config } from './config.js';
import { workDirFor } from './storage.js';
import { makeLogger } from './logger.js';
import { jobContext, stopJob, releaseJob } from './jobContext.js';

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
    this.maxJobs = 500; // limite de registros em memória (evita crescimento sem fim)
    // Cada conexão SSE registra um listener 'update' (removido no 'close'); permitimos
    // muitos clientes simultâneos sem o aviso de MaxListenersExceeded.
    this.setMaxListeners(0);
  }

  /** Remove registros de jobs finalizados mais antigos quando passa do limite. */
  _evict() {
    if (this.jobs.size <= this.maxJobs) return;
    const finished = [...this.jobs.values()]
      .filter((j) => j.status === 'done' || j.status === 'error')
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const j of finished) {
      if (this.jobs.size <= this.maxJobs) break;
      this.jobs.delete(j.id);
    }
  }

  create({ id: wantedId, filename, inputPath, options, mode = 'auto', editedTranscript = null, sourceId = null, ownerId = null, sequence = null }) {
    // id escolhido antes (app de PC/Mac: a cobrança no site já usa este id).
    const id = wantedId && !this.jobs.has(wantedId) ? wantedId : nanoid(12);
    const workDir = workDirFor(id);
    fsSync.mkdirSync(workDir, { recursive: true });
    const job = {
      id,
      mode,
      status: 'queued',
      progress: 0,
      stage: 'queued',
      stageLabel: 'Na fila',
      filename,
      inputPath,
      workDir,
      outputsDir: config.paths.outputs,
      options,
      editedTranscript,
      // render da timeline: o job da transcrição (vídeo original) que foi editado
      sourceId,
      // conta que enviou (para mostrar a fila dela; nunca vai para o cliente)
      ownerId,
      // timeline em branco: clipes a montar antes de transcrever (nunca vai para o cliente)
      ...(sequence ? { sequence } : {}),
      report: null,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
    };
    this.jobs.set(id, job);
    this.pending.push(id);
    this._evict();
    this._persistRunning(job);
    this.emit('update', this.public(job));
    log.info(`job ${id} criado (${filename}) — ${this.pending.length} na fila`);
    this._drain();
    return job;
  }

  /**
   * Registra um job JÁ PRONTO (sem passar pela fila), ex.: o trecho de um clipe aberto
   * na timeline — o relatório já vem montado. Fica gravado em disco como os demais.
   */
  addDone({ filename, inputPath, options = null, mode = 'transcribe', report }) {
    const id = nanoid(12);
    const now = Date.now();
    const job = {
      id, mode, status: 'done', progress: 100, stage: 'done', stageLabel: 'Concluído',
      filename, inputPath, workDir: workDirFor(id), outputsDir: config.paths.outputs,
      options, editedTranscript: null, report: { ...report, sourceId: id }, error: null,
      createdAt: now, startedAt: now, finishedAt: now,
    };
    this.jobs.set(id, job);
    this._evict();
    this._persist(job);
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

  /**
   * Fila de UMA conta: os vídeos dela na fila ou processando, e os que terminaram há pouco
   * (para a tela de progresso mostrar todos que estão renderizando, não só o atual).
   */
  mine(ownerId, { recentMs = 15 * 60_000, ownerless = false } = {}) {
    if (!ownerId) return [];
    const now = Date.now();
    return [...this.jobs.values()]
      .filter((j) => this.owns(j, ownerId, ownerless) && (j.status === 'queued' || j.status === 'processing' || j.status === 'paused' || (j.finishedAt && now - j.finishedAt < recentMs)))
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-20)
      .map((j) => {
        const p = this.public(j);
        return { id: p.id, mode: p.mode, filename: p.filename, status: p.status, progress: p.progress, stage: p.stage, stageLabel: p.stageLabel, queuePosition: p.queuePosition, createdAt: p.createdAt, finishedAt: p.finishedAt || null, error: p.error || null };
      });
  }

  /** Versão serializável (sem caminhos internos de disco nem payload de edição). */
  public(job) {
    // sequence: caminhos dos arquivos da timeline montada — não vão para o cliente
    const { inputPath, workDir, outputsDir, editedTranscript, hold, ownerId, stopReason, sequence, ...rest } = job;
    const queuePosition =
      job.status === 'queued' ? this.pending.indexOf(job.id) + (this.active ? 1 : 0) : 0;
    return {
      ...rest,
      ...(sequence ? { fromSequence: true } : {}),
      queuePosition,
      // 'clips' não tem um único arquivo — cada clipe é baixado por /clips/:index.
      downloadUrl:
        job.status === 'done' && job.mode !== 'transcribe' && job.mode !== 'clips'
          ? `/api/jobs/${job.id}/download`
          : null,
    };
  }

  /**
   * Grava em disco os jobs que dão para reabrir na timeline depois (têm sourceId +
   * transcrição no relatório). Sem isso o registro morre junto com o processo e o
   * vídeo enviado vira inacessível mesmo estando no disco.
   */
  _persist(job) {
    // Clipes também: cada um pode ser aberto na timeline depois de um reinício.
    if (!job.report?.sourceId && !job.report?.clipsTranscript) return;
    const snap = {
      id: job.id,
      mode: job.mode,
      status: 'done',
      progress: 100,
      stage: 'done',
      stageLabel: 'Concluído',
      filename: job.filename,
      inputPath: job.inputPath,
      report: job.report,
      // Opções da edição (sem chaves de API) e a transcrição editada: a demo/simulador
      // e a reabertura na timeline precisam delas depois de um reinício do servidor.
      options: Object.fromEntries(Object.entries(job.options || {}).filter(([k]) => !/key|token|secret/i.test(k))),
      editedTranscript: job.editedTranscript || null,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    };
    fs.writeFile(path.join(config.paths.jobs, `${job.id}.json`), JSON.stringify(snap)).catch((err) => {
      log.warn(`não deu para gravar o job ${job.id} em disco: ${err.message}`);
    });
  }

  /**
   * Job em andamento também fica em disco: se o servidor reiniciar no meio (deploy, falta
   * de memória), ele volta para a fila sozinho no boot — e a cobrança guardada (`hold`)
   * continua valendo para devolver os créditos se ele falhar.
   */
  _persistRunning(job) {
    const snap = {
      id: job.id, mode: job.mode, filename: job.filename, inputPath: job.inputPath,
      options: Object.fromEntries(Object.entries(job.options || {}).filter(([k]) => !/key|token|secret/i.test(k))),
      editedTranscript: job.editedTranscript || null, sourceId: job.sourceId || null,
      hold: job.hold || null, createdAt: job.createdAt, attempts: job.attempts || 0, ownerId: job.ownerId || null,
      paused: job.status === 'paused',
    };
    try {
      fsSync.writeFileSync(path.join(config.paths.jobs, `${job.id}.running.json`), JSON.stringify(snap));
    } catch (err) {
      log.warn(`não deu para gravar o job em andamento ${job.id}: ${err.message}`);
    }
  }

  _dropRunning(id) {
    fs.rm(path.join(config.paths.jobs, `${id}.running.json`), { force: true }).catch(() => {});
  }

  /** Guarda a cobrança do job (para devolver se falhar, mesmo depois de um reinício). */
  setHold(id, hold) {
    const job = this.jobs.get(id);
    if (!job) return;
    job.hold = hold;
    if (job.status === 'queued' || job.status === 'processing' || job.status === 'paused') this._persistRunning(job);
  }

  /** Recarrega os jobs gravados cujo vídeo de origem ainda existe (chamado no boot). */
  async restore() {
    let names;
    try {
      names = await fs.readdir(config.paths.jobs);
    } catch {
      return;
    }
    let restored = 0;
    let resumed = 0;
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const full = path.join(config.paths.jobs, name);
      if (name.endsWith('.running.json')) {
        // Estava na fila/processando quando o servidor caiu: volta para a fila (até 2
        // tentativas — se derrubou o servidor duas vezes, falha e devolve os créditos).
        try {
          const snap = JSON.parse(await fs.readFile(full, 'utf8'));
          await fs.rm(full, { force: true });
          if (!snap?.id || this.jobs.has(snap.id)) continue;
          const ok = snap.inputPath && fsSync.existsSync(snap.inputPath) && (snap.attempts || 0) < 2;
          const paused = ok && snap.paused;
          const job = {
            ...snap, status: paused ? 'paused' : ok ? 'queued' : 'error', progress: 0, stage: paused ? 'paused' : ok ? 'queued' : 'error',
            stageLabel: paused ? 'Pausado' : ok ? 'Retomando depois de um reinício do servidor' : 'Falhou',
            workDir: workDirFor(snap.id), outputsDir: config.paths.outputs,
            report: null, error: ok ? null : 'o servidor reiniciou durante o processamento e não deu para retomar',
            startedAt: null, finishedAt: ok ? null : Date.now(), attempts: (snap.attempts || 0) + 1,
          };
          this.jobs.set(job.id, job);
          this.emit('restored', job);
          if (ok) {
            fsSync.mkdirSync(job.workDir, { recursive: true });
            if (!paused) this.pending.push(job.id);
            this._persistRunning(job);
            resumed++;
          }
          this.emit('update', this.public(job));
        } catch (err) {
          log.warn(`job em andamento ilegível (${name}): ${err.message}`);
          await fs.rm(full, { force: true }).catch(() => {});
        }
        continue;
      }
      try {
        const snap = JSON.parse(await fs.readFile(full, 'utf8'));
        // Upload já expirou pela limpeza por TTL: o snapshot não serve para mais nada.
        if (!snap?.id || !snap.inputPath || !fsSync.existsSync(snap.inputPath)) {
          await fs.rm(full, { force: true });
          continue;
        }
        this.jobs.set(snap.id, {
          ...snap,
          workDir: workDirFor(snap.id),
          outputsDir: config.paths.outputs,
          options: snap.options || null,
          editedTranscript: snap.editedTranscript || null,
          error: null,
        });
        restored++;
      } catch (err) {
        log.warn(`job gravado ilegível (${name}): ${err.message}`);
        await fs.rm(full, { force: true }).catch(() => {});
      }
    }
    this._evict();
    if (restored) log.info(`${restored} job(s) restaurados do disco`);
    if (resumed) {
      log.info(`${resumed} job(s) em andamento voltaram para a fila`);
      this._drain();
    }
  }

  /** É desta conta? (`ownerless`: no app de PC/Mac, os vídeos sem dono — de antes da v152 — também) */
  owns(job, ownerId, ownerless = false) {
    return Boolean(job && ownerId && (job.ownerId === ownerId || (ownerless && !job.ownerId)));
  }

  /** O que está na frente e NÃO é desta conta (sem nomes): processando agora + na fila. */
  othersAhead(ownerId, ownerless = false) {
    const active = this.active ? this.jobs.get(this.active) : null;
    const firstMine = this.pending.findIndex((id) => this.owns(this.jobs.get(id), ownerId, ownerless));
    const ahead = firstMine < 0 ? [] : this.pending.slice(0, firstMine);
    return {
      processing: Boolean(active && !this.owns(active, ownerId, ownerless)),
      queued: ahead.filter((id) => !this.owns(this.jobs.get(id), ownerId, ownerless)).length,
    };
  }

  /** Cancela: na fila/pausado sai na hora; processando, para os processos e termina. */
  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status === 'queued' || job.status === 'paused') {
      this.pending = this.pending.filter((x) => x !== id);
      this._patch(job, { status: 'error', stage: 'canceled', stageLabel: 'Cancelado', error: 'cancelado por você — os créditos voltaram para a sua conta', finishedAt: Date.now() });
      this._dropRunning(id);
      return true;
    }
    if (job.status === 'processing' && this.active === id) {
      job.stopReason = 'cancel';
      stopJob(id);
      this._patch(job, { stageLabel: 'Cancelando…' });
      return true;
    }
    return false;
  }

  /** Pausa: na fila, sai da vez; processando, para agora (ao retomar recomeça do início). */
  pause(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status === 'queued') {
      this.pending = this.pending.filter((x) => x !== id);
      this._patch(job, { status: 'paused', stage: 'paused', stageLabel: 'Pausado' });
      this._persistRunning(job);
      return true;
    }
    if (job.status === 'processing' && this.active === id) {
      job.stopReason = 'pause';
      stopJob(id);
      this._patch(job, { stageLabel: 'Pausando…' });
      return true;
    }
    return false;
  }

  /** Retoma um pausado: volta para o fim da fila. */
  resume(id) {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'paused') return false;
    fsSync.mkdirSync(job.workDir, { recursive: true });
    this.pending.push(id);
    this._patch(job, { status: 'queued', progress: 0, stage: 'queued', stageLabel: 'Na fila' });
    this._persistRunning(job);
    this._drain();
    return true;
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

    let stopped = null;
    try {
      const report = await jobContext.run({ jobId: id }, () => runPipeline(job, (patch) => {
        // Pausar/Cancelar: interrompe entre as etapas também (não só o ffmpeg em andamento)
        if (job.stopReason) throw new Error('interrompido pelo usuário');
        this._patch(job, patch);
      }));
      if (job.stopReason) throw new Error('interrompido pelo usuário');
      this._patch(job, {
        status: 'done',
        progress: 100,
        stage: 'done',
        stageLabel: 'Concluído',
        report,
        finishedAt: Date.now(),
      });
      this._persist(job);
      log.ok(`job ${id} concluído em ${((job.finishedAt - job.startedAt) / 1000).toFixed(1)}s`);
    } catch (err) {
      stopped = job.stopReason || null;
      if (stopped === 'pause') {
        this._patch(job, { status: 'paused', progress: 0, stage: 'paused', stageLabel: 'Pausado', startedAt: null });
        log.info(`job ${id} pausado pelo usuário`);
      } else if (stopped === 'cancel') {
        this._patch(job, { status: 'error', stage: 'canceled', stageLabel: 'Cancelado', error: 'cancelado por você — os créditos voltaram para a sua conta', finishedAt: Date.now() });
        log.info(`job ${id} cancelado pelo usuário`);
      } else {
        this._patch(job, {
          status: 'error',
          stage: 'error',
          stageLabel: 'Falhou',
          error: err.message,
          finishedAt: Date.now(),
        });
        log.error(`job ${id} falhou: ${err.message}`);
      }
    } finally {
      // Limpa arquivos de trabalho intermediários (mantém upload e output).
      fs.rm(job.workDir, { recursive: true, force: true }).catch(() => {});
      delete job.stopReason;
      releaseJob(id);
      if (stopped === 'pause') this._persistRunning(job); // pausado: continua guardado
      else this._dropRunning(id);
      this.active = null;
      this._drain();
    }
  }
}

export const queue = new JobQueue();
