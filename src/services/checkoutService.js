import { supabase } from '@/lib/supabase'
import { usageService } from '@services/usageService'

// Planos (price em centavos). limit = mensagens/mês.
const PLANS = {
  starter:    { name: 'Starter',    price: 6700,  priceId: 'price_starter',    limit: 1000 },
  pro:        { name: 'Pro',        price: 19700, priceId: 'price_pro',        limit: 10000 },
  enterprise: { name: 'Enterprise', price: 49700, priceId: 'price_enterprise', limit: 999999 },
}

export const checkoutService = {
  PLANS,

  // `user` vem do useAuth() (fonte de verdade do app — funciona em modo demo e real).
  async checkout(planId, user) {
    console.log('[Checkout] Iniciando...', planId)
    if (!user?.id) { window.location.href = '/login'; return }
    const plan = PLANS[planId]

    // Usuário real: tenta criar a sessão Stripe via Edge Function.
    if (!usageService.isDemo(user.id)) {
      try {
        const { data, error } = await supabase.functions.invoke('create-checkout', {
          body: { userId: user.id, email: user.email, planId, priceId: plan.priceId,
            successUrl: `${window.location.origin}/plans?success=true&plan=${planId}`,
            cancelUrl: `${window.location.origin}/plans?canceled=true` },
        })
        if (error) throw error
        if (data?.url) { console.log('[Checkout] Redirecionando para Stripe'); window.location.href = data.url; return }
      } catch { console.log('[Checkout] Edge Function indisponível, usando fallback demo') }
    }

    // Fallback / modo demo: ativa o plano direto após confirmação.
    if (window.confirm(`Ativar plano ${plan.name} por R$ ${(plan.price / 100).toFixed(2)}/mês?\n\n(Modo demonstração — em produção será redirecionado para pagamento Stripe)`)) {
      await this.activatePlan(user.id, planId)
      window.location.href = `/plans?success=true&plan=${planId}`
    }
  },

  async activatePlan(userId, planId) {
    const plan = PLANS[planId]
    if (usageService.isDemo(userId)) {
      usageService.setDemoUsage({ user_id: userId, plan: planId, messages_sent: 0, messages_limit: plan.limit })
      console.log('[Checkout] Plano ativado (demo):', planId)
      return
    }
    const { error } = await supabase.from('usage').upsert(
      { user_id: userId, plan: planId, messages_sent: 0, messages_limit: plan.limit }, { onConflict: 'user_id' })
    if (error) console.error('[Checkout] Erro ao ativar plano:', error)
    else console.log('[Checkout] Plano ativado:', planId)
  },

  async handleReturn(user) {
    const p = new URLSearchParams(window.location.search)
    if (p.get('success') === 'true' && p.get('plan')) {
      if (user?.id) await this.activatePlan(user.id, p.get('plan'))
      window.history.replaceState({}, '', '/plans')
      return { status: 'success', plan: p.get('plan') }
    }
    if (p.get('canceled') === 'true') { window.history.replaceState({}, '', '/plans'); return { status: 'canceled' } }
    return { status: 'none' }
  },
}
