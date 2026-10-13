import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFiller, markFillers } from '../src/pipeline/cleanup.js';

test('isFiller: reconhece muletas/hesitações e alongamentos, ignora palavras reais', () => {
  assert.equal(isFiller('hã'), true);
  assert.equal(isFiller('hmm'), true);
  assert.equal(isFiller('aaa'), true); // vogal alongada
  assert.equal(isFiller('ééé'), true);
  // não pode confundir palavras com sentido
  assert.equal(isFiller('é'), false); // verbo "é"
  assert.equal(isFiller('então'), false);
  assert.equal(isFiller('tipo'), false);
  assert.equal(isFiller('casa'), false);
});

function seg(...words) {
  const w = words.map((word, i) => ({ start: i * 0.4, end: i * 0.4 + 0.4, word }));
  return { start: w[0].start, end: w[w.length - 1].end, text: words.join(' '), words: w };
}

test('markFillers: marca muletas sem mexer nas palavras boas', () => {
  const r = markFillers({ segments: [seg('eu', 'quero', 'hmm', 'isso')] });
  const flags = r.segments[0].words.map((w) => !!w.removed);
  assert.deepEqual(flags, [false, false, true, false]);
  assert.equal(r.removedCount, 1);
});

test('markFillers: gagueira → remove a repetição anterior e mantém a última', () => {
  const r = markFillers({ segments: [seg('eu', 'eu', 'quero', 'comprar', 'comprar', 'isso')] });
  const kept = r.segments[0].words.filter((w) => !w.removed).map((w) => w.word);
  assert.deepEqual(kept, ['eu', 'quero', 'comprar', 'isso']);
  assert.equal(r.removedCount, 2);
});

test('markFillers: repetição atravessa a fronteira de segmentos', () => {
  const r = markFillers({ segments: [seg('a', 'gente'), seg('gente', 'vai')] });
  // "gente" repetido no fim do seg 1 e início do seg 2 → remove o primeiro
  assert.equal(r.segments[0].words[1].removed, true);
  assert.ok(!r.segments[1].words[0].removed);
  assert.equal(r.removedCount, 1);
});

test('markFillers: não muta a transcrição original', () => {
  const orig = { segments: [seg('hmm', 'oi')] };
  const r = markFillers(orig);
  assert.ok(!orig.segments[0].words[0].removed, 'original intacta');
  assert.equal(r.segments[0].words[0].removed, true);
});

test('markFillers: preserva marcações removed já existentes (edição do cliente)', () => {
  const s = seg('um', 'dois', 'tres');
  s.words[1].removed = true; // cliente já removeu "dois"
  const r = markFillers({ segments: [s] });
  assert.equal(r.segments[0].words[1].removed, true);
});

test('markFillers: flags off desligam cada limpeza', () => {
  const both = markFillers({ segments: [seg('hmm', 'oi', 'oi')] }, { fillers: false, repeats: false });
  assert.equal(both.removedCount, 0);
  const onlyFill = markFillers({ segments: [seg('hmm', 'oi', 'oi')] }, { repeats: false });
  assert.equal(onlyFill.removedCount, 1);
});

test('markFillers: remove repetição de frase (2-3 palavras) imediata', () => {
  const r = markFillers({ segments: [seg('vou', 'no', 'banco', 'no', 'banco', 'hoje')] });
  const kept = r.segments[0].words.filter((w) => !w.removed).map((w) => w.word);
  assert.deepEqual(kept, ['vou', 'no', 'banco', 'hoje']);
});

test('markFillers: corta falso começo (fragmento prefixo), preserva palavra comum', () => {
  // palavra cortada marcada pela transcrição ("trans-") ou seguida de uma paradinha
  const frag = markFillers({ segments: [seg('trans-', 'transformar', 'tudo')] });
  assert.deepEqual(frag.segments[0].words.filter((w) => !w.removed).map((w) => w.word), ['transformar', 'tudo']);
  const pausa = { segments: [{ words: [{ start: 0, end: 0.3, word: 'trans' }, { start: 0.45, end: 1, word: 'transformar' }, { start: 1.05, end: 1.4, word: 'tudo' }] }] };
  assert.deepEqual(markFillers(pausa).segments[0].words.filter((w) => !w.removed).map((w) => w.word), ['transformar', 'tudo']);
  // fala corrida sem marca: não é gagueira
  const corrida = markFillers({ segments: [seg('trans', 'transformar', 'tudo')] });
  assert.equal(corrida.removedCount, 0);
  // palavras comuns que são o começo da seguinte nunca saem
  for (const frase of [['me', 'sentir', 'bem'], ['no', 'nosso', 'canal'], ['de', 'dentro', 'pra'], ['ou', 'outro', 'dia'], ['do', 'dobro', 'disso']]) {
    const r = markFillers({ segments: [seg(...frase)] }, { aggressive: true });
    assert.equal(r.removedCount, 0, frase.join(' '));
  }
  // "há" (verbo) não é o "hã" de hesitação
  assert.equal(markFillers({ segments: [seg('há', 'dois', 'anos')] }, { aggressive: true }).removedCount, 0);
  assert.equal(markFillers({ segments: [seg('hã', 'dois', 'anos')] }).removedCount, 1);
  // "com" é palavra comum protegida — não vira fragmento de "computador"
  const prot = markFillers({ segments: [seg('com', 'computador', 'novo')] });
  assert.deepEqual(prot.segments[0].words.filter((w) => !w.removed).map((w) => w.word), ['com', 'computador', 'novo']);
});

test('markFillers: engasgo com muleta no meio (forte) → "quero é quero"', () => {
  const r = markFillers({ segments: [seg('quero', 'é', 'quero', 'isso')] }, { aggressive: true });
  const kept = r.segments[0].words.filter((w) => !w.removed).map((w) => w.word);
  assert.deepEqual(kept, ['quero', 'isso'], 'remove a 1ª cópia e o conector, mantém a 2ª');
});
