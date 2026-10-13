import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runFfmpeg } from '../src/pipeline/ffmpeg.js';
import {
  readPcm, soundFeatures, isNonSpeech, preciseRemovals, wordGapRanges,
  removedWordRanges, dropSlivers, phantomWords, envelopeFrom,
} from '../src/pipeline/cutRefine.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rf-tosse-'));
after(() => fs.rm(tmp, { recursive: true, force: true }));

// "Vogal" sintética: tom de voz de 130 Hz com harmônicos (periódica, como a fala).
const VOWEL = '0.3*(sin(2*PI*130*t)+0.7*sin(2*PI*260*t)+0.5*sin(2*PI*390*t)+0.3*sin(2*PI*520*t)+0.2*sin(2*PI*650*t))';
// Tosse sintética: rajada de ruído com ataque rápido e queda exponencial (sem tom).
const COUGH_AF = "highpass=f=200,lowpass=f=6000,volume='if(lt(t,0.012),t/0.012,exp(-(t-0.012)/0.12))':eval=frame";

async function wav(name, args) {
  const out = path.join(tmp, name);
  await runFfmpeg([...args, '-ar', '16000', '-ac', '1', '-y', out], { label: 'teste' });
  return out;
}

test('tosse, pigarro e estalo não são fala; vogal (palavra) é', async () => {
  const vowel = await wav('vogal.wav', ['-f', 'lavfi', '-i', `aevalsrc='${VOWEL}*sin(PI*t/0.5)':s=16000:d=0.5`]);
  const cough = await wav('tosse.wav', ['-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.6:duration=0.45:seed=1', '-af', COUGH_AF]);
  const throat = await wav('pigarro.wav', ['-f', 'lavfi', '-i', 'anoisesrc=color=brown:amplitude=0.8:duration=0.6:seed=3', '-af', "lowpass=f=1200,volume='0.5+0.5*sin(2*PI*28*t)':eval=frame"]);
  const click = await wav('estalo.wav', ['-f', 'lavfi', '-i', 'anoisesrc=color=white:amplitude=0.9:duration=0.08:seed=6', '-af', "volume='exp(-t/0.01)':eval=frame"]);
  const f = async (file) => soundFeatures(await readPcm(file, 0, 2));
  const fv = await f(vowel);
  assert.ok(fv.voicedFrac > 0.8, `vogal deveria ter voz (${fv.voicedFrac})`);
  assert.equal(isNonSpeech(fv), false);
  for (const file of [cough, throat, click]) {
    const ft = await f(file);
    assert.equal(isNonSpeech(ft), true, `${path.basename(file)} deveria ser ruído (${JSON.stringify(ft)})`);
  }
  // som longo demais nunca é tratado como tosse (pode ser fala sem tom)
  assert.equal(isNonSpeech({ dur: 2, voicedFrac: 0, hiRatio: 0 }), false);
});

test('tosse entre as frases sai do vídeo; palavra não transcrita no mesmo lugar fica', async () => {
  // fala 0–1,2 s · (tosse OU palavra que a transcrição não ouviu) por volta de 2,05 s · fala 3,2–4,4 s
  const coughFile = await wav('frase_tosse2.wav', [
    '-f', 'lavfi', '-i', `aevalsrc='${VOWEL}*between(t,0,1.2)':s=16000:d=2`,
    '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.5:duration=1.0:seed=1:sample_rate=16000',
    '-f', 'lavfi', '-i', `aevalsrc='${VOWEL}*between(t,0.2,1.4)':s=16000:d=1.6`,
    '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.003:sample_rate=16000:d=6',
    '-filter_complex', `[1]${COUGH_AF},apad=whole_dur=1.0[c];[0][c][2]concat=n=3:v=0:a=1[s];[s][3]amix=inputs=2:duration=first:normalize=0`,
  ]);
  const wordFile = await wav('frase_palavra.wav', [
    '-f', 'lavfi', '-i', `aevalsrc='${VOWEL}*between(t,0,1.2)':s=16000:d=2`,
    '-f', 'lavfi', '-i', `aevalsrc='${VOWEL}*between(t,0,0.35)':s=16000:d=1.0`,
    '-f', 'lavfi', '-i', `aevalsrc='${VOWEL}*between(t,0.2,1.4)':s=16000:d=1.6`,
    '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.003:sample_rate=16000:d=6',
    '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1[s];[s][3]amix=inputs=2:duration=first:normalize=0',
  ]);
  const transcript = { segments: [{ words: [
    { start: 0, end: 0.6, word: 'hoje' }, { start: 0.6, end: 1.2, word: 'vamos' },
    { start: 3.2, end: 3.8, word: 'falar' }, { start: 3.8, end: 4.4, word: 'disso' },
  ] }] };
  const pauses = wordGapRanges(transcript, { minGap: 0.45, duration: 4.6 });
  const cut = (r) => [...r.pauses, ...r.removed];
  const covers = (ranges, t) => ranges.some((x) => x.start <= t && x.end >= t);

  const c = await preciseRemovals(coughFile, { pauses, transcript, breaths: true, coughs: true, duration: 4.6 });
  assert.equal(c.noises.length, 1);
  assert.ok(c.noises[0].start <= 2.06 && c.noises[0].end > 2.4, `tosse inteira: ${JSON.stringify(c.noises)}`);
  for (const t of [1.5, 2.05, 2.2, 2.4, 2.9]) assert.ok(covers(cut(c), t), `${t}s deveria sair`);
  // as palavras ficam
  for (const t of [1.15, 3.25]) assert.ok(!covers(cut(c), t), `${t}s é fala`);
  // sem a opção, a tosse fica (a voz protegida segura o corte)
  const off = await preciseRemovals(coughFile, { pauses, transcript, breaths: true, coughs: false, duration: 4.6 });
  assert.ok(!covers(cut(off), 2.1));

  const w = await preciseRemovals(wordFile, { pauses, transcript, breaths: true, coughs: true, duration: 4.6 });
  assert.equal(w.noises.length, 0);
  assert.ok(!covers(cut(w), 2.15), 'palavra não transcrita não pode ser cortada');
});

test('palavras removidas seguidas viram um corte só (sem pedacinho de som no meio)', () => {
  const t = { segments: [{ words: [
    { start: 0, end: 0.5, word: 'hoje' },
    { start: 0.6, end: 0.9, word: 'eu', removed: true },
    { start: 1.0, end: 1.4, word: 'vou', removed: true },
    { start: 1.6, end: 2.0, word: 'mostrar' },
  ] }] };
  const r = removedWordRanges(t, null);
  assert.equal(r.length, 1);
  assert.ok(r[0].start <= 0.6 && r[0].end >= 1.4);
  assert.ok(r[0].start >= 0.53 && r[0].end <= 1.57, 'não invade as palavras que ficam');
});

test('pedacinho mantido curto e sem palavra entre dois cortes sai', () => {
  const keep = [{ start: 0, end: 1 }, { start: 1.2, end: 1.28 }, { start: 1.5, end: 1.6 }, { start: 2, end: 3 }];
  const words = [{ start: 1.52, end: 1.7 }];
  assert.deepEqual(dropSlivers(keep, words), [{ start: 0, end: 1 }, { start: 1.5, end: 1.6 }, { start: 2, end: 3 }]);
  // também no começo do vídeo (a 1ª tentativa saiu e sobrou um fiapo de silêncio)
  assert.deepEqual(dropSlivers([{ start: 1.9, end: 2.03 }, { start: 3.3, end: 6 }], [{ start: 3.5, end: 3.8 }]), [{ start: 3.3, end: 6 }]);
  // nunca deixa o vídeo vazio
  assert.deepEqual(dropSlivers([{ start: 0, end: 0.1 }], []), [{ start: 0, end: 0.1 }]);
});

test('palavra "fantasma" (texto onde o áudio está em silêncio) é detectada', () => {
  const db = new Float32Array(300).fill(-70);
  for (let i = 0; i < 100; i++) db[i] = -20; // fala só no 1º segundo
  const env = envelopeFrom(db);
  const ghosts = phantomWords([{ start: 0.2, end: 0.6 }, { start: 2.0, end: 2.6 }], env);
  assert.deepEqual(ghosts, [{ start: 2.0, end: 2.6 }]);
});
