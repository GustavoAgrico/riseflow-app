import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapKeep, remapTime, keptDuration } from '../src/pipeline/timeline.js';

test('snapKeep: alinha as fronteiras ao grid de frames (1/fps)', () => {
  const keep = [{ start: 0, end: 1.017 }, { start: 2.033, end: 3.049 }];
  const snapped = snapKeep(keep, 30);
  // 30fps → múltiplos de 1/30 ≈ 0.0333
  for (const s of snapped) {
    assert.ok(Math.abs(s.start * 30 - Math.round(s.start * 30)) < 1e-6, 'start no grid');
    assert.ok(Math.abs(s.end * 30 - Math.round(s.end * 30)) < 1e-6, 'end no grid');
  }
});

test('snapKeep: descarta trechos que ficam curtos demais após o ajuste', () => {
  const snapped = snapKeep([{ start: 0, end: 0.02 }, { start: 1, end: 2 }], 30);
  assert.equal(snapped.length, 1);
  assert.equal(snapped[0].start, 1);
});

test('snapKeep: o MESMO keep serve para vídeo e para remap (mesma referência de tempo)', () => {
  // Depois de snap, remapTime opera sobre fronteiras no grid → soma exata, sem drift.
  const keep = snapKeep([{ start: 0, end: 1 }, { start: 2, end: 3 }], 30);
  assert.equal(keptDuration(keep), 2);
  assert.equal(remapTime(0.5, keep), 0.5); // dentro do 1º trecho
  assert.equal(remapTime(2.5, keep), 1.5); // 1s do 1º + 0.5s do 2º
  assert.equal(remapTime(1.5, keep), 1); // em trecho removido → cola no fim do mantido
});

test('unmapTime: tempo no vídeo cortado volta para o tempo do original', async () => {
  const { remapTime, unmapTime } = await import('../src/pipeline/timeline.js');
  const keep = [{ start: 0, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 9 }];
  for (const t of [0.5, 1.9, 3.2, 4.99, 6, 8.5]) assert.ok(Math.abs(unmapTime(remapTime(t, keep), keep) - t) < 1e-9, `ida e volta em ${t}`);
  assert.equal(unmapTime(2.5, keep), 3.5); // 2,5 s do cortado = 3,5 s do original
});
