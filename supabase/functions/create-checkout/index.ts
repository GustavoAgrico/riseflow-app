// Supabase Edge Function: create-checkout
// Cria uma sessão de Stripe Checkout (mode: subscription) para o plano escolhido.
// Deploy: supabase functions deploy create-checkout
// Env: STRIPE_SECRET_KEY
import Stripe from 'https://esm.sh/stripe@14'

const PRICE_IDS: Record<string, string> = {
  starter: 'price_starter_id',
  pro: 'price_pro_id',
  enterprise: 'price_enterprise_id',
}

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' })
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { userId, planId, successUrl, cancelUrl } = await req.json()
    const price = PRICE_IDS[planId]
    if (!userId || !price) return new Response(JSON.stringify({ error: 'Parâmetros inválidos' }), { status: 400, headers: cors })

    // Busca um customer existente pelo metadata, senão cria um novo.
    const found = await stripe.customers.search({ query: `metadata['supabase_user_id']:'${userId}'` })
    const customer = found.data[0] ?? await stripe.customers.create({ metadata: { supabase_user_id: userId } })

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: { supabase_user_id: userId, plan: planId },
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: cors })
  }
})
