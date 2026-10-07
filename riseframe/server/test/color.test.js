import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { computeStats, computeGrade, analyzeAndGrade } from '../src/pipeline/autoColor.js';
import { config } from '../src/config.js';

test('computeStats: médias de canal a partir de rgb24', () => {
  // 2 pixels: (200,100,50) e (0,100,150) → médias (100,100,100)
  const buf = Buffer.from([200, 100, 50, 0, 100, 150]);
  const s = computeStats(buf);
  assert.equal(s.pixels, 2);
  assert.equal(s.meanR, 100);
  assert.equal(s.meanG, 100);
  assert.equal(s.meanB, 100);
  assert.equal(s.warmBias, 0);
});

const baseStats = { meanR: 120, meanG: 120, meanB: 120, luma: 120, contrast: 50, saturation: 0.3, shadowFrac: 0.1, highlightFrac: 0.05, warmBias: 0 };

test('computeGrade: branco azulado (luz fria) → esquenta, com look natural', () => {
  const g = computeGrade({ ...baseStats, white: { r: 200, g: 220, b: 245, sat: 0.18 } });
  assert.ok(g.adjustments.whiteBalance.rGain > 1, 'ganha no vermelho (esquenta)');
  assert.ok(g.adjustments.whiteBalance.bGain < 1, 'reduz azul');
  assert.equal(g.look, 'natural');
  assert.ok(g.vf.includes('colorchannelmixer'), 'cadeia tem balanço de branco');
  assert.doesNotMatch(g.vf, /colorbalance|unsharp/, 'sem teal & orange nem nitidez artificial');
});

test('computeGrade: branco amarelado (lâmpada) → esfria', () => {
  const g = computeGrade({ ...baseStats, white: { r: 245, g: 225, b: 180, sat: 0.27 } });
  assert.ok(g.adjustments.whiteBalance.rGain < 1, 'reduz vermelho');
  assert.ok(g.adjustments.whiteBalance.bGain > 1, 'ganha no azul (esfria)');
});

test('computeGrade: luz já neutra → não mexe na cor (mesmo com fundo colorido dominando)', () => {
  const g = computeGrade({ ...baseStats, meanR: 170, meanG: 150, meanB: 115, warmBias: 55, white: { r: 240, g: 240, b: 238, sat: 0.01 } });
  assert.deepEqual(g.adjustments.whiteBalance, { rGain: 1, gGain: 1, bGain: 1 });
  assert.doesNotMatch(g.vf, /colorchannelmixer/);
});

test('computeGrade: "branco" muito colorido não é branco → não corrige', () => {
  const g = computeGrade({ ...baseStats, white: { r: 230, g: 150, b: 60, sat: 0.74 } });
  assert.deepEqual(g.adjustments.whiteBalance, { rGain: 1, gGain: 1, bGain: 1 });
});

test('computeGrade: vídeo escuro → clareia pelos tons médios (gamma), sem levantar o preto', () => {
  const g = computeGrade({ ...baseStats, luma: 70 });
  assert.ok(g.adjustments.gamma > 1.1, 'gamma clareia');
  assert.doesNotMatch(g.vf, /brightness/, 'sem brightness (que deixa o preto acinzentado)');
});

test('analyzeAndGrade: analisa um clipe real com cast azul e corrige', async () => {
  const tmp = path.join(config.paths.work, 'colortest_' + Date.now());
  await fs.mkdir(tmp, { recursive: true });
  const clip = path.join(tmp, 'blue.mp4');
  const r = spawnSync(ffmpegPath, [
    '-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=0x4060B0:s=320x240:d=3:r=10',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', clip,
  ], { stdio: 'ignore' });
  assert.equal(r.status, 0, 'gerou o clipe azul');

  const grade = await analyzeAndGrade(clip);
  assert.ok(grade.stats.warmBias < 0, 'detectou cast frio (azul)');
  assert.ok(grade.adjustments.whiteBalance.rGain >= 1, 'correção esquenta a imagem');
  assert.ok(grade.adjustments.whiteBalance.bGain <= 1, 'correção reduz o azul');

  await fs.rm(tmp, { recursive: true, force: true });
});

test('manualAdjustVf: tudo em zero → sem filtro; valores viram eq + colorbalance', async () => {
  const { manualAdjustVf, sanitizeColorAdjust } = await import('../src/pipeline/color.js');
  assert.equal(manualAdjustVf({}), null);
  assert.equal(manualAdjustVf({ brightness: 0, contrast: 0, saturation: 0, temperature: 0 }), null);
  const vf = manualAdjustVf({ brightness: 50, contrast: 100, saturation: -100, temperature: 100 });
  assert.ok(vf.includes('eq=brightness=0.06:contrast=1.35:saturation=0.2'), vf);
  assert.ok(vf.includes('colorbalance=rs=0.08:bs=-0.08'), 'quente puxa vermelho e tira azul');
  assert.ok(manualAdjustVf({ temperature: -50 }).includes('rs=-0.04:bs=0.04'), 'frio faz o contrário');
  assert.deepEqual(sanitizeColorAdjust({ brightness: 999, contrast: 'x' }), { brightness: 100, contrast: 0, saturation: 0, temperature: 0 });
});

test('fastColorChain: troca colorbalance/colorchannelmixer (lentos) por uma curves', async () => {
  const { fastColorChain, LOOKS } = await import('../src/pipeline/color.js');
  const out = fastColorChain(LOOKS['teal-orange']);
  assert.ok(!out.includes('colorbalance'), out);
  assert.ok(out.startsWith('eq=') && out.includes("curves=r='0/0 ") && out.endsWith('unsharp=3:3:0.5'), out);
  // Cinza médio não muda com colorbalance neutro nos médios; sombras do azul sobem (teal).
  const b = /:b='([^']+)'/.exec(out)[1].split(' ');
  assert.equal(b[0], '0/0.063');
  const wb = fastColorChain('colorchannelmixer=rr=1.1:gg=1:bb=0.9,eq=contrast=1.1');
  assert.ok(wb.startsWith('curves=') && wb.includes("0.5/0.55") && wb.endsWith('eq=contrast=1.1'), wb);
  assert.equal(fastColorChain('eq=contrast=1.1'), 'eq=contrast=1.1');
  assert.equal(fastColorChain('colorchannelmixer=aa=0.5'), 'colorchannelmixer=aa=0.5', 'mistura/alpha fica como está');
});
