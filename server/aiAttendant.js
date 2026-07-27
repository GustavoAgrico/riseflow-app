// Atendimento Inteligente (IA) — roda LOCALMENTE no proxy, junto do motor de
// funis. A Edge Function da nuvem tinha a mesma lógica, mas não alcança o
// Baileys em localhost; quem responde de verdade é este módulo.
//
// Chamado pelo webhook ANTES dos funis: se a IA responder, os funis não rodam
// para esta mensagem (evita resposta dupla). Exceções em que a IA cede:
//   - contato no meio de um funil aguardando resposta (o funil retoma);
//   - conversa marcada como waiting_human (humano assumiu — IA fica quieta).
//
// Config: tabela attendant_config (página /smart-attendant). FAQ: knowledge_base.
// API keys: tabela settings (gemini_key / groq_key / openai_key / anthropic_key) do dono da config.
const axios = require('axios')
const { supabase, isConfigured } = require('./supabaseClient')
const { sendText, getWaitingExecution, hasMatchingFlow } = require('./flowEngine')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const jidToNumber = (jid) => String(jid || '').split('@')[0].split(':')[0]

/* Anti-loop: nº de respostas automáticas por contato (em memória).
   Zera após 6h sem respostas — uma conversa nova no dia seguinte recomeça. */
const autoCount = new Map() // phone -> { count, last }
const COUNT_RESET_MS = 6 * 60 * 60 * 1000

function countFor(phone) {
  const e = autoCount.get(phone)
  return e && Date.now() - e.last < COUNT_RESET_MS ? e.count : 0
}
function bump(phone) {
  autoCount.set(phone, { count: countFor(phone) + 1, last: Date.now() })
}

function buildSystemPrompt(config, faqs, historyText, contactName) {
  const faqText = (faqs || []).map((f) => `P: ${f.question}\nR: ${f.answer}`).join('\n\n')
  const noAnswer = config.no_answer_action === 'check'
    ? '- Se não souber responder, diga que vai verificar a informação e retorna em breve'
    : '- Se não souber responder, responda exatamente: [TRANSFERIR]'
  return `${config.personality || 'Você é um atendente profissional e simpático.'}

REGRAS:
- Nome da empresa: ${config.company_name || 'nossa empresa'}
- Horário de atendimento: ${config.business_hours || '08:00-18:00 Seg-Sex'}
- ${config.custom_rules || ''}
${noAnswer}
- Se o cliente pedir para falar com humano/atendente, responda exatamente: [TRANSFERIR]
- Respostas curtas e objetivas (máximo 3 frases)
- Use emojis com moderação
- Nunca invente informações, preços ou produtos que não estão na base de conhecimento

BASE DE CONHECIMENTO:
${faqText || 'Nenhuma FAQ cadastrada ainda.'}

HISTÓRICO DA CONVERSA:
${historyText || '(sem histórico)'}

Cliente se chama: ${contactName || 'Cliente'}`
}

// Google Gemini — tier gratuito. (gemini-2.0-flash ficou com cota zero no free
// tier em 2026; o 2.5-flash é o que tem free tier ativo nas chaves novas.)
async function askGemini(key, systemPrompt, userMessage) {
  if (!key) return null
  try {
    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        contents: [{ parts: [{ text: `${systemPrompt}\n\nMensagem do cliente: ${userMessage}` }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30_000 }
    )
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null
  } catch (e) {
    console.warn('[IA] Gemini falhou:', e.response?.data?.error?.message ?? e.message)
    return null
  }
}

// Groq — tier gratuito, Llama 3.3 70B (API compatível com OpenAI).
async function askGroq(key, systemPrompt, userMessage) {
  if (!key) return null
  try {
    const { data } = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 300,
      temperature: 0.7,
    }, { headers: { Authorization: `Bearer ${key}` }, timeout: 30_000 })
    return data.choices?.[0]?.message?.content ?? null
  } catch (e) {
    console.warn('[IA] Groq falhou:', e.response?.data?.error?.message ?? e.message)
    return null
  }
}

async function askOpenAI(key, systemPrompt, userMessage) {
  if (!key) return null
  try {
    const { data } = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 300,
      temperature: 0.7,
    }, { headers: { Authorization: `Bearer ${key}` }, timeout: 30_000 })
    return data.choices?.[0]?.message?.content ?? null
  } catch (e) {
    console.warn('[IA] OpenAI falhou:', e.response?.data?.error?.message ?? e.message)
    return null
  }
}

async function askClaude(key, systemPrompt, userMessage) {
  if (!key) return null
  try {
    const { data } = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 300,
    }, {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      timeout: 30_000,
    })
    return data.content?.[0]?.text ?? null
  } catch (e) {
    console.warn('[IA] Claude falhou:', e.response?.data?.error?.message ?? e.message)
    return null
  }
}

/* Entrada principal. Retorna true se a IA respondeu (webhook então pula os funis). */
async function aiRespond({ jid, text, pushName, fromMe }) {
  if (!isConfigured || fromMe || !jid || !text) return false

  try {
    // Config habilitada (single-tenant: a primeira; userId = dono da config).
    const { data: config } = await supabase
      .from('attendant_config').select('*').eq('enabled', true)
      .limit(1).maybeSingle()
    if (!config) return false
    const userId = config.user_id
    const phone = jidToNumber(jid)

    if (jid.endsWith('@g.us') && !config.respond_groups) return false

    // Funil pausado em "Aguardar resposta" tem prioridade sobre a IA.
    const waiting = await getWaitingExecution(jid)
    if (waiting) return false

    // Se algum funil ativo dispararia para esta mensagem (palavra-chave, primeiro
    // contato, horário), a IA cede — o engine de funis responde.
    if (await hasMatchingFlow(jid, text)) return false

    // Humano assumiu a conversa → IA não responde mais.
    const { data: conv } = await supabase.from('conversations')
      .select('id, status').eq('user_id', userId).eq('contact_phone', phone)
      .maybeSingle()
    if (conv?.status === 'waiting_human') return false

    const max = Number(config.max_auto_messages) || 10
    if (countFor(phone) >= max) {
      console.log('[IA] Limite de respostas automáticas atingido p/', phone)
      return false
    }

    // select('*'): não quebra enquanto gemini_key/groq_key não forem migradas no banco.
    const { data: settings } = await supabase.from('settings')
      .select('*').eq('user_id', userId).maybeSingle()
    if (!settings?.gemini_key && !settings?.groq_key && !settings?.openai_key && !settings?.anthropic_key) {
      console.log('[IA] Nenhuma API key configurada (Configurações → Integrações)')
      return false
    }

    // Histórico recente + FAQ → prompt.
    const { data: history } = await supabase.from('messages')
      .select('content, direction').eq('contact_phone', phone)
      .order('created_at', { ascending: false }).limit(10)
    const historyText = (history || []).reverse()
      .map((m) => `${m.direction === 'sent' ? 'Atendente' : 'Cliente'}: ${m.content}`)
      .join('\n')
    const { data: faqs } = await supabase.from('knowledge_base')
      .select('question, answer').eq('user_id', userId).limit(20)

    const systemPrompt = buildSystemPrompt(config, faqs, historyText, pushName || phone)

    // Gratuitos primeiro (Gemini → Groq), pagos como fallback (OpenAI → Claude).
    let response = await askGemini(settings.gemini_key, systemPrompt, text)
    if (!response) response = await askGroq(settings.groq_key, systemPrompt, text)
    if (!response) response = await askOpenAI(settings.openai_key, systemPrompt, text)
    if (!response) response = await askClaude(settings.anthropic_key, systemPrompt, text)
    if (!response) {
      console.log('[IA] Nenhuma resposta gerada (chave inválida/sem créditos) — funis seguem')
      return false
    }

    if (response.includes('[TRANSFERIR]')) {
      response = 'Vou transferir você para um atendente humano. Um momento, por favor! 🙏'
      console.log('[IA] 🔄 Transferindo para humano:', phone)
      if (conv?.id) {
        await supabase.from('conversations')
          .update({ status: 'waiting_human', updated_at: new Date().toISOString() })
          .eq('id', conv.id)
      }
    }

    // Delay natural (parecer humano digitando) + envio.
    // sendText (flowEngine) já espelha a mensagem em conversations/messages.
    const delay = Math.min(Number(config.response_delay) || 0, 60)
    if (delay > 0) await sleep(delay * 1000)
    await sendText({ jid, userId, pushName, contact: { name: pushName } }, response)
    bump(phone)
    console.log('[IA] 🤖 Respondeu:', response.slice(0, 60))
    return true
  } catch (e) {
    console.error('[IA] Erro:', e?.message ?? e)
    return false
  }
}

module.exports = { aiRespond }
