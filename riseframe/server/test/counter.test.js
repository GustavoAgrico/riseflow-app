import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { countText, countTarget, countDur, expandCounterLayers, cleanTextLayers } from '../../shared/textLayers.js';
import { buildTextAss } from '../src/pipeline/texts.js';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';

const meta = { width: 1080, height: 1920 };
const base = { text: '25.000 vendas', start: 1, end: 5, count: true };

test('contador: lê o número (com separador de milhar) e formata com pontos', () => {
  assert.equal(countTarget('25.000 vendas'), 25000);
  assert.equal(countTarget('sem número'), null);
  assert.equal(countText(base, 0), '0 vendas');
  assert.equal(countText(base, countDur(base)), '25.000 vendas');
  assert.match(countText(base, countDur(base) / 2), /^\d{1,3}(\.\d{3})* vendas$/);
});

test('contador: sobe sem passar do valor e desacelera (metade do caminho em menos da metade do tempo)', () => {
  const d = countDur(base);
  const half = Number(countText(base, d * 0.5).match(/[\d.]+/)[0].replace(/\./g, ''));
  assert.ok(half > 25000 * 0.5, `metade em ${half}`);
  let prev = -1;
  for (let t = 0; t <= d + 0.5; t += 0.05) {
    const v = Number(countText(base, t).match(/[\d.]+/)[0].replace(/\./g, ''));
    assert.ok(v >= prev && v <= 25000, 'sobe e não passa');
    prev = v;
  }
});

test('contador: a limpeza guarda o campo só quando há número', () => {
  const [a] = cleanTextLayers([{ ...base }]);
  const [b] = cleanTextLayers([{ text: 'sem número', start: 1, end: 5, count: true }]);
  assert.equal(a.count, true);
  assert.ok(!('count' in b));
});

test('contador no ASS: vira vários passos, com números crescentes, e o libass aceita o arquivo', () => {
  const layers = expandCounterLayers(cleanTextLayers([{ ...base }]));
  assert.ok(layers.length >= 10, `${layers.length} passos`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-counter-'));
  try {
    const f = path.join(dir, 'counter.ass');
    const ass = buildTextAss(cleanTextLayers([{ ...base }]), meta);
    fs.writeFileSync(f, ass);
    assert.ok(ass.includes('25.000 vendas'), 'valor final no ASS');
    const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1080x1920:d=6', '-vf', `ass=${f}`, '-f', 'null', '-']);
    assert.equal(r.status, 0, r.stderr.toString());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
