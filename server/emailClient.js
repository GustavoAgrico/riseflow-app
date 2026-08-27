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

// Fallback: SMTP da PLATAFORMA (env do servidor). Usado quando o dono não tem
// e-mail próprio configurado — ex.: convite de equipe sai do endereço do sistema.
// Defina SMTP_HOST / SMTP_USER / SMTP_PASS (e opcional SMTP_PORT / SMTP_SECURE /
// SMTP_FROM) no servidor. Sem essas envs, não há fallback.
function getSystemEmailConfig() {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) return null
  const secure = process.env.SMTP_SECURE
  return {
    host,
    port: process.env.SMTP_PORT,
    secure: secure === 'true' ? true : secure === 'false' ? false : undefined,
    user,
    pass,
    from: process.env.SMTP_FROM || user,
  }
}

// Envia um email. Prioridade: SMTP do usuário → SMTP do sistema (env).
// Lança só se NENHUM dos dois estiver configurado.
async function sendMailForUser(userId, { to, subject, text, html, from }) {
  const c = await getUserEmailConfig(userId)
  if (c) {
    return makeTransport({
      host: c.host, port: c.port, secure: c.secure, user: c.email || c.user, pass: c.pass,
    }).sendMail({
      from: from || c.from || c.email || c.user,
      to, subject, text: text || undefined, html: html || undefined,
    })
  }
  const sys = getSystemEmailConfig()
  if (sys) {
    return makeTransport({
      host: sys.host, port: sys.port, secure: sys.secure, user: sys.user, pass: sys.pass,
    }).sendMail({
      from: from || sys.from,
      to, subject, text: text || undefined, html: html || undefined,
    })
  }
  throw new Error('Email não configurado: conecte o canal Email em Integrações, ou defina SMTP_HOST/SMTP_USER/SMTP_PASS no servidor.')
}

module.exports = { makeTransport, verifySmtp, getUserEmailConfig, getSystemEmailConfig, sendMailForUser }
