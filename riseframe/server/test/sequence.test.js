import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ffmpegPath, probeSummary } from '../src/pipeline/ffmpeg.js';
import { assembleSequence, frameSize, clipDuration, canCopyWhole } from '../src/pipeline/sequence.js';

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

test('um vídeo inteiro entra original (sem recodificar)', { timeout: 60000 }, async () => {
  const v = { kind: 'video', in: 0, out: 3, _dur: 3, _w: 360, _h: 640 };
  assert.equal(canCopyWhole([v], null, 'auto'), true);
  assert.equal(canCopyWhole([v], null, '9:16'), true, 'mesma proporção');
  assert.equal(canCopyWhole([v], null, '16:9'), false, 'outro formato: monta de novo');
  assert.equal(canCopyWhole([{ ...v, in: 1 }], null, 'auto'), false, 'aparado: monta de novo');
  assert.equal(canCopyWhole([v], { file: 'x.mp3' }, 'auto'), false, 'com música: monta de novo');
  assert.equal(canCopyWhole([v, v], null, 'auto'), false);
  const out = path.join(tmp, 'copia.mp4');
  const r = await assembleSequence({ clips: [{ file: wide, kind: 'video', in: 0, out: 4 }], aspect: 'auto', output: out, work: path.join(tmp, 'work2') });
  assert.equal(r.copied, true);
  const m = await probeSummary(out);
  assert.equal(m.width, 640, 'tamanho original (sem reescalar)');
  assert.equal(m.hasAudio, true, 'o som do arquivo vem junto');
  assert.ok(Math.abs(m.duration - 4) < 0.2);
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
  // aba Projeto: a montagem aparece (sem caminhos) e o próprio vídeo do editor entra de novo, reordenado
  assert.deepEqual(done.sequenceClips.map((c) => [c.kind, c.mediaId]), [['video', a], ['image', b]]);
  assert.ok(!JSON.stringify(done).includes(tmp), 'nenhum caminho de arquivo vai para o cliente');
  const re = await fetch(`${base}/sequence`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ clips: [{ mediaId: b, duration: 1 }, { sourceId: done.id, in: 0, out: 1 }] }) });
  assert.equal(re.status, 201, await re.clone().text());
  const rj = await re.json();
  assert.deepEqual(rj.sequenceClips.map((c) => c.kind), ['image', 'video']);
  assert.equal(rj.sequenceClips[1].sourceId, done.id);
  // timeline vazia não é aceita
  const empty = await fetch(`${base}/sequence`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ clips: [] }) });
  assert.equal(empty.status, 400);
});

test('timeline em branco: abre na hora, sem cobrar e sem clipes', { timeout: 120000 }, async () => {
  const base = await startServer();
  const token = (await (await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'vazio@exemplo.com', password: 'senha12345' }) })).json()).token;
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const r = await fetch(`${base}/sequence/blank`, { method: 'POST', headers: auth, body: JSON.stringify({ title: 'Nova timeline' }) });
  assert.equal(r.status, 201);
  const job = await r.json();
  assert.equal(job.blankTimeline, true);
  assert.deepEqual(job.sequenceClips, []);
  let done;
  for (let i = 0; i < 200; i++) {
    done = await (await fetch(`${base}/jobs/${job.id}`, { headers: auth })).json();
    if (done.status === 'done' || done.status === 'error') break;
    await new Promise((res) => setTimeout(res, 150));
  }
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.report.sequence.blank, true);
  assert.equal(done.report.input.width, 1080);
  assert.equal(done.report.input.height, 1920);
  assert.equal(done.report.transcript.segments.length, 0, 'sem fala');
  // Edição automática: muletas e repetições da fala do editor saem (sem IA no plano: só a básica)
  const words = ['é', 'é', 'então', 'a', 'gente', 'vai', 'vai'].map((w, i) => ({ start: i * 0.4, end: i * 0.4 + 0.3, word: w }));
  const c = await fetch(`${base}/jobs/${job.id}/clean-speech`, { method: 'POST', headers: auth, body: JSON.stringify({ segments: [{ start: 0, end: 3, text: words.map((w) => w.word).join(' '), words }] }) });
  assert.equal(c.status, 200, await c.clone().text());
  const cj = await c.json();
  assert.ok(cj.removed >= 2, `marcou ${cj.removed}`);
  assert.equal(cj.segments[0].words.length, words.length, 'as palavras continuam (só marcadas)');
  assert.equal(cj.segments[0].words.filter((w) => w.removed).length, cj.removed);
  const vazio = await fetch(`${base}/jobs/${job.id}/clean-speech`, { method: 'POST', headers: auth, body: JSON.stringify({ segments: [] }) });
  assert.equal(vazio.status, 400);
});

test('espaço vazio na montagem: preto e sem som, com a duração pedida', { timeout: 120000 }, async () => {
  assert.equal(clipDuration({ kind: 'blank', duration: 1.5 }), 1.5);
  const out = path.join(tmp, 'seq_blank.mp4');
  const r = await assembleSequence({
    clips: [{ file: vertical, kind: 'video', in: 0, out: 1 }, { kind: 'blank', duration: 1.5 }, { file: img, kind: 'image', duration: 1 }],
    aspect: '9:16', output: out, work: path.join(tmp, 'wb'),
  });
  assert.equal(r.width, 1080);
  const m = await probeSummary(out);
  assert.ok(Math.abs(m.duration - 3.5) < 0.2, `duração ${m.duration}`);
  // no meio do vazio a imagem é preta
  const px = spawnSync(ffmpegPath, ['-v', 'error', '-ss', '1.7', '-i', out, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']).stdout;
  assert.ok(px[0] < 20, `brilho ${px[0]}`);
});
