// Execução das ações que a IA pede no CRM (ver aiActionParser.js para o
// protocolo). Cada pedido vira uma linha em `ai_actions` (supabase/ai_crm_actions.sql):
//   executed | failed  → modo automático, já rodou
//   pending            → aguardando aprovação humana (IA Central)
//   approved→executed / rejected → decidido por alguém do time
//
// Mesmo no modo automático, levar o cliente para uma etapa de ganho ou perda
// sempre pede aprovação: mexe nas metas de venda.
const { supabase, isConfigured } = require('./supabaseClient')
const crm = require('./crmActions')
const { describeAction } = require('./aiActionParser')

const MODES = new Set(['off', 'auto', 'approve'])
const modeOf = (config) => (MODES.has(config?.ai_actions_mode) ? config.ai_actions_mode : 'off')

/* Data de hoje em Brasília (AAAA-MM-DD), para o prompt. */
const todayBrt = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)

async function runAction(userId, action, who) {
  const p = action.params || {}
  if (action.type === 'criar_tarefa') {
    const { task, client } = await crm.createTask(userId, { ...who, title: p.titulo, due: p.prazo })
    return { summary: `Tarefa criada para ${client.name}`, task_id: task.id, client_id: client.id }
  }
  if (action.type === 'mover_etapa') {
    const { client, stage, changed } = await crm.moveStage(userId, { ...who, stage: p.etapa })
    return { summary: changed ? `${client.name} → ${stage.label}` : `${client.name} já estava em ${stage.label}`, client_id: client.id }
  }
  if (action.type === 'agendar') {
    const { meeting, client } = await crm.scheduleMeeting(userId, { ...who, title: p.titulo, date: p.data, time: p.hora })
    return { summary: `Reunião em ${meeting.date}${meeting.time ? ` às ${meeting.time}` : ''} com ${client.name}`, meeting_id: meeting.id, client_id: client.id }
  }
  throw new Error(`Ação desconhecida: ${action.type}`)
}

async function needsApproval(userId, action, mode, stages) {
  if (mode === 'approve') return true
  if (action.type !== 'mover_etapa') return false
  const target = crm.resolveStage(stages || await crm.getStages(userId), action.params?.etapa)
  return target?.kind === 'won' || target?.kind === 'lost'
}

async function record(row) {
  const { data, error } = await supabase.from('ai_actions').insert(row).select('id').single()
  if (error) { console.warn('[IA ações] não registrou em ai_actions:', error.message); return null }
  return data
}

async function notifyPending(userId, description, contactName) {
  try {
    await supabase.from('notifications').insert({
      user_id: userId, type: 'ai_action', title: 'IA aguardando aprovação',
      message: `${contactName || 'Contato'}: ${description}. Aprove em IA Central.`,
    })
  } catch { /* notificações são opcionais */ }
}

/**
 * Processa as ações pedidas pela IA numa conversa.
 * who = { phone, name }; conversationId é opcional (só para referência).
 */
async function handleAiActions({ userId, conversationId, who, actions, config, stages }) {
  if (!isConfigured || !userId || !actions?.length) return []
  const mode = modeOf(config)
  if (mode === 'off') return []
  const out = []
  for (const action of actions) {
    const description = describeAction(action)
    const base = {
      user_id: userId, conversation_id: conversationId || null,
      contact_phone: who.phone || null, contact_name: who.name || null,
      action_type: action.type, params: action.params || {}, description,
    }
    try {
      if (await needsApproval(userId, action, mode, stages)) {
        await record({ ...base, status: 'pending' })
        await notifyPending(userId, description, who.name)
        out.push({ ...base, status: 'pending' })
        console.log('[IA ações] ⏸ aguardando aprovação:', description)
        continue
      }
      const result = await runAction(userId, action, who)
      await record({ ...base, status: 'executed', result, decided_at: new Date().toISOString(), decided_by: 'IA (automático)' })
      out.push({ ...base, status: 'executed', result })
      console.log('[IA ações] ✅', description, '→', result.summary)
    } catch (e) {
      const msg = String(e?.message ?? e).slice(0, 300)
      await record({ ...base, status: 'failed', result: { error: msg }, decided_at: new Date().toISOString(), decided_by: 'IA (automático)' })
      out.push({ ...base, status: 'failed', error: msg })
      console.warn('[IA ações] ❌', description, ':', msg)
    }
  }
  return out
}

/* Aprovação/recusa pela IA Central. Só decide linhas 'pending' da própria conta. */
async function decideAction(userId, id, approve, decidedBy) {
  const { data: row, error } = await supabase.from('ai_actions').select('*')
    .eq('id', id).eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (!row) { const e = new Error('Ação não encontrada'); e.status = 404; throw e }
  if (row.status !== 'pending') { const e = new Error(`Ação já ${row.status === 'rejected' ? 'recusada' : 'decidida'}`); e.status = 409; throw e }

  const decided = { decided_at: new Date().toISOString(), decided_by: decidedBy || 'Equipe' }
  // Reserva a linha antes de executar (pending → approved/rejected só se ainda
  // estiver pending): dois cliques ao mesmo tempo não executam a ação duas vezes.
  const { data: claimed, error: claimErr } = await supabase.from('ai_actions')
    .update({ ...decided, status: approve ? 'approved' : 'rejected' })
    .eq('id', id).eq('user_id', userId).eq('status', 'pending').select('*').maybeSingle()
  if (claimErr) throw claimErr
  if (!claimed) { const e = new Error('Ação já decidida por outra pessoa'); e.status = 409; throw e }
  if (!approve) return claimed

  let patch
  try {
    const result = await runAction(userId, { type: row.action_type, params: row.params }, { phone: row.contact_phone, name: row.contact_name })
    patch = { status: 'executed', result }
  } catch (e) {
    patch = { status: 'failed', result: { error: String(e?.message ?? e).slice(0, 300) } }
  }
  const { data: updated, error: upErr } = await supabase.from('ai_actions').update(patch)
    .eq('id', id).eq('user_id', userId).select('*').maybeSingle()
  if (upErr) throw upErr
  return updated || { ...claimed, ...patch }
}

module.exports = { modeOf, todayBrt, handleAiActions, decideAction, runAction }
