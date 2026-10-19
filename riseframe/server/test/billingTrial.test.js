import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-trial-'));
const { config } = await import('../src/config.js');
const billing = await import('../src/auth/billing.js');
config.billing.adminEmails = [];
config.billing.mode = 'on';

const user = { id: 'trial-user', email: 'novo@example.com' };

test('conta nova: 3 edições grátis com todos os recursos', () => {
  const st = billing.billingStatus(user);
  assert.equal(st.freeEdits, 3);
  assert.equal(st.credits, 0, 'sem créditos avulsos: o teste são as edições grátis');
  assert.deepEqual(st.features.sort(), ['ai', 'captionStyle', 'clips', 'hd', 'image']);
  assert.equal(billing.trialCovers(user, 'auto'), true);
  assert.equal(billing.trialCovers(user, 'clips'), true);
});

test('cada vídeo gasta 1 edição; renders da timeline do mesmo vídeo são grátis', () => {
  assert.equal(billing.useFreeEdit(user.id, 'job-a'), 2);
  assert.equal(billing.trialCovers(user, 'render', 'job-a'), true, 'render do vídeo de teste');
  assert.equal(billing.trialCovers(user, 'render', 'outro-job'), false);
  assert.equal(billing.useFreeEdit(user.id, 'job-b'), 1);
  assert.equal(billing.useFreeEdit(user.id, 'job-c'), 0);
  assert.equal(billing.trialCovers(user, 'auto'), false, 'acabaram as edições grátis');
  assert.equal(billing.trialCovers(user, 'render', 'job-c'), true, 'o último vídeo de teste ainda renderiza grátis');
  // Os vídeos de teste continuam com tudo liberado por uns dias (terminar a edição)…
  assert.deepEqual([...billing.allowedFeatures(user)].sort(), ['ai', 'captionStyle', 'clips', 'hd', 'image'], 'último vídeo de teste: tudo liberado');
  assert.equal(billing.billingStatus(user).trialActive, true);
  assert.equal(billing.appAccess(user), false, 'vídeo novo no app já pede o plano');
  // …e depois disso, sem plano: recursos básicos.
  const db = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'billing.json'), 'utf8'));
  assert.ok(db.users[user.id].trialUsedAt, 'guarda quando usou a última edição grátis');
  const grace = config.billing.trialGraceDays;
  config.billing.trialGraceDays = 0; // passaram os dias para terminar os vídeos de teste
  try {
    assert.deepEqual(billing.allowedFeatures(user), config.billing.freeFeatures, 'sem teste e sem plano: recursos básicos');
    assert.equal(billing.billingStatus(user).trialActive, false);
  } finally {
    config.billing.trialGraceDays = grace;
  }
});

test('processamento que falha devolve a edição grátis', () => {
  billing.refundFreeEdit(user.id, 'job-c');
  assert.equal(billing.billingStatus(user).freeEdits, 1);
  assert.equal(billing.trialCovers(user, 'render', 'job-c'), false);
});

test('admin (ilimitado) não gasta edições grátis', () => {
  config.billing.adminEmails = ['admin@example.com'];
  assert.equal(billing.trialCovers({ id: 'adm', email: 'admin@example.com' }, 'auto'), false);
  assert.equal(billing.billingStatus({ id: 'adm', email: 'admin@example.com' }).freeEdits, 0);
});

test('UNLIMITED_EMAILS: uso ilimitado sem virar admin', () => {
  const socio = { id: 'socio-1', email: 'Socio@Example.com' };
  config.billing.unlimitedEmails = ['socio@example.com'];
  try {
    const st = billing.billingStatus(socio);
    assert.equal(st.unlimited, true);
    assert.equal(st.admin, false, 'não vê painel de pagamentos nem configurações');
    assert.deepEqual(billing.allowedFeatures(socio).sort(), ['ai', 'captionStyle', 'clips', 'hd', 'image']);
    assert.ok(billing.canAfford(socio, 999999), 'nunca falta saldo');
    assert.deepEqual(billing.charge(socio, 500), { total: 0, monthly: 0, extra: 0 }, 'não gasta créditos');
    assert.equal(billing.trialCovers(socio, 'auto'), false, 'não gasta edições grátis');
    // fora da lista: conta comum
    assert.equal(billing.billingStatus({ id: 'outro', email: 'outro@example.com' }).unlimited, false);
  } finally {
    config.billing.unlimitedEmails = [];
  }
});
