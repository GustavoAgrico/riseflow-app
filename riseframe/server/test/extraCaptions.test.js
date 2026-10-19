import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanExtraCaptions, mergeExtraCaptions, extraCaptionSegment } from '../../shared/extraCaptions.js';
import { withExtraCaptions } from '../src/pipeline/index.js';
import { remapTime } from '../src/pipeline/timeline.js';

const seg = (start, end, ws) => ({ start, end, text: ws.map((w) => w[0]).join(' '), words: ws.map(([word, s, e]) => ({ word, start: s, end: e })) });

test('limpa as legendas adicionadas: texto, tempos válidos e teto', () => {
  const out = cleanExtraCaptions([
    { text: '  Olá   mundo ', start: 1, end: 3, key: 'x1' },
    { text: '', start: 1, end: 3 },
    { text: 'curta', start: 1, end: 1.1 },
    { text: 'negativa', start: -1, end: 2 },
    { text: 'nan', start: 'a', end: 2 },
    null,
  ]);
  assert.deepEqual(out, [{ text: 'Olá mundo', start: 1, end: 3 }]);
  assert.equal(cleanExtraCaptions(Array.from({ length: 300 }, () => ({ text: 'a', start: 0, end: 1 }))).length, 200);
  assert.deepEqual(cleanExtraCaptions('x'), []);
});

test('legenda adicionada vira segmento com as palavras dividindo o tempo', () => {
  const s = extraCaptionSegment({ text: 'eu sei disso', start: 2, end: 3.5 });
  assert.equal(s.words.length, 3);
  assert.deepEqual(s.words.map((w) => [w.start, w.end]), [[2, 2.5], [2.5, 3], [3, 3.5]]);
});

test('onde há legenda adicionada ela vale: a fala embaixo dela não aparece', () => {
  const speech = [seg(0, 2, [['a', 0, 0.5], ['b', 0.5, 1], ['c', 1, 1.5], ['d', 1.5, 2]]), seg(3, 4, [['e', 3, 4]])];
  const extra = [{ text: 'minha legenda', start: 0.9, end: 2.2 }];
  // render: tira as palavras cobertas
  const r = mergeExtraCaptions(speech, extra, { drop: true });
  assert.deepEqual(r.map((s) => s.text), ['a b', 'minha legenda', 'e']);
  assert.equal(r[0].end, 1);
  // prévia: só marca como removidas (o editor continua com elas)
  const p = mergeExtraCaptions(speech, extra);
  assert.deepEqual(p[0].words.map((w) => !!w.removed), [false, false, true, true]);
  // sem legendas adicionadas: nada muda
  assert.equal(mergeExtraCaptions(speech, []), speech);
});

test('render: legendas adicionadas entram na transcrição queimada, no tempo do vídeo cortado', () => {
  const keep = [{ start: 0, end: 2 }, { start: 5, end: 10 }]; // 2–5 s cortados
  const extras = [{ text: 'depois do corte', start: 6, end: 7 }, { text: 'dentro do corte', start: 2.5, end: 4.5 }]
    .map((c) => ({ ...c, start: remapTime(c.start, keep), end: remapTime(c.end, keep) }))
    .filter((c) => c.end - c.start >= 0.2);
  const tr = withExtraCaptions({ language: 'pt', segments: [seg(0, 1, [['oi', 0, 1]])] }, extras);
  assert.deepEqual(tr.segments.map((s) => [s.text, s.start, s.end]), [['oi', 0, 1], ['depois do corte', 3, 4]]);
  assert.equal(tr.language, 'pt');
  const same = { segments: [] };
  assert.equal(withExtraCaptions(same, []), same);
});
