import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTextLayers, cleanFxMoments, TEXT_TEMPLATES } from '../../shared/textLayers.js';
import { buildTextAss } from '../src/pipeline/texts.js';
import { videoFxVf } from '../src/pipeline/videofx.js';

const meta = { width: 1080, height: 1920 };

test('cleanTextLayers: limites, padrões e lixo', () => {
  const out = cleanTextLayers([
    { text: 'Olá', start: 1, end: 3, size: 9, color: 'red', x: 2, animIn: 'xx' },
    { text: '   ', start: 0, end: 2 },
    { text: 'curto demais', start: 1, end: 1.1 },
  ], ['poppins']);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].size, out[0].color, out[0].x, out[0].animIn, out[0].font], [0.2, '#FFFFFF', 1, 'fade', 'poppins']);
});

test('buildTextAss: posição pelo centro, caixa, quebra de linha e animações', () => {
  const [l] = cleanTextLayers([{ ...TEXT_TEMPLATES.nome, start: 2, end: 5 }]);
  const ass = buildTextAss([l], meta);
  assert.match(ass, /PlayResX: 1080\nPlayResY: 1920/);
  assert.match(ass, /Style: T0,Poppins,77,&H00FFFFFF,&H00FFFFFF,&H00356BFF,&H00356BFF,-1,0,0,0,100,100,0,0,3,/, 'caixa laranja (BorderStyle 3)');
  assert.match(ass, /Dialogue: 0,0:00:02\.00,0:00:05\.00,T0,,0,0,0,,\{\\an5\\move\(562,1613,346,1613,0,350\)\\fad\(350,350\)\}Seu Nome\\NEspecialista/);
  const [pop] = cleanTextLayers([{ text: '{x}Oi', start: 0, end: 2, animIn: 'pop', animOut: 'zoom' }]);
  const a2 = buildTextAss([pop], meta);
  assert.ok(a2.includes('\\fscx0\\fscy0\\t(0,210,\\fscx115\\fscy115)'), 'pop');
  assert.ok(a2.includes('\\t(1650,2000,\\fscx0\\fscy0)'), 'encolhe na saída');
  assert.ok(a2.endsWith('}xOi\n'), 'chaves do usuário não viram tags');
});

test('videoFxVf: cada efeito só na janela dele; desconhecido sai', () => {
  assert.equal(videoFxVf([]), null);
  const fx = cleanFxMoments([{ start: 1, end: 2, effect: 'bw' }, { start: 3, end: 4, effect: 'film' }, { start: 5, end: 6, effect: 'nada' }]);
  assert.equal(fx.length, 2);
  const vf = videoFxVf(fx);
  assert.ok(vf.startsWith("hue=s=0:enable='between(t,1.000,2.000)'"));
  assert.equal(vf.split("enable='between(t,3.000,4.000)'").length, 3, 'moldura = 2 faixas na mesma janela');
});
