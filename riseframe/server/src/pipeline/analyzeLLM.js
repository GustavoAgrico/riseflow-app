import { makeLogger } from '../logger.js';

const log = makeLogger('analyze-ai');

/**
 * Representação compacta da transcrição (tempo + texto) para o LLM. Vídeo longo: junta
 * segmentos vizinhos em blocos para o vídeo INTEIRO caber (antes só os 80 primeiros
 * segmentos iam, e o B-roll ficava todo no começo).
 */
export function compactTranscript(transcript, maxLines = 120) {
  const segs = (transcript.segments || []).filter((s) => String(s.text || '').trim());
  const per = Math.max(1, Math.ceil(segs.length / maxLines));
  const lines = [];
  for (let i = 0; i < segs.length; i += per) {
    const group = segs.slice(i, i + per);
    lines.push(`[${group[0].start.toFixed(1)}s] ${group.map((s) => s.text.trim()).join(' ')}`);
  }
  return lines.join('\n');
}

const INSTRUCTION = (duration, maxCount, niche, source = 'pexels') => {
  // A query segue a FONTE de imagens: Pexels é indexado em inglês; Google Imagens
  // busca melhor em português com o contexto real da fala.
  const queryRule = source === 'google'
    ? `"query" — termos de busca EM PORTUGUÊS que representem CONCRETAMENTE o que está sendo dito no trecho (ex.: "reunião de equipe", "médico com paciente", "gráfico de crescimento"), visuais e ALINHADOS ao nicho.`
    : `"query" — termos de busca EM INGLÊS para um banco de vídeos (ex.: "business leadership team", "doctor hospital", "mentor coaching"), concretos, visuais e ALINHADOS ao nicho.`;
  return `Você seleciona momentos de B-roll para um editor de vídeo. Recebe a transcrição com marcações de tempo (em segundos) de um vídeo de ${duration.toFixed(0)}s.
${niche
    ? `O NICHO/LINGUAGEM do vídeo é: ${niche}. TODAS as buscas devem ser visualmente coerentes com esse nicho (o clima, as pessoas e os cenários precisam combinar com ${niche}).`
    : `Primeiro, identifique o NICHO/tema do vídeo (ex.: liderança, medicina, mentoria, finanças, fitness) e mantenha TODAS as buscas visualmente coerentes com ele.`}
Antes de escolher, entenda o ASSUNTO CENTRAL do vídeo (sobre o que a pessoa está falando, para quem e com qual objetivo). Toda imagem precisa deixar CLARO esse assunto para quem assiste sem som: mostre a cena concreta do que está sendo dito naquele trecho, dentro do contexto do assunto central (ex.: num vídeo sobre cobrar resultados da equipe, "metas" vira "gestor revisando metas com a equipe em reunião", e não "alvo com flecha"). Evite imagens genéricas, abstratas, de ícones ou de texto, e nada que contradiga o que está sendo dito.
Escolha até ${maxCount} momentos onde inserir imagens de apoio, distribuídos ao longo do vídeo INTEIRO (evite a introdução e escolha trechos em que a fala cita algo que dá para mostrar). IMPORTANTE: cada "query" deve ser DIFERENTE das demais — nunca repita o mesmo termo de busca, para não repetir imagens ao longo do vídeo.
Para cada momento devolva: "start" (segundo de início, número), "end" (fim, número, 1.5–4s após o start) e ${queryRule}
Também devolva "topic" (o assunto central em uma frase curta, em português), "niche" (o nicho em 1-2 palavras, em português) e "themes": 3–6 temas centrais.
Responda APENAS com JSON no formato: {"topic":"...","niche":"...","themes":["..."],"brollMoments":[{"start":0,"end":0,"query":"..."}]}`;
};

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('resposta não-JSON');
  }
}

function normalize(data, duration, maxCount) {
  const seen = new Set(); // dedupe de query → evita repetir a mesma imagem
  const moments = (data.brollMoments || data.moments || [])
    .map((m) => ({
      start: Math.max(0, Number(m.start) || 0),
      end: Math.min(duration, Number(m.end) || (Number(m.start) || 0) + 3),
      query: String(m.query || m.q || '').trim(),
    }))
    .filter((m) => m.query && m.end - m.start >= 0.8 && m.start < duration)
    .filter((m) => {
      const k = m.query.toLowerCase().trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, maxCount);
  const themes = (data.themes || []).map((t) => ({ term: String(t).toLowerCase(), count: 1 })).slice(0, 6);
  return { themes, brollMoments: moments, topic: String(data.topic || '').slice(0, 160) };
}

// ─── Anthropic (Claude) via SDK oficial ───────────────────────────────
export async function analyzeWithClaude(transcript, meta, options, cfg) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: cfg.anthropicKey,
    ...(cfg.anthropicWorkspaceId ? { defaultHeaders: { 'anthropic-workspace-id': cfg.anthropicWorkspaceId } } : {}),
  });
  const maxCount = options.brollMax ?? 6;
  const model = cfg.model || 'claude-opus-5';

  const response = await client.messages.create({
    model,
    max_tokens: 1500,
    system: INSTRUCTION(meta.duration, maxCount, cfg.niche, cfg.imageSource),
    messages: [{ role: 'user', content: compactTranscript(transcript) }],
  });
  const text = (response.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  log.info(`Claude (${model}) respondeu ${text.length} chars`);
  return normalize(parseJson(text), meta.duration, maxCount);
}

// ─── OpenAI / Groq via HTTP (API no formato OpenAI; fetch é aceitável aqui) ───────
export async function analyzeWithOpenAI(transcript, meta, options, cfg) {
  return chatJson(transcript, meta, options, cfg, { url: 'https://api.openai.com/v1/chat/completions', key: cfg.openaiKey, model: cfg.openaiModel || 'gpt-4o-mini', label: 'OpenAI' });
}

/** Groq (Llama): a mesma chave da transcrição já basta para o B-roll entender o assunto. */
export async function analyzeWithGroq(transcript, meta, options, cfg) {
  return chatJson(transcript, meta, options, cfg, { url: 'https://api.groq.com/openai/v1/chat/completions', key: cfg.groqKey, model: cfg.groqModel || 'llama-3.3-70b-versatile', label: 'Groq' });
}

async function chatJson(transcript, meta, options, cfg, { url, key, model, label }) {
  const maxCount = options.brollMax ?? 6;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(45000),
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: INSTRUCTION(meta.duration, maxCount, cfg.niche, cfg.imageSource) },
        { role: 'user', content: compactTranscript(transcript) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  log.info(`${label} (${model}) respondeu ${text.length} chars`);
  return normalize(parseJson(text), meta.duration, maxCount);
}
