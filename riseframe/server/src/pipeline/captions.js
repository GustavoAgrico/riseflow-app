import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { makeLogger } from '../logger.js';
import { posOf } from './timeline.js';
import { fontMetrics } from './fontMetrics.js';
import { pickKeyword, emphasisOf, premiumChunks, layoutCaption, autoMaxChars } from '../../../shared/captionKeyword.js';
import {
  CAPTION_FONTS as FONT_DEFS, fontById, fontBold, CAPTION_COLORS, colorHex, isLightHex, isWhiteish,
  HIGHLIGHT_IDS, LINE_HEIGHT, CAPTION_TEMPLATES, CAPTION_TEMPLATE_LABELS, safeCaptionBox,
} from '../../../shared/captionStyle.js';

export { premiumChunks, CAPTION_COLORS, CAPTION_TEMPLATES, CAPTION_TEMPLATE_LABELS };

const log = makeLogger('captions');

// Pasta com as fontes empacotadas — usada pelo libass via `fontsdir`, garantindo que a
// tipografia escolhida renderize igual em qualquer máquina.
const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'fonts');

/** Tipografia: id → { family, label }. */
export const CAPTION_FONTS = Object.fromEntries(Object.entries(FONT_DEFS).map(([id, f]) => [id, { family: f.family, label: f.label }]));

/** "RRGGBB" (ou "#RRGGBB") → cor ASS "&H00BBGGRR". */
function assColor(hex) {
  const h = String(hex).replace('#', '').padStart(6, '0');
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}
/** Só a parte BBGGRR (para \1c&H..& etc.). */
const bgr = (hex) => assColor(hex).slice(4);

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
 * nunca reposiciona (mantém a centralização). */
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
/** Só o fade da animação (para as caixas desenhadas atrás do texto). */
const fadeOf = (tag) => (/\\fad\([^)]*\)/.exec(tag) || [''])[0];

/** Mistura uma cor com o branco (t = 0 → cor, 1 → branco). */
function tint(hex, t) {
  const h = String(hex).replace('#', '');
  const c = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - t) + 255 * t));
  return c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Retângulo de cantos arredondados (desenho ASS, origem no canto de cima à esquerda). */
function roundRect(W, H, r) {
  const q = (v) => Math.round(v);
  r = Math.max(0, Math.min(r, W / 2, H / 2));
  return `m ${q(r)} 0 l ${q(W - r)} 0 b ${q(W)} 0 ${q(W)} 0 ${q(W)} ${q(r)} l ${q(W)} ${q(H - r)} b ${q(W)} ${q(H)} ${q(W)} ${q(H)} ${q(W - r)} ${q(H)} `
    + `l ${q(r)} ${q(H)} b 0 ${q(H)} 0 ${q(H)} 0 ${q(H - r)} l 0 ${q(r)} b 0 0 0 0 ${q(r)} 0`;
}

/**
 * Gera o .ass da legenda. MESMO desenho da prévia do navegador (CaptionPreview.jsx):
 *  - o tamanho escolhido é o "em" do CSS; no ASS vira em × célula da fonte (fontMetrics);
 *  - cada linha é um evento próprio, posicionado com a mesma altura de linha do CSS
 *    (LINE_HEIGHT) e com a linha de base corrigida — o libass não tem espaçamento de
 *    linha, e com \N as duas linhas ficavam bem mais afastadas que na prévia;
 *  - caixas, marca-texto e sublinhado são desenhados do tamanho do texto (larguras reais
 *    das letras), como o fundo do CSS.
 * @param {Array} segments segmentos com {start,end,text,words:[{start,end,word}]}
 * @param {object} meta {width,height}
 * @param {object} style {template, color, font, fontScale, highlight, highlightStyle, ...}
 */
export function buildAss(segments, meta, style = {}) {
  const w = meta.width || 1080;
  const h = meta.height || 1920;
  const tplKey = CAPTION_TEMPLATES[style.template] ? style.template : style.mode === 'word' ? 'pop' : 'clean';
  const T = CAPTION_TEMPLATES[tplKey];
  const scale = style.fontScale || 1;
  const fontDef = FONT_DEFS[style.font] || fontById(T.defaultFont);
  const fontName = style.fontName || fontDef.family;
  const FM = fontMetrics(fontName);
  const boldFlag = T.bold && fontBold(fontDef) ? -1 : 0;
  const accentHex = colorHex(style.color);
  const accent = assColor(accentHex);
  const accentIsWhite = isWhiteish(accentHex);
  const WHITE = assColor('FFFFFF');
  const BLACK = assColor('000000');

  const mode = ['word', 'phrase'].includes(style.mode) ? style.mode : T.mode;
  const em = h * T.size * scale; // tamanho da letra (= font-size do CSS), em px do quadro
  const fsOf = (emPx, fm = FM) => Math.max(1, Math.round(emPx * fm.cell));
  const size = fsOf(em);
  const bg = ['shadow', 'box', 'bar', 'glow', 'none', 'clean'].includes(style.background)
    ? style.background
    : T.box ? 'box' : T.soft ? 'clean' : 'shadow';
  const useBox = bg === 'box' || bg === 'bar';
  const glowOn = bg === 'glow' || ((style.background == null || style.background === 'auto') && !!T.glow);
  const outline = bg === 'clean' || T.outline === 0 ? 0 : Math.max(2, Math.round(em * T.outline));
  let shadow = bg === 'clean'
    ? Math.max(2, Math.round(em * 0.05))
    : bg === 'none' || glowOn || useBox ? 0 : Math.max(1, Math.round(em * 0.05));
  // Sombra das letras escolhida pelo usuário: do estilo | sem | personalizada (distância
  // e intensidade). Mesma conta da prévia (CaptionPreview → textStyle).
  const shMode = ['off', 'on'].includes(style.shadowMode) ? style.shadowMode : 'auto';
  let backAlpha = '90';
  if (shMode === 'off') shadow = 0;
  else if (shMode === 'on' && !useBox) {
    const size = Math.min(3, Math.max(0.3, Number(style.shadowSize) || 1));
    const op = Math.min(1, Math.max(0.1, Number(style.shadowOpacity) || 0.6));
    shadow = Math.max(1, Math.round(em * 0.05 * size));
    backAlpha = Math.round((1 - op) * 255).toString(16).padStart(2, '0').toUpperCase();
  }
  // Espaçamento entre as letras (em): também entra na largura das caixas/marcações.
  const sp = T.premium ? 0 : Math.min(0.3, Math.max(-0.05, Number(style.letterSpacing) || 0));
  const highlight = style.highlight === true || !!T.forceHighlight;
  const hl = HIGHLIGHT_IDS.includes(style.highlightStyle) ? style.highlightStyle : T.hl || 'color';
  const upper = !!T.upper;
  const up = (word) => (upper ? String(word).toUpperCase() : String(word));

  // ── Onde fica o bloco de texto ──
  const pos = ['top', 'center', 'bottom'].includes(style.position) ? style.position : 'auto';
  const kind = pos !== 'auto' ? pos : T.align === 8 ? 'top' : T.align === 5 ? 'center' : 'bottom';
  // Área segura das redes (vídeo vertical): a legenda não fica atrás dos botões nem da
  // descrição do Instagram/TikTok — sobe acima da faixa de baixo e estreita nas laterais.
  const safe = safeCaptionBox({ w, h, kind, marginV: pos === 'center' ? 0 : pos === 'top' || pos === 'bottom' ? 0.12 : T.marginV, safe: style.safeZone !== false });
  const margin = style.marginV != null ? style.marginV : Math.round(h * safe.marginV);
  const globalPos = posOf({ px: style.posX, py: style.posY });
  const manual = (p) => {
    const q = p && p.px != null ? p : globalPos;
    if (q.px == null) return null;
    return { x: Math.min(0.94, Math.max(0.06, q.px)) * w, y: Math.min(0.96, Math.max(0.04, q.py)) * h };
  };
  const padY = useBox ? em * 0.05 : 0;
  const padX = useBox ? em * 0.28 : 0;
  // Tela dividida com B-roll: a legenda vai para o MEIO do quadro (na linha entre as duas
  // metades) — a menos que o usuário tenha posto a legenda num lugar.
  const centerWins = Array.isArray(style.centerWindows) ? style.centerWindows.filter((x) => x && x.end > x.start) : [];
  const inCenterWin = (p) => Number.isFinite(p?.start) && centerWins.some((x) => p.start >= x.start - 0.05 && p.start < x.end);
  /** Centros (x, y de cada linha) de um bloco com estas alturas de linha. */
  function place(lineHs, p) {
    const total = lineHs.reduce((x, y) => x + y, 0) + 2 * padY;
    const m = manual(p);
    const cx = m ? m.x : w / 2;
    const k = !m && inCenterWin(p) ? 'center' : kind;
    const top = m ? m.y - total / 2 : k === 'top' ? margin : k === 'center' ? h / 2 - total / 2 : h - margin - total;
    const ys = [];
    let y = top + padY;
    for (const lh of lineHs) {
      ys.push(y + lh / 2);
      y += lh;
    }
    return { cx, ys, top, total };
  }
  /** y do \pos (\an5) de uma linha cujo centro (no CSS) é `cy`, com fonte de tamanho e. */
  const yAss = (cy, e, fm = FM, strutEm = e, strutFm = fm) => Math.round(cy + strutFm.cssBase * strutEm - fm.assBase * e);
  const posTag = (x, y) => `\\an5\\pos(${Math.round(x)},${Math.round(y)})`;

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    // 2 = sem quebra automática: as linhas são as dos cartões.
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // No brilho neon, o contorno vira a COR de destaque (halo colorido, borrado).
    `Style: Rise,${fontName},${size},${WHITE},${accent},${glowOn ? accent : BLACK},&H${backAlpha}000000,${boldFlag},0,0,0,100,100,${+(sp * em).toFixed(2)},0,1,${outline},${shadow},5,60,60,0,1`,
    // Desenhos (caixas, marca-texto, sublinhado)
    'Style: RiseBox,Arial,20,&H00000000,&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const animKind = style.animation && style.animation !== 'auto' && CAPTION_ANIMATIONS[style.animation] ? style.animation : T.anim;
  const anim = animTag(animKind);
  const glow = glowOn ? '\\blur3' : '';
  const lines = [];
  const ev = (layer, t0, t1, styleName, text) => lines.push(`Dialogue: ${layer},${assTime(t0)},${assTime(t1)},${styleName},,0,0,0,,${text}`);
  /** Caixa desenhada centrada em (x, y). alpha "00" = sólida. */
  const rect = (layer, t0, t1, x, y, W, H, hex, { alpha = '00', r = em * 0.2, tags = '' } = {}) => {
    if (!(W > 0 && H > 0)) return;
    ev(layer, t0, t1, 'RiseBox', `{${posTag(x, y)}\\bord0\\shad0\\1c&H${bgr(hex)}&\\1a&H${alpha}&${tags}\\p1}${roundRect(W, H, r)}`);
  };

  // Efeitos fixos do estilo no texto: sombra dura (3D), vazado.
  const hardShadow = T.hardShadow && bg !== 'clean' && !useBox && shMode === 'auto'
    ? `\\4c${T.hardShadow === 'accent' ? accent : BLACK}\\4a&H00&\\xshad${Math.max(2, Math.round(em * (T.hardShadow === 'accent' ? 0.07 : 0.06)))}\\yshad${Math.max(2, Math.round(em * (T.hardShadow === 'accent' ? 0.07 : 0.06)))}`
    : '';
  const hollowOff = T.hollow ? `\\1a&HFF&\\3c${WHITE}\\bord${Math.max(2, Math.round(em * 0.045))}\\shad0` : '';
  const hollowOn = T.hollow ? `\\1a&H00&\\3c${BLACK}\\bord${outline}\\shad${shadow}` : '';

  // Ênfase manual de uma palavra (cor própria e/ou maior). Depois dela volta ao normal.
  const emHex = (wd) => colorHex(wd.emColor, null);
  const hasEm = (wd) => !!(wd.emColor || wd.emBig);
  const wordScale = (wd, j, kw) => (wd.emBig ? 1.3 : j === kw ? T.kwScale || 1.18 : 1);
  const tw = (text) => FM.width(text) + sp * [...String(text)].length; // largura em em (com o espaçamento)
  const spaceW = FM.width(' ') + sp;

  // Linhas e caracteres por linha: cada frase vira "cartões" de no máximo 1 ou 2 linhas.
  const maxLines = style.lines === 1 ? 1 : 2;
  const maxChars = Number(style.maxChars) > 0 ? Number(style.maxChars) : autoMaxChars(w, em, upper, T.premium ? 0.86 : safe.widthFrac);
  const groups = [];
  for (const seg of segments) {
    const raw = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }];
    const ws = raw
      .map((wd) => ({ start: Number(wd.start) || 0, end: Number(wd.end) || 0, word: String(wd.word ?? '').trim(), ...posOf(wd), ...emphasisOf(wd) }))
      .filter((wd) => wd.word.length > 0);
    if (!ws.length) continue;
    if (mode === 'word') groups.push({ seg, words: ws });
    else {
      // O cartão nunca atravessa o começo/fim da tela dividida do B-roll: assim a legenda
      // pula para o meio no instante em que o B-roll entra (e volta quando ele sai).
      const runs = [];
      for (const wd of ws) {
        const inside = inCenterWin(wd);
        if (!runs.length || runs[runs.length - 1].inside !== inside) runs.push({ inside, words: [] });
        runs[runs.length - 1].words.push(wd);
      }
      runs.forEach((run, ri) => {
        const runEnd = ri + 1 < runs.length ? runs[ri + 1].words[0].start : seg.end;
        for (const card of layoutCaption(run.words, { lines: maxLines, maxChars, segEnd: runEnd })) groups.push({ seg: { ...seg, end: card.end }, words: card.words });
      });
    }
  }

  /** Índices de cada linha do cartão (quebra do cartão, ou a palavra-chave que desce no "duas linhas"). */
  function splitLines(words, kw) {
    const duo = T.keywordBreak && maxLines > 1 && kw >= 0 && words.length > 1;
    const out = [[]];
    words.forEach((wd, j) => {
      const brk = j > 0 && (duo ? j === kw || (kw === 0 && j === 1) : wd.br);
      if (brk) out.push([]);
      out[out.length - 1].push(j);
    });
    return out;
  }
  /** Geometria do cartão: altura e largura de cada linha, x de cada palavra. */
  function geometry(words, kw, p) {
    const ls = splitLines(words, kw);
    const lineHs = ls.map((idx) => em * LINE_HEIGHT * Math.max(...idx.map((j) => wordScale(words[j], j, kw))));
    const box = place(lineHs, p);
    const wx = [];
    const lineW = ls.map((idx, li) => {
      const widths = idx.map((j) => tw(up(words[j].word)) * em * wordScale(words[j], j, kw));
      const total = widths.reduce((x, y) => x + y, 0) + spaceW * em * (idx.length - 1);
      let x = box.cx - total / 2;
      idx.forEach((j, k) => {
        wx[j] = { x0: x, x1: x + widths[k], line: li };
        x += widths[k] + spaceW * em;
      });
      return total;
    });
    return { ls, lineHs, box, lineW, wx };
  }
  /** Um evento por linha, com o mesmo prefixo de efeitos. `partOf(j)` = texto da palavra j. */
  function emitLines(layer, t0, t1, g, prefix, partOf, words, kw) {
    g.ls.forEach((idx, li) => {
      const emL = em * Math.max(...idx.map((j) => wordScale(words[j], j, kw)));
      const text = idx.map((j) => partOf(j)).join(' ');
      ev(layer, t0, t1, 'Rise', `{${posTag(g.box.cx, yAss(g.box.ys[li], emL))}${prefix}}${text}`);
    });
  }
  /** Caixa de fundo da frase (fundo "caixa"/"barra"), como o fundo do texto no CSS. */
  function phraseBox(t0, t1, g, layer = 0) {
    if (!useBox) return;
    const W = Math.max(...g.lineW) + 2 * padX;
    const H = g.box.total;
    const hex = bg === 'bar' ? '101014' : '101014';
    rect(layer, t0, t1, g.box.cx, g.box.top + H / 2, W, H, hex, { alpha: bg === 'bar' ? '73' : '00', tags: fadeOf(anim) });
  }

  for (const { seg, words } of groups) {
    if (mode === 'word') {
      // Uma palavra por vez, com o movimento do estilo.
      // Na caixa: texto escuro na caixa branca, ou branco na caixa colorida.
      const boxHex = accentIsWhite ? 'FFFFFF' : accentHex;
      const wordFill = useBox ? (bg === 'bar' ? WHITE : isLightHex(boxHex) ? assColor('111111') : WHITE) : glowOn ? '' : accent;
      for (let i = 0; i < words.length; i++) {
        const wd = words[i];
        const nextStart = i + 1 < words.length ? words[i + 1].start : seg.end;
        const end = Math.max(wd.start + 0.1, Math.min(Math.max(wd.end, wd.start + 0.12), nextStart));
        const disp = up(wd.word);
        let e = em * (wd.emBig ? 1.3 : 1);
        // Auto-ajuste: palavra longa encolhe para caber na largura do quadro.
        const avail = w * 0.86 - 2 * padX;
        const wpx = tw(disp) * e;
        if (wpx > avail) e = Math.max(e * 0.45, (e * avail) / wpx);
        const lineH = e * LINE_HEIGHT;
        const box = place([lineH], wd);
        const fs = fsOf(e);
        const fsTag = fs !== size ? `\\fs${fs}` : '';
        const fill = wd.emColor ? `\\c${assColor(emHex(wd))}` : wordFill ? `\\c${wordFill}` : '';
        if (useBox) {
          const W = tw(disp) * e + 2 * padX;
          rect(0, wd.start, end, box.cx, box.top + box.total / 2, W, box.total, bg === 'bar' ? '101014' : boxHex, { alpha: bg === 'bar' ? '73' : '00', tags: anim });
        }
        ev(1, wd.start, end, 'Rise', `{${posTag(box.cx, yAss(box.ys[0], e))}${fsTag}${anim}${glow}${useBox ? '\\bord0\\shad0' : hardShadow}${fill}}${escapeAss(disp)}`);
      }
    } else if (T.premium) {
      // Cada palavra aparece quando é falada (as próximas já ocupam o lugar, invisíveis).
      // Pequenas em cima (fonte leve); a parte grande embaixo, com brilho.
      const premCol = accentIsWhite ? 'C6F25A' : accentHex;
      const fillC = assColor(tint(premCol, accentIsWhite ? 0.72 : 0.55));
      const glowC = assColor(premCol);
      const smallDef = fontById(T.smallFont);
      const SM = fontMetrics(smallDef.family);
      const smallEm = h * T.smallSize * scale;
      const plainEm = em * 0.78;
      const glowBord = Math.max(2, Math.round(em * 0.1));
      const glowBlur = Math.max(4, Math.round(em * 0.16));
      const STRUT = 1.02; // altura de linha do bloco premium na prévia
      for (const ch of premiumChunks(words, seg.end)) {
        const cw = ch.words;
        const topIdx = cw.map((_, j) => j).filter((j) => j < ch.big);
        const botIdx = cw.map((_, j) => j).filter((j) => j >= ch.big);
        const bigScale = Math.max(...botIdx.map((j) => (cw[j].emBig ? 1.3 : 1)));
        const lineHs = [...(topIdx.length ? [em * STRUT] : []), em * STRUT * bigScale];
        const box = place(lineHs, cw[0]);
        for (let i = 0; i < cw.length; i++) {
          const start = cw[i].start;
          const end = i + 1 < cw.length ? cw[i + 1].start : ch.end;
          const part = (j) => {
            const wd = cw[j];
            const big = j >= ch.big;
            const glowing = big && ch.glow;
            const emC = wd.emColor ? assColor(emHex(wd)) : null;
            let look;
            if (!big) {
              look = `\\fn${smallDef.family}\\fs${fsOf(smallEm, SM)}\\b1\\c${emC || WHITE}\\bord0\\shad${Math.max(1, Math.round(smallEm * 0.06))}\\blur0`;
            } else if (glowing) {
              look = `\\fn${fontName}\\fs${fsOf(wd.emBig ? em * 1.3 : em)}\\b0\\c${emC || fillC}\\3c${emC || glowC}\\bord${glowBord}\\blur${glowBlur}\\shad0`;
            } else {
              look = `\\fn${fontName}\\fs${fsOf(plainEm)}\\b0\\c${emC || WHITE}\\3c&H000000&\\bord${Math.max(1, Math.round(plainEm * 0.04))}\\blur1\\shad0`;
            }
            const shown = glowing ? '\\1a&H00&\\3a&H60&\\4a&HFF&' : '\\1a&H00&\\3a&H40&\\4a&H80&';
            if (j > i) return `{${look}\\1a&HFF&\\3a&HFF&\\4a&HFF&}${escapeAss(wd.word)}`;
            if (j < i) return `{${look}${shown}}${escapeAss(wd.word)}`;
            // Entrando agora: as grandes chegam esticadas e desfocadas.
            const enter = big ? '\\fscx118\\be10\\t(0,180,\\fscx100\\be0)' : '\\fscx92\\t(0,120,\\fscx100)';
            return `{${look}\\1a&HFF&\\3a&HFF&\\4a&HFF&${enter}\\t(0,150,${shown})}${escapeAss(wd.word)}`;
          };
          let li = 0;
          if (topIdx.length) {
            ev(0, start, end, 'Rise', `{${posTag(box.cx, yAss(box.ys[0], smallEm, SM, em, FM))}}${topIdx.map(part).join(' ')}`);
            li = 1;
          }
          ev(0, start, end, 'Rise', `{${posTag(box.cx, yAss(box.ys[li], em * bigScale))}}${botIdx.map(part).join(' ')}`);
        }
      }
    } else {
      const kw = T.highlightKeyword ? pickKeyword(words) : -1;
      const g = geometry(words, kw, words[0]);
      const endAll = Math.max(words[words.length - 1].end, Number(seg.end) || 0);
      // Cor base da frase: nos estilos de palavra-chave, com destaque, caixa ou brilho a
      // frase fica branca; nos demais, na cor escolhida.
      const plainColored = !highlight && !useBox && !glowOn && !accentIsWhite && !T.highlightKeyword;
      const fill = plainColored ? accent : WHITE;
      // Com caixa/barra atrás, o texto fica sem contorno e sem sombra (como no CSS).
      const txtBord = useBox ? 0 : outline;
      const txtShad = useBox ? 0 : shadow;
      const base = `${plainColored ? `\\c${accent}` : ''}${useBox ? '\\bord0\\shad0' : ''}${hardShadow}${hollowOff}`;
      const kwBig = (j) => `\\fscx${Math.round((T.kwScale || 1.18) * 100)}\\fscy${Math.round((T.kwScale || 1.18) * 100)}`;
      const emPart = (wd, t) => `{${emHex(wd) ? `\\1a&H00&\\c${assColor(emHex(wd))}` : ''}${wd.emBig ? '\\fscx130\\fscy130' : ''}}${t}{\\fscx100\\fscy100\\c${fill}${T.hollow ? '\\1a&HFF&' : ''}}`;
      const kwPart = (t) => (glowOn ? `{${kwBig()}}${t}{\\fscx100\\fscy100}` : `{${kwBig()}\\c${accent}${T.hollow ? hollowOn : ''}}${t}{\\fscx100\\fscy100\\c${fill}${hollowOff}}`);

      if (!highlight) {
        // Legenda normal: a frase inteira, sem destacar a palavra falada (a palavra-chave
        // continua realçada nos estilos de palavra-chave).
        phraseBox(words[0].start, endAll, g);
        const partOf = (j) => {
          const wd = words[j];
          const t = escapeAss(up(wd.word));
          if (hasEm(wd)) return emPart(wd, t);
          return j === kw ? kwPart(t) : t;
        };
        emitLines(1, words[0].start, endAll, g, `${anim}${glow}${base}`, partOf, words, kw);
      } else {
        // Destaque da palavra falada: um evento por palavra (por linha).
        phraseBox(words[0].start, endAll, g);
        const dim = T.dimOthers ? '\\alpha&H60&' : '\\alpha&H70&';
        const markHex = accentIsWhite ? 'FFFFFF' : accentHex;
        for (let i = 0; i < words.length; i++) {
          const start = words[i].start;
          const end = i + 1 < words.length ? words[i + 1].start : endAll;
          const a1 = i === 0 ? anim : '';
          // Caixa (marca-texto) ou sublinhado desenhados atrás/embaixo da palavra falada.
          const cur = g.wx[i];
          const curEm = em * wordScale(words[i], i, kw);
          const cy = g.box.ys[cur.line];
          if (hl === 'box') {
            rect(0, start, end, (cur.x0 + cur.x1) / 2, cy, cur.x1 - cur.x0 + 0.2 * curEm, LINE_HEIGHT * curEm, markHex, { r: 0.1 * curEm, tags: i === 0 ? fadeOf(anim) : '' });
          } else if (hl === 'underline') {
            const th = Math.max(2, 0.08 * curEm);
            rect(0, start, end, (cur.x0 + cur.x1) / 2, cy + FM.cssBase * curEm + 0.12 * curEm + th / 2, cur.x1 - cur.x0, th, markHex, { r: th / 2, tags: i === 0 ? fadeOf(anim) : '' });
          }
          const partOf = (j) => {
            const wd = words[j];
            const t = escapeAss(up(wd.word));
            if (hasEm(wd)) return `{\\alpha&H00&}${emPart(wd, t)}`;
            if (j === kw) return glowOn ? `{\\alpha&H00&${kwBig()}}${t}{\\fscx100\\fscy100}` : `{\\alpha&H00&}${kwPart(t)}`;
            if (j === i) {
              if (T.hollow) return `{${hollowOn}\\c${accentIsWhite ? WHITE : accent}}${t}{${hollowOff}\\c${WHITE}}`;
              if (hl === 'box') return `{\\alpha&H00&\\c${isLightHex(markHex) ? assColor('111111') : WHITE}\\bord0\\shad0}${t}{\\c${WHITE}\\bord${txtBord}\\shad${txtShad}}`;
              if (hl === 'glow') return `{\\alpha&H00&\\3c${accent}\\bord${Math.max(2, Math.round(em * 0.08))}\\blur${Math.max(3, Math.round(em * 0.12))}}${t}{\\3c${glowOn ? accent : BLACK}\\bord${txtBord}\\blur${glowOn ? 3 : 0}}`;
              if (hl === 'underline') return `{\\alpha&H00&}${t}`;
              const col = T.highlightKeyword || accentIsWhite || glowOn ? '' : `\\c${accent}`;
              if (hl === 'scale') return `{\\alpha&H00&${col}\\fscx118\\fscy118}${t}{\\fscx100\\fscy100\\c${WHITE}}`;
              return `{\\alpha&H00&${col}}${t}{\\c${WHITE}}`;
            }
            if (T.hollow) return t;
            if ((hl === 'color' && accentIsWhite) || T.dimOthers) return `{${dim}}${t}{\\alpha&H00&}`;
            return t;
          };
          emitLines(1, start, end, g, `${a1}${glow}${base}`, partOf, words, kw);
        }
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
