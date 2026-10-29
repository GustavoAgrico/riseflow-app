import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { momentEffectAt, MOMENT_EFFECTS } from '../../shared/transform.js';
import { momentsZoomVf } from '../src/pipeline/motion.js';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';

const meta = { width: 320, height: 240, fps: 30 };

test('avanço e recuo estão na lista de efeitos de momento', () => {
  assert.ok(MOMENT_EFFECTS.push);
  assert.ok(MOMENT_EFFECTS.pull);
});

test('avanço: começa sem zoom, termina no zoom máximo; recuo: o inverso', () => {
  assert.ok(Math.abs(momentEffectAt('push', 0, 0.2).dz) < 1e-9);
  assert.ok(Math.abs(momentEffectAt('push', 1, 0.2).dz - 0.2) < 1e-9);
  assert.ok(Math.abs(momentEffectAt('pull', 0, 0.2).dz - 0.2) < 1e-9);
  assert.ok(Math.abs(momentEffectAt('pull', 1, 0.2).dz) < 1e-9);
});

test('avanço desacelera: mais da metade do zoom acontece na primeira metade', () => {
  assert.ok(momentEffectAt('push', 0.5, 1).dz > 0.5);
});

test('render: o filtro traz a curva de desaceleração para os dois efeitos', () => {
  const vf = momentsZoomVf([[1, 3, 0.2, 'push'], [4, 6, 0.2, 'pull']], meta, 'medio');
  assert.match(vf, /pow\(1-/, 'curva de desaceleração');
  assert.ok(vf.startsWith('zoompan='), 'zoompan');
});

test('o FFmpeg aceita o zoompan do avanço e do recuo', () => {
  const vf = momentsZoomVf([[0.5, 2, 0.2, 'push'], [2.5, 4, 0.2, 'pull']], meta, 'medio');
  const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=30:d=4.5', '-vf', vf, '-f', 'null', '-']);
  assert.equal(r.status, 0, r.stderr.toString());
});
