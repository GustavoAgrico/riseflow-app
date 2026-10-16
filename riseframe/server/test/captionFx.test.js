import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAss } from '../src/pipeline/captions.js';

const words = 'isso aqui é um teste de legenda que entra no b-roll e depois volta ao normal'.split(' ')
  .map((w, i) => ({ word: w, start: i * 0.5, end: i * 0.5 + 0.4 }));
const segments = [{ start: 0, end: words.length * 0.5, text: words.map((w) => w.word).join(' '), words }];
const meta = { width: 1080, height: 1920 };
/** [início (s), y do \pos] de cada evento de texto */
const events = (ass) => [...ass.matchAll(/^Dialogue: \d+,(\d+):(\d+):([\d.]+),[^,]*,Rise,.*?\\pos\((\d+),(\d+)\)/gm)]
  .map((m) => [Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]), Number(m[5])]);

test('tela dividida com B-roll: a legenda vai para o meio só durante o B-roll', () => {
  const ass = buildAss(segments, meta, { template: 'clean', centerWindows: [{ start: 2, end: 4.5 }] });
  const ev = events(ass);
  const during = ev.filter(([t]) => t >= 2 && t < 4.5);
  const outside = ev.filter(([t]) => t < 1.9 || t >= 4.6);
  assert.ok(during.length && outside.length);
  for (const [, y] of during) assert.ok(Math.abs(y - 960) < 160, `no meio: ${y}`);
  for (const [, y] of outside) assert.ok(y > 1200, `embaixo: ${y}`);
  // nenhum cartão atravessa a entrada do B-roll
  assert.ok(ev.some(([t]) => Math.abs(t - 2) < 0.01), 'um cartão começa junto com o B-roll');
});

test('posição geral cede ao meio no B-roll; frase movida à mão vence a centralização', () => {
  // posição geral (todas as legendas): durante o B-roll em tela dividida, a legenda vai para o meio
  const geral = buildAss(segments, meta, { template: 'clean', posX: 0.5, posY: 0.2, centerWindows: [{ start: 0, end: 99 }] });
  for (const [, y] of events(geral)) assert.ok(y > 700, `no meio durante o B-roll: ${y}`);
  // frase arrastada para um lugar específico: fica onde o usuário pôs
  const movidas = segments.map((s) => ({ ...s, words: (s.words || []).map((w) => ({ ...w, px: 0.5, py: 0.2 })) }));
  const ass = buildAss(movidas, meta, { template: 'clean', centerWindows: [{ start: 0, end: 99 }] });
  for (const [, y] of events(ass)) assert.ok(y < 600, `fica onde o usuário pôs: ${y}`);
});

test('espaçamento das letras e sombra personalizada / sem sombra', () => {
  const base = buildAss(segments, meta, { template: 'clean' });
  const style = (ass) => ass.split('\n').find((l) => l.startsWith('Style: Rise,')).split(',');
  // Format: ..., ScaleX(11), ScaleY(12), Spacing(13), Angle(14), BorderStyle(15), Outline(16), Shadow(17)
  assert.equal(Number(style(base)[13]), 0);
  const spaced = buildAss(segments, meta, { template: 'clean', letterSpacing: 0.1 });
  assert.ok(Number(style(spaced)[13]) > 5, 'espaçamento em px');
  const on = style(buildAss(segments, meta, { template: 'clean', shadowMode: 'on', shadowSize: 2, shadowOpacity: 1 }));
  assert.ok(Number(on[17]) > Number(style(base)[17]), 'sombra maior');
  assert.match(on[6], /^&H00000000$/, 'sombra opaca');
  const off = style(buildAss(segments, meta, { template: 'shadow3d', shadowMode: 'off' }));
  assert.equal(Number(off[17]), 0);
  assert.doesNotMatch(buildAss(segments, meta, { template: 'shadow3d', shadowMode: 'off' }), /\\xshad/, 'sem a sombra 3D do estilo');
});
