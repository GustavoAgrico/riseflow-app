// Adaptador Claude (SDK oficial @anthropic-ai/sdk) com a interface única dos agentes:
//   chat({ apiKey, system, messages }) → { text, usage, stopReason, model }
// Usa o Claude Opus 5.5 com esforço baixo (respostas de chat curtas) e o fallback
// do servidor da Anthropic: se o modelo recusar por política, a própria API refaz
// o pedido em outro modelo na mesma chamada.
const Anthropic = require('@anthropic-ai/sdk')
const { ProviderError, classifyStatus } = require('./errors')

const MODEL = 'claude-opus-5-5'
const TIMEOUT_MS = 60_000

async function chat({ apiKey, system, messages, client }) {
  const anthropic = client || new Anthropic({ apiKey, maxRetries: 1, timeout: TIMEOUT_MS })
  let response
  try {
    response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
  } catch (e) {
    if (e instanceof Anthropic.APIConnectionError) {
      // Inclui APIConnectionTimeoutError.
      throw new ProviderError(`Claude sem conexão: ${e.message}`, { switchable: true, retryable: true, provider: 'claude' })
    }
    if (e instanceof Anthropic.APIError) {
      const c = classifyStatus(e.status)
      throw new ProviderError(`Claude ${e.status}: ${e.message}`, { ...c, status: e.status, provider: 'claude' })
    }
    throw e
  }

  const text = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
  return {
    text,
    stopReason: response.stop_reason,
    model: response.model || MODEL,
    usage: { in: response.usage?.input_tokens ?? null, out: response.usage?.output_tokens ?? null },
  }
}

module.exports = { name: 'claude', MODEL, chat }
