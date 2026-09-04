import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runFfmpeg } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('captions');

// Pasta com as fontes premium empacotadas (OFL) — usada pelo libass via `fontsdir`,
// garantindo que a tipografia escolhida renderize igual em qualquer máquina.
const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'fonts');

// ─── Tipografia (fontes empacotadas) ──────────────────────────────────
// `family` é o nome interno da fonte (o que o libass procura).
export const CAPTION_FONTS = {
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
};

export const CAPTION_TEMPLATE_LABELS = {
  clean: 'Clássico (limpo)',
  pop: 'Pop (palavra a palavra)',
  hormozi: 'Impacto (bold)',
  box: 'Caixa (destaque)',
  neon: 'Neon (glow)',
  bounce: 'Bounce',
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
  const size = Math.round(h * T.size * scale);
  const outline = Math.max(2, Math.round(size * T.outline));
  const shadow = Math.max(1, Math.round(size * 0.05));
  const marginV = style.marginV != null ? style.marginV : Math.round(h * T.marginV);
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
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Rise,${fontName},${size},${WHITE},${accent},${assColor('000000')},&H90000000,${boldFlag},0,0,0,100,100,0,0,1,${outline},${shadow},${T.align},60,60,${marginV},1`,
  ];
  // Estilo com caixa opaca atrás da palavra (BorderStyle=3).
  if (T.box) {
    const boxColor = color === 'white' ? assColor('FFFFFF') : accent;
    const textColor = color === 'white' ? assColor('111111') : assColor('FFFFFF');
    const pad = Math.max(6, Math.round(size * 0.16));
    header.push(
      `Style: RiseBox,${fontName},${size},${textColor},${textColor},${boxColor},${boxColor},${boldFlag},0,0,0,100,100,0,0,3,${pad},0,${T.align},60,60,${marginV},1`,
    );
  }
  header.push('', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');

  // Animação escolhida pelo usuário (style.animation) OU a padrão do estilo.
  const animKind = style.animation && style.animation !== 'auto' && CAPTION_ANIMATIONS[style.animation] ? style.animation : T.anim;
  const anim = animTag(animKind);
  const glow = T.glow ? '\\blur4\\be1' : '';
  const lines = [];

  for (const seg of segments) {
    const raw = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }];
    const words = raw
      .map((wd) => ({ start: Number(wd.start) || 0, end: Number(wd.end) || 0, word: String(wd.word ?? '').trim() }))
      .filter((wd) => wd.word.length > 0);
    if (!words.length) continue;

    if (T.mode === 'word') {
      // Uma palavra por vez, centralizada, com o movimento do template.
      const styleName = T.box ? 'RiseBox' : 'Rise';
      const wordColor = T.box ? '' : `\\c${accent}`;
      for (let i = 0; i < words.length; i++) {
        const wd = words[i];
        // Fim = até o começo da PRÓXIMA palavra (nunca sobrepõe → nada de duas
        // palavras na tela ao mesmo tempo). Última palavra: até seu próprio fim.
        const nextStart = i + 1 < words.length ? words[i + 1].start : seg.end;
        const end = Math.max(wd.start + 0.1, Math.min(Math.max(wd.end, wd.start + 0.12), nextStart));
        const disp = T.upper ? wd.word.toUpperCase() : wd.word;
        const txt = escapeAss(disp);
        const fs = fitFontSize(disp, size);
        const fsTag = fs !== size ? `\\fs${fs}` : '';
        const ov = `{\\an${T.align}${fsTag}${anim}${glow}${wordColor}}`;
        lines.push(`Dialogue: 0,${assTime(wd.start)},${assTime(end)},${styleName},,0,0,0,,${ov}${txt}`);
      }
    } else {
      // Frase inteira; a palavra corrente é destacada (por cor, ou — no branco —
      // pelo escurecimento das demais).
      for (let i = 0; i < words.length; i++) {
        const start = words[i].start;
        const end = i + 1 < words.length ? words[i + 1].start : Math.max(words[i].end, seg.end);
        const rendered = words
          .map((wd, j) => {
            const t = escapeAss(T.upper ? wd.word.toUpperCase() : wd.word);
            if (j === i) return `{\\alpha&H00&\\c${accent}}${t}{\\c${WHITE}}`;
            if (color === 'white') return `{\\alpha&H70&}${t}{\\alpha&H00&}`;
            return t;
          })
          .join(' ');
        lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Rise,,0,0,0,,{${anim}${glow}}${rendered}`);
      }
    }
  }

  return `${header.join('\n')}\n${lines.join('\n')}\n`;
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
  const fontsRel = path.relative(work, FONTS_DIR).split(path.sep).join('/');
  const vf = `subtitles=${ASS_NAME}:fontsdir=${fontsRel}`;
  const args = ['-i', input, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16'];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'captions', totalDuration: meta.duration, onProgress, cwd: work });
  const tpl = CAPTION_TEMPLATES[style.template] ? style.template : style.mode === 'word' ? 'pop' : 'clean';
  log.ok(`legendas queimadas (${transcript.segments.length} seg, estilo ${tpl}, cor ${style.color || 'white'})`);
  return { output, count: transcript.segments.length };
}
