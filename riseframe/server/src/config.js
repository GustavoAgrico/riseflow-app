import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// riseframe/server/src → riseframe/
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');

function bool(v, def = false) {
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}
function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export const config = {
  root: ROOT,
  port: num(process.env.PORT, 4000),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5174')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  paths: {
    data: DATA,
    uploads: path.join(DATA, 'uploads'),
    outputs: path.join(DATA, 'outputs'),
    work: path.join(DATA, 'work'),
  },

  maxUploadBytes: num(process.env.MAX_UPLOAD_MB, 512) * 1024 * 1024,
  outputTtlHours: num(process.env.OUTPUT_TTL_HOURS, 24),

  transcribe: {
    provider: process.env.TRANSCRIBE_PROVIDER || 'whisper-local',
    openaiKey: process.env.OPENAI_API_KEY || '',
    deepgramKey: process.env.DEEPGRAM_API_KEY || '',
    assemblyaiKey: process.env.ASSEMBLYAI_API_KEY || '',
    whisperModel: process.env.WHISPER_MODEL || 'base',
    // Definido em runtime pelo autoteste de inicialização (null = ainda não checado).
    whisperReady: null,
  },

  analyze: {
    provider: process.env.ANALYZE_PROVIDER || 'heuristic',
    anthropicKey: process.env.ANTHROPIC_API_KEY || '',
    openaiKey: process.env.OPENAI_API_KEY || '',
  },

  broll: {
    pexelsKey: process.env.PEXELS_API_KEY || '',
  },

  debug: bool(process.env.DEBUG, false),
};

/** Recursos externos disponíveis, para o frontend saber o que oferecer. */
export function capabilities() {
  const p = config.transcribe.provider;
  let transcribeReady;
  if (p === 'mock') transcribeReady = true;
  else if (p === 'whisper-local') transcribeReady = config.transcribe.whisperReady !== false;
  else
    transcribeReady = Boolean(
      config.transcribe.openaiKey || config.transcribe.deepgramKey || config.transcribe.assemblyaiKey,
    );
  return {
    transcribeProvider: p,
    transcribeReady,
    // Sinaliza degradação para mock (whisper indisponível → jobs caem para mock).
    transcribeFallbackToMock: p === 'whisper-local' && config.transcribe.whisperReady === false,
    analyzeProvider: config.analyze.provider,
    brollReady: Boolean(config.broll.pexelsKey),
  };
}
