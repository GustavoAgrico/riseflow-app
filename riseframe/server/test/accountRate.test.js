import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// App de PC/Mac falando com o site: pedidos juntos viram UMA conferência do login, e um
// 429 do site (pedidos demais) espera e tenta de novo em vez de recusar o login na hora.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-rate-'));
const procs = [];
let site;
after(() => { procs.forEach((p) => p.kill()); site?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

test('conta central: 429 no login espera e tenta de novo; pedidos juntos = 1 conferência', { timeout: 60000 }, async () => {
  const hits = { me: 0, login: 0 };
  site = http.createServer((req, res) => {
    if (req.url === '/api/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}'); }
    if (req.url === '/api/auth/login') {
      hits.login++;
      // 1ª vez: o provedor do site recusa (texto, sem JSON), como o Render faz
      if (hits.login === 1) { res.writeHead(429, { 'content-type': 'text/plain', 'retry-after': '1' }); return res.end('Too Many Requests'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ token: 'tok123', user: { id: 'u1', email: 'a@b.c' } }));
    }
    if (req.url === '/api/auth/me') {
      hits.me++;
      return setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ user: { id: 'u1', email: 'a@b.c', name: 'A' } })); }, 300);
    }
    res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"nada"}');
  });
  const sitePort = await freePort();
  await new Promise((r) => site.listen(sitePort, r));
  const port = await freePort();
  const p = spawn(process.execPath, ['src/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: path.join(tmp, 'app'), CLOUD_SYNC: 'off', EMAIL_VERIFY: 'off', TRANSCRIBE_PROVIDER: 'mock', BILLING_MODE: 'off', ADMIN_EMAILS: '', ACCOUNT_SERVER: `http://127.0.0.1:${sitePort}` },
    stdio: 'ignore',
  });
  procs.push(p);
  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* subindo */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.c', password: '12345678' }) });
  assert.equal(login.status, 200, 'o login passou depois de esperar o 429');
  assert.equal(hits.login, 2);
  const h = { authorization: 'Bearer tok123' };
  const all = await Promise.all(Array.from({ length: 6 }, () => fetch(`${base}/queue/mine`, { headers: h })));
  assert.ok(all.every((r) => r.status === 200), all.map((r) => r.status).join(','));
  assert.equal(hits.me, 1, 'seis pedidos juntos = uma conferência no site');
});
