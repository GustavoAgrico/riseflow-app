import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { rememberJobToken } from '../src/account.js';
import { askJson, llmConfig, llmAvailable } from '../src/pipeline/llm.js';
import { brollCandidates } from '../src/pipeline/broll.js';
import { translateTranscript } from '../src/pipeline/translate.js';

/** Simula o app de PC: sem chaves locais e com a conta do site. */
async function asDesktop(fn) {
  const prev = { server: config.account.server, a: config.analyze.anthropicKey, g: config.analyze.groqKey };
  const real = globalThis.fetch;
  config.account.server = 'https://site.exemplo';
  config.analyze.anthropicKey = '';
  config.analyze.groqKey = '';
  rememberJobToken('jobX', { get: () => 'Bearer tok-x' });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), auth: init?.headers?.authorization, body: init?.body ? JSON.parse(init.body) : null });
    if (String(url).endsWith('/api/remote/llm')) return new Response(JSON.stringify({ text: '{"ok":true,"lines":["Hello"]}' }), { status: 200 });
    if (String(url).endsWith('/api/remote/broll-search')) return new Response(JSON.stringify({ candidates: [{ id: 'px1', link: 'https://videos.pexels.com/x.mp4', thumb: 't', kind: 'video', source: 'pexels' }] }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = real;
    config.account.server = prev.server;
    config.analyze.anthropicKey = prev.a;
    config.analyze.groqKey = prev.g;
  }
}

test('app de PC sem chave de IA: a IA da conta responde (cortes, vídeo curto, análise)', async () => {
  await asDesktop(async (calls) => {
    const cfg = llmConfig({});
    assert.ok(llmAvailable(cfg), 'IA disponível pela conta');
    const r = await askJson('sistema', 'pergunta', cfg);
    assert.equal(r.provider, 'nuvem');
    assert.deepEqual(r.data.ok, true);
    assert.equal(calls[0].url, 'https://site.exemplo/api/remote/llm');
    assert.equal(calls[0].auth, 'Bearer tok-x');
  });
});

test('app de PC sem chaves de banco de imagens: a busca de B-roll vai pela conta', async () => {
  await asDesktop(async (calls) => {
    const c = await brollCandidates('reunião de equipe', { source: 'mix', orientation: 'portrait', limit: 6, jobId: 'jobX' });
    assert.equal(c[0].source, 'pexels');
    assert.equal(calls[0].url, 'https://site.exemplo/api/remote/broll-search');
    assert.equal(calls[0].body.query, 'reunião de equipe');
  });
});

test('app de PC sem chave da Anthropic: a tradução das legendas vai pela conta', async () => {
  await asDesktop(async (calls) => {
    const t = { segments: [{ start: 0, end: 1, words: [{ start: 0, end: 0.5, word: 'olá' }, { start: 0.5, end: 1, word: 'gente' }] }] };
    const cfg = { anthropicKey: '', remoteServer: config.account.server, remoteToken: 'tok-x' };
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url) }); return new Response(JSON.stringify({ text: '{"t":["Hello guys"]}' }), { status: 200 }); };
    try {
      const out = await translateTranscript(t, 'en', cfg);
      assert.match(out.segments.map((s) => s.words.map((w) => w.word).join(' ')).join(' '), /Hello/);
      assert.match(calls.at(-1).url, /\/api\/remote\/llm$/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
