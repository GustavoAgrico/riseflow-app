import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'

export const useTodayData = () => {
  const { ownerUserId } = useAuth()
  const [tasks, setTasks] = useState([])
  const [overdueTasks, setOverdueTasks] = useState([])
  const [todayTasks, setTodayTasks] = useState([])
  const [coldLeads, setColdLeads] = useState([])
  const [hotLeads, setHotLeads] = useState([])
  const [todaySchedules, setTodaySchedules] = useState([])
  const [recentConversations, setRecentConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!ownerUserId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const [tasksRes, clientsRes, schedRes, convsRes] = await Promise.all([
        supabase.from('crm_tasks').select('*, clients(name, phone, stage, value)')
          .eq('user_id', ownerUserId)
          .eq('done', false)
          .order('due_date', { ascending: true, nullsFirst: false }),
        supabase.from('clients').select('id, name, phone, email, company, value, stage, tags, status, last_message, created_at, updated_at')
          .eq('user_id', ownerUserId)
          .order('updated_at', { ascending: true, nullsFirst: true }),
        supabase.from('schedules').select('*')
          .eq('user_id', ownerUserId)
          .eq('send_date', today)
          .eq('status', 'agendado')
          .order('send_time', { ascending: true }),
        supabase.from('conversations')
          .select('id, contact_name, contact_phone, contact_channel, last_message_at, unread_count, status')
          .eq('user_id', ownerUserId)
          .gt('unread_count', 0)
          .order('last_message_at', { ascending: false })
          .limit(10),
      ])

      const allTasks = tasksRes.data ?? []
      setTasks(allTasks)
      setOverdueTasks(allTasks.filter(t => t.due_date && t.due_date < today))
      setTodayTasks(allTasks.filter(t => t.due_date === today))

      const clients = clientsRes.data ?? []
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      const threeDaysStr = threeDaysAgo.toISOString()

      setColdLeads(clients.filter(c =>
        c.stage && c.stage !== 'closed' && c.stage !== 'lost' &&
        (!c.updated_at || c.updated_at < threeDaysStr)
      ).slice(0, 8))

      setHotLeads(clients.filter(c =>
        c.tags && c.tags.some(t => /hot|quente|vip|urgente/i.test(t)) &&
        c.stage !== 'closed' && c.stage !== 'lost'
      ).slice(0, 8))

      setTodaySchedules(schedRes.data ?? [])
      setRecentConversations(convsRes.data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [ownerUserId])

  useEffect(() => { fetchData() }, [fetchData])

  return {
    tasks, overdueTasks, todayTasks, coldLeads, hotLeads,
    todaySchedules, recentConversations,
    loading, error, refetch: fetchData,
  }
}
