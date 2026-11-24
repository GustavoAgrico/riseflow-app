// Um turno: monta o contexto do agente, chama a cadeia de provedores (com as ferramentas do
// agente, fase 2) e devolve a resposta que vai para a conversa.
const { runChain } = require('./providers')
const { DEFAULT_BY_KIND } = require('./defaults')

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

// Agentes padrão seguem as instruções do código (defaults.js); os criados pelo usuário, as próprias.
function instructionsOf(agent) {
  return (agent.is_default && DEFAULT_BY_KIND[agent.kind]?.instructions) || agent.instructions || ''
}

function systemPrompt(agent, now = new Date()) {
  const today = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  return `${instructionsOf(agent)}\n\nVocê se chama ${agent.name} (${agent.role}). Hoje é ${today}.\n` +
    'O chat mostra texto puro: não use markdown (nada de asteriscos, # ou tabelas); para listas, use hífen no início da linha.'
}

const NO_KEY_MESSAGE = 'Ainda não consigo responder: falta uma chave de IA (Claude, OpenAI ou Groq) em Configurações → API & Webhooks.'
const REFUSAL_MESSAGE = 'Não posso ajudar com esse pedido.'
const CLAIMS_APPROVAL = /aprova[çc][ãa]o|aguardando (sua )?aprova|cart[ãa]o da conversa/i
const NO_APPROVAL_NOTE = '(Aviso do sistema: nenhum pedido de aprovação foi criado nesta resposta, então nada será enviado. Peça de novo, se quiser.)'

// toolkit: { tools, execute, log } do executor (tools/executor.js); sem ele, o turno só conversa.
// deps permite trocar a cadeia nos testes.
async function runTurn({ agent, history, keys, toolkit }, deps = { runChain }) {
  const messages = toModelMessages(history)
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return { authorKind: 'system', text: 'Não há mensagem nova para responder.', run: { status: 'done' }, approvals: [] }
  }
  const approvals = () => toolkit?.log?.approvals || []
  try {
    const r = await deps.runChain({
      chain: agent.provider_chain, keys, system: systemPrompt(agent), messages,
      tools: toolkit?.tools || [], execute: toolkit?.execute,
    })
    const refused = r.stopReason === 'refusal'
    let text = refused ? REFUSAL_MESSAGE : r.text
    if (!text) text = approvals().length ? 'Pedi sua aprovação no cartão abaixo.' : 'Pronto.'
    // Trava: o modelo diz que pediu aprovação sem ter chamado a ferramenta → avisa que nada ficou pendente.
    if (!refused && !approvals().length && CLAIMS_APPROVAL.test(text)) text += `\n\n${NO_APPROVAL_NOTE}`
    return {
      authorKind: refused ? 'system' : 'agent',
      text,
      approvals: approvals(),
      run: {
        status: 'done', provider: r.provider, model: r.model, fallback_from: r.fallbackFrom,
        tokens_in: r.usage?.in, tokens_out: r.usage?.out, tool_steps: r.steps || 0,
      },
    }
  } catch (e) {
    if (e?.name === 'NoProviderError') {
      return { authorKind: 'system', text: NO_KEY_MESSAGE, run: { status: 'failed', error: e.message }, approvals: approvals() }
    }
    if (e?.name === 'KeysRejectedError') {
      return { authorKind: 'system', text: `${e.message} Atualize em Configurações → API & Webhooks.`, run: { status: 'failed', error: e.message }, approvals: approvals() }
    }
    throw e
  }
}

module.exports = { runTurn, toModelMessages, systemPrompt, instructionsOf, NO_KEY_MESSAGE, REFUSAL_MESSAGE, NO_APPROVAL_NOTE }
