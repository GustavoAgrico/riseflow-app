import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Dados isolados e modo "app de PC" (mídias podem apontar para o arquivo original).
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-proj-'));
process.env.RISEFRAME_DESKTOP = '1';
const { config } = await import('../src/config.js');
const projects = await import('../src/projects.js');
const media = await import('../src/mediaStore.js');

test('projeto: salva, reabre com tudo e aparece na lista', async () => {
  const state = { segments: [{ start: 0, end: 1, words: [] }], media: [{ key: 'a', mediaId: 'logo123', kind: 'image' }], cuts: [] };
  const r = await projects.saveProject('u1', 'src_ABC123', { state, meta: { title: 'Meu vídeo' } });
  assert.equal(r.id, 'src_ABC123');
  const doc = await projects.loadProject('u1', 'src_ABC123');
  assert.deepEqual(doc.state, state);
  assert.equal(doc.meta.title, 'Meu vídeo');
  const list = await projects.listProjects('u1');
  assert.deepEqual(list.map((p) => p.id), ['src_ABC123']);
  assert.equal(await projects.loadProject('outro', 'src_ABC123'), null, 'projeto é por usuário');
  await assert.rejects(projects.saveProject('u1', '../x', { state }), /inválido/);
});

test('arquivos usados por um projeto salvo não expiram na limpeza', () => {
  const keep = projects.referencedFiles();
  assert.ok(keep.has('src_ABC123'), 'o projeto (job/vídeo de origem)');
  assert.ok(keep.has('logo123'), 'a mídia do projeto');
});

test('mídia ligada ao original: offline quando o arquivo some, volta com o relink', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-orig-'));
  const orig = path.join(dir, 'logo.png');
  fs.writeFileSync(orig, 'x');
  const pub = media.registerMedia({ id: 'm_link1', filePath: orig, kind: 'image', originalname: 'logo.png', linked: true });
  assert.equal(pub.linked, true);
  assert.equal(media.mediaStatus('m_link1').status, 'ok');
  assert.equal(media.resolveMedia('m_link1').path, path.resolve(orig), 'usa o original, sem cópia');
  fs.rmSync(orig);
  assert.equal(media.mediaStatus('m_link1').status, 'offline', 'apagou do computador → offline');
  assert.equal(media.resolveMedia('m_link1'), null);
  const novo = path.join(dir, 'logo-novo.png');
  fs.writeFileSync(novo, 'y');
  media.relinkMedia('m_link1', { filePath: novo, linked: true });
  assert.equal(media.mediaStatus('m_link1').status, 'ok', 'localizou o arquivo → volta');
  assert.equal(media.mediaStatus('nao-existe').status, 'missing');
});

test('registro das mídias fica gravado em disco (sobrevive ao reinício)', async () => {
  await new Promise((r) => setTimeout(r, 450));
  const saved = JSON.parse(fs.readFileSync(path.join(config.paths.data, 'media.json'), 'utf8'));
  assert.ok(saved.some((m) => m.id === 'm_link1' && m.linked));
});
