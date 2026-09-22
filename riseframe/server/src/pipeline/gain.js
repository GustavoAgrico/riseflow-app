import path from 'node:path';
import { runFfmpeg } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('gain');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Cadeia -af do volume da fala: ganho geral + trechos com volume próprio.
 * Roda ANTES dos cortes, então os trechos usam o tempo do vídeo original — o mesmo
 * que a timeline mostra, sem remapear.
 * @returns {string} cadeia de filtro, ou '' quando não há nada a fazer
 */
export function gainAf({ audioMute, audioVolume, audioGains } = {}) {
  if (audioMute) return 'volume=0';
  const parts = [];
  const base = clamp(Number(audioVolume ?? 1), 0, 4);
  if (Math.abs(base - 1) > 0.005) parts.push(`volume=${base.toFixed(2)}`);
  for (const g of audioGains || []) {
    const s = Math.max(0, Number(g.start));
    const e = Number(g.end);
    if (!(e > s)) continue;
    const v = clamp(Number(g.volume ?? 1), 0, 4);
    // O filtro volume aceita 'enable', então cada trecho é um volume próprio na cadeia.
    parts.push(`volume=enable='between(t,${s.toFixed(2)},${e.toFixed(2)})':volume=${v.toFixed(2)}`);
  }
  return parts.join(',');
}

/**
 * Aplica o volume ao áudio (vídeo copiado, sem re-encode). Sem áudio → no-op.
 * @returns {Promise<{output:string, applied:boolean}>}
 */
export async function applyAudioGain(input, work, meta, options, onProgress) {
  if (!meta.hasAudio) {
    log.info('sem áudio; pulando ajuste de volume');
    return { output: input, applied: false };
  }
  const af = gainAf(options);
  if (!af) return { output: input, applied: false };
  const output = path.join(work, 'gain.mp4');
  const args = ['-i', input, '-c:v', 'copy', '-af', af, '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-y', output];

  await runFfmpeg(args, { label: 'gain', totalDuration: meta.duration, onProgress });
  log.ok(`volume da fala ajustado (${af})`);
  return { output, applied: true };
}
