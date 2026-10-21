// Repasse das chamadas supabase.from() do frontend para o PostgREST usando a
// service key. O PostgREST rejeita os JWTs de usuário ("issued at future"),
// então o isolamento por tenant é feito AQUI: toda leitura/escrita é presa ao
// user_id do JWT do proxy (req.user.sub).
const { Router } = require('express')
const { supabase, isConfigured } = require('../supabaseClient')
const { emitSalesUpdate } = require('../realtime')

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
const router = Router()

const USER_TABLES = new Set([
  'activity_logs', 'attendant_config', 'calls', 'campaigns', 'clients', 'contacts',
  'conversations', 'crm_tasks', 'flows', 'integrations', 'invoices', 'knowledge_base',
  'lead_scores', 'meetings', 'messages', 'niche_config', 'notes', 'notifications',
  'pipeline_stages', 'products', 'proposals', 'push_subscriptions', 'sales_goals', 'schedules', 'settings',
  'team_members', 'team_queues', 'templates', 'usage', 'user_preferences',
])
// Plano/limite só mudam pelo servidor (webhook de pagamento).
const PROTECTED_FIELDS = { usage: ['plan', 'messages_limit'] }

const FORWARD_REQ_HEADERS = ['accept', 'prefer', 'range', 'range-unit', 'accept-profile', 'content-profile']
const FORWARD_RES_HEADERS = ['content-range', 'content-type', 'preference-applied']

function sanitizeRow(table, row, userId) {
  const out = { ...row, user_id: userId }
  for (const f of PROTECTED_FIELDS[table] || []) delete out[f]
  return out
}

async function campaignIdsOf(userId) {
  const { data } = await supabase.from('campaigns').select('id').eq('user_id', userId)
  return (data || []).map(c => c.id)
}

router.all('/:table', async (req, res) => {
  if (!isConfigured) return res.status(503).json({ message: 'Supabase não configurado' })
  const { table } = req.params
  const userId = req.user?.sub
  if (!userId) return res.status(401).json({ message: 'Não autenticado' })

  const method = req.method.toUpperCase()
  const isRead = method === 'GET' || method === 'HEAD'
  const params = new URLSearchParams(req.originalUrl.split('?')[1] || '')

  let body = ['POST', 'PATCH', 'PUT'].includes(method) ? req.body : undefined
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  }
  for (const h of FORWARD_REQ_HEADERS) if (req.headers[h]) headers[h] = req.headers[h]
  if (body !== undefined) headers['content-type'] = 'application/json'

  if (USER_TABLES.has(table)) {
    // O cliente às vezes filtra por user.id (membro) e às vezes por ownerUserId;
    // o escopo real é sempre o sub do JWT. Outros operadores (ex.: neq) ficam.
    for (const v of params.getAll('user_id')) if (v.startsWith('eq.')) params.delete('user_id', v)
    if (method !== 'POST' && method !== 'PUT') params.append('user_id', `eq.${userId}`)
    if (body !== undefined) {
      const clean = r => sanitizeRow(table, r, userId)
      body = Array.isArray(body) ? body.map(clean) : clean(body)
      if (method === 'PATCH') delete body.user_id
    }
    // Upsert cujo conflito não é por user_id poderia sobrescrever linha de outro tenant.
    const prefer = headers.prefer || ''
    const onConflict = params.get('on_conflict') || ''
    if (method === 'POST' && prefer.includes('resolution=merge-duplicates') && !onConflict.split(',').includes('user_id')) {
      headers.prefer = prefer.replace('resolution=merge-duplicates', 'resolution=ignore-duplicates')
    }
  } else if (table === 'profiles') {
    if (!isRead && method !== 'PATCH') return res.status(403).json({ message: 'Operação não permitida' })
    params.delete('id')
    params.append('id', `eq.${userId}`)
    if (body) { body = { ...body }; delete body.id; delete body.plan }
  } else if (table === 'campaign_messages') {
    const ids = await campaignIdsOf(userId)
    if (method === 'POST') {
      const rows = Array.isArray(body) ? body : [body]
      if (rows.some(r => !ids.includes(r.campaign_id))) return res.status(403).json({ message: 'Campanha não pertence ao usuário' })
    } else {
      params.append('campaign_id', `in.(${ids.length ? ids.join(',') : '00000000-0000-0000-0000-000000000000'})`)
    }
  } else {
    return res.status(403).json({ message: `Tabela '${table}' não permitida` })
  }

  try {
    const qs = params.toString()
    const upstream = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}${qs ? `?${qs}` : ''}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    res.status(upstream.status)
    for (const h of FORWARD_RES_HEADERS) {
      const v = upstream.headers.get(h)
      if (v) res.set(h, v)
    }
    const text = await upstream.text()
    if (upstream.status >= 400) console.warn(`[rest-proxy] ${method} ${table} → ${upstream.status}: ${text.slice(0, 200)}`)
    else if (!isRead) emitSalesUpdate(userId, table)
    res.send(text)
  } catch (e) {
    console.error(`[rest-proxy] ${method} ${table}:`, e.message)
    res.status(502).json({ message: e.message })
  }
})

module.exports = router
