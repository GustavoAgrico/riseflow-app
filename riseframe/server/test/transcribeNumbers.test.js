import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixOneArticle, fixArticleNumerals, mergePercentWords, fixPercents } from '../src/pipeline/transcribe/numbers.js';

const fix = (s) => fixOneArticle(s.split(' ')).join(' ');

test('"1" do artigo volta a ser "um"/"uma" (com o gênero e a maiúscula do começo da frase)', () => {
  assert.equal(fix('1 dia eu percebi isso'), 'Um dia eu percebi isso');
  assert.equal(fix('foi 1 vez só'), 'foi uma vez só');
  assert.equal(fix('tem 1 coisa importante'), 'tem uma coisa importante');
  assert.equal(fix('ele é 1 cara legal'), 'ele é um cara legal');
  assert.equal(fix('é 1 problema sério'), 'é um problema sério');
  assert.equal(fix('1 boa ideia'), 'Uma boa ideia');
  assert.equal(fix('1 grande empresa'), 'Uma grande empresa');
  assert.equal(fix('mais 1 vez'), 'mais uma vez');
  assert.equal(fix('fiz 1 vídeo novo. 1 semana depois'), 'fiz um vídeo novo. Uma semana depois');
  assert.equal(fix('criei 1 ação'), 'criei uma ação');
});

test('número de verdade continua "1"', () => {
  for (const s of ['o número 1 do Brasil', 'de 1 a 10 qual nota', 'ganhei 1 milhão de reais', 'custa R$ 1 só', '1, 2, 3 e já',
    'passo 1 abrir o app', '1 ou 2 vezes', '1 por cento', '1 contra 1', 'top 1 do ranking', '2 mais 1 dá 3', 'custa 1 real']) {
    assert.equal(fix(s), s, s);
  }
});

test('transcrição inteira: só em português, troca palavra e texto da frase, mantém os tempos', () => {
  const t = { language: 'pt', text: 'foi 1 vez', segments: [{ start: 0, end: 1, text: 'foi 1 vez', words: [{ word: 'foi', start: 0, end: 0.3 }, { word: '1', start: 0.3, end: 0.5 }, { word: 'vez', start: 0.5, end: 1 }] }] };
  const out = fixArticleNumerals(t);
  assert.equal(out.segments[0].words[1].word, 'uma');
  assert.equal(out.segments[0].words[1].start, 0.3);
  assert.equal(out.segments[0].text, 'foi uma vez');
  assert.equal(out.text, 'foi uma vez');
  const en = { ...t, language: 'english' };
  assert.equal(fixArticleNumerals(en), en, 'inglês fica como veio');
  assert.equal(fixArticleNumerals({ ...t, language: 'en' }).segments[0].words[1].word, '1');
  assert.equal(fixArticleNumerals({ ...t, language: 'portuguese' }).segments[0].words[1].word, 'uma');
});

// ─── porcentagem ("81 por 100" → "81%") ───

const W = (...ws) => ws.map((word, i) => ({ word, start: i * 0.4, end: i * 0.4 + 0.3 }));

test('porcentagem: "81 por 100", "por cento", "porcento" e "%" viram "81%"', () => {
  for (const ws of [['a', '81', 'por', '100.'], ['a', '81', 'por', 'cento.'], ['a', '81', 'porcento.'], ['a', '81', '%.']]) {
    const out = mergePercentWords(W(...ws));
    assert.deepEqual(out.map((w) => w.word), ['a', '81%.'], ws.join(' '));
    assert.equal(out[1].start, 0.4);
    assert.equal(out[1].end, W(...ws)[ws.length - 1].end, 'tempo vai até o fim de "100"/"cento"');
  }
  assert.deepEqual(mergePercentWords(W('cresceu', '12,5', 'por', 'cento')).map((w) => w.word), ['cresceu', '12,5%']);
});

test('porcentagem: o "1" solto do "oitenta e um" sai (o caso do print: "a 1 81 por 100.")', () => {
  const out = mergePercentWords(W('a', '1', '81', 'por', '100.'));
  assert.deepEqual(out.map((w) => w.word), ['a', '81%.']);
  assert.equal(out[1].start, 0.4, 'o tempo do "1" passa para o número');
  // número de verdade não muda: "1 vez", "passo 1 de 10", "100 pessoas"
  assert.deepEqual(mergePercentWords(W('1', '15', 'pessoas')).map((w) => w.word), ['1', '15', 'pessoas']);
  assert.deepEqual(mergePercentWords(W('por', '100', 'reais')).map((w) => w.word), ['por', '100', 'reais']);
  assert.deepEqual(mergePercentWords(W('vendi', '100', 'por', 'dia')).map((w) => w.word), ['vendi', '100', 'por', 'dia']);
});

test('porcentagem: só em português, frase e texto atualizados', () => {
  const t = { language: 'pt', text: 'a 1 81 por 100.', segments: [{ start: 0, end: 2, text: 'a 1 81 por 100.', words: W('a', '1', '81', 'por', '100.') }] };
  const f = fixPercents(t);
  assert.equal(f.segments[0].text, 'a 81%.');
  assert.equal(f.text, 'a 81%.');
  assert.equal(fixPercents({ ...t, language: 'en' }).segments[0].text, 'a 1 81 por 100.');
});
