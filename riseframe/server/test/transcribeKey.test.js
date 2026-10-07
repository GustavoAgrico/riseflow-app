import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-tkey-'));
const { config } = await import('../src/config.js');
const { runFfmpeg } = await import('../src/pipeline/ffmpeg.js');
const { transcribe, checkTranscribeKey } = await import('../src/pipeline/transcribe/index.js');

config.transcribe.provider = 'deepgram';
config.transcribe.deepgramKey = 'chave-velha';
config.transcribe.assemblyaiKey = '';
config.transcribe.openaiKey = '';
config.billing.adminEmails = ['dono@riseframe.test'];
config.auth.resendKey = 're_teste';
const mails = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u === 'https://api.resend.com/emails') { mails.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }
  if (u.startsWith('https://api.deepgram.com/')) return new Response('{"err_code":"INVALID_AUTH","err_msg":"Invalid credentials."}', { status: 401 });
  return new Response('{}', { status: 404 });
};

test('chave da Deepgram recusada: mensagem amigável ao cliente, status para o admin e aviso por e-mail', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-tkey-a-'));
  const wav = path.join(dir, 'fala.wav');
  await runFfmpeg(['-f', 'lavfi', '-i', 'sine=d=2:f=300', '-y', wav], { label: 'teste' });
  await assert.rejects(
    transcribe(wav, dir, { duration: 2, hasAudio: true }, () => {}),
    /indisponível agora\. Já avisamos o suporte/,
  );
  assert.equal(config.transcribe.keyCheck.ok, false);
  assert.match(config.transcribe.keyCheck.error, /chave da Deepgram foi recusada/);
  await new Promise((r) => setTimeout(r, 30));
  const alert = mails.find((m) => /transcrição parada/i.test(m.subject));
  assert.ok(alert, 'admin avisado');
  assert.match(alert.html, /DEEPGRAM_API_KEY/);
  // outro vídeo logo depois não manda outro e-mail (no máximo 1 a cada 6 h)
  await assert.rejects(transcribe(wav, dir, { duration: 2, hasAudio: true }, () => {}));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(mails.filter((m) => /transcrição parada/i.test(m.subject)).length, 1);
});

test('teste da chave ao ligar o servidor marca a chave recusada', async () => {
  config.transcribe.keyCheck = null;
  const r = await checkTranscribeKey();
  assert.equal(r.ok, false);
  assert.equal(config.transcribe.keyCheck.provider, 'deepgram');
});

test('Groq: palavras com tempo e pontuação; e entra sozinha quando a Deepgram recusa a chave', async () => {
  const { punctuate } = await import('../src/pipeline/transcribe/providers.js');
  assert.deepEqual(
    punctuate([{ start: 0, end: 0.4, word: 'olá' }, { start: 0.4, end: 0.9, word: 'tudo' }, { start: 0.9, end: 1.2, word: 'bem' }], 'Olá, tudo bem?').map((w) => w.word),
    ['Olá,', 'tudo', 'bem?'],
  );
  config.transcribe.groqKey = 'gsk_teste';
  let groqForm = null;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u === 'https://api.resend.com/emails') return new Response('{}', { status: 200 });
    if (u.startsWith('https://api.deepgram.com/')) return new Response('{"err_code":"INVALID_AUTH"}', { status: 401 });
    if (u === 'https://api.groq.com/openai/v1/audio/transcriptions') {
      assert.equal(init.headers.Authorization, 'Bearer gsk_teste');
      groqForm = init.body;
      return new Response(JSON.stringify({
        language: 'portuguese', text: 'Olá, tudo bem? Vamos lá.',
        words: [{ word: 'Olá', start: 0.1, end: 0.4 }, { word: 'tudo', start: 0.5, end: 0.8 }, { word: 'bem', start: 0.8, end: 1.1 }, { word: 'Vamos', start: 1.5, end: 1.8 }, { word: 'lá', start: 1.8, end: 2 }],
      }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-groq-'));
  const wav = path.join(dir, 'fala.wav');
  await runFfmpeg(['-f', 'lavfi', '-i', 'sine=d=2:f=300', '-y', wav], { label: 'teste' });
  const t = await transcribe(wav, dir, { duration: 2, hasAudio: true }, () => {});
  assert.equal(t.provider, 'groq');
  assert.equal(t.fallbackFrom, 'deepgram');
  assert.equal(t.language, 'pt');
  assert.equal(groqForm.get('model'), 'whisper-large-v3-turbo');
  assert.deepEqual(groqForm.getAll('timestamp_granularities[]'), ['word', 'segment']);
  const words = t.segments.flatMap((s) => s.words.map((w) => w.word));
  assert.deepEqual(words, ['Olá,', 'tudo', 'bem?', 'Vamos', 'lá.']);
  assert.equal(t.segments.length, 2, 'quebra a frase no ponto de interrogação');
  // Groq como principal
  config.transcribe.provider = 'groq';
  assert.equal((await transcribe(wav, dir, { duration: 2, hasAudio: true }, () => {})).provider, 'groq');
  config.transcribe.provider = 'deepgram';
  config.transcribe.groqKey = '';
});
