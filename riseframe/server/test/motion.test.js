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

test('dynamicZoomVf: zoom só nos momentos-chave; momentos da timeline têm prioridade', () => {
  assert.equal(dynamicZoomVf([], meta), null);
  const w = (start, text) => ({ start, end: start + 1.5, words: text.split(' ').map((word, i) => ({ word, start: start + i * 0.3, end: start + i * 0.3 + 0.25 })) });
  // frases coladas e comuns, uma com número depois de pausa (momento-chave)
  const segs = [w(0, 'oi tudo bem com você'), w(1.5, 'hoje eu vou falar'), w(3.0, 'de um assunto legal'), w(8.0, 'são 3 passos simples')];
  const vf = dynamicZoomVf(segs, { ...meta, duration: 12 }, 'medio');
  assert.ok(vf.startsWith('zoompan='), 'usa zoompan');
  assert.ok(vf.includes('s=1080x1920'), 'preserva resolução');
  assert.ok(vf.includes('between(on/30\\,8.00\\,9.50)'), 'zoom no momento com número após pausa');
  assert.ok(!vf.includes('between(on/30\\,1.50'), 'não dá zoom em frase comum colada');
  assert.ok(vf.includes(String((MOTION_INTENSITY.medio - 1).toFixed(4))), 'usa o fator do médio');
  // momentos definidos na timeline (com zoom próprio) substituem o automático
  const custom = dynamicZoomVf(segs, { ...meta, duration: 12 }, 'medio', [{ start: 1, end: 2, scale: 1.3 }]);
  assert.ok(custom.includes('0.3000*between(on/30\\,1.00\\,2.00)'), custom);
  assert.equal(dynamicZoomVf(segs, meta, 'medio', []), null, 'usuário tirou todos os zooms');
  // zooms sobrepostos não somam: o segundo começa onde o primeiro termina
  const ov = dynamicZoomVf(segs, { ...meta, duration: 12 }, 'medio', [{ start: 0, end: 1.8 }, { start: 1.4, end: 2.9 }]);
  assert.ok(ov.includes('between(on/30\\,1.80\\,2.90)'), ov);
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
