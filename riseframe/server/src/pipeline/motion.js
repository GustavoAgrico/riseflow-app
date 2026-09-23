import path from 'node:path';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { makeLogger } from '../logger.js';
import { keyZoomMoments } from '../../../shared/keyMoments.js';

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
 * Momentos do zoom "punch-in": só nos MOMENTOS-CHAVE da fala (ênfase, pausa antes,
 * números, perguntas…), não o vídeo inteiro. Também usados pelos SFX (whoosh).
 * `custom` = momentos definidos/ajustados pelo usuário na timeline (já na timeline final).
 * @returns {Array<[number, number, number|null]>} [início, fim, zoom próprio ou null]
 */
export function dynamicZoomWindows(segments, meta, custom) {
  const dur = Math.max(0.5, meta.duration || 1);
  if (Array.isArray(custom)) {
    return custom
      .map((m) => [Math.max(0, Number(m.start) || 0), Math.min(dur, Number(m.end) || 0), Number.isFinite(Number(m.scale)) ? Number(m.scale) : null])
      .filter(([a, b]) => b - a > 0.15)
      .sort((x, y) => x[0] - y[0])
      // Sem sobreposição: dois zooms colados somariam o fator (zoom exagerado).
      .reduce((acc, w) => {
        const prev = acc[acc.length - 1];
        const a = prev ? Math.max(w[0], prev[1]) : w[0];
        if (w[1] - a > 0.15) acc.push([a, w[1], w[2]]);
        return acc;
      }, []);
  }
  return keyZoomMoments(segments, dur).map((m) => [m.start, m.end, null]);
}

/**
 * Zoom DINÂMICO (punch-ins) nos momentos-chave: o quadro normal e, nesses pontos,
 * um zoom rápido que dá ritmo e ênfase. Puro/exportado para teste.
 * @returns {string|null} filtro zoompan, ou null se não houver momentos.
 */
export function dynamicZoomVf(segments, meta, intensity = 'medio', custom) {
  const W = meta.width || 1080;
  const H = meta.height || 1920;
  const fps = Math.max(1, Math.round(meta.fps || 30));
  const zmax = MOTION_INTENSITY[intensity] || MOTION_INTENSITY.medio;
  const windows = dynamicZoomWindows(segments, meta, custom);
  if (!windows.length) return null;

  const t = `on/${fps}`;
  const terms = windows.map(([a, b, z]) => {
    const k = (Math.min(1.6, Math.max(1.01, z || zmax)) - 1).toFixed(4);
    return `${k}*between(${t}\\,${a.toFixed(2)}\\,${b.toFixed(2)})`;
  });
  const z = `1+${terms.join('+')}`;
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
    vf = dynamicZoomVf(segments, meta, options.motionIntensity, options.zoomMoments);
    // O usuário tirou todos os zooms na timeline → sem movimento (não inventa um zoom-in).
    if (!vf && Array.isArray(options.zoomMoments)) return { output: input, motion: 'none' };
    if (!vf) { vf = motionVf('zoom-in', meta, options.motionIntensity); effective = 'zoom-in'; }
  } else {
    vf = motionVf(kind, meta, options.motionIntensity);
  }
  if (!vf) return { output: input, motion: 'none' };

  const output = path.join(work, 'motion.mp4');
  const args = ['-i', input, '-vf', vf, ...x264Fast()];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'motion', totalDuration: meta.duration, onProgress });
  log.ok(`efeito de movimento: ${effective}${effective !== kind ? ` (fallback de ${kind})` : ''} (${options.motionIntensity || 'medio'})`);
  return { output, motion: effective };
}
