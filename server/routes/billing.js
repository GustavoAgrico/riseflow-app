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

const ABACATE_BASE = 'https://api.abacatepay.com/v2'
const API_KEY = process.env.ABACATE_PAY_API_KEY

const abacate = API_KEY
  ? axios.create({
      baseURL: ABACATE_BASE,
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    })
  : null

// Configuração dos planos: preço em centavos BRL, limite de mensagens
const PLANS = {
  starter:    { name: 'Starter RiseFlow',    price: 6700,  limit: 1000,  externalId: 'riseflow-starter-v1' },
  pro:        { name: 'Pro RiseFlow',        price: 19700, limit: 10000, externalId: 'riseflow-pro-v1' },
  enterprise: { name: 'Enterprise RiseFlow', price: 49700, limit: -1,    externalId: 'riseflow-enterprise-v1' },
}

// Garante que o produto mensal existe no AbacatePay; cria se não encontrar.
async function ensureProduct(planId) {
  const plan = PLANS[planId]
  const { data: listRes } = await abacate.get('/products/list')
  const products = listRes?.data ?? []
  const found = products.find((p) => p.externalId === plan.externalId)
  if (found) return found

  const { data: created } = await abacate.post('/products/create', {
    externalId: plan.externalId,
    name: plan.name,
    price: plan.price,
    currency: 'BRL',
    cycle: 'MONTHLY',
  })
  console.log('[Billing] Produto criado no AbacatePay:', created.data?.id)
  return created.data
}

// Ativa/atualiza o plano no Supabase após confirmação de pagamento
async function activatePlan(userId, planId) {
  if (!isConfigured) return
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
  if (!isConfigured) return
  const { error } = await supabase.from('usage').upsert(
    { user_id: userId, plan: 'free', messages_limit: 20 },
    { onConflict: 'user_id' }
  )
  if (error) console.error('[Billing] Erro no downgrade:', error.message)
  else console.log('[Billing] Downgrade para free, user:', userId)
}

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/billing/webhook  — PÚBLICO (AbacatePay não envia JWT)
   Registrado em server/index.js ANTES do middleware auth.
───────────────────────────────────────────────────────────────────────── */
router.post('/webhook', async (req, res) => {
  const event = req.body
  console.log('[Billing] Webhook recebido:', event?.event, '|', event?.data?.id)

  // Responde imediatamente para a AbacatePay não retentar
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
})

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/billing/checkout  — protegido por JWT (via index.js)
   Body: { planId, userId, email, name? }
   Retorna: { url } — URL do hosted checkout da AbacatePay
───────────────────────────────────────────────────────────────────────── */
router.post('/checkout', async (req, res) => {
  const { planId, userId, email, name } = req.body
  if (!planId || !userId || !email) {
    return res.status(400).json({ error: 'planId, userId e email são obrigatórios' })
  }
  if (!PLANS[planId]) {
    return res.status(400).json({ error: `Plano inválido: ${planId}` })
  }

  // Fallback: sem API key, ativa o plano direto (dev/demo)
  if (!abacate) {
    await activatePlan(userId, planId)
    const origin = process.env.APP_URL || 'http://localhost:3001'
    return res.json({ url: `${origin}/plans?success=true&plan=${planId}`, demo: true })
  }

  try {
    // 1. Cria/atualiza cliente na AbacatePay
    const { data: custRes } = await abacate.post('/customers/create', {
      email,
      name: name || email,
      metadata: { userId },
    })
    const customer = custRes.data
    console.log('[Billing] Cliente AbacatePay:', customer.id)

    // 2. Garante produto mensal existente
    const product = await ensureProduct(planId)
    console.log('[Billing] Produto:', product.id, product.externalId)

    // 3. Cria assinatura
    const origin = process.env.APP_URL || 'http://localhost:3001'
    const { data: subRes } = await abacate.post('/subscriptions/create', {
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
      returnUrl: `${origin}/plans?success=true&plan=${planId}`,
      completionUrl: `${origin}/plans?success=true&plan=${planId}`,
      metadata: { userId, planId },
    })
    const subscription = subRes.data
    console.log('[Billing] Checkout criado:', subscription.id)

    // 4. Persiste referência no Supabase (tabela billing — opcional)
    if (isConfigured) {
      await supabase.from('billing').upsert(
        {
          user_id: userId,
          plan_id: planId,
          abacate_customer_id: customer.id,
          abacate_checkout_id: subscription.id,
          status: 'pending',
        },
        { onConflict: 'user_id' }
      ).catch(() => {}) // tabela opcional; não quebra se não existir
    }

    res.json({ url: subscription.url })
  } catch (err) {
    const msg = err.response?.data?.error || err.message
    console.error('[Billing] Erro checkout:', msg)
    res.status(500).json({ error: msg })
  }
})

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/billing/cancel  — protegido por JWT
   Body: { userId }
───────────────────────────────────────────────────────────────────────── */
router.post('/cancel', async (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' })

  try {
    if (abacate && isConfigured) {
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
   Retorna o plano atual + se a chave AbacatePay está configurada
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
