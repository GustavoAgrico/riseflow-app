import path from 'node:path';
import { runFfmpeg } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('motion');

/** Intensidade → zoom máximo aplicado. */
export const MOTION_INTENSITY = { suave: 1.06, medio: 1.12, forte: 1.2 };

/** Efeitos de movimento disponíveis. */
export const MOTIONS = ['none', 'dynamic', 'zoom-in', 'zoom-out', 'ken-burns', 'pulse'];

export const MOTION_LABELS = {
  none: 'Sem movimento',
  dynamic: 'Zoom dinâmico (punch-ins)',
  'zoom-in': 'Zoom in (aproxima)',
  'zoom-out': 'Zoom out (afasta)',
  'ken-burns': 'Ken Burns (zoom + pan)',
  pulse: 'Pulse (respiração sutil)',
};

/**
 * Zoom DINÂMICO (punch-ins): a cada frase alterna entre o quadro normal e um zoom
 * sutil, criando o "corte-zoom" que dá ritmo e cara de edição viral. Dirigido pelos
 * tempos das frases (transcrição). Puro/exportado para teste.
 * @param {Array<{start:number}>} segments frases na timeline final
 * @returns {string|null} filtro zoompan, ou null se não houver frases suficientes.
 */
export function dynamicZoomVf(segments, meta, intensity = 'medio') {
  const W = meta.width || 1080;
  const H = meta.height || 1920;
  const fps = Math.max(1, Math.round(meta.fps || 30));
  const dur = Math.max(0.5, meta.duration || 1);
  const zmax = MOTION_INTENSITY[intensity] || MOTION_INTENSITY.medio;
  const K = (zmax - 1).toFixed(4);

  const starts = (segments || [])
    .map((s) => Number(s.start))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
  if (starts.length < 2) return null;

  // Aplica o punch em frases alternadas (índices ímpares), com um mínimo de duração.
  const windows = [];
  for (let i = 1; i < starts.length; i += 2) {
    const a = starts[i];
    const b = i + 1 < starts.length ? starts[i + 1] : dur;
    if (b - a > 0.15) windows.push([a, Math.min(b, dur)]);
  }
  if (!windows.length) return null;

  const t = `on/${fps}`;
  const punch = windows.map(([a, b]) => `between(${t}\\,${a.toFixed(2)}\\,${b.toFixed(2)})`).join('+');
  const z = `1+${K}*(${punch})`;
  const x = 'iw/2-(iw/zoom/2)';
  const y = 'ih/2-(ih/zoom/2)';
  return `zoompan=z='${z}':d=1:x='${x}':y='${y}':s=${W}x${H}:fps=${fps}`;
}

/**
 * Monta o filtro `zoompan` para o efeito escolhido. O zoom é dirigido pelo número
 * do frame de SAÍDA (`on`), crescendo/decrescendo de forma linear e estável ao longo
 * de toda a duração — evita o acúmulo imprevisível do zoompan em vídeo.
 * @returns {string|null} cadeia de filtro, ou null para 'none'/desconhecido.
 */
export function motionVf(kind, meta, intensity = 'medio') {
  const W = meta.width || 1080;
  const H = meta.height || 1920;
  const fps = Math.max(1, Math.round(meta.fps || 30));
  const dur = Math.max(0.5, meta.duration || 1);
  const frames = Math.max(1, Math.round(fps * dur));
  const zmax = MOTION_INTENSITY[intensity] || MOTION_INTENSITY.medio;
  const cx = 'iw/2-(iw/zoom/2)'; // centraliza o recorte
  const cy = 'ih/2-(ih/zoom/2)';
  let z;
  let x = cx;
  let y = cy;

  switch (kind) {
    case 'zoom-in':
      z = `min(1+(${zmax}-1)*on/${frames},${zmax})`;
      break;
    case 'zoom-out':
      z = `max(${zmax}-(${zmax}-1)*on/${frames},1)`;
      break;
    case 'ken-burns':
      z = `min(1+(${zmax}-1)*on/${frames},${zmax})`;
      x = `(iw-iw/zoom)*on/${frames}`; // pan diagonal enquanto amplia
      y = `(ih-ih/zoom)*on/${frames}`;
      break;
    case 'pulse': {
      const amp = ((zmax - 1) * 0.6).toFixed(4); // respiração sutil (in/out)
      const period = Math.max(1, Math.round(frames / 2));
      z = `1+${amp}*(0.5-0.5*cos(2*PI*on/${period}))`;
      break;
    }
    default:
      return null;
  }
  return `zoompan=z='${z}':d=1:x='${x}':y='${y}':s=${W}x${H}:fps=${fps}`;
}

/**
 * Aplica o efeito de movimento (zoom/pan) ao vídeo, preservando resolução e áudio.
 * @returns {Promise<{output:string, motion:string}>}
 */
export async function applyMotion(input, work, meta, options, onProgress, segments) {
  const kind = options.videoMotion || 'none';
  if (!MOTIONS.includes(kind) || kind === 'none') return { output: input, motion: 'none' };
  // Zoom dinâmico depende dos tempos das frases; sem transcrição suficiente, cai para zoom-in.
  let vf;
  let effective = kind;
  if (kind === 'dynamic') {
    vf = dynamicZoomVf(segments, meta, options.motionIntensity);
    if (!vf) { vf = motionVf('zoom-in', meta, options.motionIntensity); effective = 'zoom-in'; }
  } else {
    vf = motionVf(kind, meta, options.motionIntensity);
  }
  if (!vf) return { output: input, motion: 'none' };

  const output = path.join(work, 'motion.mp4');
  const args = ['-i', input, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16'];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'motion', totalDuration: meta.duration, onProgress });
  log.ok(`efeito de movimento: ${effective}${effective !== kind ? ` (fallback de ${kind})` : ''} (${options.motionIntensity || 'medio'})`);
  return { output, motion: effective };
}
