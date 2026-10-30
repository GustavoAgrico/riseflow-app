// Câmera do Reel VSL: tela cheia com punch-in ↔ tela dividida (o apresentador num card
// embaixo, painel roxo em cima), troca animada de 0,45 s; gancho dessaturado com glitch;
// cor suave no rosto. Uma passada de FFmpeg; os textos/objetos/sons vêm do plano
// (shared/vslPlan.js) pelas etapas normais.
import fs from 'node:fs';
import path from 'node:path';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { elementFile, ELEMENTS_DIR } from './elements.js';
import { VSL_CARD, VSL_PUNCH, VSL_SWITCH } from '../../../shared/vslPlan.js';
import { log } from '../logger.js';

const f3 = (n) => Number(n).toFixed(3);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SPLIT_SCALE = 0.96; // escala do vídeo dentro do card

/** Quanto a tela está dividida (0 = tela cheia, 1 = dividida) no tempo t, com curva suave. */
export function splitAmountExpr(splits, D = VSL_SWITCH) {
  if (!splits?.length) return '0';
  const sm = (p) => `(${p})*(${p})*(3-2*(${p}))`;
  return splits.map(({ start: a, end: b }) => {
    const pin = `clip((t-${f3(a)})/${f3(D)},0,1)`;
    const pout = `clip((${f3(b + D)}-t)/${f3(D)},0,1)`;
    return `${sm(pin)}*${sm(pout)}`;
  }).join('+');
}

/** Escala da câmera em tela cheia: punch base + punch seco nas frases de impacto. */
export function punchExpr(punches) {
  return [f3(VSL_PUNCH), ...(punches || []).map((p) => `${f3(p.scale - VSL_PUNCH)}*between(t,${f3(p.start)},${f3(p.end)})`)].join('+');
}

/**
 * Filtro da câmera. Entradas: 0 = vídeo, 1 = fundo roxo (imagem em loop), 2 = moldura do card.
 * @returns {string[]} partes do filter_complex terminando em [vout]
 */
export function vslCameraParts({ W, H, splits = [], punches = [], hook = null, focus = null }) {
  const fx = clamp(focus?.x ?? 0.5, 0.15, 0.85);
  const fy = clamp(focus?.y ?? 0.36, 0.15, 0.7);
  const K = `(${splitAmountExpr(splits)})`;
  const P = `(${punchExpr(punches)})`;
  const S = `(${P}+(${SPLIT_SCALE}-${P})*${K})`;
  // tela dividida: o rosto fica no terço de cima do card, sem deixar borda dentro dele
  const cx0 = VSL_CARD.x * W;
  const cy0 = VSL_CARD.y * H;
  const cx1 = cx0 + VSL_CARD.w * W;
  const cy1 = cy0 + VSL_CARD.h * H;
  const vw = W * SPLIT_SCALE;
  const vh = H * SPLIT_SCALE;
  const xS = clamp(W / 2 - fx * vw, cx1 - vw, cx0);
  const yS = clamp(cy0 + VSL_CARD.h * H * 0.4 - fy * vh, cy1 - vh, cy0);
  // tela cheia: o punch cresce a partir do rosto (o quadro continua coberto)
  const xA = `${f3(fx * W)}*(1-${S})`;
  const yA = `${f3(fy * H)}*(1-${S})`;
  const X = `(${xA})*(1-${K})+${f3(xS)}*${K}`;
  const Y = `(${yA})*(1-${K})+${f3(yS)}*${K}`;
  const look = ['eq=saturation=1.04:contrast=1.05:brightness=-0.015'];
  if (hook?.end) {
    const h = f3(hook.end);
    const g = f3(hook.end + 0.22);
    look.push(`hue=s=0.2:enable='lt(t,${h})'`, `rgbashift=rh=-16:bh=16:enable='between(t,${h},${g})'`, `noise=alls=28:allf=t:enable='between(t,${h},${g})'`);
  }
  const parts = [
    `[0:v]${look.join(',')},scale=w='2*trunc(${W}*${S}/2)':h='2*trunc(${H}*${S}/2)':eval=frame,setsar=1[cam]`,
    `[1:v]scale=${W}:${H},setsar=1,format=yuv420p[bg]`,
    `[bg][cam]overlay=x='round(${X})':y='round(${Y})':eval=frame:shortest=1${splits.length ? '[base]' : ',format=yuv420p[vout]'}`,
  ];
  if (splits.length) {
    parts.push(`[2:v]scale=${W}:${H},format=rgba,split=${splits.length}${splits.map((_, i) => `[f${i}]`).join('')}`);
    let last = '[base]';
    splits.forEach((sp, i) => {
      parts.push(`[f${i}]fade=t=in:st=${f3(sp.start)}:d=${f3(VSL_SWITCH)}:alpha=1,fade=t=out:st=${f3(sp.end)}:d=${f3(VSL_SWITCH)}:alpha=1[g${i}]`);
      const out = i === splits.length - 1 ? '[vfr]' : `[o${i}]`;
      parts.push(`${last}[g${i}]overlay=enable='between(t,${f3(sp.start - 0.02)},${f3(sp.end + VSL_SWITCH + 0.02)})'${out}`);
      last = out;
    });
    parts.push('[vfr]format=yuv420p[vout]');
  }
  return parts;
}

/** Aplica a câmera do VSL. `plan` = vslPlan(...); `focus` = centro do rosto (0–1) ou null. */
export async function applyVslCamera(input, work, meta, plan, focus, onProgress) {
  const W = meta.width;
  const H = meta.height;
  const dur = meta.duration;
  const fps = meta.fps || 30;
  const parts = vslCameraParts({ W, H, splits: plan.splits, punches: plan.punches, hook: plan.hook, focus });
  const script = path.join(work, 'vsl_filter.txt');
  fs.writeFileSync(script, parts.join(';\n'), 'utf8');
  const output = path.join(work, 'vsl.mp4');
  const still = (file) => ['-framerate', f3(fps), '-loop', '1', '-t', f3(dur), '-i', file];
  const args = ['-i', input, ...still(elementFile('backgrounds/vsl')), ...still(path.join(ELEMENTS_DIR, 'vsl', 'frame.png')),
    '-filter_complex_script', script, '-map', '[vout]'];
  if (meta.hasAudio) args.push('-map', '0:a', '-c:a', 'copy');
  args.push(...x264Fast(), '-movflags', '+faststart', '-t', f3(dur), '-y', output);
  await runFfmpeg(args, { label: 'vsl', totalDuration: dur, onProgress });
  log.ok(`Reel VSL: ${plan.splits.length} telas divididas, ${plan.punches.length} punch(es) de impacto`);
  return { output };
}

/** Áudio final a −14 LUFS (pico ≤ −1 dBTP), sem recodificar a imagem. */
export async function applyLoudness(input, work, meta, onProgress) {
  if (!meta.hasAudio) return { output: input, applied: false };
  const output = path.join(work, 'loud.mp4');
  await runFfmpeg(['-i', input, '-map', '0:v', '-map', '0:a', '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-y', output],
    { label: 'loudness', totalDuration: meta.duration, onProgress });
  return { output, applied: true };
}
