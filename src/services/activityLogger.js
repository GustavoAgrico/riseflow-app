import { supabase } from '@/lib/supabase'

// Logger de atividades — fire-and-forget. Nunca deve quebrar a ação principal.
export const logger = {
  async log(userId, action, details = {}) {
    try {
      if (!userId) {
        const { data } = await supabase.auth.getUser()
        userId = data?.user?.id
      }
      if (!userId) return
      await supabase.from('activity_logs').insert({
        user_id: userId,
        action,
        category: details.category || 'system',
        description: details.description || '',
        metadata: details.metadata || {},
        ip: details.ip || null,
        page: typeof window !== 'undefined' ? window.location.pathname : null,
      })
    } catch (e) { console.log('[Logger] Erro:', e.message) }
  },

  async getLogs(userId, { category, limit = 50, offset = 0, dateFrom, dateTo } = {}) {
    let query = supabase.from('activity_logs').select('*', { count: 'exact' }).eq('user_id', userId).order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    if (category && category !== 'all') query = query.eq('category', category)
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo) query = query.lte('created_at', dateTo)
    const { data, count } = await query
    return { logs: data || [], total: count || 0 }
  },

  async clearLogs(userId, olderThanDays = 90) {
    const date = new Date(Date.now() - olderThanDays * 86400000).toISOString()
    await supabase.from('activity_logs').delete().eq('user_id', userId).lt('created_at', date)
  },
}
