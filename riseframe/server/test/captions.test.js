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

test('template box: caixa desenhada do tamanho da palavra, na cor, atrás do texto', () => {
  const ass = buildAss(segments, meta, { template: 'box', color: 'orange' });
  const boxes = ass.split('\n').filter((l) => l.startsWith('Dialogue: 0,') && l.includes('\\p1'));
  assert.equal(boxes.length, 3, 'uma caixa por palavra');
  assert.ok(boxes[0].includes('\\1c&H356BFF&'), 'na cor escolhida');
  const text = ass.split('\n').filter((l) => l.startsWith('Dialogue: 1,'));
  assert.equal(text.length, 3, 'texto por cima (camada 1)');
  // caixa mais larga para palavra mais longa
  const widthOf = (l) => Math.max(...l.split('}').pop().match(/\d+/g).map(Number));
  assert.ok(widthOf(boxes[2]) > widthOf(boxes[1]), 'PREMIUM tem caixa maior que É');
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

test('buildAss: palavra longa encolhe (auto-fit) e curta mantém tamanho', () => {
  const meta = { width: 1080, height: 1920 };
  const seg = { start: 0, end: 2, text: 'x', words: [
    { start: 0, end: 1, word: 'oi' },
    { start: 1, end: 2, word: 'pneumoultramicroscopico' },
  ] };
  const dialogs = buildAss([seg], meta, { template: 'pop' }).split('\n').filter((l) => l.startsWith('Dialogue'));
  assert.ok(!/\\fs\d+/.test(dialogs[0]), 'palavra curta não recebe override de fonte');
  assert.ok(/\\fs\d+/.test(dialogs[1]), 'palavra longa recebe \\fs menor (auto-fit)');
});

test('legenda padrão é normal: frase inteira, sem destacar a palavra falada', async () => {
  const { buildAss } = await import('../src/pipeline/captions.js');
  const seg = { start: 1, end: 3, text: '3 razões pelas quais', words: [
    { start: 1, end: 1.4, word: '3' }, { start: 1.4, end: 2, word: 'razões' },
    { start: 2, end: 2.4, word: 'pelas' }, { start: 2.4, end: 3, word: 'quais' },
  ] };
  const meta = { width: 1080, height: 1920 };
  const plain = buildAss([seg], meta, { template: 'clean' }).split('\n').filter((l) => l.startsWith('Dialogue'));
  assert.equal(plain.length, 2, 'a frase em 2 linhas (um evento por linha, com o espaçamento da prévia)');
  assert.match(plain[0], /\}3 razões$/);
  assert.match(plain[1], /\}pelas quais$/);
  const ys = plain.map((l) => Number(/\\pos\(\d+,(\d+)\)/.exec(l)[1]));
  const em = 1920 * CAPTION_TEMPLATES.clean.size;
  assert.ok(Math.abs(ys[1] - ys[0] - em * 1.1) < 2, `linhas a 1,1 em uma da outra (${ys[1] - ys[0]})`);
  assert.ok(plain.every((l) => !/alpha&H70/.test(l)), 'nenhuma palavra apagada');

  const colored = buildAss([seg], meta, { template: 'clean', color: 'yellow' }).split('\n').filter((l) => l.startsWith('Dialogue'));
  assert.ok(colored.every((l) => /\\c&H/.test(l)), 'a frase toda na cor escolhida');

  const hl = buildAss([seg], meta, { template: 'clean', highlight: true }).split('\n').filter((l) => l.startsWith('Dialogue'));
  assert.equal(new Set(hl.map((l) => l.split(',')[1])).size, 4, 'com destaque: um momento por palavra falada');
  assert.ok(hl.some((l) => /alpha&H70/.test(l)), 'as outras palavras ficam apagadas');
});

test('posição manual: frase arrastada vira \\an5\\pos no quadro; a geral vale para as outras', async () => {
  const { buildAss } = await import('../src/pipeline/captions.js');
  const meta = { width: 1080, height: 1920 };
  const segs = [
    { start: 0, end: 1, words: [{ start: 0, end: 0.5, word: 'olá', px: 0.5, py: 0.25 }, { start: 0.5, end: 1, word: 'gente', px: 0.5, py: 0.25 }] },
    { start: 1, end: 2, words: [{ start: 1, end: 2, word: 'tudo' }] },
  ];
  const ass = buildAss(segs, meta, { template: 'clean', posX: 0.3, posY: 0.7 });
  const lines = ass.split('\n').filter((l) => l.startsWith('Dialogue'));
  const at = (l) => /\\an5\\pos\((\d+),(\d+)\)/.exec(l).slice(1).map(Number);
  const near = ([x, y], [ex, ey]) => Math.abs(x - ex) <= 1 && Math.abs(y - ey) < 40;
  assert.ok(near(at(lines[0]), [540, 480]), `${at(lines[0])}`);
  assert.ok(near(at(lines[1]), [324, 1344]), `${at(lines[1])}`);
  // modo palavra: cada palavra usa a sua posição; sem ela, a do estilo (meio)
  const word = buildAss([{ start: 0, end: 1, words: [{ start: 0, end: 0.5, word: 'um', px: 0.2, py: 0.2 }, { start: 0.5, end: 1, word: 'dois' }] }], meta, { template: 'pop' });
  const wl = word.split('\n').filter((l) => l.startsWith('Dialogue'));
  assert.ok(near(at(wl[0]), [216, 384]));
  assert.ok(near(at(wl[1]), [540, 960]));
  // sem posição manual: embaixo, acima da margem do estilo
  const [, y] = at(buildAss([segs[1]], meta, { template: 'clean' }).split('\n').find((l) => l.startsWith('Dialogue')));
  assert.ok(y > 1920 * 0.7 && y < 1920 * (1 - CAPTION_TEMPLATES.clean.marginV));
});

test('posição manual sobrevive aos cortes e separa frases com posições diferentes', async () => {
  const { remapTranscript } = await import('../src/pipeline/timeline.js');
  const tr = { segments: [{ start: 0, end: 3, words: [
    { start: 0, end: 0.4, word: 'a', px: 0.1, py: 0.1 },
    { start: 0.4, end: 0.8, word: 'b', px: 0.1, py: 0.1 },
    { start: 0.8, end: 1.2, word: 'c' },
  ] }] };
  const out = remapTranscript(tr, [{ start: 0, end: 3 }]);
  assert.equal(out.segments.length, 2);
  assert.deepEqual(out.segments[0].words.map((w) => [w.word, w.px, w.py]), [['a', 0.1, 0.1], ['b', 0.1, 0.1]]);
  assert.equal(out.segments[1].words[0].px, undefined);
});

test('ênfase por palavra: cor própria e maior na frase e no modo palavra; sobrevive aos cortes', async () => {
  const seg = [{ start: 0, end: 1.5, words: [
    { start: 0, end: 0.5, word: 'isso' },
    { start: 0.5, end: 1, word: 'muda', emColor: 'yellow', emBig: true },
    { start: 1, end: 1.5, word: 'tudo', emColor: 'hacker' },
  ] }];
  const yellow = '&H004BE2FF';
  const phrase = buildAss(seg, meta, { template: 'clean' }).split('\n').find((l) => l.startsWith('Dialogue'));
  assert.ok(phrase.includes(`\\c${yellow}`), 'cor da ênfase');
  assert.match(phrase, /\\fscx130\\fscy130\}muda\{\\fscx100/, 'maior só nela');
  assert.doesNotMatch(phrase, /\{[^}]*\}tudo/, 'cor inválida é ignorada');
  const word = buildAss(seg, meta, { template: 'pop' }).split('\n').filter((l) => l.startsWith('Dialogue'));
  assert.ok(word[1].includes(`\\c${yellow}`) && /\\fs\d+/.test(word[1]), 'modo palavra: cor e tamanho');
  assert.doesNotMatch(word[0], new RegExp(yellow.replace(/&/g, '\\&')));

  const { remapTranscript } = await import('../src/pipeline/timeline.js');
  const out = remapTranscript({ segments: seg }, [{ start: 0, end: 2 }]);
  const w = out.segments.flatMap((s) => s.words);
  assert.deepEqual([w[1].emColor, w[1].emBig, w[2].emColor], ['yellow', true, undefined]);
});

test('estilos novos: karaokê destaca sempre, marca-texto põe caixa só na palavra falada, duas linhas quebra na palavra-chave', () => {
  const k = buildAss(segments, meta, { template: 'karaoke', color: 'yellow' }).split('\n').filter((l) => l.startsWith('Dialogue'));
  assert.equal(new Set(k.map((l) => l.split(',')[1])).size, 3, 'karaokê: um momento por palavra falada mesmo sem "destacar" ligado');

  const m = buildAss(segments, meta, { template: 'marker', color: 'purple' }).split('\n');
  const marks = m.filter((l) => l.startsWith('Dialogue: 0,') && l.includes('\\p1'));
  assert.equal(marks.length, 3, 'uma caixa por palavra falada, desenhada atrás dela');
  assert.ok(marks.every((l) => l.includes('\\1c&HFF679F&')), 'na cor escolhida');
  const last = m.filter((l) => l.startsWith('Dialogue: 1,') && l.includes('PREMIUM')).pop();
  assert.match(last, /\\bord0\\shad0\}PREMIUM/, 'a palavra da vez sem contorno, por cima da caixa');

  const d = buildAss(segments, meta, { template: 'duo', color: 'green' }).split('\n').filter((l) => l.startsWith('Dialogue'));
  assert.ok(d.some((l) => /\{\\fscx135\\fscy135\\c&H007AD42E\}PREMIUM/.test(l)), 'palavra-chave maior e colorida');
  const top = d.find((l) => /\}ESSE É$/.test(l));
  const bot = d.find((l) => l.includes('PREMIUM'));
  assert.ok(top && /pos\(540,(\d+)\)/.exec(top)[1] < /pos\(540,(\d+)\)/.exec(bot)[1], 'a palavra-chave desce para a linha de baixo');
});

test('premium: palavra a palavra, parte grande com brilho na linha de baixo e som de tecla', async () => {
  const { captionSfxEvents } = await import('../src/pipeline/captions.js');
  const seg = [{ start: 0, end: 1.6, words: [
    { start: 0, end: 0.3, word: 'eles' }, { start: 0.4, end: 0.7, word: 'vivem' }, { start: 0.8, end: 1.4, word: 'perguntando' },
  ] }];
  const ev = buildAss(seg, meta, { template: 'premium' }).split('\n').filter((l) => l.startsWith('Dialogue'));
  assert.equal(new Set(ev.map((l) => l.split(',')[1])).size, 3, 'um momento por palavra falada');
  assert.match(ev[0], /\\1a&HFF&\\3a&HFF&\\4a&HFF&\}vivem/, 'a próxima palavra já ocupa o lugar, invisível');
  const big = ev.filter((l) => l.includes('perguntando'));
  const small = ev.filter((l) => l.includes('eles'));
  const yOf = (l) => Number(/pos\(\d+,(\d+)\)/.exec(l)[1]);
  assert.ok(yOf(big[0]) > yOf(small[0]), 'a palavra-chave fica na linha de baixo');
  assert.match(big[big.length - 1], /\\blur\d+[^}]*\}perguntando/, 'com brilho');
  const sfx = captionSfxEvents(seg, { template: 'premium' });
  assert.deepEqual(sfx.map((e) => [e.type, e.t]), [['tick', 0], ['tick', 0.4], ['tick', 0.8]], 'som de tecla em cada palavra, sem whoosh');
  // outros estilos: só as palavras com ênfase manual ganham a tecla
  assert.deepEqual(captionSfxEvents(seg, { template: 'clean' }), []);
  const em = [{ ...seg[0], words: seg[0].words.map((w, i) => (i === 1 ? { ...w, emBig: true } : w)) }];
  assert.deepEqual(captionSfxEvents(em, { template: 'clean' }), [{ t: 0.4, type: 'tick' }]);
});

test('som de tecla no ritmo de digitação: frases alternadas (ou todas as palavras)', async () => {
  const { captionSfxEvents } = await import('../src/pipeline/captions.js');
  const mk = (t0) => ({ start: t0, end: t0 + 1, words: [{ start: t0, end: t0 + 0.4, word: 'oi' }, { start: t0 + 0.5, end: t0 + 0.9, word: 'gente' }] });
  const segs = [mk(0), mk(2), mk(4)];
  const ritmo = captionSfxEvents(segs, { template: 'premium' }).map((e) => e.t);
  assert.deepEqual(ritmo, [0, 0.5, 4, 4.5], 'uma frase digitada, a seguinte em silêncio');
  assert.equal(captionSfxEvents(segs, { template: 'premium', keys: 'todas' }).length, 6);
});

test('linhas e caracteres: no máximo 1 ou 2 linhas, cada uma até o limite; o resto vira outro cartão', async () => {
  const { layoutCaption } = await import('../../shared/captionKeyword.js');
  const w = (t0, list) => list.split(' ').map((word, i) => ({ start: t0 + i * 0.3, end: t0 + i * 0.3 + 0.25, word }));
  const words = w(0, 'isso vai mudar a forma como você grava seus vídeos');
  const two = layoutCaption(words, { lines: 2, maxChars: 14, segEnd: 4 });
  for (const c of two) {
    const lines = [];
    c.words.forEach((x) => (x.br || !lines.length ? lines.push([x.word]) : lines[lines.length - 1].push(x.word)));
    assert.ok(lines.length <= 2, 'até 2 linhas');
    assert.ok(lines.every((l) => l.join(' ').length <= 14), lines.map((l) => l.join(' ')).join(' | '));
  }
  assert.equal(two[0].end, two[1].words[0].start, 'o cartão fica até o próximo começar');
  const one = layoutCaption(words, { lines: 1, maxChars: 14 });
  assert.ok(one.every((c) => c.words.every((x) => !x.br)), '1 linha: nunca quebra');
  assert.ok(one.length > two.length);

  const seg = { start: 0, end: 4, words };
  const cards = (ass) => new Set(ass.map((l) => l.split(',')[1])).size;
  const ass1 = buildAss([seg], meta, { template: 'clean', lines: 1, maxChars: 14 }).split('\n').filter((l) => l.startsWith('Dialogue'));
  assert.ok(cards(ass1) >= 4 && cards(ass1) === ass1.length && ass1.every((l) => !l.includes('\\N')), 'uma linha por cartão');
  const ass2 = buildAss([seg], meta, { template: 'clean', lines: 2, maxChars: 14 }).split('\n').filter((l) => l.startsWith('Dialogue'));
  assert.ok(ass2.length > cards(ass2) && cards(ass2) < cards(ass1), '2 linhas por cartão (um evento por linha)');
  assert.match(buildAss([seg], meta, { template: 'clean' }), /WrapStyle: 2/, 'sem quebra automática do libass');
});

test('mesmo tamanho da prévia: a fonte do ASS é o "em" do CSS × a célula da fonte', async () => {
  const { fontMetrics } = await import('../src/pipeline/fontMetrics.js');
  const style = buildAss(segments, meta, { template: 'clean' }).split('\n').find((l) => l.startsWith('Style: Rise,')).split(',');
  const em = 1920 * CAPTION_TEMPLATES.clean.size;
  assert.equal(style[1], 'Poppins');
  assert.equal(Number(style[2]), Math.round(em * fontMetrics('Poppins').cell), 'Poppins: célula de 1,76 em');
  assert.ok(fontMetrics('Poppins').cell > 1.7 && fontMetrics('Anton').cell > 1.7);
  // largura real das letras (caixas do tamanho do texto)
  assert.ok(fontMetrics('Anton').width('RESULTADO') < fontMetrics('Poppins').width('RESULTADO'), 'Anton é condensada');
});

test('fontes novas, cor livre e tipos de destaque', () => {
  const lines = (o) => buildAss(segments, meta, o).split('\n');
  assert.ok(lines({ template: 'clean', font: 'oswald' }).find((l) => l.startsWith('Style: Rise,')).includes(',Oswald,'));
  assert.ok(lines({ template: 'clean', font: 'bangers' }).find((l) => l.startsWith('Style: Rise,')).split(',')[7] === '0', 'fonte de letreiro sem negrito');
  // cor livre (#RRGGBB)
  assert.ok(lines({ template: 'pop', color: '#12AB34' }).some((l) => l.includes('\\c&H0034AB12')));
  // destaques
  const hl = (h) => lines({ template: 'karaoke', color: 'orange', highlightStyle: h }).filter((l) => l.startsWith('Dialogue'));
  assert.ok(hl('scale').some((l) => l.includes('\\fscx118\\fscy118')), 'maior');
  assert.ok(hl('glow').some((l) => /\\3c&H00356BFF\\bord\d+\\blur\d+/.test(l)), 'brilho na cor');
  assert.equal(hl('box').filter((l) => l.includes('\\p1')).length, 3, 'caixa atrás de cada palavra falada');
  const und = hl('underline');
  assert.equal(und.filter((l) => l.includes('\\p1')).length, 3, 'sublinhado desenhado');
  assert.ok(!und.some((l) => /\\c&H00356BFF\}/.test(l)), 'sublinhado: a palavra fica branca');
  // estilos novos geram eventos
  for (const t of ['tiktok', 'beast', 'comic', 'hollow', 'shadow3d', 'elegant', 'handwritten']) {
    assert.ok(lines({ template: t, color: 'yellow' }).some((l) => l.startsWith('Dialogue')), t);
  }
  assert.ok(lines({ template: 'hollow', color: 'yellow' }).some((l) => l.includes('\\1a&HFF&')), 'vazado: letras só com contorno');
  assert.ok(lines({ template: 'shadow3d', color: 'magenta' }).some((l) => l.includes('\\4c&H00FB40E0')), 'sombra 3D na cor');
});

test('tela dividida: só no B-roll a legenda vai para o meio; fora dele vale a posição geral', () => {
  const meta = { width: 1080, height: 1920 };
  const seg = (start, word, extra = {}) => ({ start, end: start + 0.8, text: word, words: [{ start, end: start + 0.8, word, ...extra }] });
  const ys = (ass) => [...ass.matchAll(/Dialogue: [^\n]*\pos\((\d+),(\d+)\)[^\n]*/g)].map((m) => [m[0].match(/,(\d:\d\d:\d\d\.\d\d),/)[1], Number(m[2])]);
  const ass = buildAss([seg(1, 'antes'), seg(2.5, 'durante'), seg(3.2, 'movida', { px: 0.5, py: 0.8 }), seg(5, 'depois')], meta, {
    template: 'clean', color: 'white', posX: 0.5, posY: 0.15, centerWindows: [{ start: 2, end: 4 }],
  });
  const at = (t) => ys(ass).filter(([s]) => s === t).map(([, y]) => y);
  const near = (arr, y) => arr.length && arr.every((v) => Math.abs(v - y) < 140);
  assert.ok(near(at('0:00:01.00'), 1920 * 0.15), `antes do B-roll: posição geral (${at('0:00:01.00')})`);
  assert.ok(near(at('0:00:02.50'), 960), `durante o B-roll: meio (${at('0:00:02.50')})`);
  assert.ok(near(at('0:00:03.20'), 1920 * 0.8), `frase movida à mão: fica onde foi posta (${at('0:00:03.20')})`);
  assert.ok(near(at('0:00:05.00'), 1920 * 0.15), `depois do B-roll: volta para a posição geral (${at('0:00:05.00')})`);
});
