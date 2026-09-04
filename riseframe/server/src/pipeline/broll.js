import path from 'node:path';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { config } from '../config.js';
import { runFfmpeg } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('broll');

/**
 * Escolhe o melhor arquivo de vídeo de um resultado do Pexels: mp4 com altura
 * mais próxima do alvo, sem passar muito da resolução (evita baixar 4K à toa).
 * Puro/exportado para teste.
 */
export function pickBestVideoFile(files, targetH) {
  const mp4 = (files || []).filter((f) => f.file_type === 'video/mp4' && f.link && f.height);
  if (!mp4.length) return null;
  const cap = targetH * 1.4;
  const scored = mp4
    .map((f) => ({ f, over: f.height > cap ? f.height - cap : 0, dist: Math.abs(f.height - targetH) }))
    .sort((a, b) => a.over - b.over || a.dist - b.dist);
  return scored[0].f;
}

/**
 * Escolhe a melhor URL de foto do Pexels: a maior versão disponível.
 * Puro/exportado para teste.
 */
export function pickBestPhotoFile(src) {
  if (!src) return null;
  return src.original || src.large2x || src.large || src.medium || null;
}

/**
 * Busca no Pexels (licença livre) e devolve o 1º vídeo ainda não usado.
 * @returns {Promise<{id:number, link:string}|null>}
 */
async function searchPexels(query, targetH, orientation, usedIds, apiKey) {
  const url =
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}` +
    `&per_page=8&orientation=${orientation}`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) {
    log.warn(`Pexels ${res.status} para "${query}"`);
    return null;
  }
  const data = await res.json();
  for (const video of data.videos || []) {
    if (usedIds.has(video.id)) continue; // dedupe entre momentos
    const file = pickBestVideoFile(video.video_files, targetH);
    if (file) return { id: video.id, link: file.link };
  }
  return null;
}

/**
 * Fallback em FOTO: quando não há vídeo para o momento, busca uma imagem do
 * Pexels que combine com o contexto/nicho e a usa como B-roll estático.
 * @returns {Promise<{id:number, link:string}|null>}
 */
async function searchPexelsPhoto(query, orientation, usedIds, apiKey) {
  const url =
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
    `&per_page=8&orientation=${orientation}`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) {
    log.warn(`Pexels fotos ${res.status} para "${query}"`);
    return null;
  }
  const data = await res.json();
  for (const photo of data.photos || []) {
    if (usedIds.has(`p${photo.id}`)) continue; // dedupe (namespace separado de vídeos)
    const link = pickBestPhotoFile(photo.src);
    if (link) return { id: `p${photo.id}`, link };
  }
  return null;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download falhou ${res.status}`);
  await streamPipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return dest;
}

/**
 * Insere B-roll em tela cheia nos momentos escolhidos, mantendo o áudio.
 * Refino: clipes deduplicados, encaixe por resolução, orientação conforme o quadro.
 * Só roda com PEXELS_API_KEY.
 * @returns {Promise<{output:string, inserted:number}>}
 */
export async function insertBroll(input, work, meta, analysis, options, onProgress) {
  // Chave da interface (options.pexelsKey) tem prioridade; senão, a do servidor (.env).
  const apiKey = options.pexelsKey || config.broll.pexelsKey;
  if (!apiKey) {
    log.info('sem chave do Pexels; pulando B-roll');
    return { output: input, inserted: 0 };
  }
  const moments = (analysis.brollMoments || []).slice(0, options.brollMax ?? 6);
  if (!moments.length) return { output: input, inserted: 0 };

  const W = meta.width || 1080;
  const H = meta.height || 1920;
  const orientation = H >= W ? 'portrait' : 'landscape';

  // Layout: tela cheia (padrão) OU tela dividida (metade a metade) com o vídeo da
  // pessoa em uma metade e o B-roll na outra (o usuário escolhe em cima/embaixo).
  const layout = ['fullscreen', 'top', 'bottom'].includes(options.brollLayout) ? options.brollLayout : 'fullscreen';
  const isSplit = layout !== 'fullscreen';
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  const regionW = W;
  const regionH = layout === 'fullscreen' ? H : even(H / 2);
  const ovY = layout === 'bottom' ? H - regionH : 0; // Y da metade do B-roll
  const personY = layout === 'top' ? regionH : 0; // pessoa fica na metade oposta

  // Baixa clipes distintos; ignora os que falharem ou repetirem. Se não houver
  // VÍDEO para o momento, cai para uma FOTO do Pexels (mesmo contexto/nicho).
  const usedIds = new Set();
  const clips = [];
  for (const m of moments) {
    try {
      let hit = await searchPexels(m.query, regionH, orientation, usedIds, apiKey);
      let isImage = false;
      if (!hit) {
        hit = await searchPexelsPhoto(m.query, orientation, usedIds, apiKey);
        isImage = true;
      }
      if (!hit) {
        log.info(`sem B-roll (vídeo/foto) para "${m.query}"`);
        continue;
      }
      usedIds.add(hit.id);
      const ext = isImage ? 'jpg' : 'mp4';
      const dest = path.join(work, `broll_${clips.length}.${ext}`);
      await download(hit.link, dest);
      clips.push({ ...m, file: dest, isImage });
    } catch (err) {
      log.warn(`B-roll "${m.query}" falhou: ${err.message}`);
    }
  }
  if (!clips.length) return { output: input, inserted: 0 };

  // Filtergraph: cada clipe (vídeo ou foto) escalado/cropado para a região do
  // layout e sobreposto na sua janela de tempo. Foto → congela pela duração.
  const parts = [];
  clips.forEach((c, i) => {
    const dur = Math.max(0.6, c.end - c.start).toFixed(2);
    parts.push(
      `[${i + 1}:v]scale=${regionW}:${regionH}:force_original_aspect_ratio=increase,crop=${regionW}:${regionH},setsar=1,` +
        `trim=0:${dur},setpts=PTS-STARTPTS+${c.start.toFixed(3)}/TB[b${i}]`,
    );
  });

  let last;
  if (isSplit) {
    // Tela dividida: a pessoa é REDIMENSIONADA para caber na metade dela (não fica
    // coberta pelo B-roll). Crop alinhado ao topo (y=0) para preservar o rosto —
    // em vídeo "talking head" a cabeça fica no terço superior.
    const n = clips.length;
    parts.push(`[0:v]split=${n + 1}[base]${clips.map((_, i) => `[p${i}]`).join('')}`);
    clips.forEach((_, i) => {
      parts.push(
        `[p${i}]scale=${regionW}:${regionH}:force_original_aspect_ratio=increase,` +
          `crop=${regionW}:${regionH}:(iw-${regionW})/2:0,setsar=1[ph${i}]`,
      );
    });
    last = '[base]';
    clips.forEach((c, i) => {
      const win = `enable='between(t,${c.start.toFixed(3)},${c.end.toFixed(3)})'`;
      const mid = `[s${i}]`;
      // 1) encaixa a pessoa na metade dela; 2) coloca o B-roll na outra metade.
      parts.push(`${last}[ph${i}]overlay=x=0:y=${personY}:${win}${mid}`);
      parts.push(`${mid}[b${i}]overlay=x=0:y=${ovY}:${win}${i === n - 1 ? '[outv]' : `[o${i}]`}`);
      last = i === n - 1 ? '[outv]' : `[o${i}]`;
    });
  } else {
    // Tela cheia: o B-roll cobre o quadro inteiro durante o momento.
    last = '[0:v]';
    clips.forEach((c, i) => {
      const out = i === clips.length - 1 ? '[outv]' : `[o${i}]`;
      parts.push(
        `${last}[b${i}]overlay=enable='between(t,${c.start.toFixed(3)},${c.end.toFixed(3)})'${out}`,
      );
      last = `[o${i}]`;
    });
  }

  const scriptPath = path.join(work, 'broll_filter.txt');
  await fs.writeFile(scriptPath, parts.join(';\n'), 'utf8');

  const output = path.join(work, 'broll.mp4');
  const args = ['-i', input];
  for (const c of clips) {
    // Foto entra como input em loop, limitado à duração do momento.
    if (c.isImage) args.push('-loop', '1', '-t', Math.max(0.6, c.end - c.start).toFixed(2));
    args.push('-i', c.file);
  }
  args.push('-filter_complex_script', scriptPath, '-map', '[outv]');
  if (meta.hasAudio) args.push('-map', '0:a', '-c:a', 'copy');
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'broll', totalDuration: meta.duration, onProgress });
  const nImg = clips.filter((c) => c.isImage).length;
  const layoutLabel = layout === 'fullscreen' ? 'tela cheia' : `tela dividida (${layout === 'top' ? 'em cima' : 'embaixo'})`;
  log.ok(`${clips.length} inserções de B-roll (${clips.length - nImg} vídeos, ${nImg} fotos, ${layoutLabel})`);
  return { output, inserted: clips.length };
}
