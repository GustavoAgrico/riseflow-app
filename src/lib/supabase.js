import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !url.startsWith('https://')) {
  console.error('[RiseFlow] VITE_SUPABASE_URL inválida ou não definida')
}

const API_BASE = `${import.meta.env.VITE_API_URL || ''}/api`
const TOKEN_KEY = 'riseflow_proxy_token'
const TOKEN_UID_KEY = 'riseflow_proxy_uid'
const REST_PREFIX = url ? `${url}/rest/v1/` : null
const nativeFetch = (...args) => window.fetch(...args)

let inFlight = null

export const clearProxyToken = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_UID_KEY)
}

// JWT do proxy Express, preso ao usuário da sessão Supabase atual.
export const getProxyToken = async ({ force = false } = {}) => {
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  const uid = session?.user?.id ?? 'anon'
  if (!force && localStorage.getItem(TOKEN_UID_KEY) === uid) {
    const cached = localStorage.getItem(TOKEN_KEY)
    if (cached) return cached
  }
  if (!inFlight) {
    inFlight = (async () => {
      const payload = session?.access_token ? { token: session.access_token } : { email: 'app@riseflow.local' }
      const res = await nativeFetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`login do proxy falhou (${res.status})`)
      const { token } = await res.json()
      localStorage.setItem(TOKEN_KEY, token)
      localStorage.setItem(TOKEN_UID_KEY, uid)
      return token
    })().finally(() => { inFlight = null })
  }
  return inFlight
}

// O PostgREST do projeto rejeita os JWTs de usuário ("JWT issued at future");
// as chamadas REST vão pelo proxy do servidor, que usa a service key e
// restringe tudo ao usuário autenticado.
const proxiedFetch = async (input, init = {}) => {
  const reqUrl = typeof input === 'string' ? input : input?.url || ''
  if (!REST_PREFIX || !reqUrl.startsWith(REST_PREFIX)) return nativeFetch(input, init)

  const proxyUrl = `${API_BASE}/rest/v1/${reqUrl.slice(REST_PREFIX.length)}`
  const send = async (force) => {
    const headers = new Headers(init.headers)
    headers.delete('apikey')
    headers.set('Authorization', `Bearer ${await getProxyToken({ force })}`)
    return nativeFetch(proxyUrl, { ...init, headers })
  }
  const res = await send(false)
  return res.status === 401 ? send(true) : res
}

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  key ?? 'placeholder',
  {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      lock: async (_name, _acquireTimeout, fn) => await fn(),
    },
    global: { fetch: proxiedFetch },
  }
)
