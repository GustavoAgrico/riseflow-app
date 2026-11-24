// Adaptadores no formato de chat da OpenAI (OpenAI e Groq), mesma interface do adaptador Claude:
//   run({ apiKey, system, messages, tools, execute }) → { text, usage, stopReason, model, steps }
// Ciclo de ferramentas: enquanto vierem tool_calls, executa e devolve cada resultado numa
// mensagem 'tool'. Chamada HTTP com axios, como o restante do servidor (server/aiProvider.js).
const axios = require('axios')
const { ProviderError, classifyStatus } = require('./errors')

const MAX_STEPS = 6

function createAdapter({ name, label, url, model, extraBody = {} }) {
  async function post(http, apiKey, body) {
    try {
      const { data } = await http.post(url, body, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60_000 })
      return data
    } catch (e) {
      const status = e.response?.status
      if (!status) throw new ProviderError(`${label} sem conexão: ${e.message}`, { switchable: true, retryable: true, provider: name })
      const c = classifyStatus(status)
      throw new ProviderError(`${label} ${status}: ${e.response?.data?.error?.message || e.message}`, { ...c, status, provider: name })
    }
  }

  async function run({ apiKey, system, messages, tools = [], execute, http = axios, maxSteps = MAX_STEPS }) {
    const apiTools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } }))
    const convo = [{ role: 'system', content: system }, ...messages]
    const usage = { in: 0, out: 0 }
    let steps = 0

    for (;;) {
      const data = await post(http, apiKey, {
        model, messages: convo, max_tokens: 1200, ...extraBody,
        ...(apiTools.length ? { tools: apiTools, tool_choice: 'auto' } : {}),
      })
      usage.in += data?.usage?.prompt_tokens || 0
      usage.out += data?.usage?.completion_tokens || 0
      const choice = data?.choices?.[0]
      const msg = choice?.message || {}
      const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : []

      if (calls.length && execute && steps < maxSteps) {
        steps += 1
        convo.push({ role: 'assistant', content: msg.content || '', tool_calls: calls })
        for (const call of calls) {
          let input = {}
          let out
          try { input = JSON.parse(call.function?.arguments || '{}') } catch { out = { error: 'Argumentos em JSON inválido.' } }
          if (!out) out = await execute(call.function?.name, input)
          convo.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out ?? null) })
        }
        continue
      }

      return { text: (msg.content || '').trim(), stopReason: choice?.finish_reason || null, model: data?.model || model, usage, steps }
    }
  }

  return { name, MODEL: model, run }
}

const openai = createAdapter({ name: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' })
// Groq: plano gratuito, a mesma chave que o atendente do WhatsApp usa (server/aiAttendant.js).
// O llama-3.3-70b-versatile saiu do Groq; o gpt-oss-120b raciocina antes de responder. Com
// esforço 'low' ele às vezes degenera em ciclos de ferramentas (texto com '...' repetido);
// 'medium' respondeu coerente nos testes. Limite do plano gratuito: 8 mil tokens/minuto (429).
const groq = createAdapter({
  name: 'groq', label: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions',
  model: 'openai/gpt-oss-120b', extraBody: { reasoning_effort: 'medium' },
})

module.exports = { openai, groq, createAdapter }
