import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, probeSummary } from '../src/pipeline/ffmpeg.js';
import { runPipeline } from '../src/pipeline/index.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-pre-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// Vídeo bem maior que o final (ex.: 4K exportando em 1080p): reduz uma vez no começo e
// as etapas seguintes trabalham no tamanho final; com zoom no rosto guarda a folga.
test('vídeo maior que o final é reduzido no começo (com folga para o zoom)', { timeout: 180000 }, async () => {
  const src = path.join(tmp, 'big.mp4');
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:d=1.5:r=30', '-f', 'lavfi', '-i', 'sine=d=1.5', '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', src]);
  fs.mkdirSync(path.join(tmp, 'w1')); fs.mkdirSync(path.join(tmp, 'w2'));
  const base = { aspect: 'original', quality: '720', captions: false, colorLook: 'none', cutSilence: false, manualSilence: true, broll: false };
  const r1 = await runPipeline({ id: 'pre1', mode: 'render', inputPath: src, workDir: path.join(tmp, 'w1'), outputsDir: tmp, editedTranscript: { segments: [] }, options: base }, () => {});
  assert.deepEqual(r1.prescale?.to, [720, 1280]);
  const m1 = await probeSummary(path.join(tmp, 'pre1.mp4'));
  assert.equal(m1.width, 720);
  assert.equal(m1.height, 1280);
  // zoom de 1,3: 720 × 1,3 = 936 de largura — redução pequena demais, mantém o original
  const r2 = await runPipeline({ id: 'pre2', mode: 'render', inputPath: src, workDir: path.join(tmp, 'w2'), outputsDir: tmp, editedTranscript: { segments: [] }, options: { ...base, personZoom: 1.3, personFocusX: 0.5, personFocusY: 0.4 } }, () => {});
  assert.equal(r2.prescale, undefined);
  const m2 = await probeSummary(path.join(tmp, 'pre2.mp4'));
  assert.equal(m2.width, 720);
});
