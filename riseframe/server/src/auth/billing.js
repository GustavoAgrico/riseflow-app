import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('billing');

/**
 * Créditos pré-pagos. Cada conta nova ganha `signupCredits`; depois compra pacotes
 * (AbacatePay, Pix/cartão). Cada job desconta créditos conforme os recursos usados
 * (ver shared/credits.js). Estado em data/billing.json:
 *   { users:   { [userId]: { credits, purchases: [billingId] } },
 *     pending: { [billingId]: { userId, packId, credits, createdAt } } }
 * Um pagamento só vira crédito depois de confirmado na API da AbacatePay (status
 * PAID) — nunca pelo conteúdo do webhook, que qualquer um poderia forjar.
 */
const FILE = path.join(config.paths.data, 'billing.json');
const API = 'https://api.abacatepay.com/v1';
const PENDING_TTL_MS = 7 * 24 * 3600 * 1000;

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
  if (!db.users[userId]) {
    db.users[userId] = { credits: config.billing.signupCredits, purchases: [] };
    persist();
  }
  return db.users[userId];
}

export const billingEnabled = () => Boolean(config.billing.abacateKey);
const isAdmin = (email) => config.billing.adminEmails.includes(String(email || '').toLowerCase());
/** Sem cobrança para admins e quando os pagamentos não estão configurados. */
const unlimited = (user) => !billingEnabled() || isAdmin(user.email);

/** Situação dos créditos do usuário (seguro para mandar ao cliente). */
export function billingStatus(user) {
  const b = config.billing;
  return {
    enabled: billingEnabled(),
    admin: isAdmin(user.email),
    unlimited: unlimited(user),
    credits: entry(user.id).credits,
    costs: b.costs,
    packs: b.packs.map(({ id, name, credits, priceCents, popular }) => ({ id, name, credits, priceCents, popular: Boolean(popular) })),
    hasPending: Object.values(load().pending).some((p) => p.userId === user.id),
  };
}

/** Tem saldo para `amount`? (sempre sim quando ilimitado). */
export function canAfford(user, amount) {
  return unlimited(user) || entry(user.id).credits >= amount;
}

/** Desconta `amount`. Retorna os créditos cobrados (0 quando ilimitado) ou null se faltar saldo. */
export function charge(user, amount) {
  if (unlimited(user) || amount <= 0) return 0;
  const e = entry(user.id);
  if (e.credits < amount) return null;
  e.credits -= amount;
  persist();
  return amount;
}

export function refund(userId, amount) {
  if (!amount) return;
  entry(userId).credits += amount;
  persist();
  log.info(`${amount} crédito(s) devolvidos (user ${userId})`);
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

/** Cria a cobrança de um pacote na AbacatePay e devolve a URL do checkout. */
export async function createCheckout(user, { packId, name, taxId, cellphone, returnUrl }) {
  const pack = config.billing.packs.find((p) => p.id === packId);
  if (!pack) throw Object.assign(new Error('pacote inválido'), { status: 400 });
  const billing = await abacate('/billing/create', {
    method: 'POST',
    body: {
      frequency: 'ONE_TIME',
      methods: config.billing.methods,
      products: [
        {
          externalId: `riseframe-credits-${pack.id}`,
          name: `Riseframe · ${pack.credits} créditos`,
          description: `Pacote ${pack.name} — ${pack.credits} créditos de edição`,
          quantity: 1,
          price: pack.priceCents,
        },
      ],
      returnUrl,
      completionUrl: returnUrl,
      customer: { name: name || user.name || user.email, email: user.email, cellphone, taxId },
    },
  });
  if (!billing?.id || !billing?.url) throw new Error('a AbacatePay não retornou o link de pagamento');
  load();
  db.pending[billing.id] = { userId: user.id, packId: pack.id, credits: pack.credits, createdAt: new Date().toISOString() };
  persist();
  log.info(`checkout ${billing.id} (${pack.credits} créditos) para ${user.email}`);
  return billing.url;
}

function grant(userId, billingId, credits) {
  const e = entry(userId);
  if (e.purchases.includes(billingId)) return false;
  e.credits += credits;
  e.purchases.push(billingId);
  log.ok(`pagamento ${billingId} confirmado — +${credits} créditos (user ${userId})`);
  return true;
}

/**
 * Confere na AbacatePay as cobranças pendentes (de um usuário, de uma cobrança
 * específica ou todas) e credita as que estão pagas. Idempotente.
 * Retorna quantos créditos foram adicionados agora.
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
  let added = 0;
  for (const id of ids) {
    const p = db.pending[id];
    const status = String(byId.get(id)?.status || '').toUpperCase();
    if (status === 'PAID') {
      if (grant(p.userId, id, p.credits)) added += p.credits;
      delete db.pending[id];
    } else if (['EXPIRED', 'CANCELLED', 'REFUNDED'].includes(status) || now - Date.parse(p.createdAt) > PENDING_TTL_MS) {
      delete db.pending[id];
    }
  }
  persist();
  return added;
}
