import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-pix-'));
const { config } = await import('../src/config.js');
const store = await import('../src/auth/store.js');
const billing = await import('../src/auth/billing.js');

config.billing.payment = 'pix-links';
config.billing.pixLinks = { basico: 'https://banco/basico', pro: 'https://banco/pro', premium: 'https://banco/premium' };
config.billing.whatsapp = { url: 'https://wa.test', key: 'k', sessionUserId: 'sess' };
config.billing.adminEmails = [];
config.auth.appUrl = 'https://riseframe.test';

// WhatsApp falso: guarda as mensagens enviadas.
const whats = [];
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://wa.test/send/text')) {
    whats.push(JSON.parse(init.body));
    return new Response('{}', { status: 200 });
  }
  return new Response('{}', { status: 404 });
};

const u = store.createUser({ email: 'cliente@example.com', password: 'senha12345', name: 'Cliente' });
const admin = { email: 'admin@example.com' };

test('status no modo Pix: links por plano, sem renovação automática, recargas sem link escondidas', () => {
  const st = billing.billingStatus(u);
  assert.equal(st.enabled, true);
  assert.equal(st.payment, 'pix-links');
  assert.equal(st.plans.find((p) => p.id === 'pro').pixLink, 'https://banco/pro');
  assert.equal(st.autoRenewAvailable, false);
  assert.equal(st.packs.length, 0);
});

test('"Já paguei" cria aviso pendente (sem duplicar) e o plano só vale depois da confirmação', async () => {
  await assert.rejects(billing.createPixClaim(u, { kind: 'plan', itemId: 'pro', phone: '123' }), /WhatsApp/);
  const c1 = await billing.createPixClaim(u, { kind: 'plan', itemId: 'pro', phone: '(11) 98888-7777', name: 'Cliente' });
  const c2 = await billing.createPixClaim(u, { kind: 'plan', itemId: 'pro', phone: '11988887777' });
  assert.equal(c1.id, c2.id, 'mesmo aviso, não duplica');
  assert.equal(c1.phone, '5511988887777');
  let st = billing.billingStatus(u);
  assert.equal(st.plan, null, 'ainda não liberado');
  assert.equal(st.claims.length, 1);
  assert.equal(billing.listClaims().pending.length, 1);
  assert.match(billing.listClaims().pending[0].waLink, /^https:\/\/wa\.me\/5511988887777/);

  const r = await billing.approveClaim(c1.id, admin);
  assert.equal(r.sent.whatsapp, true);
  st = billing.billingStatus(u);
  assert.equal(st.plan.id, 'pro');
  assert.equal(st.plan.credits, 1000);
  const days = (Date.parse(st.plan.until) - Date.now()) / 86400000;
  assert.ok(days > 29.9 && days <= 30, 'vale 30 dias');
  assert.equal(st.claims.length, 0);
  assert.match(whats.at(-1).text, /plano Pro está ativo até/);
  assert.equal(whats.at(-1).userId, 'sess');
  await assert.rejects(billing.approveClaim(c1.id, admin), /já foi decidido/);
});

test('lembretes: 3 dias antes, 1 dia antes e no vencimento — cada um uma vez, com o link do Pix', async () => {
  const until = Date.parse(billing.billingStatus(u).plan.until);
  const day = 86400000;
  const noon = (t) => { const d = new Date(t); d.setUTCHours(15, 0, 0, 0); return d.getTime(); }; // 12h em Brasília
  whats.length = 0;
  assert.equal((await billing.sendReminders({ now: noon(until - 10 * day) })).length, 0, 'longe do vencimento: nada');
  assert.equal((await billing.sendReminders({ now: until - 2.5 * day, force: true })).length, 1);
  assert.match(whats.at(-1).text, /vence em 3 dias/);
  assert.match(whats.at(-1).text, /https:\/\/banco\/pro/);
  assert.equal((await billing.sendReminders({ now: until - 2.4 * day, force: true })).length, 0, 'não repete');
  assert.equal((await billing.sendReminders({ now: until - 0.5 * day, force: true })).length, 1);
  assert.match(whats.at(-1).text, /vence em 1 dia/);
  assert.equal((await billing.sendReminders({ now: until + 3600000, force: true })).length, 1);
  assert.match(whats.at(-1).text, /venceu/);
  assert.equal((await billing.sendReminders({ now: until + 4 * day, force: true })).length, 0, 'venceu faz tempo: para');
});

test('lembretes não saem de madrugada', async () => {
  const until = Date.parse(billing.billingStatus(u).plan.until);
  const d = new Date(until - 2.5 * 86400000);
  d.setUTCHours(6, 0, 0, 0); // 3h em Brasília
  assert.equal((await billing.sendReminders({ now: d.getTime() })).length, 0);
});

test('admin libera plano direto pelo e-mail (pagamento fora do site)', async () => {
  const v = store.createUser({ email: 'outro@example.com', password: 'senha12345', name: 'Outro' });
  const r = await billing.adminGrant({ email: 'outro@example.com', kind: 'plan', itemId: 'basico' }, admin);
  assert.ok(r.until);
  assert.equal(billing.billingStatus(v).plan.id, 'basico');
  await assert.rejects(billing.adminGrant({ email: 'naoexiste@example.com', itemId: 'pro' }, admin), /nenhuma conta/);
});
