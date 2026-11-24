// Cadeia de provedores com troca automática (docs/AGENTES_ARQUITETURA.md, seção 4).
// Tenta na ordem do agente (provider_chain); troca para o próximo em erro de rede,
// limite, 5xx ou chave inválida. A troca vale só para este turno.
const claude = require('./claude')
const openai = require('./openai')
const { NoProviderError } = require('./errors')

const ADAPTERS = { claude, openai }
const KEY_FIELD = { claude: 'anthropic_key', openai: 'openai_key' }

async function runChain({ chain, keys, system, messages, adapters = ADAPTERS }) {
  const order = (Array.isArray(chain) && chain.length ? chain : ['claude', 'openai'])
    .filter(name => adapters[name] && keys?.[KEY_FIELD[name]])
  if (!order.length) throw new NoProviderError()

  let firstFailed = null
  let lastError = null
  for (const name of order) {
    try {
      const result = await adapters[name].chat({ apiKey: keys[KEY_FIELD[name]], system, messages })
      return { ...result, provider: name, fallbackFrom: firstFailed }
    } catch (e) {
      lastError = e
      if (e?.name !== 'ProviderError' || !e.switchable) throw e
      firstFailed = firstFailed || name
      console.warn(`[agents] ${name} falhou (${e.message}) — tentando o próximo provedor`)
    }
  }
  throw lastError
}

module.exports = { runChain, KEY_FIELD }
