import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCrop, cropRect } from '../src/pipeline/frame.js';
import { visualLayerParts } from '../src/pipeline/overlay.js';

test('recorte do vídeo principal: limpa os valores e calcula o retângulo par', () => {
  assert.equal(cleanCrop(null), null);
  assert.equal(cleanCrop({ l: 0, t: 0, r: 0, b: 0 }), null);
  assert.deepEqual(cleanCrop({ l: 0.1, t: '0.2', r: 9, b: -1 }), { l: 0.1, t: 0.2, r: 0.45, b: 0 });
  assert.deepEqual(cropRect(1080, 1920, { l: 0.1, t: 0.1, r: 0.1, b: 0.1 }), { x: 108, y: 192, w: 864, h: 1536 });
  const r = cropRect(1081, 1921, { l: 0.13, t: 0.07, r: 0, b: 0 });
  assert.equal(r.w % 2, 0);
  assert.equal(r.h % 2, 0);
  assert.ok(r.x + r.w <= 1081 && r.y + r.h <= 1921);
});

test('camada: recorte deixa as bordas transparentes e giro com cantos transparentes', () => {
  const [chain] = visualLayerParts([{ _inIdx: 1, start: 0, end: 2, d: 2, mode: 'pip', scale: 0.5, cx: 0.5, cy: 0.5, _aspect: 1, crop: { l: 0.1, t: 0, r: 0.1, b: 0 }, rot: 15 }], { W: 1080, H: 1920, fps: 30, dur: 2 });
  assert.match(chain, /scale=540:-2/);
  assert.match(chain, /format=rgba,crop=w='trunc\(iw\*0\.800\)'/);
  assert.match(chain, /pad=w='trunc\(iw\/0\.800\)'.*color=black@0/);
  assert.match(chain, /rotate=0\.262:ow=rotw\(0\.262\):oh=roth\(0\.262\):c=black@0/);
  assert.equal((chain.match(/format=rgba/g) || []).length, 1);
  // sem recorte nem giro: nada disso
  const [plain] = visualLayerParts([{ _inIdx: 1, start: 0, end: 2, d: 2, mode: 'cover' }], { W: 1080, H: 1920, fps: 30, dur: 2 });
  assert.doesNotMatch(plain, /rotate|pad=|rgba/);
});
