import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir } from '../testkit/tmp.js';

// pasta de dados só deste teste (as referências ficam nela)
const DATA = tmpDir('rf-mdir-');
process.env.DATA_DIR = DATA;
const { speechLines, sceneCount, cleanDirectorScenes, directMotion } = await import('../src/pipeline/motionDirector.js');
const refs = await import('../src/pipeline/motionRefs.js');
const { promptMotionSfx, sanitizePromptSpec } = await import('../../shared/promptMotion.js');
const { ffmpegPath } = await import('../src/pipeline/ffmpeg.js');

const words = (text, t0) => text.split(' ').map((w, i) => ({ word: w, start: t0 + i * 0.3, end: t0 + i * 0.3 + 0.25 }));
const SEGS = [
  { start: 0, end: 4, words: words('Em 30 dias eu saí de 2 mil para 40 mil seguidores.', 0) },
  { start: 8, end: 12, words: words('São três passos: conteúdo, constância e oferta.', 8) },
  { start: 16, end: 20, words: words('Comenta EU QUERO que eu te mando o método.', 16) },
];
const scene = (start, end, extra = {}) => ({ start, end, why: 'teste', spec: { title: `c${start}`, elements: [{ type: 'counter', to: 40000, at: 0.3 }, { type: 'text', text: 'seguidores', at: 1, y: 0.6 }], ...extra } });

test('diretor: a fala vira linhas com tempo e a quantidade de cenas segue o tamanho do vídeo', () => {
  const lines = speechLines(SEGS);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^\[0\.00–3\.55\] Em 30 dias/);
  assert.equal(sceneCount(60, 'chave'), 2);
  assert.equal(sceneCount(15, 'chave'), 1);
  assert.equal(sceneCount(140, 'muitos'), 10);
  assert.equal(sceneCount(600, 'chave'), 5);
});

test('diretor: cenas da IA validadas (dentro do vídeo, 2–9 s, sem sobrepor, roteiro seguro)', () => {
  const got = cleanDirectorScenes({ scenes: [
    scene(16, 21), scene(0.2, 4.5), scene(3, 7), // sobrepõe a de 0,2 s: sai
    scene(9, 30), // longa demais: corta em 9 s
    { start: 12, end: 13, spec: scene(0, 1).spec }, // curta demais
    { start: 25, end: 29, spec: { elements: [{ type: 'hack' }] } }, // sem peça válida
  ] }, 22);
  assert.deepEqual(got.map((s) => [s.start, s.end]), [[0.2, 4.5], [9, 18], [20, 22]].slice(0, 2), 'a de 16 s sobrepõe a de 9–18 s e sai');
  assert.ok(got.every((s, i) => i === 0 || s.start >= got[i - 1].end + 1.5), 'sem sobrepor');
  assert.ok(got.every((s) => s.end - s.start >= 2 && s.end - s.start <= 9 && s.end <= 22));
  assert.ok(got.every((s) => s.style === 'prompt' && s.spec.duration === +(s.end - s.start).toFixed(2)));
});

test('diretor: o Claude cria as cenas, revisa olhando os quadros e o som entra junto', async () => {
  const calls = [];
  const ask = async (system, content, cfg, opts) => {
    calls.push({ system, content, opts });
    if (opts.task === 'motion') return JSON.stringify({ scenes: [scene(0.2, 4), scene(8.2, 12, { elements: [{ type: 'list', items: ['conteúdo', 'constância', 'oferta'], at: 0.5 }] })] });
    // revisão: devolve a cena 0 com o texto subido
    const sp = JSON.parse(JSON.stringify(scene(0.2, 4).spec));
    sp.elements[1].y = 0.5;
    return JSON.stringify({ scenes: [{ index: 0, spec: sp, review: 'subi o texto' }, { index: 1, review: 'sem ajustes' }] });
  };
  const guide = refs.sanitizeGuide({ summary: 'Escuro com laranja, tipografia condensada', palette: { accent: '#FF6B35', bg: '#000000' }, rules: ['números gigantes com brilho'] });
  const r = await directMotion({ segments: SEGS, duration: 22, guide }, { anthropicKey: 'x' }, { ask });
  assert.equal(r.source, 'ia');
  assert.equal(r.scenes.length, 2);
  assert.equal(r.scenes[0].spec.elements[1].y, 0.5, 'correção da revisão aplicada');
  assert.deepEqual(r.notes, ['cena 1: subi o texto']);
  // o guia das referências vai nas instruções; a fala com os tempos vai na mensagem
  assert.match(calls[0].system, /GUIA DE ESTILO DO USUÁRIO/);
  assert.match(calls[0].system, /números gigantes com brilho/);
  assert.match(calls[0].content, /\[0\.00–3\.55\] Em 30 dias/);
  assert.equal(calls[0].opts.task, 'motion');
  // revisão com imagens de verdade
  const imgs = calls[1].content.filter((c) => c.type === 'image');
  assert.equal(imgs.length, 6);
  assert.equal(Buffer.from(imgs[0].source.data, 'base64').subarray(1, 4).toString(), 'PNG');
  // desenho de som: o contador chega com batida, a lista tem "pop" por item
  assert.ok(r.sfx.some((m) => m.why === 'contador chegou' && m.t > 0.2));
  assert.ok(r.sfx.some((m) => m.why === 'item da lista' && m.t >= 8.2));
});

test('diretor: sem IA (ou se ela falhar) entra o Premium por regras — o vídeo nunca fica sem motion', async () => {
  const none = await directMotion({ segments: SEGS, duration: 22 }, {});
  assert.equal(none.source, 'regras');
  const broken = await directMotion({ segments: SEGS, duration: 22 }, { anthropicKey: 'x' }, { ask: async () => 'não é json', review: false });
  assert.equal(broken.source, 'regras');
  assert.match(broken.notes[0], /IA indisponível/);
});

test('desenho de som: sons existentes, sem repetir colado, no máximo 7', () => {
  const spec = sanitizePromptSpec({ duration: 5, elements: [
    { type: 'transition', at: 0.1 }, { type: 'text', text: 'TÍTULO', size: 0.08, at: 0.12 },
    { type: 'counter', to: 997, prefix: 'R$ ', at: 1, count: 1 }, { type: 'particles', kind: 'burst', at: 2.5 },
    { type: 'ui', kind: 'button', text: 'Quero', at: 3, in: { fx: 'pop', dur: 0.3 } },
  ] });
  const all = promptMotionSfx(spec, 10);
  assert.ok(all.length <= 7);
  assert.ok(all.every((m, i) => i === 0 || m.t - all[i - 1].t >= 0.3));
  assert.ok(all.some((m) => m.type === 'cash' && Math.abs(m.t - 12) < 0.01), 'dinheiro chega com som de caixa');
  // só sons que existem no app
  const few = promptMotionSfx(spec, 0, new Set(['whoosh', 'pop']));
  assert.ok(few.length && few.every((m) => ['whoosh', 'pop'].includes(m.type)));
});

test('referências: a pasta guarda imagens e vídeos, e o Claude aprende o guia olhando quadros', async () => {
  const src = path.join(DATA, 'src');
  fs.mkdirSync(src, { recursive: true });
  spawnSync(ffmpegPath, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=320x568:d=1', '-frames:v', '1', path.join(src, 'ref.png')]);
  spawnSync(ffmpegPath, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=320x568:d=2:r=15', '-pix_fmt', 'yuv420p', path.join(src, 'motion.mp4')]);
  const a = await refs.addRef('u1', path.join(src, 'ref.png'), 'Minha Ref!.png');
  const b = await refs.addRef('u1', path.join(src, 'motion.mp4'), 'motion.mp4');
  await assert.rejects(() => refs.addRef('u1', path.join(src, 'ref.png'), 'nota.txt'), /imagens|vídeos/);
  assert.equal(a, 'Minha_Ref_.png');
  let list = await refs.listRefs('u1');
  assert.deepEqual(list.files.map((f) => f.kind).sort(), ['image', 'video']);
  assert.equal((await refs.listRefs('outra')).files.length, 0, 'cada pessoa tem a sua pasta');
  let seen;
  const guide = await refs.learnGuide('u1', { anthropicKey: 'x' }, async (system, content) => {
    seen = content;
    return JSON.stringify({ summary: 'Escuro, condensado, laranja', palette: { bg: '#0A0A0A', accent: '#FF6B35', bad: 'x' }, fonts: ['display', 'comic'], inFx: ['mask-up', 'explode'], pace: 'rapido', rules: ['número sempre gigante'] });
  });
  const imgs = seen.filter((c) => c.type === 'image');
  assert.equal(imgs.length, 4, '1 imagem + 3 tiras do vídeo');
  assert.ok(seen.some((c) => c.type === 'text' && /3 quadros seguidos/.test(c.text)));
  assert.deepEqual(guide.fonts, ['display']);
  assert.deepEqual(guide.inFx, ['mask-up']);
  assert.equal(guide.palette.bad, undefined);
  assert.deepEqual(guide.from.sort(), [a, b].sort());
  list = await refs.listRefs('u1');
  assert.equal(list.guide.summary, 'Escuro, condensado, laranja', 'guia salvo na pasta');
  assert.match(refs.guideText(list.guide), /número sempre gigante/);
  assert.equal(await refs.removeRef('u1', '../../etc/passwd'), false);
  assert.equal(await refs.removeRef('u1', a), true);
  await assert.rejects(() => refs.learnGuide('vazia', { anthropicKey: 'x' }, async () => '{}'), /vazia/);
});
