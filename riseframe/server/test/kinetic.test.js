import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kineticPlan, composeLines, wordRole, phraseChunks } from '../../shared/kinetic.js';
import { cleanTextLayers } from '../../shared/textLayers.js';
import { CAPTION_FONTS } from '../../shared/captionStyle.js';
import { buildTextAss } from '../src/pipeline/texts.js';
import { SFX_LIBRARY } from '../src/pipeline/sfx.js';

const mk = (t0, text) => {
  let t = t0;
  const words = text.split(' ').map((w) => { const o = { start: +t.toFixed(2), end: +(t + 0.3).toFixed(2), word: w }; t += 0.34; return o; });
  return { start: t0, end: t, words };
};
const SEGS = [
  mk(0.2, 'Então agora o seu cérebro está processando'),
  mk(3.2, '11000000 bits de informação por segundo'),
  mk(6.4, 'mas o consciente só consegue'),
  mk(9.0, 'uma frase por segundo.'),
  mk(11.5, 'por isso você precisa filtrar a informação'),
];

test('hierarquia: ligação pequena, palavra-chave grande, número com a unidade', () => {
  const ws = SEGS[1].words;
  assert.equal(wordRole(ws[0], 0, ws), 'num');
  assert.equal(wordRole(ws[2], 2, ws), 'small');
  assert.equal(wordRole(ws[3], 3, ws), 'key');
  const lines = composeLines(ws);
  assert.deepEqual(lines.map((l) => [l.role, l.role === 'num' ? `${l.text} ${l.unit}` : l.text]), [['num', '11000000 bits'], ['small', 'de'], ['key', 'informação'], ['small', 'por'], ['key', 'segundo']]);
  assert.equal(phraseChunks([mk(0, 'a b c d e f g h i j')], 8).map((c) => c.length).join(), '8,2');
});

test('cada palavra entra no instante falado; cenas não se sobrepõem; fundo por baixo antes das palavras', () => {
  const plan = kineticPlan({ segments: SEGS, dur: 15, amount: 'muitos' });
  assert.ok(plan.scenes.length >= 4);
  for (let i = 1; i < plan.scenes.length; i++) assert.ok(plan.scenes[i].start >= plan.scenes[i - 1].end);
  const sc1 = plan.layers.filter((l) => l.scene === 1);
  const words = sc1.filter((l) => l.kind !== 'shape');
  assert.equal(plan.scenes[0].theme, 'escuro');
  // fundo da cena: imagem por baixo dos textos, cobrindo o quadro, entrando antes da 1ª palavra
  const bg = plan.elements.find((e) => e.scene === 1 && e.element === 'backgrounds/escuro');
  assert.ok(bg && !bg.above && bg.scale >= 1 && bg.start <= Math.min(...words.map((w) => w.start)));
  const agora = words.find((l) => l.text === 'agora');
  assert.ok(Math.abs(agora.start - (0.54 - 0.04)) < 0.011);
  assert.equal(agora.font, 'inter');
  assert.equal(words.find((l) => l.text === 'Então').fontStyle, '400i');
  // tudo cabe na largura do quadro 9:16 (estimativa conservadora)
  for (const l of plan.layers.filter((x) => x.kind !== 'shape')) assert.ok(l.text.length * 0.6 * l.size <= 0.9 * (9 / 16) + 1e-6, l.text);
});

test('sons premium: passagem na cena, batida nas palavras-chave, tecla nas pequenas', () => {
  const plan = kineticPlan({ segments: SEGS, dur: 15, amount: 'muitos' });
  const types = new Set(plan.sfx.map((s) => s.type));
  for (const t of ['pr-air', 'pr-hit', 'pr-key']) assert.ok(types.has(t), t);
  for (const s of plan.sfx) assert.ok(Object.hasOwn(SFX_LIBRARY, s.type), s.type);
  for (let i = 1; i < plan.sfx.length; i++) assert.ok(plan.sfx[i].t - plan.sfx[i - 1].t >= 0.16);
});

test('passa pela validação do servidor e vira ASS com a fonte itálica de verdade', () => {
  const plan = kineticPlan({ segments: SEGS, dur: 15, amount: 'muitos' });
  const clean = cleanTextLayers(plan.layers, Object.keys(CAPTION_FONTS), 400);
  assert.equal(clean.length, plan.layers.length);
  assert.ok(clean.some((l) => l.fontStyle === '400i' && l.font === 'garamond'));
  const ass = buildTextAss(clean, { width: 1080, height: 1920 });
  assert.match(ass, /RFS garamond 400i/);
  assert.match(ass, /RFS inter 900/);
});

test('momentos-chave: menos cenas, só nas frases fortes, sem cobrir textos já postos', () => {
  const plan = kineticPlan({ segments: SEGS, dur: 15, amount: 'chave', existing: [{ start: 3, end: 6 }] });
  assert.ok(plan.scenes.length >= 1 && plan.scenes.length <= 3);
  assert.ok(!plan.scenes.some((s) => s.start < 6 && s.end > 3));
});
