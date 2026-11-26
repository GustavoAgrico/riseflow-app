// Volume padrão no vídeo final (EBU R128 / ITU-R BS.1770, como os medidores de loudness dos
// editores profissionais): mede o áudio MIXADO (fala + música + efeitos + B-roll) e ajusta
// para o alvo da plataforma em 2 passadas (linear: não esmaga a dinâmica), sem recodificar
// a imagem. Antes só a voz tratada ia a −14 LUFS; a mistura final saía no volume que desse.
import path from 'node:path';
import { runFfmpeg } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('loudness');

/** Alvos: redes sociais (Instagram/TikTok/YouTube ≈ −14), podcast (−16) e TV (EBU R128, −23). */
export const LOUDNESS_TARGETS = {
  social: { I: -14, TP: -1, LRA: 11 },
  podcast: { I: -16, TP: -1.5, LRA: 11 },
  tv: { I: -23, TP: -1, LRA: 15 },
};
export const loudnessTarget = (opt) => (opt === 'off' ? null : LOUDNESS_TARGETS[opt] || LOUDNESS_TARGETS.social);

/** O JSON que o loudnorm imprime na 1ª passada. Puro. */
export function parseLoudnorm(stderr) {
  const m = String(stderr || '').match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const n = (k) => Number(j[k]);
    const out = { I: n('input_i'), TP: n('input_tp'), LRA: n('input_lra'), thresh: n('input_thresh'), offset: n('target_offset') };
    return Object.values(out).every(Number.isFinite) ? out : null;
  } catch {
    return null;
  }
}

/** Já está no alvo (±0,7 LU e pico abaixo do teto)? Então não recodifica. Silêncio também não. Puro. */
export function loudnessOk(m, target) {
  if (!m || !target) return true;
  if (m.I < -60) return true; // praticamente sem som
  return Math.abs(m.I - target.I) <= 0.7 && m.TP <= target.TP + 0.1;
}

/** Filtro da 2ª passada com as medidas da 1ª (modo linear). Puro. */
export function secondPassAf(m, target) {
  return `loudnorm=I=${target.I}:TP=${target.TP}:LRA=${target.LRA}:measured_I=${m.I}:measured_TP=${m.TP}:measured_LRA=${m.LRA}:measured_thresh=${m.thresh}:offset=${m.offset}:linear=true:print_format=summary`;
}

/**
 * Mede e ajusta o volume do arquivo final. → { output, applied, before, target }.
 * Sem áudio, desligado ou já no alvo: devolve o próprio arquivo.
 */
export async function normalizeLoudness(input, work, meta, opt = 'social', onProgress) {
  const target = loudnessTarget(opt);
  if (!target || !meta?.hasAudio) return { output: input, applied: false };
  const probe = await runFfmpeg(['-i', input, '-map', '0:a:0', '-af', `loudnorm=I=${target.I}:TP=${target.TP}:LRA=${target.LRA}:print_format=json`, '-f', 'null', '-'],
    { label: 'loudness (medir)', totalDuration: meta.duration, onProgress: onProgress ? (p) => onProgress(p * 0.4) : undefined, quiet: true });
  const m = parseLoudnorm(probe.stderr);
  if (!m) { log.warn('não deu para medir o volume; mantendo como está'); return { output: input, applied: false }; }
  if (loudnessOk(m, target)) {
    log.info(`volume já no alvo (${m.I} LUFS, pico ${m.TP} dBTP)`);
    return { output: input, applied: false, before: m, target };
  }
  const output = path.join(work, 'loudness.mp4');
  await runFfmpeg(['-i', input, '-map', '0:v?', '-map', '0:a:0', '-c:v', 'copy', '-af', secondPassAf(m, target), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-y', output],
    { label: 'loudness', totalDuration: meta.duration, onProgress: onProgress ? (p) => onProgress(0.4 + p * 0.6) : undefined });
  log.ok(`volume final: ${m.I} → ${target.I} LUFS (pico ${m.TP} → ≤ ${target.TP} dBTP)`);
  return { output, applied: true, before: m, target };
}
