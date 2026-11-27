import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PACK_ITEMS, PACK_CATEGORIES, buildPackLayers, fontPackLook, textWidth, fitSize } from '../../shared/libraryPacks.js';
import { cleanTextLayers, shapeFrame, SHAPE_REVEALS, TEXT_ANIMS_IN, letterFrame, LETTER_SAMPLED, WORD_SAMPLED } from '../../shared/textLayers.js';
import { CAPTION_FONTS } from '../src/pipeline/captions.js';
import { buildTextAss } from '../src/pipeline/texts.js';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';
import { tmpDir } from '../testkit/tmp.js';

const FONT_IDS = Object.keys(CAPTION_FONTS);
const ARS = { '9:16': 9 / 16, '16:9': 16 / 9, '1:1': 1 };

test('biblioteca: as três categorias têm modelos, com ids únicos', () => {
  for (const c of PACK_CATEGORIES) assert.ok(PACK_ITEMS.filter((x) => x.cat === c.id).length >= 10, c.id);
  assert.equal(new Set(PACK_ITEMS.map((x) => x.id)).size, PACK_ITEMS.length);
});

test('cada modelo vira camadas válidas em todos os formatos (nada é descartado na limpeza)', () => {
  for (const it of PACK_ITEMS) {
    for (const [name, ar] of Object.entries(ARS)) {
      const ls = buildPackLayers(it.id, { t: 2, ar });
      assert.ok(ls.length >= 1, `${it.id} ${name}`);
      const clean = cleanTextLayers(ls, FONT_IDS, 400);
      assert.equal(clean.length, ls.length, `${it.id} ${name}: camadas descartadas`);
      for (const l of clean) {
        assert.ok(l.start >= 2 && l.end <= 2 + it.dur + 1e-9, `${it.id} tempo`);
        if (l.kind === 'shape') {
          // a forma cabe no quadro (com uma folga mínima)
          assert.ok(l.x - l.w / 2 >= -0.011 && l.x + l.w / 2 <= 1.011, `${it.id} ${name}: forma sai pelos lados`);
          assert.ok(l.y - l.h / 2 >= -0.01 && l.y + l.h / 2 <= 1.01, `${it.id} ${name}: forma sai por cima/baixo`);
        } else {
          assert.ok(FONT_IDS.includes(l.font), `${it.id}: fonte ${l.font}`);
          assert.ok(TEXT_ANIMS_IN[l.animIn], `${it.id}: animação ${l.animIn}`);
          const w = textWidth(l.text, l.size, l.font, ar, l.tracking || 0);
          assert.ok(l.x - w / 2 >= -0.02 && l.x + w / 2 <= 1.02, `${it.id} ${name}: texto sai da tela (${w.toFixed(2)} em x=${l.x})`);
        }
      }
    }
  }
});

test('modelos: começam no ponto pedido, escalonados, e param no fim do vídeo', () => {
  const ls = buildPackLayers('nome-caixas', { t: 10, ar: 9 / 16 });
  assert.equal(Math.min(...ls.map((l) => l.start)), 10);
  assert.ok(ls.some((l) => l.start > 10), 'algumas camadas entram depois (escalonado)');
  const cut = buildPackLayers('titulo-cinema', { t: 10, ar: 9 / 16, maxEnd: 11 });
  assert.ok(cut.every((l) => l.end <= 11));
  assert.deepEqual(buildPackLayers('nao-existe', {}), []);
});

test('fontes animadas: aparência aplicável num texto existente', () => {
  const look = fontPackLook('fa-mola');
  assert.equal(look.font, 'anton');
  assert.equal(look.animIn, 'letras-mola');
  assert.equal(look.text, undefined, 'não troca o texto da pessoa');
  assert.equal(fontPackLook('x'), null);
});

test('encaixe: fitSize diminui o texto que não cabe', () => {
  const s = fitSize('UM TEXTO BEM COMPRIDO PARA CABER', 0.1, 'archivo', 9 / 16);
  assert.ok(s < 0.1);
  assert.ok(textWidth('UM TEXTO BEM COMPRIDO PARA CABER', s, 'archivo', 9 / 16) <= 0.861);
});

test('letras novas (deslizar, impacto, elástico): começam fora do lugar e assentam', () => {
  for (const id of ['letras-deslizar', 'letras-impacto', 'letras-elastico']) {
    assert.ok(LETTER_SAMPLED.includes(id) && TEXT_ANIMS_IN[id], id);
    assert.ok(WORD_SAMPLED.includes(id.replace('letras-', 'palavras-')), id);
    const f0 = letterFrame(id, 0);
    assert.ok(Math.abs(f0.dx || 0) + Math.abs(f0.dy) + Math.abs(f0.scale - 1) > 0.05, `${id} começa deslocada`);
  }
  assert.ok(letterFrame('letras-deslizar', 0).dx < 0, 'vem da esquerda');
  assert.ok(letterFrame('letras-impacto', 0).scale > 2, 'começa grande');
  let over = false;
  for (let p = 0.3; p < 1; p += 0.01) if (letterFrame('letras-elastico', p).dy < -0.001) over = true;
  assert.ok(over, 'elástico passa da linha');
});

test('forma que estica: prévia (shapeFrame) e limpeza', () => {
  const l = { kind: 'shape', start: 0, end: 3, reveal: 'left', animIn: 'fade', animOut: 'fade' };
  assert.equal(shapeFrame(l, 0).sx, 0);
  assert.equal(shapeFrame(l, 0).origin, 'left center');
  assert.ok(Math.abs(shapeFrame(l, 0.175).sx - 0.5) < 0.01);
  assert.equal(shapeFrame(l, 1).sx, 1);
  assert.equal(shapeFrame(l, 0).alpha, 1, 'a revelação não esmaece a entrada');
  assert.ok(shapeFrame(l, 2.9).alpha < 0.5, 'a saída esmaece');
  assert.equal(shapeFrame({ ...l, reveal: 'up' }, 0).sy, 0);
  assert.equal(shapeFrame({ kind: 'shape', start: 0, end: 3, animIn: 'fade' }, 0).alpha, 0, 'sem revelação: fade');
  const [c] = cleanTextLayers([{ kind: 'shape', start: 0, end: 3, reveal: 'right' }]);
  assert.equal(c.reveal, 'right');
  const [d] = cleanTextLayers([{ kind: 'shape', start: 0, end: 3, reveal: 'diagonal' }]);
  assert.equal(d.reveal, undefined);
  assert.equal(Object.keys(SHAPE_REVEALS).length, 4);
});

/** Um quadro do ASS (rgb24) no instante t. */
function frameAt(ass, W, H, t) {
  const dir = tmpDir('rf-pack-');
  try {
    const f = path.join(dir, 'a.ass');
    fs.writeFileSync(f, ass);
    const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:d=2:r=25`, '-vf', `ass=${f}`, '-ss', String(t), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
    assert.equal(r.status, 0, r.stderr.toString());
    return r.stdout;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const redAt = (buf, W, x, y) => buf[(y * W + x) * 3] > 150 && buf[(y * W + x) * 3 + 1] < 90;

test('render: a barra estica da esquerda para a direita (libass)', () => {
  const W = 400;
  const H = 200;
  const ls = cleanTextLayers([{ kind: 'shape', shape: 'rect', start: 0, end: 2, x: 0.5, y: 0.5, w: 0.8, h: 0.2, color: '#FF0000', reveal: 'left', animIn: 'fade', animOut: 'none' }]);
  const ass = buildTextAss(ls, { width: W, height: H });
  assert.match(ass, /\\an7\\pos\(40,80\)\\fscx0\\t\(0,350,\\fscx100\)/);
  const mid = frameAt(ass, W, H, 0.12);
  assert.ok(redAt(mid, W, 50, 100), 'começo da barra já aparece');
  assert.ok(!redAt(mid, W, 350, 100), 'o fim ainda não');
  const end = frameAt(ass, W, H, 1);
  assert.ok(redAt(end, W, 50, 100) && redAt(end, W, 350, 100), 'barra inteira no fim');
});

test('render: todos os modelos geram um ASS que o libass aceita', () => {
  const layers = PACK_ITEMS.flatMap((it, i) => buildPackLayers(it.id, { t: (i % 4) * 0.5, ar: 9 / 16 }));
  const ass = buildTextAss(cleanTextLayers(layers, FONT_IDS, 400), { width: 1080, height: 1920 });
  const dir = tmpDir('rf-pack-');
  try {
    const f = path.join(dir, 'all.ass');
    fs.writeFileSync(f, ass);
    const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=540x960:d=3', '-vf', `ass=${f}`, '-f', 'null', '-']);
    assert.equal(r.status, 0, r.stderr.toString());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('contador: só o 1º passo faz a entrada e só o último faz a saída (não pisca no render)', async () => {
  const { expandCounterLayers } = await import('../../shared/textLayers.js');
  const steps = expandCounterLayers([{ text: '30%', count: true, start: 0, end: 4, animIn: 'zoom', animOut: 'fade' }]);
  assert.ok(steps.length > 3);
  assert.equal(steps[0].animIn, 'zoom');
  assert.ok(steps.slice(1).every((s) => s.animIn === 'none'), 'os outros passos entram sem animação');
  assert.equal(steps.at(-1).animOut, 'fade');
  assert.ok(steps.slice(0, -1).every((s) => s.animOut === 'none'), 'só o último sai');
  assert.ok(steps.every((s) => !('countOf' in s)));
  assert.equal(steps.at(-1).text, '30%');
});

test('pacote "Textos animados": entra nas categorias da biblioteca', async () => {
  const ids = PACK_ITEMS.map((x) => x.id);
  for (const id of ['tt-entre-linhas', 'tt-3d-camadas', 'cit-nome-grande', 'balao-preco', 'barra-inscrever', 'fa-serifa-italica']) assert.ok(ids.includes(id), id);
  assert.ok(PACK_ITEMS.filter((x) => x.cat === 'titulos').length >= 30);
  assert.equal(fontPackLook('fa-serifa-italica').italic, true);
});
