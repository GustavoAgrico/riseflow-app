import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg } from '../src/pipeline/ffmpeg.js';
import { detectSilences, refineSilenceRanges } from '../src/pipeline/silence.js';
import { snapKeep, subtractRanges } from '../src/pipeline/timeline.js';
import {
  audioEnvelope, envelopeFrom, fitPausesToAudio, keptWords, preciseRemovals, protectWords, removedWordRanges,
} from '../src/pipeline/cutRefine.js';

/** Envelope sintético: dB por quadro de 10 ms a partir de trechos [start, end, dB]. */
function env(duration, parts, base = -90) {
  const db = new Float32Array(Math.round(duration / 0.01)).fill(base);
  for (const [s, e, v] of parts) for (let i = Math.round(s / 0.01); i < Math.round(e / 0.01); i++) db[i] = v;
  return envelopeFrom(db);
}

test('pausa nunca invade uma palavra mantida da transcrição', () => {
  const words = [{ start: 1.0, end: 1.5 }, { start: 1.9, end: 2.4 }];
  // silencedetect achou "silêncio" começando no meio da 1ª palavra (fim baixinho)
  const out = protectWords([{ start: 1.3, end: 2.0 }], words, { pre: 0.08, post: 0.12 });
  assert.deepEqual(out.map((r) => [+r.start.toFixed(2), +r.end.toFixed(2)]), [[1.62, 1.82]]);
  // palavra no meio de uma pausa longa divide o corte em dois
  const split = protectWords([{ start: 0, end: 4 }], [{ start: 2, end: 2.3 }]);
  assert.equal(split.length, 2);
  assert.ok(split[0].end <= 1.92 + 1e-9 && split[1].start >= 2.42 - 1e-9);
});

test('borda da pausa segue o volume real: fim da palavra que ainda soa e ataque suave ficam', () => {
  // fala até 1.0, "s" final baixinho até 1.18, silêncio, ataque suave ("f") desde 1.85, fala de 2.0
  const e = env(3, [[0.2, 1.0, -12], [1.0, 1.18, -45], [1.85, 2.0, -48], [2.0, 2.8, -12]]);
  const [r] = fitPausesToAudio([{ start: 1.05, end: 1.95 }], e, { tail: 0.04, preroll: 0.06 });
  assert.ok(r.start >= 1.18 + 0.04 - 1e-6, `começo ${r.start} preserva o "s" final`);
  assert.ok(r.end <= 1.85 - 0.06 + 1e-6, `fim ${r.end} preserva o ataque`);
});

test('muleta removida é cortada no vale, sem invadir as palavras vizinhas', () => {
  const transcript = { segments: [{ words: [
    { start: 1.0, end: 1.4, word: 'eu' },
    { start: 1.42, end: 1.7, word: 'tipo', removed: true }, // colada na anterior (timestamps do ASR)
    { start: 1.7, end: 2.1, word: 'acho' },
  ] }] };
  const e = env(3, [[1.0, 1.43, -12], [1.47, 1.66, -15], [1.73, 2.1, -12]]);
  const [r] = removedWordRanges(transcript, e, { pad: 0.04, guard: 0.03 });
  assert.ok(r.start >= 1.43 && r.start <= 1.47, `começa no vale entre "eu" e "tipo" (${r.start})`);
  assert.ok(r.end >= 1.66 && r.end <= 1.67 + 1e-6, `termina antes do "acho" (${r.end})`);
  // sem envelope: ainda respeita a margem das vizinhas
  const [r2] = removedWordRanges(transcript, null, { pad: 0.04, guard: 0.03 });
  assert.ok(r2.start >= 1.43 - 1e-9 && r2.end <= 1.67 + 1e-9);
  assert.equal(keptWords(transcript).length, 2);
});

test('ajuste ao frame arredonda para FORA (não tira pedaço da fala)', () => {
  const keep = snapKeep([{ start: 1.012, end: 2.019 }, { start: 2.02, end: 3.001 }], 30);
  assert.deepEqual(keep, [{ start: 1, end: 3.033333333333333 }]); // trechos colados viram um
  assert.deepEqual(snapKeep([{ start: 0.5, end: 1.5 }], 30), [{ start: 0.5, end: 1.5 }]);
});

test('áudio real: o fim baixinho da palavra não é mais cortado junto com a pausa', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-cut-'));
  const wav = path.join(dir, 'fala.wav');
  // "palavra" alta 0.5–1.5 + final baixinho (−34 dB) 1.5–1.68 + silêncio + palavra 2.5–3.5
  const expr = "if(between(t,0.5,1.5),0.7*sin(2*PI*220*t),if(between(t,1.5,1.68),0.02*sin(2*PI*3000*t),if(between(t,2.5,3.5),0.7*sin(2*PI*220*t),0)))";
  await runFfmpeg(['-f', 'lavfi', '-i', `aevalsrc='${expr}':s=16000:d=4`, '-y', wav], { label: 'teste' });

  // Corte "forte" (gate 26 dB abaixo do pico): o final baixinho cai abaixo do gate.
  const raw = await detectSilences(wav, { noiseDb: -29, minSilence: 0.28 });
  const pauses = refineSilenceRanges(raw, 4, { padStart: 0.05, padEnd: 0.09 });
  const mid = pauses.find((p) => p.start > 1 && p.start < 2);
  assert.ok(mid && mid.start < 1.68, `sem a proteção, o corte começaria em ${mid?.start} (dentro do final da palavra)`);

  const transcript = { segments: [{ words: [{ start: 0.5, end: 1.5, word: 'palavra' }, { start: 2.5, end: 3.5, word: 'outra' }] }] };
  const e = await audioEnvelope(wav);
  assert.ok(e && e.db.length >= 395);
  const { pauses: safe } = await preciseRemovals(wav, { pauses, transcript });
  const fixed = safe.find((p) => p.start > 1 && p.start < 2.5);
  assert.ok(fixed.start >= 1.68, `agora o corte começa em ${fixed.start}, depois do final da palavra`);
  assert.ok(fixed.end <= 2.5, `e termina em ${fixed.end}, antes da próxima palavra`);
  const keep = snapKeep(subtractRanges(4, safe), 30);
  const covers = (a, b) => keep.some((k) => k.start <= a + 1e-9 && k.end >= b - 1e-9);
  assert.ok(covers(0.5, 1.68) && covers(2.5, 3.5), 'as duas palavras inteiras ficam');
  fs.rmSync(dir, { recursive: true, force: true });
});
