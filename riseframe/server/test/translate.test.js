import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retimeSegment, translateTranscript } from '../src/pipeline/translate.js';

const seg = {
  start: 1,
  end: 3,
  text: 'olá pessoal tudo bem',
  words: [
    { start: 1.2, end: 1.5, word: 'olá' },
    { start: 1.5, end: 2.0, word: 'pessoal', removed: true },
    { start: 2.0, end: 2.4, word: 'tudo' },
    { start: 2.4, end: 2.9, word: 'bem' },
  ],
};

test('retimeSegment encaixa a tradução na janela das palavras visíveis', () => {
  const out = retimeSegment(seg, 'hi everyone how are you');
  assert.equal(out.text, 'hi everyone how are you');
  assert.equal(out.words.length, 5);
  assert.equal(out.words[0].start, 1.2);
  assert.equal(out.words.at(-1).end, 2.9);
  for (let i = 1; i < out.words.length; i++) assert.ok(out.words[i].start >= out.words[i - 1].start);
  // palavra mais longa recebe fatia maior
  const len = (w) => w.end - w.start;
  assert.ok(len(out.words[1]) > len(out.words[0]));
});

test('tradução vazia gera segmento sem palavras', () => {
  assert.deepEqual(retimeSegment(seg, '  ').words, []);
});

test('sem chave da Anthropic a tradução recusa (o pipeline mantém o original)', async () => {
  await assert.rejects(translateTranscript({ segments: [seg] }, 'en', {}), /chave/);
  await assert.rejects(translateTranscript({ segments: [seg] }, 'xx', { anthropicKey: 'k' }), /não suportado/);
});
