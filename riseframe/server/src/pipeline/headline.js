import path from 'node:path';
import fs from 'node:fs/promises';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { fontsDirArg } from './captions.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('headline');

/**
 * Headline (título fixo no vídeo) e capa (quadro do vídeo com o título, em JPG).
 * Os dois são desenhados com o libass (mesmas fontes empacotadas das legendas), então
 * a tipografia sai igual em qualquer máquina.
 */

export const HEADLINE_STYLES = ['box', 'clean', 'bar'];
export const HEADLINE_POSITIONS = ['top', 'center', 'bottom'];
const HEX = /^#?[0-9a-f]{6}$/i;

/** Texto seguro para o título (uma ou duas linhas, sem caracteres de controle). */
function cleanText(t, max = 90) {
  return String(t || '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Headline vinda do cliente → { text, seconds (0 = vídeo todo), style, color, position }
 * ou null (sem texto). Puro/testável.
 */
export function sanitizeHeadline(h) {
  if (!h || typeof h !== 'object') return null;
  const text = cleanText(h.text);
  if (!text) return null;
  const sec = Number(h.seconds);
  return {
    text,
    seconds: Number.isFinite(sec) && sec > 0 ? Math.min(600, Math.max(1, sec)) : 0,
    style: HEADLINE_STYLES.includes(h.style) ? h.style : 'box',
    color: HEX.test(String(h.color || '')) ? String(h.color).replace('#', '').toUpperCase() : 'FF6B35',
    position: HEADLINE_POSITIONS.includes(h.position) ? h.position : 'top',
  };
}

/**
 * Capa vinda do cliente → { t (segundo do vídeo ORIGINAL), text, position, intro, fx }
 * ou null. `intro`: mostra a capa nos primeiros instantes do vídeo (vira a miniatura).
 */
export function sanitizeCover(c) {
  if (!c || typeof c !== 'object' || c.enabled === false) return null;
  const t = Number(c.t);
  const fx = Number(c.fx);
  return {
    t: Number.isFinite(t) && t >= 0 ? Math.min(100000, t) : 0,
    text: cleanText(c.text, 80),
    position: HEADLINE_POSITIONS.includes(c.position) ? c.position : 'center',
    intro: c.intro === true,
    fx: Number.isFinite(fx) ? Math.min(1, Math.max(0, fx)) : 0.5,
  };
}

/** "RRGGBB" → cor ASS "&HAABBGGRR" (alpha 00 = opaco). */
function assColor(hex, alpha = '00') {
  const h = String(hex).replace('#', '').padStart(6, '0');
  return `&H${alpha}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}
function assTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const cs = Math.round((s % 60) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(cs / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
/** Texto claro ou escuro sobre a cor da caixa (contraste). */
function textOn(hex) {
  const n = parseInt(hex, 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 160 ? '111111' : 'FFFFFF';
}

/**
 * Arquivo .ass com o título no quadro W×H, de `start` a `end` (s). `scale` aumenta a
 * letra (a capa usa letra maior). Puro/testável.
 */
export function headlineAss(h, W, H, { start = 0, end = 3600, scale = 1 } = {}) {
  const size = Math.round(Math.min(W, H) * 0.068 * scale);
  const align = h.position === 'center' ? 5 : h.position === 'bottom' ? 2 : 8;
  const marginV = Math.round(H * (h.position === 'center' ? 0 : 0.085));
  const marginH = Math.round(W * 0.08);
  let primary = assColor('FFFFFF');
  let outlineC = assColor('000000');
  let backC = '&H64000000';
  let border = 1;
  let outline = Math.max(2, Math.round(size * 0.06));
  let shadow = Math.max(1, Math.round(size * 0.04));
  if (h.style === 'box') {
    // caixa na cor da marca (BorderStyle 3 = caixa opaca; o "outline" vira o respiro da caixa)
    primary = assColor(textOn(h.color));
    outlineC = assColor(h.color);
    backC = assColor(h.color);
    border = 3;
    outline = Math.round(size * 0.32);
    shadow = 0;
  } else if (h.style === 'bar') {
    primary = assColor('FFFFFF');
    outlineC = '&H50000000';
    backC = '&H50000000';
    border = 3;
    outline = Math.round(size * 0.32);
    shadow = 0;
  }
  const text = h.text.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')');
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Headline,Montserrat,${size},${primary},${primary},${outlineC},${backC},-1,0,0,0,100,100,0,0,${border},${outline},${shadow},${align},${marginH},${marginH},${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 0,${assTime(start)},${assTime(end)},Headline,,0,0,0,,${text}`,
    '',
  ].join('\n');
}

/** Queima a headline no vídeo (do início até `seconds`, ou o vídeo todo). */
export async function burnHeadline(input, work, meta, headline, onProgress) {
  const W = meta.width;
  const H = meta.height;
  const end = headline.seconds > 0 ? Math.min(meta.duration, headline.seconds) : meta.duration + 1;
  await fs.writeFile(path.join(work, 'headline.ass'), headlineAss(headline, W, H, { start: 0, end }), 'utf8');
  const output = path.join(work, 'headline.mp4');
  const fontsRel = await fontsDirArg(work);
  const args = ['-i', input, '-vf', `subtitles=headline.ass:fontsdir=${fontsRel}`, ...x264Fast()];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', '-y', output);
  await runFfmpeg(args, { label: 'headline', totalDuration: meta.duration, onProgress, cwd: work });
  log.ok(`headline: "${headline.text}" (${headline.seconds ? `${headline.seconds}s` : 'vídeo todo'}, ${headline.style})`);
  return { output };
}

/**
 * Capa: o quadro do segundo `t` levado ao tamanho W×H (preenche e corta, com o ponto
 * horizontal `fx`), com a cor (`preVf`) e o título por cima. Gera um JPG em `outFile`.
 */
export async function makeCover(input, work, { t = 0, W, H, fx = 0.5, preVf = '', text = '', headline = null, position = 'center' }, outFile) {
  await fs.mkdir(work, { recursive: true });
  const chain = [preVf, `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos`, `crop=${W}:${H}:(iw-${W})*${fx.toFixed(3)}:(ih-${H})/2`, 'setsar=1'];
  if (text) {
    const h = { ...(headline || { style: 'box', color: 'FF6B35' }), text, position };
    await fs.writeFile(path.join(work, 'cover.ass'), headlineAss(h, W, H, { start: 0, end: 10, scale: 1.55 }), 'utf8');
    chain.push(`subtitles=cover.ass:fontsdir=${await fontsDirArg(work)}`);
  }
  await runFfmpeg(['-ss', Math.max(0, t).toFixed(2), '-i', input, '-frames:v', '1', '-vf', chain.filter(Boolean).join(','), '-q:v', '2', '-y', outFile], { label: 'capa', cwd: work });
  return outFile;
}
