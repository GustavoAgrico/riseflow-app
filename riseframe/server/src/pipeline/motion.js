import path from 'node:path';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { makeLogger } from '../logger.js';
import { keyZoomMoments } from '../../../shared/keyMoments.js';
import { MOMENT_EFFECTS, defaultMomentEffect, cleanKeys, keysChangeAnything } from '../../../shared/transform.js';

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
 * Cada momento pode ter um efeito próprio (punch-in, zoom in/out, Ken Burns, pulse);
 * sem efeito, vale `effect` (o efeito geral escolhido).
 * @returns {Array<[number, number, number|null, string]>} [início, fim, zoom próprio ou null, efeito]
 */
export function dynamicZoomWindows(segments, meta, custom, effect = 'punch') {
  const dur = Math.max(0.5, meta.duration || 1);
  const fx = (m) => (Object.hasOwn(MOMENT_EFFECTS, m?.effect) ? m.effect : effect);
  if (Array.isArray(custom)) {
    return custom
      .map((m) => [Math.max(0, Number(m.start) || 0), Math.min(dur, Number(m.end) || 0), Number.isFinite(Number(m.scale)) ? Number(m.scale) : null, fx(m)])
      .filter(([a, b]) => b - a > 0.15)
      .sort((x, y) => x[0] - y[0])
      // Sem sobreposição: dois zooms colados somariam o fator (zoom exagerado).
      .reduce((acc, w) => {
        const prev = acc[acc.length - 1];
        const a = prev ? Math.max(w[0], prev[1]) : w[0];
        if (w[1] - a > 0.15) acc.push([a, w[1], w[2], w[3]]);
        return acc;
      }, []);
  }
  return keyZoomMoments(segments, dur).map((m) => [m.start, m.end, null, effect]);
}

/**
 * Zoom DINÂMICO (punch-ins) nos momentos-chave: o quadro normal e, nesses pontos,
 * um zoom rápido que dá ritmo e ênfase. Puro/exportado para teste.
 * @returns {string|null} filtro zoompan, ou null se não houver momentos.
 */
export function dynamicZoomVf(segments, meta, intensity = 'medio', custom, effect = 'punch') {
  return momentsZoomVf(dynamicZoomWindows(segments, meta, custom, effect), meta, intensity);
}

/**
 * Movimento SÓ nos momentos: fora deles o quadro fica normal. Cada janela aplica o seu
 * efeito no progresso p dela (mesma conta da prévia, shared/transform.js):
 * punch = k · zoom-in = k·p · zoom-out = k·(1−p) · Ken Burns = k·p + pan · pulse = respiração.
 * Puro/exportado para teste. @returns {string|null}
 */
export function momentsZoomVf(windows, meta, intensity = 'medio') {
  if (!windows?.length) return null;
  const W = meta.width || 1080;
  const H = meta.height || 1920;
  const fps = Math.max(1, Math.round(meta.fps || 30));
  const zmax = MOTION_INTENSITY[intensity] || MOTION_INTENSITY.medio;
  const T = `on/${fps}`;
  const zTerms = [];
  const panX = [];
  const panY = [];
  for (const [a, b, z, effect] of windows) {
    const k = (Math.min(1.6, Math.max(1.01, z || zmax)) - 1).toFixed(4);
    const inW = `between(${T}\\,${a.toFixed(2)}\\,${b.toFixed(2)})`;
    const p = `((${T}-${a.toFixed(3)})/${Math.max(0.01, b - a).toFixed(3)})`;
    let dz;
    switch (effect) {
      case 'zoom-in': dz = `${k}*${p}`; break;
      case 'zoom-out': dz = `${k}*(1-${p})`; break;
      case 'ken-burns': dz = `${k}*${p}`; break;
      case 'pulse': dz = `${k}*0.6*(0.5-0.5*cos(2*PI*${p}))`; break;
      default: dz = k; // punch
    }
    zTerms.push(effect === 'zoom-in' || effect === 'zoom-out' || effect === 'ken-burns' || effect === 'pulse' ? `${inW}*${dz}` : `${dz}*${inW}`);
    if (effect === 'ken-burns') {
      // anda na diagonal enquanto amplia (do canto de cima até o de baixo)
      panX.push(`${inW}*((iw-iw/zoom)*${p}-(iw/2-iw/zoom/2))`);
      panY.push(`${inW}*((ih-ih/zoom)*${p}-(ih/2-ih/zoom/2))`);
    }
  }
  const z = `1+${zTerms.join('+')}`;
  const x = `iw/2-(iw/zoom/2)${panX.length ? `+${panX.join('+')}` : ''}`;
  const y = `ih/2-(ih/zoom/2)${panY.length ? `+${panY.join('+')}` : ''}`;
  return `zoompan=z='${z}':d=1:x='${x}':y='${y}':s=${W}x${H}:fps=${fps}`;
}

/** Expressão de interpolação linear de uma propriedade entre os quadros-chave (tempo T). */
function keyExpr(keys, prop, T) {
  const v = (k) => Number(k[prop]).toFixed(4);
  if (keys.length === 1) return v(keys[0]);
  let expr = v(keys[keys.length - 1]);
  for (let i = keys.length - 2; i >= 0; i--) {
    const a = keys[i];
    const b = keys[i + 1];
    const q = `clip((${T}-${a.t.toFixed(3)})/${Math.max(0.001, b.t - a.t).toFixed(3)}\\,0\\,1)`;
    // interpolação do quadro (a mesma conta da prévia: keyCurve)
    const qq = a.eo && b.ei ? `(${q}*${q}*(3-2*${q}))` : a.eo ? `(${q}*${q})` : b.ei ? `(${q}*(2-${q}))` : q;
    const seg = a.hold ? v(a) : `${v(a)}+(${v(b)}-${v(a)})*${qq}`;
    expr = `if(lt(${T}\\,${b.t.toFixed(3)})\\,${seg}\\,${expr})`;
  }
  return expr;
}

/**
 * Transformação manual por quadros-chave (como o "Transformar" do CapCut): escala,
 * posição X/Y (fração da tela) e giro, interpolados entre os quadros. Mantém o tamanho
 * do vídeo. Escala abaixo de 100% abre espaço com preto em volta (o vídeo fica menor).
 * Puro/exportado para teste. @returns {string|null}
 */
export function keyframesVf(rawKeys, meta, { alpha = false } = {}) {
  // alpha: o que sobra em volta fica TRANSPARENTE (mostra o fundo por baixo do vídeo)
  const bg = alpha ? 'black@0' : 'black';
  const keys = cleanKeys(rawKeys);
  if (!keysChangeAnything(keys)) return null;
  const W = meta.width || 1080;
  const H = meta.height || 1920;
  const fps = Math.max(1, Math.round(meta.fps || 30));
  const parts = [];
  if (keys.some((k) => Math.abs(k.rot) > 1e-3)) {
    parts.push(`rotate=a='(${keyExpr(keys, 'rot', 't')})*PI/180':c=${bg}`);
  }
  // zoompan só amplia (zoom ≥ 1) e não deixa a janela sair do quadro: para encolher ou
  // mover além da sobra do zoom (como a prévia deixa), o quadro ganha uma moldura vazia do
  // tamanho que precisa (f×) e o zoom passa a valer f vezes mais. Sem isso o vídeo "parava"
  // na borda e saía em outro lugar.
  const need = Math.max(1, ...keys.map((k) => (1 + 2 * Math.max(Math.abs(k.x), Math.abs(k.y))) / Math.max(0.05, k.scale)));
  const f = need > 1.0001 ? Math.ceil(need * 4) / 4 : 1;
  if (f > 1) parts.push(`pad=trunc(iw*${f}/2)*2:trunc(ih*${f}/2)*2:(ow-iw)/2:(oh-ih)/2:${bg}`);
  const T = `on/${fps}`;
  const S = `(${f}*(${keyExpr(keys, 'scale', T)}))`;
  const X = `(${keyExpr(keys, 'x', T)})`;
  const Y = `(${keyExpr(keys, 'y', T)})`;
  // a janela visível tem iw/zoom de largura; mover o vídeo +X da tela = janela −X
  parts.push(`zoompan=z='${S}':d=1:x='iw/2-iw/zoom/2-${X}*iw/zoom':y='ih/2-ih/zoom/2-${Y}*ih/zoom':s=${W}x${H}:fps=${fps}`);
  return parts.join(',');
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
 * Aplica os quadros-chave (Transformar) e o movimento nos momentos-chave, numa passada
 * só. O movimento nunca vale para o vídeo inteiro: só nos momentos (os da timeline, ou
 * os escolhidos automaticamente nas frases de ênfase).
 * @returns {Promise<{output:string, motion:string, moments:number, keyframes:number}>}
 */
export async function applyMotion(input, work, meta, options, onProgress, segments) {
  const kind = MOTIONS.includes(options.videoMotion) ? options.videoMotion : 'none';
  const parts = [];
  const kVf = keyframesVf(options.transformKeys, meta);
  if (kVf) parts.push(kVf);
  let moments = 0;
  let windows = [];
  if (kind !== 'none') {
    windows = dynamicZoomWindows(segments, meta, options.zoomMoments, defaultMomentEffect(kind));
    const mVf = momentsZoomVf(windows, meta, options.motionIntensity);
    if (mVf) { parts.push(mVf); moments = windows.length; }
  }
  const keyframes = kVf ? cleanKeys(options.transformKeys).length : 0;
  if (!parts.length) return { output: input, motion: 'none', moments: 0, keyframes: 0, windows: [] };

  const output = path.join(work, 'motion.mp4');
  const args = ['-i', input, '-vf', parts.join(','), ...x264Fast()];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'motion', totalDuration: meta.duration, onProgress });
  log.ok(`movimento: ${moments ? `${kind} em ${moments} momento(s)` : 'sem momentos'}${keyframes ? ` · ${keyframes} quadro(s)-chave` : ''} (${options.motionIntensity || 'medio'})`);
  return { output, motion: moments ? kind : 'none', moments, keyframes, windows: moments ? windows : [] };
}
