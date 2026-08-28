// Cliente de e-mail compartilhado. Dois caminhos de envio:
//  1) API HTTP (porta 443) — Brevo / Resend / SendGrid. FUNCIONA no Render, que
//     BLOQUEIA as portas de SMTP (25/465/587) no plano free. É o caminho
//     recomendado em produção. Basta uma env de API key + EMAIL_FROM.
//  2) SMTP (nodemailer) — o e-mail do dono (Integrações) ou um SMTP de sistema
//     por env. Só funciona onde a saída SMTP não é bloqueada (self-host/local).
//
// Prioridade em sendMailForUser: API HTTP → SMTP do dono → SMTP do sistema.
const nodemailer = require('nodemailer')
const { supabase, isConfigured } = require('./supabaseClient')

// ── SMTP (nodemailer) ───────────────────────────────────────────────────────
// Timeouts curtos para FALHAR RÁPIDO quando a porta está bloqueada (Render),
// em vez de pendurar até o timeout do SO. 465 = SSL; 587/25 = STARTTLS.
function makeTransport({ host, port, secure, user, pass }) {
  const p = Number(port) || 587
  return nodemailer.createTransport({
    host,
    port: p,
    secure: typeof secure === 'boolean' ? secure : p === 465,
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  })
}

// Valida credenciais SMTP (verify, sem enviar). Lança em caso de falha.
const verifySmtp = (creds) => makeTransport(creds).verify()

// ── API HTTP (Brevo / Resend / SendGrid) ────────────────────────────────────
// Parseia "Nome <email>" ou "email".
function parseFrom(raw) {
  const s = (raw || '').trim()
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(s)
  if (m) return { name: m[1] || undefined, email: m[2].trim() }
  return { email: s }
}

const fromDefault = () => process.env.EMAIL_FROM || process.env.SMTP_FROM || ''

async function sendViaBrevo(key, { to, subject, text, html, from }) {
  const s = parseFrom(from || fromDefault())
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: s.email, name: s.name },
      to: [{ email: to }],
      subject,
      htmlContent: html || undefined,
      textContent: text || undefined,
    }),
  })
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json().catch(() => ({}))
  return { messageId: data.messageId || 'brevo' }
}

async function sendViaResend(key, { to, subject, text, html, from }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: from || fromDefault(),
      to: [to],
      subject,
      html: html || undefined,
      text: text || undefined,
    }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json().catch(() => ({}))
  return { messageId: data.id || 'resend' }
}

async function sendViaSendgrid(key, { to, subject, text, html, from }) {
  const s = parseFrom(from || fromDefault())
  const content = []
  if (text) content.push({ type: 'text/plain', value: text })
  if (html) content.push({ type: 'text/html', value: html })
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: s.email, name: s.name },
      subject,
      content: content.length ? content : [{ type: 'text/plain', value: ' ' }],
    }),
  })
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return { messageId: res.headers.get('x-message-id') || 'sendgrid' }
}

// Escolhe o provedor HTTP conforme a API key presente no ambiente. null se nenhum.
function httpProvider() {
  if (process.env.BREVO_API_KEY)   return (m) => sendViaBrevo(process.env.BREVO_API_KEY, m)
  if (process.env.RESEND_API_KEY)  return (m) => sendViaResend(process.env.RESEND_API_KEY, m)
  if (process.env.SENDGRID_API_KEY) return (m) => sendViaSendgrid(process.env.SENDGRID_API_KEY, m)
  return null
}

// ── SMTP config sources ─────────────────────────────────────────────────────
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

// SMTP da PLATAFORMA por env (SMTP_HOST/SMTP_USER/SMTP_PASS + opc.). null se ausente.
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

// ── Envio ────────────────────────────────────────────────────────────────────
// Prioridade: API HTTP (Render-friendly) → SMTP do dono → SMTP do sistema.
async function sendMailForUser(userId, { to, subject, text, html, from }) {
  const http = httpProvider()
  if (http) return http({ to, subject, text, html, from })

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

  throw new Error('Email não configurado: defina BREVO_API_KEY (ou RESEND_API_KEY / SENDGRID_API_KEY) + EMAIL_FROM no servidor, ou conecte o canal Email em Integrações.')
}

module.exports = {
  makeTransport, verifySmtp, getUserEmailConfig, getSystemEmailConfig,
  httpProvider, sendMailForUser,
}
