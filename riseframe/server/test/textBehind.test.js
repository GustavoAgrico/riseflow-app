import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { behindPlan, behindAss, behindFilter, ensureMaskModel, behindFontSize, BEHIND_FILL } from '../src/pipeline/textBehind.js';
import { fontMetrics } from '../src/pipeline/fontMetrics.js';

const seg = (t0, text) => {
  let t = t0;
  const words = text.split(' ').map((w) => { const o = { word: w, start: +t.toFixed(2), end: +(t + 0.28).toFixed(2) }; t += 0.3; return o; });
  return { start: t0, end: t, text, words };
};
const SEGS = [seg(0.5, 'é ter seguidores qualificados'), seg(2.5, 'que compram de você'), seg(8, 'não coloca dinheiro no bolso'), seg(16, 'todo santo dia você posta')];

test('texto atrás da pessoa: palavra-chave da frase, espaçada, fora do motion/B-roll', () => {
  const plan = behindPlan(SEGS, 30);
  assert.ok(plan.length >= 2);
  assert.equal(plan[0].text, 'QUALIFICADOS');
  for (let i = 1; i < plan.length; i += 1) assert.ok(plan[i].start >= plan[i - 1].end + 6, 'uma a cada 6 s');
  for (const p of plan) assert.ok(p.end - p.start >= 0.8 && p.end - p.start <= 2.21);
  const ex = behindPlan(SEGS, 30, { exclude: [{ start: 7.5, end: 10 }] });
  assert.ok(!ex.some((p) => p.text === 'DINHEIRO'), 'dentro do motion não entra');
});

test('ASS das palavras gigantes e filtro de composição (texto onde não é pessoa)', () => {
  const ass = behindAss([{ start: 1, end: 3, text: 'DINHEIRO' }], { width: 1080, height: 1920 });
  assert.match(ass, /PlayResX: 1080/);
  assert.match(ass, /Dialogue: 0,0:00:01\.00,0:00:03\.00,Behind,,0,0,0,,\{\\pos\(540,480\)\\fs\d+/); // 25% da altura
  const f = behindFilter({ width: 1080, height: 1920 });
  assert.match(f, /subtitles=behind\.ass:fontsdir=fonts/);
  assert.match(f, /\[a\]\[b\]\[m\]maskedmerge/);
});

test('texto atrás: palavra ocupa ~94% da largura (medida da Anton), sem passar da borda', () => {
  const m = fontMetrics('Anton');
  for (const word of ['EMPREENDEDORES', 'QUALIFICADOS', 'DINHEIRO']) {
    const fs = behindFontSize(word, { width: 1080, height: 1920 });
    const px = (m.width(word) * fs) / m.cell; // largura na tela (ASS: tamanho = em × célula)
    assert.ok(px <= 1080 * BEHIND_FILL + 2, `${word} cabe (${Math.round(px)} px)`);
    assert.ok(px >= 1080 * 0.9 || fs === Math.round(1920 * 0.35), `${word} grande (${Math.round(px)} px)`);
  }
  // antes: EMPREENDEDORES saía com ~57% da largura
  assert.ok(behindFontSize('EMPREENDEDORES', { width: 1080, height: 1920 }) > 161 * 1.5);
});

test('modelo de recorte: download que não confere é recusado (o vídeo segue sem o efeito)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-mask-'));
  try {
    const fake = async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array(10).buffer });
    assert.equal(await ensureMaskModel({ fetchImpl: fake, dir }), null);
    assert.ok(!fs.existsSync(path.join(dir, 'u2net_human_seg.onnx')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
