import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupIntoPhrases, classifyNarrative } from '../src/pipeline/narrative.js';

const w = (start, end, word) => ({ start, end, word });

test('groupIntoPhrases: quebra em pontuação de fim de frase', () => {
  const words = [w(0, 0.3, 'isso'), w(0.3, 0.6, 'muda'), w(0.6, 0.9, 'tudo.'), w(1.0, 1.3, 'agora'), w(1.3, 1.6, 'vamos')];
  const segs = groupIntoPhrases(words, { maxWords: 10, pauseGap: 5 });
  assert.equal(segs.length, 2, 'a pontuação encerra a 1ª frase');
  assert.equal(segs[0].text, 'isso muda tudo.');
});

test('groupIntoPhrases: quebra em pausa e respeita o máximo de palavras', () => {
  const pausa = [w(0, 0.3, 'um'), w(0.3, 0.6, 'dois'), w(2.0, 2.3, 'tres')]; // gap 1.4s
  assert.equal(groupIntoPhrases(pausa, { pauseGap: 0.45 }).length, 2, 'pausa quebra a frase');
  const muitas = Array.from({ length: 14 }, (_, i) => w(i * 0.2, i * 0.2 + 0.15, 'x'));
  const segs = groupIntoPhrases(muitas, { maxWords: 6, maxDur: 99, pauseGap: 99 });
  assert.ok(segs.every((s) => s.words.length <= 6), 'nenhuma frase passa do máximo');
});

test('classifyNarrative: marca gancho na abertura e CTA por palavra-chave', () => {
  const segs = [
    { start: 0, end: 2, text: 'você sabia disso', words: [w(0, 2, 'você')] },
    { start: 2, end: 8, text: 'o processo é assim', words: [w(2, 8, 'processo')] },
    { start: 8, end: 12, text: 'segue e comenta aqui', words: [w(8, 9, 'segue'), w(9, 10, 'comenta')] },
  ];
  const r = classifyNarrative(segs, 12);
  assert.equal(r.roles[0], 'hook', '1ª frase é gancho');
  assert.equal(r.roles[2], 'cta', 'frase com "segue/comenta" é CTA');
  assert.ok(r.hasHook && r.hasCta);
});

test('classifyNarrative: elege um clímax de ênfase na metade final', () => {
  const segs = [
    { start: 0, end: 3, text: 'abertura', words: [w(0, 3, 'abertura')] },
    { start: 3, end: 6, text: 'texto comum', words: [w(3, 6, 'comum')] },
    { start: 7, end: 9, text: 'esse é o maior segredo que ninguém conta', words: [w(7, 9, 'segredo')] },
  ];
  const r = classifyNarrative(segs, 9);
  assert.equal(r.roles[2], 'climax', 'a frase de mais ênfase no fim vira clímax');
});
