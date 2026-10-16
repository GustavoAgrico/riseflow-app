import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visualLayerParts } from '../src/pipeline/overlay.js';

const ctx = { W: 1280, H: 720, fps: 30, dur: 10 };
const item = (m) => ({ _inIdx: 1, start: 2, end: 5, d: 3, mode: 'pip', scale: 0.4, px: 0.5, py: 0.5, opacity: 1, ...m });

test('camada sem animação: overlay simples na janela de tempo', () => {
  const parts = visualLayerParts([item({})], ctx);
  assert.equal(parts.length, 2);
  assert.match(parts[0], /^\[1:v\]scale=512:-2,setsar=1,setpts=PTS-STARTPTS\+2\.000\/TB\[m0\]$/);
  assert.match(parts[1], /^\[0:v\]\[m0\]overlay=x='round\(\(W-w\)\*0\.500\)'.*enable='between\(t,2\.000,5\.000\)'\[vout\]$/);
});

test('fade: alpha entra e sai nos limites da camada', () => {
  const [chain] = visualLayerParts([item({ animIn: 'fade', animOut: 'fade', animDur: 0.5 })], ctx);
  assert.ok(chain.includes('format=rgba,fade=t=in:st=2.000:d=0.500:alpha=1,fade=t=out:st=4.500:d=0.500:alpha=1'));
});

test('zoom/pop: escala por quadro ancorada no centro do PiP', () => {
  const [chain, ov] = visualLayerParts([item({ animIn: 'zoom', animOut: 'pop', _aspect: 0.75 })], ctx);
  assert.match(chain, /scale=w='max\(2,round\(512\*\(0\.6\+0\.4\*.*:h=-2:eval=frame\[m0\]$/);
  assert.ok(ov.includes('(1280-512)*0.500+(512-w)/2'));
  assert.ok(ov.includes('(720-384)*0.500+(384-h)/2'));
});

test('deslizar: entra de fora da tela e sai pelo lado do movimento', () => {
  const [, ov] = visualLayerParts([item({ animIn: 'slide-left', animOut: 'slide-up' })], ctx);
  assert.ok(ov.includes('+1*W*(1-'), 'entra pela direita');
  assert.ok(ov.includes('+-1*H*(1-'), 'sai por cima');
});

test('mesclagem em tela cheia: tela neutra + blend; no PiP é ignorada', () => {
  const parts = visualLayerParts([item({ mode: 'cover', blend: 'screen', opacity: 0.8 })], ctx);
  assert.ok(parts.some((p) => p.startsWith('color=c=black:s=1280x720:r=30:d=10.000[cv0]')));
  assert.match(parts.at(-1), /blend=all_mode=screen:all_opacity=0\.800:shortest=1,format=yuv420p\[vout\]$/);
  const pip = visualLayerParts([item({ blend: 'multiply' })], ctx);
  assert.ok(!pip.some((p) => p.includes('blend=')));
});

test('várias camadas encadeiam até [vout]', () => {
  const parts = visualLayerParts([item({}), item({ _inIdx: 2, start: 6, end: 8, d: 2 })], ctx);
  assert.match(parts[1], /\[v0\]$/);
  assert.match(parts[3], /^\[v0\]\[m1\]overlay=.*\[vout\]$/);
});

test('posição livre (cx/cy): centro da camada em qualquer lugar, maior que a tela', () => {
  const [chain, ov] = visualLayerParts([item({ cx: 0.25, cy: 0.9, scale: 1.5 })], ctx);
  assert.match(chain, /scale=1920:-2/, 'escala 150% da largura');
  assert.ok(ov.includes("x='round(320.000-w/2)'"), ov);
  assert.ok(ov.includes("y='round(648.000-h/2)'"), ov);
});
