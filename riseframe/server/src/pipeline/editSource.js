// Cópia do vídeo para EDITAR (como o proxy do Premiere): mesmo tamanho e tempo, mas com um
// quadro-chave a cada 0,5 s. Vídeo com quadros-chave raros (montagem antiga da timeline,
// alguns celulares) faz a prévia travar a cada corte, porque o navegador precisa decodificar
// segundos de vídeo para chegar no ponto depois do corte.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { makeLogger } from '../logger.js';
import { ffprobePath, probeSummary, runFfmpeg, sdrVf } from './ffmpeg.js';

const log = makeLogger('edit-source');
const building = new Map(); // id → Promise
const finished = new Map(); // id → resultado (o original já pula bem / cópia pronta)

export const editSourcePath = (id) => path.join(config.paths.cache, `${String(id).replace(/[^\w-]/g, '')}.edit.mp4`);

/** Maior distância entre quadros-chave nos primeiros 20 s (segundos). */
function keyframeGap(file) {
  return new Promise((resolve) => {
    const p = spawn(ffprobePath, ['-v', 'error', '-select_streams', 'v:0', '-skip_frame', 'nokey', '-show_entries', 'frame=best_effort_timestamp_time', '-read_intervals', '%+20', '-of', 'csv=p=0', file]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve(0));
    p.on('close', () => {
      const t = out.split(/\r?\n/).map((l) => parseFloat(l.split(',')[0])).filter(Number.isFinite).sort((a, b) => a - b);
      let gap = t.length < 2 ? 20 : 0;
      for (let i = 1; i < t.length; i++) gap = Math.max(gap, t[i] - t[i - 1]);
      resolve(gap);
    });
  });
}

/**
 * Estado da cópia de edição de um vídeo: { ready: true } quando pronta (ou não precisa),
 * { ready: false } enquanto é feita (começa na 1ª pergunta).
 */
export async function editSourceStatus(id, input) {
  const out = editSourcePath(id);
  if (fs.existsSync(out)) return { ready: true, proxy: true };
  if (finished.has(id)) return finished.get(id);
  if (building.has(id)) return { ready: false };
  const job = (async () => {
    // arquivo enorme (dezenas de GB): refazer inteiro custaria horas e o mesmo espaço em disco
    if (fs.statSync(input).size > 8 * 1024 ** 3) return { ready: true, proxy: false };
    const gap = await keyframeGap(input);
    if (gap <= 1.05) return { ready: true, proxy: false }; // já pula bem: usa o original
    const meta = await probeSummary(input);
    const tmp = `${out}.tmp.mp4`;
    const vf = sdrVf(meta);
    log.info(`cópia de edição de ${id} (quadros-chave a cada ${gap.toFixed(1)} s no original)`);
    await runFfmpeg(['-i', input, '-map', '0:v:0', '-map', '0:a:0?', ...(vf ? ['-vf', vf] : []),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-g', '15', '-keyint_min', '15', '-sc_threshold', '0', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-y', tmp], { label: 'edit-source', totalDuration: meta.duration });
    fs.renameSync(tmp, out);
    log.ok(`cópia de edição pronta: ${id}`);
    return { ready: true, proxy: true };
  })();
  building.set(id, job);
  job.then((r) => { if (!r.proxy) finished.set(id, r); }).catch(() => finished.set(id, { ready: true, proxy: false }));
  job.catch((e) => log.warn(`não deu para fazer a cópia de edição de ${id}: ${e.message}`)).finally(() => setTimeout(() => building.delete(id), 60_000));
  // vídeo curto que já pula bem responde na hora
  const quick = await Promise.race([job.catch(() => ({ ready: true, proxy: false })), new Promise((r) => setTimeout(() => r(null), 4000))]);
  return quick || { ready: false };
}
