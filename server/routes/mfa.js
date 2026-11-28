// /api/mfa — verificação em duas etapas. Autentica pelo access token do Supabase
// (quem está na 2ª etapa ainda não tem o token do proxy).
//   GET  /status                         → o que está ativo e se esta sessão já passou
//   POST /recovery/generate              → 8 códigos novos (mostrados uma vez; exige sessão verificada)
//   POST /recovery/use      { code }     → passa a 2ª etapa com um código de recuperação
//   POST /email/send        { purpose }  → código por e-mail (login | enable)
//   POST /email/verify      { code, enable? }
//   POST /email/disable                  → desliga o e-mail como 2ª etapa (sessão verificada)
//   POST /totp/remove       { factorId } → remove o app autenticador (sessão verificada; serve
//                                          para quem perdeu o celular e entrou com recuperação)
const { Router } = require('express')
const { supabase, isConfigured } = require('../supabaseClient')
const mfa = require('../mfa')

const router = Router()

// Limite simples por usuário contra força bruta nos códigos.
const hits = new Map()
function limited(userId, max = 20) {
  const now = Date.now()
  const list = (hits.get(userId) || []).filter(t => now - t < 15 * 60_000)
  list.push(now)
  hits.set(userId, list)
  return list.length > max
}

async function supaAuth(req, res, next) {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  const [scheme, token] = String(req.headers.authorization || '').split(' ')
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Sessão ausente.' })
  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' })
    req.supaUser = data.user
    req.supaToken = token
    req.mfaState = await mfa.evaluate(data.user, token)
    next()
  } catch (e) {
    res.status(401).json({ error: 'Falha ao validar a sessão.' })
  }
}

const send = (res, e, fallback) => {
  if (!e?.status) console.error('[2fa]', fallback, e?.message)
  res.status(e?.status || 500).json({ error: e?.status ? e.message : fallback })
}
const needVerified = (req, res) => {
  if (req.mfaState.satisfied) return false
  res.status(403).json({ error: 'Confirme a verificação em duas etapas nesta sessão primeiro.', mfa_required: true })
  return true
}

router.use(supaAuth)

router.get('/status', async (req, res) => {
  const s = req.mfaState
  let left = null
  try { left = await mfa.recoveryLeft(req.supaUser.id) } catch { /* sem tabela */ }
  res.json({
    required: s.required, satisfied: s.satisfied, aal: s.aal,
    totp: s.totp, totpFactorIds: s.totpFactorIds, email: s.email,
    emailAvailable: mfa.emailAvailable(), recoveryLeft: left, recoveryAvailable: left !== null,
  })
})

router.post('/recovery/generate', async (req, res) => {
  if (needVerified(req, res)) return
  if (!req.mfaState.required) return res.status(400).json({ error: 'Ative a verificação em duas etapas primeiro.' })
  try { res.json({ codes: await mfa.generateRecovery(req.supaUser.id) }) } catch (e) { send(res, e, 'Erro ao gerar os códigos.') }
})

router.post('/recovery/use', async (req, res) => {
  if (limited(req.supaUser.id)) return res.status(429).json({ error: 'Tentativas demais. Aguarde 15 minutos.' })
  try { res.json(await mfa.useRecovery(req.supaUser.id, req.mfaState.sessionId, req.body?.code)) } catch (e) { send(res, e, 'Erro ao conferir o código.') }
})

router.post('/email/send', async (req, res) => {
  const purpose = req.body?.purpose === 'enable' ? 'enable' : 'login'
  if (purpose === 'enable' && needVerified(req, res)) return
  if (purpose === 'login' && !req.mfaState.required) return res.status(400).json({ error: 'A verificação em duas etapas não está ativa.' })
  if (limited(req.supaUser.id)) return res.status(429).json({ error: 'Tentativas demais. Aguarde 15 minutos.' })
  try { res.json(await mfa.sendEmailCode(req.supaUser, purpose)) } catch (e) { send(res, e, 'Não foi possível enviar o código.') }
})

router.post('/email/verify', async (req, res) => {
  const enable = Boolean(req.body?.enable)
  if (enable && needVerified(req, res)) return
  if (limited(req.supaUser.id)) return res.status(429).json({ error: 'Tentativas demais. Aguarde 15 minutos.' })
  try { res.json(await mfa.verifyEmailCode(req.supaUser, req.mfaState.sessionId, req.body?.code, { enable })) } catch (e) { send(res, e, 'Erro ao conferir o código.') }
})

router.post('/email/disable', async (req, res) => {
  if (needVerified(req, res)) return
  try {
    await mfa.setEmailMfa(req.supaUser, false)
    await mfa.clearIfOff(req.supaUser.id, { ...req.mfaState, email: false, required: req.mfaState.totp })
    res.json({ ok: true })
  } catch (e) { send(res, e, 'Erro ao desligar.') }
})

router.post('/totp/remove', async (req, res) => {
  if (needVerified(req, res)) return
  try {
    await mfa.removeTotp(req.supaUser, String(req.body?.factorId || ''))
    const left = req.mfaState.totpFactorIds.filter(id => id !== req.body?.factorId)
    await mfa.clearIfOff(req.supaUser.id, { required: left.length > 0 || req.mfaState.email })
    res.json({ ok: true })
  } catch (e) { send(res, e, 'Erro ao remover o app autenticador.') }
})

module.exports = router
