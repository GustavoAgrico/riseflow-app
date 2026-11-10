import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPersonCrop, SPLIT_FACE_SHARE, SPLIT_FACE_Y, HEAD_ABOVE, HEAD_MARGIN } from '../../shared/splitFrame.js';
import { parseOptions } from '../src/routes/jobs.js';
import { subjectFromTrack } from '../src/pipeline/reframe.js';

// selfie vertical 1080x1920 → metade de baixo do 9:16 (1080x960)
const SRC = [1080, 1920];
const HALF = [1080, 960];

test('tela dividida: a pessoa PREENCHE a metade (sem faixa, sem fundo desfocado)', () => {
  const g = splitPersonCrop(...SRC, ...HALF, { x: 0.5, y: 0.33, h: 0.16 });
  assert.ok(g.scaledW >= HALF[0] && g.scaledH >= HALF[1]);
  assert.ok(g.cropX >= 0 && g.cropX + HALF[0] <= g.scaledW);
  assert.ok(g.cropY >= 0 && g.cropY + HALF[1] <= g.scaledH);
});

test('tela dividida: o rosto fica no tamanho certo e no lugar certo, qualquer que seja o zoom de antes', () => {
  for (const h of [0.08, 0.12, 0.16]) { // pessoa longe / média / perto da câmera
    const face = { x: 0.52, y: 0.33, h };
    const g = splitPersonCrop(...SRC, ...HALF, face);
    const s = g.scaledH / SRC[1];
    const faceH = (h * SRC[1] * s) / HALF[1];
    const faceY = (face.y * g.scaledH - g.cropY) / HALF[1];
    const faceX = (face.x * g.scaledW - g.cropX) / HALF[0];
    if (g.zoom > 1) assert.ok(Math.abs(faceH - SPLIT_FACE_SHARE) < 0.01, `rosto ${h}: ocupa ${faceH.toFixed(2)} da metade`);
    else assert.ok(faceH >= SPLIT_FACE_SHARE - 0.01, `rosto grande fica no tamanho dele (${faceH.toFixed(2)})`);
    assert.ok(Math.abs(faceY - SPLIT_FACE_Y) < 0.01, `centro do rosto a ${SPLIT_FACE_Y} da altura (${faceY.toFixed(2)})`);
    // no meio — ou o mais perto possível quando não sobra largura para os lados (sem zoom)
    assert.ok(Math.abs(faceX - 0.5) < 0.01 || g.cropX === 0 || g.cropX === g.scaledW - HALF[0], `rosto no meio (${faceX.toFixed(2)})`);
    // cabeça inteira: topo da cabeça (~0,6 do rosto acima do centro) dentro da metade
    assert.ok(faceY - 0.6 * faceH > 0, 'cabeça não sai pelo topo');
  }
});

test('tela dividida: rosto perto da borda não deixa faixa; sem rosto, centro um pouco acima', () => {
  const g = splitPersonCrop(...SRC, ...HALF, { x: 0.95, y: 0.05, h: 0.12 });
  assert.equal(g.cropY, 0);
  assert.equal(g.cropX, g.scaledW - HALF[0]);
  const n = splitPersonCrop(...SRC, ...HALF, null);
  assert.equal(n.zoom, 1);
  assert.equal(n.scaledW, 1080);
  // sem rosto: a trava supõe um rosto grande (centro 0,35, cabelo ~0,2 acima)
  assert.equal(n.cropY, Math.round(Math.min(0.35 * 1920 - 960 * SPLIT_FACE_Y, (0.35 - HEAD_ABOVE * 0.2) * 1920 - 960 * HEAD_MARGIN)));
  // vídeo horizontal (16:9) na metade: cobre pela altura e centraliza no rosto
  const w = splitPersonCrop(1920, 1080, ...HALF, { x: 0.3, y: 0.4, h: 0.25 });
  assert.ok(w.scaledH >= 960 && w.cropX >= 0 && w.cropX + 1080 <= w.scaledW);
});

test('splitFace da timeline passa pela validação das opções', () => {
  assert.deepEqual(parseOptions({ splitFace: { x: 0.4, y: 0.3, h: 0.15 } }).splitFace, { x: 0.4, y: 0.3, h: 0.15 });
  assert.equal(parseOptions({ splitFace: { x: 'a' } }).splitFace, undefined);
  assert.deepEqual(parseOptions({ splitFace: { x: 2, y: -1 } }).splitFace, { x: 1, y: 0 });
});

// ─── cabeça cortada na tela dividida (pessoa que gesticula) ───

test('tela dividida: o rosto vem só dos pontos de rosto, não do centro do movimento (mãos/peito)', () => {
  // rosto achado em 20% das amostras (y 0,30); no resto, o centro do movimento nas mãos (y 0,62)
  const points = [];
  const samples = [];
  for (let i = 0; i < 50; i++) {
    const face = i % 5 === 0;
    points.push({ t: i / 4, x: face ? 0.5 : 0.45, y: face ? 0.3 : 0.62, src: face ? 'face' : 'motion' });
    samples.push({ t: i / 4, faces: face ? [{ x: 0.5, y: 0.3, w: 0.2, h: 0.13 }] : [] });
  }
  const s = subjectFromTrack({ points, samples });
  assert.ok(s.y > 0.5, 'a média antiga caía no movimento');
  assert.equal(s.face.y, 0.3, 'o rosto de verdade');
  assert.equal(s.face.h, 0.13);
  // com o centro do movimento, a cabeça saía cortada; com o rosto, fica inteira e com folga
  const g = splitPersonCrop(...SRC, ...HALF, s.face);
  const headTop = ((s.face.y - HEAD_ABOVE * s.face.h) * g.scaledH - g.cropY) / HALF[1];
  assert.ok(headTop >= 0.04, `topo da cabeça dentro da metade (${headTop.toFixed(3)})`);
  // poucos pontos de rosto: nada de rosto inventado
  assert.equal(subjectFromTrack({ points: points.slice(1, 5), samples: [] }).face, null);
});

test('tela dividida: trava da cabeça mesmo com rosto alto e grande no quadro', () => {
  const face = { x: 0.5, y: 0.2, h: 0.2 }; // rosto grande, alto no vídeo
  const g = splitPersonCrop(...SRC, ...HALF, face);
  const headTop = ((face.y - HEAD_ABOVE * face.h) * g.scaledH - g.cropY) / HALF[1];
  assert.ok(headTop >= 0.04 - 1e-9 || g.cropY === 0, `cabeça inteira (${headTop.toFixed(3)})`);
});

test('tela dividida: o caso do print — rosto grande e baixo no quadro, cabelo inteiro na metade', () => {
  // medido no vídeo: topo do cabelo a 0,26, centro do rosto (caixa do detector) a 0,48, h 0,22
  const face = { x: 0.5, y: 0.48, h: 0.22 };
  const g = splitPersonCrop(...SRC, ...HALF, face);
  const hairTop = (0.26 * g.scaledH - g.cropY) / HALF[1];
  const chin = (0.59 * g.scaledH - g.cropY) / HALF[1];
  assert.ok(hairTop >= HEAD_MARGIN - 0.01, `cabelo dentro da metade (${hairTop.toFixed(3)})`);
  assert.ok(chin <= 0.85, `queixo com espaço embaixo (${chin.toFixed(3)})`);
});
