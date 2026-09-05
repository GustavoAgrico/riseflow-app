import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { computeStats, computeGrade, analyzeAndGrade } from '../src/pipeline/autoColor.js';
import { config } from '../src/config.js';

test('computeStats: médias de canal a partir de rgb24', () => {
  // 2 pixels: (200,100,50) e (0,100,150) → médias (100,100,100)
  const buf = Buffer.from([200, 100, 50, 0, 100, 150]);
  const s = computeStats(buf);
  assert.equal(s.pixels, 2);
  assert.equal(s.meanR, 100);
  assert.equal(s.meanG, 100);
  assert.equal(s.meanB, 100);
  assert.equal(s.warmBias, 0);
});

test('computeGrade: cast azul → esquenta (rGain>1, bGain<1) e reforça saturação', () => {
  const stats = { meanR: 100, meanG: 110, meanB: 140, luma: 110, contrast: 30, saturation: 0.2, shadowFrac: 0.1, highlightFrac: 0.05, warmBias: -40 };
  const g = computeGrade(stats);
  assert.ok(g.adjustments.whiteBalance.rGain > 1, 'ganha no vermelho (esquenta)');
  assert.ok(g.adjustments.whiteBalance.bGain < 1, 'reduz azul');
  assert.ok(g.adjustments.saturation > 1, 'reforça saturação (estava baixa)');
  assert.ok(g.adjustments.contrast > 1, 'reforça contraste (estava baixo)');
  assert.equal(g.look, 'balanced-cool');
  assert.ok(g.vf.includes('colorchannelmixer'), 'cadeia tem balanço de branco');
});

test('computeGrade: cast quente → esfria (rGain<1, bGain>1) e escolhe teal-orange', () => {
  const stats = { meanR: 150, meanG: 120, meanB: 90, luma: 120, contrast: 50, saturation: 0.35, shadowFrac: 0.1, highlightFrac: 0.1, warmBias: 60 };
  const g = computeGrade(stats);
  assert.ok(g.adjustments.whiteBalance.rGain < 1, 'reduz vermelho');
  assert.ok(g.adjustments.whiteBalance.bGain > 1, 'ganha no azul (esfria)');
  assert.equal(g.look, 'teal-orange');
});

test('analyzeAndGrade: analisa um clipe real com cast azul e corrige', async () => {
  const tmp = path.join(config.paths.work, 'colortest_' + Date.now());
  await fs.mkdir(tmp, { recursive: true });
  const clip = path.join(tmp, 'blue.mp4');
  const r = spawnSync(ffmpegPath, [
    '-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=0x4060B0:s=320x240:d=3:r=10',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', clip,
  ], { stdio: 'ignore' });
  assert.equal(r.status, 0, 'gerou o clipe azul');

  const grade = await analyzeAndGrade(clip);
  assert.ok(grade.stats.warmBias < 0, 'detectou cast frio (azul)');
  assert.ok(grade.adjustments.whiteBalance.rGain >= 1, 'correção esquenta a imagem');
  assert.ok(grade.adjustments.whiteBalance.bGain <= 1, 'correção reduz o azul');

  await fs.rm(tmp, { recursive: true, force: true });
});
