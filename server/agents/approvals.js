// Aprovações de ações de risco alto pedidas pelos agentes (tabela agent_approvals).
// O pedido guarda a ferramenta e a entrada; a ação só roda em decide(..., 'approve').
// A troca de status é condicional (só de 'pending'), então dois cliques não executam duas vezes.
const { supabase } = require('../supabaseClient')
const { emitToUser } = require('../realtime')
const { TOOLS } = require('./tools/catalog')
const { buildToolContext } = require('./toolContext')

const now = () => new Date().toISOString()
const publicApproval = (a) => ({ id: a.id, tool: a.tool, summary: a.summary, created_at: a.created_at, expires_at: a.expires_at })

async function create({ userId, agent, threadId, queueId, tool, input, ctx }) {
  const summary = tool.describe ? await tool.describe(ctx, input) : `${tool.name}: ${JSON.stringify(input).slice(0, 200)}`
  const { data, error } = await supabase.from('agent_approvals').insert({
    user_id: userId, agent_id: agent.id, thread_id: threadId, queue_id: queueId,
    tool: tool.name, args: input, summary, risk: tool.risk,
  }).select('*').single()
  if (error) throw error
  await supabase.from('notifications').insert({
    user_id: userId, type: 'agent_approval', title: `${agent.name} pede aprovação`, message: summary,
  }).then(() => {}, () => {})
  emitToUser(userId, 'agent_approval_request', { agent_id: agent.id, approval: publicApproval(data) })
  return { id: data.id, summary }
}

async function expireOld() {
  await supabase.from('agent_approvals').update({ status: 'expired', decided_at: now() })
    .eq('status', 'pending').lt('expires_at', now())
}

async function listPending(userId, agentId) {
  let q = supabase.from('agent_approvals').select('id, tool, summary, created_at, expires_at, agent_id')
    .eq('user_id', userId).eq('status', 'pending').gt('expires_at', now()).order('created_at', { ascending: true })
  if (agentId) q = q.eq('agent_id', agentId)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(publicApproval)
}

// Mensagem de sistema na conversa do agente (resultado da decisão).
async function postSystemMessage(row, content) {
  const { data: ev } = await supabase.from('agent_events').insert({
    user_id: row.user_id, agent_id: row.agent_id, thread_id: row.thread_id, type: 'approval_decided',
    payload: { approval_id: row.id, status: row.status, content },
  }).select('id').single()
  const { data: msg } = await supabase.from('agent_messages').insert({
    user_id: row.user_id, agent_id: row.agent_id, thread_id: row.thread_id, author_kind: 'system',
    content, event_id: ev?.id || null,
  }).select('id, author_kind, content, created_at').single()
  if (msg) emitToUser(row.user_id, 'agent_message', { agent_id: row.agent_id, message: msg })
}

async function refreshAgentStatus(userId, agentId) {
  const { count } = await supabase.from('agent_approvals').select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId).eq('status', 'pending').gt('expires_at', now())
  const status = count ? 'waiting_approval' : 'idle'
  await supabase.from('agents').update({ status, updated_at: now() }).eq('id', agentId).eq('user_id', userId)
  emitToUser(userId, 'agent_status', { agent_id: agentId, status })
}

function resultText(result) {
  if (!result) return ''
  if (result.sent) return `Mensagem enviada para ${result.client}.`
  if (result.call_id) return `${result.client?.name || 'Lead'} entrou na fila de ligação.`
  return ''
}

async function decide(userId, approvalId, decision, decidedBy) {
  if (!['approve', 'reject'].includes(decision)) throw Object.assign(new Error('Decisão inválida.'), { status: 400 })
  const status = decision === 'approve' ? 'approved' : 'denied'
  const { data: row, error } = await supabase.from('agent_approvals')
    .update({ status, decided_by: String(decidedBy || userId), decided_at: now() })
    .eq('id', approvalId).eq('user_id', userId).eq('status', 'pending').gt('expires_at', now())
    .select('*').maybeSingle()
  if (error) throw error
  if (!row) throw Object.assign(new Error('Este pedido já foi decidido ou expirou.'), { status: 409 })

  if (status === 'denied') {
    await postSystemMessage(row, `Recusado: ${row.summary}`)
    await refreshAgentStatus(userId, row.agent_id)
    return { ok: true, status }
  }

  const tool = TOOLS[row.tool]
  let result
  try {
    if (!tool) throw new Error(`Ferramenta ${row.tool} não existe mais.`)
    const ctx = await buildToolContext({ userId, agentId: row.agent_id, threadId: row.thread_id })
    result = await tool.run(ctx, row.args || {})
  } catch (e) {
    result = { error: e?.message || String(e) }
  }
  await supabase.from('agent_approvals').update({ result }).eq('id', row.id)
  await postSystemMessage(row, result?.error
    ? `Aprovado, mas não deu certo: ${row.summary} Motivo: ${result.error}`
    : `Aprovado e feito: ${row.summary}${resultText(result) ? ' ' + resultText(result) : ''}`)
  await refreshAgentStatus(userId, row.agent_id)
  return { ok: !result?.error, status, result }
}

module.exports = { create, listPending, decide, expireOld, refreshAgentStatus, publicApproval }
