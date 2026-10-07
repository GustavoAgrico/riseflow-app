import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { runFfmpeg, probeSummary, sdrVf } from './pipeline/ffmpeg.js';
import { makeLogger } from './logger.js';

const log = makeLogger('showcase');

// Demonstração "antes e depois" da página inicial. O admin escolhe um vídeo editado no
// próprio Riseframe; aqui guardamos uma cópia leve (H.264 720p, toca em qualquer
// navegador) do bruto e do resultado em data/showcase/. Também dá para apontar para
// arquivos hospedados fora (SHOWCASE_BEFORE_URL / SHOWCASE_AFTER_URL), que sobrevivem
// a reinícios do servidor no plano grátis do Render.
const DIR = path.join(config.paths.data, 'showcase');
const META = path.join(DIR, 'showcase.json');
const MAX_SECONDS = 60; // a demo mostra no máximo 1 minuto de cada lado

let building = null;

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(META, 'utf8'));
  } catch {
    return null;
  }
}

/** O que a página inicial precisa: URLs dos dois vídeos + números da edição, ou null. */
export function showcaseInfo() {
  const before = process.env.SHOWCASE_BEFORE_URL;
  const after = process.env.SHOWCASE_AFTER_URL;
  const meta = readMeta();
  if (before && after) return { before, after, stats: meta?.stats || null, external: true };
  if (meta?.ready && fs.existsSync(path.join(DIR, 'antes.mp4')) && fs.existsSync(path.join(DIR, 'depois.mp4'))) {
    const v = meta.updatedAt ? `?v=${Date.parse(meta.updatedAt)}` : '';
    return { before: `/api/showcase/antes.mp4${v}`, after: `/api/showcase/depois.mp4${v}`, stats: meta.stats };
  }
  return null;
}

export function showcaseStatus() {
  return { building: Boolean(building), info: showcaseInfo(), meta: readMeta() };
}

export function showcaseFile(name) {
  if (!['antes.mp4', 'depois.mp4'].includes(name)) return null;
  const p = path.join(DIR, name);
  return fs.existsSync(p) ? p : null;
}

/** Números da edição para mostrar embaixo da demo (só o que o relatório comprova). */
function statsFrom(job, beforeMeta, afterMeta) {
  const r = job.report || {};
  const o = job.options || {};
  const features = [];
  if (r.cut?.removedSeconds > 0.5) features.push('pausas cortadas');
  if (r.autoClean?.removed) features.push(`${r.autoClean.removed} muletas removidas`);
  if (r.captions?.segments) features.push('legendas');
  if (o.colorLook && o.colorLook !== 'none') features.push('cor corrigida');
  if (o.videoMotion && o.videoMotion !== 'none') features.push('zoom nos momentos-chave');
  if (o.broll) features.push('imagens de apoio (B-roll)');
  if (r.output?.aspect && r.output.aspect !== 'original') features.push(`formato ${r.output.aspect}`);
  return {
    beforeSeconds: Math.round(beforeMeta.duration || 0),
    afterSeconds: Math.round(afterMeta.duration || 0),
    removedSeconds: Math.round(r.cut?.removedSeconds || 0),
    features,
  };
}

/** Versão leve para a web: H.264, até 720p, até 1 min, sem HDR. */
async function webCopy(input, output, meta) {
  const vf = [sdrVf(meta), "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'", 'format=yuv420p']
    .filter(Boolean).join(',');
  const args = ['-i', input, '-t', String(MAX_SECONDS), '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-profile:v', 'high'];
  if (meta.hasAudio) args.push('-c:a', 'aac', '-b:a', '128k');
  else args.push('-an');
  args.push('-movflags', '+faststart', '-y', output);
  await runFfmpeg(args, { label: 'showcase', totalDuration: Math.min(MAX_SECONDS, meta.duration || MAX_SECONDS) });
}

/** Usa um vídeo editado como demo (roda em segundo plano). */
export function buildShowcase(job) {
  if (building) throw Object.assign(new Error('já estou preparando uma demonstração; aguarde'), { status: 409 });
  if (!job || job.status !== 'done') throw Object.assign(new Error('escolha um vídeo já concluído'), { status: 400 });
  if (!['auto', 'render'].includes(job.mode)) throw Object.assign(new Error('use um vídeo editado (não serve transcrição nem clipes)'), { status: 400 });
  const after = path.join(config.paths.outputs, `${job.id}.mp4`);
  if (!job.inputPath || !fs.existsSync(job.inputPath) || !fs.existsSync(after)) {
    throw Object.assign(new Error('os arquivos deste vídeo já foram apagados do servidor; edite um vídeo novo e use-o logo em seguida'), { status: 410 });
  }
  fs.mkdirSync(DIR, { recursive: true });
  building = (async () => {
    try {
      const [mb, ma] = await Promise.all([probeSummary(job.inputPath), probeSummary(after)]);
      await webCopy(job.inputPath, path.join(DIR, 'antes.tmp.mp4'), mb);
      await webCopy(after, path.join(DIR, 'depois.tmp.mp4'), ma);
      fs.renameSync(path.join(DIR, 'antes.tmp.mp4'), path.join(DIR, 'antes.mp4'));
      fs.renameSync(path.join(DIR, 'depois.tmp.mp4'), path.join(DIR, 'depois.mp4'));
      const meta = { ready: true, jobId: job.id, filename: job.filename, updatedAt: new Date().toISOString(), stats: statsFrom(job, mb, ma) };
      fs.writeFileSync(META, JSON.stringify(meta, null, 2));
      log.ok(`demonstração pronta (job ${job.id})`);
    } catch (err) {
      log.error(`demonstração falhou: ${err.message}`);
      fs.writeFileSync(META, JSON.stringify({ ...(readMeta() || {}), error: err.message, failedAt: new Date().toISOString() }, null, 2));
    } finally {
      building = null;
    }
  })();
  return { building: true };
}

export function removeShowcase() {
  for (const f of ['antes.mp4', 'depois.mp4', 'showcase.json']) fs.rmSync(path.join(DIR, f), { force: true });
}
