import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { applyUnderlay, hasUnderlay } from '../src/pipeline/underlay.js';
import { probeSummary } from '../src/pipeline/ffmpeg.js';
import { config } from '../src/config.js';

test('hasUnderlay: só imagem/vídeo marcados como "por baixo" (V0)', () => {
  assert.equal(hasUnderlay({}), false);
  assert.equal(hasUnderlay({ userMedia: [{ kind: 'image', under: false }] }), false);
  assert.equal(hasUnderlay({ userMedia: [{ kind: 'audio', under: true }] }), false);
  assert.equal(hasUnderlay({ userMedia: [{ kind: 'image', under: true }] }), true);
  assert.equal(hasUnderlay({ userMedia: [{ kind: 'video', under: true }] }), true);
});

// cor média (r,g,b) de um quadro no tempo t (ou de um pedaço dele: crop=w:h:x:y)
function pixelAt(file, t, crop = null) {
  const r = spawnSync(ffmpegPath, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `${crop ? `crop=${crop},` : ''}scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  return [...r.stdout.subarray(0, 3)];
}

test('applyUnderlay: o fundo aparece em volta do vídeo reduzido e no espaço vazio', async () => {
  const tmp = path.join(config.paths.work, 'underlaytest_' + Date.now());
  await fs.mkdir(tmp, { recursive: true });
  const main = path.join(tmp, 'main.mp4');
  const bg = path.join(tmp, 'bg.png');
  assert.equal(spawnSync(ffmpegPath, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=0x0000FF:s=160x284:d=4:r=10', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-t', '4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', main], { stdio: 'ignore' }).status, 0);
  assert.equal(spawnSync(ffmpegPath, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=0xFF8000:s=64x64', '-frames:v', '1', bg], { stdio: 'ignore' }).status, 0);

  const meta = await probeSummary(main);
  const r = await applyUnderlay(main, tmp, meta, {
    userMedia: [{ under: true, kind: 'image', file: bg, start: 0, duration: 4, mode: 'cover' }],
    transformKeys: [{ t: 0, x: 0, y: 0, scale: 0.5, rot: 0 }],
  }, () => {}, [], [{ start: 2, end: 3 }]);
  assert.ok(r.applied, 'montou o fundo');
  const [r1, g1, b1] = pixelAt(r.output, 1, '40:40:60:122');
  assert.ok(b1 > 180 && r1 < 80, `centro: o vídeo (reduzido) azul (${r1},${g1},${b1})`);
  const [r0, g0, b0] = pixelAt(r.output, 1, '20:20:0:0');
  assert.ok(r0 > 200 && b0 < 80, `canto: o fundo em volta do vídeo reduzido (${r0},${g0},${b0})`);
  const [r2, g2, b2] = pixelAt(r.output, 2.5);
  assert.ok(r2 > 200 && g2 > 90 && b2 < 80, `no espaço vazio: o fundo laranja (${r2},${g2},${b2})`);
  const dur = Number((await probeSummary(r.output)).duration) || 0;
  assert.ok(Math.abs(dur - 4) < 0.3, `mesma duração (${dur})`);

  await fs.rm(tmp, { recursive: true, force: true });
});
