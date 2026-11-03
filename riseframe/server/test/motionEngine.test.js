import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { explainerPlan, drawExplainer, spring, EXPLAINER_BEATS, STRATEGY_BEATS } from '../../shared/motionEngine.js';
import { parseOptions } from '../src/routes/jobs.js';
import { renderExplainerScene, explainerLayers } from '../src/pipeline/motionRender.js';
import { probeSummary } from '../src/pipeline/ffmpeg.js';
import { SFX_LIBRARY, STYLE_PACK_SOUNDS } from '../src/pipeline/sfx.js';
import { remapMotionScenes } from '../src/pipeline/timeline.js';

const seg = (t0, text) => { let t = t0; const words = text.split(' ').map((w) => { const o = { start: +t.toFixed(2), end: +(t + 0.26).toFixed(2), word: w }; t += 0.3; return o; }); return { start: t0, end: t, words }; };
const SEGS = [seg(0.2, 'você sabia disso'), seg(1.3, 'pesquisas mostram'), seg(2.2, 'que o cérebro toma'), seg(3.2, '35 mil decisões todo dia'),
  seg(4.8, 'quando você aprende estratégia'), seg(6.0, 'seu resultado cresce rápido'), seg(7.3, 'foco disciplina constância método'), seg(8.5, 'não é sorte')];
const plan = explainerPlan({ segments: SEGS, dur: 11, amount: 'muitos' });

test('explicativo: a fala vira batidas variadas, começando no gancho e terminando no fechamento', () => {
  assert.equal(plan.scenes.length, 1);
  const types = plan.scenes[0].beats.map((b) => b.type);
  assert.equal(types[0], 'hook');
  assert.equal(types[types.length - 1], 'end');
  assert.ok(types.includes('counter') && types.includes('chart'), types.join());
  for (let i = 1; i < types.length; i++) assert.notEqual(types[i], types[i - 1]);
  for (const b of plan.scenes[0].beats) assert.ok(EXPLAINER_BEATS.includes(b.type) && b.end > b.start);
  const counter = plan.scenes[0].beats.find((b) => b.type === 'counter');
  assert.equal(counter.data.number, 35000);
});

test('explicativo: cada batida entra na palavra falada e os sons existem', () => {
  for (const b of plan.scenes[0].beats) assert.ok(Math.abs(b.start - (b.words[0].t - 0.05)) < 0.06 || b.start === plan.scenes[0].start);
  for (const s of plan.sfx) assert.ok(Object.hasOwn(SFX_LIBRARY, s.type), s.type);
});

test('mola: passa do alvo e assenta em 1', () => {
  let peak = 0;
  for (let t = 0; t < 1.5; t += 0.01) peak = Math.max(peak, spring(t));
  assert.ok(peak > 1.05 && peak < 1.4, `pico ${peak}`);
  assert.ok(Math.abs(spring(2) - 1) < 0.01);
});

test('explicativo: desenha todos os tipos de batida em qualquer instante sem erro', () => {
  const c = createCanvas(270, 480);
  const ctx = c.getContext('2d');
  const sc = plan.scenes[0];
  const all = { ...sc, beats: EXPLAINER_BEATS.map((type, i) => ({ type, start: sc.start + i, end: sc.start + i + 1, words: [], data: { text: 'texto de teste', keyword: 'teste', small: 'de', keys: ['um', 'dois', 'três'], number: 1200, caption: 'por dia' } })) };
  for (let t = all.start - 0.5; t < all.start + 11; t += 0.13) drawExplainer(ctx, all, t, { W: 270, H: 480 });
});

test('explicativo: render real vira vídeo do tamanho e duração da cena', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-motion-'));
  try {
    const sc = { ...plan.scenes[0], end: plan.scenes[0].start + 2 };
    const file = await renderExplainerScene(sc, { W: 360, H: 640, fps: 15 }, path.join(dir, 'm.mp4'));
    const m = await probeSummary(file);
    assert.equal(m.width, 360);
    assert.equal(m.height, 640);
    assert.ok(Math.abs(m.duration - 2) < 0.2, `duração ${m.duration}`);
    const layers = await explainerLayers([sc], { width: 360, height: 640, fps: 15 }, dir);
    assert.equal(layers[0].kind, 'video');
    assert.ok(fs.existsSync(layers[0].file) && layers[0].mode === 'cover');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const STRAT = explainerPlan({ segments: [seg(0.2, 'você tem as ideias'), seg(1.4, 'e o conteúdo'), seg(2.4, 'mas o seu crescimento'), seg(3.6, 'continua travado'),
  seg(4.7, 'porque conteúdo sem público'), seg(6.0, 'é só barulho'), seg(6.9, 'e o seu público'), seg(8.0, 'valor alcance impacto resultado')], dur: 10, amount: 'muitos', style: 'estrategia' });
const DARKS = new Set(['a-bubble', 'a-glow', 'a-object', 'a-cta']);

test('estratégia: abre no gancho, alterna fundo claro/escuro e fecha no CTA ou na marca', () => {
  const sc = STRAT.scenes[0];
  assert.equal(sc.style, 'estrategia');
  const types = sc.beats.map((b) => b.type);
  assert.equal(types[0], 'a-hook');
  assert.ok(['a-cta', 'a-brand'].includes(types[types.length - 1]), types.join());
  for (const t of types) assert.ok(STRATEGY_BEATS.includes(t), t);
  for (let i = 1; i < types.length; i++) assert.notEqual(DARKS.has(types[i]), DARKS.has(types[i - 1]), types.join());
});

test('estratégia: o texto de apoio nunca repete a palavra-chave', () => {
  for (const b of STRAT.scenes[0].beats) {
    const lead = b.data.small || b.data.after || '';
    assert.ok(!lead.split(' ').includes(b.data.keyword), `${b.data.text} → ${lead} / ${b.data.keyword}`);
  }
});

test('estratégia: corte seco pisca preto na troca de batida e desenha todos os tipos', () => {
  const c = createCanvas(108, 192);
  const ctx = c.getContext('2d');
  const sc = STRAT.scenes[0];
  const cut = sc.beats[1].start;
  drawExplainer(ctx, sc, cut, { W: 108, H: 192 });
  const px = ctx.getImageData(2, 2, 1, 1).data;
  assert.ok(px[0] < 40 && px[1] < 40 && px[2] < 40, `pixel ${px}`);
  const all = { ...sc, beats: STRATEGY_BEATS.map((type, i) => ({ type, start: sc.start + i, end: sc.start + i + 1, words: [], data: { text: 'texto de teste', keyword: 'teste', small: 'texto de', keys: ['um'] } })) };
  for (let t = all.start - 0.5; t < all.start + 9; t += 0.11) drawExplainer(ctx, all, t, { W: 108, H: 192 });
});

test('estratégia: as cenas vindas do editor mantêm o estilo e descartam batidas de outro estilo', () => {
  const sc = STRAT.scenes[0];
  const o = parseOptions({ kinetic: true, kineticTheme: 'estrategia', motionScenes: [{ ...sc, beats: [...sc.beats, { type: 'hook', start: 9, end: 9.5, data: { text: 'x' } }] }] });
  assert.equal(o.kineticTheme, 'estrategia');
  assert.equal(o.motionScenes[0].style, 'estrategia');
  assert.deepEqual(o.motionScenes[0].beats.map((b) => b.type), sc.beats.map((b) => b.type));
});

test('estilos das outras referências (editorial, bordô, cinema): batidas do estilo, sons e desenho de todos os tipos', async () => {
  const { STYLE_BEATS } = await import('../../shared/motionStyles.js');
  const seg = (t, text) => { const ws = text.split(' '); return { start: t, end: t + ws.length * 0.3, text, words: ws.map((w, i) => ({ word: w, start: t + i * 0.3, end: t + i * 0.3 + 0.26 })) }; };
  const segments = [seg(0.2, 'se você compara a gente com outras agências'), seg(2.4, 'número de posts orçamento campanhas'), seg(4.2, 'mas o crescimento mora no negócio'),
    seg(6.0, 'a estratégia é o segredo do dinheiro'), seg(8.0, 'por isso a gente não compete')];
  const c = createCanvas(108, 192);
  const ctx = c.getContext('2d');
  for (const style of ['editorial', 'bordo', 'cinema-escuro']) {
    const plan = explainerPlan({ segments, dur: 11, amount: 'muitos', style });
    assert.ok(plan.scenes.length >= 1, style);
    const sc = plan.scenes[0];
    assert.equal(sc.style, style);
    for (const b of sc.beats) assert.ok(STYLE_BEATS[style].includes(b.type), `${style}: ${b.type}`);
    assert.ok(plan.sfx.length > 0, `${style}: sons`);
    // o sanitizador do servidor mantém o estilo e as batidas
    const o = parseOptions({ kinetic: true, kineticTheme: style, motionScenes: [sc] });
    assert.equal(o.kineticTheme, style);
    assert.deepEqual(o.motionScenes[0].beats.map((b) => b.type), sc.beats.map((b) => b.type));
    // todos os tipos desenham sem erro (com e sem objeto, com e sem palavras)
    const all = { ...sc, beats: STYLE_BEATS[style].map((type, i) => ({ type, start: sc.start + i, end: sc.start + i + 1, words: i % 2 ? [] : [{ w: 'texto', t: sc.start + i + 0.1 }, { w: 'teste', t: sc.start + i + 0.4 }], data: { text: 'texto de teste', keyword: 'teste', small: 'texto de', after: '', keys: ['um', 'dois', 'três'], element: i % 2 ? 'bulb' : null } })) };
    for (let t = all.start - 0.5; t < all.start + STYLE_BEATS[style].length + 0.5; t += 0.13) drawExplainer(ctx, all, t, { W: 108, H: 192, image: () => null });
  }
});

test('minimalista (cards e palavras): batidas do estilo, sons no ponto da ação e desenho de todos os tipos', async () => {
  const { STYLE_BEATS } = await import('../../shared/motionStyles.js');
  const seg = (t, text) => { const ws = text.split(' '); return { start: t, end: t + ws.length * 0.27, text, words: ws.map((w, i) => ({ word: w, start: t + i * 0.27, end: t + i * 0.27 + 0.24 })) }; };
  const segments = [seg(0.2, 'Seu post chegou a 2018 curtidas'), seg(2.6, 'em apenas 30 dias de conteúdo'), seg(4.8, 'com uma estratégia simples e clara'), seg(7.0, 'a 46296 visualizações por vídeo'), seg(9.2, 'e a conversão cresceu bastante'), seg(11.2, 'chame no direct pra começar')];
  const plan = explainerPlan({ segments, dur: 14, amount: 'muitos', style: 'minimalista' });
  assert.ok(plan.scenes.length >= 1);
  const types = new Set(plan.scenes.flatMap((sc) => sc.beats.map((b) => b.type)));
  assert.ok(types.has('mi-word') && types.has('mi-cta'), [...types].join(','));
  for (const sc of plan.scenes) {
    assert.equal(sc.style, 'minimalista');
    for (const b of sc.beats) assert.ok(STYLE_BEATS.minimalista.includes(b.type), b.type);
  }
  // sons: só dos tipos previstos, e o contador tem riser + ding
  const names = new Set(plan.sfx.map((s) => s.type));
  for (const n of names) assert.ok(SFX_LIBRARY[n], `som ${n} existe no catálogo`);
  assert.ok(names.has('mi-pop') && names.has('mi-air') && names.has('mi-shine') && names.has('mi-rise'), [...names].join(','));
  // o sanitizador do servidor mantém o estilo e as batidas
  const sc = plan.scenes[0];
  const o = parseOptions({ kinetic: true, kineticTheme: 'minimalista', motionScenes: [sc] });
  assert.equal(o.kineticTheme, 'minimalista');
  assert.deepEqual(o.motionScenes[0].beats.map((b) => b.type), sc.beats.map((b) => b.type));
  // todos os tipos desenham sem erro (com e sem palavras, com e sem número)
  const ctx = createCanvas(108, 192).getContext('2d');
  const all = { ...sc, beats: STYLE_BEATS.minimalista.map((type, i) => ({ type, start: sc.start + i, end: sc.start + i + 1, words: i % 2 ? [] : [{ w: 'texto', t: sc.start + i + 0.1 }, { w: 'teste', t: sc.start + i + 0.4 }], data: { text: 'texto 30 de teste', keyword: 'teste', small: 'texto de', after: 'fim', keys: ['um', 'dois', 'três'], element: i % 2 ? 'bulb' : null } })) };
  for (let t = all.start - 0.5; t < all.start + STYLE_BEATS.minimalista.length + 0.5; t += 0.13) drawExplainer(ctx, all, t, { W: 108, H: 192, image: () => null });
});

test('cinético (letras e câmera): batidas, sons do kit próprio e desenho de todos os tipos', async () => {
  const { STYLE_BEATS } = await import('../../shared/motionStyles.js');
  const seg = (t, text) => { const ws = text.split(' '); return { start: t, end: t + ws.length * 0.1, text, words: ws.map((w, i) => ({ word: w, start: t + i * 0.1, end: t + i * 0.1 + 0.08 })) }; };
  const segments = [seg(0.2, 'Make it you'), seg(1.8, 'new energy starts now'), seg(3.6, 'creative ideas every day'), seg(5.6, 'one simple habit changes everything'), seg(7.8, 'save this for later')];
  const plan = explainerPlan({ segments, dur: 10, amount: 'muitos', style: 'cinetico' });
  assert.ok(plan.scenes.length >= 1);
  for (const sc of plan.scenes) {
    assert.equal(sc.style, 'cinetico');
    for (const b of sc.beats) assert.ok(STYLE_BEATS.cinetico.includes(b.type), b.type);
  }
  const names = new Set(plan.sfx.map((s) => s.type));
  for (const n of names) assert.ok(SFX_LIBRARY[n], `som ${n} existe`);
  assert.ok([...names].some((n) => n.startsWith('cn-')), [...names].join(','));
  const sc = plan.scenes[0];
  const o = parseOptions({ kinetic: true, kineticTheme: 'cinetico', motionScenes: [sc] });
  assert.equal(o.kineticTheme, 'cinetico');
  assert.deepEqual(o.motionScenes[0].beats.map((b) => b.type), sc.beats.map((b) => b.type));
  const ctx = createCanvas(108, 192).getContext('2d');
  const all = { ...sc, beats: STYLE_BEATS.cinetico.map((type, i) => ({ type, start: sc.start + i, end: sc.start + i + 1, words: [{ w: 'make', t: sc.start + i + 0.1 }, { w: 'it', t: sc.start + i + 0.3 }, { w: 'you', t: sc.start + i + 0.5 }], data: { text: 'make it you', keyword: 'you', small: 'make it', after: '', keys: ['you'], element: i % 2 ? 'bulb' : null } })) };
  for (let t = all.start - 0.5; t < all.start + STYLE_BEATS.cinetico.length + 0.5; t += 0.13) drawExplainer(ctx, all, t, { W: 108, H: 192, image: () => null });
});

test('bloco, marca e contador (referências de 4 vídeos): batidas, sons próprios e desenho de todos os tipos', async () => {
  const { STYLE_BEATS } = await import('../../shared/motionStyles.js');
  const seg = (t, text) => { const ws = text.split(' '); return { start: t, end: t + ws.length * 0.27, text, words: ws.map((w, i) => ({ word: w, start: t + i * 0.27, end: t + i * 0.27 + 0.24 })) }; };
  const segments = [seg(0.2, 'você ainda perde tempo editando'), seg(2.6, 'vendas crescem 26 por cento'), seg(4.9, 'edição rápida todo dia'), seg(6.8, 'siga para mais dicas'), seg(8.9, 'salve este vídeo agora')];
  const ctx = createCanvas(108, 192).getContext('2d');
  const prefix = { bloco: 'bk-', marca: 'mk-', rolagem: 'rl-' };
  for (const style of ['bloco', 'marca', 'rolagem']) {
    const plan = explainerPlan({ segments, dur: 11, amount: 'muitos', style });
    assert.ok(plan.scenes.length >= 1, style);
    for (const sc of plan.scenes) {
      assert.equal(sc.style, style);
      for (const b of sc.beats) assert.ok(STYLE_BEATS[style].includes(b.type), `${style}: ${b.type}`);
    }
    const names = new Set(plan.sfx.map((s) => s.type));
    for (const n of names) assert.ok(SFX_LIBRARY[n], `som ${n} existe`);
    assert.ok([...names].some((n) => n.startsWith(prefix[style])), `${style}: ${[...names].join(',')}`);
    // cada tipo desenha sem erro em qualquer instante da sua batida
    for (const type of STYLE_BEATS[style]) {
      const all = { start: 0, end: 2, style, beats: [{ type, start: 0, end: 2, words: [{ w: 'você', t: 0.1 }, { w: 'ainda', t: 0.4 }, { w: '26', t: 0.7 }], data: { text: 'você ainda 26', keyword: '26', small: 'você', after: '', keys: ['26'], element: 'bulb' } }] };
      for (let t = -0.2; t < 2.4; t += 0.15) drawExplainer(ctx, all, t, { W: 108, H: 192, image: () => null });
    }
  }
  // contador: só a frase com número vira grade de botões; as outras viram texto
  const nums = explainerPlan({ segments, dur: 11, amount: 'muitos', style: 'rolagem' });
  for (const sc of nums.scenes) for (const b of sc.beats) {
    const hasNum = /\d/.test(String(b.data.text || ''));
    if (b.type === 'rl-grid') assert.ok(hasNum, `grade sem número: ${b.data.text}`);
  }
});

test('sons dos estilos vêm do pacote enviado (arquivo existe e tem duração)', () => {
  for (const [key, rel] of Object.entries(STYLE_PACK_SOUNDS)) {
    const s = SFX_LIBRARY[key];
    assert.ok(s, `som ${key} existe`);
    assert.ok(s.file && fs.existsSync(s.file), `${key} aponta para ${rel}`);
    assert.ok(s.dur > 0, `${key} tem duração`);
  }
});

test('motion com cortes: a cena acompanha a fala no vídeo cortado (tempo remapeado, batida cortada sai)', () => {
  // trecho 2–4 s foi cortado: o que vem depois anda 2 s para trás
  const keep = [{ start: 0, end: 2 }, { start: 4, end: 10 }];
  const scene = { start: 5, end: 8, style: 'estrategia', beats: [
    { type: 'x', start: 5, end: 6.5, words: [{ w: 'a', t: 5.2 }, { w: 'b', t: 6.1 }], data: { text: 'a b', keyword: 'b' } },
    { type: 'x', start: 2.5, end: 3.5, words: [{ w: 'c', t: 2.7 }], data: { text: 'c', keyword: 'c' } },
  ] };
  const [out] = remapMotionScenes([scene], keep);
  assert.equal(out.start, 3);
  assert.equal(out.end, 6);
  assert.equal(out.beats.length, 1, 'batida dentro do corte sai');
  assert.equal(out.beats[0].start, 3);
  assert.equal(out.beats[0].words[0].t, 3.2);
});

test('colagem editorial (referências da pasta): objeto no lugar da letra, seleção com cursor, círculo e número', async () => {
  const { STYLE_BEATS } = await import('../../shared/motionStyles.js');
  const seg = (t, text) => { const ws = text.split(' '); return { start: t, end: t + ws.length * 0.27, text, words: ws.map((w, i) => ({ word: w, start: t + i * 0.27, end: t + i * 0.27 + 0.24 })) }; };
  const segments = [seg(0.2, 'nosso cérebro opera em dois modos'), seg(2.6, 'vendas crescem 26 por cento'), seg(4.9, 'todo mundo busca atalhos'), seg(6.8, 'o dinheiro vem da estratégia'), seg(8.9, 'salve este vídeo para depois')];
  const plan = explainerPlan({ segments, dur: 11, amount: 'muitos', style: 'colagem' });
  assert.ok(plan.scenes.length >= 1);
  const types = new Set();
  for (const sc of plan.scenes) {
    assert.equal(sc.style, 'colagem');
    for (const b of sc.beats) { assert.ok(STYLE_BEATS.colagem.includes(b.type), b.type); types.add(b.type); }
  }
  assert.ok(types.has('cg-letter') && types.has('cg-number'), [...types].join(','));
  // o objeto entra na palavra do assunto (cérebro), não na palavra-chave
  const letter = plan.scenes.flatMap((sc) => sc.beats).find((b) => b.type === 'cg-letter');
  assert.equal(letter.data.objWord, 'cérebro');
  assert.equal(letter.data.element, 'real/brain-pink');
  const names = new Set(plan.sfx.map((s) => s.type));
  for (const n of names) assert.ok(SFX_LIBRARY[n], `som ${n} existe`);
  assert.ok(names.has('cg-pop') && names.has('cg-whoosh'), [...names].join(','));
  const ctx = createCanvas(108, 192).getContext('2d');
  const img = createCanvas(20, 20);
  for (const type of STYLE_BEATS.colagem) {
    const sc = { start: 0, end: 2, style: 'colagem', beats: [{ type, start: 0, end: 1, words: [{ w: 'nosso', t: 0.1 }, { w: 'cérebro', t: 0.3 }, { w: '26', t: 0.5 }], data: { text: 'nosso cérebro 26', keyword: 'cérebro', objWord: 'cérebro', element: 'real/brain-pink' } }, { type, start: 1, end: 2, words: [{ w: 'dois', t: 1.1 }, { w: 'modos', t: 1.4 }], data: { text: 'dois modos', keyword: 'modos', element: null } }] };
    for (let t = -0.2; t < 2.3; t += 0.15) {
      drawExplainer(ctx, sc, t, { W: 108, H: 192, image: () => img });
      drawExplainer(ctx, sc, t, { W: 108, H: 192, image: () => null });
    }
  }
});

test('recortes 3D da pasta enviada: todo assunto aponta para um arquivo que existe', async () => {
  const { REAL_OBJECTS, ELEMENT_ASSETS } = await import('../../shared/sceneElements.js');
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets', 'elements');
  for (const id of ELEMENT_ASSETS) assert.ok(fs.existsSync(path.join(dir, `${id}.png`)), id);
  for (const k of ['money', 'brain', 'love', 'win', 'discount', 'video', 'luck', 'click']) assert.ok(REAL_OBJECTS[k]?.length, k);
});
