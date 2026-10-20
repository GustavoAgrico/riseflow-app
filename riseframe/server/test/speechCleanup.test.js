import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markFillers, markNoiseTags } from '../src/pipeline/cleanup.js';
import { windows, guardRemovals, numberedText, cleanupWithLLM } from '../src/pipeline/cleanupLLM.js';
import { verbatimPrompt } from '../src/pipeline/transcribe/providers.js';

/** Frase → palavras com tempo (pausa depois de pontuação). */
function phrase(text) {
  let t = 0;
  const words = text.split(' ').map((word) => {
    const w = { start: +t.toFixed(2), end: +(t + 0.3).toFixed(2), word };
    t += 0.3 + (/[.,…]$/.test(word) ? 0.45 : 0.05);
    return w;
  });
  return { segments: [{ start: 0, end: t, text, words }] };
}
const keptText = (r) => r.segments.flatMap((s) => s.words).filter((w) => !w.removed).map((w) => w.word).join(' ');
const clean = (text, aggressive = true) => keptText(markFillers(phrase(text), { aggressive }));

test('frase refeita: sai a tentativa abandonada, fica a versão final', () => {
  assert.equal(clean('Hoje eu vou mostrar três… hoje eu vou te mostrar as três dicas'), 'hoje eu vou te mostrar as três dicas');
  assert.equal(clean('a gente vai a gente vai fazer isso', false), 'a gente vai fazer isso');
  // palavra cortada no meio ("super-") também é tentativa abandonada
  assert.equal(clean('eu fui no super- eu fui no supermercado'), 'eu fui no supermercado');
});

test('frase refeita: paralelismo de propósito fica inteiro', () => {
  for (const t of [
    'Eu quero que você cresça, eu quero que você lucre',
    'não é o que você fala, é o que você faz',
    'quanto mais você estuda mais você aprende',
  ]) assert.equal(clean(t), t);
});

test('erro corrigido ("digo", "ou melhor"): sai o errado e o marcador (só no forte)', () => {
  assert.equal(clean('no dia 15, digo, no dia 16'), 'no dia 16');
  assert.equal(clean('custa 50, digo, 60 reais'), 'custa 60 reais');
  assert.equal(clean('é bom, ou melhor, é ótimo'), 'é ótimo');
  assert.equal(clean('desculpa a demora gente'), 'desculpa a demora gente');
  assert.equal(clean('no dia 15, digo, no dia 16', false), 'no dia 15, digo, no dia 16');
});

test('"É..." no começo da frase é muleta; "é..." no meio da frase é o verbo', () => {
  assert.equal(clean('É... então eu fui no banco.'), 'então eu fui no banco.');
  assert.equal(clean('O problema é... o dinheiro'), 'O problema é... o dinheiro');
});

test('marcações de som: tosse vira palavra removida; música/risos saem do texto', () => {
  const t = {
    segments: [{
      start: 0, end: 4, text: '',
      words: [
        { start: 0, end: 0.4, word: 'Olá' },
        { start: 0.6, end: 1.1, word: '(tosse)' },
        { start: 1.2, end: 1.5, word: 'pessoal' },
        { start: 1.6, end: 1.8, word: '[limpa' },
        { start: 1.8, end: 1.9, word: 'a' },
        { start: 1.9, end: 2.2, word: 'garganta]' },
        { start: 2.4, end: 3, word: '[Música]' },
        { start: 3.1, end: 3.5, word: 'vamos' },
      ],
    }],
  };
  const r = markNoiseTags(t);
  const ws = r.segments[0].words;
  assert.deepEqual(ws.map((w) => w.word), ['Olá', '(tosse)', 'pessoal', '[limpa a garganta]', 'vamos']);
  assert.deepEqual(ws.map((w) => Boolean(w.removed)), [false, true, false, true, false]);
  assert.equal(r.segments[0].text, 'Olá pessoal vamos');
  // nada para marcar → mesma transcrição
  const plain = phrase('tudo certo');
  assert.equal(markNoiseTags(plain), plain);
});

test('limpeza por IA: janelas cobrem o vídeo inteiro e protegem contra exageros', () => {
  const w = windows(1300, 600, 40);
  assert.deepEqual(w.map((x) => x.core), [[0, 600], [600, 1200], [1200, 1300]]);
  assert.deepEqual([w[1].from, w[1].to], [560, 1240]);
  // mais de 30% da janela → não joga fora: fica "strict" (só passa repetição clara)
  const many = guardRemovals(Array.from({ length: 50 }, (_, i) => i), [0, 100]);
  assert.equal(many.size, 50);
  assert.equal(many.strict, true);
  assert.equal(guardRemovals([1, 2], [0, 100]).strict, false);
  // bloco seguido de 61 palavras sai (31 já pode: frase inteira regravada); o resto fica
  const g = guardRemovals([...Array.from({ length: 61 }, (_, i) => 100 + i), 5, 7], [0, 1000]);
  assert.deepEqual([...g].sort((a, b) => a - b), [5, 7]);
  assert.equal(guardRemovals(Array.from({ length: 31 }, (_, i) => 100 + i), [0, 1000]).size, 31);
  // índices fora do miolo são ignorados
  assert.deepEqual([...guardRemovals([1, 650], [600, 1200])], [650]);
  const flat = [{ word: 'oi', start: 0, end: 0.3 }, { word: 'gente', start: 1.2, end: 1.5 }];
  assert.equal(numberedText(flat, 0, 2), '0:oi ⏸ 1:gente');
});

test('limpeza por IA pela Groq (sem chave da Anthropic): marca só o que a IA pediu', async () => {
  const realFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (url, init) => {
    sent = { url, body: JSON.parse(init.body) };
    // a IA pede para tirar a 1ª tentativa ("vou mostrar" = índices 0 e 1)
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"remove":[0,1,99]}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const t = phrase('vou mostrar, vou te mostrar agora');
    t.provider = 'groq-asr';
    const r = await cleanupWithLLM(t, { groqKey: 'gk-test', groqModel: 'llama-test' });
    assert.match(sent.url, /api\.groq\.com/);
    assert.equal(sent.body.model, 'llama-test');
    assert.match(sent.body.messages[1].content, /0:vou 1:mostrar, ⏸ 2:vou/);
    assert.equal(r.llm, 'groq');
    assert.equal(r.provider, 'groq-asr'); // o provedor da transcrição não é trocado
    assert.equal(r.removedCount, 2);
    assert.equal(keptText(r), 'vou te mostrar agora');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('transcrição ao pé da letra: exemplo de fala natural para o Whisper', () => {
  assert.match(verbatimPrompt(''), /é\.\.\. hã/);
  assert.match(verbatimPrompt('pt'), /eu, eu/);
  assert.match(verbatimPrompt('en'), /uh/);
  assert.equal(verbatimPrompt('es'), '');
});

/** Palavras com pausa escolhida depois de cada uma: [['palavra', pausaDepois], ...]. */
function timed(list) {
  let t = 0;
  const words = list.map(([word, gap = 0.05]) => {
    const w = { start: +t.toFixed(2), end: +(t + 0.3).toFixed(2), word };
    t += 0.3 + gap;
    return w;
  });
  return { segments: [{ start: 0, end: t, text: '', words }] };
}

test('repetição com a mesma palavra escrita diferente ("pra"/"para", "tá"/"está", "3"/"três")', () => {
  assert.equal(clean('vou pra casa vou para casa agora'), 'vou para casa agora');
  assert.equal(clean('isso tá certo isso está certo sim', false), 'isso está certo sim');
  assert.equal(clean('são 3 dicas são três dicas hoje'), 'são três dicas hoje');
});

test('frase inteira regravada (longa) sai; fica a última versão', () => {
  const take = 'se você quer vender mais no instagram sem gastar com anúncio e sem depender do algoritmo você precisa entender uma coisa muito simples';
  assert.equal(take.split(' ').length > 20, true);
  assert.equal(clean(`${take} se você quer vender mais no instagram sem gastar com anúncio e sem depender do algoritmo você precisa entender uma coisa simples agora`),
    'se você quer vender mais no instagram sem gastar com anúncio e sem depender do algoritmo você precisa entender uma coisa simples agora');
});

test('tentativa que travou na última palavra (reticências ou pausa longa) sai', () => {
  assert.equal(clean('hoje eu vou falar… hoje eu vou mostrar três dicas'), 'hoje eu vou mostrar três dicas');
  const r = markFillers(timed([['hoje'], ['eu'], ['vou'], ['falar', 0.9], ['hoje'], ['eu'], ['vou'], ['mostrar'], ['três'], ['dicas']]), { aggressive: false });
  assert.equal(keptText(r), 'hoje eu vou mostrar três dicas');
  // com vírgula/ponto e pausa curta é paralelismo: fica tudo
  for (const t of ['Eu quero que você cresça. Eu quero que você lucre.', 'eu quero que você cresça, eu quero que você lucre']) assert.equal(clean(t), t);
  // pausa curta sem travar: não é retomada
  const p = markFillers(timed([['hoje'], ['eu'], ['vou'], ['falar', 0.2], ['hoje'], ['eu'], ['vou'], ['mostrar']]), { aggressive: false });
  assert.equal(keptText(p), 'hoje eu vou falar hoje eu vou mostrar');
});
