import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeLogger } from '../logger.js';

const log = makeLogger('reframe');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r1 = (v) => Math.round(v * 10) / 10;

export const TARGETS = {
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
  '1:1': { w: 1080, h: 1080 },
};

/** Interpolação linear de um valor conhecido em `t` (segura, com hold nas pontas). */
function interpAt(known, t) {
  if (t <= known[0].t) return known[0].v;
  if (t >= known[known.length - 1].t) return known[known.length - 1].v;
  for (let i = 1; i < known.length; i++) {
    if (t <= known[i].t) {
      const a = known[i - 1];
      const b = known[i];
      const f = (t - a.t) / (b.t - a.t || 1);
      return a.v + (b.v - a.v) * f;
    }
  }
  return known[known.length - 1].v;
}

/**
 * A partir de pontos {t, [key]}, reamostra numa grade regular, preenche lacunas por
 * interpolação e suaviza (média móvel). Retorna keyframes [{t, v}] com v em 0–1.
 * Puro/exportado para teste.
 */
export function resampleSmooth(points, key, duration, opts = {}) {
  const maxKf = opts.maxKf ?? 40;
  const smoothWin = opts.smoothWin ?? 5;
  const known = points
    .map((p) => ({ t: p.t, v: p[key] }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
  if (!known.length || duration <= 0) return null;

  const dt = Math.max(opts.dt ?? 0.5, duration / maxKf);
  const grid = [];
  for (let t = 0; t <= duration + 1e-6; t += dt) grid.push({ t: r1(t), v: interpAt(known, t) });

  // média móvel
  const half = Math.floor(smoothWin / 2);
  const smoothed = grid.map((g, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(grid.length - 1, i + half); j++) {
      s += grid[j].v;
      n++;
    }
    return { t: g.t, v: clamp(s / n, 0, 1) };
  });
  return smoothed;
}

/**
 * Constrói uma expressão FFmpeg piecewise-linear a partir de keyframes [{t, val}]
 * (val em pixels). Puro/exportado para teste.
 */
export function buildPiecewiseExpr(kf, minV, maxV) {
  if (kf.length === 1) return `${r1(clamp(kf[0].val, minV, maxV))}`;
  const rec = (i) => {
    if (i >= kf.length - 1) return `${r1(clamp(kf[i].val, minV, maxV))}`;
    const a = kf[i];
    const b = kf[i + 1];
    const v0 = r1(clamp(a.val, minV, maxV));
    const v1 = r1(clamp(b.val, minV, maxV));
    const seg = `(${v0}+(${v1}-${v0})*(t-${a.t})/${(b.t - a.t).toFixed(3)})`;
    return `if(lt(t,${b.t}),${seg},${rec(i + 1)})`;
  };
  return `clip(${rec(0)},${minV},${maxV})`;
}

function runTracker(input, sampleFps = 4) {
  const script = path.join(__dirname, 'track_subject.py');
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [script, input, String(sampleFps)]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(err.trim() || `tracker code ${code}`));
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(new Error(`tracker JSON inválido: ${e.message}`));
      }
    });
  });
}

/**
 * Calcula a cadeia de filtros de reframe seguindo o sujeito. Se o tracking não
 * estiver disponível ou não houver caminho, retorna null (o chamador usa crop central).
 * @returns {Promise<{vf:string, reframe:object}|null>}
 */
export async function smartReframeVf(input, meta, target, trackInput = input) {
  let data;
  try {
    // Rastreia a partir da fonte LIMPA (sem legendas/B-roll queimados) para que o
    // fallback de movimento siga o sujeito, não as legendas. A geometria (WxH) e a
    // timeline são idênticas às do vídeo final, então o crop calculado se aplica.
    data = await runTracker(trackInput);
  } catch (err) {
    log.warn(`tracking indisponível (${err.message}); crop central`);
    return null;
  }
  if (!data.points?.length) {
    log.info('nenhum sujeito rastreado; crop central');
    return null;
  }

  const inW = meta.width || data.inW;
  const inH = meta.height || data.inH;
  const s = Math.max(target.w / inW, target.h / inH);
  const scaledW = Math.ceil(inW * s);
  const scaledH = Math.ceil(inH * s);
  const panX = scaledW - target.w; // folga horizontal
  const panY = scaledH - target.h; // folga vertical
  const horizontal = panX >= panY;
  const key = horizontal ? 'x' : 'y';
  const scaledAxis = horizontal ? scaledW : scaledH;
  const cropAxis = horizontal ? target.w : target.h;
  const maxOffset = Math.max(0, (horizontal ? panX : panY));

  const kf01 = resampleSmooth(data.points, key, meta.duration || data.duration, { smoothWin: 3 });
  if (!kf01 || maxOffset < 2) return null; // nada a seguir

  // normalizado → offset de crop em pixels (centraliza o sujeito, com trava)
  const kf = kf01.map((p) => ({ t: p.t, val: clamp(p.v * scaledAxis - cropAxis / 2, 0, maxOffset) }));
  const expr = buildPiecewiseExpr(kf, 0, maxOffset);

  const xExpr = horizontal ? `'${expr}'` : `${r1(panX / 2)}`;
  const yExpr = horizontal ? `${r1(panY / 2)}` : `'${expr}'`;

  const vf =
    `scale=${scaledW}:${scaledH}:flags=bicubic,` +
    `crop=${target.w}:${target.h}:x=${xExpr}:y=${yExpr},setsar=1,format=yuv420p`;

  const faces = data.points.filter((p) => p.src === 'face').length;
  const reframe = {
    tracked: true,
    axis: horizontal ? 'horizontal' : 'vertical',
    keyframes: kf.length,
    source: faces >= data.points.length / 2 ? 'face' : 'motion',
  };
  log.ok(`reframe com tracking: eixo ${reframe.axis}, ${reframe.keyframes} keyframes, base ${reframe.source}`);
  return { vf, reframe };
}
