import { test } from 'node:test';
import assert from 'node:assert/strict';

test('transcribeErrorMessage: explica chave recusada, saldo, rede e chave ausente', async () => {
  const { transcribeErrorMessage } = await import('../src/pipeline/transcribe/index.js');
  assert.match(transcribeErrorMessage('deepgram', new Error('Deepgram 401: INVALID_AUTH')), /chave da Deepgram foi recusada/);
  assert.match(transcribeErrorMessage('deepgram', new Error('Deepgram 402: sem saldo')), /sem saldo/);
  assert.match(transcribeErrorMessage('deepgram', new Error('fetch failed')), /sem conexão/);
  assert.match(transcribeErrorMessage('deepgram', new Error('DEEPGRAM_API_KEY ausente')), /falta a chave/);
  assert.match(transcribeErrorMessage('deepgram', new Error('Deepgram 500: x')), /Tente de novo/);
});
