import path from 'node:path';
import { runFfmpeg } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('voice');

/** Intensidade da redução de ruído (dB) por nível. */
const NOISE = { suave: 8, medio: 13, forte: 20 };

/**
 * Cadeia de filtros de áudio para "correção automática de voz":
 * - highpass 80 Hz: remove ronco/rumble de fundo;
 * - afftdn: redução de ruído (nível conforme a intensidade);
 * - acompressor: equaliza a dinâmica (fala mais constante);
 * - loudnorm: normaliza o volume para -16 LUFS (padrão de redes sociais).
 * @returns {string} cadeia de filtro de áudio (-af)
 */
export function voiceAf(intensity = 'medio') {
  const nr = NOISE[intensity] || NOISE.medio;
  return [
    'highpass=f=80',
    `afftdn=nr=${nr}:nf=-25`,
    'acompressor=threshold=-18dB:ratio=3:attack=5:release=120',
    'loudnorm=I=-16:TP=-1.5:LRA=11',
  ].join(',');
}

/**
 * Aplica a melhoria de voz ao áudio (vídeo copiado, sem re-encode). Sem áudio → no-op.
 * @returns {Promise<{output:string, applied:boolean}>}
 */
export async function enhanceVoice(input, work, meta, options, onProgress) {
  if (!meta.hasAudio) {
    log.info('sem áudio; pulando correção de voz');
    return { output: input, applied: false };
  }
  const af = voiceAf(options.voiceIntensity);
  const output = path.join(work, 'voice.mp4');
  const args = ['-i', input, '-c:v', 'copy', '-af', af, '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-y', output];

  await runFfmpeg(args, { label: 'voice', totalDuration: meta.duration, onProgress });
  log.ok(`correção de voz aplicada (ruído: ${options.voiceIntensity || 'medio'}, volume normalizado)`);
  return { output, applied: true };
}
