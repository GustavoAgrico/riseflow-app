import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-soundza-'));
const { config } = await import('../src/config.js');
const { okSfxUrl, isSoundza, fromSoundza, searchSoundza, knownSoundza, soundzaSync } = await import('../src/pipeline/sfxOnline.js');
const billing = await import('../src/auth/billing.js');
const store = await import('../src/auth/store.js');

const json = (body, status = 200) => ({ ok: status < 400, status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });

test('referência soundza:<id> é aceita; nada de endereço solto', () => {
  assert.ok(okSfxUrl('soundza:abc_123-X'));
  assert.ok(isSoundza('soundza:abc'));
  assert.ok(!okSfxUrl('soundza:'));
  assert.ok(!okSfxUrl('soundza:../../etc/passwd'));
  assert.ok(!okSfxUrl('soundza:a b'));
  assert.ok(!isSoundza('https://api.soundza.com/v1/sounds/1/file'));
});

test('resultado do Soundza vira item da biblioteca (sem expor links)', () => {
  const it = fromSoundza({ id: 'snd_9', title: 'Whoosh Fast.wav', duration_seconds: 1.234, sync_ms: 180, tags: ['whoosh', { name: 'air' }], listen_url: 'https://cdn.soundza.com/p/9.mp3', download_url: 'https://api.soundza.com/v1/sounds/snd_9/file' }, 'srch_1');
  assert.equal(it.preview, 'soundza:snd_9');
  assert.equal(it.name, 'Whoosh Fast');
  assert.equal(it.dur, 1.23);
  assert.equal(it.sync, 0.18);
  assert.equal(it.src, 'soundza');
  assert.equal(it.premium, true);
  assert.deepEqual(it.tags, ['whoosh', 'air']);
  assert.equal(it._meta.searchId, 'srch_1');
  assert.equal(fromSoundza({ id: 'x', duration: 95 }), null, 'longo demais');
  assert.equal(fromSoundza({ title: 'sem id' }), null);
  assert.equal(fromSoundza({ id: 'y', listen_url: 'http://inseguro/a.mp3' })._meta.listen, '', 'só https');
});

test('busca manda a chave no cabeçalho, só efeitos curtos, e lembra dos sons', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-sz-cache-'));
  let seen = null;
  const fetchImpl = async (u, opts) => {
    seen = { u: new URL(u), auth: opts.headers.Authorization };
    return json({ search_id: 's1', sounds: [{ id: 'a1', title: 'Pop', duration: 0.4, sync_ms: 20, listen_url: 'https://cdn.soundza.com/a1.mp3' }, { id: 'a2', title: 'Long', duration: 60 }] });
  };
  const list = await searchSoundza('dinheiro', { key: 'sz_test', fetchImpl, cacheDir });
  assert.equal(seen.auth, 'Bearer sz_test');
  assert.equal(seen.u.searchParams.get('q'), 'cash register');
  assert.equal(seen.u.searchParams.get('type'), 'sound_effect');
  assert.equal(seen.u.searchParams.get('max_duration'), '20');
  assert.equal(list.length, 1);
  assert.equal(list[0].preview, 'soundza:a1');
  assert.equal('_meta' in list[0], false, 'links e search_id ficam no servidor');
  assert.ok(await knownSoundza('soundza:a1', cacheDir));
  assert.equal(await knownSoundza('soundza:zzz', cacheDir), false, 'prévia só de som que apareceu numa busca');
  assert.equal(await soundzaSync('soundza:a1', cacheDir), 0.02);
  await assert.rejects(searchSoundza('x', { key: '', fetchImpl }), /SOUNDZA_API_KEY/);
  await assert.rejects(searchSoundza('chave ruim', { key: 'k', fetchImpl: async () => json({}, 401) }), /chave do Soundza/);
});

test('Premium: só com plano ativo (o teste grátis não libera)', async () => {
  config.billing.adminEmails = [];
  config.billing.unlimitedEmails = [];
  config.billing.mode = 'on';
  const free = { id: 'u-free', email: 'free@example.com' };
  assert.equal(billing.premiumAccess(free), false);
  assert.equal(billing.billingStatus(free).premium, false);
  // com plano mensal ativo: Premium
  const pro = store.createUser({ email: 'pro@example.com', password: 'senha12345', name: 'Pro' });
  assert.equal(billing.premiumAccess(pro), false);
  await billing.adminGrant({ email: 'pro@example.com', kind: 'plan', itemId: config.billing.plans[0].id }, { email: 'adm@example.com' });
  assert.equal(billing.premiumAccess(pro), true);
  assert.equal(billing.billingStatus(pro).premium, true);
  assert.equal(billing.premiumAccess(null), false);
  config.billing.adminEmails = ['dono@example.com'];
  assert.equal(billing.premiumAccess({ id: 'adm', email: 'dono@example.com' }), true, 'admin é Premium');
});
