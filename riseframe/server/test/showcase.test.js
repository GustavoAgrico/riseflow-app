import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-show-'));
const { buildShowcase, showcaseInfo } = await import('../src/showcase.js');

test('sem demonstração: a página inicial mostra a ilustração (info = null)', () => {
  assert.equal(showcaseInfo(), null);
});

test('demonstração hospedada fora (SHOWCASE_*_URL) tem prioridade', () => {
  process.env.SHOWCASE_BEFORE_URL = 'https://cdn.exemplo/antes.mp4';
  process.env.SHOWCASE_AFTER_URL = 'https://cdn.exemplo/depois.mp4';
  const info = showcaseInfo();
  assert.equal(info.before, 'https://cdn.exemplo/antes.mp4');
  assert.equal(info.after, 'https://cdn.exemplo/depois.mp4');
  delete process.env.SHOWCASE_BEFORE_URL;
  delete process.env.SHOWCASE_AFTER_URL;
});

test('só aceita vídeo editado e concluído, com arquivos ainda no servidor', () => {
  assert.throws(() => buildShowcase(null), /concluído/);
  assert.throws(() => buildShowcase({ id: 'x', status: 'done', mode: 'transcribe' }), /editado/);
  assert.throws(() => buildShowcase({ id: 'x', status: 'done', mode: 'auto', inputPath: '/nao/existe.mp4' }), /apagados/);
});
