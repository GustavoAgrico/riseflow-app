import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motionVf, dynamicZoomVf, MOTIONS, MOTION_INTENSITY } from '../src/pipeline/motion.js';

const meta = { width: 1080, height: 1920, fps: 30, duration: 4 };

test('motionVf: none e desconhecido retornam null', () => {
  assert.equal(motionVf('none', meta), null);
  assert.equal(motionVf('xpto', meta), null);
});

test('motionVf: cada efeito (menos dynamic) gera um filtro zoompan com resolução preservada', () => {
  // 'dynamic' usa dynamicZoomVf (depende das frases), testado à parte.
  for (const k of MOTIONS.filter((m) => m !== 'none' && m !== 'dynamic')) {
    const vf = motionVf(k, meta, 'medio');
    assert.ok(vf.startsWith('zoompan='), `${k} usa zoompan`);
    assert.ok(vf.includes('s=1080x1920'), `${k} preserva resolução`);
    assert.ok(vf.includes('fps=30'), `${k} define fps`);
  }
});

test('dynamicZoomVf: punch em frases alternadas; poucas frases → null', () => {
  assert.equal(dynamicZoomVf([], meta), null);
  assert.equal(dynamicZoomVf([{ start: 0 }], meta), null);
  const segs = [{ start: 0 }, { start: 1 }, { start: 2 }, { start: 3 }];
  const vf = dynamicZoomVf(segs, meta, 'medio');
  assert.ok(vf.startsWith('zoompan='), 'usa zoompan');
  assert.ok(vf.includes('s=1080x1920'), 'preserva resolução');
  // punch nos índices ímpares: [1,2) e [3,4=dur)
  assert.ok(vf.includes('between(on/30\\,1.00\\,2.00)'), 'janela da 2ª frase');
  assert.ok(vf.includes('between(on/30\\,3.00\\,4.00)'), 'janela da 4ª frase (até o fim)');
  // fator de zoom = zmax-1 no médio
  assert.ok(vf.includes(String((MOTION_INTENSITY.medio - 1).toFixed(4))), 'usa o fator do médio');
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
