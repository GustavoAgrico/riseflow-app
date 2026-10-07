import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-signup-'));
const { config } = await import('../src/config.js');
const contact = await import('../src/auth/contact.js');
const express = (await import('express')).default;
const { authRouter, requireAuth, requireVerified } = await import('../src/routes/auth.js');

contact.__setDnsResolver({
  mx: async (d) => { if (d === 'naoexiste.com.br') throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); return [{ exchange: `mx.${d}`, priority: 10 }]; },
  a: async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); },
});
config.billing.adminEmails = ['dono@riseframe.test'];
config.auth.resendKey = 're_teste';
config.auth.emailFrom = 'Riseframe <nao-responda@riseframe.test>';
config.auth.signupsPerIpDay = 3;

const mails = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url) === 'https://api.resend.com/emails') {
    mails.push(JSON.parse(init.body));
    return new Response('{"id":"x"}', { status: 200 });
  }
  return realFetch(url, init);
};

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api', authRouter);
app.post('/api/jobs', requireAuth, requireVerified, (_req, res) => res.json({ ok: true }));
const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
after(() => { srv.closeAllConnections(); srv.close(); });
const base = `http://127.0.0.1:${srv.address().port}/api`;

async function post(p, body, token, ip = '10.0.0.1') {
  const r = await realFetch(`${base}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
  });
  return { status: r.status, data: await r.json() };
}

test('cadastro recusa e-mail falso: digitação errada, temporário e domínio inexistente', async () => {
  let r = await post('/auth/register', { email: 'ana@gmial.com', password: 'senha12345' });
  assert.equal(r.status, 400);
  assert.equal(r.data.suggestion, 'ana@gmail.com');
  r = await post('/auth/register', { email: 'x@mailinator.com', password: 'senha12345' });
  assert.match(r.data.error, /temporários/);
  r = await post('/auth/register', { email: 'x@naoexiste.com.br', password: 'senha12345' });
  assert.match(r.data.error, /não recebe e-mails/);
});

test('conta nova só usa o editor depois de confirmar o e-mail com o código', async () => {
  mails.length = 0;
  const r = await post('/auth/register', { email: 'Maria@Gmail.com', password: 'senha12345', name: 'Maria' });
  assert.equal(r.status, 201);
  assert.equal(r.data.needsVerification, true);
  assert.equal(r.data.user.verified, false);
  const token = r.data.token;
  const code = mails.find((m) => m.to[0] === 'maria@gmail.com').subject.match(/^(\d{6})/)[1];

  let j = await post('/jobs', {}, token);
  assert.equal(j.status, 403);
  assert.equal(j.data.needsVerification, true);

  const wrong = await post('/auth/verify', { code: code === '000000' ? '111111' : '000000' }, token);
  assert.equal(wrong.status, 400);
  const ok = await post('/auth/verify', { code }, token);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.verified, true);
  j = await post('/jobs', {}, token);
  assert.equal(j.status, 200);
});

test('limite de contas por conexão (IP) em 24 h', async () => {
  const ip = '10.9.9.9';
  for (let i = 0; i < 3; i++) {
    const r = await post('/auth/register', { email: `user${i}@gmail.com`, password: 'senha12345' }, null, ip);
    assert.equal(r.status, 201);
  }
  const r = await post('/auth/register', { email: 'user9@gmail.com', password: 'senha12345' }, null, ip);
  assert.equal(r.status, 429);
  // outra conexão continua podendo
  assert.equal((await post('/auth/register', { email: 'outra@gmail.com', password: 'senha12345' }, null, '10.1.1.1')).status, 201);
});

test('sem domínio próprio no e-mail: não exige código (valem as outras checagens)', async () => {
  config.auth.emailFrom = '';
  const r = await post('/auth/register', { email: 'semcodigo@gmail.com', password: 'senha12345' }, null, '10.2.2.2');
  assert.equal(r.status, 201);
  assert.equal(r.data.needsVerification, false);
  assert.equal(r.data.user.verified, true);
  assert.equal((await post('/jobs', {}, r.data.token)).status, 200);
  config.auth.emailFrom = 'Riseframe <nao-responda@riseframe.test>';
});
