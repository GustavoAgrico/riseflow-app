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
    // centro do rosto a SPLIT_FACE_Y — ou um pouco abaixo quando a trava da cabeça desce o quadro
    assert.ok(faceY >= SPLIT_FACE_Y - 0.01 && faceY <= SPLIT_FACE_Y + 0.05, `centro do rosto perto de ${SPLIT_FACE_Y} (${faceY.toFixed(2)})`);
    assert.ok(faceY - HEAD_ABOVE * faceH >= HEAD_MARGIN - 0.005, 'topo do cabelo com folga');
    // no meio — ou o mais perto possível quando não sobra largura para os lados (sem zoom)
    assert.ok(Math.abs(faceX - 0.5) < 0.01 || g.cropX === 0 || g.cropX === g.scaledW - HALF[0], `rosto no meio (${faceX.toFixed(2)})`);
    // cabeça inteira: topo da cabeça (~0,6 do rosto acima do centro) dentro da metade
    assert.ok(faceY - 0.6 * faceH > 0, 'cabeça não sai pelo topo');
  }
});

test('tela dividida: rosto perto da borda não deixa faixa; sem rosto, mostra o topo', () => {
  const g = splitPersonCrop(...SRC, ...HALF, { x: 0.95, y: 0.05, h: 0.12 });
  assert.equal(g.cropY, 0);
  assert.equal(g.cropX, g.scaledW - HALF[0]);
  const n = splitPersonCrop(...SRC, ...HALF, null);
  assert.equal(n.zoom, 1);
  assert.equal(n.scaledW, 1080);
  // sem rosto (sem Python/OpenCV no PC): mostra o topo do vídeo, onde fica a cabeça
  assert.equal(n.cropY, 0);
  assert.equal(n.anchorY, 0);
  assert.equal(splitPersonCrop(...SRC, ...HALF, { x: 0.4 }).cropY, 0, 'só x, sem y: também o topo');
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
  // rosto grande e baixo (centro 0,48, h 0,22); cabelo até 0,8 rosto acima do centro
  // (o do usuário, medido no vídeo dele, fica a 0,64)
  const face = { x: 0.5, y: 0.48, h: 0.22 };
  const g = splitPersonCrop(...SRC, ...HALF, face);
  const hairTop = ((0.48 - 0.8 * 0.22) * g.scaledH - g.cropY) / HALF[1];
  const chin = (0.59 * g.scaledH - g.cropY) / HALF[1];
  assert.ok(hairTop >= HEAD_MARGIN - 0.01, `cabelo dentro da metade (${hairTop.toFixed(3)})`);
  assert.ok(chin <= 0.85, `queixo com espaço embaixo (${chin.toFixed(3)})`);
});

test('tela dividida: o zoom dos momentos mantém o cabelo E o queixo na metade (punch)', async () => {
  const { momentsZoomVf } = await import('../src/pipeline/motion.js');
  // rosto médio, grande, e o do usuário (medido): no zoom máximo do momento (1,25), o cabelo
  // (0,64 rosto acima do centro) e o queixo (0,5 abaixo) continuam dentro
  for (const face of [{ x: 0.5, y: 0.45, h: 0.12 }, { x: 0.5, y: 0.45, h: 0.2 }, { x: 0.503, y: 0.461, h: 0.273 }]) {
    const gg = splitPersonCrop(...SRC, ...HALF, face);
    const at = (v) => (v * gg.scaledH - gg.cropY) / HALF[1];
    const zoomed = (y) => gg.anchorY + (y - gg.anchorY) * 1.25;
    assert.ok(zoomed(at(face.y - 0.64 * face.h)) >= 0, `h ${face.h}: cabelo dentro no punch (${zoomed(at(face.y - 0.64 * face.h)).toFixed(3)})`);
    assert.ok(zoomed(at(face.y + 0.5 * face.h)) <= 1, `h ${face.h}: queixo dentro no punch (${zoomed(at(face.y + 0.5 * face.h)).toFixed(3)})`);
  }
  const face = { x: 0.5, y: 0.45, h: 0.2 };
  const g = splitPersonCrop(...SRC, ...HALF, face);
  // com zoom z em volta da âncora, o topo da cabeça fica no mesmo lugar (não sai da metade)
  const vf = momentsZoomVf([[1, 2, 1.2, 'punch']], { width: 1080, height: 960, fps: 30 }, 'forte', { anchorY: g.anchorY });
  assert.match(vf, new RegExp(`y='\\(ih-ih/zoom\\)\\*${g.anchorY.toFixed(4)}`));
  // padrão (vídeo inteiro): continua centralizado, igual a antes
  assert.match(momentsZoomVf([[1, 2, 1.2, 'punch']], { width: 1080, height: 1920, fps: 30 }), /y='ih\/2-\(ih\/zoom\/2\)'/);
});

test('tela dividida sem rastreador: quem deu zoom no rosto antes não tem a cabeça cortada (print)', () => {
  // vídeo já ampliado no rosto: cabelo começa a ~5% do topo do vídeo. Sem o rastreador
  // (app de PC sem OpenCV), o padrão antigo começava o recorte a 12% e cortava o cabelo.
  const hairTop = 0.05;
  const g = splitPersonCrop(...SRC, ...HALF, null);
  assert.ok(g.cropY / g.scaledH <= hairTop, `recorte começa em ${(g.cropY / g.scaledH).toFixed(3)}`);
  const oldCrop = Math.min(0.35 * 1920 - 960 * 0.4, (0.35 - 0.2) * 1920 - 960 * 0.06) / 1920;
  assert.ok(oldCrop > hairTop, 'o padrão antigo cortava (regressão do print)');
});

test('tela dividida: cabelo volumoso (topo a 0,8 rosto do centro) fica inteiro com o rosto detectado', () => {
  for (const face of [{ x: 0.5, y: 0.3, h: 0.15 }, { x: 0.5, y: 0.25, h: 0.2 }, { x: 0.5, y: 0.4, h: 0.08 }]) {
    const g = splitPersonCrop(...SRC, ...HALF, face);
    const top = ((face.y - 0.8 * face.h) * g.scaledH - g.cropY) / HALF[1];
    assert.ok(top >= 0.03, `${JSON.stringify(face)}: topo do cabelo em ${top.toFixed(3)} da metade`);
  }
});

test('rastreador indisponível: o motivo vira aviso na tela (Python / OpenCV)', async () => {
  const { trackerProblem } = await import('../src/pipeline/reframe.js');
  assert.equal(trackerProblem('Python não encontrado no PATH (instale Python 3 ou defina PYTHON_BIN)'), 'python');
  assert.equal(trackerProblem('opencv indisponível'), 'opencv');
  assert.equal(trackerProblem('opencv sem CascadeClassifier (use opencv-python-headless 4.x)'), 'opencv');
  assert.equal(trackerProblem("ModuleNotFoundError: No module named 'cv2'"), 'opencv');
  assert.equal(trackerProblem('tracker code 9'), 'erro');
});

test('tela dividida: o ponto do zoom escolhido na criação não vira posição do rosto (print)', async () => {
  const { splitFaceFor } = await import('../../shared/splitFrame.js');
  // rosto alto e grande (como no print); o zoom da criação ficou no ponto padrão 0,5 × 0,4
  const tracked = { x: 0.5, y: 0.24, h: 0.13 };
  const f = splitFaceFor(tracked, 0.5, 0.4);
  assert.equal(f.y, 0.24, 'vale o rosto detectado');
  const g = splitPersonCrop(...SRC, ...HALF, f);
  const headTop = ((tracked.y - 0.8 * tracked.h) * g.scaledH - g.cropY) / HALF[1];
  assert.ok(headTop >= 0, `cabeça inteira (topo em ${headTop.toFixed(3)})`);
  // antes: o ponto do zoom (0,4) era tratado como o rosto e o recorte descia sobre a cabeça
  const old = splitPersonCrop(...SRC, ...HALF, { x: 0.5, y: 0.4, h: tracked.h });
  const oldTop = ((tracked.y - 0.8 * tracked.h) * old.scaledH - old.cropY) / HALF[1];
  assert.ok(oldTop < 0, `antes cortava (topo em ${oldTop.toFixed(3)})`);
  // sem rosto, o foco manual ainda serve; sem nada, null (a metade mostra o topo)
  assert.deepEqual(splitFaceFor(null, 0.3, 0.2), { x: 0.3, y: 0.2, source: 'manual' });
  assert.equal(splitFaceFor(null, undefined, undefined), null);
});

test('tela dividida: cada momento de B-roll é enquadrado no rosto DAQUELE trecho (pessoa se mexe)', async () => {
  const { splitFaceInWindow } = await import('../../shared/splitFrame.js');
  // 0–6 s: recostado (rosto pequeno, baixo); 6–12 s: inclinado para a câmera (grande, alto)
  const track = [];
  for (let t = 0; t < 12; t += 0.5) track.push(t < 6 ? { t, x: 0.5, y: 0.5, h: 0.09 } : { t, x: 0.5, y: 0.3, h: 0.2 });
  const whole = subjectFromTrack({
    points: track.map((p) => ({ t: p.t, x: p.x, y: p.y, src: 'face' })),
    samples: track.map((p) => ({ t: p.t, faces: [{ x: p.x, y: p.y, w: p.h, h: p.h }] })),
  });
  assert.equal(whole.track.length, track.length, 'o rastreador devolve o rosto no tempo');
  const place = (face, f) => {
    const g = splitPersonCrop(...SRC, ...HALF, face);
    return {
      center: (f.y * g.scaledH - g.cropY) / HALF[1],
      head: ((f.y - 0.8 * f.h) * g.scaledH - g.cropY) / HALF[1],
      chin: ((f.y + 0.5 * f.h) * g.scaledH - g.cropY) / HALF[1],
    };
  };
  for (const [a, b, f] of [[1, 4, track[2]], [7, 10, track[16]]]) {
    const w = splitFaceInWindow(whole.track, a, b, whole.face);
    const p = place(w, f);
    assert.ok(p.head >= 0, `${a}–${b}s: cabeça inteira (${p.head.toFixed(3)})`);
    assert.ok(p.chin <= 1, `${a}–${b}s: queixo dentro (${p.chin.toFixed(3)})`);
    assert.ok(p.center > 0.25 && p.center < 0.65, `${a}–${b}s: rosto no meio da metade (${p.center.toFixed(3)})`);
  }
  // um enquadramento só (o do vídeo todo) deixava o rosto recostado lá embaixo ou cortava a cabeça
  const single = [place(whole.face, track[2]), place(whole.face, track[16])];
  assert.ok(single.some((p) => p.head < 0 || p.center > 0.65), JSON.stringify(single));
  // trecho sem rosto rastreado (e longe de qualquer amostra): o rosto do vídeo
  assert.equal(splitFaceInWindow(whole.track, 40, 43, whole.face), whole.face);
  assert.equal(splitFaceInWindow([], 1, 2, null), null);
});

test('tela dividida: rosto grande (medido no vídeo do usuário) fica no meio, com cabelo e queixo', () => {
  // quadro do vídeo do usuário (480×853): rosto [125, 277, 233, 233], topo do cabelo em y=244
  const face = { x: (125 + 116.5) / 480, y: (277 + 116.5) / 853, h: 233 / 853 };
  const hair = 244 / 853;
  const chin = (277 + 233) / 853;
  const g = splitPersonCrop(...SRC, ...HALF, face);
  const at = (v) => (v * g.scaledH - g.cropY) / HALF[1];
  assert.ok(at(hair) >= 0.03, `cabelo inteiro (${at(hair).toFixed(2)})`);
  assert.ok(at(hair) <= 0.25, `sem cenário demais em cima (${at(hair).toFixed(2)}; antes 0,37)`);
  assert.ok(at(chin) <= 0.88, `queixo com folga (${at(chin).toFixed(2)}; antes 0,99)`);
  assert.ok(at(face.y) > 0.4 && at(face.y) < 0.6, `rosto no meio (${at(face.y).toFixed(2)}; antes 0,72)`);
});

// ─── zoom no rosto do vídeo inteiro (tela cheia) ───
test('tela cheia com zoom: qualquer zoom escolhido mostra a cabeça e o queixo (rosto do usuário)', async () => {
  const { fullFaceCrop, FULL_TOP_MARGIN } = await import('../../shared/splitFrame.js');
  // rosto medido no vídeo do usuário (caixa do detector) e o topo real do cabelo (0,64 rosto acima)
  const face = { x: 0.503, y: 0.461, h: 0.273 };
  const hair = face.y - 0.64 * face.h;
  const chin = face.y + 0.5 * face.h;
  for (const z of [1.1, 1.3, 1.8, 2.5]) {
    const g = fullFaceCrop(1080, 1920, 1080, 1920, face, z);
    const at = (v) => (v * g.scaledH - g.cropY) / 1920;
    assert.ok(at(hair) >= FULL_TOP_MARGIN * 0.5, `zoom ${z}: cabelo inteiro (${at(hair).toFixed(3)})`);
    assert.ok(at(chin) <= 0.95, `zoom ${z}: queixo dentro (${at(chin).toFixed(3)})`);
    assert.ok(g.zoom <= z + 1e-9 && g.zoom >= 1, `zoom ${g.zoom}`);
  }
  // o zoom alto é limitado (a cabeça não cabe em 2,5×); o baixo fica como pedido
  assert.ok(fullFaceCrop(1080, 1920, 1080, 1920, face, 2.5).zoom < 2.5);
  // rosto pequeno: o zoom pedido entra inteiro, com o rosto acima do meio
  const small = { x: 0.5, y: 0.4, h: 0.1 };
  const gs = fullFaceCrop(1080, 1920, 1080, 1920, small, 1.5);
  assert.equal(gs.zoom, 1.5);
  const cy = (small.y * gs.scaledH - gs.cropY) / 1920;
  assert.ok(cy > 0.35 && cy < 0.5, `rosto um pouco acima do meio (${cy.toFixed(3)})`);
  // sem rosto: null (quem chama usa o padrão)
  assert.equal(fullFaceCrop(1080, 1920, 1080, 1920, null, 1.5), null);
});

test('tela cheia com zoom: quem se inclina para a câmera em alguns momentos não tem a cabeça cortada', async () => {
  const { fullFaceCrop } = await import('../../shared/splitFrame.js');
  const track = [];
  for (let t = 0; t < 60; t += 1) track.push(t % 10 < 7 ? { t, x: 0.5, y: 0.42, h: 0.12 } : { t, x: 0.5, y: 0.3, h: 0.22 });
  const g = fullFaceCrop(1080, 1920, 1080, 1920, { x: 0.5, y: 0.42, h: 0.12, track }, 2);
  const lean = track.find((p) => p.h === 0.22);
  const hairLean = ((lean.y - 0.75 * lean.h) * g.scaledH - g.cropY) / 1920;
  assert.ok(hairLean >= 0, `inclinado: cabeça dentro (${hairLean.toFixed(3)})`);
  // antes (centro do rosto no meio, zoom 2×): a cabeça inclinada saía do quadro
  const s = 2;
  const oldCrop = Math.max(0, 0.42 * 1920 * s - 960);
  assert.ok(((lean.y - 0.75 * lean.h) * 1920 * s - oldCrop) / 1920 < 0);
});

test('tela dividida: rosto que já enche a metade fica sem o zoom do momento (o queixo saía)', () => {
  // inclinado para a câmera: rosto enorme na metade
  const big = splitPersonCrop(...SRC, ...HALF, { x: 0.5, y: 0.4, h: 0.32 });
  assert.equal(big.punchOk, false);
  // rosto normal: o zoom do momento continua
  assert.equal(splitPersonCrop(...SRC, ...HALF, { x: 0.5, y: 0.4, h: 0.12 }).punchOk, true);
});

test('tela dividida: rosto do usuário sobe (menos cenário em cima) — print 0:21', () => {
  // rosto medido no vídeo do usuário; cabelo real a 0,64 rosto acima do centro
  const face = { x: 0.503, y: 0.461, h: 0.273 };
  const g = splitPersonCrop(...SRC, ...HALF, face);
  const at = (v) => (v * g.scaledH - g.cropY) / HALF[1];
  assert.ok(at(face.y - 0.64 * face.h) >= 0.03, `cabelo inteiro (${at(face.y - 0.64 * face.h).toFixed(3)})`);
  assert.ok(at(face.y - 0.64 * face.h) <= 0.16, `pouco cenário em cima (${at(face.y - 0.64 * face.h).toFixed(3)}; antes ~0,28)`);
  assert.ok(at(face.y + 0.5 * face.h) <= 0.82, `queixo com folga (${at(face.y + 0.5 * face.h).toFixed(3)})`);
});
