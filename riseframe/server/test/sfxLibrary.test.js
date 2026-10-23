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

test('pacote de sons em arquivo: manifesto + arquivos soltos numa subpasta', async () => {
  const { loadSfxPack } = await import('../src/pipeline/sfx.js');
  // o pacote do projeto (CC0) já entrou na biblioteca, com categoria e duração
  const packed = Object.entries(SFX_LIBRARY).filter(([, s]) => s.file);
  assert.ok(packed.length >= 100, `${packed.length} sons do pacote`);
  for (const [id, s] of packed.slice(0, 5)) {
    assert.ok(fs.existsSync(s.file), id);
    assert.ok(Object.hasOwn(SFX_CATEGORIES, sfxInfo(id).cat));
  }
  // som posto à mão numa pasta nova vira categoria nova
  const dir = path.join(tmp, 'pack');
  fs.mkdirSync(path.join(dir, 'risadas'), { recursive: true });
  fs.copyFileSync(packed[0][1].file, path.join(dir, 'risadas', 'risada_curta.mp3'));
  const ids = loadSfxPack(dir);
  assert.deepEqual(ids, ['p-risadas-risada-curta']);
  assert.equal(SFX_LIBRARY['p-risadas-risada-curta'].label, 'Risada curta');
  assert.equal(SFX_CATEGORIES.risadas, 'Risadas');
  // no mix ele entra como arquivo (formato normalizado), sem adiantamento
  const mix = buildSfxMix([{ t: 2, type: 'p-risadas-risada-curta' }]);
  assert.ok(mix.filter.includes('[1:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=2000|2000'), mix.filter);
});
