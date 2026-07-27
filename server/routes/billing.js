// Integração com AbacatePay — pagamentos e assinaturas recorrentes.
// A API key fica SOMENTE aqui; o frontend nunca fala com a AbacatePay diretamente.
//
// Endpoints públicos  : POST /api/billing/webhook (AbacatePay não envia JWT)
// Endpoints protegidos: POST /api/billing/checkout
//                       POST /api/billing/cancel
//                       GET  /api/billing/status
const { Router } = require('express')
const axios = require('axios')
const { supabase, isConfigured } = require('../supabaseClient')

const router = Router()

const ABACATE_BASE = 'https://api.abacatepay.com/v1'
const API_KEY = process.env.ABACATE_PAY_API_KEY

// Emails de administrador que podem ativar qualquer plano sem pagamento
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'gugahagrico12@gmail.com')
  .split(',').map(e => e.trim().toLowerCase())

const abacate = API_KEY
  ? axios.create({
      baseURL: ABACATE_BASE,
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    })
  : null

const PLANS = {
  starter:    { name: 'Starter RiseFlow',    price: 6700,  limit: 1000,  externalId: 'riseflow-starter-v1' },
  pro:        { name: 'Pro RiseFlow',        price: 19700, limit: 10000, externalId: 'riseflow-pro-v1' },
  enterprise: { name: 'Enterprise RiseFlow', price: 49700, limit: -1,    externalId: 'riseflow-enterprise-v1' },
}

async function activatePlan(userId, planId) {
  if (!isConfigured || !supabase) return
  const plan = PLANS[planId]
  if (!plan) return
  const { error } = await supabase.from('usage').upsert(
    { user_id: userId, plan: planId, messages_limit: plan.limit },
    { onConflict: 'user_id' }
  )
  if (error) console.error('[Billing] Erro ao ativar plano:', error.message)
  else console.log('[Billing] Plano ativado:', planId, 'user:', userId)
}

async function downgradeFree(userId) {
  if (!isConfigured || !supabase) return
  const { error } = await supabase.from('usage').upsert(
    { user_id: userId, plan: 'free', messages_limit: 20 },
    { onConflict: 'user_id' }
  )
  if (error) console.error('[Billing] Erro no downgrade:', error.message)
  else console.log('[Billing] Downgrade para free, user:', userId)
}

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/billing/webhook  — PÚBLICO
───────────────────────────────────────────────────────────────────────── */
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body
    console.log('[Billing] Webhook recebido:', event?.event, '|', event?.data?.id)
    res.json({ received: true })

    const meta = event?.data?.metadata ?? {}
    const userId = meta.userId
    const planId = meta.planId
    if (!userId || !planId) return

    if (['checkout.completed', 'subscription.renewed'].includes(event.event)) {
      await activatePlan(userId, planId)
    }
    if (event.event === 'subscription.cancelled') {
      await downgradeFree(userId)
    }
  } catch (err) {
    console.error('[Billing] Erro webhook:', err.message)
  }
})

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/billing/checkout  — protegido por JWT
   Body: { planId, userId, email, name? }
   Retorna: { url } — URL do hosted checkout ou redirect direto (admin/dev)
───────────────────────────────────────────────────────────────────────── */
router.post('/checkout', async (req, res) => {
  try {
    const { planId, userId, email, name } = req.body
    if (!planId || !userId || !email) {
      return res.status(400).json({ error: 'planId, userId e email são obrigatórios' })
    }
    if (!PLANS[planId]) {
      return res.status(400).json({ error: `Plano inválido: ${planId}` })
    }

    const origin = process.env.APP_URL || 'http://localhost:3001'
    const successUrl = `${origin}/plans?success=true&plan=${planId}`

    // Bypass admin: ativa direto sem pagamento
    const isAdmin = ADMIN_EMAILS.includes((email || '').toLowerCase())
    if (isAdmin) {
      console.log('[Billing] Admin bypass para:', email, planId)
      await activatePlan(userId, planId)
      return res.json({ url: successUrl, admin: true })
    }

    // Dev mode: sem API key, ativa direto (demo)
    if (!abacate) {
      console.log('[Billing] Dev mode — ativando plano direto:', planId)
      await activatePlan(userId, planId)
      return res.json({ url: successUrl, demo: true })
    }

    // Produção: AbacatePay
    console.log('[Billing] Iniciando checkout AbacatePay:', planId, email)

    // 1. Cria/atualiza cliente
    let customer
    try {
      const custRes = await abacate.post('/customers/create', {
        email,
        name: name || email,
        metadata: { userId },
      })
      customer = custRes.data?.data ?? custRes.data
      console.log('[Billing] Cliente:', customer?.id)
    } catch (err) {
      const detail = err.response?.data
      console.error('[Billing] Erro ao criar cliente:', JSON.stringify(detail), err.message)
      return res.status(502).json({ error: `Erro ao criar cliente: ${JSON.stringify(detail) || err.message}` })
    }

    // 2. Cria assinatura diretamente (sem produto pré-cadastrado)
    let subscription
    try {
      const plan = PLANS[planId]
      const subRes = await abacate.post('/subscriptions/create', {
        customer: { id: customer.id },
        products: [{
          externalId: plan.externalId,
          name: plan.name,
          price: plan.price,
          quantity: 1,
        }],
        returnUrl: successUrl,
        metadata: { userId, planId },
      })
      subscription = subRes.data?.data ?? subRes.data
      console.log('[Billing] Assinatura criada:', subscription?.id, '| URL:', subscription?.url)
    } catch (err) {
      const detail = err.response?.data
      console.error('[Billing] Erro ao criar assinatura:', JSON.stringify(detail), err.message)
      return res.status(502).json({ error: `Erro ao criar assinatura: ${JSON.stringify(detail) || err.message}` })
    }

    if (!subscription?.url) {
      console.error('[Billing] AbacatePay não retornou URL. Resposta:', JSON.stringify(subscription))
      return res.status(502).json({ error: 'AbacatePay não retornou URL de checkout. Verifique as credenciais.' })
    }

    // Persiste referência (tabela billing — opcional)
    if (isConfigured && supabase) {
      supabase.from('billing').upsert(
        { user_id: userId, plan_id: planId, abacate_customer_id: customer.id, abacate_checkout_id: subscription.id, status: 'pending' },
        { onConflict: 'user_id' }
      ).catch(() => {})
    }

    res.json({ url: subscription.url })
  } catch (err) {
    console.error('[Billing] Erro inesperado checkout:', err.message)
    res.status(500).json({ error: err.message || 'Erro interno no checkout.' })
  }
})

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/billing/cancel  — protegido por JWT
───────────────────────────────────────────────────────────────────────── */
router.post('/cancel', async (req, res) => {
  try {
    const { userId } = req.body
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' })

    if (abacate && isConfigured && supabase) {
      const { data: billing } = await supabase
        .from('billing')
        .select('abacate_checkout_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (billing?.abacate_checkout_id) {
        await abacate.post('/subscriptions/cancel', { id: billing.abacate_checkout_id })
          .catch((e) => console.warn('[Billing] Erro ao cancelar na AbacatePay:', e.message))
      }
    }
    await downgradeFree(userId)
    res.json({ success: true })
  } catch (err) {
    console.error('[Billing] Erro cancel:', err.message)
    res.status(500).json({ error: err.message })
  }
})

/* ─────────────────────────────────────────────────────────────────────────
   GET /api/billing/status  — protegido por JWT
───────────────────────────────────────────────────────────────────────── */
router.get('/status', async (req, res) => {
  res.json({
    configured: !!abacate,
    plans: Object.fromEntries(
      Object.entries(PLANS).map(([id, p]) => [id, { name: p.name, price: p.price }])
    ),
  })
})

module.exports = router
