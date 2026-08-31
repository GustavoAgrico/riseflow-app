import path from 'node:path';
import fs from 'node:fs/promises';
import { runFfmpeg } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('captions');

/** "RRGGBB" (ou "#RRGGBB") → cor ASS "&H00BBGGRR". */
function assColor(hex) {
  const h = String(hex).replace('#', '').padStart(6, '0');
  const rr = h.slice(0, 2);
  const gg = h.slice(2, 4);
  const bb = h.slice(4, 6);
  return `&H00${bb}${gg}${rr}`.toUpperCase();
}

function assTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const cs = Math.round((s % 60) * 100); // centésimos
  const ss = Math.floor(cs / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function escapeAss(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\n/g, ' ');
}

const PRESETS = {
  // paleta alinhada ao brief: laranja #FF6B35, roxo #7C3AED
  laranja: { primary: 'FFFFFF', highlight: 'FF6B35', outline: '000000' },
  roxo: { primary: 'FFFFFF', highlight: '7C3AED', outline: '000000' },
  branco: { primary: 'FFFFFF', highlight: 'FFE24B', outline: '000000' },
};

/**
 * Gera o conteúdo de um arquivo .ass com legendas dinâmicas.
 * @param {Array} segments  segmentos com {start,end,text,words:[{start,end,word}]}
 * @param {object} meta      {width,height}
 * @param {object} style     {mode:'karaoke'|'word', preset, fontName, fontScale, marginV}
 */
export function buildAss(segments, meta, style = {}) {
  const w = meta.width || 1080;
  const h = meta.height || 1920;
  const mode = style.mode === 'word' ? 'word' : 'karaoke';
  const palette = PRESETS[style.preset] || PRESETS.laranja;
  const fontName = style.fontName || 'DejaVu Sans';
  const scale = style.fontScale || 1;

  const baseSize = Math.round(h * (mode === 'word' ? 0.11 : 0.068) * scale);
  const outline = Math.max(2, Math.round(baseSize * 0.09));
  const shadow = Math.max(1, Math.round(baseSize * 0.04));
  const align = mode === 'word' ? 5 : 2; // 5=centro, 2=base-centro
  const marginV = style.marginV ?? Math.round(h * (mode === 'word' ? 0.0 : 0.14));

  const primary = assColor(palette.primary);
  const highlight = assColor(palette.highlight);
  const outlineC = assColor(palette.outline);

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Rise,${fontName},${baseSize},${primary},${highlight},${outlineC},&H80000000,-1,0,0,0,100,100,0,0,1,${outline},${shadow},${align},60,60,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const lines = [];
  for (const seg of segments) {
    const words = seg.words && seg.words.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }];

    if (mode === 'word') {
      // Uma palavra grande por vez, com um leve "pop".
      for (const wd of words) {
        const end = Math.max(wd.end, wd.start + 0.12);
        const txt = `{\\an5\\fad(60,60)\\fscx80\\fscy80\\t(0,120,\\fscx105\\fscy105)\\t(120,200,\\fscx100\\fscy100)\\c${highlight}}${escapeAss(wd.word.toUpperCase())}`;
        lines.push(`Dialogue: 0,${assTime(wd.start)},${assTime(end)},Rise,,0,0,0,,${txt}`);
      }
    } else {
      // Frase inteira, destacando a palavra corrente (estilo karaokê).
      for (let i = 0; i < words.length; i++) {
        const start = words[i].start;
        const end = i + 1 < words.length ? words[i + 1].start : Math.max(words[i].end, seg.end);
        const rendered = words
          .map((wd, j) => {
            const t = escapeAss(wd.word);
            return j === i ? `{\\c${highlight}}${t}{\\c${primary}}` : t;
          })
          .join(' ');
        const txt = `{\\fad(40,40)}${rendered}`;
        lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Rise,,0,0,0,,${txt}`);
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
  const assPath = path.join(work, 'captions.ass');
  await fs.writeFile(assPath, ass, 'utf8');

  const output = path.join(work, 'captioned.mp4');
  // subtitles= exige escapar o caminho; usamos caminho relativo ao cwd do work.
  const escaped = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  const args = [
    '-i', input,
    '-vf', `subtitles=${escaped}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
  ];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'captions', totalDuration: meta.duration, onProgress });
  log.ok(`legendas queimadas (${transcript.segments.length} segmentos, modo ${style.mode || 'karaoke'})`);
  return { output, count: transcript.segments.length };
}
