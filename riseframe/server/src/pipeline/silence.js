import { runFfmpeg } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('silence');

/**
 * Mede o volume do áudio com `volumedetect` (pico e média, em dB).
 * @returns {Promise<{maxDb:number|null, meanDb:number|null}>}
 */
export async function measureVolume(input) {
  const { stderr } = await runFfmpeg(
    ['-i', input, '-af', 'volumedetect', '-f', 'null', '-'],
    { label: 'volumedetect' },
  );
  const max = /max_volume:\s*(-?[\d.]+) dB/.exec(stderr);
  const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr);
  return {
    maxDb: max ? Number(max[1]) : null,
    meanDb: mean ? Number(mean[1]) : null,
  };
}

/**
 * Piso de ruído ADAPTATIVO: em vez de um dB fixo, define o limite de silêncio
 * relativo ao nível de voz (pico) do próprio vídeo. Assim funciona tanto em
 * gravação baixinha (não corta fala) quanto alta (não deixa pausa passar).
 * `headroomDb` = distância abaixo do pico que ainda conta como silêncio (maior =
 * corta menos). Resultado sempre dentro de [floorDb, ceilDb]. Puro/testável.
 */
export function adaptiveNoiseDb({ maxDb, meanDb } = {}, opts = {}) {
  const { headroomDb = 30, fallbackDb = -30, floorDb = -50, ceilDb = -20 } = opts;
  let db = null;
  if (typeof maxDb === 'number' && isFinite(maxDb)) db = maxDb - headroomDb;
  else if (typeof meanDb === 'number' && isFinite(meanDb)) db = meanDb - Math.max(0, headroomDb - 16);
  if (db == null || !isFinite(db)) return fallbackDb;
  return Math.min(ceilDb, Math.max(floorDb, Math.round(db)));
}

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
 * Aplica folga (padding) às faixas de silêncio e descarta as curtas demais. A folga
 * é ASSIMÉTRICA: deixa um pouco mais de silêncio ANTES da próxima palavra (padEnd)
 * para preservar o ataque da fala. Puro/testável.
 * @returns {Array<{start:number,end:number}>}
 */
export function refineSilenceRanges(silences, duration, opts = {}) {
  const { padStart = 0.08, padEnd = 0.12, minRemove = 0.06 } = opts;
  return (silences || [])
    .map((s) => ({ start: s.start + padStart, end: s.end - padEnd }))
    .filter((s) => s.start >= 0 && s.end - s.start > minRemove && s.end <= duration + 0.01);
}

/**
 * Faixas de tempo a REMOVER por silêncio, já com folga aplicada. Usa piso de ruído
 * ADAPTATIVO por padrão (medido do próprio áudio) — muito mais confiável que um dB
 * fixo entre gravações diferentes. A remontagem é feita pelo timeline.js.
 * @returns {Promise<Array<{start:number,end:number}>>}
 */
export async function silenceRemovalRanges(input, meta, options = {}) {
  const minSilence = options.silenceMinDuration ?? 0.5;
  const padStart = options.silencePadding ?? 0.08;
  const padEnd = padStart + 0.04; // preserva o ataque da próxima palavra

  let noiseDb = options.silenceNoiseDb ?? -30;
  if (options.silenceAdaptive !== false) {
    try {
      const vol = await measureVolume(input);
      const adaptive = adaptiveNoiseDb(vol, { headroomDb: options.silenceHeadroomDb ?? 30, fallbackDb: noiseDb });
      log.info(`piso adaptativo: pico ${vol.maxDb ?? '?'}dB → gate ${adaptive}dB (fixo seria ${noiseDb}dB)`);
      noiseDb = adaptive;
    } catch (err) {
      log.warn(`medição de volume falhou (${err.message}); usando piso fixo ${noiseDb}dB`);
    }
  }

  const silences = await detectSilences(input, { noiseDb, minSilence });
  return refineSilenceRanges(silences, meta.duration, { padStart, padEnd });
}
