import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fontsDirArg } from '../src/pipeline/captions.js';

test('fontsDirArg: caminho relativo simples é usado direto; com espaço copia as fontes para o job', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'rf-fonts-'));
  const work = path.join(base, 'work', 'job1');
  await fs.mkdir(work, { recursive: true });

  const simples = path.join(base, 'fonts');
  await fs.mkdir(simples);
  await fs.writeFile(path.join(simples, 'A.ttf'), 'x');
  assert.equal(await fontsDirArg(work, simples), '../../fonts');

  // Pasta com espaço (ex.: "D:\Rise Creative\..." ou outro drive no Windows) → copia.
  const comEspaco = path.join(base, 'Rise Creative', 'fonts');
  await fs.mkdir(comEspaco, { recursive: true });
  await fs.writeFile(path.join(comEspaco, 'B.ttf'), 'y');
  assert.equal(await fontsDirArg(work, comEspaco), 'fonts');
  assert.equal(await fs.readFile(path.join(work, 'fonts', 'B.ttf'), 'utf8'), 'y');

  await fs.rm(base, { recursive: true, force: true });
});
