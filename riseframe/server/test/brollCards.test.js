import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { insertBroll } from '../src/pipeline/broll.js';
import { probeSummary, ffmpegPath } from '../src/pipeline/ffmpeg.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-cards-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('layout Cartões: o B-roll vira cartão arredondado, inclinado e com sombra (FFmpeg roda)', { timeout: 120000 }, async () => {
  const input = path.join(tmp, 'in.mp4');
  const img = path.join(tmp, 'img.png');
  spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:d=3:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', input]);
  spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'smptebars=s=480x320', '-frames:v', '1', '-y', img]);
  const meta = await probeSummary(input);
  const r = await insertBroll(input, tmp, meta, { brollMoments: [] }, {
    broll: true, brollLayout: 'cartoes',
    brollPlan: [{ start: 0.5, end: 2.5, file: img, kind: 'image' }],
  });
  assert.equal(r.inserted, 1);
  assert.equal(r.layout, 'cartoes');
  const script = fs.readFileSync(path.join(tmp, 'broll_filter.txt'), 'utf8');
  assert.match(script, /rotate=a=-0\.055/);
  assert.match(script, /geq=r=/);
  assert.match(script, /colorchannelmixer=rr=0/);
  assert.ok(fs.existsSync(r.output));
  const out = await probeSummary(r.output);
  assert.equal(out.width, 360);
  assert.equal(out.height, 640);
});
