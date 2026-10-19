import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { crc16, pixBrCode, normalizePixKey, pixTxid } from '../../shared/pixBrCode.js';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-pixqr-'));
const { config } = await import('../src/config.js');
const billing = await import('../src/auth/billing.js');
const store = await import('../src/auth/store.js');

test('BR Code do Pix: CRC do exemplo oficial do Banco Central e campos', () => {
  // Exemplo do Manual do BR Code (BCB): o CRC tem que dar 1D3D.
  const ex = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
  assert.equal(crc16(ex), '1D3D');
  const code = pixBrCode({ key: 'contato@riseframe.com.br', name: 'Riseframe Ltda', city: 'São Paulo', amountCents: 2990, txid: 'RF-PRO-123' });
  assert.match(code, /^000201/);
  assert.match(code, /0014br\.gov\.bcb\.pix0124contato@riseframe\.com\.br/);
  assert.match(code, /540529\.90/, 'valor 29.90');
  assert.match(code, /5914RISEFRAME LTDA/);
  assert.match(code, /6009SAO PAULO/, 'cidade sem acento');
  assert.match(code, /62120508RFPRO123/, 'identificador só letras e números');
  assert.equal(code.slice(-4), crc16(code.slice(0, -4)), 'CRC confere');
  assert.equal(normalizePixKey('+55 (11) 97421-6693'), '+5511974216693');
  assert.equal(normalizePixKey('123.456.789-09'), '12345678909');
  assert.equal(pixTxid(''), '***');
});

test('Pix pelo site: cobrança com o valor do plano e tabela de clientes com o prazo', () => {
  config.billing.mode = 'on';
  config.billing.payment = 'pix-links';
  config.billing.adminEmails = [];
  config.billing.pix = { key: 'contato@riseframe.com.br', name: 'Riseframe', city: 'Sao Paulo' };
  const u = store.createUser({ email: 'cliente@exemplo.com', password: 'senha12345', name: 'Cliente Teste' });
  assert.equal(billing.billingStatus(u).pixQr, true);
  const plan = config.billing.plans.find((p) => p.id === 'pro');
  const c = billing.pixCharge(u, 'plan', 'pro');
  assert.equal(c.amountCents, plan.priceCents);
  assert.equal(c.txid, billing.txidFor(u, 'pro'));
  assert.ok(c.brCode.includes(`54${String((plan.priceCents / 100).toFixed(2).length).padStart(2, '0')}${(plan.priceCents / 100).toFixed(2)}`));
  assert.throws(() => billing.pixCharge(u, 'plan', 'nao-existe'), /inválido/);

  // tabela: conta nova em teste; com plano liberado mostra vencimento e dias restantes
  let row = billing.customersTable().find((r) => r.email === 'cliente@exemplo.com');
  assert.equal(row.status, 'teste grátis');
  return billing.adminGrant({ email: 'cliente@exemplo.com', kind: 'plan', itemId: 'pro' }).then(() => {
    row = billing.customersTable().find((r) => r.email === 'cliente@exemplo.com');
    assert.equal(row.status, 'ativo');
    assert.equal(row.plan.name, plan.name);
    assert.equal(row.daysLeft, config.billing.periodDays);
  });
});
