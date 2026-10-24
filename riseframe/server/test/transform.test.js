import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyAt, cleanKeys, keysChangeAnything, momentEffectAt, defaultMomentEffect } from '../../shared/transform.js';
import { momentsZoomVf, keyframesVf, dynamicZoomWindows } from '../src/pipeline/motion.js';

const meta = { width: 1080, height: 1920, fps: 30, duration: 10 };

test('keyAt: interpola entre quadros-chave e segura nas pontas', () => {
  const keys = cleanKeys([{ t: 4, scale: 2, x: 0.5, y: 0, rot: 90 }, { t: 2, scale: 1, x: 0, y: 0, rot: 0 }]);
  assert.deepEqual(keys.map((k) => k.t), [2, 4], 'ordena');
  assert.deepEqual(keyAt(keys, 0), { scale: 1, x: 0, y: 0, rot: 0 });
  assert.deepEqual(keyAt(keys, 3), { scale: 1.5, x: 0.25, y: 0, rot: 45 });
  assert.deepEqual(keyAt(keys, 9), { scale: 2, x: 0.5, y: 0, rot: 90 });
});

test('cleanKeys: limites e lixo', () => {
  const k = cleanKeys([{ t: 1, scale: 9, x: -5, rot: 999 }, { t: 'x' }, null]);
  assert.deepEqual(k, [{ t: 1, scale: 3, x: -1, y: 0, rot: 180 }]);
  assert.equal(keysChangeAnything(cleanKeys([{ t: 1 }, { t: 2 }])), false, 'só quadros neutros');
});

test('keyframesVf: nada a fazer → null; giro e encolher entram no filtro', () => {
  assert.equal(keyframesVf([], meta), null);
  assert.equal(keyframesVf([{ t: 1 }], meta), null);
  const grow = keyframesVf([{ t: 0, scale: 1 }, { t: 2, scale: 1.5 }], meta);
  assert.match(grow, /^zoompan=z='\(1\*\(/);
  assert.doesNotMatch(grow, /rotate|pad/);
  const both = keyframesVf([{ t: 0, scale: 1 }, { t: 2, scale: 0.5, rot: 30 }], meta);
  assert.match(both, /^rotate=a='.*\*PI\/180':c=black,pad=trunc\(iw\*2\/2\)\*2:trunc\(ih\*2\/2\)\*2:\(ow-iw\)\/2:\(oh-ih\)\/2:black,zoompan=z='\(2\*/);
  // mover além da sobra do zoom: moldura grande o bastante (a prévia deixa passar da borda)
  const moved = keyframesVf([{ t: 0, scale: 1.219, x: 0.1, y: 0.15 }], meta);
  assert.match(moved, /^pad=trunc\(iw\*1\.25\/2\)\*2:.*zoompan=z='\(1\.25\*/);
});

test('momentos: cada efeito só dentro da janela; padrão vem do efeito geral', () => {
  assert.equal(momentsZoomVf([], meta), null);
  const vf = momentsZoomVf([[1, 2, null, 'punch'], [3, 5, 1.3, 'ken-burns']], meta, 'medio');
  assert.ok(vf.includes('0.1200*between(on/30\\,1.00\\,2.00)'));
  assert.ok(vf.includes('between(on/30\\,3.00\\,5.00)*0.3000*((on/30-3.000)/2.000)'));
  assert.match(vf, /:x='iw\/2-\(iw\/zoom\/2\)\+between/, 'pan só no Ken Burns');
  assert.equal(defaultMomentEffect('dynamic'), 'punch');
  assert.equal(defaultMomentEffect('zoom-out'), 'zoom-out');
  const w = dynamicZoomWindows([], meta, [{ start: 1, end: 2 }, { start: 3, end: 4, effect: 'pulse' }], 'zoom-in');
  assert.deepEqual(w.map((x) => x[3]), ['zoom-in', 'pulse']);
});

test('momentEffectAt: a prévia usa a mesma conta do render', () => {
  assert.equal(momentEffectAt('zoom-in', 0.5, 0.2).dz, 0.1);
  assert.equal(momentEffectAt('zoom-out', 0.25, 0.2).dz.toFixed(2), '0.15');
  assert.equal(momentEffectAt('ken-burns', 0.5, 0.2).pan, 0.5);
  assert.equal(momentEffectAt('punch', 0.9, 0.2).dz, 0.2);
});

test('cleanKeys: dois quadros no mesmo instante → vale o último (o pedaço não desliza)', () => {
  // depois de cortar a pausa entre dois pedaços, o fim de um e o começo do outro se juntam
  const k = cleanKeys([{ t: 4.966, y: 0 }, { t: 5, y: 0 }, { t: 5, y: 0 }, { t: 5, y: 0.3 }, { t: 8, y: 0.3 }]);
  assert.deepEqual(k.map((x) => [x.t, x.y]), [[4.966, 0], [5, 0.3], [8, 0.3]]);
  assert.equal(keyAt(k, 6).y, 0.3, 'o pedaço já começa no valor dele');
});

test('cleanKeys: muitos pedaços com Transformar próprio não perdem os quadros do fim', () => {
  const raw = [];
  for (let i = 0; i < 40; i++) raw.push({ t: i * 2, y: 0 }, { t: i * 2 + 0.5, y: 0.1 * (i % 3) }, { t: i * 2 + 1.5, y: 0.1 * (i % 3) }, { t: i * 2 + 1.9, y: 0 });
  const k = cleanKeys(raw);
  assert.equal(k.length, 160);
  assert.equal(keyAt(k, 79).y, keyAt(raw.slice(-4), 79).y);
  // o filtro do render tira os quadros do meio que não mudam nada
  const vf = keyframesVf(raw, meta);
  assert.ok(vf.length < 60000, `filtro com ${vf.length} caracteres`);
});

test('keyExpr: a conta do render dá o mesmo valor da prévia (keyAt), com easing e hold', async () => {
  const { keyExpr } = await import('../src/pipeline/motion.js');
  const keys = cleanKeys([
    { t: 0, y: 0, scale: 1 }, { t: 1, y: 0.2, scale: 1.3, eo: true }, { t: 2, y: -0.1, scale: 1.1, ei: true },
    { t: 3, y: 0.05, hold: true }, { t: 4, y: 0.4, scale: 2 }, { t: 6, y: 0, scale: 1 },
  ]);
  const evalExpr = (e, T) => new Function('T', 'clip', 'gte', `return ${e.replaceAll('\\,', ',')};`)(T, (x, a, b) => Math.min(b, Math.max(a, x)), (a, b) => (a >= b ? 1 : 0));
  for (const prop of ['y', 'scale']) {
    const e = keyExpr(keys, prop, 'T');
    for (const T of [-1, 0, 0.3, 0.99, 1, 1.5, 2.5, 3.2, 3.99, 4.01, 5, 7]) {
      assert.ok(Math.abs(evalExpr(e, T) - keyAt(keys, T)[prop]) < 1e-3, `${prop} em ${T}: ${evalExpr(e, T)} ≠ ${keyAt(keys, T)[prop]}`);
    }
  }
});
