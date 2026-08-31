import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runFfmpeg } from '../ffmpeg.js';
import { makeLogger } from '../../logger.js';

const log = makeLogger('transcribe');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Extrai áudio mono 16kHz (formato ideal para ASR). */
export async function extractAudio(input, work, ext = 'wav') {
  const out = path.join(work, `audio.${ext}`);
  const codec = ext === 'mp3' ? ['-c:a', 'libmp3lame', '-q:a', '4'] : ['-c:a', 'pcm_s16le'];
  await runFfmpeg(
    ['-i', input, '-vn', '-ac', '1', '-ar', '16000', ...codec, '-y', out],
    { label: 'extract-audio' },
  );
  return out;
}

/** Agrupa uma lista plana de palavras {start,end,word} em segmentos de legenda. */
export function wordsToSegments(words, perSegment = 4) {
  const segments = [];
  for (let i = 0; i < words.length; i += perSegment) {
    const chunk = words.slice(i, i + perSegment);
    if (!chunk.length) continue;
    segments.push({
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      text: chunk.map((w) => w.word).join(' '),
      words: chunk,
    });
  }
  return segments;
}

// ─── OpenAI (Whisper API) ─────────────────────────────────────────────
export async function transcribeOpenAI(input, work, meta, cfg) {
  const audio = await extractAudio(input, work, 'mp3');
  const buf = await fs.readFile(audio);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.openaiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const words = (data.words || []).map((w) => ({ start: w.start, end: w.end, word: w.word.trim() }));
  return {
    provider: 'openai',
    language: data.language || 'unknown',
    text: data.text || words.map((w) => w.word).join(' '),
    segments: wordsToSegments(words),
  };
}

// ─── Deepgram ─────────────────────────────────────────────────────────
export async function transcribeDeepgram(input, work, meta, cfg) {
  const audio = await extractAudio(input, work, 'wav');
  const buf = await fs.readFile(audio);
  const url =
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Token ${cfg.deepgramKey}`, 'Content-Type': 'audio/wav' },
    body: buf,
  });
  if (!res.ok) throw new Error(`Deepgram ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const alt = data.results?.channels?.[0]?.alternatives?.[0];
  const words = (alt?.words || []).map((w) => ({
    start: w.start,
    end: w.end,
    word: (w.punctuated_word || w.word || '').trim(),
  }));
  return {
    provider: 'deepgram',
    language: 'unknown',
    text: alt?.transcript || words.map((w) => w.word).join(' '),
    segments: wordsToSegments(words),
  };
}

// ─── AssemblyAI (upload → transcript → poll) ──────────────────────────
export async function transcribeAssemblyAI(input, work, meta, cfg) {
  const audio = await extractAudio(input, work, 'mp3');
  const buf = await fs.readFile(audio);
  const base = 'https://api.assemblyai.com/v2';

  const up = await fetch(`${base}/upload`, {
    method: 'POST',
    headers: { authorization: cfg.assemblyaiKey, 'content-type': 'application/octet-stream' },
    body: buf,
  });
  if (!up.ok) throw new Error(`AssemblyAI upload ${up.status}: ${await up.text()}`);
  const { upload_url } = await up.json();

  const create = await fetch(`${base}/transcript`, {
    method: 'POST',
    headers: { authorization: cfg.assemblyaiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: upload_url, punctuate: true }),
  });
  if (!create.ok) throw new Error(`AssemblyAI create ${create.status}: ${await create.text()}`);
  const { id } = await create.json();

  // Poll até completar (máx ~5 min).
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await fetch(`${base}/transcript/${id}`, {
      headers: { authorization: cfg.assemblyaiKey },
    });
    const data = await poll.json();
    if (data.status === 'completed') {
      const words = (data.words || []).map((w) => ({
        start: w.start / 1000,
        end: w.end / 1000,
        word: (w.text || '').trim(),
      }));
      return {
        provider: 'assemblyai',
        language: data.language_code || 'unknown',
        text: data.text || words.map((w) => w.word).join(' '),
        segments: wordsToSegments(words),
      };
    }
    if (data.status === 'error') throw new Error(`AssemblyAI: ${data.error}`);
  }
  throw new Error('AssemblyAI: timeout aguardando transcrição');
}

/** Verifica (rápido) se python3 + faster-whisper estão instaláveis/importáveis. */
export function whisperLocalAvailable() {
  return new Promise((resolve) => {
    const proc = spawn('python3', ['-c', 'import faster_whisper'], { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

// ─── Whisper local (faster-whisper via Python) ────────────────────────
export async function transcribeWhisperLocal(input, work, meta, cfg) {
  const audio = await extractAudio(input, work, 'wav');
  const script = path.join(__dirname, 'whisper_local.py');
  const data = await new Promise((resolve, reject) => {
    const proc = spawn('python3', [script, audio, cfg.whisperModel || 'base']);
    let out = '';
    let err = '';
    proc.stdout.on('data', (b) => (out += b.toString()));
    proc.stderr.on('data', (b) => (err += b.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`whisper-local falhou: ${err.trim() || code}`));
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(new Error(`whisper-local JSON inválido: ${e.message}`));
      }
    });
  });
  const words = (data.words || []).map((w) => ({ start: w.start, end: w.end, word: w.word.trim() }));
  return {
    provider: 'whisper-local',
    language: data.language || 'unknown',
    text: data.text || words.map((w) => w.word).join(' '),
    segments: wordsToSegments(words),
  };
}
