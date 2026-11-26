import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import {
  sanitizePromptSpec, fallbackPromptSpec, drawPromptMotion, pmNumber, promptMotionSystem, promptMotionUser,
  PM_TEMPLATES, PM_TYPES, PM_ICONS, PM_PARTICLES, PM_UI,
} from '../../shared/promptMotion.js';
import { drawExplainer } from '../../shared/motionEngine.js';
import { parseOptions } from '../src/routes/jobs.js';
import { remapMotionScenes } from '../src/pipeline/timeline.js';
import { carveScenes, fitBrollWithScenes } from '../src/pipeline/broll.js';
import { cleanForm } from '../src/routes/motion.js';
import { tmpDir } from '../testkit/tmp.js';

// uma peça de cada tipo (o que a IA pode pedir)
const ALL = {
  title: 'Tudo', duration: 4, font: 'heavy', bg: { kind: 'mesh', grain: true, leak: true },
  camera: [{ at: 0, dur: 4, zoom: 1.1 }], shake: 0.3,
  elements: [
    { type: 'text', text: 'Você está perdendo dinheiro?', highlight: ['dinheiro'], highlightStyle: 'box', in: { fx: 'words', dur: 0.5 }, y: 0.2 },
    { type: 'text', text: 'letra a letra', in: { fx: 'letters', dur: 0.6 }, y: 0.3 },
    { type: 'text', text: 'máquina de escrever', in: { fx: 'typewriter', dur: 0.8 }, y: 0.35 },
    { type: 'text', text: 'máscara subindo', in: { fx: 'mask-up', dur: 0.5 }, y: 0.4, highlight: 'subindo', highlightStyle: 'marker' },
    { type: 'counter', from: 0, to: 12500, prefix: 'R$ ', count: 1.5, y: 0.5, label: 'em 30 dias' },
    { type: 'bars', values: [2, 5, 12], labels: ['jan', 'fev', 'mar'], y: 0.6 },
    { type: 'line', values: [1, 3, 2, 6], y: 0.7, in: { fx: 'draw', dur: 1 } },
    { type: 'progress', value: 80, kind: 'ring', y: 0.3, x: 0.2 },
    { type: 'progress', value: 60, kind: 'bar', y: 0.8 },
    ...['rect', 'circle', 'pill', 'line', 'triangle', 'star', 'ring'].map((shape, i) => ({ type: 'shape', shape, x: 0.1 + i * 0.12, y: 0.9, w: 0.08, h: 0.04, in: { fx: i % 2 ? 'draw' : 'pop', dur: 0.4 } })),
    { type: 'list', items: ['um', 'dois', 'três'], bullet: 'number', y: 0.5 },
    { type: 'badge', text: 'novo', y: 0.15 },
    { type: 'card', glass: true, loop: 'shimmer', y: 0.5 },
    { type: 'arrow', from: [0.2, 0.8], to: [0.8, 0.2], in: { fx: 'draw', dur: 0.6 } },
    { type: 'particles', kind: 'confetti' },
    { type: 'transition', kind: 'circle', at: 1, dur: 0.6 },
    { type: 'text', text: 'efeitos premium', in: { fx: 'scramble', dur: 0.6 }, gradient: ['#FFFFFF', '#FF6B35'], shine: true, shadow: true, depth: 0.5, trail: true, y: 0.45 },
    { type: 'text', text: 'onda', in: { fx: 'wave', dur: 0.5 }, y: 0.55 },
    { type: 'text', text: 'contorno', in: { fx: 'outline', dur: 0.6 }, y: 0.6 },
    { type: 'text', text: 'glitch', in: { fx: 'glitch', dur: 0.4 }, y: 0.65 },
  ],
};

test('motion por prompt: o roteiro é validado (vocabulário fechado, números nos limites)', () => {
  const spec = sanitizePromptSpec({
    duration: 99, palette: { accent: 'red; drop table', text: '#fff' },
    elements: [
      { type: 'script', code: 'alert(1)' },
      { type: 'text', text: 'x'.repeat(500), size: 9, at: -5, in: { fx: 'explode', dur: 99 }, color: 'url(javascript:1)' },
      { type: 'counter', to: 'abc' },
      { type: 'bars', values: [1] }, // gráfico com 1 valor: fora
    ],
  });
  assert.equal(spec.duration, 15);
  assert.equal(spec.elements.length, 2, 'script e gráfico de 1 valor saem');
  const [t, c] = spec.elements;
  assert.equal(t.text.length, 140);
  assert.equal(t.size, 0.4);
  assert.equal(t.at, 0);
  assert.equal(t.in.fx, 'rise', 'efeito desconhecido vira o padrão');
  assert.equal(t.in.dur, 4);
  assert.equal(t.color, '#fff', 'cor inválida vira a do texto');
  assert.equal(spec.palette.accent, '#FF6B35');
  assert.equal(c.to, 100);
  assert.equal(sanitizePromptSpec({ elements: [] }), null);
  assert.equal(sanitizePromptSpec('nada'), null);
});

test('motion por prompt: todos os modelos montam uma cena sem IA, com as peças pedidas', () => {
  const want = { contador: 'counter', grafico: 'bars', passos: 'list', oferta: 'ui', notificacao: 'ui', cta: 'ui', busca: 'ui', antesdepois: 'icon' };
  for (const tp of PM_TEMPLATES) {
    const spec = fallbackPromptSpec(tp.prompt, { goal: tp.goal, look: tp.look });
    assert.ok(spec && spec.elements.length, tp.id);
    assert.deepEqual(sanitizePromptSpec(spec), spec, `${tp.id}: já sai validado`);
    if (want[tp.id]) assert.ok(spec.elements.some((e) => e.type === want[tp.id]), `${tp.id} tem ${want[tp.id]}`);
  }
  const passos = fallbackPromptSpec(PM_TEMPLATES.find((t) => t.id === 'passos').prompt, { goal: 'lista' });
  assert.deepEqual(passos.elements.find((e) => e.type === 'list').items, ['defina o cliente', 'crie a oferta', 'faça o anúncio']);
  const cont = fallbackPromptSpec(PM_TEMPLATES.find((t) => t.id === 'contador').prompt, { goal: 'numeros' });
  assert.equal(cont.elements.find((e) => e.type === 'counter').to, 10000);
  // ritmo e duração do formulário
  assert.equal(fallbackPromptSpec('Oi', { duration: 8 }).duration, 8);
});

test('motion por prompt: desenha todos os tipos em vários instantes, em 9:16 e 16:9', () => {
  const spec = sanitizePromptSpec(ALL);
  const ui = PM_UI.map((kind, i) => ({ type: 'ui', kind, text: 'Venda aprovada R$ 197', y: 0.2 + i * 0.2 }));
  const extra = sanitizePromptSpec({ duration: 3, elements: [...ui, ...PM_ICONS.map((icon, i) => ({ type: 'icon', icon, x: (i % 6) / 6 + 0.08, y: 0.6 + Math.floor(i / 6) * 0.08, size: 0.03 })), ...PM_PARTICLES.map((kind) => ({ type: 'particles', kind, count: 12 }))] });
  assert.deepEqual(new Set([...spec.elements, ...extra.elements].map((e) => e.type)), new Set(PM_TYPES), 'todos os tipos desenhados');
  for (const [W, H] of [[108, 192], [192, 108]]) {
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');
    for (const s of [spec, extra]) {
      let lit = 0;
      for (const t of [0, 0.3, 1, 2, s.duration - 0.05]) {
        drawPromptMotion(ctx, s, t, { W, H });
        const d = c.data();
        let sum = 0;
        for (let i = 0; i < d.length; i += 4 * 37) sum += d[i] + d[i + 1] + d[i + 2];
        lit = Math.max(lit, sum);
      }
      assert.ok(lit > 0, 'desenhou algo');
    }
  }
});

test('motion por prompt: contador conta e o número sai no jeito brasileiro', () => {
  assert.equal(pmNumber(12500), '12.500');
  assert.equal(pmNumber(3.5, 1), '3,5');
  assert.equal(pmNumber(1234567.891, 2), '1.234.567,89');
  assert.equal(pmNumber(-1500), '-1.500');
});

test('motion por prompt: a cena entra no vídeo (validação, cortes de pausa e B-roll)', () => {
  const spec = fallbackPromptSpec('Contador de 0 a 500 clientes', { goal: 'numeros', duration: 4 });
  const o = parseOptions({ motionScenes: [{ start: 10, end: 14, style: 'prompt', spec: { ...spec, elements: [...spec.elements, { type: 'hack' }] } }, { start: 1, end: 3, style: 'prompt', spec: { elements: [] } }] });
  assert.equal(o.motionScenes.length, 1, 'cena sem peças sai');
  assert.equal(o.motionScenes[0].style, 'prompt');
  assert.equal(o.motionScenes[0].spec.elements.length, spec.elements.length, 'peça desconhecida sai');
  // cortes de pausa: a cena muda de lugar e mantém a duração da animação
  const keep = [{ start: 0, end: 5 }, { start: 8, end: 30 }];
  const [r] = remapMotionScenes(o.motionScenes, keep);
  assert.equal(r.start, 7);
  assert.equal(r.end, 11);
  // B-roll não recorta a cena da pessoa nem cai dentro dela
  assert.equal(carveScenes(o.motionScenes, [{ start: 11, end: 12 }])[0], o.motionScenes[0]);
  const fit = fitBrollWithScenes([{ start: 11, end: 12.5 }], o.motionScenes, 1);
  assert.equal(fit.moments.length, 0);
  // o desenho do motion (prévia e render) passa pela mesma função
  const c = createCanvas(54, 96);
  drawExplainer(c.getContext('2d'), o.motionScenes[0], 11, { W: 54, H: 96 });
});

test('motion por prompt: formulário e instruções da IA', () => {
  const f = cleanForm({ goal: 'numeros', look: 'hack', pace: 'rapido', palette: 'neon', colors: { accent: '#00FF00', bg: 'red' }, duration: 99, aspect: '9:16' });
  assert.deepEqual(f, { goal: 'numeros', pace: 'rapido', palette: 'neon', colors: { accent: '#00FF00' }, duration: 12, aspect: '9:16', creativity: 'media' });
  const sys = promptMotionSystem();
  for (const t of PM_TYPES) assert.ok(sys.includes(`"${t}"`), `instrução cita ${t}`);
  const u = promptMotionUser('contador', { goal: 'numeros', palette: 'neon' }, { title: 'x' }, 'mais rápido');
  assert.match(u, /Mudança pedida: mais rápido/);
  assert.match(u, /#22D3EE/);
});

test('motion por prompt: renderiza um MP4 da cena (o mesmo caminho do render do vídeo)', async () => {
  const { renderExplainerScene } = await import('../src/pipeline/motionRender.js');
  const spec = fallbackPromptSpec('Siga para mais dicas', { goal: 'cta', duration: 2 });
  const dir = tmpDir('rf-pm-');
  const out = path.join(dir, 'pm.mp4');
  await renderExplainerScene({ start: 0, end: 2, style: 'prompt', spec, beats: [] }, { W: 180, H: 320, fps: 10 }, out);
  assert.ok(fs.statSync(out).size > 1000);
  fs.rmSync(dir, { recursive: true, force: true });
});
