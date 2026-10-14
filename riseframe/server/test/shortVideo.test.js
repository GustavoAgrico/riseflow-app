import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSentences } from '../src/pipeline/clipSelect.js';
import { ideaBlocks, ruleStory, fixStory, selectStory, markStory } from '../src/pipeline/shortVideo.js';

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

// ~2 min e meio de fala: apresentação, gancho, conteúdo, digressão, conclusão, despedida
const LONG = talk([
  'Oi pessoal, tudo bem com vocês? Sejam bem-vindos ao canal.',
  'Antes de começar deixa o seu like e se inscreve no canal.',
  'Hoje eu tava pensando em várias coisas aqui no escritório enquanto tomava café.',
  'Você sabia que o maior erro de quem vende é falar demais?',
  'Quando eu comecei a vender, eu falava sem parar com cada cliente que aparecia na loja.',
  'Um dia um cliente me disse que eu não tinha escutado nada do que ele falou.',
  'Foi ali que eu entendi que vender é perguntar e ouvir.',
  'Aliás, falando em loja, a reforma lá ficou bem bonita, o pintor demorou mas ficou bom.',
  'E o estacionamento também melhorou bastante depois que mudaram a rua.',
  'O primeiro passo é fazer perguntas abertas sobre o problema do cliente.',
  'O segundo passo é repetir o que ele disse com as suas palavras para mostrar que entendeu.',
  'O terceiro passo é só apresentar a solução depois que ele mesmo falou da dor.',
  'Eu sei que parece simples mas quase ninguém faz isso no dia a dia.',
  'Então a lição é simples: pergunte mais e fale menos.',
  'Bom, era isso, um beijo e até o próximo vídeo.',
]);

test('ideias: frase que depende da anterior fica junto dela', () => {
  const S = toSentences(LONG);
  const blocks = ideaBlocks(S);
  const withEstac = blocks.find((b) => S[b.b].text.startsWith('E o estacionamento'));
  assert.ok(withEstac && withEstac.a < withEstac.b, '"E o estacionamento..." vai com a frase anterior');
});

test('regras: um vídeo curto na duração pedida, sem apresentação, com gancho e conclusão', () => {
  const S = toSentences(LONG);
  const target = 30;
  const parts = fixStory(S, ruleStory(S, { target }), { target });
  const secs = parts.reduce((t, p) => t + S[p.b].end - S[p.a].start, 0);
  assert.ok(secs >= target * 0.75 && secs <= target * 1.2, `${secs.toFixed(1)}s`);
  const texts = parts.flatMap((p) => S.slice(p.a, p.b + 1).map((s) => s.text));
  assert.ok(!texts.some((t) => /Oi pessoal|deixa o seu like|até o próximo/.test(t)), texts.join(' | '));
  assert.ok(texts.some((t) => /maior erro/.test(t)), 'entra o gancho');
  assert.ok(texts.some((t) => /a lição é simples/.test(t)), 'entra a conclusão');
  for (let i = 1; i < parts.length; i++) assert.ok(parts[i].a > parts[i - 1].b, 'em ordem, sem sobreposição');
});

test('conferência: parte longa demais é aparada; parte que depende da anterior puxa a anterior', () => {
  const S = toSentences(LONG);
  const long = fixStory(S, [{ from: 0, to: S.length - 1 }], { target: 30 });
  assert.ok(long.reduce((t, p) => t + S[p.b].end - S[p.a].start, 0) <= 36);
  const iE = S.findIndex((s) => s.text.startsWith('E o estacionamento'));
  const iHook = S.findIndex((x) => /^Você sabia/.test(x.text));
  const ctx = fixStory(S, [{ from: iHook, to: iHook + 3, essential: true }, { from: iE, to: iE }], { target: 60 });
  assert.ok(ctx.some((p) => p.a === iE - 1 || (p.a < iE && p.b >= iE)), 'a frase anterior entrou');
});

test('IA: usa as partes escolhidas, título e resumo; o resto fica marcado como removido', async () => {
  const S = toSentences(LONG);
  const at = (re) => S.findIndex((x) => re.test(x.text));
  const real = globalThis.fetch;
  let prompt = '';
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    prompt = body.messages[0].content;
    const content = JSON.stringify({ title: 'Pare de falar demais', summary: 'Vender é ouvir', parts: [
      { from: at(/^Você sabia/), to: at(/^Foi ali/), role: 'gancho', essential: true },
      { from: at(/^O primeiro passo/), to: at(/^O terceiro passo/), role: 'desenvolvimento', essential: false },
      { from: at(/^Então a lição/), to: at(/^Então a lição/), role: 'conclusao', essential: true },
    ] });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const story = await selectStory(LONG, {}, { shortTarget: 45 }, { groqKey: 'x' });
    assert.match(prompt, /UM ÚNICO vídeo curto/);
    assert.match(story.by, /groq/);
    assert.equal(story.title, 'Pare de falar demais');
    assert.equal(story.parts.length, 3);
    const marked = markStory(LONG, story.parts);
    const kept = marked.segments[0].words.filter((w) => !w.removed).map((w) => w.word).join(' ');
    assert.match(kept, /^Você sabia que o maior erro/);
    assert.match(kept, /pergunte mais e fale menos\.$/);
    assert.doesNotMatch(kept, /pintor|Oi pessoal/);
  } finally {
    globalThis.fetch = real;
  }
});

test('vídeo que já é curto: nada a resumir', async () => {
  const short = talk(['Você sabia que o maior erro de quem vende é falar demais?', 'Pergunte mais e fale menos.']);
  assert.equal(await selectStory(short, {}, { shortTarget: 60 }, null), null);
});
