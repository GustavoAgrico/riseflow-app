// Adaptadores no formato de chat da OpenAI (OpenAI e Groq), mesma interface do adaptador Claude:
//   run({ apiKey, system, messages, tools, execute }) → { text, usage, stopReason, model, steps }
// Ciclo de ferramentas: enquanto vierem tool_calls, executa e devolve cada resultado numa
// mensagem 'tool'. Chamada HTTP com axios, como o restante do servidor (server/aiProvider.js).
const axios = require('axios')
const { ProviderError, classifyStatus } = require('./errors')

const MAX_STEPS = 6
const MAX_WAIT_S = 8 // no 429, espera até isso uma vez antes de passar ao próximo provedor

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Segundos pedidos pelo provedor no 429 (cabeçalho retry-after ou "try again in 4.08s").
function retryAfter(e) {
  const h = Number(e.response?.headers?.['retry-after'])
  if (Number.isFinite(h) && h > 0) return h
  const m = /try again in ([\d.]+)s/i.exec(e.response?.data?.error?.message || '')
  return m ? Number(m[1]) : null
}

function createAdapter({ name, label, url, model, extraBody = {}, wait = sleep }) {
  async function post(http, apiKey, body, retried = false) {
    try {
      const { data } = await http.post(url, body, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60_000 })
      return data
    } catch (e) {
      const status = e.response?.status
      const after = status === 429 ? retryAfter(e) : null
      if (!retried && after != null && after <= MAX_WAIT_S) {
        await wait(Math.ceil(after * 1000) + 250)
        return post(http, apiKey, body, true)
      }
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
// O limite grátis é por modelo (~8 mil tokens/min e 200 mil/dia cada), então três modelos em
// sequência triplicam a capacidade sem custo. O gpt-oss raciocina: com esforço 'low' o 120b
// às vezes degenerava em ciclos de ferramentas; 'medium' respondeu coerente nos testes.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const groq = createAdapter({ name: 'groq', label: 'Groq', url: GROQ_URL, model: 'openai/gpt-oss-120b', extraBody: { reasoning_effort: 'medium' } })
const groqQwen = createAdapter({ name: 'groq_qwen', label: 'Groq Qwen', url: GROQ_URL, model: 'qwen/qwen3.8-27b' })
const groqFast = createAdapter({ name: 'groq_fast', label: 'Groq 20B', url: GROQ_URL, model: 'openai/gpt-oss-20b', extraBody: { reasoning_effort: 'medium' } })

module.exports = { openai, groq, groqQwen, groqFast, createAdapter, retryAfter }
