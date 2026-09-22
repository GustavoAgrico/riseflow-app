import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('billing');

/**
 * Planos mensais + créditos avulsos, pagos na AbacatePay (Pix/cartão).
 * - Plano: cada pagamento vale `periodDays` dias e dá os créditos do mês (não acumulam:
 *   ao renovar, o saldo do mês volta ao valor do plano). Também libera recursos.
 * - Avulsos: vêm do cadastro (teste) e das recargas; não expiram.
 * Cobrança gasta primeiro os créditos do mês, depois os avulsos. Estado em data/billing.json:
 *   { users:   { [userId]: { credits, purchases: [billingId], plan: { id, until, credits } } },
 *     pending: { [billingId]: { userId, kind: 'plan'|'pack', itemId, credits, createdAt } } }
 * Um pagamento só vale depois de confirmado na API da AbacatePay (status PAID) — nunca
 * pelo conteúdo do webhook, que qualquer um poderia forjar.
 */
const FILE = path.join(config.paths.data, 'billing.json');
const API = 'https://api.abacatepay.com/v1';
const DAY_MS = 24 * 3600 * 1000;
const PENDING_TTL_MS = 7 * DAY_MS;
const ALL_FEATURES = ['captionStyle', 'image', 'ai', 'clips'];

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
    db.users[userId] = { credits: config.billing.signupCredits, purchases: [], plan: null };
    persist();
  }
  return db.users[userId];
}

export const billingEnabled = () => Boolean(config.billing.abacateKey);
const isAdmin = (email) => config.billing.adminEmails.includes(String(email || '').toLowerCase());
/** Sem cobrança para admins e quando os pagamentos não estão configurados. */
const unlimited = (user) => !billingEnabled() || isAdmin(user.email);
const planConfig = (id) => config.billing.plans.find((p) => p.id === id) || null;

/** Plano vigente (config + estado) ou null se não tem / venceu. */
function activePlan(e) {
  if (!e.plan || Date.parse(e.plan.until) <= Date.now()) return null;
  const cfg = planConfig(e.plan.id);
  return cfg ? { ...cfg, until: e.plan.until, left: e.plan.credits } : null;
}

/** Recursos liberados para o usuário (ids de shared/credits.js). */
export function allowedFeatures(user) {
  if (unlimited(user)) return ALL_FEATURES;
  return activePlan(entry(user.id))?.features || config.billing.freeFeatures;
}

const publicPlan = ({ id, name, priceCents, credits, features, popular }) => ({ id, name, priceCents, credits, features, popular: Boolean(popular) });
const publicPack = ({ id, name, priceCents, credits }) => ({ id, name, priceCents, credits });

/** Situação do usuário (seguro para mandar ao cliente). */
export function billingStatus(user) {
  const b = config.billing;
  const e = entry(user.id);
  const plan = activePlan(e);
  const monthly = plan ? plan.left : 0;
  return {
    enabled: billingEnabled(),
    admin: isAdmin(user.email),
    unlimited: unlimited(user),
    credits: monthly + e.credits,
    extraCredits: e.credits,
    plan: plan ? { id: plan.id, name: plan.name, until: plan.until, credits: plan.left, monthlyCredits: plan.credits } : null,
    features: allowedFeatures(user),
    costs: b.costs,
    periodDays: b.periodDays,
    plans: b.plans.map(publicPlan),
    packs: b.packs.map(publicPack),
    hasPending: Object.values(load().pending).some((p) => p.userId === user.id),
  };
}

/** Tem saldo para `amount`? (sempre sim quando ilimitado). */
export function canAfford(user, amount) {
  return unlimited(user) || billingStatus(user).credits >= amount;
}

/**
 * Desconta `amount` (créditos do mês primeiro). Retorna { total, monthly, extra }
 * (total 0 quando ilimitado) ou null se faltar saldo.
 */
export function charge(user, amount) {
  if (unlimited(user) || amount <= 0) return { total: 0, monthly: 0, extra: 0 };
  const e = entry(user.id);
  const monthlyLeft = activePlan(e) ? e.plan.credits : 0;
  if (monthlyLeft + e.credits < amount) return null;
  const monthly = Math.min(monthlyLeft, amount);
  const extra = amount - monthly;
  if (monthly) e.plan.credits -= monthly;
  e.credits -= extra;
  persist();
  return { total: amount, monthly, extra };
}

/** Devolve uma cobrança. Créditos do mês só voltam se o mesmo período ainda vale. */
export function refund(userId, { monthly = 0, extra = 0, until = null } = {}) {
  const e = entry(userId);
  if (monthly && e.plan && e.plan.until === until && activePlan(e)) e.plan.credits += monthly;
  e.credits += extra;
  persist();
  log.info(`${monthly + extra} crédito(s) devolvidos (user ${userId})`);
}

/** Período do plano no momento da cobrança (para a devolução saber se ainda vale). */
export const currentPeriod = (userId) => entry(userId).plan?.until || null;

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

/**
 * Cria a cobrança de um plano (kind 'plan') ou recarga (kind 'pack') na AbacatePay e
 * devolve a URL do checkout.
 */
export async function createCheckout(user, { kind, itemId, name, taxId, cellphone, returnUrl }) {
  const b = config.billing;
  const item = kind === 'plan' ? planConfig(itemId) : b.packs.find((p) => p.id === itemId);
  if (!item || (kind !== 'plan' && kind !== 'pack')) throw Object.assign(new Error('plano ou recarga inválido'), { status: 400 });
  const product =
    kind === 'plan'
      ? {
          externalId: `riseframe-plano-${item.id}`,
          name: `Riseframe ${item.name} — ${b.periodDays} dias`,
          description: `Plano ${item.name}: ${item.credits} créditos por ${b.periodDays} dias`,
        }
      : {
          externalId: `riseframe-recarga-${item.id}`,
          name: `Riseframe · ${item.credits} créditos`,
          description: `Recarga avulsa de ${item.credits} créditos (não expiram)`,
        };
  const billing = await abacate('/billing/create', {
    method: 'POST',
    body: {
      frequency: 'ONE_TIME',
      methods: b.methods,
      products: [{ ...product, quantity: 1, price: item.priceCents }],
      returnUrl,
      completionUrl: returnUrl,
      customer: { name: name || user.name || user.email, email: user.email, cellphone, taxId },
    },
  });
  if (!billing?.id || !billing?.url) throw new Error('a AbacatePay não retornou o link de pagamento');
  load();
  db.pending[billing.id] = { userId: user.id, kind, itemId: item.id, credits: item.credits, createdAt: new Date().toISOString() };
  persist();
  log.info(`checkout ${billing.id} (${kind} ${item.id}) para ${user.email}`);
  return billing.url;
}

/** Aplica um pagamento confirmado. Retorna true se aplicou agora (idempotente). */
function grant(billingId, p) {
  const e = entry(p.userId);
  if (e.purchases.includes(billingId)) return false;
  e.purchases.push(billingId);
  if (p.kind === 'plan') {
    const cfg = planConfig(p.itemId);
    const period = config.billing.periodDays * DAY_MS;
    const now = Date.now();
    const sameActive = e.plan && e.plan.id === p.itemId && Date.parse(e.plan.until) > now;
    // Renovar o mesmo plano soma o período; trocar de plano (ou voltar) começa agora.
    const until = new Date((sameActive ? Date.parse(e.plan.until) : now) + period).toISOString();
    e.plan = { id: p.itemId, until, credits: cfg ? cfg.credits : p.credits };
    log.ok(`pagamento ${billingId}: plano ${p.itemId} até ${until} (user ${p.userId})`);
  } else {
    e.credits += p.credits;
    log.ok(`pagamento ${billingId}: +${p.credits} créditos avulsos (user ${p.userId})`);
  }
  return true;
}

/**
 * Confere na AbacatePay as cobranças pendentes (de um usuário, de uma cobrança
 * específica ou todas) e aplica as pagas. Idempotente.
 * Retorna a lista do que foi aplicado agora: [{ kind, itemId, credits }].
 */
export async function syncPayments({ userId, billingId } = {}) {
  if (!billingEnabled()) return [];
  load();
  const now = Date.now();
  const ids = Object.keys(db.pending).filter(
    (id) => (!userId || db.pending[id].userId === userId) && (!billingId || id === billingId),
  );
  if (!ids.length) return [];

  const list = await abacate('/billing/list');
  const byId = new Map((Array.isArray(list) ? list : []).map((b) => [b.id, b]));
  const applied = [];
  for (const id of ids) {
    const p = { kind: 'pack', ...db.pending[id] };
    const status = String(byId.get(id)?.status || '').toUpperCase();
    if (status === 'PAID') {
      if (grant(id, p)) applied.push({ kind: p.kind, itemId: p.itemId, credits: p.credits });
      delete db.pending[id];
    } else if (['EXPIRED', 'CANCELLED', 'REFUNDED'].includes(status) || now - Date.parse(p.createdAt) > PENDING_TTL_MS) {
      delete db.pending[id];
    }
  }
  persist();
  return applied;
}
