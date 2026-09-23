import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyZoomMoments } from '../../shared/keyMoments.js';
import { brollFrameVf } from '../src/pipeline/broll.js';

const seg = (start, text, len = 1.5) => ({
  start, end: start + len,
  words: text.split(' ').map((word, i) => ({ word, start: start + i * 0.3, end: start + i * 0.3 + 0.25 })),
});

test('keyZoomMoments: escolhe poucos momentos de ênfase, espaçados', () => {
  const segs = [];
  for (let i = 0; i < 20; i++) segs.push(seg(i * 1.5, 'uma frase bem comum aqui'));
  segs.push(seg(31, 'isso é muito importante!'));
  const m = keyZoomMoments(segs, 40);
  assert.ok(m.length >= 1 && m.length <= 4, `poucos momentos (${m.length})`);
  for (let i = 1; i < m.length; i++) assert.ok(m[i].start - m[i - 1].start >= 5, 'espaço mínimo de 5 s');
  assert.ok(m.some((x) => x.start === 31), 'pega a frase de ênfase');
  for (const x of m) assert.ok(x.end - x.start <= 2.2 + 1e-9, 'zoom curto');
});

test('brollFrameVf: zoom e foco do B-roll viram scale + crop posicionado', () => {
  assert.equal(brollFrameVf(1080, 960), 'scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960:(iw-ow)*0.500:(ih-oh)*0.500');
  const vf = brollFrameVf(1080, 960, { zoom: 1.5, fx: 0, fy: 1 });
  assert.ok(vf.startsWith('scale=1620:1440:'), vf);
  assert.ok(vf.endsWith('crop=1080:960:(iw-ow)*0.000:(ih-oh)*1.000'), vf);
});
