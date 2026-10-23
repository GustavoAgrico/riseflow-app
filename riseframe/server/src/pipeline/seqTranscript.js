// Fala da montagem da timeline (V1) sem transcrever tudo de novo: cada clipe que já tinha
// fala transcrita (o vídeo que já estava no editor, ou uma mídia transcrita antes) reaproveita
// as palavras, só deslocadas para o lugar novo. Clipe novo: transcreve só ele — ou nada,
// quando a pessoa escolhe "Só colocar na timeline" (`sequence.transcribeNew === false`).
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { makeLogger } from '../logger.js';
import { runFfmpeg } from './ffmpeg.js';
import { clipDuration } from './sequence.js';
import { transcribe } from './transcribe/index.js';

const log = makeLogger('seq-fala');

/** Frases com as palavras dentro de [a, b] (tempo da origem), deslocadas por `shift`. Puro. */
export function sliceSegments(segments, a, b, shift) {
  const out = [];
  for (const sg of segments || []) {
    const words = (sg.words || [])
      .filter((w) => Number(w.start) >= a - 0.05 && Number(w.end) <= b + 0.05)
      .map((w) => ({ ...w, start: +(Number(w.start) + shift).toFixed(3), end: +(Number(w.end) + shift).toFixed(3) }));
    if (!words.length) continue;
    const text = words.filter((w) => !w.removed).map((w) => String(w.word ?? '').trim()).filter(Boolean).join(' ');
    out.push({ ...sg, start: words[0].start, end: words[words.length - 1].end, text, words });
  }
  return out;
}

const sortSegs = (list) => list.sort((x, y) => x.start - y.start);
const textOf = (segs) => segs.map((s) => s.text).filter(Boolean).join(' ');

// cache por mídia: { ranges: [[in, out]], segments } no tempo da própria mídia
const cacheFile = (mediaId) => path.join(config.paths.cache, `${String(mediaId).replace(/[^\w-]/g, '')}.words.json`);
function readCache(mediaId) {
  if (!mediaId) return null;
  try { return JSON.parse(fs.readFileSync(cacheFile(mediaId), 'utf8')); } catch { return null; }
}
/** Fala já transcrita da mídia em [a, b] (tempo da mídia), ou null se esse trecho não foi transcrito. */
function fromCache(mediaId, a, b) {
  const c = readCache(mediaId);
  if (!c || !c.ranges?.some(([x, y]) => x <= a + 0.05 && y >= b - 0.05)) return null;
  return c.segments || [];
}
function saveCache(mediaId, a, b, segments) {
  if (!mediaId) return;
  try {
    const old = readCache(mediaId) || { ranges: [], segments: [] };
    const kept = (old.segments || []).map((sg) => ({ ...sg, words: (sg.words || []).filter((w) => w.end <= a + 0.05 || w.start >= b - 0.05) })).filter((sg) => sg.words.length);
    const ranges = [...(old.ranges || []), [a, b]].sort((x, y) => x[0] - y[0]).reduce((acc, r) => {
      const l = acc[acc.length - 1];
      if (l && r[0] <= l[1] + 0.05) l[1] = Math.max(l[1], r[1]); else acc.push([...r]);
      return acc;
    }, []);
    fs.writeFileSync(cacheFile(mediaId), JSON.stringify({ ranges, segments: sortSegs([...kept, ...segments]) }));
  } catch (e) {
    log.warn(`não deu para guardar a fala da mídia ${mediaId}: ${e.message}`);
  }
}

/**
 * Transcrição da montagem. → { provider, language, text, segments, reused, transcribed }
 * `ctx` vai para o transcribe (jobId: conta do site no app de PC).
 */
export async function sequenceTranscript(job, input, work, meta, onProgress = () => {}, ctx = {}) {
  const seq = job.sequence || {};
  const placed = [];
  let at = 0;
  for (const c of seq.clips || []) {
    const len = clipDuration(c);
    if (c.kind === 'video') placed.push({ c, a: at, len, cin: Math.max(0, Number(c.in) || 0) });
    at += len;
  }
  const parts = [];
  const todo = [];
  let reused = 0;
  for (const p of placed) {
    // "Só colocar": a mídia entra original — sem puxar a fala de outra vez (nada de pausas
    // cortadas sozinhas); só a fala que já estava neste editor vem junto.
    const known = Array.isArray(p.c.words) ? p.c.words : seq.transcribeNew === false ? null : fromCache(p.c.mediaId, p.cin, p.cin + p.len);
    if (known) { parts.push(...sliceSegments(known, p.cin, p.cin + p.len, p.a - p.cin)); reused++; } else todo.push(p);
  }
  const done = (provider, extra = {}) => {
    const segments = sortSegs(parts);
    return { provider, language: 'pt', text: textOf(segments), segments, reused, ...extra };
  };
  if (!todo.length) return done(reused ? 'reaproveitada' : 'none');
  if (seq.transcribeNew === false) {
    log.info(`${todo.length} clipe(s) novo(s) entraram sem transcrever (só colocar na timeline)`);
    return done(reused ? 'reaproveitada' : 'none', { untranscribed: todo.map((p) => [p.a, p.a + p.len]) });
  }
  // nada para reaproveitar: transcreve o vídeo montado de uma vez (como antes)
  if (!reused) {
    const full = await transcribe(input, work, meta, onProgress, ctx);
    for (const p of todo) saveCache(p.c.mediaId, p.cin, p.cin + p.len, sliceSegments(full.segments, p.a, p.a + p.len, p.cin - p.a));
    return { ...full, reused: 0, transcribed: todo.length };
  }
  // só os clipes novos: recorta o áudio de cada um e transcreve
  let provider = 'reaproveitada';
  for (let i = 0; i < todo.length; i++) {
    const p = todo[i];
    const dir = path.join(work, `fala_${i}`);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'trecho.m4a');
    await runFfmpeg(['-ss', p.a.toFixed(3), '-t', p.len.toFixed(3), '-i', input, '-vn', '-ac', '1', '-c:a', 'aac', '-b:a', '128k', '-y', file], { label: 'trecho-fala' });
    const tr = await transcribe(file, dir, { duration: p.len, hasAudio: true }, (q) => onProgress((i + q) / todo.length), ctx);
    provider = tr.provider || provider;
    const local = sliceSegments(tr.segments, -1, p.len + 1, 0);
    parts.push(...sliceSegments(local, -1, p.len + 1, p.a));
    saveCache(p.c.mediaId, p.cin, p.cin + p.len, sliceSegments(local, -1, p.len + 1, p.cin));
  }
  log.ok(`fala: ${reused} clipe(s) reaproveitado(s), ${todo.length} transcrito(s)`);
  return done(provider, { transcribed: todo.length });
}

/** Transcreve só [a, b] do vídeo `input` (tempo do vídeo). → frases já no tempo do vídeo. */
export async function transcribeRange(input, work, a, b, ctx = {}) {
  const len = Math.max(0.3, b - a);
  const dir = path.join(work, `trecho_${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'trecho.m4a');
  try {
    await runFfmpeg(['-ss', a.toFixed(3), '-t', len.toFixed(3), '-i', input, '-vn', '-ac', '1', '-c:a', 'aac', '-b:a', '128k', '-y', file], { label: 'trecho-fala' });
    const tr = await transcribe(file, dir, { duration: len, hasAudio: true }, () => {}, ctx);
    return { provider: tr.provider, segments: sliceSegments(tr.segments, -1, len + 1, a) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
