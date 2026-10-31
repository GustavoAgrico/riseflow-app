// Motion "Explicativo" (preset B): cena vertical de motion design desenhada em Canvas 2D,
// quadro a quadro, como função pura do tempo — o mesmo código desenha a prévia (navegador) e
// o render (servidor, @napi-rs/canvas → FFmpeg). As batidas saem da fala: gancho no painel
// índigo, palavra de destaque, frase de apoio, contador, forma que se transforma, gráfico,
// etiquetas, negação, alvo com flecha e o fechamento com sublinhado.

import { phraseChunks, wordRole } from './kinetic.js';
import { conceptsIn } from './sceneElements.js';
import { emphasisScore } from './keyMoments.js';

export const EXPLAINER = {
  bg: '#DADADE', indigo: '#2A0A9A', violet: '#7A1FD6', magenta: '#B0309E', orange: '#F5A623', lime: '#B8E03A',
  ink: '#111111', red: '#B3132B', white: '#FFFFFF', arc: '#CFCBC4',
  bars: [['#4FB8B0', '#7B4FD6'], ['#7B4FD6', '#E0508A'], ['#E0508A', '#F09A3B'], ['#F09A3B', '#4FB8B0']],
};
export const EXPLAINER_BEATS = ['hook', 'stat', 'support', 'counter', 'morph', 'chart', 'tags', 'negation', 'impact', 'end'];
// Preset A ("Estratégia"): creme e preto alternando em corte seco, palavra-chave condensada vermelha
export const STRATEGY = { cream: '#FBF6ED', black: '#000000', red: '#E0162B', purple: '#833AB4', ink: '#111111', white: '#FFFFFF', card: '#8C8988', arc: '#CFCBC4' };
export const STRATEGY_BEATS = ['a-hook', 'a-bubble', 'a-glow', 'a-plain', 'a-object', 'a-card', 'a-brand', 'a-cta'];
export const MOTION_STYLES = { explicativo: EXPLAINER_BEATS, estrategia: STRATEGY_BEATS };
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
    if (type === 'counter' || type === 'morph') data.element = conceptsIn(c)[0]?.element || null;
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
      keys: keys.map((w) => tidy(clean(w))), element: concept?.element || null,
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
  let pick = groups.filter((g) => g.length >= 3);
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
    const beats = (style === 'estrategia' ? strategyBeatsFor(g) : beatsFor(g)).map((b, k, all) => {
      const s = Math.max(start, b.chunk[0].start - 0.05);
      const e = k < all.length - 1 ? all[k + 1].chunk[0].start - 0.05 : end;
      return { type: b.type, start: r2(s), end: r2(Math.max(s + 0.6, e)), words: b.chunk.map((w) => ({ w: clean(w), t: r2(w.start) })), data: b.data };
    });
    scenes.push({ start: r2(start), end: r2(end), style: style === 'estrategia' ? 'estrategia' : 'explicativo', beats });
    sfx.push(...(style === 'estrategia' ? strategySfx(beats) : explainerSfx(beats)));
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
export const EXPLAINER_FONTS = { display: 'RF Anton', serif: 'RF Garamond Italic', sans: 'RF Inter 700' };

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
/** Momento (dentro da batida) em que a palavra-chave é falada. */
const kwAt = (b) => {
  const w = (b.words || []).find((x) => tidy(x.w).toLowerCase() === String(b.data.keyword).toLowerCase());
  return w ? Math.max(0, Math.min(0.9, w.t - b.start)) : 0.25;
};

function drawStrategy(ctx, scene, t, env) {
  const { W, H } = env;
  const F = { ...EXPLAINER_FONTS, ...(env.fonts || {}) };
  const A = STRATEGY;
  const k = Math.max(W / BW, H / BH);
  const beat = [...scene.beats].reverse().find((b) => t >= b.start) || scene.beats[0];
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.fillStyle = DARK.has(beat.type) ? A.black : A.cream;
  ctx.fillRect(0, 0, W, H);
  const push = lerp(1, 1.03, clamp((t - beat.start) / Math.max(0.5, beat.end - beat.start)));
  ctx.translate(W / 2, H / 2);
  ctx.scale(k * push, k * push);
  ctx.translate(-BW / 2, -BH / 2);
  ADRAW[beat.type]?.(ctx, beat, t - beat.start, F, env);
  ctx.restore();
  // corte seco: flash preto bem curto em cada troca de frase
  let f = 0;
  for (const b of scene.beats.slice(1)) f = Math.max(f, clamp(1 - Math.abs(t - b.start) / 0.06));
  if (f > 0) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = f;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

function objectImg(ctx, env, id, x, y, size, { alpha = 1, rot = 0 } = {}) {
  const img = env.image?.(id || 'bulb');
  if (!img) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 24;
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}
// texto de apoio: o que vem antes da chave (ou, se ela abre a frase, o que vem depois)
const lead = (b) => b.data.small || b.data.after || '';

const ADRAW = {
  'a-hook'(ctx, b, lt, F, env) {
    const A = STRATEGY;
    const e = outCubic(prog(lt, 0, 0.6));
    objectImg(ctx, env, b.data.element, 250, 560 - (1 - e) * 120, 560, { alpha: e, rot: -0.12 });
    words(ctx, lead(b), { x: 540, y: 900, size: 84, font: F.sans, color: A.ink, lt, stagger: 0.06, maxW: 960 });
    words(ctx, b.data.keyword, { x: 540, y: 1110, size: 170, font: F.display, color: A.red, lt: lt - kwAt(b), stagger: 0.06, maxW: 980 });
  },
  'a-bubble'(ctx, b, lt, F) {
    const A = STRATEGY;
    const e = outBack(prog(lt, 0, 0.4));
    ctx.save();
    ctx.fillStyle = A.white;
    ctx.beginPath();
    ctx.arc(540, 670, 250 * Math.max(0, e), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // frase de entrada curta demais ("e o"): o balão leva a frase inteira em destaque
    if (lead(b).length >= 8) {
      words(ctx, lead(b), { x: 540, y: 690, size: 56, font: F.sans, color: A.ink, lt, stagger: 0.08, maxW: 420 });
      words(ctx, b.data.keyword, { x: 540, y: 1160, size: 120, font: F.display, color: A.white, lt: lt - Math.max(0.4, kwAt(b)), stagger: 0.1, maxW: 960 });
    } else {
      words(ctx, b.data.text, { x: 540, y: 705, size: 90, font: F.display, color: A.ink, lt: lt - 0.1, stagger: 0.08, maxW: 400 });
    }
  },
  'a-glow'(ctx, b, lt, F) {
    const A = STRATEGY;
    words(ctx, lead(b), { x: 540, y: 980, size: 96, font: F.sans, color: A.white, lt, glow: 30, gc: 'rgba(224,22,43,0.7)', maxW: 960 });
    words(ctx, b.data.keyword, { x: 540, y: 1140, size: 110, font: F.display, color: A.red, lt: lt - Math.max(0.3, kwAt(b)), stagger: 0.08, maxW: 960 });
  },
  'a-plain'(ctx, b, lt, F, env) {
    const A = STRATEGY;
    words(ctx, b.data.keyword, { x: 540, y: 700, size: 130, font: F.display, color: A.ink, lt, stagger: 0.07, maxW: 960 });
    words(ctx, lead(b) === b.data.keyword ? '' : lead(b), { x: 540, y: 820, size: 64, font: F.sans, color: A.ink, lt: lt - 0.1, maxW: 940 });
    if (b.data.element) objectImg(ctx, env, b.data.element, 540, 1150, 360 * outBack(prog(lt, 0.15, 0.4)));
  },
  'a-object'(ctx, b, lt, F, env) {
    const A = STRATEGY;
    words(ctx, lead(b), { x: 540, y: 760, size: 100, font: F.sans, color: A.white, lt, maxW: 960 });
    words(ctx, b.data.keyword, { x: 540, y: 950, size: 170, font: F.display, color: A.red, lt: lt - Math.max(0.15, kwAt(b)), stagger: 0.1, maxW: 980 });
    const e = outBack(prog(lt, 0, 0.4));
    objectImg(ctx, env, b.data.element, 540, 1260, 380 * lerp(0.8, 1, e), { alpha: clamp(e) });
  },
  'a-card'(ctx, b, lt, F) {
    const A = STRATEGY;
    // arco cinza deslizando
    ctx.save();
    ctx.strokeStyle = A.arc;
    ctx.lineWidth = 60;
    ctx.lineCap = 'round';
    ctx.translate(lerp(-300, 0, inOutCubic(prog(lt, 0, 0.8))), 0);
    ctx.beginPath();
    ctx.moveTo(-200, 300);
    ctx.quadraticCurveTo(560, 900, 1200, 1700);
    ctx.stroke();
    ctx.restore();
    // cartão cinza cai com o alfinete vermelho
    const e = outBack(prog(lt, 0, 0.5));
    ctx.save();
    ctx.translate(540, 940 + lerp(-500, 0, e));
    ctx.rotate(-0.035);
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = A.card;
    const w = 600;
    const h = 640;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, 14) : ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = A.red;
    ctx.beginPath();
    ctx.arc(0, -h / 2 - 6, 20, 0, Math.PI * 2);
    ctx.fill();
    noShadow(ctx);
    words(ctx, b.data.keyword, { x: 0, y: -h / 2 + 140, size: 110, font: F.sans, color: A.white, lt: lt - 0.2, maxW: 540 });
    const list = b.data.keys.filter((x) => x.toLowerCase() !== String(b.data.keyword).toLowerCase()).slice(0, 3);
    list.forEach((item, i) => words(ctx, item, { x: -w / 2 + 60, y: -h / 2 + 300 + i * 90, size: 56, font: F.sans, color: A.white, align: 'left', lt: lt - 0.35 - i * 0.12, maxW: 480 }));
    ctx.restore();
  },
  'a-brand'(ctx, b, lt, F) {
    const A = STRATEGY;
    words(ctx, b.data.keyword, { x: 540, y: 720, size: 150, font: F.display, color: A.purple, lt, stagger: 0.08, maxW: 960 });
    words(ctx, lead(b) === b.data.keyword ? '' : lead(b), { x: 540, y: 860, size: 88, font: F.sans, color: A.ink, lt: lt - 0.15, maxW: 960 });
  },
  'a-cta'(ctx, b, lt, F) {
    const A = STRATEGY;
    words(ctx, lead(b), { x: 540, y: 860, size: 96, font: F.sans, color: A.white, lt, maxW: 960 });
    words(ctx, b.data.keyword, { x: 540, y: 1000, size: 120, font: F.display, color: A.red, lt: lt - Math.max(0.3, kwAt(b)), stagger: 0.1, glow: 30, gc: 'rgba(224,22,43,0.7)', maxW: 960 });
  },
};
