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
  ['RF Garamond 400i', 'S-garamond-400i.ttf'],
  ['RF Barlow 900i', 'S-barlow-900i.ttf'],
  ['RF Garamond 700', 'S-garamond-700.ttf'],
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
  minimalista: ['mi-word', 'mi-card', 'mi-count', 'mi-list', 'mi-cta'],
  cinetico: ['cn-type', 'cn-slide', 'cn-rise', 'cn-box', 'cn-stripe'],
  bloco: ['bl-hit', 'bl-echo', 'bl-stripe', 'bl-slice'],
  marca: ['mk-intro', 'mk-card', 'mk-bars', 'mk-logo'],
  rolagem: ['rl-grid', 'rl-text'],
  azul: ['az-hero', 'az-badge', 'az-end'],
  colagem: ['cg-letter', 'cg-select', 'cg-circle', 'cg-number'],
};
const DARK_BEATS = new Set(['e-end', 'b-dark', 'c-float', 'c-embers', 'c-object', 'c-strip', 'c-big', 'mi-word', 'mi-count', 'mi-cta']);

// ─────────────────────────────── planejamento ───────────────────────────────
const keysOf = (c) => c.filter((w, i) => wordRole(w, i, c) !== 'small' && !/\d/.test(clean(w)));

function pickType(style, { i, n, prev, used, keys, concept, k, len, num }) {
  const k0 = (_, r) => Math.ceil(len * r);
  const last = i === n - 1 && n >= 3;
  if (style === 'bloco') return ['bl-hit', 'bl-echo', 'bl-stripe', 'bl-slice'][i % 4];
  if (style === 'marca') {
    if (i === 0) return 'mk-intro';
    if (last) return 'mk-logo';
    return k % 2 ? 'mk-bars' : 'mk-card';
  }
  if (style === 'rolagem') return num ? 'rl-grid' : 'rl-text';
  if (style === 'colagem') {
    if (num && !used.has('cg-number')) return 'cg-number';
    if (concept && prev !== 'cg-letter' && !used.has(`obj:${concept.element}`)) return k % 2 ? 'cg-circle' : 'cg-letter';
    return prev === 'cg-select' && concept ? 'cg-circle' : 'cg-select';
  }
  if (style === 'azul') {
    if (last) return 'az-end';
    if (num && !used.has('az-badge')) return 'az-badge';
    return 'az-hero';
  }
  if (style === 'cinetico') {
    if (last) return 'cn-stripe';
    return ['cn-type', 'cn-slide', 'cn-rise', 'cn-box', 'cn-slide'][i % 5];
  }
  if (style === 'minimalista') {
    if (i === 0) return 'mi-word';
    if (last) return 'mi-cta';
    if (keys.length >= 3 && !used.has('mi-list')) return 'mi-list';
    if (num && !used.has('mi-count')) return 'mi-count';
    return k % 2 ? 'mi-card' : 'mi-word';
  }
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
    const num = c.some((w) => /\d/.test(clean(w)));
    const type = pickType(style, { i, n: chunks.length, prev: out[out.length - 1]?.type, used, keys, concept, k, len: c.length, num });
    if (i > 0) k += 1;
    used.add(type);
    if (concept) used.add(`obj:${concept.element}`);
    const big = keys.length ? keys[keys.length - 1] : c.reduce((a, b) => (clean(b).length > clean(a).length ? b : a));
    const idx = c.indexOf(big);
    out.push({ type, chunk: c, data: {
      text: txt(c), keyword: tidy(clean(big)), small: txt(c.slice(0, Math.max(0, idx))), after: txt(c.slice(idx + 1)),
      keys: keys.map((w) => tidy(clean(w))).slice(0, 4), element: concept?.real || concept?.element || null,
      objWord: concept ? tidy(clean(concept.word)) : null,
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
    } else if (style === 'minimalista') {
      // sons do kit minimalista (sfx.js): ar leve na troca de cartão/lista, tique na palavra e na opção,
      // pop de vidro na pílula, subida + tiques + sino no contador
      if (i) add(b.start, b.type === 'mi-card' || b.type === 'mi-list' ? 'mi-air' : 'mi-tick', 0.3, 'troca');
      if (b.type === 'mi-word' && kw) add(kw.t, 'mi-pop', 0.5, 'palavra-chave');
      if (b.type === 'mi-cta' && kw) add(kw.t, 'mi-shine', 0.5, 'botão');
      if (b.type === 'mi-card') add(b.start + 0.05, 'mi-tick', 0.3, 'cartão');
      if (b.type === 'mi-list') (b.data.keys || []).forEach((kk, j) => {
        const w = (b.words || []).find((x) => low(x.w) === low(kk));
        add(w ? w.t : b.start + 0.3 + j * 0.4, 'mi-tick', 0.35, 'opção');
      });
      if (b.type === 'mi-count') {
        add(b.start, 'mi-rise', 0.4, 'contador');
        for (let j = 1; j <= 5; j += 1) add(b.start + 0.15 + j * 0.1, 'mi-tick', 0.3, 'barra');
        add(b.start + 0.9, 'mi-ding', 0.45, 'resultado');
      }
    } else if (style === 'cinetico') {
      // sons do kit cinético: tecla na digitação, ar na panorâmica, pop na palavra, impacto na entrada,
      // varredura na caixa e na faixa de transição
      if (b.type === 'cn-type') (b.words || []).forEach((w) => add(w.t, 'cn-key', 0.3, 'digitação'));
      if (b.type === 'cn-slide') { add(b.start, 'cn-whoosh', 0.5, 'panorâmica'); if (kw) add(kw.t, 'cn-pop', 0.4, 'palavra'); }
      if (b.type === 'cn-rise') { add(b.start, 'cn-impact', 0.4, 'entrada'); if (kw) add(kw.t, 'cn-pop', 0.4, 'palavra'); }
      if (b.type === 'cn-box' && kw) add(kw.t - 0.05, 'cn-swipe', 0.45, 'caixa');
      if (b.type === 'cn-stripe') { add(b.start, 'cn-swipe', 0.5, 'faixa'); add(b.start + 0.3, 'cn-impact', 0.45, 'revelação'); }
    } else if (style === 'bloco') {
      // blocos: impacto ao cair o bloco, tiras no corte, varredura da faixa e do bloco branco
      if (b.type === 'bl-hit') { add(b.start, 'bk-hit', 0.6, 'bloco'); if (kw) add(kw.t, 'bk-swipe', 0.4, 'palavra'); }
      if (b.type === 'bl-echo') { add(b.start, 'bk-slice', 0.4, 'repetição'); (b.words || []).forEach((w) => add(w.t, 'bk-slice', 0.2, 'eco')); }
      if (b.type === 'bl-stripe') add(b.start, 'bk-swipe', 0.5, 'faixa');
      if (b.type === 'bl-slice') for (let j = 0; j < 6; j += 1) add(b.start + j * 0.03, 'bk-slice', 0.35, 'tira');
    } else if (style === 'marca') {
      // cartão e barras: deslize suave e tique; logo: sino ao aparecer a palavra
      if (b.type === 'mk-card' || b.type === 'mk-intro') add(b.start + 0.05, 'mk-card', 0.4, 'cartão');
      if (b.type === 'mk-bars') for (let j = 0; j < 5; j += 1) add(b.start + 0.1 + j * 0.12, 'rl-tick', 0.3, 'barra');
      if (b.type === 'mk-logo' && kw) add(kw.t, 'mk-chime', 0.45, 'logo');
    } else if (style === 'colagem') {
      // colagem: varrida das manchas na troca, pop do objeto, clique do cursor, traço da caneta, número
      if (i) add(b.start, 'cg-whoosh', 0.45, 'manchas');
      if (b.type === 'cg-letter' && kw) add(kw.t + 0.15, 'cg-pop', 0.5, 'objeto na letra');
      if (b.type === 'cg-select' && kw) add(kw.t, 'cg-click', 0.55, 'clique');
      if (b.type === 'cg-circle') { add(b.start + 0.1, 'cg-pop', 0.45, 'círculo'); if (kw) add(kw.t + 0.25, 'cg-pen', 0.4, 'caneta'); }
      if (b.type === 'cg-number') {
        const target = rollTarget(b);
        const n = Math.min(16, target);
        for (let k2 = 1; k2 <= n; k2 += 1) { const j = Math.round((k2 * target) / n); add(b.start + 0.1 + rollDur(b) * (1 - (1 - j / target) ** (1 / 3)), 'rl-tick', 0.3, 'contagem'); }
        add(b.start + 0.1 + rollDur(b), 'cg-ding', 0.5, 'número');
      }
    } else if (style === 'azul') {
      // destaque azul: tique ao surgir a palavra-chave, traço do sublinhado, sino no selo, sinal final
      if (b.type === 'az-hero' && kw) { add(kw.t, 'az-pop', 0.5, 'destaque'); add(kw.t + 0.12, 'az-stroke', 0.35, 'sublinhado'); }
      if (b.type === 'az-badge') add(b.start + 0.05, 'az-ding', 0.5, 'número');
      if (b.type === 'az-end') add(b.start + 0.05, 'az-end', 0.5, 'final');
    } else if (style === 'rolagem') {
      // odômetro: um tique mecânico a cada passo do número
      // um tique por passo do contador (até 24), mais rápido no começo e freando no fim
      if (b.type === 'rl-grid') {
        const target = rollTarget(b);
        const n = Math.min(24, target);
        for (let k = 1; k <= n; k += 1) {
          const j = Math.round((k * target) / n);
          add(b.start + 0.1 + rollDur(b) * (1 - (1 - j / target) ** (1 / 3)), 'rl-tick', 0.35, 'rolagem');
        }
      }
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
  const cam = CAM_STYLES.has(style) ? camFor(CN_CAM[beat.type] || 'drift', lt, beat.end - beat.start) : null;
  if (cam) FOCUS += cam.blur;
  const push = cam ? cam.s : lerp(1, style === 'cinema-escuro' ? 1.06 : 1.035, clamp(lt / Math.max(0.5, beat.end - beat.start)));
  ctx.translate(W / 2 + (cam ? cam.tx * k : 0), H / 2 + (cam ? cam.ty * k : 0));
  if (cam && cam.rot) ctx.rotate(cam.rot);
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

// ─────────────────────────────── minimalista (cards e palavras) ───────────────────────────────
// Estilo das referências "limpas": palavra por palavra no ritmo da fala (~0,27 s), a palavra-chave
// dentro de uma pílula azul que estoura no instante em que é dita, cartão branco que sobe com
// leve inclinação, lista de opções, contador com barras e um fechamento com botão. Fundo navy com
// manchas suaves ou branco; colchetes finos nos cantos. Sons só nos pontos certos (ver styleSfx).
const MI = { navy: '#0A1B3D', navy2: '#050C1F', blue: '#2F6BFF', ink: '#0E1A33', line: '#E3E8F2', white: '#FFFFFF' };
const roundRectPath = (ctx, x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };

function miBg(ctx, dark, lt) {
  ctx.save();
  setFilter(ctx);
  if (dark) {
    const g = ctx.createLinearGradient(0, 0, 0, BH);
    g.addColorStop(0, MI.navy);
    g.addColorStop(1, MI.navy2);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = '#F5F7FB';
  }
  ctx.fillRect(-200, -200, BW + 400, BH + 400);
  // manchas suaves que deslizam devagar (a textura de fundo das referências)
  const blobs = dark
    ? [[860, 320, 380, 'rgba(47,107,255,0.30)'], [160, 1560, 420, 'rgba(47,107,255,0.18)']]
    : [[900, 240, 360, 'rgba(47,107,255,0.10)'], [120, 1700, 420, 'rgba(47,107,255,0.08)']];
  for (const [x, y, r, c] of blobs) {
    const dx = Math.sin(lt * 0.4 + x) * 30;
    const dy = Math.cos(lt * 0.3 + y) * 30;
    const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
    g.addColorStop(0, c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-200, -200, BW + 400, BH + 400);
  }
  // colchetes finos nos cantos
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(14,26,51,0.25)';
  ctx.lineWidth = 3;
  const c = 70;
  const m = 60;
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [BW - m, m, -1, 1], [m, BH - m, 1, -1], [BW - m, BH - m, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x, y + sy * c);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * c, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Quebra uma lista de palavras em linhas de até maxChars letras (sem cortar palavra). */
function miLines(items, maxChars) {
  const out = [];
  let cur = [];
  for (const it of items) {
    const len = cur.map((c) => c.text).concat(it.text).join(' ').length;
    if (cur.length && len > maxChars) { out.push(cur); cur = []; }
    cur.push(it);
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Palavra-chave numa pílula que estoura no instante em que é falada (o texto entra palavra a
 * palavra por cima). Devolve o tamanho usado. `pulse` = respiração suave depois de entrar.
 */
function miPill(ctx, items, lt, { y, size = 150, fill = MI.blue, color = MI.white, at = 0.2, pulse = 0, glow = 'rgba(47,107,255,0.45)' }) {
  const text = items.map((x) => x.text).join(' ');
  let s = size;
  let w = measure(ctx, text, s, FI9, -0.03);
  if (w > 860) { s *= 860 / w; w = 860; }
  const ph = s * 1.32;
  const pw = w + s * 0.9;
  const e = clamp(outBack(prog(lt, at - 0.05, 0.32)));
  const k = pulse ? 1 + pulse * Math.sin(lt * 4) * clamp(prog(lt, at + 0.3, 0.3)) : 1;
  ctx.save();
  ctx.translate(540, y);
  ctx.scale(lerp(0.6, 1, e) * k, lerp(0.6, 1, e) * k);
  ctx.globalAlpha = clamp(e * 1.4);
  setFilter(ctx);
  ctx.shadowColor = glow;
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = fill;
  roundRectPath(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2);
  ctx.fill();
  ctx.restore();
  line(ctx, items, lt, { x: 540, y: y + s * 0.36, size: s, font: FI9, color, maxW: 860, ls: -0.03, blurIn: 14, rise: 12 });
  return s;
}

const miWhiteSoft = 'rgba(255,255,255,0.78)';

const MI_DRAW = {
  // palavra-chave na pílula azul; a frase de apoio em cima e o fim da frase embaixo
  'mi-word'(ctx, b, lt, env) {
    miBg(ctx, true, lt);
    const [pre, key, post] = splitAtKey(b);
    const kt = key[0]?.at ?? 0.2;
    miLines(pre, 22).forEach((ln, i) => line(ctx, ln, lt, { x: 540, y: 620 + i * 92, size: 64, font: FI7, color: miWhiteSoft, maxW: 900, ls: -0.02, blurIn: 10, rise: 14 }));
    if (b.data.element) objectImg(ctx, env, b.data.element, 820, 380, 300, { alpha: outCubic(prog(lt, 0.1, 0.4)), shadow: 'rgba(0,0,0,0.4)' });
    miPill(ctx, key, lt, { y: 1000, size: 150, at: kt });
    miLines(post, 26).forEach((ln, i) => line(ctx, ln, lt, { x: 540, y: 1200 + i * 92, size: 64, font: FI7, color: miWhiteSoft, maxW: 900, ls: -0.02 }));
  },
  // cartão branco que sobe inclinado e assenta; as palavras aparecem dentro dele
  'mi-card'(ctx, b, lt, env) {
    miBg(ctx, false, lt);
    const all = beatWords(b);
    const kw = low(b.data.keyword);
    const e = clamp(outBack(prog(lt, 0, 0.5)));
    const cw = 860;
    const ch = 1000;
    ctx.save();
    ctx.translate(540, 960 + (1 - e) * 420);
    ctx.rotate(lerp(0.08, -0.02, e));
    ctx.scale(lerp(0.92, 1, e), lerp(0.92, 1, e));
    ctx.globalAlpha = clamp(e * 1.5);
    setFilter(ctx);
    ctx.shadowColor = 'rgba(14,26,51,0.22)';
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 26;
    ctx.fillStyle = MI.white;
    roundRectPath(ctx, -cw / 2, -ch / 2, cw, ch, 56);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    // cabeçalho do cartão: avatar e duas barras (como um post)
    ctx.fillStyle = MI.blue;
    ctx.beginPath();
    ctx.arc(-cw / 2 + 100, -ch / 2 + 100, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = MI.line;
    roundRectPath(ctx, -cw / 2 + 170, -ch / 2 + 84, 300, 22, 11);
    ctx.fill();
    roundRectPath(ctx, -cw / 2 + 170, -ch / 2 + 122, 200, 18, 9);
    ctx.fill();
    miLines(all, 20).forEach((ln, i) => line(ctx, ln, lt, {
      x: 0, y: -ch / 2 + 290 + i * 118, size: 82, font: FI9, maxW: 740, ls: -0.03,
      color: (it) => (low(it.text) === kw ? MI.blue : MI.ink),
    }));
    if (b.data.element) objectImg(ctx, env, b.data.element, 0, ch / 2 - 190, 260, { alpha: outCubic(prog(lt, 0.25, 0.4)), shadow: 'rgba(0,0,0,0.15)' });
    ctx.restore();
  },
  // contador de números com barras que crescem; a frase embaixo
  'mi-count'(ctx, b, lt, env) {
    miBg(ctx, true, lt);
    const m = String(b.data.text || '').match(/\d[\d.,]*/);
    const n = m ? Number(m[0].replace(/\./g, '').replace(',', '.')) : 100;
    const target = Number.isFinite(n) && n > 0 ? n : 100;
    const shown = Math.round(target * outCubic(prog(lt, 0.05, 1.0)));
    ctx.save();
    setFilter(ctx);
    ctx.fillStyle = MI.white;
    ctx.font = `260px "${FI9}"`;
    ctx.letterSpacing = '-8px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(shown.toLocaleString('pt-BR'), 540, 840);
    ctx.restore();
    [0.32, 0.48, 0.4, 0.7, 1.0].forEach((h, i) => {
      const e = clamp(outBack(prog(lt, 0.15 + i * 0.1, 0.5)));
      if (e <= 0) return;
      const x = 540 + (i - 2) * 170;
      ctx.save();
      setFilter(ctx);
      ctx.fillStyle = i === 4 ? MI.white : MI.blue;
      const bh = 380 * h * e;
      roundRectPath(ctx, x - 55, 1220 - bh, 110, bh, 28);
      ctx.fill();
      ctx.restore();
    });
    miLines(beatWords(b), 26).forEach((ln, i) => line(ctx, ln, lt, { x: 540, y: 1420 + i * 92, size: 64, font: FI7, color: miWhiteSoft, maxW: 900, ls: -0.02 }));
  },
  // opções em linhas brancas (A, B, C): cada uma entra quando é falada
  'mi-list'(ctx, b, lt, env) {
    miBg(ctx, false, lt);
    const [pre] = splitAtKey(b);
    miLines(pre.length ? pre : beatWords(b).slice(0, 4), 24).forEach((ln, i) => line(ctx, ln, lt, { x: 540, y: 560 + i * 90, size: 72, font: FI9, color: MI.ink, maxW: 900, ls: -0.03 }));
    const ws = beatWords(b);
    const items = (b.data.keys || []).slice(0, 3).map((kk, i) => ({ text: kk, at: ws.find((w) => low(w.text) === low(kk))?.at ?? 0.3 + i * 0.4 }));
    items.forEach((it, i) => {
      const e = clamp(outCubic(prog(lt, it.at - 0.05, 0.4)));
      if (e <= 0) return;
      const y = 900 + i * 220;
      ctx.save();
      ctx.translate(540 + (1 - e) * 240, y);
      ctx.globalAlpha = clamp(e * 1.2);
      setFilter(ctx);
      ctx.shadowColor = 'rgba(14,26,51,0.12)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = MI.white;
      roundRectPath(ctx, -430, -85, 860, 170, 42);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = MI.blue;
      ctx.beginPath();
      ctx.arc(-345, 0, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = MI.white;
      ctx.font = `56px "${FI9}"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String.fromCharCode(65 + i), -345, 2);
      line(ctx, [{ text: it.text, at: it.at }], lt, { x: -255, y: 20, size: 60, font: FI7, color: MI.ink, align: 'left', maxW: 660, ls: -0.02 });
      ctx.restore();
    });
  },
  // fechamento no navy: a palavra final vira um botão branco que pulsa de leve
  'mi-cta'(ctx, b, lt, env) {
    miBg(ctx, true, lt);
    const [pre, key, post] = splitAtKey(b);
    const kt = key[0]?.at ?? 0.2;
    miLines(pre, 22).forEach((ln, i) => line(ctx, ln, lt, { x: 540, y: 760 + i * 92, size: 64, font: FI7, color: miWhiteSoft, maxW: 900, ls: -0.02 }));
    miPill(ctx, key, lt, { y: 960, size: 150, at: kt, fill: MI.white, color: MI.navy, pulse: 0.03, glow: 'rgba(255,255,255,0.35)' });
    miLines(post, 26).forEach((ln, i) => line(ctx, ln, lt, { x: 540, y: 1140 + i * 92, size: 64, font: FI7, color: miWhiteSoft, maxW: 900, ls: -0.02 }));
  },
};

// ─────────────────────────────── cinético (letras e câmera) ───────────────────────────────
// Letras animadas (máquina de escrever com cursor, letra que sobe com desfoque, letra que desliza
// com rastro, caixa colorida atrás da palavra-chave) e movimentos de câmera (zoom, panorâmica
// rápida com desfoque, tremor, zoom de saída, faixa diagonal de transição). Fundo muda de cor a
// cada cena (claro, verde, laranja, escuro, gradiente), como nas referências.
const CN_BG = ['#F7F7F4', '#0E7C62', '#FF8A1F', '#0B0B12', 'grad'];
const CN_CAM = { 'cn-type': 'push', 'cn-slide': 'whip', 'cn-rise': 'shake', 'cn-box': 'pull', 'cn-stripe': 'drift', 'bl-hit': 'pull', 'bl-echo': 'push', 'bl-stripe': 'shake', 'bl-slice': 'whip', 'mk-intro': 'push', 'mk-card': 'drift', 'mk-bars': 'pull', 'mk-logo': 'shake', 'cg-letter': 'push', 'cg-select': 'drift', 'cg-circle': 'pull', 'cg-number': 'push' };
const CAM_STYLES = new Set(['cinetico', 'bloco', 'marca', 'colagem']);
const cnDark = (bg) => bg === '#0B0B12' || bg === 'grad' || bg === '#0E7C62';
const cnInk = (bg) => (cnDark(bg) ? '#FFFFFF' : '#111111');

/** Movimento da câmera no tempo lt (s) de uma cena de duração dur: escala, deslocamento, giro, desfoque. */
function camFor(model, lt, dur) {
  const p = clamp(lt / Math.max(0.5, dur));
  if (model === 'push') return { s: lerp(1, 1.09, p), tx: 0, ty: 0, rot: 0, blur: 0 };
  if (model === 'pull') return { s: lerp(1.09, 1, p), tx: 0, ty: 0, rot: 0, blur: 0 };
  if (model === 'whip') { const w = 1 - outCubic(clamp(lt / 0.32)); return { s: 1, tx: w * BW * 0.4, ty: 0, rot: 0, blur: 14 * w }; }
  if (model === 'shake') return { s: 1.04, tx: Math.sin(lt * 23) * 7, ty: Math.cos(lt * 19) * 7, rot: Math.sin(lt * 9) * 0.006, blur: 0 };
  return { s: 1 + 0.02 * p, tx: 0, ty: 0, rot: 0, blur: 0 };
}

/** Fundo da cena (cor da lista pelo índice da cena, ou uma cor fixa). */
function cnBg(ctx, bi, force = null) {
  const c = force || CN_BG[bi % CN_BG.length];
  ctx.save();
  setFilter(ctx);
  if (c === 'grad') {
    const g = ctx.createLinearGradient(0, 0, BW, BH);
    g.addColorStop(0, '#6A11CB');
    g.addColorStop(0.55, '#1B0F3A');
    g.addColorStop(1, '#00E5B0');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = c;
  }
  ctx.fillRect(-200, -200, BW + 400, BH + 400);
  ctx.restore();
  return c;
}

/**
 * Texto letra a letra. fx: 'type' (aparece de uma vez, com cursor piscando), 'rise' (sobe com
 * desfoque), 'slide' (desliza de lado com rastro), 'pop' (estoura). `stagger` = intervalo entre
 * letras (s). `box` = caixa colorida atrás da palavra {word, fill, text} que desliza da esquerda.
 */
function fxLine(ctx, items, lt, { y, size, font = FI9, color = '#111111', fx = 'rise', maxW = 940, ls = -0.03, stagger = 0.05, box = null, cursor = false }) {
  if (!items.length) return;
  const text = items.map((it) => it.text).join(' ');
  let s = size;
  const w0 = measure(ctx, text, s, font, ls);
  if (w0 > maxW) s *= maxW / w0;
  const spaceW = measure(ctx, ' ', s, font, 0);
  const letters = [];
  let cx = 0;
  items.forEach((it, wi) => {
    [...it.text].forEach((ch, j) => {
      const w = measure(ctx, ch, s, font, ls);
      letters.push({ ch, x: cx, w, at: it.at + j * stagger, wi, word: low(it.text) });
      cx += w;
    });
    cx += spaceW;
  });
  const total = cx - spaceW;
  const x0 = 540 - total / 2;
  if (box) {
    const hit = letters.filter((L) => L.word === box.word);
    if (hit.length) {
      const first = hit[0];
      const last = hit[hit.length - 1];
      const e = outCubic(prog(lt, first.at - 0.05, 0.25));
      if (e > 0) {
        const pad = s * 0.18;
        ctx.save();
        setFilter(ctx);
        ctx.fillStyle = box.fill;
        roundRectPath(ctx, x0 + first.x - pad, y - s * 0.95, (last.x + last.w - first.x + pad * 2) * e, s * 1.2, s * 0.22);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  const lastAt = letters.length ? letters[letters.length - 1].at : 0;
  let visible = 0;
  for (const L of letters) {
    const t = lt - L.at;
    const hot = box && L.word === box.word;
    ctx.save();
    ctx.font = `${s}px "${font}"`;
    ctx.letterSpacing = `${ls * s}px`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = hot ? box.text : color;
    const px = x0 + L.x;
    if (fx === 'type') {
      if (t < 0) { ctx.restore(); continue; }
      visible += 1;
      setFilter(ctx);
      ctx.fillText(L.ch, px, y);
    } else if (fx === 'rise') {
      const e = outCubic(prog(lt, L.at, 0.3));
      if (e <= 0) { ctx.restore(); continue; }
      ctx.globalAlpha *= e;
      setFilter(ctx, (1 - e) * 12);
      ctx.fillText(L.ch, px, y + (1 - e) * s * 0.42);
    } else if (fx === 'slide') {
      const e = outCubic(prog(lt, L.at, 0.28));
      if (e <= 0) { ctx.restore(); continue; }
      const dx = (1 - e) * s * 0.9 * (L.wi % 2 ? 1 : -1);
      ctx.globalAlpha *= e * 0.35; // rastro do movimento
      setFilter(ctx, 8);
      ctx.fillText(L.ch, px + dx * 1.7, y);
      ctx.globalAlpha = e;
      setFilter(ctx, (1 - e) * 6);
      ctx.fillText(L.ch, px + dx, y);
    } else {
      if (t < 0) { ctx.restore(); continue; }
      const e = clamp(outBack(prog(lt, L.at, 0.3)));
      ctx.translate(px + L.w / 2, y);
      ctx.scale(e, e);
      setFilter(ctx);
      ctx.fillText(L.ch, -L.w / 2, 0);
    }
    ctx.restore();
  }
  if (cursor && visible > 0 && lt <= lastAt + 1.8 && Math.floor(lt * 3) % 2 === 0) {
    const last = letters[visible - 1];
    ctx.save();
    setFilter(ctx);
    ctx.fillStyle = color;
    ctx.fillRect(x0 + last.x + last.w + s * 0.04, y - s * 0.82, Math.max(4, s * 0.07), s * 0.92);
    ctx.restore();
  }
}

/** Frase em linhas (sem cortar palavra): cada linha com letras animadas; o cursor fica só na última. */
function cnBlock(ctx, items, lt, opts) {
  const maxChars = Math.max(8, Math.floor(980 / (opts.size * 0.52)));
  const groups = miLines(items, maxChars);
  const n = groups.length;
  groups.forEach((g, i) => fxLine(ctx, g, lt, { ...opts, cursor: Boolean(opts.cursor) && i === n - 1, y: opts.y + (i - (n - 1) / 2) * opts.size * 1.08 }));
}

const CN_DRAW = {
  // máquina de escrever com cursor (como "Make it you|")
  'cn-type'(ctx, b, lt, env, bi) {
    const bg = cnBg(ctx, bi);
    cnBlock(ctx, beatWords(b), lt, { y: 960, size: 150, color: cnInk(bg), fx: 'type', cursor: true, stagger: 0.09, maxW: 980 });
  },
  // palavras deslizam de lado com rastro (panorâmica rápida)
  'cn-slide'(ctx, b, lt, env, bi) {
    const bg = cnBg(ctx, bi);
    cnBlock(ctx, beatWords(b), lt, { y: 900, size: 170, color: cnInk(bg), fx: 'slide', stagger: 0.03, maxW: 980 });
  },
  // letras sobem uma a uma com desfoque; o assunto da fala aparece em cima
  'cn-rise'(ctx, b, lt, env, bi) {
    const bg = cnBg(ctx, bi);
    if (b.data.element) objectImg(ctx, env, b.data.element, 540, 470, 420, { alpha: outCubic(prog(lt, 0.1, 0.5)), shadow: 'rgba(0,0,0,0.25)' });
    cnBlock(ctx, beatWords(b), lt, { y: 1180, size: 130, color: cnInk(bg), fx: 'rise', stagger: 0.045, maxW: 980 });
  },
  // a palavra-chave dentro de uma caixa colorida que desliza da esquerda
  'cn-box'(ctx, b, lt, env, bi) {
    const bg = cnBg(ctx, bi);
    cnBlock(ctx, beatWords(b), lt, { y: 960, size: 120, color: cnInk(bg), fx: 'pop', stagger: 0.05, maxW: 980, box: { word: low(b.data.keyword), fill: '#0E7C62', text: '#FFFFFF' } });
  },
  // faixa diagonal que varre a tela e revela a frase sobre o fundo escuro
  'cn-stripe'(ctx, b, lt, env, bi) {
    cnBg(ctx, bi, '#0B0B12');
    const sweep = clamp(lt / 0.4);
    if (sweep < 1) {
      ctx.save();
      setFilter(ctx);
      ctx.fillStyle = '#FFFFFF';
      ctx.translate(540, 960);
      ctx.rotate(-0.5);
      ctx.fillRect(lerp(-1400, 1400, outCubic(sweep)) - 160, -1600, 320, 3200);
      ctx.restore();
    }
    if (lt > 0.25) cnBlock(ctx, beatWords(b), lt - 0.25, { y: 960, size: 120, color: '#FFFFFF', fx: 'slide', stagger: 0.035, maxW: 980 });
  },
};

// ─────────────────────────────── bloco, marca e contador (referências de 4 vídeos) ───────────────────────────────
const BLK_ORANGE = '#F04E23';
const MK_LILAC = '#5F5CC9';
function flatBg(ctx, c) {
  ctx.save();
  setFilter(ctx);
  ctx.fillStyle = c;
  ctx.fillRect(-200, -200, BW + 400, BH + 400);
  ctx.restore();
}

const BLO_DRAW = {
  // palavras grandes em preto; a palavra-chave dentro de um bloco laranja que desliza
  'bl-hit'(ctx, b, lt) {
    flatBg(ctx, '#000000');
    cnBlock(ctx, beatWords(b), lt, { y: 900, size: 170, color: '#FFFFFF', fx: 'pop', stagger: 0.06, box: { word: low(b.data.keyword), fill: BLK_ORANGE, text: '#000000' } });
  },
  // a palavra repetida em linhas (eco) no fundo branco; a frase por cima
  'bl-echo'(ctx, b, lt) {
    flatBg(ctx, '#FFFFFF');
    const e = outCubic(prog(lt, 0, 0.6));
    ctx.save();
    setFilter(ctx);
    ctx.font = `200px "${FI9}"`;
    ctx.letterSpacing = '-6px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#111111';
    for (let r = 0; r < 7; r += 1) {
      ctx.globalAlpha = (0.06 + 0.05 * (r % 2)) * e;
      ctx.fillText(b.data.keyword.toUpperCase(), 540 + (r % 2 ? 40 : -40) * e, 260 + r * 250);
    }
    ctx.restore();
    cnBlock(ctx, beatWords(b), lt, { y: 960, size: 120, color: '#111111', fx: 'rise', stagger: 0.04 });
  },
  // faixa branca larga que varre a tela sobre o laranja; a frase em preto
  'bl-stripe'(ctx, b, lt) {
    flatBg(ctx, BLK_ORANGE);
    const e = outCubic(prog(lt, 0, 0.35));
    ctx.save();
    setFilter(ctx);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 760, BW * e, 380);
    ctx.restore();
    cnBlock(ctx, beatWords(b), lt, { y: 950, size: 150, color: '#111111', fx: 'slide', stagger: 0.035 });
  },
  // a frase em fatias verticais que sobem e descem fora de ordem (corte em tiras)
  'bl-slice'(ctx, b, lt) {
    flatBg(ctx, '#000000');
    const items = beatWords(b);
    const strips = 6;
    for (let i = 0; i < strips; i += 1) {
      const e = outCubic(prog(lt, i * 0.03, 0.35));
      ctx.save();
      ctx.beginPath();
      ctx.rect((i * BW) / strips, 0, BW / strips, BH);
      ctx.clip();
      ctx.translate(0, (1 - e) * (i % 2 ? 1 : -1) * 260);
      cnBlock(ctx, items, lt, { y: 940, size: 190, color: '#FFFFFF', fx: 'rise', stagger: 0.02 });
      ctx.restore();
    }
  },
};

const MRC_DRAW = {
  // lilás: palavra em contorno gigante ao fundo e a frase entrando palavra por palavra
  'mk-intro'(ctx, b, lt) {
    flatBg(ctx, MK_LILAC);
    ctx.save();
    setFilter(ctx, 1);
    ctx.font = `440px "${FI9}"`;
    ctx.letterSpacing = '-10px';
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 4;
    ctx.textAlign = 'left';
    ctx.strokeText(b.data.keyword.toUpperCase(), 40 - lt * 50, 1420);
    ctx.restore();
    cnBlock(ctx, beatWords(b), lt, { y: 820, size: 110, color: '#FFFFFF', fx: 'rise', stagger: 0.07 });
  },
  // branco: cartão lilás inclinado (perspectiva) que sobe; a frase dentro dele
  'mk-card'(ctx, b, lt, env) {
    flatBg(ctx, '#FFFFFF');
    const e = clamp(outBack(prog(lt, 0, 0.5)));
    ctx.save();
    ctx.translate(540, 1000 + (1 - e) * 500);
    ctx.transform(1, 0, (1 - e) * -0.25, 1, 0, 0);
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 30;
    ctx.fillStyle = MK_LILAC;
    setFilter(ctx);
    roundRectPath(ctx, -400, -520, 800, 1040, 50);
    ctx.fill();
    ctx.restore();
    if (b.data.element) objectImg(ctx, env, b.data.element, 540, 1000, 300, { alpha: outCubic(prog(lt, 0.2, 0.4)), shadow: 'rgba(0,0,0,0.2)' });
    cnBlock(ctx, beatWords(b), lt, { y: 560, size: 84, color: '#111111', fx: 'slide', stagger: 0.05 });
  },
  // lilás: barras que crescem em sequência; a frase em cima
  'mk-bars'(ctx, b, lt) {
    flatBg(ctx, MK_LILAC);
    [0.3, 0.45, 0.6, 0.78, 1].forEach((h, i) => {
      const e = clamp(outBack(prog(lt, 0.1 + i * 0.12, 0.5)));
      if (e <= 0) return;
      ctx.save();
      setFilter(ctx);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      roundRectPath(ctx, 540 + (i - 2) * 170 - 60, 1600 - 700 * h * e, 120, 700 * h * e, 26);
      ctx.fill();
      ctx.restore();
    });
    cnBlock(ctx, beatWords(b), lt, { y: 620, size: 110, color: '#FFFFFF', fx: 'rise', stagger: 0.05 });
  },
  // branco: logo em duas cores (degradê na palavra-chave) e a frase pequena em cima
  'mk-logo'(ctx, b, lt) {
    flatBg(ctx, '#FFFFFF');
    cnBlock(ctx, beatWords(b), lt, { y: 760, size: 70, color: '#111111', fx: 'rise', stagger: 0.05 });
    const g = ctx.createLinearGradient(300, 0, 780, 0);
    g.addColorStop(0, '#5F5CC9');
    g.addColorStop(1, '#E36D9B');
    const kt = beatWords(b).find((w) => low(w.text) === low(b.data.keyword))?.at ?? 0.3;
    fxLine(ctx, [{ text: b.data.keyword, at: kt }], lt, { y: 1000, size: 170, color: g, fx: 'pop', stagger: 0 });
  },
};

/** Número da frase (o contador sobe de 0 até ele). */
function rollTarget(b) {
  const m = String(b.data.text || '').match(/\d[\d.,]*/);
  return m ? Math.min(99999, Number(m[0].replace(/\./g, '').replace(',', '.'))) : 0;
}
/** Duração da subida do contador dentro da batida. */
function rollDur(b) { return Math.max(0.8, (b.end - b.start) * 0.7); }

const RLG_DRAW = {
  // frase sem número: entra palavra por palavra sobre o mesmo fundo cinza
  'rl-text'(ctx, b, lt) {
    flatBg(ctx, '#E2E2E4');
    cnBlock(ctx, beatWords(b), lt, { y: 960, size: 130, color: '#111111', fx: 'rise', stagger: 0.04 });
  },
  // uma caixa só: o número sobe de 0 até o valor dito na frase; a frase entra embaixo
  'rl-grid'(ctx, b, lt) {
    flatBg(ctx, '#E2E2E4');
    const target = rollTarget(b);
    const roll = rollDur(b);
    const v = Math.round(target * outCubic(prog(lt, 0.1, roll)));
    const pw = Math.max(460, measure(ctx, String(target), 230, FI9, -0.03) + 200);
    ctx.save();
    setFilter(ctx);
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = '#E8E8EA';
    roundRectPath(ctx, 540 - pw / 2, 760, pw, 280, 140);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.font = `230px "${FI9}"`;
    ctx.letterSpacing = '-3px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#444444';
    setFilter(ctx);
    ctx.fillText(String(v), 540, 904);
    ctx.restore();
    cnBlock(ctx, beatWords(b), lt, { y: 1180, size: 96, color: '#333333', fx: 'rise', stagger: 0.04 });
  },
};

// ── destaque azul (modelo enviado): serifa itálica pequena, palavra-chave azul com sublinhado, selo com número, palavra final em azul-marinho
const FGI = 'RF Garamond 400i';
const FBK = 'RF Barlow 900i';
const AZ_BLUE = '#2F7BFF';
const AZ_NAVY = '#0E1E3F';
const AZ_GREY = '#5B6478';
function azBg(ctx) {
  ctx.save();
  setFilter(ctx);
  const g = ctx.createLinearGradient(0, 0, 0, BH);
  g.addColorStop(0, '#CFE1FF');
  g.addColorStop(1, '#F5F9FF');
  ctx.fillStyle = g;
  ctx.fillRect(-200, -200, BW + 400, BH + 400);
  ctx.restore();
}
function azSparkle(ctx, x, y, r, a) {
  if (r <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = AZ_BLUE;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.restore();
}

const AZ_DRAW = {
  // linha pequena antes, palavra-chave azul com sublinhado desenhado, resto em azul-marinho
  'az-hero'(ctx, b, lt) {
    azBg(ctx);
    const items = beatWords(b);
    const ki = items.findIndex((w) => low(w.text) === low(b.data.keyword));
    if (ki < 0) { cnBlock(ctx, items, lt, { y: 960, size: 170, color: AZ_NAVY, font: FI9, fx: 'rise', stagger: 0.04 }); return; }
    const before = items.slice(0, ki);
    const kw = items[ki];
    const after = items.slice(ki + 1);
    if (before.length) fxLine(ctx, before, lt, { y: 760, size: 84, font: FGI, color: AZ_GREY, fx: 'rise', stagger: 0.03, maxW: 900 });
    const size0 = 190;
    ctx.font = `${size0}px "${FBK}"`;
    const kwW = measure(ctx, kw.text, size0, FBK, -0.03);
    const size = Math.min(size0, (size0 * 960) / Math.max(1, kwW));
    const y = 1010;
    fxLine(ctx, [kw], lt, { y, size, font: FBK, color: AZ_BLUE, fx: 'pop', stagger: 0, maxW: 980 });
    // sublinhado à mão: traço que se desenha depois da palavra
    const w = measure(ctx, kw.text, size, FBK, -0.03);
    const e = outCubic(prog(lt, kw.at + 0.15, 0.5));
    const L = w + 60;
    const yU = y + size * 0.5;
    ctx.save();
    setFilter(ctx);
    ctx.strokeStyle = AZ_BLUE;
    ctx.lineWidth = Math.max(8, size * 0.07);
    ctx.lineCap = 'round';
    ctx.setLineDash([L, L]);
    ctx.lineDashOffset = L * (1 - e);
    ctx.beginPath();
    ctx.moveTo(540 - w / 2 - 20, yU);
    ctx.quadraticCurveTo(540, yU + 26, 540 + w / 2 + 20, yU - 8);
    ctx.stroke();
    ctx.restore();
    if (after.length) fxLine(ctx, after, lt, { y: 1240, size: 150, font: FI9, color: AZ_NAVY, fx: 'rise', stagger: 0.03, maxW: 960 });
  },
  // selo azul com o número que entra com molinha; brilho ao lado; resto da frase embaixo
  'az-badge'(ctx, b, lt) {
    azBg(ctx);
    const m = String(b.data.text || '').match(/\d[\d.,]*/);
    const num = m ? m[0] : '1';
    const e = clamp(outBack(prog(lt, 0.05, 0.45)));
    ctx.save();
    ctx.translate(540, 760);
    ctx.scale(Math.max(0, e), Math.max(0, e));
    ctx.shadowColor = 'rgba(47,123,255,0.35)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = AZ_BLUE;
    setFilter(ctx);
    roundRectPath(ctx, -140, -160, 280, 320, 34);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(540, 760);
    ctx.scale(Math.max(0, e), Math.max(0, e));
    ctx.font = `${num.length > 2 ? 150 : 190}px "${FI9}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(num, 0, 12);
    ctx.restore();
    azSparkle(ctx, 540 + 170, 760 - 170, 78 * clamp(outBack(prog(lt, 0.2, 0.35))), 1);
    const words = beatWords(b).filter((w) => !/\d/.test(w.text));
    if (words.length) cnBlock(ctx, words, lt, { y: 1120, size: 130, color: AZ_NAVY, font: FI9, fx: 'rise', stagger: 0.04 });
  },
  // palavra final, grande, em azul-marinho
  'az-end'(ctx, b, lt) {
    azBg(ctx);
    cnBlock(ctx, beatWords(b), lt, { y: 960, size: 200, color: AZ_NAVY, font: FI9, fx: 'pop', stagger: 0.05, maxW: 960 });
  },
};

// ── colagem editorial (pasta "MOTIONS REFE."): fundo cinza claro com luz de janela, pontinhos e
// código de barras; recortes 3D; palavra com o objeto no lugar de uma letra ("br🧠ins"); caixa de
// seleção tracejada com o cursor que clica; círculo com objeto e palavra serifada circulada à mão;
// número gigante que sobe; manchas pretas que varrem os cantos na troca de frase.
const FG7 = 'RF Garamond 700';
const CG_RED = '#E3262E';
const CG_INK = '#141414';
const CG_GREEN = '#2E5E3A';
function cgBg(ctx, lt) {
  ctx.save();
  setFilter(ctx);
  ctx.fillStyle = '#E9E9E6';
  ctx.fillRect(-200, -200, BW + 400, BH + 400);
  ctx.restore();
  // luz de janela: faixas claras inclinadas, bem suaves, andando devagar
  ctx.save();
  setFilter(ctx, 38);
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#FFFFFF';
  const sh = lt * 8;
  for (let i = 0; i < 3; i += 1) {
    const x = 60 + i * 320 + sh;
    ctx.beginPath();
    ctx.moveTo(x, 160);
    ctx.lineTo(x + 170, 160);
    ctx.lineTo(x + 560, 1560);
    ctx.lineTo(x + 390, 1560);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.save();
  setFilter(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.09)';
  for (let y = 70; y < BH; y += 64) for (let x = 38; x < BW; x += 64) ctx.fillRect(x, y, 3, 3);
  // código de barras no alto à direita
  ctx.fillStyle = 'rgba(20,20,20,0.78)';
  let bx = 770;
  for (const w of [3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 1, 2, 4, 1, 2, 1, 3, 1]) { ctx.fillRect(bx, 110, w * 3, 64); bx += w * 3 + 5; }
  ctx.restore();
}
/** Mancha orgânica (pétalas arredondadas), como as que varrem a tela nas referências. */
function cgBlob(ctx, cx, cy, r, seed) {
  if (r <= 1) return;
  const n = 5;
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + seed;
    const h = Math.PI / n;
    const p0 = [cx + Math.cos(a - h) * r * 0.5, cy + Math.sin(a - h) * r * 0.5];
    const p1 = [cx + Math.cos(a + h) * r * 0.5, cy + Math.sin(a + h) * r * 0.5];
    if (i === 0) ctx.moveTo(...p0);
    ctx.bezierCurveTo(cx + Math.cos(a - h * 0.9) * r * 1.25, cy + Math.sin(a - h * 0.9) * r * 1.25, cx + Math.cos(a + h * 0.9) * r * 1.25, cy + Math.sin(a + h * 0.9) * r * 1.25, ...p1);
  }
  ctx.closePath();
  ctx.fill();
}
/** Na troca de frase, duas manchas pretas saem dos cantos e encolhem (0,5 s). */
function cgBlobs(ctx, lt, bi) {
  if (!bi) return;
  const e = clamp(lt / 0.5);
  if (e >= 1) return;
  const s = 1 - outCubic(e);
  ctx.save();
  setFilter(ctx);
  ctx.fillStyle = CG_INK;
  cgBlob(ctx, -40, -40, 560 * s, 0.4 + bi);
  cgBlob(ctx, BW + 40, BH + 40, 660 * s, 1.1 + bi);
  ctx.restore();
}
function cgZig(ctx, x, y, a) {
  if (a <= 0) return;
  ctx.save();
  setFilter(ctx);
  ctx.globalAlpha = a;
  ctx.strokeStyle = CG_INK;
  ctx.lineWidth = 7;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(x, y + 30);
  ctx.lineTo(x + 30, y);
  ctx.lineTo(x + 60, y + 30);
  ctx.lineTo(x + 90, y);
  ctx.stroke();
  ctx.restore();
}
const cgKey = (b, items) => items.find((w) => low(w.text) === low(b.data.keyword)) || items[items.length - 1] || { text: String(b.data.keyword || ''), at: 0.2 };

const CG_DRAW = {
  // palavra grande com o objeto 3D no lugar de uma letra; palavra pequena antes, frase embaixo
  'cg-letter'(ctx, b, lt, env, bi) {
    cgBg(ctx, lt);
    const items = beatWords(b);
    // a palavra grande é a do assunto (onde o objeto entra); a palavra-chave fica em vermelho embaixo
    const kIt = (b.data.objWord && items.find((w) => low(w.text) === low(b.data.objWord))) || cgKey(b, items);
    const ki = items.indexOf(kIt);
    const word = low(kIt.text);
    const has = b.data.element && env.image?.(b.data.element);
    // letra redonda (o, a, 0, e) mais perto do meio da palavra vira o objeto
    let li = -1;
    if (has) {
      [...word].forEach((ch, j) => {
        if (j > 0 && 'oa0e'.includes(ch) && (li < 0 || Math.abs(j - (word.length - 1) / 2) < Math.abs(li - (word.length - 1) / 2))) li = j;
      });
    }
    const left = li >= 0 ? word.slice(0, li) : word;
    const right = li >= 0 ? word.slice(li + 1) : '';
    const widthAt = (sz) => measure(ctx, left, sz, FI9, -0.03) + (right ? measure(ctx, right, sz, FI9, -0.03) : 0) + (li >= 0 ? sz * 0.66 : 0);
    let s = 270;
    const full = widthAt(s);
    if (full > 940) s *= 940 / full;
    const lw = measure(ctx, left, s, FI9, -0.03);
    const rw = right ? measure(ctx, right, s, FI9, -0.03) : 0;
    const gap = li >= 0 ? s * 0.66 : 0;
    const x0 = 540 - (lw + gap + rw) / 2;
    const y = 960;
    const e = outCubic(prog(lt, kIt.at, 0.35));
    if (e > 0) {
      ctx.save();
      ctx.globalAlpha = e;
      setFilter(ctx, (1 - e) * 12);
      ctx.font = `${s}px "${FI9}"`;
      ctx.letterSpacing = `${(-0.03 * s).toFixed(1)}px`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = CG_INK;
      ctx.fillText(left, x0, y + (1 - e) * 40);
      if (right) ctx.fillText(right, x0 + lw + gap, y + (1 - e) * 40);
      ctx.restore();
    }
    if (li >= 0) objectImg(ctx, env, b.data.element, x0 + lw + gap / 2, y - s * 0.34, s * 0.98 * clamp(outBack(prog(lt, kIt.at + 0.15, 0.45))), { shadow: 'rgba(0,0,0,0.25)' });
    const pre = items.slice(Math.max(0, ki - 2), ki);
    if (pre.length) line(ctx, pre, lt, { x: x0 + 8, y: y - s * 0.8, size: 62, font: FI7, color: CG_INK, align: 'left', maxW: 700 });
    const post = items.slice(ki + 1);
    const red = post.find((w) => low(w.text) === low(b.data.keyword) && low(w.text) !== word) || (post.length > 1 ? post[post.length - 1] : null);
    if (post.length) line(ctx, post.slice(0, 6), lt, { x: 540, y: y + 120, size: 74, font: FI7, maxW: 960, color: (it) => (it === red ? CG_RED : CG_INK) });
    const z = outCubic(prog(lt, 0.2, 0.4));
    cgZig(ctx, 40, 540, z);
    cgZig(ctx, BW - 150, 1440, z);
  },
  // frase em caixa alta pequena + palavra-chave dentro da caixa de seleção; o cursor entra e clica
  'cg-select'(ctx, b, lt, env, bi) {
    cgBg(ctx, lt);
    const items = beatWords(b);
    const kIt = cgKey(b, items);
    const ki = items.indexOf(kIt);
    const pre = items.slice(0, ki);
    const post = items.slice(ki + 1);
    if (pre.length) line(ctx, pre.map((w) => ({ ...w, text: w.text.toUpperCase() })), lt, { x: 540, y: 850, size: 54, font: FI7, color: '#3A3A3A', maxW: 900 });
    const kt = kIt.text.toUpperCase();
    let s = 120;
    const w0 = measure(ctx, kt, s, FI9, -0.02);
    if (w0 > 860) s *= 860 / w0;
    const w = measure(ctx, kt, s, FI9, -0.02);
    const bw = w + 80;
    const bh = s * 1.2;
    const bx = 540 - bw / 2;
    const by = 890;
    const eb = outCubic(prog(lt, Math.max(0, kIt.at - 0.25), 0.35));
    if (eb > 0) {
      ctx.save();
      setFilter(ctx);
      ctx.globalAlpha = eb;
      ctx.strokeStyle = CG_INK;
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 9]);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.setLineDash([]);
      ctx.fillStyle = '#FFFFFF';
      for (const [cx, cy] of [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]]) {
        ctx.fillRect(cx - 9, cy - 9, 18, 18);
        ctx.strokeRect(cx - 9, cy - 9, 18, 18);
      }
      ctx.restore();
    }
    fxLine(ctx, [{ text: kt, at: kIt.at }], lt, { y: by + s * 0.92, size: s, font: FI9, color: CG_INK, fx: 'pop', stagger: 0, maxW: 900 });
    // cursor: entra pelo canto de baixo e clica no canto da caixa
    const ce = outCubic(prog(lt, Math.max(0, kIt.at - 0.45), 0.4));
    const ck = prog(lt, kIt.at, 0.16);
    const press = ck > 0 && ck < 1 ? 0.84 : 1;
    const tx = lerp(BW + 120, bx + bw - 6, ce);
    const ty = lerp(BH * 0.82, by + bh - 6, ce);
    if (env.image?.('real/cursor')) objectImg(ctx, env, 'real/cursor', tx + 46, ty + 50, 120 * press, { shadow: 'rgba(0,0,0,0.28)' });
    else {
      ctx.save();
      setFilter(ctx);
      ctx.translate(tx, ty);
      ctx.scale(press, press);
      ctx.fillStyle = CG_INK;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 64);
      ctx.lineTo(16, 50);
      ctx.lineTo(28, 76);
      ctx.lineTo(40, 70);
      ctx.lineTo(28, 46);
      ctx.lineTo(48, 46);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (post.length) line(ctx, post, lt, { x: 540, y: by + bh + 110, size: 66, font: FGI, color: '#2A2A2A', maxW: 900 });
  },
  // rótulo no alto, círculo verde com o objeto e, embaixo, a palavra serifada circulada à mão
  'cg-circle'(ctx, b, lt, env, bi) {
    cgBg(ctx, lt);
    const items = beatWords(b);
    const kIt = cgKey(b, items);
    const ki = items.indexOf(kIt);
    const label = ki > 1 ? items.slice(0, 1) : [];
    if (label.length) line(ctx, label, lt, { x: 90, y: 330, size: 72, font: FI7, color: '#2B2B2B', align: 'left', maxW: 640 });
    const ec = clamp(outBack(prog(lt, 0.08, 0.5)));
    if (ec > 0) {
      ctx.save();
      setFilter(ctx);
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 18;
      ctx.fillStyle = CG_GREEN;
      ctx.beginPath();
      ctx.arc(540, 860, 270 * ec, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#C9A24A';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }
    objectImg(ctx, env, b.data.element, 540, 860, 400 * clamp(outBack(prog(lt, 0.28, 0.5))), { shadow: 'rgba(0,0,0,0.35)' });
    const rest = items.slice(label.length, ki).slice(-3);
    const aText = rest.map((w) => w.text).join(' ');
    const sA = 92;
    const sK = 140;
    const aw = aText ? measure(ctx, aText, sA, FI7, -0.02) + 26 : 0;
    const kw = measure(ctx, kIt.text, sK, FG7, -0.01);
    const sc = Math.min(1, 960 / (aw + kw));
    const x0 = 540 - ((aw + kw) * sc) / 2;
    const y = 1420;
    if (rest.length) line(ctx, rest, lt, { x: x0, y, size: sA * sc, font: FI7, color: '#2B2B2B', align: 'left', maxW: 960 });
    const kx = x0 + aw * sc;
    line(ctx, [kIt], lt, { x: kx, y, size: sK * sc, font: FG7, color: CG_INK, align: 'left', maxW: 960, ls: -0.01 });
    // elipse à mão em volta da palavra (o traço se desenha)
    const ee = outCubic(prog(lt, kIt.at + 0.25, 0.6));
    if (ee > 0) {
      const cx = kx + (kw * sc) / 2;
      const cy = y - sK * sc * 0.32;
      const rx = (kw * sc) / 2 + 40;
      const ry = sK * sc * 0.62;
      const a0 = -2.7;
      const a1 = a0 + ee * (Math.PI * 2 + 0.45);
      ctx.save();
      setFilter(ctx);
      ctx.strokeStyle = CG_INK;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let a = a0; a <= a1; a += 0.04) {
        const wob = 1 + 0.035 * Math.sin(a * 3);
        const px = cx + Math.cos(a) * rx * wob;
        const py = cy + Math.sin(a) * ry * wob - (a - a0) * 3;
        if (a === a0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }
    // ondas finas no rodapé, andando
    const we = outCubic(prog(lt, 0.4, 0.6));
    if (we > 0) {
      ctx.save();
      setFilter(ctx);
      ctx.globalAlpha = 0.35 * we;
      ctx.strokeStyle = CG_INK;
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 7; k += 1) {
        ctx.beginPath();
        for (let x = 520; x <= BW + 20; x += 12) {
          const yy = 1700 + k * 14 + Math.sin(x * 0.012 + lt * 2 + k * 0.4) * 40 * ((x - 520) / 560);
          if (x === 520) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  },
  // número gigante que sobe de 0 ao valor dito; objeto apagado atrás; frase em cima e embaixo
  'cg-number'(ctx, b, lt, env, bi) {
    cgBg(ctx, lt);
    objectImg(ctx, env, b.data.element, 540, 960, 780, { alpha: 0.16, shadow: 'rgba(0,0,0,0)' });
    const target = rollTarget(b);
    const v = Math.round(target * outCubic(prog(lt, 0.1, rollDur(b))));
    let s = 560;
    const w = measure(ctx, String(target), s, FI9, -0.04);
    if (w > 900) s *= 900 / w;
    const e = clamp(outBack(prog(lt, 0, 0.35)));
    ctx.save();
    setFilter(ctx);
    ctx.font = `${s}px "${FI9}"`;
    ctx.letterSpacing = `${(-0.04 * s).toFixed(1)}px`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = CG_INK;
    ctx.translate(540, 1170);
    ctx.scale(Math.max(0.001, e), Math.max(0.001, e));
    ctx.fillText(String(v), 0, 0);
    ctx.restore();
    const words = beatWords(b).filter((w2) => !/\d/.test(w2.text));
    const half = Math.ceil(words.length / 2);
    if (words.length) line(ctx, words.slice(0, half), lt, { x: 540, y: 640, size: 72, font: FI7, color: '#2B2B2B', maxW: 900 });
    if (words.length > half) line(ctx, words.slice(half), lt, { x: 540, y: 1330, size: 86, font: FGI, color: CG_INK, maxW: 900 });
  },
};
// as manchas da troca ficam por cima de cada tipo
for (const k of Object.keys(CG_DRAW)) {
  const fn = CG_DRAW[k];
  CG_DRAW[k] = (ctx, b, lt, env, bi) => { fn(ctx, b, lt, env, bi); cgBlobs(ctx, lt, bi); };
}

const DRAW = { editorial: ED_DRAW, bordo: BO_DRAW, 'cinema-escuro': CI_DRAW, minimalista: MI_DRAW, cinetico: CN_DRAW, bloco: BLO_DRAW, marca: MRC_DRAW, rolagem: RLG_DRAW, azul: AZ_DRAW, colagem: CG_DRAW };
