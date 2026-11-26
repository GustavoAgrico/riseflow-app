// /api/sales-pilot — Piloto de Vendas (server/sales/pilot.js). Escopo sempre pelo sub do JWT.
const { Router } = require('express')
const { isConfigured } = require('../supabaseClient')
const pilot = require('../sales/pilot')

const router = Router()
const MIGRATION = 'Rode supabase/sales_pilot.sql no Supabase para ativar o Piloto de Vendas.'

router.use((req, res, next) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  if (!req.user?.sub) return res.status(401).json({ error: 'Não autenticado' })
  next()
})

const fail = (res, e) => {
  if (e?.missing || pilot.isMissing(e)) return res.status(409).json({ error: MIGRATION, code: 'migration_missing' })
  const status = e?.status && e.status < 500 ? e.status : 500
  if (status === 500) console.error('[sales-pilot]', e?.message ?? e)
  res.status(status).json({ error: status === 500 ? 'Falha no Piloto de Vendas.' : e.message })
}

router.get('/summary', async (req, res) => {
  try { res.json(await pilot.summary(req.user.sub)) } catch (e) { fail(res, e) }
})

router.get('/opportunities', async (req, res) => {
  try {
    const status = ['open', 'all', 'won', 'lost', 'dismissed'].includes(req.query.status) ? req.query.status : 'open'
    res.json(await pilot.listOpportunities(req.user.sub, { status, limit: Number(req.query.limit) || 60 }))
  } catch (e) { fail(res, e) }
})

router.patch('/opportunities/:id', async (req, res) => {
  try { res.json(await pilot.updateOpportunity(req.user.sub, req.params.id, req.body || {})) } catch (e) { fail(res, e) }
})

router.get('/settings', async (req, res) => {
  try { res.json(await pilot.getSettings(req.user.sub)) } catch (e) { fail(res, e) }
})

router.put('/settings', async (req, res) => {
  try { res.json(await pilot.saveSettings(req.user.sub, req.body || {})) } catch (e) { fail(res, e) }
})

// Analisa as conversas dos últimos dias (uma vez por minuto no máximo por conta).
const lastScan = new Map()
router.post('/scan', async (req, res) => {
  const last = lastScan.get(req.user.sub) || 0
  if (Date.now() - last < 60000) return res.status(429).json({ error: 'Aguarde um minuto antes de analisar de novo.' })
  lastScan.set(req.user.sub, Date.now())
  try {
    const days = Math.min(30, Math.max(1, Number(req.body?.days) || 14))
    res.json(await pilot.backfill(req.user.sub, { days }))
  } catch (e) { lastScan.delete(req.user.sub); fail(res, e) }
})

module.exports = router
