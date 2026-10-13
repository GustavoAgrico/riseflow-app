import { spawn } from 'node:child_process';
import { ffmpegPath } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('corte');

/**
 * Cortes PRECISOS: nenhum corte pode comer o começo ou o fim de uma palavra.
 * O detector de silêncio (silencedetect) só olha um limiar de volume — finais de
 * palavra que vão sumindo ("s", "x", respiração da sílaba) e ataques suaves ("f", "v",
 * "ch") ficam abaixo dele e eram cortados junto com a pausa. Aqui cada faixa a remover
 * passa por duas proteções:
 *  1. Palavras da transcrição (com folga): o corte de pausa nunca invade uma palavra.
 *  2. Envelope de volume real do áudio (a cada 10 ms): a borda do corte só fica onde o
 *     som já caiu ao nível do ruído de fundo; muletas removidas são cortadas no "vale"
 *     de volume entre as palavras, e não no meio da vizinha.
 */

const HOP = 0.01; // 10 ms por quadro do envelope

/**
 * Volume (dB RMS) a cada 10 ms do áudio inteiro, decodificado em mono 8 kHz por
 * streaming (memória ~ 4 bytes por quadro, mesmo em vídeos de horas).
 * @returns {Promise<{db: Float32Array, hop: number, floor: number, peak: number} | null>}
 */
export function audioEnvelope(input, { rate = 8000, af = null } = {}) {
  return new Promise((resolve) => {
    const per = Math.round(rate * HOP);
    const frames = [];
    let acc = 0;
    let n = 0;
    let carry = null;
    const args = ['-v', 'error', '-i', input, '-vn', '-ac', '1', '-ar', String(rate)];
    if (af) args.push('-af', af);
    const proc = spawn(ffmpegPath, [...args, '-f', 's16le', '-'], { stdio: ['ignore', 'pipe', 'ignore'] });
    proc.stdout.on('data', (chunk) => {
      let buf = chunk;
      if (carry) {
        buf = Buffer.concat([carry, chunk]);
        carry = null;
      }
      const usable = buf.length - (buf.length % 2);
      for (let i = 0; i < usable; i += 2) {
        const v = buf.readInt16LE(i) / 32768;
        acc += v * v;
        if (++n === per) {
          frames.push(10 * Math.log10(acc / n + 1e-12));
          acc = 0;
          n = 0;
        }
      }
      if (usable < buf.length) carry = buf.subarray(usable);
    });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      if (n) frames.push(10 * Math.log10(acc / n + 1e-12));
      if (!frames.length) return resolve(null);
      resolve(envelopeFrom(Float32Array.from(frames)));
    });
  });
}

/** Monta o envelope com ruído de fundo (percentil 10) e pico (percentil 99.5). Puro. */
export function envelopeFrom(db, hop = HOP) {
  const sorted = Float32Array.from(db).sort();
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
  return { db, hop, floor: at(0.1), peak: at(0.995) };
}

/** Limiar de "ainda tem som de fala": um pouco acima do ruído de fundo. */
function speechThreshold(env) {
  return Math.max(env.floor + 9, env.peak - 50);
}

/**
 * Limiar com corte de RESPIRAÇÕES: respiração e chiado de fundo ficam bem abaixo da
 * voz (tipicamente 20–40 dB abaixo do pico), mas acima do ruído — com o limiar comum
 * eram tratados como "ainda é fala" e ficavam no vídeo. Aqui só conta como som o que
 * está a menos de 22 dB do pico (as pontas das palavras seguem protegidas pela
 * transcrição em `protectWords`).
 */
function breathThreshold(env) {
  return Math.max(env.floor + 9, env.peak - 22);
}

const frameAt = (env, t) => Math.max(0, Math.min(env.db.length - 1, Math.floor(t / env.hop + 1e-6)));

/** Palavras mantidas (não removidas) em ordem: [{ start, end }]. */
export function keptWords(transcript) {
  const out = [];
  for (const seg of transcript?.segments || []) {
    const words = seg.words?.length ? seg.words : [];
    for (const w of words) {
      const s = Number(w.start);
      const e = Number(w.end);
      if (!w.removed && Number.isFinite(s) && Number.isFinite(e) && e > s) out.push({ start: s, end: e });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Tira das faixas de pausa qualquer pedaço que encoste numa palavra mantida (com folga
 * antes e depois). Uma faixa pode virar duas (se havia palavra no meio) ou sumir. Puro.
 */
export function protectWords(ranges, words, { pre = 0.08, post = 0.12, minRemove = 0.06 } = {}) {
  if (!words?.length) return ranges;
  const out = [];
  for (const r of ranges) {
    let pieces = [{ start: r.start, end: r.end }];
    for (const w of words) {
      if (w.end + post <= r.start || w.start - pre >= r.end) continue;
      const g0 = w.start - pre;
      const g1 = w.end + post;
      pieces = pieces.flatMap((p) => {
        if (g1 <= p.start || g0 >= p.end) return [p];
        const left = { start: p.start, end: Math.min(p.end, g0) };
        const right = { start: Math.max(p.start, g1), end: p.end };
        return [left, right].filter((x) => x.end - x.start > 0);
      });
    }
    out.push(...pieces.filter((p) => p.end - p.start > minRemove));
  }
  return out;
}

/** Faixa de frequência da VOZ (vogais): respiração e chiado ficam quase todos acima dela. */
export const VOICE_BAND = 'highpass=f=80,lowpass=f=800,lowpass=f=800';

/**
 * Nenhum corte de pausa passa por cima de VOZ, mesmo que a transcrição não tenha a
 * palavra (a transcrição às vezes "pula" palavras curtas, repetidas ou ditas baixo, e o
 * vão vira um corte que levava a palavra junto) ou que o detector de silêncio ache que
 * é silêncio (fala baixa no fim da frase). Olha o envelope só na faixa da voz
 * (`VOICE_BAND`): onde há voz por pelo menos `minRun`, aquele pedaço (com folga) sai do
 * corte. Respiração quase não tem energia nessa faixa, então continua sendo cortada; tosse
 * e pigarro já identificados (`noise`, ver `findNoises`) também. Puro.
 */
export function protectVoice(ranges, venv, { minRun = 0.06, pre = 0.12, post = 0.16, minRemove = 0.06, noise = null } = {}) {
  if (!venv) return ranges;
  const out = [];
  for (const r of ranges) {
    // trechos com voz dentro da faixa a cortar (menos os que são tosse/pigarro: `noise`)
    const voiced = voicedRuns([r], venv, { minRun })
      .filter((v) => !(noise || []).some((n) => Math.min(n.end, v.end) - Math.max(n.start, v.start) >= 0.6 * (v.end - v.start)))
      .map((v) => ({ start: v.start - pre, end: v.end + post }));
    let pieces = [{ start: r.start, end: r.end }];
    for (const v of voiced) {
      pieces = pieces.flatMap((p) => {
        if (v.end <= p.start || v.start >= p.end) return [p];
        return [{ start: p.start, end: Math.min(p.end, v.start) }, { start: Math.max(p.start, v.end), end: p.end }].filter((x) => x.end - x.start > 0);
      });
    }
    out.push(...pieces.filter((p) => p.end - p.start > minRemove));
  }
  return out;
}

/** Trechos com som na faixa da voz (≥ `minRun`) dentro das faixas, sem folga. Puro. */
export function voicedRuns(ranges, venv, { minRun = 0.06 } = {}) {
  if (!venv) return [];
  const thr = Math.max(venv.floor + 12, venv.peak - 32);
  const minFrames = Math.max(1, Math.round(minRun / venv.hop));
  const out = [];
  for (const r of ranges) {
    let runStart = -1;
    const a = frameAt(venv, r.start);
    const b = frameAt(venv, r.end);
    for (let i = a; i <= b + 1; i++) {
      const on = i <= b && venv.db[i] > thr;
      if (on && runStart < 0) runStart = i;
      if (!on && runStart >= 0) {
        if (i - runStart >= minFrames) out.push({ start: +(runStart * venv.hop).toFixed(3), end: +(i * venv.hop).toFixed(3) });
        runStart = -1;
      }
    }
  }
  return out;
}

// ── Tosse, pigarro, estalos: som no meio da pausa que NÃO é fala ──

/** Lê o áudio [start, start+dur] em mono `rate` Hz (Float32, -1..1). */
export function readPcm(input, start, dur, rate = 16000) {
  return new Promise((resolve) => {
    const bufs = [];
    const args = ['-v', 'error', '-ss', Math.max(0, start).toFixed(3), '-t', Math.max(0.05, dur).toFixed(3), '-i', input, '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', '-'];
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    proc.stdout.on('data', (c) => bufs.push(c));
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      const b = Buffer.concat(bufs);
      const n = Math.floor(b.length / 2);
      if (!n) return resolve(null);
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = b.readInt16LE(i * 2) / 32768;
      resolve(x);
    });
  });
}

/** Filtro biquad (RBJ) passa-baixa/passa-alta de 2ª ordem. Puro. */
function biquad(x, type, f0, fs, q = 0.7071) {
  const w = (2 * Math.PI * f0) / fs;
  const cw = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b1 = type === 'low' ? (1 - cw) / a0 : -(1 + cw) / a0;
  const b0 = type === 'low' ? b1 / 2 : -b1 / 2;
  const a1 = (-2 * cw) / a0;
  const a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

const rmsDb = (x, a, b) => {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, b - a) + 1e-12);
};

/** Periodicidade (0–1): autocorrelação normalizada máxima no tom da voz (70–400 Hz). */
function periodicity(x, a, b, fs) {
  const minLag = Math.floor(fs / 400);
  const maxLag = Math.ceil(fs / 70);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let xy = 0, xx = 0, yy = 0;
    for (let i = a; i + lag < b; i++) {
      const p = x[i];
      const q = x[i + lag];
      xy += p * q; xx += p * p; yy += q * q;
    }
    const r = xy / Math.sqrt(xx * yy + 1e-12);
    if (r > best) best = r;
  }
  return best;
}

/**
 * Medidas de um som curto: quanto dele tem VOZ (vogal periódica, como em qualquer
 * palavra) e quanto é ruído largo (tosse: rajada de ar sem tom, com muito agudo). Puro.
 * @returns {{dur:number, voicedFrac:number, hiRatio:number}}
 */
export function soundFeatures(x, fs = 16000) {
  const lo = biquad(biquad(biquad(x, 'high', 70, fs), 'low', 900, fs), 'low', 900, fs);
  const hi = biquad(biquad(x, 'high', 2500, fs), 'high', 2500, fs);
  const N = Math.round(fs * 0.04);
  const H = Math.round(fs * 0.01);
  const frames = [];
  for (let a = 0; a + N <= x.length; a += H) frames.push({ a, lo: rmsDb(lo, a, a + N), hi: rmsDb(hi, a, a + N) });
  if (!frames.length) return { dur: x.length / fs, voicedFrac: 1, hiRatio: -60 };
  // quadros fortes NA FAIXA DA VOZ (até 10 dB do mais forte): numa palavra são as
  // vogais (o "s"/"ch" fica quase todo no agudo); numa tosse, a própria rajada de ar
  const top = Math.max(...frames.map((f) => f.lo));
  const loud = frames.filter((f) => f.lo >= top - 10);
  let voiced = 0;
  const ratios = [];
  for (const f of loud) {
    if (periodicity(lo, f.a, f.a + N, fs) >= 0.6) voiced++;
    ratios.push(f.hi - f.lo);
  }
  ratios.sort((p, q) => p - q);
  return { dur: x.length / fs, voicedFrac: voiced / loud.length, hiRatio: ratios[Math.floor(ratios.length / 2)] };
}

/**
 * Tosse/pigarro/estalo (true) ou fala (false)? Conservador: qualquer som com vogal (voz
 * periódica) em boa parte é tratado como fala e fica — melhor deixar uma tosse do que
 * cortar uma palavra. Puro.
 */
export function isNonSpeech(f) {
  if (!f || f.dur > 1.6) return false;
  if (f.voicedFrac < 0.15) return true; // sem tom de voz nenhum: tosse seca, pigarro, batida
  return f.voicedFrac < 0.25 && f.hiRatio > -6; // rajada larga com pouca voz (tosse)
}

/**
 * Bordas de PAUSA guiadas pelo volume real: o início do corte avança enquanto o fim da
 * palavra ainda soa (até `maxShift`), e o fim do corte recua enquanto o ataque da
 * próxima palavra já começou; depois deixa uma pequena margem (`tail`/`preroll`). Puro.
 */
export function fitPausesToAudio(ranges, env, { maxShift = 0.3, tail = 0.04, preroll = 0.06, minRemove = 0.06, breaths = false } = {}) {
  if (!env) return ranges;
  // Fim da palavra ANTERIOR: sempre com o limiar de fala (pega o "s"/"a" que vai sumindo
  // devagar — com o limiar de respiração esse final era cortado).
  const speechThr = speechThreshold(env);
  // Começo da PRÓXIMA palavra: com respirações ligadas, a inspiração (bem abaixo da voz)
  // não segura o corte; o ataque da palavra continua protegido pela folga (preroll) e
  // pela transcrição (protectWords).
  const endThr = breaths ? breathThreshold(env) : speechThr;
  const loudS = (t) => env.db[frameAt(env, t)] > speechThr;
  const loudE = (t) => env.db[frameAt(env, t)] > endThr;
  const out = [];
  for (const r of ranges) {
    let s = r.start;
    const sLimit = Math.min(r.end, r.start + maxShift);
    // fim da palavra anterior ainda soando? (precisa de 2 quadros quietos seguidos)
    while (s < sLimit && (loudS(s) || loudS(s + env.hop))) s += env.hop;
    let e = r.end;
    const eLimit = Math.max(s, r.end - maxShift);
    // ataque da próxima palavra já começou antes do fim do corte?
    while (e > eLimit && (loudE(e - env.hop) || loudE(e - 2 * env.hop))) e -= env.hop;
    s += tail;
    e -= preroll;
    if (e - s > minRemove) out.push({ start: +s.toFixed(3), end: +e.toFixed(3) });
  }
  return out;
}

/**
 * Faixas das palavras REMOVIDAS (muletas, repetições, frases refeitas, edição manual).
 * Palavras removidas seguidas viram UM bloco só (cortar palavra por palavra deixava
 * "pedacinhos" de som entre elas). Cada borda vai para o ponto mais silencioso entre a
 * palavra que fica e o bloco — o mais perto possível do bloco, para não roubar o fim
 * (ou o começo) da palavra vizinha — com `guard` de margem. Puro.
 */
export function removedWordRanges(transcript, env, { pad = 0.04, window = 0.06, guard = 0.03 } = {}) {
  const all = [];
  for (const seg of transcript?.segments || []) {
    const words = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, removed: seg.removed }];
    for (const w of words) all.push({ start: Number(w.start), end: Number(w.end), removed: Boolean(w.removed) });
  }
  all.sort((a, b) => a.start - b.start);
  const out = [];
  for (let i = 0; i < all.length; i++) {
    if (!all[i].removed) continue;
    let j = i;
    while (j + 1 < all.length && all[j + 1].removed) j++;
    const block = all.slice(i, j + 1).filter((w) => w.end > w.start);
    if (block.length) {
      const bStart = Math.min(...block.map((w) => w.start));
      const bEnd = Math.max(...block.map((w) => w.end));
      let prevEnd = -Infinity;
      for (let k = i - 1; k >= 0; k--) if (!all[k].removed) { prevEnd = Math.max(prevEnd, all[k].end); break; }
      let nextStart = Infinity;
      for (let k = j + 1; k < all.length; k++) if (!all[k].removed) { nextStart = all[k].start; break; }
      const lo = Math.max(0, prevEnd + guard);
      const hi = nextStart - guard;
      let s = Math.max(lo, bStart - pad);
      let e = Math.min(hi, bEnd + pad);
      if (env) {
        // começo: o ponto quieto entre a palavra anterior e o bloco, perto do bloco
        s = quietPoint(env, Math.max(lo, Math.min(s, bStart) - Math.max(window, Math.min(0.5, bStart - lo))), Math.min(bStart + window / 2, e), bStart);
        // fim: o ponto quieto entre o bloco e a próxima palavra, perto do bloco
        e = quietPoint(env, Math.max(s, bEnd - window / 2), Math.min(hi, Math.max(e, bEnd) + Math.max(window, Math.min(0.5, hi - bEnd))), bEnd);
      }
      if (e - s > 0.02) out.push({ start: +s.toFixed(3), end: +e.toFixed(3) });
    }
    i = j;
  }
  return out;
}

/**
 * Vãos entre palavras mantidas (onde a transcrição não ouviu fala): respirações,
 * estalos de boca e silêncios que o detector de volume deixa passar. Puro.
 */
export function wordGapRanges(transcript, { minGap = 0.28, duration = Infinity } = {}) {
  const words = keptWords(transcript);
  const out = [];
  if (!words.length) return out;
  if (words[0].start >= minGap) out.push({ start: 0, end: words[0].start });
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i].end;
    const b = words[i + 1].start;
    if (b - a >= minGap) out.push({ start: a, end: b });
  }
  const last = words[words.length - 1].end;
  if (Number.isFinite(duration) && duration - last >= minGap) out.push({ start: last, end: duration });
  return out;
}

/**
 * Ponto de corte num trecho [a, b]: entre os instantes quase tão quietos quanto o mais
 * quieto (até 3 dB acima), o mais perto de `prefer`. (O mais quieto de todos podia
 * ficar longe e levar junto o fim de uma palavra que fica.)
 */
function quietPoint(env, a, b, prefer) {
  if (!(b > a)) return Math.min(Math.max(prefer, a), Math.max(a, b));
  let min = Infinity;
  for (let t = a; t <= b + 1e-9; t += env.hop) min = Math.min(min, env.db[frameAt(env, t)]);
  let best = a;
  let bestD = Infinity;
  for (let t = a; t <= b + 1e-9; t += env.hop) {
    if (env.db[frameAt(env, t)] <= min + 3 && Math.abs(t - prefer) < bestD) {
      bestD = Math.abs(t - prefer);
      best = t;
    }
  }
  return best;
}

/**
 * Palavras "fantasmas": a transcrição pôs texto onde o áudio está em silêncio (o Whisper
 * às vezes inventa frases no silêncio, ex.: "Legendas pela comunidade Amara.org"). Elas
 * não podem segurar o corte da pausa. Puro.
 */
export function phantomWords(words, env) {
  if (!env) return [];
  const thr = env.floor + 6;
  return words.filter((w) => {
    let mx = -Infinity;
    for (let i = frameAt(env, w.start); i <= frameAt(env, w.end); i++) mx = Math.max(mx, env.db[i]);
    return mx < thr;
  });
}

/** Vãos entre as palavras (com o começo e o fim do vídeo). Puro. */
function gapsBetween(words, duration, minGap) {
  const out = [];
  let prev = 0;
  for (const w of words) {
    if (w.start - prev >= minGap) out.push({ start: prev, end: w.start });
    prev = Math.max(prev, w.end);
  }
  if (Number.isFinite(duration) && duration - prev >= minGap) out.push({ start: prev, end: duration });
  return out;
}

/**
 * Tosses, pigarros, estalos de boca e batidas no microfone nos vãos entre as palavras:
 * cada som no vão (que a transcrição não ouviu como palavra) é medido; o que não tem voz
 * de fala (`isNonSpeech`) vira corte. Sons colados numa palavra ficam (podem ser o fim
 * dela). → [{start, end}] já com as bordas onde o som some.
 */
export async function findNoises(input, words, env, venv, { duration = Infinity, max = 400, concurrency = 4 } = {}) {
  if (!env || !venv) return [];
  const gaps = protectWords(gapsBetween(words, duration, 0.25), words);
  const edge = 0.02;
  const runs = [];
  for (const g of gaps) {
    for (const r of voicedRuns([g], venv, { minRun: 0.05 })) {
      if (r.end - r.start > 1.6 || r.start - g.start < edge || g.end - r.end < edge) continue;
      runs.push({ ...r, gap: g });
    }
  }
  const found = [];
  let next = 0;
  const worker = async () => {
    while (next < Math.min(runs.length, max)) {
      const r = runs[next++];
      const x = await readPcm(input, r.start - 0.03, r.end - r.start + 0.06);
      if (x && isNonSpeech(soundFeatures(x))) found.push(r);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  // bordas: até onde o som ainda se ouve (volume total acima do ruído), dentro do vão
  const thr = speechThreshold(env);
  return found
    .map((r) => {
      let s = r.start;
      while (s - env.hop > r.gap.start && env.db[frameAt(env, s - env.hop)] > thr) s -= env.hop;
      let e = r.end;
      while (e + env.hop < r.gap.end && env.db[frameAt(env, e)] > thr) e += env.hop;
      return { start: +Math.max(r.gap.start, s - 0.02).toFixed(3), end: +Math.min(r.gap.end, e + 0.03).toFixed(3) };
    })
    .sort((a, b) => a.start - b.start);
}

/**
 * Tira "pedacinhos" mantidos curtos demais (< `min` s) sem nenhuma palavra: sobras entre
 * dois cortes que soam como um clique ou meio som solto. (Voz protegida sem palavra na
 * transcrição sempre tem mais de 0,3 s, então nunca cai aqui.) Puro.
 */
export function dropSlivers(keep, words, { min = 0.15 } = {}) {
  const out = keep.filter((k) => k.end - k.start >= min || words.some((w) => w.end > k.start && w.start < k.end));
  return out.length ? out : keep;
}

/**
 * Junta tudo: pausas protegidas (palavras + volume), palavras removidas cortadas no
 * vale, tosses/ruídos de boca, e palavras "fantasmas" ignoradas. Sem envelope (falha do
 * ffmpeg) ou sem transcrição, cai no que der.
 */
export async function preciseRemovals(input, { pauses = [], transcript, hasAudio = true, breaths = false, coughs = false, duration = Infinity } = {}) {
  const [env, venv] = hasAudio
    ? await Promise.all([audioEnvelope(input).catch(() => null), audioEnvelope(input, { af: VOICE_BAND }).catch(() => null)])
    : [null, null];
  const all = keptWords(transcript);
  const ghosts = new Set(phantomWords(all, env));
  const words = all.filter((w) => !ghosts.has(w));
  // Tosses e ruídos: não seguram o corte da pausa (protectVoice) e saem mesmo fora dela.
  const noises = coughs ? await findNoises(input, words, env, venv, { duration }).catch(() => []) : [];
  // As folgas em volta das palavras são as MESMAS com ou sem respirações (com folgas
  // menores o corte comia o começo/fim das palavras). Respirações só mudam o limiar do
  // fim do corte: a inspiração antes da frase sai, o ataque da palavra fica.
  // Ordem: palavras da transcrição → voz no áudio (mesmo sem palavra na transcrição,
  // menos tosse/pigarro) → bordas guiadas pelo volume.
  const safePauses = fitPausesToAudio(protectVoice(protectWords(pauses, words), venv, { noise: noises }), env, breaths ? { breaths: true, preroll: 0.08 } : {});
  const removed = [...removedWordRanges(transcript, env), ...noises];
  const before = pauses.reduce((a, r) => a + (r.end - r.start), 0);
  const after = safePauses.reduce((a, r) => a + (r.end - r.start), 0);
  log.info(`cortes precisos: ${pauses.length} pausas → ${safePauses.length} (${(before - after).toFixed(2)}s devolvidos às palavras) · ${removed.length - noises.length} trechos de palavras removidas no vale · ${noises.length} tosses/ruídos · ${ghosts.size} palavras fantasmas${env ? '' : ' (sem envelope de áudio)'}`);
  return { pauses: safePauses, removed, noises, words };
}
