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
  zoomfix: ['perspective=x0=W*0.1:y0=H*0.1:x1=W*0.9:y1=H*0.1:x2=W*0.1:y2=H*0.9:x3=W*0.9:y3=H*0.9'],
  zoomfix2: ['perspective=x0=W*0.1667:y0=H*0.1667:x1=W*0.8333:y1=H*0.1667:x2=W*0.1667:y2=H*0.8333:x3=W*0.8333:y3=H*0.8333'],
  sway: ["rotate=a='0.05*sin(2*PI*t*0.8)':c=black"],
  handheld: ["rotate=a='0.012*sin(7*t)+0.008*sin(13*t)':c=black"],
  shakehard: ["rotate=a='0.07*sin(41*t)':c=black", 'rgbashift=rh=-4:bh=4'],
  persp3d: ['perspective=x0=W*0.08:y0=0:x1=W*0.92:y1=0:x2=0:y2=H:x3=W:y3=H'],
  tiltr: ['rotate=0.07:c=black'],
  wideangle: ['lenscorrection=k1=-0.3:k2=-0.1'],
  rgbsplit: ['rgbashift=rh=-12:bh=12'],
  pixelbig: ['pixelize=w=56:h=56'],
  grid3: ['drawgrid=w=iw/3:h=ih/3:t=2:c=white@0.55'],
  frame: ['drawbox=x=0:y=0:w=iw:h=ih:color=white:t=28'],
  black: ['drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill'],
  white: ['drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill'],
  letterbox: ['drawbox=x=0:y=0:w=iw:h=ih*0.16:color=black:t=fill', 'drawbox=x=0:y=ih*0.84:w=iw:h=ih*0.16:color=black:t=fill'],
  pillarbox: ['drawbox=x=0:y=0:w=iw*0.12:h=ih:color=black:t=fill', 'drawbox=x=iw*0.88:y=0:w=iw*0.12:h=ih:color=black:t=fill'],
  pulse: ["eq=brightness='0.18*abs(sin(2*PI*t*1.5))':eval=frame"],
  coolglow: ['colorbalance=bh=0.2:gh=0.05:rh=-0.08', 'eq=brightness=0.06:saturation=1.1'],
  scanlines: ['drawgrid=w=iw:h=6:t=2:c=black@0.35'],
  static: ['noise=alls=80:allf=t+u', 'eq=saturation=0.3'],
  summer: ['colorbalance=rm=0.1:gm=0.04:bm=-0.1', 'eq=saturation=1.3:brightness=0.03'],
  winter: ['colorbalance=bs=0.15:bm=0.1:rm=-0.06', 'eq=saturation=0.75'],
  matrix: ['colorbalance=gs=0.2:gm=0.15:rm=-0.1:bm=-0.1', 'eq=contrast=1.15'],
  noir: ['hue=s=0', 'eq=contrast=1.5:brightness=-0.05', 'vignette=PI/4'],
  popart: ['eq=saturation=2.2:contrast=1.35', "lutrgb=r='floor(val/85)*85':g='floor(val/85)*85':b='floor(val/85)*85'"],
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
