// Texto livre na timeline (como o "Texto" do CapCut) e efeitos de vídeo por momento.
// Compartilhado pelo site (editor + prévia) e pelo servidor (render).

/** Animações de entrada e saída de um texto. */
export const TEXT_ANIMS_IN = { none: 'Nenhuma', fade: 'Fade', pop: 'Pop', zoom: 'Zoom', 'slide-up': 'Subir', 'slide-left': 'Entrar da direita' };
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
