import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanKey, VIDEO_FX, VIDEO_FX_CSS } from '../../shared/textLayers.js';
import { keyVf } from '../src/pipeline/overlay.js';
import { videoFxVf } from '../src/pipeline/videofx.js';
import { cleanAudiogram, audiogramFilter } from '../../shared/audiogram.js';

test('chroma key: verde/azul viram a cor certa, com limites e tirando o vazamento', () => {
  assert.deepEqual(cleanKey({ color: 'green' }), { color: '#00FF00', similarity: 0.3, smooth: 0.08, spill: 'green' });
  assert.equal(cleanKey({ color: 'blue', similarity: 9 }).similarity, 0.6);
  assert.equal(cleanKey({ color: 'blue' }).spill, 'blue');
  assert.equal(cleanKey({ color: '#ff00ff' }).spill, null);
  assert.equal(cleanKey({ color: 'roxo' }), null);
  assert.equal(cleanKey(null), null);
  assert.equal(keyVf({ color: 'green' }), ',format=rgba,colorkey=0x00FF00:0.3:0.08,despill=type=green:mix=0.5:expand=0');
  assert.equal(keyVf(null), '');
});

test('efeitos de tempo: eco, rastro, fantasma e realce, só na janela', () => {
  for (const id of ['echo', 'trails', 'ghost', 'motionpop']) {
    assert.ok(VIDEO_FX[id], id);
    assert.ok(Object.hasOwn(VIDEO_FX_CSS, id), id);
  }
  const vf = videoFxVf([{ effect: 'echo', start: 1, end: 2 }, { effect: 'trails', start: 3, end: 4 }]);
  assert.match(vf, /^tmix=frames=6:weights='1 0\.8 0\.6 0\.45 0\.3 0\.2':enable='between\(t,1\.000,2\.000\)',lagfun=decay=0\.95:enable='between\(t,3\.000,4\.000\)'$/);
});

test('audiograma: opções validadas e filtro com o áudio por cima do vídeo', () => {
  assert.equal(cleanAudiogram(null), null);
  assert.equal(cleanAudiogram({ enabled: false }), null);
  assert.deepEqual(cleanAudiogram({ style: 'x', position: 'y', color: 'z', height: 9 }), { style: 'wave', position: 'bottom', color: '#FFFFFF', height: 0.4, opacity: 0.9 });
  const wave = audiogramFilter({ style: 'wave', color: '#ff6b35' }, { W: 1080, H: 1920, fps: 30 });
  assert.match(wave, /^\[0:a\]aformat=channel_layouts=mono,showwaves=s=972x268:mode=cline:rate=30:scale=sqrt:draw=full:colors=0xFF6B35,format=rgba,colorchannelmixer=aa=0.9\[ag\];\[0:v\]\[ag\]overlay=54:1498:/);
  const bars = audiogramFilter({ style: 'bars', position: 'top' }, { W: 1080, H: 1920, fps: 30 });
  assert.match(bars, /showfreqs=.*overlap=0.*fps=30/); // overlap=0: sem isso o espectro gera quadros demais
  assert.match(bars, /overlay=54:154:/);
});
