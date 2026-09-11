// Período GLOBAL compartilhado (seletor de período — F1-04 do roadmap Fase 1).
// Uma única escolha de período vale para Dashboard, Funil e Analytics: trocar em
// qualquer tela reflete nas outras (mesmo em abas diferentes). Persistido em
// localStorage; as opções e a conversão para janela vêm de @lib/metrics.
import { useState, useEffect, useCallback } from 'react'
import { PERIOD_OPTIONS, DEFAULT_PERIOD } from '@lib/metrics'

const KEY = 'rf_global_period'
const EVT = 'rf-period-change'

const read = () => {
  try {
    const v = localStorage.getItem(KEY)
    return PERIOD_OPTIONS.some((o) => o.key === v) ? v : DEFAULT_PERIOD
  } catch {
    return DEFAULT_PERIOD
  }
}

export function usePeriod() {
  const [period, setState] = useState(read)

  useEffect(() => {
    const sync = () => setState(read())
    window.addEventListener(EVT, sync) // componentes co-montados nesta aba
    window.addEventListener('storage', sync) // outras abas
    return () => {
      window.removeEventListener(EVT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const setPeriod = useCallback((p) => {
    try { localStorage.setItem(KEY, p) } catch {}
    setState(p)
    window.dispatchEvent(new Event(EVT))
  }, [])

  return { period, setPeriod, options: PERIOD_OPTIONS }
}
