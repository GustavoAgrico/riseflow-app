import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fontStyles, resolveFontFace, CAPTION_FONTS, CAPTION_FONT_FILES } from '../../shared/captionStyle.js';
import { buildAss } from '../src/pipeline/captions.js';
import { readTables, fontNames, renameFont } from '../src/customFonts.js';

const FONTS = path.resolve('assets/fonts');
const words = [{ word: 'Estilo', start: 0, end: 1 }, { word: 'da', start: 1, end: 1.5 }, { word: 'fonte', start: 1.5, end: 2 }];
const seg = [{ start: 0, end: 2, text: 'Estilo da fonte', words }];
const styleLine = (ass) => ass.split('\n').find((l) => l.startsWith('Style: Rise,')).split(',');

test('estilos: todo arquivo existe e tem o nome de família que o ASS pede', () => {
  for (const f of CAPTION_FONT_FILES) {
    const file = path.join(FONTS, f.file);
    assert.ok(fs.existsSync(file), f.file);
    if (f.file.startsWith('S-')) assert.equal(fontNames(readTables(fs.readFileSync(file)).tables)[1], f.family, f.file);
  }
  const m = fontStyles('montserrat');
  assert.equal(m[0].id, '');
  assert.deepEqual(m.map((x) => x.label).slice(0, 3), ['Negrito', 'Regular', 'Itálico']);
  assert.ok(fontStyles('gotham').length > 1, 'Gotham (Poppins) também tem estilos');
});

test('ASS: estilo escolhido vira a família do arquivo (sem negrito/itálico falso)', () => {
  const base = styleLine(buildAss(seg, { width: 1080, height: 1920 }, { template: 'clean', font: 'montserrat' }));
  assert.equal(base[1], 'Montserrat');
  assert.equal(base[7], '-1', 'padrão continua pedindo negrito');
  const it = styleLine(buildAss(seg, { width: 1080, height: 1920 }, { template: 'clean', font: 'montserrat', fontStyle: '900i' }));
  assert.equal(it[1], 'RFS montserrat 900i');
  assert.deepEqual([it[7], it[8]], ['0', '0'], 'o arquivo já é Black Itálico');
  const fake = styleLine(buildAss(seg, { width: 1080, height: 1920 }, { template: 'clean', font: 'montserrat', fontStyle: '400', italic: true, underline: true }));
  assert.deepEqual([fake[1], fake[8], fake[9]], ['RFS montserrat 400', '-1', '-1'], 'itálico inclinado e sublinhado');
  assert.equal(resolveFontFace(CAPTION_FONTS.anton, '400i').styled, false, 'estilo que a fonte não tem é ignorado');
});

test('maiúsculas/minúsculas: a escolha vence a do estilo', () => {
  const up = buildAss(seg, { width: 1080, height: 1920 }, { template: 'clean', textCase: 'upper' });
  assert.match(up, /ESTILO/);
  const low = buildAss(seg, { width: 1080, height: 1920 }, { template: 'hormozi', textCase: 'normal' });
  assert.match(low, /Estilo/);
});

test('fonte própria: renomeada para o nome único, o resto do arquivo intacto', () => {
  const src = fs.readFileSync(path.join(FONTS, 'Anton-Regular.ttf'));
  const parsed = readTables(src);
  const out = renameFont(parsed, 'RFU teste123');
  const again = readTables(out);
  assert.equal(fontNames(again.tables)[1], 'RFU teste123');
  assert.equal(again.tables.find((t) => t.tag === 'glyf').data.length, parsed.tables.find((t) => t.tag === 'glyf').data.length);
  const tmp = path.join(os.tmpdir(), `rfu_${Date.now()}.ttf`);
  fs.writeFileSync(tmp, out);
  const ass = buildAss(seg, { width: 1080, height: 1920 }, { template: 'clean', customFont: { family: 'RFU teste123', file: tmp } });
  assert.equal(styleLine(ass)[1], 'RFU teste123');
  fs.rmSync(tmp);
  assert.throws(() => readTables(Buffer.from('wOF2xxxxxxxxxxxx')), /WOFF2/);
});
