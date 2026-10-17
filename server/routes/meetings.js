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
      .from('meetings')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true })
    if (error) throw error
    res.json(data || [])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/', guard, async (req, res) => {
  try {
    const userId = req.user.sub
    const { title, description, date, time, duration, client_name, client_id, location } = req.body
    const { data, error } = await supabase
      .from('meetings')
      .insert({
        user_id: userId,
        title: title?.trim(),
        description: description?.trim() || null,
        date,
        time: time || null,
        duration: Number(duration) || 60,
        client_name: client_name?.trim() || null,
        client_id: client_id || null,
        location: location?.trim() || null,
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
    const fields = { ...req.body }
    delete fields.user_id
    const { data, error } = await supabase
      .from('meetings')
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
      .from('meetings')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', userId)
    if (error) throw error
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Endpoint unificado da agenda — retorna todos os eventos para o calendário
router.get('/agenda-events', guard, async (req, res) => {
  try {
    const userId = req.user.sub
    const [{ data: scheds }, { data: tasks }, { data: props }, { data: meets }] = await Promise.all([
      supabase.from('schedules').select('id, name, send_date, send_time, status').eq('user_id', userId).neq('status', 'cancelado'),
      supabase.from('crm_tasks').select('id, title, due_date, done').eq('user_id', userId).eq('done', false).not('due_date', 'is', null),
      supabase.from('proposals').select('id, title, valid_until, status').eq('user_id', userId),
      supabase.from('meetings').select('*').eq('user_id', userId),
    ])
    const all = []
    ;(scheds ?? []).forEach(s => all.push({ id: 's' + s.id, type: 'schedule', title: s.name || 'Agendamento', date: s.send_date, time: s.send_time }))
    ;(tasks ?? []).forEach(t => all.push({ id: 't' + t.id, type: 'task', title: t.title || 'Tarefa', date: t.due_date?.split('T')[0], time: t.due_date?.split('T')[1]?.substring(0, 5) || null }))
    ;(props ?? []).forEach(p => p.valid_until && all.push({ id: 'p' + p.id, type: 'proposal', title: p.title || 'Proposta', date: p.valid_until, time: null }))
    ;(meets ?? []).forEach(m => all.push({ id: 'm' + m.id, type: 'meeting', title: m.title || 'Reunião', date: m.date, time: m.time, duration: m.duration, location: m.location, client_name: m.client_name, description: m.description }))
    res.json(all)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
