import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { queue } from '../queue.js';

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
    captions: o.captions !== false,
    captionMode: ['karaoke', 'word'].includes(o.captionMode) ? o.captionMode : 'karaoke',
    captionPreset: ['laranja', 'roxo', 'branco'].includes(o.captionPreset) ? o.captionPreset : 'laranja',
    captionScale: clampNum(o.captionScale, 0.6, 1.6, 1),
    colorLook: typeof o.colorLook === 'string' ? o.colorLook : 'auto',
    broll: o.broll === true,
    brollEverySec: clampNum(o.brollEverySec, 4, 30, 8),
    brollMax: clampNum(o.brollMax, 1, 12, 6),
    aspect: ['original', '9:16', '16:9', '1:1'].includes(o.aspect) ? o.aspect : 'original',
    silenceNoiseDb: clampNum(o.silenceNoiseDb, -60, -10, -30),
    silenceMinDuration: clampNum(o.silenceMinDuration, 0.2, 3, 0.5),
    silencePadding: clampNum(o.silencePadding, 0, 0.5, 0.08),
  };
}

// POST /api/jobs  (multipart: file + options) → pipeline automático completo
jobsRouter.post('/jobs', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
  const job = queue.create({
    mode: 'auto',
    filename: req.file.originalname,
    inputPath: req.file.path,
    options: parseOptions(req.body?.options),
  });
  res.status(201).json(queue.public(job));
});

// POST /api/transcribe  (multipart: file) → transcreve e para; o upload fica salvo
// para depois ser reusado por /api/render com a transcrição editada.
jobsRouter.post('/transcribe', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
  const job = queue.create({
    mode: 'transcribe',
    filename: req.file.originalname,
    inputPath: req.file.path,
    options: parseOptions(req.body?.options),
  });
  res.status(201).json(queue.public(job));
});

// POST /api/render  (JSON: sourceId + editedTranscript + options) → aplica a edição
// por transcrição ao vídeo já enviado e roda o restante do pipeline.
jobsRouter.post('/render', (req, res) => {
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
    options: parseOptions(req.body?.options),
    editedTranscript,
  });
  res.status(201).json(queue.public(job));
});

// GET /api/jobs → lista
jobsRouter.get('/jobs', (_req, res) => res.json(queue.list()));

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
