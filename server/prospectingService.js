// Regras da prospecção compartilhadas pela tela (routes/prospecting.js) e pelos
// agentes (ferramentas search_leads, import_leads e queue_ai_call).
const { supabase } = require('./supabaseClient')
const { emitSalesUpdate } = require('./realtime')
const el = require('./elevenlabs')
const leadSearch = require('./leadSearch')
const { getConfig } = require('./aiCallSettings')

const MAX_RESULTS = 50
const ACTIVE_CALL = ['queued', 'dialing', 'initiated', 'in-progress', 'processing']

function httpError(status, message, extra = {}) {
  return Object.assign(new Error(message), { status, ...extra })
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

// Busca no Google Maps sem custo: a busca cabe no crédito grátis do mês ou não acontece.
async function searchFreeLeads(userId, { query, location, max }) {
  if (!leadSearch.isConfigured()) throw httpError(503, 'Busca de leads não configurada no servidor (APIFY_TOKEN).')
  const credit = await leadSearch.getCredit()
  const allowed = Math.min(max, credit.maxPlaces)
  if (allowed < 5 || credit.remainingUsd < leadSearch.APIFY_MIN_CAP_USD) throw httpError(402, 'O crédito grátis do mês acabou. A busca volta quando o crédito renovar.', { credit })
  const [places, have] = await Promise.all([
    leadSearch.searchGoogleMaps({ query, location, max: allowed, capUsd: credit.remainingUsd }),
    crmPhones(userId),
  ])
  console.log(`[prospecting] busca "${query}" em "${location}": ${places.length} empresas (limite ${allowed})`)
  return {
    results: places.map(p => ({ ...p, inCrm: Boolean(p.phone && have.has(p.phone)) })),
    requested: max,
    allowed,
    credit: await leadSearch.getCredit().catch(() => credit),
  }
}

// Importa leads para Clientes (sem duplicar telefone) e, com call, põe na fila de ligação por IA.
async function importLeads(userId, leadsIn, { call = false, source = 'google_maps' } = {}) {
  const leads = Array.isArray(leadsIn) ? leadsIn.slice(0, MAX_RESULTS) : []
  if (!leads.length) throw httpError(400, 'Nenhum lead selecionado.')
  const cfg = await getConfig(userId)
  if (call && !el.isConfigured(cfg)) throw httpError(503, 'Ligações não configuradas. Abra Configurações → Ligações com IA.')
  const have = await crmPhones(userId)
  const allowed = el.testNumbers(cfg)
  const out = { imported: 0, skipped: 0, queued: 0, notQueued: 0, testMode: allowed.length > 0, clientIds: [] }

  for (const l of leads) {
    const phone = el.toE164(l?.phone)
    const name = String(l?.name || '').trim().slice(0, 200)
    if (!phone || !name || have.has(phone)) { out.skipped++; continue }

    const str = (v, n = 300) => (v == null || v === '' ? null : String(v).slice(0, n))
    const tier = ['A', 'B', 'C'].includes(l.tier) ? l.tier : null
    const tags = [source === 'lista' ? 'Prospect Lista' : 'Prospect Maps', ...(tier ? [`Tier ${tier}`] : [])]
    const email = str(l.email, 120) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email) ? String(l.email).toLowerCase() : null
    const client = await insertClient(
      { user_id: userId, name, company: name, phone: phone.slice(1), stage: 'lead', status: 'active', tags, value: 0, ...(email ? { email } : {}) },
      {
        source,
        source_meta: {
          category: str(l.category, 120), address: str(l.address), city: str(l.city, 120), state: str(l.state, 60),
          website: str(l.website), rating: l.rating ?? null, reviews: l.reviews ?? null,
          maps_url: str(l.mapsUrl, 500), place_id: str(l.placeId, 200),
          instagram: str(l.instagram), facebook: str(l.facebook), linkedin: str(l.linkedin), whatsapp: str(l.whatsapp, 20),
          cnpj: str(l.cnpj, 20), razao_social: str(l.company?.razao_social, 200), porte: str(l.company?.porte, 60),
          atividade: str(l.company?.atividade, 200), situacao: str(l.company?.situacao, 40),
          socios: Array.isArray(l.company?.socios) ? l.company.socios.slice(0, 5).map(s => ({ nome: str(s?.nome, 120), cargo: str(s?.cargo, 80) })) : null,
          icp_score: Number.isFinite(l.icpScore) ? l.icpScore : null, tier, icp_reasons: Array.isArray(l.icpReasons) ? l.icpReasons.slice(0, 6).map(r => str(r, 80)) : null,
        },
      },
    )
    have.add(phone)
    out.imported++
    out.clientIds.push(client.id)

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
  return out
}

// Põe um lead já cadastrado na fila de ligação por IA (mesmas travas da importação).
async function queueCall(userId, clientId) {
  const cfg = await getConfig(userId)
  if (!el.isConfigured(cfg)) throw httpError(503, 'Ligações não configuradas. Abra Configurações → Ligações com IA.')
  const { data: client, error } = await supabase.from('clients').select('id, name, phone')
    .eq('id', clientId).eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (!client) throw httpError(404, 'Lead não encontrado.')
  const phone = el.toE164(client.phone)
  if (!phone) throw httpError(400, 'O lead não tem um telefone válido.')
  const allowed = el.testNumbers(cfg)
  if (allowed.length && !allowed.includes(phone)) throw httpError(403, 'Modo teste: este número não está na lista de números de teste.')
  const { data: open } = await supabase.from('ai_calls').select('id').eq('user_id', userId).eq('client_id', client.id).in('status', ACTIVE_CALL).limit(1)
  if (open?.length) throw httpError(409, 'Este lead já está na fila ou em ligação.')
  const { data: row, error: insErr } = await supabase.from('ai_calls')
    .insert({ user_id: userId, client_id: client.id, to_number: phone, status: 'queued' }).select('id, status').single()
  if (insErr) throw insErr
  return { call_id: row.id, status: row.status, client: { id: client.id, name: client.name } }
}

module.exports = { MAX_RESULTS, crmPhones, searchFreeLeads, importLeads, queueCall }
