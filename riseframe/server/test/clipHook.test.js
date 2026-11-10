import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickColdOpen, hookScore, toSentences, selectClips } from '../src/pipeline/clipSelect.js';
import { joinTranscripts } from '../src/pipeline/clips.js';

// frases com tempo (cada palavra 0,3 s; pausa de 0,8 s entre frases)
function transcript(sentences) {
  let t = 0;
  const segments = sentences.map((s) => {
    const words = s.split(' ').map((w) => { const o = { word: w, start: +t.toFixed(2), end: +(t + 0.28).toFixed(2) }; t += 0.3; return o; });
    t += 0.8;
    return { start: words[0].start, end: words.at(-1).end, text: s, words };
  });
  return { language: 'pt', segments };
}

const STORY = [
  'Eu trabalho com empresas de tecnologia há quinze anos.',
  'Nesse tempo eu acompanhei muitas contratações de perto.',
  'O maior erro que eu vejo é contratar só pelo currículo.',
  'Porque o currículo mostra o passado e não a capacidade de aprender.',
  'Então teste a pessoa num problema real antes de contratar.',
];

test('gancho: a frase forte do meio abre o corte quando a 1ª é só contexto', () => {
  const S = toSentences(transcript(STORY));
  const h = pickColdOpen(S, 0, S.length - 1);
  assert.equal(S[h].text, 'O maior erro que eu vejo é contratar só pelo currículo.');
});

test('gancho: não entra quando a 1ª frase já prende, nem frase que depende da anterior', () => {
  const S = toSentences(transcript(['Você sabia que 81% das empresas não acham gente?', 'Isso é o maior erro do mercado hoje.', 'E ninguém fala disso.']));
  assert.equal(pickColdOpen(S, 0, S.length - 1), -1, '1ª frase já é gancho');
  const S2 = toSentences(transcript(['Eu fui contratar uma pessoa ontem.', 'Isso foi o maior erro da minha vida inteira.']));
  assert.equal(pickColdOpen(S2, 0, S2.length - 1), -1, '"Isso…" depende da anterior');
  assert.ok(hookScore('O maior erro que eu vejo') > hookScore('Nesse tempo eu acompanhei'));
});

test('gancho: frase longa demais (> 6 s) não serve de abertura', () => {
  const long = 'O maior erro de todos que eu vejo no mercado inteiro hoje em dia é contratar alguém só olhando o currículo e a faculdade sem nunca testar';
  const S = toSentences(transcript(['Eu trabalho com isso há anos.', long, 'Então teste antes.']));
  assert.equal(pickColdOpen(S, 0, S.length - 1), -1);
});

test('cortes por regras trazem o gancho; com a opção desligada, não', async () => {
  const t = transcript(STORY);
  // corte que precisa do contexto inteiro (mín. 17 s): começa em "Eu trabalho…", sem gancho
  const on = await selectClips(t, { duration: 30 }, { clipMin: 17, clipMax: 40, clipsCount: 1 }, null);
  assert.match(t.segments[0].text, /^Eu trabalho/);
  assert.equal(on[0].start, 0);
  assert.ok(on[0].hook, 'tem gancho');
  assert.match(on[0].hook.text, /maior erro/);
  const off = await selectClips(t, { duration: 30 }, { clipMin: 17, clipMax: 40, clipsCount: 1, clipHook: false }, null);
  assert.equal(off[0].hook, null);
  // corte que já começa forte ("O maior erro…"): não ganha gancho repetido
  const strong = await selectClips(t, { duration: 30 }, { clipMin: 5, clipMax: 40, clipsCount: 1 }, null);
  assert.match(t.segments.find((sg) => sg.start === strong[0].start).text, /maior erro/);
  assert.equal(strong[0].hook, null);
});

test('legenda do clipe com gancho: gancho primeiro, corte deslocado depois dele', () => {
  const hook = { segments: [{ start: 0.1, end: 2, text: 'O maior erro', words: [{ word: 'O', start: 0.1, end: 0.3 }, { word: 'maior', start: 0.4, end: 0.8 }] }] };
  const main = { segments: [{ start: 0.4, end: 3, text: 'Eu trabalho', words: [{ word: 'Eu', start: 0.4, end: 0.6 }, { word: 'trabalho', start: 0.7, end: 1.2 }] }] };
  const j = joinTranscripts(hook, main, 2.5);
  assert.deepEqual(j.segments.map((s) => s.text), ['O maior erro', 'Eu trabalho']);
  assert.equal(j.segments[1].start, 2.9);
  assert.equal(j.segments[1].words[1].end, 3.7);
});
