import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motionVf, MOTIONS, MOTION_INTENSITY } from '../src/pipeline/motion.js';

const meta = { width: 1080, height: 1920, fps: 30, duration: 4 };

test('motionVf: none e desconhecido retornam null', () => {
  assert.equal(motionVf('none', meta), null);
  assert.equal(motionVf('xpto', meta), null);
});

test('motionVf: cada efeito gera um filtro zoompan com resolução preservada', () => {
  for (const k of MOTIONS.filter((m) => m !== 'none')) {
    const vf = motionVf(k, meta, 'medio');
    assert.ok(vf.startsWith('zoompan='), `${k} usa zoompan`);
    assert.ok(vf.includes('s=1080x1920'), `${k} preserva resolução`);
    assert.ok(vf.includes('fps=30'), `${k} define fps`);
  }
});

test('motionVf: intensidade forte amplia mais que suave', () => {
  const suave = motionVf('zoom-in', meta, 'suave');
  const forte = motionVf('zoom-in', meta, 'forte');
  assert.ok(suave.includes(String(MOTION_INTENSITY.suave)));
  assert.ok(forte.includes(String(MOTION_INTENSITY.forte)));
});

test('motionVf: zoom-in cresce e zoom-out decresce', () => {
  assert.ok(motionVf('zoom-in', meta).includes('min(1+'));
  assert.ok(motionVf('zoom-out', meta).includes('max('));
});
