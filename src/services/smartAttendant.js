// Atendimento Inteligente: responde mensagens do cliente usando a config do usuário
// (attendant_config) + base de conhecimento (knowledge_base). Reaproveita o AIService
// — fallback OpenAI→Claude e o header anti-CORS já estão lá.
import { supabase } from '@/lib/supabase'
import { AIService } from '@/services/aiService'

const ai = new AIService(supabase)

const buildSystemPrompt = (config, faqs, historyText, contactName) => {
  const faqText = (faqs || []).map(f => `P: ${f.question}\nR: ${f.answer}`).join('\n\n')
  return `${config.personality || 'Você é um atendente profissional e simpático.'}

REGRAS:
- Nome da empresa: ${config.company_name || 'nossa empresa'}
- Horário de atendimento: ${config.business_hours || '08:00-18:00 Seg-Sex'}
- ${config.custom_rules || ''}
- Se não souber responder, diga que vai transferir para um atendente humano
- Respostas curtas e objetivas (máximo 3 frases)
- Use emojis com moderação
- Nunca invente informações sobre produtos/preços
- Se o cliente pedir para falar com humano, responda exatamente: [TRANSFERIR]

BASE DE CONHECIMENTO:
${faqText || 'Nenhuma FAQ cadastrada ainda.'}

HISTÓRICO DA CONVERSA:
${historyText || '(sem histórico)'}

Cliente se chama: ${contactName || 'Cliente'}`
}

export const smartAttendant = {
  // Retorna { text, action: 'reply' | 'transfer' } ou null (IA desligada/indisponível).
  async respond(userId, phone, customerMessage, contactName) {
    if (!userId || !phone) return null

    const { data: config } = await supabase
      .from('attendant_config').select('*').eq('user_id', userId).maybeSingle()
    if (!config || !config.enabled) return null

    const { data: history } = await supabase.from('messages')
      .select('content, direction')
      .eq('contact_phone', phone)
      .order('created_at', { ascending: false })
      .limit(10)
    const historyText = (history || []).reverse()
      .map(m => `${(m.direction === 'outbound' || m.direction === 'sent') ? 'Atendente' : 'Cliente'}: ${m.content}`).join('\n')

    const { data: faqs } = await supabase
      .from('knowledge_base').select('question, answer').eq('user_id', userId).limit(20)

    const systemPrompt = buildSystemPrompt(config, faqs, historyText, contactName)

    console.log('[Attendant] Gerando resposta para', phone)
    const r = await ai.chat({
      provider: 'OpenAI GPT-4o-mini', systemPrompt, userMessage: customerMessage,
      userId, temperature: 0.7, maxTokens: 300,
    })
    if (!r.success || !r.response) {
      console.warn('[Attendant] IA indisponível:', r.error)
      return null
    }

    if (r.response.includes('[TRANSFERIR]')) {
      console.log('[Attendant] Transferindo para humano:', phone)
      return { text: 'Vou transferir você para um atendente humano. Um momento! 🙏', action: 'transfer' }
    }
    return { text: r.response, action: 'reply' }
  },
}
