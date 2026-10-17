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
      detectSessionInUrl: false,
      persistSession: true,
      lock: async (_name, _acquireTimeout, fn) => await fn(),
    },
    global: {
      fetch: async (input, init) => {
        const res = await fetch(input, init)
        if (res.status === 401) {
          const body = await res.clone().text()
          if (/issued at future|iat/i.test(body)) {
            console.warn('[RiseFlow] Relógio do computador pode estar adiantado — JWT rejeitado pelo Supabase.')
            if (!window.__clockSkewWarned) {
              window.__clockSkewWarned = true
              setTimeout(() => {
                alert('O relógio do seu computador está adiantado.\n\nAjuste a data/hora (Configurações > Hora e idioma > Sincronizar agora) e recarregue a página.')
              }, 100)
            }
          }
        }
        return res
      },
    },
  }
)
