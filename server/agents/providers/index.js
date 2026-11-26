// Cadeia de provedores com troca automática (docs/AGENTES_ARQUITETURA.md, seção 4).
// Ordem padrão "sem custo": primeiro os planos gratuitos (Gemini do Google AI Studio e três
// modelos do Groq, cada um com limite próprio), e só depois Claude e OpenAI, que são pagos.
// Agentes com provider_chain próprio usam a ordem deles e, depois, o resto como reserva.
// Troca em erro de rede, limite, 5xx ou chave inválida; a troca vale só para este turno.
const claude = require('./claude')
const gemini = require('./gemini')
const { openai, groq, groqQwen, groqFast } = require('./openai')
const { NoProviderError } = require('./errors')

const ADAPTERS = { gemini, groq, groq_qwen: groqQwen, groq_fast: groqFast, claude, openai }
const KEY_FIELD = { gemini: 'gemini_key', groq: 'groq_key', groq_qwen: 'groq_key', groq_fast: 'groq_key', claude: 'anthropic_key', openai: 'openai_key' }
const DEFAULT_CHAIN = ['gemini', 'groq', 'groq_qwen', 'groq_fast', 'claude', 'openai']
const LABEL = { gemini: 'Gemini', groq: 'Groq', groq_qwen: 'Groq', groq_fast: 'Groq', claude: 'Claude', openai: 'OpenAI' }

// Todas as chaves tentadas foram recusadas (401/403): não adianta tentar de novo depois.
class KeysRejectedError extends Error {
  constructor(providers) {
    super(`Chave de IA recusada: ${[...new Set(providers.map(p => LABEL[p] || p))].join(', ')}.`)
    this.name = 'KeysRejectedError'
    this.providers = providers
  }
}

function orderFor(chain, keys, adapters) {
  const first = Array.isArray(chain) && chain.length ? chain : DEFAULT_CHAIN
  const all = [...first, ...DEFAULT_CHAIN.filter(n => !first.includes(n)), ...Object.keys(adapters)]
  return [...new Set(all)].filter(name => adapters[name] && keys?.[KEY_FIELD[name]])
}

// tools/execute: ciclo de ferramentas dentro do provedor. O executor memoriza as chamadas,
// então refazer o turno no próximo provedor não repete ações já feitas.
async function runChain({ chain, keys, system, messages, tools = [], execute, adapters = ADAPTERS }) {
  const order = orderFor(chain, keys, adapters)
  if (!order.length) throw new NoProviderError()

  let firstFailed = null
  let lastError = null
  const rejected = []
  for (const name of order) {
    try {
      const result = await adapters[name].run({ apiKey: keys[KEY_FIELD[name]], system, messages, tools, execute })
      return { ...result, provider: name, fallbackFrom: firstFailed }
    } catch (e) {
      lastError = e
      if (e?.name !== 'ProviderError' || !e.switchable) throw e
      if (e.status === 401 || e.status === 403) rejected.push(name)
      firstFailed = firstFailed || name
      console.warn(`[agents] ${name} falhou (${e.status || 'rede'}) — tentando o próximo provedor`)
    }
  }
  if (rejected.length === order.length) throw new KeysRejectedError(rejected)
  throw lastError
}

module.exports = { runChain, orderFor, KEY_FIELD, DEFAULT_CHAIN, KeysRejectedError }
