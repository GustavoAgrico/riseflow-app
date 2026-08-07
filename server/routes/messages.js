// Rotas de mensagens (proxy do servidor WhatsApp interno / Baileys).
// Prefixos de canal: "tg…" = Telegram (bot), "fb…"/"ig…" = Meta (página);
// qualquer outro número vai pro Baileys (WhatsApp).
const { Router } = require('express')
const { baileys } = require('../baileysClient')
const telegram = require('../telegramClient')
const meta = require('../metaClient')
const waCloud = require('../whatsappCloudClient')

const router = Router()

// GET /api/messages → histórico de TODAS as mensagens (usado na sincronização/stats).
// O Baileys (multi-file auth) NÃO persiste histórico: as mensagens recebidas/enviadas
// fluem via webhook → Supabase (realtime). Aqui devolvemos lista vazia; o frontend
// trata isso normalmente (0 conversas a importar numa instância nova é o esperado).
router.get('/', (req, res) => {
  res.json([])
})

// GET /api/messages/:jid → mensagens de um contato. Mesmo motivo acima: vazio.
router.get('/:jid', (req, res) => {
  res.json([])
})

// POST /api/messages/send → envia uma mensagem de texto.
// Body esperado: { number: "5511999999999", text: "olá" }
router.post('/send', async (req, res, next) => {
  try {
    const { number, text } = req.body || {}
    if (!number || !text) {
      return res
        .status(400)
        .json({ error: 'Campos obrigatórios: "number" e "text".' })
    }

    // Telegram: contato "tg<chatId>" → envia pelo bot conectado.
    if (telegram.isTelegramNumber(number)) {
      try {
        return res.json(await telegram.sendTextTo(number, text))
      } catch (err) {
        return res.status(400).json({ error: err.message })
      }
    }

    // Meta: contato "fb<PSID>"/"ig<IGSID>" → envia pela página conectada.
    if (meta.isMetaNumber(number)) {
      try {
        return res.json(await meta.sendTextTo(number, text))
      } catch (err) {
        return res.status(400).json({ error: err.message })
      }
    }

    // WhatsApp Cloud (oficial): usuário com número Cloud conectado envia por ele
    // em vez do Baileys (mesmo número/contato, provider diferente).
    if (waCloud.isActiveFor(req.user?.sub)) {
      try {
        return res.json(await waCloud.sendTextTo(number, text, req.user.sub))
      } catch (err) {
        return res.status(400).json({ error: err.message })
      }
    }

    // Baileys server: { number, text } → { success, key }
    const { data } = await baileys.post('/send/text', { number, text })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/messages/send-audio → envia nota de voz.
// Body esperado: { number, audio } (audio = base64 sem prefixo data: ou URL).
router.post('/send-audio', async (req, res, next) => {
  try {
    const { number, audio } = req.body || {}
    if (!number || !audio) {
      return res
        .status(400)
        .json({ error: 'Campos obrigatórios: "number" e "audio".' })
    }

    const { data } = await baileys.post('/send/audio', { number, audio })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

module.exports = router
