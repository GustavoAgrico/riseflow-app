import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAss } from '../src/pipeline/captions.js';
import { stripPunct, timeSegments, layoutCaption, captionTiming } from '../../shared/captionKeyword.js';

const meta = { width: 1080, height: 1920 };
const seg = (text, t0, step = 0.4) => {
  const words = text.split(' ').map((w, i) => ({ word: w, start: +(t0 + i * step).toFixed(3), end: +(t0 + i * step + step * 0.8).toFixed(3) }));
  return { start: words[0].start, end: words[words.length - 1].end, text, words };
};
const toSec = (h, m, s) => Number(h) * 3600 + Number(m) * 60 + Number(s);
/** [início, fim, texto] de cada evento de texto (sem as tags) */
const events = (ass) => [...ass.matchAll(/^Dialogue: \d+,(\d+):(\d+):([\d.]+),(\d+):(\d+):([\d.]+),Rise,[^,]*,\d+,\d+,\d+,,(.*)$/gm)]
  .map((m) => [toSec(m[1], m[2], m[3]), toSec(m[4], m[5], m[6]), m[7].replace(/\{[^}]*\}/g, '')]);

test('remover pontuação: tira vírgulas, pontos e aspas, mantém hífen, apóstrofo e números', () => {
  assert.equal(stripPunct('olá,'), 'olá');
  assert.equal(stripPunct('"Bem-vindo!"'), 'Bem-vindo');
  assert.equal(stripPunct('d’água.'), 'd’água');
  assert.equal(stripPunct('R$10,50.'), 'R$10,50');
  assert.equal(stripPunct('3.000…'), '3.000');
  assert.equal(stripPunct('—'), '');
  const ass = buildAss([seg('Oi, tudo bem? Sim.', 0)], meta, { template: 'clean', noPunct: true, animation: 'none' });
  const text = events(ass).map((e) => e[2]).join(' ');
  assert.doesNotMatch(text, /[,?.]/);
  assert.match(text, /Oi tudo bem Sim/i);
});

test('duração mínima: frase curta fica na tela pelo menos N s, sem invadir a próxima', () => {
  const segs = [seg('oi', 0), seg('tudo bem', 1.5), seg('até mais', 10)];
  const t = timeSegments(segs, { minDur: 3, gap: 0 });
  assert.equal(t[0].end, 1.5, 'para na próxima frase');
  assert.ok(Math.abs(t[1].end - 4.5) < 1e-6, 'avança na pausa até 3 s');
  const ass = buildAss(segs, meta, { template: 'clean', minDuration: 3, animation: 'none' });
  const ev = events(ass).filter(([s]) => s >= 1.4 && s < 2);
  assert.ok(ev.length && ev.every(([, e]) => e >= 4.49), JSON.stringify(ev));
});

test('intervalo entre legendas: cada cartão some antes do próximo entrar', () => {
  const long = seg('esta é uma frase bem comprida que vai virar vários cartões de legenda na tela', 0, 0.3);
  const cards = layoutCaption(long.words, { lines: 1, maxChars: 14, segEnd: long.end, gap: 0.1 });
  for (let i = 0; i + 1 < cards.length; i++) assert.ok(cards[i + 1].words[0].start - cards[i].end >= 0.099);
  const ass = buildAss([long, seg('outra frase', long.end + 0.02)], meta, { template: 'clean', lines: 1, maxChars: 14, gap: 0.1, animation: 'none' });
  const ev = events(ass).sort((a, b) => a[0] - b[0]);
  for (let i = 0; i + 1 < ev.length; i++) {
    if (ev[i + 1][0] > ev[i][0] + 0.01) assert.ok(ev[i + 1][0] - ev[i][1] >= 0.08, `${ev[i]} → ${ev[i + 1]}`);
  }
  // sem intervalo: os cartões emendam (como antes)
  const ev0 = events(buildAss([long], meta, { template: 'clean', lines: 1, maxChars: 14, animation: 'none' })).sort((a, b) => a[0] - b[0]);
  assert.ok(ev0.slice(0, -1).some((e, i) => Math.abs(ev0[i + 1][0] - e[1]) < 0.02));
});

test('opções do job viram números seguros', () => {
  assert.deepEqual(captionTiming({ captionMinDuration: 9, captionGap: -1, captionNoPunct: true }), { minDur: 5, gap: 0, noPunct: true });
  assert.deepEqual(captionTiming({}), { minDur: 0, gap: 0, noPunct: false });
});
