import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRANSITIONS, transitionVf, TRANSITION_DUR } from '../src/pipeline/transitions.js';
import { SFX_LIBRARY, sfxInfo } from '../src/pipeline/sfx.js';
import { ELEMENT_MOTIONS, elemMotionAt, elemMotionExpr } from '../../shared/elementMotion.js';
import { TEXT_ANIMS_IN, TEXT_ANIMS_OUT, textOutFrame, textInFrame } from '../../shared/textLayers.js';
import { buildTextAss } from '../src/pipeline/texts.js';

const NEW_TR = ['pixelate', 'burn', 'chroma', 'strobe', 'negative', 'vhs', 'swipeblur', 'exposure', 'desat'];
const NEW_SFX = ['whip', 'tapestop', 'vibrate', 'beep', 'countdown', 'alarm', 'levelup', 'drumroll', 'punch', 'sweepup', 'sweepdown', 'wind', 'camera', 'chime'];
const NEW_MO = ['heartbeat', 'swing', 'hop', 'orbit', 'shake', 'tada', 'wave', 'zoomloop'];

test('transições novas: nome, duração e filtro só perto do corte', () => {
  for (const t of NEW_TR) {
    assert.ok(TRANSITIONS[t], t);
    assert.ok(TRANSITION_DUR[t] > 0, t);
    const vf = transitionVf(t, [2], 5);
    assert.ok(vf && vf.length > 5, t);
  }
  assert.match(transitionVf('negative', [2], 5), /^negate=enable='between\(t,1\.850,2\.150\)'$/);
});

test('efeitos sonoros novos: categoria e duração lidas do som', () => {
  for (const k of NEW_SFX) {
    assert.ok(SFX_LIBRARY[k]?.src, k);
    const info = sfxInfo(k);
    assert.ok(info.dur > 0.1 && info.dur < 3, `${k} ${info.dur}`);
    assert.notEqual(info.cat, undefined, k);
  }
  assert.equal(sfxInfo('punch').cat, 'impacto');
});

test('movimentos novos: prévia e render dizem a mesma coisa', () => {
  for (const m of NEW_MO) {
    assert.ok(ELEMENT_MOTIONS[m], m);
    assert.ok(Object.keys(elemMotionExpr(m, 't')).length > 0, m);
  }
  // pêndulo: no pico (t = 0,5 s → sin(π/2)) gira 18°
  assert.ok(Math.abs(elemMotionAt('swing', 0.5).rot - 18) < 1e-6);
  // pular: nunca desce abaixo do lugar
  for (let t = 0; t < 3; t += 0.1) assert.ok(elemMotionAt('hop', t).dy <= 0);
  // tcharam descansa no 2º segundo de cada ciclo
  assert.deepEqual([elemMotionAt('tada', 1.5).scale, elemMotionAt('tada', 1.5).rot], [1, 0]);
});

test('textos: entradas e saídas novas, prévia e render', () => {
  for (const k of ['blur-in', 'slide-down', 'grow', 'spin-in']) assert.ok(TEXT_ANIMS_IN[k], k);
  for (const k of ['slide-down', 'slide-up', 'slide-left', 'slide-right', 'pop', 'grow', 'blur', 'spin']) assert.ok(TEXT_ANIMS_OUT[k], k);
  assert.deepEqual(textOutFrame('slide-down', 1), { alpha: 0, scale: 1, dx: 0, dy: 0.06, rot: 0, blur: 0 });
  assert.equal(textOutFrame('pop', 1).scale, 0);
  assert.equal(textInFrame('grow', 0).scale, 0);
  assert.equal(textInFrame('blur-in', 0).blur, 18);
  const base = { text: 'OI', font: 'montserrat', size: 0.05, color: '#FFFFFF', box: 'none', x: 0.5, y: 0.5, start: 0, end: 2 };
  const ass = (l) => buildTextAss([{ ...base, ...l }], { width: 1080, height: 1920 });
  const mv = ass({ animOut: 'slide-down' }).match(/\\move\(540,(\d+),540,(\d+),1650,2000\)/);
  assert.ok(mv, 'saída descendo usa \\move no fim');
  assert.equal(Number(mv[2]) - Number(mv[1]), 115); // 6% de 1920
  assert.match(ass({ animOut: 'blur' }), /\\t\(1650,2000,\\blur18\)/);
  assert.match(ass({ animIn: 'blur-in' }), /\\blur18\\t\(0,350,\\blur0\)/);
  // entrada que já anda (subir) + saída que anda: o \move fica com a entrada
  const both = ass({ animIn: 'slide-up', animOut: 'slide-left' });
  assert.match(both, /\\move\(540,\d+,540,\d+,0,350\)/);
  assert.doesNotMatch(both, /,1650,2000\)/);
});
