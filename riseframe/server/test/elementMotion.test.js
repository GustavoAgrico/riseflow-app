import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ELEMENT_ANIMS, ELEMENT_MOTIONS, DECORATIVE_STICKERS, STICKER_CATEGORIES,
  ELEMENT_PRESETS, elemAnimFrame, elemMotionAt, elemMotionExpr,
} from '../../shared/elementMotion.js';

test('ELEMENT_ANIMS tem 18 entradas', () => {
  assert.equal(Object.keys(ELEMENT_ANIMS).length, 18);
  assert.ok('none' in ELEMENT_ANIMS);
  assert.ok('bounce' in ELEMENT_ANIMS);
  assert.ok('elastic' in ELEMENT_ANIMS);
  assert.ok('spin' in ELEMENT_ANIMS);
});

test('ELEMENT_MOTIONS tem 11 entradas', () => {
  assert.equal(Object.keys(ELEMENT_MOTIONS).length, 11);
  assert.ok('none' in ELEMENT_MOTIONS);
  assert.ok('float' in ELEMENT_MOTIONS);
  assert.ok('jelly' in ELEMENT_MOTIONS);
});

test('DECORATIVE_STICKERS tem 23 stickers com SVG válido', () => {
  assert.equal(DECORATIVE_STICKERS.length, 23);
  for (const st of DECORATIVE_STICKERS) {
    assert.ok(st.id, 'id ausente');
    assert.ok(st.label, 'label ausente');
    assert.ok(st.cat, 'cat ausente');
    assert.ok(st.svg.startsWith('<svg'), `SVG inválido em ${st.id}`);
    assert.ok(st.svg.endsWith('</svg>'), `SVG não fecha em ${st.id}`);
  }
});

test('STICKER_CATEGORIES cobre todas as categorias dos stickers', () => {
  const cats = new Set(STICKER_CATEGORIES.map((c) => c.id));
  for (const st of DECORATIVE_STICKERS) {
    assert.ok(cats.has(st.cat), `categoria '${st.cat}' de ${st.id} não listada`);
  }
});

test('ELEMENT_PRESETS referencia stickers existentes', () => {
  const ids = new Set(DECORATIVE_STICKERS.map((s) => s.id));
  for (const pr of ELEMENT_PRESETS) {
    assert.ok(ids.has(pr.sticker), `sticker '${pr.sticker}' do preset '${pr.id}' não existe`);
    assert.ok(pr.animIn in ELEMENT_ANIMS, `animIn '${pr.animIn}' do preset '${pr.id}' não existe`);
    assert.ok(pr.motion in ELEMENT_MOTIONS, `motion '${pr.motion}' do preset '${pr.id}' não existe`);
  }
});

// ──── elemAnimFrame ────

test('elemAnimFrame: bounce progresso 0 → escala 0, progresso 1 → escala 1', () => {
  const f0 = elemAnimFrame('bounce', 0);
  const f1 = elemAnimFrame('bounce', 1);
  assert.ok(f0.scale < 0.01, `escala inicial deveria ser ~0, é ${f0.scale}`);
  assert.ok(f0.alpha < 0.1, 'alpha inicial deveria ser baixo');
  assert.ok(Math.abs(f1.scale - 1) < 0.01, `escala final deveria ser ~1, é ${f1.scale}`);
});

test('elemAnimFrame: elastic tem overshoot (escala > 1 no meio)', () => {
  let maxScale = 0;
  for (let p = 0; p <= 1; p += 0.01) {
    const f = elemAnimFrame('elastic', p);
    if (f.scale > maxScale) maxScale = f.scale;
  }
  assert.ok(maxScale > 1.01, `elastic deveria ter overshoot, max escala = ${maxScale}`);
});

test('elemAnimFrame: drop começa deslocada para cima (dy negativo)', () => {
  const f0 = elemAnimFrame('drop', 0);
  const f1 = elemAnimFrame('drop', 1);
  assert.ok(f0.dy < -0.1, `drop deveria começar deslocada para cima, dy = ${f0.dy}`);
  assert.ok(Math.abs(f1.dy) < 0.02, 'drop deveria terminar na posição base');
});

test('elemAnimFrame: whip-left começa deslocada para esquerda (dx negativo)', () => {
  const f0 = elemAnimFrame('whip-left', 0);
  const f1 = elemAnimFrame('whip-left', 1);
  assert.ok(f0.dx < -0.3, `whip-left deveria começar à esquerda, dx = ${f0.dx}`);
  assert.ok(Math.abs(f1.dx) < 0.05, 'whip-left deveria terminar próximo ao centro');
});

test('elemAnimFrame: spin começa com rotação e termina em 0', () => {
  const f0 = elemAnimFrame('spin', 0);
  const f1 = elemAnimFrame('spin', 1);
  assert.ok(f0.rot > 100, `spin deveria começar com rotação grande, rot = ${f0.rot}`);
  assert.ok(Math.abs(f1.rot) < 1, `spin deveria terminar em ~0°, rot = ${f1.rot}`);
});

test('elemAnimFrame: grow cresce de 0 a 1', () => {
  const f0 = elemAnimFrame('grow', 0);
  const f1 = elemAnimFrame('grow', 1);
  assert.ok(f0.scale < 0.01);
  assert.ok(Math.abs(f1.scale - 1) < 0.01);
});

test('elemAnimFrame: animação desconhecida retorna identidade', () => {
  const f = elemAnimFrame('inexistente', 0.5);
  assert.equal(f.scale, 1);
  assert.equal(f.alpha, 1);
  assert.equal(f.dx, 0);
  assert.equal(f.dy, 0);
  assert.equal(f.rot, 0);
});

// ──── elemMotionAt ────

test('elemMotionAt: float tem dy senoidal', () => {
  const m0 = elemMotionAt('float', 0);
  assert.ok(Math.abs(m0.dy) < 0.001, 'float em t=0 deveria ter dy~0');
  const m1 = elemMotionAt('float', 1);
  assert.ok(m1.dy !== 0, 'float em t=1 deveria ter deslocamento');
  assert.equal(m0.scale, 1);
});

test('elemMotionAt: pulse tem escala senoidal', () => {
  const m = elemMotionAt('pulse', 0.5);
  assert.ok(m.scale !== 1, 'pulse deveria ter escala != 1 em t=0.5');
  assert.ok(m.scale > 0.9 && m.scale < 1.1, 'pulse não deveria sair muito de 1');
});

test('elemMotionAt: wiggle tem dx, dy e rot', () => {
  const m = elemMotionAt('wiggle', 1);
  assert.ok(m.dx !== 0 || m.dy !== 0, 'wiggle deveria ter deslocamento');
  assert.ok(m.rot !== 0, 'wiggle deveria ter rotação');
});

test('elemMotionAt: spin tem rotação linear crescente', () => {
  const m1 = elemMotionAt('spin', 1);
  const m2 = elemMotionAt('spin', 2);
  assert.ok(m2.rot > m1.rot, 'spin deveria girar mais ao longo do tempo');
});

test('elemMotionAt: speed multiplica o tempo', () => {
  const slow = elemMotionAt('float', 2, { speed: 0.5 });
  const fast = elemMotionAt('float', 1, { speed: 1 });
  assert.ok(Math.abs(slow.dy - fast.dy) < 0.0001, 'speed 0.5 em t=2 deveria igualar speed 1 em t=1');
});

test('elemMotionAt: amp multiplica a amplitude', () => {
  const base = elemMotionAt('sway', 1, { amp: 1 });
  const big = elemMotionAt('sway', 1, { amp: 2 });
  assert.ok(Math.abs(big.rot - base.rot * 2) < 0.001, 'amp 2 deveria dobrar a rotação');
});

test('elemMotionAt: breathe tem opacidade variável', () => {
  let minAlpha = 1, maxAlpha = 0;
  for (let t = 0; t < 5; t += 0.1) {
    const m = elemMotionAt('breathe', t);
    if (m.alpha < minAlpha) minAlpha = m.alpha;
    if (m.alpha > maxAlpha) maxAlpha = m.alpha;
  }
  assert.ok(minAlpha < 0.85, `breathe minAlpha deveria ser < 0.85, é ${minAlpha}`);
  assert.ok(maxAlpha > 0.95, `breathe maxAlpha deveria ser > 0.95, é ${maxAlpha}`);
});

test('elemMotionAt: jelly tem scaleX e scaleY opostos', () => {
  const m = elemMotionAt('jelly', 0.3);
  if (m.scaleX !== undefined) {
    assert.ok(Math.abs((m.scaleX - 1) + (m.scaleY - 1)) < 0.001, 'jelly scaleX e scaleY devem ser opostos');
  }
});

test('elemMotionAt: none retorna identidade', () => {
  const m = elemMotionAt('none', 5);
  assert.equal(m.dx, 0);
  assert.equal(m.dy, 0);
  assert.equal(m.scale, 1);
  assert.equal(m.rot, 0);
  assert.equal(m.alpha, 1);
});

// ──── elemMotionExpr (FFmpeg) ────

test('elemMotionExpr: float retorna expressão de dy', () => {
  const e = elemMotionExpr('float', 'T');
  assert.ok(e.dy, 'float deveria ter expr dy');
  assert.ok(e.dy.includes('sin'), 'float dy deveria ter sin');
  assert.ok(e.dy.includes('T'), 'float dy deveria usar a variável de tempo');
});

test('elemMotionExpr: pulse retorna expressão de scale', () => {
  const e = elemMotionExpr('pulse', 'T');
  assert.ok(e.scale, 'pulse deveria ter expr scale');
  assert.ok(e.scale.includes('sin'), 'pulse scale deveria ter sin');
});

test('elemMotionExpr: spin retorna expressão de rot', () => {
  const e = elemMotionExpr('spin', 'T');
  assert.ok(e.rot, 'spin deveria ter expr rot');
  assert.ok(e.rot.includes('PI'), 'spin rot deveria converter para radianos');
});

test('elemMotionExpr: wiggle retorna dx e dy', () => {
  const e = elemMotionExpr('wiggle', 'T');
  assert.ok(e.dx, 'wiggle deveria ter expr dx');
  assert.ok(e.dy, 'wiggle deveria ter expr dy');
});

test('elemMotionExpr: none retorna objeto vazio', () => {
  const e = elemMotionExpr('none', 'T');
  assert.deepEqual(e, {});
});

test('elemMotionExpr: speed e amp são incorporados nas expressões', () => {
  const e1 = elemMotionExpr('float', 'T', { speed: 1, amp: 1 });
  const e2 = elemMotionExpr('float', 'T', { speed: 2, amp: 1.5 });
  assert.notEqual(e1.dy, e2.dy, 'expressões com parâmetros diferentes devem ser distintas');
});

test('todas as animações de entrada produzem quadro válido no progresso 0.5', () => {
  for (const anim of Object.keys(ELEMENT_ANIMS)) {
    if (anim === 'none') continue;
    const f = elemAnimFrame(anim, 0.5);
    assert.ok(f.scale != null, `${anim}: scale nulo`);
    assert.ok(f.alpha != null, `${anim}: alpha nulo`);
    assert.ok(isFinite(f.scale), `${anim}: scale não finito`);
    assert.ok(isFinite(f.alpha), `${anim}: alpha não finito`);
    assert.ok(isFinite(f.dx), `${anim}: dx não finito`);
    assert.ok(isFinite(f.dy), `${anim}: dy não finito`);
    assert.ok(isFinite(f.rot), `${anim}: rot não finito`);
  }
});

test('todos os movimentos produzem quadro válido em t=2.5', () => {
  for (const motion of Object.keys(ELEMENT_MOTIONS)) {
    if (motion === 'none') continue;
    const m = elemMotionAt(motion, 2.5);
    assert.ok(isFinite(m.dx), `${motion}: dx não finito`);
    assert.ok(isFinite(m.dy), `${motion}: dy não finito`);
    assert.ok(isFinite(m.scale), `${motion}: scale não finito`);
    assert.ok(isFinite(m.rot), `${motion}: rot não finito`);
    assert.ok(isFinite(m.alpha), `${motion}: alpha não finito`);
  }
});

test('todas as expressões FFmpeg de movimentos são strings válidas', () => {
  for (const motion of Object.keys(ELEMENT_MOTIONS)) {
    if (motion === 'none') continue;
    const e = elemMotionExpr(motion, 'T', { speed: 1.5, amp: 0.8 });
    for (const [k, v] of Object.entries(e)) {
      assert.ok(typeof v === 'string', `${motion}.${k} deveria ser string`);
      assert.ok(v.length > 0, `${motion}.${k} deveria ser não-vazio`);
      assert.ok(!v.includes('undefined'), `${motion}.${k} contém 'undefined'`);
      assert.ok(!v.includes('NaN'), `${motion}.${k} contém 'NaN'`);
    }
  }
});

test('o FFmpeg aceita cada animação nova e cada movimento numa camada PiP', async () => {
  const { spawnSync } = await import('node:child_process');
  const { visualLayerParts } = await import('../src/pipeline/overlay.js');
  const { ffmpegPath } = await import('../src/pipeline/ffmpeg.js');
  const ctx = { W: 320, H: 180, fps: 15, dur: 2 };
  const item = (m) => ({ _inIdx: 1, start: 0.2, end: 1.6, d: 1.4, mode: 'pip', scale: 0.4, cx: 0.5, cy: 0.5, opacity: 1, ...m });
  const cases = [
    ...['bounce', 'elastic', 'grow', 'drop', 'whip-left', 'whip-up', 'spin', 'blur-in'].map((animIn) => ({ animIn, animOut: 'fade' })),
    ...Object.keys(ELEMENT_MOTIONS).filter((k) => k !== 'none').map((motion) => ({ motion, motionSpeed: 1.5, motionAmp: 1.2 })),
    { animIn: 'spin', motion: 'sway', rot: 15 },
  ];
  for (const c of cases) {
    const fc = visualLayerParts([item(c)], ctx).join(';');
    const r = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=2:r=15', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:d=2:r=15',
      '-filter_complex', fc, '-map', '[vout]', '-frames:v', '20', '-f', 'null', '-']);
    assert.equal(r.status, 0, `${JSON.stringify(c)}: ${r.stderr.toString().slice(0, 400)}`);
  }
});
