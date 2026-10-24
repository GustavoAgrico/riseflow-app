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
  // ── estilo CapCut ──
  vhs: ['rgbashift=rh=-6:bh=6', 'noise=alls=18:allf=t', 'eq=saturation=1.3:contrast=1.1'],
  // glitch pisca: o deslocamento de cor só liga em metade de cada 0,2 s (ver enableFor)
  glitch: ['rgbashift=rh=14:bv=-10:edge=wrap', 'noise=alls=32:allf=t+u'],
  shake: ["rotate=a='0.035*sin(57*t)':c=black"],
  strobe: ["eq=brightness='0.38*gt(sin(2*PI*t*4),0.55)':eval=frame"],
  negative: ['negate'],
  mirror: ['hflip'],
  pixel: ['pixelize=w=28:h=28'],
  cold: ['colortemperature=temperature=10000', 'eq=saturation=0.9'],
  warm: ['colortemperature=temperature=3400', 'eq=saturation=1.1'],
  saturated: ['eq=saturation=1.9:contrast=1.08'],
  // ── como o painel do Film Impact (categorias do Premiere) ──
  blursoft: ['gblur=sigma=5'],
  bokeh: ['boxblur=22:2', 'eq=brightness=0.04:saturation=1.2'],
  chblur: ['chromashift=cbh=12:crh=-12', 'gblur=sigma=3'],
  motionblur: ['dblur=angle=0:radius=22'],
  sharpen: ['unsharp=7:7:1.8'],
  faded: ['eq=contrast=0.82:saturation=0.7:brightness=0.05'],
  contrast: ['eq=contrast=1.45:saturation=1.1'],
  tealorange: ['colorbalance=rs=-0.15:bs=0.2:rh=0.15:bh=-0.15', 'eq=saturation=1.2'],
  cinematic: ['eq=contrast=1.15:saturation=0.85', 'colorbalance=bs=0.1:rh=0.08'],
  desat: ['hue=s=0.4'],
  tint: ['colorize=hue=210:saturation=0.6:lightness=0.5'],
  brighten: ['eq=brightness=0.12'],
  darken: ['eq=brightness=-0.12'],
  exposure: ['exposure=exposure=0.8'],
  vflip: ['vflip'],
  fisheye: ['lenscorrection=k1=0.45:k2=0.45'],
  tilt: ['rotate=-0.07:c=black'],
  posterize: ["lutrgb=r='floor(val/64)*64':g='floor(val/64)*64':b='floor(val/64)*64'"],
  edges: ['edgedetect=mode=colormix:high=0.25'],
  sketch: ['edgedetect=mode=wires:high=0.2', 'negate'],
  emboss: ['hue=s=0', "convolution=0m='-2 -1 0 -1 1 1 0 1 2'"],
  noisehard: ['noise=alls=48:allf=t+u'],
  goldlight: ['colorbalance=rh=0.22:gh=0.08:bh=-0.1', 'eq=brightness=0.05:saturation=1.15'],
};

/** Janela de cada efeito; alguns piscam dentro dela (glitch). */
function enableFor(effect, f, m) {
  const win = `between(t,${m.start.toFixed(3)},${m.end.toFixed(3)})`;
  if (effect === 'glitch' && f.startsWith('rgbashift')) return `enable='${win}*lt(mod(t,0.2),0.1)'`;
  return `enable='${win}'`;
}

/**
 * Cadeia -vf dos efeitos de vídeo, cada um só no seu momento (enable=between).
 * Puro/exportado para teste. @returns {string|null}
 */
export function videoFxVf(moments) {
  const parts = [];
  for (const m of moments || []) {
    const list = FX[m.effect];
    if (!list) continue;
    // filtro sem opções (negate, hflip) recebe o enable com "=", os outros com ":"
    for (const f of list) parts.push(`${f}${f.includes('=') ? ':' : '='}${enableFor(m.effect, f, m)}`);
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
