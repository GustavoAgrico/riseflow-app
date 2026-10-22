// Mídias POR BAIXO do vídeo principal (faixa V0, como pôr uma imagem abaixo do V1 no
// Premiere): viram o fundo, e o vídeo principal vai por cima com transparência onde ele não
// cobre — diminuído/girado/movido (quadros-chave), recortado (Crop) ou nos espaços vazios.
// Numa passada só faz também o recorte e o movimento do vídeo principal (as etapas
// "crop" e "motion" ficam de fora quando há fundo).
import fs from 'node:fs';
import path from 'node:path';
import { runFfmpeg, x264Fast, probeSummary } from './ffmpeg.js';
import { makeLogger } from '../logger.js';
import { visualLayerParts, LAYER_ANIMATIONS } from './overlay.js';
import { cleanCrop, cropRect, blanksEnable, cleanCropRanges, cropBoxesVf } from './frame.js';
import { keyframesVf, momentsZoomVf, dynamicZoomWindows, MOTIONS } from './motion.js';
import { defaultMomentEffect } from '../../../shared/transform.js';

const log = makeLogger('underlay');
const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

/** Há mídia por baixo do vídeo principal? */
export const hasUnderlay = (o) => Array.isArray(o?.userMedia) && o.userMedia.some((m) => m && m.under && (m.kind === 'image' || m.kind === 'video'));

/**
 * `blanks` = espaços vazios já no tempo do vídeo cortado ([{start,end}]): ali o vídeo
 * principal some e o fundo aparece. → { output, applied, count }
 */
export async function applyUnderlay(input, work, meta, options, onProgress, segments, blanks = []) {
  const W = meta.width;
  const H = meta.height;
  const dur = meta.duration;
  const fps = Math.max(1, Math.round(meta.fps || 30));
  const vis = (options.userMedia || [])
    .filter((m) => m && m.under && (m.kind === 'image' || m.kind === 'video') && m.file && fs.existsSync(m.file))
    .map((m) => {
      const start = clamp(m.start, 0, Math.max(0, dur - 0.05), 0);
      const end = Math.min(dur, start + clamp(m.duration, 0.2, dur, m.kind === 'image' ? 4 : 5));
      return { ...m, start, end, d: end - start };
    })
    .filter((m) => m.d > 0.05)
    .sort((a, b) => (Number(a.layer) || 0) - (Number(b.layer) || 0) || a.start - b.start);
  if (!vis.length) return { output: input, applied: false, count: 0 };
  for (let i = 0; i < vis.length; i++) {
    const m = vis[i];
    m._inIdx = i + 1; // 0 = fundo preto do tamanho do vídeo
    if (m.mode === 'pip' && (m.animIn in LAYER_ANIMATIONS || m.animOut in LAYER_ANIMATIONS)) {
      try { const s = await probeSummary(m.file); if (s.width && s.height) m._aspect = s.height / s.width; } catch { /* ancora pelo canto */ }
    }
  }
  const parts = visualLayerParts(vis, { W, H, fps, dur }).map((p) => p.replace('[vout]', '[bg]'));
  const mainIdx = vis.length + 1;
  let chain = `[${mainIdx}:v]format=yuva420p`;
  const cr = cleanCrop(options.videoCrop);
  if (cleanCropRanges(options.cropRanges).length) {
    // recorte por pedaço: as bordas ficam transparentes só no tempo de cada pedaço
    const boxes = cropBoxesVf(W, H, cr, options.cropRanges, { alpha: true });
    if (boxes) chain += `,${boxes}`;
  } else if (cr) {
    const r = cropRect(W, H, cr);
    chain += `,crop=${r.w}:${r.h}:${r.x}:${r.y},pad=${W}:${H}:${r.x}:${r.y}:color=black@0`;
  }
  const holes = (blanks || []).filter((b) => b.end - b.start > 0.04);
  if (holes.length) chain += `,colorchannelmixer=aa=0:enable='${blanksEnable(holes)}'`;
  const kVf = keyframesVf(options.transformKeys, meta, { alpha: true });
  if (kVf) chain += `,${kVf}`;
  const kind = MOTIONS.includes(options.videoMotion) ? options.videoMotion : 'none';
  if (kind !== 'none') {
    const mVf = momentsZoomVf(dynamicZoomWindows(segments, meta, options.zoomMoments, defaultMomentEffect(kind)), meta, options.motionIntensity);
    if (mVf) chain += `,${mVf}`;
  }
  parts.push(`${chain}[mv]`, '[bg][mv]overlay=0:0:format=auto,format=yuv420p[vout]');

  const script = path.join(work, 'underlay_filter.txt');
  fs.writeFileSync(script, parts.join(';\n'), 'utf8');
  const args = ['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${fps}:d=${dur.toFixed(3)}`];
  for (const m of vis) {
    if (m.kind === 'image') args.push('-loop', '1', '-t', m.d.toFixed(2));
    else if (clamp(m.offset, 0, 100000, 0) > 0.01) args.push('-ss', clamp(m.offset, 0, 100000, 0).toFixed(3));
    args.push('-i', m.file);
  }
  args.push('-i', input, '-filter_complex_script', script, '-map', '[vout]');
  if (meta.hasAudio) args.push('-map', `${mainIdx}:a`, '-c:a', 'copy');
  const output = path.join(work, 'underlay.mp4');
  args.push(...x264Fast(), '-movflags', '+faststart', '-t', dur.toFixed(3), '-y', output);
  await runFfmpeg(args, { label: 'underlay', totalDuration: dur, onProgress });
  log.ok(`fundo por baixo do vídeo: ${vis.length} mídia(s)${cr ? ' · recorte' : ''}${kVf ? ' · quadros-chave' : ''}${holes.length ? ` · ${holes.length} espaço(s) vazio(s)` : ''}`);
  return { output, applied: true, count: vis.length };
}
