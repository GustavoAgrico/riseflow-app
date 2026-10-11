import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { sanitizeHeadline, sanitizeCover, headlineAss, burnHeadline, makeCover } from '../src/pipeline/headline.js';
import { finalRender } from '../src/pipeline/render.js';
import { runFfmpeg, probeSummary, ffmpegPath } from '../src/pipeline/ffmpeg.js';
import { spawnSync } from 'node:child_process';

test('headline e capa: só com texto, valores seguros', () => {
  assert.equal(sanitizeHeadline({ text: '   ' }), null);
  const h = sanitizeHeadline({ text: 'Como cobrar a equipe {sem} brigar', seconds: 5, style: 'x', color: '#7c3aed', position: 'top' });
  assert.deepEqual(h, { text: 'Como cobrar a equipe {sem} brigar', seconds: 5, style: 'box', color: '7C3AED', position: 'top' });
  assert.equal(sanitizeHeadline({ text: 'a', seconds: 'all' }).seconds, 0, 'vídeo todo');
  assert.equal(sanitizeCover({ enabled: false }), null);
  assert.equal(sanitizeCover({ t: 12.5, text: 'Capa', intro: true }).intro, true);
  const ass = headlineAss(h, 1080, 1920, { start: 0, end: 5 });
  assert.match(ass, /PlayResX: 1080/);
  assert.match(ass, /Dialogue: 0,0:00:00.00,0:00:05.00,Headline/);
  assert.match(ass, /Como cobrar a equipe \(sem\) brigar/, 'chaves não viram comando do ASS');
});

test('headline queimada no topo e capa no tamanho do vídeo final', { timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-head-'));
  const src = path.join(dir, 'src.mp4');
  await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0x204060:s=540x960:r=30:d=3', '-f', 'lavfi', '-i', 'sine=d=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', '-y', src]);
  const meta = await probeSummary(src);
  const h = sanitizeHeadline({ text: 'Título do vídeo', seconds: 2, style: 'box', color: 'FF6B35' });
  const r = await burnHeadline(src, dir, meta, h, () => {});
  // brilho do topo: com a caixa laranja no começo, sem nada depois de 2 s
  const topY = (t) => {
    const out = spawnSync(ffmpegPath, ['-v', 'error', '-ss', String(t), '-i', r.output, '-frames:v', '1', '-vf', 'crop=iw:ih*0.2:0:0,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { encoding: 'utf8' }).stdout;
    return Number((out.match(/YAVG=([\d.]+)/) || [])[1]);
  };
  assert.ok(topY(0.5) > topY(2.6) + 5, `topo com título (${topY(0.5)}) mais claro que sem (${topY(2.6)})`);

  // capa 9:16 a partir de um vídeo deitado
  const wide = path.join(dir, 'wide.mp4');
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-y', wide]);
  const jpg = path.join(dir, 'capa.jpg');
  await makeCover(wide, path.join(dir, 'c'), { t: 1, W: 540, H: 960, text: 'Minha capa', headline: h, position: 'center' }, jpg);
  const cm = await probeSummary(jpg);
  assert.equal(cm.width, 540);
  assert.equal(cm.height, 960);

  // capa no começo do vídeo final: mesma duração, imagem só nos primeiros instantes
  const cov = path.join(dir, 'cov.jpg');
  await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=white:s=540x960', '-frames:v', '1', '-y', cov]);
  const f = await finalRender(src, dir, 'final', meta, { aspect: 'original', coverFile: cov }, () => {});
  const fm = await probeSummary(f.output);
  assert.ok(Math.abs(fm.duration - meta.duration) < 0.15, `duração ${fm.duration}`);
  const y = (t) => Number((spawnSync(ffmpegPath, ['-v', 'error', '-ss', String(t), '-i', f.output, '-frames:v', '1', '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { encoding: 'utf8' }).stdout.match(/YAVG=([\d.]+)/) || [])[1]);
  assert.ok(y(0.1) > 200, `começa com a capa branca (${y(0.1)})`);
  assert.ok(y(1.5) < 120, `depois volta ao vídeo (${y(1.5)})`);
  fs.rmSync(dir, { recursive: true, force: true });
});
