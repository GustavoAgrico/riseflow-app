import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kineticPlan, composeLines, wordRole, phraseChunks, sceneLayers, textWidthEm } from '../../shared/kinetic.js';
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
  assert.equal(plan.scenes[0].theme, 'preto-raios');
  // fundo da cena: vídeo animado em loop por baixo dos textos, cobrindo o quadro, antes da 1ª palavra
  const bg = plan.elements.find((e) => e.scene === 1 && e.element === 'backgrounds/preto-raios');
  assert.ok(bg && !bg.above && bg.kind === 'video' && bg.loop && bg.muted && bg.scale >= 1 && bg.start <= Math.min(...words.map((w) => w.start)));
  const agora = words.find((l) => l.text === 'agora');
  assert.ok(Math.abs(agora.start - (0.54 - 0.04)) < 0.011);
  assert.equal(agora.font, 'inter');
  assert.equal(words.find((l) => l.text === 'Então').fontStyle, '400i');
  // tudo cabe na largura do quadro 9:16 (medida real das letras), dentro da coluna
  for (const l of plan.layers.filter((x) => x.kind !== 'shape')) {
    const font = l.font === 'garamond' ? 'garamond-400i' : l.fontStyle === '900i' ? 'inter-900i' : 'inter-900';
    const w = textWidthEm(l.text, font, l.tracking || 0) * l.size + (l.bg ? 2 * 0.16 * l.size : 0);
    assert.ok(w <= 0.8 * (9 / 16) + 1e-3, l.text);
    assert.ok(l.x - w / (9 / 16) / 2 >= 0.08 && l.x + w / (9 / 16) / 2 <= 0.92, `${l.text} dentro da margem`);
  }
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

test('bloco tipográfico: chaves com a mesma largura, borda alinhada e ritmo constante', () => {
  const ws = 'o segredo do dinheiro é sempre o tempo'.split(' ').map((w, i) => ({ word: w, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const { lines } = sceneLayers(ws, { theme: 'escuro', start: 0, end: 4, aspect: 9 / 16, index: 0 });
  const keys = lines.filter((l) => l.role === 'key');
  const capped = (l) => l.size >= 0.105 - 1e-4;
  const full = keys.filter((l) => !capped(l));
  const maxW = Math.max(...lines.map((l) => l.w));
  for (const l of full) assert.ok(Math.abs(l.w - maxW) < 0.004, `${l.text} ocupa a largura do bloco`);
  // alinhado à esquerda: todas as linhas começam na mesma borda
  const lefts = lines.map((l) => l.x - l.w / (9 / 16) / 2);
  assert.ok(Math.max(...lefts) - Math.min(...lefts) < 0.002);
  // linhas em ordem, sem sobrepor
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i].y - lines[i].h / 2 >= lines[i - 1].y + lines[i - 1].h / 2 - 1e-4);
  // a cena seguinte centraliza
  const { lines: c2 } = sceneLayers(ws, { theme: 'escuro', start: 0, end: 4, aspect: 9 / 16, index: 1 });
  for (const l of c2) assert.equal(l.x, 0.5);
});

test('pedaços cortados pelo tamanho nunca terminam em palavra de ligação', () => {
  const ws = 'o segredo do dinheiro é sempre o tempo que você tem'.split(' ').map((w, i) => ({ word: w, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const chunks = phraseChunks([{ start: 0, end: 4, words: ws }], 7).map((c) => c.map((w) => w.word).join(' '));
  assert.deepEqual(chunks, ['o segredo do dinheiro é sempre', 'o tempo que você tem']);
});

test('fundos próprios: cada cena usa uma mídia da pessoa e a cor do texto segue o brilho dela', () => {
  const backgrounds = [{ ref: 'm1', kind: 'video', ar: 16 / 9, light: false }, { ref: 'm2', kind: 'image', ar: 16 / 9, light: true }];
  const plan = kineticPlan({ segments: SEGS, dur: 15, amount: 'muitos', backgrounds });
  const bgs = plan.elements.filter((e) => e.custom);
  assert.ok(bgs.length >= 2);
  assert.deepEqual(bgs.slice(0, 2).map((e) => e.custom), ['m1', 'm2']);
  assert.ok(bgs[0].loop && bgs[0].kind === 'video' && bgs[1].kind === 'image');
  // vídeo 16:9 num quadro 9:16: cobre a altura inteira
  assert.ok(bgs[0].scale * (9 / 16) * (16 / 9) >= 1);
  assert.deepEqual(plan.scenes.slice(0, 2).map((s) => s.theme), ['escuro', 'branco']);
  assert.ok(!plan.elements.some((e) => String(e.element || '').startsWith('backgrounds/')));
});

test('legenda em bloco: cobre a fala toda, chave grande, pequenas em volta, cada palavra no seu instante', () => {
  const plan = kineticPlan({ segments: SEGS, dur: 15, theme: 'legenda', amount: 'muitos' });
  assert.ok(plan.scenes.length >= 3);
  assert.equal(plan.elements.length, 0);
  for (let i = 1; i < plan.scenes.length; i++) assert.ok(plan.scenes[i].start >= plan.scenes[i - 1].end - 1e-6);
  const big = plan.layers.filter((l) => l.fontStyle === '900');
  const small = plan.layers.filter((l) => l.fontStyle === '700');
  assert.ok(big.length && small.length);
  assert.ok(Math.min(...big.map((l) => l.size)) > Math.max(...small.map((l) => l.size)) * 1.5);
  for (const l of plan.layers) {
    assert.ok(l.animIn === 'palavras-desfoque' && l.x > 0.05 && l.x < 0.95, l.text);
    assert.ok(l.end > l.start);
  }
});

test('legenda em bloco em "Momentos-chave": só as frases de destaque, não o vídeo todo', () => {
  const all = kineticPlan({ segments: SEGS, dur: 15, theme: 'legenda', amount: 'muitos' });
  const key = kineticPlan({ segments: SEGS, dur: 15, theme: 'legenda', amount: 'chave' });
  assert.ok(key.scenes.length >= 1 && key.scenes.length < all.scenes.length);
});
