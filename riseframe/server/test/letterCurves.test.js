import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { letterFrame, letterSegments, letterTiming, LETTER_ANIMS, LETTER_SAMPLED, TEXT_ANIMS_IN, cleanTextLayers, TEXT_TEMPLATES } from '../../shared/textLayers.js';
import { buildTextAss } from '../src/pipeline/texts.js';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';

const meta = { width: 1080, height: 1920 };

test('letras novas: aparecem nas opções e na lista de animações por letra', () => {
  for (const id of LETTER_SAMPLED) {
    assert.ok(LETTER_ANIMS.includes(id), `${id} em LETTER_ANIMS`);
    assert.ok(TEXT_ANIMS_IN[id], `${id} com nome na lista`);
  }
});

test('letras novas: terminam no quadro final (sem deslocar, sem desfocar, opacas)', () => {
  for (const id of LETTER_SAMPLED) {
    const f = letterFrame(id, 1);
    assert.ok(Math.abs(f.dy) < 1e-9, `${id} dy`);
    assert.ok(Math.abs(f.scale - 1) < 1e-9, `${id} escala`);
    assert.ok(Math.abs(f.blur) < 1e-9, `${id} desfoque`);
    assert.ok(Math.abs(f.alpha - 1) < 1e-9, `${id} alfa`);
    assert.ok(Math.abs(f.dx ?? 0) < 1e-9, `${id} deslocamento lateral`);
  }
});

test('mola: passa do ponto (overshoot acima de 105%) e assenta', () => {
  let peak = 0;
  for (let p = 0; p <= 1; p += 0.01) peak = Math.max(peak, letterFrame('letras-mola', p).scale);
  assert.ok(peak > 1.05 && peak < 1.15, `pico ${peak.toFixed(3)}`);
});

test('queda: começa acima da linha e ultrapassa para baixo antes de assentar', () => {
  assert.ok(letterFrame('letras-queda', 0).dy < -0.09, 'começa em cima');
  let below = false;
  for (let p = 0.3; p < 1; p += 0.01) if (letterFrame('letras-queda', p).dy > 0.001) below = true;
  assert.ok(below, 'ultrapassa a linha');
});

test('amostragem: N+1 passos contínuos, o último vai até o fim da letra', () => {
  const steps = letterSegments('letras-mola', 0.4, 10);
  assert.equal(steps.length, 11);
  assert.equal(steps[0].t0, 0);
  assert.equal(steps[10].t1, null);
  for (let k = 1; k < steps.length; k++) assert.ok(steps[k].t0 >= steps[k - 1].t0, 'ordem');
});

test('ASS: cada letra vira vários eventos (um por passo) e o libass aceita o arquivo', () => {
  const [l] = cleanTextLayers([{ ...TEXT_TEMPLATES.nome, text: 'Oi', start: 1, end: 4, animIn: 'letras-mola' }]);
  const ass = buildTextAss([l], meta);
  const letterEvents = ass.split('\n').filter((x) => x.startsWith('Dialogue') && x.includes('\\pos(') && x.includes('\\fscx'));
  assert.ok(letterEvents.length >= 2 * 10, `${letterEvents.length} eventos`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-letter-'));
  try {
    const f = path.join(dir, 'mola.ass');
    fs.writeFileSync(f, ass);
    const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1080x1920:d=4', '-vf', `ass=${f}`, '-f', 'null', '-']);
    assert.equal(r.status, 0, r.stderr.toString());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('parâmetros: overshoot 0 não passa do ponto; 1 passa mais', () => {
  const peak = (o) => { let m = 0; for (let p = 0; p <= 1; p += 0.01) m = Math.max(m, letterFrame('letras-mola', p, { overshoot: o }).scale); return m; };
  assert.ok(peak(0) <= 1.0001, `sem overshoot: ${peak(0).toFixed(3)}`);
  assert.ok(peak(1) > peak(0.5) + 0.05, 'mais overshoot passa mais');
});

test('parâmetros: distância muda o deslocamento da queda e da subida', () => {
  assert.ok(Math.abs(letterFrame('letras-queda', 0, { letterDist: 0.2 }).dy + 0.2) < 1e-9, 'queda começa a 20% da altura');
  assert.ok(Math.abs(letterFrame('letras-subir', 0, { letterDist: 0.15 }).dy - 0.15) < 1e-9, 'subida começa a 15%');
});

test('parâmetros: duração e atraso por letra entram no tempo', () => {
  const t = letterTiming({ start: 0, end: 4, letterDur: 0.8, letterGap: 0.1 }, 5);
  assert.equal(t.d, 0.8);
  assert.equal(t.stagger, 0.1);
});

test('empurrão lateral: chega de 5% da largura e assenta no lugar, sem passar', () => {
  assert.ok(Math.abs(letterFrame('letras-empurrao', 0).dx - 0.05) < 1e-9, 'começa a 5% da largura');
  for (let p = 0; p <= 1; p += 0.05) assert.ok(letterFrame('letras-empurrao', p).dx >= -1e-9, 'nunca passa do lugar');
  assert.ok(Math.abs(letterFrame('letras-empurrao', 0, { letterDist: 0.2 }).dx - 0.2) < 1e-9, 'distância muda o empurrão');
});

test('ASS do empurrão lateral: o libass aceita o arquivo', () => {
  const [l] = cleanTextLayers([{ ...TEXT_TEMPLATES.nome, text: 'Oi', start: 1, end: 4, animIn: 'letras-empurrao' }]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-letter-'));
  try {
    const f = path.join(dir, 'empurrao.ass');
    fs.writeFileSync(f, buildTextAss([l], meta));
    const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1080x1920:d=4', '-vf', `ass=${f}`, '-f', 'null', '-']);
    assert.equal(r.status, 0, r.stderr.toString());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
