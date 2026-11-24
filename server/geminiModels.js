// Escolhe o modelo Gemini "flash" estável mais novo que a chave enxerga (API do Google AI
// Studio, plano gratuito). Evita fixar um nome que o Google aposenta — como o Groq fez com o
// llama-3.3-70b-versatile. Resultado guardado por 6 h por chave.
const axios = require('axios')
const crypto = require('crypto')

const FALLBACK_MODEL = 'gemini-2.5-flash'
const TTL_MS = 6 * 3600_000
const cache = new Map() // hash da chave → { at, model }

function versionOf(name) {
  const m = /^models\/gemini-(\d+(?:\.\d+)?)-flash$/.exec(name)
  return m ? Number(m[1]) : null
}

async function pickGeminiModel(key, http = axios) {
  const id = crypto.createHash('sha1').update(String(key)).digest('hex')
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.model
  let model = FALLBACK_MODEL
  try {
    const { data } = await http.get('https://generativelanguage.googleapis.com/v1beta/models', {
      params: { key, pageSize: 200 }, timeout: 15_000,
    })
    const best = (data?.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && versionOf(m.name) != null)
      .sort((a, b) => versionOf(b.name) - versionOf(a.name))[0]
    if (best) model = best.name.replace(/^models\//, '')
  } catch { /* sem lista: usa o padrão */ }
  cache.set(id, { at: Date.now(), model })
  return model
}

function forgetGeminiModel(key) {
  cache.delete(crypto.createHash('sha1').update(String(key)).digest('hex'))
}

module.exports = { pickGeminiModel, forgetGeminiModel, FALLBACK_MODEL }
