// Aprovações dos agentes (fase 2). Contrato da aba (docs/AGENTES_ABA_E_MASCOTES.md, seção 5):
//   GET  /api/approvals?agent_id=&status=pending   → [{ id, tool, summary }]
//   POST /api/approvals/:id/decision                { decision: 'approve' | 'reject' }
// Aprovar executa a ação guardada no pedido (só uma vez: a troca de status é condicional).
const { Router } = require('express')
const { isConfigured } = require('../supabaseClient')
const { requireAdmin } = require('../middleware/requireAdmin')
const approvals = require('../agents/approvals')

const router = Router()

const guard = (req, res, next) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  next()
}

router.get('/', guard, async (req, res) => {
  try {
    res.json(await approvals.listPending(req.user.sub, req.query.agent_id || null))
  } catch (e) {
    if (/agent_approvals/.test(e?.message || '')) return res.json([]) // migração da fase 2 ainda não rodada
    res.status(500).json({ error: 'Erro ao carregar as aprovações.' })
  }
})

router.post('/:id/decision', guard, requireAdmin('Só o dono da conta ou um Admin pode aprovar ações dos agentes.'), async (req, res) => {
  try {
    const out = await approvals.decide(req.user.sub, req.params.id, req.body?.decision, req.user.member_id || req.user.sub)
    res.json(out)
  } catch (e) {
    console.error('[approvals] decisão falhou:', e?.message)
    res.status(e?.status || 500).json({ error: e?.status ? e.message : 'Erro ao registrar a decisão.' })
  }
})

module.exports = router
