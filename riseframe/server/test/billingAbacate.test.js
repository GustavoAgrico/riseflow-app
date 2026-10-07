import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Dados isolados deste teste (billing.json próprio).
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-billing-'));
const { config } = await import('../src/config.js');
const billing = await import('../src/auth/billing.js');

config.billing.abacateKey = 'chave_teste_12345678';
config.billing.payment = 'abacatepay';
config.billing.methods = ['PIX', 'CARD'];
const user = { id: 'u1', email: 'cliente@example.com', name: 'Cliente' };
const checkoutInfo = { kind: 'plan', itemId: 'pro', name: 'Cliente', taxId: '12345678901', cellphone: '11999999999', returnUrl: 'https://x/?billing=return' };

let calls = [];
let handler = null;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const call = { version: u.pathname.split('/')[1], path: u.pathname.replace(/^\/v\d/, ''), query: Object.fromEntries(u.searchParams), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null };
  calls.push(call);
  const [status, json] = handler(call);
  return new Response(JSON.stringify(json), { status });
};

beforeEach(() => { calls = []; });

/** AbacatePay v2 falsa: produtos + checkouts. */
function fakeV2({ cardRefused = false } = {}) {
  const products = new Map();
  const checkouts = new Map();
  return (c) => {
    if (c.version !== 'v2') return [401, { data: null, error: 'API key version mismatch', success: false }];
    if (c.path === '/products/get') {
      const p = products.get(c.query.externalId);
      return p ? [200, { data: p, error: null, success: true }] : [404, { data: null, error: 'Product not found', success: false }];
    }
    if (c.path === '/products/create') {
      const p = { id: `prod_${products.size + 1}`, ...c.body };
      products.set(c.body.externalId, p);
      return [200, { data: p, error: null, success: true }];
    }
    if (c.path === '/checkouts/create') {
      if (cardRefused && c.body.methods.includes('CARD')) return [400, { data: null, error: 'Invalid methods: CARD not enabled', success: false }];
      const ch = { id: `bill_${checkouts.size + 1}`, url: `https://pay/${checkouts.size + 1}`, status: 'PENDING' };
      checkouts.set(ch.id, ch);
      return [200, { data: ch, error: null, success: true }];
    }
    if (c.path === '/checkouts/get') {
      const ch = checkouts.get(c.query.id);
      return [200, { data: { ...ch, status: 'PAID' }, error: null, success: true }];
    }
    return [404, { data: null, error: 'not found', success: false }];
  };
}

test('AbacatePay v2: cria o produto, gera o checkout e libera o plano quando pago', async () => {
  handler = fakeV2();
  const url = await billing.createCheckout(user, checkoutInfo);
  assert.equal(url, 'https://pay/1');
  const create = calls.find((c) => c.path === '/checkouts/create');
  assert.equal(create.version, 'v2');
  assert.deepEqual(create.body.items, [{ id: 'prod_1', quantity: 1 }]);
  assert.equal(create.body.customer.taxId, '12345678901');
  assert.equal(calls.find((c) => c.path === '/products/create').body.price, 8990);

  // 2ª compra do mesmo plano: reaproveita o produto (cache), não cria de novo.
  calls = [];
  await billing.createCheckout(user, checkoutInfo);
  assert.equal(calls.filter((c) => c.path.startsWith('/products')).length, 0);

  const applied = await billing.syncPayments({ userId: 'u1' });
  assert.equal(applied.length, 2);
  assert.equal(billing.billingStatus(user).plan.id, 'pro');
});

test('AbacatePay v2: conta sem cartão liberado cai para só Pix', async () => {
  handler = fakeV2({ cardRefused: true });
  const url = await billing.createCheckout({ ...user, id: 'u2' }, checkoutInfo);
  assert.ok(url.startsWith('https://pay/'));
  const creates = calls.filter((c) => c.path === '/checkouts/create');
  assert.deepEqual(creates.at(-1).body.methods, ['PIX']);
});

test('chave antiga (v1): troca sozinho para a API v1 depois do "version mismatch"', async () => {
  handler = (c) => {
    if (c.version === 'v2') return [401, { data: null, error: 'API key version mismatch', success: false }];
    if (c.path === '/billing/create') return [200, { data: { id: 'bill_v1', url: 'https://pay/v1' }, error: null }];
    if (c.path === '/billing/list') return [200, { data: [{ id: 'bill_v1', status: 'PAID' }], error: null }];
    return [404, { error: 'not found' }];
  };
  const u3 = { ...user, id: 'u3' };
  const url = await billing.createCheckout(u3, { ...checkoutInfo, kind: 'pack', itemId: 'recarga-100' });
  assert.equal(url, 'https://pay/v1');
  const v1 = calls.find((c) => c.path === '/billing/create');
  assert.equal(v1.version, 'v1');
  assert.equal(v1.body.products[0].price, 1490);
  const applied = await billing.syncPayments({ userId: 'u3' });
  assert.deepEqual(applied.map((a) => a.credits), [100]);
});

/** AbacatePay v2 falsa com clientes e assinaturas. */
function fakeSubscriptions() {
  const base = fakeV2();
  const state = { customers: 0, subs: [], cancelled: [], checkouts: new Map(), products: [] };
  const h = (c) => {
    if (c.version !== 'v2') return [401, { data: null, error: 'API key version mismatch', success: false }];
    if (c.path === '/customers/create') return [200, { data: { id: `cust_${++state.customers}`, ...c.body }, error: null, success: true }];
    if (c.path === '/products/create') state.products.push(c.body);
    if (c.path === '/subscriptions/create') {
      const id = `bill_sub_${state.checkouts.size + 1}`;
      state.checkouts.set(id, { customerId: c.body.customerId });
      return [200, { data: { id, url: `https://pay/${id}`, status: 'PENDING' }, error: null, success: true }];
    }
    if (c.path === '/checkouts/get' && state.checkouts.has(c.query.id)) {
      // Pagou: a assinatura passa a existir na AbacatePay.
      const ck = state.checkouts.get(c.query.id);
      if (!ck.paid) {
        ck.paid = true;
        state.subs.push({ id: `subs_${state.subs.length + 1}`, customerId: ck.customerId, status: 'ACTIVE', createdAt: new Date(Date.now() + state.subs.length).toISOString() });
      }
      return [200, { data: { id: c.query.id, status: 'PAID' }, error: null, success: true }];
    }
    if (c.path === '/subscriptions/list') return [200, { data: state.subs, error: null, success: true, pagination: { hasNext: false, nextCursor: null } }];
    if (c.path === '/subscriptions/cancel') {
      state.cancelled.push(c.body.id);
      const s = state.subs.find((x) => x.id === c.body.id);
      if (s) s.status = 'CANCELLED';
      return [200, { data: s, error: null, success: true }];
    }
    return base(c);
  };
  return { h, state };
}

test('renovação automática: assina no cartão, renova quando vence e cancela', async () => {
  const { h, state } = fakeSubscriptions();
  handler = h;
  const u = { ...user, id: 'u_sub' };
  const url = await billing.createCheckout(u, { ...checkoutInfo, recurring: true });
  assert.match(url, /bill_sub_1/);
  const create = calls.find((c) => c.path === '/subscriptions/create');
  assert.deepEqual(create.body.methods, ['CARD']);
  assert.equal(create.body.customerId, 'cust_1');
  assert.equal(state.products.find((p) => p.cycle === 'MONTHLY').price, 8990, 'produto mensal com o preço do plano');

  // Pagou → plano ativo + renovação automática ligada.
  assert.equal((await billing.syncPayments({ userId: 'u_sub' })).length, 1);
  let st = billing.billingStatus(u);
  assert.equal(st.plan.id, 'pro');
  assert.equal(st.autoRenew, true);

  // Gasta créditos e o período vence: assinatura ATIVA → renova com créditos cheios.
  billing.charge(u, 400);
  const db = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'billing.json'), 'utf8'));
  db.users.u_sub.plan.until = new Date(Date.now() - 1000).toISOString();
  fs.writeFileSync(path.join(process.env.DATA_DIR, 'billing.json'), JSON.stringify(db));
  // (o módulo guarda o estado em memória: aplica a mesma mudança nele)
  const e = billing.__testEntry('u_sub');
  e.plan.until = db.users.u_sub.plan.until;
  const renewed = await billing.renewSubscriptions({ userId: 'u_sub' });
  assert.equal(renewed.length, 1);
  st = billing.billingStatus(u);
  assert.equal(st.plan.credits, 1000, 'créditos do mês voltam ao valor do plano');
  assert.ok(Date.parse(st.plan.until) > Date.now() + 29 * 24 * 3600 * 1000);

  // Não renova de novo enquanto o período vale.
  assert.equal((await billing.renewSubscriptions({ userId: 'u_sub' })).length, 0);

  // Cancelar: chama a AbacatePay e desliga a renovação; o plano continua até o fim.
  await billing.cancelSubscription(u);
  assert.deepEqual(state.cancelled, ['subs_1']);
  st = billing.billingStatus(u);
  assert.equal(st.autoRenew, false);
  assert.equal(st.plan.id, 'pro');
});

test('renovação automática: trocar de plano cancela a assinatura antiga', async () => {
  const { h, state } = fakeSubscriptions();
  handler = h;
  const u = { ...user, id: 'u_troca' };
  await billing.createCheckout(u, { ...checkoutInfo, itemId: 'basico', recurring: true });
  await billing.syncPayments({ userId: 'u_troca' });
  // (sem esperar descobrir o id da 1ª assinatura: mesmo assim ela é cancelada na troca)
  await billing.createCheckout(u, { ...checkoutInfo, itemId: 'premium', recurring: true });
  await billing.syncPayments({ userId: 'u_troca' });
  assert.deepEqual(state.cancelled, ['subs_1']);
  const st = billing.billingStatus(u);
  assert.equal(st.plan.id, 'premium');
  assert.equal(st.autoRenew, true);
});

test('renovação automática com chave antiga (v1) explica que precisa da chave nova', async () => {
  handler = (c) => (c.version === 'v2' ? [401, { error: 'API key version mismatch', success: false }] : [404, { error: 'x' }]);
  await assert.rejects(billing.createCheckout({ ...user, id: 'u_v1' }, { ...checkoutInfo, recurring: true }), /chave nova/);
});
