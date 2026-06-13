// IA de atendimento personalizado para o Chat.
// Reaproveita o AIService (chaves OpenAI/Anthropic em settings) e o niche_config
// (nicho, cliente ideal, provider) — a MESMA fonte que já personaliza a qualificação.
// Sem schema novo: tudo lido de tabelas que já existem.
import { supabase } from '@/lib/supabase'
import { AIService } from '@/services/aiService'

const ai = new AIService(supabase)

/* Contexto do negócio (nicho) — opcional; se não houver, a IA usa um tom genérico. */
const getNiche = async (userId) => {
  const { data } = await supabase.from('niche_config').select('*').eq('user_id', userId).maybeSingle()
  return data ?? null
}

/* Dados do lead no CRM (nome/empresa/tags) para tratar o cliente pelo nome. */
const getContact = async (phone) => {
  const { data } = await supabase.from('clients').select('name, company, tags').eq('phone', phone).maybeSingle()
  return data ?? null
}

/* Monta a "personalidade" do atendente a partir do nicho + dados do contato. */
const buildSystemPrompt = (niche, contact) => [
  'Você é um atendente de WhatsApp profissional, simpático e prestativo' +
    (niche?.niche ? ` de uma empresa do ramo de ${niche.niche}.` : '.'),
  niche?.ideal_customer ? `Perfil de cliente do negócio: ${niche.ideal_customer}.` : '',
  contact?.name ? `Nome do cliente: ${contact.name}. Trate-o pelo nome quando fizer sentido.` : '',
  contact?.company ? `Empresa do cliente: ${contact.company}.` : '',
  'Responda SEMPRE em português do Brasil, de forma natural, calorosa e objetiva (2 a 5 frases).',
  'Use o histórico para dar continuidade e personalizar a conversa.',
  'Nunca invente preços, prazos, links ou políticas que não foram informados; se não souber, ofereça encaminhar a um atendente humano.',
  'Não use rótulos como "Atendente:" nem aspas. Escreva apenas o texto que será enviado ao cliente.',
].filter(Boolean).join('\n')

/* Gera uma resposta de atendimento personalizada para o contato.
   Retorna { success, response } ou { success:false, error }. */
export const generateReply = async (userId, contactPhone, { contactName } = {}) => {
  if (!userId || !contactPhone) return { success: false, error: 'Conversa inválida.' }
  const phone = String(contactPhone).replace(/\D/g, '')

  const [niche, contact] = await Promise.all([getNiche(userId), getContact(phone)])
  const systemPrompt = buildSystemPrompt(niche, { ...(contact ?? {}), name: contact?.name ?? contactName })

  const history = await ai.getConversationHistory(phone, 12)
  const lastInbound = [...history].reverse().find(m => m.direction === 'inbound')
  const userMessage = lastInbound?.content
    ? `Última mensagem do cliente: "${lastInbound.content}". Escreva a melhor resposta de atendimento.`
    : 'Inicie o atendimento de forma proativa, simpática e personalizada.'

  const provider = niche?.provider ?? 'OpenAI GPT-4o-mini'
  console.log('[AtendIA] Gerando resposta:', { phone, provider, hist: history.length })
  return ai.chat({ provider, systemPrompt, userMessage, userId, temperature: 0.6, maxTokens: 350, conversationHistory: history })
}
