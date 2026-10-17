import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !url.startsWith('https://')) {
  console.error('[RiseFlow] VITE_SUPABASE_URL inválida ou não definida')
}

const PROXY_TOKEN_KEY = 'riseflow_proxy_token'
const API_BASE = `${import.meta.env.VITE_API_URL || ''}/api`
const REST_PATTERN = url ? new RegExp(`^${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/rest/v1/`) : null

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
    global: {
      fetch: async (input, init) => {
        const reqUrl = typeof input === 'string' ? input : input?.url || ''

        if (REST_PATTERN && REST_PATTERN.test(reqUrl)) {
          const proxyToken = localStorage.getItem(PROXY_TOKEN_KEY)
          if (proxyToken) {
            const restPath = reqUrl.replace(REST_PATTERN, '')
            const proxyUrl = `${API_BASE}/rest/v1/${restPath}`
            const headers = { ...(init?.headers || {}) }
            headers['Authorization'] = `Bearer ${proxyToken}`
            delete headers['apikey']
            try {
              return await fetch(proxyUrl, { ...init, headers })
            } catch {
              // proxy indisponível — tenta direto
            }
          }
        }

        return fetch(input, init)
      },
    },
  }
)
