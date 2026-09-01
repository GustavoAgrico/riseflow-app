import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAss, CAPTION_TEMPLATES, CAPTION_COLORS } from '../src/pipeline/captions.js';

const meta = { width: 1080, height: 1920 };
const segments = [{
  start: 0, end: 2, text: 'esse é premium',
  words: [{ start: 0, end: 0.6, word: 'esse' }, { start: 0.6, end: 1.2, word: 'é' }, { start: 1.2, end: 2, word: 'premium' }],
}];

test('todos os templates geram ASS válido (styles + events)', () => {
  for (const template of Object.keys(CAPTION_TEMPLATES)) {
    const ass = buildAss(segments, meta, { template, color: 'white' });
    assert.ok(ass.includes('[V4+ Styles]') && ass.includes('[Events]'), `${template}: seções ASS`);
    assert.ok(ass.includes('Style: Rise,'), `${template}: estilo base`);
    assert.ok(ass.includes('Dialogue:'), `${template}: tem eventos`);
  }
});

test('template box usa estilo de caixa (BorderStyle=3)', () => {
  const ass = buildAss(segments, meta, { template: 'box', color: 'orange' });
  assert.ok(ass.includes('Style: RiseBox,'), 'define estilo RiseBox');
  const boxLine = ass.split('\n').find((l) => l.startsWith('Style: RiseBox,'));
  assert.equal(boxLine.trim().split(',')[15], '3', 'BorderStyle=3 (caixa opaca)');
});

test('animações: pop/bounce injetam escala animada; fade não', () => {
  assert.ok(buildAss(segments, meta, { template: 'pop' }).includes('\\fscx'), 'pop anima escala');
  assert.ok(buildAss(segments, meta, { template: 'bounce' }).includes('\\t('), 'bounce usa \\t');
  assert.ok(buildAss(segments, meta, { template: 'clean' }).includes('\\fad('), 'clean usa fade');
});

test('cor de destaque entra como SecondaryColour; branco é o default', () => {
  const orange = CAPTION_COLORS.orange; // FF6B35
  const bgr = orange.slice(4, 6) + orange.slice(2, 4) + orange.slice(0, 2);
  assert.ok(buildAss(segments, meta, { template: 'pop', color: 'orange' }).toUpperCase().includes(bgr.toUpperCase()), 'usa a cor escolhida');
  // cor inválida → cai para branco
  const wht = buildAss(segments, meta, { template: 'pop', color: 'inexistente' });
  assert.ok(wht.includes('FFFFFF'), 'default branco');
});

test('modo legado (mode) mapeia para template', () => {
  assert.ok(buildAss(segments, meta, { mode: 'word' }).includes('\\an5'), 'word → template centrado');
  assert.ok(buildAss(segments, meta, { mode: 'karaoke' }).includes('Dialogue:'), 'karaoke → phrase');
});
