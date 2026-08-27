import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { socket } from '@services/socket'
import { useAuth } from '@context/AuthContext'

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function buildChartData(messages) {
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (6 - i))
    return { date: d.toISOString().slice(0, 10), day: DAY_LABELS[d.getDay()], messages: 0, sent: 0 }
  })
  for (const msg of messages) {
    const date = msg.created_at?.slice(0, 10)
    const bucket = days.find(d => d.date === date)
    if (bucket) {
      bucket.messages += 1
      if (msg.direction === 'outbound') bucket.sent += 1
    }
  }
  return days
}

export const useDashboardData = (version = 0) => {
  const { ownerUserId } = useAuth()
  const [flows, setFlows] = useState([])
  const [clients, setClients] = useState([])
  const [conversations, setConversations] = useState([])
  const [recentMessages, setRecentMessages] = useState([])
  const [integrations, setIntegrations] = useState([])
  const [totalMessages, setTotalMessages] = useState(0)
  const [totalConvs, setTotalConvs] = useState(0)
  const [totalTeam, setTotalTeam] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!ownerUserId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const [flowsRes, clientsRes, convsRes, msgsRes, intRes, countRes, convCountRes, teamCountRes] = await Promise.all([
        supabase.from('flows').select('*').eq('user_id', ownerUserId).order('created_at', { ascending: false }),
        supabase.from('clients').select('*').eq('user_id', ownerUserId).order('created_at', { ascending: false }),
        supabase
          .from('conversations')
          .select('id,contact_name,contact_phone,contact_channel,last_message_at,unread_count')
          .eq('user_id', ownerUserId)
          .order('last_message_at', { ascending: false })
          .limit(20),
        supabase
          .from('messages')
          .select('id,created_at,direction')
          .eq('user_id', ownerUserId)
          .gte('created_at', sevenDaysAgo.toISOString()),
        supabase.from('integrations').select('type,status,connected_at').eq('user_id', ownerUserId),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', ownerUserId),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('user_id', ownerUserId),
        supabase.from('team_members').select('id', { count: 'exact', head: true }).eq('user_id', ownerUserId),
      ])

      if (flowsRes.error) throw flowsRes.error
      if (clientsRes.error) throw clientsRes.error

      setFlows(flowsRes.data ?? [])
      setClients(clientsRes.data ?? [])
      setConversations(convsRes.data ?? [])
      setRecentMessages(msgsRes.data ?? [])
      setIntegrations(intRes.data ?? [])
      setTotalMessages(countRes.count ?? 0)
      setTotalConvs(convCountRes.count ?? 0)
      setTotalTeam(teamCountRes.count ?? 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [ownerUserId, version])

  useEffect(() => { fetchData() }, [fetchData])

  // Tempo real: recarrega os números quando chega conversa/mensagem/lead.
  // Debounce para não refazer as queries a cada mensagem num burst.
  useEffect(() => {
    let t
    const refresh = () => { clearTimeout(t); t = setTimeout(() => fetchData(), 800) }
    socket.on('new_chat', refresh)
    socket.on('new_message', refresh)
    socket.on('new_lead', refresh)
    return () => {
      clearTimeout(t)
      socket.off('new_chat', refresh)
      socket.off('new_message', refresh)
      socket.off('new_lead', refresh)
    }
  }, [fetchData])

  // Dados reais sempre — sem fallback para campos fake (triggers/conversions)
  const activeFlows = flows.filter(f => f.status === 'active')
  const totalFlows = flows.length
  const totalClients = clients.length
  const activeClients = clients.filter(c => c.status === 'active')
  const totalConversations = totalConvs

  const connectedIntegrations = integrations.filter(i => i.status === 'connected')
  const hasAnyIntegration = connectedIntegrations.length > 0

  const chartData = buildChartData(recentMessages)

  const isEmpty = flows.length === 0 && clients.length === 0 && conversations.length === 0

  return {
    flows, clients, conversations,
    totalMessages,           // contagem real da tabela messages
    totalFlows,              // total de fluxos criados
    activeFlows,             // fluxos com status='active'
    totalClients,            // total de clientes
    activeClients,           // clientes com status='active'
    totalConversations,      // conversas abertas
    totalTeam,               // total de membros da equipe
    integrations,
    connectedIntegrations,
    hasAnyIntegration,
    chartData,
    loading, error, isEmpty,
    refetch: fetchData,
  }
}
