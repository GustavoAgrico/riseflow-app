// Adaptadores no formato de chat da OpenAI (OpenAI e Groq), mesma interface do
// adaptador Claude. Chamada HTTP com axios, como o restante do servidor (server/aiProvider.js).
const axios = require('axios')
const { ProviderError, classifyStatus } = require('./errors')

function createAdapter({ name, label, url, model, extraBody = {} }) {
  async function chat({ apiKey, system, messages, http = axios }) {
    let data
    try {
      ;({ data } = await http.post(
        url,
        { model, messages: [{ role: 'system', content: system }, ...messages], max_tokens: 1200, ...extraBody },
        { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60_000 },
      ))
    } catch (e) {
      const status = e.response?.status
      if (!status) throw new ProviderError(`${label} sem conexão: ${e.message}`, { switchable: true, retryable: true, provider: name })
      const c = classifyStatus(status)
      throw new ProviderError(`${label} ${status}: ${e.response?.data?.error?.message || e.message}`, { ...c, status, provider: name })
    }

    const choice = data?.choices?.[0]
    return {
      text: (choice?.message?.content || '').trim(),
      stopReason: choice?.finish_reason || null,
      model: data?.model || model,
      usage: { in: data?.usage?.prompt_tokens ?? null, out: data?.usage?.completion_tokens ?? null },
    }
  }
  return { name, MODEL: model, chat }
}

const openai = createAdapter({ name: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' })
// Groq: plano gratuito, a mesma chave que o atendente do WhatsApp usa (server/aiAttendant.js).
// O llama-3.3-70b-versatile saiu do Groq; o gpt-oss-120b raciocina antes de responder, e o
// esforço baixo evita que o raciocínio consuma o limite de tokens da resposta.
const groq = createAdapter({
  name: 'groq', label: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions',
  model: 'openai/gpt-oss-120b', extraBody: { reasoning_effort: 'low' },
})

module.exports = { openai, groq, createAdapter }
