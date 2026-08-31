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
 * Busca um vídeo no Pexels (licença livre) para a query dada.
 * Prefere um arquivo de resolução próxima à do projeto, sem exagerar no tamanho.
 * @returns {Promise<string|null>} URL do arquivo de vídeo, ou null.
 */
async function searchPexelsVideo(query, targetH) {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&orientation=portrait`;
  const res = await fetch(url, { headers: { Authorization: config.broll.pexelsKey } });
  if (!res.ok) {
    log.warn(`Pexels ${res.status} para "${query}"`);
    return null;
  }
  const data = await res.json();
  const video = data.videos?.[0];
  if (!video) return null;
  // Escolhe o arquivo .mp4 com altura mais próxima do alvo.
  const files = (video.video_files || []).filter((f) => f.file_type === 'video/mp4' && f.link);
  if (!files.length) return null;
  files.sort((a, b) => Math.abs((a.height || 0) - targetH) - Math.abs((b.height || 0) - targetH));
  return files[0].link;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download falhou ${res.status}`);
  await streamPipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return dest;
}

/**
 * Insere B-roll em tela cheia durante os momentos escolhidos pela análise,
 * mantendo o áudio original. Só roda com PEXELS_API_KEY configurada.
 * @returns {Promise<{output:string, inserted:number}>}
 */
export async function insertBroll(input, work, meta, analysis, options, onProgress) {
  if (!config.broll.pexelsKey) {
    log.info('sem PEXELS_API_KEY; pulando B-roll');
    return { output: input, inserted: 0 };
  }
  const moments = (analysis.brollMoments || []).slice(0, options.brollMax ?? 6);
  if (!moments.length) return { output: input, inserted: 0 };

  const W = meta.width || 1080;
  const H = meta.height || 1920;

  // Baixa os clipes; ignora os que falharem.
  const clips = [];
  for (let i = 0; i < moments.length; i++) {
    const m = moments[i];
    try {
      const link = await searchPexelsVideo(m.query, H);
      if (!link) continue;
      const dest = path.join(work, `broll_${i}.mp4`);
      await download(link, dest);
      clips.push({ ...m, file: dest });
    } catch (err) {
      log.warn(`B-roll "${m.query}" falhou: ${err.message}`);
    }
  }
  if (!clips.length) return { output: input, inserted: 0 };

  // Monta o filtergraph: cada clipe escalado/cropado e sobreposto na sua janela.
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
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'broll', totalDuration: meta.duration, onProgress });
  log.ok(`${clips.length} inserções de B-roll (Pexels)`);
  return { output, inserted: clips.length };
}
