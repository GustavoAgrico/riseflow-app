import path from 'node:path';
import fs from 'node:fs/promises';
import { runFfmpeg } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('silence');

/**
 * Detecta trechos de silêncio com o filtro `silencedetect`.
 * @returns {Promise<Array<{start:number,end:number}>>}
 */
export async function detectSilences(input, { noiseDb = -30, minSilence = 0.5 } = {}) {
  const { stderr } = await runFfmpeg(
    ['-i', input, '-af', `silencedetect=noise=${noiseDb}dB:d=${minSilence}`, '-f', 'null', '-'],
    { label: 'silencedetect' },
  );

  const silences = [];
  let pendingStart = null;
  for (const raw of stderr.split('\n')) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(raw);
    if (s) {
      pendingStart = Math.max(0, Number(s[1]));
      continue;
    }
    const e = /silence_end:\s*([\d.]+)/.exec(raw);
    if (e && pendingStart != null) {
      silences.push({ start: pendingStart, end: Number(e[1]) });
      pendingStart = null;
    }
  }
  return silences;
}

/**
 * A partir dos silêncios detectados, calcula os segmentos de FALA a manter,
 * preservando uma pequena folga (padding) em torno de cada corte e descartando
 * pedaços curtos demais.
 */
export function computeKeepSegments(silences, duration, opts = {}) {
  const { padding = 0.08, minSpeech = 0.25 } = opts;
  const keep = [];
  let cursor = 0;
  for (const sil of silences) {
    const segEnd = Math.min(sil.start + padding, duration);
    if (segEnd - cursor > minSpeech) keep.push({ start: cursor, end: segEnd });
    cursor = Math.max(cursor, sil.end - padding);
  }
  if (duration - cursor > minSpeech) keep.push({ start: cursor, end: duration });

  // Une segmentos adjacentes/sobrepostos
  const merged = [];
  for (const seg of keep) {
    const last = merged[merged.length - 1];
    if (last && seg.start <= last.end + 0.02) last.end = Math.max(last.end, seg.end);
    else merged.push({ ...seg });
  }
  return merged;
}

/**
 * Remonta a timeline mantendo apenas os segmentos de fala, num único passe de
 * ffmpeg com filter_complex (corte frame-accurate + concat).
 * @returns {Promise<{output:string, keepSegments:Array, removedSeconds:number}>}
 */
export async function cutSilences(input, work, meta, options, onProgress) {
  const noiseDb = options.silenceNoiseDb ?? -30;
  const minSilence = options.silenceMinDuration ?? 0.5;
  const padding = options.silencePadding ?? 0.08;

  const silences = await detectSilences(input, { noiseDb, minSilence });
  const keep = computeKeepSegments(silences, meta.duration, { padding });

  const keptDuration = keep.reduce((a, s) => a + (s.end - s.start), 0);
  const removedSeconds = Math.max(0, meta.duration - keptDuration);

  // Nada relevante para cortar → devolve o input inalterado.
  if (!keep.length || removedSeconds < 0.2 || keep.length === meta.duration) {
    log.info('sem silêncios relevantes para cortar');
    return { output: input, keepSegments: keep, removedSeconds };
  }

  const output = path.join(work, 'cut.mp4');
  const wantAudio = meta.hasAudio;

  const parts = [];
  const concatInputs = [];
  keep.forEach((seg, i) => {
    parts.push(
      `[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
    );
    concatInputs.push(`[v${i}]`);
    if (wantAudio) {
      parts.push(
        `[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`,
      );
      concatInputs.push(`[a${i}]`);
    }
  });
  const n = keep.length;
  parts.push(
    `${concatInputs.join('')}concat=n=${n}:v=1:a=${wantAudio ? 1 : 0}[outv]${wantAudio ? '[outa]' : ''}`,
  );

  const filterGraph = parts.join(';\n');
  const scriptPath = path.join(work, 'silence_filter.txt');
  await fs.writeFile(scriptPath, filterGraph, 'utf8');

  const args = [
    '-i', input,
    '-filter_complex_script', scriptPath,
    '-map', '[outv]',
  ];
  if (wantAudio) args.push('-map', '[outa]', '-c:a', 'aac', '-b:a', '160k');
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'cut', totalDuration: keptDuration, onProgress });
  log.ok(`cortados ${removedSeconds.toFixed(1)}s de pausa (${n} segmentos mantidos)`);
  return { output, keepSegments: keep, removedSeconds };
}
