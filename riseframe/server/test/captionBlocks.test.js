import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remapTranscript } from '../src/pipeline/timeline.js';
import { visibleCaptions } from '../src/pipeline/index.js';

const w = (start, word, extra = {}) => ({ start, end: start + 0.3, word, ...extra });

test('remapTranscript: frases não atravessam os blocos que o usuário separou', () => {
  // dois blocos curtos e colados: sem a marcação de bloco, virariam uma frase só
  const t = { segments: [{ start: 0, end: 0.7, words: [w(0, 'olá'), w(0.35, 'gente')] }, { start: 0.7, end: 1.4, words: [w(0.7, 'tudo'), w(1.05, 'bem')] }] };
  const out = remapTranscript(t, [{ start: 0, end: 2 }]);
  assert.deepEqual(out.segments.map((s) => s.text), ['olá gente', 'tudo bem']);
});

test('remapTranscript + visibleCaptions: legenda oculta some do texto, mas a fala fica', () => {
  const t = { segments: [{ start: 0, end: 0.7, words: [w(0, 'olá', { hidden: true }), w(0.35, 'gente', { hidden: true })] }, { start: 0.7, end: 1.4, words: [w(0.7, 'tudo'), w(1.05, 'bem')] }] };
  const remapped = remapTranscript(t, [{ start: 0, end: 2 }]);
  assert.equal(remapped.segments.length, 2, 'a fala oculta continua na timeline');
  const vis = visibleCaptions(remapped);
  assert.deepEqual(vis.segments.map((s) => s.text), ['tudo bem']);
});

test('visibleCaptions: bloco com parte oculta é reduzido às palavras visíveis', () => {
  const vis = visibleCaptions({ segments: [{ start: 0, end: 1, text: 'a b c', words: [w(0, 'a'), w(0.3, 'b', { hidden: true }), w(0.6, 'c')] }] });
  assert.equal(vis.segments[0].text, 'a c');
  assert.equal(vis.segments[0].words.length, 2);
});

test('remapUserMedia: mídias da timeline original seguem os cortes', async () => {
  const { remapUserMedia } = await import('../src/pipeline/index.js');
  const keep = [{ start: 0, end: 2 }, { start: 4, end: 10 }]; // cortou 2–4 s
  const out = remapUserMedia([
    { key: 'a', start: 5, duration: 2 }, // depois do corte: volta 2 s
    { key: 'b', start: 1, duration: 4 }, // atravessa o corte: perde 2 s de duração
    { key: 'c', start: 2.5, duration: 1 }, // inteira dentro do corte: sai
  ], keep);
  assert.deepEqual(out.map((m) => [m.key, m.start, m.duration]), [['a', 3, 2], ['b', 1, 2]]);
});

test('legenda movida (cs/ce): aparece no tempo dela, a fala continua no tempo da palavra', () => {
  // bloco falado em 1,0–1,6 s, mas a legenda foi arrastada para 2,0–3,0 s
  const t = { segments: [{ start: 1, end: 1.6, words: [w(1, 'olá', { cs: 2, ce: 2.5 }), w(1.3, 'gente', { cs: 2.5, ce: 3 })] }] };
  const remapped = remapTranscript(t, [{ start: 0, end: 10 }]);
  assert.equal(remapped.segments[0].words[0].start, 1, 'a fala não mudou de lugar');
  const vis = visibleCaptions(remapped);
  assert.deepEqual(vis.segments.map((s) => [s.text, s.start, s.end]), [['olá gente', 2, 3]]);
  assert.equal(vis.segments[0].words[0].cs, undefined, 'cs/ce viram o próprio tempo da legenda');
});

test('legenda movida + corte antes dela: o tempo da legenda segue o corte', () => {
  const t = { segments: [{ start: 5, end: 5.6, words: [w(5, 'oi', { cs: 6, ce: 6.4 }), w(5.3, 'tchau', { cs: 6.4, ce: 7 })] }] };
  const remapped = remapTranscript(t, [{ start: 0, end: 2 }, { start: 4, end: 10 }]); // cortou 2–4 s
  const vis = visibleCaptions(remapped);
  assert.deepEqual([vis.segments[0].start, vis.segments[0].end], [4, 5]);
});
