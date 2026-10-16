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
