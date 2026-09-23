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

/** Ajuste manual (-100..100 cada) → valores de filtro. Mesmo mapeamento da prévia no site. */
export function sanitizeColorAdjust(raw) {
  const pick = (v) => Math.max(-100, Math.min(100, Math.round(Number(v) || 0)));
  const a = raw && typeof raw === 'object' ? raw : {};
  return { brightness: pick(a.brightness), contrast: pick(a.contrast), saturation: pick(a.saturation), temperature: pick(a.temperature) };
}

export const hasColorAdjust = (a) => Boolean(a && (a.brightness || a.contrast || a.saturation || a.temperature));

/** Cadeia FFmpeg do ajuste manual (depois do look), ou null se tudo em zero. Puro/testável. */
export function manualAdjustVf(raw) {
  const a = sanitizeColorAdjust(raw);
  if (!hasColorAdjust(a)) return null;
  const f = (n) => Number(n.toFixed(3));
  const parts = [];
  if (a.brightness || a.contrast || a.saturation) {
    parts.push(`eq=brightness=${f(a.brightness / 100 * 0.12)}:contrast=${f(1 + a.contrast / 100 * 0.35)}:saturation=${f(1 + a.saturation / 100 * 0.8)}`);
  }
  if (a.temperature) {
    const k = a.temperature / 100; // >0 quente (laranja), <0 frio (azul)
    parts.push(`colorbalance=rs=${f(0.08 * k)}:bs=${f(-0.08 * k)}:rm=${f(0.1 * k)}:bm=${f(-0.1 * k)}:rh=${f(0.06 * k)}:bh=${f(-0.06 * k)}`);
  }
  return parts.join(',');
}

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
  let vf = null;
  const manual = manualAdjustVf(options.colorAdjust);
  if (look === 'none') {
    if (!manual) return { output: input, look };
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

  vf = [vf, manual].filter(Boolean).join(',');
  const output = path.join(work, 'graded.mp4');
  const args = ['-i', input, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16'];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'color', totalDuration: meta.duration, onProgress });
  log.ok(`color grade aplicado: ${look}${manual ? ` + ajuste manual (${manual})` : ''}`);
  return { output, look, ai: aiAdjustments };
}
