// Fila de ligações por IA. A cada 30 s:
//   1. acompanha as ligações em andamento e qualifica as concluídas (mesmo sem o CRM aberto);
//   2. dentro da janela de horário, disca o próximo lead "queued" de cada conta,
//      uma ligação por vez por conta e com intervalo mínimo entre elas.
// Liga só onde ENGINES_ENABLED != 'false' (a reserva no Render fica desligada).
// Janela, chaves, modo teste e liga/desliga vêm da configuração de cada conta
// (aiCallSettings); a janela tem o formato "1-5 09:00-18:00" (0=dom … 6=sáb, Brasília).
const { supabase, isConfigured } = require('./supabaseClient')
const el = require('./elevenlabs')
const { dial, refreshCall } = require('./aiCallService')
const { getConfig } = require('./aiCallSettings')

const TICK_MS = 30_000
const GAP_MS = 90_000            // intervalo mínimo entre ligações da mesma conta
const DAY_MS = 24 * 3600_000
const IN_CALL = ['dialing', 'initiated', 'in-progress', 'processing']
const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

let running = false
let timer = null
const lastDial = new Map() // userId → hora da última ligação

function inWindow(date = new Date(), spec = el.DEFAULT_WINDOW) {
  const m = String(spec).match(/^(\d)-(\d)\s+(\d{2}):(\d{2})-(\d{2}):(\d{2})$/)
  if (!m) return false
  const [, d0, d1, h0, m0, h1, m1] = m.map(Number)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(p => [p.type, p.value]))
  const day = WEEKDAY[parts.weekday]
  const minutes = Number(parts.hour) * 60 + Number(parts.minute)
  return day >= d0 && day <= d1 && minutes >= h0 * 60 + m0 && minutes < h1 * 60 + m1
}

async function followOpenCalls() {
  const { data: open } = await supabase
    .from('ai_calls').select('*')
    .in('status', ['initiated', 'in-progress', 'processing', 'done'])
    .is('score', null).is('error', null).not('conversation_id', 'is', null)
    .gte('created_at', new Date(Date.now() - DAY_MS).toISOString())
    .limit(50)
  for (const row of open || []) {
    try { await refreshCall(row.user_id, row) } catch (e) { console.warn('[ai-calls] acompanhar', row.id, e.message) }
  }
}

async function dialNext() {
  const since = new Date(Date.now() - DAY_MS).toISOString()
  const { data: queued } = await supabase
    .from('ai_calls').select('*').eq('status', 'queued').order('created_at', { ascending: true }).limit(50)
  if (!queued?.length) return
  const { data: busy } = await supabase.from('ai_calls').select('user_id').in('status', IN_CALL).gte('created_at', since)
  const busyUsers = new Set((busy || []).map(r => r.user_id))
  const picked = new Set()

  for (const row of queued) {
    if (picked.has(row.user_id) || busyUsers.has(row.user_id)) continue
    if (Date.now() - (lastDial.get(row.user_id) || 0) < GAP_MS) continue
    picked.add(row.user_id)

    // Conta sem configuração, desativada ou fora do horário: a ligação espera na fila.
    const cfg = await getConfig(row.user_id)
    if (!el.isConfigured(cfg) || !cfg.enabled || !inWindow(new Date(), cfg.window)) continue

    // "Reserva" a linha; se outra instância já pegou, segue.
    const { data: claimed } = await supabase.from('ai_calls')
      .update({ status: 'dialing', updated_at: new Date().toISOString() })
      .eq('id', row.id).eq('status', 'queued').select().maybeSingle()
    if (!claimed) continue
    lastDial.set(row.user_id, Date.now())

    try {
      const { data: client } = await supabase.from('clients')
        .select('id, name, company, phone').eq('id', row.client_id).eq('user_id', row.user_id).maybeSingle()
      if (!client) throw new Error('Lead não encontrado (foi excluído?).')
      await dial(row.user_id, client, row.id)
    } catch (e) {
      console.warn('[ai-calls] falha ao discar', row.id, e.message)
      await supabase.from('ai_calls')
        .update({ status: 'failed', error: e.message, updated_at: new Date().toISOString() }).eq('id', row.id)
    }
  }
}

async function tick() {
  if (running) return
  running = true
  try {
    await followOpenCalls()
    await dialNext()
  } catch (e) {
    console.warn('[ai-calls] fila:', e.message)
  } finally {
    running = false
  }
}

function start() {
  if (!isConfigured || timer) return
  timer = setInterval(tick, TICK_MS)
  console.log('[ai-calls] fila ativa (configuração e horário por conta, Brasília)')
}

module.exports = { start, inWindow }
