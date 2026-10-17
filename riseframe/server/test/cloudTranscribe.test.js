import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { config } from '../src/config.js';
import { rememberJobToken } from '../src/account.js';
import { transcribe } from '../src/pipeline/transcribe/index.js';

/** Áudio curto de teste (tom de 2 s). */
function tone(dir) {
  const f = path.join(dir, 'tom.wav');
  spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2', '-y', f]);
  return f;
}

test('app de PC sem chave: transcreve pela conta do site (só o áudio vai) com o token do job', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtx-'));
  let got = null;
  const srv = http.createServer((req, res) => {
    let size = 0;
    req.on('data', (d) => { size += d.length; });
    req.on('end', () => {
      got = { url: req.url, auth: req.headers.authorization, type: req.headers['content-type'], size };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ provider: 'deepgram', language: 'pt', text: 'olá mundo', segments: [{ start: 0, end: 1, text: 'olá mundo', words: [{ start: 0, end: 0.4, word: 'olá' }, { start: 0.5, end: 1, word: 'mundo' }] }] }));
    });
  });
  await new Promise((r) => srv.listen(0, r));
  const prev = { server: config.account.server, provider: config.transcribe.provider };
  config.account.server = `http://127.0.0.1:${srv.address().port}`;
  config.transcribe.provider = 'whisper-local';
  try {
    rememberJobToken('job123', { get: () => 'Bearer tok-abc' });
    const t = await transcribe(tone(dir), dir, { duration: 2, hasAudio: true }, null, { jobId: 'job123' });
    assert.equal(got.url, '/api/transcribe/remote');
    assert.equal(got.auth, 'Bearer tok-abc');
    assert.match(got.type, /multipart\/form-data/);
    assert.ok(got.size > 1000 && got.size < 200_000, `só o áudio leve: ${got.size} bytes`);
    assert.match(t.provider, /nuvem/);
    assert.equal(t.segments[0].words[1].word, 'mundo');
  } finally {
    config.account.server = prev.server;
    config.transcribe.provider = prev.provider;
    srv.close();
  }
});

test('app de PC sem internet e sem Whisper: erro claro em vez de legenda de exemplo', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtx-'));
  const prev = { server: config.account.server, provider: config.transcribe.provider, python: config.transcribe.pythonBin };
  config.account.server = 'http://127.0.0.1:9'; // ninguém escuta
  config.transcribe.provider = 'whisper-local';
  try {
    rememberJobToken('job456', { get: () => 'Bearer tok' });
    await assert.rejects(transcribe(tone(dir), dir, { duration: 2, hasAudio: true }, null, { jobId: 'job456' }), /não deu para transcrever a fala/);
  } finally {
    config.account.server = prev.server;
    config.transcribe.provider = prev.provider;
  }
});
