import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pixabayCandidates, wikimediaCandidates, nasaCandidates, brollCandidates, resolveSource, extOf } from '../src/pipeline/broll.js';

const json = (d) => ({ ok: true, json: async () => d });
async function withFetch(fn, body) {
  const real = globalThis.fetch;
  globalThis.fetch = fn;
  try { await body(); } finally { globalThis.fetch = real; }
}

test('Pixabay: vídeos (tamanho próximo do alvo) e fotos, com crédito', async () => {
  await withFetch(async (url) => {
    const u = String(url);
    if (u.includes('/api/videos/')) {
      return json({ hits: [{ id: 7, user: 'ana', videos: {
        tiny: { url: 'https://cdn/t.mp4', width: 640, height: 360, thumbnail: 'https://cdn/t.jpg' },
        medium: { url: 'https://cdn/m.mp4', width: 1920, height: 1080, thumbnail: 'https://cdn/m.jpg' },
      } }] });
    }
    if (u.includes('pixabay.com/api/?')) {
      assert.match(u, /orientation=vertical/);
      return json({ hits: [{ id: 9, user: 'bia', largeImageURL: 'https://cdn/big.jpg', webformatURL: 'https://cdn/web.jpg' }] });
    }
    return { ok: false };
  }, async () => {
    const c = await pixabayCandidates('coffee', { key: 'k', orientation: 'portrait', targetH: 1280 });
    assert.deepEqual(c.map((x) => [x.kind, x.link]), [['video', 'https://cdn/m.mp4'], ['image', 'https://cdn/big.jpg']]);
    assert.equal(c[0].thumb, 'https://cdn/m.jpg');
    assert.match(c[0].credit, /Pixabay · ana/);
    assert.deepEqual(await pixabayCandidates('x', {}), [], 'sem chave não busca');
  });
});

test('Wikimedia Commons: só licenças livres para uso comercial, sem imagens pequenas', async () => {
  await withFetch(async (url) => {
    assert.match(String(url), /commons\.wikimedia\.org/);
    const ii = (o) => [{ url: o.url, thumburl: `${o.url}.thumb.jpg`, mime: o.mime, width: o.w ?? 2000, extmetadata: { LicenseShortName: { value: o.lic }, Artist: { value: '<a>Fulano</a>' } } }];
    return json({ query: { pages: [
      { pageid: 1, index: 1, imageinfo: ii({ url: 'https://up/a.jpg', mime: 'image/jpeg', lic: 'CC BY-SA 4.0' }) },
      { pageid: 2, index: 2, imageinfo: ii({ url: 'https://up/b.jpg', mime: 'image/jpeg', lic: 'CC BY-NC 2.0' }) },
      { pageid: 3, index: 3, imageinfo: ii({ url: 'https://up/c.svg', mime: 'image/svg+xml', lic: 'CC0' }) },
      { pageid: 4, index: 4, imageinfo: ii({ url: 'https://up/d.jpg', mime: 'image/jpeg', lic: 'Public domain', w: 300 }) },
      { pageid: 5, index: 5, imageinfo: ii({ url: 'https://up/e.png', mime: 'image/png', lic: 'Public domain' }) },
    ] } });
  }, async () => {
    const c = await wikimediaCandidates('market', { kind: 'image', limit: 6 });
    assert.deepEqual(c.map((x) => x.link), ['https://up/a.jpg', 'https://up/e.png']);
    assert.match(c[0].credit, /CC BY-SA 4\.0 · Fulano · Wikimedia Commons/);
  });
});

test('NASA: imagem em tamanho grande e vídeo pelo manifesto (mp4)', async () => {
  await withFetch(async (url) => {
    const u = String(url);
    if (u.includes('/search?')) {
      return json({ collection: { items: [
        { href: 'https://images-assets.nasa.gov/image/a/collection.json', data: [{ nasa_id: 'a', media_type: 'image' }], links: [{ href: 'https://images-assets.nasa.gov/image/a/a~thumb.jpg', render: 'image' }] },
        { href: 'https://images-assets.nasa.gov/video/v/collection.json', data: [{ nasa_id: 'v', media_type: 'video' }], links: [{ href: 'https://images-assets.nasa.gov/video/v/v~thumb.jpg', render: 'image' }] },
      ] } });
    }
    if (u.includes('/video/v/collection.json')) return json(['http://images-assets.nasa.gov/video/v/v~orig.mp4', 'http://images-assets.nasa.gov/video/v/v~mobile.mp4']);
    return { ok: false };
  }, async () => {
    const c = await nasaCandidates('rocket', { limit: 4 });
    assert.deepEqual(c.map((x) => [x.kind, x.link]), [
      ['image', 'https://images-assets.nasa.gov/image/a/a~large.jpg'],
      ['video', 'https://images-assets.nasa.gov/video/v/v~mobile.mp4'],
    ]);
  });
});

test("'mix' junta Pixabay e Wikimedia aos demais; fonte indisponível cai para a mistura", async () => {
  await withFetch(async (url) => {
    const u = String(url);
    if (u.includes('/api/videos/')) return json({ hits: [{ id: 1, videos: { medium: { url: 'https://p/1.mp4', height: 1080, thumbnail: 't' } } }] });
    if (u.includes('pixabay.com/api/?')) return json({ hits: [] });
    if (u.includes('api.openverse.org')) return json({ results: [{ id: 1, url: 'https://o/1.jpg', thumbnail: 'ot' }] });
    if (u.includes('commons.wikimedia.org')) return json({ query: { pages: [{ pageid: 9, imageinfo: [{ url: 'https://w/9.jpg', mime: 'image/jpeg', width: 2000, extmetadata: { LicenseShortName: { value: 'CC0' } } }] }] } });
    return { ok: false, json: async () => ({}) };
  }, async () => {
    const c = await brollCandidates('trabalho', { source: 'mix', pixabayKey: 'k', google: {}, limit: 6 });
    const srcs = new Set(c.map((x) => x.source));
    assert.ok(srcs.has('pixabay') && srcs.has('openverse') && srcs.has('wikimedia'), [...srcs].join(','));
    assert.equal(c[0].source, 'pixabay', 'vídeo primeiro');
  });
  assert.equal(resolveSource('pexels', {}), 'mix');
  assert.equal(resolveSource('pixabay', { pixabayKey: 'k' }), 'pixabay');
  assert.equal(resolveSource('wikimedia', {}), 'wikimedia');
  assert.equal(resolveSource('youtube', {}), 'mix');
  assert.equal(extOf('https://x/a.webm', false), 'webm');
  assert.equal(extOf('https://x/a.png?x=1', true), 'png');
  assert.equal(extOf('https://x/video', false), 'mp4');
});
