// Repasse das chamadas supabase.from() do frontend para o PostgREST usando a
// service key. O PostgREST rejeita os JWTs de usuário ("issued at future"),
// então o isolamento por tenant é feito AQUI: toda leitura/escrita é presa ao
// user_id do JWT do proxy (req.user.sub).
const { Router } = require('express')
const { supabase, isConfigured } = require('../supabaseClient')
const { emitSalesUpdate, emitConversationNote } = require('../realtime')

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
const router = Router()

const USER_TABLES = new Set([
  'activity_logs', 'attendant_config', 'calls', 'campaigns', 'clients', 'contacts',
  'conversation_notes', 'conversations', 'crm_tasks', 'flows', 'integrations', 'invoices', 'knowledge_base',
  'lead_scores', 'meetings', 'messages', 'niche_config', 'notes', 'notifications',
  'pipeline_stages', 'products', 'projects', 'proposals', 'sales_opportunities', 'push_subscriptions', 'sales_goals', 'schedules', 'settings',
  'team_members', 'team_queues', 'templates', 'usage', 'user_preferences',
])
// Plano/limite só mudam pelo servidor (webhook de pagamento).
const PROTECTED_FIELDS = { usage: ['plan', 'messages_limit'] }

const FORWARD_REQ_HEADERS = ['accept', 'prefer', 'range', 'range-unit', 'accept-profile', 'content-profile']
const FORWARD_RES_HEADERS = ['content-range', 'content-type', 'preference-applied']

function sanitizeRow(table, row, userId) {
  const out = { ...row, user_id: userId }
  delete out.organization_id // o banco deriva do user_id (gatilho rf_set_org)
  for (const f of PROTECTED_FIELDS[table] || []) delete out[f]
  return out
}

async function campaignIdsOf(userId) {
  const { data } = await supabase.from('campaigns').select('id').eq('user_id', userId)
  return (data || []).map(c => c.id)
}

// Recursos embutidos no select (ex.: "*, clients(name)") são lidos por chave
// estrangeira, SEM o filtro de user_id da tabela principal. Uma linha minha que
// aponte para o id de outra conta exporia essa conta. Por isso: só um nível,
// só tabelas por usuário, e cada embutido recebe <nome>.user_id=eq.<sub>.
function embeddedResources(select) {
  const out = []
  let depth = 0, start = 0
  const items = []
  for (let i = 0; i <= select.length; i++) {
    const ch = select[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if ((ch === ',' && depth === 0) || i === select.length) { items.push(select.slice(start, i).trim()); start = i + 1 }
    if (depth < 0) return { error: 'select inválido' }
  }
  if (depth !== 0) return { error: 'select inválido' }
  for (const item of items) {
    const open = item.indexOf('(')
    if (open < 0) continue
    const head = item.slice(0, open).trim()
    const inner = item.slice(open + 1, item.lastIndexOf(')'))
    if (inner.includes('(')) return { error: 'Relacionamento aninhado não permitido' }
    if (head.startsWith('...')) return { error: 'Relacionamento não permitido' }
    const colon = head.search(/(?<!:):(?!:)/)
    const alias = colon >= 0 ? head.slice(0, colon).trim() : ''
    const target = (colon >= 0 ? head.slice(colon + 1) : head).split('!')[0].trim()
    if (!USER_TABLES.has(target)) return { error: `Relacionamento com '${target}' não permitido` }
    out.push(alias || target)
  }
  return { names: out }
}

// Regras de isolamento por conta (função pura, testada em restProxy.test.js).
// Devolve { status, message } quando a chamada é recusada, ou o que mandar ao PostgREST.
function scopeRequest({ table, method, params, body, headers, userId, campaignIds = [] }) {
  // PUT no PostgREST é upsert pela chave primária, sem filtro de dono: trocaria a
  // linha de outra conta. O supabase-js não usa PUT (upsert vai por POST).
  if (method === 'PUT') return { status: 405, message: 'Método não permitido' }

  const select = params.get('select')
  if (select && select.includes('(')) {
    const emb = embeddedResources(select)
    if (emb.error) return { status: 403, message: emb.error }
    for (const name of emb.names) {
      params.delete(`${name}.user_id`)
      params.append(`${name}.user_id`, `eq.${userId}`)
    }
  }

  if (USER_TABLES.has(table)) {
    // O cliente às vezes filtra por user.id (membro) e às vezes por ownerUserId;
    // o escopo real é sempre o sub do JWT. Outros operadores (ex.: neq) ficam.
    for (const v of params.getAll('user_id')) if (v.startsWith('eq.')) params.delete('user_id', v)
    if (method !== 'POST') params.append('user_id', `eq.${userId}`)
    if (body !== undefined) {
      const clean = r => sanitizeRow(table, r, userId)
      body = Array.isArray(body) ? body.map(clean) : clean(body)
      if (method === 'PATCH') delete body.user_id
    }
    // Upsert cujo conflito não é por user_id poderia sobrescrever linha de outro tenant.
    const prefer = headers.prefer || ''
    const onConflict = params.get('on_conflict') || ''
    if (method === 'POST' && prefer.includes('resolution=merge-duplicates') && !onConflict.split(',').map(s => s.trim()).includes('user_id')) {
      headers.prefer = prefer.replace('resolution=merge-duplicates', 'resolution=ignore-duplicates')
    }
  } else if (table === 'profiles') {
    const isRead = method === 'GET' || method === 'HEAD'
    if (!isRead && method !== 'PATCH') return { status: 403, message: 'Operação não permitida' }
    params.delete('id')
    params.append('id', `eq.${userId}`)
    if (body) { body = { ...body }; delete body.id; delete body.plan }
  } else if (table === 'campaign_messages') {
    if (method === 'POST') {
      const rows = Array.isArray(body) ? body : [body]
      if (rows.some(r => !r || !campaignIds.includes(r.campaign_id))) return { status: 403, message: 'Campanha não pertence ao usuário' }
    } else {
      params.append('campaign_id', `in.(${campaignIds.length ? campaignIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
      if (method === 'PATCH' && body && !Array.isArray(body)) { body = { ...body }; delete body.campaign_id }
    }
  } else {
    return { status: 403, message: `Tabela '${table}' não permitida` }
  }
  return { params, body, headers }
}

router.all('/:table', async (req, res) => {
  if (!isConfigured) return res.status(503).json({ message: 'Supabase não configurado' })
  const { table } = req.params
  const userId = req.user?.sub
  if (!userId) return res.status(401).json({ message: 'Não autenticado' })

  const method = req.method.toUpperCase()
  const isRead = method === 'GET' || method === 'HEAD'
  const rawParams = new URLSearchParams(req.originalUrl.split('?')[1] || '')

  const rawBody = ['POST', 'PATCH', 'PUT'].includes(method) ? req.body : undefined
  const rawHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  }
  for (const h of FORWARD_REQ_HEADERS) if (req.headers[h]) rawHeaders[h] = req.headers[h]
  if (rawBody !== undefined) rawHeaders['content-type'] = 'application/json'

  const campaignIds = table === 'campaign_messages' ? await campaignIdsOf(userId) : []
  const scoped = scopeRequest({ table, method, params: rawParams, body: rawBody, headers: rawHeaders, userId, campaignIds })
  if (scoped.status) return res.status(scoped.status).json({ message: scoped.message })
  const { params, body, headers } = scoped

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
    else if (!isRead) {
      emitSalesUpdate(userId, table)
      if (table === 'conversation_notes' && method === 'POST') {
        // Com Prefer: return=representation a resposta traz as linhas (com id).
        let rows = body
        try { const parsed = JSON.parse(text); if (parsed) rows = parsed } catch { /* corpo vazio */ }
        emitConversationNote(userId, rows)
      }
    }
    res.send(text)
  } catch (e) {
    console.error(`[rest-proxy] ${method} ${table}:`, e.message)
    res.status(502).json({ message: e.message })
  }
})

module.exports = router
module.exports.scopeRequest = scopeRequest
module.exports.embeddedResources = embeddedResources
module.exports.USER_TABLES = USER_TABLES
