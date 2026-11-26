// Prospecção com IA: busca empresas no Google Maps, importa para o CRM e,
// se pedido, coloca os leads na fila de ligações da IA (aiCallQueue.js).
//   GET  /api/prospecting/credit                                  → crédito grátis restante no mês
//   POST /api/prospecting/search            { query, location, max }  (limitada ao crédito grátis)
//   POST /api/prospecting/import            { leads: [...], call: boolean }
//   GET  /api/prospecting/queue                                   → fila e últimas ligações
//   POST /api/prospecting/queue/:id/cancel                        → tira da fila
// As regras de busca e importação ficam em server/prospectingService.js (também usadas pelos agentes).
const { Router } = require('express')
const { supabase, isConfigured } = require('../supabaseClient')
const leadSearch = require('../leadSearch')
const prospecting = require('../prospectingService')

const router = Router()

const MAX_SEARCHES_PER_HOUR = 10
const recentSearches = new Map()

const guard = (req, res, next) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  next()
}

function hitSearchLimit(userId) {
  const now = Date.now()
  const list = (recentSearches.get(userId) || []).filter(t => now - t < 3600_000)
  if (list.length >= MAX_SEARCHES_PER_HOUR) { recentSearches.set(userId, list); return true }
  list.push(now)
  recentSearches.set(userId, list)
  return false
}

router.post('/search', guard, async (req, res) => {
  const userId = req.user?.sub
  if (!leadSearch.isConfigured()) return res.status(503).json({ error: 'Busca de leads não configurada no servidor (APIFY_TOKEN).' })
  const query = String(req.body?.query || '').trim().slice(0, 120)
  const location = String(req.body?.location || '').trim().slice(0, 120)
  const max = Math.min(prospecting.MAX_RESULTS, Math.max(5, parseInt(req.body?.max, 10) || 20))
  if (!query || !location) return res.status(400).json({ error: 'Informe o que buscar e onde.' })
  if (hitSearchLimit(userId)) return res.status(429).json({ error: `Limite de ${MAX_SEARCHES_PER_HOUR} buscas por hora atingido.` })

  try {
    res.json(await prospecting.searchFreeLeads(userId, { query, location, max }))
  } catch (e) {
    console.error('[prospecting] erro na busca:', e?.message)
    res.status(e?.status || 502).json({ error: e?.message ?? 'Erro na busca de leads.', ...(e?.credit ? { credit: e.credit } : {}) })
  }
})

router.get('/credit', guard, async (req, res) => {
  if (!leadSearch.isConfigured()) return res.status(503).json({ error: 'Busca de leads não configurada no servidor (APIFY_TOKEN).' })
  try {
    res.json(await leadSearch.getCredit())
  } catch (e) {
    res.status(502).json({ error: e?.message ?? 'Erro ao consultar o crédito.' })
  }
})

router.post('/import', guard, async (req, res) => {
  try {
    const { clientIds, ...out } = await prospecting.importLeads(req.user?.sub, req.body?.leads, { call: Boolean(req.body?.call) })
    res.json(out)
  } catch (e) {
    console.error('[prospecting] erro ao importar:', e?.message)
    res.status(e?.status || 500).json({ error: e?.message ?? 'Erro ao importar leads.' })
  }
})

router.get('/queue', guard, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ai_calls')
      .select('id, status, call_result, duration_secs, score, temperature, qualified, summary, error, created_at, to_number, client_id, clients(name, company)')
      .eq('user_id', req.user?.sub)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    res.json(data || [])
  } catch (e) {
    res.status(500).json({ error: e?.message ?? 'Erro ao carregar a fila.' })
  }
})

router.post('/queue/:id/cancel', guard, async (req, res) => {
  try {
    const { data, error } = await supabase.from('ai_calls')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('user_id', req.user?.sub).eq('status', 'queued')
      .select('id, status').maybeSingle()
    if (error) throw error
    if (!data) return res.status(409).json({ error: 'Só dá para cancelar ligações que ainda estão na fila.' })
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e?.message ?? 'Erro ao cancelar.' })
  }
})

module.exports = router
