// Rotas de mensagens (proxy do servidor WhatsApp interno / Baileys).
const { Router } = require('express')
const { baileys } = require('../baileysClient')

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
