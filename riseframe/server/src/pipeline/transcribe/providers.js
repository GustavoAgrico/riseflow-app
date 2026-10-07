import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runFfmpeg } from '../ffmpeg.js';
import { resolvePython } from '../python.js';
import { groupIntoPhrases } from '../narrative.js';
import { makeLogger } from '../../logger.js';

const log = makeLogger('transcribe');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Extrai áudio mono 16kHz (formato ideal para ASR). mp3 a 48 kbps é ~8x menor que wav. */
export async function extractAudio(input, work, ext = 'wav') {
  const out = path.join(work, `audio.${ext}`);
  const codec = ext === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '48k'] : ['-c:a', 'pcm_s16le'];
  await runFfmpeg(
    ['-i', input, '-vn', '-ac', '1', '-ar', '16000', ...codec, '-y', out],
    { label: 'extract-audio' },
  );
  return out;
}

/**
 * Agrupa uma lista plana de palavras {start,end,word} em frases de legenda
 * naturais (pontuação + pausas + tamanho), via análise de frases do narrative.js.
 */
export function wordsToSegments(words) {
  return groupIntoPhrases(words);
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

/**
 * Enquanto espera a resposta de uma API (sem progresso real), avança a barra de
 * forma assintótica até ~95% do trecho, pela duração estimada. Retorna o `stop`.
 */
function waitProgress(onProgress, from, estimateMs) {
  if (!onProgress) return () => {};
  const t0 = Date.now();
  const timer = setInterval(() => {
    const k = 1 - Math.exp(-(Date.now() - t0) / Math.max(2000, estimateMs));
    onProgress(from + (0.95 - from) * k);
  }, 700);
  return () => clearInterval(timer);
}

/** fetch com tempo máximo e UMA nova tentativa em falha de rede/timeout/5xx. */
async function fetchRetry(url, init, timeoutMs, label) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // AbortSignal.timeout só aceita inteiro (a duração do vídeo vem quebrada: 465,43 s).
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(Math.ceil(timeoutMs)) });
      if (res.status >= 500 && attempt < 2) {
        log.warn(`${label} respondeu ${res.status}; tentando de novo`);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= 2) throw new Error(`${label}: ${err.name === 'TimeoutError' ? `sem resposta em ${Math.round(timeoutMs / 1000)}s` : err.message}`);
      log.warn(`${label} falhou (${err.message}); tentando de novo`);
    }
  }
}

// ─── Groq (Whisper large-v3 na nuvem) ─────────────────────────────────
/** Acima disto (s), o áudio vai para a Groq em pedaços (o envio tem limite de tamanho). */
export const GROQ_CHUNK_SECONDS = 10 * 60;

export async function transcribeGroq(input, work, meta, cfg, onProgress, { chunkSeconds = GROQ_CHUNK_SECONDS } = {}) {
  onProgress?.(0.05);
  const audio = await extractAudio(input, work, 'mp3');
  onProgress?.(0.15);
  const dur = Number(meta?.duration) || 60;
  const chunks = dur > chunkSeconds ? await splitAudio(audio, work, chunkSeconds) : [{ file: audio, offset: 0, dur }];
  let language = cfg.groqLanguage || '';
  const words = [];
  let text = '';
  for (let i = 0; i < chunks.length; i += 1) {
    const c = chunks[i];
    const from = 0.15 + (0.8 * i) / chunks.length;
    const to = 0.15 + (0.8 * (i + 1)) / chunks.length;
    const stop = waitProgress((p) => onProgress?.(from + (to - from) * p), 0, Math.max(4000, c.dur * 40));
    let data;
    try {
      const form = new FormData();
      form.append('file', new Blob([await fs.readFile(c.file)], { type: 'audio/mpeg' }), 'audio.mp3');
      form.append('model', cfg.groqModel || 'whisper-large-v3-turbo');
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'word');
      form.append('timestamp_granularities[]', 'segment');
      form.append('temperature', '0');
      // Idioma do 1º pedaço vale para os seguintes (legenda num idioma só).
      if (language) form.append('language', language);
      const res = await fetchRetry('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.groqKey}` },
        body: form,
      }, Math.max(60_000, c.dur * 1000), 'Groq');
      if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
      data = await res.json();
    } finally {
      stop();
    }
    if (!language && data.language) language = groqLang(data.language);
    for (const w of data.words || []) {
      const word = String(w.word || '').trim();
      if (word) words.push({ start: Number(w.start) + c.offset, end: Number(w.end) + c.offset, word });
    }
    if (data.text) text += (text ? ' ' : '') + String(data.text).trim();
    onProgress?.(to);
  }
  if (chunks.length > 1) log.info(`Groq: ${chunks.length} pedaços transcritos (${Math.round(dur / 60)} min)`);
  return {
    provider: 'groq',
    language: language || 'unknown',
    text: text || words.map((w) => w.word).join(' '),
    segments: wordsToSegments(punctuate(words, text)),
  };
}

// A Groq devolve o idioma por extenso ("portuguese"); a API aceita o código ISO.
const LANG_CODES = { portuguese: 'pt', english: 'en', spanish: 'es', french: 'fr', italian: 'it', german: 'de' };
const groqLang = (l) => LANG_CODES[String(l).toLowerCase()] || String(l).toLowerCase();

/**
 * As palavras da Groq vêm sem pontuação; o texto completo vem com. Copia a pontuação do
 * texto para as palavras (casando em ordem), para as frases da legenda quebrarem no ponto.
 */
export function punctuate(words, text) {
  const tokens = String(text || '').split(/\s+/).filter(Boolean);
  const bare = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  let j = 0;
  return words.map((w) => {
    const target = bare(w.word);
    for (let k = j; k < Math.min(tokens.length, j + 4); k += 1) {
      if (bare(tokens[k]) === target && target) {
        j = k + 1;
        return { ...w, word: tokens[k] };
      }
    }
    return w;
  });
}

// ─── Deepgram ─────────────────────────────────────────────────────────
export async function transcribeDeepgram(input, work, meta, cfg, onProgress, { chunkSeconds = DEEPGRAM_CHUNK_SECONDS } = {}) {
  onProgress?.(0.05);
  const audio = await extractAudio(input, work, 'mp3');
  onProgress?.(0.15);
  const dur = Number(meta?.duration) || 60;
  // Áudio longo (vídeos grandes, de horas) vai em pedaços: cada envio fica pequeno e
  // rápido, e uma falha de rede refaz só aquele pedaço em vez da transcrição inteira.
  const chunks = dur > DEEPGRAM_CHUNK_AFTER ? await splitAudio(audio, work, chunkSeconds) : [{ file: audio, offset: 0, dur }];
  let language = cfg.deepgramLanguage || '';
  const words = [];
  let text = '';
  for (let i = 0; i < chunks.length; i += 1) {
    const c = chunks[i];
    const from = 0.15 + (0.8 * i) / chunks.length;
    const to = 0.15 + (0.8 * (i + 1)) / chunks.length;
    const data = await deepgramRequest(await fs.readFile(c.file), cfg, language, c.dur, (p) => onProgress?.(from + (to - from) * p));
    const channel = data.results?.channels?.[0];
    const alt = channel?.alternatives?.[0];
    // Idioma detectado no 1º pedaço vale para os seguintes (legenda num idioma só).
    if (!language && channel?.detected_language) language = channel.detected_language;
    for (const w of alt?.words || []) {
      words.push({ start: w.start + c.offset, end: w.end + c.offset, word: (w.punctuated_word || w.word || '').trim() });
    }
    if (alt?.transcript) text += (text ? ' ' : '') + alt.transcript;
  }
  if (chunks.length > 1) log.info(`Deepgram: ${chunks.length} pedaços transcritos (${Math.round(dur / 60)} min)`);
  return {
    provider: 'deepgram',
    language: language || 'unknown',
    text: text || words.map((w) => w.word).join(' '),
    segments: wordsToSegments(words),
  };
}

/** Acima disto (s), o áudio vai para a Deepgram em pedaços de DEEPGRAM_CHUNK_SECONDS. */
export const DEEPGRAM_CHUNK_AFTER = 20 * 60;
export const DEEPGRAM_CHUNK_SECONDS = 10 * 60;

/** Divide o mp3 em pedaços (sem recodificar) e devolve [{ file, offset, dur }]. */
export async function splitAudio(audio, work, seconds) {
  const dir = path.join(work, 'audio-chunks');
  await fs.mkdir(dir, { recursive: true });
  const list = path.join(dir, 'list.csv');
  await runFfmpeg(
    ['-i', audio, '-f', 'segment', '-segment_time', String(seconds), '-segment_list', list, '-segment_list_type', 'csv', '-c', 'copy', '-y', path.join(dir, 'part_%04d.mp3')],
    { label: 'split-audio' },
  );
  const rows = (await fs.readFile(list, 'utf-8')).split(/\r?\n/).filter(Boolean);
  return rows.map((row) => {
    const [name, a, b] = row.split(',');
    return { file: path.join(dir, name), offset: Number(a) || 0, dur: Math.max(1, (Number(b) || 0) - (Number(a) || 0)) };
  });
}

/** Um envio para a Deepgram (com tempo máximo e nova tentativa). */
async function deepgramRequest(buf, cfg, language, dur, onProgress) {
  // detect_language=true: descobre o idioma sozinho (pt, en, es...). Sem isso o
  // nova-2 assume inglês e transcreve fala em português errado. Um idioma fixo
  // pode ser forçado por env (DEEPGRAM_LANGUAGE, ex.: "pt").
  const params = new URLSearchParams({ model: 'nova-2', smart_format: 'true', punctuate: 'true' });
  if (language) params.set('language', language);
  else params.set('detect_language', 'true');
  // Upload + processamento: ~0,3 s por minuto de áudio + margem para a rede.
  const stop = waitProgress(onProgress, 0, 4000 + dur * 150);
  let res;
  try {
    res = await fetchRetry(
      `https://api.deepgram.com/v1/listen?${params}`,
      { method: 'POST', headers: { Authorization: `Token ${cfg.deepgramKey}`, 'Content-Type': 'audio/mpeg' }, body: buf },
      Math.max(180_000, dur * 2000),
      'Deepgram',
    );
  } finally {
    stop();
  }
  if (!res.ok) throw new Error(`Deepgram ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
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

/** Verifica (rápido) se Python + faster-whisper estão instaláveis/importáveis. */
export async function whisperLocalAvailable() {
  const py = await resolvePython();
  if (!py) return false;
  return new Promise((resolve) => {
    const proc = spawn(py, ['-c', 'import faster_whisper'], { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

// ─── Whisper local (faster-whisper via Python) ────────────────────────
export async function transcribeWhisperLocal(input, work, meta, cfg) {
  const py = await resolvePython();
  if (!py) throw new Error('Python não encontrado no PATH (instale Python 3 ou defina PYTHON_BIN)');
  const audio = await extractAudio(input, work, 'wav');
  const script = path.join(__dirname, 'whisper_local.py');
  // Timeout de segurança: em máquinas pequenas (ex.: free 512 MB) o processo pode
  // travar/estourar a memória. Sem limite, o job ficaria preso em "Transcrição"
  // para sempre. Ao estourar, matamos o processo e deixamos o chamador cair para
  // outro provedor/mock. Escala com a duração do vídeo; configurável por env.
  const timeoutMs = Number(cfg.timeoutMs) > 0
    ? Number(cfg.timeoutMs)
    : Math.min(600000, Math.max(180000, Math.ceil((meta?.duration || 60) * 12) * 1000));
  const data = await new Promise((resolve, reject) => {
    const proc = spawn(py, [script, audio, cfg.whisperModel || 'base']);
    let out = '';
    let err = '';
    let done = false;
    const finish = (fn, arg) => { if (done) return; done = true; clearTimeout(timer); fn(arg); };
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* já morreu */ }
      finish(reject, new Error(`whisper-local excedeu ${Math.round(timeoutMs / 1000)}s (possível falta de memória)`));
    }, timeoutMs);
    proc.stdout.on('data', (b) => (out += b.toString()));
    proc.stderr.on('data', (b) => (err += b.toString()));
    proc.on('error', (e) => finish(reject, e));
    proc.on('close', (code) => {
      if (code !== 0) return finish(reject, new Error(`whisper-local falhou: ${err.trim() || code}`));
      try {
        finish(resolve, JSON.parse(out));
      } catch (e) {
        finish(reject, new Error(`whisper-local JSON inválido: ${e.message}`));
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
