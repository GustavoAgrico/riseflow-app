// Rotas do canal Telegram (Bot API via grammY — server/telegramClient.js).
// Mesmo desenho do canal Email: o token do bot vive em integrations.config
// (type='telegram') e o frontend nunca fala com api.telegram.org direto.
//
// Segurança: mesma posture das demais rotas do proxy (JWT frouxo + userId no
// body) — ver BUGS.md B14. O webhook público usa o secret_token oficial da
// Bot API (comparado por bot em telegramClient.handleWebhookUpdate).
const { Router } = require('express')
const { supabase, isConfigured } = require('../supabaseClient')
const telegram = require('../telegramClient')

const router = Router()

// POST /api/telegram/connect — valida o token (getMe), sobe o bot e persiste.
// Body: { token }  — userId vem do JWT (B14: nunca do body)
router.post('/connect', async (req, res) => {
  const { token } = req.body || {}
  const userId = req.user?.sub || (process.env.NODE_ENV !== 'production' ? req.body?.userId : null)
  if (!userId || !token) {
    return res.status(400).json({ error: 'token é obrigatório e sessão deve estar autenticada.' })
  }
  if (!isConfigured) {
    return res.status(503).json({ error: 'Backend sem SUPABASE_SERVICE_ROLE_KEY — canal Telegram indisponível.' })
  }
  try {
    const bot = await telegram.startBot(userId, String(token).trim())
    const { error } = await supabase.from('integrations').upsert(
      {
        user_id: userId, type: 'telegram', status: 'connected',
        config: { bot_token: String(token).trim(), username: bot.username },
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,type' }
    )
    if (error) throw error
    res.json({ ok: true, bot })
  } catch (err) {
    await telegram.stopBot(userId).catch(() => {})
    const msg = err?.description || err?.message || 'Falha ao conectar o bot.'
    res.status(400).json({ ok: false, error: msg })
  }
})

// POST /api/telegram/disconnect — para o bot e marca a integração como desconectada.
// userId vem do JWT (B14: nunca do body)
router.post('/disconnect', async (req, res) => {
  const userId = req.user?.sub || (process.env.NODE_ENV !== 'production' ? req.body?.userId : null)
  if (!userId) return res.status(401).json({ error: 'Usuário não identificado no token.' })
  await telegram.stopBot(userId)
  if (isConfigured) {
    await supabase.from('integrations')
      .update({ status: 'disconnected', config: {} })
      .eq('user_id', userId).eq('type', 'telegram')
  }
  res.json({ ok: true })
})

// GET /api/telegram/status — estado do bot em memória (userId do JWT).
router.get('/status', (req, res) => {
  const userId = req.user?.sub || req.query.userId
  res.json(telegram.getStatus(userId))
})

// POST /api/telegram/send — envio direto (uso interno/diagnóstico).
// Body: { number: "tg123456", text, userId? }
router.post('/send', async (req, res) => {
  const { number, text, userId } = req.body || {}
  if (!number || !text) return res.status(400).json({ error: 'number e text são obrigatórios.' })
  try {
    res.json(await telegram.sendTextTo(number, text, userId || null))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router

// Router PÚBLICO do webhook (montado sem JWT — o Telegram não envia Bearer).
// A autenticação é o secret_token da Bot API (header oficial), único por bot.
const webhookRouter = Router()
webhookRouter.post('/:userId', async (req, res) => {
  try {
    const ok = await telegram.handleWebhookUpdate(
      req.params.userId,
      req.headers['x-telegram-bot-api-secret-token'],
      req.body
    )
    if (!ok) return res.status(401).json({ error: 'bot desconhecido ou secret inválido' })
  } catch (err) {
    console.error('[telegram webhook]', err?.message ?? err)
    // 200 mesmo em erro de processamento — evita retry em loop do Telegram.
  }
  res.json({ ok: true })
})
module.exports.webhookRouter = webhookRouter
