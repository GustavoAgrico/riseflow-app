import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'

export const useDashboardData = (version = 0) => {
  const { user } = useAuth()
  const [flows, setFlows] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const [flowsRes, clientsRes] = await Promise.all([
        supabase.from('flows').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('clients').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      ])
      if (flowsRes.error) throw flowsRes.error
      if (clientsRes.error) throw clientsRes.error
      setFlows(flowsRes.data ?? [])
      setClients(clientsRes.data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [user, version])

  useEffect(() => { fetchData() }, [fetchData])

  const activeFlows = flows.filter(f => f.status === 'active')
  const activeClients = clients.filter(c => c.status === 'active')
  // msgCount = sum of all flow trigger counts (total messages processed)
  const msgCount = flows.reduce((sum, f) => sum + (f.triggers ?? 0), 0)
  const conversionRate = flows.length > 0
    ? (flows.reduce((acc, f) => acc + (f.triggers > 0 ? (f.conversions / f.triggers) * 100 : 0), 0) / flows.length).toFixed(1)
    : '0.0'

  const isEmpty = flows.length === 0 && clients.length === 0

  return {
    flows, clients, msgCount,
    activeFlows, activeClients, conversionRate,
    loading, error, isEmpty,
    refetch: fetchData,
  }
}
