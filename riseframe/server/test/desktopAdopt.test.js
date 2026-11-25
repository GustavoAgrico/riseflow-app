import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-adopt-'));
process.env.DATA_DIR = dir;
process.env.RISEFRAME_DESKTOP = '1';
process.env.CLOUD_SYNC = 'off';

test('app de PC: modelos de outra identificação de conta passam para a conta atual', async () => {
  fs.writeFileSync(path.join(dir, 'templates.json'), JSON.stringify({
    contaVelha: [{ id: 't1', name: 'Meu padrão', data: { cap: { a: 1 } }, isDefault: true, updatedAt: '2026-11-01' }],
    contaNova: [{ id: 't2', name: 'Outro', data: {}, isDefault: false, updatedAt: '2026-11-20' }],
  }));
  const { listTemplates } = await import('../src/userTemplates.js');
  const list = listTemplates('contaNova');
  assert.deepEqual(list.map((t) => t.id).sort(), ['t1', 't2']);
  assert.equal(list.find((t) => t.id === 't1').isDefault, true);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'templates.json'), 'utf8'));
  assert.deepEqual(Object.keys(saved), ['contaNova']);
});

test('app de PC: fontes enviadas com outra conta passam para a conta atual (mesmo id)', async () => {
  const old = path.join(dir, 'fonts', 'contaVelha');
  fs.mkdirSync(old, { recursive: true });
  fs.writeFileSync(path.join(old, 'abcdefgh1234.ttf'), 'x');
  fs.writeFileSync(path.join(old, 'index.json'), JSON.stringify([{ id: 'abcdefgh1234', name: 'Coolvetica', file: 'abcdefgh1234.ttf', at: 1 }]));
  const { listCustomFonts, resolveCustomFont } = await import('../src/customFonts.js');
  assert.deepEqual(listCustomFonts('contaNova').map((f) => f.name), ['Coolvetica']);
  assert.ok(resolveCustomFont('contaNova', 'abcdefgh1234'));
  assert.equal(fs.existsSync(old), false);
});
