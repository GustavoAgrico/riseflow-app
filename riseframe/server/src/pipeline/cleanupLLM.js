import { makeLogger } from '../logger.js';

const log = makeLogger('cleanup-ai');

/** Achata as palavras da transcrição com um índice global estável. */
function flattenWords(transcript) {
  const flat = [];
  (transcript.segments || []).forEach((seg, si) => {
    const words = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }];
    words.forEach((w, wi) => flat.push({ si, wi, word: String(w.word ?? '').trim() }));
  });
  return flat;
}

const INSTRUCTION =
  `Você limpa transcrições de fala para um editor de vídeo. Recebe as palavras numeradas (índice:palavra).
Retorne os ÍNDICES das palavras que devem ser REMOVIDAS para o vídeo ficar limpo e direto, mantendo o sentido:
- muletas e hesitações ("é", "éé", "ãã", "hã", "hum", "tipo" quando é vício, "né" repetido);
- gagueiras e repetições imediatas (ex.: "eu eu quero" → remova o primeiro "eu");
- falsos começos e autocorreções: quando a pessoa começa uma palavra/frase, se corrige e refaz — remova a tentativa abandonada e mantenha a versão final correta (ex.: "vou no merc- no banco" → remova "merc"/"no" da tentativa; "quero com- comprar" → remova "com").
NÃO remova palavras com significado que fazem parte da frase final. Na dúvida, mantenha.
Responda APENAS com JSON: {"remove":[índices]}`;

function parseIndices(text, maxIdx) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('resposta não-JSON');
    data = JSON.parse(m[0]);
  }
  const arr = Array.isArray(data.remove) ? data.remove : [];
  return new Set(arr.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n < maxIdx));
}

/**
 * Limpeza da fala por IA (Claude): marca palavras a remover (muletas, gagueiras,
 * falsos começos, autocorreções). Retorna uma NOVA transcrição com `removed` nas
 * palavras indicadas — mesmo formato de saída do markFillers heurístico.
 * @returns {Promise<{segments:Array, removedCount:number}>}
 */
export async function cleanupWithClaude(transcript, cfg) {
  const flat = flattenWords(transcript);
  if (!flat.length) return { ...transcript, segments: transcript.segments || [], removedCount: 0 };
  if (flat.length > 2000) throw new Error(`transcrição longa demais para limpeza por IA (${flat.length} palavras)`);

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: cfg.anthropicKey });
  const model = cfg.model || 'claude-opus-5';
  const numbered = flat.map((f, i) => `${i}:${f.word}`).join(' ');

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    system: INSTRUCTION,
    messages: [{ role: 'user', content: numbered }],
  });
  const text = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const remove = parseIndices(text, flat.length);
  log.info(`Claude (${model}) marcou ${remove.size} palavras para remover`);

  // Aplica as marcações numa cópia da transcrição (não muta a original).
  const segments = (transcript.segments || []).map((seg) => {
    const src = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }];
    return { ...seg, words: src.map((w) => ({ ...w })) };
  });
  let removedCount = 0;
  flat.forEach((f, i) => {
    if (remove.has(i) && !segments[f.si].words[f.wi].removed) {
      segments[f.si].words[f.wi].removed = true;
      removedCount++;
    }
  });
  return { ...transcript, segments, removedCount };
}
