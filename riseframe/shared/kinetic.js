// Tipografia cinética editorial (como os vídeos de referência feitos no After Effects):
// a frase vira uma composição empilhada — palavras de ligação pequenas em serifa itálica
// ("so right now", "is processing"), palavras-chave grandes e grossas ("your brain"),
// números numa tarja ("11000000") — e cada palavra entra no instante em que é falada,
// sobre um fundo de cena (papel claro com arcos, holofote, cinema com luz laranja) ou
// direto sobre o vídeo. Fundos: escuro premium (luz laranja suave), branco com objetos
// recortados, roxo com card de vidro (VSL) ou o próprio vídeo.
//
// Tudo vira camadas normais de TEXTO/FORMA da timeline (o render em ASS já desenha igual
// à prévia), mais os sons de cada entrada. Compartilhado pelo editor e pelos testes.

import { emphasisScore } from './keyMoments.js';
import { premiumSfx } from './autoMoments.js';
import { sceneElements, ANIMATED_BACKGROUNDS } from './sceneElements.js';
import { KINETIC_CHARS, KINETIC_WIDTHS } from './kineticWidths.js';

const CHAR_IX = new Map([...KINETIC_CHARS].map((c, i) => [c, i]));
/** Largura do texto em em, com a medida real das letras da fonte (+ espaçamento em milésimos de em). */
export function textWidthEm(text, font, tracking = 0) {
  const tbl = KINETIC_WIDTHS[font] || KINETIC_WIDTHS['inter-900'];
  let w = 0;
  let n = 0;
  for (const c of String(text)) { const i = CHAR_IX.get(c); w += i == null ? 600 : tbl[i]; n += 1; }
  return w / 1000 + (tracking / 1000) * n;
}

export const KINETIC_THEMES = {
  auto: 'Alternar',
  'preto-raios': 'Preto com raios',
  'grade-ondulada': 'Grade ondulada',
  'azul-grade': 'Azul com grade e estrelas',
  'cinza-manchas': 'Cinza com manchas',
  'holofote-cone': 'Feixe de luz',
  lampada: 'Lâmpada',
  'azul-orbita': 'Azul-noite com órbitas',
  'lilas-flor': 'Lilás com flor',
  escuro: 'Escuro premium',
  branco: 'Branco com recortes',
  vsl: 'Roxo vidro (VSL)',
  'azul-claro': 'Azul-claro',
  'papel-cinza': 'Papel cinza',
  'branco-zigzag': 'Branco com zigzag',
  video: 'Sobre o vídeo',
};
export const KINETIC_AMOUNT = { chave: 'Momentos-chave', muitos: 'Quase o vídeo todo' };

// Palavras de ligação (ficam pequenas, em itálico). Português + inglês.
const SMALL = new Set(('a o as os um uma uns umas de da do das dos em no na nos nas num numa e é ou que se por pra para pro com sem '
  + 'ao aos à às eu tu ele ela nós vocês você eles elas me te lhe nos isso isto esse essa este esta aquilo aqui ali lá já só tão '
  + 'mas mais menos muito muita bem como quando onde porque pois então também ainda até sobre entre seu sua seus suas meu minha '
  + 'the a an of to in on at by for with and or but is are was were be been it its this that these those so as from your my our '
  + 'you i we he she they me us him her them just very really about into than then there here what which who').split(' '));
const STRONG = /^(nunca|sempre|todos|nada|ningu[eé]m|agora|segredo|erro|verdade|problema|importante|aten[cç][aã]o|cuidado|dinheiro|gr[aá]tis|melhor|pior|maior|menor|r[aá]pido|f[aá]cil|imposs[ií]vel|incr[ií]vel|resultado|primeiro|[uú]nico|jamais)$/i;

const clean = (w) => String(w?.word ?? '').trim();
const bare = (w) => clean(w).toLowerCase().replace(/[^\p{L}\p{N}%$]/gu, '');
const isNum = (w) => /\d/.test(clean(w));

/** Tipo de cada palavra na composição: 'num' | 'key' | 'small'. */
export function wordRole(w, i, words) {
  if (isNum(w)) return 'num';
  const b = bare(w);
  if (!b) return 'small';
  if (STRONG.test(b)) return 'key';
  if (SMALL.has(b)) return 'small';
  if (b.length >= 5) return 'key';
  // palavra curta no fim da frase também ganha destaque ("to do?")
  return i === words.length - 1 && b.length >= 3 ? 'key' : 'small';
}

function wordsOf(seg) {
  const ws = seg?.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text || '' }];
  return ws.filter((w) => !w.removed && clean(w)).map((w) => ({ ...w, start: Number(w.start), end: Number(w.end) })).filter((w) => Number.isFinite(w.start));
}

/** Corta as frases em pedaços de até `max` palavras (nas pausas e pontuações). */
export function phraseChunks(segments, max = 8) {
  const out = [];
  for (const s of segments || []) {
    const ws = wordsOf(s);
    let cur = [];
    const flush = () => { if (cur.length) out.push(cur); cur = []; };
    ws.forEach((w, i) => {
      const prev = ws[i - 1];
      if (cur.length && prev && w.start - prev.end >= 0.45) flush();
      else if (cur.length >= max) {
        // corte pelo tamanho: o pedaço não termina em palavra de ligação ("… sempre o | tempo")
        let k = cur.length;
        while (k > 1 && wordRole(cur[k - 1], k - 1, cur) === 'small' && SMALL.has(bare(cur[k - 1]))) k -= 1;
        const carry = cur.slice(k);
        cur = cur.slice(0, k);
        flush();
        cur = carry;
      }
      cur.push(w);
      if (/[.!?;:]$/.test(clean(w)) && cur.length >= 3) flush();
    });
    flush();
  }
  return out;
}

/**
 * Linhas da composição: as palavras de ligação seguidas formam uma linha pequena; cada
 * palavra-chave é uma linha grande (duas curtas podem dividir a linha); número + unidade
 * curta ("50 bits") ficam juntos.
 */
export function composeLines(words) {
  const lines = [];
  words.forEach((w, i) => {
    const role = wordRole(w, i, words);
    const last = lines[lines.length - 1];
    const text = clean(w);
    // unidade logo depois do número ("50 bits", "3 dicas", "10 mil") fica na mesma tarja
    if (last && last.role === 'num' && last.words.length === 1 && !isNum(w) && !SMALL.has(bare(w)) && bare(w).length <= 7) { last.unit = text; last.words.push(w); return; }
    if (role === 'small') {
      if (last && last.role === 'small' && (last.text + ' ' + text).length <= 22) { last.text += ` ${text}`; last.words.push(w); return; }
      lines.push({ role, text, words: [w] });
      return;
    }
    if (role === 'key' && last && last.role === 'key' && last.words.length === 1 && (last.text + text).length <= 10) { last.text += ` ${text}`; last.words.push(w); return; }
    lines.push({ role, text, words: [w] });
  });
  return lines;
}

// Aparência de cada tema: cores das palavras, da tarja do número, do destaque e do rabisco.
// O fundo é uma imagem (server/assets/elements/backgrounds/<tema>.jpg) que entra como camada
// de mídia por baixo dos textos, com um leve movimento de câmera.
const L = (big, small, num, numBg, accent, doodle, shadowColor = null, extra = {}) => ({
  big, small, num, numBg, accent, doodle, shadow: Boolean(shadowColor), shadowColor: shadowColor || '#000000', bg: true, ...extra,
});
const THEME_LOOK = {
  'preto-raios': L('#FFFFFF', '#A6A6A6', '#000000', '#FFFFFF', '#FFE14D', '#FFFFFF', '#000000'),
  'grade-ondulada': L('#111111', '#555555', '#FFFFFF', '#111111', '#2F5BFF', '#111111', null, { light: true }),
  'azul-grade': L('#FFFFFF', '#C9D2FF', '#1F35E0', '#FFFFFF', '#FFE14D', '#FFE14D', '#0B1890'),
  'cinza-manchas': L('#111111', '#3A3A3A', '#FFFFFF', '#111111', '#E10600', '#111111', null, { light: true }),
  'holofote-cone': L('#FFFFFF', '#BDBDBD', '#000000', '#FFFFFF', '#FFD27A', '#FFD27A', '#000000'),
  lampada: L('#FFFFFF', '#9A9A9A', '#000000', '#FFFFFF', '#FFE9A8', '#FFFFFF', '#000000'),
  'azul-orbita': L('#FFFFFF', '#9FB6E8', '#0B2463', '#FFFFFF', '#7CC4FF', '#7CC4FF', '#000000'),
  'lilas-flor': L('#FFFFFF', '#F1E8FF', '#FFFFFF', '#3B2FD6', '#FFE38A', '#FFE38A', '#1A0E45'),
  escuro: L('#FFFFFF', '#A6A6A6', '#0B0B0B', '#FF6B35', '#FF7A2E', '#FF7A2E', '#000000'),
  branco: L('#111111', '#6E6E6E', '#FFFFFF', '#111111', '#FF5A1F', '#FF5A1F', null, { light: true }),
  vsl: L('#FFFFFF', '#A59CC4', '#FFFFFF', '#8B5CF6', '#B9A3FF', '#B9A3FF', null, { glass: true }),
  'azul-claro': L('#0D1B3D', '#5B6B8C', '#FFFFFF', '#2F7BFF', '#2F7BFF', '#2F7BFF', null, { light: true }),
  'papel-cinza': L('#111111', '#4E4A44', '#FFFFFF', '#111111', '#B3261E', '#111111', null, { light: true }),
  'branco-zigzag': L('#111111', '#6E6E6E', '#FFFFFF', '#E10600', '#E10600', '#111111', null, { light: true }),
  video: { big: '#FFFFFF', small: '#F2F2F2', num: '#111111', numBg: '#FFFFFF', shadow: true, shadowColor: '#000000', accent: '#4DA3FF', doodle: '#FFD23F' },
};
/** Temas com fundo próprio (= imagens em assets/elements/backgrounds). */
export const SCENE_BACKGROUNDS = Object.keys(THEME_LOOK).filter((k) => THEME_LOOK[k].bg);
const ROTATION = ['preto-raios', 'azul-grade', 'grade-ondulada', 'lilas-flor', 'holofote-cone', 'cinza-manchas', 'azul-orbita', 'lampada', 'escuro', 'branco', 'vsl', 'azul-claro', 'papel-cinza', 'branco-zigzag'];

/** Fundo próprio (mídia da pessoa) cobrindo o quadro; vídeo em loop e sem som. */
function customBackground(cb, start, end, aspect) {
  const ar = Number(cb.ar) > 0 ? Number(cb.ar) : 16 / 9;
  const cover = Math.max(1, 1 / (aspect * ar)) * 1.04;
  return {
    kind: cb.kind === 'video' ? 'video' : 'image', mode: 'pip', custom: cb.ref, cx: 0.5, cy: 0.5, scale: +cover.toFixed(3),
    start: +start.toFixed(2), duration: +(end - start).toFixed(2), animIn: 'fade', animOut: 'fade', animDur: 0.3,
    ...(cb.kind === 'video' ? { loop: true, muted: true, volume: 0 } : { motion: 'drift', motionSpeed: 1, motionAmp: 0.6 }), layer: 10,
  };
}

/**
 * Fundo de uma cena: camada de imagem que cobre o quadro (um pouco maior, para o movimento
 * de câmera não mostrar borda). Null quando a cena é sobre o vídeo.
 */
export function sceneBackground(theme, start, end, aspect) {
  if (!THEME_LOOK[theme]?.bg) return null;
  const cover = Math.max(1, (9 / 16) / aspect) * 1.07; // largura do quadro que cobre tudo
  const anim = ANIMATED_BACKGROUNDS.has(theme);
  return {
    kind: anim ? 'video' : 'image', mode: 'pip', element: `backgrounds/${theme}`, cx: 0.5, cy: 0.5, scale: +cover.toFixed(3),
    start: +start.toFixed(2), duration: +(end - start).toFixed(2), animIn: 'fade', animOut: 'fade', animDur: 0.3,
    // fundo animado: vídeo em loop, sem som; o fixo ganha um leve movimento de câmera
    ...(anim ? { loop: true, muted: true, volume: 0 } : { motion: 'drift', motionSpeed: 1, motionAmp: 0.6 }), layer: 10,
  };
}

/**
 * Monta as camadas de uma cena.
 * @param {Array} words palavras (com start/end) do pedaço
 * @param {{theme:string,start:number,end:number,aspect:number}} o
 */
export function sceneLayers(words, { theme, start, end, aspect, index = 0 }) {
  const T = THEME_LOOK[theme] || THEME_LOOK.video;
  const lines = composeLines(words);
  // Bloco tipográfico: coluna de largura fixa; as palavras-chave crescem até ocupar a mesma
  // largura (medida real das letras, a mesma do render), com teto de tamanho. Linhas
  // alinhadas pela mesma borda e ritmo vertical constante.
  const col = (T.glass ? 0.7 : 0.8) * aspect; // largura da coluna, em frações da ALTURA
  const KEY_MAX = 0.105;
  const NUM_PAD = 0.16;
  const fontOf = (l, accent) => (l.role === 'small' ? 'garamond-400i' : accent ? 'inter-900i' : 'inter-900');
  const trackOf = (l) => (l.role === 'small' ? 0 : l.role === 'num' ? -20 : -30);
  const keys0 = lines.filter((l) => l.role === 'key');
  const star = keys0.length ? keys0.reduce((a, b) => (STRONG.test(b.text) || b.text.length > a.text.length ? b : a)) : null;
  const texts = lines.map((ln) => (ln.role === 'num' && ln.unit ? `${ln.text} ${ln.unit}` : ln.text));
  const em = (k) => textWidthEm(texts[k], fontOf(lines[k], lines[k] === star && T.accent), trackOf(lines[k]));
  // largura do bloco: a da coluna, ou menos quando todas as chaves são curtas
  const bigW = lines.map((l, k) => (l.role === 'small' ? 0 : em(k) * (l.role === 'num' ? KEY_MAX * 0.9 : KEY_MAX) + (l.role === 'num' ? 2 * NUM_PAD * KEY_MAX * 0.9 : 0)));
  const B = Math.min(col, Math.max(col * 0.55, ...bigW));
  const sized = lines.map((ln, k) => {
    const w1 = em(k);
    let size;
    if (ln.role === 'small') size = Math.min(0.044, B / w1);
    else if (ln.role === 'num') size = Math.min(KEY_MAX * 0.9, B / (w1 + 2 * NUM_PAD));
    else size = Math.min(KEY_MAX, B / w1);
    size = +size.toFixed(4);
    const w = w1 * size + (ln.role === 'num' ? 2 * NUM_PAD * size : 0);
    return { ...ln, text: texts[k], size, w: +w.toFixed(4) };
  });
  const gap = 0.007;
  const hOf = (l) => l.size * (l.role === 'small' ? 1.3 : l.role === 'num' ? 1.42 : 1.04);
  const total = sized.reduce((a, l) => a + hOf(l), 0) + gap * (sized.length - 1);
  const cy = theme === 'video' ? 0.6 : 0.47;
  const align = index % 2 ? 'center' : 'left';
  const blockW = Math.max(...sized.map((l) => l.w)); // em frações da altura
  const left = 0.5 - blockW / aspect / 2; // borda esquerda do bloco (fração da largura)
  let y = cy - total / 2;
  const layers = [];
  // VSL: card de vidro escuro atrás do bloco de texto (borda e brilho lilás)
  if (T.glass) {
    layers.push({ kind: 'shape', shape: 'rect', x: 0.5, y: +cy.toFixed(4), w: +(blockW / aspect + 0.12).toFixed(4), h: +(total + 0.07).toFixed(4), color: '#1F123D', opacity: 0.82, radius: 0.09,
      stroke: true, strokeColor: '#8B5CF6', strokeW: 0.0016, shadow: true, shadowColor: '#8B5CF6', shadowOpacity: 0.35, shadowDist: 0, shadowBlur: 0.02,
      start: +start.toFixed(2), end, animIn: 'zoom', animOut: 'fade' });
  }
  // uma animação só para as palavras-chave da cena (alterna entre cenas): mais limpo
  const keyAnim = index % 2 ? 'letras-pop' : 'letras-subir';
  const sh = T.shadow ? { shadow: true, shadowColor: T.shadowColor, shadowOpacity: theme === 'escuro' ? 0.55 : 0.7, shadowDist: 0, shadowBlur: theme === 'escuro' ? 0.01 : 0.006 } : {};
  for (const l of sized) {
    const h = hOf(l);
    const x = align === 'left' ? left + l.w / aspect / 2 : 0.5;
    l.x = +x.toFixed(4);
    l.y = +(y + h / 2).toFixed(4);
    l.h = +h.toFixed(4);
    const at = Math.max(start, l.words[0].start - 0.04);
    const base = { text: l.text, x: l.x, y: l.y, size: l.size, start: +at.toFixed(2), end: +end.toFixed(2), align: 'center', animOut: 'fade' };
    if (l.role === 'small') {
      layers.push({ ...base, font: 'garamond', fontStyle: '400i', color: T.small, box: 'none', stroke: false, animIn: 'letras-desfoque', ...sh });
    } else if (l.role === 'num') {
      layers.push({ ...base, font: 'inter', fontStyle: '900', color: T.num, box: 'box', boxColor: T.numBg, bg: true, bgColor: T.numBg, bgMode: 'lines', pad: NUM_PAD, radius: 0.08, stroke: false, tracking: -20, animIn: 'pop' });
    } else {
      // a principal ganha a cor de destaque (e o rabisco/objeto da cena, em sceneElements)
      const accent = l === sized.find((x) => x.words === star?.words) && T.accent;
      layers.push({ ...base, font: 'inter', fontStyle: accent ? '900i' : '900', color: accent || T.big, box: 'none', stroke: false, tracking: -30, animIn: keyAnim, ...sh,
        // brilho na cor do destaque só em fundo escuro (no claro fica borrado)
        ...(accent && !T.light ? { shadow: true, shadowColor: accent, shadowOpacity: 0.6, shadowDist: 0, shadowBlur: 0.012 } : {}) });
    }
    y += h + gap;
  }
  return { layers, lines: sized, star: star ? sized.find((x) => x.words === star.words) : null };
}

/**
 * Escolhe as cenas e devolve as camadas e os sons.
 * @returns {{scenes:Array<{start,end,theme,words}>, layers:Array, elements:Array, sfx:Array<{t,type,volume,why}>}}
 * `elements`: objetos 3D e rabiscos (camadas de imagem por cima das cenas, ver sceneElements.js).
 */
export function kineticPlan({ segments, dur, aspect = 9 / 16, theme = 'auto', amount = 'chave', existing = [], available = null, backgrounds = null } = {}) {
  // fundos próprios (mídias da pessoa): [{ ref, kind: 'image'|'video', ar: altura/largura, light }]
  const custom = Array.isArray(backgrounds) && backgrounds.length ? backgrounds : null;
  const total = Number(dur) || 0;
  const chunks = phraseChunks(segments, amount === 'muitos' ? 7 : 8).filter((c) => c.length >= 2);
  const scored = chunks.map((c, i) => ({
    words: c,
    score: emphasisScore({ start: c[0].start, end: c[c.length - 1].end, words: c }, i > 0 ? chunks[i - 1][chunks[i - 1].length - 1].end : NaN, i),
  }));
  const minGap = amount === 'muitos' ? 0.3 : 4;
  const busy = (existing || []).filter((l) => Number.isFinite(Number(l.start)));
  const picked = [];
  const order = amount === 'muitos' ? scored : [...scored].sort((a, b) => b.score - a.score);
  const limit = amount === 'muitos' ? 999 : Math.max(1, Math.round((total || 30) / 7));
  for (const c of order) {
    if (picked.length >= limit) break;
    if (amount !== 'muitos' && c.score < 2) continue;
    const s = c.words[0].start;
    const e = c.words[c.words.length - 1].end;
    if (picked.some((p) => s < p.e + minGap && e > p.s - minGap)) continue;
    if (busy.some((l) => s < Number(l.end) && e > Number(l.start))) continue;
    picked.push({ ...c, s, e });
  }
  picked.sort((a, b) => a.s - b.s);
  const scenes = [];
  const layers = [];
  const elements = [];
  const sfx = [];
  picked.forEach((c, i) => {
    const next = picked[i + 1];
    const start = Math.max(0, c.s - 0.08);
    const end = Math.min(total || Infinity, next ? next.s - 0.12 : Infinity, c.e + 0.45);
    if (end - start < 0.6) return;
    const cb = custom ? custom[scenes.length % custom.length] : null;
    // fundo próprio: as cores do texto saem da paleta clara ou escura, pelo brilho dele
    const th = cb ? (cb.light ? 'branco' : 'escuro') : theme === 'auto' ? ROTATION[scenes.length % ROTATION.length] : (THEME_LOOK[theme] ? theme : 'video');
    const { layers: ls, lines, star } = sceneLayers(c.words, { theme: th, start, end, aspect, index: scenes.length });
    scenes.push({ start: +start.toFixed(2), end: +end.toFixed(2), theme: th, words: c.words.length });
    layers.push(...ls.map((l) => ({ ...l, scene: scenes.length })));
    const look = THEME_LOOK[th] || THEME_LOOK.video;
    const bg = cb ? customBackground(cb, Math.max(0, start - 0.1), end, aspect) : sceneBackground(th, Math.max(0, start - 0.1), end, aspect);
    if (bg) elements.push({ ...bg, scene: scenes.length });
    const el = sceneElements({ words: c.words, lines, star, theme: th, start, end, aspect, index: scenes.length - 1, available, tint: look.doodle, glass: look.glass === true });
    elements.push(...el.elements.map((e) => ({ ...e, scene: scenes.length })));
    sfx.push(...el.sfx);
    // sons premium: passagem de ar ao abrir a cena de fundo, batida grave nas palavras
    // grandes, tecla discreta nas pequenas, saída suave ao voltar para o vídeo
    const add = (t, kind, why, vol = 1) => {
      const s = premiumSfx(kind, available);
      if (s) sfx.push({ t: +Math.max(0, t).toFixed(3), type: s.type, volume: +(s.volume * vol).toFixed(2), why });
    };
    if (th !== 'video') add(start, 'transition', 'cena entrando', 0.85);
    lines.forEach((l) => {
      const t = Math.max(start, l.words[0].start - 0.02);
      if (l.role === 'small') add(t, 'text', 'palavra entrando', 0.75);
      else if (l.role === 'num') add(t, 'number', 'número');
      // sobre o vídeo, só a palavra mais forte leva a batida (as outras, a tecla): não cansa
      else if (th === 'video' && l !== (star || lines.find((x) => x.role === 'key'))) add(t, 'text', 'palavra entrando', 0.85);
      else add(t, 'strong', 'palavra-chave', 0.85);
    });
    if (th !== 'video' && (!next || next.s - end > 0.4)) {
      const s = available && !available.has('pr-out') ? null : { type: 'pr-out', volume: 0.7 };
      if (s) sfx.push({ t: +end.toFixed(3), ...s, why: 'cena saindo' });
    }
  });
  // sons colados demais atrapalham: no máximo um a cada 0,16 s (fica o mais forte)
  sfx.sort((a, b) => a.t - b.t || b.volume - a.volume);
  const clean = [];
  for (const s of sfx) {
    const last = clean[clean.length - 1];
    if (last && s.t - last.t < 0.16) { if (s.volume > last.volume) clean[clean.length - 1] = s; continue; }
    clean.push(s);
  }
  return { scenes, layers, elements, sfx: clean };
}
