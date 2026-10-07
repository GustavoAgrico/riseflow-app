import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// O app de PC (electron-builder) só empacota as dependências do package.json da RAIZ.
// Se uma lib do servidor faltar lá, o app instalado abre com ERR_MODULE_NOT_FOUND.
test('dependências do servidor também estão na raiz (app de PC)', () => {
  const root = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url)));
  const server = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
  const missing = Object.keys(server.dependencies).filter((d) => !(root.dependencies || {})[d]);
  assert.deepEqual(missing, [], `adicione em riseframe/package.json → dependencies: ${missing.join(', ')}`);
});
