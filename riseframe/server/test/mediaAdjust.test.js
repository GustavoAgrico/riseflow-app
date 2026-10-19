import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { applyUserMedia, layerAdjustVf, videoSoundParts } from '../src/pipeline/overlay.js';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-madj-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const ff = (...a) => spawnSync(ffmpegPath, ['-v', 'error', ...a, '-y'], { encoding: 'buffer' });

// volume médio (RMS) do áudio entre a e b segundos
function rms(file, a, b) {
  const o = ff('-ss', String(a), '-t', String(b - a), '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-');
  const buf = o.stdout;
  let sum = 0;
  for (let i = 0; i + 1 < buf.length; i += 2) { const v = buf.readInt16LE(i) / 32768; sum += v * v; }
  return Math.sqrt(sum / Math.max(1, buf.length / 2));
}
function px(file, t, x, y) {
  const o = ff('-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `crop=2:2:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-');
  return [...o.stdout].slice(0, 3);
}

test('ajustes da camada viram eq/hflip (sem ajuste: nada)', () => {
  assert.equal(layerAdjustVf({}), '');
  assert.equal(layerAdjustVf({ bright: 0, contrast: 1, sat: 1 }), '');
  assert.match(layerAdjustVf({ sat: 0 }), /eq=brightness=0\.000:contrast=1\.000:saturation=0\.000/);
  assert.match(layerAdjustVf({ flip: true }), /hflip/);
  assert.deepEqual(videoSoundParts(['[av0]'], { mixed: null, dur: 3 }), ['[av0]atrim=0:3.000[aout]']);
  assert.match(videoSoundParts(['[av0]'], { mixed: '[0:a]', dur: 3 })[0], /^\[0:a\]\[av0\]amix=inputs=2/);
});

test('vídeo adicionado: com som entra na mistura; sem som não; ajustes de cor aplicados', { timeout: 120000 }, async () => {
  const main = path.join(tmp, 'main.mp4');
  ff('-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=25:d=4', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', main);
  const clip = path.join(tmp, 'clip.mp4');
  ff('-f', 'lavfi', '-i', 'color=c=red:s=320x240:r=25:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip);
  const meta = { width: 320, height: 240, duration: 4, fps: 25, hasAudio: true };
  const item = { kind: 'video', file: clip, start: 1, duration: 2, mode: 'cover', volume: 1, opacity: 1 };

  const w1 = fs.mkdtempSync(path.join(tmp, 'a-'));
  const on = await applyUserMedia(main, w1, meta, { userMedia: [item] });
  assert.ok(rms(on.output, 1.3, 2.7) > 0.05, 'som do vídeo entrou');
  assert.ok(rms(on.output, 0.1, 0.8) < 0.01, 'antes do vídeo: silêncio');

  const w2 = fs.mkdtempSync(path.join(tmp, 'b-'));
  const off = await applyUserMedia(main, w2, meta, { userMedia: [{ ...item, muted: true, sat: 0 }] });
  assert.ok(rms(off.output, 1.3, 2.7) < 0.01, 'sem som: o vídeo fica mudo');
  const [r, g, b] = px(off.output, 2, 160, 120);
  assert.ok(Math.abs(r - g) < 25 && Math.abs(r - b) < 25, `saturação 0 = cinza: ${r},${g},${b}`);
});
