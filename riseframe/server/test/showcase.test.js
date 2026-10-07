import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-show-'));
const { buildShowcase, showcaseInfo } = await import('../src/showcase.js');

test('sem demonstração própria: usa a que vem com o site (web/dist/demo) ou a ilustração', () => {
  const bundled = fs.existsSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist', 'demo', 'showcase.json'));
  const info = showcaseInfo();
  if (bundled) {
    assert.equal(info.before, '/demo/antes.mp4');
    assert.equal(info.bundled, true);
  } else {
    assert.equal(info, null);
  }
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

test('pacote .zip da demo: abre e traz os arquivos', async () => {
  const fsP = await import('node:fs');
  const dir = path.join(process.env.DATA_DIR, 'showcase');
  fsP.mkdirSync(dir, { recursive: true });
  fsP.writeFileSync(path.join(dir, 'antes.mp4'), 'a'.repeat(100));
  fsP.writeFileSync(path.join(dir, 'depois.mp4'), 'b'.repeat(50));
  fsP.writeFileSync(path.join(dir, 'showcase.json'), JSON.stringify({ ready: true, sim: { broll: [] } }));
  const { showcaseZip, showcaseInfo: info } = await import('../src/showcase.js');
  const zip = showcaseZip();
  assert.equal(zip.readUInt32LE(0), 0x04034b50, 'assinatura zip');
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50, 'fim do zip');
  assert.equal(zip.readUInt16LE(zip.length - 22 + 10), 3, '3 arquivos');
  assert.match(zip.toString('latin1'), /demo\/antes\.mp4/);
  assert.equal(info().before.startsWith('/api/showcase/antes.mp4'), true);
});
