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
const API_BASE = 'https://api.abacatepay.com/v';
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
/** Ilimitado: admins (ADMIN_EMAILS), ou todos quando BILLING_MODE=off (desktop/local). */
const unlimited = (user) => config.billing.mode === 'off' || isAdmin(user.email);
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

// A AbacatePay tem duas APIs: v1 (antiga) e v2. Cada chave só funciona na versão em
// que foi criada — chave nova na v1 responde "API key version mismatch". Por padrão
// tenta a v2 e, se a chave for da outra versão, troca sozinho (e lembra).
// ABACATE_API_VERSION=1|2 fixa a versão.
let apiVersion = null;

async function abacate(pathname, { method = 'GET', body, version = 2 } = {}) {
  const r = await fetch(`${API_BASE}${version}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${config.billing.abacateKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error || data.success === false) {
    const msg = typeof data.error === 'string' ? data.error : data.error?.message || data.message;
    throw Object.assign(new Error(msg || `AbacatePay respondeu ${r.status}`), { httpStatus: r.status });
  }
  return data.data ?? data;
}

const versionMismatch = (err) => /version/i.test(String(err?.message || ''));

/** Roda `fn(version)` na versão certa da API da chave configurada. */
async function withApiVersion(fn) {
  const forced = Number(config.billing.apiVersion) || 0;
  const first = forced || apiVersion || 2;
  try {
    const out = await fn(first);
    apiVersion = first;
    return out;
  } catch (err) {
    if (forced || !versionMismatch(err)) throw err;
    const other = first === 2 ? 1 : 2;
    log.warn(`chave da AbacatePay é da API v${other} (${err.message}); usando a v${other}`);
    const out = await fn(other);
    apiVersion = other;
    return out;
  }
}

// v2: a cobrança aponta para produtos cadastrados na AbacatePay. O produto de cada
// plano/recarga é criado na 1ª compra (o preço entra no externalId: mudou o preço,
// nasce um produto novo) e o id fica em cache.
const productIds = new Map();

async function productIdV2({ externalId, name, description, price }) {
  const cacheKey = `${config.billing.abacateKey.slice(-8)}:${externalId}`;
  if (productIds.has(cacheKey)) return productIds.get(cacheKey);
  let product = null;
  try {
    product = await abacate(`/products/get?${new URLSearchParams({ externalId })}`, { version: 2 });
  } catch (err) {
    if (versionMismatch(err)) throw err;
    product = null; // não existe ainda
  }
  if (!product?.id) {
    product = await abacate('/products/create', {
      method: 'POST',
      version: 2,
      body: { externalId, name, description, price, currency: 'BRL' },
    });
  }
  if (!product?.id) throw new Error('a AbacatePay não retornou o produto');
  productIds.set(cacheKey, product.id);
  return product.id;
}

/** Cria a cobrança com os métodos configurados; se a conta recusar, tenta só Pix. */
async function withMethods(create) {
  const methods = config.billing.methods;
  try {
    return await create(methods);
  } catch (err) {
    // Método não aceito pela conta (ex.: cartão não liberado): cobra só por Pix.
    if (!/method/i.test(err.message) || methods.join() === 'PIX') throw err;
    log.warn(`AbacatePay recusou os métodos ${methods.join(',')} (${err.message}); tentando só PIX`);
    return create(['PIX']);
  }
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
  const customer = { name: name || user.name || user.email, email: user.email, cellphone, taxId };

  const { billing, version } = await withApiVersion(async (version) => {
    if (version === 1) {
      const billing = await withMethods((methods) =>
        abacate('/billing/create', {
          method: 'POST',
          version: 1,
          body: {
            frequency: 'ONE_TIME',
            methods,
            products: [{ ...product, quantity: 1, price: item.priceCents }],
            returnUrl,
            completionUrl: returnUrl,
            customer,
          },
        }),
      );
      return { billing, version };
    }
    const productId = await productIdV2({ ...product, externalId: `${product.externalId}-${item.priceCents}`, price: item.priceCents });
    const billing = await withMethods((methods) =>
      abacate('/checkouts/create', {
        method: 'POST',
        version: 2,
        body: {
          frequency: 'ONE_TIME',
          methods,
          items: [{ id: productId, quantity: 1 }],
          returnUrl,
          completionUrl: returnUrl,
          customer,
          externalId: `riseframe-${kind}-${item.id}-${Date.now()}`,
        },
      }),
    );
    return { billing, version };
  });
  if (!billing?.id || !billing?.url) throw new Error('a AbacatePay não retornou o link de pagamento');
  load();
  db.pending[billing.id] = { userId: user.id, kind, itemId: item.id, credits: item.credits, createdAt: new Date().toISOString(), v: version };
  persist();
  log.info(`checkout ${billing.id} (${kind} ${item.id}, API v${version}) para ${user.email}`);
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

  // Status de cada cobrança pendente: v2 consulta uma a uma; v1 só tem a lista geral.
  const statusOf = new Map();
  if (ids.some((id) => (db.pending[id].v || 1) === 1)) {
    const list = await abacate('/billing/list', { version: 1 });
    for (const b of Array.isArray(list) ? list : []) statusOf.set(b.id, b.status);
  }
  for (const id of ids.filter((i) => db.pending[i].v === 2)) {
    try {
      const c = await abacate(`/checkouts/get?${new URLSearchParams({ id })}`, { version: 2 });
      statusOf.set(id, c?.status);
    } catch (err) {
      log.warn(`não consegui consultar a cobrança ${id}: ${err.message}`);
    }
  }
  const applied = [];
  for (const id of ids) {
    const p = { kind: 'pack', ...db.pending[id] };
    const status = String(statusOf.get(id) || '').toUpperCase();
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
