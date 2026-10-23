import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { insertBroll } from '../src/pipeline/broll.js';
import { probeSummary, ffmpegPath } from '../src/pipeline/ffmpeg.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-brsplit-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('tela dividida: o Transformar do vídeo vale na metade da pessoa, depois do recorte (como a prévia)', { timeout: 120000 }, async () => {
  const input = path.join(tmp, 'in.mp4');
  const img = path.join(tmp, 'img.png');
  spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:d=3:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', input]);
  spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'smptebars=s=480x320', '-frames:v', '1', '-y', img]);
  const meta = await probeSummary(input);
  const keys = [{ t: 0, scale: 1.219, x: 0, y: 0.1, rot: 0 }];
  const r = await insertBroll(input, tmp, meta, { brollMoments: [] }, {
    broll: true, brollLayout: 'top', personFocusX: 0.5, personFocusY: 0.5,
    personInput: input, personMeta: meta, personMotion: { keys, windows: [], intensity: 'medio' },
    brollPlan: [{ start: 0.5, end: 2.5, file: img, kind: 'image' }],
  });
  assert.equal(r.inserted, 1);
  const script = fs.readFileSync(path.join(tmp, 'broll_filter.txt'), 'utf8');
  // zoompan no tamanho da METADE (360x320), aplicado na pessoa já recortada
  assert.match(script, /\[ph0\]zoompan=z='\(1\*\([^']*1\.219[^']*\)\)'[^\n]*s=360x320/);
  assert.match(script, /\[phm0\]overlay=x=0:y=320/);
  const m = await probeSummary(r.output);
  assert.equal(m.width, 360);
  assert.equal(m.height, 640);
});
