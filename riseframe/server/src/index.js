import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config, capabilities } from './config.js';
import { ensureDirs, startCleanupTimer } from './storage.js';
import { jobsRouter } from './routes/jobs.js';
import { optionsRouter } from './routes/options.js';
import { ffmpegPath } from './pipeline/ffmpeg.js';
import { whisperLocalAvailable } from './pipeline/transcribe/providers.js';
import { log } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await ensureDirs();
startCleanupTimer();

// Autoteste do whisper-local: reflete no /api/health se a ASR real está pronta.
if (config.transcribe.provider === 'whisper-local') {
  const ok = await whisperLocalAvailable();
  config.transcribe.whisperReady = ok;
  if (ok) log.ok('whisper-local disponível (o modelo é baixado no 1º job, se ainda não estiver em cache)');
  else log.warn('whisper-local indisponível (falta faster-whisper) — jobs cairão para o modo mock');
}

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'riseframe',
    ffmpeg: Boolean(ffmpegPath),
    capabilities: capabilities(),
    time: new Date().toISOString(),
  });
});

app.use('/api', optionsRouter);
app.use('/api', jobsRouter);

// Em produção, serve o build do frontend (mesma origem).
const distDir = path.resolve(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// Erros (inclui limites do multer)
app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `arquivo maior que o limite (${config.maxUploadBytes / 1e6} MB)` });
  }
  log.error(`erro: ${err?.message || err}`);
  res.status(400).json({ error: err?.message || 'erro interno' });
});

app.listen(config.port, () => {
  log.ok(`Riseframe API on http://localhost:${config.port}`);
  log.info(`transcrição: ${config.transcribe.provider} · B-roll: ${config.broll.pexelsKey ? 'Pexels' : 'off'}`);
  log.info(`CORS: ${config.corsOrigin.join(', ')}`);
});
