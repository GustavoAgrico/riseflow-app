import path from 'node:path';
import fs from 'node:fs/promises';
import { runFfmpeg } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('render');

const RESIZE = {
  original: null,
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
  '1:1': { w: 1080, h: 1080 },
};

/**
 * Render final: normaliza para o formato de saída escolhido e gera um MP4 web-ready
 * (yuv420p + faststart) no diretório de outputs.
 * @returns {Promise<{output:string, aspect:string}>}
 */
export async function finalRender(input, outputsDir, jobId, meta, options, onProgress) {
  const aspect = options.aspect || 'original';
  const target = RESIZE[aspect];
  const output = path.join(outputsDir, `${jobId}.mp4`);

  const filters = [];
  if (target) {
    // Reframe: preenche o quadro alvo (crop central) — base para 16:9 → 9:16.
    filters.push(
      `scale=${target.w}:${target.h}:force_original_aspect_ratio=increase`,
      `crop=${target.w}:${target.h}`,
      'setsar=1',
    );
  }
  filters.push('format=yuv420p');

  const args = ['-i', input, '-vf', filters.join(','), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20'];
  if (meta.hasAudio) args.push('-c:a', 'aac', '-b:a', '160k');
  args.push('-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'render', totalDuration: meta.duration, onProgress });

  const stat = await fs.stat(output);
  log.ok(`render final: ${path.basename(output)} (${(stat.size / 1e6).toFixed(1)} MB, ${aspect})`);
  return { output, aspect, sizeBytes: stat.size };
}
