import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, x264Fast, setHwEncoder, hwEncoder, probeSummary } from '../src/pipeline/ffmpeg.js';
import { runPipeline } from '../src/pipeline/index.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-hw-'));
after(() => { setHwEncoder(null); fs.rmSync(tmp, { recursive: true, force: true }); });

// Placa de vídeo nas etapas intermediárias: se o codificador da placa falhar, a etapa é
// refeita no processador (o vídeo sai igual) e a placa fica desligada.
test('placa de vídeo falhou → a etapa é refeita no processador', async () => {
  setHwEncoder('h264_naoexiste');
  assert.deepEqual(x264Fast().slice(0, 2), ['-c:v', 'h264_naoexiste']);
  const out = path.join(tmp, 'hw.mp4');
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=320x240:d=0.5:r=30', ...x264Fast(), '-pix_fmt', 'yuv420p', '-y', out], { label: 'teste' });
  const m = await probeSummary(out);
  assert.ok(m.duration > 0.3, 'vídeo gerado pelo processador');
  assert.equal(hwEncoder(), null, 'placa desligada depois da falha');
  assert.equal(x264Fast()[1], 'libx264');
});

// Legendas e textos livres numa passada só (uma recodificação a menos).
test('legendas + textos na mesma passada', { timeout: 120000 }, async () => {
  const src = path.join(tmp, 'src.mp4');
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=360x640:d=2:r=30', '-f', 'lavfi', '-i', 'sine=d=2', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', src]);
  const segments = [{ start: 0.2, end: 1.8, text: 'olá mundo', words: [{ word: 'olá', start: 0.2, end: 0.8 }, { word: 'mundo', start: 0.9, end: 1.8 }] }];
  const job = {
    id: 'hwcap', mode: 'render', inputPath: src, workDir: tmp, outputsDir: tmp, editedTranscript: { segments },
    options: { aspect: 'original', captions: true, colorLook: 'none', cutSilence: false, manualSilence: true, broll: false, textLayers: [{ key: 't1', text: 'Título', start: 0, end: 2, x: 0.5, y: 0.2 }] },
  };
  const report = await runPipeline(job, () => {});
  assert.ok(fs.existsSync(path.join(tmp, 'hwcap.mp4')));
  assert.equal(report.texts?.withCaptions, true, 'textos entraram junto com as legendas');
  const ass = fs.readFileSync(path.join(tmp, 'texts.ass'), 'utf8');
  assert.match(ass, /Título/);
});
