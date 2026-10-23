import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { SFX_LIBRARY, SFX_CATEGORIES, sfxInfo, sfxPreviewFile, buildSfxMix } from '../src/pipeline/sfx.js';
import { probeSummary } from '../src/pipeline/ffmpeg.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-sfxlib-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('biblioteca de efeitos sonoros: todo som tem categoria e duração e é gerado', { timeout: 120000 }, async () => {
  for (const id of Object.keys(SFX_LIBRARY)) {
    const info = sfxInfo(id);
    assert.ok(Object.hasOwn(SFX_CATEGORIES, info.cat), `${id}: categoria ${info.cat}`);
    assert.ok(info.dur > 0 && info.dur <= 3, `${id}: duração ${info.dur}`);
    const file = await sfxPreviewFile(id, tmp);
    const m = await probeSummary(file);
    assert.ok(m.hasAudio && Math.abs(m.duration - info.dur) < 0.2, `${id}: ${m.duration} s`);
  }
});

test('volume de cada efeito colocado à mão', () => {
  const a = buildSfxMix([{ t: 1, type: 'pop' }]);
  const b = buildSfxMix([{ t: 1, type: 'pop', volume: 2 }]);
  const v = (f) => Number(/volume=([\d.]+)/.exec(f.filter)[1]);
  assert.ok(Math.abs(v(b) - 2 * v(a)) < 0.002, `${v(a)} → ${v(b)}`);
});
