import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brollCandidates } from '../src/pipeline/broll.js';

test("brollCandidates('mix'): intercala vídeos do Pexels, Google e Creative Commons", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    const json = (d) => ({ ok: true, json: async () => d });
    if (u.includes('api.pexels.com/videos')) return json({ videos: [1, 2, 3].map((i) => ({ id: i, image: `v${i}.jpg`, video_files: [{ link: `v${i}.mp4`, width: 1080, height: 1920, file_type: 'video/mp4' }] })) });
    if (u.includes('api.pexels.com/v1')) return json({ photos: [] });
    if (u.includes('googleapis.com/customsearch')) return json({ items: [1, 2, 3].map((i) => ({ link: `https://g/${i}.jpg`, image: { thumbnailLink: `gt${i}` } })) });
    if (u.includes('api.openverse.org')) return json({ results: [1, 2, 3].map((i) => ({ id: i, url: `https://o/${i}.jpg`, thumbnail: `ot${i}` })) });
    return { ok: false, json: async () => ({}) };
  };
  try {
    const c = await brollCandidates('trabalho', { source: 'mix', apiKey: 'k', google: { key: 'k', cx: 'c' }, limit: 6 });
    assert.deepEqual(c.slice(0, 3).map((x) => x.source), ['pexels', 'google', 'openverse'], 'intercalado, vídeo primeiro');
    assert.equal(c[0].kind, 'video');
    assert.ok(c.length >= 6 && c.length <= 9, `quantidade ${c.length}`);
    // sem Pexels e sem Google: só Creative Commons
    const cc = await brollCandidates('trabalho', { source: 'mix', apiKey: '', google: {}, limit: 6 });
    assert.ok(cc.length > 0 && cc.every((x) => x.source === 'openverse'));
  } finally {
    globalThis.fetch = realFetch;
  }
});
