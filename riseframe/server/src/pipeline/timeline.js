import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { groupIntoPhrases } from './narrative.js';
import { makeLogger } from '../logger.js';
import { emphasisOf } from '../../../shared/captionKeyword.js';

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
      kept.push({ start: ns, end: ne, word: w.word, ...posOf(w), ...emphasisOf(w) });
    }
  }

  // Reagrupa em frases naturais (análise de frases: pontuação + pausas + tamanho).
  const segments = groupIntoPhrases(kept, { maxWords: perSegment > 4 ? perSegment : 6 });
  return { ...transcript, segments, text: kept.map((w) => w.word).join(' ') };
}

/**
 * Divide os trechos mantidos em BLOCOS de até ~`maxSpan` s do vídeo original (e no
 * máximo `maxSegs` trechos cada). Trechos longos são partidos no grid de frames; nessas
 * emendas internas não há micro-fade (o som é contínuo). Puro/testável.
 * @returns {Array<{start:number,end:number,segs:Array<{start:number,end:number,fadeIn:boolean,fadeOut:boolean}>}>}
 */
export function planCutChunks(keep, fps = 30, { maxSpan = 60, maxSegs = 40 } = {}) {
  const f = Math.max(1, Math.round(fps || 30));
  const pieces = [];
  for (const k of keep || []) {
    let s = k.start;
    while (k.end - s > maxSpan + 1e-6) {
      const cut = Math.round((s + maxSpan) * f) / f;
      pieces.push({ start: s, end: cut, fadeIn: s === k.start, fadeOut: false });
      s = cut;
    }
    pieces.push({ start: s, end: k.end, fadeIn: s === k.start, fadeOut: true });
  }
  const chunks = [];
  let cur = null;
  for (const p of pieces) {
    if (cur && p.end - cur.start <= maxSpan && cur.segs.length < maxSegs) {
      cur.segs.push(p);
      cur.end = p.end;
    } else {
      cur = { start: p.start, end: p.end, segs: [p] };
      chunks.push(cur);
    }
  }
  return chunks;
}

/** Limite de memória do contêiner (cgroup v2/v1), em bytes; Infinity se não houver. */
function containerMemLimit() {
  for (const f of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try {
      const v = Number(readFileSync(f, 'utf8').trim());
      if (Number.isFinite(v) && v > 0 && v < 2 ** 60) return v;
    } catch {
      /* sem cgroup (Windows/Mac) */
    }
  }
  return Infinity;
}

/**
 * Quantos blocos codificar ao mesmo tempo (o x264 já usa vários núcleos por bloco).
 * Paralelo só com folga de núcleos E de memória: servidores pequenos (Render grátis,
 * VM de 1 núcleo) ficam em 1 bloco por vez para não estourar a RAM.
 */
function cutConcurrency() {
  const n = Number(process.env.CUT_CONCURRENCY);
  if (n >= 1) return Math.floor(n);
  const cpus = os.availableParallelism?.() || os.cpus()?.length || 1;
  const mem = Math.min(os.totalmem(), containerMemLimit());
  const byMem = Math.max(1, Math.floor(mem / (1.5 * 1024 ** 3)));
  return Math.max(1, Math.min(cpus >= 8 ? 3 : cpus >= 4 ? 2 : 1, byMem));
}

/**
 * Remonta o vídeo mantendo apenas `keep`, com corte frame-accurate. Compartilhado pelo
 * corte de silêncio e pela edição por transcrição.
 *
 * Em BLOCOS: um único filter_complex com centenas de trim/concat passa cada frame do
 * vídeo inteiro por todos os trechos (tempo ~ duração × nº de cortes — vídeos longos
 * "travavam" nesta etapa). Aqui cada bloco busca só a sua janela (-ss), corta os seus
 * trechos e vira um arquivo; os blocos rodam em paralelo e são emendados sem recodificar
 * (concat demuxer). O áudio dos blocos sai em PCM (sem o atraso de priming do AAC nas
 * emendas) e é codificado uma vez só no final.
 *
 * O fps=CFR vem ANTES do trim: com fonte CFR e trechos no grid de frames, cada trecho
 * tem exatamente (fim − início) × fps frames — sem o meio frame extra por corte que
 * atrasava as legendas no fim de vídeos com muitos cortes.
 * @returns {Promise<{output:string, keptDuration:number}>}
 */
export async function remuxByKeepSegments(input, work, meta, keep, onProgress, tag = 'cut', opts = {}) {
  const kd = keptDuration(keep);
  const wantAudio = meta.hasAudio;
  const fps = Math.max(1, Math.round(meta.fps || 30));
  const output = path.join(work, `${tag}.mp4`);
  const chunks = planCutChunks(keep, fps, opts);
  const dir = path.join(work, `${tag}_parts`);
  await fs.mkdir(dir, { recursive: true });

  const doneByChunk = new Array(chunks.length).fill(0);
  const report = () => {
    if (!onProgress || !kd) return;
    const done = doneByChunk.reduce((a, b) => a + b, 0);
    onProgress(Math.min(0.97, (done / kd) * 0.97));
  };

  const runChunk = async (chunk, ci) => {
    // Busca com folga antes da janela: o -ss de entrada (com recodificação) é preciso,
    // mas a folga deixa o fps/trim trabalharem sobre frames já estáveis.
    const seek = Math.max(0, chunk.start - 1);
    const span = chunk.end - seek + 0.5;
    const parts = [`[0:v]fps=${fps},split=${chunk.segs.length}${chunk.segs.map((_, i) => `[s${i}]`).join('')}`];
    if (wantAudio) parts.push(`[0:a]asplit=${chunk.segs.length}${chunk.segs.map((_, i) => `[t${i}]`).join('')}`);
    const concatInputs = [];
    chunk.segs.forEach((seg, i) => {
      const a = (seg.start - seek).toFixed(4);
      const b = (seg.end - seek).toFixed(4);
      // Depois do fps, os frames caem exatamente em k/fps: a janela recuada meio frame
      // pega exatamente os frames do trecho, sem depender de arredondamento.
      const half = 0.5 / fps;
      parts.push(`[s${i}]trim=start=${Math.max(0, seg.start - seek - half).toFixed(5)}:end=${(seg.end - seek - half).toFixed(5)},setpts=PTS-STARTPTS[v${i}]`);
      concatInputs.push(`[v${i}]`);
      if (wantAudio) {
        // Micro-fade de 6 ms nas emendas: tira o "clique" do corte sem engolir som.
        const len = seg.end - seg.start;
        const fades = [];
        if (len > 0.05 && seg.fadeIn) fades.push('afade=t=in:d=0.006');
        if (len > 0.05 && seg.fadeOut) fades.push(`afade=t=out:st=${(len - 0.006).toFixed(3)}:d=0.006`);
        parts.push(`[t${i}]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS${fades.map((x) => ',' + x).join('')}[a${i}]`);
        concatInputs.push(`[a${i}]`);
      }
    });
    // O concat não repassa a taxa de frames: sem o fps no fim o encoder assume 25 fps e
    // descarta frames. Aqui é só declarar a taxa (os frames já estão no grid).
    parts.push(`${concatInputs.join('')}concat=n=${chunk.segs.length}:v=1:a=${wantAudio ? 1 : 0}[cv]${wantAudio ? '[outa]' : ''}`);
    parts.push(`[cv]fps=${fps}[outv]`);
    const script = path.join(dir, `p${ci}.txt`);
    await fs.writeFile(script, parts.join(';\n'), 'utf8');

    const vOut = path.join(dir, `p${ci}.mp4`);
    const aOut = path.join(dir, `p${ci}.wav`);
    const args = ['-ss', seek.toFixed(3), '-t', span.toFixed(3), '-i', input, '-filter_complex_script', script,
      '-map', '[outv]', '-an', ...x264Fast(), '-pix_fmt', 'yuv420p', '-y', vOut];
    if (wantAudio) args.push('-map', '[outa]', '-vn', '-c:a', 'pcm_s16le', '-y', aOut);
    const chunkDur = keptDuration(chunk.segs);
    await runFfmpeg(args, {
      label: `${tag}#${ci + 1}/${chunks.length}`,
      totalDuration: chunkDur,
      onProgress: (p) => {
        doneByChunk[ci] = p * chunkDur;
        report();
      },
    });
    doneByChunk[ci] = chunkDur;
    report();
    return { vOut, aOut };
  };

  const results = await pool(chunks, cutConcurrency(), runChunk);

  const list = async (name, files) => {
    const p = path.join(dir, name);
    await fs.writeFile(p, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n', 'utf8');
    return p;
  };
  const vList = await list('v.txt', results.map((r) => r.vOut));
  const args = ['-f', 'concat', '-safe', '0', '-i', vList];
  if (wantAudio) args.push('-f', 'concat', '-safe', '0', '-i', await list('a.txt', results.map((r) => r.aOut)));
  args.push('-map', '0:v', '-c:v', 'copy');
  if (wantAudio) args.push('-map', '1:a', '-c:a', 'aac', '-b:a', '160k');
  args.push('-movflags', '+faststart', '-y', output);
  await runFfmpeg(args, { label: `${tag}-emenda` });
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  onProgress?.(1);

  log.ok(`remux: ${keep.length} segmentos mantidos (${kd.toFixed(1)}s) em ${chunks.length} bloco(s)`);
  return { output, keptDuration: kd };
}

/** Executa `fn` em `items` com no máximo `limit` ao mesmo tempo, mantendo a ordem. */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
