const express = require('express')
const Anthropic = require('@anthropic-ai/sdk')
const { chatComplete } = require('../aiProvider')
const router = express.Router()

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Rate limiting em memória por usuário (evita drenagem de créditos). Cada bucket
// tem seu próprio limite: gerar mensagem de campanha é raro; o chat do atendente/
// simulador/qualificação de lead pode vir em rajada, então tem teto maior.
const RATE_WINDOW_MS = 60_000
function makeRateLimiter(limit) {
  const map = new Map()
  return (userId) => {
    const now = Date.now()
    const entry = map.get(userId)
    if (!entry || now > entry.reset) {
      map.set(userId, { count: 1, reset: now + RATE_WINDOW_MS })
      return false
    }
    if (entry.count >= limit) return true
    entry.count++
    return false
  }
}
const isRateLimited = makeRateLimiter(10)      // /generate-message
const isChatRateLimited = makeRateLimiter(30)  // /chat

// POST /api/ai/generate-message
// Body: { channel, goal, tone, audience, extraContext? }
// Returns: { message }
router.post('/generate-message', async (req, res) => {
  const userId = req.user?.sub || req.user?.email || 'anon'
  if (isRateLimited(userId)) {
    return res.status(429).json({ error: 'Muitas requisições. Tente novamente em 1 minuto.' })
  }

  const { channel = 'whatsapp', goal, tone = 'informal', audience, extraContext } = req.body ?? {}

  if (!goal) return res.status(400).json({ error: 'Campo "goal" obrigatório.' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' })

  const channelHint = channel === 'email'
    ? 'Email marketing (pode ter até 800 palavras, parágrafos, sem emojis excessivos)'
    : 'WhatsApp (máximo 300 palavras, pode usar emojis moderadamente, linguagem direta)'

  const toneMap = { formal: 'formal e profissional', informal: 'casual e amigável', urgente: 'urgente e persuasivo', empático: 'empático e próximo' }
  const toneHint = toneMap[tone] ?? 'casual e amigável'

  const system = `Você é um especialista em copywriting para marketing digital brasileiro. Escreva mensagens de campanha claras, persuasivas e naturais. Use variáveis de personalização {{nome}}, {{empresa}}, {{telefone}}, {{data_hoje}} onde fizer sentido. Retorne APENAS o texto da mensagem, sem explicações, sem aspas envolvendo o texto.`

  const userPrompt = `Canal: ${channelHint}
Tom: ${toneHint}
${audience ? `Público-alvo: ${audience}` : ''}
${extraContext ? `Contexto adicional: ${extraContext}` : ''}

Objetivo da campanha: ${goal}

Escreva a mensagem de campanha completa.`

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 600,
      messages: [{ role: 'user', content: userPrompt }],
      system,
    })
    const message = response.content?.[0]?.text?.trim() ?? ''
    res.json({ message })
  } catch (e) {
    console.error('[ai] erro ao gerar mensagem:', e?.message)
    res.status(500).json({ error: e?.message ?? 'Erro ao chamar a API da Claude.' })
  }
})

// POST /api/ai/chat — proxy do atendente/simulador/qualificação de lead.
// Substitui o antigo aiService.chat() do frontend: as chaves do dono ficam no
// servidor (settings, via service-role) e NUNCA vão ao navegador.
// O dono vem do JWT (req.user.sub), jamais do body (ver B14).
// Body: { provider?, systemPrompt?, userMessage, temperature?, maxTokens?, conversationHistory? }
// Retorna: { success, response } | { success:false, error } (chatComplete nunca lança).
router.post('/chat', async (req, res) => {
  const userId = req.user?.sub
  if (!userId) return res.status(401).json({ success: false, error: 'Usuário não identificado no token.' })
  if (isChatRateLimited(userId)) {
    return res.status(429).json({ success: false, error: 'Muitas requisições. Tente novamente em 1 minuto.' })
  }

  const { provider, systemPrompt, userMessage, temperature, maxTokens, conversationHistory } = req.body ?? {}
  if (!userMessage || !String(userMessage).trim()) {
    return res.status(400).json({ success: false, error: 'Campo "userMessage" obrigatório.' })
  }

  const result = await chatComplete({
    userId, provider, systemPrompt, userMessage, temperature, maxTokens,
    conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
  })
  res.json(result)
})

module.exports = router
