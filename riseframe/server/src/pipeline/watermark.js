import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('watermark');

// Canto da tela → posição do logo (margem de 3,5% do lado menor).
const CORNERS = {
  tr: { x: 'W-w-M', y: 'M' },
  tl: { x: 'M', y: 'M' },
  br: { x: 'W-w-M', y: 'H-h-M' },
  bl: { x: 'M', y: 'H-h-M' },
};

/** Filtro do logo: escala pela largura do quadro, transparência e canto. Exportado para teste. */
export function watermarkFilter(meta, wm) {
  const W = meta.width || 1080;
  const H = meta.height || 1920;
  const scale = Math.min(0.35, Math.max(0.06, Number(wm.scale) || 0.14));
  const op = Math.min(1, Math.max(0.15, Number(wm.opacity) || 0.85));
  const c = CORNERS[wm.position] || CORNERS.tr;
  const M = Math.round(Math.min(W, H) * 0.035);
  const lw = Math.max(16, Math.round((W * scale) / 2) * 2);
  const pos = (s) => s.replace(/M/g, String(M));
  return `[1:v]scale=${lw}:-2,format=rgba,colorchannelmixer=aa=${op.toFixed(2)}[wm];[0:v][wm]overlay=x=${pos(c.x)}:y=${pos(c.y)}:format=auto[vout]`;
}

/**
 * Marca d'água do Brand Kit: o logo (imagem) num canto, o vídeo inteiro. Roda depois do
 * formato final e das legendas, para o logo nunca ser cortado pelo reenquadramento.
 * @returns {Promise<{output:string, applied:boolean}>}
 */
export async function applyWatermark(input, work, meta, options, onProgress) {
  const wm = options.watermark;
  if (!wm?.file || !fs.existsSync(wm.file)) return { output: input, applied: false };
  const output = path.join(work, 'watermark.mp4');
  const args = ['-i', input, '-loop', '1', '-i', wm.file, '-filter_complex', watermarkFilter(meta, wm), '-map', '[vout]'];
  if (meta.hasAudio) args.push('-map', '0:a', '-c:a', 'copy');
  args.push(...x264Fast(), '-shortest', '-movflags', '+faststart', '-y', output);
  await runFfmpeg(args, { label: 'watermark', totalDuration: meta.duration, onProgress });
  log.ok(`logo aplicado (${wm.position || 'tr'})`);
  return { output, applied: true };
}
