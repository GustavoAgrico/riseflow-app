import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { outputTarget, convertAspect, finalRender } from '../src/pipeline/render.js';
import { runFfmpeg, probeSummary } from '../src/pipeline/ffmpeg.js';
import { creditItems, lockedItems } from '../../shared/credits.js';
import { parseOptions } from '../src/routes/jobs.js';

test('qualidade de exportação: tamanho do quadro final pelo lado menor', () => {
  const vert = { width: 464, height: 824 };
  assert.equal(outputTarget(vert, { aspect: 'original' }), null, 'sem qualidade: original');
  assert.deepEqual(outputTarget(vert, { aspect: 'original', quality: '1080' }), { w: 1080, h: 1918 });
  assert.deepEqual(outputTarget(vert, { aspect: 'original', quality: '720' }), { w: 720, h: 1278 });
  assert.deepEqual(outputTarget(vert, { aspect: '9:16', quality: '2160' }), { w: 2160, h: 3840 }, '4K vertical');
  assert.deepEqual(outputTarget(vert, { aspect: '16:9', quality: '720' }), { w: 1280, h: 720 });
  assert.deepEqual(outputTarget(vert, { aspect: '9:16' }), { w: 1080, h: 1920 }, 'formato sem qualidade: como antes');
});

test('720p/1080p/4K é recurso do Premium (bloqueado no Pro) e não custa crédito extra', () => {
  const items = creditItems('render', { quality: '2160', captions: false }, { video: 20, captionStyle: 10, image: 5, ai: 10, clips: 40, hd: 0 });
  const hd = items.find((i) => i.id === 'hd');
  assert.ok(hd && hd.credits === 0 && /4K/.test(hd.label));
  assert.deepEqual(lockedItems(items, ['captionStyle', 'image', 'ai']).map((i) => i.id), ['hd'], 'Pro não libera');
  assert.deepEqual(lockedItems(items, ['captionStyle', 'image', 'ai', 'clips', 'hd']), [], 'Premium libera');
  assert.equal(creditItems('render', { quality: 'original' }).some((i) => i.id === 'hd'), false);
  assert.equal(parseOptions({ quality: '1080' }).quality, '1080');
  assert.equal(parseOptions({ quality: '8k' }).quality, 'original');
});

test('vídeo pequeno exportado em 1080p sai em 1080p (ampliado antes das legendas)', { timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-qual-'));
  const src = path.join(dir, 'src.mp4');
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=464x824:r=30:d=1.5', '-f', 'lavfi', '-i', 'sine=d=1.5', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', '-y', src]);
  const meta = await probeSummary(src);
  const opts = { aspect: 'original', quality: '1080' };
  const a = await convertAspect(src, dir, meta, opts, src, () => {});
  assert.equal(a.applied, true);
  const am = await probeSummary(a.output);
  assert.equal(am.width, 1080);
  const r = await finalRender(a.output, dir, 'q', am, opts, () => {});
  const m = await probeSummary(r.output);
  assert.equal(m.width, 1080);
  assert.equal(m.height, 1918);
  fs.rmSync(dir, { recursive: true, force: true });
});
