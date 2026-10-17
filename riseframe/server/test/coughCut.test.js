import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runFfmpeg } from '../src/pipeline/ffmpeg.js';
import {
  readPcm, soundFeatures, isNonSpeech, preciseRemovals, wordGapRanges,
  removedWordRanges, dropSlivers, phantomWords, envelopeFrom, splitBursts,
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

test('vídeo longo: tosses do fim também saem (lê o áudio em blocos, sem teto de 400)', async () => {
  // 420 "frases" (~18 min) (1,2 s de fala + 1,4 s de vão com uma tosse no meio) — mais de 30 trechos: caminho em blocos
  const unit = await wav('unidade.wav', [
    '-f', 'lavfi', '-i', `aevalsrc='${VOWEL}*between(t,0,1.2)':s=16000:d=1.2`,
    '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.5:duration=1.0:seed=1:sample_rate=16000',
    '-filter_complex', `[1]${COUGH_AF},adelay=400,apad=whole_dur=1.4[c];[0][c]concat=n=2:v=0:a=1`,
  ]);
  const N = 420; // mais que o antigo teto de 400 trechos
  const U = 2.6;
  const long = await wav('longo.wav', [
    '-stream_loop', String(N - 1), '-i', unit,
    '-f', 'lavfi', '-i', `anoisesrc=color=pink:amplitude=0.003:sample_rate=16000:d=${N * U}`,
    '-filter_complex', '[0][1]amix=inputs=2:duration=first:normalize=0',
  ]);
  const words = [];
  for (let i = 0; i < N; i++) words.push({ start: +(i * U).toFixed(2), end: +(i * U + 0.6).toFixed(2), word: 'oi' }, { start: +(i * U + 0.6).toFixed(2), end: +(i * U + 1.2).toFixed(2), word: 'gente' });
  const transcript = { segments: [{ words }] };
  const dur = N * U;
  const pauses = wordGapRanges(transcript, { minGap: 0.45, duration: dur });
  const r = await preciseRemovals(long, { pauses, transcript, breaths: true, coughs: true, duration: dur });
  assert.ok(r.noises.length >= N - 2, `${r.noises.length} tosses de ${N}`);
  const last = (N - 1) * U + 1.7;
  assert.ok(r.noises.some((x) => x.start <= last && x.end >= last), 'a última tosse foi achada');
});

// Tosse "de verdade": rajada de ar com ataque instantâneo (envelope por amostra)
const BURST = "aevalsrc='(random(0)*2-1)*0.9*min(1,t/0.008)*exp(-t/0.09)':s=16000";

test('tosse com rabicho de voz ("cof-hum") é ruído; palavras com consoante no começo, não', async () => {
  const f = async (name, args) => soundFeatures(await readPcm(await wav(name, args), 0, 2));
  const tail = await f('cofhum.wav', ['-f', 'lavfi', '-i', `${BURST}:d=0.2`, '-f', 'lavfi', '-i', `aevalsrc='0.5*${VOWEL}*sin(PI*t/0.3)':s=16000:d=0.3`,
    '-filter_complex', '[0]highpass=f=150,lowpass=f=5000[c];[c][1]concat=n=2:v=0:a=1,adelay=60']);
  assert.equal(isNonSpeech(tail), true, `cof-hum: ${JSON.stringify(tail)}`);
  const words = {
    ta: ['-f', 'lavfi', '-i', 'anoisesrc=color=white:amplitude=0.3:duration=0.015:seed=4:sample_rate=16000', '-f', 'lavfi', '-i', `aevalsrc='${VOWEL}*min(1,t/0.02)':s=16000:d=0.3`, '-filter_complex', '[0]highpass=f=2000[c];[c][1]concat=n=2:v=0:a=1,adelay=40'],
    xis: ['-f', 'lavfi', '-i', 'anoisesrc=color=white:amplitude=0.6:duration=0.12:seed=7:sample_rate=16000', '-f', 'lavfi', '-i', `aevalsrc='${VOWEL}*min(1,t/0.03)':s=16000:d=0.25`, '-filter_complex', '[0]highpass=f=3000[c];[c][1]concat=n=2:v=0:a=1,adelay=40'],
    rato: ['-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.35:duration=0.08:seed=8:sample_rate=16000', '-f', 'lavfi', '-i', `aevalsrc='${VOWEL}*min(1,t/0.02)':s=16000:d=0.3`, '-filter_complex', '[0]highpass=f=900,lowpass=f=3500[c];[c][1]concat=n=2:v=0:a=1,adelay=40'],
  };
  for (const [k, args] of Object.entries(words)) {
    const ft = await f(`${k}.wav`, args);
    assert.equal(isNonSpeech(ft), false, `${k} é palavra: ${JSON.stringify(ft)}`);
  }
});

test('crise de tosse comprida: cada rajada é medida sozinha', () => {
  // 2,4 s: três "cof" (0,5 s) separados por vales de 0,25 s que não chegam ao silêncio
  const db = new Float32Array(400).fill(-60);
  for (const [a, b] of [[50, 100], [125, 175], [200, 250]]) for (let i = a; i < b; i++) db[i] = -12;
  for (const [a, b] of [[100, 125], [175, 200]]) for (let i = a; i < b; i++) db[i] = -34;
  const parts = splitBursts({ start: 0.5, end: 2.5 }, envelopeFrom(db));
  assert.equal(parts.length, 3, JSON.stringify(parts));
  assert.ok(Math.abs(parts[0].start - 0.5) < 0.02 && Math.abs(parts[2].end - 2.5) < 0.02);
  // som contínuo continua um pedaço só
  assert.equal(splitBursts({ start: 0.5, end: 1.0 }, envelopeFrom(new Float32Array(200).fill(-12))).length, 1);
});

test('tosse com rabicho entre as frases sai do vídeo (e a fala fica)', async () => {
  const file = await wav('frase_cofhum.wav', [
    '-f', 'lavfi', '-i', `aevalsrc='${VOWEL}*between(t,0,1.2)':s=16000:d=1.9`,
    '-f', 'lavfi', '-i', `${BURST}:d=0.2`,
    '-f', 'lavfi', '-i', `aevalsrc='0.5*${VOWEL}*sin(PI*t/0.3)':s=16000:d=0.3`,
    '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono:d=0.6',
    '-f', 'lavfi', '-i', `aevalsrc='${VOWEL}*between(t,0,1.2)':s=16000:d=1.2`,
    '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.003:sample_rate=16000:d=6',
    '-filter_complex', '[1]highpass=f=150,lowpass=f=5000[b];[0][b][2][3][4]concat=n=5:v=0:a=1[s];[s][5]amix=inputs=2:duration=first:normalize=0',
  ]);
  const transcript = { segments: [{ words: [
    { start: 0, end: 0.6, word: 'hoje' }, { start: 0.6, end: 1.2, word: 'vamos' },
    { start: 3.0, end: 3.6, word: 'falar' }, { start: 3.6, end: 4.2, word: 'disso' },
  ] }] };
  const pauses = wordGapRanges(transcript, { minGap: 0.45, duration: 4.2 });
  const r = await preciseRemovals(file, { pauses, transcript, breaths: true, coughs: true, duration: 4.2 });
  assert.ok(r.noises.some((n) => n.start <= 1.95 && n.end >= 2.3), `cof-hum achado: ${JSON.stringify(r.noises)}`);
  const cut = [...r.pauses, ...r.removed];
  for (const t of [1.95, 2.1, 2.3]) assert.ok(cut.some((x) => x.start <= t && x.end >= t), `${t}s deveria sair`);
  for (const t of [1.15, 3.05]) assert.ok(!cut.some((x) => x.start <= t && x.end >= t), `${t}s é fala`);
});
