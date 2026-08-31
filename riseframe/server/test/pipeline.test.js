import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { runPipeline } from '../src/pipeline/index.js';
import { probeSummary } from '../src/pipeline/ffmpeg.js';
import { config } from '../src/config.js';
import { ensureDirs } from '../src/storage.js';

async function makeClip(dest, { withAudio = true } = {}) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const args = ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc=size=480x854:rate=24:duration=8'];
  if (withAudio) {
    args.push('-f', 'lavfi', '-i', 'sine=frequency=300:duration=8',
      '-filter_complex', "[1:a]volume='if(lt(mod(t,2.4),1.5),0.7,0)':eval=frame[a]",
      '-map', '0:v', '-map', '[a]', '-c:a', 'aac');
  } else {
    args.push('-map', '0:v');
  }
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', '-shortest', dest);
  const r = spawnSync(ffmpegPath, args, { stdio: 'ignore' });
  assert.equal(r.status, 0, 'ffmpeg deve gerar o clipe de teste');
}

test('pipeline completo: corta silêncio, legenda, grade e renderiza', async () => {
  await ensureDirs();
  const jobId = 'test_' + Date.now();
  const work = path.join(config.paths.work, jobId);
  await fs.mkdir(work, { recursive: true });
  const input = path.join(work, 'in.mp4');
  await makeClip(input);

  const before = await probeSummary(input);
  assert.ok(before.duration > 5, 'clipe de entrada ~8s');

  const job = {
    id: jobId,
    inputPath: input,
    workDir: work,
    outputsDir: config.paths.outputs,
    options: {
      cutSilence: true,
      captions: true,
      captionMode: 'karaoke',
      colorLook: 'teal-orange',
      broll: false,
      aspect: '9:16',
    },
  };

  const updates = [];
  const report = await runPipeline(job, (p) => updates.push(p));

  const outFile = path.join(config.paths.outputs, `${jobId}.mp4`);
  const stat = await fs.stat(outFile);
  assert.ok(stat.size > 1000, 'render final não vazio');

  const after = await probeSummary(outFile);
  assert.ok(after.duration < before.duration, 'silêncios foram cortados (saída mais curta)');
  assert.ok(report.silence.removedSeconds > 0.5, 'reportou segundos removidos');
  assert.equal(report.output.aspect, '9:16', 'reframe aplicado');
  assert.ok(updates.some((u) => u.progress === 100), 'progresso chegou a 100');

  // limpeza
  await fs.rm(work, { recursive: true, force: true });
  await fs.rm(outFile, { force: true });
});

test('pipeline lida com vídeo sem áudio', async () => {
  await ensureDirs();
  const jobId = 'test_noaudio_' + Date.now();
  const work = path.join(config.paths.work, jobId);
  await fs.mkdir(work, { recursive: true });
  const input = path.join(work, 'in.mp4');
  await makeClip(input, { withAudio: false });

  const job = {
    id: jobId, inputPath: input, workDir: work, outputsDir: config.paths.outputs,
    options: { cutSilence: true, captions: true, colorLook: 'none', broll: false, aspect: 'original' },
  };
  const report = await runPipeline(job, () => {});
  const outFile = path.join(config.paths.outputs, `${jobId}.mp4`);
  assert.ok((await fs.stat(outFile)).size > 1000, 'render sem áudio ok');

  await fs.rm(work, { recursive: true, force: true });
  await fs.rm(outFile, { force: true });
});
