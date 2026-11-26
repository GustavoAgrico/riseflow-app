import path from 'node:path';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { makeLogger } from '../logger.js';
import { audiogramFilter, cleanAudiogram } from '../../../shared/audiogram.js';

const log = makeLogger('audiogram');

/** Desenha a onda do áudio no vídeo (sem mexer no som). → { output, applied } */
export async function applyAudiogram(input, work, meta, opts, onProgress) {
  const o = cleanAudiogram(opts);
  if (!o || !meta.hasAudio) return { output: input, applied: false };
  const fc = audiogramFilter(o, { W: meta.width || 1080, H: meta.height || 1920, fps: meta.fps || 30 });
  const output = path.join(work, 'audiogram.mp4');
  await runFfmpeg(['-i', input, '-filter_complex', fc, '-map', '[v]', '-map', '0:a', ...x264Fast(), '-c:a', 'copy', '-movflags', '+faststart', '-y', output],
    { label: 'audiograma', totalDuration: meta.duration, onProgress });
  log.ok(`audiograma (${o.style}, ${o.position})`);
  return { output, applied: true };
}
