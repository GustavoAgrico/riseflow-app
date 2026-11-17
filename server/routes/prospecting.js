// Prospecção com IA: busca empresas no Google Maps, importa para o CRM e,
// se pedido, coloca os leads na fila de ligações da IA (aiCallQueue.js).
//   POST /api/prospecting/search            { query, location, max }
//   POST /api/prospecting/import            { leads: [...], call: boolean }
//   GET  /api/prospecting/queue                                   → fila e últimas ligações
//   POST /api/prospecting/queue/:id/cancel                        → tira da fila
const { Router } = require('express')
const { supabase, isConfigured } = require('../supabaseClient')
const { emitSalesUpdate } = require('../realtime')
const el = require('../elevenlabs')
const leadSearch = require('../leadSearch')

const router = Router()

const MAX_RESULTS = 50
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

async function crmPhones(userId) {
  const { data, error } = await supabase.from('clients').select('phone').eq('user_id', userId)
  if (error) throw error
  return new Set((data || []).map(c => el.toE164(c.phone)).filter(Boolean))
}

// Insere o lead; se as colunas de origem (source/source_meta) ainda não existirem no banco, insere sem elas.
async function insertClient(base, extra) {
  let r = await supabase.from('clients').insert({ ...base, ...extra }).select('id').single()
  if (r.error && /source/i.test(r.error.message || '')) r = await supabase.from('clients').insert(base).select('id').single()
  if (r.error) throw r.error
  return r.data
}

router.post('/search', guard, async (req, res) => {
  const userId = req.user?.sub
  if (!leadSearch.isConfigured()) return res.status(503).json({ error: 'Busca de leads não configurada no servidor (APIFY_TOKEN).' })
  const query = String(req.body?.query || '').trim().slice(0, 120)
  const location = String(req.body?.location || '').trim().slice(0, 120)
  const max = Math.min(MAX_RESULTS, Math.max(5, parseInt(req.body?.max, 10) || 20))
  if (!query || !location) return res.status(400).json({ error: 'Informe o que buscar e onde.' })
  if (hitSearchLimit(userId)) return res.status(429).json({ error: `Limite de ${MAX_SEARCHES_PER_HOUR} buscas por hora atingido.` })

  try {
    const [places, have] = await Promise.all([leadSearch.searchGoogleMaps({ query, location, max }), crmPhones(userId)])
    console.log(`[prospecting] busca "${query}" em "${location}": ${places.length} empresas`)
    res.json({
      results: places.map(p => ({ ...p, inCrm: Boolean(p.phone && have.has(p.phone)) })),
      estimatedUsd: leadSearch.estimateUsd(max),
    })
  } catch (e) {
    console.error('[prospecting] erro na busca:', e?.message)
    res.status(502).json({ error: e?.message ?? 'Erro na busca de leads.' })
  }
})

router.post('/import', guard, async (req, res) => {
  const userId = req.user?.sub
  const leads = Array.isArray(req.body?.leads) ? req.body.leads.slice(0, MAX_RESULTS) : []
  const call = Boolean(req.body?.call)
  if (!leads.length) return res.status(400).json({ error: 'Nenhum lead selecionado.' })
  if (call && !el.isConfigured()) return res.status(503).json({ error: 'Ligação por IA não configurada no servidor (ElevenLabs).' })

  try {
    const have = await crmPhones(userId)
    const allowed = el.testNumbers()
    const out = { imported: 0, skipped: 0, queued: 0, notQueued: 0, testMode: allowed.length > 0 }

    for (const l of leads) {
      const phone = el.toE164(l?.phone)
      const name = String(l?.name || '').trim().slice(0, 200)
      if (!phone || !name || have.has(phone)) { out.skipped++; continue }

      const client = await insertClient(
        { user_id: userId, name, company: name, phone: phone.slice(1), stage: 'lead', status: 'active', tags: ['Prospect Maps'], value: 0 },
        {
          source: 'google_maps',
          source_meta: {
            category: l.category || null, address: l.address || null, city: l.city || null, state: l.state || null,
            website: l.website || null, rating: l.rating ?? null, reviews: l.reviews ?? null,
            maps_url: l.mapsUrl || null, place_id: l.placeId || null,
          },
        },
      )
      have.add(phone)
      out.imported++

      if (call) {
        // Em modo teste, só entram na fila os números liberados.
        if (allowed.length && !allowed.includes(phone)) { out.notQueued++; continue }
        const { error } = await supabase.from('ai_calls').insert({ user_id: userId, client_id: client.id, to_number: phone, status: 'queued' })
        if (error) throw error
        out.queued++
      }
    }

    if (out.imported) emitSalesUpdate(userId, 'clients')
    console.log(`[prospecting] importados ${out.imported}, na fila ${out.queued}`)
    res.json(out)
  } catch (e) {
    console.error('[prospecting] erro ao importar:', e?.message)
    res.status(500).json({ error: e?.message ?? 'Erro ao importar leads.' })
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
