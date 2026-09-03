import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { queue } from '../queue.js';
import { requireAuth } from './auth.js';
import { getSettings } from '../auth/settings.js';

/** Opções do job com as chaves salvas do usuário (Pexels/Anthropic) — o servidor manda. */
function optionsForUser(req) {
  const o = parseOptions(req.body?.options);
  const s = getSettings(req.user.id);
  if (s.pexelsKey) o.pexelsKey = s.pexelsKey;
  if (s.anthropicKey) o.anthropicKey = s.anthropicKey;
  return o;
}

export const jobsRouter = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.paths.uploads),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    cb(null, `${nanoid(12)}${ext}`);
  },
});

const ALLOWED = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED.has(ext)) cb(null, true);
    else cb(new Error(`formato não suportado: ${ext || 'desconhecido'}`));
  },
});

function clampNum(v, min, max, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

// Looks permitidos via API pública. O caminho `lut:<arquivo>` NÃO é exposto ao
// cliente (evita injeção de filtro/leitura de caminho no filtergraph do ffmpeg);
// LUTs ficam a cargo de configuração do servidor, não da requisição.
const ALLOWED_LOOKS = new Set(['auto', 'none', 'clean', 'teal-orange', 'warm', 'cold', 'vibrant', 'moody']);

function parseOptions(raw) {
  let o = {};
  if (raw) {
    try {
      o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      o = {};
    }
  }
  return {
    cutSilence: o.cutSilence !== false,
    autoClean: o.autoClean === true, // corta muletas/hesitações e gagueiras da fala
    captions: o.captions !== false,
    captionTemplate: ['clean', 'pop', 'hormozi', 'box', 'neon', 'bounce'].includes(o.captionTemplate) ? o.captionTemplate : 'clean',
    captionColor: ['white', 'yellow', 'orange', 'purple', 'green', 'cyan', 'pink', 'red'].includes(o.captionColor) ? o.captionColor : 'white',
    captionFont: ['auto', 'poppins', 'anton', 'bebas', 'archivo', 'luckiest'].includes(o.captionFont) ? o.captionFont : 'auto',
    captionScale: clampNum(o.captionScale, 0.6, 1.6, 1),
    colorLook: ALLOWED_LOOKS.has(o.colorLook) ? o.colorLook : 'auto',
    videoMotion: ['none', 'zoom-in', 'zoom-out', 'ken-burns', 'pulse'].includes(o.videoMotion) ? o.videoMotion : 'none',
    motionIntensity: ['suave', 'medio', 'forte'].includes(o.motionIntensity) ? o.motionIntensity : 'medio',
    broll: o.broll === true,
    // Chave do Pexels vinda da interface (opcional). Sanitiza: só o formato esperado
    // (alfanumérico, 20–80 chars) é aceito; qualquer outra coisa é descartada.
    pexelsKey: typeof o.pexelsKey === 'string' && /^[A-Za-z0-9]{20,80}$/.test(o.pexelsKey.trim()) ? o.pexelsKey.trim() : '',
    brollEverySec: clampNum(o.brollEverySec, 4, 30, 8),
    brollMax: clampNum(o.brollMax, 1, 12, 6),
    aspect: ['original', '9:16', '16:9', '1:1'].includes(o.aspect) ? o.aspect : 'original',
    reframeTrack: o.reframeTrack !== false, // seguir o sujeito no reframe
    silenceNoiseDb: clampNum(o.silenceNoiseDb, -60, -10, -30),
    silenceMinDuration: clampNum(o.silenceMinDuration, 0.2, 3, 0.5),
    silencePadding: clampNum(o.silencePadding, 0, 0.5, 0.08),
    // clipes curtos
    clipsCount: clampNum(o.clipsCount, 1, 8, 3),
    clipAspect: ['original', '9:16', '16:9', '1:1'].includes(o.clipAspect) ? o.clipAspect : '9:16',
    clipMin: clampNum(o.clipMin, 5, 60, 15),
    clipMax: clampNum(o.clipMax, 15, 120, 50),
  };
}

// POST /api/jobs  (multipart: file + options) → pipeline automático completo
jobsRouter.post('/jobs', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
  const job = queue.create({
    mode: 'auto',
    filename: req.file.originalname,
    inputPath: req.file.path,
    options: optionsForUser(req),
  });
  res.status(201).json(queue.public(job));
});

// POST /api/transcribe  (multipart: file) → transcreve e para; o upload fica salvo
// para depois ser reusado por /api/render com a transcrição editada.
jobsRouter.post('/transcribe', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
  const job = queue.create({
    mode: 'transcribe',
    filename: req.file.originalname,
    inputPath: req.file.path,
    options: optionsForUser(req),
  });
  res.status(201).json(queue.public(job));
});

// POST /api/clips  (multipart: file) → gera vários clipes curtos do vídeo longo
jobsRouter.post('/clips', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
  const job = queue.create({
    mode: 'clips',
    filename: req.file.originalname,
    inputPath: req.file.path,
    options: optionsForUser(req),
  });
  res.status(201).json(queue.public(job));
});

// POST /api/render  (JSON: sourceId + editedTranscript + options) → aplica a edição
// por transcrição ao vídeo já enviado e roda o restante do pipeline.
jobsRouter.post('/render', requireAuth, (req, res) => {
  const { sourceId, editedTranscript } = req.body || {};
  if (!sourceId) return res.status(400).json({ error: 'sourceId ausente' });
  const source = queue.get(sourceId);
  if (!source) return res.status(404).json({ error: 'transcrição de origem não encontrada' });
  if (!fs.existsSync(source.inputPath)) {
    return res.status(410).json({ error: 'o vídeo de origem expirou; reenvie' });
  }
  if (!editedTranscript?.segments?.length) {
    return res.status(400).json({ error: 'editedTranscript inválido' });
  }
  const job = queue.create({
    mode: 'render',
    filename: source.filename,
    inputPath: source.inputPath,
    options: optionsForUser(req),
    editedTranscript,
  });
  res.status(201).json(queue.public(job));
});

// (removido) GET /api/jobs — não expomos a listagem global de jobs: ela vazava os
// nomes de arquivo de todos os usuários. O acesso é por id (capability URL).

// GET /api/jobs/:id → status de um job
jobsRouter.get('/jobs/:id', (req, res) => {
  const job = queue.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job não encontrado' });
  res.json(queue.public(job));
});

// GET /api/jobs/:id/events → SSE de progresso em tempo real
jobsRouter.get('/jobs/:id/events', (req, res) => {
  const job = queue.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job não encontrado' });

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  send(queue.public(job));
  if (job.status === 'done' || job.status === 'error') return res.end();

  const onUpdate = (pub) => {
    if (pub.id !== job.id) return;
    send(pub);
    if (pub.status === 'done' || pub.status === 'error') {
      queue.off('update', onUpdate);
      res.end();
    }
  };
  queue.on('update', onUpdate);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(ping);
    queue.off('update', onUpdate);
  });
});

// GET /api/jobs/:id/download → baixa o render final
jobsRouter.get('/jobs/:id/download', (req, res) => {
  const job = queue.get(req.params.id);
  if (!job || job.status !== 'done' || job.mode === 'transcribe') {
    return res.status(404).json({ error: 'render não disponível' });
  }
  const file = path.join(config.paths.outputs, `${job.id}.mp4`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'arquivo não encontrado' });
  const base = path.parse(job.filename).name.replace(/[^\w.-]+/g, '_');
  res.download(file, `riseframe_${base}.mp4`);
});

// Clipes: download/preview por índice (outputs/<jobId>_clip<index>.mp4)
function clipFile(job, index) {
  const clip = job?.report?.clips?.find((c) => String(c.index) === String(index));
  if (!clip) return null;
  const file = path.join(config.paths.outputs, clip.file);
  return fs.existsSync(file) ? { file, clip } : null;
}

jobsRouter.get('/jobs/:id/clips/:index/download', (req, res) => {
  const job = queue.get(req.params.id);
  const found = job && job.status === 'done' ? clipFile(job, req.params.index) : null;
  if (!found) return res.status(404).json({ error: 'clipe não disponível' });
  const base = path.parse(job.filename).name.replace(/[^\w.-]+/g, '_');
  res.download(found.file, `riseframe_${base}_clipe${Number(req.params.index) + 1}.mp4`);
});

jobsRouter.get('/jobs/:id/clips/:index/preview', (req, res) => {
  const job = queue.get(req.params.id);
  const found = job && job.status === 'done' ? clipFile(job, req.params.index) : null;
  if (!found) return res.status(404).json({ error: 'clipe não disponível' });
  res.sendFile(found.file);
});

// GET /api/jobs/:id/preview → stream inline (para <video>)
jobsRouter.get('/jobs/:id/preview', (req, res) => {
  const job = queue.get(req.params.id);
  if (!job || job.status !== 'done' || job.mode === 'transcribe') {
    return res.status(404).json({ error: 'preview não disponível' });
  }
  const file = path.join(config.paths.outputs, `${job.id}.mp4`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'arquivo não encontrado' });
  res.sendFile(file);
});
