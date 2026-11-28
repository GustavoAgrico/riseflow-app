import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';
import { transcribeRange, sequenceTranscript } from '../src/pipeline/seqTranscript.js';
import { tmpDir } from '../testkit/tmp.js';

/** Vídeo de 3 s SEM faixa de áudio (como a montagem de uma timeline só com clipes mudos). */
function silentVideo(dir) {
  const f = path.join(dir, 'mudo.mp4');
  const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x568:d=3:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', f]);
  assert.equal(r.status, 0, r.stderr.toString());
  return f;
}

test('o erro de antes: recortar a fala de um vídeo sem áudio faz o FFmpeg falhar', () => {
  const dir = tmpDir('rf-mudo-');
  try {
    const f = silentVideo(dir);
    const r = spawnSync(ffmpegPath, ['-v', 'error', '-ss', '0', '-t', '2', '-i', f, '-vn', '-ac', '1', '-c:a', 'aac', '-y', path.join(dir, 'trecho.m4a')]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr.toString(), /does not contain any stream/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('transcrever um trecho de vídeo sem áudio: sem erro, sem fala, avisa noAudio', async () => {
  const dir = tmpDir('rf-mudo-');
  try {
    const f = silentVideo(dir);
    const r = await transcribeRange(f, dir, 0, 2);
    assert.equal(r.noAudio, true);
    assert.deepEqual(r.segments, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('montagem sem áudio com clipe novo e outro reaproveitado: os novos entram sem transcrever', async () => {
  const dir = tmpDir('rf-mudo-');
  try {
    const f = silentVideo(dir);
    const job = { sequence: { clips: [
      // clipe que já estava no editor, com a fala transcrita (reaproveitada)
      { kind: 'video', in: 0, out: 1.5, words: [{ start: 0.2, end: 1, text: 'oi', words: [{ start: 0.2, end: 0.6, word: 'oi' }] }] },
      { kind: 'video', in: 0, out: 1.5, mediaId: 'clipe-novo-teste' },
    ] } };
    const r = await sequenceTranscript(job, f, dir, { duration: 3, hasAudio: false });
    assert.equal(r.noAudio, true);
    assert.equal(r.reused, 1);
    assert.deepEqual(r.untranscribed, [[1.5, 3]]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
