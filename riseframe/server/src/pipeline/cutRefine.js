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

// ── Tom de voz (periodicidade): fala tem vogais com tom; respiração, tosse e chiado não ──

/**
 * Áudio inteiro em 8 kHz só na faixa do tom da voz (70–900 Hz), Int16, para medir se um
 * trecho tem VOZ (vibração periódica das cordas vocais) mesmo quando é baixinho. O volume
 * sozinho não separa uma palavra dita baixo de uma respiração; o tom separa.
 * Vídeos longos demais (> `maxSeconds`) ficam sem (cai no comportamento anterior).
 */
export function voicingTrack(input, { maxSeconds = 2 * 3600 } = {}) {
  return new Promise((resolve) => {
    const bufs = [];
    let bytes = 0;
    const limit = maxSeconds * 8000 * 2;
    const proc = spawn(ffmpegPath, ['-v', 'error', '-i', input, '-vn', '-ac', '1', '-af', 'highpass=f=70,lowpass=f=900,lowpass=f=900', '-ar', '8000', '-f', 's16le', '-'], { stdio: ['ignore', 'pipe', 'ignore'] });
    proc.stdout.on('data', (c) => {
      bytes += c.length;
      if (bytes > limit) {
        proc.kill('SIGKILL');
        return;
      }
      bufs.push(c);
    });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      if (bytes > limit || !bufs.length) return resolve(null);
      const b = Buffer.concat(bufs);
      resolve({ x: new Int16Array(b.buffer, b.byteOffset, Math.floor(b.length / 2)), rate: 8000 });
    });
  });
}

/**
 * `voicing(a, b)` → fração (0–1) dos quadros com som em [a, b] que têm tom de voz.
 * Calcula sob demanda (com cache) só onde for perguntado. Puro (dado o áudio).
 */
export function makeVoicing(track, env) {
  if (!track || !env) return null;
  const { x, rate } = track;
  const N = Math.round(rate * 0.04);
  const H = Math.round(rate * env.hop);
  const minLag = Math.floor(rate / 400);
  const maxLag = Math.ceil(rate / 70);
  const thr = Math.max(env.floor + 12, env.peak - 50);
  const cache = new Map();
  const periodic = (f) => {
    if (cache.has(f)) return cache.get(f);
    const a = f * H;
    let best = 0;
    if (a + N <= x.length) {
      for (let lag = minLag; lag <= maxLag; lag++) {
        let xy = 0, xx = 0, yy = 0;
        for (let i = a; i + lag < a + N; i++) {
          const p = x[i];
          const q = x[i + lag];
          xy += p * q; xx += p * p; yy += q * q;
        }
        const r = xy / Math.sqrt(xx * yy + 1e-9);
        if (r > best) best = r;
      }
    }
    cache.set(f, best);
    return best;
  };
  return (t0, t1) => {
    let loud = 0;
    let voiced = 0;
    for (let f = frameAt(env, t0); f <= frameAt(env, Math.max(t0, t1)); f++) {
      if (env.db[f] <= thr) continue;
      loud++;
      if (periodic(f) >= 0.6) voiced++;
    }
    return loud ? voiced / loud : 0;
  };
}

/**
 * Fala BAIXINHA no meio de uma "pausa": o detector de silêncio usa um limiar de volume
 * (o fim de frase dito baixo, uma palavra sussurrada, a voz que vai sumindo ficam abaixo
 * dele) e a transcrição muitas vezes nem escreve essas palavras — o corte levava junto.
 * Todo trecho com som (≥ `minRun`) dentro da faixa a cortar que tiver TOM DE VOZ sai do
 * corte, com folga. Respiração, tosse e chiado não têm tom e continuam sendo cortados.
 */
export function protectQuietSpeech(ranges, env, voicing, { minRun = 0.08, pre = 0.12, post = 0.14, minRemove = 0.06, minVoiced = 0.3, bridge = 0.1 } = {}) {
  if (!env || !voicing) return ranges;
  const thr = Math.max(env.floor + 12, env.peak - 50);
  const loud = (i) => [i - 1, i, i + 1].filter((k) => k >= 0 && k < env.db.length && env.db[k] > thr).length >= 2;
  const minFrames = Math.max(1, Math.round(minRun / env.hop));
  const out = [];
  for (const r of ranges) {
    // trechos com som; micro-silêncios de até `bridge` s (consoantes no meio da palavra)
    // não separam
    const runs = [];
    let runStart = -1;
    let quiet = 0;
    const bridgeFrames = Math.round(bridge / env.hop);
    const a = frameAt(env, r.start);
    const b = frameAt(env, r.end);
    for (let i = a; i <= b + bridgeFrames + 1; i++) {
      const on = i <= b && loud(i);
      if (on) {
        if (runStart < 0) runStart = i;
        quiet = 0;
      } else if (runStart >= 0 && ++quiet > bridgeFrames) {
        runs.push([runStart, i - quiet + 1]);
        runStart = -1;
        quiet = 0;
      }
    }
    const speech = runs
      .filter(([x, y]) => y - x >= minFrames && voicing(x * env.hop, y * env.hop) >= minVoiced)
      .map(([x, y]) => ({ start: x * env.hop - pre, end: y * env.hop + post }));
    let pieces = [{ start: r.start, end: r.end }];
    for (const v of speech) {
      pieces = pieces.flatMap((p) => {
        if (v.end <= p.start || v.start >= p.end) return [p];
        return [{ start: p.start, end: Math.min(p.end, v.start) }, { start: Math.max(p.start, v.end), end: p.end }].filter((x) => x.end - x.start > 0);
      });
    }
    out.push(...pieces.filter((p) => p.end - p.start > minRemove));
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
export function soundFeatures(x, fs = 16000, { context = 0 } = {}) {
  // `context` s no começo: só para medir o ataque (o som de verdade começa depois)
  const lo = biquad(biquad(biquad(x, 'high', 70, fs), 'low', 900, fs), 'low', 900, fs);
  const hi = biquad(biquad(x, 'high', 2500, fs), 'high', 2500, fs);
  const N = Math.round(fs * 0.04);
  const H = Math.round(fs * 0.01);
  const all = [];
  for (let a = 0; a + N <= x.length; a += H) all.push({ a, lo: rmsDb(lo, a, a + N), hi: rmsDb(hi, a, a + N), full: rmsDb(x, a, a + N) });
  const c0 = Math.round(context * fs);
  const frames = all.filter((f) => f.a >= c0);
  if (!frames.length) return { dur: x.length / fs, voicedFrac: 1, hiRatio: -60, attack: 0, onsetVoiced: 1, onsetHi: -60, voicedFull: 1, burstSec: 0 };
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
  // Começo do som: a tosse "explode" (sobe muito rápido, larga e sem tom) e depois pode
  // ter um rabicho com voz ("cof-hum"); a palavra começa já na vogal ou numa consoante
  // que vira vogal logo em seguida.
  // (medidas pelo volume TOTAL: a rajada de ar da tosse é forte no agudo, e o rabicho com
  // voz pode dominar só a faixa grave)
  const topFull = Math.max(...frames.map((f) => f.full));
  const loudFull = frames.filter((f) => f.full >= topFull - 10);
  const oi = frames.indexOf(loudFull[0]);
  const ai = all.indexOf(loudFull[0]);
  const before = all.slice(Math.max(0, ai - 12), ai).map((f) => f.full);
  const attack = before.length ? frames[oi].full - Math.min(...before) : 0;
  const per = (f) => periodicity(lo, f.a, f.a + N, fs);
  const voicedFull = loudFull.filter((f) => per(f) >= 0.6).length / loudFull.length;
  // rajada de ar no começo: quadros seguidos fortes, sem tom e LARGOS (grave e agudo juntos —
  // o "s"/"ch" de uma palavra fica quase todo no agudo)
  let noisyRun = 0;
  for (let i = oi; i < frames.length; i++) {
    const f = frames[i];
    const tilt = f.hi - f.lo;
    if (f.full < topFull - 14 || per(f) >= 0.6 || tilt < -16 || tilt > 16) break;
    noisyRun++;
  }
  return {
    dur: x.length / fs,
    voicedFrac: voiced / loud.length,
    hiRatio: ratios[Math.floor(ratios.length / 2)],
    attack,
    onsetVoiced: per(frames[oi]),
    onsetHi: frames[oi].hi - frames[oi].lo,
    voicedFull,
    burstSec: noisyRun * (H / fs),
  };
}

/**
 * Tosse/pigarro/estalo (true) ou fala (false)? Conservador: qualquer som com vogal (voz
 * periódica) em boa parte é tratado como fala e fica — melhor deixar uma tosse do que
 * cortar uma palavra. Puro.
 */
export function isNonSpeech(f) {
  if (!f || f.dur > 1.6) return false;
  if (f.voicedFrac < 0.15) return true; // sem tom de voz nenhum: tosse seca, pigarro, batida
  if (f.voicedFrac < 0.25 && f.hiRatio > -6) return true; // rajada larga com pouca voz (tosse)
  // tosse com rabicho de voz ("cof-hum"): começa numa explosão de ar sem tom e larga
  return (f.burstSec ?? 0) >= 0.05 && (f.attack ?? 0) >= 12 && (f.voicedFull ?? 1) < 0.85;
}

/**
 * Divide um som comprido em rajadas (crise de tosse: "cof… cof… cof"): onde o volume cai
 * bem abaixo do pico do trecho por ≥ 50 ms. Puro.
 */
export function splitBursts(r, env, { dip = 14, minGap = 0.05, minBurst = 0.05 } = {}) {
  if (!env) return [r];
  const a = frameAt(env, r.start);
  const b = frameAt(env, r.end);
  let peak = -Infinity;
  for (let i = a; i <= b; i++) peak = Math.max(peak, env.db[i]);
  const thr = peak - dip;
  const gapF = Math.max(1, Math.round(minGap / env.hop));
  const out = [];
  let s = -1;
  let quiet = 0;
  for (let i = a; i <= b + 1; i++) {
    const on = i <= b && env.db[i] > thr;
    if (on) {
      if (s < 0) s = i;
      quiet = 0;
    } else if (s >= 0 && ++quiet >= gapF || (s >= 0 && i > b)) {
      const e = i - quiet + 1;
      if ((e - s) * env.hop >= minBurst) out.push({ start: +(s * env.hop).toFixed(3), end: +(e * env.hop).toFixed(3) });
      s = -1;
      quiet = 0;
    }
  }
  return out.length ? out : [r];
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
 * Bordas finais de cada PAUSA pelo som real, nos dois sentidos:
 *  - se a borda caiu em som (fim de palavra que ainda soa, ataque já começando), ela
 *    recua para o silêncio (como `fitPausesToAudio`);
 *  - se caiu em silêncio, ela AVANÇA para dentro do silêncio até encostar no som
 *    (antes ficava a folga fixa das proteções + o atraso da transcrição, que costuma
 *    esticar o fim da frase: sobravam 0,4–0,8 s de silêncio em cada emenda).
 * Fica só um respiro curto: `tail` depois do fim do som e `preroll` antes do próximo.
 * Com `breaths`, a inspiração antes da frase (som sem voz) também sai: o corte vai até
 * `voiceLead` antes da voz (o "s"/"ch"/"t" do começo da palavra fica). Puro.
 */
export function fitCutEdges(ranges, env, venv, { maxShift = 0.3, maxExpand = 0.6, tail = 0.06, preroll = 0.06, voiceLead = 0.14, minRemove = 0.08, breaths = false, voicing = null, hold = 0.1 } = {}) {
  if (!env) return ranges;
  const speechThr = speechThreshold(env);
  const endThr = breaths ? breathThreshold(env) : speechThr;
  const at = (t) => env.db[frameAt(env, t)];
  // (recuo) qualquer quadro acima do limiar conta como som
  const loudS = (t) => t >= 0 && at(t) > speechThr;
  const loudE = (t) => t >= 0 && at(t) > endThr;
  // (avanço) som = 2 de 3 quadros seguidos acima do limiar, um pouco acima do ruído:
  // um quadro solto do chiado de fundo não segura o corte
  const quietThr = Math.max(env.floor + 12, env.peak - 50);
  const loud = (t) => [t - env.hop, t, t + env.hop].filter((x) => x >= 0 && at(x) > quietThr).length >= 2;
  const vthr = venv ? Math.max(venv.floor + 12, venv.peak - 32) : Infinity;
  const voiced = (t) => venv && venv.db[frameAt(venv, t)] > vthr;
  const H = env.hop;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out = [];
  sorted.forEach((r, i) => {
    const prevLimit = i > 0 ? sorted[i - 1].end : 0;
    const nextLimit = i < sorted.length - 1 ? sorted[i + 1].start : env.db.length * H;
    // começo do corte. Uma palavra tem micro-silêncios por dentro (o "d" de "ven-das",
    // o "t" de "pon-to" ficam ~30–80 ms quietos): o som só acabou de verdade depois de
    // `hold` s seguidos de silêncio — senão a última sílaba de uma palavra dita baixo ia
    // embora junto com a pausa.
    const anyLoud = (fn, a, b) => {
      for (let t = a; t <= b + 1e-9; t += H) if (fn(t)) return true;
      return false;
    };
    let s = r.start;
    if (anyLoud(loudS, s, s + hold)) {
      const lim = Math.min(r.end, r.start + maxShift);
      while (s < lim && anyLoud(loudS, s, s + hold)) s += H;
    } else {
      const lim = Math.max(prevLimit, r.start - maxExpand);
      while (s - H > lim && !loud(s - H) && !loud(s - 2 * H)) s -= H;
    }
    // fim do corte
    let e = r.end;
    let lead = preroll;
    if (anyLoud(loudE, e - hold, e - H)) {
      const lim = Math.max(s, r.end - maxShift);
      while (e > lim && anyLoud(loudE, e - hold, e - H)) e -= H;
    } else {
      const lim = Math.min(nextLimit, r.end + maxExpand);
      while (e + H < lim && !loud(e) && !loud(e + H)) e += H;
    }
    if (breaths && venv && !voiced(e)) {
      // som sem voz antes da frase (inspiração): o corte vai até perto da voz
      let v = e;
      const lim = Math.min(nextLimit, e + 0.8);
      while (v < lim && !(voiced(v) && voiced(v + H) && voiced(v + 2 * H))) v += H;
      // (só se esse som não tiver tom de voz: o começo baixinho da palavra também não
      // passa no limiar de voz, mas tem tom — esse fica)
      if (v < lim && v - voiceLead > e && !(voicing && voicing(e, v - 0.02) >= 0.3)) {
        e = v - voiceLead;
        lead = 0;
      }
    }
    s += tail;
    e -= lead;
    if (e - s > minRemove) out.push({ start: +s.toFixed(3), end: +e.toFixed(3) });
  });
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
        const quiet = Math.max(env.floor + 12, env.peak - 50);
        const dbAt = (t) => env.db[frameAt(env, t)];
        // começo: o ponto quieto entre a palavra anterior e o bloco, perto do bloco
        s = quietPoint(env, Math.max(lo, Math.min(s, bStart) - Math.max(window, Math.min(0.5, bStart - lo))), Math.min(bStart + 0.12, bEnd, e), bStart);
        // A transcrição erra o tempo das palavras em até ~0,1 s: se a borda ficou no meio
        // do som (palavras coladas), procura o vão de verdade um pouco além da margem
        // da palavra vizinha — só aceita se ali for silêncio, ou um vale bem mais baixo
        // (palavras coladas quase não têm silêncio entre si).
        if (dbAt(s) > quiet && Number.isFinite(prevEnd)) {
          const alt = quietPoint(env, Math.max(0, prevEnd - 0.04), Math.min(bStart + 0.12, bEnd, e), bStart);
          if (dbAt(alt) <= quiet || dbAt(alt) <= dbAt(s) - 8) s = alt;
        }
        // fim: o ponto quieto entre o bloco e a próxima palavra, perto do bloco
        e = quietPoint(env, Math.max(s, bStart, bEnd - 0.12), Math.min(hi, Math.max(e, bEnd) + Math.max(window, Math.min(0.5, hi - bEnd))), bEnd);
        if (dbAt(e) > quiet && Number.isFinite(nextStart)) {
          const alt = quietPoint(env, Math.max(s, bStart, bEnd - 0.12), nextStart + 0.04, bEnd);
          if (dbAt(alt) <= quiet || dbAt(alt) <= dbAt(e) - 8) e = alt;
        }
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

/**
 * Palavras "encolhidas" até onde o som delas vai de verdade. O Whisper costuma esticar a
 * última palavra da frase por cima da pausa inteira (e às vezes a primeira da próxima
 * para trás): a pausa ficava "dentro" da palavra, protegida, e não era cortada.
 * Dentro do tempo da palavra, o som é separado em blocos por silêncios de 0,2 s ou mais
 * (nenhuma palavra tem um silêncio desses no meio); a proteção fica só nos blocos com
 * voz (a respiração antes da frase seguinte não tem voz), com uma margem — uma palavra
 * pode virar mais de um pedaço protegido. Puro.
 */
export function trimWordsToSound(words, env, venv = null, { margin = 0.05, gap = 0.2 } = {}) {
  if (!env) return words;
  const thr = Math.max(env.floor + 12, env.peak - 50);
  const vthr = venv ? Math.max(venv.floor + 12, venv.peak - 32) : Infinity;
  const loud = (i) => [i - 1, i, i + 1].filter((k) => k >= 0 && env.db[k] > thr).length >= 2;
  const gapFrames = Math.round(gap / env.hop);
  return words.flatMap((w) => {
    const a = frameAt(env, w.start);
    const b = frameAt(env, w.end);
    const blocks = [];
    let cur = null;
    let quiet = 0;
    for (let i = a; i <= b; i++) {
      if (loud(i)) {
        if (!cur || quiet >= gapFrames) {
          cur = { a: i, b: i, voiced: 0 };
          blocks.push(cur);
        }
        cur.b = i;
        if (venv && venv.db[Math.min(venv.db.length - 1, i)] > vthr) cur.voiced++;
        quiet = 0;
      } else {
        quiet++;
      }
    }
    if (!blocks.length) return [w];
    const voiced = blocks.filter((k) => k.voiced >= 3);
    const use = voiced.length ? voiced : blocks;
    // um pedaço por bloco com voz: o silêncio de 0,2 s+ entre eles (a transcrição juntou
    // duas falas numa palavra só) também pode ser cortado
    const pieces = use.map((k) => ({
      ...w,
      start: Math.max(w.start, k.a * env.hop - margin),
      end: Math.min(w.end, (k.b + 1) * env.hop + margin),
    })).filter((x) => x.end - x.start >= 0.05);
    return pieces.length ? pieces : [w];
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
export async function findNoises(input, words, env, venv, { duration = Infinity, max = 20000, concurrency = 4, chunk = 300, untranscribed = false } = {}) {
  if (!env || !venv) return [];
  const gaps = protectWords(gapsBetween(words, duration, 0.25), words);
  const edge = 0.02;
  const runs = [];
  // Som SOLTO no meio da pausa (longe das palavras) que a transcrição não ouviu como
  // palavra: com `untranscribed`, sai direto (tosse abafada, pigarro, "hum", estalo) — o
  // usuário restaura na timeline se era para ficar.
  const loose = [];
  const apart = 0.1;
  for (const g of gaps) {
    for (const r of voicedRuns([g], venv, { minRun: 0.05 })) {
      if (r.end - r.start > 8 || r.start - g.start < edge || g.end - r.end < edge) continue;
      if (untranscribed && r.start - g.start >= apart && g.end - r.end >= apart && r.end - r.start <= 3) {
        loose.push({ ...r, gap: g, kind: 'som' });
        continue;
      }
      // som comprido (crise de tosse): cada rajada é medida sozinha
      const parts = r.end - r.start > 0.7 ? splitBursts(r, env) : [r];
      for (const p of parts) if (p.end - p.start <= 1.6) runs.push({ ...p, gap: g });
    }
  }
  const found = [];
  const list = runs.slice(0, max);
  // um pouco antes do som (dentro do vão) para medir o ataque da rajada
  const preOf = (r) => Math.max(0.03, Math.min(0.15, r.start - r.gap.start));
  if (list.length > 30) {
    // Vídeo longo: lê o áudio em blocos de `chunk` s (uma leitura por bloco) em vez de
    // uma por trecho — antes só os primeiros 400 trechos eram olhados e as tosses do fim
    // de um vídeo de 14 min passavam.
    const RATE = 16000;
    const groups = new Map();
    for (const r of list) {
      const k = Math.floor(r.start / chunk);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    for (const [k, rs] of groups) {
      const a = Math.max(0, k * chunk - 1);
      const x = await readPcm(input, a, chunk + 4, RATE);
      for (const r of rs) {
        const pre = preOf(r);
        let seg = null;
        if (x) {
          const i0 = Math.max(0, Math.round((r.start - pre - a) * RATE));
          const i1 = Math.min(x.length, Math.round((r.end + 0.03 - a) * RATE));
          if (i1 - i0 > RATE * 0.04) seg = x.subarray(i0, i1);
        }
        if (!seg) seg = await readPcm(input, r.start - pre, r.end - r.start + pre + 0.03);
        if (seg && isNonSpeech(soundFeatures(seg, RATE, { context: pre - 0.03 }))) found.push(r);
      }
    }
  } else {
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const r = list[next++];
        const pre = preOf(r);
        const x = await readPcm(input, r.start - pre, r.end - r.start + pre + 0.03);
        if (x && isNonSpeech(soundFeatures(x, 16000, { context: pre - 0.03 }))) found.push(r);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
  }
  // bordas: até onde o som ainda se ouve (volume total acima do ruído), dentro do vão
  const thr = speechThreshold(env);
  return [...found.map((r) => ({ ...r, kind: 'tosse' })), ...loose]
    .map((r) => {
      let s = r.start;
      while (s - env.hop > r.gap.start && env.db[frameAt(env, s - env.hop)] > thr) s -= env.hop;
      let e = r.end;
      while (e + env.hop < r.gap.end && env.db[frameAt(env, e)] > thr) e += env.hop;
      return { start: +Math.max(r.gap.start, s - 0.02).toFixed(3), end: +Math.min(r.gap.end, e + 0.03).toFixed(3), kind: r.kind };
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
/** Respiro deixado em cada emenda conforme a força do corte. */
export function edgePads(strength = 'forte') {
  if (strength === 'suave') return { tail: 0.16, preroll: 0.14 };
  if (strength === 'equilibrado') return { tail: 0.12, preroll: 0.1 };
  return { tail: 0.09, preroll: 0.07 };
}

/** Análise do áudio usada nos cortes precisos (envelope, faixa da voz e tom). */
export async function audioAnalysis(input) {
  const [env, venv, track] = await Promise.all([
    audioEnvelope(input).catch(() => null),
    audioEnvelope(input, { af: VOICE_BAND }).catch(() => null),
    voicingTrack(input).catch(() => null),
  ]);
  return { env, venv, track };
}

export async function preciseRemovals(input, { pauses = [], transcript, hasAudio = true, breaths = false, coughs = false, duration = Infinity, strength = 'forte', audio = null, noises: knownNoises = null, keepNoises = [] } = {}) {
  // `audio`: análise já pronta (a prévia do editor reaproveita a do vídeo original)
  const { env, venv, track } = hasAudio ? audio || (await audioAnalysis(input)) : { env: null, venv: null, track: null };
  const voicing = makeVoicing(track, env);
  const all = keptWords(transcript);
  const ghosts = new Set(phantomWords(all, env));
  // (protege só o trecho com som de cada palavra: o Whisper estica palavras por cima da pausa)
  const words = trimWordsToSound(all.filter((w) => !ghosts.has(w)), env, venv);
  // Tosses e ruídos: não seguram o corte da pausa (protectVoice) e saem mesmo fora dela.
  // (trechos que o usuário restaurou na timeline ficam — e seguram a pausa como voz)
  const restored = (n) => (keepNoises || []).some((k) => Math.min(k.end, n.end) - Math.max(k.start, n.start) >= 0.5 * (n.end - n.start));
  const noises = (!coughs ? []
    : knownNoises ? knownNoises.filter((n) => !words.some((w) => w.start < n.end && w.end > n.start))
      : await findNoises(input, words, env, venv, { duration, untranscribed: true }).catch(() => [])).filter((n) => !restored(n));
  // Ordem: palavras da transcrição → voz forte no áudio (menos tosse/pigarro) → fala
  // baixinha (tom de voz) → bordas pelo som real (a inspiração antes da frase sai com
  // "respirações"; o ataque da palavra fica).
  const guarded = protectQuietSpeech(protectVoice(protectWords(pauses, words), venv, { noise: noises }), env, voicing);
  const safePauses = fitCutEdges(guarded, env, venv, { breaths, voicing, ...edgePads(strength) });
  const removed = [...removedWordRanges(transcript, env), ...noises];
  const before = pauses.reduce((a, r) => a + (r.end - r.start), 0);
  const after = safePauses.reduce((a, r) => a + (r.end - r.start), 0);
  log.info(`cortes precisos: ${pauses.length} pausas → ${safePauses.length} (${(before - after).toFixed(2)}s devolvidos às palavras) · ${removed.length - noises.length} trechos de palavras removidas no vale · ${noises.length} tosses/ruídos · ${ghosts.size} palavras fantasmas${env ? '' : ' (sem envelope de áudio)'}`);
  // Só ruído de fundo entre a, b (sem fiapo de fala/muleta/tosse)?
  const quietThr = env ? Math.max(env.floor + 12, env.peak - 50) : 0;
  const quietBetween = (a, b) => {
    if (!env) return false;
    for (let i = frameAt(env, a); i <= frameAt(env, Math.max(a, b - 1e-6)); i++) if (env.db[i] > quietThr) return false;
    return true;
  };
  return { pauses: safePauses, removed, noises, words, quietBetween };
}

/**
 * Tosses/ruídos do vídeo inteiro com TODAS as palavras da transcrição (as removidas também):
 * serve de cache para a prévia do editor — apagar palavras só aumenta os vãos, e o que cai
 * dentro de uma palavra removida já sai junto com ela.
 */
export async function detectNoises(input, transcript, { audio = null, duration = Infinity } = {}) {
  const { env, venv } = audio || (await audioAnalysis(input));
  if (!env || !venv) return [];
  const all = (transcript?.segments || []).flatMap((s) => s.words || [])
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end))
    .map((w) => ({ ...w, removed: false }))
    .sort((a, b) => a.start - b.start);
  const ghosts = new Set(phantomWords(all, env));
  const words = trimWordsToSound(all.filter((w) => !ghosts.has(w)), env, venv);
  return findNoises(input, words, env, venv, { duration, untranscribed: true });
}
