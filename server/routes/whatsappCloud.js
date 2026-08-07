// Rotas do canal WhatsApp Cloud API (oficial da Meta).
//
// PÚBLICAS (a Meta não envia JWT):
//   GET  /api/webhook/whatsapp   — verificação do webhook (hub.challenge)
//   POST /api/webhook/whatsapp   — eventos de mensagem (assinatura X-Hub-Signature-256)
//
// PROTEGIDAS (JWT do proxy):
//   POST /api/whatsapp-cloud/connect      — valida phoneNumberId+token e persiste
//   POST /api/whatsapp-cloud/disconnect   — desconecta
//   GET  /api/whatsapp-cloud/status       — estado em memória
//   POST /api/whatsapp-cloud/send         — envio direto (diagnóstico)
const crypto = require('crypto')
const { Router } = require('express')
const { supabase, isConfigured } = require('../supabaseClient')
const waCloud = require('../whatsappCloudClient')

// Verify token e app secret podem ser próprios do WhatsApp ou reaproveitar os da
// Meta (FB/IG) se o mesmo app Meta for usado.
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET

/* ─── Webhook público ─────────────────────────────────────────────────────── */
const webhookRouter = Router()

// GET — verificação do webhook no painel da Meta (echo do hub.challenge).
webhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    console.log('[wa-cloud] webhook verificado pelo painel da Meta')
    return res.status(200).send(challenge)
  }
  res.sendStatus(403)
})

// Assinatura: X-Hub-Signature-256 = 'sha256=' + HMAC-SHA256(app_secret, corpo cru).
// req.rawBody é capturado pelo express.json({ verify }) no index.js.
function validSignature(req) {
  if (!APP_SECRET) {
    console.warn('[wa-cloud] APP_SECRET ausente — assinatura do webhook NÃO validada (só aceitável em dev)')
    return true
  }
  const header = String(req.headers['x-hub-signature-256'] || '')
  if (!header.startsWith('sha256=') || !req.rawBody) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(req.rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  } catch {
    return false // tamanhos diferentes
  }
}

// POST — eventos de mensagens (object='whatsapp_business_account').
webhookRouter.post('/', (req, res) => {
  if (!validSignature(req)) {
    console.warn('[wa-cloud] webhook com assinatura inválida — descartado')
    return res.sendStatus(401)
  }
  // Responde 200 imediato (a Meta exige resposta rápida) e processa async.
  res.sendStatus(200)
  waCloud.handleWebhookEvent(req.body)
    .catch((err) => console.error('[wa-cloud] erro ao processar webhook:', err?.message ?? err))
})

/* ─── Rotas protegidas ─────────────────────────────────────────────────────── */
const router = Router()

// POST /connect — Body: { phoneNumberId, token, wabaId? }. userId vem do JWT.
router.post('/connect', async (req, res) => {
  const { phoneNumberId, token, wabaId } = req.body || {}
  const userId = req.user?.sub || (process.env.NODE_ENV !== 'production' ? req.body?.userId : null)
  if (!userId || !phoneNumberId || !token) {
    return res.status(400).json({ error: 'phoneNumberId e token são obrigatórios, e a sessão deve estar autenticada.' })
  }
  if (!isConfigured) {
    return res.status(503).json({ error: 'Backend sem SUPABASE_SERVICE_ROLE_KEY — canal WhatsApp Cloud indisponível.' })
  }
  try {
    // Valida credenciais de verdade na Graph (e resolve o número/nome exibido).
    const info = await waCloud.verifyCredentials({ phoneNumberId: String(phoneNumberId).trim(), token: String(token).trim() })

    const { error } = await supabase.from('integrations').upsert(
      {
        user_id: userId, type: 'whatsapp_cloud', status: 'connected',
        config: {
          phone_number_id: String(phoneNumberId).trim(),
          token: String(token).trim(),
          waba_id: wabaId ? String(wabaId).trim() : null,
          display_number: info.displayNumber,
          verified_name: info.verifiedName,
        },
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,type' }
    )
    if (error) throw error

    waCloud.registerNumber({ userId, phoneNumberId: String(phoneNumberId).trim(), token: String(token).trim(), wabaId, displayNumber: info.displayNumber })
    waCloud.emitIntegrationConnected()
    res.json({ ok: true, displayNumber: info.displayNumber, verifiedName: info.verifiedName })
  } catch (err) {
    const g = err.response?.data?.error
    res.status(400).json({ ok: false, error: g ? `Meta: ${g.message}` : (err.message || 'Falha ao conectar o número.') })
  }
})

// POST /disconnect — userId vem do JWT.
router.post('/disconnect', async (req, res) => {
  const userId = req.user?.sub || (process.env.NODE_ENV !== 'production' ? req.body?.userId : null)
  if (!userId) return res.status(401).json({ error: 'Usuário não identificado no token.' })
  waCloud.unregisterFor(userId)
  if (isConfigured) {
    await supabase.from('integrations')
      .update({ status: 'disconnected', config: {} })
      .eq('user_id', userId).eq('type', 'whatsapp_cloud')
  }
  res.json({ ok: true })
})

// GET /status — estado em memória (userId do JWT).
router.get('/status', (req, res) => {
  const userId = req.user?.sub || (process.env.NODE_ENV !== 'production' ? req.query.userId : null)
  res.json(waCloud.getStatus(userId))
})

// POST /send — envio direto (diagnóstico). Body: { number, text }.
router.post('/send', async (req, res) => {
  const { number, text } = req.body || {}
  const userId = req.user?.sub || (process.env.NODE_ENV !== 'production' ? req.body?.userId : null)
  if (!number || !text) return res.status(400).json({ error: 'number e text são obrigatórios.' })
  try {
    res.json(await waCloud.sendTextTo(number, text, userId))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
module.exports.webhookRouter = webhookRouter
