// Recebe os eventos da Evolution API e os repassa ao frontend via Socket.io.
// Esta rota é PÚBLICA (a Evolution não envia JWT). Opcionalmente protegida por
// WEBHOOK_TOKEN: se definido no .env, a Evolution deve incluir ?token=... na URL.
const { Router } = require('express')
const { handleIncomingMessage } = require('../flowEngine')
const { aiRespond } = require('../aiAttendant')

const { WEBHOOK_TOKEN } = process.env

/* Extrai um texto legível do objeto message da Evolution. */
const extractText = (m) => {
  const msg = m?.message
  if (!msg) return ''
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    (msg.imageMessage ? '📷 Imagem' : null) ??
    (msg.audioMessage ? '🎵 Áudio' : null) ??
    (msg.videoMessage ? '🎬 Vídeo' : null) ??
    (msg.documentMessage ? '📄 Documento' : null) ??
    (msg.stickerMessage ? '🎭 Sticker' : null) ??
    ''
  )
}

/* Normaliza o nome do evento: "messages.upsert" | "MESSAGES_UPSERT" → "MESSAGES_UPSERT". */
const normalizeEvent = (raw) =>
  String(raw || '').toUpperCase().replace(/[.-]/g, '_')

/* A Evolution manda mensagens ora como objeto único, ora como { messages: [...] }. */
const toMessageArray = (data) => {
  if (!data) return []
  if (Array.isArray(data.messages)) return data.messages
  if (Array.isArray(data)) return data
  if (data.key) return [data] // objeto único de mensagem
  return []
}

/* `io` é injetado pelo index.js para que o handler possa emitir eventos. */
module.exports = function createWebhookRouter(io) {
  const router = Router()

  // Aceita /api/webhook e /api/webhook/<evento> (quando webhook_by_events=true,
  // a Evolution acrescenta o nome do evento no path, ex.: /api/webhook/messages-upsert).
  router.post(['/', '/:event'], (req, res) => {
    // Checagem opcional de token compartilhado.
    if (WEBHOOK_TOKEN && req.query.token !== WEBHOOK_TOKEN) {
      return res.status(401).json({ error: 'webhook token inválido' })
    }

    const body = req.body || {}
    const event = normalizeEvent(body.event || req.params.event)

    try {
      if (event === 'MESSAGES_UPSERT') {
        for (const m of toMessageArray(body.data)) {
          const jid = m?.key?.remoteJid
          if (!jid) continue
          const fromMe = !!m.key?.fromMe
          const text = extractText(m)
          const pushName = m.pushName ?? ''
          io.emit('new_message', {
            jid,
            message: { id: m.key?.id ?? null, fromMe, text, pushName, timestamp: m.messageTimestamp ?? null },
          })
          // Atendimento IA primeiro; se a IA respondeu, os funis não rodam para
          // esta mensagem (evita resposta dupla). A IA cede sozinha quando há
          // funil aguardando resposta ou conversa transferida para humano.
          // Fire-and-forget: não bloqueia a resposta do webhook.
          // Sem userId: a Evolution é instância única (single-tenant, em
          // desativação); IA/funis usam o comportamento legado não escopado.
          aiRespond({ jid, text, pushName, fromMe })
            .then((handled) => (handled ? null : handleIncomingMessage({ jid, text, pushName, fromMe })))
            .catch((err) => console.error('[webhook] IA/flowEngine:', err?.message ?? err))
        }
      } else if (event === 'CHATS_UPSERT') {
        const chats = Array.isArray(body.data) ? body.data : [body.data].filter(Boolean)
        for (const chat of chats) io.emit('new_chat', { chat })
      } else if (event === 'CONNECTION_UPDATE') {
        io.emit('connection_update', { state: body.data?.state ?? body.data?.status ?? null })
      }
    } catch (err) {
      console.error('[webhook] erro ao processar evento:', err.message)
      // Ainda respondemos 200: erro de processamento não deve fazer a Evolution reenviar em loop.
    }

    // Responde rápido para a Evolution não considerar timeout.
    res.json({ ok: true })
  })

  return router
}
