import { makeLogger } from '../logger.js';
import { isFiller } from './cleanup.js';

const log = makeLogger('cleanup-ai');

/** Palavras ainda mantidas, com a posição na transcrição (seg, palavra) e o tempo. */
function flattenWords(transcript) {
  const flat = [];
  (transcript.segments || []).forEach((seg, si) => {
    const words = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }];
    words.forEach((w, wi) => {
      if (!w.removed) flat.push({ si, wi, word: String(w.word ?? '').trim(), start: Number(w.start), end: Number(w.end) });
    });
  });
  return flat;
}

const INSTRUCTION =
  `Você é o editor de um vídeo falado (Reels/YouTube) e limpa a fala para o corte ficar profissional, como se a pessoa tivesse falado tudo certo de primeira.
Recebe as palavras numeradas ("índice:palavra"). "⏸" marca uma pausa na fala.
Devolva os ÍNDICES das palavras que devem SAIR do vídeo:
1. Muletas e hesitações: "é...", "éé", "ãã", "hã", "hum", "ahn", "tipo" ou "né" usados como vício.
2. Gagueiras e repetições sem querer: "eu eu quero" → sai o primeiro "eu".
3. FRASES REFEITAS: a pessoa começa uma frase, erra, trava ou se perde, e FALA DE NOVO. Tire a tentativa que deu errado INTEIRA (do começo dela até onde parou) e deixe só a versão final, que é a última.
   Ex.: "hoje eu vou mostrar três ⏸ hoje eu vou te mostrar as três dicas" → saem "hoje eu vou mostrar três".
4. ERROS CORRIGIDOS: palavra, nome ou número errado que a pessoa corrige logo em seguida — sai o errado e a correção ("custa 50, digo, 60 reais" → saem "50," e "digo,").
5. Frases abandonadas no meio que não se completam e são substituídas por outra.
NUNCA tire: palavras que fazem parte da frase final; repetições de ênfase ("muito, muito importante"); paralelismos e listas de propósito ("eu quero que você cresça, eu quero que você lucre"); conectivos com sentido ("então", "porque", "mas"); nada que mude o que a pessoa quis dizer. O texto que sobrar precisa ficar natural e completo. Na dúvida, MANTENHA.
Responda APENAS com JSON: {"remove":[índices]}`;

function parseIndices(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (!m) throw new Error('resposta não-JSON');
    data = JSON.parse(m[0]);
  }
  const arr = Array.isArray(data.remove) ? data.remove : [];
  return arr.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0);
}

/** Texto numerado de uma janela de palavras, com "⏸" nas pausas (ajuda a ver retomadas). */
export function numberedText(flat, from, to) {
  const parts = [];
  for (let i = from; i < to; i++) {
    if (i > from && flat[i].start - flat[i - 1].end >= 0.4) parts.push('⏸');
    parts.push(`${i}:${flat[i].word}`);
  }
  return parts.join(' ');
}

/**
 * Janelas de até `size` palavras (o vídeo inteiro, mesmo longo), com `ctx` palavras de
 * contexto de cada lado. Só valem os índices do miolo de cada janela. Puro.
 */
export function windows(n, size = 600, ctx = 40) {
  const out = [];
  for (let a = 0; a < n; a += size) {
    const b = Math.min(n, a + size);
    out.push({ core: [a, b], from: Math.max(0, a - ctx), to: Math.min(n, b + ctx) });
  }
  return out;
}

/**
 * Proteções contra exageros da IA numa janela: se ela tirar mais de 30% das palavras,
 * ou um trecho seguido de mais de 30 palavras, aquilo é descartado (melhor deixar uma
 * muleta do que sumir com uma parte da fala). Puro.
 */
export function guardRemovals(indices, [a, b]) {
  const set = new Set(indices.filter((i) => i >= a && i < b));
  if (set.size > 0.3 * (b - a) + 2) return new Set();
  const sorted = [...set].sort((x, y) => x - y);
  let runStart = 0;
  for (let k = 1; k <= sorted.length; k++) {
    if (k < sorted.length && sorted[k] === sorted[k - 1] + 1) continue;
    if (k - runStart > 30) for (let r = runStart; r < k; r++) set.delete(sorted[r]);
    runStart = k;
  }
  return set;
}

const normWord = (w) => String(w ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
// muletas de vício que a IA pode tirar soltas
const VICE = new Set(['ne', 'tipo', 'sabe', 'entendeu', 'ta', 'assim']);
// marcadores de correção ("50, digo, 60")
const MARKERS = new Set(['digo', 'melhor', 'alias', 'perdao', 'desculpa', 'desculpe', 'corrigindo', 'quer', 'dizer']);

/**
 * Confere o que a IA mandou tirar: só passa o que tem CARA de erro de fala —
 * muleta; repetição / frase refeita (as palavras tiradas reaparecem logo depois); pedaço
 * de palavra; ou correção com marcador ("digo", "ou melhor"). Um trecho que a IA tirou
 * sem nenhum desses sinais é descartado (a IA às vezes erra o índice ou "resume" a fala,
 * e aí cortava palavras de verdade). Puro.
 */
export function plausibleRemovals(flat, set) {
  const n = flat.map((f) => normWord(f.word));
  const sorted = [...set].sort((a, b) => a - b);
  const keep = new Set();
  for (let k = 0; k < sorted.length;) {
    let j = k;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    const run = sorted.slice(k, j + 1);
    const after = [];
    for (let q = run[run.length - 1] + 1; q < Math.min(n.length, run[run.length - 1] + 1 + run.length + 8); q++) after.push(n[q]);
    const reappears = (x) => x && (after.includes(x) || after.some((a) => a.length > x.length && x.length >= 2 && a.startsWith(x)));
    const content = run.filter((i) => !isFiller(flat[i].word, true) && !VICE.has(n[i]) && !MARKERS.has(n[i]));
    const repeated = content.filter((i) => reappears(n[i])).length;
    const ok =
      content.length === 0 || // só muletas
      run.some((i) => MARKERS.has(n[i])) || // correção com marcador
      (reappears(n[run[0]]) && repeated >= Math.ceil(content.length * 0.5)); // frase refeita / repetição
    if (ok) for (const i of run) keep.add(i);
    k = j + 1;
  }
  return keep;
}

async function askClaude(system, user, cfg) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: cfg.anthropicKey,
    ...(cfg.anthropicWorkspaceId ? { defaultHeaders: { 'anthropic-workspace-id': cfg.anthropicWorkspaceId } } : {}),
  });
  const response = await client.messages.create({ model: cfg.model || 'claude-opus-5', max_tokens: 3000, system, messages: [{ role: 'user', content: user }] });
  return (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

/** Groq (Llama), API no formato OpenAI. Uma nova tentativa se a Groq pedir para esperar (429). */
async function askGroq(system, user, cfg) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      signal: AbortSignal.timeout(60_000),
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.groqModel || 'llama-3.3-70b-versatile',
        temperature: 0,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    // limite por minuto da Groq: espera e tenta de novo (vídeo longo = vários blocos seguidos)
    if (res.status === 429 && attempt < 6) {
      const wait = Math.min(45, Number(res.headers.get('retry-after')) || 8 * attempt);
      log.warn(`Groq pediu para esperar ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

/** App de PC sem chave de IA: o servidor do site pergunta à IA por ele (só o texto vai). */
async function askRemote(_system, user, cfg) {
  const res = await fetch(`${cfg.remoteServer}/api/cleanup/remote`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.remoteToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text: user }),
    signal: AbortSignal.timeout(180_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `o servidor da conta respondeu ${res.status}`);
  return String(data.text || '');
}

/** Um bloco da limpeza com a IA DESTE servidor (usado pelo app de PC via /api/cleanup/remote). */
export async function cleanupWindowLLM(text, cfg) {
  if (cfg.anthropicKey) return askClaude(INSTRUCTION, text, cfg);
  if (cfg.groqKey) return askGroq(INSTRUCTION, text, cfg);
  throw new Error('este servidor não tem IA configurada');
}

/**
 * Limpeza da fala por IA (Claude, ou Llama na Groq): marca muletas, gagueiras, frases
 * refeitas e erros corrigidos. Recebe a transcrição já limpa pela heurística (as palavras
 * que ela tirou nem vão para a IA) e devolve uma NOVA transcrição com `removed` nas
 * palavras indicadas — `removedCount` conta só as novas.
 * @returns {Promise<{segments:Array, removedCount:number, llm:string}>}
 */
export async function cleanupWithLLM(transcript, cfg) {
  const flat = flattenWords(transcript);
  const provider = cfg.anthropicKey ? 'claude' : cfg.groqKey ? 'groq' : cfg.remoteServer && cfg.remoteToken ? 'nuvem' : '';
  if (!flat.length || !provider) return { ...transcript, segments: transcript.segments || [], removedCount: 0, llm: provider };
  if (flat.length > 20000) throw new Error(`transcrição longa demais para limpeza por IA (${flat.length} palavras)`);
  const ask = provider === 'claude' ? askClaude : provider === 'groq' ? askGroq : askRemote;

  // Cada bloco é independente: se um falhar (limite da API, rede), os outros continuam valendo
  // — antes um erro num vídeo longo jogava fora a correção do vídeo inteiro.
  const asked = new Set();
  const wins = windows(flat.length);
  let failed = 0;
  for (const w of wins) {
    try {
      const text = await ask(INSTRUCTION, numberedText(flat, w.from, w.to), cfg);
      for (const i of guardRemovals(parseIndices(text), w.core)) asked.add(i);
    } catch (err) {
      failed++;
      log.warn(`bloco ${w.core[0]}–${w.core[1]} da limpeza por IA falhou: ${err.message}`);
    }
  }
  if (failed === wins.length) throw new Error('a limpeza por IA falhou em todos os blocos');
  const remove = plausibleRemovals(flat, asked);
  log.info(`${provider} marcou ${asked.size} palavras para remover; ${remove.size} conferidas como erro de fala (${flat.length} palavras)`);

  // Aplica as marcações numa cópia da transcrição (não muta a original).
  const segments = (transcript.segments || []).map((seg) => {
    const src = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }];
    return { ...seg, words: src.map((w) => ({ ...w })) };
  });
  let removedCount = 0;
  for (const i of remove) {
    const f = flat[i];
    segments[f.si].words[f.wi].removed = true;
    removedCount++;
  }
  return { ...transcript, segments, removedCount, llm: provider };
}

/** Compatibilidade: a limpeza só com o Claude. */
export function cleanupWithClaude(transcript, cfg) {
  return cleanupWithLLM(transcript, { ...cfg, groqKey: '' });
}
