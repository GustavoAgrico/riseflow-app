// Retrato dos números do dia para as dicas dos agentes (src/lib/coach.js).
// Consultas leves e independentes: se uma tabela não existir (ex.: projects antes da migração),
// só aquela parte fica de fora. Cache de 5 min compartilhado entre telas.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'

const TTL = 5 * 60 * 1000
let cache = { owner: null, at: 0, data: null, pending: null }

const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const safe = async (q) => { try { const { data, error } = await q; return error ? null : data } catch { return null } }

export const DEMO_SNAPSHOT = {
  tasksToday: 3, tasksOverdue: 1, meetingsToday: 2, nextMeeting: { title: 'Apresentação para a Clínica Vida', time: '15:00' },
  invoicesOverdue: { count: 2, total: 2050 }, invoicesDueSoon: { count: 1, total: 499 },
  projectsLate: [{ name: 'Bot de agendamento' }], projectsReview: 1,
  leadsStale: 2, newLeadsWeek: 3, hotLeads: [{ name: 'Marina Alves', score: 96 }, { name: 'João Pedro', score: 81 }], negotiating: 2, wonMonth: 6240, goal: 15000, closedMonth: 3, lostMonth: 2, unreadChats: 4,
}

export async function loadSnapshot(owner, now = new Date()) {
  const today = day(now)
  const in7 = day(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7))
  const monthStart = `${today.slice(0, 7)}-01`
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
  const staleBefore = new Date(now.getTime() - 3 * 86400000).toISOString()

  const [tasks, meetings, invoices, projects, clients, goal, convs, hot] = await Promise.all([
    safe(supabase.from('crm_tasks').select('due_date').eq('user_id', owner).eq('done', false).lte('due_date', today)),
    safe(supabase.from('meetings').select('title,time').eq('user_id', owner).eq('date', today).order('time', { ascending: true })),
    safe(supabase.from('invoices').select('amount,due_date').eq('user_id', owner).neq('status', 'paid').lte('due_date', in7)),
    safe(supabase.from('projects').select('name,status,due_date').eq('user_id', owner).neq('status', 'done')),
    safe(supabase.from('clients').select('stage,value,created_at,won_at').eq('user_id', owner)),
    safe(supabase.from('sales_goals').select('target').eq('user_id', owner).eq('month', monthStart).limit(1)),
    safe(supabase.from('conversations').select('unread_count').eq('user_id', owner).gt('unread_count', 0)),
    safe(supabase.from('sales_opportunities').select('contact_name,score').eq('user_id', owner).eq('status', 'new').gte('score', 75).order('score', { ascending: false }).limit(20)),
  ])

  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const inv = invoices || []
  const overdue = inv.filter(i => i.due_date && i.due_date < today)
  const soon = inv.filter(i => i.due_date && i.due_date >= today)
  const sum = (l) => l.reduce((a, i) => a + (Number(i.amount) || 0), 0)
  const cl = clients || []
  const month = today.slice(0, 7)
  const won = cl.filter(c => String(c.won_at || '').slice(0, 7) === month)

  return {
    tasksToday: (tasks || []).filter(t => t.due_date === today).length,
    tasksOverdue: (tasks || []).filter(t => t.due_date && t.due_date < today).length,
    meetingsToday: (meetings || []).length,
    nextMeeting: (meetings || []).find(m => !m.time || m.time >= hhmm) || null,
    invoicesOverdue: { count: overdue.length, total: sum(overdue) },
    invoicesDueSoon: { count: soon.length, total: sum(soon) },
    projectsLate: (projects || []).filter(p => p.due_date && p.due_date < today).map(p => ({ name: p.name })),
    projectsReview: (projects || []).filter(p => p.status === 'review').length,
    leadsStale: cl.filter(c => (c.stage || 'lead') === 'lead' && c.created_at && c.created_at < staleBefore).length,
    newLeadsWeek: clients ? cl.filter(c => c.created_at && c.created_at >= weekAgo).length : null,
    negotiating: cl.filter(c => c.stage === 'neg').length,
    wonMonth: won.reduce((a, c) => a + (Number(c.value) || 0), 0),
    closedMonth: won.length,
    lostMonth: null, // o banco não guarda a data da perda: sem ela a taxa de conversão do mês não é calculada
    goal: goal?.[0]?.target ? Number(goal[0].target) : null,
    unreadChats: (convs || []).length,
    hotLeads: (hot || []).map(h => ({ name: h.contact_name, score: h.score })),
  }
}

export function useCoachData() {
  const { ownerUserId, isDemoMode } = useAuth()
  const [data, setData] = useState(() => (isDemoMode ? DEMO_SNAPSHOT : cache.owner === ownerUserId ? cache.data : null))

  useEffect(() => {
    if (isDemoMode) { setData(DEMO_SNAPSHOT); return }
    if (!ownerUserId) return
    let alive = true
    const fresh = cache.owner === ownerUserId && Date.now() - cache.at < TTL && cache.data
    if (fresh) { setData(cache.data); return }
    if (!cache.pending || cache.owner !== ownerUserId) {
      cache = { owner: ownerUserId, at: 0, data: cache.owner === ownerUserId ? cache.data : null, pending: loadSnapshot(ownerUserId) }
      cache.pending.then(d => { cache.data = d; cache.at = Date.now() }).finally(() => { cache.pending = null })
    }
    cache.pending?.then(d => { if (alive) setData(d) }).catch(() => {})
    return () => { alive = false }
  }, [ownerUserId, isDemoMode])

  return data
}

export default useCoachData
