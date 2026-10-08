import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { watermarkFilter, applyWatermark } from '../src/pipeline/watermark.js';
import { runFfmpeg, probeSummary } from '../src/pipeline/ffmpeg.js';

test('marca d\'água: logo no canto escolhido, escala pela largura e transparência', () => {
  const f = watermarkFilter({ width: 1080, height: 1920 }, { position: 'br', scale: 0.2, opacity: 0.5 });
  assert.match(f, /scale=216:-2/);
  assert.match(f, /aa=0\.50/);
  assert.match(f, /overlay=x=W-w-38:y=H-h-38/);
  assert.match(watermarkFilter({ width: 1080, height: 1920 }, {}), /overlay=x=W-w-38:y=38/, 'padrão: canto superior direito');
});

test('marca d\'água: aplica de verdade num vídeo (mantém duração e áudio)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-wm-'));
  const vid = path.join(dir, 'v.mp4');
  const logo = path.join(dir, 'logo.png');
  await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0x223344:s=360x640:d=1.5', '-f', 'lavfi', '-i', 'sine=f=300:d=1.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', vid], { label: 't' });
  await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0xFF6B35:s=200x80:d=0.1', '-frames:v', '1', '-y', logo], { label: 't' });
  const meta = await probeSummary(vid);
  const r = await applyWatermark(vid, dir, meta, { watermark: { file: logo, position: 'tr', scale: 0.2, opacity: 1 } });
  assert.equal(r.applied, true);
  const out = await probeSummary(r.output);
  assert.ok(Math.abs(out.duration - meta.duration) < 0.2, 'mesma duração');
  assert.ok(out.hasAudio, 'áudio mantido');
  assert.deepEqual((await applyWatermark(vid, dir, meta, {})).applied, false, 'sem logo: não faz nada');
  fs.rmSync(dir, { recursive: true, force: true });
});
