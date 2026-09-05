import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { findHighlights } from '../src/pipeline/clips.js';
import { runPipeline } from '../src/pipeline/index.js';
import { probeSummary } from '../src/pipeline/ffmpeg.js';
import { config } from '../src/config.js';
import { ensureDirs } from '../src/storage.js';

config.transcribe.provider = 'mock';

test('findHighlights: forma janelas, respeita o limite e ordena por tempo', () => {
  // 4 "cenas" de ~16s separadas por pausas grandes
  const segments = [];
  let t = 0;
  for (let scene = 0; scene < 4; scene++) {
    for (let k = 0; k < 5; k++) {
      const start = t;
      const end = t + 3;
      segments.push({
        start, end,
        text: 'como funciona o segredo importante resultado dica',
        words: 'como funciona o segredo importante resultado dica'.split(' ').map((w, i) => ({
          start: start + i * 0.4, end: start + i * 0.4 + 0.4, word: w,
        })),
      });
      t = end;
    }
    t += 1.2; // pausa entre cenas
  }
  const hi = findHighlights({ segments }, { duration: t }, { clipsCount: 2, clipMin: 12, clipMax: 40 });
  assert.equal(hi.length, 2, 'retorna a quantidade pedida');
  assert.ok(hi[0].start < hi[1].start, 'ordenado por tempo na saída');
  for (const c of hi) {
    assert.ok(c.end - c.start >= 12 && c.end - c.start <= 40, 'janela dentro dos limites');
    assert.ok(c.title && c.title.length > 0, 'tem título');
  }
});

test('generateClips (pipeline mode=clips): produz N clipes curtos válidos', async () => {
  await ensureDirs();
  const jobId = 'clips_' + Date.now();
  const work = path.join(config.paths.work, jobId);
  await fs.mkdir(work, { recursive: true });
  const input = path.join(work, 'long.mp4');

  // ~48s: tom 2.4s ligado / 1.2s desligado (gera regiões de fala com pausas)
  const gate = "volume='if(lt(mod(t,3.6),2.4),0.7,0)':eval=frame";
  const r = spawnSync(ffmpegPath, [
    '-hide_banner', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=15:duration=48',
    '-f', 'lavfi', '-i', 'sine=frequency=320:duration=48',
    '-filter_complex', `[1:a]${gate}[a]`, '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', input,
  ], { stdio: 'ignore' });
  assert.equal(r.status, 0, 'gerou o vídeo longo de teste');

  const src = await probeSummary(input);
  assert.ok(src.duration > 40, 'fonte ~48s');

  const job = {
    id: jobId, mode: 'clips', inputPath: input, workDir: work, outputsDir: config.paths.outputs,
    options: { clipsCount: 3, clipMin: 10, clipMax: 22, clipAspect: '9:16', captions: true, colorLook: 'none' },
  };
  const report = await runPipeline(job, () => {});
  assert.ok(Array.isArray(report.clips) && report.clips.length >= 2, 'gerou ao menos 2 clipes');

  for (const c of report.clips) {
    const file = path.join(config.paths.outputs, c.file);
    const st = await fs.stat(file);
    assert.ok(st.size > 1000, `clipe ${c.index} não vazio`);
    const cm = await probeSummary(file);
    assert.ok(cm.duration < src.duration, 'clipe mais curto que a fonte');
    assert.equal(cm.width, 1080, 'reframe 9:16 aplicado (1080 de largura)');
    await fs.rm(file, { force: true });
  }

  await fs.rm(work, { recursive: true, force: true });
});
