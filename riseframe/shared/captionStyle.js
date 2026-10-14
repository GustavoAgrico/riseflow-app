/**
 * Visual das legendas compartilhado entre o render (server/src/pipeline/captions.js) e a
 * prévia no navegador (web/src/components/CaptionPreview.jsx): fontes, cores, estilos e
 * tipos de destaque. Um lugar só — a prévia e o vídeo final não podem divergir.
 */

// ─── Fontes empacotadas (server/assets/fontes, servidas em /api/fonts) ───
// family = nome interno da fonte (o que o libass e o CSS procuram).
// bold = pedir negrito (o navegador e o libass engrossam as fontes finas); as fontes de
// "letreiro" já são grossas por desenho e ficam sem.
export const CAPTION_FONT_LIST = [
  { id: 'montserrat', family: 'Montserrat', file: 'Montserrat-Bold.ttf', label: 'Montserrat', weight: 700 },
  { id: 'gotham', family: 'Poppins', file: 'Poppins-Bold.ttf', label: 'Gotham (estilo — Poppins)', weight: 700 },
  { id: 'helvetica', family: 'Arimo', file: 'Arimo-Bold.ttf', label: 'Helvética (Arimo)', weight: 700 },
  { id: 'poppins', family: 'Poppins', file: 'Poppins-Bold.ttf', label: 'Poppins (moderna)', weight: 700 },
  { id: 'inter', family: 'Inter', file: 'Inter.ttf', label: 'Inter (estilo Helvetica)' },
  { id: 'opensans', family: 'Open Sans', file: 'OpenSans.ttf', label: 'Open Sans (limpa)' },
  { id: 'anton', family: 'Anton', file: 'Anton-Regular.ttf', label: 'Anton (impacto)' },
  { id: 'bebas', family: 'Bebas Neue', file: 'BebasNeue-Regular.ttf', label: 'Bebas Neue (condensada)' },
  { id: 'archivo', family: 'Archivo Black', file: 'ArchivoBlack-Regular.ttf', label: 'Archivo Black (grossa)' },
  { id: 'garamond', family: 'EB Garamond', file: 'EBGaramond.ttf', label: 'EB Garamond (estilo Garamond)' },
  { id: 'luckiest', family: 'Luckiest Guy', file: 'LuckiestGuy-Regular.ttf', label: 'Divertida (cartoon)' },
  // novas
  { id: 'oswald', family: 'Oswald', file: 'Oswald-Bold.ttf', label: 'Oswald (condensada forte)', weight: 700 },
  { id: 'barlow', family: 'Barlow Condensed ExtraBold', file: 'BarlowCondensed-ExtraBold.ttf', label: 'Barlow Condensed (esportiva)', weight: 800 },
  { id: 'kanit', family: 'Kanit ExtraBold', file: 'Kanit-ExtraBold.ttf', label: 'Kanit (TikTok)', weight: 800 },
  { id: 'rubik', family: 'Rubik ExtraBold', file: 'Rubik-ExtraBold.ttf', label: 'Rubik (arredondada forte)', weight: 800 },
  { id: 'nunito', family: 'Nunito Black', file: 'Nunito-Black.ttf', label: 'Nunito (redonda)', weight: 900 },
  { id: 'fredoka', family: 'Fredoka', file: 'Fredoka-Bold.ttf', label: 'Fredoka (fofa)', weight: 700 },
  { id: 'lilita', family: 'Lilita One', file: 'LilitaOne-Regular.ttf', label: 'Lilita One (YouTuber)', bold: false },
  { id: 'bangers', family: 'Bangers', file: 'Bangers-Regular.ttf', label: 'Bangers (quadrinhos)', bold: false },
  { id: 'righteous', family: 'Righteous', file: 'Righteous-Regular.ttf', label: 'Righteous (retrô)', bold: false },
  { id: 'playfair', family: 'Playfair Display Black', file: 'PlayfairDisplay-Black.ttf', label: 'Playfair (elegante, serifa)', weight: 900 },
  { id: 'marker', family: 'Permanent Marker', file: 'PermanentMarker-Regular.ttf', label: 'Caneta (marcador)', bold: false },
  { id: 'pacifico', family: 'Pacifico', file: 'Pacifico-Regular.ttf', label: 'Pacifico (cursiva)', bold: false },
];
export const CAPTION_FONTS = Object.fromEntries(CAPTION_FONT_LIST.map((f) => [f.id, f]));
export const fontById = (id) => CAPTION_FONTS[id] || CAPTION_FONTS.poppins;
/** Pede negrito para esta fonte? */
export const fontBold = (f) => f.bold !== false;

// ─── Estilos de cada fonte (Regular, Itálico, Negrito, Black…) ───
// Cada estilo é um arquivo próprio (S-<fonte>-<código>.ttf) com um nome de família ÚNICO
// ("RFS <fonte> <código>"): o libass e o navegador pegam exatamente aquele arquivo, sem
// confundir com outro peso nem "inventar" negrito/itálico. "" = o estilo padrão da fonte.
const STYLE_LABEL = {
  400: 'Regular', '400i': 'Itálico', 600: 'Semi-negrito', 700: 'Negrito', '700i': 'Negrito itálico',
  800: 'Extra-negrito', '800i': 'Extra-negrito itálico', 900: 'Black', '900i': 'Black itálico',
};
const STYLE_CODES = {
  montserrat: ['400', '400i', '700i', '800', '900', '900i'],
  poppins: ['400', '400i', '700i', '900', '900i'],
  inter: ['400', '400i', '700', '700i', '900', '900i'],
  opensans: ['400', '400i', '700', '700i', '800', '800i'],
  barlow: ['400', '400i', '700', '700i', '800i', '900', '900i'],
  kanit: ['400', '400i', '700', '700i', '800i', '900', '900i'],
  rubik: ['400', '400i', '700', '700i', '800i', '900', '900i'],
  nunito: ['400', '400i', '700', '700i', '900i'],
  playfair: ['400', '400i', '700', '700i', '900i'],
  garamond: ['400', '400i', '700', '700i', '800'],
  oswald: ['400', '600'],
};
STYLE_CODES.gotham = STYLE_CODES.poppins; // "Gotham" usa a Poppins
const STYLE_FILE_ID = { gotham: 'poppins' };
/** Nome do estilo padrão (o arquivo original de cada fonte). */
const defaultStyleLabel = (f) => (f.weight >= 900 ? 'Black' : f.weight >= 800 ? 'Extra-negrito' : f.weight >= 700 || f.bold !== false ? 'Negrito' : 'Regular');

/** Estilos de uma fonte: [{ id, label, family, file, italic }] (o 1º é o padrão, id ""). */
export function fontStyles(fontId) {
  const f = CAPTION_FONTS[fontId];
  if (!f) return [];
  const fid = STYLE_FILE_ID[fontId] || fontId;
  return [
    { id: '', label: defaultStyleLabel(f), family: f.family, file: f.file, italic: false, isDefault: true },
    ...(STYLE_CODES[fontId] || []).map((c) => ({ id: c, label: STYLE_LABEL[c], family: `RFS ${fid} ${c}`, file: `S-${fid}-${c}.ttf`, italic: c.endsWith('i') })),
  ];
}
export const isFontStyle = (fontId, styleId) => fontStyles(fontId).some((x) => x.id === styleId);

/** Todos os arquivos de fonte (padrões + estilos) — para medidas e @font-face. */
export const CAPTION_FONT_FILES = [
  ...CAPTION_FONT_LIST.map((f) => ({ family: f.family, file: f.file })),
  ...Object.keys(STYLE_CODES).filter((id) => !STYLE_FILE_ID[id]).flatMap((id) => fontStyles(id).slice(1).map((x) => ({ family: x.family, file: x.file }))),
];

/**
 * Fonte e estilo escolhidos → o que desenhar: família, se pede negrito (só no estilo
 * padrão, como antes) e se o arquivo já é itálico.
 */
export function resolveFontFace(font, styleId) {
  const st = styleId ? fontStyles(font.id).find((x) => x.id === styleId) : null;
  if (!st) return { family: font.family, file: font.file, bold: fontBold(font), italic: false, styled: false };
  return { family: st.family, file: st.file, bold: false, italic: st.italic, styled: true };
}

// ─── Cores ───
export const CAPTION_COLOR_LIST = [
  { id: 'white', label: 'Branco', hex: '#FFFFFF' },
  { id: 'yellow', label: 'Amarelo', hex: '#FFE24B' },
  { id: 'gold', label: 'Dourado', hex: '#F5B700' },
  { id: 'orange', label: 'Laranja', hex: '#FF6B35' },
  { id: 'coral', label: 'Coral', hex: '#FF8A7A' },
  { id: 'red', label: 'Vermelho', hex: '#F0526B' },
  { id: 'pink', label: 'Rosa', hex: '#FF5CA8' },
  { id: 'magenta', label: 'Magenta', hex: '#E040FB' },
  { id: 'purple', label: 'Roxo', hex: '#9F67FF' },
  { id: 'lilac', label: 'Lilás', hex: '#C9B6FF' },
  { id: 'blue', label: 'Azul', hex: '#3B82F6' },
  { id: 'sky', label: 'Azul-claro', hex: '#7CC4FF' },
  { id: 'cyan', label: 'Ciano', hex: '#22D3EE' },
  { id: 'mint', label: 'Menta', hex: '#5EEAD4' },
  { id: 'green', label: 'Verde', hex: '#2ED47A' },
  { id: 'lime', label: 'Lima', hex: '#B6F23A' },
];
/** id → "RRGGBB". */
export const CAPTION_COLORS = Object.fromEntries(CAPTION_COLOR_LIST.map((c) => [c.id, c.hex.slice(1)]));
const HEX = /^#?([0-9a-f]{6})$/i;
/** Cor válida (id da paleta ou "#RRGGBB" livre)? */
export const isCaptionColor = (v) => Boolean(CAPTION_COLORS[v]) || HEX.test(String(v ?? ''));
/** id da paleta ou "#RRGGBB" → "RRGGBB" (maiúsculas); inválida → `fallback`. */
export function colorHex(v, fallback = 'FFFFFF') {
  if (CAPTION_COLORS[v]) return CAPTION_COLORS[v];
  const m = HEX.exec(String(v ?? ''));
  return m ? m[1].toUpperCase() : fallback;
}
/** Cor clara (texto escuro por cima)? */
export function isLightHex(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 165;
}
/** Branco (ou quase): o destaque por cor não aparece. */
export const isWhiteish = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return Math.min((n >> 16) & 255, (n >> 8) & 255, n & 255) > 235;
};

// ─── Destaque da palavra falada ───
export const HIGHLIGHT_STYLES = [
  { id: 'color', label: 'Cor' },
  { id: 'box', label: 'Caixa (marca-texto)' },
  { id: 'scale', label: 'Maior' },
  { id: 'glow', label: 'Brilho' },
  { id: 'underline', label: 'Sublinhado' },
];
export const HIGHLIGHT_IDS = HIGHLIGHT_STYLES.map((h) => h.id);

/** Altura de cada linha da legenda (× tamanho da fonte), igual no render e na prévia. */
export const LINE_HEIGHT = 1.1;

// ─── Estilos (templates): look + movimento ───
// size = tamanho da fonte (em, fração da altura do quadro). mode: 'word' (uma palavra por
// vez) | 'phrase' (frase). align: 2 embaixo · 5 meio · 8 em cima; marginV = fração da altura.
// outline = contorno (× fonte). hl = destaque padrão da palavra falada (se o estilo destaca).
export const CAPTION_TEMPLATES = {
  clean: { mode: 'phrase', size: 0.062, align: 2, marginV: 0.14, outline: 0.09, bold: true, upper: false, anim: 'fade', defaultFont: 'poppins' },
  pop: { mode: 'word', size: 0.088, align: 5, marginV: 0, outline: 0.1, bold: true, upper: true, anim: 'pop', defaultFont: 'anton' },
  hormozi: { mode: 'word', size: 0.1, align: 2, marginV: 0.17, outline: 0.14, bold: true, upper: true, anim: 'pop', defaultFont: 'anton' },
  box: { mode: 'word', size: 0.082, align: 5, marginV: 0, outline: 0.12, bold: true, upper: true, anim: 'pop', box: true, defaultFont: 'archivo' },
  neon: { mode: 'phrase', size: 0.066, align: 2, marginV: 0.14, outline: 0.05, bold: true, upper: false, anim: 'fade', glow: true, defaultFont: 'poppins' },
  bounce: { mode: 'word', size: 0.092, align: 5, marginV: 0, outline: 0.1, bold: true, upper: true, anim: 'bounce', defaultFont: 'luckiest' },
  keyword: { mode: 'phrase', size: 0.07, align: 2, marginV: 0.15, outline: 0.1, bold: true, upper: true, anim: 'pop', highlightKeyword: true, defaultFont: 'poppins' },
  // Karaokê: a palavra falada sempre na cor de destaque.
  karaoke: { mode: 'phrase', size: 0.066, align: 2, marginV: 0.15, outline: 0.1, bold: true, upper: true, anim: 'fade', forceHighlight: true, defaultFont: 'montserrat' },
  // Marca-texto: caixa colorida atrás da palavra falada.
  marker: { mode: 'phrase', size: 0.064, align: 2, marginV: 0.15, outline: 0.09, bold: true, upper: true, anim: 'fade', forceHighlight: true, hl: 'box', defaultFont: 'poppins' },
  // Duas linhas: a palavra-chave desce para a linha de baixo, maior e colorida.
  duo: { mode: 'phrase', size: 0.064, align: 2, marginV: 0.15, outline: 0.1, bold: true, upper: true, anim: 'pop', highlightKeyword: true, keywordBreak: true, kwScale: 1.35, defaultFont: 'archivo' },
  // Minimalista: as outras palavras apagadas e a falada colorida.
  minimal: { mode: 'phrase', size: 0.056, align: 2, marginV: 0.14, outline: 0.05, bold: true, upper: false, anim: 'fade', forceHighlight: true, dimOthers: true, defaultFont: 'poppins' },
  // Premium: palavras entram uma a uma; comuns pequenas em cima, a palavra-chave embaixo,
  // grande, com brilho (+ som de tecla).
  premium: { mode: 'phrase', size: 0.08, smallSize: 0.04, align: 2, marginV: 0.2, outline: 0.05, bold: true, upper: false, anim: 'fade', premium: true, defaultFont: 'archivo', smallFont: 'inter' },
  // ── novos ──
  // TikTok: contorno grosso; a palavra falada cresce na cor de destaque.
  tiktok: { mode: 'phrase', size: 0.066, align: 2, marginV: 0.18, outline: 0.14, bold: true, upper: false, anim: 'pop', forceHighlight: true, hl: 'scale', defaultFont: 'montserrat' },
  // YouTuber: palavra a palavra, enorme, colorida, contorno + sombra dura.
  beast: { mode: 'word', size: 0.1, align: 5, marginV: 0, outline: 0.12, bold: true, upper: true, anim: 'bounce', hardShadow: 'black', defaultFont: 'lilita' },
  // Quadrinhos: palavra a palavra, girando, fonte de HQ.
  comic: { mode: 'word', size: 0.095, align: 5, marginV: 0, outline: 0.12, bold: true, upper: true, anim: 'pop-rot', hardShadow: 'black', defaultFont: 'bangers' },
  // Vazado: só o contorno das letras; a palavra falada fica preenchida na cor.
  hollow: { mode: 'phrase', size: 0.074, align: 2, marginV: 0.15, outline: 0.05, bold: true, upper: true, anim: 'pop', forceHighlight: true, hollow: true, defaultFont: 'anton' },
  // Sombra 3D: sombra dura deslocada na cor de destaque.
  shadow3d: { mode: 'phrase', size: 0.068, align: 2, marginV: 0.15, outline: 0.06, bold: true, upper: true, anim: 'pop', hardShadow: 'accent', defaultFont: 'rubik' },
  // Elegante: serifa, minúsculas, sem contorno, sombra suave.
  elegant: { mode: 'phrase', size: 0.058, align: 2, marginV: 0.14, outline: 0, bold: true, upper: false, anim: 'fade', soft: true, forceHighlight: true, hl: 'underline', defaultFont: 'playfair' },
  // Caneta: letra de marcador; a palavra falada colorida.
  handwritten: { mode: 'phrase', size: 0.064, align: 2, marginV: 0.15, outline: 0.1, bold: true, upper: false, anim: 'fade', forceHighlight: true, defaultFont: 'marker' },
};

export const CAPTION_TEMPLATE_LABELS = {
  clean: 'Clássico (limpo)',
  pop: 'Pop (palavra a palavra)',
  hormozi: 'Impacto (bold)',
  box: 'Caixa (destaque)',
  neon: 'Neon (glow)',
  bounce: 'Bounce',
  keyword: 'Palavra-chave (dinâmico)',
  karaoke: 'Karaokê',
  marker: 'Marca-texto',
  duo: 'Duas linhas',
  minimal: 'Minimalista',
  premium: 'Premium (palavra a palavra + brilho)',
  tiktok: 'TikTok (palavra cresce)',
  beast: 'YouTuber (gigante + sombra)',
  comic: 'Quadrinhos',
  hollow: 'Vazado (só contorno)',
  shadow3d: 'Sombra 3D',
  elegant: 'Elegante (serifa)',
  handwritten: 'Caneta (manuscrita)',
};

/**
 * Áreas cobertas pelos botões e textos do Instagram (Reels) e do TikTok num vídeo
 * vertical, em fração do quadro: em cima (abas/"Seguindo"), embaixo (nome, descrição,
 * música) e a coluna de botões à direita (curtir, comentar, compartilhar).
 */
export const SAFE_ZONE = { top: 0.1, bottom: 0.2, right: 0.13, rightFrom: 0.42, rightTo: 0.86 };
export const isVerticalFrame = (w, h) => w > 0 && h / w > 1.4;

/**
 * Margem vertical (fração da altura) e largura útil (fração da largura) da legenda,
 * respeitando a área segura das redes quando ligada e o vídeo é vertical. A MESMA conta
 * na prévia e no render.
 */
export function safeCaptionBox({ w, h, kind, marginV, safe = true }) {
  if (!safe || !isVerticalFrame(w, h)) return { marginV, widthFrac: 0.86 };
  const m = kind === 'bottom' ? Math.max(marginV, SAFE_ZONE.bottom + 0.01) : kind === 'top' ? Math.max(marginV, SAFE_ZONE.top + 0.01) : marginV;
  // centralizada, mas sem invadir a coluna de botões (largura simétrica)
  return { marginV: m, widthFrac: 1 - 2 * SAFE_ZONE.right };
}
