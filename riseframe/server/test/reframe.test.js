import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { resampleSmooth, buildPiecewiseExpr } from '../src/pipeline/reframe.js';
import { finalRender } from '../src/pipeline/render.js';
import { probeSummary } from '../src/pipeline/ffmpeg.js';
import { config } from '../src/config.js';
import { ensureDirs } from '../src/storage.js';

test('resampleSmooth: preenche, suaviza e mantém 0–1', () => {
  const points = [
    { t: 0, x: 0.2 }, { t: 1, x: 0.2 }, { t: 2, x: 0.8 }, { t: 3, x: 0.8 },
  ];
  const kf = resampleSmooth(points, 'x', 3, { dt: 0.5, smoothWin: 3 });
  assert.ok(kf.length >= 4, 'gera keyframes na grade');
  assert.ok(kf.every((k) => k.v >= 0 && k.v <= 1), 'valores dentro de 0–1');
  assert.ok(kf[0].v < kf[kf.length - 1].v, 'segue a subida 0.2 → 0.8');
});

test('buildPiecewiseExpr: constante e piecewise', () => {
  assert.equal(buildPiecewiseExpr([{ t: 0, val: 120 }], 0, 500), '120');
  const e = buildPiecewiseExpr([{ t: 0, val: 100 }, { t: 1, val: 300 }], 0, 500);
  assert.ok(e.startsWith('clip('), 'trava com clip()');
  assert.ok(e.includes('if(lt(t,1)'), 'quebra no keyframe');
  assert.ok(e.includes('(t-0)/'), 'interpola linearmente');
});

test('finalRender: reframe 16:9 → 9:16 seguindo objeto em movimento', async () => {
  await ensureDirs();
  const tmp = path.join(config.paths.work, 'reframe_' + Date.now());
  await fs.mkdir(tmp, { recursive: true });
  const input = path.join(tmp, 'move.mp4');

  // caixa branca deslizando da esquerda p/ direita sobre fundo preto (o tracker de
  // movimento deve segui-la)
  const r = spawnSync(ffmpegPath, [
    '-hide_banner', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=15:d=4',
    '-f', 'lavfi', '-i', 'color=c=white:s=180x180:r=15:d=4',
    '-filter_complex', "[0][1]overlay=x='100+(t/4)*900':y=270",
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', input,
  ], { stdio: 'ignore' });
  assert.equal(r.status, 0, 'gerou o clipe com movimento');

  const meta = await probeSummary(input);
  const jobId = 'reframe_' + Date.now();
  const out = await finalRender(input, config.paths.outputs, jobId, meta, { aspect: '9:16', reframeTrack: true }, () => {});

  const cm = await probeSummary(out.output);
  assert.equal(cm.width, 1080, 'saída 9:16 (1080 de largura)');
  assert.equal(cm.height, 1920, 'saída 9:16 (1920 de altura)');
  assert.ok(out.reframe?.tracked, 'reframe seguiu o sujeito (tracking ativo)');
  assert.ok(out.reframe.keyframes > 2, 'caminho com múltiplos keyframes');

  await fs.rm(tmp, { recursive: true, force: true });
  await fs.rm(out.output, { force: true });
});

test('finalRender: reframeTrack=false usa crop central', async () => {
  await ensureDirs();
  const tmp = path.join(config.paths.work, 'reframe_c_' + Date.now());
  await fs.mkdir(tmp, { recursive: true });
  const input = path.join(tmp, 'v.mp4');
  spawnSync(ffmpegPath, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc=s=1280x720:r=10:d=2',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', input], { stdio: 'ignore' });
  const meta = await probeSummary(input);
  const jobId = 'reframe_c_' + Date.now();
  const out = await finalRender(input, config.paths.outputs, jobId, meta, { aspect: '9:16', reframeTrack: false }, () => {});
  assert.equal(out.reframe.tracked, false, 'sem tracking');
  assert.equal(out.reframe.source, 'center', 'crop central');
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.rm(out.output, { force: true });
});
