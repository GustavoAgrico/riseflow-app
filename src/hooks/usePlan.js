import { useState, useEffect } from 'react'
import { useAuth } from '@context/AuthContext'
import { usageService } from '@services/usageService'

export function usePlan() {
  const { ownerUserId } = useAuth()
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!ownerUserId) { setLoading(false); return }
    usageService.getUsage(ownerUserId).then(p => { setPlan(p); setLoading(false) }).catch(() => setLoading(false))
  }, [ownerUserId])
  return { plan, loading, refresh: () => window.location.reload() }
}
