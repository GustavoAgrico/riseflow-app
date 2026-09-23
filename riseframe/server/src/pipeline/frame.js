import path from 'node:path';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { faceCropGeometry } from './broll.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('frame');

/**
 * Reenquadra o vídeo INTEIRO (punch-in) usando o foco + zoom manuais — funciona
 * SEM B-roll (ou com B-roll em tela cheia). Mantém as dimensões de saída: apenas
 * amplia (zoom) e recentra no foco. Zoom ~1 = sem efeito (nada a cropar).
 * @returns {Promise<{output:string, applied:boolean}>}
 */
export async function applyManualFrame(input, work, meta, options, onProgress) {
  const zoom = Math.min(3, Math.max(1, Number(options.personZoom) || 1));
  if (zoom <= 1.001) return { output: input, applied: false };

  const W = meta.width || 1080;
  const H = meta.height || 1920;
  const focus = {
    x: Number.isFinite(Number(options.personFocusX)) ? Number(options.personFocusX) : 0.5,
    y: Number.isFinite(Number(options.personFocusY)) ? Number(options.personFocusY) : 0.4,
  };
  const g = faceCropGeometry(W, H, W, H, focus, zoom);
  const out = path.join(work, 'frame.mp4');
  const args = ['-i', input, '-vf', `scale=${g.scaledW}:${g.scaledH}:flags=bicubic,crop=${W}:${H}:${g.cropX}:${g.cropY},setsar=1`];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push(...x264Fast(), '-movflags', '+faststart', '-y', out);

  await runFfmpeg(args, { label: 'frame', totalDuration: meta.duration, onProgress });
  log.ok(`reenquadramento ${zoom}x · foco (${focus.x.toFixed(2)}, ${focus.y.toFixed(2)})`);
  return { output: out, applied: true };
}
