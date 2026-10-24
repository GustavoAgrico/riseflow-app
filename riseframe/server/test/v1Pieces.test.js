import { test } from 'node:test';
import assert from 'node:assert/strict';
import { v1PiecesOf } from '../../web/src/v1Pieces.js';

test('V1: cada trecho cortado separa o vídeo em pedaços (como os clipes do Premiere)', () => {
  const clips = [{ start: 0, end: 20 }];
  // vídeo de um clipe só, sem navalha, com duas pausas cortadas
  const p = v1PiecesOf(clips, [], [[4, 5], [9.5, 10]], 20);
  assert.deepEqual(p.map((x) => [x.va, x.vb]), [[0, 4], [5, 9.5], [10, 20]]);
  // navalha + corte colado e um corte que cobre o pedaço inteiro
  const q = v1PiecesOf(clips, [12], [[11, 12], [12, 12.5]], 20);
  assert.deepEqual(q.map((x) => [x.va, x.vb]), [[0, 11], [12.5, 20]]);
  assert.deepEqual(v1PiecesOf([], [], [], 10), []);
  // começo e fim cortados: ficam com o primeiro/último pedaço (nenhum quadro sem dono)
  const r = v1PiecesOf(clips, [], [[0, 1], [6, 7], [18, 20]], 20);
  assert.deepEqual(r.map((x) => [x.a, x.b, x.va, x.vb]), [[0, 6, 1, 6], [6, 20, 7, 18]]);
  assert.equal(r[r.length - 1].b, 20);
});

// Transformar por pedaço: ajustar pedaços em qualquer ordem não mexe nos outros, e a troca
// de um pedaço para o outro é seca (nenhum quadro "misturado" na emenda).
test('pieceKeys: cada pedaço fica com o seu valor, em qualquer ordem de ajuste', async () => {
  const { pieceKeys } = await import('../../web/src/v1Pieces.js');
  const { keyAt } = await import('../../shared/transform.js');
  const dur = 10;
  const pieces = v1PiecesOf([{ start: 0, end: dur }], [], [[0, 0.5], [4, 4.4], [7, 7.3]], dur);
  const yOf = (i) => 0.1 + 0.05 * i;
  const orders = [[0], [1], [0, 1], [1, 0], [0, 2], [2, 0], [0, 1, 2], [2, 1, 0], [1, 0, 2], [0, 2, 1], [1, 2, 0], [2, 0, 1]];
  for (const ord of orders) {
    let keys = [];
    for (const i of ord) keys = pieceKeys(keys, pieces[i].a, pieces[i].b, [{ t: pieces[i].a, scale: 1, x: 0, y: yOf(i), rot: 0 }], dur);
    for (let n = 0; n < dur * 30; n++) {
      const t = (n + 0.5) / 30;
      const i = pieces.findIndex((p) => t >= p.va && t < p.vb);
      if (i < 0) continue; // trecho cortado: não aparece
      const want = ord.includes(i) ? yOf(i) : 0;
      assert.ok(Math.abs(keyAt(keys, t).y - want) < 1e-9, `ordem ${ord} · t=${t.toFixed(3)} · y=${keyAt(keys, t).y} ≠ ${want}`);
    }
  }
});

test('keyAt: quadro Manter troca seco no instante do próximo quadro', async () => {
  const { keyAt } = await import('../../shared/transform.js');
  const keys = [{ t: 1, scale: 1, x: 0, y: 0.2, rot: 0, hold: true }, { t: 2, scale: 1, x: 0, y: 0, rot: 0 }];
  assert.equal(keyAt(keys, 1.999).y, 0.2);
  assert.equal(keyAt(keys, 2).y, 0);
});
