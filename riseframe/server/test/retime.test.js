import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retimePieces, retimedDuration, atempoChain, retimeGraph, clampSpeed } from '../src/pipeline/retime.js';

test('retime: sem trechos nem congelamentos não muda nada', () => {
  assert.equal(retimePieces([], [], 10), null);
  assert.equal(retimePieces([{ start: 1, end: 3, speed: 1 }], [], 10), null, '1× não conta');
});

test('retime: trecho acelerado vira 3 pedaços e encurta o vídeo', () => {
  const p = retimePieces([{ start: 2, end: 6, speed: 2 }], [], 10);
  assert.deepEqual(p, [{ a: 0, b: 2, k: 1 }, { a: 2, b: 6, k: 2 }, { a: 6, b: 10, k: 1 }]);
  assert.equal(retimedDuration(p), 8);
});

test('retime: congelar quadro soma a duração e entra no ponto certo', () => {
  const p = retimePieces([], [{ t: 4, dur: 2 }], 10);
  assert.deepEqual(p, [{ a: 0, b: 4, k: 1 }, { freeze: 2, at: 4 }, { a: 4, b: 10, k: 1 }]);
  assert.equal(retimedDuration(p), 12);
});

test('retime: velocidade geral multiplica, sobreposição não duplica, limites 0,25–4×', () => {
  const p = retimePieces([{ start: 0, end: 5, speed: 0.5 }, { start: 3, end: 8, speed: 9 }], [], 10, 2);
  assert.deepEqual(p.map((x) => [x.a, x.b, x.k]), [[0, 5, 1], [5, 8, 8], [8, 10, 2]]);
  assert.equal(clampSpeed(0.1), 0.25);
});

test('atempo encadeia para velocidades fora de 0,5–2', () => {
  assert.equal(atempoChain(4), 'atempo=2,atempo=2');
  assert.equal(atempoChain(0.25), 'atempo=0.5,atempo=0.5');
  assert.equal(atempoChain(1.5), 'atempo=1.5');
});

test('retimeGraph monta split → pedaços → concat com áudio', () => {
  const g = retimeGraph(retimePieces([{ start: 2, end: 6, speed: 2 }], [{ t: 8, dur: 1 }], 10), { fps: 30, baseVf: 'format=yuv420p' });
  assert.match(g, /^\[0:v\]format=yuv420p,fps=30,split=5/);
  assert.match(g, /setpts=\(PTS-STARTPTS\)\/2\[rtv1\]/);
  assert.match(g, /tpad=stop_mode=clone:stop_duration=1\.000/);
  assert.match(g, /concat=n=5:v=1:a=1\[rtvc\]\[rta\]/);
});

test('render final: velocidade por trecho + congelar quadro mudam a duração de verdade', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { finalRender } = await import('../src/pipeline/render.js');
  const { runFfmpeg, probeSummary } = await import('../src/pipeline/ffmpeg.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-retime-'));
  const src = path.join(dir, 'in.mp4');
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=30:d=4', '-f', 'lavfi', '-i', 'sine=d=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', '-y', src]);
  const meta = await probeSummary(src);
  // 0–1 normal, 1–3 a 2× (1 s), 3–4 normal, + 1,5 s congelado em 3 → 4,5 s
  const r = await finalRender(src, dir, 'rt', meta, { speedRanges: [{ start: 1, end: 3, speed: 2 }], freezes: [{ t: 3, dur: 1.5 }] }, () => {});
  const m = await probeSummary(r.output);
  assert.ok(Math.abs(m.duration - 4.5) < 0.15, `duração ${m.duration}`);
  assert.ok(m.hasAudio, 'mantém o áudio');
});
