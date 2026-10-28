import { test } from 'node:test';
import assert from 'node:assert/strict';
import { letterPlan, letterFrame, letterTiming, TEXT_ANIMS_IN, LETTER_ANIMS } from '../../shared/textLayers.js';
import { buildTextAss } from '../src/pipeline/texts.js';

test('animações por letra estão na lista de entradas e o plano escalona as letras', () => {
  for (const a of LETTER_ANIMS) assert.ok(TEXT_ANIMS_IN[a], a);
  const p = letterPlan({ animIn: 'letras-pop', start: 0, end: 3 }, ['Oi tudo']);
  const letters = p[0].filter((u) => u.t != null);
  assert.equal(letters.length, 6); // o espaço não conta
  for (let i = 1; i < letters.length; i += 1) assert.ok(letters[i].t > letters[i - 1].t);
  assert.equal(letterPlan({ animIn: 'fade' }, ['x']), null);
});

test('letra com duração e escalonamento limitados (texto curto ou longo)', () => {
  const short = letterTiming({ start: 0, end: 0.6 }, 4);
  const long = letterTiming({ start: 0, end: 10 }, 60);
  assert.ok(short.d <= 0.2 + 1e-9);
  assert.ok(long.d <= 0.42 + 1e-9 && long.stagger >= 0.02 && long.stagger <= 0.07);
});

test('quadro da letra: sobe, pula (0→115→100%) e sai do desfoque', () => {
  assert.equal(letterFrame('letras-subir', 1).dy, 0);
  assert.ok(letterFrame('letras-subir', 0).dy > 0.05);
  assert.ok(letterFrame('letras-pop', 0.6).scale > 1.1);
  assert.ok(Math.abs(letterFrame('letras-pop', 1).scale - 1) < 1e-9);
  assert.ok(letterFrame('letras-desfoque', 0).blur > 0 && letterFrame('letras-desfoque', 1).blur === 0);
});

test('o .ass tem um evento por letra, com o tempo de entrada da letra', () => {
  const ass = buildTextAss([{ text: 'Oi', start: 0, end: 3, font: 'poppins', size: 0.06, color: '#FFFFFF', box: 'none', x: 0.5, y: 0.5, animIn: 'letras-subir', animOut: 'fade' }], { width: 1080, height: 1920 });
  const events = ass.split('\n').filter((l) => l.startsWith('Dialogue') && /\}[Oi]$/.test(l));
  assert.equal(events.length, 2);
  assert.match(events[0], /\\move\(/);
  assert.ok(events[1].includes('0:00:00.07') || events[1].includes('0:00:00.06'), events[1].slice(0, 60));
});
