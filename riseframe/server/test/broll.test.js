import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractThemes, translateQuery, pickBrollMoments } from '../src/pipeline/analyze.js';
import { pickBestVideoFile } from '../src/pipeline/broll.js';

test('translateQuery: mapeia pt→en e faz passthrough', () => {
  assert.equal(translateQuery('vídeo'), 'video');
  assert.equal(translateQuery('CIDADE'), 'city');
  assert.equal(translateQuery('resultado'), 'success growth');
  assert.equal(translateQuery('xyzabc'), 'xyzabc'); // desconhecido → passthrough
});

test('extractThemes: ignora stopwords e ordena por frequência', () => {
  const themes = extractThemes('cidade cidade cidade natureza natureza então a gente aqui');
  assert.equal(themes[0].term, 'cidade');
  assert.equal(themes[0].count, 3);
  assert.ok(!themes.some((t) => t.term === 'então'), 'stopword não vira tema');
});

test('pickBrollMoments: pula intro, espaça, não repete query e respeita o limite', () => {
  const segments = [];
  for (let i = 0; i < 12; i++) {
    segments.push({ start: i * 2.5, end: i * 2.5 + 2, text: 'cidade natureza mercado tecnologia', words: [] });
  }
  const themes = extractThemes('cidade natureza mercado tecnologia');
  const moments = pickBrollMoments(segments, themes, 30, { brollEverySec: 7, brollMax: 3, brollSkipIntro: 2 });

  assert.ok(moments.length <= 3, 'respeita brollMax');
  assert.ok(moments.every((m) => m.start >= 2), 'nada na introdução (<2s)');
  assert.ok(moments.every((m) => m.query && !/[áàâãéêíóôõúç]/i.test(m.query)), 'query em inglês (traduzida)');
  for (let i = 1; i < moments.length; i++) {
    assert.ok(moments[i].start - moments[i - 1].start >= 6.9, 'momentos espaçados');
    assert.notEqual(moments[i].query, moments[i - 1].query, 'sem query repetida em sequência');
  }
});

test('pickBestVideoFile: escolhe mp4 próximo do alvo sem exagerar na resolução', () => {
  const files = [
    { file_type: 'video/mp4', link: 'a', width: 640, height: 360 },
    { file_type: 'video/mp4', link: 'b', width: 1920, height: 1080 },
    { file_type: 'video/mp4', link: 'c', width: 3840, height: 2160 },
    { file_type: 'image/jpeg', link: 'x', width: 1920, height: 1080 },
  ];
  const best = pickBestVideoFile(files, 1080);
  assert.equal(best.link, 'b', 'pega 1080p (alvo), não o 4K nem o 360p');
  assert.equal(pickBestVideoFile([], 1080), null);
  assert.equal(pickBestVideoFile([{ file_type: 'image/jpeg', link: 'x', height: 1080 }], 1080), null);
});
