import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';

// Pausar / cancelar / retomar vídeos da fila — servidor de verdade, cobrança ligada.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-fila-'));
const procs = [];
after(() => procs.forEach((p) => p.kill()));

const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('fila: pausar, cancelar (devolve a edição grátis) e retomar — só o dono', { timeout: 180000 }, async () => {
  const port = await freePort();
  const p = spawn(process.execPath, ['src/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: path.join(tmp, 'data'), CLOUD_SYNC: 'off', EMAIL_VERIFY: 'off', TRANSCRIBE_PROVIDER: 'mock', ADMIN_EMAILS: '', BILLING_MODE: 'on', BILLING_FREE_EDITS: '3' },
    stdio: 'ignore',
  });
  procs.push(p);
  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* subindo */ }
    await sleep(150);
  }
  const json = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
  const post = (url, body, token) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body || {}) }).then(json);
  const get = (url, token) => fetch(url, { headers: { authorization: `Bearer ${token}` } }).then(json);
  const video = path.join(tmp, 'v.mp4');
  spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=25:d=12', '-f', 'lavfi', '-i', 'sine=d=12', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', '-y', video]);
  const upload = (token, name) => {
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync(video)]), name);
    fd.append('options', JSON.stringify({ captions: false, colorLook: 'none' }));
    return fetch(`${base}/jobs`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd }).then(json);
  };

  const token = (await post(`${base}/auth/register`, { email: 'dono@exemplo.com', password: 'senha12345' })).body.token;
  const other = (await post(`${base}/auth/register`, { email: 'outro@exemplo.com', password: 'senha12345' })).body.token;
  const a = (await upload(token, 'a.mp4')).body;
  const b = (await upload(token, 'b.mp4')).body;
  const c = (await upload(token, 'c.mp4')).body;
  assert.ok(a.id && b.id && c.id);
  assert.equal((await get(`${base}/billing`, token)).body.freeEdits, 0);

  // outra conta não mexe no vídeo
  assert.equal((await post(`${base}/jobs/${b.id}/cancel`, {}, other)).status, 404);

  // pausar um da fila
  const pb = await post(`${base}/jobs/${b.id}/pause`, {}, token);
  assert.equal(pb.status, 200);
  assert.equal(pb.body.status, 'paused');
  // cancelar outro da fila → edição grátis volta
  const cc = await post(`${base}/jobs/${c.id}/cancel`, {}, token);
  assert.equal(cc.body.status, 'error');
  assert.equal(cc.body.stage, 'canceled');
  // cancelar o que está processando → para e devolve
  const ca = await post(`${base}/jobs/${a.id}/cancel`, {}, token);
  assert.equal(ca.status, 200);
  let st = null;
  for (let i = 0; i < 100; i++) {
    st = (await get(`${base}/jobs/${a.id}`, token)).body;
    if (st.status !== 'processing') break;
    await sleep(150);
  }
  assert.equal(st.stage, 'canceled', JSON.stringify(st));
  let free = 0;
  for (let i = 0; i < 40 && free !== 2; i++) { free = (await get(`${base}/billing`, token)).body.freeEdits; await sleep(100); }
  assert.equal(free, 2, 'as duas edições canceladas voltaram (a pausada continua reservada)');

  // a pausada aparece na fila da conta e, retomada, termina normal
  const mine = (await get(`${base}/queue/mine`, token)).body.jobs;
  assert.equal(mine.find((j) => j.id === b.id)?.status, 'paused');
  assert.equal((await post(`${base}/jobs/${b.id}/resume`, {}, token)).status, 200);
  for (let i = 0; i < 400; i++) {
    st = (await get(`${base}/jobs/${b.id}`, token)).body;
    if (st.status === 'done' || st.status === 'error') break;
    await sleep(200);
  }
  assert.equal(st.status, 'done', JSON.stringify(st));
  assert.equal((await post(`${base}/jobs/${b.id}/cancel`, {}, token)).status, 409, 'pronto não cancela');
});
