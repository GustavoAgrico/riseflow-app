import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ffmpegPath, probeSummary } from '../src/pipeline/ffmpeg.js';
import { assembleSequence, frameSize, clipDuration } from '../src/pipeline/sequence.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-seq-'));
const procs = [];
after(() => { procs.forEach((p) => p.kill()); fs.rmSync(tmp, { recursive: true, force: true }); });
const ff = (...a) => spawnSync(ffmpegPath, ['-v', 'error', ...a, '-y']);

const vertical = path.join(tmp, 'v.mp4');
const wide = path.join(tmp, 'w.mp4');
const mute = path.join(tmp, 'mute.mp4');
const img = path.join(tmp, 'logo.png');
const song = path.join(tmp, 'song.mp3');
ff('-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', vertical);
ff('-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=4', '-f', 'lavfi', '-i', 'sine=f=880:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', wide);
ff('-f', 'lavfi', '-i', 'color=c=green:s=320x240:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mute);
ff('-f', 'lavfi', '-i', 'color=c=orange:s=400x200', '-frames:v', '1', img);
ff('-f', 'lavfi', '-i', 'sine=f=220:d=2', song);

test('formato e duração dos clipes', () => {
  assert.deepEqual(frameSize('9:16'), [1080, 1920]);
  assert.deepEqual(frameSize('auto', { width: 3840, height: 2160 }), [1920, 1080]);
  assert.equal(clipDuration({ kind: 'image', duration: 2 }), 2);
  assert.equal(clipDuration({ kind: 'video', in: 1, out: 2.5 }), 1.5);
});

test('monta a timeline: tamanhos diferentes, vídeo sem som, imagem e música', { timeout: 120000 }, async () => {
  const out = path.join(tmp, 'seq.mp4');
  const r = await assembleSequence({
    clips: [
      { file: vertical, kind: 'video', in: 0.5, out: 2.5 },
      { file: wide, kind: 'video', in: 0, out: 1.5 },
      { file: mute, kind: 'video' },
      { file: img, kind: 'image', duration: 1.5 },
    ],
    music: { file: song, volume: 0.3 },
    aspect: 'auto',
    output: out,
    work: path.join(tmp, 'work'),
  });
  assert.deepEqual([r.width, r.height], [360, 640], 'formato do primeiro clipe');
  const m = await probeSummary(out);
  assert.ok(Math.abs(m.duration - 7) < 0.25, `duração 2 + 1,5 + 2 + 1,5 = 7 s (veio ${m.duration})`);
  assert.equal(m.width, 360);
  assert.equal(m.hasAudio, true);
});

// ── fluxo completo: enviar mídias, montar a timeline, abrir no editor ──
const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
async function startServer() {
  const port = await freePort();
  const p = spawn(process.execPath, ['src/index.js'], { cwd: root, env: { ...process.env, PORT: String(port), DATA_DIR: path.join(tmp, 'data'), CLOUD_SYNC: 'off', EMAIL_VERIFY: 'off', TRANSCRIBE_PROVIDER: 'mock', ADMIN_EMAILS: '', BILLING_MODE: 'off' }, stdio: 'ignore' });
  procs.push(p);
  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/health`)).ok) return base; } catch { /* subindo */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('servidor não subiu');
}

test('timeline em branco: mídias da conta viram o vídeo do editor', { timeout: 180000 }, async () => {
  const base = await startServer();
  const token = (await (await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'seq@exemplo.com', password: 'senha12345' }) })).json()).token;
  const auth = { authorization: `Bearer ${token}` };
  const up = async (file) => {
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
    const r = await fetch(`${base}/media`, { method: 'POST', headers: auth, body: fd });
    assert.equal(r.status, 201);
    return (await r.json()).id;
  };
  const a = await up(vertical);
  const b = await up(img);
  const lib = await (await fetch(`${base}/media/library`, { headers: auth })).json();
  assert.equal(lib.media.length, 2, 'as mídias ficam na biblioteca');
  const r = await fetch(`${base}/sequence`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Minha timeline', aspect: '9:16', clips: [{ mediaId: a, in: 0, out: 2 }, { mediaId: b, duration: 1 }] }) });
  assert.equal(r.status, 201, await r.clone().text());
  const job = await r.json();
  assert.equal(job.fromSequence, true);
  assert.equal(job.sequence, undefined, 'caminhos dos arquivos não vão para o cliente');
  let done;
  for (let i = 0; i < 300; i++) {
    done = await (await fetch(`${base}/jobs/${job.id}`, { headers: auth })).json();
    if (done.status === 'done' || done.status === 'error') break;
    await new Promise((res) => setTimeout(res, 200));
  }
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.report.sequence.clips, 2);
  assert.ok(Math.abs(done.report.input.duration - 3) < 0.25);
  assert.equal(done.report.input.width, 1080);
  // timeline vazia não é aceita
  const empty = await fetch(`${base}/sequence`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ clips: [] }) });
  assert.equal(empty.status, 400);
});
