// Tema GLOBAL (claro/escuro). Alterna via atributo [data-theme] no <html>,
// persistido em localStorage. O escuro é o padrão. As cores de superfície/tinta
// vêm das variáveis em src/styles/tokens.css.
import { useState, useEffect, useCallback } from 'react'

const KEY = 'rf_theme'

export const readTheme = () => {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export const applyTheme = (t) => {
  try {
    document.documentElement.setAttribute('data-theme', t)
  } catch {}
}

export function useTheme() {
  const [theme, setState] = useState(readTheme)

  useEffect(() => {
    applyTheme(theme)
    const sync = (e) => { if (e.key === KEY) setState(readTheme()) } // outras abas
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [theme])

  const setTheme = useCallback((t) => {
    try { localStorage.setItem(KEY, t) } catch {}
    setState(t)
  }, [])

  const toggle = useCallback(() => setTheme(readTheme() === 'light' ? 'dark' : 'light'), [setTheme])

  return { theme, setTheme, toggle }
}
