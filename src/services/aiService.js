// A chamada ao provedor de IA (OpenAI/Anthropic) roda no SERVIDOR (POST /api/ai/chat).
// As chaves do dono nunca chegam ao navegador — antes elas eram lidas do Supabase e
// usadas em fetch direto daqui (com o header 'anthropic-dangerous-direct-browser-access'),
// expondo a chave no DevTools. Agora o cliente só monta o payload; o backend lê a chave
// em `settings` via service-role e devolve apenas o texto.
import api from '@/services/api'

export class AIService {
  constructor(supabaseClient) {
    this.db = supabaseClient
  }

  async getConversationHistory(contactPhone, limit = 10) {
    const { data: conv } = await this.db
      .from('conversations')
      .select('id')
      .eq('contact_phone', contactPhone)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!conv?.id) return []

    const { data: msgs } = await this.db
      .from('messages')
      .select('content, direction, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    return (msgs ?? []).reverse()
  }

  /* Histórico unificado do contato em TODOS os canais (WhatsApp, Instagram, Facebook).
     Junta mensagens de todas as conversas com o mesmo identificador e marca o canal. */
  async getContactHistory(contactPhone, limit = 20) {
    const { data: convs } = await this.db
      .from('conversations')
      .select('id, contact_channel')
      .eq('contact_phone', contactPhone)
    if (!convs?.length) return []
    const ids = convs.map(c => c.id)
    const chMap = Object.fromEntries(convs.map(c => [c.id, c.contact_channel ?? 'whatsapp']))
    const { data: msgs } = await this.db
      .from('messages')
      .select('content, direction, created_at, conversation_id')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
      .limit(limit)
    return (msgs ?? []).reverse().map(m => ({ ...m, channel: chMap[m.conversation_id] }))
  }

  /* Chama a IA pelo proxy do servidor (POST /api/ai/chat). O backend resolve o
     dono pelo JWT, lê a chave em `settings` e aplica o fallback OpenAI↔Claude —
     nada de chave no navegador. `userId` no argumento é ignorado (o servidor não
     confia no body); mantido na assinatura só para não quebrar os chamadores.
     Nunca lança — devolve { success, response } ou { success:false, error }. */
  async chat({ provider, systemPrompt, userMessage, temperature, maxTokens, conversationHistory = [] }) {
    try {
      const { data } = await api.post(
        '/ai/chat',
        { provider, systemPrompt, userMessage, temperature, maxTokens, conversationHistory },
        { timeout: 60_000 } // LLM pode passar do timeout padrão (10s) do axios
      )
      return data // { success, response } | { success:false, error }
    } catch (e) {
      const msg = e?.response?.data?.error ?? e?.message ?? 'IA indisponível'
      console.warn('[AI] proxy falhou:', msg)
      return { success: false, error: msg }
    }
  }
}
