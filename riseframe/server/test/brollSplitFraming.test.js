import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { insertBroll, splitFraming, faceCropGeometry } from '../src/pipeline/broll.js';
import { probeSummary, ffmpegPath } from '../src/pipeline/ffmpeg.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-brframing-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('tela dividida: o foco e o zoom da tela cheia não mexem no enquadramento dela', () => {
  const full = { personFocusX: 0.5, personFocusY: 0.857, personZoom: 1.2 };
  assert.deepEqual(splitFraming({ ...full, personSplitAuto: true }), { focus: null, zoom: 1 });
  assert.deepEqual(splitFraming({ ...full, personSplitFocusX: 0.43, personSplitFocusY: 0.53, personSplitZoom: 1.1 }), {
    focus: { x: 0.43, y: 0.53, source: 'manual' }, zoom: 1.1,
  });
});

test('tela dividida: sem enquadramento próprio vale o foco geral; sem nenhum, detecta o rosto', () => {
  assert.deepEqual(splitFraming({ personFocusX: 0.5, personFocusY: 0.4, personZoom: 1.3 }), {
    focus: { x: 0.5, y: 0.4, source: 'manual' }, zoom: 1.3,
  });
  assert.deepEqual(splitFraming({}), { focus: null, zoom: 1 });
  assert.equal(splitFraming({ personSplitFocusX: null, personSplitFocusY: null, personSplitAuto: true }).focus, null);
});

test('tela dividida sem zoom: a pessoa cobre a metade, sem faixas desfocadas', { timeout: 120000 }, async () => {
  const input = path.join(tmp, 'in.mp4');
  const img = path.join(tmp, 'img.png');
  spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:d=2:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', input]);
  spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'smptebars=s=480x320', '-frames:v', '1', '-y', img]);
  const meta = await probeSummary(input);
  const r = await insertBroll(input, tmp, meta, { brollMoments: [] }, {
    broll: true, brollLayout: 'top', personSplitFocusX: 0.5, personSplitFocusY: 0.53, personSplitZoom: 1,
    personFocusX: 0.5, personFocusY: 0.857, personZoom: 1.2,
    brollPlan: [{ start: 0.5, end: 1.5, file: img, kind: 'image' }],
  });
  assert.equal(r.inserted, 1);
  const script = fs.readFileSync(path.join(tmp, 'broll_filter.txt'), 'utf8');
  const g = faceCropGeometry(360, 640, 360, 320, { x: 0.5, y: 0.53 }, 1);
  assert.ok(script.includes(`[p0]scale=${g.scaledW}:${g.scaledH}:flags=bicubic,crop=360:320:${g.cropX}:${g.cropY},setsar=1[ph0]`), script);
  assert.doesNotMatch(script, /boxblur/);
});
