import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { letterFrame, letterSegments, LETTER_ANIMS, LETTER_SAMPLED, TEXT_ANIMS_IN, cleanTextLayers, TEXT_TEMPLATES } from '../../shared/textLayers.js';
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
