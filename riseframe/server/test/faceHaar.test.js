import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCascade, groupRectangles, parsePgmStream, detectMultiScale, equalizeHist } from '../src/pipeline/faceHaar.js';
import { trackerProblem } from '../src/pipeline/reframe.js';

test('detector JS: lê o classificador frontal do OpenCV inteiro', () => {
  const c = loadCascade();
  assert.equal(c.W, 24);
  assert.equal(c.H, 24);
  assert.equal(c.stages.length, 25);
  assert.equal(c.features.length, 2913);
  assert.equal(c.stages.reduce((a, s) => a + s.nodes.length, 0), 2913);
  for (const f of c.features) assert.ok(f.length >= 2 && f.length <= 3 && f.every((r) => r.length === 5));
});

test('detector JS: imagem lisa ou ruído não vira rosto', () => {
  const W = 160;
  const H = 120;
  assert.deepEqual(detectMultiScale(new Uint8Array(W * H).fill(128), W, H), []);
  let seed = 7;
  const noise = new Uint8Array(W * H).map(() => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed & 255; });
  assert.deepEqual(detectMultiScale(noise, W, H), []);
});

test('detector JS: agrupa janelas vizinhas como o OpenCV (min 5 vizinhos)', () => {
  const near = Array.from({ length: 7 }, (_, i) => [100 + i, 50 + (i % 2), 40, 40]);
  const lonely = [[10, 10, 30, 30], [11, 10, 30, 30]];
  const g = groupRectangles([...near, ...lonely], 5);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0], [103, 50, 40, 40]);
});

test('detector JS: lê os quadros PGM do ffmpeg em sequência', () => {
  const frame = (w, h, v) => Buffer.concat([Buffer.from(`P5\n${w} ${h}\n255\n`), Buffer.alloc(w * h, v)]);
  const fr = parsePgmStream(Buffer.concat([frame(4, 2, 9), frame(3, 3, 200)]));
  assert.equal(fr.length, 2);
  assert.deepEqual([fr[0].w, fr[0].h, fr[0].gray[0]], [4, 2, 9]);
  assert.deepEqual([fr[1].w, fr[1].h, fr[1].gray[8]], [3, 3, 200]);
  assert.deepEqual(parsePgmStream(Buffer.from('lixo')), []);
});

test('detector JS: equalização de histograma espalha os tons', () => {
  const g = equalizeHist(Uint8Array.from([10, 10, 20, 30]));
  assert.equal(g[3], 255);
  assert.ok(g[2] > 20 && g[2] < 255);
});

test('sem Python/OpenCV o detector JS entra no lugar (motivo reconhecido)', () => {
  assert.equal(trackerProblem('Python não encontrado no PATH'), 'python');
  assert.equal(trackerProblem('opencv indisponível'), 'opencv');
});
