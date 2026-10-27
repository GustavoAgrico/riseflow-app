import { test } from 'node:test';
import assert from 'node:assert/strict';
import { okSfxUrl, fromOpenverse, searchOpenverse, toEnglish } from '../src/pipeline/sfxOnline.js';

test('aceita os sons do Wikimedia Commons e recusa outros endereços', () => {
  assert.ok(okSfxUrl('https://upload.wikimedia.org/wikipedia/commons/4/4c/Cash_register_sound.ogg'));
  assert.ok(okSfxUrl('https://upload.wikimedia.org/wikipedia/commons/transcoded/4/4c/Cash.ogg/Cash.ogg.mp3'));
  assert.ok(!okSfxUrl('https://upload.wikimedia.org/wikipedia/commons/4/4c/Foto.jpg'));
  assert.ok(!okSfxUrl('https://upload.wikimedia.org.evil.com/wikipedia/commons/4/4c/a.ogg'));
  assert.ok(!okSfxUrl('http://upload.wikimedia.org/wikipedia/commons/4/4c/a.ogg'));
});

test('Openverse: só domínio público, curto, e prefere o mp3', () => {
  const base = { id: 'abc', title: 'Whoosh_fast.wav', duration: 1200, creator: 'fulano', source: 'freesound', tags: [{ name: 'whoosh' }] };
  const ok = fromOpenverse({ ...base, license: 'cc0', url: 'https://cdn.freesound.org/previews/1/1_2-hq.mp3' });
  assert.equal(ok.preview, 'https://cdn.freesound.org/previews/1/1_2-hq.mp3');
  assert.equal(ok.dur, 1.2);
  assert.equal(ok.name, 'Whoosh fast');
  assert.equal(ok.src, 'openverse');
  assert.equal(fromOpenverse({ ...base, license: 'by', url: 'https://cdn.freesound.org/previews/1/1_2-hq.mp3' }), null);
  assert.equal(fromOpenverse({ ...base, license: 'cc0', url: 'https://evil.com/a.mp3' }), null);
  assert.equal(fromOpenverse({ ...base, license: 'pdm', duration: 90000, url: 'https://cdn.freesound.org/previews/1/1_2-hq.mp3' }), null);
  const alt = fromOpenverse({ ...base, license: 'pdm', url: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/a.ogg', alt_files: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/4c/a.ogg/a.ogg.mp3' }] });
  assert.match(alt.preview, /\.mp3$/);
});

test('busca em português vira inglês e pede só CC0/PDM; filtro recusado → busca sem ele', async () => {
  assert.equal(toEnglish('dinheiro'), 'cash register');
  assert.equal(toEnglish('Aplausos'), 'applause');
  assert.equal(toEnglish('whoosh rápido'), 'whoosh rápido');
  const calls = [];
  const fetchImpl = async (u) => {
    calls.push(new URL(u));
    if (calls.length === 1) return { status: 400, ok: false };
    return { status: 200, ok: true, json: async () => ({ results: [{ id: 'x1', title: 'Coin', license: 'cc0', duration: 800, url: 'https://cdn.freesound.org/previews/2/2_3-hq.mp3' }, { id: 'x2', title: 'Song', license: 'by', url: 'https://cdn.freesound.org/previews/2/2_4-hq.mp3' }] }) };
  };
  const r = await searchOpenverse('moeda teste-unico', { fetchImpl });
  assert.equal(calls[0].searchParams.get('license'), 'cc0,pdm');
  assert.equal(calls[0].searchParams.get('category'), 'sound_effect');
  assert.equal(calls[0].searchParams.get('q'), 'coin teste-unico');
  assert.equal(calls[1].searchParams.get('category'), null);
  assert.deepEqual(r.map((x) => x.id), ['x1']);
  // a mesma busca vem do cache (não gasta o limite)
  await searchOpenverse('moeda teste-unico', { fetchImpl });
  assert.equal(calls.length, 2);
});
