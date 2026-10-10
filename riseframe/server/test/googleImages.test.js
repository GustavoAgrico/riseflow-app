import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleImageCandidates, googleReady, resolveSource } from '../src/pipeline/broll.js';

function mockFetch(handler) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } });

test('"Google Imagens" liga com Serper ou Brave (a API do Google fechou para contas novas)', () => {
  assert.equal(googleReady({}), false);
  assert.equal(googleReady({ key: 'k' }), false, 'CSE precisa de chave + cx');
  assert.equal(googleReady({ serperKey: 's' }), true);
  assert.equal(googleReady({ braveKey: 'b' }), true);
  assert.equal(resolveSource('google', { googleReady: true }), 'google');
  assert.equal(resolveSource('google', { googleReady: false }), 'mix');
});

test('Serper: resultados do Google Imagens em pt-BR, só fotos https grandes', async () => {
  const m = mockFetch((url, init) => {
    assert.equal(url, 'https://google.serper.dev/images');
    assert.equal(init.headers['X-API-KEY'], 'serper-key');
    const body = JSON.parse(init.body);
    assert.equal(body.q, 'gestor em reunião com a equipe');
    assert.equal(body.gl, 'br');
    return json({ images: [
      { imageUrl: 'https://site.com/reuniao.jpg', imageWidth: 1600, thumbnailUrl: 'https://tbn.gstatic.com/a', domain: 'site.com' },
      { imageUrl: 'http://inseguro.com/x.jpg', imageWidth: 1600 },
      { imageUrl: 'https://site.com/icone.svg', imageWidth: 1600 },
      { imageUrl: 'https://site.com/mini.jpg', imageWidth: 200 },
    ] });
  });
  try {
    const out = await googleImageCandidates('gestor em reunião com a equipe', { serperKey: 'serper-key' }, 6);
    assert.deepEqual(out.map((c) => c.link), ['https://site.com/reuniao.jpg']);
    assert.equal(out[0].thumb, 'https://tbn.gstatic.com/a');
    assert.equal(out[0].source, 'google');
    assert.equal(out[0].kind, 'image');
  } finally {
    m.restore();
  }
});

test('Brave Search como alternativa (e quando o Serper falha)', async () => {
  const m = mockFetch((url, init) => {
    if (url.startsWith('https://google.serper.dev')) return new Response('sem créditos', { status: 403 });
    assert.match(url, /^https:\/\/api\.search\.brave\.com\/res\/v1\/images\/search\?/);
    assert.equal(init.headers['X-Subscription-Token'], 'brave-key');
    assert.match(url, /country=BR/);
    return json({ results: [{ properties: { url: 'https://foto.com/equipe.jpg' }, thumbnail: { src: 'https://imgs.search.brave.com/t' }, source: 'foto.com' }] });
  });
  try {
    const out = await googleImageCandidates('equipe', { serperKey: 's', braveKey: 'brave-key' }, 6);
    assert.deepEqual(out.map((c) => c.link), ['https://foto.com/equipe.jpg']);
    assert.equal(m.calls.length, 2, 'tentou o Serper e depois o Brave');
  } finally {
    m.restore();
  }
});
