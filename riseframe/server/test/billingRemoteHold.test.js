import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Antes de importar o config: dados numa pasta temporária.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-hold-'));
const { config } = await import('../src/config.js');
const b = await import('../src/auth/billing.js');
config.billing.mode = 'on';
config.billing.adminEmails = [];

test('cobrança do app: devolve uma vez só e com limite', async () => {
  const u = { id: 'u-app', email: 'app@exemplo.com' };
  const e = b.__testEntry(u.id);
  e.credits = 100;
  e.freeEdits = 0;
  const c = b.charge(u, 30);
  const id = b.holdRemote(u.id, { ...c, until: null, jobId: 'job-x' });
  assert.equal(b.billingStatus(u).credits, 70);
  b.refund(u.id, b.releaseRemote(u.id, id));
  assert.equal(b.billingStatus(u).credits, 100);
  assert.equal(b.releaseRemote(u.id, id), null, 'segunda devolução recusada');
  for (let i = 0; i < 12; i++) b.releaseRemote(u.id, b.holdRemote(u.id, { extra: 0, jobId: `j${i}` }));
  const last = b.holdRemote(u.id, { extra: 5, jobId: 'j-final' });
  assert.equal(b.releaseRemote(u.id, last), null, 'no máximo 10 devoluções por dia');
});
