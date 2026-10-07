import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-cloud-'));
const DATA = process.env.DATA_DIR;

// Supabase Storage falso (em memória), com as respostas do real: objeto inexistente
// vem como HTTP 400 + "not_found", bucket inexistente como 404, chave errada como 403.
const KEY = 'chave-servico-teste';
const buckets = new Set();
const objects = new Map(); // "bucket/caminho" → Buffer
const seen = []; // { method, url, auth, apikey }
let down = false;
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const url = decodeURIComponent(req.url.split('?')[0]);
  seen.push({ method: req.method, url, auth: req.headers.authorization, apikey: req.headers.apikey });
  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': Buffer.isBuffer(data) ? 'application/octet-stream' : 'application/json' });
    res.end(Buffer.isBuffer(data) ? data : JSON.stringify(data));
  };
  if (down) return send(503, { message: 'indisponível' });
  if (req.headers.apikey !== KEY) return send(403, { message: 'Invalid API key' });
  let m;
  if (req.method === 'GET' && (m = url.match(/^\/storage\/v1\/bucket\/(.+)$/))) {
    return buckets.has(m[1]) ? send(200, { id: m[1], public: false }) : send(404, { message: 'Bucket not found' });
  }
  if (req.method === 'POST' && url === '/storage/v1/bucket') {
    const b = JSON.parse(body);
    assert.equal(b.public, false);
    if (buckets.has(b.id)) return send(400, { statusCode: '409', message: 'The resource already exists' });
    buckets.add(b.id);
    return send(200, { name: b.id });
  }
  if (req.method === 'POST' && (m = url.match(/^\/storage\/v1\/object\/list\/([^/]+)$/))) {
    const { prefix } = JSON.parse(body);
    const items = [...objects.keys()].filter((k) => k.startsWith(`${m[1]}/${prefix}/`)).map((k) => ({ id: k, name: k.slice(m[1].length + prefix.length + 2) }));
    return send(200, items);
  }
  if (req.method === 'GET' && (m = url.match(/^\/storage\/v1\/object\/authenticated\/(.+)$/))) {
    return objects.has(m[1]) ? send(200, objects.get(m[1])) : send(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
  }
  if (req.method === 'POST' && (m = url.match(/^\/storage\/v1\/object\/(.+)$/))) {
    if (!req.headers['x-upsert'] && objects.has(m[1])) return send(400, { statusCode: '409', message: 'Duplicate' });
    objects.set(m[1], body);
    return send(200, { Key: m[1] });
  }
  if (req.method === 'DELETE' && (m = url.match(/^\/storage\/v1\/object\/([^/]+)$/))) {
    for (const p of JSON.parse(body).prefixes) objects.delete(`${m[1]}/${p}`);
    return send(200, []);
  }
  send(404, { message: 'rota desconhecida' });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
after(() => { server.closeAllConnections(); server.close(); });

process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}/`;
process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
process.env.CLOUD_BUCKET = 'rf-teste';

const cloud = await import('../src/cloudSync.js');
const store = await import('../src/auth/store.js');
const tokens = await import('../src/auth/tokens.js');

const remote = (name) => objects.get(`rf-teste/${name}`);
const contas = [{ id: 'u1', email: 'antigo@example.com', name: 'Antigo', salt: null, hash: null, plan: 'basic', createdAt: '2026-01-01T00:00:00Z' }];

test('no boot: cria o bucket privado, traz os dados da nuvem e sobe o que só existe aqui', async () => {
  objects.set('rf-teste/users.json', Buffer.from(JSON.stringify(contas)));
  objects.set('rf-teste/showcase/showcase.json', Buffer.from('{"ready":true}'));
  fs.writeFileSync(path.join(DATA, 'settings.json'), '{"u1":{"pexelsKey":""}}'); // só local
  assert.equal(await cloud.restoreFromCloud(), true);
  assert.ok(buckets.has('rf-teste'));
  assert.equal(store.findByEmail('antigo@example.com')?.id, 'u1');
  assert.equal(remote('settings.json').toString(), '{"u1":{"pexelsKey":""}}');
  assert.equal(remote('billing.json'), undefined); // nada a subir
  assert.deepEqual(cloud.cloudStatus().ok, true);
  // Chave antiga (JWT) vai também no Authorization.
  assert.equal(seen[0].auth, `Bearer ${KEY}`);
  // A demo vem em segundo plano.
  for (let i = 0; i < 50 && !fs.existsSync(path.join(DATA, 'showcase', 'showcase.json')); i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(fs.readFileSync(path.join(DATA, 'showcase', 'showcase.json'), 'utf8'), '{"ready":true}');
});

test('cada gravação sobe para a nuvem (inclusive o segredo dos logins)', async () => {
  store.createUser({ email: 'novo@example.com', password: 'senha12345', name: 'Novo' });
  tokens.signToken({ id: 'u1', email: 'antigo@example.com', name: 'Antigo' }); // gera data/auth_secret
  await cloud.flushCloud();
  const users = JSON.parse(remote('users.json'));
  assert.deepEqual(users.map((u) => u.email), ['antigo@example.com', 'novo@example.com']);
  assert.equal(remote('auth_secret').toString(), fs.readFileSync(path.join(DATA, 'auth_secret'), 'utf8'));
  assert.ok(cloud.cloudStatus().savedAt);
});

test('um reinício (disco vazio) volta com tudo: contas e logins continuam valendo', async () => {
  const token = tokens.signToken({ id: 'u1', email: 'antigo@example.com', name: 'Antigo' });
  for (const f of fs.readdirSync(DATA)) fs.rmSync(path.join(DATA, f), { recursive: true, force: true });
  cloud.__resetCloud();
  assert.equal(await cloud.restoreFromCloud(), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'), 'utf8')).map((u) => u.email), ['antigo@example.com', 'novo@example.com']);
  // Mesmo segredo de antes (num processo novo seria lido do arquivo restaurado).
  assert.equal(fs.readFileSync(path.join(DATA, 'auth_secret'), 'utf8'), remote('auth_secret').toString());
  assert.equal(tokens.verifyToken(token)?.sub, 'u1');
});

test('logo após subir, o que o servidor antigo gravou na nuvem é recarregado', async () => {
  cloud.__resetCloud();
  assert.equal(await cloud.restoreFromCloud({ watchEveryMs: 30 }), true);
  const now = JSON.parse(remote('users.json'));
  now.push({ ...contas[0], id: 'u9', email: 'tardio@example.com' });
  objects.set('rf-teste/users.json', Buffer.from(JSON.stringify(now)));
  for (let i = 0; i < 100 && !store.findByEmail('tardio@example.com'); i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(store.findByEmail('tardio@example.com')?.id, 'u9');
});

test('chave errada: segue sem nuvem, sem apagar nada lá', async () => {
  cloud.__resetCloud();
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'errada';
  const before = remote('users.json');
  assert.equal(await cloud.restoreFromCloud(), false);
  assert.equal(cloud.cloudEnabled(), false);
  assert.match(cloud.cloudStatus().error, /chave do Supabase recusada/);
  store.createUser({ email: 'offline@example.com', password: 'senha12345', name: 'Off' });
  await cloud.flushCloud();
  assert.equal(remote('users.json'), before);
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
});

test('Supabase fora do ar: não sobe vazio (lança depois das tentativas)', async () => {
  cloud.__resetCloud();
  down = true;
  await assert.rejects(cloud.restoreFromCloud({ attempts: 2, baseDelayMs: 5 }), /não consegui ler os dados no Supabase/);
  down = false;
});

test('chave nova (sb_secret_…) vai só no header apikey', async () => {
  cloud.__resetCloud();
  const old = KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_x';
  seen.length = 0;
  await cloud.restoreFromCloud(); // o servidor falso recusa, mas os headers ficam registrados
  assert.equal(seen[0].apikey, 'sb_secret_x');
  assert.equal(seen[0].auth, undefined);
  process.env.SUPABASE_SERVICE_ROLE_KEY = old;
});

test('sem SUPABASE_URL/chave (ou CLOUD_SYNC=off) não faz nada', async () => {
  cloud.__resetCloud();
  process.env.CLOUD_SYNC = 'off';
  seen.length = 0;
  assert.equal(await cloud.restoreFromCloud(), false);
  assert.equal(seen.length, 0);
  delete process.env.CLOUD_SYNC;
});

test('demonstração: troca os arquivos na nuvem e apaga os que sobraram', async () => {
  cloud.__resetCloud();
  await cloud.restoreFromCloud();
  objects.set('rf-teste/showcase/broll_7.jpg', Buffer.from('velho'));
  fs.mkdirSync(path.join(DATA, 'showcase'), { recursive: true });
  for (const f of ['antes.mp4', 'depois.mp4', 'showcase.json', 'broll_0.jpg']) fs.writeFileSync(path.join(DATA, 'showcase', f), f);
  await cloud.cloudReplaceShowcase(['antes.mp4', 'depois.mp4', 'showcase.json', 'broll_0.jpg']);
  const names = [...objects.keys()].filter((k) => k.startsWith('rf-teste/showcase/')).sort();
  assert.deepEqual(names, ['rf-teste/showcase/antes.mp4', 'rf-teste/showcase/broll_0.jpg', 'rf-teste/showcase/depois.mp4', 'rf-teste/showcase/showcase.json']);
  await cloud.cloudRemoveShowcase();
  assert.equal([...objects.keys()].filter((k) => k.startsWith('rf-teste/showcase/')).length, 0);
  cloud.__resetCloud();
});
