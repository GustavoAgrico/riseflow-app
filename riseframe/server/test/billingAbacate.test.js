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
