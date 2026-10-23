import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ffmpegPath, probeSummary } from '../src/pipeline/ffmpeg.js';
import { padInput } from '../src/pipeline/index.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-pad-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const ff = (...a) => spawnSync(ffmpegPath, ['-v', 'error', ...a, '-y']);
const luma = (file, t) => spawnSync(ffmpegPath, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']).stdout[0];

test('espaço antes/depois do vídeo principal: preto e sem som nas pontas', { timeout: 60000 }, async () => {
  const src = path.join(tmp, 'v.mp4');
  ff('-f', 'lavfi', '-i', 'color=c=white:s=320x240:r=30:d=2', '-f', 'lavfi', '-i', 'sine=f=440:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src);
  const out = await padInput(src, tmp, 1, 1.5);
  const m = await probeSummary(out);
  assert.ok(Math.abs(m.duration - 4.5) < 0.15, `duração 1 + 2 + 1,5 (veio ${m.duration})`);
  assert.equal(m.hasAudio, true);
  assert.ok(luma(out, 0.5) < 30, 'antes: preto');
  assert.ok(luma(out, 2) > 200, 'o vídeo no meio');
  assert.ok(luma(out, 4) < 30, 'depois: preto');
  // sem som no começo
  const vol = spawnSync(ffmpegPath, ['-v', 'info', '-t', '0.9', '-i', out, '-af', 'volumedetect', '-f', 'null', '-']).stderr.toString();
  const max = Number((vol.match(/max_volume: (-?[\d.]+|-inf) dB/) || [])[1] ?? -99);
  assert.ok(!(max > -50), `silêncio antes (max ${max} dB)`);
});

test('espaço na sequência com vídeo sem som', { timeout: 60000 }, async () => {
  const src = path.join(tmp, 'mudo.mp4');
  ff('-f', 'lavfi', '-i', 'color=c=white:s=320x240:r=30:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src);
  const out = await padInput(src, tmp, 0.5, 0);
  const m = await probeSummary(out);
  assert.ok(Math.abs(m.duration - 1.5) < 0.15, `duração ${m.duration}`);
});

test('espaços entre os clipes (V1 arrastada): preto no meio, o resto do vídeo depois', { timeout: 60000 }, async () => {
  const src = path.join(tmp, 'meio.mp4');
  ff('-f', 'lavfi', '-i', 'color=c=white:s=320x240:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src);
  const out = await padInput(src, tmp, 0.5, 0.5, [{ at: 1, dur: 1 }, { at: 2, dur: 0.5 }]);
  const m = await probeSummary(out);
  assert.ok(Math.abs(m.duration - 5.5) < 0.2, `0,5 + 1 + 1 + 1 + 0,5 + 1 + 0,5 = 5,5 (veio ${m.duration})`);
  assert.ok(luma(out, 0.25) < 30, 'antes');
  assert.ok(luma(out, 1) > 200, '1º pedaço');
  assert.ok(luma(out, 2) < 30, 'espaço de 1 s');
  assert.ok(luma(out, 3) > 200, '2º pedaço');
  assert.ok(luma(out, 3.75) < 30, 'espaço de 0,5 s');
  assert.ok(luma(out, 4.5) > 200, '3º pedaço');
  assert.ok(luma(out, 5.3) < 30, 'depois');
});
