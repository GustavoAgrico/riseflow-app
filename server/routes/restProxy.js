const { Router } = require('express')
const { supabase, isConfigured } = require('../supabaseClient')

const router = Router()

const ALLOWED_TABLES = new Set([
  'clients', 'conversations', 'messages', 'contacts', 'flows',
  'schedules', 'crm_tasks', 'proposals', 'meetings', 'campaigns',
  'team_members', 'team_queues', 'settings', 'niche_config',
  'usage', 'activity_logs', 'pipeline_stages', 'billing_plans',
  'billing_subscriptions', 'billing_usage', 'push_subscriptions',
  'call_logs', 'templates', 'tags', 'flow_executions',
])

const NO_USER_ID_TABLES = new Set([
  'billing_plans',
])

function applyFilters(q, query, userId, skipUserId) {
  for (const [key, val] of Object.entries(query)) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) continue
    if (key === 'user_id' && skipUserId) continue
    const match = val.match(/^(eq|neq|gt|gte|lt|lte|like|ilike|is|in|not|cs|cd)\.(.*)/s)
    if (match) {
      const [, op, operand] = match
      if (op === 'in') {
        q = q.in(key, operand.replace(/^\(|\)$/g, '').split(','))
      } else if (op === 'not') {
        const inner = operand.match(/^(\w+)\.(.*)/s)
        if (inner) q = q.not(key, inner[1], inner[2] === 'null' ? null : inner[2])
      } else if (op === 'cs') {
        q = q.contains(key, JSON.parse(operand))
      } else if (op === 'cd') {
        q = q.containedBy(key, JSON.parse(operand))
      } else {
        q = q[op](key, operand === 'null' ? null : operand)
      }
    } else {
      q = q.eq(key, val)
    }
  }
  return q
}

function applyOrder(q, orderStr) {
  if (!orderStr) return q
  const parts = orderStr.split(',')
  for (const part of parts) {
    const [col, ...opts] = part.split('.')
    q = q.order(col, {
      ascending: !opts.includes('desc'),
      nullsFirst: opts.includes('nullsfirst'),
    })
  }
  return q
}

router.all('/:table', async (req, res) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })

  const { table } = req.params
  if (!ALLOWED_TABLES.has(table)) {
    return res.status(403).json({ error: `Tabela '${table}' não permitida` })
  }

  const userId = req.user?.sub
  if (!userId) return res.status(401).json({ error: 'Não autenticado' })

  const hasUserIdCol = !NO_USER_ID_TABLES.has(table)

  try {
    const method = req.method.toUpperCase()
    const query = req.query
    const select = query.select || '*'
    const prefer = req.headers['prefer'] || ''
    const isCount = prefer.includes('count=exact')

    if (method === 'GET' || method === 'HEAD') {
      let q = supabase.from(table).select(select, isCount ? { count: 'exact', head: method === 'HEAD' } : undefined)
      if (hasUserIdCol) q = q.eq('user_id', userId)
      q = applyFilters(q, query, userId, true)
      q = applyOrder(q, query.order)
      if (query.limit) q = q.limit(Number(query.limit))
      if (query.offset) q = q.range(Number(query.offset), Number(query.offset) + (Number(query.limit) || 1000) - 1)

      const { data, error, count } = await q
      if (error) throw error
      if (isCount && method === 'HEAD') {
        res.set('content-range', `0-0/${count ?? 0}`)
        return res.status(206).end()
      }
      if (isCount) res.set('content-range', `0-${(data?.length || 1) - 1}/${count ?? 0}`)
      res.json(data ?? [])

    } else if (method === 'POST') {
      const body = Array.isArray(req.body)
        ? req.body.map(r => ({ ...r, ...(hasUserIdCol ? { user_id: userId } : {}) }))
        : { ...req.body, ...(hasUserIdCol ? { user_id: userId } : {}) }

      let q
      if (prefer.includes('resolution=merge-duplicates')) {
        q = supabase.from(table).upsert(body, { onConflict: query.on_conflict || undefined })
      } else {
        q = supabase.from(table).insert(body)
      }
      if (prefer.includes('return=representation')) q = q.select()
      if (prefer.includes('count=exact')) q = q.select('*', { count: 'exact' })

      const { data, error } = await q
      if (error) throw error
      res.status(201).json(data ?? { ok: true })

    } else if (method === 'PATCH') {
      const body = { ...req.body }
      delete body.user_id
      let q = supabase.from(table).update(body)
      if (hasUserIdCol) q = q.eq('user_id', userId)
      q = applyFilters(q, query, userId, true)
      if (prefer.includes('return=representation')) q = q.select()

      const { data, error } = await q
      if (error) throw error
      res.json(data ?? { ok: true })

    } else if (method === 'DELETE') {
      let q = supabase.from(table).delete()
      if (hasUserIdCol) q = q.eq('user_id', userId)
      q = applyFilters(q, query, userId, true)

      const { error } = await q
      if (error) throw error
      res.json({ ok: true })

    } else {
      res.status(405).json({ error: 'Método não suportado' })
    }
  } catch (e) {
    console.error(`[rest-proxy] ${req.method} /${table}:`, e.message)
    res.status(e.code === '42P01' ? 404 : 500).json({ error: e.message })
  }
})

module.exports = router
