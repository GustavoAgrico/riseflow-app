import path from 'node:path';
import fs from 'node:fs/promises';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { fontsDirArg } from './captions.js';
import { fontById } from '../../../shared/captionStyle.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('texts');

const ANIM_MS = 350;

function assTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const cs = Math.round((s % 60) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(cs / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
/** "#RRGGBB" → cor ASS "&H00BBGGRR". */
function assColor(hex) {
  const h = String(hex).replace('#', '').padStart(6, '0');
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}
/** Texto seguro para o ASS: sem chaves (viram tags) e com quebra de linha \N. */
function assText(t) {
  return String(t).replace(/[{}]/g, '').replace(/\\/g, '').split('\n').map((l) => l.trim()).join('\\N');
}

/**
 * Monta o .ass dos textos livres (um estilo por texto). Puro/exportado para teste.
 * Posição pelo centro (\an5\pos), animações com \fad, \t e \move — o mesmo motor
 * (libass) e as mesmas fontes das legendas.
 */
export function buildTextAss(layers, meta) {
  const W = meta.width || 1080;
  const H = meta.height || 1920;
  const styles = [];
  const events = [];
  layers.forEach((l, i) => {
    const f = fontById(l.font);
    const size = Math.max(8, Math.round(l.size * H));
    const bold = f.bold === false ? 0 : -1;
    const isBox = l.box === 'box';
    const outline = l.box === 'none' ? 0 : isBox ? Math.round(size * 0.28) : Math.max(2, Math.round(size * 0.07));
    // BorderStyle 3 = caixa sólida atrás do texto (cor no OutlineColour/BackColour).
    styles.push(`Style: T${i},${f.family},${size},${assColor(l.color)},${assColor(l.color)},${assColor(l.boxColor)},${assColor(l.boxColor)},${bold},0,0,0,100,100,0,0,${isBox ? 3 : 1},${outline},0,5,0,0,0,1`);
    const x = Math.round(l.x * W);
    const y = Math.round(l.y * H);
    const durMs = Math.round((l.end - l.start) * 1000);
    const a = Math.min(ANIM_MS, Math.floor(durMs / 3));
    const tags = [];
    if (l.animIn === 'slide-up') tags.push(`\\an5\\move(${x},${y + Math.round(H * 0.06)},${x},${y},0,${a})`);
    else if (l.animIn === 'slide-left') tags.push(`\\an5\\move(${x + Math.round(W * 0.2)},${y},${x},${y},0,${a})`);
    else tags.push(`\\an5\\pos(${x},${y})`);
    const fin = l.animIn === 'fade' || l.animIn === 'slide-up' || l.animIn === 'slide-left' ? a : 0;
    const fout = l.animOut === 'fade' ? a : 0;
    if (fin || fout) tags.push(`\\fad(${fin},${fout})`);
    if (l.animIn === 'pop') tags.push(`\\fscx0\\fscy0\\t(0,${Math.round(a * 0.6)},\\fscx115\\fscy115)\\t(${Math.round(a * 0.6)},${a},\\fscx100\\fscy100)`);
    if (l.animIn === 'zoom') tags.push(`\\fscx60\\fscy60\\alpha&HFF&\\t(0,${a},\\fscx100\\fscy100\\alpha&H00&)`);
    if (l.animOut === 'zoom') tags.push(`\\t(${durMs - a},${durMs},\\fscx0\\fscy0)`);
    events.push(`Dialogue: 0,${assTime(l.start)},${assTime(l.end)},T${i},,0,0,0,,{${tags.join('')}}${assText(l.text)}`);
  });
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styles,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}

/** Queima os textos livres no vídeo (por cima das legendas). */
export async function burnTexts(input, work, meta, layers, onProgress) {
  if (!layers?.length) return { output: input, count: 0 };
  const NAME = 'texts.ass';
  await fs.writeFile(path.join(work, NAME), buildTextAss(layers, meta), 'utf8');
  const fontsRel = await fontsDirArg(work);
  const output = path.join(work, 'texts.mp4');
  // cwd = pasta do job e o .ass pelo nome relativo (igual às legendas: sem drive/espaços).
  const args = ['-i', input, '-vf', `subtitles=${NAME}:fontsdir=${fontsRel}`, ...x264Fast()];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', '-y', output);
  await runFfmpeg(args, { label: 'texts', totalDuration: meta.duration, onProgress, cwd: work });
  log.ok(`textos queimados: ${layers.length}`);
  return { output, count: layers.length };
}
