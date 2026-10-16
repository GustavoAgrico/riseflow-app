import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseOptions } from '../src/routes/jobs.js';

// Garante que as opções da timeline não sejam descartadas pelo servidor (já aconteceu:
// cortes, volume, formato e minhas mídias sumiram do parseOptions numa atualização).
test('parseOptions mantém cortes, volume, formato, silêncio, clipes e mídias', () => {
  const src = fs.readFileSync(new URL('../src/routes/jobs.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function parseOptions'), src.indexOf('// POST /api/jobs '));
  for (const key of ['videoCuts', 'silenceCuts', 'manualSilence', 'audioMute', 'audioVolume', 'audioGains', 'aspect', 'reframeTrack',
    'silenceNoiseDb', 'silenceMinDuration', 'silencePadding', 'clipsCount', 'userMedia', 'brollPlan', 'zoomMoments', 'colorAdjust', 'imageSource', 'captionHighlight', 'cutBreaths', 'speed']) {
    assert.ok(new RegExp(`\\n\\s+${key}:`).test(body), `parseOptions precisa manter "${key}"`);
  }
});

test('transições manuais: cada uma no seu ponto, só tipos válidos', () => {
  const o = parseOptions({ transitions: [{ t: 2.5, type: 'flash' }, { t: 4, type: 'dip' }, { t: 1, type: 'none' }, { t: 3, type: 'xpto' }, { t: -1, type: 'glow' }] });
  assert.deepEqual(o.transitions.map((x) => x.type), ['flash', 'dip']);
  assert.equal(o.transitions[0].t, 2.5);
});
