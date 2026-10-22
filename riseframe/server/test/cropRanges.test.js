import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { cleanCropRanges, cropBoxesVf, hasCrop, applyVideoCrop } from '../src/pipeline/frame.js';
import { applyUnderlay } from '../src/pipeline/underlay.js';
import { probeSummary } from '../src/pipeline/ffmpeg.js';
import { config } from '../src/config.js';

test('cleanCropRanges: limpa, ordena e tira sobreposição; recorte zerado também vale', () => {
  const l = cleanCropRanges([{ start: 6, end: 9, l: 0.2 }, { start: 0, end: 6, t: 0.9 }, { start: 5, end: 7, r: 0.1 }, { start: 3, end: 3.01 }, null]);
  assert.deepEqual(l, [{ start: 0, end: 6, l: 0, t: 0.45, r: 0, b: 0 }, { start: 6, end: 9, l: 0.2, t: 0, r: 0, b: 0 }]);
  assert.equal(hasCrop({}), false);
  assert.equal(hasCrop({ cropRanges: [{ start: 0, end: 2 }] }), false, 'pedaço sem recorte e sem recorte geral: nada a fazer');
  assert.equal(hasCrop({ cropRanges: [{ start: 0, end: 2, b: 0.1 }] }), true);
});

test('cropBoxesVf: bordas só no tempo do pedaço; o geral vale fora dele', () => {
  const vf = cropBoxesVf(100, 200, { l: 0.1, t: 0, r: 0, b: 0 }, [{ start: 0, end: 2, t: 0.25 }]);
  assert.match(vf, /drawbox=x=0:y=0:w=100:h=50:color=black:t=fill:enable='between\(t,0\.000,1\.999\)'/);
  assert.match(vf, /drawbox=x=0:y=0:w=10:h=200:color=black:t=fill:enable='not\(between\(t,0\.000,1\.999\)\)'/);
  assert.match(cropBoxesVf(100, 200, null, [{ start: 0, end: 2, l: 0.1 }], { alpha: true }), /color=black@0:replace=1/);
  assert.equal(cropBoxesVf(100, 200, null, [{ start: 0, end: 2 }]), null);
});

function pixelAt(file, t, crop) {
  const r = spawnSync(ffmpegPath, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `crop=${crop},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  return [...r.stdout.subarray(0, 3)];
}

test('applyVideoCrop / applyUnderlay: recorta só o primeiro pedaço', async () => {
  const tmp = path.join(config.paths.work, 'croprangetest_' + Date.now());
  await fs.mkdir(tmp, { recursive: true });
  const main = path.join(tmp, 'main.mp4');
  const bg = path.join(tmp, 'bg.png');
  assert.equal(spawnSync(ffmpegPath, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=0x0000FF:s=160x284:d=4:r=10',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', main], { stdio: 'ignore' }).status, 0);
  assert.equal(spawnSync(ffmpegPath, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=0xFF8000:s=64x64', '-frames:v', '1', bg], { stdio: 'ignore' }).status, 0);
  const meta = await probeSummary(main);
  const ranges = [{ start: 0, end: 2, l: 0.3, t: 0, r: 0, b: 0 }];

  const r = await applyVideoCrop(main, tmp, meta, null, () => {}, ranges);
  assert.ok(r.applied);
  const left1 = pixelAt(r.output, 1, '20:20:0:130');
  const left3 = pixelAt(r.output, 3, '20:20:0:130');
  assert.ok(left1[2] < 40, `pedaço 1: a esquerda recortada fica preta (${left1})`);
  assert.ok(left3[2] > 180, `pedaço 2: sem recorte, continua azul (${left3})`);

  const u = await applyUnderlay(main, tmp, meta, { userMedia: [{ under: true, kind: 'image', file: bg, start: 0, duration: 4, mode: 'cover' }], cropRanges: ranges }, () => {}, [], []);
  const ul1 = pixelAt(u.output, 1, '20:20:0:130');
  const ul3 = pixelAt(u.output, 3, '20:20:0:130');
  assert.ok(ul1[0] > 200 && ul1[2] < 80, `com fundo (V0): no recorte aparece o fundo (${ul1})`);
  assert.ok(ul3[2] > 180, `pedaço 2 sem recorte (${ul3})`);
  await fs.rm(tmp, { recursive: true, force: true });
});
