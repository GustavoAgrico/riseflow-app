import { useState, useEffect } from 'react'
import { useAuth } from '@context/AuthContext'
import { usageService } from '@services/usageService'

export function usePlan() {
  const { user } = useAuth()
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!user?.id) { setLoading(false); return }
    usageService.getUsage(user.id).then(p => { setPlan(p); setLoading(false) }).catch(() => setLoading(false))
  }, [user])
  return { plan, loading, refresh: () => window.location.reload() }
}
