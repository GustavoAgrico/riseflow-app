// Rotas dos canais Meta (Facebook Messenger + Instagram DM).
//
// PÚBLICAS (a Meta não envia JWT):
//   GET  /api/webhook/meta           — verificação do webhook (hub.challenge)
//   POST /api/webhook/meta           — eventos de mensagem (assinatura X-Hub-Signature-256)
//   GET  /api/meta/oauth/callback    — retorno do OAuth de login da Meta
//
// PROTEGIDAS (JWT do proxy):
//   GET  /api/meta/oauth/url         — monta a URL do diálogo OAuth
//   POST /api/meta/connect           — conecta uma página (token via OAuth ou manual)
//   POST /api/meta/disconnect        — desconecta um canal
//   GET  /api/meta/status            — estado em memória
//   POST /api/meta/send              — envio direto (diagnóstico)
const crypto = require('crypto')
const { Router } = require('express')
const axios = require('axios')
const jwt = require('jsonwebtoken')
const { supabase, isConfigured } = require('../supabaseClient')
const meta = require('../metaClient')

const GRAPH = 'https://graph.facebook.com/v21.0'
const OAUTH_DIALOG = 'https://www.facebook.com/v21.0/dialog/oauth'
const SCOPES = 'pages_show_list,pages_messaging,pages_read_engagement,instagram_basic,instagram_manage_messages'

const { META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN, JWT_SECRET } = process.env

/* ─── Webhook público ──────────────────────────────────────────────────── */
const webhookRouter = Router()

// GET — verificação do webhook no painel da Meta (echo do hub.challenge).
webhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  if (mode === 'subscribe' && META_VERIFY_TOKEN && token === META_VERIFY_TOKEN) {
    console.log('[meta] webhook verificado pelo painel da Meta')
    return res.status(200).send(challenge)
  }
  res.sendStatus(403)
})

// Assinatura: X-Hub-Signature-256 = 'sha256=' + HMAC-SHA256(app_secret, corpo cru).
// req.rawBody é capturado pelo express.json({ verify }) no index.js.
function validSignature(req) {
  if (!META_APP_SECRET) {
    console.warn('[meta] META_APP_SECRET ausente — assinatura do webhook NÃO validada (só aceitável em dev)')
    return true
  }
  const header = String(req.headers['x-hub-signature-256'] || '')
  if (!header.startsWith('sha256=') || !req.rawBody) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', META_APP_SECRET).update(req.rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  } catch {
    return false // tamanhos diferentes
  }
}

// POST — eventos de mensagens (Messenger: object='page'; Instagram: object='instagram').
webhookRouter.post('/', (req, res) => {
  if (!validSignature(req)) {
    console.warn('[meta] webhook com assinatura inválida — descartado')
    return res.sendStatus(401)
  }
  // Responde 200 imediato (a Meta exige resposta < 20s) e processa async.
  res.sendStatus(200)
  meta.handleWebhookEvent(req.body)
    .catch((err) => console.error('[meta] erro ao processar webhook:', err?.message ?? err))
})

/* ─── OAuth público (callback) ─────────────────────────────────────────── */
const oauthRouter = Router()

// Retorno do diálogo de login da Meta. Troca o code por token de usuário,
// lista as páginas e devolve via postMessage para a janela que abriu o popup.
oauthRouter.get('/callback', async (req, res) => {
  // Escapa HTML para evitar XSS na mensagem de erro exibida na página.
  const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // targetOrigin do postMessage: usa a origem armazenada no state JWT (definida em /oauth/url).
  // Fallback para a primeira origem do CORS em vez de '*' — evita vazamento de page tokens.
  const corsOrigin = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',')[0].trim()
  let safeOrigin = corsOrigin

  const respond = (payload) => {
    const display = payload.error ? 'Falha na conexão: ' + escHtml(String(payload.error)) : 'Conectado! Voltando ao RiseFlow…'
    return res.send(`<!doctype html><html><body style="font-family:sans-serif;background:#0F172A;color:#F8FAFC">
<p style="padding:24px">${display}</p>
<script>
  if (window.opener) {
    window.opener.postMessage(${JSON.stringify({ type: 'meta_oauth', ...payload })}, ${JSON.stringify(safeOrigin)})
    setTimeout(() => window.close(), ${payload.error ? 4000 : 800})
  }
</script></body></html>`)
  }

  try {
    const { code, state, error, error_description } = req.query
    if (error || error_description) return respond({ error: String(error_description || error) })
    if (!code || !state) return respond({ error: 'code/state ausentes no retorno da Meta.' })
    const decoded = jwt.verify(String(state), JWT_SECRET) // state assinado em /oauth/url — barra forgery
    if (decoded?.origin) safeOrigin = decoded.origin

    const redirectUri = `${req.protocol}://${req.get('host')}${req.baseUrl}/callback`
    const { data: tok } = await axios.get(`${GRAPH}/oauth/access_token`, {
      params: { client_id: META_APP_ID, client_secret: META_APP_SECRET, redirect_uri: redirectUri, code },
      timeout: 15_000,
    })
    const { data: accounts } = await axios.get(`${GRAPH}/me/accounts`, {
      params: { fields: 'id,name,access_token', access_token: tok.access_token },
      timeout: 15_000,
    })
    const pages = (accounts.data || []).map((p) => ({ id: p.id, name: p.name, access_token: p.access_token }))
    if (!pages.length) {
      // Diagnóstico: descobre quais permissões o usuário realmente concedeu.
      // Distingue "faltou conceder pages_show_list" de "concedeu mas nenhuma
      // Página foi selecionada/apareceu".
      let granted = []
      try {
        const { data: perms } = await axios.get(`${GRAPH}/me/permissions`, {
          params: { access_token: tok.access_token }, timeout: 10_000,
        })
        granted = (perms.data || []).filter((p) => p.status === 'granted').map((p) => p.permission)
      } catch { /* segue sem o detalhe */ }
      console.warn('[meta oauth] /me/accounts vazio — permissões concedidas:', granted.join(', ') || '(nenhuma)')
      const hint = granted.includes('pages_show_list')
        ? 'A permissão de Páginas foi concedida, mas nenhuma Página aparece — no consentimento você precisa SELECIONAR a Página (marque a caixa dela) e conceder o acesso.'
        : 'A permissão "pages_show_list" NÃO foi concedida. Remova o app em Facebook → Configurações → Apps e sites, refaça o login e MARQUE a Página + aceite todas as permissões.'
      return respond({ error: `Nenhuma página encontrada. ${hint} (concedidas: ${granted.join(', ') || 'nenhuma'})` })
    }
    respond({ pages })
  } catch (err) {
    respond({ error: err.response?.data?.error?.message || err.message })
  }
})

/* ─── Rotas protegidas ─────────────────────────────────────────────────── */
const router = Router()

// GET /api/meta/oauth/url — URL do diálogo OAuth (state assinado com origin para postMessage seguro).
router.get('/oauth/url', (req, res) => {
  if (!META_APP_ID || !META_APP_SECRET) {
    return res.status(503).json({ error: 'META_APP_ID/META_APP_SECRET não configurados no server/.env — use o token manual.' })
  }
  const userId = req.user?.sub || (process.env.NODE_ENV !== 'production' ? req.query.userId : null) || ''
  // Armazena a origin do app no state para o callback usar no postMessage (evita wildcard '*')
  const origin = req.headers.origin || (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',')[0].trim()
  const state = jwt.sign({ u: userId, origin }, JWT_SECRET, { expiresIn: '10m' })
  const redirectUri = `${req.protocol}://${req.get('host')}/api/meta/oauth/callback`
  // Facebook Login for Business: com config_id a Meta força a seleção de
  // Páginas/IG e o /me/accounts passa a retornar os ativos (resolve o caso
  // "New Pages Experience" em que scopes soltos vêm vazios). Sem a env, mantém
  // o fluxo antigo por scope.
  const configId = process.env.META_CONFIG_ID
  const authParam = configId ? `config_id=${encodeURIComponent(configId)}` : `scope=${SCOPES}`
  const url = `${OAUTH_DIALOG}?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&${authParam}`
  res.json({ url })
})

// POST /api/meta/connect — conecta uma página a um canal.
// Body: { channel: 'facebook'|'instagram', pageToken, pageId?, pageName? }
// userId vem do JWT (B14: nunca do body)
router.post('/connect', async (req, res) => {
  const { channel, pageToken, pageId, pageName } = req.body || {}
  const userId = req.user?.sub || (process.env.NODE_ENV !== 'production' ? req.body?.userId : null)
  if (!userId || !pageToken || !['facebook', 'instagram'].includes(channel)) {
    return res.status(400).json({ error: 'channel (facebook|instagram) e pageToken são obrigatórios, e sessão deve estar autenticada.' })
  }
  if (!isConfigured) {
    return res.status(503).json({ error: 'Backend sem SUPABASE_SERVICE_ROLE_KEY — canal Meta indisponível.' })
  }
  try {
    // Valida o token de verdade na Graph (e resolve id/nome da página).
    const page = await meta.verifyPageToken(String(pageToken).trim())
    const finalPageId = String(pageId || page.id)
    const finalName = pageName || page.name

    // Assina o app nos eventos da página (necessário p/ receber webhook).
    await meta.subscribePage(finalPageId, String(pageToken).trim())
      .catch((e) => console.warn('[meta] subscribed_apps falhou (webhook pode não chegar):', e.response?.data?.error?.message ?? e.message))

    const { error } = await supabase.from('integrations').upsert(
      {
        user_id: userId, type: channel, status: 'connected',
        config: { page_token: String(pageToken).trim(), page_id: finalPageId, page_name: finalName },
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,type' }
    )
    if (error) throw error

    meta.registerPage({ pageId: finalPageId, userId, channel, token: String(pageToken).trim(), pageName: finalName })
    meta.emitIntegrationConnected(channel)
    res.json({ ok: true, page: { id: finalPageId, name: finalName } })
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message || 'Falha ao conectar a página.'
    res.status(400).json({ ok: false, error: msg })
  }
})

// POST /api/meta/disconnect — Body: { channel }  — userId vem do JWT (B14)
router.post('/disconnect', async (req, res) => {
  const { channel } = req.body || {}
  const userId = req.user?.sub || (process.env.NODE_ENV !== 'production' ? req.body?.userId : null)
  if (!userId || !['facebook', 'instagram'].includes(channel)) {
    return res.status(400).json({ error: 'channel (facebook|instagram) é obrigatório, e sessão deve estar autenticada.' })
  }
  meta.unregisterPagesOf(userId, channel)
  if (isConfigured) {
    await supabase.from('integrations')
      .update({ status: 'disconnected', config: {} })
      .eq('user_id', userId).eq('type', channel)
  }
  res.json({ ok: true })
})

// GET /api/meta/status?channel=… — userId do JWT
router.get('/status', (req, res) => {
  const userId = req.user?.sub || (process.env.NODE_ENV !== 'production' ? req.query.userId : null)
  res.json(meta.getStatus(userId, req.query.channel))
})

// POST /api/meta/send — envio direto (diagnóstico). Body: { number, text, userId? }
router.post('/send', async (req, res) => {
  const { number, text, userId } = req.body || {}
  if (!number || !text) return res.status(400).json({ error: 'number e text são obrigatórios.' })
  try {
    res.json(await meta.sendTextTo(number, text, userId || null))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// Carrega a config conectada (page_token/page_id) do canal para o usuário.
async function loadPageConfig(userId, channel) {
  if (!isConfigured) throw new Error('Backend sem Supabase.')
  const { data } = await supabase.from('integrations')
    .select('config').eq('user_id', userId).eq('type', channel).eq('status', 'connected').maybeSingle()
  const cfg = data?.config || {}
  if (!cfg.page_token || !cfg.page_id) throw new Error(`Canal ${channel} não está conectado.`)
  return { token: cfg.page_token, pageId: cfg.page_id }
}

// GET /api/meta/followers?channel=facebook|instagram — total de seguidores do perfil.
router.get('/followers', async (req, res) => {
  const userId = req.user?.sub || (process.env.NODE_ENV !== 'production' ? req.query.userId : null)
  const channel = req.query.channel
  if (!userId || !['facebook', 'instagram'].includes(channel)) {
    return res.status(400).json({ error: 'channel (facebook|instagram) obrigatório.' })
  }
  try {
    const { token, pageId } = await loadPageConfig(userId, channel)
    res.json(await meta.getFollowerCount({ pageId, token, channel }))
  } catch (err) {
    res.status(400).json({ error: err.response?.data?.error?.message || err.message })
  }
})

// POST /api/meta/sync-conversations  Body: { channel } — puxa o histórico do Direct/Messenger.
router.post('/sync-conversations', async (req, res) => {
  const userId = req.user?.sub || (process.env.NODE_ENV !== 'production' ? req.body?.userId : null)
  const channel = req.body?.channel
  if (!userId || !['facebook', 'instagram'].includes(channel)) {
    return res.status(400).json({ error: 'channel (facebook|instagram) obrigatório.' })
  }
  try {
    const { token, pageId } = await loadPageConfig(userId, channel)
    meta.registerPage({ pageId, userId, channel, token, pageName: null }) // habilita envio depois
    const result = await meta.syncConversations({ pageId, token, channel, userId })
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(400).json({ error: err.response?.data?.error?.message || err.message })
  }
})

module.exports = router
module.exports.webhookRouter = webhookRouter
module.exports.oauthRouter = oauthRouter
