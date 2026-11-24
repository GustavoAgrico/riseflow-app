// Um turno: monta o contexto do agente, chama a cadeia de provedores e devolve
// a resposta que vai para a conversa. Fase 1: só texto (ferramentas na fase 2).
const { runChain } = require('./providers')

// Histórico do banco → mensagens do modelo: só user/assistant, começando por user,
// com mensagens seguidas do mesmo autor unidas.
function toModelMessages(history) {
  const out = []
  for (const h of history) {
    const role = h.author_kind === 'user' ? 'user' : 'assistant'
    const content = String(h.content || '').trim()
    if (!content) continue
    if (!out.length && role !== 'user') continue
    const last = out[out.length - 1]
    if (last && last.role === role) last.content += `\n\n${content}`
    else out.push({ role, content })
  }
  return out
}

function systemPrompt(agent, now = new Date()) {
  const today = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  return `${agent.instructions}\n\nVocê se chama ${agent.name} (${agent.role}). Hoje é ${today}.`
}

const NO_KEY_MESSAGE = 'Ainda não consigo responder: falta uma chave de IA (Claude ou OpenAI) em Configurações → API & Webhooks.'
const REFUSAL_MESSAGE = 'Não posso ajudar com esse pedido.'

// deps permite trocar a cadeia nos testes.
async function runTurn({ agent, history, keys }, deps = { runChain }) {
  const messages = toModelMessages(history)
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return { authorKind: 'system', text: 'Não há mensagem nova para responder.', run: { status: 'done' } }
  }
  try {
    const r = await deps.runChain({ chain: agent.provider_chain, keys, system: systemPrompt(agent), messages })
    const refused = r.stopReason === 'refusal'
    return {
      authorKind: refused ? 'system' : 'agent',
      text: refused ? REFUSAL_MESSAGE : (r.text || '…'),
      run: {
        status: 'done', provider: r.provider, model: r.model, fallback_from: r.fallbackFrom,
        tokens_in: r.usage?.in, tokens_out: r.usage?.out,
      },
    }
  } catch (e) {
    if (e?.name === 'NoProviderError') {
      return { authorKind: 'system', text: NO_KEY_MESSAGE, run: { status: 'failed', error: e.message } }
    }
    throw e
  }
}

module.exports = { runTurn, toModelMessages, systemPrompt, NO_KEY_MESSAGE, REFUSAL_MESSAGE }
