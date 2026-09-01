import path from 'node:path';
import fs from 'node:fs/promises';
import { runFfmpeg } from './ffmpeg.js';
import { smartReframeVf, TARGETS } from './reframe.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('render');

const RESIZE = { original: null, ...TARGETS };

/**
 * Render final: normaliza para o formato de saída escolhido e gera um MP4 web-ready
 * (yuv420p + faststart). Quando o formato exige reframe e `reframeTrack` está ligado,
 * segue o sujeito (rosto/movimento) com crop dinâmica; senão, crop central.
 * @returns {Promise<{output:string, aspect:string, sizeBytes:number, reframe:object|null}>}
 */
export async function finalRender(input, outputsDir, jobId, meta, options, onProgress) {
  const aspect = options.aspect || 'original';
  const target = RESIZE[aspect];
  const output = path.join(outputsDir, `${jobId}.mp4`);

  let vf;
  let reframe = null;
  if (target) {
    // Tenta reframe com tracking do sujeito.
    if (options.reframeTrack !== false) {
      const smart = await smartReframeVf(input, meta, target);
      if (smart) {
        vf = smart.vf;
        reframe = smart.reframe;
      }
    }
    // Fallback: crop central.
    if (!vf) {
      vf = [
        `scale=${target.w}:${target.h}:force_original_aspect_ratio=increase`,
        `crop=${target.w}:${target.h}`,
        'setsar=1',
        'format=yuv420p',
      ].join(',');
      reframe = { tracked: false, axis: null, source: 'center' };
    }
  } else {
    vf = 'format=yuv420p';
  }

  const args = ['-i', input, '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20'];
  if (meta.hasAudio) args.push('-c:a', 'aac', '-b:a', '160k');
  args.push('-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'render', totalDuration: meta.duration, onProgress });

  const stat = await fs.stat(output);
  log.ok(`render final: ${path.basename(output)} (${(stat.size / 1e6).toFixed(1)} MB, ${aspect}${reframe?.tracked ? ', tracking' : ''})`);
  return { output, aspect, sizeBytes: stat.size, reframe };
}
