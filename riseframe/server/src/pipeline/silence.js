import { runFfmpeg } from './ffmpeg.js';

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
 * Faixas de tempo a REMOVER por silêncio, já com folga (padding) aplicada para não
 * cortar o ataque/finalização das palavras. A remontagem em si é feita pelo
 * timeline.js (compartilhado com a edição por transcrição).
 * @returns {Promise<Array<{start:number,end:number}>>}
 */
export async function silenceRemovalRanges(input, meta, options = {}) {
  const noiseDb = options.silenceNoiseDb ?? -30;
  const minSilence = options.silenceMinDuration ?? 0.5;
  const padding = options.silencePadding ?? 0.08;

  const silences = await detectSilences(input, { noiseDb, minSilence });
  return silences
    .map((s) => ({ start: s.start + padding, end: s.end - padding }))
    .filter((s) => s.end - s.start > 0.05 && s.end <= meta.duration + 0.01);
}
