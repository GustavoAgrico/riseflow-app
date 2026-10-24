import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runPipeline } from '../src/pipeline/index.js';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-parity-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const ff = (args) => { const r = spawnSync(ffmpegPath, ['-v', 'error', '-y', ...args]); assert.equal(r.status, 0, r.stderr?.toString()); };
const psnr = (a, b) => Number(/average:([\d.]+|inf)/.exec(spawnSync(ffmpegPath, ['-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-']).stderr.toString())?.[1].replace('inf', '99'));

// Vídeo horizontal (16:9) saindo em 9:16: o Recortar, o Transformar e o fundo da V0 têm de
// sair como a prévia monta (no quadro final), inclusive movendo além da sobra do zoom.
test('16:9 → 9:16: V0 + Recortar + Transformar saem iguais à prévia', { timeout: 240000 }, async () => {
  const src = path.join(tmp, 'src.mp4');
  const under = path.join(tmp, 'under.png');
  ff(['-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:d=1.5:r=30', '-f', 'lavfi', '-i', 'sine=d=1.5', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', src]);
  ff(['-f', 'lavfi', '-i', 'color=c=green:s=1536x1024,drawgrid=w=128:h=128:t=6:c=white', '-frames:v', '1', under]);
  const job = {
    id: 'parity', mode: 'render', inputPath: src, workDir: tmp, outputsDir: tmp, editedTranscript: { segments: [] },
    options: {
      aspect: '9:16', captions: false, colorLook: 'none', cutSilence: false, manualSilence: true, broll: false,
      reframeMode: 'manual', personFocusX: 0.5, personFocusY: 0.4,
      videoCrop: { l: 0, t: 0.3, r: 0, b: 0 },
      transformKeys: [{ t: 0, scale: 1.219, x: 0.1, y: 0.15, rot: 0 }],
      userMedia: [{ kind: 'image', file: under, start: 0, duration: 1.5, mode: 'cover', under: true, scale: 1, opacity: 1, layer: 0 }],
    },
  };
  await runPipeline(job, () => {});
  const out = path.join(tmp, 'parity.mp4');
  assert.ok(fs.existsSync(out), 'vídeo final gerado');
  const got = path.join(tmp, 'got.png');
  const exp = path.join(tmp, 'exp.png');
  ff(['-ss', '0.5', '-i', out, '-frames:v', '1', '-vf', 'scale=270:480', got]);
  // a conta da prévia: fundo "cobre" o 9:16; vídeo cobre o 9:16 no foco, recorte no quadro do
  // vídeo, depois escala 121,9% e move (0,1 · 1080, 0,15 · 1920) no quadro final
  ff(['-ss', '0.5', '-i', src, '-i', under, '-f', 'lavfi', '-i', 'color=black:s=1080x1920', '-filter_complex',
    '[1:v]scale=2880:1920,crop=1080:1920:900:0[bg];[0:v]format=yuva420p,crop=1920:756:0:324,pad=1920:1080:0:324:color=black@0,scale=3413:1920,crop=1080:1920:1166:0,scale=1316:2340[v];[bg][v]overlay=x=-10:y=78,scale=270:480',
    '-frames:v', '1', exp]);
  const p = psnr(exp, got);
  assert.ok(p > 30, `PSNR ${p}`);
});
