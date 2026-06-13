// Cliente Supabase do SERVIDOR — usa a SERVICE ROLE KEY (ignora RLS).
// Necessário porque o webhook é global: o motor precisa ler funis ativos de
// QUALQUER usuário e escrever execuções/contatos. A service key vive só no .env.
const { createClient } = require('@supabase/supabase-js')

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env

const isConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)

if (!isConfigured) {
  console.warn(
    '[supabase] SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY ausentes no .env — ' +
    'o motor de funis fica DESATIVADO (o resto do webhook continua funcionando).'
  )
}

const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

module.exports = { supabase, isConfigured }
