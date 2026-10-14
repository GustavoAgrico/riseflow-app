import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolvePython } from './python.js';
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

const median = (arr) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const quantile = (arr, q) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.floor(q * (a.length - 1))))];
};

/**
 * Quantas pessoas aparecem e onde: com duas pessoas lado a lado em boa parte do vídeo
 * (podcast/entrevista), separa os rostos em "esquerda" e "direita" e devolve cada uma
 * com posição/tamanho típicos e a série de movimento da boca. Puro/exportado para teste.
 * @returns {{count:number, people:Array<{x,y,w,h,presence,series:Array<{t,act}>}>}|null}
 */
export function analyzePeople(data) {
  const samples = (data?.samples || []).filter((s) => Number.isFinite(s.t) && Array.isArray(s.faces));
  const withFaces = samples.filter((s) => s.faces.length);
  if (withFaces.length < 5) return null;
  const pairs = [];
  for (const s of withFaces) {
    if (s.faces.length < 2) continue;
    const [a, b] = [...s.faces].sort((f, g) => g.w * g.h - f.w * f.h).slice(0, 2);
    // dois rostos de tamanho parecido (o 2º não é um rosto no fundo), bem separados
    if (Math.abs(a.x - b.x) >= 0.18 && b.w * b.h >= a.w * a.h * 0.25) pairs.push(a.x < b.x ? [a, b] : [b, a]);
  }
  const one = () => {
    const fs = withFaces.map((s) => s.faces[0]);
    return {
      count: 1,
      people: [{ x: median(fs.map((f) => f.x)), y: median(fs.map((f) => f.y)), w: median(fs.map((f) => f.w)), h: median(fs.map((f) => f.h)), presence: withFaces.length / samples.length, series: [] }],
    };
  };
  if (pairs.length < withFaces.length * 0.35) return one();

  const centers = [median(pairs.map((p) => p[0].x)), median(pairs.map((p) => p[1].x))];
  const reach = (centers[1] - centers[0]) * 0.5;
  const tracks = [[], []];
  for (const s of samples) {
    const got = [null, null];
    for (const f of s.faces) {
      const d = centers.map((c) => Math.abs(f.x - c));
      const k = d[0] <= d[1] ? 0 : 1;
      if (d[k] > reach) continue;
      if (!got[k] || f.w * f.h > got[k].w * got[k].h) got[k] = f;
    }
    got.forEach((f, k) => f && tracks[k].push({ t: s.t, ...f }));
  }
  if (tracks.some((tr) => tr.length < samples.length * 0.2)) return one();
  return {
    count: 2,
    people: tracks.map((tr) => ({
      x: median(tr.map((f) => f.x)),
      y: median(tr.map((f) => f.y)),
      w: median(tr.map((f) => f.w)),
      h: median(tr.map((f) => f.h)),
      presence: tr.length / samples.length,
      series: tr.map((f) => ({ t: f.t, act: Number(f.act) || 0 })),
    })),
  };
}

/**
 * Quem está falando ao longo do vídeo (duas pessoas), em "tomadas": [{start, end, who}].
 * Pelo movimento da boca em janelas de 0,5 s, com histerese para a câmera não ficar
 * pulando: só troca quando a outra pessoa domina por ≥ `hold` s, e cada tomada dura
 * ≥ `minShot` s. A troca é antecipada para quando a outra pessoa começou a falar.
 * Puro/exportado para teste.
 */
export function speakerShots(people, duration, opts = {}) {
  const win = opts.win ?? 0.5;
  const hold = opts.hold ?? 1.2;
  const minShot = opts.minShot ?? 2;
  const ratio = opts.ratio ?? 1.3;
  const n = Math.max(1, Math.ceil(duration / win));
  // nível de cada pessoa por janela, descontado o "ruído de fundo" dela (20º percentil)
  const levels = people.map((p) => {
    const base = quantile(p.series.map((s) => s.act), 0.2);
    const sum = new Array(n).fill(0);
    const cnt = new Array(n).fill(0);
    for (const s of p.series) {
      const i = Math.min(n - 1, Math.max(0, Math.floor(s.t / win)));
      sum[i] += Math.max(0, s.act - base);
      cnt[i]++;
    }
    return sum.map((v, i) => (cnt[i] ? v / cnt[i] : 0));
  });
  const floor = Math.max(1e-4, quantile(levels.flat(), 0.5) * 0.5);
  const dominant = (i, k) => levels[k][i] > floor && levels[k][i] > levels[1 - k][i] * ratio;

  // começa com quem fala mais nos primeiros segundos
  const first = Math.min(n, Math.ceil(4 / win));
  let cur = levels[1].slice(0, first).reduce((a, v) => a + v, 0) > levels[0].slice(0, first).reduce((a, v) => a + v, 0) ? 1 : 0;
  const shots = [{ start: 0, who: cur }];
  const need = Math.max(1, Math.round(hold / win));
  let run = 0;
  for (let i = 0; i < n; i++) {
    run = dominant(i, 1 - cur) ? run + 1 : 0;
    if (run >= need) {
      const startI = i - run + 1;
      const at = Math.max(startI * win, shots[shots.length - 1].start + minShot);
      if (at < duration - minShot * 0.5) {
        cur = 1 - cur;
        shots.push({ start: r1(at), who: cur });
      }
      run = 0;
    }
  }
  return shots.map((s, i) => ({ start: s.start, end: i + 1 < shots.length ? shots[i + 1].start : r1(duration), who: s.who }));
}

/** Expressão FFmpeg em degraus (valor constante por trecho): [{t, val}]. Puro. */
export function buildStepExpr(steps, minV, maxV) {
  const v = (x) => r1(clamp(x, minV, maxV));
  let expr = `${v(steps[steps.length - 1].val)}`;
  for (let i = steps.length - 2; i >= 0; i--) expr = `if(lt(t,${steps[i + 1].t}),${v(steps[i].val)},${expr})`;
  return expr;
}

/**
 * Recorte de uma pessoa para uma metade da tela dividida (em pixels da fonte): rosto
 * centralizado na horizontal e um pouco acima do meio, com cabeça e ombros. Puro.
 */
export function personRegion(p, inW, inH, aspect) {
  const faceH = p.h * inH;
  let h = clamp(faceH * 3.2, inH * 0.4, inH);
  let w = h * aspect;
  if (w > inW) {
    w = inW;
    h = w / aspect;
  }
  const evenDown = (x) => Math.max(2, Math.floor(x / 2) * 2);
  w = evenDown(w);
  h = evenDown(h);
  const x = Math.round(clamp(p.x * inW - w / 2, 0, inW - w));
  const y = Math.round(clamp(p.y * inH - h * 0.4, 0, inH - h));
  return { w, h, x, y };
}

/**
 * Tela dividida para duas pessoas: uma em cima e outra embaixo (formato vertical) ou
 * lado a lado (horizontal/quadrado), cada uma recortada no próprio rosto. Puro.
 */
export function splitVf(people, inW, inH, target, { swap = false } = {}) {
  const { w: W, h: H } = target;
  const vertical = H >= W;
  const half = vertical ? { w: W, h: Math.round(H / 4) * 2 } : { w: Math.round(W / 4) * 2, h: H };
  const rest = vertical ? { w: W, h: H - half.h } : { w: W - half.w, h: H };
  const order = swap ? [people[1], people[0]] : [people[0], people[1]];
  const sizes = [half, rest];
  const chains = order.map((p, i) => {
    const r = personRegion(p, inW, inH, sizes[i].w / sizes[i].h);
    return `[rs${i}]crop=${r.w}:${r.h}:${r.x}:${r.y},scale=${sizes[i].w}:${sizes[i].h}:flags=lanczos,setsar=1[rp${i}]`;
  });
  return `split[rs0][rs1];${chains.join(';')};[rp0][rp1]${vertical ? 'vstack' : 'hstack'}=inputs=2,setsar=1,format=yuv420p`;
}

async function runTracker(input, sampleFps = 5) {
  const py = await resolvePython();
  if (!py) throw new Error('Python não encontrado no PATH (instale Python 3 ou defina PYTHON_BIN)');
  const script = path.join(__dirname, 'track_subject.py');
  return new Promise((resolve, reject) => {
    const proc = spawn(py, [script, input, String(sampleFps)]);
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
 * Média (0–1) do centro do sujeito no vídeo, priorizando pontos de ROSTO. Usado para
 * enquadrar a pessoa no rosto na tela dividida. Retorna null se não houver tracking.
 * @returns {Promise<{x:number,y:number,source:string}|null>}
 */
export async function averageSubjectCenter(input) {
  let data;
  try {
    data = await runTracker(input);
  } catch (err) {
    log.warn(`tracking indisponível para enquadramento (${err.message})`);
    return null;
  }
  const pts = (data?.points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!pts.length) return null;
  const face = pts.filter((p) => p.src === 'face');
  const use = face.length >= Math.max(3, pts.length * 0.3) ? face : pts;
  const x = use.reduce((a, p) => a + p.x, 0) / use.length;
  const y = use.reduce((a, p) => a + p.y, 0) / use.length;
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1), source: face.length ? 'face' : 'motion' };
}

/**
 * Calcula a cadeia de filtros de reframe seguindo o sujeito. Se o tracking não
 * estiver disponível ou não houver caminho, retorna null (o chamador usa crop central).
 *  - uma pessoa: o quadro acompanha o rosto (suave);
 *  - duas pessoas (podcast/entrevista): o quadro mostra QUEM ESTÁ FALANDO, com cortes
 *    secos na troca (como um editor faria); se as duas cabem no quadro, mostra as duas;
 *  - `split: true`: tela dividida, uma pessoa em cada metade (se houver duas).
 * @returns {Promise<{vf:string, reframe:object}|null>}
 */
export async function smartReframeVf(input, meta, target, trackInput = input, opts = {}) {
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
  const duration = meta.duration || data.duration;
  const people = analyzePeople(data);
  const two = people?.count === 2 ? people.people : null;

  if (opts.split) {
    if (two) {
      log.ok(`tela dividida: 2 pessoas (x ${two[0].x.toFixed(2)} e ${two[1].x.toFixed(2)})`);
      return { vf: splitVf(two, inW, inH, target, { swap: opts.swap }), reframe: { tracked: true, axis: null, source: 'split', people: 2 } };
    }
    log.info('tela dividida pedida, mas não há duas pessoas lado a lado; segue o rosto');
  }

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
  if (maxOffset < 2) return null; // nada a seguir

  let expr;
  let reframe;
  if (two && horizontal) {
    const span = (Math.abs(two[1].x - two[0].x) + Math.max(two[0].w, two[1].w) * 1.6) * scaledW;
    if (span <= cropAxis) {
      // as duas cabem no quadro: fixo no meio delas
      expr = `${r1(clamp(((two[0].x + two[1].x) / 2) * scaledW - cropAxis / 2, 0, maxOffset))}`;
      reframe = { tracked: true, axis: 'horizontal', source: 'two-people', people: 2, keyframes: 1 };
    } else {
      // segue quem fala; muitos cortes num vídeo longo → tomadas mínimas maiores
      let minShot = 2;
      let shots = speakerShots(two, duration, { minShot });
      while (shots.length > 150 && minShot < 30) shots = speakerShots(two, duration, { minShot: (minShot *= 1.6) });
      const steps = shots.map((sh) => ({ t: sh.start, val: two[sh.who].x * scaledW - cropAxis / 2 }));
      expr = buildStepExpr(steps, 0, maxOffset);
      reframe = { tracked: true, axis: 'horizontal', source: 'speaker', people: 2, shots: shots.length, keyframes: steps.length };
    }
  } else {
    const kf01 = resampleSmooth(data.points, key, duration, { smoothWin: 3 });
    if (!kf01) return null;
    // normalizado → offset de crop em pixels (centraliza o sujeito, com trava)
    const kf = kf01.map((p) => ({ t: p.t, val: clamp(p.v * scaledAxis - cropAxis / 2, 0, maxOffset) }));
    expr = buildPiecewiseExpr(kf, 0, maxOffset);
    const faces = data.points.filter((p) => p.src === 'face').length;
    reframe = {
      tracked: true,
      axis: horizontal ? 'horizontal' : 'vertical',
      keyframes: kf.length,
      source: faces >= data.points.length / 2 ? 'face' : 'motion',
    };
  }
  if (opts.split) reframe.splitFallback = true;

  const xExpr = horizontal ? `'${expr}'` : `${r1(panX / 2)}`;
  const yExpr = horizontal ? `${r1(panY / 2)}` : `'${expr}'`;

  const vf =
    `scale=${scaledW}:${scaledH}:flags=bicubic,` +
    `crop=${target.w}:${target.h}:x=${xExpr}:y=${yExpr},setsar=1,format=yuv420p`;

  log.ok(`reframe com tracking: eixo ${reframe.axis}, ${reframe.keyframes} keyframes, base ${reframe.source}${reframe.shots ? `, ${reframe.shots} tomadas` : ''}`);
  return { vf, reframe };
}
