// Adaptador Gemini (API do Google AI Studio, plano gratuito), mesma interface dos outros:
//   run({ apiKey, system, messages, tools, execute }) → { text, usage, stopReason, model, steps }
// Ciclo de ferramentas: functionCall nas partes da resposta → executa → devolve
// functionResponse. O conteúdo do modelo volta sem alterações (assinaturas de raciocínio
// dos modelos novos precisam ser devolvidas como vieram).
const axios = require('axios')
const { ProviderError, classifyStatus } = require('./errors')
const { pickGeminiModel, forgetGeminiModel } = require('../../geminiModels')

const MAX_STEPS = 6
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// JSON Schema do catálogo → subconjunto aceito pelo Gemini (sem additionalProperties/maxLength).
const KEEP = new Set(['type', 'description', 'enum', 'items', 'properties', 'required', 'minimum', 'maximum', 'maxItems', 'minItems', 'nullable', 'format'])
function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema
  const out = {}
  for (const [k, v] of Object.entries(schema)) {
    if (!KEEP.has(k)) continue
    if (k === 'type') out.type = String(v).toUpperCase()
    else if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v).map(([p, s]) => [p, toGeminiSchema(s)]))
    else if (k === 'items') out.items = toGeminiSchema(v)
    else out[k] = v
  }
  if (out.required && !out.required.length) delete out.required
  return out
}

function declaration(t) {
  const hasParams = t.schema?.properties && Object.keys(t.schema.properties).length
  return { name: t.name, description: t.description, ...(hasParams ? { parameters: toGeminiSchema(t.schema) } : {}) }
}

const toContents = (messages) => messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))

async function run({ apiKey, system, messages, tools = [], execute, http = axios, maxSteps = MAX_STEPS }) {
  const model = await pickGeminiModel(apiKey, http)
  const contents = toContents(messages)
  const usage = { in: 0, out: 0 }
  let steps = 0

  for (;;) {
    let data
    try {
      ;({ data } = await http.post(`${BASE}/${model}:generateContent`, {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        ...(tools.length ? { tools: [{ functionDeclarations: tools.map(declaration) }], toolConfig: { functionCallingConfig: { mode: 'AUTO' } } } : {}),
        generationConfig: { maxOutputTokens: 4096 },
      }, { params: { key: apiKey }, timeout: 60_000 }))
    } catch (e) {
      const status = e.response?.status
      if (!status) throw new ProviderError(`Gemini sem conexão: ${e.message}`, { switchable: true, retryable: true, provider: 'gemini' })
      if (status === 404) forgetGeminiModel(apiKey) // modelo aposentado: na próxima, escolhe de novo
      const c = status === 404 ? { switchable: true, retryable: true } : classifyStatus(status)
      throw new ProviderError(`Gemini ${status}: ${e.response?.data?.error?.message || e.message}`, { ...c, status, provider: 'gemini' })
    }
    usage.in += data?.usageMetadata?.promptTokenCount || 0
    usage.out += data?.usageMetadata?.candidatesTokenCount || 0

    const cand = data?.candidates?.[0]
    const parts = cand?.content?.parts || []
    const calls = parts.filter(p => p.functionCall)

    if (calls.length && execute && steps < maxSteps) {
      steps += 1
      contents.push(cand.content)
      const responses = []
      for (const p of calls) {
        const out = await execute(p.functionCall.name, p.functionCall.args || {})
        responses.push({ functionResponse: { name: p.functionCall.name, response: { result: out ?? null } } })
      }
      contents.push({ role: 'user', parts: responses })
      continue
    }

    const blocked = !parts.length && /SAFETY|PROHIBITED|BLOCKLIST/.test(cand?.finishReason || data?.promptFeedback?.blockReason || '')
    const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim()
    return { text, stopReason: blocked ? 'refusal' : (cand?.finishReason || null), model, usage, steps }
  }
}

module.exports = { name: 'gemini', run, toGeminiSchema }
