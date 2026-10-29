import { easeValue } from './easing.js';
// Texto livre na timeline (como o "Texto" do CapCut) e efeitos de vídeo por momento.
// Compartilhado pelo site (editor + prévia) e pelo servidor (render).
import { isFontStyle } from './captionStyle.js';

/** Animações de entrada e saída de um texto. */
export const TEXT_ANIMS_IN = {
  none: 'Nenhuma', fade: 'Fade', pop: 'Pop', zoom: 'Zoom', 'slide-up': 'Subir', 'slide-left': 'Entrar da direita', typewriter: 'Máquina de escrever', words: 'Palavra por palavra',
  'letras-subir': 'Letras subindo', 'letras-pop': 'Letras pulando', 'letras-desfoque': 'Letras entrando do desfoque',
  'letras-desfoque-subir': 'Letras subindo do desfoque', 'letras-mola': 'Letras com mola (passa do ponto)',
  'letras-queda': 'Letras caindo e quicando', 'letras-escala': 'Letras assentando (zoom suave)',
};
/** Animações por letra: cada letra entra no seu tempo (escalonado), como os motion de agência. */
/** Animações por letra que são amostradas em passos no render (curva com overshoot ou desfoque). */
export const LETTER_SAMPLED = ['letras-desfoque-subir', 'letras-mola', 'letras-queda', 'letras-escala'];
export const LETTER_ANIMS = ['letras-subir', 'letras-pop', 'letras-desfoque', ...LETTER_SAMPLED];
/** Duração de cada letra (s) e o espaçamento entre as letras, pela duração do texto. */
export function letterTiming(l, count) {
  const dur = Math.max(0.2, Number(l.end) - Number(l.start) || 3);
  const d = Math.min(0.42, dur * 0.3);
  const total = Math.min(1.4, dur * 0.5);
  const stagger = Math.max(0.02, Math.min(0.07, (total - d) / Math.max(1, count - 1)));
  return { d: +d.toFixed(3), stagger: +stagger.toFixed(4) };
}
/**
 * Quando cada letra entra (animações por letra). Para cada linha: [{ u, t, d }] — t = segundos
 * desde o começo do texto (null nos espaços). A mesma conta na prévia e no render. Puro.
 */
export function letterPlan(l, lines) {
  if (!LETTER_ANIMS.includes(l?.animIn)) return null;
  const units = lines.map((ln) => [...String(ln)]);
  const count = units.flat().filter((u) => u.trim()).length || 1;
  const { d, stagger } = letterTiming(l, count);
  let k = 0;
  return units.map((us) => us.map((u) => (u.trim() ? { u, t: +(k++ * stagger).toFixed(4), d } : { u, t: null, d })));
}
/** Progresso de uma letra no tempo `tRel` (0..1) e os valores da animação. Puro: prévia e render. */
export function letterFrame(anim, p) {
  const e = 1 - (1 - p) * (1 - p) * (1 - p); // ease-out cúbico
  if (anim === 'letras-subir') return { dy: (1 - e) * 0.06, scale: 1, blur: 0, alpha: e };
  // sobe do desfoque: sobe, desfoca e aumenta junto, e assenta
  if (anim === 'letras-desfoque-subir') return { dy: (1 - e) * 0.05, scale: 1.12 - 0.12 * e, blur: (1 - e) * 0.012, alpha: e };
  // mola: passa do ponto (overshoot) e assenta; dy/escala seguem a mesma curva "back"
  if (anim === 'letras-mola') return { dy: 0, scale: Math.max(0, easeValue('back', p)), blur: 0, alpha: Math.min(1, p * 3) };
  // queda: entra de cima acelerando, ultrapassa a linha e volta
  if (anim === 'letras-queda') return { dy: (1 - easeValue('back', p)) * -0.1, scale: 1, blur: 0, alpha: Math.min(1, p * 2.5) };
  // assenta de uma escala maior, sem deslocar
  if (anim === 'letras-escala') return { dy: 0, scale: 1.35 - 0.35 * e, blur: 0, alpha: e };
  if (anim === 'letras-pop') {
    // 0 → 115% → 100%, em dois trechos lineares (como os \t do libass)
    const s = p < 0.6 ? (p / 0.6) * 1.15 : 1.15 - ((p - 0.6) / 0.4) * 0.15;
    return { dy: 0, scale: Math.max(0, s), blur: 0, alpha: Math.min(1, p * 3) };
  }
  return { dy: 0, scale: 1, blur: (1 - e) * 0.012, alpha: e }; // desfoque: fração da altura
}
/**
 * Passos de uma animação por letra amostrada: [{ t0, t1, f }] — `f` é o quadro (letterFrame) de
 * t0 a t1 (segundos desde o começo da letra). O último passo vai de `d` até o fim (t1 = null).
 * O render usa estes passos (ASS não tem curvas); a prévia usa letterFrame direto. Puro.
 */
export function letterSegments(anim, d, steps = 10) {
  const out = [];
  for (let k = 0; k <= steps; k++) {
    const p = k / steps;
    out.push({ t0: +(d * p).toFixed(4), t1: k < steps ? +(d * (k + 1) / steps).toFixed(4) : null, f: letterFrame(anim, p) });
  }
  return out;
}
/** Entradas que revelam o texto aos poucos (letra a letra / palavra a palavra). */
export const REVEAL_ANIMS = ['typewriter', 'words'];
/**
 * Quando cada pedaço do texto aparece (máquina de escrever / palavra por palavra): para cada
 * linha, [{ u: texto, t: segundos desde o começo do texto | null (espaço) }]. A mesma conta
 * na prévia e no render. null quando o texto não tem essa entrada. Puro.
 */
export function revealPlan(l, lines) {
  if (!REVEAL_ANIMS.includes(l?.animIn)) return null;
  const dur = Math.max(0.2, Number(l.end) - Number(l.start) || 3);
  const total = Math.min(2, dur * 0.6);
  const units = lines.map((ln) => (l.animIn === 'words' ? String(ln).split(/(\s+)/).filter(Boolean) : [...String(ln)]));
  const count = units.flat().filter((u) => u.trim()).length || 1;
  let k = 0;
  return units.map((us) => us.map((u) => ({ u, t: u.trim() ? +((k++ * total) / count).toFixed(3) : null })));
}
export const TEXT_ANIMS_OUT = { none: 'Nenhuma', fade: 'Fade', zoom: 'Encolher' };
/** Fundo do texto: só contorno, caixa sólida ou nada. */
export const TEXT_BOXES = { outline: 'Contorno', box: 'Caixa', none: 'Sem fundo' };

/** Altura da linha do texto (em "em", igual ao line-height do CSS da prévia). */
export const TEXT_LINE_H = 1.15;
export const TEXT_PAD_DEFAULT = 0.28;
/**
 * Medidas da caixa de cada linha, em "em" (tamanho da letra) — a MESMA conta na prévia e
 * no render. pad = folga dos lados (Tamanho do fundo); em cima/embaixo é 43% disso.
 * radius 0–1 = canto reto até a ponta toda arredondada (pílula).
 */
export function textBoxMetrics(l) {
  const L = textLook(l);
  const box = L.bg;
  const pad = box ? num(l.pad, 0, 1.2, TEXT_PAD_DEFAULT) : 0;
  // fundo inteiro (uma forma atrás do bloco): a folga é igual nos 4 lados e não mexe na
  // altura das linhas (a entrelinha muda só o texto)
  const block = box && L.bgMode === 'block';
  const padY = block ? pad : pad * 0.43;
  const boxH = TEXT_LINE_H + 2 * padY;
  return { padX: pad, padY, boxH, block, pitch: box && !block ? boxH : TEXT_LINE_H, r: box ? num(l.radius, 0, 1, 0) * (block ? 1 : boxH / 2) : 0 };
}

/**
 * Modelos de texto prontos (os mais usados em Reels/Shorts). Cada um é só um conjunto
 * de valores iniciais — depois tudo pode ser mudado no texto.
 * x/y: centro do texto em fração da tela · size: altura da letra em fração da altura.
 */
export const TEXT_TEMPLATES = {
  titulo: { label: 'Título de capítulo', text: 'CAPÍTULO 1', font: 'montserrat', size: 0.062, color: '#FFFFFF', box: 'box', boxColor: '#111111', x: 0.5, y: 0.16, animIn: 'slide-up', animOut: 'fade' },
  episodio: { label: 'Episódio', text: 'EPISÓDIO 1', font: 'bebas', size: 0.05, color: '#111111', box: 'box', boxColor: '#FFFFFF', x: 0.5, y: 0.1, animIn: 'pop', animOut: 'fade' },
  chamada: { label: 'Chamada (CTA)', text: 'Comenta AQUI 👇', font: 'anton', size: 0.06, color: '#FFE24B', box: 'outline', boxColor: '#000000', x: 0.5, y: 0.74, animIn: 'pop', animOut: 'zoom' },
  destaque: { label: 'Número em destaque', text: '3 DICAS', font: 'archivo', size: 0.09, color: '#FF6B35', box: 'outline', boxColor: '#FFFFFF', x: 0.5, y: 0.3, animIn: 'zoom', animOut: 'fade' },
  nome: { label: 'Nome (lower third)', text: 'Seu Nome\nEspecialista', font: 'poppins', size: 0.04, color: '#FFFFFF', box: 'box', boxColor: '#FF6B35', x: 0.32, y: 0.84, animIn: 'slide-left', animOut: 'fade' },
  citacao: { label: 'Citação', text: '“Uma frase marcante”', font: 'playfair', size: 0.05, color: '#FFFFFF', box: 'outline', boxColor: '#000000', x: 0.5, y: 0.5, animIn: 'fade', animOut: 'fade' },
  neon: { label: 'Neon', text: 'NOVIDADE', font: 'righteous', size: 0.07, color: '#22D3EE', box: 'outline', boxColor: '#0B3B47', x: 0.5, y: 0.4, animIn: 'fade', animOut: 'fade' },
  simples: { label: 'Texto simples', text: 'Seu texto aqui', font: 'poppins', size: 0.045, color: '#FFFFFF', box: 'outline', boxColor: '#000000', x: 0.5, y: 0.5, animIn: 'fade', animOut: 'fade' },
};

/** Efeitos de vídeo aplicados só nos momentos escolhidos (faixa EFEITOS da timeline). */
export const VIDEO_FX = {
  bw: 'Preto e branco',
  retro: 'Retrô',
  nostalgic: 'Nostálgico (sépia)',
  grain: 'Grão de filme',
  vignette: 'Vinheta',
  film: 'Moldura de filme',
  blur: 'Desfoque',
  glow: 'Brilho',
  vhs: 'VHS',
  glitch: 'Glitch',
  shake: 'Tremor',
  strobe: 'Flash (estroboscópio)',
  negative: 'Negativo',
  mirror: 'Espelho',
  pixel: 'Pixelado',
  cold: 'Frio',
  warm: 'Quente',
  saturated: 'Cores vivas',
  // ── como o painel do Film Impact (categorias do Premiere) ──
  blursoft: 'Desfoque suave',
  bokeh: 'Desfoque bokeh',
  chblur: 'Desfoque de canal',
  motionblur: 'Desfoque de movimento',
  sharpen: 'Nitidez',
  faded: 'Desbotado',
  contrast: 'Alto contraste',
  tealorange: 'Teal & orange',
  cinematic: 'Cinematográfico',
  desat: 'Dessaturar',
  tint: 'Duotone azul',
  brighten: 'Clarear',
  darken: 'Escurecer',
  exposure: 'Exposição +',
  vflip: 'Espelho vertical',
  fisheye: 'Olho de peixe',
  tilt: 'Inclinar',
  posterize: 'Posterizar',
  edges: 'Contorno (bordas)',
  sketch: 'Desenho a lápis',
  emboss: 'Relevo',
  noisehard: 'Ruído forte',
  goldlight: 'Luz dourada',
  zoomfix: 'Aumentar (zoom 125%)',
  zoomfix2: 'Aproximar forte (zoom 150%)',
  sway: 'Balançar',
  handheld: 'Câmera na mão',
  shakehard: 'Tremor forte',
  persp3d: 'Perspectiva 3D',
  tiltr: 'Inclinar para a direita',
  wideangle: 'Grande-angular',
  rgbsplit: 'Divisão RGB',
  pixelbig: 'Pixelado forte',
  grid3: 'Grade (terços)',
  frame: 'Moldura branca',
  black: 'Tela preta',
  white: 'Tela branca',
  letterbox: 'Faixas de cinema 2.35',
  pillarbox: 'Faixas laterais',
  pulse: 'Pulso de luz',
  coolglow: 'Brilho frio',
  scanlines: 'Linhas de TV',
  static: 'Estática',
  summer: 'Verão',
  winter: 'Inverno',
  matrix: 'Matrix (verde)',
  noir: 'Noir',
  popart: 'Pop art',
};
/** Aproximação do efeito na prévia do editor (CSS). O render usa FFmpeg. */
export const VIDEO_FX_CSS = {
  bw: 'grayscale(1)',
  retro: 'sepia(0.35) contrast(1.1) saturate(0.85)',
  nostalgic: 'sepia(0.85) contrast(1.05)',
  grain: 'contrast(1.05)',
  vignette: 'brightness(0.92)',
  film: 'contrast(1.08)',
  blur: 'blur(6px)',
  glow: 'brightness(1.12) saturate(1.35)',
  vhs: 'saturate(1.3) contrast(1.1)',
  glitch: 'hue-rotate(25deg) contrast(1.2)',
  shake: '',
  strobe: '',
  negative: 'invert(1)',
  mirror: '',
  pixel: '',
  cold: 'hue-rotate(-12deg) saturate(0.9) brightness(1.03)',
  warm: 'sepia(0.25) saturate(1.15)',
  saturated: 'saturate(1.9) contrast(1.08)',
  blursoft: 'blur(2px)',
  bokeh: 'blur(8px) brightness(1.05) saturate(1.2)',
  chblur: 'blur(1.5px) hue-rotate(8deg) saturate(1.3)',
  motionblur: 'blur(3px)',
  sharpen: 'contrast(1.15) saturate(1.05)',
  faded: 'contrast(0.82) saturate(0.7) brightness(1.05)',
  contrast: 'contrast(1.45) saturate(1.1)',
  tealorange: 'sepia(0.25) saturate(1.4) hue-rotate(-8deg)',
  cinematic: 'contrast(1.15) saturate(0.85) sepia(0.12)',
  desat: 'saturate(0.4)',
  tint: 'grayscale(1) sepia(1) hue-rotate(170deg) saturate(2.5)',
  brighten: 'brightness(1.2)',
  darken: 'brightness(0.78)',
  exposure: 'brightness(1.4)',
  vflip: '',
  fisheye: 'contrast(1.02)',
  tilt: '',
  posterize: 'contrast(1.4) saturate(1.4)',
  edges: 'contrast(2.2) saturate(1.5)',
  sketch: 'grayscale(1) contrast(2.5) brightness(1.4)',
  emboss: 'grayscale(1) contrast(1.6)',
  noisehard: 'contrast(1.1)',
  goldlight: 'sepia(0.3) brightness(1.08) saturate(1.25)',
  zoomfix: '',
  zoomfix2: '',
  sway: '',
  handheld: '',
  shakehard: '',
  persp3d: '',
  tiltr: '',
  wideangle: 'contrast(1.02)',
  rgbsplit: 'saturate(1.4) hue-rotate(6deg)',
  pixelbig: '',
  grid3: '',
  frame: '',
  black: 'brightness(0)',
  white: 'brightness(0) invert(1)',
  letterbox: 'contrast(1.05)',
  pillarbox: '',
  pulse: 'brightness(1.12)',
  coolglow: 'hue-rotate(-14deg) brightness(1.08) saturate(1.1)',
  scanlines: 'contrast(1.05)',
  static: 'saturate(0.3) contrast(1.2)',
  summer: 'sepia(0.2) saturate(1.4) brightness(1.04)',
  winter: 'hue-rotate(-18deg) saturate(0.75)',
  matrix: 'hue-rotate(60deg) saturate(1.2) contrast(1.15)',
  noir: 'grayscale(1) contrast(1.5) brightness(0.95)',
  popart: 'saturate(2.2) contrast(1.4)',
};

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Alinhamento do parágrafo (como os botões do Premiere) e vertical do bloco. */
export const TEXT_ALIGNS = ['left', 'center', 'right', 'justify-left', 'justify-center', 'justify-right', 'justify-all'];
export const TEXT_VALIGNS = ['top', 'center', 'bottom'];
/**
 * Aparência e tipografia de um texto (como o Essential Graphics do Premiere), com os
 * padrões dos textos antigos (`box`: contorno/caixa). A MESMA leitura na prévia e no render.
 * Medidas em px ficam em fração da ALTURA do quadro (como `size`); tracking em 1/1000 em.
 */
export function textLook(l) {
  const box = l?.box;
  const legacyStroke = l?.kind !== 'shape' && (box === 'outline' || box == null); // forma nasce sem contorno
  const hasNew = (k) => l != null && l[k] != null;
  const size = num(l?.size, 0.015, 0.2, 0.05);
  return {
    fill: l?.fill !== false,
    fillColor: HEX.test(l?.color) ? l.color : '#FFFFFF',
    stroke: hasNew('stroke') ? l.stroke === true : legacyStroke,
    strokeColor: HEX.test(l?.strokeColor) ? l.strokeColor : HEX.test(l?.boxColor) ? l.boxColor : '#000000',
    // largura do contorno (fração da altura); o padrão antigo era 3,5% do tamanho da letra
    strokeW: hasNew('strokeW') ? num(l.strokeW, 0, 0.05, 0) : +(size * 0.035).toFixed(5),
    strokePos: l?.strokePos === 'center' ? 'center' : 'outer',
    bg: hasNew('bg') ? l.bg === true : box === 'box',
    bgColor: HEX.test(l?.bgColor) ? l.bgColor : HEX.test(l?.boxColor) ? l.boxColor : '#000000',
    bgOpacity: num(l?.bgOpacity, 0, 1, 1),
    // 'lines' = uma caixa por linha (junto com o texto); 'block' = uma forma atrás do bloco
    bgMode: l?.bgMode === 'block' || l?.bgMode === 'lines' ? l.bgMode : hasNew('bg') ? 'block' : 'lines',
    shadow: l?.shadow === true,
    shadowColor: HEX.test(l?.shadowColor) ? l.shadowColor : '#000000',
    shadowOpacity: num(l?.shadowOpacity, 0, 1, 0.75),
    shadowAngle: num(l?.shadowAngle, -360, 360, 135),
    shadowDist: num(l?.shadowDist, 0, 0.1, 0.004),
    shadowBlur: num(l?.shadowBlur, 0, 0.05, 0.004),
    bold: l?.bold === true,
    italic: l?.italic === true,
    caps: l?.caps === true,
    smallCaps: l?.smallCaps === true,
    underline: l?.underline === true,
    script: l?.script === 'super' || l?.script === 'sub' ? l.script : null,
    align: TEXT_ALIGNS.includes(l?.align) ? l.align : 'center',
    valign: TEXT_VALIGNS.includes(l?.valign) ? l.valign : 'center',
    tracking: num(l?.tracking, -500, 1000, 0),
    leading: num(l?.leading, -0.1, 0.2, 0),
    baseline: num(l?.baseline, -0.1, 0.1, 0),
    rot: num(l?.rot, -3600, 3600, 0),
    opacity: num(l?.opacity, 0, 1, 1),
    scale: num(l?.scale, 0.1, 5, 1),
  };
}
/** Alinhamento de cada linha: o "justificado" alinha as linhas pela regra do Premiere. */
export function lineAlign(align, isLast) {
  if (align === 'left' || align === 'center' || align === 'right') return align;
  if (align === 'justify-all') return 'left';
  return isLast ? align.replace('justify-', '') : 'left';
}
/** Tamanho efetivo (fração da altura) com escala e sobrescrito/subscrito. */
export function textEm(l) {
  const L = textLook(l);
  return num(l?.size, 0.015, 0.2, 0.05) * L.scale * (L.script ? 0.62 : 1);
}
/** Texto que aparece (TODAS MAIÚSCULAS). */
export function textShown(l) {
  const t = String(l?.text ?? '');
  return textLook(l).caps ? t.toUpperCase() : t;
}
const num = (v, lo, hi, def) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : def);
const pickOf = (obj, v, def) => (Object.hasOwn(obj, v) ? v : def);

/** Normaliza as camadas de texto (vindas do cliente). `fonts` = ids de fonte válidos. */
/** Formas (como as do Premiere): retângulo e elipse. */
export const SHAPES = { rect: 'Retângulo', ellipse: 'Elipse' };
/**
 * Forma na faixa de textos/gráficos: centro x/y e tamanho w/h em fração da tela (w da
 * largura, h da altura); cantos 0–1 (retângulo); o resto da aparência é a do texto.
 */
function cleanShape(l) {
  const start = Number(l?.start);
  const end = Number(l?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.2) return null;
  return {
    kind: 'shape',
    shape: pickOf(SHAPES, l.shape, 'rect'),
    text: '',
    start: Math.max(0, start),
    end: Math.min(start + 600, end),
    x: num(l.x, -0.5, 1.5, 0.5),
    y: num(l.y, -0.5, 1.5, 0.5),
    w: num(l.w, 0.005, 3, 0.4),
    h: num(l.h, 0.005, 3, 0.1),
    color: HEX.test(l.color) ? l.color : '#FF6B35',
    radius: num(l.radius, 0, 1, 0),
    animIn: pickOf(TEXT_ANIMS_IN, l.animIn, 'fade'),
    animOut: pickOf(TEXT_ANIMS_OUT, l.animOut, 'fade'),
    // câmera da forma: escala de camFrom a camTo na duração (1 = parada)
    ...(l.camFrom != null || l.camTo != null ? { camFrom: num(l.camFrom, 0.5, 2, 1), camTo: num(l.camTo, 0.5, 2, 1) } : {}),
    ...pickLook({ ...l, bg: undefined }),
  };
}

export function cleanTextLayers(raw, fonts = null, max = 30) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const l of raw) {
    if (l?.kind === 'shape') {
      const sh = cleanShape(l);
      if (sh) out.push(sh);
      if (out.length >= max) break;
      continue;
    }
    const text = String(l?.text ?? '').replace(/\r/g, '').slice(0, 200);
    const start = Number(l?.start);
    const end = Number(l?.end);
    if (!text.trim() || !Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.2) continue;
    out.push({
      text,
      start: Math.max(0, start),
      end: Math.min(start + 600, end),
      // fonte da lista ou "custom:<id>" (fonte enviada pela pessoa — o servidor confere o dono)
      font: typeof l.font === 'string' && ((!fonts || fonts.includes(l.font)) || /^custom:[\w-]{1,40}$/.test(l.font)) ? l.font : 'poppins',
      // estilo do arquivo da fonte (Regular, Itálico, Black…), como nas legendas
      ...(typeof l.fontStyle === 'string' && l.fontStyle && isFontStyle(l.font, l.fontStyle) ? { fontStyle: l.fontStyle } : {}),
      size: num(l.size, 0.015, 0.2, 0.05),
      color: HEX.test(l.color) ? l.color : '#FFFFFF',
      box: pickOf(TEXT_BOXES, l.box, 'outline'),
      boxColor: HEX.test(l.boxColor) ? l.boxColor : '#000000',
      // caixa: tamanho do fundo (folga) e arredondar os cantos
      ...(l.box === 'box' || l.bg === true ? { pad: num(l.pad, 0, 1.2, TEXT_PAD_DEFAULT), radius: num(l.radius, 0, 1, 0) } : {}),
      // aparência e tipografia (Propriedades, como no Premiere) — só o que foi mudado
      ...pickLook(l),
      x: num(l.x, 0, 1, 0.5),
      y: num(l.y, 0, 1, 0.5),
      animIn: pickOf(TEXT_ANIMS_IN, l.animIn, 'fade'),
      animOut: pickOf(TEXT_ANIMS_OUT, l.animOut, 'fade'),
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Campos novos de aparência/tipografia que vieram no texto (normalizados). */
function pickLook(l) {
  const L = textLook(l);
  const out = {};
  const keys = ['fill', 'stroke', 'strokeColor', 'strokeW', 'strokePos', 'bg', 'bgColor', 'bgOpacity', 'bgMode', 'shadow', 'shadowColor', 'shadowOpacity', 'shadowAngle', 'shadowDist', 'shadowBlur',
    'bold', 'italic', 'caps', 'smallCaps', 'underline', 'script', 'align', 'valign', 'tracking', 'leading', 'baseline', 'rot', 'opacity', 'scale'];
  for (const k of keys) if (l[k] != null) out[k] = L[k];
  if (out.script === null) delete out.script;
  return out;
}

/** Normaliza os momentos de efeito de vídeo. */
export function cleanFxMoments(raw, max = 40) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw) {
    const start = Number(m?.start);
    const end = Number(m?.end);
    if (!Object.hasOwn(VIDEO_FX, m?.effect) || !Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.15) continue;
    out.push({ start: Math.max(0, start), end: Math.min(start + 600, end), effect: m.effect });
    if (out.length >= max) break;
  }
  return out;
}
