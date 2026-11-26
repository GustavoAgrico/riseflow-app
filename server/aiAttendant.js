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
const { pickGeminiModel, forgetGeminiModel } = require('./geminiModels')
const { parseActions, actionsPrompt } = require('./aiActionParser')
const aiActions = require('./aiActions')
const crm = require('./crmActions')

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

// Google Gemini — tier gratuito (chave do Google AI Studio). O modelo é o "flash" estável mais
// novo que a chave enxerga (geminiModels.js): nomes fixos quebram quando o Google aposenta um.
// Os modelos novos raciocinam antes de responder: +1024 tokens de folga para o raciocínio.
async function askGemini(key, systemPrompt, userMessage, maxTokens = 300) {
  if (!key) return null
  try {
    const model = await pickGeminiModel(key)
    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: maxTokens + 1024, temperature: 0.7 },
      },
      { params: { key }, headers: { 'Content-Type': 'application/json' }, timeout: 30_000 }
    )
    const text = (data.candidates?.[0]?.content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join('').trim()
    return text || null
  } catch (e) {
    if (e.response?.status === 404) forgetGeminiModel(key)
    console.warn('[IA] Gemini falhou:', e.response?.data?.error?.message ?? e.message)
    return null
  }
}

// Groq — tier gratuito (API compatível com OpenAI). O limite grátis é por modelo, então tenta
// três em sequência. O llama-3.3-70b-versatile saiu do Groq. Os gpt-oss raciocinam antes de
// responder: +300 tokens de folga para o raciocínio não comer a resposta.
const GROQ_MODELS = [
  { model: 'openai/gpt-oss-120b', reasoning_effort: 'low' },
  { model: 'qwen/qwen3.8-27b' },
  { model: 'openai/gpt-oss-20b', reasoning_effort: 'low' },
]
async function askGroq(key, systemPrompt, userMessage, maxTokens = 300) {
  if (!key) return null
  for (const opt of GROQ_MODELS) {
    try {
      const { data } = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        ...opt,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens + 300,
        temperature: 0.7,
      }, { headers: { Authorization: `Bearer ${key}` }, timeout: 30_000 })
      const text = data.choices?.[0]?.message?.content?.trim()
      if (text) return text
    } catch (e) {
      console.warn(`[IA] Groq ${opt.model} falhou:`, e.response?.data?.error?.message ?? e.message)
      if (e.response?.status === 401) return null // chave inválida: os outros modelos também falhariam
    }
  }
  return null
}

async function askOpenAI(key, systemPrompt, userMessage, maxTokens = 300) {
  if (!key) return null
  try {
    const { data } = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }, { headers: { Authorization: `Bearer ${key}` }, timeout: 30_000 })
    return data.choices?.[0]?.message?.content ?? null
  } catch (e) {
    console.warn('[IA] OpenAI falhou:', e.response?.data?.error?.message ?? e.message)
    return null
  }
}

async function askClaude(key, systemPrompt, userMessage, maxTokens = 300) {
  if (!key) return null
  try {
    const { data } = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: maxTokens,
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
async function aiRespond({ jid, text, pushName, fromMe, userId: ownerId }) {
  if (!isConfigured || fromMe || !jid || !text) return false

  try {
    // Config do atendente do DONO da mensagem (multi-tenant). Sem dono conhecido
    // (webhook legado da Evolution) cai na primeira habilitada (single-tenant).
    let q = supabase.from('attendant_config').select('*').eq('enabled', true)
    if (ownerId) q = q.eq('user_id', ownerId)
    const { data: config } = await q.limit(1).maybeSingle()
    if (!config) return false
    const userId = config.user_id
    const phone = jidToNumber(jid)

    if (jid.endsWith('@g.us') && !config.respond_groups) return false

    // Funil pausado em "Aguardar resposta" tem prioridade sobre a IA (escopado).
    const waiting = await getWaitingExecution(jid, userId)
    if (waiting) return false

    // Se algum funil ativo DESTE usuário dispararia para esta mensagem
    // (palavra-chave, primeiro contato, horário), a IA cede ao motor de funis.
    if (await hasMatchingFlow(jid, text, userId)) return false

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
    // direction pode vir como 'outbound'/'sent' (dados antigos) — trata os dois.
    const isOut = (d) => d === 'outbound' || d === 'sent'
    const historyText = (history || []).reverse()
      .map((m) => `${isOut(m.direction) ? 'Atendente' : 'Cliente'}: ${m.content}`)
      .join('\n')
    const { data: faqs } = await supabase.from('knowledge_base')
      .select('question, answer').eq('user_id', userId).limit(20)

    let systemPrompt = buildSystemPrompt(config, faqs, historyText, pushName || phone)

    // IA que age no CRM (attendant_config.ai_actions_mode): ensina os marcadores de ação.
    const actionsMode = aiActions.modeOf(config)
    let stages = null
    if (actionsMode !== 'off') {
      try { stages = await crm.getStages(userId) } catch { stages = crm.DEFAULT_STAGES }
      systemPrompt += '\n' + actionsPrompt({ stages, today: aiActions.todayBrt(), mode: actionsMode })
    }
    const maxTokens = actionsMode !== 'off' ? 450 : 300

    // Gratuitos primeiro (Gemini → Groq), pagos como fallback (OpenAI → Claude).
    let response = await askGemini(settings.gemini_key, systemPrompt, text, maxTokens)
    if (!response) response = await askGroq(settings.groq_key, systemPrompt, text, maxTokens)
    if (!response) response = await askOpenAI(settings.openai_key, systemPrompt, text, maxTokens)
    if (!response) response = await askClaude(settings.anthropic_key, systemPrompt, text, maxTokens)
    if (!response) {
      console.log('[IA] Nenhuma resposta gerada (chave inválida/sem créditos) — funis seguem')
      return false
    }

    // Tira os marcadores de ação SEMPRE (mesmo com ações desligadas) para o
    // contato nunca receber "[[ACAO ...]]".
    const parsed = parseActions(response)
    response = parsed.text

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
    if (response) {
      await sendText({ jid, userId, pushName, contact: { name: pushName } }, response)
      bump(phone)
      console.log('[IA] 🤖 Respondeu:', response.slice(0, 60))
    }

    // Ações no CRM depois da resposta (falhas ficam registradas em ai_actions).
    if (actionsMode !== 'off' && parsed.actions.length) {
      await aiActions.handleAiActions({
        userId, conversationId: conv?.id, who: { phone, name: pushName || null },
        actions: parsed.actions, config, stages,
      })
    }
    return Boolean(response) || parsed.actions.length > 0
  } catch (e) {
    console.error('[IA] Erro:', e?.message ?? e)
    return false
  }
}

/* Gera resposta de IA dentro de um nó de funil (actionAIReply).
   Diferente do aiRespond() que é o interceptador do webhook, esta função é
   chamada diretamente pelo flow engine como ação sequencial. */
async function generateFlowReply(ctx, nodeData = {}, vars = {}) {
  if (!isConfigured) return null
  const userId = ctx.userId
  if (!userId) return null

  try {
    const { data: settings } = await supabase.from('settings').select('*').eq('user_id', userId).maybeSingle()
    if (!settings) return null

    let systemPrompt = nodeData.instructions || ''
    if (nodeData.useSavedConfig) {
      const { data: config } = await supabase.from('attendant_config').select('*').eq('user_id', userId).eq('enabled', true).limit(1).maybeSingle()
      if (config) {
        const { data: faqs } = await supabase.from('knowledge_base').select('question, answer').eq('user_id', userId)
        systemPrompt = buildSystemPrompt(config, faqs, '', ctx.contact?.name || ctx.pushName || '')
      }
    }
    if (!systemPrompt) systemPrompt = 'Você é um assistente prestativo. Responda de forma breve e objetiva.'

    const userMessage = ctx.text || '(contato enviou mensagem vazia)'
    const maxTokens = Math.min(Number(nodeData.maxTokens) || 500, 2000)

    const keys = {
      gemini: settings.gemini_key,
      groq: settings.groq_key,
      openai: settings.openai_key,
      anthropic: settings.anthropic_key,
    }

    let response = null
    if (keys.gemini) response = await askGemini(keys.gemini, systemPrompt, userMessage)
    if (!response && keys.groq) response = await askGroq(keys.groq, systemPrompt, userMessage)
    if (!response && keys.openai) response = await askOpenAI(keys.openai, systemPrompt, userMessage)
    if (!response && keys.anthropic) response = await askClaude(keys.anthropic, systemPrompt, userMessage)

    return response ? response.trim().slice(0, maxTokens * 4) : null
  } catch (e) {
    console.warn('[IA] generateFlowReply falhou:', e?.message ?? e)
    return null
  }
}

module.exports = { aiRespond, generateFlowReply }
