const MODEL_MAP = {
  'OpenAI GPT-4o-mini': 'gpt-4o-mini',
  'OpenAI GPT-4o':      'gpt-4o',
  'Claude Sonnet':      'claude-sonnet-4-20250514',
  'Claude Haiku':       'claude-haiku-4-5-20251001',
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

const safeFetch = async (url, opts, attempt = 1) => {
  const res = await fetch(url, opts)
  if (res.status === 429 && attempt === 1) {
    await sleep(1000)
    return safeFetch(url, opts, 2)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const msg = body?.error?.message ?? body?.error?.type ?? `HTTP ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    throw err
  }
  return res.json()
}

export class AIService {
  constructor(supabaseClient) {
    this.db = supabaseClient
  }

  async getApiKeys(userId) {
    const { data } = await this.db
      .from('settings')
      .select('openai_key, anthropic_key')
      .eq('user_id', userId)
      .maybeSingle()
    return data ?? {}
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

  /* Chama a IA com fallback automático: tenta o provedor pedido e, se ele
     falhar (quota/erro/timeout), cai no outro provedor configurado.
     Cenário real: OpenAI sem créditos → responde com o Claude sozinho.
     Nunca lança — devolve { success, response } ou { success:false, error }. */
  async chat({ provider, systemPrompt, userMessage, temperature, maxTokens, userId, conversationHistory = [] }) {
    const keys = await this.getApiKeys(userId)
    const requested = provider ?? 'OpenAI GPT-4o-mini'
    const reqIsClaude = requested.startsWith('Claude')

    // Ordem de tentativa: provedor pedido primeiro, o outro como fallback.
    const attempts = []
    const addOpenAI = (p) => { if (keys.openai_key) attempts.push({ kind: 'openai', provider: p, apiKey: keys.openai_key }) }
    const addClaude = (p) => { if (keys.anthropic_key) attempts.push({ kind: 'claude', provider: p, apiKey: keys.anthropic_key }) }

    if (reqIsClaude) { addClaude(requested); addOpenAI('OpenAI GPT-4o-mini') }
    else { addOpenAI(requested.startsWith('OpenAI') ? requested : 'OpenAI GPT-4o-mini'); addClaude('Claude Sonnet') }

    if (attempts.length === 0) {
      return { success: false, error: 'Configure uma chave de IA (OpenAI ou Anthropic) em Configurações → API & Webhooks' }
    }

    let lastError = 'IA indisponível'
    for (let i = 0; i < attempts.length; i++) {
      const a = attempts[i]
      const isLast = i === attempts.length - 1
      const t0 = Date.now()
      try {
        const args = { provider: a.provider, systemPrompt, userMessage, temperature, maxTokens, apiKey: a.apiKey, conversationHistory, t0 }
        const res = a.kind === 'openai' ? await this._openai(args) : await this._claude(args)
        if (res?.response) return res
        lastError = 'Resposta vazia da IA'
      } catch (e) {
        lastError = e.message
        console.warn(`[AI] ${a.kind} falhou: ${e.message}${isLast ? '' : ' — tentando fallback...'}`)
      }
    }
    console.warn('[AI] Todos os provedores falharam:', lastError)
    return { success: false, error: lastError }
  }

  async _openai({ provider, systemPrompt, userMessage, temperature, maxTokens, apiKey, conversationHistory, t0 }) {
    const model    = MODEL_MAP[provider] ?? 'gpt-4o-mini'
    const temp     = Math.min(Math.max(Number(temperature) || 0.7, 0), 1)
    const maxTok   = Math.min(Number(maxTokens) || 500, 4096)
    const history  = conversationHistory.slice(-10).map(m => ({
      role:    m.direction === 'outbound' ? 'assistant' : 'user',
      content: m.content,
    }))
    const messages = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...history,
      { role: 'user', content: userMessage },
    ]

    const data = await safeFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: temp, max_tokens: maxTok }),
    })

    const response = data?.choices?.[0]?.message?.content?.trim() ?? ''
    const tokens   = data?.usage?.total_tokens ?? 0
    console.log(`[AI] Provider: ${model} | Tokens: ${tokens} | Response time: ${Date.now() - t0}ms`)
    return { success: true, response }
  }

  async _claude({ provider, systemPrompt, userMessage, temperature, maxTokens, apiKey, conversationHistory, t0 }) {
    const model   = MODEL_MAP[provider] ?? 'claude-haiku-4-5-20251001'
    const temp    = Math.min(Math.max(Number(temperature) || 0.7, 0), 1)
    const maxTok  = Math.min(Number(maxTokens) || 500, 4096)
    const history = conversationHistory.slice(-10).map(m => ({
      role:    m.direction === 'outbound' ? 'assistant' : 'user',
      content: m.content,
    }))
    const messages = [...history, { role: 'user', content: userMessage }]

    const body = { model, messages, temperature: temp, max_tokens: maxTok }
    if (systemPrompt) body.system = systemPrompt

    const data = await safeFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Necessário p/ chamar a API da Anthropic direto do navegador (senão CORS bloqueia).
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })

    const response   = data?.content?.[0]?.text?.trim() ?? ''
    const inputTok   = data?.usage?.input_tokens  ?? 0
    const outputTok  = data?.usage?.output_tokens ?? 0
    console.log(`[AI] Provider: ${model} | Tokens: ${inputTok + outputTok} | Response time: ${Date.now() - t0}ms`)
    return { success: true, response }
  }
}
