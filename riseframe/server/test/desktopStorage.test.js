import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotStorage, restoreStorage } from '../../web/src/desktopStorage.js';

function mem(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}

test('cópia leva as preferências do Riseframe e deixa rascunhos/envios de fora', () => {
  const ls = mem({
    riseframe_brands: '{"brands":[1]}', riseframe_flows: '[]', riseframe_token: 'tok', rf_snap: '1',
    'rf-edit:abc': 'x'.repeat(10), 'rf-up:a.mp4:1:2': 'id', outra_coisa: 'y',
  });
  assert.deepEqual(Object.keys(snapshotStorage(ls)).sort(), ['rf_snap', 'riseframe_brands', 'riseframe_flows', 'riseframe_token']);
});

test('restaura só o que falta, sem sobrescrever', () => {
  const ls = mem({ riseframe_flows: 'novo' });
  const n = restoreStorage(ls, { riseframe_flows: 'velho', riseframe_brands: 'marca', 'rf-edit:1': 'r', lixo: 'z', rf_snap: 5 });
  assert.equal(n, 1);
  assert.equal(ls.getItem('riseframe_flows'), 'novo');
  assert.equal(ls.getItem('riseframe_brands'), 'marca');
  assert.equal(ls.getItem('rf-edit:1'), null);
  assert.equal(ls.getItem('lixo'), null);
  assert.equal(restoreStorage(ls, null), 0);
});
