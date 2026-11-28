// Verificação em duas etapas (2FA) — sem SMS e sem Twilio.
//   • app autenticador (TOTP): nativo do Supabase Auth; depois do código a sessão vira "aal2";
//   • códigos de recuperação: 8 códigos de uso único (só o hash fica no banco);
//   • código por e-mail: só quando houver provedor de e-mail no servidor (Brevo/Resend/SendGrid).
// A regra vale no SERVIDOR: /api/auth/login não entrega o token do proxy enquanto a
// sessão não passar pela 2ª etapa (ver index.js).
const crypto = require('crypto')
const { supabase, isConfigured } = require('./supabaseClient')

const RECOVERY_COUNT = 8
const EMAIL_CODE_TTL_MS = 10 * 60_000
const EMAIL_MAX_ATTEMPTS = 5
const TRUST_DAYS = 30
const PEPPER = () => process.env.JWT_SECRET || 'riseflow'

// ── Funções puras (testadas) ────────────────────────────────────────────────
// Claims do access token do Supabase (já validado por auth.getUser).
function decodeClaims(token) {
  try {
    const part = String(token || '').split('.')[1]
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch { return {} }
}

// O que o usuário ativou.
function policyOf(user) {
  const totp = (user?.factors || []).filter(f => f.factor_type === 'totp' && f.status === 'verified')
  const email = Boolean(user?.app_metadata?.mfa_email)
  return { totp: totp.length > 0, totpFactorIds: totp.map(f => f.id), email, required: totp.length > 0 || email }
}

const normalizeCode = (c) => String(c || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const hashCode = (userId, code) => crypto.createHash('sha256').update(`${PEPPER()}:${userId}:${normalizeCode(code)}`).digest('hex')
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

// "k7m2q-x9p4w" (sem letras/números que se confundem).
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
function recoveryCode() {
  const pick = () => Array.from(crypto.randomBytes(5), b => ALPHABET[b % ALPHABET.length]).join('')
  return `${pick()}-${pick()}`
}
const emailCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra })

// ── Banco ───────────────────────────────────────────────────────────────────
let missingLogged = false
function missing(error) {
  const code = String(error?.code || '')
  if (['42P01', 'PGRST205'].includes(code) || /does not exist|schema cache/i.test(error?.message || '')) {
    if (!missingLogged) { console.warn('[2fa] tabelas ausentes — rode supabase/mfa.sql (o app autenticador funciona sem elas)'); missingLogged = true }
    return true
  }
  return false
}
const storageOff = () => httpError(503, 'Recurso indisponível: rode a migração supabase/mfa.sql.')

async function isTrusted(sessionId) {
  if (!isConfigured || !sessionId) return false
  const { data, error } = await supabase.from('mfa_sessions').select('session_id')
    .eq('session_id', sessionId).gt('expires_at', new Date().toISOString()).maybeSingle()
  if (error) { missing(error); return false }
  return Boolean(data)
}

async function trustSession(userId, sessionId, method) {
  if (!sessionId) throw httpError(400, 'Sessão sem identificador.')
  const { error } = await supabase.from('mfa_sessions').upsert({
    session_id: sessionId, user_id: userId, method,
    expires_at: new Date(Date.now() + TRUST_DAYS * 86400_000).toISOString(),
  }, { onConflict: 'session_id' })
  if (error) { if (missing(error)) throw storageOff(); throw error }
}

// Situação da sessão: o que está ativo e se a 2ª etapa já foi feita nela.
async function evaluate(user, token) {
  const claims = decodeClaims(token)
  const policy = policyOf(user)
  let satisfied = !policy.required || claims.aal === 'aal2'
  if (!satisfied) satisfied = await isTrusted(claims.session_id)
  return { ...policy, satisfied, aal: claims.aal || 'aal1', sessionId: claims.session_id || null }
}

// null = tabela ausente (migração não rodada). Sem "head": pedidos HEAD não trazem o
// erro PGRST205 e a tabela ausente parecia existir com 0 códigos.
async function recoveryLeft(userId) {
  const { data, error } = await supabase.from('mfa_recovery_codes').select('id')
    .eq('user_id', userId).is('used_at', null).limit(50)
  if (error) { if (missing(error)) return null; throw error }
  return (data || []).length
}

async function generateRecovery(userId) {
  const codes = Array.from({ length: RECOVERY_COUNT }, recoveryCode)
  const del = await supabase.from('mfa_recovery_codes').delete().eq('user_id', userId)
  if (del.error) { if (missing(del.error)) throw storageOff(); throw del.error }
  const { error } = await supabase.from('mfa_recovery_codes').insert(codes.map(c => ({ user_id: userId, code_hash: hashCode(userId, c) })))
  if (error) throw error
  return codes
}

async function useRecovery(userId, sessionId, code) {
  if (normalizeCode(code).length !== 10) throw httpError(400, 'Código de recuperação inválido.')
  const h = hashCode(userId, code)
  const { data, error } = await supabase.from('mfa_recovery_codes').select('id, code_hash').eq('user_id', userId).is('used_at', null)
  if (error) { if (missing(error)) throw storageOff(); throw error }
  const hit = (data || []).find(r => safeEqual(r.code_hash, h))
  if (!hit) throw httpError(401, 'Código de recuperação inválido ou já usado.')
  // Marca como usado só se ninguém usou ao mesmo tempo.
  const { data: upd, error: e2 } = await supabase.from('mfa_recovery_codes').update({ used_at: new Date().toISOString() })
    .eq('id', hit.id).is('used_at', null).select('id')
  if (e2) throw e2
  if (!upd?.length) throw httpError(401, 'Código de recuperação inválido ou já usado.')
  await trustSession(userId, sessionId, 'recovery')
  return { left: await recoveryLeft(userId) }
}

// ── Código por e-mail ───────────────────────────────────────────────────────
function emailAvailable() {
  try { const ec = require('./emailClient'); return Boolean(ec.httpProvider() || ec.getSystemEmailConfig()) } catch { return false }
}

async function sendEmailCode(user, purpose = 'login') {
  if (!emailAvailable()) throw httpError(503, 'Envio de e-mail não configurado no servidor.')
  if (!user.email) throw httpError(400, 'Conta sem e-mail.')
  const { data: last, error: e0 } = await supabase.from('mfa_email_codes').select('sent_at').eq('user_id', user.id).maybeSingle()
  if (e0) { if (missing(e0)) throw storageOff(); throw e0 }
  if (last && Date.now() - new Date(last.sent_at).getTime() < 60_000) throw httpError(429, 'Aguarde 1 minuto para pedir outro código.')
  const code = emailCode()
  const { error } = await supabase.from('mfa_email_codes').upsert({
    user_id: user.id, code_hash: hashCode(user.id, code), purpose, attempts: 0,
    expires_at: new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString(), sent_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw error
  const { sendMailForUser } = require('./emailClient')
  await sendMailForUser(null, {
    to: user.email,
    subject: `Seu código RiseFlow: ${code}`,
    text: `Seu código de verificação é ${code}. Ele vale por 10 minutos.\n\nSe não foi você, troque sua senha.`,
    html: `<p>Seu código de verificação do RiseFlow:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Vale por 10 minutos. Se não foi você, troque sua senha.</p>`,
  })
  return { sent: true }
}

async function verifyEmailCode(user, sessionId, code, { enable = false } = {}) {
  const { data: row, error } = await supabase.from('mfa_email_codes').select('*').eq('user_id', user.id).maybeSingle()
  if (error) { if (missing(error)) throw storageOff(); throw error }
  if (!row || new Date(row.expires_at).getTime() < Date.now()) throw httpError(401, 'Código expirado. Peça outro.')
  if (row.attempts >= EMAIL_MAX_ATTEMPTS) throw httpError(429, 'Tentativas demais. Peça outro código.')
  if (!safeEqual(row.code_hash, hashCode(user.id, String(code || '').replace(/\D/g, '')))) {
    await supabase.from('mfa_email_codes').update({ attempts: row.attempts + 1 }).eq('user_id', user.id)
    throw httpError(401, 'Código incorreto.')
  }
  await supabase.from('mfa_email_codes').delete().eq('user_id', user.id)
  if (enable) await setEmailMfa(user, true)
  await trustSession(user.id, sessionId, 'email')
  return { ok: true }
}

async function setEmailMfa(user, on) {
  const { error } = await supabase.auth.admin.updateUserById(user.id, { app_metadata: { ...(user.app_metadata || {}), mfa_email: Boolean(on) } })
  if (error) throw error
}

async function removeTotp(user, factorId) {
  const ids = policyOf(user).totpFactorIds
  if (!ids.includes(factorId)) throw httpError(404, 'Fator não encontrado.')
  const { error } = await supabase.auth.admin.mfa.deleteFactor({ id: factorId, userId: user.id })
  if (error) throw error
}

// Ao desligar tudo, apaga códigos e sessões confiáveis.
async function clearIfOff(userId, policyAfter) {
  if (policyAfter.required) return
  await supabase.from('mfa_recovery_codes').delete().eq('user_id', userId)
  await supabase.from('mfa_sessions').delete().eq('user_id', userId)
}

module.exports = {
  decodeClaims, policyOf, normalizeCode, hashCode, recoveryCode, emailCode,
  evaluate, isTrusted, trustSession, recoveryLeft, generateRecovery, useRecovery,
  emailAvailable, sendEmailCode, verifyEmailCode, setEmailMfa, removeTotp, clearIfOff, httpError,
  RECOVERY_COUNT,
}
