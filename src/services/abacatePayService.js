// Serviço de checkout via AbacatePay.
// O frontend nunca fala com a AbacatePay diretamente — tudo passa pelo proxy (server/).
import { api } from '@services/api'
import { supabase } from '@/lib/supabase'
import { usageService } from '@services/usageService'

// Planos: mesmos valores do backend (billing.js). Usado só para exibição.
export const ABACATE_PLANS = {
  starter:    { name: 'Starter',    price: 6700,  limit: 1000  },
  pro:        { name: 'Pro',        price: 19700, limit: 10000 },
  enterprise: { name: 'Enterprise', price: 49700, limit: -1    },
}

export const abacatePayService = {
  // Inicia o checkout: redireciona para a página hospedada da AbacatePay.
  async checkout(planId, user, { cpf, phone } = {}) {
    if (!user?.id) { window.location.href = '/login'; return }
    if (!ABACATE_PLANS[planId]) throw new Error(`Plano inválido: ${planId}`)

    try {
      const { data } = await api.post('/billing/checkout', {
        planId,
        userId: user.id,
        email: user.email,
        name: user.user_metadata?.full_name ?? user.email,
        cpf,
        phone,
      })

      if (data?.admin || data?.demo) {
        // Bypass admin ou dev mode: plano já ativado no servidor, recarrega a tela
        console.log('[AbacatePay] Plano ativado diretamente (admin/demo):', planId)
        window.location.href = `/plans?success=true&plan=${planId}`
        return
      }
      if (data?.url) {
        console.log('[AbacatePay] Redirecionando para checkout:', data.url)
        window.location.href = data.url
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      console.error('[AbacatePay] Erro no checkout:', msg)
      throw new Error(msg)
    }
  },

  // Cancela a assinatura ativa do usuário.
  async cancel(userId) {
    const { data } = await api.post('/billing/cancel', { userId })
    return data
  },

  // Lida com o retorno da URL de sucesso (?success=true&plan=xxx) ou cancelamento.
  async handleReturn(user) {
    const p = new URLSearchParams(window.location.search)
    if (p.get('success') === 'true' && p.get('plan')) {
      const planId = p.get('plan')
      // O webhook já atualizou o Supabase; aqui apenas garantimos o estado local.
      if (user?.id && !usageService.isDemo(user.id)) {
        const plan = ABACATE_PLANS[planId]
        if (plan) {
          await supabase.from('usage').upsert(
            { user_id: user.id, plan: planId, messages_limit: plan.limit },
            { onConflict: 'user_id' }
          ).catch(() => {})
        }
      }
      // Preserva o history.state do React Router (idx/key) — passar {} corromperia
      // a navegação do SPA. Só limpamos a query (?success) da URL.
      window.history.replaceState(window.history.state, '', '/plans')
      return { status: 'success', plan: planId }
    }
    if (p.get('canceled') === 'true') {
      window.history.replaceState(window.history.state, '', '/plans')
      return { status: 'canceled' }
    }
    return { status: 'none' }
  },
}
