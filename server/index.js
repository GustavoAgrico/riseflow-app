// RiseFlow — proxy seguro da Evolution API.
// A API key da Evolution fica só no servidor; o frontend fala com este proxy via JWT.
require('dotenv').config()

const http = require('http')
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const { Server } = require('socket.io')

const auth = require('./middleware/auth')
const chatsRoutes = require('./routes/chats')
const messagesRoutes = require('./routes/messages')
const contactsRoutes = require('./routes/contacts')
const instanceRoutes = require('./routes/instance')
const createWebhookRouter = require('./routes/webhook')

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

app.use(express.json())

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

// Webhook da Evolution → Socket.io. PÚBLICO (a Evolution não envia JWT),
// por isso é montado ANTES das rotas protegidas.
app.use('/api/webhook', createWebhookRouter(io))

// Rotas protegidas — o middleware auth valida o JWT em todas elas.
app.use('/api/chats', auth, chatsRoutes)
app.use('/api/messages', auth, messagesRoutes)
app.use('/api/contacts', auth, contactsRoutes)
app.use('/api/instance', auth, instanceRoutes)

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
})
