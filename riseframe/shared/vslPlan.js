// Reel VSL ("interface animada"): o apresentador fala e a tela responde. A câmera alterna
// TELA CHEIA (punch-in) e TELA DIVIDIDA (painel de vidro em cima, o apresentador num card
// embaixo), com troca animada de 0,45 s; cada palavra-chave entra na palavra falada; a
// legenda some na tela dividida e nas trocas; sons só nas trocas e nos impactos.
//
// Este módulo só PLANEJA (puro, compartilhado com os testes): janelas da câmera, punch de
// impacto, textos (camadas da timeline), objetos 3D, sons e o que esconder da legenda. O
// render da câmera é server/src/pipeline/vsl.js.

import { phraseChunks, composeLines, textWidthEm } from './kinetic.js';
import { conceptsIn } from './sceneElements.js';

export const VSL_COLORS = { fundo: '#1F123D', texto: '#FFFFFF', destaque: '#8B5CF6', apoio: '#B9A3FF', acento2: '#A59CC4' };
export const VSL_SWITCH = 0.45; // troca de layout (s)
export const VSL_PUNCH = 1.06; // punch-in base da tela cheia
export const VSL_IMPACT = 1.16; // punch seco na frase de impacto
// card do apresentador na tela dividida (frações do quadro 9:16) — igual à moldura PNG
export const VSL_CARD = { x: 44 / 1080, y: 980 / 1920, w: 992 / 1080, h: 896 / 1920 };

const W = (re) => new RegExp(`(?<!\\p{L})(?:${re})(?!\\p{L})`, 'iu');
const IMPACT = W('nunca|sempre|tudo|nada|ningu[eé]m|segredo|verdade|erro|pare|agora|imposs[ií]vel|absurdo|simples|exatamente|jamais|todo mundo|ningu[eé]m');
const KICKER = {
  time: 'TEMPO', clock: 'ROTINA', money: 'DINHEIRO', spend: 'GASTOS', sale: 'VENDAS', brain: 'MENTE', idea: 'A IDEIA', think: 'PENSA COMIGO',
  growth: 'RESULTADO', fall: 'CUIDADO', fast: 'VELOCIDADE', error: 'O ERRO', alert: 'ATENÇÃO', right: 'O CERTO', goal: 'O OBJETIVO', fire: 'IMPORTANTE',
  secret: 'O SEGREDO', key: 'A CHAVE', phone: 'NAS REDES', work: 'NO TRABALHO', write: 'ANOTA AÍ', list: 'O PLANO', computer: 'NO DIGITAL',
  keyboard: 'NA PRÁTICA', leader: 'LIDERANÇA', strategy: 'ESTRATÉGIA', team: 'QUEM FAZ', people: 'AS PESSOAS', love: 'O QUE IMPORTA', best: 'O MELHOR',
  magic: 'A VIRADA', look: 'REPARA', talk: 'COMUNICAÇÃO', chat: 'CONVERSA', gift: 'BÔNUS', calendar: 'NA SEMANA', home: 'EM CASA',
  strength: 'DISCIPLINA', energy: 'ENERGIA', learn: 'APRENDIZADO', course: 'FORMAÇÃO', world: 'NO MUNDO', question: 'A PERGUNTA', win: 'A CONQUISTA',
  boom: 'IMPACTO', mail: 'MENSAGEM', system: 'O SISTEMA',
};

const clean = (w) => String(w?.word ?? '').trim();
const r3 = (v) => +Number(v).toFixed(3);
const isNum = (w) => /\d/.test(clean(w));
const tidy = (s) => s.replace(/[.,;:!?…]+$/u, '');

/** Linha de texto alinhada à esquerda numa borda (x = centro da linha). */
function leftText(text, { left, y, size, font, fontStyle, widthFont, tracking = 0, aspect, ...rest }) {
  const w = textWidthEm(text, widthFont, tracking) * size;
  return { text, x: r3(left + w / aspect / 2), y: r3(y), size: r3(size), font, fontStyle, tracking, align: 'center', box: 'none', stroke: false, ...rest };
}

/**
 * Planeja o Reel VSL.
 * @param {object} p
 * @param {Array} p.segments frases com palavras (tempo do vídeo final)
 * @param {number} p.dur duração
 * @param {number} [p.aspect] largura/altura (o estilo é para 9:16)
 * @param {Set<string>} [p.available] sons existentes
 * @returns {{splits:Array<{start,end}>, punches:Array<{start,end,scale}>, hook:{end:number}|null,
 *   layers:Array, elements:Array, sfx:Array, hide:Array<{start,end}>}}
 */
export function vslPlan({ segments, dur, aspect = 9 / 16, available = null } = {}) {
  const total = Number(dur) || 0;
  const chunks = phraseChunks(segments, 8).filter((c) => c.length);
  const layers = [];
  const elements = [];
  const sfx = [];
  const hide = [];
  const splits = [];
  const punches = [];
  const has = (id) => !available || available.has(id);
  const snd = (t, ids, volume, why) => { const id = ids.find(has); if (id) sfx.push({ t: r3(Math.max(0, t)), type: id, volume, why }); };
  if (!chunks.length || total < 4) return { splits, punches, hook: null, layers, elements, sfx, hide };

  // 1) gancho: os primeiros ~1,5 s com cara de filmadora, depois glitch + boom
  const hookEnd = Math.min(1.6, Math.max(0.8, chunks[0][chunks[0].length - 1].end));
  const hook = { end: r3(hookEnd) };
  hudLayers(layers, hookEnd);
  snd(hookEnd, ['boom', 'impact', 'pr-hit'], 0.7, 'glitch do gancho');

  // 2) janelas da tela dividida: frases com conteúdo (2+ palavras-chave, assunto ou número),
  //    com pelo menos 2,2 s de tela cheia entre elas; cada janela junta até 3 frases (≤ 5,5 s)
  const content = (c) => composeLines(c).filter((l) => l.role !== 'small').length >= 2 || conceptsIn(c).length > 0 || c.some(isNum);
  let lastSwitch = hookEnd;
  let open = null;
  const close = (at) => {
    const end = Math.min(at, total - 1.5);
    if (end - open.start >= 2) splits.push({ start: r3(open.start), end: r3(end), chunks: open.chunks });
    lastSwitch = end;
    open = null;
  };
  for (const c of chunks) {
    const s = c[0].start;
    const e = c[c.length - 1].end;
    if (open) {
      if (e - open.start <= 5.5 && open.chunks.length < 3) { open.chunks.push(c); continue; }
      close(open.chunks[open.chunks.length - 1][open.chunks[open.chunks.length - 1].length - 1].end + 0.1);
      continue;
    }
    if (s - lastSwitch >= 2.2 && content(c) && total - s > 3.5) open = { start: Math.max(0, s - 0.05), chunks: [c] };
  }
  if (open) close(open.chunks[open.chunks.length - 1][open.chunks[open.chunks.length - 1].length - 1].end + 0.1);

  // 3) conteúdo de cada tela dividida: rótulo + título + card de vidro com os itens falados
  splits.forEach((sp, i) => {
    splitLayers({ sp, layers, elements, aspect, index: i });
    snd(sp.start, ['swoosh', 'whoosh', 'pr-air'], 0.5, 'troca para tela dividida');
    snd(sp.end, ['whoosh', 'swoosh', 'pr-air'], 0.45, 'volta para tela cheia');
    // legenda some na tela dividida e na troca (ela "vazaria" com o quadro encolhendo)
    hide.push({ start: r3(sp.start - 0.05), end: r3(sp.end + VSL_SWITCH + 0.05) });
  });

  // 4) tela cheia: frase de impacto vira letreiro no peito (com punch seco); número vira pílula
  const inSplit = (a, b) => splits.some((sp) => a < sp.end + VSL_SWITCH + 0.2 && b > sp.start - 0.3);
  let lastLetter = -10;
  for (const c of chunks) {
    const s = c[0].start;
    const e = c[c.length - 1].end;
    if (s < hookEnd + 0.3 || inSplit(s, e)) continue;
    const text = c.map(clean).join(' ');
    if (c.length <= 6 && (IMPACT.test(text) || /!$/.test(text)) && s - lastLetter >= 5) {
      lastLetter = s;
      letteringLayers({ c, layers, aspect, end: Math.min(e + 0.6, total) });
      punches.push({ start: r3(s - 0.02), end: r3(e + 0.3), scale: VSL_IMPACT });
      hide.push({ start: r3(s - 0.05), end: r3(e + 0.65) });
      snd(s, ['pr-hit', 'impact', 'thud'], 0.6, 'letreiro de impacto');
      continue;
    }
    const n = composeLines(c).find((l) => l.role === 'num');
    if (n) {
      const label = tidy(n.unit ? `${n.text} ${n.unit}` : n.text).toUpperCase();
      const size = 0.04;
      const w = textWidthEm(label, 'inter-900', 40) * size + 2 * 0.5 * size;
      layers.push({ text: label, x: 0.5, y: 0.74, size, font: 'inter', fontStyle: '900', tracking: 40, color: VSL_COLORS.texto, align: 'center',
        box: 'box', bg: true, bgColor: VSL_COLORS.fundo, bgOpacity: 0.86, bgMode: 'lines', pad: 0.5, radius: 1, stroke: false,
        shadow: true, shadowColor: VSL_COLORS.destaque, shadowOpacity: 0.45, shadowDist: 0, shadowBlur: 0.012,
        start: r3(n.words[0].start), end: r3(Math.min(e + 0.8, total)), animIn: 'pop', animOut: 'fade', _w: w });
      hide.push({ start: r3(n.words[0].start - 0.05), end: r3(Math.min(e + 0.85, total)) });
    }
  }

  // som enxuto: no máximo ~0,8 por segundo
  sfx.sort((a, b) => a.t - b.t);
  const lean = [];
  for (const s of sfx) if (!lean.length || s.t - lean[lean.length - 1].t >= 0.6) lean.push(s);
  const cap = Math.max(1, Math.floor(total * 0.8));
  return {
    splits: splits.map(({ start, end }) => ({ start, end })), punches, hook,
    layers: layers.map(({ _w, ...l }) => l), elements, sfx: lean.slice(0, cap), hide,
  };
}

/** HUD de filmadora no gancho: cantos, REC piscando e o contador de tempo. */
function hudLayers(layers, end) {
  const m = 0.05;
  const arm = 0.07;
  const t = 0.004;
  const white = '#FFFFFF';
  const bar = (x, y, w, h) => ({ kind: 'shape', shape: 'rect', x, y, w, h, color: white, opacity: 0.9, start: 0, end: r3(end), animIn: 'none', animOut: 'fade' });
  const ar = 9 / 16;
  for (const [cx, cy, sx, sy] of [[m, m * ar * 1.6, 1, 1], [1 - m, m * ar * 1.6, -1, 1], [m, 1 - m * ar * 1.6, 1, -1], [1 - m, 1 - m * ar * 1.6, -1, -1]]) {
    layers.push(bar(r3(cx + (sx * arm) / 2), r3(cy), arm, t * ar * 1.2));
    layers.push(bar(r3(cx), r3(cy + (sy * arm * ar) / 2), t, r3(arm * ar)));
  }
  layers.push({ kind: 'shape', shape: 'ellipse', x: 0.115, y: 0.088, w: 0.032, h: r3(0.032 * ar), color: '#FF3B30', start: 0, end: r3(end), animIn: 'none', animOut: 'fade' });
  layers.push({ text: 'REC', x: 0.19, y: 0.088, size: 0.026, font: 'inter', fontStyle: '700', tracking: 120, color: white, align: 'center', box: 'none', stroke: false, start: 0, end: r3(end), animIn: 'none', animOut: 'fade' });
  // contador (troca a cada 0,25 s)
  for (let a = 0; a < end - 0.05; a += 0.25) {
    const b = Math.min(end, a + 0.25);
    if (b - a < 0.2) break;
    const f = Math.floor((a % 1) * 30);
    const tc = `00:00:${String(Math.floor(a)).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
    layers.push({ text: tc, x: 0.8, y: 0.088, size: 0.022, font: 'inter', fontStyle: '700', tracking: 40, color: white, align: 'center', box: 'none', stroke: false, start: r3(a), end: r3(b), animIn: 'none', animOut: 'none' });
  }
}

/** Conteúdo da tela dividida (área de cima: y 0,09–0,48). */
function splitLayers({ sp, layers, elements, aspect, index }) {
  const left = 0.09;
  const colW = 0.82 * aspect; // largura útil em frações da altura
  const at0 = sp.start + VSL_SWITCH * 0.6;
  const words = sp.chunks.flat();
  const concept = conceptsIn(words)[0] || null;
  const end = sp.end;
  // rótulo (kicker) e título: as palavras-chave da 1ª frase
  const kicker = KICKER[concept?.id] || ['PRESTA ATENÇÃO', 'O PONTO É', 'ENTENDA', 'NA PRÁTICA'][index % 4];
  layers.push(leftText(kicker, { left, y: 0.115, size: 0.021, font: 'inter', fontStyle: '700', widthFont: 'inter-700', tracking: 220, aspect,
    color: VSL_COLORS.acento2, start: r3(at0), end: r3(end), animIn: 'fade', animOut: 'fade' }));
  const first = composeLines(sp.chunks[0]).filter((l) => l.role !== 'small');
  const titleLines = [];
  let cur = '';
  for (const l of first) {
    const t = tidy(l.role === 'num' && l.unit ? `${l.text} ${l.unit}` : l.text);
    if (!cur) cur = t;
    else if ((cur + ' ' + t).length <= 16) cur += ` ${t}`;
    else { titleLines.push(cur); cur = t; }
  }
  if (cur) titleLines.push(cur);
  const title = titleLines.slice(0, 2);
  const longest = Math.max(...title.map((t) => textWidthEm(t, 'inter-900', -30)), 0.1);
  const tSize = Math.min(0.064, colW / longest);
  title.forEach((t, k) => {
    layers.push(leftText(t, { left, y: 0.165 + tSize * 1.05 * k + tSize * 0.5, size: tSize, font: 'inter', fontStyle: '900', widthFont: 'inter-900', tracking: -30, aspect,
      color: k === title.length - 1 ? VSL_COLORS.apoio : VSL_COLORS.texto, start: r3(Math.max(at0, sp.chunks[0][0].start)), end: r3(end), animIn: 'palavras-desfoque', animOut: 'fade' }));
  });
  // card de vidro com os itens ditos depois (um por palavra-chave, cada um na sua palavra)
  const items = [];
  for (const c of sp.chunks.slice(1).concat(sp.chunks.length === 1 ? [] : [])) {
    for (const l of composeLines(c)) if (l.role !== 'small' && items.length < 3) items.push(l);
  }
  if (!items.length) {
    // uma frase só: os itens são as palavras-chave que não entraram no título
    for (const l of first.slice(2)) if (items.length < 3) items.push(l);
  }
  const cardTop = 0.165 + tSize * 1.05 * title.length + 0.03;
  const rowH = 0.05;
  const cardH = Math.max(0.1, items.length * rowH + 0.05);
  const cardCy = cardTop + cardH / 2;
  const fits = items.length > 0 && cardTop + cardH <= 0.49;
  // o card entra junto com o 1º item falado (nunca vazio na tela)
  if (fits) {
    layers.push({ kind: 'shape', shape: 'rect', x: 0.5, y: r3(cardCy), w: 0.82, h: r3(cardH), color: VSL_COLORS.fundo, opacity: 0.8, radius: 0.18,
      stroke: true, strokeColor: VSL_COLORS.destaque, strokeW: 0.0012, shadow: true, shadowColor: VSL_COLORS.destaque, shadowOpacity: 0.3, shadowDist: 0, shadowBlur: 0.015,
      start: r3(Math.max(at0 + 0.1, items[0].words[0].start - 0.2)), end: r3(end), animIn: 'zoom', animOut: 'fade' });
  }
  if (fits) items.forEach((l, k) => {
    const t = tidy(l.role === 'num' && l.unit ? `${l.text} ${l.unit}` : l.text);
    const label = `→  ${t}`;
    const size = Math.min(0.034, (0.56 * aspect) / textWidthEm(label, 'inter-700', 0));
    layers.push(leftText(label, { left: 0.14, y: cardTop + 0.025 + rowH * k + rowH / 2, size, font: 'inter', fontStyle: '700', widthFont: 'inter-700', aspect,
      color: k === 0 ? VSL_COLORS.texto : '#E8E2FF', start: r3(Math.max(at0 + 0.15, l.words[0].start - 0.03)), end: r3(end), animIn: 'palavras-desfoque', animOut: 'fade' }));
  });
  // objeto 3D do assunto, à direita no card (entra na palavra e flutua)
  if (concept) {
    const scale = 0.17;
    elements.push({
      kind: 'image', mode: 'pip', above: true, layer: 12, element: concept.element,
      cx: 0.78, cy: r3(fits ? Math.max(cardTop + 0.02, cardCy - 0.01) : Math.min(0.42, cardTop + 0.08)), scale, rot: 8,
      start: r3(Math.max(at0, concept.word.start - 0.06)), duration: r3(Math.max(0.3, end - Math.max(at0, concept.word.start - 0.06))),
      animIn: 'elastic', animOut: 'fade', animDur: 0.45, motion: 'float-rotate', motionSpeed: 1, motionAmp: 0.9,
    });
  }
}

/** Letreiro empilhado no peito (tela cheia), uma linha por palavra-chave, em caixa alta. */
function letteringLayers({ c, layers, aspect, end }) {
  const lines = composeLines(c).map((l) => ({ ...l, t: tidy(l.role === 'num' && l.unit ? `${l.text} ${l.unit}` : l.text).toUpperCase() }));
  const keys = lines.filter((l) => l.role !== 'small').slice(0, 3);
  if (!keys.length) return;
  const col = 0.8 * aspect;
  const sized = keys.map((l) => ({ ...l, size: Math.min(0.085, col / textWidthEm(l.t, 'inter-900', -20)) }));
  const totalH = sized.reduce((a, l) => a + l.size * 1.02, 0);
  let y = Math.min(0.8, 0.7 - totalH / 2 + 0.06) ;
  const star = sized.reduce((a, b) => (IMPACT.test(b.t) || b.t.length > a.t.length ? b : a));
  for (const l of sized) {
    const h = l.size * 1.02;
    layers.push({ text: l.t, x: 0.5, y: r3(y + h / 2), size: r3(l.size), font: 'inter', fontStyle: '900', tracking: -20, align: 'center', box: 'none', stroke: false,
      color: l === star ? VSL_COLORS.apoio : VSL_COLORS.texto, shadow: true, shadowColor: l === star ? VSL_COLORS.destaque : '#000000', shadowOpacity: 0.6, shadowDist: 0, shadowBlur: 0.012,
      start: r3(Math.max(0, l.words[0].start - 0.03)), end: r3(end), animIn: 'letras-subir', animOut: 'fade' });
    y += h;
  }
}
