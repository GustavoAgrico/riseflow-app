import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captionCues, toSrt, toVtt, toTxt, skipMapper } from '../../shared/captionExport.js';
import { retimePieces, retimeTime } from '../src/pipeline/retime.js';

const seg = (start, words) => ({ start, end: words[words.length - 1][2], words: words.map(([word, a, b, extra]) => ({ word, start: a, end: b, ...(extra || {}) })) });

test('legenda em arquivo: cartões sem palavras cortadas/ocultas e no formato SRT/VTT/TXT', () => {
  const segs = [
    seg(0, [['então', 0, 0.4], ['eu', 0.5, 0.6, { removed: true }], ['fui', 0.7, 1.0], ['lá', 1.1, 1.4]]),
    seg(2, [['segredo', 2, 2.5, { hidden: true }]]),
    seg(3, [['olá', 3, 3.5]]),
  ];
  const cues = captionCues(segs, { maxChars: 42 });
  assert.deepEqual(cues.map((c) => c.text), ['então fui lá', 'olá']);
  const srt = toSrt(cues);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:0\d,\d{3}\nentão fui lá\n\n2\n00:00:03,000 --> /);
  assert.match(toVtt(cues), /^WEBVTT\n\n00:00:00\.000 --> /);
  assert.equal(toTxt(cues).split('\n')[1], '[00:00:03] olá');
  // sem sobreposição
  assert.ok(cues[0].end <= cues[1].start);
});

test('legenda em arquivo: tempo do vídeo final (cortes e velocidade)', () => {
  const map = skipMapper([[1, 2], [3, 4]], 2);
  assert.equal(map(0.5), 0.25);
  assert.equal(map(2.5), 0.75); // 2.5 − 1 s cortado, em 2×
  assert.equal(map(5), 1.5);
  assert.equal(map.cut(1.5), true);
  assert.equal(map.cut(2.5), false);
  const cues = captionCues([seg(0, [['a', 0, 0.5], ['b', 1.2, 1.6], ['c', 2.2, 2.6]])], { mapT: skipMapper([[1, 2]]) });
  assert.equal(cues[0].text, 'a c'); // "b" caiu no corte
  // velocidade por trecho / congelar
  const pieces = retimePieces([{ start: 2, end: 4, speed: 2 }], [{ t: 5, dur: 1 }], 8, 1);
  assert.equal(retimeTime(1, pieces), 1);
  assert.equal(retimeTime(3, pieces), 2.5);
  assert.equal(retimeTime(6, pieces), 6); // 2 + 1 (2× em 2 s) + 1 + 1 congelado + 1
});
