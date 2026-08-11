import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !url.startsWith('https://')) {
  console.error('[RiseFlow] VITE_SUPABASE_URL inválida ou não definida')
}

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  key ?? 'placeholder',
  {
    auth: {
      flowType: 'pkce',
      // false: o AuthCallback troca o código explicitamente (evita corrida com o
      // auto-exchange e é mais robusto no Safari mobile).
      detectSessionInUrl: false,
      persistSession: true,
      // Web Locks (navigator.locks) DÁ DEADLOCK no Safari mobile → operações de
      // auth (getSession/exchange) travam por 30s ("Tempo esgotado"). Substitui
      // por um lock no-op (seguro num SPA de aba única).
      lock: async (_name, _acquireTimeout, fn) => await fn(),
    },
  }
)
