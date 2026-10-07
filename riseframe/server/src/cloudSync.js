import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { makeLogger } from './logger.js';

const log = makeLogger('nuvem');

/**
 * Cópia dos dados na nuvem (Supabase Storage), para o servidor sem disco permanente
 * (Render grátis) não perder nada a cada deploy/reinício:
 *   - contas (users.json), planos/créditos/Pix (billing.json), configurações
 *     (settings.json) e o segredo dos logins (auth_secret);
 *   - a demonstração da página inicial (showcase/*).
 * No boot, baixa tudo do bucket privado antes de abrir a porta; a cada gravação, sobe
 * o arquivo (agrupando gravações seguidas). Os vídeos dos usuários NÃO vão para a
 * nuvem (são grandes e temporários).
 * Ativa com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY);
 * CLOUD_SYNC=off desliga. O bucket (CLOUD_BUCKET, padrão riseframe-data) é criado
 * sozinho como PRIVADO: só o servidor, com a chave secreta, lê e grava.
 */
export const SYNCED = ['users.json', 'billing.json', 'settings.json', 'auth_secret'];
const SAVE_DELAY_MS = 1500;
const RETRY_MS = 30_000;
const WATCH_MS = 5 * 60_000; // logo após subir, confere se o servidor antigo gravou algo
const WATCH_EVERY_MS = 20_000;

const state = { enabled: false, ok: false, error: null, restoredAt: null, savedAt: null };
const known = new Map(); // nome → hash do conteúdo que a nuvem tem (pelo que sabemos)
const dirty = new Set(); // arquivos gravados por ESTE servidor desde que subiu
const timers = new Map();
const chains = new Map();
const reloaders = new Map();
let watchTimer = null;

function settings() {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  const off = ['0', 'false', 'off', 'no'].includes(String(process.env.CLOUD_SYNC || '').toLowerCase());
  return { url, key, bucket: process.env.CLOUD_BUCKET || 'riseframe-data', enabled: Boolean(url && key && !off) };
}

export function cloudEnabled() {
  return state.enabled;
}

export function cloudStatus() {
  const { bucket } = settings();
  return { enabled: state.enabled, ok: state.ok, error: state.error, bucket, restoredAt: state.restoredAt, savedAt: state.savedAt };
}

/** Quem guarda o arquivo em memória avisa como recarregar se a nuvem trouxer versão nova. */
export function onCloudReload(name, fn) {
  reloaders.set(name, fn);
}

const hash = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── API do Supabase Storage ──
async function call(method, p, { body, headers = {}, timeout = 60_000 } = {}) {
  const { url, key } = settings();
  const auth = { apikey: key };
  // Chaves novas (sb_secret_…) vão só no header apikey; as antigas (JWT) também no Authorization.
  if (!key.startsWith('sb_')) auth.Authorization = `Bearer ${key}`;
  const res = await fetch(`${url}/storage/v1/${p}`, { method, body, headers: { ...auth, ...headers }, signal: AbortSignal.timeout(timeout) });
  if (res.ok) return res;
  const text = await res.text().catch(() => '');
  const err = new Error(`Supabase ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  err.status = res.status;
  err.notFound = res.status === 404 || (res.status === 400 && /not.?found|"404"/i.test(text));
  err.exists = res.status === 409 || /already exists|duplicate/i.test(text);
  err.auth = res.status === 401 || res.status === 403 || (res.status === 400 && /jwt|jws|signature|api ?key|unauthori/i.test(text));
  throw err;
}

const objPath = (name) => `${settings().bucket}/${name.split('/').map(encodeURIComponent).join('/')}`;

async function ensureBucket() {
  const { bucket } = settings();
  try {
    await call('GET', `bucket/${encodeURIComponent(bucket)}`);
  } catch (err) {
    if (!err.notFound) throw err;
    try {
      await call('POST', 'bucket', {
        body: JSON.stringify({ id: bucket, name: bucket, public: false }),
        headers: { 'Content-Type': 'application/json' },
      });
      log.ok(`bucket privado "${bucket}" criado no Supabase`);
    } catch (e) {
      if (!e.exists) throw e;
    }
  }
}

async function download(name) {
  try {
    const res = await call('GET', `object/authenticated/${objPath(name)}`, { timeout: 120_000 });
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (err.notFound) return null;
    throw err;
  }
}

async function upload(name, buf) {
  const type = name.endsWith('.json') ? 'application/json' : name.endsWith('.mp4') ? 'video/mp4' : name.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
  await call('POST', `object/${objPath(name)}`, { body: buf, headers: { 'Content-Type': type, 'x-upsert': 'true' }, timeout: 300_000 });
}

async function list(prefix) {
  const res = await call('POST', `object/list/${settings().bucket}`, {
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
    headers: { 'Content-Type': 'application/json' },
  });
  const items = await res.json();
  return (Array.isArray(items) ? items : []).filter((it) => it?.name && it.id !== null).map((it) => `${prefix}/${it.name}`);
}

async function removeRemote(names) {
  if (!names.length) return;
  await call('DELETE', `object/${settings().bucket}`, {
    body: JSON.stringify({ prefixes: names }),
    headers: { 'Content-Type': 'application/json' },
  });
}

const local = (name) => path.join(config.paths.data, ...name.split('/'));

function writeLocal(name, buf) {
  const file = local(name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.cloud-tmp`, buf, { mode: 0o600 });
  fs.renameSync(`${file}.cloud-tmp`, file);
}

/**
 * Traz os dados da nuvem ANTES do servidor usar qualquer arquivo. Sem nuvem configurada,
 * não faz nada. Chave errada → segue sem nuvem (avisa). Supabase fora do ar → tenta por
 * ~2 min e então lança: subir vazio e depois gravar por cima apagaria os dados de lá.
 */
export async function restoreFromCloud({ attempts = 6, baseDelayMs = 2000, watchEveryMs = WATCH_EVERY_MS } = {}) {
  const s = settings();
  state.enabled = s.enabled;
  if (!s.enabled) return false;
  for (let i = 0; ; i++) {
    try {
      await ensureBucket();
      for (const name of SYNCED) {
        const buf = await download(name);
        if (buf) {
          writeLocal(name, buf);
          known.set(name, hash(buf));
        } else if (fs.existsSync(local(name))) {
          // Primeira vez com a nuvem: sobe o que este servidor já tem.
          const mine = fs.readFileSync(local(name));
          await upload(name, mine);
          known.set(name, hash(mine));
        }
      }
      state.ok = true;
      state.error = null;
      state.restoredAt = new Date().toISOString();
      log.ok(`dados restaurados do Supabase (bucket ${s.bucket})`);
      restoreShowcase().catch((err) => log.warn(`demonstração não veio da nuvem: ${err.message}`));
      startWatch(watchEveryMs);
      return true;
    } catch (err) {
      if (err.auth) {
        state.enabled = false;
        state.error = 'chave do Supabase recusada: confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY';
        log.error(`${state.error} (${err.message}) — seguindo SEM cópia na nuvem`);
        return false;
      }
      state.error = err.message;
      if (i + 1 >= attempts) throw new Error(`não consegui ler os dados no Supabase: ${err.message}`);
      log.warn(`Supabase indisponível (${err.message}); tentando de novo…`);
      await sleep(baseDelayMs * 2 ** i);
    }
  }
}

// A demo é grande: vem em segundo plano (até lá a página usa a demo embutida no site).
async function restoreShowcase() {
  const names = await list('showcase');
  for (const name of names) {
    if (fs.existsSync(local(name))) continue;
    const buf = await download(name);
    if (buf) writeLocal(name, buf);
  }
  if (names.length) log.ok(`demonstração restaurada do Supabase (${names.length} arquivos)`);
}

/**
 * Num deploy, o servidor antigo ainda atende por alguns segundos depois que este já
 * restaurou; o que ele gravar nesse meio-tempo chega na nuvem por último. Nos primeiros
 * minutos, se a nuvem mudar e este servidor ainda não gravou aquele arquivo, recarrega.
 */
function startWatch(every) {
  const until = Date.now() + WATCH_MS;
  const tick = async () => {
    watchTimer = null;
    for (const name of SYNCED) {
      if (name === 'auth_secret' || dirty.has(name)) continue;
      try {
        const buf = await download(name);
        if (!buf || hash(buf) === known.get(name) || dirty.has(name)) continue;
        writeLocal(name, buf);
        known.set(name, hash(buf));
        reloaders.get(name)?.();
        log.info(`${name} atualizado com a versão mais nova da nuvem`);
      } catch {
        /* tenta no próximo ciclo */
      }
    }
    if (Date.now() < until) watchTimer = setTimeout(tick, every).unref();
  };
  watchTimer = setTimeout(tick, every).unref();
}

/** Avisa que o arquivo (relativo a data/) mudou: sobe para a nuvem logo em seguida. */
export function cloudSave(name) {
  if (!state.enabled) return;
  dirty.add(name);
  clearTimeout(timers.get(name));
  timers.set(name, setTimeout(() => flushOne(name), SAVE_DELAY_MS));
}

function flushOne(name) {
  timers.delete(name);
  // Uma gravação por arquivo de cada vez, na ordem.
  const next = (chains.get(name) || Promise.resolve()).then(async () => {
    let buf;
    try {
      buf = fs.readFileSync(local(name));
    } catch {
      return; // apagado localmente: nada a subir
    }
    const h = hash(buf);
    if (known.get(name) === h) return;
    try {
      await upload(name, buf);
      known.set(name, h);
      state.ok = true;
      state.error = null;
      state.savedAt = new Date().toISOString();
    } catch (err) {
      state.ok = false;
      state.error = err.message;
      log.error(`não consegui salvar ${name} no Supabase: ${err.message} (tento de novo em 30 s)`);
      if (!timers.has(name)) timers.set(name, setTimeout(() => flushOne(name), RETRY_MS));
    }
  });
  chains.set(name, next);
  return next;
}

/** Troca os arquivos da demo na nuvem pelos atuais (antes apaga os antigos). */
export async function cloudReplaceShowcase(names) {
  if (!state.enabled) return;
  try {
    const old = await list('showcase');
    const wanted = new Set(names.map((n) => `showcase/${n}`));
    await removeRemote(old.filter((n) => !wanted.has(n)));
    for (const n of wanted) await upload(n, fs.readFileSync(local(n)));
    log.ok('demonstração salva no Supabase');
  } catch (err) {
    log.error(`demonstração não foi salva no Supabase: ${err.message}`);
  }
}

export async function cloudRemoveShowcase() {
  if (!state.enabled) return;
  try {
    await removeRemote(await list('showcase'));
  } catch (err) {
    log.error(`não consegui apagar a demonstração no Supabase: ${err.message}`);
  }
}

/** Sobe o que estiver pendente (ao desligar o servidor). */
export async function flushCloud(timeoutMs = 10_000) {
  if (!state.enabled) return;
  const pending = [...timers.keys()];
  for (const name of pending) clearTimeout(timers.get(name));
  const work = Promise.all([...pending.map((n) => flushOne(n)), ...chains.values()]);
  await Promise.race([work, sleep(timeoutMs)]);
}

/** Só para testes: zera o estado do módulo. */
export function __resetCloud() {
  for (const t of timers.values()) clearTimeout(t);
  clearTimeout(watchTimer);
  timers.clear();
  chains.clear();
  known.clear();
  dirty.clear();
  Object.assign(state, { enabled: false, ok: false, error: null, restoredAt: null, savedAt: null });
}
