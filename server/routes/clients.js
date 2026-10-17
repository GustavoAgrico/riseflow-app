const { Router } = require('express')
const { supabase, isConfigured } = require('../supabaseClient')

const router = Router()

function resolveOwner(req) {
  return req.query.owner || req.body?.owner || req.user?.sub
}

const guard = (req, res, next) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  next()
}

// ── Rotas com path fixo ANTES de /:id ──

router.get('/team-members', guard, async (req, res) => {
  try {
    const userId = resolveOwner(req)
    const { data, error } = await supabase
      .from('team_members')
      .select('id,name')
      .eq('user_id', userId)
      .order('name', { ascending: true })
    if (error) throw error
    res.json(data || [])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/tasks', guard, async (req, res) => {
  try {
    const { client_id } = req.query
    if (!client_id) return res.status(400).json({ error: 'client_id obrigatório' })
    const { data, error } = await supabase
      .from('crm_tasks')
      .select('*')
      .eq('client_id', client_id)
      .order('done', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (error) throw error
    res.json(data || [])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/tasks', guard, async (req, res) => {
  try {
    const userId = req.user?.sub
    const { client_id, title, due_date } = req.body
    const { data, error } = await supabase
      .from('crm_tasks')
      .insert({ user_id: userId, client_id, title, due_date: due_date || null })
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.patch('/tasks/:id', guard, async (req, res) => {
  try {
    const { owner, ...fields } = req.body
    const { data, error } = await supabase
      .from('crm_tasks')
      .update(fields)
      .eq('id', req.params.id)
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/tasks/:id', guard, async (req, res) => {
  try {
    const { error } = await supabase
      .from('crm_tasks')
      .delete()
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── CRM detail helpers ──

router.get('/conversations-messages', guard, async (req, res) => {
  try {
    const userId = resolveOwner(req)
    const { phone } = req.query
    if (!phone) return res.json({ messages: [] })
    const cleaned = String(phone).replace(/\D/g, '').slice(-10)
    const { data: convs } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', userId)
      .ilike('contact_phone', `%${cleaned}%`)
      .limit(1)
    if (!convs?.length) return res.json({ messages: [] })
    const { data: rows } = await supabase
      .from('messages')
      .select('id, body, text, from_me, created_at, timestamp')
      .eq('conversation_id', convs[0].id)
      .order('created_at', { ascending: false })
      .limit(30)
    res.json({ messages: (rows || []).reverse() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/next-task', guard, async (req, res) => {
  try {
    const { client_id } = req.query
    if (!client_id) return res.json(null)
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('crm_tasks')
      .select('id, title, due_date')
      .eq('client_id', client_id)
      .eq('done', false)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true })
      .limit(1)
    res.json(data?.[0] || null)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── CRUD clients ──

router.get('/', guard, async (req, res) => {
  try {
    const userId = resolveOwner(req)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data || [])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/', guard, async (req, res) => {
  try {
    const userId = resolveOwner(req)
    const { owner, ...fields } = req.body
    const { data, error } = await supabase
      .from('clients')
      .insert({ user_id: userId, status: 'active', ...fields })
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.patch('/:id', guard, async (req, res) => {
  try {
    const userId = resolveOwner(req)
    const { owner, ...fields } = req.body
    const { data, error } = await supabase
      .from('clients')
      .update(fields)
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/:id', guard, async (req, res) => {
  try {
    const userId = resolveOwner(req)
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', userId)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
