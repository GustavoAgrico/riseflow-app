// Adaptador OpenAI (reserva da cadeia), mesma interface do adaptador Claude.
// Chamada HTTP com axios, como o restante do servidor (server/aiProvider.js).
const axios = require('axios')
const { ProviderError, classifyStatus } = require('./errors')

const MODEL = 'gpt-4o-mini'

async function chat({ apiKey, system, messages, http = axios }) {
  let data
  try {
    ;({ data } = await http.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: MODEL,
        messages: [{ role: 'system', content: system }, ...messages],
        max_tokens: 1200,
      },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60_000 },
    ))
  } catch (e) {
    const status = e.response?.status
    if (!status) throw new ProviderError(`OpenAI sem conexão: ${e.message}`, { switchable: true, retryable: true, provider: 'openai' })
    const c = classifyStatus(status)
    throw new ProviderError(`OpenAI ${status}: ${e.response?.data?.error?.message || e.message}`, { ...c, status, provider: 'openai' })
  }

  const choice = data?.choices?.[0]
  return {
    text: (choice?.message?.content || '').trim(),
    stopReason: choice?.finish_reason || null,
    model: data?.model || MODEL,
    usage: { in: data?.usage?.prompt_tokens ?? null, out: data?.usage?.completion_tokens ?? null },
  }
}

module.exports = { name: 'openai', MODEL, chat }
