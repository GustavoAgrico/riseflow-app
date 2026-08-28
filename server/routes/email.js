// Rotas do canal Email (SMTP) — envio real via nodemailer (server/emailClient.js).
// As credenciais SMTP do usuário ficam em integrations.config (type='email').
// O envio acontece SÓ no servidor; o frontend nunca fala SMTP direto.
//
// Segurança: assim como o resto deste proxy, a auth é o JWT do /api/auth/login
// (baseado em email). `userId` chega no body. Enquanto a auth do proxy não for
// amarrada ao Supabase Auth, vale a mesma posture frouxa das demais rotas — ver
// middleware/auth.js. Não logamos host/senha.
const { Router } = require('express')
const { isConfigured } = require('../supabaseClient')
const { verifySmtp, sendMailForUser, httpProvider } = require('../emailClient')

const router = Router()

// Deixa o erro de conexão SMTP legível (a hospedagem — ex.: Render free —
// costuma BLOQUEAR as portas 25/465/587, o que aparece como timeout/ETIMEDOUT).
function smtpErrorMessage(err) {
  const m = err?.message || ''
  if (/timeout|ETIMEDOUT|ESOCKET|ECONNREFUSED|ECONNRESET/i.test(m) || err?.code === 'ETIMEDOUT') {
    return 'Não foi possível conectar ao servidor SMTP. Muitas hospedagens (Render free) BLOQUEIAM as portas de SMTP. Use uma API de e-mail (defina BREVO_API_KEY/RESEND_API_KEY/SENDGRID_API_KEY + EMAIL_FROM no servidor).'
  }
  return m
}

// POST /api/email/test — valida as credenciais SMTP sem enviar nada.
// Se o servidor já tem um provedor HTTP (Brevo/Resend/SendGrid) configurado,
// o envio real vai por HTTP → o teste passa sem depender de SMTP.
// Body: { host, port, secure?, user, pass }
router.post('/test', async (req, res) => {
  if (httpProvider()) {
    return res.json({ ok: true, via: 'http' })
  }
  const { host, port, secure, user, pass } = req.body || {}
  if (!host || !user || !pass) {
    return res.status(400).json({ error: 'host, user e pass são obrigatórios.' })
  }
  try {
    await verifySmtp({ host, port, secure, user, pass })
    res.json({ ok: true, via: 'smtp' })
  } catch (err) {
    res.status(400).json({ ok: false, error: smtpErrorMessage(err) })
  }
})

// POST /api/email/send — envia um email usando a config salva do usuário.
// Body: { to, subject, text?, html?, from? }
// B14: o dono do envio vem do token (req.user.sub), NÃO do body — senão qualquer
// um autenticado enviaria pelo SMTP de outro usuário. O userId do body só é aceito
// como fallback fora de produção (tokens legados por e-mail não têm `sub`).
router.post('/send', async (req, res) => {
  const { to, subject, text, html, from } = req.body || {}
  const userId =
    req.user?.sub || (process.env.NODE_ENV !== 'production' ? req.body?.userId : null)
  if (!userId) {
    return res.status(401).json({ error: 'Usuário não identificado no token.' })
  }
  if (!to || !subject || (!text && !html)) {
    return res.status(400).json({ error: 'to, subject e text|html são obrigatórios.' })
  }
  if (!isConfigured) {
    return res.status(503).json({ error: 'Backend sem SUPABASE_SERVICE_ROLE_KEY — envio de email indisponível.' })
  }
  try {
    const info = await sendMailForUser(userId, { to, subject, text, html, from })
    res.json({ ok: true, messageId: info.messageId })
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message })
  }
})

module.exports = router
