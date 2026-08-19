// Proxy de IA do servidor: executa a chamada ao provedor (OpenAI/Anthropic) SEM
// jamais entregar a chave ao navegador. As chaves vivem na tabela `settings` do
// dono e são lidas aqui com a service-role key. É o backend do endpoint
// POST /api/ai/chat, que substitui o antigo caminho client-side (aiService.js),
// onde a chave do tenant era carregada no browser e usada em fetch direto —
// visível no DevTools e marcado pela própria Anthropic como "dangerous".
//
// Contrato idêntico ao antigo aiService.chat() do frontend para o swap ser
// transparente: mesmo MODEL_MAP, mesma ordem de fallback, mesmo retorno
// { success, response } | { success:false, error }. Nunca lança.
const axios = require('axios')
const { supabase, isConfigured } = require('./supabaseClient')

const MODEL_MAP = {
  'OpenAI GPT-4o-mini': 'gpt-4o-mini',
  'OpenAI GPT-4o':      'gpt-4o',
  'Claude Sonnet':      'claude-sonnet-4-20250514',
  'Claude Haiku':       'claude-haiku-4-5-20251001',
}

async function getApiKeys(userId) {
  if (!isConfigured || !userId) return {}
  const { data } = await supabase
    .from('settings')
    .select('openai_key, anthropic_key')
    .eq('user_id', userId)
    .maybeSingle()
  return data ?? {}
}

const clampTemp = (t) => Math.min(Math.max(Number(t) || 0.7, 0), 1)
const clampTok  = (t) => Math.min(Number(t) || 500, 4096)

// Mapeia o histórico do CRM (direction inbound/outbound) para o formato de chat.
function toChatHistory(conversationHistory = []) {
  return conversationHistory.slice(-10).map((m) => ({
    role: (m.direction === 'outbound' || m.direction === 'sent') ? 'assistant' : 'user',
    content: m.content,
  }))
}

async function callOpenAI({ provider, systemPrompt, userMessage, temperature, maxTokens, apiKey, conversationHistory }) {
  const model = MODEL_MAP[provider] ?? 'gpt-4o-mini'
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...toChatHistory(conversationHistory),
    { role: 'user', content: userMessage },
  ]
  const { data } = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    { model, messages, temperature: clampTemp(temperature), max_tokens: clampTok(maxTokens) },
    { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 45_000 }
  )
  return data?.choices?.[0]?.message?.content?.trim() ?? ''
}

async function callClaude({ provider, systemPrompt, userMessage, temperature, maxTokens, apiKey, conversationHistory }) {
  const model = MODEL_MAP[provider] ?? 'claude-haiku-4-5-20251001'
  const body = {
    model,
    messages: [...toChatHistory(conversationHistory), { role: 'user', content: userMessage }],
    temperature: clampTemp(temperature),
    max_tokens: clampTok(maxTokens),
  }
  if (systemPrompt) body.system = systemPrompt
  // No servidor NÃO usamos 'anthropic-dangerous-direct-browser-access' — esse
  // header só existe para contornar o CORS quando a chamada parte do navegador.
  const { data } = await axios.post('https://api.anthropic.com/v1/messages', body, {
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    timeout: 45_000,
  })
  return data?.content?.[0]?.text?.trim() ?? ''
}

/* Chama a IA com fallback automático: tenta o provedor pedido e, se falhar
   (quota/erro/timeout), cai no outro provedor configurado. Nunca lança —
   devolve { success, response } ou { success:false, error }. */
async function chatComplete({ userId, provider, systemPrompt, userMessage, temperature, maxTokens, conversationHistory = [] }) {
  const keys = await getApiKeys(userId)
  const requested = provider ?? 'OpenAI GPT-4o-mini'
  const reqIsClaude = requested.startsWith('Claude')

  const attempts = []
  const addOpenAI = (p) => { if (keys.openai_key)    attempts.push({ kind: 'openai', provider: p, apiKey: keys.openai_key }) }
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
      const args = { provider: a.provider, systemPrompt, userMessage, temperature, maxTokens, apiKey: a.apiKey, conversationHistory }
      const response = a.kind === 'openai' ? await callOpenAI(args) : await callClaude(args)
      if (response) {
        console.log(`[ai] ${a.kind}/${a.provider} ok | ${Date.now() - t0}ms`)
        return { success: true, response }
      }
      lastError = 'Resposta vazia da IA'
    } catch (e) {
      lastError = e.response?.data?.error?.message ?? e.message
      console.warn(`[ai] ${a.kind} falhou: ${lastError}${isLast ? '' : ' — tentando fallback...'}`)
    }
  }
  console.warn('[ai] todos os provedores falharam:', lastError)
  return { success: false, error: lastError }
}

module.exports = { chatComplete }
