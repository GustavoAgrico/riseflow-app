import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shadowParams, shadowGeometry, shadowDialogue } from '../../shared/captionShadow.js';
import { buildAss } from '../src/pipeline/captions.js';

test('sombra projetada: ângulo do Photoshop, expansão e multiplicação', () => {
  const g = shadowGeometry(shadowParams({ captionShadowAngle: 120, captionShadowDistance: 10, captionShadowBlur: 8, captionShadowSpread: 25, captionShadowOpacity: 0.5 }), 2);
  assert.ok(g.dx > 9.9 && g.dx < 10.1 && g.dy > 17.3 && g.dy < 17.4); // luz de cima à esquerda → sombra para baixo à direita
  assert.equal(g.spread, 4);
  assert.equal(g.blur, 12);
  assert.equal(g.opacity, 0.5); // preta: multiplicação = normal
  const white = shadowGeometry(shadowParams({ captionShadowColor: 'FFFFFF', captionShadowOpacity: 1, captionShadowDistance: 5 }));
  assert.ok(white.opacity < 0.2); // branca multiplicando quase não aparece
  // projeto antigo (só distância % e intensidade): sombra dura a 135°
  const old = shadowParams({ captionShadowSize: 2, captionShadowOpacity: 0.7 });
  assert.deepEqual([old.angle, old.distance, old.size, old.opacity], [135, 10, 0, 0.7]);
});

test('sombra projetada: cópia do texto por baixo, deslocada, sem a sombra própria', () => {
  const line = 'Dialogue: 1,0:00:01.00,0:00:02.00,Rise,,0,0,0,,{\\pos(540,1500)\\bord4\\shad3\\c&H00FFFF&}Oi {\\1a&HFF&\\t(0,150,\\1a&H00&)}tudo';
  const out = shadowDialogue(line, { bgr: '000000', alpha: '80', dx: 10, dy: -5, spread: 2, blur: 6, outline: 4 });
  assert.match(out, /^Dialogue: 0,/);
  assert.match(out, /\\pos\(550,1495\)/);
  assert.match(out, /\\bord6/);
  assert.match(out, /\\c&H000000&/);
  assert.match(out, /\\1a&HFF&\\t\(0,150,\\1a&H80&\)/); // escondida continua escondida; a animação entra na sombra
  assert.doesNotMatch(out, /\\shad3/);
  const ass = buildAss([{ start: 0, end: 2, text: 'Oi tudo', words: [{ start: 0, end: 1, word: 'Oi' }, { start: 1, end: 2, word: 'tudo' }] }], { width: 1080, height: 1920 },
    { template: 'clean', shadowMode: 'on', shadowAngle: 90, shadowDistance: 20, shadowBlur: 4, shadowOpacity: 1, shadowBlend: 'normal', shadowColor: 'FF0000' });
  const ev = ass.split('\n').filter((l) => l.startsWith('Dialogue'));
  assert.ok(ev.length >= 2 && ev[0].includes('\\1c&H0000FF&')); // a sombra (vermelha, em BGR) vem antes do texto
});
