import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanLayerKf, kfValue, layerAt, kfExpr, upsertKey, shiftKf } from '../../shared/layerKeys.js';
import { visualLayerParts } from '../src/pipeline/overlay.js';

test('quadros-chave da camada: limpeza, valor no tempo e camada animada', () => {
  assert.equal(cleanLayerKf(null), null);
  assert.equal(cleanLayerKf({ scale: [] }), null);
  const kf = cleanLayerKf({ pos: [{ t: 2, v: [0.8, 0.5] }, { t: 0, v: [0.2, 0.5] }, { t: 'x', v: [0, 0] }], scale: [{ t: 0, v: 9 }], opacity: [{ t: 1, v: 0 }] });
  assert.deepEqual(kf.pos.map((k) => k.t), [0, 2]);
  assert.equal(kf.scale[0].v, 3); // limite
  assert.equal(kf.opacity[0].v, 0.1);
  assert.deepEqual(kfValue(kf.pos, 1), [0.5, 0.5]);
  assert.deepEqual(kfValue(kf.pos, -1), [0.2, 0.5]);
  assert.deepEqual(kfValue(kf.pos, 9), [0.8, 0.5]);
  // suave: no meio vale o mesmo, perto das pontas anda menos
  const ease = [{ t: 0, v: 0, ease: true }, { t: 1, v: 1 }];
  assert.equal(kfValue(ease, 0.5), 0.5);
  assert.ok(kfValue(ease, 0.1) < 0.1);
  // camada em tela cheia com posição animada vira livre
  const m = layerAt({ start: 10, mode: 'cover', scale: 0.4, kf }, 11);
  assert.equal(m.mode, 'pip');
  assert.deepEqual([m.cx, m.cy], [0.5, 0.5]);
});

test('quadros-chave: pôr/trocar quadro e deslocar ao aparar ou dividir', () => {
  const tr = upsertKey(upsertKey([], 1, 5), 0, 2);
  assert.deepEqual(tr, [{ t: 0, v: 2 }, { t: 1, v: 5 }]);
  assert.deepEqual(upsertKey(tr, 1.02, 7), [{ t: 0, v: 2 }, { t: 1.02, v: 7 }]);
  const moved = shiftKf({ rot: [{ t: 0, v: 0 }, { t: 2, v: 90 }] }, 1);
  assert.deepEqual(moved.rot, [{ t: 0, v: 45 }, { t: 1, v: 90 }]);
});

test('quadros-chave no render: expressões de posição, escala, giro e opacidade', () => {
  const e = kfExpr([{ t: 0, v: 0 }, { t: 2, v: 90 }], { start: 1 });
  assert.equal(e, 'if(lt((t-1),0),0,if(lt((t-1),2),0+(90)*(((t-1)-0)/2),90))');
  assert.equal(kfExpr([{ t: 0, v: 0.5 }]), '0.5');
  const kf = { pos: [{ t: 0, v: [0.3, 0.3] }, { t: 2, v: [0.7, 0.7] }], scale: [{ t: 0, v: 0.3 }, { t: 2, v: 0.6 }], rot: [{ t: 0, v: 0 }, { t: 2, v: 90 }], opacity: [{ t: 0, v: 0.2 }, { t: 1, v: 1 }] };
  const [chain, ov] = visualLayerParts([{ _inIdx: 1, start: 0.5, end: 3, d: 2.5, mode: 'cover', _aspect: 1, kf }], { W: 1080, H: 1920, fps: 30, dur: 3 });
  assert.match(chain, /scale=648:-2/); // base = maior escala (0,6)
  assert.match(chain, /geq=.*a='alpha\(X,Y\)\*\(if\(lt\(\(T-0\.5\)/);
  assert.match(chain, /rotate=a='\(if\(lt\(\(t-0\.5\).*\*PI\/180':ow='hypot\(iw,ih\)':oh='hypot\(iw,ih\)':c=black@0/);
  assert.match(chain, /scale=w='max\(2,round\(iw\*\(if\(/);
  assert.match(ov, /overlay=x='round\(\(if\(lt\(\(t-0\.5\),0\),0\.3/);
});

test('interpolação por quadro (Premiere): linear, Bezier, Ease In/Out e Manter', async () => {
  const { kfInterpOf, withInterp, remapKf } = await import('../../shared/layerKeys.js');
  const tr = (a) => [{ t: 0, v: 0, ...a }, { t: 1, v: 1 }];
  assert.equal(kfValue(tr({}), 0.25), 0.25);
  assert.ok(kfValue(tr({ eo: true }), 0.25) < 0.1, 'Ease Out: sai devagar');
  assert.ok(kfValue([{ t: 0, v: 0 }, { t: 1, v: 1, ei: true }], 0.75) > 0.9, 'Ease In: chega devagar');
  assert.equal(kfValue(tr({ hold: true }), 0.9), 0, 'Manter: segura até o próximo');
  assert.equal(kfInterpOf(withInterp({ t: 0, v: 0, ease: true }, 'bezier')), 'bezier');
  assert.deepEqual(withInterp({ t: 0, v: 0, ei: true, eo: true }, 'linear'), { t: 0, v: 0 });
  // render igual à prévia
  assert.match(kfExpr(tr({ hold: true })), /if\(lt\(\(t-0\),1\),0,1\)/);
  assert.match(kfExpr(tr({ eo: true })), /\*\(\(\(\(t-0\)-0\)\/1\)\*\(\(\(t-0\)-0\)\/1\)\)/);
  // `ease` antigo vira Ease Out neste e Ease In no próximo
  const c = cleanLayerKf({ rot: [{ t: 0, v: 0, ease: true }, { t: 1, v: 90 }] });
  assert.deepEqual(c.rot, [{ t: 0, v: 0, eo: true }, { t: 1, v: 90, ei: true }]);
  // corte de pausa dentro da camada: os quadros vão para o tempo cortado
  const keep = (t) => (t < 11 ? t : t < 12 ? 11 : t - 1); // 1 s cortado em [11, 12]
  const r = remapKf({ pos: [{ t: 0, v: [0, 0] }, { t: 2.5, v: [1, 1] }] }, 10, 10, keep);
  assert.deepEqual(r.pos.map((k) => k.t), [0, 1.5]);
});
