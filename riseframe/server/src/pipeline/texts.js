import path from 'node:path';
import fs from 'node:fs/promises';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { fontsDirArg, jobFontsDir } from './captions.js';
import { fontById } from '../../../shared/captionStyle.js';
import { textBoxMetrics } from '../../../shared/textLayers.js';
import { fontMetrics, fontMetricsFile } from './fontMetrics.js';
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
 * Retângulo de cantos arredondados (desenho ASS, origem no canto de cima à esquerda). As
 * curvas usam o ponto de controle do arco de círculo (0,552), igual ao border-radius do CSS.
 */
function roundRect(W, H, r) {
  const q = (v) => Math.round(v);
  r = Math.max(0, Math.min(r, W / 2, H / 2));
  const k = r * 0.4477; // r × (1 − 0,5523)
  return `m ${q(r)} 0 l ${q(W - r)} 0 b ${q(W - k)} 0 ${q(W)} ${q(k)} ${q(W)} ${q(r)} l ${q(W)} ${q(H - r)} b ${q(W)} ${q(H - k)} ${q(W - k)} ${q(H)} ${q(W - r)} ${q(H)} `
    + `l ${q(r)} ${q(H)} b ${q(k)} ${q(H)} 0 ${q(H - k)} 0 ${q(H - r)} l 0 ${q(r)} b 0 ${q(k)} ${q(k)} 0 ${q(r)} 0`;
}

/**
 * Monta o .ass dos textos livres. Puro/exportado para teste. MESMO desenho da prévia
 * (StageLayers no editor): o tamanho é o "em" do CSS (no ASS vira em × célula da fonte),
 * cada linha é um evento com a altura de linha do CSS, e a caixa de cada linha é desenhada
 * do tamanho do texto (larguras reais das letras), com a folga e os cantos escolhidos.
 * Animações com \fad, \t e \move — o mesmo motor (libass) e as mesmas fontes das legendas.
 */
export function buildTextAss(layers, meta) {
  const W = meta.width || 1080;
  const H = meta.height || 1920;
  const styles = [];
  const events = [];
  layers.forEach((l, i) => {
    const custom = l.fontFile && l.fontFamily;
    const f = custom ? { family: l.fontFamily, bold: false } : fontById(l.font);
    const FM = custom ? fontMetricsFile(l.fontFile) : fontMetrics(f.family);
    const em = l.size * H; // = font-size do CSS, em px do quadro
    const size = Math.max(8, Math.round(em * FM.cell));
    const bold = f.bold === false ? 0 : -1;
    const isBox = l.box === 'box';
    // contorno do CSS (stroke por baixo do texto): metade dele fica para fora da letra
    const outline = l.box === 'outline' ? Math.max(1, Math.round(em * 0.035)) : 0;
    styles.push(`Style: T${i},${f.family},${size},${assColor(l.color)},${assColor(l.color)},${assColor(l.boxColor)},&H00000000,${bold},0,0,0,100,100,0,0,1,${outline},0,5,0,0,0,1`);
    const g = textBoxMetrics(l);
    const x = Math.round(l.x * W);
    const y = l.y * H;
    const durMs = Math.round((l.end - l.start) * 1000);
    const a = Math.min(ANIM_MS, Math.floor(durMs / 3));
    // mesma animação em cada pedaço (caixa e texto de cada linha)
    const tagsAt = (px, py) => {
      const tags = [];
      if (l.animIn === 'slide-up') tags.push(`\\an5\\move(${px},${py + Math.round(H * 0.06)},${px},${py},0,${a})`);
      else if (l.animIn === 'slide-left') tags.push(`\\an5\\move(${px + Math.round(W * 0.2)},${py},${px},${py},0,${a})`);
      else tags.push(`\\an5\\pos(${px},${py})`);
      const fin = l.animIn === 'fade' || l.animIn === 'slide-up' || l.animIn === 'slide-left' ? a : 0;
      const fout = l.animOut === 'fade' ? a : 0;
      if (fin || fout) tags.push(`\\fad(${fin},${fout})`);
      if (l.animIn === 'pop') tags.push(`\\fscx0\\fscy0\\t(0,${Math.round(a * 0.6)},\\fscx115\\fscy115)\\t(${Math.round(a * 0.6)},${a},\\fscx100\\fscy100)`);
      if (l.animIn === 'zoom') tags.push(`\\fscx60\\fscy60\\alpha&HFF&\\t(0,${a},\\fscx100\\fscy100\\alpha&H00&)`);
      if (l.animOut === 'zoom') tags.push(`\\t(${durMs - a},${durMs},\\fscx0\\fscy0)`);
      return tags.join('');
    };
    const lines = String(l.text).replace(/[{}]/g, '').replace(/\\/g, '').split('\n');
    const pitch = g.pitch * em;
    const top = y - (lines.length * pitch) / 2;
    lines.forEach((line, j) => {
      if (!line.trim()) return;
      const cy = top + (j + 0.5) * pitch;
      if (isBox) {
        const bw = FM.width(line) * em + 2 * g.padX * em;
        const bh = g.boxH * em;
        events.push(`Dialogue: ${i * 2},${assTime(l.start)},${assTime(l.end)},TBox,,0,0,0,,{${tagsAt(x, Math.round(cy))}\\bord0\\shad0\\1c${assColor(l.boxColor).replace('&H00', '&H')}&\\p1}${roundRect(bw, bh, g.r * em)}`);
      }
      const ty = Math.round(cy + FM.cssBase * em - FM.assBase * em);
      events.push(`Dialogue: ${i * 2 + 1},${assTime(l.start)},${assTime(l.end)},T${i},,0,0,0,,{${tagsAt(x, ty)}}${line}`);
    });
  });
  styles.push('Style: TBox,Arial,20,&H00000000,&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1');
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
  const own = layers.map((l) => l.fontFile).filter(Boolean);
  const fontsRel = own.length ? await fontsDirArg(work, await jobFontsDir(work, own)) : await fontsDirArg(work);
  const output = path.join(work, 'texts.mp4');
  // cwd = pasta do job e o .ass pelo nome relativo (igual às legendas: sem drive/espaços).
  const args = ['-i', input, '-vf', `subtitles=${NAME}:fontsdir=${fontsRel}`, ...x264Fast()];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', '-y', output);
  await runFfmpeg(args, { label: 'texts', totalDuration: meta.duration, onProgress, cwd: work });
  log.ok(`textos queimados: ${layers.length}`);
  return { output, count: layers.length };
}
