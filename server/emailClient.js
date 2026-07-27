// Cliente SMTP compartilhado (nodemailer).
// Usado tanto pela rota /api/email quanto pelo flowEngine (nó "Enviar Email").
// As credenciais ficam em integrations.config (type='email') do usuário.
const nodemailer = require('nodemailer')
const { supabase, isConfigured } = require('./supabaseClient')

// Monta um transporter a partir de uma config SMTP.
// 465 = SSL implícito; 587/25 = STARTTLS. `secure` pode ser forçado pela config.
function makeTransport({ host, port, secure, user, pass }) {
  const p = Number(port) || 587
  return nodemailer.createTransport({
    host,
    port: p,
    secure: typeof secure === 'boolean' ? secure : p === 465,
    auth: { user, pass },
  })
}

// Valida credenciais SMTP (verify, sem enviar). Lança em caso de falha.
const verifySmtp = (creds) => makeTransport(creds).verify()

// Lê a config SMTP conectada do usuário, ou null se não houver.
async function getUserEmailConfig(userId) {
  if (!isConfigured || !userId) return null
  const { data } = await supabase
    .from('integrations')
    .select('config, status')
    .eq('user_id', userId)
    .eq('type', 'email')
    .maybeSingle()
  if (!data || data.status !== 'connected' || !data.config || !data.config.pass) return null
  return data.config
}

// Envia um email usando a config salva do usuário. Lança se não estiver configurado.
async function sendMailForUser(userId, { to, subject, text, html, from }) {
  const c = await getUserEmailConfig(userId)
  if (!c) throw new Error('Email não configurado para este usuário.')
  return makeTransport({
    host: c.host, port: c.port, secure: c.secure, user: c.email || c.user, pass: c.pass,
  }).sendMail({
    from: from || c.from || c.email || c.user,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
  })
}

module.exports = { makeTransport, verifySmtp, getUserEmailConfig, sendMailForUser }
