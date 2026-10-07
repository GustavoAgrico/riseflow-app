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

test('transcribeErrorMessage: áudio ilegível, timeout e detalhe do erro desconhecido', async () => {
  const { transcribeErrorMessage } = await import('../src/pipeline/transcribe/index.js');
  assert.match(transcribeErrorMessage('deepgram', new Error('ffmpeg (extract-audio) falhou (code 1):\nx')), /não consegui ler o áudio/);
  assert.match(transcribeErrorMessage('deepgram', new Error('Deepgram 400: {"err_msg":"Bad Request: failed to process audio: corrupt or unsupported data"}')), /não conseguiu ler o áudio/);
  assert.match(transcribeErrorMessage('deepgram', new Error('Deepgram: sem resposta em 120s')), /demorou demais/);
  assert.match(transcribeErrorMessage('deepgram', new Error('Deepgram 500: boom')), /Detalhe: Deepgram 500: boom/);
});

test('transcribe: vídeo sem áudio segue sem legendas (não falha)', async () => {
  const { transcribe } = await import('../src/pipeline/transcribe/index.js');
  const t = await transcribe('/nao/existe.mp4', '/tmp', { duration: 5, hasAudio: false });
  assert.equal(t.segments.length, 0);
  assert.equal(t.noAudio, true);
});
