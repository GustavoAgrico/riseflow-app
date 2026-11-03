import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixOneArticle, fixArticleNumerals } from '../src/pipeline/transcribe/numbers.js';

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
