import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { vslPlan, VSL_SWITCH } from '../../shared/vslPlan.js';
import { vslCameraParts, splitAmountExpr } from '../src/pipeline/vsl.js';
import { cleanTextLayers } from '../../shared/textLayers.js';
import { CAPTION_FONTS } from '../../shared/captionStyle.js';
import { buildTextAss } from '../src/pipeline/texts.js';
import { SFX_LIBRARY } from '../src/pipeline/sfx.js';
import { ffmpegPath } from '../src/pipeline/ffmpeg.js';
import { elementFile } from '../src/pipeline/elements.js';

const seg = (t0, text) => {
  let t = t0;
  const words = text.split(' ').map((w) => { const o = { start: +t.toFixed(2), end: +(t + 0.26).toFixed(2), word: w }; t += 0.3; return o; });
  return { start: t0, end: t, words };
};
const SEGS = [
  seg(0.2, 'olha só isso aqui'),
  seg(1.8, 'você está perdendo tempo'),
  seg(3.6, 'o segredo do dinheiro é a estratégia e o tempo investido'),
  seg(8.2, 'nunca faça isso'),
  seg(10.4, 'são 3 passos simples'),
  seg(12.6, 'primeiro organize as suas tarefas e o seu calendário'),
  seg(17.4, 'depois foque no resultado'),
  seg(19.6, 'e comenta aqui embaixo'),
];
const plan = vslPlan({ segments: SEGS, dur: 22, available: new Set(Object.keys(SFX_LIBRARY)) });

test('VSL: gancho, telas divididas de 2 s ou mais, separadas por tela cheia', () => {
  assert.ok(plan.hook && plan.hook.end >= 0.8 && plan.hook.end <= 1.6);
  assert.ok(plan.splits.length >= 2, `telas divididas: ${plan.splits.length}`);
  for (const sp of plan.splits) assert.ok(sp.end - sp.start >= 2 && sp.start > plan.hook.end);
  for (let i = 1; i < plan.splits.length; i++) assert.ok(plan.splits[i].start - plan.splits[i - 1].end >= 2.2 - 1e-6);
  assert.ok(plan.splits[plan.splits.length - 1].end <= 22 - 1.5 + 1e-6, 'termina em tela cheia');
});

test('VSL: frase de impacto vira letreiro com punch seco, fora das telas divididas', () => {
  assert.ok(plan.punches.length >= 1);
  const p = plan.punches[0];
  assert.ok(Math.abs(p.start - 8.18) < 0.05 && p.scale > 1.1);
  assert.ok(!plan.splits.some((sp) => p.start < sp.end + VSL_SWITCH && p.end > sp.start));
  assert.ok(plan.layers.some((l) => l.text === 'NUNCA' || l.text === 'NUNCA FAÇA'));
});

test('VSL: legenda some nas telas divididas (com a troca) e nos letreiros', () => {
  for (const sp of plan.splits) assert.ok(plan.hide.some((h) => h.start <= sp.start && h.end >= sp.end + VSL_SWITCH));
  for (const p of plan.punches) assert.ok(plan.hide.some((h) => h.start <= p.start + 0.05 && h.end >= p.end));
});

test('VSL: som enxuto (no máximo 0,8 por segundo, nada colado)', () => {
  assert.ok(plan.sfx.length <= 22 * 0.8);
  for (let i = 1; i < plan.sfx.length; i++) assert.ok(plan.sfx[i].t - plan.sfx[i - 1].t >= 0.6 - 1e-6);
  for (const s of plan.sfx) assert.ok(Object.hasOwn(SFX_LIBRARY, s.type), s.type);
});

test('VSL: textos na zona segura e nada sobre o card do apresentador nas telas divididas', () => {
  const texts = plan.layers.filter((l) => l.kind !== 'shape');
  for (const l of texts) assert.ok(l.y >= 0.05 && l.y <= 0.8, `${l.text} y=${l.y}`);
  for (const sp of plan.splits) {
    const inside = texts.filter((l) => l.start >= sp.start && l.start <= sp.end && !/^\d\d:\d\d/.test(l.text));
    assert.ok(inside.length >= 2, 'rótulo + título');
    for (const l of inside) assert.ok(l.y < 0.5, `${l.text} fica em cima (y=${l.y})`);
  }
  // as camadas passam na validação do app (fontes e estilos existem)
  assert.equal(cleanTextLayers(plan.layers, Object.keys(CAPTION_FONTS), 400).length, plan.layers.length);
});

test('VSL: objetos do assunto existem no app', () => {
  for (const e of plan.elements) assert.ok(elementFile(e.element), e.element);
});

test('VSL: troca suave (0 na tela cheia, 1 no meio da tela dividida)', () => {
  const expr = splitAmountExpr([{ start: 4, end: 7 }]);
  const at = (t) => Function('t', 'clip', `return ${expr.replace(/clip\(/g, 'clip(')}`)(t, (x, a, b) => Math.max(a, Math.min(b, x)));
  assert.equal(at(3), 0);
  assert.equal(at(5.5), 1);
  assert.ok(at(4.2) > 0 && at(4.2) < 1);
  assert.equal(at(8), 0);
});

test('VSL: o FFmpeg monta a câmera e o render desenha os textos do plano', () => {
  const W = 360;
  const H = 640;
  const parts = vslCameraParts({ W, H, splits: plan.splits, punches: plan.punches, hook: plan.hook, focus: { x: 0.5, y: 0.33 } });
  const still = (f) => ['-framerate', '15', '-loop', '1', '-t', '22', '-i', f];
  const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:d=22:r=15',
    ...still(elementFile('backgrounds/vsl')), ...still(elementFile('backgrounds/vsl').replace(/backgrounds[\\/]vsl\.jpg$/, 'vsl/frame.png')),
    '-filter_complex', parts.join(';'), '-map', '[vout]', '-f', 'null', '-']);
  assert.equal(r.status, 0, r.stderr.toString().slice(0, 500));
  const ass = buildTextAss(cleanTextLayers(plan.layers, Object.keys(CAPTION_FONTS), 400), { width: W, height: H, duration: 22 });
  assert.ok(ass.split('\n').filter((l) => l.startsWith('Dialogue')).length > 20);
});
