// Motion "Explicativo" (preset B): cena vertical de motion design desenhada em Canvas 2D,
// quadro a quadro, como função pura do tempo — o mesmo código desenha a prévia (navegador) e
// o render (servidor, @napi-rs/canvas → FFmpeg). As batidas saem da fala: gancho no painel
// índigo, palavra de destaque, frase de apoio, contador, forma que se transforma, gráfico,
// etiquetas, negação, alvo com flecha e o fechamento com sublinhado.

import { phraseChunks, wordRole } from './kinetic.js';
import { conceptsIn } from './sceneElements.js';
import { emphasisScore } from './keyMoments.js';
import { STYLE_BEATS, styleBeatsFor, styleSfx, drawStyle, STYLE_FONT_FILES } from './motionStyles.js';

export const EXPLAINER = {
  bg: '#DADADE', indigo: '#2A0A9A', violet: '#7A1FD6', magenta: '#B0309E', orange: '#F5A623', lime: '#B8E03A',
  ink: '#111111', red: '#B3132B', white: '#FFFFFF', arc: '#CFCBC4',
  bars: [['#4FB8B0', '#7B4FD6'], ['#7B4FD6', '#E0508A'], ['#E0508A', '#F09A3B'], ['#F09A3B', '#4FB8B0']],
};
export const EXPLAINER_BEATS = ['hook', 'stat', 'support', 'counter', 'morph', 'chart', 'tags', 'negation', 'impact', 'end'];
// Preset A ("Estratégia"): creme e preto alternando em corte seco, palavra-chave vermelha em grotesca
export const STRATEGY = { cream: '#F7F3EC', black: '#000000', red: '#E3161F', purple: '#833AB4', ink: '#111111', white: '#FFFFFF', card: '#8C8988', arc: '#CFCBC4' };
export const STRATEGY_BEATS = ['a-hook', 'a-bubble', 'a-glow', 'a-plain', 'a-object', 'a-card', 'a-brand', 'a-cta'];
// + os estilos das outras referências (editorial P&B, itálico bordô, cinema escuro): motionStyles.js
export const MOTION_STYLES = { explicativo: EXPLAINER_BEATS, estrategia: STRATEGY_BEATS, ...STYLE_BEATS };
const DARK = new Set(['a-bubble', 'a-glow', 'a-object', 'a-cta']);

// ─────────────────────────────── utilidades ───────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (lt, at, d) => clamp((lt - at) / d);
const lerp = (a, b, t) => a + (b - a) * t;
const outCubic = (t) => 1 - (1 - t) ** 3;
const inCubic = (t) => t ** 3;
const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const outBack = (t) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
// mola (rigidez 180, amortecimento 14): passa do alvo e assenta
export function spring(t, k = 180, c = 14) {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k);
  const z = c / (2 * w0);
  const wd = w0 * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
}
const clean = (w) => String(w?.word ?? '').trim();
const bare = (w) => clean(w).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const tidy = (s) => String(s).replace(/[.,;:!?…]+$/u, '');
const r2 = (v) => +Number(v).toFixed(2);

// ─────────────────────────────── planejamento ───────────────────────────────
const NEG = /(?<!\p{L})(n[aã]o|nunca|nem|sem|jamais|ningu[eé]m|nada)(?!\p{L})/iu;
const GROWTH = new Set(['growth', 'win', 'sale', 'money', 'fast']);
const IMPACT = new Set(['goal', 'fire', 'boom', 'strategy', 'win']);

function numberOf(c) {
  for (const w of c) {
    const raw = clean(w).replace(/[^\d.,]/g, '');
    if (!/\d/.test(raw)) continue;
    let n = Number(raw.replace(/\./g, '').replace(',', '.'));
    const next = bare(c[c.indexOf(w) + 1] || {});
    if (next === 'mil') n *= 1000;
    if (/^milh/.test(next)) n *= 1e6;
    if (Number.isFinite(n)) return { n: Math.round(n), word: w };
  }
  return null;
}
const keysOf = (c) => c.filter((w, i) => wordRole(w, i, c) !== 'small' && !/\d/.test(clean(w)));
const smallOf = (c) => c.filter((w, i) => wordRole(w, i, c) === 'small');
const txt = (ws) => tidy(ws.map(clean).join(' '));

/** Escolhe o tipo de batida de cada frase da cena (variando, sem repetir o anterior). */
function beatsFor(chunks) {
  const out = [];
  const used = new Set();
  const rot = ['stat', 'support', 'morph'];
  let r = 0;
  chunks.forEach((c, i) => {
    const prev = out[out.length - 1]?.type;
    const concepts = conceptsIn(c).map((x) => x.id);
    const keys = keysOf(c);
    const num = numberOf(c);
    let type;
    if (i === 0) type = 'hook';
    else if (i === chunks.length - 1 && chunks.length >= 3) type = 'end';
    else if (num && !used.has('counter')) type = 'counter';
    else if (concepts.some((x) => GROWTH.has(x)) && !used.has('chart')) type = 'chart';
    else if (NEG.test(txt(c)) && !used.has('negation')) type = 'negation';
    else if (keys.length >= 3 && !used.has('tags')) type = 'tags';
    else if (concepts.some((x) => IMPACT.has(x)) && !used.has('impact')) type = 'impact';
    else {
      type = rot[r % rot.length];
      if (type === prev) type = rot[++r % rot.length];
      r += 1;
    }
    used.add(type);
    const big = keys.length ? keys.reduce((a, b) => (clean(b).length > clean(a).length ? b : a)) : c.reduce((a, b) => (clean(b).length > clean(a).length ? b : a));
    const data = { text: txt(c), keyword: tidy(clean(big)), small: txt(smallOf(c)), keys: keys.map((w) => tidy(clean(w))) };
    if (type === 'counter') data.number = num.n;
    if (type === 'counter') data.caption = txt(c.filter((w) => w !== num.word && bare(w) !== 'mil'));
    if (type === 'counter' || type === 'morph') data.element = conceptsIn(c)[0]?.real || conceptsIn(c)[0]?.element || null;
    out.push({ type, chunk: c, data });
  });
  return out;
}

/** Batidas do preset A: creme e preto sempre alternando (corte seco a cada frase). */
function strategyBeatsFor(chunks) {
  const out = [];
  const used = new Set();
  const light = ['a-plain', 'a-brand'];
  const dark = ['a-bubble', 'a-glow'];
  let li = 0;
  let di = 0;
  chunks.forEach((c, i) => {
    const prevDark = DARK.has(out[out.length - 1]?.type);
    const keys = keysOf(c);
    const concept = conceptsIn(c)[0] || null;
    let type;
    if (i === 0) type = 'a-hook';
    else if (i === chunks.length - 1 && chunks.length >= 3) type = 'a-cta';
    else if (!prevDark) type = concept && !used.has('a-object') ? 'a-object' : dark[di++ % dark.length];
    else type = keys.length >= 3 && !used.has('a-card') ? 'a-card' : light[li++ % light.length];
    // o fechamento também precisa alternar: se a anterior for escura, vira a palavra roxa no creme
    if (type === 'a-cta' && prevDark) type = 'a-brand';
    used.add(type);
    // a chave é a ÚLTIMA palavra forte (a frase termina no golpe: "continua travado")
    const big = keys.length ? keys[keys.length - 1] : c.reduce((a, b) => (clean(b).length > clean(a).length ? b : a));
    const idx = c.indexOf(big);
    out.push({ type, chunk: c, data: {
      text: txt(c), keyword: tidy(clean(big)), small: txt(c.slice(0, Math.max(0, idx))), after: txt(c.slice(idx + 1)),
      keys: keys.map((w) => tidy(clean(w))), element: concept?.real || concept?.element || null,
    } });
  });
  return out;
}

/**
 * Cenas do motion explicativo a partir da fala.
 * @returns {{scenes:Array<{start,end,beats:Array}>, sfx:Array<{t,type,volume,why}>}}
 */
export function explainerPlan({ segments, dur, amount = 'chave', existing = [], style = 'explicativo' } = {}) {
  const total = Number(dur) || 0;
  const chunks = phraseChunks(segments, 6).filter((c) => c.length);
  const busy = (existing || []).filter((l) => Number.isFinite(Number(l.start)));
  const free = (a, b) => !busy.some((l) => a < Number(l.end) && b > Number(l.start));
  // janelas: grupos de frases seguidas (6–10 s); "Momentos-chave" pega as de mais destaque
  const groups = [];
  for (let i = 0; i < chunks.length;) {
    const g = [chunks[i]];
    let j = i + 1;
    while (j < chunks.length && chunks[j][chunks[j].length - 1].end - chunks[i][0].start <= 10 && g.length < 8) { g.push(chunks[j]); j += 1; }
    groups.push(g);
    i = j;
  }
  const score = (g) => g.reduce((a, c, k) => a + emphasisScore({ start: c[0].start, end: c[c.length - 1].end, words: c }, NaN, k), 0) / g.length;
  // cena com 3+ frases; vídeo curto sem nenhuma assim: aceita 2 (melhor que ficar sem motion)
  let pick = groups.filter((g) => g.length >= 3);
  if (!pick.length) pick = groups.filter((g) => g.length >= 2);
  if (amount !== 'muitos') {
    const limit = Math.max(1, Math.round((total || 30) / 25));
    pick = [...pick].sort((a, b) => score(b) - score(a)).slice(0, limit).sort((a, b) => a[0][0].start - b[0][0].start);
  }
  const scenes = [];
  const sfx = [];
  for (const g of pick) {
    const start = Math.max(0, g[0][0].start - 0.08);
    const last = g[g.length - 1];
    const end = Math.min(total || Infinity, last[last.length - 1].end + 0.7);
    if (end - start < 3 || !free(start, end)) continue;
    const planned = style === 'estrategia' ? strategyBeatsFor(g) : STYLE_BEATS[style] ? styleBeatsFor(style, g) : beatsFor(g);
    const beats = planned.map((b, k, all) => {
      const s = Math.max(start, b.chunk[0].start - 0.05);
      const e = k < all.length - 1 ? all[k + 1].chunk[0].start - 0.05 : end;
      return { type: b.type, start: r2(s), end: r2(Math.max(s + 0.6, e)), words: b.chunk.map((w) => ({ w: clean(w), t: r2(w.start) })), data: b.data };
    });
    scenes.push({ start: r2(start), end: r2(end), style: Object.hasOwn(MOTION_STYLES, style) ? style : 'explicativo', beats });
    sfx.push(...(style === 'estrategia' ? strategySfx(beats) : STYLE_BEATS[style] ? styleSfx(style, beats) : explainerSfx(beats)));
  }
  return { scenes, sfx };
}

/** Sons de cada batida (pop, subida, tique do contador, quique da forma, tique das barras e das etiquetas, varrida, flecha, impacto). */
function explainerSfx(beats) {
  const out = [];
  const add = (t, type, volume, why) => out.push({ t: r2(t), type, volume, why });
  for (const b of beats) {
    const s = b.start;
    if (b.type === 'hook' || b.type === 'stat' || b.type === 'support') add(s, 'pop', 0.55, 'entrada');
    if (b.type === 'counter') { add(s, 'riser', 0.45, 'contador'); for (let k = 1; k <= 5; k += 1) add(s + k * 0.2, 'click', 0.3, 'contador'); }
    if (b.type === 'morph') [0, 0.4, 0.8].forEach((d) => add(s + d, 'boing', 0.35, 'forma'));
    if (b.type === 'chart') [0, 0.08, 0.16, 0.24].forEach((d) => add(s + d + 0.05, 'click', 0.28, 'barra'));
    if (b.type === 'tags') [0, 0.2, 0.4].forEach((d) => add(s + d, 'click', 0.35, 'etiqueta'));
    if (b.type === 'negation') add(s, 'swoosh', 0.45, 'arco');
    if (b.type === 'impact') { add(s, 'whoosh', 0.45, 'flecha'); add(s + impactHit(b), 'thud', 0.7, 'impacto'); add(s + impactHit(b) + 0.02, 'ding', 0.45, 'impacto'); }
    if (b.type === 'end') add(s, 'ding', 0.35, 'fechamento');
  }
  return out;
}
const impactHit = (b) => Math.min(0.7, (b.end - b.start) * 0.55);
/** Preset A: um corte seco a cada frase (ar + batida curta na palavra-chave), som enxuto. */
function strategySfx(beats) {
  const out = [];
  beats.forEach((b, i) => {
    if (i) out.push({ t: r2(b.start), type: 'swoosh', volume: 0.4, why: 'corte' });
    const kw = b.words.find((w) => tidy(w.w).toLowerCase() === String(b.data.keyword).toLowerCase());
    if (kw && kw.t - b.start > 0.25) out.push({ t: r2(kw.t), type: 'pr-hit', volume: 0.5, why: 'palavra-chave' });
    if (b.type === 'a-card') out.push({ t: r2(b.start + 0.35), type: 'thud', volume: 0.45, why: 'cartão' });
  });
  return out;
}

// ─────────────────────────────── desenho ───────────────────────────────
const BW = 1080;
const BH = 1920;

/** Fontes padrão (nomes de família registrados pelo chamador). */
export const EXPLAINER_FONTS = { display: 'RF Anton', serif: 'RF Garamond Italic', sans: 'RF Inter 700', heavy: 'RF Inter 900' };
/** Todas as fontes do motion desenhado: [família, arquivo em server/assets/fonts] (render e prévia). */
export const EXPLAINER_FONT_FILES = [
  [EXPLAINER_FONTS.display, 'Anton-Regular.ttf'],
  [EXPLAINER_FONTS.serif, 'S-garamond-400i.ttf'],
  [EXPLAINER_FONTS.sans, 'S-inter-700.ttf'],
  [EXPLAINER_FONTS.heavy, 'S-inter-900.ttf'],
  ...STYLE_FONT_FILES,
];

function words(ctx, text, { x, y, size, font, color, align = 'center', lt, stagger = 0.1, dur = 0.35, glow = 0, gc = null, maxW = 960, weight = '' }) {
  // ajusta o tamanho para caber em maxW
  ctx.font = `${weight}${size}px "${font}"`;
  let s = size;
  const w0 = ctx.measureText(text).width;
  if (w0 > maxW) { s = Math.max(10, size * (maxW / w0)); ctx.font = `${weight}${s}px "${font}"`; }
  const parts = String(text).split(' ');
  const space = ctx.measureText(' ').width;
  const widths = parts.map((p) => ctx.measureText(p).width);
  const total = widths.reduce((a, b) => a + b, 0) + space * (parts.length - 1);
  let cx = align === 'center' ? x - total / 2 : x;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  parts.forEach((p, i) => {
    const e = outCubic(prog(lt, i * stagger, dur));
    if (e > 0) {
      ctx.save();
      ctx.globalAlpha *= e;
      if (e < 1) ctx.filter = `blur(${((1 - e) * 12).toFixed(2)}px)`;
      if (glow) { ctx.shadowColor = gc; ctx.shadowBlur = glow; }
      ctx.fillStyle = color;
      ctx.fillText(p, cx, y + (1 - e) * 20);
      ctx.restore();
    }
    cx += widths[i] + space;
  });
  return { width: total, size: s };
}

function superPath(ctx, cx, cy, r, n) {
  ctx.beginPath();
  for (let k = 0; k <= 96; k += 1) {
    const t = (k / 96) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = Math.sign(s) * Math.abs(s) ** (2 / n);
    if (k) ctx.lineTo(cx + r * x, cy + r * y); else ctx.moveTo(cx + r * x, cy + r * y);
  }
  ctx.closePath();
}
function puzzlePath(ctx, cx, cy, r, k) {
  // quadrado arredondado com a "orelha" (k: 0 → 1 = quanto da orelha aparece)
  superPath(ctx, cx, cy, r, 6);
  ctx.moveTo(cx + r * 0.98 + r * 0.36 * k, cy);
  ctx.arc(cx + r * 0.98, cy, r * 0.36 * k, 0, Math.PI * 2);
}
function star(ctx, x, y, s, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const g = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
  g.addColorStop(0, EXPLAINER.magenta);
  g.addColorStop(1, EXPLAINER.violet);
  ctx.fillStyle = g;
  const h = s / 2;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.quadraticCurveTo(h * 0.1, -h * 0.1, h, 0);
  ctx.quadraticCurveTo(h * 0.1, h * 0.1, 0, h);
  ctx.quadraticCurveTo(-h * 0.1, h * 0.1, -h, 0);
  ctx.quadraticCurveTo(-h * 0.1, -h * 0.1, 0, -h);
  ctx.fill();
  ctx.restore();
}
function softShadow(ctx) {
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
}
function noShadow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Desenha a cena no tempo t (segundos do vídeo).
 * @param {CanvasRenderingContext2D} ctx contexto (qualquer tamanho; a cena é 1080x1920 escalada)
 * @param {object} scene cena de explainerPlan
 * @param {number} t tempo
 * @param {{W:number,H:number,fonts?:object,image?:(id:string)=>any}} env
 */
export function drawExplainer(ctx, scene, t, env) {
  if (scene.style === 'estrategia') return drawStrategy(ctx, scene, t, env);
  if (STYLE_BEATS[scene.style]) return drawStyle(ctx, scene, t, env);
  const { W, H } = env;
  const F = { ...EXPLAINER_FONTS, ...(env.fonts || {}) };
  const C = EXPLAINER;
  const k = Math.max(W / BW, H / BH);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  // fundo + grade branca a cada 40 px
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  // empurrão lento da câmera (100% → 104% na cena inteira), em volta do centro
  const push = lerp(1, 1.04, clamp((t - scene.start) / Math.max(0.1, scene.end - scene.start)));
  ctx.translate(W / 2, H / 2);
  ctx.scale(k * push, k * push);
  ctx.translate(-BW / 2, -BH / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= BW; x += 40) { ctx.moveTo(x + 0.5, -200); ctx.lineTo(x + 0.5, BH + 200); }
  for (let y = 0; y <= BH; y += 40) { ctx.moveTo(-200, y + 0.5); ctx.lineTo(BW + 200, y + 0.5); }
  ctx.stroke();
  // estrela do canto: aparece na forma e fica até o fim da cena
  const morph = scene.beats.find((b) => b.type === 'morph' || b.type === 'negation');
  if (morph && t >= morph.start) {
    const e = outBack(prog(t - morph.start, 0, 0.4));
    star(ctx, 930, 170, 200 * e, (t - morph.start) * 0.7);
  }
  // batida atual (e a saída da anterior, quando ela tem)
  for (const b of scene.beats) {
    const lt = t - b.start;
    if (t < b.start || t > b.end + (b.type === 'hook' ? 0.6 : 0)) continue;
    DRAW[b.type]?.(ctx, b, lt, F, env, t > b.end ? t - b.end : 0);
  }
  ctx.restore();
}

const DRAW = {
  hook(ctx, b, lt, F, env, exitT) {
    const C = EXPLAINER;
    const ex = exitT ? inCubic(prog(exitT, 0, 0.5)) : 0;
    ctx.save();
    // painel índigo (sai crescendo para o canto de cima à esquerda)
    const rx = 150;
    const ry = 760;
    const s = lerp(1, 1.6, ex);
    ctx.globalAlpha = 1 - ex;
    ctx.translate(rx + lerp(0, -520, ex), ry + lerp(0, -700, ex));
    ctx.scale(s, s);
    softShadow(ctx);
    ctx.fillStyle = C.indigo;
    const enter = outBack(prog(lt, 0, 0.35));
    ctx.save();
    ctx.translate(310, 105);
    ctx.scale(enter, enter);
    ctx.fillRect(-310, -105, 620, 210);
    ctx.restore();
    noShadow(ctx);
    words(ctx, b.data.text, { x: 310, y: 105 + 32, size: 88, font: F.display, color: C.white, lt: lt - 0.1, maxW: 560 });
    // bola lima cai na borda de cima à direita e amassa ao bater
    const fall = prog(lt, 0.15, 0.45);
    const by = lerp(-100 - ry, -35, inCubic(fall));
    const sq = fall >= 1 ? 1 - 0.2 * Math.sin(prog(lt, 0.6, 0.2) * Math.PI) : 1;
    ctx.save();
    ctx.translate(560, by + 35 * (1 - sq));
    ctx.scale(1 + (1 - sq) * 0.6, sq);
    ctx.fillStyle = C.lime;
    ctx.beginPath();
    ctx.arc(0, 0, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  },
  stat(ctx, b, lt, F) {
    words(ctx, b.data.keyword, { x: 540, y: 1040, size: 240, font: F.display, color: EXPLAINER.ink, lt, maxW: 960 });
  },
  support(ctx, b, lt, F) {
    const C = EXPLAINER;
    ctx.save();
    const wipe = outCubic(prog(lt, 0, 0.3));
    ctx.beginPath();
    ctx.rect(0, 0, 60 + 960 * wipe, 1920);
    ctx.clip();
    words(ctx, b.data.small || b.data.text, { x: 540, y: 880, size: 64, font: F.serif, color: C.ink, lt, maxW: 940, weight: 'italic ' });
    words(ctx, b.data.keyword, { x: 540, y: 1010, size: 96, font: F.display, color: C.ink, lt: lt - 0.1, maxW: 960 });
    ctx.restore();
  },
  counter(ctx, b, lt, F, env) {
    const C = EXPLAINER;
    const cx = 540;
    const cy = 760;
    ctx.save();
    ctx.globalAlpha = outCubic(prog(lt, 0, 0.25));
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -lt * 12;
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.ink;
    ctx.beginPath();
    ctx.arc(cx, cy, 160, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const img = env.image?.(b.data.element || 'brain');
    if (img) {
      const s = 220 * outBack(prog(lt, 0.05, 0.4));
      softShadow(ctx);
      ctx.filter = 'grayscale(1) brightness(1.05)';
      ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s);
      ctx.filter = 'none';
      noShadow(ctx);
    }
    ctx.restore();
    const n = Math.round(lerp(0, b.data.number || 0, outCubic(prog(lt, 0, 1.1))));
    const str = n.toLocaleString('pt-BR');
    ctx.save();
    ctx.font = `150px "${F.display}"`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(245,166,35,0.6)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = C.orange;
    ctx.fillText(str, cx, 1080);
    ctx.restore();
    if (b.data.caption) {
      ctx.save();
      ctx.globalAlpha = outCubic(prog(lt, 0.5, 0.4));
      words(ctx, b.data.caption, { x: 540, y: 1190, size: 56, font: F.serif, color: C.ink, lt: lt - 0.5, maxW: 940, weight: 'italic ' });
      ctx.restore();
    }
  },
  morph(ctx, b, lt, F) {
    const C = EXPLAINER;
    const cx = 540;
    const cy = 930;
    // círculo → quadrado arredondado → peça de quebra-cabeça (0,4 s por etapa)
    const n = lt < 0.4 ? 2 : lerp(2, 6, inOutCubic(prog(lt, 0.4, 0.4)));
    const ear = inOutCubic(prog(lt, 0.8, 0.4));
    const pop = outBack(prog(lt, 0, 0.3));
    ctx.save();
    softShadow(ctx);
    ctx.fillStyle = C.violet;
    if (ear > 0) puzzlePath(ctx, cx, cy, 130 * pop, ear); else superPath(ctx, cx, cy, 130 * pop, n);
    ctx.fill('nonzero');
    noShadow(ctx);
    // satélite em órbita
    const a = lt * 2.6;
    ctx.fillStyle = C.lime;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * 200, cy + Math.sin(a) * 200 * 0.55, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    words(ctx, b.data.small || b.data.text, { x: 540, y: 690, size: 56, font: F.serif, color: C.ink, lt, maxW: 940, weight: 'italic ' });
    words(ctx, (b.data.keys.slice(0, 2).join(' ') || b.data.keyword), { x: 540, y: 1240, size: 120, font: F.display, color: C.ink, lt: lt - 0.15, maxW: 960 });
  },
  chart(ctx, b, lt, F) {
    const C = EXPLAINER;
    const xs = [360, 500, 640, 780];
    const hs = [180, 300, 220, 340];
    const base = 1100;
    ctx.save();
    xs.forEach((x, i) => {
      const s = Math.max(0, spring(lt - i * 0.08));
      const h = hs[i] * s;
      const g = ctx.createLinearGradient(0, base - hs[i], 0, base);
      g.addColorStop(0, C.bars[i][1]);
      g.addColorStop(1, C.bars[i][0]);
      softShadow(ctx);
      ctx.fillStyle = g;
      ctx.fillRect(x, base - h, 90, h);
    });
    noShadow(ctx);
    // linha por cima das barras, desenhada (stroke-dashoffset)
    const pts = xs.map((x, i) => [x + 45, base - hs[i] - 40]);
    let L = 0;
    for (let i = 1; i < pts.length; i += 1) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const d = inOutCubic(prog(lt, 0.35, 0.6));
    if (d > 0) {
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash([L, L]);
      ctx.lineDashOffset = L * (1 - d);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    words(ctx, b.data.text, { x: 540, y: 640, size: 60, font: F.serif, color: C.ink, lt, maxW: 940, weight: 'italic ' });
  },
  tags(ctx, b, lt, F) {
    const C = EXPLAINER;
    const items = b.data.keys.slice(0, 3);
    items.forEach((label, i) => {
      const e = prog(lt, i * 0.2, 0.25);
      if (e <= 0) return;
      const y = 800 + i * 150;
      ctx.save();
      ctx.font = `italic 56px "${F.serif}"`;
      const w = Math.max(420, ctx.measureText(label).width + 100);
      const h = 96;
      const s = lerp(0.9, 1, outBack(e));
      ctx.globalAlpha = clamp(e * 1.6);
      ctx.translate(540, y);
      ctx.scale(s, s);
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.ink;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = C.ink;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc((dx * w) / 2, (dy * h) / 2, 5, 0, Math.PI * 2); ctx.fill(); }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 2);
      ctx.restore();
    });
  },
  negation(ctx, b, lt, F) {
    const C = EXPLAINER;
    const sweep = inOutCubic(prog(lt, 0, 1));
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = C.arc;
    ctx.lineWidth = 60;
    ctx.lineCap = 'round';
    ctx.translate(lerp(-500, 0, sweep), 0);
    ctx.beginPath();
    ctx.moveTo(-200, 1500);
    ctx.quadraticCurveTo(540, 1000, 1300, 1600);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-200, 420);
    ctx.quadraticCurveTo(600, 760, 1300, 300);
    ctx.stroke();
    ctx.restore();
    words(ctx, b.data.text, { x: 540, y: 960, size: 60, font: F.serif, color: C.ink, lt, maxW: 940, weight: 'italic ' });
  },
  impact(ctx, b, lt, F) {
    const C = EXPLAINER;
    const hit = impactHit(b);
    const cx = 540;
    const cy = 820;
    const pop = lt < 0.3 ? (lt < 0.2 ? lerp(0, 1.08, outCubic(lt / 0.2)) : lerp(1.08, 1, (lt - 0.2) / 0.1)) : 1;
    const sq = 1 - 0.08 * Math.sin(prog(lt, hit, 0.2) * Math.PI);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pop * sq, pop * sq);
    softShadow(ctx);
    [[180, C.red], [120, C.white], [60, C.red]].forEach(([r, col], i) => {
      if (i) noShadow(ctx);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    // flecha vem da direita a 2500 px/s e acerta o centro em "hit"
    const ax = cx + Math.max(0, (hit - lt) * 2500);
    if (lt > hit - 0.6) {
      ctx.save();
      if (lt < hit) ctx.filter = 'blur(3px)';
      ctx.fillStyle = C.ink;
      ctx.fillRect(ax, cy - 4, 320, 8);
      ctx.beginPath();
      ctx.moveTo(ax - 24, cy);
      ctx.lineTo(ax + 6, cy - 16);
      ctx.lineTo(ax + 6, cy + 16);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (lt >= hit) words(ctx, b.data.keys.slice(0, 3).join(' ') || b.data.text, { x: 540, y: 1180, size: 96, font: F.display, color: C.ink, lt: lt - hit, maxW: 960 });
  },
  end(ctx, b, lt, F) {
    const C = EXPLAINER;
    const r = words(ctx, b.data.keys.slice(0, 3).join(' ') || b.data.text, { x: 540, y: 980, size: 88, font: F.display, color: C.ink, lt, maxW: 940 });
    const d = outCubic(prog(lt, 0.3, 0.4));
    if (d > 0) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = C.lime;
      ctx.fillRect(540 - r.width / 2, 1005, r.width * d, 16);
      ctx.restore();
    }
  },
};

// ─────────────────────────────── preset A: "Estratégia" ───────────────────────────────
// Como o vídeo de referência: creme e preto em corte seco; texto em grotesca (não condensada)
// montando a frase palavra por palavra NO INSTANTE em que é falada (desfoque + deslize), as
// palavras-chave em vermelho; no creme, grade de pontos, objeto 3D grande cortado na borda,
// código de barras e arco cinza; no preto, brilho branco/vermelho e o balão branco.

/** Momento (dentro da batida) em que a palavra-chave é falada. */
const kwAt = (b) => {
  const w = (b.words || []).find((x) => tidy(x.w).toLowerCase() === String(b.data.keyword).toLowerCase());
  return w ? Math.max(0, Math.min(0.9, w.t - b.start)) : 0.25;
};
const low = (s) => tidy(String(s || '')).toLowerCase();

/** Palavras vermelhas da batida: a chave e, em frase longa, mais uma palavra forte. */
function redWords(b) {
  const set = new Set([low(b.data.keyword)]);
  const n = (b.words || []).length || String(b.data.text || '').split(' ').length;
  if (n >= 5) {
    const extra = (b.data.keys || []).filter((k) => low(k) !== low(b.data.keyword) && low(k).length >= 4).sort((x, y) => y.length - x.length)[0];
    if (extra) set.add(low(extra));
  }
  return set;
}

/** Palavras da batida com o instante (relativo) em que cada uma é falada. */
function beatWords(b) {
  const span = Math.max(0.6, (b.end - b.start) * 0.7);
  const ws = (b.words || []).length
    ? b.words.map((w) => ({ text: String(w.w), at: Math.max(0, Number(w.t) - b.start) }))
    : String(b.data.text || '').split(' ').filter(Boolean).map((text, i, all) => ({ text, at: (i / Math.max(1, all.length)) * span }));
  const red = redWords(b);
  return ws.map((w) => ({ ...w, red: red.has(low(w.text)) }));
}

/**
 * Monta as linhas: palavras pequenas seguem na linha; a palavra vermelha (grande) abre linha
 * nova quando a atual já tem conteúdo, e as pequenas depois dela continuam ao lado.
 * → { lines: [{ items: [{text, at, red, size, w, x}], w, h, base }], h }
 */
function flowLayout(ctx, items, { S, K, maxW, font, heavy, lineGap = 0.08 }) {
  const fontOf = (it, size) => `${size}px "${it.red ? heavy : font}"`;
  const ls = (size, red) => `${(red ? -0.045 : -0.03) * size}px`;
  const measure = (it, size) => {
    ctx.font = fontOf(it, size);
    ctx.letterSpacing = ls(size, it.red);
    const w = ctx.measureText(it.text).width;
    ctx.letterSpacing = '0px';
    return w;
  };
  // tamanho: a vermelha mais larga cabe na largura
  let k = K;
  for (const it of items) if (it.red) { const w = measure(it, k); if (w > maxW) k = Math.max(S, k * (maxW / w)); }
  const sized = items.map((it) => ({ ...it, size: it.red ? k : S }));
  sized.forEach((it) => { it.w = measure(it, it.size); });
  const space = (size) => size * 0.26;
  const lines = [];
  let cur = null;
  for (const it of sized) {
    const need = cur ? cur.w + space(it.size) + it.w : it.w;
    const breakForRed = it.red && cur && cur.items.length && (cur.items.length >= 2 || cur.items.some((x) => x.red));
    if (!cur || need > maxW || breakForRed) { cur = { items: [], w: 0 }; lines.push(cur); }
    it.x = cur.items.length ? cur.w + space(it.size) : 0;
    cur.w = it.x + it.w;
    cur.items.push(it);
  }
  let y = 0;
  for (const ln of lines) {
    const top = Math.max(...ln.items.map((x) => x.size));
    ln.h = top * (1 + lineGap);
    y += top * 0.86;
    ln.base = y;
    y += top * (0.14 + lineGap);
  }
  return { lines, h: y, size: k };
}

/**
 * Desenha a frase montando-se palavra por palavra. Cada palavra entra no instante falado:
 * desfocada, transparente, um pouco maior e à direita → nítida no lugar (0,38 s).
 */
function flowText(ctx, b, lt, F, { x, y, maxW, S = 90, K = 180, dark = false, align = 'stagger', items = null, rot = 0, gradient = null }) {
  const A = STRATEGY;
  const list = items || beatWords(b);
  if (!list.length) return null;
  const L = flowLayout(ctx, list, { S, K, maxW, font: F.sans, heavy: F.heavy });
  const n = L.lines.length;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  L.lines.forEach((ln, li) => {
    // escada editorial: cada linha um pouco mais à direita (como na referência)
    const shift = align === 'stagger' ? (li - (n - 1) / 2) * 34 : 0;
    const x0 = align === 'left' ? 0 : -ln.w / 2 + shift;
    const y0 = ln.base - L.h / 2;
    for (const it of ln.items) {
      const e = outCubic(prog(lt, it.at - 0.04, 0.38));
      if (e <= 0) { it.cx = x + x0 + it.x + it.w / 2; it.cy = y + y0 - it.size * 0.36; continue; }
      ctx.save();
      const cx = x0 + it.x + it.w / 2;
      // centro da palavra (coordenadas da cena, sem a rotação) — para o círculo de destaque
      it.cx = x + cx;
      it.cy = y + y0 - it.size * 0.36;
      ctx.translate(cx + (1 - e) * 70, y0 + (1 - e) * 8);
      const s = lerp(1.14, 1, e);
      ctx.scale(s, s);
      ctx.globalAlpha *= e;
      if (e < 1) ctx.filter = `blur(${((1 - e) * 16).toFixed(2)}px)`;
      ctx.font = `${it.size}px "${it.red ? F.heavy : F.sans}"`;
      ctx.letterSpacing = `${(it.red ? -0.045 : -0.03) * it.size}px`;
      if (dark) {
        ctx.shadowColor = it.red ? 'rgba(235,30,45,0.85)' : 'rgba(255,255,255,0.55)';
        ctx.shadowBlur = it.red ? 46 : 26;
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.16)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 6;
      }
      if (it.red && gradient && low(it.text) === low(b.data.keyword)) {
        const g = ctx.createLinearGradient(-it.w / 2, 0, it.w / 2, 0);
        gradient.forEach((c, i) => g.addColorStop(i / (gradient.length - 1), c));
        ctx.fillStyle = g;
      } else ctx.fillStyle = it.red ? A.red : dark ? A.white : A.ink;
      ctx.fillText(it.text, -it.w / 2, 0);
      ctx.restore();
    }
  });
  ctx.restore();
  return L;
}

/** Fundo creme (com vinheta suave) ou preto (com um leve halo no centro). */
function strategyBg(ctx, dark) {
  const A = STRATEGY;
  if (dark) {
    ctx.fillStyle = A.black;
    ctx.fillRect(-200, -200, BW + 400, BH + 400);
    const g = ctx.createRadialGradient(540, 960, 0, 540, 960, 900);
    g.addColorStop(0, 'rgba(40,40,40,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-200, -200, BW + 400, BH + 400);
    return;
  }
  ctx.fillStyle = A.cream;
  ctx.fillRect(-200, -200, BW + 400, BH + 400);
  const g = ctx.createRadialGradient(540, 900, 300, 540, 960, 1300);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(120,100,80,0.14)');
  ctx.fillStyle = g;
  ctx.fillRect(-200, -200, BW + 400, BH + 400);
}

/** Grade fina com pontos nos cruzamentos, sumindo nas bordas (atrás do texto, no creme). */
function dotGrid(ctx, cx, cy, w, h, alpha) {
  if (alpha <= 0) return;
  const step = 72;
  ctx.save();
  for (let x = cx - w / 2; x <= cx + w / 2 + 1; x += step) {
    for (let y = cy - h / 2; y <= cy + h / 2 + 1; y += step) {
      const d = Math.hypot((x - cx) / (w / 2), (y - cy) / (h / 2));
      const a = alpha * clamp(1 - d * d);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a * 0.5;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - step / 2);
      ctx.lineTo(x, y + step / 2);
      ctx.moveTo(x - step / 2, y);
      ctx.lineTo(x + step / 2, y);
      ctx.globalAlpha = a * 0.09;
      ctx.stroke();
      ctx.globalAlpha = a * 0.45;
      ctx.fillStyle = '#3A3A3A';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Código de barras decorativo (barras fixas, levemente desfocadas). */
function barcode(ctx, x, y, w, h, alpha) {
  if (alpha <= 0) return;
  const bars = [3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 1, 2, 3, 1, 2, 4, 1, 1, 2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1];
  const total = bars.reduce((a, v) => a + v, 0) * 1.6;
  const u = w / total;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.filter = 'blur(0.8px)';
  ctx.fillStyle = '#111';
  let cx = x;
  bars.forEach((v, i) => { if (i % 2 === 0) ctx.fillRect(cx, y, v * u, h); cx += v * u * 1.6; });
  ctx.restore();
}

/** Faixa cinza curva (o "arco" da referência), deslizando para dentro. */
function arcBand(ctx, lt, { from = -320 } = {}) {
  ctx.save();
  ctx.strokeStyle = STRATEGY.arc;
  ctx.lineWidth = 120;
  ctx.lineCap = 'round';
  ctx.translate(lerp(from, 0, inOutCubic(prog(lt, 0, 0.8))), 0);
  ctx.beginPath();
  ctx.moveTo(-160, -120);
  ctx.bezierCurveTo(520, 420, 760, 1200, 1300, 2050);
  ctx.stroke();
  ctx.restore();
}

function drawStrategy(ctx, scene, t, env) {
  const { W, H } = env;
  const F = { ...EXPLAINER_FONTS, ...(env.fonts || {}) };
  const k = Math.max(W / BW, H / BH);
  const beat = [...scene.beats].reverse().find((b) => t >= b.start) || scene.beats[0];
  const lt = t - beat.start;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.fillStyle = DARK.has(beat.type) ? STRATEGY.black : STRATEGY.cream;
  ctx.fillRect(0, 0, W, H);
  // corte seco com um "soco" de câmera (108% → 100% em 0,2 s) e o empurrão lento da batida
  const punch = lerp(1.08, 1, outCubic(prog(lt, 0, 0.2)));
  const push = lerp(1, 1.04, clamp(lt / Math.max(0.5, beat.end - beat.start)));
  ctx.translate(W / 2, H / 2);
  ctx.scale(k * push * punch, k * push * punch);
  ctx.translate(-BW / 2, -BH / 2);
  strategyBg(ctx, DARK.has(beat.type));
  ADRAW[beat.type]?.(ctx, beat, lt, F, env);
  ctx.restore();
}

function objectImg(ctx, env, id, x, y, size, { alpha = 1, rot = 0, blur = 0, gray = false, shadow = true } = {}) {
  const img = env.image?.(id || 'bulb');
  if (!img || size <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  const f = [blur ? `blur(${blur}px)` : '', gray ? 'grayscale(1) contrast(1.35) brightness(1.1)' : ''].filter(Boolean).join(' ');
  if (f) ctx.filter = f;
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 30;
  }
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}
// texto de apoio: o que vem antes da chave (ou, se ela abre a frase, o que vem depois)
const lead = (b) => b.data.small || b.data.after || '';
/** Divide as palavras na chave: [até a chave, depois dela]. */
function splitAtKey(b) {
  const ws = beatWords(b);
  const i = ws.findIndex((w) => low(w.text) === low(b.data.keyword));
  return i < 0 ? [ws, []] : [ws.slice(0, i + 1), ws.slice(i + 1)];
}
const bob = (lt, amp = 10, sp = 1.6) => Math.sin(lt * sp * Math.PI) * amp;

/**
 * Homem de terno em retícula (pontos), o balão branco é a cabeça dele: ombros, gola branca e
 * gravata. Sobe de baixo ao entrar.
 */
function halftoneSuit(ctx, lt) {
  const e = outCubic(prog(lt, 0, 0.55));
  if (e <= 0) return;
  ctx.save();
  ctx.translate(0, (1 - e) * 400);
  ctx.globalAlpha *= e;
  const top = 880;
  const torso = () => {
    ctx.beginPath();
    ctx.moveTo(420, top);
    ctx.bezierCurveTo(200, top + 30, 20, top + 90, -10, top + 330);
    ctx.lineTo(-40, 2000);
    ctx.lineTo(1120, 2000);
    ctx.lineTo(1090, top + 330);
    ctx.bezierCurveTo(1060, top + 90, 880, top + 30, 660, top);
    ctx.closePath();
  };
  // terno: pontos maiores nas bordas e embaixo (sombra), menores no meio (luz)
  ctx.save();
  torso();
  ctx.clip();
  ctx.fillStyle = '#0B0B0B';
  ctx.fillRect(0, top - 10, BW, BH);
  ctx.fillStyle = '#E9E9E9';
  const step = 22;
  for (let yy = top; yy < BH + 40; yy += step) {
    for (let xx = (yy / step) % 2 ? step / 2 : 0; xx < BW; xx += step) {
      const light = clamp(1 - Math.abs(xx - 540) / 620) * clamp(1 - (yy - top) / 1100);
      const r = 1 + 7.5 * (1 - light) * clamp((yy - top) / 140);
      ctx.beginPath();
      ctx.arc(xx, yy, Math.min(9, r * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  // gola branca em V e gravata escura
  ctx.fillStyle = '#F4F4F4';
  ctx.beginPath();
  ctx.moveTo(450, top - 20);
  ctx.lineTo(630, top - 20);
  ctx.lineTo(540, top + 330);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#151515';
  ctx.beginPath();
  ctx.moveTo(515, top + 30);
  ctx.lineTo(565, top + 30);
  ctx.lineTo(578, top + 300);
  ctx.lineTo(540, top + 360);
  ctx.lineTo(502, top + 300);
  ctx.closePath();
  ctx.fill();
  // lapelas
  ctx.fillStyle = '#050505';
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(540 + sgn * 95, top - 10);
    ctx.lineTo(540 + sgn * 200, top + 160);
    ctx.lineTo(540 + sgn * 18, top + 420);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

const ADRAW = {
  // creme: objeto 3D enorme cortado na borda esquerda, código de barras, grade e a frase
  'a-hook'(ctx, b, lt, F, env) {
    const e = outCubic(prog(lt, 0, 0.7));
    dotGrid(ctx, 640, 960, 620, 700, outCubic(prog(lt, 0.1, 0.6)));
    barcode(ctx, 700, 330, 240, 80, outCubic(prog(lt, 0.15, 0.4)));
    objectImg(ctx, env, b.data.element || 'bulb', lerp(-420, 70, e), 960 + bob(lt, 8, 0.8), 980, { rot: lerp(-0.4, -0.08, e), alpha: clamp(e * 1.4) });
    flowText(ctx, b, lt, F, { x: 650, y: 960, maxW: 720, S: 88, K: 180 });
  },
  // preto: balão branco com a frase (e a chave vermelha); o resto entra grande embaixo
  'a-bubble'(ctx, b, lt, F, env) {
    const [head, tail] = splitAtKey(b);
    halftoneSuit(ctx, lt);
    const e = outBack(prog(lt, 0, 0.42));
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.35)';
    ctx.shadowBlur = 60;
    ctx.fillStyle = STRATEGY.white;
    ctx.beginPath();
    ctx.arc(540, 660, 280 * Math.max(0, e), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (e > 0.6) flowText(ctx, b, lt, F, { x: 540, y: 670, maxW: 440, S: 92, K: 118, items: head, align: 'center' });
    // o fim da frase entra grande, em branco brilhando, por cima do terno
    if (tail.length) flowText(ctx, b, lt, F, { x: 540, y: 1520, maxW: 940, S: 160, K: 170, items: tail, dark: true, align: 'center' });
  },
  // preto: só a frase, com brilho (branco nas pequenas, vermelho na chave)
  'a-glow'(ctx, b, lt, F) {
    flowText(ctx, b, lt, F, { x: 540, y: 960, maxW: 920, S: 86, K: 160, dark: true });
  },
  // creme: arco cinza, a frase e o objeto que salta embaixo (e cópias desfocadas nos cantos)
  'a-plain'(ctx, b, lt, F, env) {
    arcBand(ctx, lt);
    const el = b.data.element;
    if (el) {
      objectImg(ctx, env, el, 980, 230, 420, { blur: 5, alpha: outCubic(prog(lt, 0.1, 0.5)), rot: -0.3, shadow: false });
      objectImg(ctx, env, el, 90, 1760, 520, { blur: 7, alpha: outCubic(prog(lt, 0.15, 0.5)), rot: 0.25, shadow: false });
    }
    flowText(ctx, b, lt, F, { x: 540, y: el ? 740 : 940, maxW: 920, S: 90, K: 180 });
    if (el) {
      const e = outBack(prog(lt, 0.2, 0.45));
      objectImg(ctx, env, el, 540, 1120 + bob(lt, 10, 1.2), 440 * Math.max(0, e), { rot: Math.sin(lt * 3) * 0.04 });
    }
  },
  // preto: objeto 3D no centro, a frase inclinada em cima e o fim dela embaixo
  'a-object'(ctx, b, lt, F, env) {
    const [head, tail] = splitAtKey(b);
    const e = outBack(prog(lt, 0, 0.5));
    objectImg(ctx, env, b.data.element, 540, 1010 + bob(lt, 12, 1), 640 * lerp(0.7, 1, clamp(e)), { alpha: clamp(e), rot: -0.06 + Math.sin(lt * 1.4) * 0.03 });
    flowText(ctx, b, lt, F, { x: 520, y: 640, maxW: 860, S: 70, K: 140, items: head, dark: true, rot: -0.13, align: 'center', S: 84, K: 165 });
    if (tail.length) flowText(ctx, b, lt, F, { x: 560, y: 1420, maxW: 860, S: 70, K: 140, items: tail, dark: true, rot: -0.04, S: 84, K: 165 });
  },
  // creme: cartão cinza preso com o alfinete vermelho; título e a lista com ícones
  'a-card'(ctx, b, lt, F) {
    const A = STRATEGY;
    arcBand(ctx, lt);
    const e = outBack(prog(lt, 0, 0.55));
    const w = 560;
    const h = 660;
    ctx.save();
    ctx.translate(540, 960 + lerp(-700, 0, e));
    ctx.rotate(-0.03 + Math.sin(lt * 2) * 0.006);
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetX = 14;
    ctx.shadowOffsetY = 22;
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#9A9796');
    g.addColorStop(1, A.card);
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    noShadow(ctx);
    // alfinete vermelho com brilho
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 6;
    const pg = ctx.createRadialGradient(-8, -h / 2 - 14, 2, 0, -h / 2 - 6, 24);
    pg.addColorStop(0, '#FF6B6B');
    pg.addColorStop(1, A.red);
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(0, -h / 2 - 6, 24, 0, Math.PI * 2);
    ctx.fill();
    noShadow(ctx);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = A.white;
    ctx.font = `104px "${F.heavy}"`;
    ctx.letterSpacing = '-4px';
    const title = b.data.keyword;
    let ts = 104;
    const tw = ctx.measureText(title).width;
    if (tw > w - 90) { ts = 104 * ((w - 90) / tw); ctx.font = `${ts}px "${F.heavy}"`; }
    ctx.globalAlpha = outCubic(prog(lt, 0.2, 0.35));
    ctx.fillText(title, -w / 2 + 45, -h / 2 + 150);
    ctx.fillRect(-w / 2 + 45, -h / 2 + 180, w - 90, 6);
    ctx.globalAlpha = 1;
    ctx.letterSpacing = '0px';
    const ws = beatWords(b);
    const list = (b.data.keys || []).filter((x) => low(x) !== low(b.data.keyword)).slice(0, 3);
    list.forEach((item, i) => {
      const at = ws.find((x) => low(x.text) === low(item))?.at ?? 0.35 + i * 0.25;
      const ie = outCubic(prog(lt, Math.max(0.3, at), 0.3));
      if (ie <= 0) return;
      ctx.save();
      ctx.globalAlpha = ie;
      ctx.translate((1 - ie) * 40, 0);
      const yy = -h / 2 + 290 + i * 100;
      ctx.strokeStyle = A.white;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(-w / 2 + 70, yy - 18, 20, 0, Math.PI * 2);
      ctx.moveTo(-w / 2 + 56, yy - 4);
      ctx.lineTo(-w / 2 + 84, yy - 32);
      ctx.stroke();
      ctx.fillStyle = A.white;
      ctx.font = `54px "${F.sans}"`;
      ctx.letterSpacing = '-1.5px';
      ctx.fillText(item, -w / 2 + 110, yy);
      ctx.restore();
    });
    ctx.restore();
  },
  // creme: a chave com um círculo rosa que estoura sobre ela (nome de marca ganha degradê)
  'a-brand'(ctx, b, lt, F) {
    const ka = kwAt(b);
    const c = prog(lt, ka + 0.15, 0.35);
    const fade = 1 - prog(lt, ka + 0.9, 0.35);
    if (c > 0 && fade > 0) {
      // fundo levemente rosado enquanto o círculo aparece
      ctx.save();
      ctx.globalAlpha = 0.18 * fade;
      ctx.fillStyle = '#F6B9BE';
      ctx.fillRect(-200, -200, BW + 400, BH + 400);
      ctx.restore();
    }
    // degradê colorido só em nome de marca (maiúscula no meio da frase: "Instagram", "YouTube")
    const first = low((b.words || [])[0]?.w);
    const brand = /^\p{Lu}/u.test(String(b.data.keyword)) && low(b.data.keyword) !== first;
    const L = flowText(ctx, b, lt, F, { x: 540, y: 960, maxW: 920, S: 90, K: 190, gradient: brand ? ['#6A2BC2', '#C1358F', '#F2643A', '#F9A53C'] : null });
    const kw = L?.lines.flatMap((ln) => ln.items).find((it) => low(it.text) === low(b.data.keyword));
    if (kw && c > 0 && fade > 0) {
      const r = Math.max(kw.w * 0.42, kw.size * 0.9) * outBack(c);
      ctx.save();
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = 'rgba(242,120,130,0.55)';
      ctx.strokeStyle = '#E2323F';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(kw.cx, kw.cy, Math.max(0, r), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  },
  // preto: o chamado final com brilho
  'a-cta'(ctx, b, lt, F) {
    flowText(ctx, b, lt, F, { x: 540, y: 960, maxW: 920, S: 84, K: 140, dark: true, align: 'center' });
  },
};
