import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faceFocus, headBox, brollRegionAspect } from '../../shared/brollFocus.js';
import { isPublicUrl } from '../src/pipeline/brollFaces.js';
import { parseOptions } from '../src/routes/jobs.js';

// Parte visível da imagem (normalizada) com o recorte "cobre" no ponto fx/fy — a mesma conta
// do render (crop=(iw-ow)*fx:(ih-oh)*fy) e da prévia (object-position).
function visible(srcAspect, regionAspect, f, zoom = 1) {
  const s = Math.max(regionAspect / srcAspect, 1);
  const vx = Math.min(1, regionAspect / (srcAspect * s * zoom));
  const vy = Math.min(1, 1 / (s * zoom));
  return { x0: f.fx * (1 - vx), x1: f.fx * (1 - vx) + vx, y0: f.fy * (1 - vy), y1: f.fy * (1 - vy) + vy };
}

test('área do B-roll por layout', () => {
  assert.equal(brollRegionAspect('top', 9 / 16), 9 / 8); // metade de cima do 9:16
  assert.equal(brollRegionAspect('fullscreen', 9 / 16), 9 / 16);
  assert.equal(brollRegionAspect('cartoes', 9 / 16), 0.8);
});

test('tela dividida: foto em pé com o rosto no alto — a cabeça fica inteira (antes: cortada)', () => {
  // foto 3:4 em pé, rosto perto do topo (como a do print: homem com microfone)
  const det = { aspect: 0.75, faces: [{ x: 0.35, y: 0.12, w: 0.3, h: 0.22 }] };
  const ar = brollRegionAspect('top', 9 / 16);
  const f = faceFocus(det, ar);
  const v = visible(0.75, ar, f);
  const head = headBox(det.faces);
  assert.ok(v.y0 <= head.y, `topo da cabeça visível (recorte em ${v.y0.toFixed(3)}, cabeça em ${head.y.toFixed(3)})`);
  assert.ok(v.y1 >= head.y + head.h, 'queixo visível');
  // o recorte central de antes cortava o topo da cabeça
  const old = visible(0.75, ar, { fx: 0.5, fy: 0.5 });
  assert.ok(old.y0 > head.y, 'o centro cortava a cabeça (regressão do print)');
});

test('foto larga: o recorte acompanha o rosto na horizontal; com zoom continua no rosto', () => {
  const det = { aspect: 16 / 9, faces: [{ x: 0.08, y: 0.3, w: 0.12, h: 0.2 }] };
  const ar = brollRegionAspect('fullscreen', 9 / 16);
  const f = faceFocus(det, ar);
  const v = visible(16 / 9, ar, f);
  assert.ok(v.x0 <= 0.08 && v.x1 >= 0.2, `rosto dentro do quadro (${v.x0.toFixed(3)}–${v.x1.toFixed(3)})`);
  const z = faceFocus(det, ar, 2);
  const vz = visible(16 / 9, ar, z, 2);
  assert.ok(vz.x0 <= 0.08 + 0.001 && vz.x1 >= 0.2, 'com zoom 2× o rosto continua no quadro');
});

test('rostos pequenos do fundo não puxam o recorte; sem rosto não muda nada', () => {
  const box = headBox([{ x: 0.4, y: 0.2, w: 0.3, h: 0.3 }, { x: 0.9, y: 0.8, w: 0.05, h: 0.05 }]);
  assert.ok(box.x >= 0.4 && box.x + box.w <= 0.71, JSON.stringify(box));
  assert.equal(faceFocus({ aspect: 1, faces: [] }, 1.125), null);
  assert.equal(faceFocus(null, 1.125), null);
});

test('rota de rostos só aceita endereço público', () => {
  assert.equal(isPublicUrl('https://images.pexels.com/photos/1/a.jpg'), true);
  for (const u of ['http://localhost:4000/x', 'http://127.0.0.1/x', 'http://10.0.0.2/x', 'http://192.168.1.1/x', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'http://[::1]/x', 'https://user:pw@example.com/x', 'http://svc.internal/x']) {
    assert.equal(isPublicUrl(u), false, u);
  }
});

test('plano do B-roll: sem ponto de foco o render enquadra pelo rosto (não força o centro)', () => {
  const o = parseOptions({ brollPlan: [{ start: 1, end: 3, url: 'https://x.com/a.jpg', kind: 'image' }, { start: 4, end: 6, url: 'https://x.com/b.jpg', fx: 0.2, fy: 0.1 }] });
  assert.equal(o.brollPlan[0].fx, undefined);
  assert.equal(o.brollPlan[0].fy, undefined);
  assert.equal(o.brollPlan[1].fx, 0.2);
  assert.equal(o.brollPlan[1].fy, 0.1);
});

test('plano do B-roll: imagem do Google em site http entra (antes era descartada sem aviso)', () => {
  const o = parseOptions({ brollPlan: [
    { start: 1, end: 3, url: 'http://www.site-sem-https.com.br/foto.jpg', thumb: 'https://encrypted-tbn0.gstatic.com/images?q=x', kind: 'image' },
    { start: 4, end: 6, url: 'http://192.168.0.10/interno.jpg', thumb: 'https://encrypted-tbn0.gstatic.com/images?q=y', kind: 'image' },
    { start: 7, end: 9, url: 'http://localhost:4000/x.jpg', kind: 'image' },
  ] });
  assert.equal(o.brollPlan[0].url, 'http://www.site-sem-https.com.br/foto.jpg');
  // endereço interno é recusado; com miniatura pública, a miniatura entra no lugar
  assert.equal(o.brollPlan[1].url, 'https://encrypted-tbn0.gstatic.com/images?q=y');
  assert.equal(o.brollPlan[2].url, undefined);
});
