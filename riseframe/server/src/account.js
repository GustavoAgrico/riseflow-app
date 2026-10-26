import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { config } from './config.js';
import { makeLogger } from './logger.js';
import { findByEmail } from './auth/store.js';
import { getSettings, saveSettings } from './auth/settings.js';

const log = makeLogger('conta');

/**
 * Conta central (app de PC/Mac). Com ACCOUNT_SERVER definido, este servidor local só
 * PROCESSA os vídeos: login, cadastro, planos, créditos e pagamentos ficam no servidor
 * do site. Assim uma assinatura vale no site, no PC e no Mac, e o app não libera nada
 * de graça.
 *  - /api/auth/* e /api/billing/* são repassados ao site (o mesmo token vale nos dois);
 *  - cada token é conferido no site (GET /api/auth/me), com cache curto;
 *  - cada vídeo é cobrado no site antes de processar (POST /api/billing/remote/charge)
 *    e devolvido se falhar (POST /api/billing/remote/refund).
 */
export const remoteAccount = () => Boolean(config.account.server);

const TIMEOUT_MS = 75_000; // o Render grátis leva até ~1 min para acordar
const USER_TTL_MS = 5 * 60_000;
const OFFLINE_GRACE_MS = 3 * 24 * 3600 * 1000; // sem internet: vale o último login confirmado

// O Render responde 502/503/504 enquanto o servidor do site acorda (plano grátis dorme),
// reinicia ou faz deploy: tenta de novo algumas vezes antes de desistir.
const WAKE_RETRIES = [4000, 8000, 15000, 20000];
const isWaking = (status) => status === 502 || status === 503 || status === 504;
// 429 (pedidos demais): espera o que o site pedir (Retry-After, até 10 s) e tenta de novo, 2 vezes
const RATE_RETRIES = 2;
const RATE_MSG = 'Muitas tentativas seguidas no servidor da sua conta. Aguarde 1 minuto e tente entrar de novo.';
const WAKE_MSG = 'O servidor da sua conta está fora do ar ou acordando agora (pode levar 1 minuto). Tente de novo em instantes.';
export async function fetchWaking(url, init = {}) {
  const { timeoutMs = TIMEOUT_MS, ...rest } = init;
  let r;
  for (let i = 0, rl = 0; ; i++) {
    r = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
    if (r.status === 429 && rl < RATE_RETRIES) {
      rl++;
      i--;
      const wait = Math.min(10, Math.max(2, Number(r.headers.get('retry-after')) || 3 * rl)) * 1000;
      log.warn(`servidor da conta pediu para esperar (429); tentando de novo em ${wait / 1000}s`);
      await r.arrayBuffer().catch(() => {});
      await new Promise((x) => setTimeout(x, wait));
      continue;
    }
    if (!isWaking(r.status) || i >= WAKE_RETRIES.length) return r;
    log.warn(`servidor da conta respondeu ${r.status}; tentando de novo em ${WAKE_RETRIES[i] / 1000}s`);
    await r.arrayBuffer().catch(() => {});
    await new Promise((x) => setTimeout(x, WAKE_RETRIES[i]));
  }
}

/** Erro com status HTTP e corpo do site, para devolver igual ao cliente. */
class AccountError extends Error {
  constructor(status, body) {
    super(body?.error || `servidor da conta respondeu ${status}`);
    this.status = status;
    this.body = body || { error: this.message };
  }
}

/** Chama o site. Lança AccountError (status do site, ou 503 se não deu para falar com ele). */
export async function accountFetch(apiPath, { method = 'GET', token = '', body, ip } = {}) {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (ip) headers['x-forwarded-for'] = ip;
  let r;
  try {
    r = await fetchWaking(`${config.account.server}/api${apiPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new AccountError(503, { error: 'sem conexão com o servidor da sua conta — confira a internet e tente de novo', offline: true, detail: err.message });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new AccountError(r.status, data.error ? data : isWaking(r.status) ? { error: WAKE_MSG, offline: true } : r.status === 429 ? { error: RATE_MSG } : data);
  return data;
}

// ── Quem é o dono do token (com cache em memória e em disco, para uso sem internet) ──
const cache = new Map(); // hash do token → { user, at }
const cacheFile = () => path.join(config.paths.data, 'account_cache.json');
const tokenKey = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function readDiskCache() {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) || {};
  } catch {
    return {};
  }
}
function writeDiskCache(key, entry) {
  try {
    const all = readDiskCache();
    all[key] = entry;
    // só os logins recentes
    const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 10);
    fs.mkdirSync(config.paths.data, { recursive: true });
    fs.writeFileSync(cacheFile(), JSON.stringify(Object.fromEntries(keep)), { mode: 0o600 });
  } catch {
    /* sem cache em disco: só não funciona offline */
  }
}

/**
 * Usuário do site dono do token, ou null se o token não vale. Sem internet, aceita o
 * último login confirmado (até 3 dias) para o app abrir; cobrar continua exigindo rede.
 */
export async function remoteUser(token) {
  if (!token) return null;
  const key = tokenKey(token);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.user;
  if (denied.has(key) && Date.now() - denied.get(key) < DENIED_TTL_MS) return null;
  // site pediu para esperar (429): não insiste — usa o último login confirmado enquanto isso
  if (Date.now() < coolUntil) {
    const old = hit || readDiskCache()[key];
    if (old && Date.now() - old.at < OFFLINE_GRACE_MS) return old.user;
  }
  // vários pedidos ao mesmo tempo (fila, biblioteca, miniaturas…) = UMA conferência no site
  if (inflight.has(key)) return inflight.get(key);
  const p = checkRemoteUser(token, key, hit).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
const inflight = new Map(); // hash do token → Promise da conferência em andamento
const denied = new Map(); // hash do token → quando o site recusou (401/403)
const DENIED_TTL_MS = 30_000;
let coolUntil = 0; // site respondeu 429: espera antes de conferir de novo
async function checkRemoteUser(token, key, hit) {
  try {
    const { user } = await accountFetch('/auth/me', { token });
    if (!user?.id) return null;
    const entry = { user, at: Date.now() };
    lastToken = token;
    cache.set(key, entry);
    writeDiskCache(key, entry);
    adoptLocalSettings(user);
    return user;
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      cache.delete(key);
      denied.set(key, Date.now());
      if (denied.size > 200) denied.delete(denied.keys().next().value);
      return null;
    }
    if (err.status === 429) coolUntil = Date.now() + 60_000;
    const old = hit || readDiskCache()[key];
    if (old && Date.now() - old.at < OFFLINE_GRACE_MS) {
      log.warn(`site fora do ar (${err.message}); usando o último login de ${old.user.email}`);
      return old.user;
    }
    throw err;
  }
}

/**
 * 1º login com a conta do site: as chaves salvas na conta LOCAL antiga (mesmo e-mail)
 * passam para a conta do site neste computador.
 */
function adoptLocalSettings(user) {
  try {
    const mine = getSettings(user.id);
    if (mine.pexelsKey || mine.anthropicKey) return;
    const local = findByEmail(user.email);
    if (!local || local.id === user.id) return;
    const old = getSettings(local.id);
    if (old.pexelsKey || old.anthropicKey) {
      saveSettings(user.id, old);
      log.info(`chaves da conta local de ${user.email} trazidas para a conta do site`);
    }
  } catch {
    /* sem migração: o usuário salva as chaves de novo */
  }
}

// ── Cobrança no site ──
const bearer = (req) => {
  const h = req.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
};

/** Pré-checagem antes do upload (recurso fora do plano ou sem saldo nem para o mínimo). */
export function remoteCheck(req, mode) {
  return accountFetch('/billing/remote/check', { method: 'POST', token: bearer(req), body: { mode }, ip: req.ip });
}

/** Cobra o job no site. → { chargeId, creditsCharged, freeEdit, freeEditsLeft } */
export function remoteCharge(req, { mode, options, sourceId, jobId }) {
  return accountFetch('/billing/remote/charge', { method: 'POST', token: bearer(req), body: { mode, options, sourceId, jobId }, ip: req.ip });
}

const pendingRefunds = new Map(); // jobId → { token, chargeId }
// Token da conta de quem criou cada job (só em memória): a transcrição pela conta do
// site usa ele quando o app de PC não tem chave de transcrição nem Whisper local.
const jobTokens = new Map();
let lastToken = ''; // último login usado neste app (o app de PC é de uma pessoa só)
// Recursos ligados no site (fontes de B-roll etc.) — o app de PC usa as chaves do site.
let siteCaps = null; // { at, caps }
let siteCapsWait = null;
/** Capacidades do servidor da conta (guardadas por 10 min; null se o site não respondeu). */
export async function siteCapabilities({ waitMs = 4000 } = {}) {
  if (!remoteAccount()) return null;
  if (siteCaps && Date.now() - siteCaps.at < 10 * 60_000) return siteCaps.caps;
  if (!siteCapsWait) {
    siteCapsWait = fetch(`${config.account.server}/api/health`, { signal: AbortSignal.timeout(75_000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.capabilities) siteCaps = { at: Date.now(), caps: d.capabilities }; })
      .catch((err) => log.warn(`capacidades do site: ${err.message}`))
      .finally(() => { siteCapsWait = null; });
  }
  // o site pode estar acordando: não segura a abertura do app mais que alguns segundos
  await Promise.race([siteCapsWait, new Promise((r) => setTimeout(r, waitMs))]);
  return siteCaps?.caps || null;
}

export function rememberJobToken(jobId, req) {
  const t = bearer(req);
  if (t) { jobTokens.set(jobId, t); lastToken = t; }
}
export const jobAccountToken = (jobId) => (jobId && jobTokens.get(jobId)) || lastToken;

export function holdRemoteCharge(jobId, req, chargeId) {
  if (chargeId) pendingRefunds.set(jobId, { token: bearer(req), chargeId });
}

/** O job terminou: se falhou, pede a devolução ao site (com algumas tentativas). */
export async function settleRemoteCharge(job) {
  if (job.status === 'done' || job.status === 'error') jobTokens.delete(job.id);
  const p = pendingRefunds.get(job.id);
  if (!p || (job.status !== 'done' && job.status !== 'error')) return;
  pendingRefunds.delete(job.id);
  if (job.status !== 'error') return;
  for (let i = 0; i < 4; i++) {
    try {
      await accountFetch('/billing/remote/refund', { method: 'POST', token: p.token, body: { chargeId: p.chargeId } });
      log.info(`créditos do job ${job.id} devolvidos no site (falhou: ${job.error})`);
      return;
    } catch (err) {
      if (err.status && err.status !== 503) return log.warn(`devolução recusada: ${err.message}`);
      await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
    }
  }
  log.warn(`não consegui devolver os créditos do job ${job.id} (sem conexão)`);
}

/** Responde ao cliente com o erro do site (mesmo status/corpo: 402 sem créditos etc.). */
export function sendAccountError(res, err) {
  const status = err.status || 503;
  res.status(status).json(err.body || { error: err.message });
}

/**
 * Repasse de /api/auth/* e /api/billing/* para o site: o cliente do app conversa com a
 * conta do site sem saber disso (login, cadastro, código por e-mail, planos, Pix…).
 */
export function accountProxy() {
  const router = Router();
  const forward = async (req, res) => {
    const method = req.method.toUpperCase();
    const hasBody = !['GET', 'HEAD'].includes(method);
    const headers = { accept: 'application/json' };
    const auth = req.get('authorization');
    if (auth) headers.authorization = auth;
    if (hasBody) headers['content-type'] = 'application/json';
    if (req.ip) headers['x-forwarded-for'] = req.ip;
    try {
      const r = await fetchWaking(`${config.account.server}${req.originalUrl}`, {
        method,
        headers,
        body: hasBody ? JSON.stringify(req.body || {}) : undefined,
      });
      const type = r.headers.get('content-type') || '';
      // Erro do site sem JSON (página do Render de "fora do ar"): mensagem clara em vez de "erro 503"
      if (!r.ok && !type.includes('json')) {
        await r.arrayBuffer().catch(() => {});
        return res.status(r.status).json({ error: isWaking(r.status) ? WAKE_MSG : r.status === 429 ? RATE_MSG : `o servidor da sua conta respondeu ${r.status} — tente de novo em instantes`, offline: isWaking(r.status) });
      }
      res.status(r.status);
      if (type) res.type(type);
      res.send(Buffer.from(await r.arrayBuffer()));
    } catch {
      res.status(503).json({ error: 'sem conexão com o servidor da sua conta — confira a internet e tente de novo', offline: true });
    }
  };
  router.all(/^\/(auth|billing)(\/.*)?$/, forward);
  return router;
}
