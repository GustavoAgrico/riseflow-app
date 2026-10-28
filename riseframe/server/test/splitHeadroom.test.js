import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faceCropGeometry } from '../src/pipeline/broll.js';

test('tela dividida: a cabeça fica com folga acima do foco do rosto', () => {
  const sem = faceCropGeometry(1080, 1920, 1080, 960, { x: 0.5, y: 0.45 }, 1, 0);
  const com = faceCropGeometry(1080, 1920, 1080, 960, { x: 0.5, y: 0.45 }, 1, 0.12);
  assert.ok(com.cropY < sem.cropY, 'sobe o recorte para dar espaço no topo');
  assert.equal(sem.cropY - com.cropY, Math.round(0.12 * 960));
});

test('folga nunca passa do começo da imagem', () => {
  const g = faceCropGeometry(1080, 1920, 1080, 960, { x: 0.5, y: 0.05 }, 1, 0.12);
  assert.equal(g.cropY, 0);
});
