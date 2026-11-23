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
export async function askRemoteText(system, user, cfg, { maxTokens = 3000, json = true, task = 'chat', timeoutMs = 300_000 } = {}) {
  const res = await fetchWaking(`${cfg.remoteServer}/api/remote/llm`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.remoteToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ system, user, maxTokens, json, task }),
    timeoutMs,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `o servidor da conta respondeu ${res.status}`);
  return String(data.text || '');
}

/** Texto da IA deste servidor (Claude se houver chave; senão Llama na Groq). */
// ─── Claude (Opus 5.5 por padrão) ──────────────────────────────────────────
// Um lugar só para falar com o Claude: modelo, pensamento adaptativo, esforço por tarefa,
// streaming (respostas longas sem estourar o tempo), cache do prompt do sistema e o
// "plano B" do servidor quando o modelo recusa (fallbacks).

/**
 * Esforço por tarefa (low|medium|high|xhigh|max). RISEFRAME_CLAUDE_EFFORT_<TAREFA> ou
 * RISEFRAME_CLAUDE_EFFORT mudam (com prefixo: CLAUDE_EFFORT é do próprio Claude Code e
 * estaria no ambiente de quem usa as duas coisas).
 */
export const CLAUDE_EFFORT = { motion: 'high', review: 'high', edit: 'high', analyze: 'high', cleanup: 'medium', translate: 'medium', chat: 'medium' };
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

export function effortFor(task = 'chat', env = process.env) {
  const own = String(env[`RISEFRAME_CLAUDE_EFFORT_${String(task).toUpperCase()}`] || '').toLowerCase();
  const all = String(env.RISEFRAME_CLAUDE_EFFORT || '').toLowerCase();
  if (EFFORTS.includes(own)) return own;
  if (EFFORTS.includes(all)) return all;
  return CLAUDE_EFFORT[task] || 'medium';
}

/**
 * O que o modelo aceita. Opus 5.5/5, Sonnet 5.x, Haiku 5.5, Fable/Mythos e Opus/Sonnet 4.6+:
 * pensamento adaptativo e esforço; Haiku 4.5 e mais antigos: nada disso. Plano B do servidor
 * só nos que têm. Puro.
 */
export function claudeCaps(model) {
  const m = String(model || '');
  const modern = /^claude-(opus-5|opus-4-[678]|sonnet-5|sonnet-4-6|haiku-5|fable|mythos)/.test(m);
  return {
    adaptive: modern,
    effort: modern || /^claude-opus-4-5/.test(m),
    fallbacks: /^claude-(opus-5-5|opus-5(?![-\d])|fable-5-[12]|mythos-5-[12]|sonnet-5-5)/.test(m),
  };
}

/** Parâmetros da chamada ao Claude (separado para testar). Puro. */
export function claudeParams({ model, system, content, maxTokens = 16000, task = 'chat', effort }) {
  const caps = claudeCaps(model);
  return {
    model,
    max_tokens: maxTokens,
    // o prompt do sistema é fixo por tarefa: fica em cache entre as chamadas
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
    ...(caps.adaptive ? { thinking: { type: 'adaptive' } } : {}),
    ...(caps.effort ? { output_config: { effort: effort || effortFor(task) } } : {}),
    ...(caps.fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
  };
}

/**
 * Pergunta ao Claude e devolve o texto da resposta. `content` pode ter imagens (revisão
 * visual do motion). Streaming sempre (o Opus pensa antes de responder).
 */
export async function askClaude(system, content, cfg, { maxTokens = 16000, task = 'chat', effort, timeoutMs = 300_000 } = {}) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: cfg.anthropicKey,
    timeout: timeoutMs,
    ...(cfg.anthropicWorkspaceId ? { defaultHeaders: { 'anthropic-workspace-id': cfg.anthropicWorkspaceId } } : {}),
  });
  const model = cfg.model || 'claude-opus-5-5';
  const { betas, ...params } = claudeParams({ model, system, content, maxTokens, task, effort });
  const stream = betas ? client.beta.messages.stream({ ...params, betas }) : client.messages.stream(params);
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error(`o Claude recusou o pedido${msg.stop_details?.category ? ` (${msg.stop_details.category})` : ''}`);
  const text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (msg.stop_reason === 'max_tokens' && !text) throw new Error('a resposta do Claude passou do limite');
  const u = msg.usage || {};
  log.info(`Claude ${msg.model || model} (${task}, esforço ${params.output_config?.effort || '—'}): ${u.input_tokens ?? '?'}+${u.cache_read_input_tokens || 0} cache → ${u.output_tokens ?? '?'} tokens`);
  return text;
}

export async function askText(system, user, cfg, { maxTokens = 3000, json = true, timeoutMs = 90_000, task = 'chat', effort } = {}) {
  if (cfg.anthropicKey) {
    // o Opus pensa antes de responder: o teto inclui o pensamento (nunca baixo demais)
    const text = await askClaude(system, user, cfg, { maxTokens: Math.max(16000, maxTokens), task, effort, timeoutMs: Math.max(timeoutMs, 300_000) });
    return { text, provider: 'claude' };
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
  if (cfg.remoteServer && cfg.remoteToken) return { text: await askRemoteText(system, user, cfg, { maxTokens, json, task, timeoutMs: Math.max(timeoutMs, 300_000) }), provider: 'nuvem' };
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
export async function askJson(system, user, cfg, { maxTokens = 3000, timeoutMs = 90_000, task = 'chat', effort } = {}) {
  const { text, provider } = await askText(system, user, cfg, { maxTokens, timeoutMs, json: true, task, effort });
  return { data: parseJsonLoose(text), provider };
}
