import { makeLogger } from '../logger.js';

const log = makeLogger('analyze-ai');

/** Representação compacta da transcrição (tempo + texto por segmento) para o LLM. */
function compactTranscript(transcript, maxSegments = 80) {
  return (transcript.segments || [])
    .slice(0, maxSegments)
    .map((s) => `[${s.start.toFixed(1)}s] ${s.text}`)
    .join('\n');
}

const INSTRUCTION = (duration, maxCount, niche) =>
  `Você seleciona momentos de B-roll para um editor de vídeo. Recebe a transcrição com marcações de tempo (em segundos) de um vídeo de ${duration.toFixed(0)}s.
${niche
    ? `O NICHO/LINGUAGEM do vídeo é: ${niche}. TODAS as buscas devem ser visualmente coerentes com esse nicho (o clima, as pessoas e os cenários precisam combinar com ${niche}).`
    : `Primeiro, identifique o NICHO/tema do vídeo (ex.: liderança, medicina, mentoria, finanças, fitness) e mantenha TODAS as buscas visualmente coerentes com ele.`}
Escolha até ${maxCount} momentos onde inserir imagens de apoio, distribuídos ao longo do vídeo (evite a introdução e não repita a mesma imagem em sequência).
Para cada momento devolva: "start" (segundo de início, número), "end" (fim, número, 1.5–4s após o start) e "query" — termos de busca EM INGLÊS para um banco de vídeos (ex.: "business leadership team", "doctor hospital", "mentor coaching"), concretos, visuais e ALINHADOS ao nicho.
Também devolva "niche" (o nicho em 1-2 palavras, em português) e "themes": 3–6 temas centrais.
Responda APENAS com JSON no formato: {"niche":"...","themes":["..."],"brollMoments":[{"start":0,"end":0,"query":"..."}]}`;

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
  const moments = (data.brollMoments || data.moments || [])
    .map((m) => ({
      start: Math.max(0, Number(m.start) || 0),
      end: Math.min(duration, Number(m.end) || (Number(m.start) || 0) + 3),
      query: String(m.query || m.q || '').trim(),
    }))
    .filter((m) => m.query && m.end - m.start >= 0.8 && m.start < duration)
    .slice(0, maxCount);
  const themes = (data.themes || []).map((t) => ({ term: String(t).toLowerCase(), count: 1 })).slice(0, 6);
  return { themes, brollMoments: moments };
}

// ─── Anthropic (Claude) via SDK oficial ───────────────────────────────
export async function analyzeWithClaude(transcript, meta, options, cfg) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: cfg.anthropicKey });
  const maxCount = options.brollMax ?? 6;
  const model = cfg.model || 'claude-opus-5';

  const response = await client.messages.create({
    model,
    max_tokens: 1500,
    system: INSTRUCTION(meta.duration, maxCount, cfg.niche),
    messages: [{ role: 'user', content: compactTranscript(transcript) }],
  });
  const text = (response.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  log.info(`Claude (${model}) respondeu ${text.length} chars`);
  return normalize(parseJson(text), meta.duration, maxCount);
}

// ─── OpenAI via HTTP (provedor distinto; fetch é aceitável aqui) ───────
export async function analyzeWithOpenAI(transcript, meta, options, cfg) {
  const maxCount = options.brollMax ?? 6;
  const model = cfg.openaiModel || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: INSTRUCTION(meta.duration, maxCount, cfg.niche) },
        { role: 'user', content: compactTranscript(transcript) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return normalize(parseJson(text), meta.duration, maxCount);
}
