import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';

// Conta central: o "site" (cobra) e o "app de PC/Mac" (ACCOUNT_SERVER=site, processa)
// rodando de verdade, como no uso real.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-conta-'));
const procs = [];
after(() => procs.forEach((p) => p.kill()));

const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

async function startServer(name, env) {
  const port = await freePort();
  const p = spawn(process.execPath, ['src/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: path.join(tmp, name), CLOUD_SYNC: 'off', EMAIL_VERIFY: 'off', TRANSCRIBE_PROVIDER: 'mock', ADMIN_EMAILS: '', ...env },
    stdio: 'ignore',
  });
  procs.push(p);
  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return base;
    } catch { /* subindo */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`${name} não subiu`);
}

const json = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const post = (url, body, token) => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body || {}),
}).then(json);
const get = (url, token) => fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} }).then(json);
function upload(url, token, file) {
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
  fd.append('options', JSON.stringify({ captions: false, colorLook: 'none' }));
  return fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd }).then(json);
}
async function waitJob(base, token, id) {
  for (let i = 0; i < 200; i++) {
    const { body } = await get(`${base}/jobs/${id}`, token);
    if (body.status === 'done' || body.status === 'error') return body;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('job não terminou');
}

test('app de PC/Mac usa a conta do site: login, cobrança, devolução e entrar pelo navegador', { timeout: 120000 }, async () => {
  const site = await startServer('site', { BILLING_MODE: 'on' });
  const app = await startServer('app', { BILLING_MODE: 'off', ACCOUNT_SERVER: site.replace(/\/api$/, '') });
  const video = path.join(tmp, 'v.mp4');
  spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=160x120:r=15:d=2', '-f', 'lavfi', '-i', 'sine=d=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', '-y', video]);

  assert.equal((await get(`${app}/health`)).body.account.remote, true);
  // Cadastro feito pelo app vira conta do SITE (nenhuma conta local no computador).
  const reg = await post(`${app}/auth/register`, { email: 'cliente@exemplo.com', password: 'senha12345', name: 'Cliente' });
  assert.equal(reg.status, 201);
  const token = reg.body.token;
  assert.equal((await get(`${site}/auth/me`, token)).body.user.email, 'cliente@exemplo.com', 'o token é do site');
  assert.ok(!fs.existsSync(path.join(tmp, 'app', 'users.json')), 'sem conta local');
  assert.equal((await get(`${app}/billing`, token)).body.freeEdits, 3, 'planos/créditos vêm do site');

  // Cada vídeo processado no app gasta da conta do site; a 4ª edição grátis é recusada.
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const r = await upload(`${app}/transcribe`, token, video);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.freeEdit, true);
    ids.push(r.body.id);
  }
  const no = await upload(`${app}/transcribe`, token, video);
  assert.equal(no.status, 402);
  assert.equal(no.body.code, 'PAYMENT_REQUIRED');
  assert.equal((await get(`${site}/billing`, token)).body.freeEdits, 0);

  // Editar na timeline um vídeo de teste continua grátis (o site conhece o id do app).
  const src = await waitJob(app, token, ids[0]);
  assert.equal(src.status, 'done');
  const rend = await post(`${app}/render`, { sourceId: ids[0], editedTranscript: src.report.transcript, options: { captions: false, colorLook: 'none' } }, token);
  assert.equal(rend.status, 201, JSON.stringify(rend.body));
  assert.equal(rend.body.freeEdit, true);

  // Vídeo que falha devolve a edição grátis na conta do site.
  const other = (await post(`${app}/auth/register`, { email: 'outro@exemplo.com', password: 'senha12345' })).body.token;
  const bad = path.join(tmp, 'ruim.mp4');
  fs.writeFileSync(bad, 'isto não é vídeo');
  const failed = await upload(`${app}/transcribe`, other, bad);
  assert.equal((await get(`${site}/billing`, other)).body.freeEdits, 2);
  assert.equal((await waitJob(app, other, failed.body.id)).status, 'error');
  let back = 0;
  for (let i = 0; i < 40 && back !== 3; i++) {
    await new Promise((r) => setTimeout(r, 150));
    back = (await get(`${site}/billing`, other)).body.freeEdits;
  }
  assert.equal(back, 3, 'edição devolvida');

  // Entrar pelo navegador: o app pede o código, a pessoa confirma no site, o app recebe o token (uma vez).
  const start = (await post(`${app}/auth/device/start`)).body;
  assert.match(start.url, /\?device=/);
  assert.equal(new URL(start.url).origin, new URL(site).origin, 'abre a página do próprio servidor da conta (mesma versão)');
  assert.equal((await post(`${app}/auth/device/poll`, { code: start.code })).body.pending, true);
  assert.equal((await post(`${site}/auth/device/approve`, { code: start.code })).status, 401, 'confirmar exige login no site');
  assert.equal((await post(`${site}/auth/device/approve`, { code: start.code }, token)).status, 200);
  const got = (await post(`${app}/auth/device/poll`, { code: start.code })).body;
  assert.ok(got.token);
  assert.equal(got.user.email, 'cliente@exemplo.com');
  assert.equal((await post(`${app}/auth/device/poll`, { code: start.code })).status, 404, 'código vale uma vez só');

  // Conecta sozinho logo depois do login no site (sem clicar em "Conectar app").
  const s2 = (await post(`${app}/auth/device/start`)).body;
  assert.equal((await post(`${site}/auth/device/approve`, { code: s2.code, auto: true }, token)).status, 200);
  assert.ok((await post(`${app}/auth/device/poll`, { code: s2.code })).body.token);
  assert.equal((await get(`${app}/auth/me`, got.token)).status, 200);

  // Token inválido não entra no app.
  assert.equal((await get(`${app}/settings`, 'token.falso.x')).status, 401);
});

test('app de PC/Mac: teste grátis com tudo liberado, depois só com plano mensal ativo', { timeout: 120000 }, async () => {
  const site = await startServer('site2', { BILLING_MODE: 'on', BILLING_FREE_EDITS: '1', ADMIN_EMAILS: 'chefe@exemplo.com' });
  const app = await startServer('app2', { BILLING_MODE: 'off', ACCOUNT_SERVER: site.replace(/\/api$/, '') });
  const video = path.join(tmp, 'v2.mp4');
  spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=160x120:r=15:d=2', '-f', 'lavfi', '-i', 'sine=d=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', '-y', video]);

  const token = (await post(`${app}/auth/register`, { email: 'novo@exemplo.com', password: 'senha12345' })).body.token;
  assert.equal((await get(`${app}/billing`, token)).body.appAccess, true, 'teste grátis: app liberado');
  const trial = await upload(`${app}/transcribe`, token, video);
  assert.equal(trial.status, 201, JSON.stringify(trial.body));
  assert.equal(trial.body.freeEdit, true);
  const src = await waitJob(app, token, trial.body.id);
  assert.equal(src.status, 'done');

  // Acabou o teste: o app pausa até assinar…
  const b = (await get(`${app}/billing`, token)).body;
  assert.equal(b.appAccess, false);
  assert.equal(b.appRequiresPlan, true);
  // o app continua aberto (tudo liberado) para terminar os vídeos de teste
  assert.equal(b.trialActive, true);
  assert.deepEqual([...b.features].sort(), ['ai', 'captionStyle', 'clips', 'hd', 'image']);
  const no = await upload(`${app}/transcribe`, token, video);
  assert.equal(no.status, 402);
  assert.equal(no.body.appPlanRequired, true);
  // …mas o vídeo do teste ainda pode ser finalizado na timeline.
  const rend = await post(`${app}/render`, { sourceId: trial.body.id, editedTranscript: src.report.transcript, options: { captions: false, colorLook: 'none' } }, token);
  assert.equal(rend.status, 201, JSON.stringify(rend.body));

  // Recarga avulsa sozinha não libera o app; o plano mensal libera.
  const admin = (await post(`${site}/auth/register`, { email: 'chefe@exemplo.com', password: 'senha12345' })).body.token;
  assert.equal((await post(`${site}/billing/admin/grant`, { email: 'novo@exemplo.com', kind: 'pack', itemId: 'recarga-100' }, admin)).status, 200);
  assert.equal((await upload(`${app}/transcribe`, token, video)).status, 402);
  assert.equal((await post(`${site}/billing/admin/grant`, { email: 'novo@exemplo.com', kind: 'plan', itemId: 'pro' }, admin)).status, 200);
  assert.equal((await get(`${app}/billing`, token)).body.appAccess, true);
  const ok = await upload(`${app}/transcribe`, token, video);
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.ok(!ok.body.freeEdit, 'cobra do plano');
  assert.equal((await waitJob(app, token, ok.body.id)).status, 'done');
});

test('app de PC sem chaves: as fontes de B-roll são as ligadas no site', { timeout: 60000 }, async () => {
  const noKeys = { PEXELS_API_KEY: '', PIXABAY_API_KEY: '', SERPER_API_KEY: '', BRAVE_SEARCH_KEY: '', BRAVE_API_KEY: '', GOOGLE_CSE_KEY: '', GOOGLE_CSE_ID: '' };
  const site = await startServer('site-broll', { ...noKeys, BILLING_MODE: 'on', PEXELS_API_KEY: 'a'.repeat(40), PIXABAY_API_KEY: '123456-abcdef', SERPER_API_KEY: 'chave-serper' });
  const app = await startServer('app-broll', { ...noKeys, BILLING_MODE: 'off', ACCOUNT_SERVER: site.replace(/\/api$/, '') });
  const caps = (await get(`${app}/health`)).body.capabilities;
  assert.equal(caps.brollReady, true, 'Pexels');
  assert.equal(caps.pixabayReady, true, 'Pixabay');
  assert.equal(caps.googleImagesReady, true, 'Google');
  assert.equal(caps.brollViaSite, true);
  // site sem chaves: o app também não mostra (só o acervo livre)
  const bare = await startServer('site-bare', { ...noKeys, BILLING_MODE: 'on' });
  const app2 = await startServer('app-bare', { ...noKeys, BILLING_MODE: 'off', ACCOUNT_SERVER: bare.replace(/\/api$/, '') });
  const c2 = (await get(`${app2}/health`)).body.capabilities;
  assert.equal(c2.brollReady, false);
  assert.equal(c2.pixabayReady, false);
});
