// Serviço de uso / limites de plano. SQL da tabela: supabase/usage_table.sql
import { supabase } from '@/lib/supabase'

// Limite de mensagens por plano (-1 = ilimitado)
export const PLANS = { free: 50, starter: 1000, pro: 10000, enterprise: -1 }

// Modo demonstração: sem sessão Supabase, persistimos o uso em localStorage.
const DEMO_ID = 'demo-user'
const DEMO_KEY = 'riseflow_demo_usage'
const DEMO_DEFAULT = { user_id: DEMO_ID, plan: 'free', messages_sent: 0, messages_limit: 50 }
const readDemo = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || DEMO_DEFAULT } catch { return DEMO_DEFAULT } }
const writeDemo = (u) => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(u)) } catch {} }

export const usageService = {
  isDemo: (userId) => userId === DEMO_ID,
  setDemoUsage: (u) => writeDemo(u),

  // Busca o registro do usuário; cria com defaults se ainda não existir.
  getUsage: async (userId) => {
    if (userId === DEMO_ID) return readDemo()
    const { data, error } = await supabase.from('usage').select('*').eq('user_id', userId).maybeSingle()
    if (error) throw error
    if (data) return data
    const { data: created, error: insErr } = await supabase
      .from('usage').insert({ user_id: userId }).select().single()
    if (insErr) throw insErr
    return created
  },

  canSend: async (userId) => {
    const usage = await usageService.getUsage(userId)
    return usage.messages_limit === -1 || usage.messages_sent < usage.messages_limit
  },

  increment: async (userId) => {
    const usage = await usageService.getUsage(userId)
    const sent = usage.messages_sent + 1
    if (userId === DEMO_ID) { writeDemo({ ...usage, messages_sent: sent }); return sent }
    const { error } = await supabase.from('usage').update({ messages_sent: sent }).eq('user_id', userId)
    if (error) throw error
    return sent
  },

  getRemainingMessages: async (userId) => {
    const usage = await usageService.getUsage(userId)
    return usage.messages_limit === -1 ? Infinity : usage.messages_limit - usage.messages_sent
  },

  // Atualiza plano e o limite de mensagens correspondente.
  upgradePlan: async (userId, plan) => {
    const limit = PLANS[plan]
    if (limit === undefined) throw new Error(`Plano inválido: ${plan}`)
    const { error } = await supabase.from('usage').update({ plan, messages_limit: limit }).eq('user_id', userId)
    if (error) throw error
  },
}
