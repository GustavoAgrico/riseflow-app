import path from 'node:path';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { faceCropGeometry } from './broll.js';
import { averageSubjectCenter } from './reframe.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('frame');

/**
 * Reenquadra o vídeo INTEIRO (punch-in) usando o foco + zoom manuais — funciona
 * SEM B-roll (ou com B-roll em tela cheia). Mantém as dimensões de saída: apenas
 * amplia (zoom) e recentra no foco. Zoom ~1 = sem efeito (nada a cropar).
 * @returns {Promise<{output:string, applied:boolean}>}
 */
export async function applyManualFrame(input, work, meta, options, onProgress) {
  const zoom = Math.min(3, Math.max(1, Number(options.personZoom) || 1));
  if (zoom <= 1.001) return { output: input, applied: false };

  const W = meta.width || 1080;
  const H = meta.height || 1920;
  // Ponto escolhido pelo usuário; sem ele ("Automático (rosto)"), o centro do rosto
  // achado pelo rastreador — senão, o meio um pouco acima (onde costuma ficar o rosto).
  let focus = Number.isFinite(Number(options.personFocusX))
    ? { x: Number(options.personFocusX), y: Number.isFinite(Number(options.personFocusY)) ? Number(options.personFocusY) : 0.4 }
    : null;
  if (!focus) {
    const face = await averageSubjectCenter(input).catch(() => null);
    focus = face ? { x: face.x, y: face.y } : { x: 0.5, y: 0.4 };
    if (face) log.info(`zoom no rosto (${face.source}): foco (${face.x.toFixed(2)}, ${face.y.toFixed(2)})`);
  }
  const g = faceCropGeometry(W, H, W, H, focus, zoom);
  const out = path.join(work, 'frame.mp4');
  const args = ['-i', input, '-vf', geoVf(W, H, g, W, H)];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push(...x264Fast(), '-movflags', '+faststart', '-y', out);

  await runFfmpeg(args, { label: 'frame', totalDuration: meta.duration, onProgress });
  log.ok(`reenquadramento ${zoom}x · foco (${focus.x.toFixed(2)}, ${focus.y.toFixed(2)})`);
  return { output: out, applied: true };
}

/**
 * Recorte (Crop, como no Premiere): quanto tirar de cada lado, em fração (0–0,45).
 * → { l, t, r, b } ou null quando não recorta nada. Puro.
 */
/**
 * Ampliar + cortar (geometria do faceCropGeometry) na ordem barata: corta no vídeo de
 * origem só o pedaço que aparece e amplia esse pedaço — antes ampliava o quadro inteiro
 * (ex.: 3413×1920) para jogar a maior parte fora. Mesmo enquadramento. Puro.
 */
export function geoVf(W0, H0, g, W, H) {
  const kx = W0 / g.scaledW;
  const ky = H0 / g.scaledH;
  const cw = Math.max(2, Math.min(W0, Math.round(W * kx)));
  const ch = Math.max(2, Math.min(H0, Math.round(H * ky)));
  const cx = Math.max(0, Math.min(W0 - cw, Math.round(g.cropX * kx)));
  const cy = Math.max(0, Math.min(H0 - ch, Math.round(g.cropY * ky)));
  return `crop=${cw}:${ch}:${cx}:${cy},scale=${W}:${H}:flags=bicubic,setsar=1`;
}

export function cleanCrop(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const c = (v) => Math.max(0, Math.min(0.45, Number(v) || 0));
  const out = { l: c(raw.l), t: c(raw.t), r: c(raw.r), b: c(raw.b) };
  return out.l + out.t + out.r + out.b > 0.001 ? out : null;
}

/**
 * Recorte só num trecho (pedaço da V1, como o Crop do clipe no Premiere): vale no lugar do
 * recorte geral dentro de [start,end). Recorte zerado também conta (pedaço sem recorte).
 * → [{ start, end, l, t, r, b }] em ordem, sem sobreposição. Puro.
 */
export function cleanCropRanges(raw) {
  if (!Array.isArray(raw)) return [];
  const c = (v) => Math.max(0, Math.min(0.45, Number(v) || 0));
  const out = [];
  for (const x of raw.slice(0, 100)) {
    const start = Math.max(0, Number(x?.start));
    const end = Number(x?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.05) continue;
    out.push({ start: +start.toFixed(3), end: +end.toFixed(3), l: c(x.l), t: c(x.t), r: c(x.r), b: c(x.b) });
  }
  out.sort((a, b) => a.start - b.start);
  const kept = [];
  for (const x of out) if (!kept.length || x.start >= kept[kept.length - 1].end - 0.001) kept.push(x);
  return kept;
}

/** Há algum recorte para fazer (geral ou por trecho)? Puro. */
export const hasCrop = (o) => Boolean(cleanCrop(o?.videoCrop)) || cleanCropRanges(o?.cropRanges).some((x) => x.l + x.t + x.r + x.b > 0.001);

/**
 * Filtro do recorte com trechos: pinta de preto (ou transparente, com alpha) as bordas
 * recortadas, cada trecho no seu tempo e o recorte geral fora deles. Mantém tamanho e lugar.
 * null quando não há o que pintar. Puro.
 */
export function cropBoxesVf(W, H, crop, ranges, { alpha = false } = {}) {
  const list = cleanCropRanges(ranges);
  const color = alpha ? 'black@0:replace=1' : 'black';
  const boxes = [];
  const paint = (cr, enable) => {
    if (!cr || cr.l + cr.t + cr.r + cr.b <= 0.001) return;
    const r = cropRect(W, H, cr);
    const en = enable ? `:enable='${enable}'` : '';
    const box = (x, y, w, h) => { if (w > 0 && h > 0) boxes.push(`drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${color}:t=fill${en}`); };
    box(0, 0, W, r.y); // topo
    box(0, r.y + r.h, W, H - r.y - r.h); // base
    box(0, r.y, r.x, r.h); // esquerda
    box(r.x + r.w, r.y, W - r.x - r.w, r.h); // direita
  };
  const inAny = list.map((x) => `between(t,${x.start.toFixed(3)},${(x.end - 0.001).toFixed(3)})`).join('+');
  paint(cleanCrop(crop), list.length ? `not(${inAny})` : '');
  for (const x of list) paint(x, `between(t,${x.start.toFixed(3)},${(x.end - 0.001).toFixed(3)})`);
  return boxes.length ? boxes.join(',') : null;
}

/** Retângulo que fica (pixels pares) num quadro W×H com o recorte. Puro. */
export function cropRect(W, H, crop) {
  const ev = (n) => Math.max(2, Math.round(n / 2) * 2);
  const x = Math.round((W * crop.l) / 2) * 2;
  const y = Math.round((H * crop.t) / 2) * 2;
  return { x, y, w: Math.min(W - x, ev(W * (1 - crop.l - crop.r))), h: Math.min(H - y, ev(H * (1 - crop.t - crop.b))) };
}

/**
 * Recorte do vídeo principal: o que foi recortado fica preto e o resto continua no mesmo
 * lugar e tamanho (como o efeito Crop do Premiere). Roda antes do zoom/movimento.
 */
export async function applyVideoCrop(input, work, meta, crop, onProgress, ranges = []) {
  const cr = cleanCrop(crop);
  const W = meta.width || 1080;
  const H = meta.height || 1920;
  const list = cleanCropRanges(ranges);
  let vf;
  if (list.length) {
    // recorte por trecho (pedaço da V1): bordas pintadas só no tempo de cada um
    const boxes = cropBoxesVf(W, H, cr, list);
    if (!boxes) return { output: input, applied: false };
    vf = `${boxes},setsar=1`;
  } else {
    if (!cr) return { output: input, applied: false };
    const r = cropRect(W, H, cr);
    vf = `crop=${r.w}:${r.h}:${r.x}:${r.y},pad=${W}:${H}:${r.x}:${r.y}:black,setsar=1`;
  }
  const out = path.join(work, 'crop.mp4');
  const args = ['-i', input, '-vf', vf];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push(...x264Fast(), '-movflags', '+faststart', '-y', out);
  await runFfmpeg(args, { label: 'crop', totalDuration: meta.duration, onProgress });
  if (!cr) { log.ok(`recorte por trecho: ${list.length} pedaço(s)`); return { output: out, applied: true }; }
  log.ok(`recorte${list.length ? ` (+${list.length} pedaço(s))` : ''}: esq ${Math.round(cr.l * 100)}% · topo ${Math.round(cr.t * 100)}% · dir ${Math.round(cr.r * 100)}% · base ${Math.round(cr.b * 100)}%`);
  return { output: out, applied: true };
}

/** Trechos vazios (Excluir no vídeo, como o "lift" do Premiere): [{start,end}] limpos. Puro. */
export function cleanBlanks(raw) {
  if (!Array.isArray(raw)) return [];
  // audio:false = só a imagem sai (áudio desvinculado); sem a marca, imagem e som saem
  const list = raw
    .map((b) => ({ start: Math.max(0, Number(b?.start)), end: Number(b?.end), audio: b?.audio !== false }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end - b.start >= 0.05)
    .sort((a, b) => a.start - b.start)
    .slice(0, 100);
  const out = [];
  for (const b of list) {
    const last = [...out].reverse().find((x) => (x.audio !== false) === b.audio);
    if (last && b.start <= last.end + 0.01) last.end = Math.max(last.end, +b.end.toFixed(3));
    else out.push({ start: +b.start.toFixed(3), end: +b.end.toFixed(3), ...(b.audio ? {} : { audio: false }) });
  }
  return out;
}

/** Expressão "dentro de algum trecho" para o enable= do FFmpeg. Puro. */
export function blanksEnable(blanks) {
  return blanks.map((b) => `between(t,${b.start.toFixed(3)},${b.end.toFixed(3)})`).join('+');
}

/**
 * Trechos vazios do vídeo principal: a imagem fica preta e o som some (ou fica, nos
 * trechos `audio:false`, do áudio desvinculado), sem mudar a
 * duração (o espaço continua lá, como no Premiere; camadas e legendas seguem por cima).
 * Roda no tempo original, antes dos cortes.
 */
export async function applyVideoBlanks(input, work, meta, blanks, onProgress) {
  const list = cleanBlanks(blanks);
  if (!list.length) return { output: input, applied: false };
  const en = blanksEnable(list);
  const withSound = list.filter((b) => b.audio !== false);
  const out = path.join(work, 'blanks.mp4');
  const args = ['-i', input, '-vf', `drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='${en}'`];
  if (meta.hasAudio && withSound.length) args.push('-af', `volume=0:enable='${blanksEnable(withSound)}'`, '-c:a', 'aac', '-b:a', '192k');
  else if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push(...x264Fast(), '-movflags', '+faststart', '-y', out);
  await runFfmpeg(args, { label: 'blank', totalDuration: meta.duration, onProgress });
  log.ok(`trechos vazios: ${list.length}`);
  return { output: out, applied: true };
}

