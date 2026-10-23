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
  // tamanho = "em" do CSS × célula da fonte (Poppins 1,76): igual à prévia
  assert.match(ass, /Style: T0,Poppins,135,&H00FFFFFF,&H00FFFFFF,&H00356BFF,&H00000000,-1,0,0,0,100,100,0,0,1,0,/, 'texto sem caixa do ASS');
  // cada linha: caixa desenhada (laranja, do tamanho do texto) por baixo e o texto por cima
  // (camadas: 0 sombra, 1 caixa, 3 texto)
  assert.match(ass, /Dialogue: 1,0:00:02\.00,0:00:05\.00,TBox,,0,0,0,,\{\\an5\\move\(562,\d+,346,\d+,0,350\)\\fad\(350,350\)\\bord0\\shad0\\1c&H356BFF&\\1a&H00&\\p1\}m 0 0 /);
  assert.match(ass, /Dialogue: 3,0:00:02\.00,0:00:05\.00,T0,,0,0,0,,\{\\an5\\move\(562,\d+,346,\d+,0,350\)\\fad\(350,350\)\\1a&H00&\\3a&H00&\}Seu Nome\n/);
  assert.match(ass, /\}Especialista\n/);
  // arredondar os cantos e o tamanho do fundo
  const [r] = cleanTextLayers([{ ...TEXT_TEMPLATES.nome, start: 2, end: 5, radius: 1, pad: 0.6 }]);
  const ra = buildTextAss([r], meta);
  const box = ra.match(/\\p1\}(m [^\n]+)/)[1].split(' ').map(Number).filter(Number.isFinite);
  assert.ok(box[0] > 40, `cantos arredondados (raio ${box[0]})`);
  const wide = (txt) => Math.max(...txt.match(/\\p1\}(m [^\n]+)/)[1].split(' ').map(Number).filter(Number.isFinite));
  assert.ok(wide(ra) > wide(ass), 'mais folga = caixa maior');
  const [pop] = cleanTextLayers([{ text: '{x}Oi', start: 0, end: 2, animIn: 'pop', animOut: 'zoom' }]);
  const a2 = buildTextAss([pop], meta);
  assert.ok(a2.includes('\\fscx0\\fscy0\\t(0,210,\\fscx115\\fscy115)'), 'pop');
  assert.ok(a2.includes('\\t(1650,2000,\\fscx0\\fscy0)'), 'encolhe na saída');
  assert.ok(a2.endsWith('}xOi\n'), 'chaves do usuário não viram tags');
});

test('buildTextAss: aparência e tipografia como no Premiere', () => {
  const base = { text: 'Linha um\nDois', start: 0, end: 2, font: 'poppins', size: 0.05, color: '#FFFFFF', x: 0.5, y: 0.5, animIn: 'none', animOut: 'none' };
  const [l] = cleanTextLayers([{ ...base, bold: true, italic: true, underline: true, tracking: 100, stroke: true, strokeW: 0.004, strokeColor: '#FF0000', bg: true, bgColor: '#0000FF', bgOpacity: 0.5, shadow: true, shadowOpacity: 0.5, rot: 15, opacity: 0.8, align: 'left', fill: false }]);
  const ass = buildTextAss([l], meta);
  // negrito/itálico/sublinhado, espaçamento (100/1000 em) e contorno (0,004 × 1920 ≈ 7,7 px)
  assert.match(ass, /Style: T0,Poppins,\d+,&H00FFFFFF,&H00FFFFFF,&H000000FF,&H00000000,-1,-1,-1,0,100,100,9\.60,0,1,7\.68,/);
  assert.match(ass, /Dialogue: 0,[^\n]*TBox[^\n]*\\blur[\d.]+\\1c&H000000&\\1a&H99&/, 'sombra da caixa (50% × 80%)');
  assert.match(ass, /Dialogue: 1,[^\n]*\\1c&HFF0000&\\1a&H99&\\p1/, 'caixa azul a 50% × 80%');
  assert.match(ass, /Dialogue: 3,[^\n]*\\org\(540,960\)\\frz-15\.00[^\n]*\\1a&HFF&\\3a&H33&\}Linha um/, 'giro, sem preenchimento e opacidade 80%');
  // alinhado à esquerda: as duas linhas começam no mesmo x (a mais curta fica mais à esquerda no centro)
  const xs = [...ass.matchAll(/Dialogue: 3,[^\n]*\\pos\((\d+),/g)].map((m) => Number(m[1]));
  assert.ok(xs[1] < xs[0], `linha curta à esquerda (${xs})`);
  const [caps] = cleanTextLayers([{ ...base, caps: true }]);
  assert.match(buildTextAss([caps], meta), /\}LINHA UM\n/);
  const [sc] = cleanTextLayers([{ ...base, smallCaps: true }]);
  assert.match(buildTextAss([sc], meta), /L\{\\fscx78\\fscy78\}INHA/);
});

test('buildTextAss: fundo como uma forma só (bloco) e formas (retângulo/elipse)', () => {
  const base = { text: 'Um\nDois\nTrês', start: 0, end: 2, font: 'poppins', size: 0.05, color: '#FFFFFF', x: 0.5, y: 0.5, animIn: 'none', animOut: 'none' };
  const [blk] = cleanTextLayers([{ ...base, bg: true, bgColor: '#13305A', leading: -0.01 }]);
  const a = buildTextAss([blk], meta);
  assert.equal((a.match(/Dialogue: 1,[^\n]*TBox/g) || []).length, 1, 'uma forma atrás do bloco todo');
  const [lin] = cleanTextLayers([{ ...base, bg: true, bgMode: 'lines' }]);
  assert.equal((buildTextAss([lin], meta).match(/Dialogue: 1,[^\n]*TBox/g) || []).length, 3, 'uma caixa por linha');
  // entrelinha negativa aproxima as linhas
  const ys = (txt) => [...txt.matchAll(/Dialogue: 3,[^\n]*\\pos\(\d+,(\d+)\)/g)].map((m) => Number(m[1]));
  const [plain] = cleanTextLayers([base]);
  const gapPlain = ys(buildTextAss([plain], meta))[1] - ys(buildTextAss([plain], meta))[0];
  const gapNeg = ys(a)[1] - ys(a)[0];
  assert.ok(gapNeg < gapPlain - 15, `entrelinha −19 px (${gapPlain} → ${gapNeg})`);
  const shapes = cleanTextLayers([
    { kind: 'shape', shape: 'rect', start: 0, end: 2, x: 0.5, y: 0.5, w: 0.5, h: 0.1, color: '#FF0000', radius: 1, stroke: true, strokeW: 0.002 },
    { kind: 'shape', shape: 'ellipse', start: 0, end: 2, x: 0.25, y: 0.25, w: 0.2, h: 0.1, color: '#00FF00', shadow: true },
  ]);
  assert.equal(shapes.length, 2);
  const s = buildTextAss(shapes, meta);
  assert.match(s, /Dialogue: 3,[^\n]*\\an7\\pos\(270,864\)[^\n]*\\bord3\.84\\1c&H0000FF&[^\n]*\\p1\}m /, 'retângulo vermelho com contorno');
  assert.match(s, /Dialogue: 4,[^\n]*TBox[^\n]*\\blur/, 'sombra da elipse');
  assert.match(s, /Dialogue: 7,[^\n]*\\1c&H00FF00&[^\n]*\\p1\}m 108 0 b /, 'elipse com curvas');
});

test('videoFxVf: cada efeito só na janela dele; desconhecido sai', () => {
  assert.equal(videoFxVf([]), null);
  const fx = cleanFxMoments([{ start: 1, end: 2, effect: 'bw' }, { start: 3, end: 4, effect: 'film' }, { start: 5, end: 6, effect: 'nada' }]);
  assert.equal(fx.length, 2);
  const vf = videoFxVf(fx);
  assert.ok(vf.startsWith("hue=s=0:enable='between(t,1.000,2.000)'"));
  assert.equal(vf.split("enable='between(t,3.000,4.000)'").length, 3, 'moldura = 2 faixas na mesma janela');
});
