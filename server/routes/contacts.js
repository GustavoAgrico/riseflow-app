// GET /api/contacts → contatos da instância.
// O servidor Baileys não expõe a agenda por HTTP; devolvemos lista vazia.
// (Os contatos reais aparecem conforme as mensagens chegam via webhook → Supabase.)
const { Router } = require('express')

const router = Router()

router.get('/', (req, res) => {
  res.json([])
})

module.exports = router
