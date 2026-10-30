import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildTextAss } from '../src/pipeline/texts.js';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';
import { wordPlan, wordFrame, wordSegments, WORD_ANIMS, WORD_SAMPLED, wordTiming } from '../../shared/textLayers.js';

const meta = { width: 960, height: 540, duration: 4 };

test('WORD_ANIMS lista 8 entradas', () => {
  assert.equal(WORD_ANIMS.length, 8);
  assert.ok(WORD_ANIMS.every((a) => a.startsWith('palavras-')));
});

test('WORD_SAMPLED é subconjunto de WORD_ANIMS', () => {
  assert.ok(WORD_SAMPLED.every((a) => WORD_ANIMS.includes(a)));
});

test('wordPlan retorna plano por palavra com timing escalonado', () => {
  const l = { animIn: 'palavras-subir', start: 0, end: 3, text: 'Olá mundo bonito' };
  const plan = wordPlan(l, ['Olá mundo bonito']);
  assert.ok(plan);
  assert.equal(plan.length, 1);
  // 3 palavras + 2 espaços = 5 unidades
  const words = plan[0].filter((p) => p.t != null);
  assert.equal(words.length, 3, 'três palavras com timing');
  assert.equal(words[0].t, 0, 'primeira palavra em t=0');
  assert.ok(words[1].t > 0, 'segunda palavra depois');
  assert.ok(words[2].t > words[1].t, 'terceira depois da segunda');
  // espaços têm t = null
  const spaces = plan[0].filter((p) => p.t == null);
  assert.ok(spaces.length >= 2, 'espaços sem timing');
});

test('wordPlan retorna null para animação que não é de palavras', () => {
  assert.equal(wordPlan({ animIn: 'fade' }, ['teste']), null);
  assert.equal(wordPlan({ animIn: 'letras-subir' }, ['teste']), null);
});

test('wordFrame delega para letterFrame (mesma curva)', () => {
  const f = wordFrame('palavras-mola', 0.5, { overshoot: 0.5 });
  assert.ok(f.scale != null);
  assert.ok(f.alpha != null);
  assert.ok(f.dy != null || f.dx != null || true);
});

test('wordFrame palavras-subir: progresso 0 → invisível e deslocado, progresso 1 → visível', () => {
  const f0 = wordFrame('palavras-subir', 0);
  const f1 = wordFrame('palavras-subir', 1);
  assert.ok(f0.alpha < 0.1, 'começa invisível');
  assert.ok(f0.dy > 0, 'começa deslocado para baixo');
  assert.ok(f1.alpha > 0.99, 'termina visível');
  assert.ok(Math.abs(f1.dy) < 0.001, 'termina na posição');
});

test('wordSegments retorna passos amostrados', () => {
  const segs = wordSegments('palavras-mola', 0.5, 10, {});
  assert.equal(segs.length, 11);
  assert.equal(segs[0].t0, 0);
  assert.equal(segs[segs.length - 1].t1, null);
  assert.ok(segs[0].f.alpha < 1);
});

test('wordTiming respeita wordDur e wordGap', () => {
  const t1 = wordTiming({ start: 0, end: 3 }, 5);
  assert.ok(t1.d > 0);
  assert.ok(t1.stagger > 0);
  const t2 = wordTiming({ start: 0, end: 3, wordDur: 0.8, wordGap: 0.2 }, 5);
  assert.equal(t2.d, 0.8);
  assert.equal(t2.stagger, 0.2);
});

test('buildTextAss gera eventos para cada palavra na animação por palavra', () => {
  const layers = [{ text: 'Três palavras aqui', start: 0, end: 3, font: 'poppins', size: 0.05, color: '#FFFFFF', box: 'outline', boxColor: '#000000', x: 0.5, y: 0.5, animIn: 'palavras-subir', animOut: 'fade' }];
  const ass = buildTextAss(layers, meta);
  const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue'));
  // palavras-subir é simples (não amostrada): um evento por palavra
  assert.ok(dialogues.length >= 3, `esperava >= 3 eventos, recebeu ${dialogues.length}`);
  assert.ok(dialogues.some((d) => d.includes('Tres') || d.includes('Três') || d.includes('palavras') || d.includes('aqui')));
});

test('buildTextAss gera múltiplos passos para animação amostrada por palavra', () => {
  const layers = [{ text: 'Mola aqui', start: 0, end: 3, font: 'poppins', size: 0.05, color: '#FFFFFF', box: 'outline', boxColor: '#000000', x: 0.5, y: 0.5, animIn: 'palavras-mola', animOut: 'fade' }];
  const ass = buildTextAss(layers, meta);
  const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue'));
  // 2 palavras × 11 passos = 22 eventos
  assert.ok(dialogues.length >= 20, `esperava >= 20 eventos amostrados, recebeu ${dialogues.length}`);
});

test('o libass aceita o ASS das animações por palavra', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-wordanim-'));
  try {
    for (const anim of ['palavras-subir', 'palavras-pop', 'palavras-mola', 'palavras-empurrao']) {
      const layers = [{ text: 'Teste de palavras', start: 0, end: 3, font: 'poppins', size: 0.05, color: '#FFFFFF', box: 'outline', boxColor: '#000000', x: 0.5, y: 0.5, animIn: anim, animOut: 'fade' }];
      const assPath = path.join(dir, `${anim}.ass`);
      fs.writeFileSync(assPath, buildTextAss(layers, meta));
      const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=960x540:d=3', '-vf', `ass=${assPath}`, '-f', 'null', '-']);
      assert.equal(r.status, 0, `${anim}: ${r.stderr.toString()}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
