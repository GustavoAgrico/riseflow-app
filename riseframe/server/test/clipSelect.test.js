import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSentences, ruleClips, fixClip, selectClips } from '../src/pipeline/clipSelect.js';

/** Frases → transcrição com palavras (0,35 s por palavra, pausa de 0,5 s entre frases). */
function talk(sentences) {
  let t = 0;
  const words = [];
  for (const s of sentences) {
    for (const w of s.split(' ')) {
      words.push({ start: +t.toFixed(2), end: +(t + 0.3).toFixed(2), word: w });
      t += 0.35;
    }
    t += 0.5;
  }
  return { segments: [{ start: 0, end: t, words }] };
}

const VIDEO = talk([
  'Bom dia pessoal, tudo bem com vocês?',
  'Hoje o assunto é um pouco diferente do normal aqui no canal.',
  'Você sabia que o maior erro de quem vende é falar demais?',
  'Quando eu comecei a vender, eu falava sem parar com cada cliente que aparecia.',
  'Um dia um cliente me disse que eu não tinha escutado nada do que ele falou.',
  'Foi ali que eu entendi que vender é perguntar e ouvir.',
  'Então a lição é simples: pergunte mais e fale menos.',
  'E isso vale para qualquer negócio.',
  'Agora deixa eu falar de outra coisa que me incomoda bastante.',
  'Eu acho um absurdo que ninguém fale sobre o preço do atendimento ruim.',
  'Todo mundo culpa o mercado, mas o problema é a falta de preparo.',
  'Por isso eu defendo treinar a equipe todo mês.',
]);

test('frases: pontuação ou pausa fecham a frase', () => {
  const S = toSentences(VIDEO);
  assert.equal(S.length, 12);
  assert.match(S[2].text, /^Você sabia/);
  assert.ok(S[2].start > S[1].end);
});

test('regras: cortes começam e terminam em frases inteiras, com nota, tipo e motivo', () => {
  const S = toSentences(VIDEO);
  const clips = ruleClips(S, { min: 8, max: 25, count: 2, goal: 'entretenimento' });
  assert.equal(clips.length, 2);
  for (const c of clips) {
    assert.ok(c.score >= 0 && c.score <= 100);
    assert.ok(c.reason.length > 10, c.reason);
    assert.ok(S[c.b].end - S[c.a].start <= 25);
    assert.doesNotMatch(S[c.a].text, /^(E|Mas|Por isso|Então) /, `não começa no meio do raciocínio: "${S[c.a].text}"`);
  }
  // a história (com o gancho "Você sabia...") é o melhor corte para entretenimento
  const best = clips[0];
  assert.ok(best.a <= 3 && best.b >= 5, `pegou a história inteira (${best.a}–${best.b})`);
  assert.equal(new Set(clips.flatMap((c) => [c.a, c.b])).size, 4, 'sem sobreposição');
});

test('regras: o objetivo muda a escolha (autoridade prefere a opinião forte)', () => {
  const S = toSentences(VIDEO);
  const [top] = ruleClips(S, { min: 6, max: 14, count: 1, goal: 'autoridade' });
  assert.ok(top.a >= 8, `opinião sobre atendimento (${top.a}–${top.b}): ${top.reason}`);
});

test('ajuste do corte da IA: contexto anterior/posterior e limites de duração', () => {
  const S = toSentences(VIDEO);
  // começa em "E isso vale..." (depende da anterior) → a anterior entra
  const f = fixClip(S, { from: 7, to: 7 }, { min: 2, max: 30 });
  assert.equal(f.a, 6);
  // termina antes de "Então a lição..." (continua a ideia) → ela entra
  const g = fixClip(S, { from: 3, to: 5 }, { min: 2, max: 30 });
  assert.ok(g.b >= 6, 'a conclusão que continua a ideia entra');
  // longo demais → encurta pelo fim
  const h = fixClip(S, { from: 0, to: 11 }, { min: 2, max: 12 });
  assert.ok(S[h.b].end - S[h.a].start <= 12);
  // índices inválidos são limitados
  assert.ok(fixClip(S, { from: -5, to: 999 }, { min: 2, max: 200 }));
});

test('IA (Groq): usa a nota, o tipo e o motivo da IA, corrige o contexto e ordena pela nota', async () => {
  const real = globalThis.fetch;
  let prompt = '';
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    prompt = body.messages[0].content + body.messages[1].content;
    const content = JSON.stringify({ clips: [
      { from: 7, to: 7, type: 'conclusao', score: 61, title: 'Vale para todos', reason: 'Fecha a lição' },
      { from: 2, to: 6, type: 'historia', score: 92, title: 'O erro de quem vende', reason: 'Gancho forte e história com lição clara' },
      { from: 2, to: 4, type: 'gancho', score: 70, title: 'repetido', reason: 'sobrepõe' },
    ] });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const clips = await selectClips(VIDEO, { duration: 60 }, { clipMin: 3, clipMax: 30, clipsCount: 3, clipGoal: 'venda' }, { groqKey: 'x' });
    assert.match(prompt, /gerar desejo e ação/, 'o objetivo vai para a IA');
    assert.match(prompt, /S2 \[\d+\.\ds–\d+\.\ds\] Você sabia/, 'frases numeradas com tempo');
    assert.equal(clips[0].score, 92);
    assert.equal(clips[0].typeLabel, 'História');
    assert.match(clips[0].reason, /Gancho forte/);
    assert.match(clips[0].by, /groq/);
    assert.equal(clips.length, 1, 'os outros sobrepõem o melhor e saem');
  } finally {
    globalThis.fetch = real;
  }
});

test('sem IA (ou se ela falhar): cai na análise por regras', async () => {
  const clips = await selectClips(VIDEO, { duration: 60 }, { clipMin: 8, clipMax: 25, clipsCount: 2 }, null);
  assert.equal(clips.length, 2);
  assert.equal(clips[0].by, 'regras');
  assert.ok(clips[0].score >= clips[1].score, 'do melhor para o pior');
});
