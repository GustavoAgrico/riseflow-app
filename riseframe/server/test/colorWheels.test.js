import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeColorAdjust, manualAdjustVf, hasColorAdjust, wheelVf, wheelCurves } from '../src/pipeline/color.js';

test('ajuste antigo continua igual (temperatura só com colorbalance, sem rodas)', () => {
  const vf = manualAdjustVf({ temperature: 20 });
  assert.match(vf, /^colorbalance=/);
  assert.equal(manualAdjustVf({}), null);
  assert.equal(hasColorAdjust(sanitizeColorAdjust({})), false);
});

test('rodas, tint e matiz entram na cadeia e são limitados', () => {
  const a = sanitizeColorAdjust({ tint: 999, hue: -300, wheels: { lift: { x: 3, y: 4, m: 9 } } });
  assert.equal(a.tint, 100);
  assert.equal(a.hue, -100);
  assert.ok(Math.hypot(a.wheels.lift.x, a.wheels.lift.y) <= 1.0001);
  assert.equal(a.wheels.lift.m, 1);
  assert.equal(hasColorAdjust(a), true);
  const vf = manualAdjustVf({ hue: 20, wheels: { gain: { x: 0, y: 0, m: 0.5 } } });
  assert.match(vf, /hue=h=12/);
  assert.match(vf, /curves=r='/);
});

test('lift levanta, gain escurece, tint magenta põe vermelho/azul (sentido certo)', () => {
  const mid = (w) => {
    // ponto médio da curva (x=0.5) de cada canal
    const c = wheelCurves(w, 0).match(/[rgb]='([^']+)'/g);
    return c.map((seg) => Number(seg.match(/0\.5\/([\d.]+)/)[1]));
  };
  const base = mid(sanitizeColorAdjust({}).wheels);
  const lift = mid(sanitizeColorAdjust({ wheels: { lift: { x: 0, y: 0, m: 0.8 } } }).wheels);
  const gain = mid(sanitizeColorAdjust({ wheels: { gain: { x: 0, y: 0, m: -0.6 } } }).wheels);
  assert.ok(lift[0] > base[0] && lift[1] > base[1]);
  assert.ok(gain[0] < base[0] && gain[1] < base[1]);
  const magenta = wheelCurves(sanitizeColorAdjust({}).wheels, 0.8);
  const seg = (ch) => Number(magenta.match(new RegExp(`${ch}='[^']*0\\.5/([\\d.]+)`))[1]);
  assert.ok(seg('r') > 0.5 && seg('g') < 0.5 && seg('b') > 0.5);
});

test('disco da roda: a direção escolhe o canal que a roda puxa, sem mudar o brilho total', () => {
  const w = sanitizeColorAdjust({ wheels: { gain: { x: -0.9, y: -0.3, m: 0 } } }).wheels;
  const curve = wheelCurves(w, 0);
  const at = (ch) => Number(curve.match(new RegExp(`${ch}='[^']*0\\.5/([\\d.]+)`))[1]);
  assert.ok(at('b') > at('r'), 'disco para a esquerda-baixo puxa para azul, não vermelho');
  const avg = (at('r') + at('g') + at('b')) / 3;
  assert.ok(Math.abs(avg - 0.5) < 0.05);
});

test('wheelVf vazio quando nada foi mexido', () => {
  assert.equal(wheelVf({}), null);
});
