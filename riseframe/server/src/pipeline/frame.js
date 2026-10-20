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

/**
 * Recorte (Crop, como no Premiere): quanto tirar de cada lado, em fração (0–0,45).
 * → { l, t, r, b } ou null quando não recorta nada. Puro.
 */
export function cleanCrop(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const c = (v) => Math.max(0, Math.min(0.45, Number(v) || 0));
  const out = { l: c(raw.l), t: c(raw.t), r: c(raw.r), b: c(raw.b) };
  return out.l + out.t + out.r + out.b > 0.001 ? out : null;
}

/** Retângulo que fica (pixels pares) num quadro W×H com o recorte. Puro. */
export function cropRect(W, H, crop) {
  const ev = (n) => Math.max(2, Math.round(n / 2) * 2);
  const x = Math.round((W * crop.l) / 2) * 2;
  const y = Math.round((H * crop.t) / 2) * 2;
  return { x, y, w: Math.min(W - x, ev(W * (1 - crop.l - crop.r))), h: Math.min(H - y, ev(H * (1 - crop.t - crop.b))) };
}

/**
 * Recorte do vídeo principal: o que foi recortado fica preto e o resto continua no mesmo
 * lugar e tamanho (como o efeito Crop do Premiere). Roda antes do zoom/movimento.
 */
export async function applyVideoCrop(input, work, meta, crop, onProgress) {
  const cr = cleanCrop(crop);
  if (!cr) return { output: input, applied: false };
  const W = meta.width || 1080;
  const H = meta.height || 1920;
  const r = cropRect(W, H, cr);
  const out = path.join(work, 'crop.mp4');
  const args = ['-i', input, '-vf', `crop=${r.w}:${r.h}:${r.x}:${r.y},pad=${W}:${H}:${r.x}:${r.y}:black,setsar=1`];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push(...x264Fast(), '-movflags', '+faststart', '-y', out);
  await runFfmpeg(args, { label: 'crop', totalDuration: meta.duration, onProgress });
  log.ok(`recorte: esq ${Math.round(cr.l * 100)}% · topo ${Math.round(cr.t * 100)}% · dir ${Math.round(cr.r * 100)}% · base ${Math.round(cr.b * 100)}%`);
  return { output: out, applied: true };
}

