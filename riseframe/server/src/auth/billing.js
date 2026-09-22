import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('billing');

/**
 * Assinatura pré-paga: cada cobrança paga na AbacatePay libera `periodDays` dias
 * (somando ao que ainda resta). Sem assinatura, cada conta tem `freeVideos` vídeos
 * grátis. Estado em data/billing.json:
 *   { users:   { [userId]: { freeUsed, paidUntil, paidBillings: [billingId] } },
 *     pending: { [billingId]: { userId, createdAt } } }
 * Pagamento só é aceito depois de confirmado na API da AbacatePay (status PAID) —
 * nunca pelo conteúdo do webhook, que qualquer um poderia forjar.
 */
const FILE = path.join(config.paths.data, 'billing.json');
const API = 'https://api.abacatepay.com/v1';
const DAY_MS = 24 * 3600 * 1000;
const PENDING_TTL_MS = 7 * DAY_MS;

let db = null;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    db = null;
  }
  if (!db || typeof db !== 'object') db = {};
  db.users ||= {};
  db.pending ||= {};
  return db;
}

function persist() {
  fs.mkdirSync(config.paths.data, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2), { mode: 0o600 });
}

function entry(userId) {
  load();
  db.users[userId] ||= { freeUsed: 0, paidUntil: null, paidBillings: [] };
  return db.users[userId];
}

export const billingEnabled = () => Boolean(config.billing.abacateKey);
const isAdmin = (email) => config.billing.adminEmails.includes(String(email || '').toLowerCase());

/** Situação da assinatura do usuário (seguro para mandar ao cliente). */
export function billingStatus(user) {
  const b = config.billing;
  const e = load().users[user.id] || { freeUsed: 0, paidUntil: null };
  const admin = isAdmin(user.email);
  const paidUntilMs = e.paidUntil ? Date.parse(e.paidUntil) : 0;
  const active = admin || paidUntilMs > Date.now();
  const freeLeft = Math.max(0, b.freeVideos - e.freeUsed);
  const enabled = billingEnabled();
  const hasPending = Object.values(load().pending).some((p) => p.userId === user.id);
  return {
    enabled,
    active,
    admin,
    paidUntil: active && !admin ? e.paidUntil : null,
    freeUsed: e.freeUsed,
    freeLimit: b.freeVideos,
    freeLeft,
    canCreate: !enabled || active || freeLeft > 0,
    hasPending,
    plan: { name: b.planName, priceCents: b.priceCents, periodDays: b.periodDays },
  };
}

/** Desconta um vídeo grátis (só quando o paywall está ligado e não há assinatura). */
export function consumeVideo(user) {
  const s = billingStatus(user);
  if (!s.enabled || s.active) return;
  entry(user.id).freeUsed += 1;
  persist();
}

async function abacate(pathname, { method = 'GET', body } = {}) {
  const r = await fetch(`${API}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${config.billing.abacateKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) {
    const msg = typeof data.error === 'string' ? data.error : data.error?.message || data.message;
    throw new Error(msg || `AbacatePay respondeu ${r.status}`);
  }
  return data.data ?? data;
}

/** Cria a cobrança na AbacatePay e devolve a URL do checkout (Pix/cartão). */
export async function createCheckout(user, { name, taxId, cellphone, returnUrl }) {
  const b = config.billing;
  const billing = await abacate('/billing/create', {
    method: 'POST',
    body: {
      frequency: 'ONE_TIME',
      methods: b.methods,
      products: [
        {
          externalId: `riseframe-pro-${b.periodDays}d`,
          name: b.planName,
          description: `${b.planName} — ${b.periodDays} dias de acesso`,
          quantity: 1,
          price: b.priceCents,
        },
      ],
      returnUrl,
      completionUrl: returnUrl,
      customer: { name: name || user.name || user.email, email: user.email, cellphone, taxId },
    },
  });
  if (!billing?.id || !billing?.url) throw new Error('a AbacatePay não retornou o link de pagamento');
  load();
  db.pending[billing.id] = { userId: user.id, createdAt: new Date().toISOString() };
  persist();
  log.info(`checkout criado ${billing.id} para ${user.email}`);
  return billing.url;
}

function grant(userId, billingId) {
  const e = entry(userId);
  if (e.paidBillings.includes(billingId)) return false;
  const base = Math.max(Date.now(), e.paidUntil ? Date.parse(e.paidUntil) : 0);
  e.paidUntil = new Date(base + config.billing.periodDays * DAY_MS).toISOString();
  e.paidBillings.push(billingId);
  log.ok(`pagamento ${billingId} confirmado — acesso até ${e.paidUntil} (user ${userId})`);
  return true;
}

/**
 * Confere na AbacatePay as cobranças pendentes (de um usuário, de uma cobrança
 * específica ou todas) e libera o acesso das que estão pagas. Idempotente.
 * Retorna quantas cobranças foram ativadas agora.
 */
export async function syncPayments({ userId, billingId } = {}) {
  if (!billingEnabled()) return 0;
  load();
  const now = Date.now();
  const ids = Object.keys(db.pending).filter(
    (id) => (!userId || db.pending[id].userId === userId) && (!billingId || id === billingId),
  );
  if (!ids.length) return 0;

  const list = await abacate('/billing/list');
  const byId = new Map((Array.isArray(list) ? list : []).map((b) => [b.id, b]));
  let activated = 0;
  for (const id of ids) {
    const remote = byId.get(id);
    const status = String(remote?.status || '').toUpperCase();
    if (status === 'PAID') {
      if (grant(db.pending[id].userId, id)) activated += 1;
      delete db.pending[id];
    } else if (['EXPIRED', 'CANCELLED', 'REFUNDED'].includes(status)) {
      delete db.pending[id];
    } else if (now - Date.parse(db.pending[id].createdAt) > PENDING_TTL_MS) {
      delete db.pending[id];
    }
  }
  persist();
  return activated;
}
