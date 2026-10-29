import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EASINGS, easeValue, easeExpr, cleanEase } from '../../shared/easing.js';
import { visualLayerParts } from '../src/pipeline/overlay.js';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';

const ctx = { W: 1280, H: 720, fps: 30, dur: 10 };
const item = (m) => ({ _inIdx: 1, start: 2, end: 5, d: 3, mode: 'pip', scale: 0.4, px: 0.5, py: 0.5, opacity: 1, ...m });

test('curvas: começam em 0, terminam em 1 e a padrão é a suave de sempre', () => {
  for (const id of Object.keys(EASINGS)) {
    assert.ok(Math.abs(easeValue(id, 0)) < 1e-9, `${id} começa em 0`);
    assert.ok(Math.abs(easeValue(id, 1) - 1) < 1e-9, `${id} termina em 1`);
  }
  assert.ok(Math.abs(easeValue('out', 0.3) - (1 - 0.7 ** 3)) < 1e-12);
  assert.equal(easeValue('linear', 0.3), 0.3);
  assert.ok(Math.abs(easeValue('inout', 0.5) - 0.5) < 1e-9);
});

test('overshoot passa de 1 (sobe e assenta) e as outras não passam', () => {
  let peak = 0;
  for (let p = 0; p <= 1; p += 0.01) peak = Math.max(peak, easeValue('back', p));
  assert.ok(peak > 1.05 && peak < 1.15, `pico ${peak.toFixed(3)}`);
  for (const id of ['out', 'inout', 'linear']) {
    for (let p = 0; p <= 1; p += 0.01) assert.ok(easeValue(id, p) <= 1 + 1e-9, `${id} não passa de 1`);
  }
});

test('curva desconhecida vira a padrão', () => {
  assert.equal(cleanEase('elastico'), 'out');
  assert.equal(cleanEase(undefined), 'out');
  assert.equal(cleanEase('back'), 'back');
});

test('a curva escolhida chega ao filtro de zoom e deslizar', () => {
  const [chainOut] = visualLayerParts([item({ animIn: 'zoom' })], ctx);
  const [chainBack] = visualLayerParts([item({ animIn: 'zoom', animEase: 'back' })], ctx);
  assert.notEqual(chainOut, chainBack);
  assert.ok(chainBack.includes('2.70158'), 'overshoot no zoom');
  const [, ovLinear] = visualLayerParts([item({ animIn: 'slide-left', animEase: 'linear' })], ctx);
  assert.ok(ovLinear.includes('+1*W*(1-(min(1,max(0,'), 'deslizar linear');
});

test('o FFmpeg aceita a expressão de cada curva', () => {
  for (const id of Object.keys(EASINGS)) {
    const p = 'min(1,max(0,t/1))';
    const vf = `scale=w='max(2,round(64*${easeExpr(id, p)}))':h=-2:eval=frame`;
    const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=30:d=1', '-vf', vf, '-f', 'null', '-']);
    assert.equal(r.status, 0, `${id}: ${r.stderr.toString()}`);
  }
});
