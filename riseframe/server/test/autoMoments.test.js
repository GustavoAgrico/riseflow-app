import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestSfx, momentOf, sfxFor, premiumSfx } from '../../shared/autoMoments.js';

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
  const out = suggestSfx({ segments: SEGS, dur: 25, available: synth, style: 'cinematic' });
  assert.ok(out.length >= 5);
  assert.ok(out.every((x) => synth.has(x.type)));
  assert.equal(sfxFor('money', 'arcade', synth), 'cash');
  // alterna as variações do mesmo assunto
  assert.notEqual(sfxFor('money', 'glass', null, 0), sfxFor('money', 'glass', null, 1));
});

test('estilo premium (padrão): sons discretos de agência, com volume, sem "joguinho"', () => {
  const out = suggestSfx({ segments: SEGS, dur: 25 });
  assert.ok(out.length >= 4);
  assert.ok(out.every((x) => x.type.startsWith('pr-') && x.volume > 0 && x.volume <= 1));
  assert.equal(out.find((x) => x.kind === 'win').type, 'pr-shine');
  for (let i = 1; i < out.length; i++) assert.ok(out[i].t - out[i - 1].t >= 1.1);
  // sem o kit premium no servidor: cai nos sintetizados equivalentes
  assert.equal(premiumSfx('money', new Set(['thud'])).type, 'thud');
  assert.equal(premiumSfx('money', new Set(['cash'])), null);
});
