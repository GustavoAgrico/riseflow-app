import path from 'node:path';
import fs from 'node:fs/promises';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { groupIntoPhrases } from './narrative.js';
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
 * Ajusta as fronteiras dos trechos mantidos ao GRID DE FRAMES (múltiplos de 1/fps).
 * Sem isso, o corte de vídeo "encaixa" nas fronteiras de frame enquanto o remap das
 * legendas usa segundos exatos — a cada corte a diferença soma e as legendas
 * dessincronizam (pior quanto mais cortes). Usar o MESMO `keep` ajustado no corte do
 * vídeo e no remap das legendas mantém tudo alinhado.
 */
export function snapKeep(keep, fps, minKeep = 0.05) {
  const f = Math.max(1, Math.round(fps || 30));
  const out = [];
  for (const s of keep || []) {
    // Arredonda PARA FORA (início para trás, fim para frente): o ajuste ao frame nunca
    // tira um pedacinho da fala que ficou; trechos que passam a se tocar são unidos.
    const start = Math.floor(s.start * f + 1e-6) / f;
    const end = Math.ceil(s.end * f - 1e-6) / f;
    if (end - start < minKeep) continue;
    const last = out[out.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else out.push({ start, end });
  }
  return out;
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

/** Inverso do remapTime: tempo na timeline CORTADA → tempo no vídeo ORIGINAL. */
export function unmapTime(t, keep) {
  let acc = 0;
  const list = keep || [];
  for (let i = 0; i < list.length; i++) {
    const seg = list[i];
    const len = seg.end - seg.start;
    // Na emenda exata vale o COMEÇO do próximo trecho (exceto no último).
    if (t < acc + len || (i === list.length - 1 && t <= acc + len)) return seg.start + Math.max(0, t - acc);
    acc += len;
  }
  const last = (keep || [])[keep.length - 1];
  return last ? last.end : t;
}

/** Posição manual da legenda (px/py, 0–1 no quadro final), se a palavra tiver. */
export function posOf(w) {
  const px = Number(w?.px);
  const py = Number(w?.py);
  return Number.isFinite(px) && Number.isFinite(py) && w?.px != null && w?.py != null
    ? { px: Math.min(1, Math.max(0, px)), py: Math.min(1, Math.max(0, py)) }
    : {};
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
      kept.push({ start: ns, end: ne, word: w.word, ...posOf(w) });
    }
  }

  // Reagrupa em frases naturais (análise de frases: pontuação + pausas + tamanho).
  const segments = groupIntoPhrases(kept, { maxWords: perSegment > 4 ? perSegment : 6 });
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
  const fps = Math.max(1, Math.round(meta.fps || 30));
  const output = path.join(work, `${tag}.mp4`);

  const parts = [];
  const concatInputs = [];
  keep.forEach((seg, i) => {
    // fps=CFR normaliza o tempo (protege vídeos com frame rate variável, ex.: celular)
    // e mantém cada trecho com duração exata no grid → sem drift de legenda/áudio.
    parts.push(`[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS,fps=${fps}[v${i}]`);
    concatInputs.push(`[v${i}]`);
    if (wantAudio) {
      // Micro-fade de 6 ms nas emendas: tira o "clique" do corte sem engolir som.
      const len = seg.end - seg.start;
      const fades = len > 0.05 ? `,afade=t=in:d=0.006,afade=t=out:st=${(len - 0.006).toFixed(3)}:d=0.006` : '';
      parts.push(`[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS${fades}[a${i}]`);
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
  args.push(...x264Fast(), '-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: tag, totalDuration: kd, onProgress });
  log.ok(`remux: ${keep.length} segmentos mantidos (${kd.toFixed(1)}s)`);
  return { output, keptDuration: kd };
}
