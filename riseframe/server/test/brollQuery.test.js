import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickBrollMoments, contextQuery, isVerbish } from '../src/pipeline/analyze.js';
import { downloadMedia } from '../src/pipeline/broll.js';

function segs(lines) {
  let t = 0;
  return lines.map((s) => {
    const words = s.split(' ').map((w) => { const o = { word: w, start: +t.toFixed(2), end: +(t + 0.3).toFixed(2) }; t += 0.35; return o; });
    t += 5;
    return { start: words[0].start, end: words.at(-1).end, text: s, words };
  });
}

test('Google Imagens: a busca leva o complemento da palavra (o caso do vídeo)', () => {
  const s = segs([
    'O Brasil está vivendo o maior apagão de mão de obra da sua história',
    'Saiu uma pesquisa do Manpower Group em 2026 e trouxe números assustadores',
    'Oitenta e um por cento dos empregadores relatam dificuldade para contratar',
    'Faltam profissionais de inteligência artificial e análise de dados',
  ]);
  const q = pickBrollMoments(s, [{ term: 'empregadores' }], 60, { imageSource: 'google', brollSkipIntro: 0 }).map((m) => m.query);
  assert.deepEqual(q, ['apagão de mão de obra', 'pesquisa do Manpower Group', 'empregadores', 'profissionais de inteligência artificial']);
});

test('Google Imagens: verbo, advérbio e número por extenso não viram busca', () => {
  for (const w of ['vivendo', 'mostrou', 'lideraram', 'realmente', 'falando']) assert.equal(isVerbish(w), true, w);
  for (const w of ['história', 'energia', 'pesquisa', 'apagão', 'empresa']) assert.equal(isVerbish(w), false, w);
  const q = pickBrollMoments(segs(['estamos vivendo realmente oitenta']), [], 30, { imageSource: 'google', brollSkipIntro: 0 });
  assert.equal(q.length, 0);
  assert.equal(contextQuery({ text: 'o dono da loja chegou' }, 'dono'), 'dono da loja');
  assert.equal(contextQuery({ text: 'vendas cresceram' }, 'vendas'), 'vendas');
});

test('download do B-roll: site que recusa o app recebe de novo como navegador antes da miniatura', async () => {
  const calls = [];
  const fetchOnce = async (url, dest, caps) => {
    calls.push(`${url}${caps.browser ? ' (navegador)' : ''}`);
    if (url === 'https://site.com/foto.jpg' && !caps.browser) throw Object.assign(new Error('download falhou 403'), { status: 403 });
    return dest;
  };
  await downloadMedia('https://site.com/foto.jpg', 'https://tbn.gstatic.com/x', '/tmp/x', true, { fetchOnce });
  assert.deepEqual(calls, ['https://site.com/foto.jpg', 'https://site.com/foto.jpg (navegador)'], 'a original vem, sem cair na miniatura');

  const calls2 = [];
  const fail = async (url, dest, caps) => {
    calls2.push(`${url}${caps.browser ? ' (navegador)' : ''}`);
    if (url.includes('site.com')) throw Object.assign(new Error('download falhou 403'), { status: 403 });
    return dest;
  };
  await downloadMedia('https://site.com/foto.jpg', 'https://tbn.gstatic.com/x', '/tmp/x', true, { fetchOnce: fail });
  assert.deepEqual(calls2, ['https://site.com/foto.jpg', 'https://site.com/foto.jpg (navegador)', 'https://tbn.gstatic.com/x'], 'só então a miniatura');
});
