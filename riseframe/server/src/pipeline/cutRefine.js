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
 * corte. Respiração quase não tem energia nessa faixa, então continua sendo cortada. Puro.
 */
export function protectVoice(ranges, venv, { minRun = 0.06, pre = 0.12, post = 0.16, minRemove = 0.06 } = {}) {
  if (!venv) return ranges;
  const thr = Math.max(venv.floor + 12, venv.peak - 32);
  const minFrames = Math.max(1, Math.round(minRun / venv.hop));
  const out = [];
  for (const r of ranges) {
    // trechos com voz dentro da faixa a cortar
    const voiced = [];
    let runStart = -1;
    const a = frameAt(venv, r.start);
    const b = frameAt(venv, r.end);
    for (let i = a; i <= b + 1; i++) {
      const on = i <= b && venv.db[i] > thr;
      if (on && runStart < 0) runStart = i;
      if (!on && runStart >= 0) {
        if (i - runStart >= minFrames) voiced.push({ start: runStart * venv.hop - pre, end: i * venv.hop + post });
        runStart = -1;
      }
    }
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
 * Faixas das palavras REMOVIDAS (muletas, repetições, edição manual) com corte no vale
 * de volume: cada borda vai para o ponto mais baixo perto da palavra, sem invadir as
 * palavras vizinhas que ficam (com `guard` de margem). Puro.
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
    const w = all[i];
    if (!w.removed || !(w.end > w.start)) continue;
    let prevEnd = -Infinity;
    for (let j = i - 1; j >= 0; j--) if (!all[j].removed) { prevEnd = all[j].end; break; }
    let nextStart = Infinity;
    for (let j = i + 1; j < all.length; j++) if (!all[j].removed) { nextStart = all[j].start; break; }
    const lo = Math.max(0, prevEnd + guard);
    const hi = nextStart - guard;
    let s = Math.max(lo, w.start - pad);
    let e = Math.min(hi, w.end + pad);
    if (env) {
      s = valley(env, Math.max(lo, s - window), Math.min(w.start + window / 2, e), s);
      e = valley(env, Math.max(s, w.end - window / 2), Math.min(hi, e + window), e);
    }
    if (e - s > 0.02) out.push({ start: +s.toFixed(3), end: +e.toFixed(3) });
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

/** Instante de menor volume em [a, b] (ou `fallback` se a janela for vazia). */
function valley(env, a, b, fallback) {
  if (!(b > a)) return fallback;
  let best = fallback;
  let bestDb = Infinity;
  for (let t = a; t <= b + 1e-9; t += env.hop) {
    const v = env.db[frameAt(env, t)];
    if (v < bestDb) {
      bestDb = v;
      best = t;
    }
  }
  return best;
}

/**
 * Junta tudo: pausas protegidas (palavras + volume) e palavras removidas cortadas no
 * vale. Sem envelope (falha do ffmpeg) ou sem transcrição, cai no que der.
 */
export async function preciseRemovals(input, { pauses = [], transcript, hasAudio = true, breaths = false } = {}) {
  const [env, venv] = hasAudio
    ? await Promise.all([audioEnvelope(input).catch(() => null), audioEnvelope(input, { af: VOICE_BAND }).catch(() => null)])
    : [null, null];
  const words = keptWords(transcript);
  // Com corte de respirações: folgas menores em volta das palavras e borda guiada pelo
  // limiar de respiração (a inspiração antes da frase sai junto com a pausa).
  // As folgas em volta das palavras são as MESMAS com ou sem respirações (com folgas
  // menores o corte comia o começo/fim das palavras). Respirações só mudam o limiar do
  // fim do corte: a inspiração antes da frase sai, o ataque da palavra fica.
  // Ordem: palavras da transcrição → voz no áudio (mesmo sem palavra na transcrição) →
  // bordas guiadas pelo volume.
  const safePauses = fitPausesToAudio(protectVoice(protectWords(pauses, words), venv), env, breaths ? { breaths: true, preroll: 0.08 } : {});
  const removed = removedWordRanges(transcript, env);
  const before = pauses.reduce((a, r) => a + (r.end - r.start), 0);
  const after = safePauses.reduce((a, r) => a + (r.end - r.start), 0);
  log.info(`cortes precisos: ${pauses.length} pausas → ${safePauses.length} (${(before - after).toFixed(2)}s devolvidos às palavras) · ${removed.length} palavras removidas no vale${env ? '' : ' (sem envelope de áudio)'}`);
  return { pauses: safePauses, removed };
}
