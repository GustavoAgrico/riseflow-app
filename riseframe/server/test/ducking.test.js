import { test } from 'node:test';
import assert from 'node:assert/strict';
import { musicMixParts } from '../src/pipeline/overlay.js';

test('ducking padrão: a voz comanda um sidechaincompress na música', () => {
  const parts = musicMixParts(['[am0]'], { hasAudio: true, dur: 10 });
  assert.equal(parts[0], '[0:a]asplit=2[voice][vsc]');
  assert.match(parts[1], /^\[am0\]\[vsc\]sidechaincompress=threshold=0\.03:ratio=8:/);
  assert.match(parts.at(-1), /^\[voice\]\[musd\]amix=inputs=2:.*\[aout\]$/);
});

test('várias músicas são unidas antes do ducking', () => {
  const parts = musicMixParts(['[am0]', '[am1]'], { hasAudio: true, dur: 5, ducking: 'forte' });
  assert.match(parts[1], /^\[am0\]\[am1\]amix=inputs=2:.*\[mus\]$/);
  assert.match(parts[2], /^\[mus\]\[vsc\]sidechaincompress=threshold=0\.015:ratio=16:/);
});

test('ducking desligado mantém a mistura simples', () => {
  const parts = musicMixParts(['[am0]'], { hasAudio: true, dur: 5, ducking: 'off' });
  assert.equal(parts.length, 1);
  assert.match(parts[0], /^\[0:a\]\[am0\]amix=inputs=2:/);
  assert.doesNotMatch(parts[0], /sidechain/);
});

test('vídeo sem áudio: nada para comandar o ducking', () => {
  assert.deepEqual(musicMixParts(['[am0]'], { hasAudio: false, dur: 3 }), ['[am0]atrim=0:3.000[aout]']);
});
