import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceAf } from '../src/pipeline/voice.js';

test('voiceAf: monta a cadeia (denoise + normalização) e varia com a intensidade', () => {
  const m = voiceAf('medio');
  assert.ok(m.includes('afftdn=nr=13'), 'usa afftdn no médio');
  assert.ok(m.includes('loudnorm=I=-16'), 'normaliza volume');
  assert.ok(m.includes('highpass=f=80'), 'corta rumble');
  assert.ok(voiceAf('suave').includes('nr=8'), 'suave = menos redução');
  assert.ok(voiceAf('forte').includes('nr=20'), 'forte = mais redução');
});
