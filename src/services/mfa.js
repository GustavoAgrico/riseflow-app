// Cliente da verificação em duas etapas (2FA).
// As rotas /api/mfa autenticam com o token do Supabase (não o do proxy): quem está
// na 2ª etapa ainda não recebeu o token do servidor.
import { supabase } from '@/lib/supabase'

const API_BASE = `${import.meta.env.VITE_API_URL || ''}/api`
export const MFA_EVENT = 'rf:mfa-required'

async function call(path, body) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Sessão expirada. Entre de novo.')
  const res = await fetch(`${API_BASE}/mfa${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.error || `Erro ${res.status}`), { status: res.status })
  return json
}

export const mfaApi = {
  status: () => call('/status'),
  generateRecovery: () => call('/recovery/generate', {}),
  useRecovery: (code) => call('/recovery/use', { code }),
  sendEmail: (purpose = 'login') => call('/email/send', { purpose }),
  verifyEmail: (code, enable = false) => call('/email/verify', { code, enable }),
  disableEmail: () => call('/email/disable', {}),
  removeTotp: (factorId) => call('/totp/remove', { factorId }),
}

// App autenticador (TOTP) — direto no Supabase Auth.
export const totp = {
  // Começa o cadastro: devolve { factorId, qr (SVG/data URL), secret }. Limpa tentativas não concluídas.
  async enroll() {
    const { data: list } = await supabase.auth.mfa.listFactors()
    for (const f of (list?.all || []).filter(f => f.factor_type === 'totp' && f.status !== 'verified')) {
      try { await supabase.auth.mfa.unenroll({ factorId: f.id }) } catch { /* ok */ }
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `RiseFlow ${new Date().toLocaleDateString('pt-BR')}` })
    if (error) throw error
    return { factorId: data.id, qr: data.totp?.qr_code, secret: data.totp?.secret }
  },
  // Confere o código de 6 dígitos (cadastro ou login). A sessão passa a "aal2".
  async verify(factorId, code) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: String(code).replace(/\D/g, '') })
    if (error) throw Object.assign(new Error(/invalid|expired/i.test(error.message) ? 'Código incorreto ou vencido. Confira a hora do celular e tente de novo.' : error.message), { status: 400 })
  },
  async factors() {
    const { data } = await supabase.auth.mfa.listFactors()
    return (data?.totp || []).filter(f => f.status === 'verified')
  },
  async unenroll(factorId) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) throw error
  },
}
