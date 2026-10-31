// Estilos de motion desenhados em Canvas a partir dos vídeos de referência (além do
// "Explicativo" e do "Estratégia", em motionEngine.js). Mesma regra: cada cena é uma
// função pura do tempo — o mesmo código desenha a prévia (navegador) e o render (servidor).
//
//  - editorial: "Editorial P&B" — cinza-claro com vinheta, Montserrat, objeto em preto e
//    branco no meio, troca de frase com desfoque de foco, estrela cromada nos cantos,
//    alfinete azul, lista com estrelinhas e o fechamento no preto.
//  - bordo: "Itálico bordô" — branco com estrelas pretas curvas nos cantos, a frase pequena
//    digitada letra a letra (a letra nova entra no alto e desce), as palavras grandes em
//    itálico grosso bordô empilhadas, cenas pretas com manchas bordô e código de barras.
//  - cinema-escuro: "Cinema escuro" — fundo escuro, a frase anterior fica desfocada atrás da nova,
//    objetos flutuando fora de foco, brasas, risco azul atravessando a palavra, tarja branca,
//    barras de TV com o cartão do objeto e o letreiro em caixa alta com separação RGB.

import { wordRole } from './kinetic.js';
import { conceptsIn } from './sceneElements.js';

const BW = 1080;
const BH = 1920;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (lt, at, d) => clamp((lt - at) / d);
const lerp = (a, b, t) => a + (b - a) * t;
const outCubic = (t) => 1 - (1 - t) ** 3;
const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const outBack = (t) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
const clean = (w) => String(w?.word ?? '').trim();
const tidy = (s) => String(s).replace(/[.,;:!?…]+$/u, '');
const low = (s) => tidy(String(s || '')).toLowerCase();
const r2 = (v) => +Number(v).toFixed(2);
const txt = (ws) => tidy(ws.map(clean).join(' '));
// número pseudoaleatório estável (a prévia e o render desenham igual)
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Fontes destes estilos: [família, arquivo em server/assets/fonts]. */
export const STYLE_FONT_FILES = [
  ['RF Montserrat 700', 'Montserrat-Bold.ttf'],
  ['RF Montserrat 800', 'S-montserrat-800.ttf'],
  ['RF Poppins 400i', 'S-poppins-400i.ttf'],
  ['RF Poppins 900i', 'S-poppins-900i.ttf'],
];
const FM7 = 'RF Montserrat 700';
const FM8 = 'RF Montserrat 800';
const FPI = 'RF Poppins 400i';
const FPB = 'RF Poppins 900i';
const FI7 = 'RF Inter 700';
const FI9 = 'RF Inter 900';

export const STYLE_BEATS = {
  editorial: ['e-split', 'e-head', 'e-list', 'e-pin', 'e-word', 'e-end'],
  bordo: ['b-stack', 'b-object', 'b-under', 'b-dark'],
  'cinema-escuro': ['c-float', 'c-strike', 'c-embers', 'c-object', 'c-strip', 'c-bars', 'c-big'],
};
const DARK_BEATS = new Set(['e-end', 'b-dark', 'c-float', 'c-embers', 'c-object', 'c-strip', 'c-big']);

// ─────────────────────────────── planejamento ───────────────────────────────
const keysOf = (c) => c.filter((w, i) => wordRole(w, i, c) !== 'small' && !/\d/.test(clean(w)));

function pickType(style, { i, n, prev, used, keys, concept, k, len }) {
  const k0 = (_, r) => Math.ceil(len * r);
  const last = i === n - 1 && n >= 3;
  if (style === 'editorial') {
    if (i === 0) return concept ? 'e-split' : 'e-word';
    if (last) return 'e-end';
    // lista: frase que é quase só palavras fortes ("posts, orçamento, campanhas")
    if (keys.length >= 3 && keys.length >= k0(keys, 0.75) && !used.has('e-list')) return 'e-list';
    const rot = concept ? ['e-head', 'e-split', 'e-pin'] : ['e-pin', 'e-word'];
    const t = rot[k % rot.length];
    return t === prev ? rot[(k + 1) % rot.length] : t;
  }
  if (style === 'bordo') {
    if (i === 0) return 'b-stack';
    // a cada três frases, uma no preto (como a referência)
    if (i % 3 === 2 && prev !== 'b-dark') return 'b-dark';
    if (concept && prev !== 'b-object' && !used.has(`obj:${concept.element}`)) return 'b-object';
    return prev === 'b-under' ? 'b-stack' : keys.length >= 2 ? 'b-under' : 'b-stack';
  }
  // cinema
  if (i === 0) return 'c-float';
  if (last) return 'c-big';
  const rot = concept ? ['c-object', 'c-bars', 'c-strike', 'c-strip', 'c-embers'] : ['c-strike', 'c-embers', 'c-strip', 'c-float'];
  let t = rot[k % rot.length];
  if (t === prev) t = rot[(k + 1) % rot.length];
  return t;
}

/** Batidas de um destes estilos (uma por frase). */
export function styleBeatsFor(style, chunks) {
  const out = [];
  const used = new Set();
  let k = 0;
  chunks.forEach((c, i) => {
    const keys = keysOf(c);
    const concept = conceptsIn(c)[0] || null;
    const type = pickType(style, { i, n: chunks.length, prev: out[out.length - 1]?.type, used, keys, concept, k, len: c.length });
    if (i > 0) k += 1;
    used.add(type);
    if (concept) used.add(`obj:${concept.element}`);
    const big = keys.length ? keys[keys.length - 1] : c.reduce((a, b) => (clean(b).length > clean(a).length ? b : a));
    const idx = c.indexOf(big);
    out.push({ type, chunk: c, data: {
      text: txt(c), keyword: tidy(clean(big)), small: txt(c.slice(0, Math.max(0, idx))), after: txt(c.slice(idx + 1)),
      keys: keys.map((w) => tidy(clean(w))).slice(0, 4), element: concept?.element || null,
    } });
  });
  return out;
}

/** Sons de cada estilo (enxutos: ar na troca, batida na palavra, cliques na lista/digitação). */
export function styleSfx(style, beats) {
  const out = [];
  const add = (t, type, volume, why) => out.push({ t: r2(t), type, volume, why });
  beats.forEach((b, i) => {
    const kw = (b.words || []).find((w) => low(w.w) === low(b.data.keyword));
    if (style === 'editorial') {
      if (i) add(b.start, 'pr-air', 0.4, 'troca de foco');
      if (b.type === 'e-pin' && kw) add(kw.t + 0.1, 'pop', 0.5, 'alfinete');
      if (b.type === 'e-list') (b.words || []).filter((w) => b.data.keys.map(low).includes(low(w.w))).forEach((w) => add(w.t, 'click', 0.35, 'item'));
      if (b.type === 'e-end') add(b.start, 'pr-out', 0.6, 'fechamento');
    } else if (style === 'bordo') {
      if (i) add(b.start, b.type === 'b-dark' ? 'whoosh' : 'swoosh', 0.4, 'troca');
      if (b.type !== 'b-dark') add(b.start + 0.05, 'typing', 0.3, 'digitando');
      if (kw && kw.t - b.start > 0.2) add(kw.t, 'pr-hit', 0.45, 'palavra grande');
    } else {
      if (i) add(b.start, 'pr-air', 0.45, 'troca');
      if (b.type === 'c-strike' && kw) add(kw.t + 0.25, 'swipe', 0.45, 'risco');
      if (b.type === 'c-strip') add(b.start + 0.05, 'swoosh', 0.45, 'tarja');
      if (b.type === 'c-bars') add(b.start, 'glitch', 0.4, 'barras de TV');
      if (b.type === 'c-big') add(b.start, 'riser', 0.4, 'letreiro');
      if (kw && b.type !== 'c-bars' && kw.t - b.start > 0.2) add(kw.t, 'pr-hit', 0.4, 'palavra');
    }
  });
  return out;
}

// ─────────────────────────────── desenho comum ───────────────────────────────
let FOCUS = 0; // desfoque da troca de frase, somado ao de cada elemento
function setFilter(ctx, blur = 0, extra = '') {
  const b = FOCUS + blur;
  const f = [b > 0.05 ? `blur(${b.toFixed(2)}px)` : '', extra].filter(Boolean).join(' ');
  ctx.filter = f || 'none';
}

/** Palavras da batida com o instante (relativo) em que cada uma é falada. */
function beatWords(b) {
  const span = Math.max(0.6, (b.end - b.start) * 0.7);
  const ws = (b.words || []).length
    ? b.words.map((w) => ({ text: String(w.w), at: Math.max(0, Number(w.t) - b.start) }))
    : String(b.data.text || '').split(' ').filter(Boolean).map((text, i, all) => ({ text, at: (i / Math.max(1, all.length)) * span }));
  return ws;
}
function splitAtKey(b) {
  const ws = beatWords(b);
  const i = ws.findIndex((w) => low(w.text) === low(b.data.keyword));
  return i < 0 ? [ws.slice(0, -1), ws.slice(-1), []] : [ws.slice(0, i), [ws[i]], ws.slice(i + 1)];
}

function measure(ctx, text, size, font, ls = 0) {
  ctx.font = `${size}px "${font}"`;
  ctx.letterSpacing = `${ls * size}px`;
  const w = ctx.measureText(text).width;
  ctx.letterSpacing = '0px';
  return w;
}

/**
 * Uma linha de palavras centrada em (x, y), cada palavra entrando no instante falado
 * (desfoque + subida). Encolhe para caber em maxW. → { w, size }
 */
function line(ctx, items, lt, { x, y, size, font, color, maxW = 960, ls = -0.02, align = 'center', blurIn = 12, rise = 16, glow = null, rgb = false, alpha = 1, slide = 0 }) {
  if (!items.length) return { w: 0, size };
  const text = items.map((it) => it.text).join(' ');
  let s = size;
  const w0 = measure(ctx, text, s, font, ls);
  if (w0 > maxW) s = size * (maxW / w0);
  const space = measure(ctx, ' ', s, font, 0);
  const ws = items.map((it) => measure(ctx, it.text, s, font, ls));
  const total = ws.reduce((a, v) => a + v, 0) + space * (items.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  items.forEach((it, i) => {
    const e = outCubic(prog(lt, it.at - 0.04, 0.35));
    if (e > 0) {
      ctx.save();
      ctx.globalAlpha *= e * alpha;
      ctx.font = `${s}px "${font}"`;
      ctx.letterSpacing = `${ls * s}px`;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      const px = cx + (1 - e) * slide;
      const py = y + (1 - e) * rise;
      setFilter(ctx, (1 - e) * blurIn);
      if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 30; }
      if (rgb) {
        // separação RGB (aberração cromática) nos letreiros
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,40,40,0.55)';
        ctx.fillText(it.text, px - 4, py);
        ctx.fillStyle = 'rgba(40,200,255,0.55)';
        ctx.fillText(it.text, px + 4, py);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = typeof color === 'function' ? color(it, i) : color;
      ctx.fillText(it.text, px, py);
      ctx.restore();
    }
    cx += ws[i] + space;
  });
  return { w: total, size: s };
}

function objectImg(ctx, env, id, x, y, size, { alpha = 1, rot = 0, blur = 0, filter = '', shadow = 'rgba(0,0,0,0.3)' } = {}) {
  const img = id ? env.image?.(id) : null;
  if (!img || size <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  setFilter(ctx, blur, filter);
  if (shadow) { ctx.shadowColor = shadow; ctx.shadowBlur = 50; ctx.shadowOffsetY = 34; }
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}
const GRAY = 'grayscale(1) contrast(1.15) brightness(1.3)';
const STATUE = 'grayscale(1) contrast(1.6) brightness(0.62)';

/** Estrela de 4 pontas com lados curvos (côncavos). */
function starPath(ctx, x, y, s, rot = 0, pinch = 0.12, stretch = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(1, stretch);
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * pinch, -s * pinch, s, 0);
  ctx.quadraticCurveTo(s * pinch, s * pinch, 0, s);
  ctx.quadraticCurveTo(-s * pinch, s * pinch, -s, 0);
  ctx.quadraticCurveTo(-s * pinch, -s * pinch, 0, -s);
  ctx.closePath();
  ctx.restore();
}

function barcode(ctx, x, y, w, h, alpha = 1) {
  if (alpha <= 0) return;
  const bars = [3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 1, 2, 3, 1, 2, 4, 1, 1, 2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 2, 1, 3, 1];
  const total = bars.reduce((a, v) => a + v, 0) * 1.5;
  const u = w / total;
  ctx.save();
  ctx.globalAlpha *= alpha;
  setFilter(ctx, 0.6);
  ctx.fillStyle = '#111';
  let cx = x;
  bars.forEach((v, i) => { if (i % 2 === 0) ctx.fillRect(cx, y, v * u, h); cx += v * u * 1.5; });
  ctx.restore();
}

/**
 * Desenha a cena de um destes estilos no tempo t.
 * Troca de frase: desfoque de foco (sai desfocando, a próxima entra focando).
 */
export function drawStyle(ctx, scene, t, env) {
  const { W, H } = env;
  const k = Math.max(W / BW, H / BH);
  const beats = scene.beats;
  const bi = Math.max(0, beats.findLastIndex ? beats.findLastIndex((b) => t >= b.start) : beats.map((b) => t >= b.start).lastIndexOf(true));
  const beat = beats[bi] || beats[0];
  const lt = t - beat.start;
  const toEnd = beat.end - t;
  const style = scene.style;
  const fIn = 1 - outCubic(prog(lt, 0, style === 'bordo' ? 0.18 : 0.32));
  const fOut = bi < beats.length - 1 ? clamp(1 - toEnd / 0.22) : 0;
  FOCUS = (style === 'bordo' ? 10 : 18) * Math.max(fIn, fOut);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.fillStyle = DARK_BEATS.has(beat.type) ? '#000' : '#FFF';
  ctx.fillRect(0, 0, W, H);
  // empurrão lento da câmera em cada frase
  const push = lerp(1, style === 'cinema-escuro' ? 1.06 : 1.035, clamp(lt / Math.max(0.5, beat.end - beat.start)));
  ctx.translate(W / 2, H / 2);
  ctx.scale(k * push, k * push);
  ctx.translate(-BW / 2, -BH / 2);
  const draw = DRAW[style]?.[beat.type];
  if (draw) draw(ctx, beat, lt, env, bi);
  ctx.restore();
  FOCUS = 0;
}

// ─────────────────────────────── editorial (P&B) ───────────────────────────────
const ED = { bg: '#ECEBE7', ink: '#1E1E1E', grey: '#8B8B8B', soft: '#3A3A3A' };

function edBg(ctx, lt, idx, dark = false) {
  if (dark) {
    ctx.fillStyle = '#111';
    ctx.fillRect(-200, -200, BW + 400, BH + 400);
    const g = ctx.createRadialGradient(540, 960, 0, 540, 960, 1000);
    g.addColorStop(0, 'rgba(70,70,70,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-200, -200, BW + 400, BH + 400);
    return;
  }
  ctx.fillStyle = ED.bg;
  ctx.fillRect(-200, -200, BW + 400, BH + 400);
  const g = ctx.createRadialGradient(540, 900, 250, 540, 960, 1250);
  g.addColorStop(0, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(70,70,70,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(-200, -200, BW + 400, BH + 400);
  // grade bem fraca no meio
  ctx.save();
  setFilter(ctx);
  for (let x = 156; x <= 924; x += 96) {
    for (let y = 520; y <= 1400; y += 96) {
      const d = Math.hypot((x - 540) / 420, (y - 960) / 480);
      const a = clamp(1 - d) * 0.07;
      if (a <= 0.005) continue;
      ctx.strokeStyle = `rgba(0,0,0,${a.toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(x, y, 96, 96);
    }
  }
  ctx.setLineDash([]);
  ctx.restore();
  // estrelas cromadas nos cantos (giram devagar)
  chromeStar(ctx, 30, 40, 230, 0.35 + lt * 0.08 + idx * 0.2);
  chromeStar(ctx, 1070, 1890, 260, -0.2 - lt * 0.06 - idx * 0.15);
}

function chromeStar(ctx, x, y, s, rot) {
  ctx.save();
  setFilter(ctx);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
  const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s);
  g.addColorStop(0, '#FAFAFA');
  g.addColorStop(0.35, '#8E8E8E');
  g.addColorStop(0.5, '#F2F2F2');
  g.addColorStop(0.7, '#5A5A5A');
  g.addColorStop(1, '#D8D8D8');
  ctx.fillStyle = g;
  starPath(ctx, x, y, s, rot, 0.16);
  ctx.fill();
  ctx.restore();
}

/** Bloco "frase pequena em cima + palavra grande" (Montserrat), centrado em y. */
function edBlock(ctx, small, big, lt, y, { bigColor = ED.ink, bigSize = 118, smallSize = 50 } = {}) {
  if (small.length) line(ctx, small, lt, { x: 540, y: y - bigSize * 0.78, size: smallSize, font: FM7, color: ED.soft, maxW: 900, ls: -0.01 });
  if (big.length) line(ctx, big, lt, { x: 540, y, size: bigSize, font: FM8, color: bigColor, maxW: 960, ls: -0.025, blurIn: 18 });
}

function pushpin(ctx, x, y, e) {
  if (e <= 0) return;
  ctx.save();
  ctx.translate(x, y - (1 - e) * 220);
  ctx.globalAlpha *= clamp(e * 2);
  setFilter(ctx);
  ctx.rotate(0.12);
  ctx.strokeStyle = '#9A9A9A';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 50);
  ctx.stroke();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 8;
  const g = ctx.createLinearGradient(-26, -70, 26, 0);
  g.addColorStop(0, '#6FA2FF');
  g.addColorStop(1, '#1D4FD8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -8, 30, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-13, -60, 26, 52);
  ctx.beginPath();
  ctx.ellipse(0, -62, 24, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const ED_DRAW = {
  // frase em cima, objeto P&B no meio, o fim da frase embaixo em cinza
  'e-split'(ctx, b, lt, env, idx) {
    edBg(ctx, lt, idx);
    const [pre, key, post] = splitAtKey(b);
    const e = outCubic(prog(lt, 0.05, 0.6));
    objectImg(ctx, env, b.data.element, 540, 1010 - (1 - e) * 60, 640, { alpha: e, filter: GRAY });
    edBlock(ctx, pre, key, lt, 640);
    if (post.length) edBlock(ctx, post.slice(0, -1), post.slice(-1), lt, 1400, { bigColor: ED.grey });
  },
  // frase em cima e o objeto grande embaixo, saindo de uma névoa
  'e-head'(ctx, b, lt, env, idx) {
    edBg(ctx, lt, idx);
    const [pre, key, post] = splitAtKey(b);
    const e = outCubic(prog(lt, 0, 0.7));
    objectImg(ctx, env, b.data.element, 540, 1130 + (1 - e) * 80, 780, { alpha: e, filter: GRAY });
    // névoa na base do objeto
    const g = ctx.createRadialGradient(540, 1460, 30, 540, 1460, 460);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.globalAlpha = e;
    ctx.fillStyle = g;
    ctx.fillRect(0, 1000, BW, 900);
    ctx.restore();
    edBlock(ctx, pre, key.concat(post), lt, 600, { bigColor: ED.grey });
  },
  // lista com estrelinhas: cada item entra quando é falado; o objeto embaixo
  'e-list'(ctx, b, lt, env, idx) {
    edBg(ctx, lt, idx);
    const ws = beatWords(b);
    const items = (b.data.keys || []).slice(0, 4).map((kk, i) => ({ text: kk, at: ws.find((w) => low(w.text) === low(kk))?.at ?? 0.2 + i * 0.3 }));
    items.forEach((it, i) => {
      const e = outCubic(prog(lt, it.at - 0.04, 0.3));
      if (e <= 0) return;
      const y = 560 + i * 92;
      ctx.save();
      ctx.globalAlpha = e;
      ctx.fillStyle = ED.ink;
      setFilter(ctx, (1 - e) * 8);
      starPath(ctx, 300, y - 18, 20, 0.6, 0.1);
      ctx.fill();
      ctx.restore();
      line(ctx, [{ ...it, at: it.at }], lt, { x: 345, y, size: 54, font: FM7, color: ED.ink, align: 'left', maxW: 620 });
    });
    objectImg(ctx, env, b.data.element, 540, 1290, 640, { alpha: outCubic(prog(lt, 0.1, 0.5)), filter: GRAY });
  },
  // alfinete azul cai sobre a palavra; o resto da frase embaixo, em cinza
  'e-pin'(ctx, b, lt, env, idx) {
    edBg(ctx, lt, idx);
    const [pre, key, post] = splitAtKey(b);
    const ka = key[0]?.at ?? 0.2;
    if (b.data.element) objectImg(ctx, env, b.data.element, 540, 1300, 560, { alpha: outCubic(prog(lt, 0.15, 0.5)), filter: GRAY, blur: 2 });
    pushpin(ctx, 540, 770, outBack(prog(lt, ka + 0.05, 0.4)));
    if (pre.length) line(ctx, pre, lt, { x: 540, y: 700, size: 46, font: FM7, color: ED.soft, maxW: 860 });
    line(ctx, key, lt, { x: 540, y: 900, size: 124, font: FM8, color: ED.ink, maxW: 960, ls: -0.025, blurIn: 18 });
    if (post.length) line(ctx, post, lt, { x: 540, y: 975, size: 46, font: FM7, color: ED.grey, maxW: 860 });
  },
  // uma palavra enorme; as pequenas espalhadas em cima
  'e-word'(ctx, b, lt, env, idx) {
    edBg(ctx, lt, idx);
    const [pre, key, post] = splitAtKey(b);
    const small = pre.concat(post);
    small.forEach((it, i) => {
      const x = small.length === 1 ? 540 : lerp(250, 830, i / (small.length - 1));
      line(ctx, [it], lt, { x, y: 880, size: 34, font: FM7, color: ED.soft, maxW: 300 });
    });
    line(ctx, key, lt, { x: 540, y: 1010, size: 190, font: FM8, color: ED.ink, maxW: 980, ls: -0.03, blurIn: 22 });
  },
  // fechamento no preto: a palavra em branco e o resto da frase embaixo
  'e-end'(ctx, b, lt, env, idx) {
    edBg(ctx, lt, idx, true);
    const [pre, key, post] = splitAtKey(b);
    if (pre.length) line(ctx, pre, lt, { x: 540, y: 860, size: 46, font: FM7, color: '#CFCFCF', maxW: 860 });
    line(ctx, key, lt, { x: 540, y: 1000, size: 140, font: FM8, color: '#FFFFFF', maxW: 960, ls: 0.01, blurIn: 18 });
    if (post.length) line(ctx, post, lt, { x: 540, y: 1080, size: 42, font: FM7, color: '#BDBDBD', maxW: 860 });
  },
};

// ─────────────────────────────── bordô (itálico) ───────────────────────────────
const BO = { maroon: '#A23E3E', ink: '#151515' };

function boBg(ctx, lt, idx, dark = false) {
  ctx.save();
  setFilter(ctx);
  ctx.fillStyle = dark ? '#000' : '#FFF';
  ctx.fillRect(-200, -200, BW + 400, BH + 400);
  // estrelas curvas nos cantos (pretas no branco; bordô desfocadas no preto)
  const spots = [[1010, 150, 260], [70, 1800, 230], [1010, 1820, 200], [60, 120, 200]];
  const a = spots[idx % 2 ? 1 : 0];
  const bspot = spots[idx % 2 ? 2 : 3];
  const slide = 1 - outCubic(prog(lt, 0, 0.6));
  ctx.fillStyle = dark ? '#8B3434' : '#000';
  if (dark) setFilter(ctx, 50);
  // estrela alongada (uma ponta comprida), entrando pelo canto e girando devagar
  starPath(ctx, a[0] + slide * 220, a[1] - slide * 220, a[2], 0.5 + lt * 0.05, 0.05, 1.7);
  ctx.fill();
  starPath(ctx, bspot[0] - slide * 220, bspot[1] + slide * 220, bspot[2], -0.6 - lt * 0.04, 0.05, 1.7);
  ctx.fill();
  ctx.restore();
}

/**
 * Frase pequena digitada letra a letra (Poppins itálico): a letra nova aparece no alto,
 * menor, e desce para o lugar — como na referência ("A bra^n").
 */
function typed(ctx, items, lt, { x, y, size = 44, color = BO.ink, maxW = 940 }) {
  if (!items.length) return;
  const text = items.map((it) => it.text).join(' ');
  let s = size;
  const w0 = measure(ctx, text, s, FPI, 0);
  if (w0 > maxW) s = size * (maxW / w0);
  ctx.save();
  ctx.font = `${s}px "${FPI}"`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const total = ctx.measureText(text).width;
  let cx = x - total / 2;
  items.forEach((it, wi) => {
    const next = items[wi + 1]?.at ?? it.at + 0.45;
    const per = clamp((next - it.at) / Math.max(1, it.text.length + 1), 0.025, 0.07);
    const chars = [...(wi ? ` ${it.text}` : it.text)];
    chars.forEach((ch, j) => {
      const at = it.at + Math.max(0, j - (wi ? 1 : 0)) * per;
      const e = outCubic(prog(lt, at, 0.14));
      const cw = ctx.measureText(ch).width;
      if (e > 0 && ch !== ' ') {
        ctx.save();
        ctx.globalAlpha *= e;
        setFilter(ctx);
        ctx.fillStyle = color;
        ctx.translate(cx, y - (1 - e) * s * 0.42);
        const sc = lerp(0.7, 1, e);
        ctx.scale(sc, sc);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
      }
      cx += cw;
    });
  });
  ctx.restore();
}

/** Palavras grandes em itálico grosso bordô, empilhadas; letras entram uma a uma. */
function stack(ctx, items, lt, { x, y, size = 170, color = BO.maroon, maxW = 900, maxChars = 13 }) {
  if (!items.length) return;
  const lines = [];
  let cur = [];
  for (const it of items) {
    const t = cur.map((c) => c.text).concat(it.text).join(' ');
    if (cur.length && t.length > maxChars) { lines.push(cur); cur = []; }
    cur.push(it);
  }
  if (cur.length) lines.push(cur);
  const widest = Math.max(...lines.map((ln) => measure(ctx, ln.map((c) => c.text).join(' '), size, FPB, -0.045)));
  const s = widest > maxW ? size * (maxW / widest) : size;
  const lh = s * 0.84;
  const top = y - ((lines.length - 1) * lh) / 2;
  const shifts = [-40, 30, -10, 40];
  lines.forEach((ln, li) => {
    const text = ln.map((c) => c.text).join(' ');
    const w = measure(ctx, text, s, FPB, -0.045);
    let cx = x - w / 2 + shifts[li % shifts.length];
    const by = top + li * lh;
    ctx.save();
    ctx.font = `${s}px "${FPB}"`;
    ctx.letterSpacing = `${-0.045 * s}px`;
    ctx.textBaseline = 'alphabetic';
    ln.forEach((it, wi) => {
      const chars = [...(wi ? ` ${it.text}` : it.text)];
      chars.forEach((ch, j) => {
        const at = it.at + Math.max(0, j - (wi ? 1 : 0)) * 0.035;
        const e = outCubic(prog(lt, at - 0.03, 0.3));
        const cw = ctx.measureText(ch).width;
        if (e > 0 && ch !== ' ') {
          ctx.save();
          ctx.globalAlpha *= e;
          setFilter(ctx, (1 - e) * 10);
          ctx.fillStyle = color;
          ctx.fillText(ch, cx + (1 - e) * 14, by);
          ctx.restore();
        }
        cx += cw;
      });
    });
    ctx.restore();
  });
}

/** Divide a frase: o começo pequeno (digitado) e o resto grande. */
function boSplit(b) {
  const ws = beatWords(b);
  if (ws.length <= 2) return [ws.slice(0, 1), ws.slice(1)];
  const k = ws.findIndex((w) => low(w.text) === low(b.data.keyword));
  const cut = clamp(Math.min(k < 1 ? Math.ceil(ws.length * 0.45) : k, Math.ceil(ws.length * 0.6)), 1, ws.length - 1);
  return [ws.slice(0, cut), ws.slice(cut)];
}

const BO_DRAW = {
  // frase digitada em cima, as palavras grandes empilhadas por cima do objeto
  'b-stack'(ctx, b, lt, env, idx) {
    boBg(ctx, lt, idx);
    const [small, big] = boSplit(b);
    objectImg(ctx, env, b.data.element, 600, 1180, 760, { alpha: outCubic(prog(lt, 0, 0.5)), filter: STATUE, shadow: 'rgba(0,0,0,0.35)' });
    typed(ctx, small, lt, { x: 540, y: 420 });
    stack(ctx, big, lt, { x: 520, y: 640 });
  },
  // frase digitada e o objeto no centro, com o código de barras embaixo
  'b-object'(ctx, b, lt, env, idx) {
    boBg(ctx, lt, idx);
    const e = outBack(prog(lt, 0.05, 0.5));
    objectImg(ctx, env, b.data.element, 560, 980, 680 * clamp(e, 0, 1.2), { filter: STATUE, shadow: 'rgba(0,0,0,0.4)' });
    typed(ctx, beatWords(b), lt, { x: 540, y: 420 });
    barcode(ctx, 380, 1640, 320, 80, outCubic(prog(lt, 0.2, 0.4)));
  },
  // frase pequena, as grandes e o fim da frase pequeno embaixo; objeto na base
  'b-under'(ctx, b, lt, env, idx) {
    boBg(ctx, lt, idx);
    const [pre, key, post] = splitAtKey(b);
    objectImg(ctx, env, b.data.element, 540, 1460, 640, { alpha: outCubic(prog(lt, 0, 0.5)), filter: STATUE });
    typed(ctx, pre.length ? pre : key, lt, { x: 540, y: 600 });
    const big = pre.length ? key.concat(post.slice(0, 2)) : post.slice(0, 2);
    stack(ctx, big, lt, { x: 540, y: 820 });
    const rest = pre.length ? post.slice(2) : post.slice(2);
    if (rest.length) typed(ctx, rest, lt, { x: 480, y: 1060, size: 40 });
  },
  // no preto: frase pequena branca e o destaque bordô, com as manchas desfocadas
  'b-dark'(ctx, b, lt, env, idx) {
    boBg(ctx, lt, idx, true);
    const [small, big] = boSplit(b);
    typed(ctx, small, lt, { x: 540, y: 950, size: 46, color: '#FFFFFF' });
    stack(ctx, big, lt, { x: 540, y: 1040, size: 70, color: '#C04848', maxChars: 30 });
  },
};

// ─────────────────────────────── cinema (escuro) ───────────────────────────────
const CI = { white: '#F2F2F2', red: '#D3201F', blue: '#1E5BC8', grey: '#9A9A9A' };

function ciBg(ctx, { light = false, glow = 0.5 } = {}) {
  ctx.save();
  setFilter(ctx);
  if (light) {
    const g = ctx.createRadialGradient(540, 960, 80, 540, 960, 1150);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.5, '#E2E2E2');
    g.addColorStop(1, '#6E6E6E');
    ctx.fillStyle = g;
    ctx.fillRect(-200, -200, BW + 400, BH + 400);
  } else {
    ctx.fillStyle = '#070707';
    ctx.fillRect(-200, -200, BW + 400, BH + 400);
    const g = ctx.createRadialGradient(540, 980, 0, 540, 980, 1050);
    g.addColorStop(0, `rgba(60,60,64,${glow})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-200, -200, BW + 400, BH + 400);
  }
  ctx.restore();
}

/** Letreiro gigante só no contorno, passando devagar ao fundo. */
function outlineText(ctx, text, lt, y, { color = 'rgba(255,255,255,0.09)', size = 360 } = {}) {
  if (!text) return;
  ctx.save();
  setFilter(ctx, 1);
  ctx.font = `${size}px "${FI9}"`;
  ctx.letterSpacing = `${-0.04 * size}px`;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.textBaseline = 'alphabetic';
  ctx.strokeText(String(text).toLowerCase(), 40 - lt * 60, y);
  ctx.restore();
}

/** Brasas subindo (pontos laranja com brilho, posições fixas por índice). */
function embers(ctx, lt, n = 70) {
  ctx.save();
  for (let i = 0; i < n; i += 1) {
    const sp = 80 + rnd(i) * 160;
    const y = ((rnd(i + 7) * 2200 - lt * sp) % 2200 + 2200) % 2200 - 140;
    const x = rnd(i + 3) * BW + Math.sin(lt * 1.5 + i) * 18;
    const r = 1.5 + rnd(i + 11) * 3.5;
    const fl = 0.45 + 0.55 * Math.abs(Math.sin(lt * 6 + i * 1.7));
    ctx.globalAlpha = fl * (0.5 + rnd(i + 5) * 0.5);
    setFilter(ctx, rnd(i + 13) > 0.6 ? 2.5 : 0);
    ctx.shadowColor = '#FF7A1A';
    ctx.shadowBlur = 14;
    ctx.fillStyle = rnd(i + 17) > 0.5 ? '#FF8A2A' : '#FFC062';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Objetos flutuando fora de foco em profundidades diferentes. */
function floaters(ctx, env, ids, lt) {
  const spots = [[150, 330, 220, 7], [880, 560, 170, 9], [180, 1450, 260, 11], [900, 1300, 150, 6], [560, 240, 120, 12]];
  spots.forEach(([x, y, s, bl], i) => {
    const id = ids[i % ids.length];
    objectImg(ctx, env, id, x + Math.sin(lt * 0.8 + i) * 16, y + Math.cos(lt * 0.7 + i) * 20, s, { alpha: 0.55, blur: bl, shadow: null, rot: Math.sin(lt * 0.5 + i) * 0.1 });
  });
}

/** Barras de TV (SMPTE) com um leve tremido. */
function tvBars(ctx, lt) {
  const top = ['#C0C0C0', '#C0C000', '#00C0C0', '#00C000', '#C000C0', '#C00000', '#0000C0'];
  const mid = ['#0000C0', '#131313', '#C000C0', '#131313', '#00C0C0', '#131313', '#C0C0C0'];
  const jit = Math.sin(lt * 40) > 0.92 ? 10 : 0;
  ctx.save();
  setFilter(ctx);
  const w = BW / 7;
  top.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * w + jit, -100, w + 1, 1300); });
  mid.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * w + jit, 1200, w + 1, 160); });
  const g = ctx.createLinearGradient(0, 0, BW, 0);
  g.addColorStop(0, '#101010');
  g.addColorStop(1, '#E0E0E0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 1360, BW, 700);
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#000';
  ctx.fillRect(-100, -100, BW + 200, BH + 200);
  ctx.restore();
}

/** Linhas que trocam de foco: a anterior fica desfocada e apagada acima da nova. */
function focusLines(ctx, ws, lt, y, { size = 78, color = CI.white, red = null }) {
  const groups = [];
  let cur = [];
  for (const w of ws) {
    if (cur.length && cur.map((c) => c.text).concat(w.text).join(' ').length > 16) { groups.push(cur); cur = []; }
    cur.push(w);
  }
  if (cur.length) groups.push(cur);
  const active = Math.max(0, groups.map((g) => lt >= g[0].at - 0.05).lastIndexOf(true));
  groups.forEach((g, gi) => {
    if (gi < active - 1 || gi > active) return;
    const old = gi < active;
    const f = old ? outCubic(prog(lt, groups[active][0].at - 0.05, 0.3)) : 0;
    ctx.save();
    const bl = f * 10;
    const prevF = FOCUS;
    FOCUS += bl;
    line(ctx, g, lt, { x: 540, y: y - f * size * 1.1, size: size * lerp(1, 0.85, f), font: FI7, color: (it) => (red && low(it.text) === low(red) ? CI.red : color), maxW: 940, ls: -0.035, alpha: lerp(1, 0.4, f) });
    FOCUS = prevF;
    ctx.restore();
  });
}

const CI_DRAW = {
  // escuro, objetos flutuando fora de foco, letreiro de contorno; frases trocando de foco
  'c-float'(ctx, b, lt, env) {
    ciBg(ctx);
    outlineText(ctx, b.data.keyword, lt, 1100);
    floaters(ctx, env, [b.data.element || 'brain', 'gear', 'bulb'], lt);
    if (b.data.element) objectImg(ctx, env, b.data.element, 540, 1080, 260, { alpha: outCubic(prog(lt, 0.1, 0.5)), shadow: null });
    focusLines(ctx, beatWords(b), lt, 960, {});
  },
  // fundo claro com vinheta: a palavra é riscada por uma linha azul
  'c-strike'(ctx, b, lt) {
    ciBg(ctx, { light: true });
    const [pre, key, post] = splitAtKey(b);
    const head = pre.concat(post);
    if (head.length) line(ctx, head, lt, { x: 540, y: 880, size: 52, font: FI7, color: '#111', maxW: 860, ls: -0.03 });
    const r = line(ctx, key, lt, { x: 540, y: 1010, size: 140, font: FI9, color: '#111', maxW: 900, ls: -0.04 });
    const ka = key[0]?.at ?? 0.2;
    const e = inOutCubic(prog(lt, ka + 0.3, 0.35));
    if (e > 0) {
      ctx.save();
      setFilter(ctx);
      ctx.strokeStyle = CI.blue;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const x0 = 540 - r.w / 2 - 40;
      ctx.moveTo(x0, 1010 - r.size * 0.3);
      ctx.lineTo(x0 + (r.w + 80) * e, 1010 - r.size * 0.3);
      ctx.stroke();
      ctx.restore();
    }
  },
  // preto com brasas: a frase no centro
  'c-embers'(ctx, b, lt) {
    ciBg(ctx, { glow: 0.25 });
    embers(ctx, lt);
    focusLines(ctx, beatWords(b), lt, 980, { size: 92 });
  },
  // objeto em destaque no centro e a frase em vermelho por cima dele
  'c-object'(ctx, b, lt, env) {
    ciBg(ctx, { glow: 0.7 });
    const e = outBack(prog(lt, 0, 0.5));
    // holofote atrás do objeto
    const g = ctx.createRadialGradient(540, 1000, 0, 540, 1000, 520);
    g.addColorStop(0, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 400, BW, 1200);
    objectImg(ctx, env, b.data.element, 540, 1040, 560 * clamp(e, 0, 1.2), { shadow: 'rgba(0,0,0,0.6)' });
    line(ctx, beatWords(b), lt, { x: 540, y: 1000, size: 80, font: FI9, color: (it) => (low(it.text) === low(b.data.keyword) ? CI.red : CI.white), maxW: 920, ls: -0.04, glow: 'rgba(0,0,0,0.8)' });
  },
  // tarja branca atravessando a tela, com a frase em preto
  'c-strip'(ctx, b, lt, env) {
    ciBg(ctx, { glow: 0.6 });
    if (b.data.element) objectImg(ctx, env, b.data.element, 540, 1060, 460, { alpha: 0.9, shadow: 'rgba(0,0,0,0.6)' });
    const e = inOutCubic(prog(lt, 0, 0.35));
    ctx.save();
    setFilter(ctx);
    ctx.fillStyle = '#F4F4F4';
    ctx.fillRect(0, 900, BW * e, 120);
    ctx.restore();
    if (e > 0.6) line(ctx, beatWords(b), lt, { x: 540, y: 982, size: 64, font: FI7, color: '#111', maxW: 960, ls: -0.03, blurIn: 6, rise: 6 });
  },
  // barras de TV, letreiro de contorno e o cartão branco com o objeto
  'c-bars'(ctx, b, lt, env) {
    tvBars(ctx, lt);
    outlineText(ctx, b.data.keyword, lt, 1150, { color: 'rgba(255,255,255,0.35)', size: 400 });
    const e = outBack(prog(lt, 0.05, 0.45));
    ctx.save();
    ctx.translate(540, 940 + (1 - clamp(e)) * 300);
    ctx.rotate(-0.04);
    ctx.scale(clamp(e, 0, 1.1), clamp(e, 0, 1.1));
    setFilter(ctx);
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 20;
    ctx.fillStyle = '#F7F7F5';
    ctx.fillRect(-230, -290, 460, 580);
    ctx.restore();
    if (e > 0.3) objectImg(ctx, env, b.data.element, 540, 940 + (1 - clamp(e)) * 300, 360 * clamp(e, 0, 1.1), { shadow: 'rgba(0,0,0,0.25)' });
    line(ctx, beatWords(b), lt, { x: 540, y: 1420, size: 66, font: FI7, color: CI.white, maxW: 940, ls: -0.03, glow: 'rgba(0,0,0,0.9)' });
  },
  // letreiro: palavra pequena, a chave em CAIXA ALTA com separação RGB e o fim grande embaixo
  'c-big'(ctx, b, lt, env) {
    ciBg(ctx, { glow: 0.8 });
    // destroços flutuando fora de foco
    ctx.save();
    for (let i = 0; i < 26; i += 1) {
      const x = rnd(i) * BW + Math.sin(lt + i) * 20;
      const y = rnd(i + 40) * BH - lt * (20 + rnd(i + 9) * 40);
      ctx.globalAlpha = 0.35;
      setFilter(ctx, 2 + rnd(i + 3) * 6);
      ctx.fillStyle = '#8C8C8C';
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rnd(i + 5) * 6 + lt * 0.5);
      ctx.fillRect(-10, -5, 20 + rnd(i + 2) * 30, 10);
      ctx.restore();
    }
    ctx.restore();
    if (b.data.element) objectImg(ctx, env, b.data.element, 540, 1120, 360, { alpha: outCubic(prog(lt, 0.1, 0.5)), shadow: 'rgba(0,0,0,0.7)' });
    const [pre, key, post] = splitAtKey(b);
    if (pre.length) line(ctx, pre, lt, { x: 80, y: 520, size: 70, font: FI7, color: '#D8D8D8', align: 'left', maxW: 800, ls: -0.04 });
    line(ctx, key.map((w) => ({ ...w, text: w.text.toUpperCase() })), lt, { x: 540, y: 640, size: 130, font: FI9, color: '#E6E6E6', maxW: 1000, ls: -0.05, rgb: true });
    if (post.length) line(ctx, post, lt, { x: 540, y: 1560, size: 150, font: FI7, color: '#CFCFCF', maxW: 960, ls: -0.045, rgb: true });
  },
};

const DRAW = { editorial: ED_DRAW, bordo: BO_DRAW, 'cinema-escuro': CI_DRAW };
