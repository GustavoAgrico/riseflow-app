const { Router } = require('express')
const { supabase, isConfigured } = require('../supabaseClient')

const router = Router()

const guard = (req, res, next) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  next()
}

router.get('/', guard, async (req, res) => {
  try {
    const userId = req.user.sub
    const { data, error } = await supabase
      .from('proposals')
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
    const userId = req.user.sub
    const { title, client_name, client_id, value, valid_until, items, status } = req.body
    const { data, error } = await supabase
      .from('proposals')
      .insert({
        user_id: userId,
        title: title?.trim(),
        client_name: client_name?.trim() || null,
        client_id: client_id || null,
        value: Number(value) || 0,
        valid_until: valid_until || null,
        items: items?.trim() || null,
        status: status || 'draft',
      })
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
    const userId = req.user.sub
    const { ...fields } = req.body
    delete fields.user_id
    const { data, error } = await supabase
      .from('proposals')
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
    const userId = req.user.sub
    const { error } = await supabase
      .from('proposals')
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
