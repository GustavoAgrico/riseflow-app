import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { brandIn, entityQuery, findEntityMentions, withEntityMoments } from '../src/pipeline/entities.js';
import { insertBroll } from '../src/pipeline/broll.js';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-ent-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// frase com tempos de palavra (0,5 s cada)
function seg(text, t0 = 0) {
  const words = text.split(' ').map((w, i) => ({ word: w, start: t0 + i * 0.5, end: t0 + i * 0.5 + 0.45 }));
  return { start: t0, end: t0 + words.length * 0.5, text, words };
}

test('marca digitada ou falada: nome oficial e busca do logo', () => {
  assert.equal(brandIn('nike'), 'Nike');
  assert.equal(brandIn('tênis da Nike,'), 'Nike');
  assert.equal(brandIn('coca cola gelada'), 'Coca-Cola');
  assert.equal(brandIn('banco do brasil'), 'Banco do Brasil');
  assert.equal(brandIn('bater a meta do mês'), null, '"meta" é palavra comum');
  assert.equal(entityQuery('Apple', 'brand'), 'Apple logo');
  assert.equal(entityQuery('Elon Musk', 'person'), 'Elon Musk');
});

test('acha marcas (com ou sem maiúscula) e nomes próprios compostos na fala', () => {
  const segs = [
    seg('Quando a apple lançou o iPhone tudo mudou.', 0),
    seg('O Elon Musk falou isso em São Paulo ontem.', 10),
    seg('Eu comprei um tênis da Nike e da Nike de novo.', 20),
  ];
  const got = findEntityMentions(segs);
  assert.deepEqual(got.map((e) => [e.name, e.kind]), [['Apple', 'brand'], ['iPhone', 'brand'], ['Elon Musk', 'name'], ['São Paulo', 'name'], ['Nike', 'brand']]);
  assert.equal(got.find((e) => e.name === 'Apple').start, 1, 'tempo da palavra');
  assert.equal(got.filter((e) => e.name === 'Nike').length, 1, 'cada nome uma vez');
});

test('momentos com nome têm prioridade e tiram o genérico do mesmo trecho', () => {
  const segs = [seg('Hoje vou falar da Nike e de liderança no time todo dia', 0)];
  const generic = [{ start: 1, end: 4, query: 'leadership' }, { start: 5, end: 7, query: 'team meeting' }];
  const out = withEntityMoments(generic, segs, { duration: 30, max: 6 });
  const nike = out.find((m) => m.entity === 'Nike');
  assert.ok(nike, 'Nike entra');
  assert.equal(nike.query, 'Nike logo');
  assert.equal(nike.entityKind, 'brand');
  assert.ok(!out.some((m) => m.query === 'leadership'), 'genérico no mesmo trecho sai');
  assert.ok(out.some((m) => m.query === 'team meeting'));
  // limite: nomes primeiro
  assert.deepEqual(withEntityMoments(generic, segs, { duration: 30, max: 1 }).map((m) => m.entity), ['Nike']);
  // sem nomes: nada muda
  assert.equal(withEntityMoments(generic, [seg('só uma frase comum aqui', 0)], {}), generic);
});

test('render: logo entra inteiro e centralizado num fundo claro', { timeout: 60000 }, async () => {
  const video = path.join(tmp, 'v.mp4');
  spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=360x640:r=30:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', video]);
  // "logo" largo e transparente (1000x200): cortado para preencher, sumiria pela metade
  const logo = path.join(tmp, 'logo.png');
  spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black@0.0:s=1000x200,format=rgba,drawbox=x=0:y=0:w=1000:h=200:color=black@1:t=fill', '-frames:v', '1', '-y', logo]);
  const work = fs.mkdtempSync(path.join(tmp, 'w-'));
  const r = await insertBroll(video, work, { width: 360, height: 640, duration: 3, hasAudio: false }, { brollMoments: [] },
    { brollPlan: [{ start: 0.5, end: 2.5, kind: 'image', file: logo, logo: true }] });
  assert.equal(r.inserted, 1);
  const px = (x, y) => {
    const o = spawnSync(ffmpegPath, ['-v', 'error', '-ss', '1.5', '-i', r.output, '-frames:v', '1', '-vf', `crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer' });
    return [...o.stdout];
  };
  const bg = px(10, 10);
  assert.ok(bg.every((v) => v > 220), `fundo claro no canto: ${bg}`);
  const mid = px(180, 320);
  assert.ok(mid.every((v) => v < 40), `logo no centro: ${mid}`);
  // o logo cabe inteiro: as pontas (66% da largura) ficam dentro do quadro e o resto é fundo
  assert.ok(px(70, 320).every((v) => v < 40), 'ponta esquerda do logo visível');
  assert.ok(px(5, 320).every((v) => v > 220), 'fora do logo: fundo');
});
