// Leads por etapa (status) em tempo real: recarrega quando o servidor avisa uma
// escrita (socket 'sales_update'), quando o banco muda (realtime) e a cada minuto.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { socket } from '@services/socket'
import api from '@services/api'
import { useAuth } from '@context/AuthContext'
import { useStages } from '@hooks/useStages'
import { computeSalesMetrics } from '@lib/metrics'
import { DEMO_DEALS } from '@constants/demoDeals'

const DAY = 86_400_000
const POLL_MS = 60_000

export function useLeadStats() {
  const { ownerUserId, isDemoMode } = useAuth()
  const { stages } = useStages()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)

  const reload = useCallback(async () => {
    if (isDemoMode) {
      setRows(DEMO_DEALS)
      setUpdatedAt(Date.now())
      setLoading(false)
      return
    }
    if (!ownerUserId) return
    try {
      const { data } = await api.get('/clients', { params: { owner: ownerUserId } })
      setRows(data || [])
      setUpdatedAt(Date.now())
    } catch (e) {
      console.warn('[LeadStats] erro ao carregar leads:', e?.message ?? e)
    } finally {
      setLoading(false)
    }
  }, [ownerUserId, isDemoMode])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    if (isDemoMode || !ownerUserId) return
    const onUpdate = (e) => { if (e?.userId === ownerUserId) reload() }
    socket.on('sales_update', onUpdate)
    const timer = setInterval(reload, POLL_MS)
    const channel = supabase
      .channel('lead-stats-' + ownerUserId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${ownerUserId}` }, reload)
      .subscribe()
    return () => {
      socket.off('sales_update', onUpdate)
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [reload, ownerUserId, isDemoMode])

  const m = computeSalesMetrics(rows, stages)
  const now = Date.now()
  const newToday = rows.filter(r => now - new Date(r.created_at).getTime() < DAY).length
  const newWeek = rows.filter(r => now - new Date(r.created_at).getTime() < 7 * DAY).length

  return {
    loading,
    total: rows.length,
    byStage: m.byStage,
    pipeline: m.pipeline,
    newToday,
    newWeek,
    updatedAt,
  }
}
