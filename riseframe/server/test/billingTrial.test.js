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
  assert.deepEqual(st.features.sort(), ['ai', 'captionStyle', 'clips', 'image']);
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
  assert.deepEqual(billing.allowedFeatures(user), config.billing.freeFeatures, 'sem teste e sem plano: recursos básicos');
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
