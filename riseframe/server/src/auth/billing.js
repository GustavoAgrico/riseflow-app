import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { makeLogger } from '../logger.js';
import { cloudSave, onCloudReload } from '../cloudSync.js';
import { findById, findByEmail } from './store.js';
import { signLink } from './tokens.js';
import { emailHtml, notifyAdmins, notifyUser, waLink, whatsappReady } from './notify.js';
import { checkEmail, checkEmailCode, checkPhone, formatPhone, newEmailCode } from './contact.js';
import { canEmailCustomers, sendMail } from './email.js';

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
 * Renovação automática (cartão, API v2): o plano vira uma assinatura mensal na AbacatePay
 * (users[id].subscription = { customerId, id, planId, active }). Quando o período acaba e
 * a assinatura continua ATIVA na API, o plano é renovado sozinho por mais um período.
 */
const FILE = path.join(config.paths.data, 'billing.json');
const API_BASE = 'https://api.abacatepay.com/v';
const DAY_MS = 24 * 3600 * 1000;
const PENDING_TTL_MS = 7 * DAY_MS;
const ALL_FEATURES = ['captionStyle', 'image', 'ai', 'clips', 'hd'];

let db = null;
onCloudReload('billing.json', () => { db = null; });

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
  db.claims ||= {};
  return db;
}

function persist() {
  fs.mkdirSync(config.paths.data, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2), { mode: 0o600 });
  cloudSave('billing.json');
}

function entry(userId) {
  load();
  if (!db.users[userId]) {
    db.users[userId] = { credits: config.billing.signupCredits, purchases: [], plan: null, freeEdits: config.billing.freeEdits, trialSources: [] };
    persist();
  }
  const e = db.users[userId];
  // Contas criadas antes das edições grátis também ganham as suas.
  if (e.freeEdits === undefined) {
    e.freeEdits = config.billing.freeEdits;
    e.trialSources = [];
    persist();
  }
  return e;
}

const pixMode = () => config.billing.payment === 'pix-links';
/** Link de Pix do banco para um plano/recarga (modo pix-links). */
const pixLink = (id) => config.billing.pixLinks[id] || '';
export const billingEnabled = () => (pixMode() ? Object.keys(config.billing.pixLinks).length > 0 : Boolean(config.billing.abacateKey));
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
  const e = entry(user.id);
  const plan = activePlan(e);
  if (plan) return plan.features;
  // Em teste (sem plano e com edição grátis sobrando): tudo liberado.
  return e.freeEdits > 0 ? ALL_FEATURES : config.billing.freeFeatures;
}

// ── Edições grátis (teste) ──
// Quem não tem plano e ainda tem edições grátis não paga créditos: cada vídeo enviado
// (auto, timeline ou clipes) usa 1 edição; os renders da timeline desse mesmo vídeo são
// grátis. Se o processamento falhar, a edição volta.
const TRIAL_MODES = ['auto', 'transcribe', 'clips'];

/** Este job pode sair como edição grátis? (mode render: se o vídeo de origem foi grátis). */
export function trialCovers(user, mode, sourceId) {
  if (unlimited(user)) return false;
  const e = entry(user.id);
  if (mode === 'render') return Boolean(sourceId && e.trialSources?.includes(sourceId));
  return TRIAL_MODES.includes(mode) && !activePlan(e) && e.freeEdits > 0;
}

/** Gasta uma edição grátis com este job (vira "vídeo de teste": renders grátis). */
export function useFreeEdit(userId, jobId) {
  const e = entry(userId);
  e.freeEdits = Math.max(0, e.freeEdits - 1);
  e.trialSources = [...(e.trialSources || []), jobId].slice(-30);
  persist();
  log.info(`edição grátis usada (restam ${e.freeEdits}) — job ${jobId} (user ${userId})`);
  return e.freeEdits;
}

/** O job grátis falhou: devolve a edição. */
export function refundFreeEdit(userId, jobId) {
  const e = entry(userId);
  e.freeEdits += 1;
  e.trialSources = (e.trialSources || []).filter((id) => id !== jobId);
  persist();
  log.info(`edição grátis devolvida (job ${jobId} falhou; user ${userId})`);
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
    // Edições grátis de teste que ainda restam (todos os recursos) e os vídeos cobertos.
    freeEdits: unlimited(user) ? 0 : e.freeEdits || 0,
    freeEditsTotal: b.freeEdits,
    trialSources: e.trialSources || [],
    extraCredits: e.credits,
    plan: plan ? { id: plan.id, name: plan.name, until: plan.until, credits: plan.left, monthlyCredits: plan.credits } : null,
    features: allowedFeatures(user),
    costs: b.costs,
    periodDays: b.periodDays,
    payment: pixMode() ? 'pix-links' : 'abacatepay',
    plans: b.plans.map((p) => ({ ...publicPlan(p), ...(pixMode() ? { pixLink: pixLink(p.id) } : {}) })),
    // No modo Pix só aparecem as recargas que têm link do banco.
    packs: b.packs.filter((p) => !pixMode() || pixLink(p.id)).map((p) => ({ ...publicPack(p), ...(pixMode() ? { pixLink: pixLink(p.id) } : {}) })),
    // Avisos de "Já paguei" deste usuário ainda não confirmados pelo admin.
    claims: Object.values(load().claims)
      .filter((c) => c.userId === user.id && c.status === 'pending')
      .map(({ id, kind, itemId, createdAt }) => ({ id, kind, itemId, createdAt })),
    phone: e.phone || '',
    // Contato informado no pagamento (e-mail confirmado por código quando há envio de e-mail).
    contactEmail: e.contactEmail || user.email || '',
    emailVerified: Boolean(e.emailVerified && e.emailVerified === (e.contactEmail || user.email)),
    emailCodeRequired: pixMode() && canEmailCustomers(),
    hasPending: Object.values(load().pending).some((p) => p.userId === user.id),
    // Renovação automática (assinatura no cartão) ligada para o plano atual?
    autoRenew: Boolean(plan && e.subscription?.active),
    autoRenewAvailable: billingEnabled() && b.autoRenew && !pixMode(),
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

// ── Cobranças dos apps de PC/Mac ──
// O app cobra aqui antes de processar e pede a devolução se o vídeo falhar. Cada cobrança
// fica guardada (id aleatório) por 2 dias; a devolução vale nas primeiras 12 h, uma vez
// só, e no máximo 10 por dia (o app roda no computador do cliente: limite contra abuso).
const HOLD_KEEP_MS = 2 * DAY_MS;
const HOLD_REFUND_MS = 12 * 3600 * 1000;
const MAX_REFUNDS_DAY = 10;

/** Guarda uma cobrança do app (créditos ou edição grátis) e devolve o id dela. */
export function holdRemote(userId, rec) {
  const e = entry(userId);
  const now = Date.now();
  e.remoteHolds = Object.fromEntries(Object.entries(e.remoteHolds || {}).filter(([, h]) => now - h.at < HOLD_KEEP_MS));
  const id = crypto.randomBytes(12).toString('hex');
  e.remoteHolds[id] = { ...rec, at: now };
  persist();
  return id;
}

/** Tira a cobrança para devolver (null se não existe, já foi devolvida, venceu ou passou do limite). */
export function releaseRemote(userId, id) {
  const e = entry(userId);
  const hold = e.remoteHolds?.[id];
  const now = Date.now();
  if (!hold || now - hold.at > HOLD_REFUND_MS) return null;
  const recent = (e.remoteRefunds || []).filter((t) => now - t < DAY_MS);
  if (recent.length >= MAX_REFUNDS_DAY) return null;
  delete e.remoteHolds[id];
  e.remoteRefunds = [...recent, now];
  persist();
  return hold;
}

/** Só para testes: o registro do usuário em memória. */
export const __testEntry = (userId) => entry(userId);

/** Período do plano no momento da cobrança (para a devolução saber se ainda vale). */
export const currentPeriod = (userId) => entry(userId).plan?.until || null;

// A AbacatePay tem duas APIs: v1 (antiga) e v2. Cada chave só funciona na versão em
// que foi criada — chave nova na v1 responde "API key version mismatch". Por padrão
// tenta a v2 e, se a chave for da outra versão, troca sozinho (e lembra).
// ABACATE_API_VERSION=1|2 fixa a versão.
let apiVersion = null;

async function abacate(pathname, { method = 'GET', body, version = 2, raw = false } = {}) {
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
  return raw ? data : data.data ?? data;
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

async function productIdV2({ externalId, name, description, price, cycle }) {
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
      body: { externalId, name, description, price, currency: 'BRL', ...(cycle ? { cycle } : {}) },
    });
  }
  if (!product?.id) throw new Error('a AbacatePay não retornou o produto');
  productIds.set(cacheKey, product.id);
  return product.id;
}

/** Cria a cobrança com os métodos configurados; se a conta recusar, tenta só Pix. */
async function withMethods(create, methods = config.billing.methods) {
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
export async function createCheckout(user, { kind, itemId, name, taxId, cellphone, returnUrl, recurring = false }) {
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
  if (kind === 'plan' && recurring) return createSubscriptionCheckout(user, item, product, customer, returnUrl);

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

/** Cliente da AbacatePay (v2) deste usuário; criado na 1ª assinatura e guardado. */
async function customerIdV2(user, customer) {
  const e = entry(user.id);
  const keyTag = config.billing.abacateKey.slice(-8);
  if (e.abacateCustomer?.id && e.abacateCustomer.key === keyTag) return e.abacateCustomer.id;
  const c = await abacate('/customers/create', { method: 'POST', version: 2, body: customer });
  if (!c?.id) throw new Error('a AbacatePay não retornou o cliente');
  e.abacateCustomer = { id: c.id, key: keyTag };
  persist();
  return c.id;
}

/** Checkout de ASSINATURA mensal (renova sozinho no cartão). Só existe na API v2. */
async function createSubscriptionCheckout(user, item, product, customer, returnUrl) {
  const b = config.billing;
  // Assinatura só existe na API v2: vai direto nela (sem a troca automática de versão).
  const { billing } = await (async () => {
    const customerId = await customerIdV2(user, customer);
    const productId = await productIdV2({
      externalId: `riseframe-assinatura-${item.id}-${item.priceCents}`,
      name: `Riseframe ${item.name} — mensal`,
      description: `Assinatura mensal do plano ${item.name}: ${item.credits} créditos por mês`,
      price: item.priceCents,
      cycle: 'MONTHLY',
    });
    const billing = await withMethods(
      (methods) =>
        abacate('/subscriptions/create', {
          method: 'POST',
          version: 2,
          body: {
            items: [{ id: productId, quantity: 1 }],
            customerId,
            methods,
            returnUrl,
            completionUrl: returnUrl,
            externalId: `riseframe-assinatura-${item.id}-${Date.now()}`,
          },
        }),
      b.subscriptionMethods,
    );
    return { billing };
  })().catch((err) => {
    if (!versionMismatch(err)) throw err;
    throw Object.assign(new Error('a renovação automática precisa da chave nova (API v2) da AbacatePay. Escolha pagar 30 dias por Pix.'), { status: 400 });
  });
  if (!billing?.id || !billing?.url) throw new Error('a AbacatePay não retornou o link da assinatura');
  load();
  db.pending[billing.id] = {
    userId: user.id, kind: 'plan', itemId: item.id, credits: item.credits, createdAt: new Date().toISOString(), v: 2, recurring: true,
  };
  persist();
  log.info(`assinatura ${billing.id} (plano ${item.id}) para ${user.email}`);
  return billing.url;
}

/** Assinaturas da loja na AbacatePay (todas as páginas, até um limite). */
async function listSubscriptionsV2() {
  const out = [];
  let cursor = null;
  for (let page = 0; page < 20; page += 1) {
    const q = new URLSearchParams({ limit: '100' });
    if (cursor) q.set('cursor', cursor);
    const r = await abacate(`/subscriptions/list?${q}`, { version: 2, raw: true });
    out.push(...(Array.isArray(r.data) ? r.data : []));
    cursor = r.pagination?.hasNext ? r.pagination.nextCursor : null;
    if (!cursor) break;
  }
  return out;
}

const newest = (list) => [...list].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))[0] || null;

/**
 * Renova sozinho os planos com assinatura: período vencido + assinatura ATIVA na API
 * = mais um período com os créditos do mês. Assinatura cancelada/falhou = para de
 * renovar (o plano acaba no fim do período já pago). Idempotente.
 */
export async function renewSubscriptions({ userId } = {}) {
  if (!billingEnabled()) return [];
  load();
  const now = Date.now();
  const due = Object.entries(db.users).filter(
    ([id, e]) => (!userId || id === userId) && e.subscription?.active && (!e.plan || Date.parse(e.plan.until) <= now || !e.subscription.id),
  );
  if (!due.length) return [];
  const subs = await listSubscriptionsV2();
  const renewed = [];
  for (const [id, e] of due) {
    const mine = subs.filter((s) => s.customerId === e.subscription.customerId);
    const sub = (e.subscription.id && mine.find((s) => s.id === e.subscription.id)) || newest(mine.filter((s) => s.status === 'ACTIVE')) || newest(mine);
    if (!sub) continue; // a assinatura ainda não apareceu na API (acabou de ser paga)
    e.subscription.id = sub.id;
    const status = String(sub.status || '').toUpperCase();
    if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(status)) {
      e.subscription.active = false;
      log.info(`assinatura ${sub.id} ${status}: plano não renova mais (user ${id})`);
      continue;
    }
    if (status !== 'ACTIVE' || !e.plan || Date.parse(e.plan.until) > now) continue;
    const cfg = planConfig(e.subscription.planId || e.plan.id);
    if (!cfg) continue;
    const period = config.billing.periodDays * DAY_MS;
    let until = Date.parse(e.plan.until) + period;
    if (until <= now) until = now + period; // ficou muito tempo sem conferir
    e.plan = { id: cfg.id, until: new Date(until).toISOString(), credits: cfg.credits };
    e.subscription.renewals = (e.subscription.renewals || 0) + 1;
    renewed.push({ userId: id, planId: cfg.id, until: e.plan.until });
    log.ok(`assinatura ${sub.id}: plano ${cfg.id} renovado até ${e.plan.until} (user ${id})`);
  }
  persist();
  return renewed;
}

/** Depois de pagamentos: cancela assinaturas que ficaram para trás (troca de plano). */
async function settleSubscriptionChanges() {
  load();
  for (const [id, e] of Object.entries(db.users)) {
    const sub = e.subscription;
    if (!sub) continue;
    try {
      if (sub.cancelOthers && sub.customerId) {
        // Fica só a assinatura mais nova (a que acabou de ser paga); as outras ativas saem.
        const active = (await listSubscriptionsV2()).filter((x) => x.customerId === sub.customerId && x.status === 'ACTIVE');
        const keep = newest(active);
        for (const old of active.filter((x) => x !== keep)) {
          await abacate('/subscriptions/cancel', { method: 'POST', version: 2, body: { id: old.id } });
          log.info(`assinatura antiga ${old.id} cancelada (troca de plano, user ${id})`);
        }
        if (keep) sub.id = keep.id;
        sub.cancelOthers = false;
      }
      if (sub.cancelPending && sub.active) {
        await cancelSubscription({ id });
        sub.cancelPending = false;
      }
    } catch (err) {
      log.warn(`não consegui cancelar a assinatura antiga (user ${id}): ${err.message}`);
    }
  }
  persist();
}

/** Cancela a renovação automática. O plano continua até o fim do período já pago. */
export async function cancelSubscription(user) {
  const e = entry(user.id);
  if (!e.subscription?.active) throw Object.assign(new Error('você não tem renovação automática ativa'), { status: 400 });
  if (!e.subscription.id) {
    const mine = (await listSubscriptionsV2()).filter((s) => s.customerId === e.subscription.customerId && s.status === 'ACTIVE');
    e.subscription.id = newest(mine)?.id || null;
  }
  if (e.subscription.id) await abacate('/subscriptions/cancel', { method: 'POST', version: 2, body: { id: e.subscription.id } });
  e.subscription.active = false;
  persist();
  log.info(`renovação automática cancelada (user ${user.id})`);
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
    if (p.recurring) {
      // Assinatura nova (ou troca de plano): a anterior deixa de valer.
      // Se já havia uma, cancela todas as outras do cliente (evita cobrar duas vezes).
      const hadOther = Boolean(e.subscription?.active);
      e.subscription = { active: true, planId: p.itemId, customerId: e.abacateCustomer?.id || null, id: null, since: new Date().toISOString(), cancelOthers: hadOther };
    } else if (e.subscription?.active && e.subscription.planId !== p.itemId) {
      // Pagou outro plano avulso (Pix): a assinatura antiga renovaria o plano errado.
      e.subscription.cancelPending = true;
    }
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
  if (applied.length) await settleSubscriptionChanges();
  return applied;
}

// ───────────────────────── Pix por link do banco (modo pix-links) ─────────────────────────
// O banco não avisa o site quando o Pix cai: o cliente paga pelo link, clica em "Já paguei"
// (vira um aviso pendente) e o admin confirma — aí o plano vale `periodDays` dias.

const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBR = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
// Endereço público do site: APP_URL; senão o 1º domínio de CORS_ORIGIN; senão o do Render.
const appUrl = () =>
  (config.auth.appUrl || config.corsOrigin.find((o) => /^https:\/\//.test(o)) || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const plansUrl = () => `${appUrl()}/?billing=return`;
// Endereço da API (para links de e-mail que chamam o servidor). Com o site numa hospedagem
// comum e a API em outro lugar (Render), não é o mesmo endereço do site.
const apiUrl = () => (process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || appUrl()).replace(/\/+$/, '');

function itemOf(kind, itemId) {
  return kind === 'plan' ? planConfig(itemId) : config.billing.packs.find((p) => p.id === itemId) || null;
}
const itemLabel = (kind, item) => (kind === 'plan' ? `plano ${item.name}` : `recarga de ${item.credits} créditos`);

/** Cliente avisou que pagou o Pix: cria (ou reaproveita) o aviso pendente e avisa os admins. */
/** Nome completo: pelo menos nome e sobrenome, só letras. '' se não parecer real. */
function cleanFullName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const parts = n.split(' ').filter((p) => /^[\p{L}'’.-]{2,}$/u.test(p));
  return parts.length >= 2 && parts.length === n.split(' ').length ? n : '';
}

/** Confere nome, e-mail e WhatsApp do pagamento: { ok, name, email, phone, errors }. */
export async function checkContact(user, { name, email, phone } = {}) {
  const errors = {};
  const fullName = cleanFullName(name);
  if (!fullName) errors.name = 'informe seu nome e sobrenome';
  const em = await checkEmail(email);
  if (!em.ok) errors.email = em.error;
  const ph = checkPhone(phone);
  if (!ph.ok) errors.phone = ph.error;
  const e = entry(user.id);
  const verified = Boolean(em.ok && e.emailVerified === em.email);
  return {
    ok: !Object.keys(errors).length,
    name: fullName, email: em.email, phone: ph.phone, phoneLabel: ph.ok ? formatPhone(ph.phone) : '',
    suggestion: em.suggestion || null,
    emailVerified: verified,
    emailCodeRequired: pixMode() && canEmailCustomers() && !verified,
    errors,
  };
}

/** Manda o código de 6 dígitos para confirmar o e-mail do pagamento. */
export async function sendContactCode(user, email) {
  const em = await checkEmail(email);
  if (!em.ok) throw Object.assign(new Error(em.error), { status: 400 });
  const code = newEmailCode(user.id, em.email);
  const text = `Seu código do Riseframe: ${code}\n\nUse-o para confirmar seu e-mail no pagamento. Vale por 15 minutos.\nSe não foi você, ignore este e-mail.`;
  try {
    await sendMail({
      to: em.email,
      subject: `${code} é seu código do Riseframe`,
      text,
      html: emailHtml(`Seu código: ${code}`, ['Use este código para confirmar seu e-mail no pagamento do Riseframe. Ele vale por 15 minutos.', 'Se não foi você, ignore este e-mail.']),
    }, { throwOnError: true });
  } catch (err) {
    log.error(`código de e-mail não foi enviado: ${err.message}`);
    throw Object.assign(new Error('não consegui enviar o código agora — confira o e-mail ou tente de novo em instantes'), { status: 502 });
  }
  log.info(`código de confirmação enviado (user ${user.id})`);
  return { sent: true };
}

/** Confere o código e marca o e-mail como confirmado. */
export function verifyContactCode(user, email, code) {
  const em = String(email || '').trim().toLowerCase();
  checkEmailCode(user.id, em, code);
  const e = entry(user.id);
  e.contactEmail = em;
  e.emailVerified = em;
  persist();
  return billingStatus(user);
}

export async function createPixClaim(user, { kind, itemId, phone, name, email }) {
  const item = itemOf(kind, itemId);
  if (!item || !pixLink(itemId)) throw Object.assign(new Error('plano ou recarga inválido'), { status: 400 });
  const contact = await checkContact(user, { name, email: email ?? entry(user.id).contactEmail ?? user.email, phone });
  if (!contact.ok) throw Object.assign(new Error(Object.values(contact.errors)[0]), { status: 400, errors: contact.errors });
  if (contact.emailCodeRequired) throw Object.assign(new Error('confirme seu e-mail com o código antes de avisar o pagamento'), { status: 400 });
  const tel = contact.phone;
  load();
  const e = entry(user.id);
  e.phone = tel;
  e.contactEmail = contact.email;
  e.name = contact.name;
  const dup = Object.values(db.claims).find((c) => c.userId === user.id && c.status === 'pending' && c.kind === kind && c.itemId === itemId);
  if (dup) {
    // Cliente clicou "Já paguei" de novo: se o aviso anterior não chegou por e-mail
    // (ex.: o envio ainda não estava configurado), tenta mandar outra vez.
    Object.assign(dup, { contactEmail: contact.email, name: contact.name, phone: tel });
    persist();
    const delivered = dup.notice?.email?.some((m) => m.ok);
    const recent = dup.notice?.at && Date.now() - Date.parse(dup.notice.at) < 60_000;
    if (!delivered && !recent) notifyClaim(dup, item);
    return dup;
  }
  const id = `pix_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const claim = {
    id, userId: user.id, email: user.email, contactEmail: contact.email, name: e.name || user.name || '', phone: tel,
    kind, itemId, priceCents: item.priceCents, createdAt: new Date().toISOString(), status: 'pending',
  };
  db.claims[id] = claim;
  persist();
  log.info(`aviso de Pix ${id}: ${itemLabel(kind, item)} (${brl(item.priceCents)}) de ${user.email}`);
  notifyClaim(claim, item);
  return claim;
}

/**
 * Manda o "Pix a confirmar" para os admins (e-mail com o botão "Confirmar pagamento" e
 * WhatsApp, se houver) e guarda o resultado no aviso para o painel mostrar.
 */
function notifyClaim(claim, item) {
  const { id, kind } = claim;
  const contactEmail = claim.contactEmail || claim.email;
  // Botão no e-mail: abre uma página de confirmação (não confirma só de abrir o link,
  // porque antivírus e o próprio Gmail visitam links de e-mail sozinhos).
  const confirmUrl = `${apiUrl()}/api/billing/pix/email-action?t=${signLink({ c: id }, 14 * 86400)}`;
  const text = `Riseframe: ${claim.name || contactEmail} avisou que pagou o Pix do ${itemLabel(kind, item)} (${brl(item.priceCents)}). Confira no banco e confirme: ${confirmUrl}`;
  claim.notice = { at: new Date().toISOString(), email: [], whatsapp: null, sending: true };
  return notifyAdmins({
    subject: `Pix a confirmar: ${itemLabel(kind, item)} — ${brl(item.priceCents)}`,
    text,
    html: emailHtml('Pix a confirmar', [
      `${claim.name || '(sem nome)'} · ${contactEmail}${contactEmail !== claim.email ? ` (conta ${claim.email})` : ''} · WhatsApp ${formatPhone(claim.phone)}`,
      `Avisou que pagou o ${itemLabel(kind, item)} (${brl(item.priceCents)}).`,
      'Confira no extrato do banco se o Pix caiu. Só depois clique em "Confirmar pagamento" — aí o plano e os créditos são liberados e o cliente é avisado.',
    ], { label: 'Confirmar pagamento', url: confirmUrl }),
  })
    .then((r) => {
      claim.notice = { at: new Date().toISOString(), email: r.email, whatsapp: r.whatsapp };
      const failed = r.email.filter((m) => !m.ok);
      if (!r.email.length) log.warn(`aviso do Pix ${id}: nenhum e-mail de admin (defina ADMIN_EMAILS)`);
      else if (failed.length) log.warn(`aviso do Pix ${id} não chegou por e-mail: ${failed.map((m) => `${m.to.split('@')[0].slice(0, 3)}…: ${m.error || 'sem envio configurado'}`).join('; ')}`);
      else log.ok(`aviso do Pix ${id} enviado por e-mail`);
      persist();
    })
    .catch((err) => log.warn(`aviso aos admins falhou: ${err.message}`));
}

/** Admin: manda de novo o e-mail "Pix a confirmar" de um aviso pendente (e diz se saiu). */
export async function resendClaimNotice(claimId) {
  load();
  const c = db.claims[claimId];
  if (!c) throw Object.assign(new Error('aviso não encontrado'), { status: 404 });
  const item = itemOf(c.kind, c.itemId);
  if (!item) throw Object.assign(new Error('plano ou recarga não existe mais'), { status: 400 });
  await notifyClaim(c, item);
  return c.notice;
}

/** Resumo de um aviso para a página de confirmação do e-mail. */
export function claimSummary(claimId) {
  load();
  const c = db.claims[claimId];
  if (!c) return null;
  const item = itemOf(c.kind, c.itemId);
  return {
    id: c.id, status: c.status, name: c.name, email: c.contactEmail || c.email, account: c.email, phone: formatPhone(c.phone),
    item: item ? itemLabel(c.kind, item) : c.itemId, price: brl(c.priceCents), createdAt: c.createdAt, decidedAt: c.decidedAt || null,
  };
}

/** Lista para o admin: pendentes primeiro, depois os últimos decididos. */
export function listClaims() {
  load();
  const all = Object.values(db.claims).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const withExtras = (c) => {
    const item = itemOf(c.kind, c.itemId);
    const msg = `Olá! Aqui é do Riseframe. Recebemos seu aviso de pagamento do ${item ? itemLabel(c.kind, item) : c.itemId}.`;
    return { ...c, itemName: item ? itemLabel(c.kind, item) : c.itemId, waLink: waLink(c.phone, msg) };
  };
  return {
    pending: all.filter((c) => c.status === 'pending').map(withExtras),
    recent: all.filter((c) => c.status !== 'pending').slice(0, 30).map(withExtras),
  };
}

/** Mensagem de plano/recarga liberado(a) para o cliente. */
function grantedMessage(kind, item, e) {
  const until = e.plan?.until;
  const text =
    kind === 'plan'
      ? `Riseframe: pagamento confirmado! Seu plano ${item.name} está ativo até ${dateBR(until)} (${item.credits} créditos). Bons vídeos!`
      : `Riseframe: pagamento confirmado! ${item.credits} créditos foram adicionados à sua conta.`;
  return {
    subject: kind === 'plan' ? `Plano ${item.name} ativo até ${dateBR(until)}` : 'Créditos adicionados',
    text,
    html: emailHtml('Pagamento confirmado', [text.replace(/^Riseframe: /, '')], { label: 'Abrir o Riseframe', url: appUrl() || plansUrl() }),
  };
}

/** Admin confirmou o Pix: libera o plano/recarga e avisa o cliente. */
export async function approveClaim(claimId, admin) {
  load();
  const c = db.claims[claimId];
  if (!c) throw Object.assign(new Error('aviso não encontrado'), { status: 404 });
  if (c.status !== 'pending') throw Object.assign(new Error('este aviso já foi decidido'), { status: 400 });
  const item = itemOf(c.kind, c.itemId);
  if (!item) throw Object.assign(new Error('plano ou recarga não existe mais'), { status: 400 });
  grant(`pix:${c.id}`, { userId: c.userId, kind: c.kind, itemId: c.itemId, credits: item.credits });
  c.status = 'approved';
  c.decidedAt = new Date().toISOString();
  c.decidedBy = admin?.email || '';
  const e = entry(c.userId);
  if (c.kind === 'plan') e.reminded = {}; // novo período: lembretes começam do zero
  persist();
  const sent = await notifyUser({ email: c.contactEmail || c.email, phone: c.phone }, grantedMessage(c.kind, item, e));
  return { claim: c, sent };
}

export function rejectClaim(claimId, admin) {
  load();
  const c = db.claims[claimId];
  if (!c) throw Object.assign(new Error('aviso não encontrado'), { status: 404 });
  if (c.status !== 'pending') throw Object.assign(new Error('este aviso já foi decidido'), { status: 400 });
  c.status = 'rejected';
  c.decidedAt = new Date().toISOString();
  c.decidedBy = admin?.email || '';
  persist();
  return c;
}

/** Admin libera um plano/recarga direto pelo e-mail do cliente (pagou fora do site). */
export async function adminGrant({ email, kind = 'plan', itemId }, admin) {
  const u = findByEmail(email);
  if (!u) throw Object.assign(new Error('nenhuma conta com esse e-mail'), { status: 404 });
  const item = itemOf(kind, itemId);
  if (!item) throw Object.assign(new Error('plano ou recarga inválido'), { status: 400 });
  grant(`manual:${Date.now().toString(36)}`, { userId: u.id, kind, itemId, credits: item.credits });
  const e = entry(u.id);
  if (kind === 'plan') e.reminded = {};
  persist();
  log.info(`${admin?.email || 'admin'} liberou ${itemLabel(kind, item)} para ${u.email}`);
  const sent = await notifyUser({ email: e.contactEmail || u.email, phone: e.phone }, grantedMessage(kind, item, e));
  return { user: u.email, sent, until: e.plan?.until || null };
}

/**
 * Lembretes de vencimento do plano (e-mail + WhatsApp): `reminderDays` dias antes e no
 * dia. Cada lembrete sai uma vez por período. Só manda entre 8h e 21h (horário de Brasília).
 */
export async function sendReminders({ now = Date.now(), force = false } = {}) {
  if (!billingEnabled()) return [];
  const hour = Number(new Date(now).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));
  if (!force && (hour < 8 || hour >= 21)) return [];
  load();
  const sent = [];
  const days = [...config.billing.reminderDays].map(Number).filter((d) => d >= 0).sort((a, b) => a - b);
  for (const [userId, e] of Object.entries(db.users)) {
    if (!e.plan) continue;
    const until = Date.parse(e.plan.until);
    const daysLeft = Math.ceil((until - now) / DAY_MS);
    if (daysLeft < -2) continue; // venceu faz tempo: para de lembrar
    // O menor marco já alcançado (ex.: faltam 2 dias → marco de 3 dias).
    const mark = daysLeft <= 0 ? 0 : days.find((d) => d > 0 && daysLeft <= d);
    if (mark === undefined || (mark === 0 && !days.includes(0))) continue;
    e.reminded ||= {};
    const key = `${e.plan.until}:${mark}`;
    if (e.reminded[key]) continue;
    const u = findById(userId);
    const cfg = planConfig(e.plan.id);
    if (!u || !cfg) continue;
    const link = pixMode() ? pixLink(cfg.id) : '';
    const when = mark === 0 ? (daysLeft <= 0 ? 'venceu' : 'vence hoje') : `vence em ${daysLeft} dia${daysLeft > 1 ? 's' : ''} (${dateBR(e.plan.until)})`;
    const text =
      `Riseframe: seu plano ${cfg.name} ${when}. Para renovar por mais ${config.billing.periodDays} dias (${brl(cfg.priceCents)}), ` +
      (link ? `pague o Pix neste link: ${link} e depois clique em "Já paguei" em ${plansUrl()}` : `acesse ${plansUrl()}`);
    const r = await notifyUser(
      { email: e.contactEmail || u.email, phone: e.phone },
      {
        subject: `Seu plano ${cfg.name} ${when}`,
        text,
        html: emailHtml(`Seu plano ${cfg.name} ${when}`, [
          `Para continuar com ${cfg.credits} créditos por mês, renove por mais ${config.billing.periodDays} dias (${brl(cfg.priceCents)}).`,
          link ? 'Pague o Pix pelo botão abaixo e depois clique em "Já paguei" na página de Planos.' : 'Renove pela página de Planos.',
        ], { label: link ? `Pagar ${brl(cfg.priceCents)} no Pix` : 'Renovar plano', url: link || plansUrl() }),
      },
    );
    e.reminded[key] = new Date(now).toISOString();
    sent.push({ userId, mark, ...r });
    log.info(`lembrete de vencimento (${when}) para ${u.email}: e-mail ${r.email ? 'ok' : 'não'}, WhatsApp ${r.whatsapp ? 'ok' : 'não'}`);
  }
  persist();
  return sent;
}

/** Confere renovações de hora em hora (além de quando o usuário abre os planos). */
export function startRenewTimer() {
  if (!billingEnabled()) return;
  const run = () => {
    renewSubscriptions().catch((err) => log.warn(`renovação automática: ${err.message}`));
    sendReminders().catch((err) => log.warn(`lembretes: ${err.message}`));
  };
  setTimeout(run, 60_000).unref();
  setInterval(run, 3600_000).unref();
}
