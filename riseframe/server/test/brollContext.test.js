import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-ctx-'));
const { config } = await import('../src/config.js');
const { analyze } = await import('../src/pipeline/analyze.js');
const { compactTranscript } = await import('../src/pipeline/analyzeLLM.js');

// Vídeo longo (17 min): 600 segmentos
const transcript = {
  text: '',
  segments: Array.from({ length: 600 }, (_, i) => ({ start: i * 1.7, end: i * 1.7 + 1.6, text: `trecho ${i} sobre cobrar metas da equipe` })),
};

test('vídeo longo: a IA recebe o vídeo inteiro (não só o começo)', () => {
  const c = compactTranscript(transcript);
  const lines = c.split('\n');
  assert.ok(lines.length <= 120);
  assert.match(lines[0], /^\[0\.0s\] trecho 0 /);
  assert.match(c, /trecho 599 /, 'o fim do vídeo também vai');
});

test('sem Anthropic/OpenAI, a chave da Groq faz o B-roll entender o assunto', async () => {
  config.analyze.anthropicKey = '';
  config.analyze.provider = 'heuristic';
  config.analyze.groqKey = 'gsk_teste';
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      topic: 'como cobrar resultados da equipe',
      niche: 'liderança',
      themes: ['metas', 'equipe'],
      brollMoments: [
        { start: 120, end: 123, query: 'manager reviewing goals with team in meeting' },
        { start: 800, end: 803, query: 'leader giving feedback to employee office' },
      ],
    }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const r = await analyze(transcript, { duration: 1020 }, { broll: true, brollMax: 6 });
    assert.equal(r.provider, 'groq');
    assert.equal(r.topic, 'como cobrar resultados da equipe');
    assert.deepEqual(r.brollMoments.map((m) => m.query), ['manager reviewing goals with team in meeting', 'leader giving feedback to employee office']);
    assert.match(calls[0].url, /api\.groq\.com/);
    assert.match(calls[0].body.messages[0].content, /ASSUNTO CENTRAL/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Groq fora do ar: cai para a heurística sem travar', async () => {
  config.analyze.groqKey = 'gsk_teste';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('erro', { status: 500 });
  try {
    const r = await analyze(transcript, { duration: 1020 }, { broll: true, brollMax: 6 });
    assert.equal(r.provider, 'heuristic');
  } finally {
    globalThis.fetch = realFetch;
  }
});
