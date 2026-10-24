import fs from 'node:fs/promises';
import path from 'node:path';
import { probeSummary, runFfmpeg, x264Fast } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('sequence');

/**
 * "Timeline em branco" (como montar a sequência no Premiere): os clipes da trilha V1
 * (vídeos e imagens, na ordem, cada um aparado) viram UM vídeo — que depois abre no
 * editor com legenda, cortes, camadas e tudo. Opcional: uma música por baixo.
 *
 * Formatos diferentes no mesmo vídeo: cada clipe entra INTEIRO no quadro, com o próprio
 * clipe ampliado e desfocado preenchendo o fundo (sem tarja preta).
 */
/** Duração do quadro vazio da timeline em branco (antes de pôr os clipes). */
export const BLANK_SEC = 10;
const SIZES = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] };
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const f3 = (n) => Number(n).toFixed(3);

/** Tamanho do quadro: o formato escolhido ou o do primeiro clipe visual (até 1920 no lado maior). */
export function frameSize(aspect, first) {
  if (SIZES[aspect]) return SIZES[aspect];
  const w = first?.width || 1080;
  const h = first?.height || 1920;
  const k = Math.min(1, 1920 / Math.max(w, h));
  return [even(w * k), even(h * k)];
}

/** Duração de cada clipe na sequência (vídeo: saída − entrada; imagem: a escolhida). */
export function clipDuration(c) {
  if (c.kind === 'image') return Math.max(0.5, Math.min(60, Number(c.duration) || 3));
  if (c.kind === 'blank') return Math.max(0.2, Math.min(600, Number(c.duration) || 1)); // espaço vazio (preto, sem som)
  const a = Math.max(0, Number(c.in) || 0);
  const b = Number(c.out) > a ? Number(c.out) : a + (Number(c.duration) || 5);
  return Math.max(0.3, b - a);
}

/**
 * Dá para usar o arquivo como está? Um clipe de vídeo, do começo ao fim, sem música e no
 * formato dele (auto ou mesma proporção). Puro/exportado para teste.
 */
export function canCopyWhole(list, music, aspect) {
  if (list.length !== 1 || music?.file) return false;
  const c = list[0];
  if (c.kind !== 'video' || !(c._dur > 0) || !(c._w > 0) || !(c._h > 0)) return false;
  if ((Number(c.in) || 0) > 0.05 || Math.abs((Number(c.out) || c._dur) - c._dur) > 0.15) return false;
  // O formato (9:16…) não importa aqui: o editor e o vídeo final enquadram depois (Preencher/
  // Ajustar, foco). Antes um vídeo horizontal num projeto 9:16 era recodificado inteiro só
  // para entrar na timeline — minutos esperando em "Colocando na timeline".
  void aspect;
  return true;
}

/** Copia o vídeo para o mp4 do editor sem recodificar (troca só o contêiner). → ok */
async function copyWhole(c, output) {
  try {
    await runFfmpeg(['-i', c.file, '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', '-y', output], { label: 'sequence-copy', totalDuration: c._dur });
    const m = await probeSummary(output).catch(() => null);
    if (m?.duration > 0.3 && m.width) return true;
  } catch (e) {
    log.warn(`não deu para copiar sem recodificar (${e.message}); montando de novo`);
  }
  await fs.rm(output, { force: true }).catch(() => {});
  return false;
}

/** Filtro de montagem (puro/exportado para teste). → { parts, total } */
export function sequenceParts(clips, { W, H, fps = 30, music = null, musicIdx = null }) {
  const parts = [];
  const labels = [];
  let total = 0;
  clips.forEach((c, i) => {
    const d = clipDuration(c);
    total += d;
    // mesmo formato do quadro: só ajusta o tamanho (o fundo desfocado é a parte mais lenta)
    const same = c._w > 0 && c._h > 0 && Math.abs(c._w / c._h - W / H) < 0.01;
    parts.push(...(same ? [
      `[${i}:v]fps=${fps},scale=${W}:${H},setsar=1,format=yuv420p,trim=duration=${f3(d)},setpts=PTS-STARTPTS[v${i}]`,
    ] : [
      `[${i}:v]fps=${fps},setsar=1,split=2[bg${i}][fg${i}]`,
      `[bg${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:3,eq=brightness=-0.08[bb${i}]`,
      `[fg${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease[ff${i}]`,
      `[bb${i}][ff${i}]overlay=x=(W-w)/2:y=(H-h)/2,setsar=1,format=yuv420p,trim=duration=${f3(d)},setpts=PTS-STARTPTS[v${i}]`,
    ]),
      c._hasAudio
        ? `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=duration=${f3(d)},apad=whole_dur=${f3(d)},asetpts=PTS-STARTPTS[a${i}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${f3(d)},asetpts=PTS-STARTPTS[a${i}]`,
    );
    labels.push(`[v${i}][a${i}]`);
  });
  const mixMusic = music && musicIdx != null;
  parts.push(`${labels.join('')}concat=n=${clips.length}:v=1:a=1[vout]${mixMusic ? '[aseq]' : '[aout]'}`);
  if (mixMusic) {
    const vol = Math.max(0, Math.min(2, Number(music.volume ?? 0.35)));
    parts.push(
      `[${musicIdx}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=duration=${f3(total)},volume=${vol.toFixed(3)},asetpts=PTS-STARTPTS[mus]`,
      `[aseq][mus]amix=inputs=2:normalize=0:duration=first:dropout_transition=0,alimiter=limit=0.95[aout]`,
    );
  }
  return { parts, total };
}

/**
 * Monta a sequência em `output`. clips: [{ file, kind: 'video'|'image', in, out, duration }]
 * music: { file, volume } | null. aspect: 'auto' | '9:16' | '16:9' | '1:1' | '4:5'.
 */
export async function assembleSequence({ clips, music = null, aspect = 'auto', output, work, blank = false }, onProgress = () => {}) {
  const list = (clips || []).filter((c) => (c?.file && (c.kind === 'video' || c.kind === 'image')) || c?.kind === 'blank');
  // Timeline em branco: um quadro preto (sem som) só para abrir o editor; os clipes entram
  // depois pela aba Projeto (V1).
  if (!list.length && blank) {
    const [W, H] = frameSize(aspect === 'auto' ? '9:16' : aspect);
    await runFfmpeg(['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=30:d=${BLANK_SEC}`, ...x264Fast(), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', output],
      { label: 'sequence', totalDuration: BLANK_SEC, onProgress });
    log.ok(`timeline em branco: ${W}x${H}`);
    return { output, duration: BLANK_SEC, width: W, height: H };
  }
  if (!list.length) throw new Error('a timeline está vazia — coloque pelo menos um vídeo ou imagem');
  for (const c of list) {
    if (c.kind === 'blank') { c._hasAudio = false; continue; }
    const m = await probeSummary(c.file).catch(() => null);
    if (!m) throw new Error(`não deu para ler ${path.basename(c.file)}`);
    c._hasAudio = c.kind === 'video' && m.hasAudio;
    c._w = m.width;
    c._h = m.height;
    c._dur = m.duration;
    if (c.kind === 'video' && m.duration) {
      c.in = Math.max(0, Math.min(Number(c.in) || 0, m.duration - 0.3));
      c.out = Math.min(m.duration, Number(c.out) > c.in ? Number(c.out) : m.duration);
    }
  }
  const firstVis = list.find((c) => c.kind !== 'blank');
  // Um vídeo só, inteiro, sem música: entra ORIGINAL (cópia do arquivo, sem recodificar) —
  // colocar na timeline fica quase instantâneo e o som/qualidade são os do arquivo.
  if (canCopyWhole(list, music, aspect) && await copyWhole(list[0], output)) {
    log.ok(`timeline montada sem recodificar (vídeo original): ${path.basename(list[0].file)}`);
    onProgress(1);
    return { output, duration: list[0]._dur, width: list[0]._w, height: list[0]._h, copied: true };
  }
  const [W, H] = frameSize(aspect, firstVis ? { width: firstVis._w, height: firstVis._h } : null);
  const args = [];
  for (const c of list) {
    if (c.kind === 'blank') args.push('-f', 'lavfi', '-t', f3(clipDuration(c)), '-i', `color=c=black:s=${W}x${H}:r=30`);
    else if (c.kind === 'image') args.push('-loop', '1', '-framerate', '30', '-t', f3(clipDuration(c)), '-i', c.file);
    else args.push('-ss', f3(c.in), '-t', f3(clipDuration(c)), '-i', c.file);
  }
  const musicIdx = music?.file ? list.length : null;
  if (music?.file) args.push('-stream_loop', '-1', '-i', music.file);
  const { parts, total } = sequenceParts(list, { W, H, music, musicIdx });
  const script = path.join(work, 'sequence_filter.txt');
  await fs.mkdir(work, { recursive: true });
  await fs.writeFile(script, parts.join(';\n'), 'utf8');
  await runFfmpeg([
    ...args, '-filter_complex_script', script, '-map', '[vout]', '-map', '[aout]', '-r', '30',
    // quadro-chave a cada 0,5 s: a prévia pula os cortes sem travar (o vídeo do editor é este)
    ...x264Fast(), '-g', '15', '-keyint_min', '15', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', f3(total), '-y', output,
  ], { label: 'sequence', totalDuration: total, onProgress });
  log.ok(`timeline montada: ${list.length} clipe(s), ${total.toFixed(1)} s, ${W}x${H}${music?.file ? ' + música' : ''}`);
  return { output, duration: total, width: W, height: H };
}
