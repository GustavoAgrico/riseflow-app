import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupWithLLM } from '../src/pipeline/cleanupLLM.js';

/** Transcrição longa (1300 palavras = 3 blocos), com "hum" de muleta em cada bloco. */
function longTalk() {
  const words = [];
  for (let i = 0; i < 1300; i++) words.push({ start: i * 0.3, end: i * 0.3 + 0.25, word: i % 100 === 50 ? 'hum' : `p${i}` });
  return { segments: [{ start: 0, end: 400, words }] };
}

test('limpeza por IA: um bloco que falha não joga fora os outros', async () => {
  const real = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async (_url, init) => {
    call++;
    if (call === 1) return new Response('erro', { status: 500 });
    const nums = [...JSON.parse(init.body).messages[1].content.matchAll(/(\d+):hum(?=\s|$)/g)].map((m) => Number(m[1]));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ remove: nums }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const r = await cleanupWithLLM(longTalk(), { groqKey: 'x' });
    assert.equal(call, 3);
    const removed = r.segments[0].words.filter((w) => w.removed).map((w) => w.start);
    assert.ok(removed.length >= 6, `blocos 2 e 3 valeram (${removed.length})`);
    assert.ok(removed.every((t) => t >= 600 * 0.3 - 1), 'o bloco que falhou não marcou nada');
  } finally {
    globalThis.fetch = real;
  }
});

test('app de PC sem chave: a correção da fala vai pela conta do site (só o texto)', async () => {
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url, auth: init.headers.authorization });
    const nums = [...JSON.parse(init.body).text.matchAll(/(\d+):hum(?=\s|$)/g)].map((m) => Number(m[1]));
    return new Response(JSON.stringify({ text: JSON.stringify({ remove: nums }) }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const r = await cleanupWithLLM(longTalk(), { remoteServer: 'https://site.exemplo', remoteToken: 'tok' });
    assert.equal(r.llm, 'nuvem');
    assert.equal(seen[0].url, 'https://site.exemplo/api/cleanup/remote');
    assert.equal(seen[0].auth, 'Bearer tok');
    assert.equal(r.segments[0].words.filter((w) => w.removed).length, 13);
  } finally {
    globalThis.fetch = real;
  }
});
