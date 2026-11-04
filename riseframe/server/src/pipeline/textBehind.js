// Texto ATRÁS da pessoa: nas frases fortes, a palavra-chave aparece GIGANTE no fundo e a
// pessoa fica na frente dela (como as edições de VSL/Reels). A pessoa é recortada quadro a
// quadro só nesses trechos (person_mask.py + U^2-Net, Apache 2.0) e o FFmpeg junta tudo:
// vídeo com o texto onde não é pessoa, vídeo original onde é (maskedmerge). Entra antes da
// legenda, então a legenda continua por cima de tudo.
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { resolvePython } from './python.js';
import { fontsDirArg } from './captions.js';
import { pickKeyword } from '../../../shared/captionKeyword.js';
import { makeLogger } from '../logger.js';
import { trackChild } from '../jobContext.js';

const log = makeLogger('texto-atras');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Modelo de recorte de pessoas (baixado na 1ª vez e conferido pelo SHA-256). */
export const MASK_MODEL = {
  url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx',
  file: 'u2net_human_seg.onnx',
  size: 175997641,
  sha256: '01eb6a29a5c4d8edb30b56adad9bb3a2a0535338e480724a213e0acfd2d1c73c',
};

const clean = (w) => String(w?.word ?? '').replace(/[^\p{L}\p{N}-]/gu, '');
const overlaps = (a, b, list) => list.some((x) => Math.min(b, Number(x.end)) - Math.max(a, Number(x.start)) > 0.05);

/**
 * Onde a palavra entra atrás da pessoa: a palavra-chave de uma frase, no instante em que é
 * falada, por até 2,2 s; uma a cada `gap` s no máximo; fora das janelas de `exclude` (cenas
 * de motion em tela cheia, B-roll). Puro.
 * @returns {Array<{start:number,end:number,text:string}>}
 */
export function behindPlan(segments, duration, { exclude = [], gap = 6, max = 8 } = {}) {
  const out = [];
  const dur = Number(duration) || Infinity;
  for (const seg of segments || []) {
    const words = (seg.words || []).filter((w) => !w.removed && !w.hidden && Number.isFinite(Number(w.start)));
    if (words.length < 2) continue;
    const k = pickKeyword(words);
    if (k < 0) continue;
    const text = clean(words[k]).toUpperCase();
    if (text.length < 4 || /^\d+$/.test(text)) continue;
    const start = Math.max(0, Number(words[k].start) - 0.05);
    const end = Math.min(dur, Math.max(start + 1.2, Math.min(Number(seg.end) + 0.3, start + 2.2)));
    if (end - start < 0.8) continue;
    if (out.length && start < out[out.length - 1].end + gap) continue;
    if (overlaps(start, end, exclude)) continue;
    out.push({ start: +start.toFixed(3), end: +end.toFixed(3), text });
    if (out.length >= max) break;
  }
  return out;
}

const assTime = (t) => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

/** .ass das palavras gigantes (Anton branco, na altura da cabeça, entra crescendo). Puro. */
export function behindAss(plan, { width, height }) {
  const W = Math.round(width);
  const H = Math.round(height);
  const head = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Behind,Anton,${Math.round(H * 0.35)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const lines = plan.map((p) => {
    // Anton é condensada: ~0,46 em por letra maiúscula; ocupa até 96% da largura
    const fs = Math.round(Math.min(H * 0.35, (W * 0.96) / (p.text.length * 0.46)));
    const tags = `\\pos(${Math.round(W / 2)},${Math.round(H * 0.30)})\\fs${fs}\\fad(120,200)\\fscx80\\fscy80\\t(0,350,\\fscx100\\fscy100)`;
    return `Dialogue: 0,${assTime(p.start)},${assTime(p.end)},Behind,,0,0,0,,{${tags}}${p.text}`;
  });
  return `${[...head, ...lines].join('\n')}\n`;
}

/** Filtro: texto (ASS) onde não é pessoa, vídeo original onde é. Puro. */
export function behindFilter({ width, height, assName = 'behind.ass', fontsRel = 'fonts' }) {
  return [
    '[0:v]split[pre][t]',
    `[t]subtitles=${assName}:fontsdir=${fontsRel},format=gbrp[a]`,
    '[pre]format=gbrp[b]',
    `[1:v]scale=${width}:${height}:flags=bilinear,format=gray,format=gbrp[m]`,
    '[a][b][m]maskedmerge,format=yuv420p[v]',
  ].join(';');
}

let modelPromise = null;
let modelFailedAt = 0;
/** Caminho do modelo (baixa e confere na 1ª vez); null se não deu (tenta de novo em 10 min). */
export function ensureMaskModel({ fetchImpl = globalThis.fetch, dir = path.join(config.paths.data, 'models') } = {}) {
  if (modelPromise) return modelPromise;
  if (modelFailedAt && Date.now() - modelFailedAt < 10 * 60_000) return Promise.resolve(null);
  modelPromise = (async () => {
    const file = path.join(dir, MASK_MODEL.file);
    const st = await fs.stat(file).catch(() => null);
    if (st?.size === MASK_MODEL.size) return file;
    await fs.mkdir(dir, { recursive: true });
    log.info('baixando o modelo de recorte de pessoas (176 MB, uma vez só)…');
    const res = await fetchImpl(MASK_MODEL.url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`download do modelo: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const sum = crypto.createHash('sha256').update(buf).digest('hex');
    if (buf.length !== MASK_MODEL.size || sum !== MASK_MODEL.sha256) throw new Error('modelo baixado não confere (tamanho/SHA-256)');
    const tmp = `${file}.part`;
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, file);
    log.ok('modelo de recorte de pessoas pronto');
    return file;
  })().catch((e) => {
    log.warn(`modelo de recorte indisponível: ${e.message}`);
    modelPromise = null;
    modelFailedAt = Date.now();
    return null;
  });
  return modelPromise;
}

function runMask(python, args, onProgress) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(__dirname, 'person_mask.py'), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    trackChild?.(child);
    let err = '';
    child.stdout.on('data', (d) => {
      for (const line of String(d).split('\n')) {
        const m = /^p ([\d.]+)/.exec(line.trim());
        if (m) onProgress?.(Number(m[1]));
      }
    });
    child.stderr.on('data', (d) => { err += String(d); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`recorte da pessoa falhou (${code}): ${err.slice(-300)}`))));
  });
}

/**
 * Aplica o texto atrás da pessoa. → { output, items } ou null (nada a fazer, ou sem Python/
 * modelo: aí o vídeo segue sem o efeito, e o relatório avisa).
 */
export async function applyTextBehind(input, work, meta, segments, { exclude = [] } = {}, onProgress) {
  const plan = behindPlan(segments, meta.duration, { exclude });
  if (!plan.length) return null;
  const python = await resolvePython();
  if (!python) {
    log.warn('sem Python: texto atrás da pessoa pulado');
    return { output: input, items: [], skipped: 'sem Python no servidor' };
  }
  onProgress?.(0.02);
  const model = await ensureMaskModel();
  if (!model) return { output: input, items: [], skipped: 'modelo de recorte indisponível' };
  const W = meta.width;
  const H = meta.height;
  const mw = Math.max(2, Math.round(W / 4) * 2);
  const mh = Math.max(2, Math.round(H / 4) * 2);
  const maskPath = path.join(work, 'person_mask.avi');
  await runMask(python, [input, model, maskPath, JSON.stringify(plan.map((p) => [p.start, p.end])), String(mw), String(mh), '2'], (p) => onProgress?.(0.05 + 0.7 * p));
  await fs.writeFile(path.join(work, 'behind.ass'), behindAss(plan, { width: W, height: H }), 'utf8');
  const fontsRel = await fontsDirArg(work);
  const output = path.join(work, 'text_behind.mp4');
  const args = ['-i', input, '-i', maskPath, '-filter_complex', behindFilter({ width: W, height: H, fontsRel }), '-map', '[v]'];
  if (meta.hasAudio) args.push('-map', '0:a?', '-c:a', 'copy');
  args.push(...x264Fast(), '-movflags', '+faststart', '-y', output);
  await runFfmpeg(args, { label: 'texto-atras', totalDuration: meta.duration, onProgress: (p) => onProgress?.(0.75 + 0.25 * p), cwd: work });
  if (!fss.existsSync(output)) throw new Error('texto atrás da pessoa: o vídeo não saiu');
  log.ok(`${plan.length} palavra(s) atrás da pessoa`);
  return { output, items: plan };
}
