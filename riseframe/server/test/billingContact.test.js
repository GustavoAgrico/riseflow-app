import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-contact-'));
const { config } = await import('../src/config.js');
const store = await import('../src/auth/store.js');
const billing = await import('../src/auth/billing.js');
const contact = await import('../src/auth/contact.js');

// DNS falso: "semmx.com.br" não existe; "nullmx.com" declara que não recebe e-mail.
contact.__setDnsResolver({
  mx: async (d) => {
    if (d === 'nullmx.com') return [{ exchange: '', priority: 0 }];
    if (d === 'semmx.com.br') throw Object.assign(new Error('x'), { code: 'ENOTFOUND' });
    if (d === 'lento.com') throw Object.assign(new Error('x'), { code: 'ETIMEOUT' });
    return [{ exchange: `mx.${d}`, priority: 10 }];
  },
  a: async () => {
    throw Object.assign(new Error('x'), { code: 'ENOTFOUND' });
  },
});

config.billing.payment = 'pix-links';
config.billing.pixLinks = { basico: 'https://banco/basico', pro: 'https://banco/pro', premium: 'https://banco/premium' };
config.billing.adminEmails = ['dono@riseframe.test'];
config.billing.whatsapp = { url: '', key: '', sessionUserId: '' };
// E-mail pelo Resend (falso): guarda o que seria enviado.
config.auth.resendKey = 're_teste';
config.auth.emailFrom = 'Riseframe <nao-responda@riseframe.test>';
const mails = [];
globalThis.fetch = async (url, init) => {
  if (String(url) === 'https://api.resend.com/emails') {
    assert.equal(init.headers.Authorization, 'Bearer re_teste');
    mails.push(JSON.parse(init.body));
    return new Response('{"id":"x"}', { status: 200 });
  }
  return new Response('{}', { status: 404 });
};

test('e-mail: formato, erro de digitação, descartável e domínio que não recebe', async () => {
  assert.equal((await contact.checkEmail('ana@gmail.com')).ok, true);
  assert.equal((await contact.checkEmail('ana@lento.com')).ok, true, 'DNS sem resposta não bloqueia');
  assert.match((await contact.checkEmail('ana')).error, /inválido/);
  const typo = await contact.checkEmail('Ana@Gmial.com');
  assert.equal(typo.ok, false);
  assert.equal(typo.suggestion, 'ana@gmail.com');
  assert.match((await contact.checkEmail('x@mailinator.com')).error, /temporários/);
  assert.match((await contact.checkEmail('x@semmx.com.br')).error, /não recebe e-mails/);
  assert.match((await contact.checkEmail('x@nullmx.com')).error, /não recebe e-mails/);
});

test('WhatsApp: só celular brasileiro real (DDD existente, 9 na frente, sem número repetido)', () => {
  assert.deepEqual(contact.checkPhone('(11) 98765-4321'), { ok: true, phone: '5511987654321' });
  assert.equal(contact.checkPhone('+55 21 99876-5432').phone, '5521998765432');
  assert.match(contact.checkPhone('1198765432').error, /DDD \+ 9 dígitos/);
  assert.match(contact.checkPhone('(20) 98765-4321').error, /DDD 20 não existe/);
  assert.match(contact.checkPhone('(11) 38765-4321').error, /celular/);
  assert.match(contact.checkPhone('(11) 99999-9999').error, /não parece real/);
  assert.match(contact.checkPhone('(11) 91234-5678').error, /não parece real/);
  assert.equal(contact.formatPhone('5511987654321'), '(11) 98765-4321');
});

test('pagamento só com dados reais: nome completo, e-mail confirmado por código e WhatsApp válido', async () => {
  const u = store.createUser({ email: 'conta@gmail.com', password: 'senha12345', name: 'Cli' });
  const dados = { kind: 'plan', itemId: 'pro', name: 'Maria Souza', email: 'maria@gmail.com', phone: '(11) 98765-4321' };

  const bad = await billing.checkContact(u, { name: 'Maria', email: 'maria@gmial.com', phone: '123' });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['email', 'name', 'phone']);

  const st0 = billing.billingStatus(u);
  assert.equal(st0.emailCodeRequired, true);
  assert.equal(st0.contactEmail, 'conta@gmail.com');

  let chk = await billing.checkContact(u, dados);
  assert.equal(chk.ok, true);
  assert.equal(chk.emailCodeRequired, true, 'precisa confirmar o e-mail');
  await assert.rejects(billing.createPixClaim(u, dados), /confirme seu e-mail/);

  await billing.sendContactCode(u, 'maria@gmail.com');
  const sent = mails.at(-1);
  assert.deepEqual(sent.to, ['maria@gmail.com']);
  assert.equal(sent.from, 'Riseframe <nao-responda@riseframe.test>');
  const code = sent.subject.match(/^(\d{6}) /)[1];
  await assert.rejects(billing.sendContactCode(u, 'maria@gmail.com'), /aguarde/);
  assert.throws(() => billing.verifyContactCode(u, 'maria@gmail.com', code === '000000' ? '111111' : '000000'), /código incorreto/);
  const st = billing.verifyContactCode(u, 'maria@gmail.com', code);
  assert.equal(st.emailVerified, true);
  assert.equal(st.contactEmail, 'maria@gmail.com');

  chk = await billing.checkContact(u, dados);
  assert.equal(chk.emailCodeRequired, false);
  assert.equal(chk.phoneLabel, '(11) 98765-4321');

  mails.length = 0;
  const claim = await billing.createPixClaim(u, dados);
  assert.equal(claim.contactEmail, 'maria@gmail.com');
  assert.equal(claim.phone, '5511987654321');
  // O dono recebe o aviso do Pix por e-mail, com os dados do cliente.
  await new Promise((r) => setTimeout(r, 20));
  const aviso = mails.find((m) => m.to[0] === 'dono@riseframe.test');
  assert.ok(aviso, 'admin recebeu e-mail');
  assert.match(aviso.subject, /Pix a confirmar: plano Pro/);
  assert.match(aviso.html, /maria@gmail\.com \(conta conta@gmail\.com\) · WhatsApp \(11\) 98765-4321/);
});

test('sem domínio próprio no Resend: só avisa o dono e não exige código do cliente', async () => {
  config.auth.emailFrom = '';
  const u = store.createUser({ email: 'outro@gmail.com', password: 'senha12345', name: 'Outro' });
  const chk = await billing.checkContact(u, { name: 'João Lima', email: 'outro@gmail.com', phone: '21998765432' });
  assert.equal(chk.ok, true);
  assert.equal(chk.emailCodeRequired, false);
  mails.length = 0;
  await billing.createPixClaim(u, { kind: 'plan', itemId: 'basico', name: 'João Lima', email: 'outro@gmail.com', phone: '21998765432' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(mails[0].from, 'Riseframe <onboarding@resend.dev>');
  assert.deepEqual(mails[0].to, ['dono@riseframe.test']);
});

test('admin confirma o Pix pelo botão do e-mail (abrir o link sozinho não libera nada)', async () => {
  config.auth.appUrl = 'https://riseframe.test';
  const express = (await import('express')).default;
  const { billingRouter } = await import('../src/routes/billing.js');
  const app = express();
  app.use(express.json());
  app.use('/api', billingRouter);
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const fakeFetch = globalThis.fetch; // Resend falso
  try {
    const u = store.createUser({ email: 'pix@gmail.com', password: 'senha12345', name: 'Pix' });
    mails.length = 0;
    const claim = await billing.createPixClaim(u, { kind: 'plan', itemId: 'premium', name: 'Ana Lima', email: 'pix@gmail.com', phone: '31998765432' });
    await new Promise((r) => setTimeout(r, 30));
    const aviso = mails.find((m) => m.to[0] === 'dono@riseframe.test');
    const link = aviso.html.match(/href="(https:\/\/riseframe\.test\/api\/billing\/pix\/email-action\?t=[^"]+)"/)[1].replace(/&amp;/g, '&');
    assert.match(aviso.html, /Confirmar pagamento/);
    // O admin vê no painel que o aviso saiu.
    assert.equal(billing.listClaims().pending.find((c) => c.id === claim.id).notice.email[0].ok, true);

    // GET pelo http do Node para falar com o servidor local do teste (o fetch está falso).
    const { request } = await import('node:http');
    const fetch = (url) =>
      new Promise((resolve, reject) => {
        const req = request(url, (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => resolve({ status: res.statusCode, text: async () => body }));
        });
        req.on('error', reject);
        req.end();
      });
    const local = link.replace('https://riseframe.test', base);
    const page = await fetch(local);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Pix a confirmar[\s\S]*Ana Lima[\s\S]*R\$\s?247,90[\s\S]*Confirmar pagamento/);
    assert.equal(billing.billingStatus(u).plan, null, 'só abrir o link não libera');

    const bad = await fetch(`${base}/api/billing/pix/email-action?t=abc.def`);
    assert.equal(bad.status, 400);

    const t = new URL(local).searchParams.get('t');
    const done = await new Promise((resolve) => {
      const body = `t=${encodeURIComponent(t)}&action=approve`;
      const req = request(`${base}/api/billing/pix/email-action`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
        let out = '';
        res.on('data', (d) => (out += d));
        res.on('end', () => resolve({ status: res.statusCode, body: out }));
      });
      req.end(body);
    });
    assert.equal(done.status, 200);
    assert.match(done.body, /Pagamento confirmado!/);
    assert.equal(billing.billingStatus(u).plan.id, 'premium');
    assert.ok(mails.some((m) => m.to[0] === 'pix@gmail.com' && /Plano Premium ativo/.test(m.subject)), 'cliente avisado');
  } finally {
    globalThis.fetch = fakeFetch;
    srv.close();
  }
});
