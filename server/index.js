// RiseFlow — proxy seguro da Evolution API.
// A API key da Evolution fica só no servidor; o frontend fala com este proxy via JWT.
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const http = require('http')
const fs = require('fs')
const express = require('express')
const compression = require('compression')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const { Server } = require('socket.io')

const auth = require('./middleware/auth')
const { supabase, isConfigured } = require('./supabaseClient')
const chatsRoutes = require('./routes/chats')
const messagesRoutes = require('./routes/messages')
const contactsRoutes = require('./routes/contacts')
const instanceRoutes = require('./routes/instance')
const emailRoutes = require('./routes/email')
const telegramRoutes = require('./routes/telegram')
const metaRoutes = require('./routes/meta')
const createWebhookRouter = require('./routes/webhook')
const billingRoutes = require('./routes/billing')
const aiRoutes = require('./routes/ai')
const legalRoutes = require('./routes/legal')
const telegram = require('./telegramClient')
const metaClient = require('./metaClient')
const whatsappCloud = require('./whatsappCloudClient')
const whatsappCloudRoutes = require('./routes/whatsappCloud')
const { handleIncomingMessage, setIo: setFlowEngineIo } = require('./flowEngine')
const { aiRespond } = require('./aiAttendant')
const campaignEngine = require('./campaignEngine')
const scheduleEngine = require('./scheduleEngine')

const {
  PORT = 3333,
  JWT_SECRET,
  CORS_ORIGIN = 'http://localhost:3000',
  NODE_ENV,
  WEBHOOK_TOKEN,
} = process.env

const IS_PROD = NODE_ENV === 'production'

if (!JWT_SECRET) {
  console.error('[fatal] JWT_SECRET ausente no .env. Encerrando.')
  process.exit(1)
}

// B11: em produção o webhook público da Evolution NÃO pode ficar sem token —
// senão qualquer um injeta eventos falsos (dispara funis, gasta créditos de IA,
// forja mensagens no chat). Exige WEBHOOK_TOKEN antes de subir.
if (IS_PROD && !WEBHOOK_TOKEN) {
  console.error('[fatal] WEBHOOK_TOKEN obrigatório em produção (protege POST /api/webhook). Encerrando.')
  process.exit(1)
}

const app = express()
const server = http.createServer(app)

// Render (e outros proxies como Nginx/Heroku) terminam TLS antes do Node.
// Sem isso, req.protocol retorna 'http' mesmo em produção HTTPS, quebrando
// o redirect_uri do OAuth da Meta.
app.set('trust proxy', 1)

// Compressão gzip de TODAS as respostas. Sem isto, o bundle principal (~817 KB)
// e os chunks (charts/reactflow) trafegam crus; no instance free do Render
// (0.1 CPU / 512 MB) o burst de ~1,5 MB no load da página abortava requisições
// intermitentemente (assets voltavam 500 → React não montava → tela branca).
// Com gzip o payload cai ~4x (~400 KB) e o instance dá conta. Comprime só a
// resposta — não toca no req.rawBody usado no HMAC do webhook da Meta.
app.use(compression())

// B19: headers de segurança em TODAS as respostas (o dev server do Vite já os
// enviava, mas a produção — Express servindo dist/ + API — não). Sem helmet para
// não adicionar dependência; os mesmos quatro headers do vite.config.js.
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})

// CORS: apenas as origens listadas no .env (localhost:3000 em dev).
const allowedOrigins = CORS_ORIGIN.split(',').map((o) => o.trim())

// WebSocket: empurra eventos da Evolution (via webhook) para o frontend em tempo real.
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
})
setFlowEngineIo(io)
io.on('connection', (socket) => {
  console.log(`[socket] cliente conectado: ${socket.id}`)
  let presenceMemberId = null

  // Presença automática: um MEMBRO da equipe anuncia 'online' ao conectar; ao
  // cair a conexão, volta a 'offline'. O dono (tela Equipe) recebe 'team_status'
  // em tempo real. (MVP: não conta múltiplas abas — última desconexão = offline.)
  socket.on('presence_online', async ({ memberId } = {}) => {
    if (!memberId || !isConfigured) return
    presenceMemberId = memberId
    try {
      await supabase.from('team_members').update({ status: 'online' }).eq('id', memberId)
      io.emit('team_status', { memberId, status: 'online' })
    } catch (e) { console.warn('[presence] online falhou:', e?.message ?? e) }
  })

  socket.on('disconnect', async () => {
    console.log(`[socket] cliente saiu: ${socket.id}`)
    if (presenceMemberId && isConfigured) {
      try {
        await supabase.from('team_members').update({ status: 'offline' }).eq('id', presenceMemberId)
        io.emit('team_status', { memberId: presenceMemberId, status: 'offline' })
      } catch (e) { console.warn('[presence] offline falhou:', e?.message ?? e) }
    }
  })

  // Transferência manual disparada pelo frontend: rebroadcast para todos os clientes.
  socket.on('transfer_request', (data) => {
    console.log('[socket] transfer_request recebido de', socket.id, '→', data?.agentName)
    io.emit('transfer_notification', {
      ...data,
      source: 'manual',
      timestamp: data.timestamp || new Date().toISOString(),
    })
  })
})
app.use(
  cors({
    origin: (origin, cb) => {
      // Permite ferramentas sem Origin (curl, Postman) e as origens da allowlist.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
      // Origem fora da allowlist: NÃO lança erro. O Vite marca todos os assets
      // como crossorigin (`<script type=module crossorigin>`, `<link crossorigin>`),
      // então o browser pede o próprio frontend em modo CORS, enviando a Origin
      // do app. Se CORS_ORIGIN não incluir essa Origin, um `throw` aqui virava
      // 500 em TODO asset → React não montava → tela branca no Render.
      // `cb(null, false)` segue sem cabeçalho ACAO: requisições same-origin (o
      // próprio app) passam; leitura cross-origin real continua barrada pelo browser.
      cb(null, false)
    },
    credentials: true,
  })
)

// rawBody: necessário para validar a assinatura X-Hub-Signature-256 da Meta
// (o HMAC é calculado sobre o corpo CRU, antes do parse).
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf } }))

// Healthcheck (público).
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }))

// Login do proxy: troca um access token do Supabase Auth por um JWT curto do
// proxy. O JWT carrega `sub` = id real do usuário no Supabase; as rotas derivam
// o dono a partir dele, nunca do body (ver B14 na auditoria).
//
// O caminho legado por e-mail (sem senha, sem validação) só continua ativo FORA
// de produção, como conveniência de dev. Em produção ele é recusado.
app.post('/api/auth/login', async (req, res) => {
  const { token: supabaseToken, email } = req.body || {}

  // Caminho seguro: valida o token do Supabase e deriva o usuário dele.
  if (supabaseToken && isConfigured) {
    try {
      const { data, error } = await supabase.auth.getUser(supabaseToken)
      if (error || !data?.user) {
        return res.status(401).json({ error: 'Sessão do Supabase inválida ou expirada.' })
      }

      // Verifica se o usuário é membro de equipe (não o dono da conta).
      // Se for, o JWT carrega sub = user_id do dono para que todas as rotas
      // continuem funcionando com o mesmo escopo de dados.
      let sub = data.user.id
      let extraClaims = {}
      if (isConfigured) {
        const { data: memberRow } = await supabase
          .from('team_members')
          .select('id, user_id')
          .eq('email', data.user.email)
          .neq('user_id', data.user.id)
          .maybeSingle()
        if (memberRow) {
          sub = memberRow.user_id
          extraClaims = { member_id: memberRow.id, member_email: data.user.email }
        }
      }

      const proxyToken = jwt.sign(
        { sub, email: data.user.email, ...extraClaims },
        JWT_SECRET,
        { expiresIn: '7d' }
      )
      return res.json({ token: proxyToken })
    } catch (err) {
      console.error('[auth] falha ao validar token Supabase:', err?.message ?? err)
      return res.status(401).json({ error: 'Falha ao validar a sessão.' })
    }
  }

  // Sem token válido: em produção, recusa. Em dev, aceita o e-mail (legado).
  if (IS_PROD) {
    return res.status(401).json({ error: 'Autenticação via Supabase obrigatória.' })
  }
  if (!email) return res.status(400).json({ error: 'Campo "token" (Supabase) obrigatório.' })
  const proxyToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' })
  return res.json({ token: proxyToken })
})

// Webhook da AbacatePay — PÚBLICO (AbacatePay não envia JWT).
app.use('/api/billing/webhook', billingRoutes)

// Webhook da Meta (Messenger/Instagram) — PÚBLICO, mas ANTES do webhook da
// Evolution: o router da Evolution captura POST /:event e engoliria /meta.
// GET = verificação hub.challenge; POST = eventos (assinatura HMAC).
app.use('/api/webhook/meta', metaRoutes.webhookRouter)

// Webhook do WhatsApp Cloud (oficial) — PÚBLICO, antes do catch-all da Evolution.
app.use('/api/webhook/whatsapp', whatsappCloudRoutes.webhookRouter)

// Webhook da Evolution → Socket.io. PÚBLICO (a Evolution não envia JWT),
// por isso é montado ANTES das rotas protegidas.
app.use('/api/webhook', createWebhookRouter(io))

// Webhook do Telegram — PÚBLICO (auth = secret_token oficial da Bot API).
// Montado antes do router autenticado de /api/telegram.
app.use('/api/telegram/webhook', telegramRoutes.webhookRouter)

// OAuth callback da Meta — PÚBLICO (o navegador volta do login sem JWT).
app.use('/api/meta/oauth', metaRoutes.oauthRouter)

// Telegram e Meta: injetam Socket.io + a mesma cadeia IA→funis do WhatsApp.
const incomingHandler = ({ jid, text, pushName, fromMe, userId }) =>
  aiRespond({ jid, text, pushName, fromMe, userId })
    .then((handled) => (handled ? null : handleIncomingMessage({ jid, text, pushName, fromMe, userId })))
telegram.init({ socketIo: io, incomingHandler })
metaClient.init({ socketIo: io, incomingHandler })
whatsappCloud.init({ socketIo: io, incomingHandler })
// Injeta o Socket.io no motor de Lead Ads (emite 'new_lead' para o CRM ao vivo).
require('./metaLeads').setIo(io)

// Rotas de campanhas (pause server-side)
app.post('/api/campaigns/:id/pause', auth, async (req, res) => {
  try {
    await campaignEngine.pauseCampaign(req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/campaigns/:id/send', auth, async (req, res) => {
  try {
    if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
    const { data: camp } = await supabase.from('campaigns').select('*').eq('id', req.params.id).eq('user_id', req.user.sub).single()
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' })
    campaignEngine.runCampaign(camp).catch(() => {})
    res.json({ ok: true, message: 'Campanha iniciada no servidor' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Rotas protegidas — auth valida o JWT; dados já são isolados por req.user.sub.
app.use('/api/chats', auth, chatsRoutes)
app.use('/api/messages', auth, messagesRoutes)
app.use('/api/contacts', auth, contactsRoutes)
app.use('/api/instance', auth, instanceRoutes)
app.use('/api/email', auth, emailRoutes)
app.use('/api/telegram', auth, telegramRoutes)
app.use('/api/meta', auth, metaRoutes)
app.use('/api/whatsapp-cloud', auth, whatsappCloudRoutes)
app.use('/api/billing', auth, billingRoutes)
app.use('/api/ai', auth, aiRoutes)

// Páginas legais públicas (Política de Privacidade / Exclusão de dados) — exigidas
// pela App Review da Meta. Montadas ANTES do fallback do SPA para terem URL própria.
app.use('/', legalRoutes)

// Produção (Docker/Render): serve o build do frontend (../dist) na mesma porta.
// GET em rota não-/api cai no index.html (SPA fallback) — corrige o "Cannot GET /".
const distDir = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')))
  console.log(`[static] servindo frontend de ${distDir}`)
}

// Tratador de erros centralizado: repassa o status/erro do servidor WhatsApp sem vazar a API key.
app.use((err, req, res, next) => {
  if (err.response) {
    // Erro vindo do servidor WhatsApp (Baileys).
    console.error(`[whatsapp ${err.response.status}]`, err.config?.url, err.response.data)
    return res.status(err.response.status).json({
      error: err.response.data?.error || 'Falha no servidor WhatsApp.',
      detail: err.response.data,
    })
  }
  console.error('[server error]', err.message)
  res.status(500).json({ error: 'Erro interno do servidor.' })
})

// Usa server.listen (não app.listen) para o Socket.io compartilhar a porta.
server.listen(PORT, () => {
  console.log(`RiseFlow proxy rodando em http://localhost:${PORT}`)
  console.log(`WebSocket (Socket.io) ativo na mesma porta`)
  console.log(`CORS liberado para: ${allowedOrigins.join(', ')}`)
  // Religa os canais já conectados (integrations).
  telegram.resumeBots()
  metaClient.resumePages()
  whatsappCloud.resumeNumbers()
  // Inicia motor de campanhas: retoma envios interrompidos e verifica agendamentos.
  campaignEngine.start()
  scheduleEngine.start()
})
