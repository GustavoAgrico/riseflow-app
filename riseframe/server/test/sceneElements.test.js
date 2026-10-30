import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CONCEPTS, ELEMENT_ASSETS, SCENE_DOODLES, conceptsIn, sceneElements } from '../../shared/sceneElements.js';
import { kineticPlan } from '../../shared/kinetic.js';
import { SFX_LIBRARY } from '../src/pipeline/sfx.js';
import { ELEMENTS_DIR, elementFile, cleanElementId } from '../src/pipeline/elements.js';
import { visualLayerParts } from '../src/pipeline/overlay.js';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';

const words = (text, t0 = 0) => text.split(' ').map((w, i) => ({ word: w, start: +(t0 + i * 0.32).toFixed(2), end: +(t0 + i * 0.32 + 0.28).toFixed(2) }));

test('cada objeto 3D e cada rabisco tem o PNG no app', () => {
  for (const id of ELEMENT_ASSETS) assert.ok(fs.existsSync(path.join(ELEMENTS_DIR, `${id}.png`)), id);
  for (const id of SCENE_DOODLES) assert.ok(fs.existsSync(path.join(ELEMENTS_DIR, 'doodles', `${id}.png`)), id);
  assert.ok(fs.existsSync(path.join(ELEMENTS_DIR, 'LICENSE-fluentui-emoji.txt')));
});

test('cada conceito tem pelo menos um som que existe na biblioteca', () => {
  for (const [id, , , sfx] of CONCEPTS) assert.ok(sfx.some((s) => Object.hasOwn(SFX_LIBRARY, s)), id);
});

test('conceitos da fala: o assunto vira o objeto certo, na palavra certa', () => {
  const found = conceptsIn(words('em 3 anos o dinheiro vai crescer e cada 1 seu responsável'));
  assert.deepEqual(found.map((c) => c.element), ['hourglass', 'money-bag', 'chart-up', 'handshake']);
  assert.equal(found[1].word.word, 'dinheiro');
  assert.equal(conceptsIn(words('eu vou ver isso no dia')).length, 0, 'palavras comuns não viram objeto');
});

test('cena: objeto entra na palavra, flutua, por cima, e o som combina com o assunto', () => {
  const ws = words('o tempo é o seu maior ativo', 2);
  const lines = [{ role: 'key', text: 'tempo', size: 0.08, y: 0.45, h: 0.09, words: [ws[1]] }];
  const { elements, sfx } = sceneElements({ words: ws, lines, star: lines[0], theme: 'vsl', start: 1.9, end: 5, aspect: 9 / 16, available: new Set(Object.keys(SFX_LIBRARY)) });
  const obj = elements.find((e) => e.element === 'hourglass');
  assert.ok(obj && obj.above && obj.motion === 'float-rotate');
  assert.ok(Math.abs(obj.start - (ws[1].start - 0.06)) < 0.01);
  assert.ok(elements.some((e) => e.element.startsWith('doodles/') && /^#[0-9A-F]{6}$/i.test(e.tint)), 'rabisco colorido');
  assert.equal(sfx[0].type, 'clock');
});

test('motion tipográfico devolve os elementos das cenas', () => {
  const segs = [{ start: 0, end: 4, words: words('o segredo do dinheiro é o tempo investido') }, { start: 6, end: 9, words: words('3 erros que acabam com seu resultado', 6) }];
  const plan = kineticPlan({ segments: segs, dur: 12, theme: 'vsl', amount: 'muitos' });
  assert.ok(plan.elements.length >= 2);
  for (const e of plan.elements) assert.ok(cleanElementId(e.element) && elementFile(e.element), e.element);
});

test('ids de elemento: só os do app (sem caminho livre)', () => {
  assert.equal(cleanElementId('../../etc/passwd'), null);
  assert.equal(cleanElementId('doodles/../x'), null);
  assert.equal(elementFile('brain'), path.join(ELEMENTS_DIR, 'brain.png'));
});

test('o FFmpeg pinta o rabisco e anima o objeto 3D por cima', () => {
  const ctx = { W: 360, H: 640, fps: 15, dur: 2 };
  const vis = [
    { _inIdx: 1, start: 0.1, end: 1.8, d: 1.7, mode: 'pip', scale: 0.4, cx: 0.5, cy: 0.6, tint: '#FF5A1F', animIn: 'grow', animOut: 'fade' },
    { _inIdx: 2, start: 0.2, end: 1.8, d: 1.6, mode: 'pip', scale: 0.3, cx: 0.7, cy: 0.3, rot: 9, animIn: 'elastic', animOut: 'fade', motion: 'float-rotate' },
  ];
  const fc = visualLayerParts(vis, ctx).join(';');
  assert.match(fc, /colorchannelmixer=rr=1\.000:gg=0\.353:bb=0\.122/);
  const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=360x640:d=2:r=15',
    '-loop', '1', '-t', '2', '-i', elementFile('doodles/underline'), '-loop', '1', '-t', '2', '-i', elementFile('hourglass'),
    '-filter_complex', fc, '-map', '[vout]', '-frames:v', '25', '-f', 'null', '-']);
  assert.equal(r.status, 0, r.stderr.toString().slice(0, 400));
});

test('cada tema com fundo tem a imagem no app e o "Alternar" passa por vários fundos', async () => {
  const { SCENE_BACKGROUNDS, KINETIC_THEMES } = await import('../../shared/kinetic.js');
  assert.ok(SCENE_BACKGROUNDS.length >= 14);
  for (const b of SCENE_BACKGROUNDS) {
    assert.ok(KINETIC_THEMES[b], b);
    assert.ok(elementFile(`backgrounds/${b}`), b);
  }
  for (const old of ['holofote', 'papel', 'grade', 'cinema', 'roxo-ondas', 'preto-linha', 'cinza-rasgado', 'branco-grade']) assert.equal(KINETIC_THEMES[old], undefined, `${old} saiu`);
  const segs = Array.from({ length: 8 }, (_, i) => ({ start: i * 5, end: i * 5 + 3, words: words('o segredo do dinheiro é sempre o tempo', i * 5) }));
  const plan = kineticPlan({ segments: segs, dur: 42, amount: 'muitos' });
  assert.ok(new Set(plan.scenes.map((s) => s.theme)).size >= 5);
});

test('fundo animado em loop: cena mais longa que o vídeo do fundo renderiza inteira no FFmpeg', () => {
  const ctx = { W: 360, H: 640, fps: 15, dur: 9 };
  const file = elementFile('backgrounds/lampada');
  assert.ok(file && file.endsWith('.mp4'));
  const vis = [{ _inIdx: 1, kind: 'video', loop: true, start: 0.5, end: 8.5, d: 8, mode: 'pip', scale: 1.07, cx: 0.5, cy: 0.5, animIn: 'fade', animOut: 'fade' }];
  const fc = visualLayerParts(vis, ctx).join(';');
  assert.match(fc, /trim=duration=8\.000/);
  const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=360x640:d=9:r=15', '-stream_loop', '-1', '-i', file,
    '-filter_complex', fc, '-map', '[vout]', '-t', '9', '-f', 'null', '-']);
  assert.equal(r.status, 0, r.stderr.toString().slice(0, 400));
});
