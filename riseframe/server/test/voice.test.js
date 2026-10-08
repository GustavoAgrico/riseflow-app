import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { voiceAf, voiceChain, voiceActive, previewVoice, VOICE_NOISE, VOICE_PRESETS, VOICE_EFFECTS } from '../src/pipeline/voice.js';
import { runFfmpeg } from '../src/pipeline/ffmpeg.js';

test('voiceAf: monta a cadeia (denoise + normalização) e varia com a intensidade', () => {
  const m = voiceAf('medio');
  assert.ok(m.includes('afftdn=nr=13'), 'usa afftdn no médio');
  assert.ok(m.includes('loudnorm=I=-14'), 'normaliza volume (redes sociais)');
  assert.ok(m.includes('highpass=f=80'), 'corta rumble');
  assert.ok(voiceAf('suave').includes('nr=8'), 'suave = menos redução');
  assert.ok(voiceAf('forte').includes('nr=20'), 'forte = mais redução');
});

test('voz: limpeza antes da transcrição, tom/efeito depois (não atrapalha a IA)', () => {
  const o = { voiceEnhance: true, voiceNoise: 'ia', voicePreset: 'podcast', voiceEffect: 'robo', voicePitch: -3 };
  const clean = voiceChain(o, 'clean');
  assert.match(clean.af, /arnndn=m=voz\.rnnn/);
  assert.match(clean.af, /deesser/);
  assert.doesNotMatch(clean.af, /rubberband|afftfilt/);
  assert.equal(clean.model, true);
  const fx = voiceChain(o, 'fx');
  assert.match(fx.af, /rubberband=pitch=0\.8409:formant=preserved/);
  assert.match(fx.af, /afftfilt/);
  assert.doesNotMatch(fx.af, /arnndn|afftdn/);
  assert.equal(fx.model, false);
  assert.equal(voiceChain({}, 'all').af, '', 'nada ligado → nada a fazer');
  assert.equal(voiceActive({ voiceEffect: 'eco' }, 'clean'), false);
  assert.equal(voiceActive({ voiceEffect: 'eco' }, 'fx'), true);
  assert.equal(voiceActive({ voicePitch: 2 }), true);
});

test('voz: todos os ruídos, tratamentos e efeitos rodam de verdade no FFmpeg', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-voice-'));
  const src = path.join(dir, 'fala.m4a');
  await runFfmpeg(['-f', 'lavfi', '-i', "aevalsrc='0.3*sin(2*PI*220*t)+0.05*(random(0)-0.5)':s=44100:d=2.5", '-c:a', 'aac', '-y', src], { label: 'gera' });
  const combos = [
    ...Object.keys(VOICE_NOISE).map((voiceNoise) => ({ voiceEnhance: true, voiceNoise })),
    ...Object.keys(VOICE_PRESETS).map((voicePreset) => ({ voiceEnhance: true, voicePreset })),
    ...Object.keys(VOICE_EFFECTS).map((voiceEffect) => ({ voiceEffect })),
    { voicePitch: 4 },
  ];
  for (const o of combos) {
    const out = path.join(dir, 'p.m4a');
    await previewVoice(src, dir, out, o, 0, 2);
    assert.ok(fs.statSync(out).size > 1000, `gerou áudio: ${JSON.stringify(o)}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
