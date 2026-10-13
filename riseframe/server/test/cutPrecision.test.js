import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runFfmpeg, probeSummary } from '../src/pipeline/ffmpeg.js';
import { remuxByKeepSegments, audioBounds } from '../src/pipeline/timeline.js';
import {
  envelopeFrom, fitCutEdges, trimWordsToSound, edgePads, preciseRemovals, readPcm, protectQuietSpeech,
} from '../src/pipeline/cutRefine.js';
import { plausibleRemovals } from '../src/pipeline/cleanupLLM.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rf-precisao-'));
after(() => fs.rm(tmp, { recursive: true, force: true }));

/** Envelope sintético: dB por quadro de 10 ms a partir de trechos [start, end, dB]. */
function env(duration, parts, base = -70) {
  const db = new Float32Array(Math.round(duration / 0.01)).fill(base);
  for (const [s, e, v] of parts) for (let i = Math.round(s / 0.01); i < Math.round(e / 0.01); i++) db[i] = v;
  return envelopeFrom(db);
}

test('borda da pausa avança no silêncio até encostar no som (sem a sobra de 0,4–0,8 s)', () => {
  // fala até 1.0 · silêncio · fala de 2.0. A pausa chegou "encolhida" (a transcrição esticou
  // a palavra e as proteções deixaram folga): 1.4–1.6.
  const e = env(3, [[0, 1.0, -12], [2.0, 3, -12]]);
  const [r] = fitCutEdges([{ start: 1.4, end: 1.6 }], e, null, { tail: 0.06, preroll: 0.06 });
  assert.ok(r.start >= 1.0 + 0.06 - 1e-6 && r.start <= 1.1, `começa logo depois da fala (${r.start})`);
  assert.ok(r.end <= 2.0 - 0.06 + 1e-6 && r.end >= 1.9, `termina logo antes da fala (${r.end})`);
  // cada força deixa um respiro diferente
  const suave = fitCutEdges([{ start: 1.4, end: 1.6 }], e, null, edgePads('suave'))[0];
  assert.ok(suave.end - suave.start < r.end - r.start);
});

test('borda que caiu no som recua (fim de palavra baixinho e ataque ficam)', () => {
  const e = env(3, [[0.2, 1.0, -12], [1.0, 1.18, -45], [1.85, 2.0, -48], [2.0, 2.8, -12]]);
  const [r] = fitCutEdges([{ start: 1.05, end: 1.95 }], e, null, { tail: 0.04, preroll: 0.06 });
  assert.ok(r.start >= 1.18 + 0.04 - 1e-6, `preserva o "s" final (${r.start})`);
  assert.ok(r.end <= 1.85 - 0.06 + 1e-6, `preserva o ataque (${r.end})`);
});

test('com "cortar respirações": a inspiração sai e o começo da palavra fica', () => {
  // fala até 1.0 · inspiração (sem voz) 1.5–2.0 · voz de 2.0
  const e = env(3, [[0, 1.0, -12], [1.5, 2.0, -38], [2.0, 3, -12]]);
  const v = env(3, [[0, 1.0, -14], [2.0, 3, -14]], -80);
  const [comum] = fitCutEdges([{ start: 1.2, end: 1.4 }], e, v, { breaths: false });
  const [resp] = fitCutEdges([{ start: 1.2, end: 1.4 }], e, v, { breaths: true, voiceLead: 0.14 });
  assert.ok(comum.end <= 1.5, `sem a opção, para antes da inspiração (${comum.end})`);
  assert.ok(resp.end >= 1.8 && resp.end <= 2.0 - 0.14 + 1e-6, `corta a inspiração até perto da voz (${resp.end})`);
});

test('palavra esticada pela transcrição só protege o trecho com som (com voz)', () => {
  // "vendas" 0–2.0 na transcrição; som de verdade 0–0.8; inspiração sem voz 1.7–1.95
  const e = env(3, [[0, 0.8, -12], [1.7, 1.95, -35]]);
  const v = env(3, [[0.05, 0.75, -14]], -80);
  const [w] = trimWordsToSound([{ start: 0, end: 2.0 }], e, v);
  assert.ok(w.end <= 0.9 && w.end >= 0.8, `fim ${w.end}`);
  // palavra com som do começo ao fim fica igual
  const [w2] = trimWordsToSound([{ start: 0.1, end: 0.7 }], e, v);
  assert.deepEqual([w2.start, w2.end], [0.1, 0.7]);
});

test('áudio real: transcrição esticando a palavra por cima da pausa → a pausa sai mesmo assim', async () => {
  const VOWEL = '0.3*(sin(2*PI*130*t)+0.7*sin(2*PI*260*t)+0.5*sin(2*PI*390*t)+0.3*sin(2*PI*520*t))';
  const wav = path.join(tmp, 'esticada.wav');
  await runFfmpeg(['-f', 'lavfi', '-i', `aevalsrc='${VOWEL}*(lt(t,1.2)+gte(t,2.3))':s=16000:d=3.4`,
    '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.003:sample_rate=16000:d=3.4',
    '-filter_complex', '[0][1]amix=inputs=2:normalize=0', '-y', wav], { label: 'teste' });
  // a transcrição diz que "agora" vai até 2.25 (a pausa real é 1.2–2.3)
  const transcript = { segments: [{ words: [{ start: 0.1, end: 0.6, word: 'vamos' }, { start: 0.6, end: 2.25, word: 'agora' }, { start: 2.3, end: 3.3, word: 'falar' }] }] };
  const pauses = [{ start: 1.25, end: 2.25 }]; // o detector de silêncio achou a pausa
  const r = await preciseRemovals(wav, { pauses, transcript, breaths: true, duration: 3.4 });
  assert.equal(r.pauses.length, 1);
  const [c] = r.pauses;
  assert.ok(c.start <= 1.35 && c.start >= 1.2, `começo ${c.start}`);
  assert.ok(c.end >= 2.15 && c.end <= 2.3, `fim ${c.end}`);
});

test('emenda: o som corta no ponto exato (o pedaço que o ajuste ao quadro traz de volta fica mudo)', async () => {
  const src = path.join(tmp, 'tom.mp4');
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=3:sample_rate=16000',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', '-y', src], { label: 'teste' });
  const meta = await probeSummary(src);
  // vídeo mantém 0–1 s e 2–3 s (no quadro); o som de verdade só até 0,9 s e a partir de 2,1 s
  const keep = [{ start: 0, end: 1 }, { start: 2, end: 3 }];
  const audioKeep = [{ start: 0, end: 0.9 }, { start: 2.1, end: 3 }];
  assert.deepEqual(audioBounds({ start: 2, end: 3 }, audioKeep), { aStart: 2.1, aEnd: 3 });
  assert.deepEqual(audioBounds({ start: 2, end: 3 }, null), { aStart: 2, aEnd: 3 });
  const r = await remuxByKeepSegments(src, tmp, meta, keep, () => {}, 'gate', { audioKeep });
  const x = await readPcm(r.output, 0, 2.1, 16000);
  const peak = (a, b) => { let m = 0; for (let i = Math.round(a * 16000); i < Math.round(b * 16000); i++) m = Math.max(m, Math.abs(x[i])); return m; };
  assert.ok(peak(0.2, 0.8) > 0.05, 'som mantido');
  assert.ok(peak(0.93, 0.98) < 0.002, 'fim do 1º trecho (0,9–1 s) mudo');
  assert.ok(peak(1.02, 1.08) < 0.002, 'começo do 2º trecho (2–2,1 s) mudo');
  assert.ok(peak(1.2, 1.8) > 0.05, 'som volta depois');
  const out = await probeSummary(r.output);
  assert.ok(Math.abs(out.duration - 2) < 0.1, 'duração continua a do vídeo (sem perder sincronia)');
});

test('limpeza por IA: só passa o que tem cara de erro de fala', () => {
  const f = (t) => t.split(' ').map((word) => ({ word }));
  const pick = (t, idx) => {
    const fl = f(t);
    return [...plausibleRemovals(fl, new Set(idx))].sort((a, b) => a - b).map((i) => fl[i].word).join(' ');
  };
  // frase refeita, correção com marcador, muletas, pedaço de palavra: passam
  assert.equal(pick('hoje eu vou mostrar três hoje eu vou te mostrar as três dicas', [0, 1, 2, 3, 4]), 'hoje eu vou mostrar três');
  assert.equal(pick('custa 50, digo, 60 reais', [1, 2]), '50, digo,');
  assert.equal(pick('eu acho que hmm isso é importante', [3]), 'hmm');
  assert.equal(pick('eu fui no merca eu fui no supermercado', [0, 1, 2, 3]), 'eu fui no merca');
  // palavras com sentido que não se repetem: a IA errou → nada sai
  assert.equal(pick('eu acho que isso é muito importante para você', [5, 6]), '');
  assert.equal(pick('a gente vai falar sobre vendas e marketing hoje', [6, 7]), '');
});

test('micro-silêncio dentro da palavra ("ven-das") não vira fim de palavra', () => {
  // palavra baixinha: "ven" 1.0–1.2 · consoante "d" quieta 1.2–1.25 · "das" 1.25–1.35 · silêncio
  const e = env(3, [[0.2, 1.0, -12], [1.0, 1.2, -42], [1.25, 1.35, -45], [2.2, 3, -12]]);
  // a pausa chegou começando no meio da consoante
  const [r] = fitCutEdges([{ start: 1.21, end: 2.0 }], e, null, { tail: 0.09, preroll: 0.07 });
  assert.ok(r.start >= 1.35 + 0.05, `a última sílaba fica (${r.start})`);
});

test('fala baixinha que a transcrição não escreveu: com tom de voz fica; sem tom (respiração) sai', () => {
  const e = env(4, [[0, 1, -10], [1.5, 1.8, -40], [2.5, 2.8, -40], [3.5, 4, -10]]);
  // "tom de voz" só no trecho 1.5–1.8 (palavra sussurrada); 2.5–2.8 é respiração
  const voicing = (a, b) => (a < 1.85 && b > 1.45 ? 0.9 : 0);
  const out = protectQuietSpeech([{ start: 1.1, end: 3.4 }], e, voicing);
  const covers = (t) => out.some((x) => x.start <= t && x.end >= t);
  assert.ok(!covers(1.6) && !covers(1.75), 'palavra baixinha fica');
  assert.ok(covers(2.6), 'respiração sai');
  // consoante no meio (micro-silêncio) não divide a palavra
  const e2 = env(4, [[1.5, 1.62, -40], [1.68, 1.8, -40]]);
  const out2 = protectQuietSpeech([{ start: 1.1, end: 3.4 }], e2, (a, b) => (a < 1.85 && b > 1.45 ? 0.9 : 0));
  assert.ok(!out2.some((x) => x.start <= 1.65 && x.end >= 1.65));
});
