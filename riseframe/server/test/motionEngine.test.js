import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { explainerPlan, drawExplainer, spring, EXPLAINER_BEATS } from '../../shared/motionEngine.js';
import { renderExplainerScene, explainerLayers } from '../src/pipeline/motionRender.js';
import { probeSummary } from '../src/pipeline/ffmpeg.js';
import { SFX_LIBRARY } from '../src/pipeline/sfx.js';

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
