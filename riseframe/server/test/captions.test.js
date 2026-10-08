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
  assert.equal(plain.length, 1, 'uma linha por frase');
  assert.match(plain[0], /3 razões pelas quais$/);
  assert.doesNotMatch(plain[0], /alpha&H70/, 'nenhuma palavra apagada');

  const colored = buildAss([seg], meta, { template: 'clean', color: 'yellow' }).split('\n').filter((l) => l.startsWith('Dialogue'));
  assert.equal(colored.length, 1);
  assert.match(colored[0], /\\c&H/, 'a frase toda na cor escolhida');

  const hl = buildAss([seg], meta, { template: 'clean', highlight: true }).split('\n').filter((l) => l.startsWith('Dialogue'));
  assert.equal(hl.length, 4, 'com destaque: uma linha por palavra falada');
  assert.match(hl[2], /alpha&H70/, 'as outras palavras ficam apagadas');
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
  assert.match(lines[0], /\\an5\\pos\(540,480\)/);
  assert.match(lines[1], /\\an5\\pos\(324,1344\)/);
  // modo palavra: cada palavra usa a sua posição
  const word = buildAss([{ start: 0, end: 1, words: [{ start: 0, end: 0.5, word: 'um', px: 0.2, py: 0.2 }, { start: 0.5, end: 1, word: 'dois' }] }], meta, { template: 'pop' });
  const wl = word.split('\n').filter((l) => l.startsWith('Dialogue'));
  assert.match(wl[0], /\\an5\\pos\(216,384\)/);
  assert.doesNotMatch(wl[1], /\\pos/);
  // sem posição manual: nada de \pos
  assert.doesNotMatch(buildAss([segs[1]], meta, { template: 'clean' }), /\\pos/);
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
  assert.match(phrase, /\\fs\d+}muda\{\\fs\d+/, 'maior só nela');
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
  assert.equal(k.length, 3, 'karaokê: um evento por palavra falada mesmo sem "destacar" ligado');

  const m = buildAss(segments, meta, { template: 'marker', color: 'purple' });
  const markStyle = m.split('\n').find((l) => l.startsWith('Style: RiseMark,')).split(',');
  assert.equal(markStyle[15], '3', 'caixa por letra (BorderStyle=3)');
  assert.ok(markStyle[5].startsWith('&HFF'), 'caixa começa invisível');
  const layer1 = m.split('\n').filter((l) => l.startsWith('Dialogue: 1,'));
  assert.equal(layer1.length, 3);
  assert.ok(layer1[2].includes('\\1a&H00&\\3a&H00&}PREMIUM'), 'caixa ligada só na palavra da vez');
  assert.equal(m.split('\n').filter((l) => l.startsWith('Dialogue: 0,')).length, 1, 'frase base numa camada só');

  const d = buildAss(segments, meta, { template: 'duo', color: 'green' }).split('\n').find((l) => l.startsWith('Dialogue'));
  assert.match(d, /\\N\{\\fscx135\\fscy135\\c&H007AD42E\}PREMIUM/, 'palavra-chave desce, maior e colorida');
  assert.match(d, /\}ESSE É\\N/, 'o resto da frase fica branco, na linha de cima');
});
