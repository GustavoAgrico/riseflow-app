import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brollFrameVf } from '../src/pipeline/broll.js';

test('B-roll com zoom: recorte com folga de cabeça (não no centro vertical)', () => {
  const vf = brollFrameVf(1080, 1920, { zoom: 1.5 });
  const y = vf.match(/crop=1080:1920:[^:]+:(\(ih-oh\)\*[\d.]+)/)[1];
  assert.equal(y, '(ih-oh)*0.300');
});

test('B-roll sem zoom e foco manual: nada muda', () => {
  assert.match(brollFrameVf(1080, 1920, {}), /\(ih-oh\)\*0\.500/);
  assert.match(brollFrameVf(1080, 1920, { zoom: 1.4, fy: 0.8 }), /\(ih-oh\)\*0\.800/);
});
