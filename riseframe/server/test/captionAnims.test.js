import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildAss, CAPTION_ANIMATIONS } from '../src/pipeline/captions.js';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';

const words = [
  { word: 'Motion', start: 0.2, end: 0.6 },
  { word: 'ready', start: 0.6, end: 1.1 },
  { word: 'now', start: 1.1, end: 1.6 },
];
const segments = [{ start: 0, end: 2, text: 'Motion ready now', words }];
const meta = { width: 960, height: 540, duration: 2.5 };
const dialogues = (ass) => ass.split('\n').filter((l) => l.startsWith('Dialogue'));

test('animações novas aparecem nas opções da legenda', () => {
  assert.ok(CAPTION_ANIMATIONS.zoomblur);
  assert.ok(CAPTION_ANIMATIONS.typewriter);
});

test('zoom com desfoque: entra grande e desfocado, assenta no tamanho final', () => {
  const ass = buildAss(segments, meta, { template: 'clean', animation: 'zoomblur', color: 'white' });
  assert.match(dialogues(ass)[0], /\\fscx150\\fscy150\\be8\\t\(0,260,\\fscx100\\fscy100\\be0\)/);
});

test('máquina de escrever (frase): uma linha só, letras escondidas e reveladas no tempo da palavra', () => {
  const ass = buildAss(segments, meta, { template: 'clean', animation: 'typewriter', color: 'white' });
  const ev = dialogues(ass);
  assert.equal(ev.length, 1, 'uma linha por frase');
  // "Motion" tem 6 letras entre 0,2 s e 0,6 s: a 2ª letra aparece em 0,267 s (67 ms depois do começo)
  assert.ok(ev[0].includes('{\\alpha&HFF&\\t(67,68,\\alpha&H00&)}o'), 'letra 2 de "Motion" no tempo certo');
  // o cursor de cada palavra pisca de 0,5 em 0,5 s dentro da palavra
  assert.ok(ev[0].includes('\\t(900,901,\\alpha&HFF&)'), 'cursor de "ready" pisca em 0,5 s');
  assert.ok(ev[0].includes('|{\\alpha&H00&}'), 'cursor com a opacidade devolvida ao texto');
});

test('máquina de escrever (destaque): uma linha por palavra; palavras futuras escondidas', () => {
  const ass = buildAss(segments, meta, { template: 'karaoke', animation: 'typewriter', highlight: true, color: 'white' });
  const ev = dialogues(ass);
  assert.equal(ev.length, words.length, 'um evento por palavra');
  // no primeiro evento, "READY" e "NOW" (futuras) estão escondidas
  assert.ok(ev[0].includes('{\\alpha&HFF&}READY'), 'futura escondida');
});

test('máquina de escrever no modo palavra por vez cai no fade (sem letras nem cursor)', () => {
  const ass = buildAss(segments, meta, { template: 'pop', mode: 'word', animation: 'typewriter', color: 'white' });
  const ev = dialogues(ass);
  assert.ok(ev.length > 0);
  assert.ok(ev.every((l) => !l.includes('|')), 'sem cursor');
  assert.ok(ev.every((l) => !/\\alpha&HFF&\\t\(/.test(l)), 'sem revelação por letra');
});

test('o libass aceita o ASS das duas animações novas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-capanim-'));
  try {
    for (const [tpl, anim, hl] of [['clean', 'typewriter', false], ['karaoke', 'typewriter', true], ['clean', 'zoomblur', false]]) {
      const assPath = path.join(dir, `${anim}-${hl}.ass`);
      fs.writeFileSync(assPath, buildAss(segments, meta, { template: tpl, animation: anim, highlight: hl, color: 'white' }));
      const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=960x540:d=2', '-vf', `ass=${assPath}`, '-f', 'null', '-']);
      assert.equal(r.status, 0, `${anim}: ${r.stderr.toString()}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('animações no estilo do After Effects (Animation Kit): tags certas e o libass desenha todas', () => {
  const NEW = ['tracking', 'blurin', 'flip', 'swing', 'stretch', 'elastic', 'skew'];
  for (const a of NEW) assert.ok(CAPTION_ANIMATIONS[a], a);
  const tag = (anim, extra = {}) => dialogues(buildAss(segments, meta, { template: 'clean', animation: anim, color: 'white', ...extra }))[0];
  assert.match(tag('tracking'), /\\fsp[\d.]+\\t\(0,300,\\fsp[\d.]+\)/);
  assert.match(tag('blurin'), /\\blur14\\t\(0,300,\\blur0\)/);
  assert.match(tag('flip'), /\\frx-90\\t\(0,280,\\frx0\)/);
  assert.match(tag('swing'), /\\fry80\\t\(0,300,\\fry0\)/);
  assert.match(tag('skew'), /\\fax-0\.35\\t\(0,240,\\fax0\)/);
  // no neon, o desfoque de entrada termina no brilho (sem o \blur3 fixo apagando a animação)
  const neon = dialogues(buildAss(segments, meta, { template: 'neon', animation: 'blurin', color: 'white' }))[0];
  assert.match(neon, /\\blur14\\t\(0,300,\\blur3\)/);
  assert.ok(!/\\t\(0,300,\\blur3\)\\blur3/.test(neon));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-anim-ae-'));
  try {
    for (const a of NEW) {
      const assPath = path.join(dir, `${a}.ass`);
      fs.writeFileSync(assPath, buildAss(segments, meta, { template: 'pop', animation: a, color: 'white' }));
      const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=960x540:d=2', '-vf', `ass=${assPath}`, '-f', 'null', '-']);
      assert.equal(r.status, 0, `${a}: ${r.stderr.toString()}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
