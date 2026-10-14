import { config } from '../config.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('llm');

/** Chaves/modelos de IA disponíveis (Claude do usuário ou do servidor; senão Llama na Groq). */
export function llmConfig(options = {}) {
  return {
    anthropicKey: options.anthropicKey || config.analyze.anthropicKey,
    anthropicWorkspaceId: config.analyze.anthropicWorkspaceId,
    model: config.analyze.model,
    groqKey: config.analyze.groqKey,
    groqModel: config.analyze.groqModel,
  };
}
export const llmAvailable = (cfg) => Boolean(cfg?.anthropicKey || cfg?.groqKey);

export function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (!m) throw new Error('resposta não-JSON');
    return JSON.parse(m[0]);
  }
}

/**
 * Pergunta à IA e devolve o JSON da resposta. Claude se houver chave; senão Llama (Groq).
 * Uma nova tentativa na Groq se ela pedir para esperar (429).
 */
export async function askJson(system, user, cfg, { maxTokens = 3000, timeoutMs = 90_000 } = {}) {
  if (cfg.anthropicKey) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({
      apiKey: cfg.anthropicKey,
      ...(cfg.anthropicWorkspaceId ? { defaultHeaders: { 'anthropic-workspace-id': cfg.anthropicWorkspaceId } } : {}),
    });
    const r = await client.messages.create({ model: cfg.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }, { timeout: timeoutMs });
    const text = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { data: parseJsonLoose(text), provider: 'claude' };
  }
  if (!cfg.groqKey) throw new Error('sem chave de IA');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      signal: AbortSignal.timeout(timeoutMs),
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.groqModel || 'llama-3.3-70b-versatile',
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (res.status === 429 && attempt < 3) {
      const wait = Math.min(20, Number(res.headers.get('retry-after')) || 5 * attempt);
      log.warn(`Groq pediu para esperar ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return { data: parseJsonLoose(data.choices?.[0]?.message?.content || ''), provider: 'groq' };
  }
}
