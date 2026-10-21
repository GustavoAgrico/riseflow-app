// Progresso da meta de vendas do mês corrente, recalculado ao vivo: o servidor
// emite 'sales_update' (Socket.io) a cada venda/meta/produto alterado; o
// intervalo é só rede de segurança caso o socket caia.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { socket } from '@services/socket'
import { useAuth } from '@context/AuthContext'

const POLL_MS = 60_000
const pad = (n) => String(n).padStart(2, '0')

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`

function monthWindow(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const daysLeft = Math.max(1, Math.ceil((end - now) / 86_400_000))
  return { start, end, daysLeft }
}

export function useGoalProgress() {
  const { ownerUserId, isDemoMode } = useAuth()
  const [state, setState] = useState({ loading: true, goal: null, products: [], wonDeals: [] })

  const reload = useCallback(async () => {
    if (isDemoMode || !ownerUserId) { setState({ loading: false, goal: null, products: [], wonDeals: [] }); return }
    const { start, end } = monthWindow()
    const [g, p, w] = await Promise.all([
      supabase.from('sales_goals').select('id, month, target').eq('user_id', ownerUserId).eq('month', monthKey()).maybeSingle(),
      supabase.from('products').select('id, name, price').eq('user_id', ownerUserId).eq('active', true).order('price', { ascending: false }),
      supabase.from('clients').select('id, name, company, value, won_at').eq('user_id', ownerUserId)
        .gte('won_at', start.toISOString()).lt('won_at', end.toISOString()).order('won_at', { ascending: false }),
    ])
    setState({ loading: false, goal: g.data ?? null, products: p.data ?? [], wonDeals: w.data ?? [] })
  }, [ownerUserId, isDemoMode])

  useEffect(() => {
    reload()
    const onUpdate = (e) => { if (e?.userId === ownerUserId) reload() }
    socket.on('sales_update', onUpdate)
    const timer = setInterval(reload, POLL_MS)
    return () => { socket.off('sales_update', onUpdate); clearInterval(timer) }
  }, [reload, ownerUserId])

  const target = Number(state.goal?.target) || 0
  const sold = state.wonDeals.reduce((a, d) => a + (Number(d.value) || 0), 0)
  const remaining = Math.max(0, target - sold)
  const { daysLeft } = monthWindow()

  return {
    ...state,
    reload,
    target,
    sold,
    remaining,
    pct: target ? (sold / target) * 100 : 0,
    reached: target > 0 && sold >= target,
    daysLeft,
    perDay: remaining / daysLeft,
    productsNeeded: state.products
      .filter((pr) => Number(pr.price) > 0)
      .map((pr) => ({ ...pr, units: Math.ceil(remaining / Number(pr.price)) })),
  }
}
