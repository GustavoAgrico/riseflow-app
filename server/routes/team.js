// /api/team — ações do gestor sobre a equipe (Monitor do time).
// POST /nudge { memberId, message, from } → recado na tela da pessoa (server/team/nudge.js).
const { Router } = require('express')
const { isConfigured } = require('../supabaseClient')
const { sendNudge } = require('../team/nudge')

const router = Router()

router.post('/nudge', async (req, res) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  if (!req.user?.sub) return res.status(401).json({ error: 'Não autenticado' })
  if (!req.body?.memberId) return res.status(400).json({ error: 'Escolha a pessoa e escreva o recado.' })
  try {
    res.json(await sendNudge(req.user.sub, { memberId: String(req.body.memberId).slice(0, 64), message: req.body.message, from: req.body.from }))
  } catch (e) {
    if (e?.expected) return res.status(e.status || 400).json({ error: e.message })
    console.error('[team] nudge:', e?.message ?? e)
    res.status(500).json({ error: 'Não foi possível chamar agora.' })
  }
})

module.exports = router
