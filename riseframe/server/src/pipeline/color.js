import path from 'node:path';
import { runFfmpeg } from './ffmpeg.js';
import { analyzeAndGrade } from './autoColor.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('color');

/**
 * "Looks" cinematográficos. Cada um é uma cadeia de filtros FFmpeg.
 * teal-orange é o look-assinatura (sombras frias, pele/altas quentes).
 */
export const LOOKS = {
  none: null,
  clean: 'eq=contrast=1.04:saturation=1.06,unsharp=3:3:0.4',
  'teal-orange':
    'eq=contrast=1.09:saturation=1.16:gamma=0.98,' +
    'colorbalance=rs=-0.06:gs=0.01:bs=0.09:rm=0.02:bm=-0.02:rh=0.07:gh=0.01:bh=-0.07,' +
    'unsharp=3:3:0.5',
  warm:
    'eq=contrast=1.06:saturation=1.12:gamma_r=1.06:gamma_b=0.95,' +
    'colorbalance=rm=0.06:gm=0.01:bm=-0.05',
  cold:
    'eq=contrast=1.06:saturation=1.06,' +
    'colorbalance=rm=-0.05:gm=0.0:bm=0.07:bs=0.05',
  vibrant: 'eq=contrast=1.11:saturation=1.32:brightness=0.02,unsharp=3:3:0.6',
  moody:
    'eq=contrast=1.14:saturation=0.9:brightness=-0.03:gamma=0.95,' +
    'colorbalance=bs=0.06:rh=0.03',
};

export function lookNames() {
  // 'auto' (grade por IA) é o destaque; depois os presets fixos.
  return ['auto', ...Object.keys(LOOKS)];
}

/**
 * Aplica um look de cor. Suporta:
 * - 'auto' → grade por IA (analisa frames e calcula correção + look);
 * - presets fixos (teal-orange, warm, ...);
 * - LUT .cube via `lut:<caminho>`.
 * @returns {Promise<{output:string, look:string, ai?:object}>}
 */
export async function applyColor(input, work, meta, options, onProgress) {
  const look = options.colorLook || 'auto';

  // Grade por IA: decide a cadeia de filtros a partir da análise do próprio vídeo.
  let aiAdjustments = null;
  let vf;
  if (look === 'none') {
    return { output: input, look };
  } else if (look === 'auto') {
    try {
      const grade = await analyzeAndGrade(input);
      vf = grade.vf;
      aiAdjustments = grade.adjustments;
    } catch (err) {
      log.warn(`grade por IA falhou (${err.message}); usando teal-orange`);
      vf = LOOKS['teal-orange'];
    }
  } else if (look.startsWith('lut:')) {
    const cube = look.slice(4);
    vf = `lut3d=${cube.replace(/:/g, '\\:')}`;
  } else if (LOOKS[look]) {
    vf = LOOKS[look];
  } else {
    log.warn(`look "${look}" desconhecido; usando teal-orange`);
    vf = LOOKS['teal-orange'];
  }

  const output = path.join(work, 'graded.mp4');
  const args = ['-i', input, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19'];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'color', totalDuration: meta.duration, onProgress });
  log.ok(`color grade aplicado: ${look}`);
  return { output, look, ai: aiAdjustments };
}
