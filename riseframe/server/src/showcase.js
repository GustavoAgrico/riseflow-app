import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { config } from './config.js';
import { runFfmpeg, probeSummary, sdrVf } from './pipeline/ffmpeg.js';
import { makeLogger } from './logger.js';
import { zipFiles } from './zip.js';
import { cloudRemoveShowcase, cloudReplaceShowcase } from './cloudSync.js';

const log = makeLogger('showcase');

// Demonstração "antes e depois" da página inicial. O admin escolhe um vídeo editado no
// próprio Riseframe; aqui guardamos uma cópia leve (H.264 720p, toca em qualquer
// navegador) do bruto e do resultado em data/showcase/. Também dá para apontar para
// arquivos hospedados fora (SHOWCASE_BEFORE_URL / SHOWCASE_AFTER_URL), que sobrevivem
// a reinícios do servidor no plano grátis do Render.
const DIR = path.join(config.paths.data, 'showcase');
// Demo que vem JUNTO com o site (web/public/demo → web/dist/demo): permanente, não some
// quando o servidor reinicia. É o pacote baixado pelo admin e colocado no projeto.
const BUNDLED_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist', 'demo');
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
    return { before: `/api/showcase/antes.mp4${v}`, after: `/api/showcase/depois.mp4${v}`, stats: meta.stats, sim: meta.sim || null };
  }
  return bundledInfo();
}

/** Demo empacotada no site (arquivos estáticos em /demo/). */
function bundledInfo() {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(BUNDLED_DIR, 'showcase.json'), 'utf8'));
    if (!meta?.ready || !fs.existsSync(path.join(BUNDLED_DIR, 'antes.mp4'))) return null;
    const fix = (u) => (typeof u === 'string' ? u.replace('/api/showcase/', '/demo/') : u);
    const sim = meta.sim ? { ...meta.sim, broll: (meta.sim.broll || []).map((b) => ({ ...b, src: fix(b.src) })) } : null;
    return { before: '/demo/antes.mp4', after: '/demo/depois.mp4', stats: meta.stats, sim, bundled: true };
  } catch {
    return null;
  }
}

export function showcaseStatus() {
  return { building: Boolean(building), info: showcaseInfo(), meta: readMeta() };
}

export function showcaseFile(name) {
  if (!['antes.mp4', 'depois.mp4'].includes(name) && !/^broll_\d{1,2}\.(jpg|mp4)$/.test(name)) return null;
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
  if (o.videoMotion && o.videoMotion !== 'none') features.push(o.videoMotion === 'dynamic' ? 'zoom nos momentos-chave' : 'movimento de câmera');
  if (o.broll) features.push('imagens de apoio (B-roll)');
  if (r.output?.aspect && r.output.aspect !== 'original') features.push(`formato ${r.output.aspect}`);
  return {
    beforeSeconds: Math.round(beforeMeta.duration || 0),
    afterSeconds: Math.round(afterMeta.duration || 0),
    removedSeconds: Math.round(r.cut?.removedSeconds || 0),
    features,
  };
}

/** Baixa uma mídia de B-roll (link público do banco de imagens) para a pasta da demo. */
async function fetchTo(url, dest) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Riseframe/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

/**
 * Tudo que o SIMULADOR da página inicial precisa para refazer a edição ao vivo sobre o
 * vídeo bruto (timeline original, até MAX_SECONDS): fala com tempos por palavra (e as
 * palavras cortadas), trechos mantidos, B-roll, zooms, cor, legenda e formato.
 */
async function simFrom(job, beforeMeta) {
  const r = job.report || {};
  const o = job.options || {};
  const limit = Math.min(MAX_SECONDS, beforeMeta.duration || MAX_SECONDS);
  const source = job.mode === 'render' ? job.editedTranscript : r.editorTranscript || r.transcript;
  const segments = (source?.segments || [])
    .filter((sg) => Number(sg.start) < limit)
    .map((sg) => ({
      start: +Number(sg.start).toFixed(3),
      end: +Math.min(limit, Number(sg.end) || 0).toFixed(3),
      text: sg.text || '',
      words: (sg.words || []).filter((w) => Number(w.start) < limit).map((w) => ({
        start: +Number(w.start).toFixed(3), end: +Number(w.end).toFixed(3), word: String(w.word ?? ''), ...(w.removed ? { removed: true } : {}),
      })),
    }));
  const keep = (r.cut?.keep || [{ start: 0, end: limit }])
    .filter((k) => k.start < limit)
    .map((k) => ({ start: +k.start.toFixed(3), end: +Math.min(limit, k.end).toFixed(3) }));
  const broll = [];
  for (const it of r.broll?.items || []) {
    if (!it.link || it.start >= limit || broll.length >= 12) continue;
    const name = `broll_${broll.length}.${it.kind === 'video' ? 'mp4' : 'jpg'}`;
    try {
      await fetchTo(it.link, path.join(DIR, name));
      broll.push({ start: it.start, end: Math.min(limit, it.end), kind: it.kind, src: `/api/showcase/${name}`, query: it.query, zoom: it.zoom, fx: it.fx, fy: it.fy });
    } catch (err) {
      log.warn(`B-roll da demo não baixou (${it.query || it.link}): ${err.message}`);
    }
  }
  const pick = (keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
  return {
    duration: +limit.toFixed(3),
    width: beforeMeta.width, height: beforeMeta.height,
    segments, keep, broll,
    brollLayout: r.broll?.layout || o.brollLayout || 'fullscreen',
    zoomMoments: Array.isArray(o.zoomMoments) ? o.zoomMoments.filter((z) => z.start < limit) : null,
    options: pick(['captions', 'captionTemplate', 'captionColor', 'captionFont', 'captionAnimation', 'captionBackground', 'captionPosition', 'captionMode', 'captionScale', 'captionHighlight',
      'videoMotion', 'motionIntensity', 'colorLook', 'colorAdjust', 'aspect', 'cutSilence', 'autoClean', 'broll', 'brollLayout']),
    color: r.color ? { look: r.color.look, ai: r.color.ai || null } : null,
    reframe: r.output?.reframe || null,
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
      for (const f of fs.readdirSync(DIR)) if (/^broll_/.test(f)) fs.rmSync(path.join(DIR, f), { force: true });
      const sim = await simFrom(job, mb);
      const meta = { ready: true, jobId: job.id, filename: job.filename, updatedAt: new Date().toISOString(), stats: statsFrom(job, mb, ma), sim };
      fs.writeFileSync(META, JSON.stringify(meta, null, 2));
      log.ok(`demonstração pronta (job ${job.id})`);
      await cloudReplaceShowcase(['antes.mp4', 'depois.mp4', 'showcase.json', ...sim.broll.map((b) => b.src.split('/').pop())]);
    } catch (err) {
      log.error(`demonstração falhou: ${err.message}`);
      fs.writeFileSync(META, JSON.stringify({ ...(readMeta() || {}), error: err.message, failedAt: new Date().toISOString() }, null, 2));
    } finally {
      building = null;
    }
  })();
  return { building: true };
}

// ── Pacote .zip da demo (para guardar no projeto e ficar permanente) ──
export function showcaseZip() {
  if (!readMeta()?.ready) throw Object.assign(new Error('nenhuma demonstração pronta para baixar'), { status: 404 });
  const files = fs.readdirSync(DIR).filter((f) => f === 'showcase.json' || /^(antes|depois)\.mp4$|^broll_\d+\.(jpg|mp4)$/.test(f));
  return zipFiles(files.map((name) => ({ name: `demo/${name}`, data: fs.readFileSync(path.join(DIR, name)) })));
}

export function removeShowcase() {
  cloudRemoveShowcase();
  if (!fs.existsSync(DIR)) return;
  for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { force: true });
}
