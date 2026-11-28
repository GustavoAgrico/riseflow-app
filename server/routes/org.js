// /api/org — organização da conta logada (E2).
// A organização é SEMPRE a do dono do JWT (sub); nada vem do navegador.
const { Router } = require('express')
const orgs = require('../orgs')

const router = Router()

// GET /api/org → { organization, role, members }
router.get('/', async (req, res) => {
  try {
    const organization = await orgs.getOrganization(req.user.sub)
    if (!organization) return res.json({ organization: null, role: orgs.roleOf(req.user), members: [] })
    const role = orgs.roleOf(req.user)
    // Lista de membros só para quem gerencia a equipe.
    const members = orgs.atLeast(role, 'manager') ? await orgs.listMembers(organization.id) : []
    const { owner_user_id, ...pub } = organization
    res.json({ organization: pub, role, members })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/org { name } — dono ou admin.
router.patch('/', async (req, res) => {
  if (!orgs.atLeast(orgs.roleOf(req.user), 'admin')) return res.status(403).json({ error: 'Só o dono ou um admin pode renomear a empresa.' })
  try {
    const org = await orgs.renameOrganization(req.user.sub, req.body?.name)
    if (!org) return res.status(404).json({ error: 'Organização ainda não criada.' })
    res.json({ organization: org })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
})

module.exports = router
