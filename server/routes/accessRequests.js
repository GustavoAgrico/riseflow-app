// Solicitação de acesso a plano: o cliente pede, o admin recebe e-mail + WhatsApp
// e aprova/recusa por link. Substitui o checkout automático enquanto o formato
// de pagamento não é definido.
const crypto = require('crypto')
const express = require('express')
const { supabase, isConfigured } = require('../supabaseClient')
const { baileys } = require('../baileysClient')
const { sendMailForUser } = require('../emailClient')
const { PLANS, activatePlan, ADMIN_EMAILS } = require('./billing')

const router = express.Router()
const publicRouter = express.Router()

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'gugahagrico12@gmail.com'
const ADMIN_WHATSAPP = (process.env.ADMIN_NOTIFY_WHATSAPP || '5511974216693').replace(/\D/g, '')

const brl = cents => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const planLabel = p => `${p.name} — ${brl(p.price)}/mês`
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const appUrl = req => (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')

let adminUserId = process.env.ADMIN_USER_ID || null
async function resolveAdminUserId() {
  if (adminUserId) return adminUserId
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const admin = data?.users?.find(u => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase())
  adminUserId = admin?.id || null
  return adminUserId
}

function decisionLinks(req, row) {
  const base = `${appUrl(req)}/api/access-requests/${row.id}/decision?token=${row.token}`
  return { approve: `${base}&action=approve`, deny: `${base}&action=deny` }
}

async function notifyAdmin(req, row) {
  const plan = PLANS[row.plan_id]
  const links = decisionLinks(req, row)
  const when = new Date(row.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const lines = [
    `Cliente: ${row.name || '—'}`,
    `E-mail: ${row.email}`,
    `Telefone: ${row.phone || '—'}`,
    `Plano: ${planLabel(plan)}`,
    `Data: ${when}`,
  ]

  const email = sendMailForUser(await resolveAdminUserId().catch(() => null), {
    to: ADMIN_EMAIL,
    subject: `Solicitação de acesso: ${plan.name} (${brl(plan.price)}/mês) — ${row.name || row.email}`,
    text: `Nova solicitação de acesso ao RiseFlow\n\n${lines.join('\n')}\n\nAprovar: ${links.approve}\nRecusar: ${links.deny}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px">
      <h2 style="margin:0 0 12px">Nova solicitação de acesso</h2>
      <table style="border-collapse:collapse;font-size:14px">${lines.map(l => {
        const [k, ...v] = l.split(': ')
        return `<tr><td style="padding:4px 12px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v.join(': '))}</b></td></tr>`
      }).join('')}</table>
      <p style="margin:20px 0">
        <a href="${links.approve}" style="background:#059669;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Aprovar acesso</a>
        &nbsp;
        <a href="${links.deny}" style="background:#EF4444;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Recusar</a>
      </p></div>`,
  })

  const whatsapp = (async () => {
    const userId = await resolveAdminUserId()
    if (!userId) throw new Error(`conta admin ${ADMIN_EMAIL} não encontrada`)
    const text = `🔔 *Nova solicitação de acesso — RiseFlow*\n\n${lines.join('\n')}\n\n✅ Aprovar: ${links.approve}\n\n❌ Recusar: ${links.deny}`
    await baileys.post('/send/text', { userId, number: ADMIN_WHATSAPP, text })
  })()

  // Sino do app: chega mesmo se e-mail e WhatsApp estiverem fora do ar.
  const inApp = (async () => {
    const userId = await resolveAdminUserId()
    if (!userId) throw new Error('conta admin não encontrada')
    const { error } = await supabase.from('notifications').insert({
      user_id: userId, type: 'lead',
      title: `Solicitação: ${plan.name} (${brl(plan.price)}/mês)`,
      message: `${row.name || row.email} pediu acesso. Aprovar: ${links.approve}`,
    })
    if (error) throw error
  })()

  const [e, w, a] = await Promise.allSettled([email, whatsapp, inApp])
  if (e.status === 'rejected') console.warn('[access] e-mail ao admin falhou:', e.reason?.message)
  if (w.status === 'rejected') console.warn('[access] WhatsApp ao admin falhou:', w.reason?.response?.data?.error || w.reason?.message)
  if (a.status === 'rejected') console.warn('[access] notificação no app falhou:', a.reason?.message)
  return { email: e.status === 'fulfilled', whatsapp: w.status === 'fulfilled', app: a.status === 'fulfilled' }
}

// POST /api/access-requests — cliente pede um plano
router.post('/', async (req, res) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  const userId = req.user?.sub
  const email = req.user?.email || ''
  const { planId, name, phone } = req.body || {}
  const plan = PLANS[planId]
  if (!userId) return res.status(401).json({ error: 'Não autenticado' })
  if (!plan) return res.status(400).json({ error: 'Plano inválido' })

  try {
    if (ADMIN_EMAILS.includes(email.toLowerCase())) {
      await activatePlan(userId, planId)
      return res.json({ status: 'approved', admin: true })
    }

    const { data: existing } = await supabase.from('access_requests')
      .select('id, status').eq('user_id', userId).eq('plan_id', planId).eq('status', 'pending').maybeSingle()
    if (existing) return res.json({ status: 'pending', id: existing.id, alreadyRequested: true })

    const { data: row, error } = await supabase.from('access_requests').insert({
      user_id: userId,
      email,
      name: String(name || '').slice(0, 120) || null,
      phone: String(phone || '').replace(/\D/g, '').slice(0, 15) || null,
      plan_id: planId,
      plan_name: plan.name,
      price_cents: plan.price,
      token: crypto.randomBytes(24).toString('hex'),
    }).select().single()
    if (error) throw error

    const notified = await notifyAdmin(req, row)
    res.json({ status: 'pending', id: row.id, notified })
  } catch (e) {
    console.error('[access] erro ao criar solicitação:', e.message)
    res.status(500).json({ error: 'Não foi possível enviar a solicitação. Tente novamente.' })
  }
})

// GET /api/access-requests/mine — última solicitação do cliente (para mostrar "pendente")
router.get('/mine', async (req, res) => {
  if (!isConfigured) return res.json(null)
  const { data } = await supabase.from('access_requests')
    .select('id, plan_id, status, created_at, decided_at')
    .eq('user_id', req.user.sub).order('created_at', { ascending: false }).limit(1).maybeSingle()
  res.json(data || null)
})

const page = (title, body) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;background:#0f1117;color:#e5e7eb;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
.c{background:#1a1d27;border:1px solid #2a2e3a;border-radius:14px;padding:28px;max-width:440px;width:100%}h1{font-size:20px;margin:0 0 16px}
td{padding:4px 12px 4px 0;font-size:14px}td:first-child{color:#9ca3af}button{border:0;border-radius:8px;padding:12px 18px;font-weight:bold;font-size:15px;color:#fff;cursor:pointer;width:100%;margin-top:18px}</style></head>
<body><div class="c">${body}</div></body></html>`

async function loadForDecision(req, res) {
  const { id } = req.params
  const token = String(req.query.token || req.body?.token || '')
  const { data: row } = await supabase.from('access_requests').select('*').eq('id', id).maybeSingle()
  const ok = row && token.length === row.token.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(row.token))
  if (!ok) { res.status(404).send(page('Link inválido', '<h1>Link inválido ou expirado</h1>')); return null }
  return row
}

const summary = row => `<table>
  <tr><td>Cliente</td><td><b>${esc(row.name || '—')}</b></td></tr>
  <tr><td>E-mail</td><td><b>${esc(row.email)}</b></td></tr>
  <tr><td>Telefone</td><td><b>${esc(row.phone || '—')}</b></td></tr>
  <tr><td>Plano</td><td><b>${esc(row.plan_name)} — ${esc(brl(row.price_cents))}/mês</b></td></tr></table>`

// GET só mostra a confirmação: prévias de link (WhatsApp/Gmail) abrem a URL sozinhas.
publicRouter.get('/:id/decision', async (req, res) => {
  if (!isConfigured) return res.status(503).send('Indisponível')
  const row = await loadForDecision(req, res)
  if (!row) return
  if (row.status !== 'pending') {
    return res.send(page('Já decidido', `<h1>Solicitação já ${row.status === 'approved' ? 'aprovada' : 'recusada'}</h1>${summary(row)}`))
  }
  const approve = req.query.action === 'approve'
  res.send(page('Confirmar', `<h1>${approve ? 'Aprovar' : 'Recusar'} acesso?</h1>${summary(row)}
    <form method="post"><input type="hidden" name="token" value="${esc(row.token)}">
    <input type="hidden" name="action" value="${approve ? 'approve' : 'deny'}">
    <button style="background:${approve ? '#059669' : '#EF4444'}">${approve ? 'Confirmar aprovação' : 'Confirmar recusa'}</button></form>`))
})

publicRouter.post('/:id/decision', express.urlencoded({ extended: false }), async (req, res) => {
  if (!isConfigured) return res.status(503).send('Indisponível')
  const row = await loadForDecision(req, res)
  if (!row) return
  if (row.status !== 'pending') return res.send(page('Já decidido', `<h1>Esta solicitação já foi decidida.</h1>${summary(row)}`))

  const approve = req.body.action === 'approve'
  if (approve && !(await activatePlan(row.user_id, row.plan_id))) {
    return res.status(500).send(page('Erro', '<h1>Erro ao ativar o plano.</h1><p>Tente novamente em instantes.</p>'))
  }
  await supabase.from('access_requests')
    .update({ status: approve ? 'approved' : 'denied', decided_at: new Date().toISOString() })
    .eq('id', row.id).eq('status', 'pending')

  sendMailForUser(await resolveAdminUserId().catch(() => null), {
    to: row.email,
    subject: approve ? `Seu acesso ao plano ${row.plan_name} foi liberado` : `Sua solicitação do plano ${row.plan_name}`,
    text: approve
      ? `Olá${row.name ? ', ' + row.name : ''}! Seu acesso ao plano ${row.plan_name} (${brl(row.price_cents)}/mês) foi liberado. Acesse: ${appUrl(req)}`
      : `Olá${row.name ? ', ' + row.name : ''}. Sua solicitação do plano ${row.plan_name} não foi aprovada no momento. Responda este e-mail se tiver dúvidas.`,
  }).catch(e => console.warn('[access] e-mail ao cliente falhou:', e.message))

  res.send(page('Feito', `<h1>${approve ? '✅ Acesso aprovado' : '❌ Solicitação recusada'}</h1>${summary(row)}
    <p style="color:#9ca3af;font-size:13px;margin-top:16px">O cliente foi avisado por e-mail.</p>`))
})

module.exports = router
module.exports.publicRouter = publicRouter
