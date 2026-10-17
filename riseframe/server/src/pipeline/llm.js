import { config } from '../config.js';
import { makeLogger } from '../logger.js';
import { jobAccountToken, fetchWaking } from '../account.js';

const log = makeLogger('llm');

/** Chaves/modelos de IA disponíveis (Claude do usuário ou do servidor; senão Llama na Groq). */
export function llmConfig(options = {}) {
  const anthropicKey = options.anthropicKey || config.analyze.anthropicKey;
  return {
    anthropicKey,
    anthropicWorkspaceId: config.analyze.anthropicWorkspaceId,
    model: config.analyze.model,
    groqKey: config.analyze.groqKey,
    groqModel: config.analyze.groqModel,
    // App de PC sem chave de IA: a IA da conta do site responde por ele.
    ...(!anthropicKey && !config.analyze.groqKey ? remoteLlm() : {}),
  };
}
export const llmAvailable = (cfg) => Boolean(cfg?.anthropicKey || cfg?.groqKey || (cfg?.remoteServer && cfg?.remoteToken));

/** App de PC (com conta no site) sem chave local: servidor + token da conta. */
export function remoteLlm(jobId) {
  const token = config.account.server ? jobAccountToken(jobId) : '';
  return token ? { remoteServer: config.account.server, remoteToken: token } : {};
}

/** Pergunta à IA do SITE (só o texto vai); devolve o texto da resposta. */
export async function askRemoteText(system, user, cfg, { maxTokens = 3000, json = true, timeoutMs = 180_000 } = {}) {
  const res = await fetchWaking(`${cfg.remoteServer}/api/remote/llm`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.remoteToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ system, user, maxTokens, json }),
    timeoutMs,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `o servidor da conta respondeu ${res.status}`);
  return String(data.text || '');
}

/** Texto da IA deste servidor (Claude se houver chave; senão Llama na Groq). */
export async function askText(system, user, cfg, { maxTokens = 3000, json = true, timeoutMs = 90_000 } = {}) {
  if (cfg.anthropicKey) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({
      apiKey: cfg.anthropicKey,
      ...(cfg.anthropicWorkspaceId ? { defaultHeaders: { 'anthropic-workspace-id': cfg.anthropicWorkspaceId } } : {}),
    });
    const r = await client.messages.create({ model: cfg.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }, { timeout: timeoutMs });
    return { text: (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''), provider: 'claude' };
  }
  if (cfg.groqKey) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        signal: AbortSignal.timeout(timeoutMs),
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.groqModel || 'llama-3.3-70b-versatile',
          temperature: 0.2,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      });
      if (res.status === 429 && attempt < 6) {
        const wait = Math.min(45, Number(res.headers.get('retry-after')) || 8 * attempt);
        log.warn(`Groq pediu para esperar ${wait}s`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return { text: data.choices?.[0]?.message?.content || '', provider: 'groq' };
    }
  }
  if (cfg.remoteServer && cfg.remoteToken) return { text: await askRemoteText(system, user, cfg, { maxTokens, json, timeoutMs: Math.max(timeoutMs, 180_000) }), provider: 'nuvem' };
  throw new Error('sem chave de IA');
}

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
  const { text, provider } = await askText(system, user, cfg, { maxTokens, timeoutMs, json: true });
  return { data: parseJsonLoose(text), provider };
}
