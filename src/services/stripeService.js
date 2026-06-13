/*
 * Stripe Checkout integration (via Supabase Edge Functions).
 *
 * SETUP:
 *  - Configurar STRIPE_SECRET_KEY nas env vars do Supabase (supabase secrets set STRIPE_SECRET_KEY=sk_...).
 *  - Configurar webhook do Stripe para o endpoint /functions/v1/stripe-webhook.
 *  - Events: checkout.session.completed → atualizar `plan` na tabela `usage`.
 *  - Substituir os price IDs placeholder pelos reais do dashboard Stripe.
 */

export const PRICE_IDS = {
  starter: 'price_starter_id',
  pro: 'price_pro_id',
  enterprise: 'price_enterprise_id',
}

export class StripeService {
  constructor(supabaseClient) { this.db = supabaseClient }

  async createCheckoutSession(userId, planId) {
    const { data, error } = await this.db.functions.invoke('create-checkout', {
      body: {
        userId,
        planId,
        successUrl: window.location.origin + '/plans?success=true',
        cancelUrl: window.location.origin + '/plans?canceled=true',
      },
    })
    if (error) throw error
    if (data?.url) window.location.href = data.url
    return { url: data?.url }
  }

  async getPortalUrl(userId) {
    const { data, error } = await this.db.functions.invoke('customer-portal', {
      body: { userId, returnUrl: window.location.origin + '/plans' },
    })
    if (error) throw error
    if (data?.url) window.location.href = data.url
    return data?.url
  }
}
