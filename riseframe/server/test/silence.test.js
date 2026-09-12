import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveNoiseDb, refineSilenceRanges } from '../src/pipeline/silence.js';

test('adaptiveNoiseDb: gate relativo ao pico, dentro dos limites', () => {
  // Gravação alta (pico -3): gate = -3 - 30 = -33
  assert.equal(adaptiveNoiseDb({ maxDb: -3 }, { headroomDb: 30 }), -33);
  // Gravação baixinha (pico -18): gate = -48 (não corta a fala fraca)
  assert.equal(adaptiveNoiseDb({ maxDb: -18 }, { headroomDb: 30 }), -48);
  // Força "forte" (headroom menor) corta mais (gate mais alto)
  assert.equal(adaptiveNoiseDb({ maxDb: -3 }, { headroomDb: 26 }), -29);
});

test('adaptiveNoiseDb: respeita piso e teto e cai no fallback sem medida', () => {
  assert.equal(adaptiveNoiseDb({ maxDb: 0 }, { headroomDb: 10, ceilDb: -20 }), -20, 'não passa do teto');
  assert.equal(adaptiveNoiseDb({ maxDb: -40 }, { headroomDb: 30, floorDb: -50 }), -50, 'não passa do piso');
  assert.equal(adaptiveNoiseDb({}, { fallbackDb: -30 }), -30, 'sem pico/média → fallback');
  assert.equal(adaptiveNoiseDb({ maxDb: null, meanDb: null }, { fallbackDb: -28 }), -28);
});

test('refineSilenceRanges: folga assimétrica e descarte de silêncio curto', () => {
  const ranges = refineSilenceRanges(
    [{ start: 1.0, end: 2.0 }, { start: 5.0, end: 5.1 }],
    30,
    { padStart: 0.08, padEnd: 0.12, minRemove: 0.06 },
  );
  assert.equal(ranges.length, 1, 'descarta o silêncio curto (0.1s vira nada após folga)');
  assert.ok(Math.abs(ranges[0].start - 1.08) < 1e-9, 'padStart aplicado');
  assert.ok(Math.abs(ranges[0].end - 1.88) < 1e-9, 'padEnd (maior) aplicado — preserva o ataque');
});

test('refineSilenceRanges: não ultrapassa a duração do vídeo', () => {
  const ranges = refineSilenceRanges([{ start: 29.9, end: 40 }], 30, { padStart: 0.08, padEnd: 0.12 });
  assert.equal(ranges.length, 0, 'range além da duração é descartado');
});
