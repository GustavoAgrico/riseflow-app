import path from 'node:path';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { faceCropGeometry } from './broll.js';
import { averageSubjectCenter } from './reframe.js';
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
  // Ponto escolhido pelo usuário; sem ele ("Automático (rosto)"), o centro do rosto
  // achado pelo rastreador — senão, o meio um pouco acima (onde costuma ficar o rosto).
  let focus = Number.isFinite(Number(options.personFocusX))
    ? { x: Number(options.personFocusX), y: Number.isFinite(Number(options.personFocusY)) ? Number(options.personFocusY) : 0.4 }
    : null;
  if (!focus) {
    const face = await averageSubjectCenter(input).catch(() => null);
    focus = face ? { x: face.x, y: face.y } : { x: 0.5, y: 0.4 };
    if (face) log.info(`zoom no rosto (${face.source}): foco (${face.x.toFixed(2)}, ${face.y.toFixed(2)})`);
  }
  const g = faceCropGeometry(W, H, W, H, focus, zoom);
  const out = path.join(work, 'frame.mp4');
  const args = ['-i', input, '-vf', `scale=${g.scaledW}:${g.scaledH}:flags=bicubic,crop=${W}:${H}:${g.cropX}:${g.cropY},setsar=1`];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push(...x264Fast(), '-movflags', '+faststart', '-y', out);

  await runFfmpeg(args, { label: 'frame', totalDuration: meta.duration, onProgress });
  log.ok(`reenquadramento ${zoom}x · foco (${focus.x.toFixed(2)}, ${focus.y.toFixed(2)})`);
  return { output: out, applied: true };
}
