import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { makeLogger } from '../logger.js';
import { posOf } from './timeline.js';
import { pickKeyword, emphasisOf, premiumChunks, layoutCaption, autoMaxChars } from '../../../shared/captionKeyword.js';

export { premiumChunks };

const log = makeLogger('captions');

// Pasta com as fontes premium empacotadas (OFL) — usada pelo libass via `fontsdir`,
// garantindo que a tipografia escolhida renderize igual em qualquer máquina.
const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'fonts');

// ─── Tipografia (fontes empacotadas) ──────────────────────────────────
// `family` é o nome interno da fonte (o que o libass procura).
export const CAPTION_FONTS = {
  montserrat: { family: 'Montserrat', label: 'Montserrat' },
  gotham: { family: 'Poppins', label: 'Gotham (estilo — Poppins)' },
  helvetica: { family: 'Arimo', label: 'Helvética (Arimo)' },
  poppins: { family: 'Poppins', label: 'Poppins (moderna)' },
  inter: { family: 'Inter', label: 'Inter (estilo Helvetica)' },
  opensans: { family: 'Open Sans', label: 'Open Sans (limpa)' },
  anton: { family: 'Anton', label: 'Anton (impacto)' },
  bebas: { family: 'Bebas Neue', label: 'Bebas Neue (condensada)' },
  archivo: { family: 'Archivo Black', label: 'Archivo Black (grossa)' },
  garamond: { family: 'EB Garamond', label: 'EB Garamond (estilo Garamond)' },
  luckiest: { family: 'Luckiest Guy', label: 'Divertida (cartoon)' },
};

/** "RRGGBB" (ou "#RRGGBB") → cor ASS "&H00BBGGRR". */
function assColor(hex) {
  const h = String(hex).replace('#', '').padStart(6, '0');
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}

function assTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const cs = Math.round((s % 60) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(cs / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

function escapeAss(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\n/g, ' ');
}

// ─── Paleta de cores de destaque (padrão: branco) ─────────────────────
export const CAPTION_COLORS = {
  white: 'FFFFFF',
  yellow: 'FFE24B',
  orange: 'FF6B35',
  purple: '9F67FF',
  green: '2ED47A',
  cyan: '22D3EE',
  pink: 'FF5CA8',
  red: 'F0526B',
};

// ─── Estilos (templates) — cada um combina look + movimento ───────────
// mode: 'word' (uma palavra por vez) | 'phrase' (frase com destaque)
export const CAPTION_TEMPLATES = {
  clean: { mode: 'phrase', size: 0.062, align: 2, marginV: 0.14, outline: 0.09, bold: true, upper: false, anim: 'fade', defaultFont: 'poppins' },
  pop: { mode: 'word', size: 0.088, align: 5, marginV: 0, outline: 0.1, bold: true, upper: true, anim: 'pop', defaultFont: 'anton' },
  hormozi: { mode: 'word', size: 0.1, align: 2, marginV: 0.17, outline: 0.14, bold: true, upper: true, anim: 'pop', defaultFont: 'anton' },
  box: { mode: 'word', size: 0.082, align: 5, marginV: 0, outline: 0.12, bold: true, upper: true, anim: 'pop', box: true, defaultFont: 'archivo' },
  neon: { mode: 'phrase', size: 0.066, align: 2, marginV: 0.14, outline: 0.05, bold: true, upper: false, anim: 'fade', glow: true, defaultFont: 'poppins' },
  bounce: { mode: 'word', size: 0.092, align: 5, marginV: 0, outline: 0.1, bold: true, upper: true, anim: 'bounce', defaultFont: 'luckiest' },
  keyword: { mode: 'phrase', size: 0.07, align: 2, marginV: 0.15, outline: 0.1, bold: true, upper: true, anim: 'pop', highlightKeyword: true, defaultFont: 'poppins' },
  // Karaokê: a frase inteira e a palavra falada sempre na cor de destaque.
  karaoke: { mode: 'phrase', size: 0.066, align: 2, marginV: 0.15, outline: 0.1, bold: true, upper: true, anim: 'fade', forceHighlight: true, defaultFont: 'montserrat' },
  // Marca-texto: caixa colorida atrás da palavra falada (as outras ficam com contorno).
  marker: { mode: 'phrase', size: 0.064, align: 2, marginV: 0.15, outline: 0.09, bold: true, upper: true, anim: 'fade', marker: true, defaultFont: 'poppins' },
  // Duas linhas: a palavra-chave desce para a linha de baixo, maior e colorida.
  duo: { mode: 'phrase', size: 0.064, align: 2, marginV: 0.15, outline: 0.1, bold: true, upper: true, anim: 'pop', highlightKeyword: true, keywordBreak: true, kwScale: 135, defaultFont: 'archivo' },
  // Minimalista: minúsculas, sem contorno; as outras palavras apagadas e a falada colorida.
  minimal: { mode: 'phrase', size: 0.056, align: 2, marginV: 0.14, outline: 0.05, bold: true, upper: false, anim: 'fade', forceHighlight: true, dimOthers: true, defaultFont: 'poppins' },
  // Premium: palavras entram uma a uma; as comuns pequenas em cima e a palavra-chave
  // embaixo, grande, com brilho e desfoque de entrada (+ som de tecla a cada palavra).
  premium: { mode: 'phrase', size: 0.08, smallSize: 0.04, align: 2, marginV: 0.2, outline: 0.05, bold: true, upper: false, anim: 'fade', premium: true, defaultFont: 'archivo', smallFont: 'inter' },
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
};

/** Posição vertical da legenda no quadro. */
export const CAPTION_POSITIONS = {
  auto: 'Automática (do estilo)',
  top: 'Em cima',
  center: 'No meio',
  bottom: 'Embaixo',
};

/** Fundo/legibilidade do texto (escolha manual). */
export const CAPTION_BACKGROUNDS = {
  auto: 'Automático (do estilo)',
  shadow: 'Sombra (contorno + sombra)',
  box: 'Caixa (fundo sólido)',
  bar: 'Barra translúcida',
  glow: 'Brilho neon (cor)',
  none: 'Sem sombra (só contorno)',
  clean: 'Limpo (sem contorno e sem caixa)',
};

/** Animações de texto disponíveis (entrada de cada palavra/frase). */
export const CAPTION_ANIMATIONS = {
  auto: 'Automática (do estilo)',
  fade: 'Fade (suave)',
  pop: 'Pop (escala)',
  bounce: 'Bounce (pula)',
  zoom: 'Zoom in',
  'pop-rot': 'Pop girando',
  shake: 'Tremer (impacto)',
  none: 'Sem animação',
};

/** Tag ASS de animação (movimento de entrada). Só transforma escala/rotação/alpha,
 * nunca reposiciona (mantém a centralização do alinhamento). */
function animTag(anim) {
  switch (anim) {
    case 'pop':
      return '\\fad(50,40)\\fscx82\\fscy82\\t(0,110,\\fscx106\\fscy106)\\t(110,210,\\fscx100\\fscy100)';
    case 'bounce':
      return '\\fad(40,40)\\fscx68\\fscy68\\t(0,90,\\fscx113\\fscy113)\\t(90,150,\\fscx95\\fscy95)\\t(150,215,\\fscx100\\fscy100)';
    case 'zoom':
      return '\\fad(40,40)\\fscx55\\fscy55\\t(0,180,\\fscx100\\fscy100)';
    case 'pop-rot':
      return '\\fad(40,40)\\fscx70\\fscy70\\frz-6\\t(0,160,\\fscx104\\fscy104\\frz0)\\t(160,230,\\fscx100\\fscy100)';
    case 'shake':
      return '\\fad(30,30)\\t(0,60,\\frz3)\\t(60,120,\\frz-3)\\t(120,180,\\frz0)';
    case 'none':
      return '';
    case 'fade':
    default:
      return '\\fad(60,60)';
  }
}

/** Mistura uma cor com o branco (t = 0 → cor, 1 → branco). */
function tint(hex, t) {
  const h = String(hex).replace('#', '');
  const c = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - t) + 255 * t));
  return c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Gera o conteúdo de um arquivo .ass com legendas dinâmicas premium.
 * @param {Array} segments segmentos com {start,end,text,words:[{start,end,word}]}
 * @param {object} meta {width,height}
 * @param {object} style {template, color, fontScale, mode?} (mode legado → template)
 */
export function buildAss(segments, meta, style = {}) {
  const w = meta.width || 1080;
  const h = meta.height || 1920;
  const color = CAPTION_COLORS[style.color] ? style.color : 'white';
  const tplKey = CAPTION_TEMPLATES[style.template]
    ? style.template
    : style.mode === 'word'
      ? 'pop'
      : 'clean';
  const T = CAPTION_TEMPLATES[tplKey];
  const scale = style.fontScale || 1;
  // Tipografia: fonte escolhida pelo usuário (style.font) OU a padrão do estilo.
  const fontId = CAPTION_FONTS[style.font] ? style.font : T.defaultFont || 'poppins';
  const fontName = style.fontName || CAPTION_FONTS[fontId]?.family || 'Poppins';

  const accent = assColor(CAPTION_COLORS[color]); // cor de destaque
  const WHITE = assColor('FFFFFF');
  // Modo de exibição: escolha do usuário (word|phrase) OU o padrão do estilo.
  const mode = ['word', 'phrase'].includes(style.mode) ? style.mode : T.mode;
  const size = Math.round(h * T.size * scale);
  // Fundo do texto (escolha manual): sombra | caixa | barra | brilho | sem sombra | limpo.
  const bg = ['shadow', 'box', 'bar', 'glow', 'none', 'clean'].includes(style.background) ? style.background : (T.box ? 'box' : 'shadow');
  const useBox = bg === 'box' || bg === 'bar'; // ambos usam BorderStyle=3 (caixa)
  const glowOn = bg === 'glow' || (style.background == null && T.glow) || (bg === 'auto' && T.glow);
  // "clean" = sem contorno (Outline 0) e sem caixa; mantém só uma sombra suave para legibilidade.
  const outline = bg === 'clean' ? 0 : Math.max(2, Math.round(size * T.outline));
  const shadow = bg === 'clean'
    ? Math.max(2, Math.round(size * 0.06))
    : bg === 'none' || glowOn || useBox ? 0 : Math.max(1, Math.round(size * 0.05));
  // Posição vertical da legenda (escolha manual). 'auto' segue o estilo.
  const pos = ['top', 'center', 'bottom'].includes(style.position) ? style.position : 'auto';
  const align = pos === 'top' ? 8 : pos === 'center' ? 5 : pos === 'bottom' ? 2 : T.align;
  const marginV = style.marginV != null
    ? style.marginV
    : pos === 'center'
      ? 0
      : pos === 'top' || pos === 'bottom'
        ? Math.round(h * 0.12)
        : Math.round(h * T.marginV);
  const boldFlag = T.bold ? -1 : 0;

  // Auto-ajuste: encolhe a fonte de palavras longas para nunca vazar a largura do
  // quadro (ex.: "PARENTE" em maiúsculas). Largura útil = quadro menos as margens L/R.
  const availW = Math.max(1, w - 140);
  function fitFontSize(displayText, base) {
    const factor = T.upper ? 0.66 : 0.58; // avanço médio do glifo ~ fração da fonte
    const est = displayText.length * base * factor;
    if (est <= availW) return base;
    return Math.max(Math.round((base * availW) / est), Math.round(base * 0.45));
  }

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    // 2 = sem quebra automática: as linhas são as dos cartões (limite de linhas/caracteres).
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // No brilho neon, o contorno vira a COR de destaque (halo colorido, borrado abaixo).
    `Style: Rise,${fontName},${size},${WHITE},${accent},${glowOn ? accent : assColor('000000')},&H90000000,${boldFlag},0,0,0,100,100,0,0,1,${outline},${shadow},${align},60,60,${marginV},1`,
  ];
  // Estilo com caixa atrás do texto (BorderStyle=3). 'box' = sólida; 'bar' = translúcida.
  if (useBox) {
    const phraseBox = mode === 'phrase';
    // Barra translúcida escura (alpha 0x66) — sempre neutra, legível em qualquer cor.
    // Caixa sólida: frase → escura neutra; palavra → na cor de destaque.
    const boxColor = bg === 'bar'
      ? '&H66101014'
      : phraseBox ? assColor('101014') : color === 'white' ? assColor('FFFFFF') : accent;
    const textColor = bg === 'bar'
      ? WHITE
      : phraseBox ? WHITE : color === 'white' ? assColor('111111') : assColor('FFFFFF');
    const pad = Math.max(6, Math.round(size * (bg === 'bar' ? 0.12 : 0.16)));
    header.push(
      `Style: RiseBox,${fontName},${size},${textColor},${textColor},${boxColor},${boxColor},${boldFlag},0,0,0,100,100,0,0,3,${pad},0,${align},60,60,${marginV},1`,
    );
  }
  // Marca-texto: 2ª camada com o mesmo texto, só que invisível; a palavra falada ganha
  // caixa (BorderStyle=3 desenha a caixa por letra, então dá para ligar só nela).
  // Branco → caixa branca com texto escuro; cores claras → texto escuro; demais → branco.
  const markerOn = T.marker && mode === 'phrase';
  if (markerOn) {
    const boxHex = CAPTION_COLORS[color];
    const darkText = ['white', 'yellow', 'green', 'cyan'].includes(color);
    const pad = Math.max(6, Math.round(size * 0.14));
    header.push(
      `Style: RiseMark,${fontName},${size},${darkText ? assColor('111111') : WHITE},${WHITE},&HFF${assColor(boxHex).slice(4)},&HFF000000,${boldFlag},0,0,0,100,100,0,0,3,${pad},0,${align},60,60,${marginV},1`,
    );
  }
  header.push('', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');

  // Animação escolhida pelo usuário (style.animation) OU a padrão do estilo.
  const animKind = style.animation && style.animation !== 'auto' && CAPTION_ANIMATIONS[style.animation] ? style.animation : T.anim;
  const anim = animTag(animKind);
  const glow = glowOn ? '\\blur3' : '';
  const lines = [];
  // Posição manual (arrastada na prévia): da palavra/frase, senão a geral (posX/posY).
  // Vira \an5\pos(x,y) = centro do texto naquele ponto do quadro.
  const globalPos = posOf({ px: style.posX, py: style.posY });
  const posTag = (p) => {
    const q = p && p.px != null ? p : globalPos;
    if (q.px == null) return '';
    const x = Math.round(Math.min(0.94, Math.max(0.06, q.px)) * w);
    const y = Math.round(Math.min(0.96, Math.max(0.04, q.py)) * h);
    return `\\an5\\pos(${x},${y})`;
  };

  // Ênfase manual de uma palavra (cor própria e/ou maior). Depois dela volta ao normal.
  const bigSize = Math.round(size * 1.3);
  const emOpen = (wd) => (wd.emColor ? `\\alpha&H00&\\c${assColor(CAPTION_COLORS[wd.emColor])}` : '') + (wd.emBig ? `\\fs${bigSize}` : '');
  const hasEm = (wd) => !!(wd.emColor || wd.emBig);
  const emWrap = (wd, t, fill) => `{${emOpen(wd)}}${t}{\\fs${size}\\c${fill}}`;
  // Junta as palavras da frase. No estilo "duas linhas" a palavra-chave vai para baixo.
  // Junta as palavras com as quebras de linha do cartão (br). No estilo "duas linhas" a
  // palavra-chave é quem desce (se a legenda puder ter 2 linhas).
  const joinWords = (parts, kw, ws) => {
    const duoBreak = (j) => T.keywordBreak && maxLines > 1 && (j === kw || (kw === 0 && j === 1));
    const hasDuo = T.keywordBreak && maxLines > 1 && kw >= 0 && parts.length > 1;
    return parts.map((p, j) => (j === 0 ? p : `${(hasDuo ? duoBreak(j) : ws?.[j]?.br) ? '\\N' : ' '}${p}`)).join('');
  };
  const kwBig = `\\fscx${T.kwScale || 118}\\fscy${T.kwScale || 118}`; // realce da palavra-chave (maior)
  const highlight = style.highlight === true || !!T.forceHighlight;
  const up = (word) => escapeAss(T.upper ? word.toUpperCase() : word);

  // Linhas e caracteres por linha: cada frase vira "cartões" de no máximo 1 ou 2 linhas
  // (quebra só entre palavras). Sem limite escolhido, calcula pelo tamanho da fonte.
  const maxLines = style.lines === 1 ? 1 : 2;
  const maxChars = Number(style.maxChars) > 0 ? Number(style.maxChars) : autoMaxChars(w, size, T.upper);
  const groups = [];
  for (const seg of segments) {
    const raw = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }];
    const ws = raw
      .map((wd) => ({ start: Number(wd.start) || 0, end: Number(wd.end) || 0, word: String(wd.word ?? '').trim(), ...posOf(wd), ...emphasisOf(wd) }))
      .filter((wd) => wd.word.length > 0);
    if (!ws.length) continue;
    if (mode === 'word') groups.push({ seg, words: ws });
    else for (const card of layoutCaption(ws, { lines: maxLines, maxChars, segEnd: seg.end })) groups.push({ seg: { ...seg, end: card.end }, words: card.words });
  }

  for (const { seg, words } of groups) {
    const phraseStyle = useBox ? 'RiseBox' : 'Rise';

    if (mode === 'word') {
      // Uma palavra por vez, centralizada, com o movimento do template.
      // No brilho neon o texto fica branco e a cor aparece no halo (mais legível).
      const wordColor = useBox || glowOn ? '' : `\\c${accent}`;
      for (let i = 0; i < words.length; i++) {
        const wd = words[i];
        // Fim = até o começo da PRÓXIMA palavra (nunca sobrepõe → nada de duas
        // palavras na tela ao mesmo tempo). Última palavra: até seu próprio fim.
        const nextStart = i + 1 < words.length ? words[i + 1].start : seg.end;
        const end = Math.max(wd.start + 0.1, Math.min(Math.max(wd.end, wd.start + 0.12), nextStart));
        const disp = T.upper ? wd.word.toUpperCase() : wd.word;
        const txt = escapeAss(disp);
        const fs = fitFontSize(disp, wd.emBig ? bigSize : size);
        const fsTag = fs !== size ? `\\fs${fs}` : '';
        const colorTag = wd.emColor ? `\\c${assColor(CAPTION_COLORS[wd.emColor])}` : wordColor;
        const ov = `{${posTag(wd) || `\\an${align}`}${fsTag}${anim}${glow}${colorTag}}`;
        lines.push(`Dialogue: 0,${assTime(wd.start)},${assTime(end)},${phraseStyle},,0,0,0,,${ov}${txt}`);
      }
    } else if (T.premium) {
      // Cada palavra aparece quando é falada (as próximas já ocupam o lugar, invisíveis,
      // para nada pular). Pequenas: fonte leve e sombra. Grandes: fonte pesada, cor clara
      // com brilho (contorno colorido borrado) e entrada com desfoque + escala.
      const premCol = color === 'white' ? 'C6F25A' : CAPTION_COLORS[color];
      const fillC = assColor(tint(premCol, color === 'white' ? 0.72 : 0.55));
      const glowC = assColor(premCol);
      const smallSize = Math.round(h * T.smallSize * scale);
      const smallFont = CAPTION_FONTS[T.smallFont]?.family || 'Inter';
      const plainBig = Math.round(size * 0.78);
      const glowBord = Math.max(2, Math.round(size * 0.06));
      const glowBlur = Math.max(4, Math.round(size * 0.09));
      for (const ch of premiumChunks(words, seg.end)) {
        const cw = ch.words;
        for (let i = 0; i < cw.length; i++) {
          const start = cw[i].start;
          const end = i + 1 < cw.length ? cw[i + 1].start : ch.end;
          const parts = cw.map((wd, j) => {
            const big = j >= ch.big;
            const glow = big && ch.glow;
            const emC = wd.emColor ? assColor(CAPTION_COLORS[wd.emColor]) : null;
            let look;
            if (!big) {
              look = `\\fn${smallFont}\\fs${smallSize}\\b1\\c${emC || WHITE}\\bord0\\shad${Math.max(1, Math.round(smallSize * 0.06))}\\blur0`;
            } else if (glow) {
              look = `\\fn${fontName}\\fs${wd.emBig ? bigSize : size}\\b0\\c${emC || fillC}\\3c${emC || glowC}\\bord${glowBord}\\blur${glowBlur}\\shad0`;
            } else {
              look = `\\fn${fontName}\\fs${plainBig}\\b0\\c${emC || WHITE}\\3c&H000000&\\bord${Math.max(1, Math.round(plainBig * 0.04))}\\blur1\\shad0`;
            }
            const shown = glow ? '\\1a&H00&\\3a&H60&\\4a&HFF&' : '\\1a&H00&\\3a&H40&\\4a&H80&';
            if (j > i) return `{${look}\\1a&HFF&\\3a&HFF&\\4a&HFF&}${escapeAss(wd.word)}`;
            if (j < i) return `{${look}${shown}}${escapeAss(wd.word)}`;
            // Entrando agora: aparece em ~0,15 s; as grandes chegam esticadas e desfocadas
            // (só na largura: mudar a altura faria a linha de cima pular).
            const enter = big
              ? `\\fscx118\\be10\\t(0,180,\\fscx100\\be0)`
              : `\\fscx92\\t(0,120,\\fscx100)`;
            return `{${look}\\1a&HFF&\\3a&HFF&\\4a&HFF&${enter}\\t(0,150,${shown})}${escapeAss(wd.word)}`;
          });
          const text = parts.map((p, j) => (j === 0 ? p : `${j === ch.big ? '\\N' : ' '}${p}`)).join('');
          lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Rise,,0,0,0,,{${posTag(cw[0])}}${text}`);
        }
      }
    } else if (markerOn) {
      // Camada 0: a frase inteira (contorno normal). Camada 1, palavra a palavra: o mesmo
      // texto invisível com a caixa ligada só na palavra falada — fica exatamente atrás dela.
      // (aqui a cor escolhida é a da caixa; o texto da frase fica branco)
      const parts = words.map((wd) => (hasEm(wd) ? emWrap(wd, up(wd.word), WHITE) : up(wd.word)));
      const endAll = Math.max(words[words.length - 1].end, Number(seg.end) || 0);
      // Folga da caixa: um pouco dos lados, quase nada em cima/embaixo (a fonte já tem respiro).
      const markPadX = Math.max(4, Math.round(size * 0.1));
      const markPadY = Math.max(1, Math.round(size * 0.02));
      const p0 = posTag(words[0]);
      lines.push(`Dialogue: 0,${assTime(words[0].start)},${assTime(endAll)},${phraseStyle},,0,0,0,,{${p0}${anim}${glow}}${joinWords(parts, -1, words)}`);
      for (let i = 0; i < words.length; i++) {
        const start = words[i].start;
        const end = i + 1 < words.length ? words[i + 1].start : endAll;
        const marked = words.map((wd, j) => {
          const big = wd.emBig ? `{\\fs${bigSize}}` : '';
          const back = wd.emBig ? `{\\fs${size}}` : '';
          const t = up(wd.word);
          return j === i ? `${big}{\\1a&H00&\\3a&H00&}${t}{\\1a&HFF&\\3a&HFF&}${back}` : `${big}${t}${back}`;
        });
        // A 1ª palavra entra junto com a frase (mesma animação, para a caixa acompanhar).
        const a1 = i === 0 ? anim : i === words.length - 1 ? '\\fad(0,60)' : '';
        lines.push(`Dialogue: 1,${assTime(start)},${assTime(end)},RiseMark,,0,0,0,,{${p0}\\1a&HFF&\\xbord${markPadX}\\ybord${markPadY}${a1}}${joinWords(marked, -1, words)}`);
      }
    } else if (!highlight) {
      // PADRÃO: legenda normal — a frase inteira, todas as palavras iguais (na cor
      // escolhida), sem destacar a palavra falada. No estilo "palavra-chave" a
      // palavra-chave continua realçada (é a proposta do estilo).
      const kw = T.highlightKeyword ? pickKeyword(words) : -1;
      // Nos estilos de palavra-chave a frase fica branca e só a palavra-chave ganha a cor.
      const base = useBox || glowOn || color === 'white' || T.highlightKeyword ? '' : `\\c${accent}`;
      const fill = base ? accent : WHITE;
      const parts = words.map((wd, j) => {
        const t = up(wd.word);
        if (hasEm(wd)) return emWrap(wd, t, fill);
        if (j !== kw) return t;
        if (glowOn) return `{${kwBig}}${t}{\\fscx100\\fscy100}`;
        return `{${kwBig}\\c${accent}}${t}{\\fscx100\\fscy100\\c${fill}}`;
      });
      const end = Math.max(words[words.length - 1].end, Number(seg.end) || 0);
      lines.push(`Dialogue: 0,${assTime(words[0].start)},${assTime(end)},${phraseStyle},,0,0,0,,{${posTag(words[0])}${anim}${glow}${base}}${joinWords(parts, kw, words)}`);
    } else {
      // Destaque ligado: frase inteira e a palavra corrente realçada (por cor, ou —
      // no branco — pelo escurecimento das demais).
      // No estilo "palavra-chave", a palavra de conteúdo mais forte da frase é
      // sempre destacada (cor + maior), independente de qual está sendo falada.
      const kw = T.highlightKeyword ? pickKeyword(words) : -1;
      // Minimalista: as outras palavras ficam bem apagadas (a falada aparece na cor).
      const dim = T.dimOthers ? '\\alpha&H60&' : '\\alpha&H70&';
      for (let i = 0; i < words.length; i++) {
        const start = words[i].start;
        const end = i + 1 < words.length ? words[i + 1].start : Math.max(words[i].end, seg.end);
        const parts = words.map((wd, j) => {
          const t = up(wd.word);
          if (hasEm(wd)) return `{\\alpha&H00&}${emWrap(wd, t, WHITE)}`;
          // Brilho neon: texto branco, a cor vira o halo (legível). A palavra-chave
          // ainda cresce, mas sem recolorir o preenchimento.
          if (glowOn) return j === kw ? `{\\alpha&H00&${kwBig}}${t}{\\fscx100\\fscy100}` : `{\\alpha&H00&}${t}`;
          if (j === kw) return `{\\alpha&H00&${kwBig}\\c${accent}}${t}{\\fscx100\\fscy100\\c${WHITE}}`;
          if (j === i) {
            // No estilo palavra-chave, SÓ a palavra-chave é colorida; a corrente
            // realça apenas pelo brilho (branco opaco). Nos demais estilos, a
            // corrente usa a cor de destaque quando ela não é branca.
            if (T.highlightKeyword || color === 'white') return `{\\alpha&H00&}${t}`;
            return `{\\alpha&H00&\\c${accent}}${t}{\\c${WHITE}}`;
          }
          if (color === 'white' || T.dimOthers) return `{${dim}}${t}{\\alpha&H00&}`;
          return t;
        });
        lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},${phraseStyle},,0,0,0,,{${posTag(words[0])}${anim}${glow}}${joinWords(parts, kw, words)}`);
      }
    }
  }

  return `${header.join('\n')}\n${lines.join('\n')}\n`;
}

/**
 * Caminho das fontes para o `fontsdir`, relativo à pasta do job. Se ele não for
 * "seguro" para o filtro do FFmpeg — outro drive no Windows (C:\ vs D:\, vira
 * absoluto com `:`), espaços, vírgulas, aspas… — copia as fontes para dentro da
 * pasta do job e usa só `fonts`. Exportado para teste.
 */
export async function fontsDirArg(work, fontsDir = FONTS_DIR) {
  const rel = path.relative(work, fontsDir).split(path.sep).join('/');
  if (rel && !path.isAbsolute(rel) && /^[A-Za-z0-9._/-]+$/.test(rel)) return rel;
  const local = path.join(work, 'fonts');
  await fs.cp(fontsDir, local, { recursive: true, force: true });
  return 'fonts';
}

/** Escreve o .ass e queima as legendas no vídeo. */
export async function burnCaptions(input, work, meta, transcript, style, onProgress) {
  if (!transcript?.segments?.length) {
    log.warn('sem transcrição; pulando legendas');
    return { output: input, count: 0 };
  }
  const ass = buildAss(transcript.segments, meta, style);
  const ASS_NAME = 'captions.ass';
  await fs.writeFile(path.join(work, ASS_NAME), ass, 'utf8');

  const output = path.join(work, 'captioned.mp4');
  // Roda com cwd = pasta do job e referencia o .ass pelo NOME relativo. Assim o
  // filtro `subtitles` nunca recebe drive (C:), barras ou espaços do caminho —
  // que quebravam o parser do FFmpeg no Windows (caminhos com espaço/`:`).
  // `fontsdir` (caminho RELATIVO, com "/" — sem drive/espaços) aponta para as fontes
  // premium empacotadas, garantindo a tipografia escolhida em qualquer máquina.
  const fontsRel = await fontsDirArg(work);
  const vf = `subtitles=${ASS_NAME}:fontsdir=${fontsRel}`;
  const args = ['-i', input, '-vf', vf, ...x264Fast()];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'captions', totalDuration: meta.duration, onProgress, cwd: work });
  const tpl = CAPTION_TEMPLATES[style.template] ? style.template : style.mode === 'word' ? 'pop' : 'clean';
  log.ok(`legendas queimadas (${transcript.segments.length} seg, estilo ${tpl}, cor ${style.color || 'white'})`);
  return { output, count: transcript.segments.length };
}

/**
 * Sons da legenda (tempos na timeline final) — só som de tecla, como digitação:
 * - estilo Premium: uma tecla no instante em que cada palavra aparece. No ritmo padrão
 *   ('ritmo', como no áudio de referência) as teclas vêm em rajadas: uma frase digitada,
 *   a seguinte em silêncio, e assim por diante. Com `keys: 'todas'`, em toda palavra;
 * - qualquer estilo: uma tecla nas palavras com ênfase manual.
 * @returns {Array<{t:number,type:'tick'}>}
 */
export function captionSfxEvents(segments, style = {}) {
  const T = CAPTION_TEMPLATES[style.template] || {};
  const everyWord = style.keys === 'todas';
  const events = [];
  let phrase = 0;
  for (const seg of segments || []) {
    const words = (seg.words || []).filter((wd) => String(wd.word ?? '').trim());
    if (!words.length) continue;
    const typed = T.premium && (everyWord || phrase % 2 === 0);
    phrase += 1;
    for (const wd of words) {
      const em = emphasisOf(wd);
      if (typed || em.emColor || em.emBig) events.push({ t: Math.max(0, Number(wd.start) || 0), type: 'tick' });
    }
  }
  return events.sort((a, b) => a.t - b.t);
}
