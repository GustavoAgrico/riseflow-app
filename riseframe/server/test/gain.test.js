import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gainAf } from '../src/pipeline/gain.js';

test('gainAf: sem ajuste nenhum devolve cadeia vazia', () => {
  assert.equal(gainAf({}), '');
  assert.equal(gainAf({ audioVolume: 1 }), '');
  assert.equal(gainAf({ audioGains: [] }), '');
});

test('gainAf: mudo ignora o resto', () => {
  assert.equal(gainAf({ audioMute: true, audioVolume: 2, audioGains: [{ start: 1, end: 2, volume: 0.5 }] }), 'volume=0');
});

test('gainAf: ganho geral entra só quando difere de 1', () => {
  assert.equal(gainAf({ audioVolume: 1.5 }), 'volume=1.50');
  assert.equal(gainAf({ audioVolume: 1.001 }), '', 'variação irrelevante não vira filtro');
});

test('gainAf: cada trecho vira um volume com enable', () => {
  const af = gainAf({ audioGains: [{ start: 3, end: 5.5, volume: 0.3 }, { start: 10, end: 12, volume: 2 }] });
  assert.ok(af.includes("volume=enable='between(t,3.00,5.50)':volume=0.30"), af);
  assert.ok(af.includes("volume=enable='between(t,10.00,12.00)':volume=2.00"), af);
  assert.equal(af.match(/volume=enable=/g).length, 2, 'um filtro por trecho');
});

test('gainAf: trecho inválido é descartado e volume é limitado', () => {
  assert.equal(gainAf({ audioGains: [{ start: 5, end: 5 }, { start: 8, end: 4 }] }), '', 'end <= start não entra');
  assert.ok(gainAf({ audioGains: [{ start: 0, end: 1, volume: 99 }] }).includes(':volume=4.00'), 'teto de 4x');
  assert.ok(gainAf({ audioGains: [{ start: 0, end: 1, volume: -3 }] }).includes(':volume=0.00'), 'piso de 0');
});
