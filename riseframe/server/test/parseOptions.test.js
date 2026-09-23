import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Garante que as opções da timeline não sejam descartadas pelo servidor (já aconteceu:
// cortes, volume, formato e minhas mídias sumiram do parseOptions numa atualização).
test('parseOptions mantém cortes, volume, formato, silêncio, clipes e mídias', () => {
  const src = fs.readFileSync(new URL('../src/routes/jobs.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function parseOptions'), src.indexOf('// POST /api/jobs '));
  for (const key of ['videoCuts', 'silenceCuts', 'manualSilence', 'audioMute', 'audioVolume', 'audioGains', 'aspect', 'reframeTrack',
    'silenceNoiseDb', 'silenceMinDuration', 'silencePadding', 'clipsCount', 'userMedia', 'brollPlan', 'zoomMoments', 'colorAdjust', 'imageSource']) {
    assert.ok(new RegExp(`\\n\\s+${key}:`).test(body), `parseOptions precisa manter "${key}"`);
  }
});
