const express = require('express')
const Anthropic = require('@anthropic-ai/sdk')
const router = express.Router()

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Rate limiting em memória: máx 10 chamadas/minuto por usuário (evita drenagem de créditos).
const rateMap = new Map()
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 10
function isRateLimited(userId) {
  const now = Date.now()
  const entry = rateMap.get(userId)
  if (!entry || now > entry.reset) {
    rateMap.set(userId, { count: 1, reset: now + RATE_WINDOW_MS })
    return false
  }
  if (entry.count >= RATE_LIMIT) return true
  entry.count++
  return false
}

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

module.exports = router
