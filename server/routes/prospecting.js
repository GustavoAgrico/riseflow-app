// Prospecção com IA: busca empresas no Google Maps, importa para o CRM e,
// se pedido, coloca os leads na fila de ligações da IA (aiCallQueue.js).
//   GET  /api/prospecting/credit                                  → crédito grátis restante no mês
//   POST /api/prospecting/search            { query, location, max }  (limitada ao crédito grátis)
//   POST /api/prospecting/enrich            { leads: [{ key, website, cnpj }] } → e-mail, redes, WhatsApp, CNPJ e sócios (grátis)
//   POST /api/prospecting/import            { leads: [...], call: boolean, source }
//   GET  /api/prospecting/queue                                   → fila e últimas ligações
//   POST /api/prospecting/queue/:id/cancel                        → tira da fila
//   POST /api/prospecting/screen            { leads, record? }     → novo | no_crm | excluido | repetido
//   POST /api/prospecting/check-whatsapp    { phones }             → tem WhatsApp? (até 25, cache 30 dias)
//   GET  /api/prospecting/exclusions | POST /exclusions { leads, reason } | DELETE /exclusions/:id
//   GET|PUT /api/prospecting/profile                               → perfil de cliente ideal da conta
//   GET  /api/prospecting/searches                                 → histórico de buscas
//   GET  /api/prospecting/cnpj/status | cnaes?q= | cidades?q=&uf=  → base local da Receita (Fase 2)
//   POST /api/prospecting/cnpj/search       { cnaes, uf, cidade, portes, mei, phone, … }
// As regras de busca e importação ficam em server/prospectingService.js (também usadas pelos agentes).
const { Router } = require('express')
const { supabase, isConfigured } = require('../supabaseClient')
const leadSearch = require('../leadSearch')
const prospecting = require('../prospectingService')
const enrich = require('../prospecting/enrich')
const quality = require('../prospecting/quality')
const { baileys } = require('../baileysClient')
const cnpj = require('../cnpj')

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

// Enriquecimento por fontes públicas (site da empresa + CNPJ na BrasilAPI). Até 20 por chamada.
const recentEnrich = new Map()
router.post('/enrich', guard, async (req, res) => {
  const userId = req.user?.sub
  const items = (Array.isArray(req.body?.leads) ? req.body.leads : []).slice(0, 20)
    .map(l => ({ key: String(l?.key || '').slice(0, 120), website: String(l?.website || '').slice(0, 300), cnpj: String(l?.cnpj || '').slice(0, 20) }))
    .filter(l => l.key && (l.website || l.cnpj))
  if (!items.length) return res.status(400).json({ error: 'Nenhum lead com site ou CNPJ para enriquecer.' })
  const now = Date.now()
  const used = (recentEnrich.get(userId) || []).filter(t => now - t < 3600_000)
  if (used.length + items.length > 300) return res.status(429).json({ error: 'Limite de 300 enriquecimentos por hora atingido.' })
  recentEnrich.set(userId, [...used, ...items.map(() => now)])
  try {
    res.json({ results: await enrich.enrichMany(items) })
  } catch (e) {
    console.error('[prospecting] erro no enriquecimento:', e?.message)
    res.status(500).json({ error: 'Não foi possível enriquecer agora.' })
  }
})

router.post('/import', guard, async (req, res) => {
  try {
    const source = ['lista', 'cnpj'].includes(req.body?.source) ? req.body.source : 'google_maps'
    const { clientIds, ...out } = await prospecting.importLeads(req.user?.sub, req.body?.leads, { call: Boolean(req.body?.call), source })
    if (source === 'lista' && req.body?.record) {
      quality.recordSearch(req.user?.sub, { source: 'lista', query: req.body.record.name, found: req.body.record.found, new_count: out.imported, excluded: out.excluded })
    }
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

// ── Qualidade dos leads (Fase 1) ──────────────────────────────────────────
const fail = (res, e, fallback) => {
  if (!e?.status) console.error('[prospecting]', fallback, e?.message)
  res.status(e?.status || 500).json({ error: e?.status ? e.message : fallback })
}
const leadIn = l => ({
  key: String(l?.key ?? '').slice(0, 120), name: String(l?.name || '').slice(0, 200),
  phone: String(l?.phone || '').slice(0, 30), whatsapp: String(l?.whatsapp || '').slice(0, 30),
  website: String(l?.website || '').slice(0, 300), email: String(l?.email || '').slice(0, 160),
  cnpj: String(l?.cnpj || l?.company?.cnpj || '').slice(0, 20),
})

router.post('/screen', guard, async (req, res) => {
  const leads = (Array.isArray(req.body?.leads) ? req.body.leads : []).slice(0, 500).map(leadIn)
  if (!leads.length) return res.json({ results: [], summary: quality.summarize([]) })
  try {
    const screen = await quality.screenFor(req.user.sub, leads)
    res.json({ results: leads.map((l, i) => ({ key: l.key, ...screen[i] })), summary: quality.summarize(screen) })
  } catch (e) { fail(res, e, 'Não foi possível conferir os leads.') }
})

router.post('/check-whatsapp', guard, async (req, res) => {
  const phones = (Array.isArray(req.body?.phones) ? req.body.phones : []).slice(0, quality.CHECK_BATCH).map(p => String(p || '').slice(0, 30))
  try { res.json(await quality.checkWhatsApp(req.user.sub, phones, { baileys })) }
  catch (e) { fail(res, e, 'Não foi possível validar os números.') }
})

router.get('/exclusions', guard, async (req, res) => {
  try { res.json(await quality.listExclusions(req.user.sub)) } catch (e) { fail(res, e, 'Erro ao carregar a lista de exclusão.') }
})

router.post('/exclusions', guard, async (req, res) => {
  const reason = ['descartado', 'cliente', 'manual'].includes(req.body?.reason) ? req.body.reason : 'descartado'
  const leads = (Array.isArray(req.body?.leads) ? req.body.leads : []).slice(0, 200).map(leadIn)
  if (!leads.length) return res.status(400).json({ error: 'Nenhum lead para excluir.' })
  try { res.json(await quality.addExclusions(req.user.sub, leads, reason)) } catch (e) { fail(res, e, 'Erro ao salvar na lista de exclusão.') }
})

router.delete('/exclusions/:id', guard, async (req, res) => {
  try {
    const n = await quality.removeExclusion(req.user.sub, req.params.id)
    if (!n) return res.status(404).json({ error: 'Item não encontrado.' })
    res.json({ removed: n })
  } catch (e) { fail(res, e, 'Erro ao remover da lista de exclusão.') }
})

router.get('/profile', guard, async (req, res) => {
  try { res.json(await quality.getProfile(req.user.sub) || { profile: null, unavailable: true }) } catch (e) { fail(res, e, 'Erro ao carregar o perfil.') }
})

router.put('/profile', guard, async (req, res) => {
  try { res.json({ profile: await quality.saveProfile(req.user.sub, req.body?.profile || {}) }) } catch (e) { fail(res, e, 'Erro ao salvar o perfil.') }
})

// ── Base do CNPJ (Receita Federal, importada na VM) ────────────────────────
const MAX_CNPJ_SEARCHES_PER_HOUR = 120
const recentCnpj = new Map()
router.get('/cnpj/status', guard, async (req, res) => {
  try { res.json(await cnpj.status()) } catch (e) { res.json({ ready: false, error: e.message }) }
})
router.get('/cnpj/cnaes', guard, async (req, res) => {
  try { res.json(await cnpj.cnaes(String(req.query.q || '').slice(0, 80))) } catch (e) { fail(res, e, 'Erro ao buscar setores.') }
})
router.get('/cnpj/cidades', guard, async (req, res) => {
  try { res.json(await cnpj.cidades(String(req.query.q || '').slice(0, 80), String(req.query.uf || '').toUpperCase().slice(0, 2))) } catch (e) { fail(res, e, 'Erro ao buscar cidades.') }
})
router.post('/cnpj/search', guard, async (req, res) => {
  const userId = req.user.sub
  const now = Date.now()
  const used = (recentCnpj.get(userId) || []).filter(t => now - t < 3600_000)
  if (used.length >= MAX_CNPJ_SEARCHES_PER_HOUR) return res.status(429).json({ error: `Limite de ${MAX_CNPJ_SEARCHES_PER_HOUR} buscas por hora na base de CNPJ.` })
  recentCnpj.set(userId, [...used, now])
  try {
    const out = await cnpj.search(req.body || {})
    if (out?.error) return res.status(out.notReady ? 503 : 400).json({ error: out.error })
    const screen = await quality.screenFor(userId, out.results)
    const results = out.results.map((l, i) => ({ ...l, inCrm: screen[i].status === 'no_crm', screen: screen[i] }))
    const summary = quality.summarize(screen)
    if (!out.filters.offset) {
      const label = String(req.body?.label || '').slice(0, 200)
      quality.recordSearch(userId, { source: 'cnpj', query: label || `CNAE ${out.filters.cnaes.join(', ')}`, location: String(req.body?.locationLabel || out.filters.uf || 'Brasil').slice(0, 200), requested: out.filters.limit, ...summary, found: out.results.length })
    }
    res.json({ results, hasMore: out.hasMore, baseTotal: out.baseTotal, baseCapped: out.baseCapped, summary, offset: out.filters.offset, limit: out.filters.limit })
  } catch (e) { fail(res, e, 'Erro na busca da base de CNPJ.') }
})

router.get('/searches', guard, async (req, res) => {
  try { res.json(await quality.listSearches(req.user.sub)) } catch (e) { fail(res, e, 'Erro ao carregar o histórico.') }
})

module.exports = router
