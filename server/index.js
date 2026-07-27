// RiseFlow — proxy seguro da Evolution API.
// A API key da Evolution fica só no servidor; o frontend fala com este proxy via JWT.
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const http = require('http')
const fs = require('fs')
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const { Server } = require('socket.io')

const auth = require('./middleware/auth')
const chatsRoutes = require('./routes/chats')
const messagesRoutes = require('./routes/messages')
const contactsRoutes = require('./routes/contacts')
const instanceRoutes = require('./routes/instance')
const emailRoutes = require('./routes/email')
const telegramRoutes = require('./routes/telegram')
const metaRoutes = require('./routes/meta')
const createWebhookRouter = require('./routes/webhook')
const telegram = require('./telegramClient')
const metaClient = require('./metaClient')
const { handleIncomingMessage } = require('./flowEngine')
const { aiRespond } = require('./aiAttendant')

const { PORT = 3333, JWT_SECRET, CORS_ORIGIN = 'http://localhost:3000' } = process.env

if (!JWT_SECRET) {
  console.error('[fatal] JWT_SECRET ausente no .env. Encerrando.')
  process.exit(1)
}

const app = express()
const server = http.createServer(app)

// CORS: apenas as origens listadas no .env (localhost:3000 em dev).
const allowedOrigins = CORS_ORIGIN.split(',').map((o) => o.trim())

// WebSocket: empurra eventos da Evolution (via webhook) para o frontend em tempo real.
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
})
io.on('connection', (socket) => {
  console.log(`[socket] cliente conectado: ${socket.id}`)
  socket.on('disconnect', () => console.log(`[socket] cliente saiu: ${socket.id}`))
})
app.use(
  cors({
    origin: (origin, cb) => {
      // Permite ferramentas sem Origin (curl, Postman) e as origens da allowlist.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
      cb(new Error(`Origem não permitida pelo CORS: ${origin}`))
    },
    credentials: true,
  })
)

// rawBody: necessário para validar a assinatura X-Hub-Signature-256 da Meta
// (o HMAC é calculado sobre o corpo CRU, antes do parse).
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf } }))

// Healthcheck (público).
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }))

// Login de desenvolvimento: emite um JWT para o frontend.
// Em produção, troque por validação real de usuário (ex.: Supabase Auth).
app.post('/api/auth/login', (req, res) => {
  const { email } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Campo "email" obrigatório.' })
  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token })
})

// Webhook da Meta (Messenger/Instagram) — PÚBLICO, mas ANTES do webhook da
// Evolution: o router da Evolution captura POST /:event e engoliria /meta.
// GET = verificação hub.challenge; POST = eventos (assinatura HMAC).
app.use('/api/webhook/meta', metaRoutes.webhookRouter)

// Webhook da Evolution → Socket.io. PÚBLICO (a Evolution não envia JWT),
// por isso é montado ANTES das rotas protegidas.
app.use('/api/webhook', createWebhookRouter(io))

// Webhook do Telegram — PÚBLICO (auth = secret_token oficial da Bot API).
// Montado antes do router autenticado de /api/telegram.
app.use('/api/telegram/webhook', telegramRoutes.webhookRouter)

// OAuth callback da Meta — PÚBLICO (o navegador volta do login sem JWT).
app.use('/api/meta/oauth', metaRoutes.oauthRouter)

// Telegram e Meta: injetam Socket.io + a mesma cadeia IA→funis do WhatsApp.
const incomingHandler = ({ jid, text, pushName, fromMe }) =>
  aiRespond({ jid, text, pushName, fromMe })
    .then((handled) => (handled ? null : handleIncomingMessage({ jid, text, pushName, fromMe })))
telegram.init({ socketIo: io, incomingHandler })
metaClient.init({ socketIo: io, incomingHandler })

// Rotas protegidas — o middleware auth valida o JWT em todas elas.
app.use('/api/chats', auth, chatsRoutes)
app.use('/api/messages', auth, messagesRoutes)
app.use('/api/contacts', auth, contactsRoutes)
app.use('/api/instance', auth, instanceRoutes)
app.use('/api/email', auth, emailRoutes)
app.use('/api/telegram', auth, telegramRoutes)
app.use('/api/meta', auth, metaRoutes)

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
})
