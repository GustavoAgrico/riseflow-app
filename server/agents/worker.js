// Worker dos agentes (no mesmo processo da API, fase 1). A cada 2 s pega mensagens
// prontas da fila (agent_claim_next), roda o turno e grava a resposta uma única vez
// (agent_complete). Falha transitória volta à fila com espera de 10 s → 1 min → 5 min;
// depois da 3ª tentativa vira 'failed' e o agente avisa na conversa.
// Liga só onde ENGINES_ENABLED != 'false'.
const { supabase, isConfigured } = require('../supabaseClient')
const { emitToUser } = require('../realtime')
const service = require('./service')
const { runTurn } = require('./turn')

const TICK_MS = 2000
const MAX_PER_TICK = 5
const MAX_ATTEMPTS = 3
const BACKOFF_S = [10, 60, 300]

const MISSING_RECHECK_MS = 5 * 60_000

let timer = null
let running = false
let pausedUntil = 0 // sem a migração (agents_core.sql), espera em vez de bater no banco a cada 2 s

function publicMessage(m) {
  return { id: m.id, author_kind: m.author_kind, content: m.content, created_at: m.created_at }
}

async function setStatus(job, status) {
  await service.setStatus(job.user_id, job.agent_id, status).catch(() => {})
  emitToUser(job.user_id, 'agent_status', { agent_id: job.agent_id, status })
}

async function complete(job, authorKind, text, run) {
  const { data: msg, error } = await supabase.rpc('agent_complete', {
    p_queue_id: job.id, p_author_kind: authorKind, p_content: text,
    p_run: { ...run, started_at: job.locked_at },
  })
  if (error) throw error
  emitToUser(job.user_id, 'agent_message', { agent_id: job.agent_id, message: publicMessage(msg) })
}

async function fail(job, err) {
  const retryable = err?.retryable !== false && job.attempts < MAX_ATTEMPTS
  if (retryable) {
    const wait = BACKOFF_S[Math.min(job.attempts - 1, BACKOFF_S.length - 1)]
    await supabase.from('agent_queue').update({
      status: 'queued', locked_at: null, last_error: String(err?.message || err).slice(0, 500),
      available_at: new Date(Date.now() + wait * 1000).toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', job.id)
    await setStatus(job, 'idle')
    return
  }
  // Desistência: registra a falha como resposta de sistema (fecha a fila uma única vez).
  await complete(job, 'system', 'Não consegui responder agora. Tente de novo em alguns minutos.', {
    status: 'failed', error: String(err?.message || err).slice(0, 500),
  })
  await supabase.from('agent_queue').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', job.id)
  await setStatus(job, 'error')
}

async function processJob(job) {
  await setStatus(job, 'thinking')
  try {
    const agent = await service.getAgent(job.user_id, job.agent_id)
    if (!agent) throw Object.assign(new Error('Agente não existe mais.'), { retryable: false })
    const [history, keys] = await Promise.all([
      service.historyForModel(job.user_id, job.thread_id),
      service.getAiKeys(job.user_id),
    ])
    const result = await runTurn({ agent, history, keys })
    await complete(job, result.authorKind, result.text, result.run)
    await setStatus(job, 'idle')
  } catch (e) {
    console.warn('[agents] turno falhou', job.id, e?.message)
    await fail(job, e).catch(err => console.error('[agents] falha ao registrar erro', job.id, err?.message))
  }
}

async function tick() {
  if (running || Date.now() < pausedUntil) return
  running = true
  try {
    const jobs = []
    for (let i = 0; i < MAX_PER_TICK; i++) {
      const { data, error } = await supabase.rpc('agent_claim_next')
      if (error) throw error
      const job = Array.isArray(data) ? data[0] : data
      if (!job) break
      jobs.push(job)
    }
    await Promise.all(jobs.map(processJob))
  } catch (e) {
    if (/agent_claim_next|agent_queue/.test(e?.message || '')) {
      if (!pausedUntil) console.log('[agents] fila ainda não instalada (rode supabase/agents_core.sql); nova tentativa a cada 5 min')
      pausedUntil = Date.now() + MISSING_RECHECK_MS
    } else {
      console.warn('[agents] worker:', e?.message)
    }
  } finally {
    running = false
  }
}

async function start() {
  if (!isConfigured || timer) return
  try {
    const { data } = await supabase.rpc('agent_requeue_stale', { p_minutes: 10 })
    if (data) console.log(`[agents] ${data} mensagem(ns) presa(s) devolvida(s) à fila`)
  } catch { /* migração ainda não rodada */ }
  timer = setInterval(tick, TICK_MS)
  console.log('[agents] worker ativo')
}

module.exports = { start, tick, processJob }
