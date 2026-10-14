import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAss } from '../src/pipeline/captions.js';
import { safeCaptionBox, SAFE_ZONE } from '../../shared/captionStyle.js';

const words = 'isso aqui é uma legenda bem comprida para testar a quebra de linha no vídeo vertical'.split(' ')
  .map((w, i) => ({ word: w, start: i * 0.3, end: i * 0.3 + 0.25 }));
const segments = [{ start: 0, end: words.length * 0.3, text: words.map((w) => w.word).join(' '), words }];
const ys = (ass) => [...ass.matchAll(/^Dialogue: \d+,[^,]*,[^,]*,Rise,.*?\\pos\((\d+),(\d+)\)/gm)].map((m) => Number(m[2]));
const lineLens = (ass) => [...ass.matchAll(/^Dialogue: \d+,[^,]*,[^,]*,Rise,,[^{]*\{[^}]*\}(.*)$/gm)].map((m) => m[1].replace(/\{[^}]*\}/g, '').length);

test('área segura: no vídeo vertical a legenda fica acima da faixa do nome/descrição', () => {
  const meta = { width: 1080, height: 1920 };
  for (const template of ['clean', 'karaoke', 'hormozi', 'tiktok']) {
    const on = ys(buildAss(segments, meta, { template }));
    const off = ys(buildAss(segments, meta, { template, safeZone: false }));
    assert.ok(on.length, template);
    assert.ok(Math.max(...on) < 1920 * (1 - SAFE_ZONE.bottom), `${template}: ${Math.max(...on)}`);
    assert.ok(Math.max(...on) <= Math.max(...off), `${template}: só sobe, nunca desce`);
  }
});

test('área segura: linhas mais curtas (não invadem a coluna de botões)', () => {
  const meta = { width: 1080, height: 1920 };
  const on = Math.max(...lineLens(buildAss(segments, meta, { template: 'clean' })));
  const off = Math.max(...lineLens(buildAss(segments, meta, { template: 'clean', safeZone: false })));
  assert.ok(on < off, `${on} < ${off}`);
});

test('área segura: vídeo horizontal não muda', () => {
  const meta = { width: 1920, height: 1080 };
  assert.equal(buildAss(segments, meta, { template: 'clean' }), buildAss(segments, meta, { template: 'clean', safeZone: false }));
  assert.deepEqual(safeCaptionBox({ w: 1920, h: 1080, kind: 'bottom', marginV: 0.14 }), { marginV: 0.14, widthFrac: 0.86 });
  assert.equal(safeCaptionBox({ w: 1080, h: 1920, kind: 'center', marginV: 0 }).marginV, 0);
});
