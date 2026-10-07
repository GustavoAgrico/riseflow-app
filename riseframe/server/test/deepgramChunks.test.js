import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { splitAudio, transcribeDeepgram } from '../src/pipeline/transcribe/providers.js';

async function makeAudioVideo(dest, seconds) {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-y', '-f', 'lavfi', '-i', `sine=frequency=300:duration=${seconds}`, '-c:a', 'aac', dest], { stdio: 'ignore' });
  assert.equal(r.status, 0);
}

test('splitAudio: divide o mp3 em pedaços com o tempo de início de cada um', async () => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'dg-split-'));
  const mp3 = path.join(work, 'a.mp3');
  spawnSync(ffmpegPath, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'sine=duration=25', '-c:a', 'libmp3lame', '-b:a', '48k', mp3], { stdio: 'ignore' });
  const parts = await splitAudio(mp3, work, 10);
  assert.equal(parts.length, 3);
  assert.equal(parts[0].offset, 0);
  assert.ok(Math.abs(parts[1].offset - 10) < 0.2);
  assert.ok(Math.abs(parts[2].offset - 20) < 0.2);
  await fs.rm(work, { recursive: true, force: true });
});

test('transcribeDeepgram: áudio longo vai em pedaços e os tempos das palavras são somados', async () => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'dg-long-'));
  const input = path.join(work, 'in.m4a');
  await makeAudioVideo(input, 25);
  const mod = await import('../src/pipeline/transcribe/providers.js');
  // Força pedaços pequenos para o teste (o real é 10 min).
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const n = calls.length;
    return new Response(JSON.stringify({
      results: { channels: [{ detected_language: 'pt', alternatives: [{ transcript: `parte ${n}`, words: [{ start: 1, end: 1.5, word: 'parte', punctuated_word: `Parte${n}.` }] }] }] },
    }), { status: 200 });
  };
  try {
    const t = await transcribeDeepgram(input, work, { duration: 25 * 60 * 2 }, { deepgramKey: 'x' }, () => {}, { chunkSeconds: 10 });
    assert.equal(calls.length, 3, 'um envio por pedaço');
    assert.match(calls[0], /detect_language=true/);
    assert.match(calls[1], /language=pt/, 'idioma do 1º pedaço vale para os outros');
    const words = t.segments.flatMap((s) => s.words || []);
    assert.deepEqual(words.map((w) => Math.round(w.start)), [1, 11, 21]);
    assert.equal(t.language, 'pt');
  } finally {
    globalThis.fetch = realFetch;
    await fs.rm(work, { recursive: true, force: true });
  }
  assert.ok(mod.DEEPGRAM_CHUNK_SECONDS >= 60);
});

test('transcribeDeepgram: vídeo com duração quebrada (ex.: 465,43 s) não estoura o tempo máximo', async () => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'dg-frac-'));
  const input = path.join(work, 'in.m4a');
  await makeAudioVideo(input, 3);
  const realFetch = globalThis.fetch;
  let signal = null;
  globalThis.fetch = async (_url, init) => {
    signal = init.signal;
    return new Response(JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: 'oi', words: [{ start: 0.1, end: 0.4, word: 'oi' }] }] }] } }), { status: 200 });
  };
  try {
    // 465,4333 s × 2000 = 930866,6 ms → antes dava "The value of delay is out of range".
    const t = await transcribeDeepgram(input, work, { duration: 465.4333 }, { deepgramKey: 'x' }, () => {});
    assert.ok(signal, 'mandou com tempo máximo');
    assert.equal(t.segments.length, 1);
  } finally {
    globalThis.fetch = realFetch;
    await fs.rm(work, { recursive: true, force: true });
  }
});
