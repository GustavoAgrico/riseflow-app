import path from 'node:path';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('videofx');

/** Filtros FFmpeg de cada efeito (todos aceitam enable=, então valem só na janela). */
const FX = {
  bw: ['hue=s=0'],
  retro: ['curves=preset=vintage', 'noise=alls=10:allf=t'],
  nostalgic: ['colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131', 'vignette=PI/5'],
  grain: ['noise=alls=26:allf=t+u'],
  vignette: ['vignette=PI/4'],
  // Moldura de filme: faixas pretas em cima e embaixo (cinema).
  film: ['drawbox=x=0:y=0:w=iw:h=ih*0.11:color=black:t=fill', 'drawbox=x=0:y=ih*0.89:w=iw:h=ih*0.11:color=black:t=fill'],
  blur: ['gblur=sigma=14'],
  glow: ['eq=brightness=0.06:saturation=1.35:contrast=1.05'],
};

/**
 * Cadeia -vf dos efeitos de vídeo, cada um só no seu momento (enable=between).
 * Puro/exportado para teste. @returns {string|null}
 */
export function videoFxVf(moments) {
  const parts = [];
  for (const m of moments || []) {
    const list = FX[m.effect];
    if (!list) continue;
    const en = `enable='between(t,${m.start.toFixed(3)},${m.end.toFixed(3)})'`;
    for (const f of list) parts.push(`${f}:${en}`);
  }
  return parts.length ? parts.join(',') : null;
}

/** Aplica os efeitos de vídeo nos momentos (antes das legendas e dos textos). */
export async function applyVideoFx(input, work, meta, moments, onProgress) {
  const vf = videoFxVf(moments);
  if (!vf) return { output: input, applied: false, count: 0 };
  const output = path.join(work, 'videofx.mp4');
  const args = ['-i', input, '-vf', `${vf},format=yuv420p`, ...x264Fast()];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', '-y', output);
  await runFfmpeg(args, { label: 'videofx', totalDuration: meta.duration, onProgress });
  log.ok(`efeitos de vídeo: ${moments.map((m) => m.effect).join(', ')}`);
  return { output, applied: true, count: moments.length };
}
