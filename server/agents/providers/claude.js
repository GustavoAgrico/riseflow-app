// Adaptador Claude (SDK oficial @anthropic-ai/sdk) com a interface única dos agentes:
//   run({ apiKey, system, messages, tools, execute }) → { text, usage, stopReason, model, steps }
// Usa o Claude Opus 5.5 com esforço baixo e o fallback do servidor da Anthropic: se o modelo
// recusar por política, a própria API refaz o pedido em outro modelo na mesma chamada.
// Ciclo de ferramentas manual: enquanto stop_reason for 'tool_use', executa as ferramentas e
// devolve a resposta do assistente sem alterações (raciocínio incluído) + todos os tool_result
// numa única mensagem de usuário.
const Anthropic = require('@anthropic-ai/sdk')
const { ProviderError, classifyStatus } = require('./errors')

const MODEL = 'claude-opus-5-5'
const TIMEOUT_MS = 60_000
const MAX_STEPS = 6

function wrapError(e) {
  if (e instanceof Anthropic.APIConnectionError) {
    // Inclui APIConnectionTimeoutError.
    return new ProviderError(`Claude sem conexão: ${e.message}`, { switchable: true, retryable: true, provider: 'claude' })
  }
  if (e instanceof Anthropic.APIError) {
    const c = classifyStatus(e.status)
    return new ProviderError(`Claude ${e.status}: ${e.message}`, { ...c, status: e.status, provider: 'claude' })
  }
  return e
}

async function run({ apiKey, system, messages, tools = [], execute, client, maxSteps = MAX_STEPS }) {
  const anthropic = client || new Anthropic({ apiKey, maxRetries: 1, timeout: TIMEOUT_MS })
  const apiTools = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.schema }))
  const convo = [...messages]
  const usage = { in: 0, out: 0 }
  let steps = 0

  for (;;) {
    let response
    try {
      response = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system,
        messages: convo,
        ...(apiTools.length ? { tools: apiTools } : {}),
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      })
    } catch (e) {
      throw wrapError(e)
    }
    usage.in += response.usage?.input_tokens || 0
    usage.out += response.usage?.output_tokens || 0

    const calls = (response.content || []).filter(b => b.type === 'tool_use')
    if (response.stop_reason === 'tool_use' && calls.length && execute && steps < maxSteps) {
      steps += 1
      convo.push({ role: 'assistant', content: response.content })
      const results = []
      for (const call of calls) {
        const out = await execute(call.name, call.input)
        results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out ?? null), ...(out?.error ? { is_error: true } : {}) })
      }
      convo.push({ role: 'user', content: results })
      continue
    }

    const text = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
    return { text, stopReason: response.stop_reason, model: response.model || MODEL, usage, steps }
  }
}

module.exports = { name: 'claude', MODEL, run }
