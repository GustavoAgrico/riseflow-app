// Acesso a dados dos agentes (service role: toda query filtra user_id manualmente).
const { supabase } = require('../supabaseClient')
const { DEFAULT_AGENTS } = require('./defaults')

const PUBLIC_FIELDS = 'id, kind, name, role, status'
const HISTORY_LIMIT = 30

// Cria a equipe padrão no primeiro acesso (idempotente: índice único por user_id + kind).
async function ensureDefaultAgents(userId) {
  const { data: existing, error } = await supabase.from('agents').select('kind').eq('user_id', userId).eq('is_default', true)
  if (error) throw error
  const have = new Set((existing || []).map(a => a.kind))
  const missing = DEFAULT_AGENTS.filter(a => !have.has(a.kind)).map(a => ({ ...a, user_id: userId, is_default: true }))
  if (!missing.length) return
  const { error: insErr } = await supabase.from('agents').upsert(missing, { onConflict: 'user_id,kind', ignoreDuplicates: true })
  // A disputa com outra aba aberta ao mesmo tempo pode bater no índice único: a equipe já existe.
  if (insErr && insErr.code !== '23505') throw insErr
}

const ORDER = DEFAULT_AGENTS.map(a => a.kind)

async function listAgents(userId) {
  await ensureDefaultAgents(userId)
  const { data, error } = await supabase.from('agents').select(PUBLIC_FIELDS).eq('user_id', userId).order('created_at')
  if (error) throw error
  return (data || []).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}

async function getAgent(userId, agentId) {
  const { data, error } = await supabase.from('agents').select('*').eq('id', agentId).eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data
}

// Uma conversa direta (aba do agente) por agente.
async function getDirectThread(userId, agentId) {
  const find = () => supabase.from('agent_threads').select('*').eq('agent_id', agentId).eq('user_id', userId).eq('kind', 'direct').maybeSingle()
  let { data, error } = await find()
  if (error) throw error
  if (data) return data
  const ins = await supabase.from('agent_threads').insert({ user_id: userId, agent_id: agentId, kind: 'direct' }).select().single()
  if (ins.error) {
    if (ins.error.code !== '23505') throw ins.error
    ;({ data, error } = await find())
    if (error) throw error
    return data
  }
  return ins.data
}

async function listMessages(userId, threadId, limit = 100) {
  const { data, error } = await supabase.from('agent_messages')
    .select('id, author_kind, content, created_at')
    .eq('thread_id', threadId).eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data || []).reverse()
}

// Histórico para o modelo: últimas mensagens de usuário e agente (avisos de sistema ficam de fora).
async function historyForModel(userId, threadId) {
  const rows = await listMessages(userId, threadId, HISTORY_LIMIT)
  return rows.filter(r => r.author_kind === 'user' || r.author_kind === 'agent')
}

async function getAiKeys(userId) {
  const { data } = await supabase.from('settings').select('openai_key, anthropic_key').eq('user_id', userId).maybeSingle()
  return data || {}
}

async function setStatus(userId, agentId, status) {
  await supabase.from('agents').update({ status, updated_at: new Date().toISOString() }).eq('id', agentId).eq('user_id', userId)
}

async function countRecentRuns(userId, agentId) {
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await supabase.from('agent_queue').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('agent_id', agentId).gte('created_at', since)
  return count || 0
}

module.exports = {
  ensureDefaultAgents, listAgents, getAgent, getDirectThread, listMessages,
  historyForModel, getAiKeys, setStatus, countRecentRuns,
}
