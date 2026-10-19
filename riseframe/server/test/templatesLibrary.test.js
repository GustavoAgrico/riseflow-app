import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-tpl-'));
process.env.OUTPUT_TTL_HOURS = '1';
const { config } = await import('../src/config.js');
const tpl = await import('../src/userTemplates.js');
const media = await import('../src/mediaStore.js');

test('meus modelos: salvar, padrão único, atualizar pelo nome, apagar', () => {
  const data = { cap: { captionTemplate: 'clean', captionScale: 0.6 }, segments: ['não entra'], media: [{ mediaId: 'logo1', kind: 'image', start: 0, duration: 30, whole: true, previewUrl: 'blob:x' }] };
  const a = tpl.saveTemplate('u1', { name: '  Meu   padrão ', data, isDefault: true });
  assert.equal(a.name, 'Meu padrão');
  assert.equal(a.data.segments, undefined, 'só estilo entra no modelo');
  assert.equal(a.data.media[0].previewUrl, undefined);
  assert.equal(a.data.media[0].whole, true);
  const b = tpl.saveTemplate('u1', { name: 'Outro', data: {}, isDefault: true });
  assert.deepEqual(tpl.listTemplates('u1').filter((t) => t.isDefault).map((t) => t.id), [b.id], 'só um padrão');
  const a2 = tpl.saveTemplate('u1', { name: 'meu padrão', data: { cap: { captionScale: 1 } } });
  assert.equal(a2.id, a.id, 'mesmo nome atualiza');
  assert.ok(tpl.templateMediaIds().has('logo1') === false, 'o modelo atualizado não usa mais o logo');
  assert.equal(tpl.listTemplates('u2').length, 0, 'cada conta vê só os seus');
  assert.throws(() => tpl.saveTemplate('u1', { name: '  ', data: {} }), /nome/);
  assert.equal(tpl.deleteTemplate('u1', b.id), true);
  assert.equal(tpl.listTemplates('u1').length, 1);
  assert.ok(fs.existsSync(path.join(config.paths.data, 'templates.json')));
});

test('biblioteca de mídias: o que a conta envia fica guardado; sem dono expira', () => {
  fs.mkdirSync(config.paths.uploads, { recursive: true });
  const f1 = path.join(config.paths.uploads, 'lib1.png');
  const f2 = path.join(config.paths.uploads, 'tmp1.png');
  fs.writeFileSync(f1, 'x');
  fs.writeFileSync(f2, 'x');
  media.registerMedia({ id: 'lib1', filePath: f1, kind: 'image', originalname: 'logo.png', ownerId: 'u1' });
  media.registerMedia({ id: 'tmp1', filePath: f2, kind: 'image', originalname: 'solto.png' });
  assert.deepEqual(media.listLibrary('u1').map((m) => [m.id, m.filename, m.status]), [['lib1', 'logo.png', 'ok']]);
  assert.equal(media.listLibrary('u2').length, 0);
  assert.ok(media.libraryIds().has('lib1'));
  // daqui a 2 horas (TTL 1 h): a sem dono expira; a da biblioteca continua
  const real = Date.now;
  Date.now = () => real() + 2 * 3600 * 1000;
  try {
    assert.ok(media.resolveMedia('lib1'), 'biblioteca não expira');
    assert.equal(media.resolveMedia('tmp1'), null, 'mídia solta expira');
  } finally {
    Date.now = real;
  }
  assert.equal(media.removeFromLibrary('lib1', 'outra-conta'), false, 'só o dono tira');
  assert.equal(media.removeFromLibrary('lib1', 'u1'), true);
  assert.equal(media.listLibrary('u1').length, 0);
});
