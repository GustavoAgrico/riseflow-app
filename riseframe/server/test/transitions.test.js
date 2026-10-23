import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transitionVf, transitionPoints, cutJoins } from '../src/pipeline/transitions.js';

test('cutJoins: fronteiras dos trechos mantidos na timeline cortada', () => {
  assert.deepEqual(cutJoins([{ start: 0, end: 2 }, { start: 3, end: 5.5 }, { start: 8, end: 9 }]), [2, 4.5]);
  assert.deepEqual(cutJoins([{ start: 0, end: 4 }]), []);
});

test('transitionPoints: ordena, tira as pontas e junta pontos colados', () => {
  assert.deepEqual(transitionPoints([5, 0.1, 2, 2.3, 9.9, 4], 10), [2, 4, 5]);
});

test('transitionVf: nenhum tipo ou nenhum ponto → null', () => {
  assert.equal(transitionVf('none', [2], 10), null);
  assert.equal(transitionVf('flash', [], 10), null);
  assert.equal(transitionVf('nao-existe', [2], 10), null);
});

test('transitionVf: flash/dip/glow usam eq por quadro centrado nos pontos', () => {
  const flash = transitionVf('flash', [2, 6], 10);
  assert.match(flash, /^eq=brightness='0\.9\*min\(1,/);
  assert.ok(flash.includes('abs(t-2.000)') && flash.includes('abs(t-6.000)'));
  assert.match(flash, /eval=frame$/);
  assert.match(transitionVf('dip', [2], 10), /brightness='-0\.95\*.*saturation='1-/);
  assert.match(transitionVf('glow', [2], 10), /contrast=/);
});

test('transitionVf: blur liga desfoques crescentes só perto do ponto', () => {
  const blur = transitionVf('blur', [3], 10);
  assert.equal(blur.split(',gblur').length, 3);
  assert.ok(blur.includes("enable='between(t,2.750,3.250)'"));
});

test('transições de câmera (zoom, deslizar, giro, tremor) e glitch: o FFmpeg aceita o filtro', { timeout: 60000 }, async () => {
  const { motionTransitionVf } = await import('../src/pipeline/transitions.js');
  const { ffmpegPath } = await import('../src/pipeline/ffmpeg.js');
  const { spawnSync } = await import('node:child_process');
  const meta = { width: 320, height: 240, fps: 30 };
  assert.equal(motionTransitionVf([{ t: 1, type: 'flash' }], meta, 3), null, 'flash não é de câmera');
  const cam = motionTransitionVf([
    { t: 0.6, type: 'zoomin' }, { t: 1.2, type: 'slideleft', half: 0.2 }, { t: 1.8, type: 'spin' }, { t: 2.4, type: 'shake' }, { t: 2.7, type: 'zoomout' }, { t: 2.2, type: 'slideup' },
  ], meta, 3);
  assert.match(cam, /zoompan=/);
  assert.match(cam, /rotate=/);
  const gl = transitionVf('glitch', [1.5], 3, 0.3);
  assert.match(gl, /rgbashift/);
  const wo = transitionVf('whiteout', [0.8], 3);
  const ir = transitionVf('iris', [2], 3);
  assert.match(ir, /vignette=angle/);
  const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=30:d=3', '-vf', `${cam},${gl},${wo},${ir}`, '-f', 'null', '-']);
  assert.equal(r.status, 0, r.stderr.toString());
});
