// Piloto de Vendas: roda a cada mensagem recebida (todos os canais, via server/inbox.js).
//   1. ficha: cria o cliente na 1ª mensagem e mantém nome/última mensagem atualizados;
//   2. intenção: nota 0–100 da conversa (server/sales/intent.js) em sales_opportunities;
//   3. organização: etiqueta Quente/Interessado e avança "Novo" → "Qualificado" quando fica quente;
//   4. aviso: notificação + evento em tempo real quando o lead cruza o limite de "quente".
// Nunca responde ao cliente (isso é o atendente IA) e nunca anda o funil para trás.
const { supabase, isConfigured } = require('../supabaseClient')
const { emitToUser } = require('../realtime')
const { scoreMessage, combineScore, levelOf } = require('./intent')

const DEFAULTS = { auto_register: true, auto_update: true, auto_tag: true, auto_stage: true, notify: true, hot_threshold: 75 }
const CACHE_MS = 60 * 1000
const settingsCache = new Map() // userId → { at, value }
const productsCache = new Map() // userId → { at, list }
let missingTables = 0 // migração não rodada: evita repetir a mesma consulta com erro a cada mensagem

const now = () => new Date().toISOString()
const digits = (s) => String(s || '').replace(/\D/g, '')
const isMissing = (error) => /42P01|PGRST205|does not exist|schema cache/i.test(`${error?.code || ''} ${error?.message || ''}`)

async function getSettings(userId) {
  const hit = settingsCache.get(userId)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value
  const { data, error } = await supabase.from('sales_pilot_settings').select('*').eq('user_id', userId).maybeSingle()
  if (error && isMissing(error)) throw Object.assign(new Error('missing'), { missing: true })
  const value = { ...DEFAULTS, ...(data || {}) }
  settingsCache.set(userId, { at: Date.now(), value })
  return value
}

async function saveSettings(userId, patch) {
  const allowed = {}
  for (const k of ['auto_register', 'auto_update', 'auto_tag', 'auto_stage', 'notify']) if (typeof patch[k] === 'boolean') allowed[k] = patch[k]
  if (Number.isInteger(patch.hot_threshold)) allowed.hot_threshold = Math.min(95, Math.max(50, patch.hot_threshold))
  const { data, error } = await supabase.from('sales_pilot_settings')
    .upsert({ user_id: userId, ...allowed, updated_at: now() }, { onConflict: 'user_id' }).select('*').single()
  if (error) throw error
  settingsCache.delete(userId)
  return { ...DEFAULTS, ...data }
}

async function getProducts(userId) {
  const hit = productsCache.get(userId)
  if (hit && Date.now() - hit.at < 5 * CACHE_MS) return hit.list
  const { data } = await supabase.from('products').select('name').eq('user_id', userId).eq('active', true)
  const list = data || []
  productsCache.set(userId, { at: Date.now(), list })
  return list
}

// Cliente pelo telefone: igual ou terminando nos mesmos 10 dígitos (com/sem 55, com/sem 9).
async function findClient(userId, phone) {
  const exact = await supabase.from('clients').select('id,name,phone,stage,tags').eq('user_id', userId).eq('phone', phone).limit(1)
  if (exact.data?.[0]) return exact.data[0]
  const tail = digits(phone).slice(-10)
  if (tail.length < 8) return null
  const like = await supabase.from('clients').select('id,name,phone,stage,tags').eq('user_id', userId).like('phone', `%${tail.slice(-8)}`).limit(5)
  return (like.data || []).find(c => digits(c.phone).endsWith(tail.slice(-8))) || null
}

const looksLikeNumber = (name) => !name || /^\+?[\d\s()-]+$/.test(name)

async function ensureClient(userId, { phone, name, channel, text }, s) {
  let client = await findClient(userId, phone)
  if (!client && s.auto_register) {
    const base = { user_id: userId, phone, name: name || phone, stage: 'lead', tags: [], last_message: text?.slice(0, 500) || null }
    let res = await supabase.from('clients').insert({ ...base, source: channel || 'whatsapp', source_meta: { via: 'piloto_vendas' } })
      .select('id,name,phone,stage,tags').single()
    // Banco sem as colunas de origem (leads_source.sql não rodado): cadastra mesmo assim.
    if (res.error && /source/i.test(res.error.message || '')) res = await supabase.from('clients').insert(base).select('id,name,phone,stage,tags').single()
    if (!res.error) client = { ...res.data, created: true }
  } else if (client && s.auto_update) {
    const patch = { last_message: text?.slice(0, 500) || null }
    if (name && looksLikeNumber(client.name)) patch.name = name
    await supabase.from('clients').update(patch).eq('id', client.id).eq('user_id', userId)
    if (patch.name) client.name = patch.name
  }
  return client
}

// Chamado por saveIncomingMessage. Erros nunca quebram o recebimento da mensagem.
async function onInbound({ userId, phone, name, text, channel = 'whatsapp' }) {
  if (!isConfigured || !userId || !phone || !text || missingTables > 20) return null
  try {
    const s = await getSettings(userId)
    const products = await getProducts(userId)
    const current = scoreMessage(text, { products, hot: s.hot_threshold })
    const client = await ensureClient(userId, { phone, name, channel, text }, s)

    const { data: prev } = await supabase.from('sales_opportunities').select('*').eq('user_id', userId).eq('contact_phone', phone).maybeSingle()
    // Sem sinal nenhum e sem histórico: só a ficha basta, não vira oportunidade.
    if (!prev && current.score < 30) return { client, opportunity: null }

    const score = combineScore(prev?.score, prev?.last_inbound_at, current)
    const level = levelOf(score, s.hot_threshold)
    const crossedHot = score >= s.hot_threshold && (prev?.score ?? 0) < s.hot_threshold
    const signals = [...new Set([...(current.signals.length ? current.signals : []), ...(prev?.signals || [])])].slice(0, 6)
    const row = {
      user_id: userId, contact_phone: phone, contact_name: client?.name || name || prev?.contact_name || phone,
      client_id: client?.id || prev?.client_id || null, channel, score, level, signals,
      product: current.product || prev?.product || null,
      last_message: current.score >= 20 || !prev ? text.slice(0, 500) : prev.last_message,
      last_inbound_at: now(), updated_at: now(),
    }
    // Recusa explícita encerra; quem foi dispensado e volta quente reabre.
    if (current.signals.includes('sem interesse') && prev && !['won'].includes(prev.status)) row.status = 'lost'
    else if (prev?.status === 'dismissed' && crossedHot) row.status = 'new'

    let movedStage = false
    if (client && s.auto_stage && score >= s.hot_threshold && (client.stage || 'lead') === 'lead') {
      await supabase.from('clients').update({ stage: 'qual' }).eq('id', client.id).eq('user_id', userId)
      row.auto_moved_at = now(); movedStage = true
    }
    if (client && s.auto_tag && level !== 'baixa') {
      const tag = level === 'alta' ? 'Quente' : 'Interessado'
      const tags = Array.isArray(client.tags) ? client.tags : []
      if (!tags.includes(tag)) {
        const next = [...tags.filter(t => !(tag === 'Quente' && t === 'Interessado')), tag]
        await supabase.from('clients').update({ tags: next }).eq('id', client.id).eq('user_id', userId)
      }
    }

    const { data: opp, error } = await supabase.from('sales_opportunities').upsert(row, { onConflict: 'user_id,contact_phone' }).select('*').single()
    if (error) { if (isMissing(error)) missingTables += 1; return null }

    if (crossedHot && s.notify) {
      await supabase.from('notifications').insert({
        user_id: userId, type: 'lead', title: `Lead quente: ${opp.contact_name}`,
        message: `“${String(text).slice(0, 120)}” — intenção ${score}%`,
      }).then(() => {}, () => {})
      emitToUser(userId, 'sales_hot_lead', { opportunity: opp })
    }
    emitToUser(userId, 'sales_opportunity', { opportunity: opp, movedStage })
    return { client, opportunity: opp, movedStage }
  } catch (e) {
    if (e?.missing) { missingTables += 1; return null }
    console.warn('[piloto-vendas] falhou:', e?.message ?? e)
    return null
  }
}

// Primeira vez: lê as mensagens recebidas dos últimos dias e acha as conversas com intenção
// (a "#120 que queria comprar" escondida entre 200). Não cria fichas nem move o funil.
async function backfill(userId, { days = 14, limit = 4000 } = {}) {
  const s = await getSettings(userId)
  const products = await getProducts(userId)
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const { data: msgs, error } = await supabase.from('messages')
    .select('contact_phone,content,direction,created_at').eq('user_id', userId).gte('created_at', since)
    .order('created_at', { ascending: true }).limit(limit)
  if (error) throw error
  const inbound = (msgs || []).filter(m => !['outbound', 'sent', 'out'].includes(String(m.direction || '').toLowerCase()) && m.contact_phone && m.content)
  const byPhone = new Map()
  for (const m of inbound) {
    const r = scoreMessage(m.content, { products, hot: s.hot_threshold })
    const cur = byPhone.get(m.contact_phone) || { score: 0, signals: [], product: null, text: '', at: null }
    const score = combineScore(cur.score, cur.at, r, new Date(m.created_at).getTime())
    byPhone.set(m.contact_phone, {
      score, at: m.created_at, product: r.product || cur.product,
      signals: [...new Set([...r.signals, ...cur.signals])].slice(0, 6),
      text: r.score >= 20 || !cur.text ? m.content : cur.text,
    })
  }
  const { data: convs } = await supabase.from('conversations').select('contact_phone,contact_name').eq('user_id', userId).in('contact_phone', [...byPhone.keys()].slice(0, 1000))
  const names = Object.fromEntries((convs || []).map(c => [c.contact_phone, c.contact_name]))
  const { data: existing } = await supabase.from('sales_opportunities').select('contact_phone').eq('user_id', userId)
  const have = new Set((existing || []).map(o => o.contact_phone))
  const rows = []
  for (const [phone, v] of byPhone) {
    if (v.score < 30 || have.has(phone)) continue
    const client = await findClient(userId, phone)
    rows.push({
      user_id: userId, contact_phone: phone, contact_name: client?.name || names[phone] || phone, client_id: client?.id || null,
      channel: 'whatsapp', score: v.score, level: levelOf(v.score, s.hot_threshold), signals: v.signals, product: v.product,
      last_message: String(v.text).slice(0, 500), last_inbound_at: v.at, status: 'new',
    })
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error: e } = await supabase.from('sales_opportunities').upsert(rows.slice(i, i + 200), { onConflict: 'user_id,contact_phone', ignoreDuplicates: true })
    if (e) throw e
  }
  return { scanned: inbound.length, conversations: byPhone.size, found: rows.length }
}

// Mudança feita pela pessoa no cartão: status da oportunidade e etapa do cliente andam juntos.
const STAGE_FOR = { proposal: 'prop', negotiation: 'neg', won: 'closed', lost: 'lost' }
async function updateOpportunity(userId, id, { status, value }) {
  const patch = { updated_at: now() }
  if (status) {
    if (!['new', 'contacted', 'proposal', 'negotiation', 'won', 'lost', 'dismissed'].includes(status)) throw Object.assign(new Error('Status inválido'), { status: 400 })
    patch.status = status
    if (status === 'contacted') patch.contacted_at = now()
    if (status === 'won') patch.won_at = now()
  }
  if (value != null && value !== '') {
    const v = Number(value)
    if (!Number.isFinite(v) || v < 0) throw Object.assign(new Error('Valor inválido'), { status: 400 })
    patch.value = v
  }
  const { data: opp, error } = await supabase.from('sales_opportunities').update(patch).eq('id', id).eq('user_id', userId).select('*').single()
  if (error) throw error
  if (opp.client_id && (STAGE_FOR[status] || patch.value != null)) {
    const cp = {}
    if (STAGE_FOR[status]) cp.stage = STAGE_FOR[status]
    if (patch.value != null) cp.value = patch.value
    await supabase.from('clients').update(cp).eq('id', opp.client_id).eq('user_id', userId)
  }
  emitToUser(userId, 'sales_opportunity', { opportunity: opp })
  return opp
}

const isOut = (d) => ['outbound', 'sent', 'out'].includes(String(d || '').toLowerCase())
// Mediana do tempo entre a 1ª mensagem do cliente e a 1ª resposta (por conversa, últimos 30 dias).
function responseStats(messages) {
  const byPhone = new Map()
  for (const m of messages) {
    if (!m.contact_phone) continue
    const st = byPhone.get(m.contact_phone) || { firstIn: null, firstOut: null }
    const t = new Date(m.created_at).getTime()
    if (!isOut(m.direction)) { if (st.firstIn == null) st.firstIn = t }
    else if (st.firstIn != null && st.firstOut == null && t >= st.firstIn) st.firstOut = t
    byPhone.set(m.contact_phone, st)
  }
  const deltas = [...byPhone.values()].filter(s => s.firstIn != null && s.firstOut != null).map(s => (s.firstOut - s.firstIn) / 1000).sort((a, b) => a - b)
  const withIn = [...byPhone.values()].filter(s => s.firstIn != null).length
  const median = deltas.length ? deltas[Math.floor(deltas.length / 2)] : null
  return { medianSeconds: median, responded: deltas.length, conversations: withIn }
}

async function summary(userId) {
  const s = await getSettings(userId)
  const d = new Date()
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
  const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString()
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString()
  const [opps, msgs, wonNow, wonPrev, registered] = await Promise.all([
    supabase.from('sales_opportunities').select('score,status,client_id,product,contact_name,updated_at,auto_moved_at').eq('user_id', userId).gte('updated_at', since30),
    supabase.from('messages').select('contact_phone,direction,created_at').eq('user_id', userId).gte('created_at', since30).order('created_at', { ascending: true }).limit(8000),
    supabase.from('clients').select('value').eq('user_id', userId).gte('won_at', monthStart),
    supabase.from('clients').select('value').eq('user_id', userId).gte('won_at', prevStart).lt('won_at', monthStart),
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', monthStart).eq('source_meta->>via', 'piloto_vendas'),
  ])
  if (opps.error) throw opps.error
  const list = opps.data || []
  const resp = responseStats(msgs.data || [])
  const sum = (r) => (r.data || []).reduce((a, c) => a + (Number(c.value) || 0), 0)
  const salesNow = sum(wonNow), salesPrev = sum(wonPrev)
  const linked = list.filter(o => o.client_id)
  return {
    settings: s,
    response: resp,
    funnel: {
      conversations: resp.conversations,
      interested: list.filter(o => o.score >= 40).length,
      qualified: list.filter(o => o.score >= s.hot_threshold).length,
      won: list.filter(o => o.status === 'won').length,
    },
    fichas: { total: list.length, linked: linked.length, pct: list.length ? Math.round((linked.length / list.length) * 100) : 100 },
    sales: { month: salesNow, previous: salesPrev, changePct: salesPrev ? Math.round(((salesNow - salesPrev) / salesPrev) * 100) : null },
    automations: {
      registered: registered.count || 0,
      moved: list.filter(o => o.auto_moved_at && o.auto_moved_at >= monthStart).length,
      waiting: list.filter(o => o.status === 'new' && o.score >= s.hot_threshold).length,
    },
  }
}

async function listOpportunities(userId, { status = 'open', limit = 60 } = {}) {
  let q = supabase.from('sales_opportunities').select('*').eq('user_id', userId)
  if (status === 'open') q = q.in('status', ['new', 'contacted', 'proposal', 'negotiation'])
  else if (status !== 'all') q = q.eq('status', status)
  const { data, error } = await q.order('score', { ascending: false }).order('last_inbound_at', { ascending: false }).limit(Math.min(200, limit))
  if (error) throw error
  return data || []
}

module.exports = { onInbound, backfill, summary, listOpportunities, updateOpportunity, getSettings, saveSettings, responseStats, isMissing, DEFAULTS }
