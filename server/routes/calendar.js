const express = require('express')
const crypto = require('crypto')
const { supabase, isConfigured } = require('../supabaseClient')

const router = express.Router()

const pad = n => String(n).padStart(2, '0')
const icsDate = (date, time) => {
  const [y, m, d] = date.split('-')
  if (!time) return `${y}${m}${d}`
  const [h, mi] = time.split(':')
  return `${y}${m}${d}T${pad(h)}${pad(mi)}00`
}
const esc = s => (s || '').replace(/[\\;,\n]/g, c => c === '\n' ? '\\n' : `\\${c}`)
const TYPE_LABELS = { schedule: 'Agendamento', task: 'Tarefa', proposal: 'Proposta' }

router.get('/feed/:token.ics', async (req, res) => {
  if (!isConfigured) return res.status(503).send('Supabase não configurado')

  const { token } = req.params
  const { data: setting } = await supabase
    .from('settings')
    .select('user_id')
    .eq('calendar_token', token)
    .maybeSingle()

  if (!setting) return res.status(404).send('Token inválido')
  const userId = setting.user_id

  const [{ data: scheds }, { data: tasks }, { data: props }] = await Promise.all([
    supabase.from('schedules').select('id, name, send_date, send_time, status').eq('user_id', userId).neq('status', 'cancelado'),
    supabase.from('crm_tasks').select('id, title, due_date, done').eq('user_id', userId).eq('done', false).not('due_date', 'is', null),
    supabase.from('proposals').select('id, title, valid_until, status').eq('user_id', userId),
  ])

  const events = []
  ;(scheds ?? []).forEach(s => events.push({ id: 's' + s.id, type: 'schedule', title: s.name || 'Agendamento', date: s.send_date, time: s.send_time }))
  ;(tasks ?? []).forEach(t => events.push({ id: 't' + t.id, type: 'task', title: t.title || 'Tarefa', date: t.due_date?.split('T')[0], time: t.due_date?.split('T')[1]?.substring(0, 5) || null }))
  ;(props ?? []).forEach(p => p.valid_until && events.push({ id: 'p' + p.id, type: 'proposal', title: p.title || 'Proposta', date: p.valid_until, time: null }))

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RiseFlow//Agenda//PT',
    'X-WR-CALNAME:RiseFlow Agenda',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  for (const e of events) {
    if (!e.date) continue
    const label = TYPE_LABELS[e.type] || ''
    const summary = label ? `[${label}] ${e.title}` : e.title
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.id}@riseflow`)
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`)
    if (e.time) {
      lines.push(`DTSTART:${icsDate(e.date, e.time)}`)
      const [h, m] = e.time.split(':').map(Number)
      lines.push(`DTEND:${icsDate(e.date, `${pad(h + 1)}:${pad(m)}`)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`)
      lines.push(`DTEND;VALUE=DATE:${icsDate(e.date)}`)
    }
    lines.push(`SUMMARY:${esc(summary)}`)
    if (e.time) {
      lines.push('BEGIN:VALARM')
      lines.push('TRIGGER:-PT15M')
      lines.push('ACTION:DISPLAY')
      lines.push(`DESCRIPTION:${esc(summary)} em 15 minutos`)
      lines.push('END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')

  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'inline; filename="riseflow-agenda.ics"',
    'Cache-Control': 'no-cache, no-store',
  })
  res.send(lines.join('\r\n'))
})

router.post('/token', async (req, res) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  const userId = req.user.sub

  const { data: existing } = await supabase
    .from('settings')
    .select('calendar_token')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing?.calendar_token) {
    return res.json({ token: existing.calendar_token })
  }

  const token = crypto.randomBytes(24).toString('hex')
  await supabase
    .from('settings')
    .upsert({ user_id: userId, calendar_token: token }, { onConflict: 'user_id' })

  res.json({ token })
})

router.post('/token/regenerate', async (req, res) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  const token = crypto.randomBytes(24).toString('hex')
  await supabase
    .from('settings')
    .upsert({ user_id: req.user.sub, calendar_token: token }, { onConflict: 'user_id' })
  res.json({ token })
})

module.exports = router
