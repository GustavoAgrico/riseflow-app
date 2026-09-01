import path from 'node:path';
import fs from 'node:fs/promises';
import { runFfmpeg } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('timeline');

/** Une faixas [{start,end}] sobrepostas/adjacentes (tolerância opcional). */
export function mergeRanges(ranges, tol = 0.02) {
  const sorted = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + tol) last.end = Math.max(last.end, r.end);
    else out.push({ start: r.start, end: r.end });
  }
  return out;
}

/** Subtrai faixas `removed` do intervalo [0, duration] → segmentos a manter. */
export function subtractRanges(duration, removed, minKeep = 0.05) {
  const merged = mergeRanges(removed);
  const keep = [];
  let cursor = 0;
  for (const r of merged) {
    const s = Math.max(0, Math.min(r.start, duration));
    if (s - cursor > minKeep) keep.push({ start: cursor, end: s });
    cursor = Math.max(cursor, Math.min(r.end, duration));
  }
  if (duration - cursor > minKeep) keep.push({ start: cursor, end: duration });
  return keep;
}

/** Duração total mantida (s). */
export function keptDuration(keep) {
  return keep.reduce((a, s) => a + (s.end - s.start), 0);
}

/**
 * Mapeia um timestamp da timeline ORIGINAL para a timeline CORTADA definida por
 * `keep`. Tempos dentro de trechos removidos colam na fronteira do trecho mantido.
 */
export function remapTime(t, keep) {
  let acc = 0;
  for (const seg of keep) {
    if (t < seg.start) return acc; // caiu num trecho removido antes deste segmento
    if (t <= seg.end) return acc + (t - seg.start);
    acc += seg.end - seg.start;
  }
  return acc; // depois do fim → duração total mantida
}

function overlaps(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0) > 0;
}

/**
 * Remapeia a transcrição para a timeline cortada: descarta palavras removidas ou
 * que caem inteiramente em trechos cortados, reposiciona as demais e reagrupa em
 * segmentos de legenda. Essencial para a sincronia das legendas após qualquer corte.
 */
export function remapTranscript(transcript, keep, perSegment = 4) {
  if (!transcript?.segments?.length) return { ...transcript, segments: [] };

  const kept = [];
  for (const seg of transcript.segments) {
    const words = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }];
    for (const w of words) {
      if (w.removed) continue;
      // mantém a palavra se ela intersecta algum trecho preservado
      const inKeep = keep.some((k) => overlaps(w.start, w.end, k.start, k.end));
      if (!inKeep) continue;
      const ns = remapTime(w.start, keep);
      const ne = Math.max(ns + 0.05, remapTime(w.end, keep));
      kept.push({ start: ns, end: ne, word: w.word });
    }
  }

  // Reagrupa em segmentos de até `perSegment` palavras, quebrando em pausas grandes.
  const segments = [];
  let bucket = [];
  const flush = () => {
    if (!bucket.length) return;
    segments.push({
      start: bucket[0].start,
      end: bucket[bucket.length - 1].end,
      text: bucket.map((w) => w.word).join(' '),
      words: bucket,
    });
    bucket = [];
  };
  for (let i = 0; i < kept.length; i++) {
    const w = kept[i];
    const prev = bucket[bucket.length - 1];
    if (prev && (w.start - prev.end > 0.6 || bucket.length >= perSegment)) flush();
    bucket.push(w);
  }
  flush();

  return { ...transcript, segments, text: kept.map((w) => w.word).join(' ') };
}

/**
 * Remonta o vídeo mantendo apenas `keep` (corte frame-accurate via filter_complex
 * trim/concat, num único passe). Compartilhado pelo corte de silêncio e pela edição
 * por transcrição.
 * @returns {Promise<{output:string, keptDuration:number}>}
 */
export async function remuxByKeepSegments(input, work, meta, keep, onProgress, tag = 'cut') {
  const kd = keptDuration(keep);
  const wantAudio = meta.hasAudio;
  const output = path.join(work, `${tag}.mp4`);

  const parts = [];
  const concatInputs = [];
  keep.forEach((seg, i) => {
    parts.push(`[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    concatInputs.push(`[v${i}]`);
    if (wantAudio) {
      parts.push(`[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
      concatInputs.push(`[a${i}]`);
    }
  });
  parts.push(
    `${concatInputs.join('')}concat=n=${keep.length}:v=1:a=${wantAudio ? 1 : 0}[outv]${wantAudio ? '[outa]' : ''}`,
  );

  const scriptPath = path.join(work, `${tag}_filter.txt`);
  await fs.writeFile(scriptPath, parts.join(';\n'), 'utf8');

  const args = ['-i', input, '-filter_complex_script', scriptPath, '-map', '[outv]'];
  if (wantAudio) args.push('-map', '[outa]', '-c:a', 'aac', '-b:a', '160k');
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: tag, totalDuration: kd, onProgress });
  log.ok(`remux: ${keep.length} segmentos mantidos (${kd.toFixed(1)}s)`);
  return { output, keptDuration: kd };
}
