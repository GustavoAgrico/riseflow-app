// Cliente HTTP do backend proxy do RiseFlow (axios).
// A apikey da Evolution vive só no servidor; o frontend autentica com JWT.
//
// VITE_API_URL aponta para o backend (ex.: http://localhost:3001). Em dev o Vite
// proxia /api → :3333; em produção, defina a URL pública do backend.
import axios from 'axios'
import { supabase, getProxyToken, clearProxyToken } from '@/lib/supabase'

// Sem VITE_API_URL o BASE fica same-origin ('/api') — correto em produção,
// onde o Express serve o frontend e a API na mesma porta (ver Dockerfile).
// Em dev o .env define http://localhost:3001 e o Vite proxia /api → :3333.
const BASE = `${import.meta.env.VITE_API_URL || ''}/api`

export const api = axios.create({
  baseURL: BASE,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

/* Logout automático: limpa o token, encerra a sessão Supabase e volta ao login. */
const logout = async () => {
  clearProxyToken()
  try { await supabase.auth.signOut() } catch {}
  if (!window.location.pathname.startsWith('/login')) {
    window.location.assign('/login')
  }
}

/* ─── Interceptors ───────────────────────────────────────────────────── */
// Request: injeta o Bearer token em toda requisição.
api.interceptors.request.use(async (config) => {
  const token = await getProxyToken()
  config.headers = config.headers ?? {}
  config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response: em 401, renova o token e tenta 1x; se persistir, faz logout.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error
    if (response?.status === 401 && config && !config._retry) {
      config._retry = true
      try {
        const token = await getProxyToken({ force: true })
        config.headers.Authorization = `Bearer ${token}`
        return api(config)
      } catch {
        // cai para o logout abaixo
      }
    }
    if (response?.status === 401) await logout()
    return Promise.reject(error)
  }
)

export default api
