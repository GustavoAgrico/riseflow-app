// GET /api/chats → conversas da instância.
// O servidor Baileys não mantém um store de chats consultável (o histórico real
// chega via webhook → Supabase). Devolvemos lista vazia; o frontend já trata 0.
const { Router } = require('express')

const router = Router()

router.get('/', (req, res) => {
  res.json([])
})

module.exports = router
