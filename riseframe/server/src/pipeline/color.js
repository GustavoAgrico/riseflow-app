import path from 'node:path';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { analyzeAndGrade } from './autoColor.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('color');

/**
 * "Looks" cinematográficos. Cada um é uma cadeia de filtros FFmpeg.
 * teal-orange é o look-assinatura (sombras frias, pele/altas quentes).
 */
export const LOOKS = {
  none: null,
  clean: 'eq=contrast=1.04:saturation=1.06,unsharp=3:3:0.4',
  'teal-orange':
    'eq=contrast=1.09:saturation=1.16:gamma=0.98,' +
    'colorbalance=rs=-0.06:gs=0.01:bs=0.09:rm=0.02:bm=-0.02:rh=0.07:gh=0.01:bh=-0.07,' +
    'unsharp=3:3:0.5',
  warm:
    'eq=contrast=1.06:saturation=1.12:gamma_r=1.06:gamma_b=0.95,' +
    'colorbalance=rm=0.06:gm=0.01:bm=-0.05',
  cold:
    'eq=contrast=1.06:saturation=1.06,' +
    'colorbalance=rm=-0.05:gm=0.0:bm=0.07:bs=0.05',
  vibrant: 'eq=contrast=1.11:saturation=1.32:brightness=0.02,unsharp=3:3:0.6',
  moody:
    'eq=contrast=1.14:saturation=0.9:brightness=-0.03:gamma=0.95,' +
    'colorbalance=bs=0.06:rh=0.03',
};

/** Ajuste manual (-100..100 cada) → valores de filtro. Mesmo mapeamento da prévia no site. */
export function sanitizeColorAdjust(raw) {
  const pick = (v) => Math.max(-100, Math.min(100, Math.round(Number(v) || 0)));
  const a = raw && typeof raw === 'object' ? raw : {};
  return { brightness: pick(a.brightness), contrast: pick(a.contrast), saturation: pick(a.saturation), temperature: pick(a.temperature) };
}

export const hasColorAdjust = (a) => Boolean(a && (a.brightness || a.contrast || a.saturation || a.temperature));

/** Cadeia FFmpeg do ajuste manual (depois do look), ou null se tudo em zero. Puro/testável. */
export function manualAdjustVf(raw) {
  const a = sanitizeColorAdjust(raw);
  if (!hasColorAdjust(a)) return null;
  const f = (n) => Number(n.toFixed(3));
  const parts = [];
  if (a.brightness || a.contrast || a.saturation) {
    parts.push(`eq=brightness=${f(a.brightness / 100 * 0.12)}:contrast=${f(1 + a.contrast / 100 * 0.35)}:saturation=${f(1 + a.saturation / 100 * 0.8)}`);
  }
  if (a.temperature) {
    const k = a.temperature / 100; // >0 quente (laranja), <0 frio (azul)
    parts.push(`colorbalance=rs=${f(0.08 * k)}:bs=${f(-0.08 * k)}:rm=${f(0.1 * k)}:bm=${f(-0.1 * k)}:rh=${f(0.06 * k)}:bh=${f(-0.06 * k)}`);
  }
  return parts.join(',');
}

// ---------------------------------------------------------------------------
// Otimização: `colorbalance` e `colorchannelmixer` do FFmpeg são MUITO lentos (cálculo
// em ponto flutuante por pixel, ~10x o custo de um eq). Como só usamos ganhos por canal
// e deslocamentos por faixa de tom, dá para trocar tudo por UMA curva por canal
// (`curves`, que é uma tabela de consulta) — mesmo visual, uma fração do tempo.

function parseFilterOpts(str) {
  const out = {};
  for (const kv of str.split(':')) {
    const [k, v] = kv.split('=');
    if (k && v !== undefined) out[k.trim()] = Number(v);
  }
  return out;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Mesma fórmula do colorbalance do FFmpeg (sombras/médios/altas), usando o próprio valor como luz. */
function balanceShift(v, s, m, h) {
  const a = 4;
  const b = 0.333;
  const scale = 0.7;
  const ws = clamp01((b - v) * a + 0.5) * scale;
  const wm = clamp01((v - b) * a + 0.5) * clamp01((1 - v - b) * a + 0.5) * scale;
  const wh = clamp01((v + b - 1) * a + 0.5) * scale;
  return clamp01(v + s * ws + m * wm + h * wh);
}

/** Converte um token do filtro num passo por canal, ou null se não der para converter. */
function rgbStep(token) {
  const eq = token.indexOf('=');
  const name = eq < 0 ? token : token.slice(0, eq);
  const opts = eq < 0 ? {} : parseFilterOpts(token.slice(eq + 1));
  if (Object.values(opts).some((v) => !Number.isFinite(v))) return null;
  if (name === 'colorbalance') {
    const allowed = ['rs', 'gs', 'bs', 'rm', 'gm', 'bm', 'rh', 'gh', 'bh'];
    if (Object.keys(opts).some((k) => !allowed.includes(k))) return null;
    const o = (k) => opts[k] || 0;
    return {
      r: (v) => balanceShift(v, o('rs'), o('rm'), o('rh')),
      g: (v) => balanceShift(v, o('gs'), o('gm'), o('gh')),
      b: (v) => balanceShift(v, o('bs'), o('bm'), o('bh')),
    };
  }
  if (name === 'colorchannelmixer') {
    // Só ganhos na diagonal (balanço de branco); misturas entre canais ficam como estão.
    if (Object.keys(opts).some((k) => !['rr', 'gg', 'bb'].includes(k))) return null;
    const g = (k) => (opts[k] === undefined ? 1 : opts[k]);
    return { r: (v) => clamp01(v * g('rr')), g: (v) => clamp01(v * g('gg')), b: (v) => clamp01(v * g('bb')) };
  }
  return null;
}

/**
 * Reescreve a cadeia de cor trocando colorbalance/colorchannelmixer por uma única
 * `curves` (na posição do último deles). Puro/exportado para teste.
 */
export function fastColorChain(vf) {
  if (!vf) return vf;
  const tokens = vf.split(',');
  const steps = [];
  let last = -1;
  tokens.forEach((t, i) => {
    const st = rgbStep(t.trim());
    if (st) { steps.push(st); last = i; }
  });
  if (!steps.length) return vf;
  const curve = (ch) => {
    const pts = [];
    for (let i = 0; i <= 10; i += 1) {
      const x = i / 10;
      const y = steps.reduce((v, st) => st[ch](v), x);
      pts.push(`${x}/${Number(y.toFixed(3))}`);
    }
    return pts.join(' ');
  };
  const curves = `curves=r='${curve('r')}':g='${curve('g')}':b='${curve('b')}',format=yuv420p`;
  const out = [];
  tokens.forEach((t, i) => {
    if (i === last) out.push(curves);
    else if (!rgbStep(t.trim())) out.push(t);
  });
  return out.join(',');
}

export function lookNames() {
  // 'auto' (grade por IA) é o destaque; depois os presets fixos.
  return ['auto', ...Object.keys(LOOKS)];
}

/**
 * Resolve a cadeia de filtros de cor (look + ajuste manual) SEM recodificar. Suporta:
 * - 'auto' → grade por IA (analisa frames e calcula correção + look);
 * - presets fixos (teal-orange, warm, ...);
 * - LUT .cube via `lut:<caminho>`.
 * O pipeline aplica este filtro dentro do render final (uma recodificação a menos).
 * @returns {Promise<{vf:string|null, look:string, ai:object|null, manual:string|null}>}
 */
export async function colorFilter(input, options) {
  const look = options.colorLook || 'auto';

  // Grade por IA: decide a cadeia de filtros a partir da análise do próprio vídeo.
  let aiAdjustments = null;
  let vf = null;
  const manual = manualAdjustVf(options.colorAdjust);
  if (look === 'none') {
    // só o ajuste manual (se houver)
  } else if (look === 'auto') {
    try {
      const grade = await analyzeAndGrade(input);
      vf = grade.vf;
      aiAdjustments = grade.adjustments;
    } catch (err) {
      log.warn(`grade por IA falhou (${err.message}); usando teal-orange`);
      vf = LOOKS['teal-orange'];
    }
  } else if (look.startsWith('lut:')) {
    const cube = look.slice(4);
    vf = `lut3d=${cube.replace(/:/g, '\\:')}`;
  } else if (LOOKS[look]) {
    vf = LOOKS[look];
  } else {
    log.warn(`look "${look}" desconhecido; usando teal-orange`);
    vf = LOOKS['teal-orange'];
  }
  vf = fastColorChain([vf, manual].filter(Boolean).join(',')) || null;
  if (vf) log.ok(`color grade: ${look}${manual ? ` + ajuste manual (${manual})` : ''}`);
  return { vf, look, ai: aiAdjustments, manual };
}

/**
 * Aplica o look de cor recodificando o vídeo (usado pelos clipes curtos).
 * @returns {Promise<{output:string, look:string, ai?:object}>}
 */
export async function applyColor(input, work, meta, options, onProgress) {
  const { vf, look, ai } = await colorFilter(input, options);
  if (!vf) return { output: input, look };
  const output = path.join(work, 'graded.mp4');
  const args = ['-i', input, '-vf', vf, ...x264Fast()];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'color', totalDuration: meta.duration, onProgress });
  return { output, look, ai };
}
