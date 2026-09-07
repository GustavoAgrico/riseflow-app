import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSfxMix } from '../src/pipeline/sfx.js';

test('buildSfxMix: nenhum evento → null', () => {
  assert.equal(buildSfxMix([]), null);
  assert.equal(buildSfxMix(null), null);
  assert.equal(buildSfxMix([{ t: -1, type: 'pop' }, { t: 1, type: 'x' }]), null);
});

test('buildSfxMix: posiciona cada SFX no tempo certo e mixa mantendo o original', () => {
  const r = buildSfxMix([{ t: 1, type: 'pop' }, { t: 0.5, type: 'whoosh' }], { intensity: 'medio' });
  assert.ok(r);
  // ordenado por tempo: whoosh(0.5s) vira input 1, pop(1s) vira input 2
  assert.deepEqual(r.order, ['whoosh', 'pop']);
  assert.ok(r.filter.includes('[1:a]adelay=500|500'), 'whoosh em 500ms');
  assert.ok(r.filter.includes('[2:a]adelay=1000|1000'), 'pop em 1000ms');
  // original + 2 eventos = 3 inputs no amix, sem normalizar (mantém volume original)
  assert.ok(r.filter.includes('amix=inputs=3:normalize=0'), 'amix com 3 entradas');
  assert.ok(r.filter.includes('alimiter'), 'limitador contra clipping');
  assert.ok(r.filter.endsWith('[aout]'), 'saída rotulada [aout]');
});

test('buildSfxMix: volume varia com a intensidade e respeita o teto de eventos', () => {
  const suave = buildSfxMix([{ t: 0, type: 'pop' }], { intensity: 'suave' });
  const forte = buildSfxMix([{ t: 0, type: 'pop' }], { intensity: 'forte' });
  assert.ok(suave.filter.includes('volume=0.18'), 'pop suave mais baixo');
  assert.ok(forte.filter.includes('volume=0.5'), 'pop forte mais alto');

  const many = Array.from({ length: 200 }, (_, i) => ({ t: i * 0.1, type: 'pop' }));
  const capped = buildSfxMix(many, { max: 80 });
  assert.ok(capped.order.length === 80, 'limita a quantidade de eventos');
});
