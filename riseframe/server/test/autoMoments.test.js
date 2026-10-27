import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestSfx, suggestMotions, momentOf, sfxFor } from '../../shared/autoMoments.js';

// frase com palavras de 0,35 s cada
const mk = (t0, text) => {
  let t = t0;
  const words = text.split(' ').map((w) => { const o = { start: +t.toFixed(2), end: +(t + 0.3).toFixed(2), word: w }; t += 0.35; return o; });
  return { start: t0, end: t, words };
};
const SEGS = [
  mk(0.2, 'Olha esse erro que quase todo mundo comete'),
  mk(3.5, 'eu faturei R$ 5000 em 30 dias'),
  mk(7, 'e sabe por quê?'),
  mk(9.5, 'porque eu consegui um resultado incrível'),
  mk(14, 'não faça isso nunca'),
  mk(18, 'são 3 dicas simples para você'),
  mk(22, 'continue assistindo até o fim'),
];

test('assunto da frase e a palavra exata que dispara o som', () => {
  assert.equal(momentOf(SEGS[1].words).kind, 'money');
  assert.equal(momentOf(SEGS[1].words).word.word, 'faturei');
  assert.equal(momentOf(SEGS[3].words).kind, 'win');
  assert.equal(momentOf(SEGS[4].words).kind, 'alert');
  assert.equal(momentOf(SEGS[4].words).word.word, 'não');
  assert.equal(momentOf(SEGS[5].words).kind, 'number');
  assert.equal(momentOf(SEGS[2].words).kind, 'question');
  assert.equal(momentOf(mk(0, 'bom dia pessoal').words), null);
});

test('sons no início da palavra, do assunto certo, sem colar um no outro', () => {
  const out = suggestSfx({ segments: SEGS, dur: 25, style: 'arcade', events: { broll: [12.1] } });
  const at = (t) => out.find((x) => Math.abs(x.t - t) < 1e-6);
  assert.equal(at(3.85).type, 'p-dinheiro-purchase-arcade'); // "faturei"
  assert.equal(at(10.2).type, 'p-conquista-achievement-arcade'); // "consegui"
  assert.equal(at(14).type, 'p-notificacao-warning-arcade'); // "não faça"
  assert.equal(at(12.1).type, 'whoosh'); // entrada do B-roll
  for (let i = 1; i < out.length; i++) assert.ok(out[i].t - out[i - 1].t >= 1.1);
  // não põe som onde já tem
  const again = suggestSfx({ segments: SEGS, dur: 25, existing: [{ t: 3.9 }] });
  assert.ok(!again.some((x) => Math.abs(x.t - 3.85) < 0.4));
});

test('palavras cortadas não ganham som; sem o pacote usa os sons sintetizados', () => {
  const segs = SEGS.map((s, i) => (i === 1 ? { ...s, words: s.words.map((w) => ({ ...w, removed: true })) } : s));
  assert.ok(!suggestSfx({ segments: segs, dur: 25 }).some((x) => x.kind === 'money'));
  const synth = new Set(['whoosh', 'swoosh', 'cash', 'success', 'error', 'ding', 'bling', 'pop', 'impact']);
  const out = suggestSfx({ segments: SEGS, dur: 25, available: synth });
  assert.ok(out.length >= 5);
  assert.ok(out.every((x) => synth.has(x.type)));
  assert.equal(sfxFor('money', 'arcade', synth), 'cash');
  // alterna as variações do mesmo assunto
  assert.notEqual(sfxFor('money', 'glass', null, 0), sfxFor('money', 'glass', null, 1));
});

test('motions: título curto no ponto exato, espaçados e sem cobrir outro texto', () => {
  const m = suggestMotions({ segments: SEGS, dur: 25 });
  assert.ok(m.length >= 2);
  const money = m.find((x) => x.kind === 'money');
  assert.equal(money.text, 'R$ 5000');
  assert.ok(Math.abs(money.start - 3.8) < 1e-6);
  assert.ok(m.some((x) => x.text === '3 DICAS'));
  for (let i = 1; i < m.length; i++) assert.ok(m[i].start - m[i - 1].start >= 5);
  for (const x of m) assert.ok(x.end - x.start >= 1.3 && x.font && x.animIn);
  const busy = suggestMotions({ segments: SEGS, dur: 25, existing: [{ start: 3, end: 7 }] });
  assert.ok(!busy.some((x) => x.start < 7 && x.end > 3));
});
