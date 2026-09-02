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

  // Baixa clipes distintos; ignora os que falharem ou repetirem.
  const usedIds = new Set();
  const clips = [];
  for (const m of moments) {
    try {
      const hit = await searchPexels(m.query, H, orientation, usedIds, apiKey);
      if (!hit) {
        log.info(`sem B-roll para "${m.query}"`);
        continue;
      }
      usedIds.add(hit.id);
      const dest = path.join(work, `broll_${clips.length}.mp4`);
      await download(hit.link, dest);
      clips.push({ ...m, file: dest });
    } catch (err) {
      log.warn(`B-roll "${m.query}" falhou: ${err.message}`);
    }
  }
  if (!clips.length) return { output: input, inserted: 0 };

  // Filtergraph: cada clipe escalado/cropado e sobreposto na sua janela.
  const parts = [];
  clips.forEach((c, i) => {
    const dur = Math.max(0.6, c.end - c.start).toFixed(2);
    parts.push(
      `[${i + 1}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,` +
        `trim=0:${dur},setpts=PTS-STARTPTS+${c.start.toFixed(3)}/TB[b${i}]`,
    );
  });
  let last = '[0:v]';
  clips.forEach((c, i) => {
    const out = i === clips.length - 1 ? '[outv]' : `[o${i}]`;
    parts.push(
      `${last}[b${i}]overlay=enable='between(t,${c.start.toFixed(3)},${c.end.toFixed(3)})'${out}`,
    );
    last = `[o${i}]`;
  });

  const scriptPath = path.join(work, 'broll_filter.txt');
  await fs.writeFile(scriptPath, parts.join(';\n'), 'utf8');

  const output = path.join(work, 'broll.mp4');
  const args = ['-i', input];
  for (const c of clips) args.push('-i', c.file);
  args.push('-filter_complex_script', scriptPath, '-map', '[outv]');
  if (meta.hasAudio) args.push('-map', '0:a', '-c:a', 'copy');
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'broll', totalDuration: meta.duration, onProgress });
  log.ok(`${clips.length} inserções de B-roll (Pexels, clipes distintos)`);
  return { output, inserted: clips.length };
}
