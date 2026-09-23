import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('usermedia');

const clamp = (v, min, max, def) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
};

/**
 * Aplica as mídias do usuário (imagens, vídeos e músicas próprias) sobre o vídeo.
 *
 * - Imagem/vídeo em modo "cover": cobre o quadro inteiro na janela de tempo.
 * - Imagem/vídeo em modo "pip": aparece menor, numa posição (px, py) da tela.
 * - Áudio: entra como música de fundo, misturada por baixo da voz (volume ajustável).
 *
 * Cada item de options.userMedia já vem RESOLVIDO pelo servidor com { file, kind, ... }
 * (o cliente nunca manda caminho de arquivo). Itens sem arquivo válido são ignorados.
 *
 * @returns {{output:string, applied:boolean, visual:number, audio:number}}
 */
export async function applyUserMedia(input, work, meta, options, onProgress = () => {}) {
  const items = (options.userMedia || []).filter((m) => m && m.file && fs.existsSync(m.file));
  if (!items.length) return { output: input, applied: false, visual: 0, audio: 0 };

  const W = meta.width;
  const H = meta.height;
  const dur = meta.duration;

  const visual = items.filter((m) => m.kind === 'image' || m.kind === 'video');
  const music = items.filter((m) => m.kind === 'audio');

  // Ordem dos inputs no ffmpeg: 0 = vídeo principal; depois cada mídia na ordem
  // [...visual, ...music]. Guardamos o índice do input de cada item.
  const inputs = [];
  const parts = [];

  // --- Vídeo: encadeia os overlays visuais na ordem (start crescente) ---
  const vis = visual
    .map((m) => {
      const start = clamp(m.start, 0, Math.max(0, dur - 0.05), 0);
      const d = clamp(m.duration, 0.2, dur, m.kind === 'image' ? 4 : 5);
      const end = Math.min(dur, start + d);
      return { ...m, start, end, d: end - start };
    })
    .filter((m) => m.d > 0.05)
    .sort((a, b) => a.start - b.start);

  vis.forEach((m, i) => {
    const inIdx = inputs.length + 1; // +1 porque 0 é o vídeo principal
    inputs.push(m);
    m._inIdx = inIdx;
    const win = `enable='between(t,${m.start.toFixed(3)},${m.end.toFixed(3)})'`;
    if (m.mode === 'pip') {
      const scale = clamp(m.scale, 0.15, 0.95, 0.4);
      const op = clamp(m.opacity, 0.1, 1, 1);
      const px = clamp(m.px, 0, 1, 0.62);
      const py = clamp(m.py, 0, 1, 0.06);
      let chain =
        `[${inIdx}:v]scale=round(${W}*${scale}/2)*2:-2,setsar=1,` +
        `setpts=PTS-STARTPTS+${m.start.toFixed(3)}/TB`;
      if (op < 0.999) chain += `,format=rgba,colorchannelmixer=aa=${op.toFixed(3)}`;
      parts.push(`${chain}[m${i}]`);
      // Posição: px/py são a borda superior-esquerda em fração da tela.
      const x = `round((W-w)*${px.toFixed(3)})`;
      const y = `round((H-h)*${py.toFixed(3)})`;
      m._x = x;
      m._y = y;
    } else {
      // cover: preenche o quadro inteiro.
      parts.push(
        `[${inIdx}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,` +
          `setpts=PTS-STARTPTS+${m.start.toFixed(3)}/TB[m${i}]`,
      );
      m._x = '0';
      m._y = '0';
    }
    m._win = win;
  });

  let vlast = '[0:v]';
  if (vis.length) {
    vis.forEach((m, i) => {
      const out = i === vis.length - 1 ? '[vout]' : `[v${i}]`;
      parts.push(`${vlast}[m${i}]overlay=x=${m._x}:y=${m._y}:${m._win}${out}`);
      vlast = `[v${i}]`;
    });
  }

  // --- Áudio: mistura as músicas por baixo do áudio original ---
  const musParts = [];
  const musLabels = [];
  music.forEach((m, i) => {
    const inIdx = inputs.length + 1;
    inputs.push(m);
    m._inIdx = inIdx;
    const start = clamp(m.start, 0, Math.max(0, dur - 0.05), 0);
    const vol = clamp(m.volume, 0, 2, 0.35);
    const ms = Math.round(start * 1000);
    // adelay atrasa a música até o start; volume ajusta o nível de fundo.
    musParts.push(
      `[${inIdx}:a]asetpts=PTS-STARTPTS,volume=${vol.toFixed(3)}` +
        (ms > 0 ? `,adelay=${ms}|${ms}` : '') +
        `[am${i}]`,
    );
    musLabels.push(`[am${i}]`);
  });

  const wantAudioRebuild = music.length > 0;
  if (wantAudioRebuild) {
    parts.push(...musParts);
    if (meta.hasAudio) {
      parts.push(
        `[0:a]${musLabels.join('')}amix=inputs=${musLabels.length + 1}:normalize=0:dropout_transition=0,` +
          `alimiter=limit=0.95,atrim=0:${dur.toFixed(3)}[aout]`,
      );
    } else if (musLabels.length === 1) {
      parts.push(`${musLabels[0]}atrim=0:${dur.toFixed(3)}[aout]`);
    } else {
      parts.push(
        `${musLabels.join('')}amix=inputs=${musLabels.length}:normalize=0:dropout_transition=0,` +
          `alimiter=limit=0.95,atrim=0:${dur.toFixed(3)}[aout]`,
      );
    }
  }

  if (!vis.length && !wantAudioRebuild) return { output: input, applied: false, visual: 0, audio: 0 };

  const scriptPath = path.join(work, 'usermedia_filter.txt');
  fs.writeFileSync(scriptPath, parts.join(';\n'), 'utf8');

  const output = path.join(work, 'usermedia.mp4');
  const args = ['-i', input];
  for (const m of inputs) {
    if (m.kind === 'image') {
      const d = clamp(m.duration, 0.2, dur, 4);
      args.push('-loop', '1', '-t', d.toFixed(2));
    }
    args.push('-i', m.file);
  }
  args.push('-filter_complex_script', scriptPath);
  args.push('-map', vis.length ? '[vout]' : '0:v');
  if (wantAudioRebuild) args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '160k');
  else if (meta.hasAudio) args.push('-map', '0:a', '-c:a', 'copy');
  args.push(...x264Fast(), '-movflags', '+faststart', '-t', dur.toFixed(3), '-y', output);

  await runFfmpeg(args, { label: 'usermedia', totalDuration: dur, onProgress });
  log.ok(`mídias do usuário aplicadas: ${vis.length} visuais, ${music.length} música(s)`);
  return { output, applied: true, visual: vis.length, audio: music.length };
}
