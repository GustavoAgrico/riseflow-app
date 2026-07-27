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
const { verifySmtp, sendMailForUser } = require('../emailClient')

const router = Router()

// POST /api/email/test — valida as credenciais SMTP sem enviar nada.
// Body: { host, port, secure?, user, pass }
router.post('/test', async (req, res) => {
  const { host, port, secure, user, pass } = req.body || {}
  if (!host || !user || !pass) {
    return res.status(400).json({ error: 'host, user e pass são obrigatórios.' })
  }
  try {
    await verifySmtp({ host, port, secure, user, pass })
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message })
  }
})

// POST /api/email/send — envia um email usando a config salva do usuário.
// Body: { userId, to, subject, text?, html?, from? }
router.post('/send', async (req, res) => {
  const { userId, to, subject, text, html, from } = req.body || {}
  if (!userId || !to || !subject || (!text && !html)) {
    return res.status(400).json({ error: 'userId, to, subject e text|html são obrigatórios.' })
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
