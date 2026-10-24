import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { videoFxVf } from '../src/pipeline/videofx.js';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';
import { VIDEO_FX, VIDEO_FX_CSS, cleanFxMoments } from '../../shared/textLayers.js';

test('efeitos de vídeo (categorias do Premiere/Film Impact): todos têm prévia e o FFmpeg aceita cada um só na janela', { timeout: 120000 }, () => {
  const ids = Object.keys(VIDEO_FX);
  assert.ok(ids.length >= 40, `${ids.length} efeitos`);
  for (const id of ids) assert.ok(Object.hasOwn(VIDEO_FX_CSS, id), `${id}: prévia no editor`);
  const moments = cleanFxMoments(ids.map((effect, i) => ({ effect, start: i * 0.2, end: i * 0.2 + 0.18 })), 100);
  assert.equal(moments.length, ids.length);
  const vf = videoFxVf(moments);
  for (const id of ids) assert.ok(videoFxVf([{ effect: id, start: 0, end: 1 }]), `${id}: filtro no render`);
  const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', `testsrc2=s=320x240:r=30:d=${(ids.length * 0.2 + 0.2).toFixed(1)}`, '-vf', vf, '-f', 'null', '-']);
  assert.equal(r.status, 0, r.stderr.toString());
});
