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
