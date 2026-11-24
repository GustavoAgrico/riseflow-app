// Contexto das ferramentas: conta, agente, conversa, banco e serviços reais.
// Os testes montam o próprio contexto com um banco falso.
const { supabase } = require('../supabaseClient')
const { emitSalesUpdate } = require('../realtime')
const crm = require('../crmActions')

async function buildToolContext({ userId, agentId, agent, threadId, queueId }) {
  let a = agent
  if (!a) {
    const { data } = await supabase.from('agents').select('*').eq('id', agentId).eq('user_id', userId).maybeSingle()
    a = data
  }
  if (!a) throw new Error('Agente não encontrado.')
  return {
    userId, agent: a, threadId, queueId, db: supabase,
    deps: {
      crm,
      emitSalesUpdate,
      // require tardio: evita ciclos (prospecção → ligações → agentes; flowEngine → canais).
      get prospecting() { return require('../prospectingService') },
      sendText: (...args) => require('../flowEngine').sendText(...args),
    },
  }
}

module.exports = { buildToolContext }
