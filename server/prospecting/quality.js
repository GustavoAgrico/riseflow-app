// Prospecção — Fase 1: qualidade dos leads.
//   • chaves de identidade de um lead: telefone, CNPJ raiz (8 dígitos) e domínio do site/e-mail;
//   • triagem: novo | no_crm | excluido | repetido (dentro da mesma lista);
//   • lista de exclusão (descartado, pediu para sair, já é cliente, manual);
//   • validação de WhatsApp pelo número conectado (devagar, com cache de 30 dias);
//   • perfil de cliente ideal salvo na conta e histórico de buscas.
// Sem a migração prospecting_quality.sql, tudo degrada para "sem exclusões/sem histórico".
const { supabase, isConfigured } = require('../supabaseClient')

// ── Funções puras (testadas) ────────────────────────────────────────────────
function phoneKey(raw) {
  const s = String(raw || '').trim()
  let d = s.replace(/\D/g, '')
  if (!d) return null
  const intl = s.startsWith('+')
  if (!intl && (d.length === 10 || d.length === 11)) d = '55' + d
  if (d.length < (intl ? 11 : 12) || d.length > 15) return null
  return d
}

function cnpjRoot(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  return d.length === 14 ? d.slice(0, 8) : null
}

// Domínios que não identificam uma empresa (e-mail grátis, redes, encurtadores…).
const GENERIC = new Set([
  'gmail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'yahoo.com.br', 'bol.com.br', 'uol.com.br',
  'terra.com.br', 'icloud.com', 'msn.com', 'ig.com.br', 'globo.com', 'protonmail.com',
  'instagram.com', 'facebook.com', 'fb.com', 'wa.me', 'whatsapp.com', 'linktr.ee', 'linkin.bio', 'google.com',
  'goo.gl', 'g.page', 'bit.ly', 'youtube.com', 'tiktok.com', 'linkedin.com', 'x.com', 'twitter.com', 'ifood.com.br',
])
// Hospedagens compartilhadas: o site da empresa é o subdomínio inteiro.
const SHARED_HOSTS = ['wixsite.com', 'business.site', 'negocio.site', 'blogspot.com', 'wordpress.com', 'webnode.page', 'webnode.com.br', 'squarespace.com', 'netlify.app', 'vercel.app', 'carrd.co', 'site.com.br']

function domainKey(raw) {
  let s = String(raw || '').trim().toLowerCase()
  if (!s) return null
  if (s.includes('@') && !s.includes('/')) s = s.split('@').pop()
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#:]/)[0].replace(/^www\./, '').replace(/\.$/, '')
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null
  const shared = SHARED_HOSTS.find(h => s === h || s.endsWith('.' + h))
  if (shared) return s === shared ? null : s
  const parts = s.split('.')
  const base = parts.length >= 3 && parts.at(-1) === 'br' && parts.at(-2).length <= 3 ? parts.slice(-3).join('.') : parts.slice(-2).join('.')
  return GENERIC.has(base) ? null : base
}

// Todas as chaves de um lead, no formato "tipo:valor".
function leadKeys(lead = {}) {
  const keys = new Set()
  for (const p of [lead.phone, lead.whatsapp]) { const k = phoneKey(p); if (k) keys.add(`phone:${k}`) }
  const c = cnpjRoot(lead.cnpj || lead.company?.cnpj); if (c) keys.add(`cnpj_root:${c}`)
  for (const d of [lead.website, lead.email, ...(Array.isArray(lead.emails) ? lead.emails : [])]) { const k = domainKey(d); if (k) keys.add(`domain:${k}`) }
  return [...keys]
}

// Triagem de uma lista. excluded/crm: Map "tipo:valor" → rótulo/motivo (ou Set).
const has = (m, k) => (m instanceof Map ? m.has(k) : m.has(k))
const reasonOf = (m, k) => (m instanceof Map ? m.get(k) : null)
function screenLeads(leads, { excluded = new Map(), crm = new Set() } = {}) {
  const seen = new Map()
  return leads.map((lead, i) => {
    const keys = leadKeys(lead)
    const exKey = keys.find(k => has(excluded, k))
    if (exKey) return { status: 'excluido', reason: reasonOf(excluded, exKey) || 'manual', match: exKey }
    const crmKey = keys.find(k => has(crm, k))
    if (crmKey) return { status: 'no_crm', match: crmKey }
    const dupKey = keys.find(k => seen.has(k))
    if (dupKey) return { status: 'repetido', of: seen.get(dupKey), match: dupKey }
    keys.forEach(k => seen.set(k, lead.key ?? i))
    return { status: 'novo' }
  })
}

const OPT_OUT = /^(sair|parar|pare|stop|cancelar|descadastrar|remover|nao quero|não quero|nao quero receber|não quero receber|me tira da lista|me remova)[.!\s]*$/i
const isOptOut = (text) => OPT_OUT.test(String(text || '').trim())

// ── Banco ───────────────────────────────────────────────────────────────────
let missingLogged = false
function missing(error) {
  const code = String(error?.code || '')
  if (['42P01', 'PGRST205', 'PGRST204'].includes(code) || /does not exist|schema cache/i.test(error?.message || '')) {
    if (!missingLogged) { console.warn('[prospecção] tabelas de qualidade ausentes — rode supabase/prospecting_quality.sql'); missingLogged = true }
    return true
  }
  return false
}

async function exclusionMap(userId) {
  const map = new Map()
  if (!isConfigured) return map
  const { data, error } = await supabase.from('lead_exclusions').select('kind, value, reason').eq('user_id', userId).limit(20000)
  if (error) { if (missing(error)) return map; throw error }
  for (const r of data || []) map.set(`${r.kind}:${r.value}`, r.reason)
  return map
}

async function crmKeys(userId) {
  const set = new Set()
  if (!isConfigured) return set
  let r = await supabase.from('clients').select('phone, email, source_meta').eq('user_id', userId).limit(20000)
  if (r.error && /source_meta/i.test(r.error.message || '')) r = await supabase.from('clients').select('phone, email').eq('user_id', userId).limit(20000)
  if (r.error) throw r.error
  for (const c of r.data || []) {
    leadKeys({ phone: c.phone, email: c.email, website: c.source_meta?.website, cnpj: c.source_meta?.cnpj }).forEach(k => set.add(k))
  }
  return set
}

async function screenFor(userId, leads) {
  const [excluded, crm] = await Promise.all([exclusionMap(userId), crmKeys(userId)])
  return screenLeads(leads, { excluded, crm })
}

const summarize = (screen) => ({
  found: screen.length,
  new_count: screen.filter(s => s.status === 'novo').length,
  excluded: screen.filter(s => s.status === 'excluido').length,
  in_crm: screen.filter(s => s.status === 'no_crm').length,
})

// Exclui todas as chaves de um ou mais leads. reason: descartado | opt_out | cliente | manual.
async function addExclusions(userId, leads, reason = 'descartado') {
  const rows = []
  for (const l of leads) {
    const label = String(l?.name || '').slice(0, 120) || null
    for (const k of leadKeys(l)) {
      const [kind, value] = k.split(/:(.*)/s)
      rows.push({ user_id: userId, kind, value, reason, label })
    }
  }
  if (!rows.length) return { added: 0 }
  const { error } = await supabase.from('lead_exclusions').upsert(rows, { onConflict: 'user_id,kind,value', ignoreDuplicates: true })
  if (error) { if (missing(error)) throw Object.assign(new Error('Lista de exclusão indisponível: rode a migração prospecting_quality.sql.'), { status: 503 }); throw error }
  return { added: rows.length }
}

async function listExclusions(userId, limit = 200) {
  const { data, error } = await supabase.from('lead_exclusions').select('id, kind, value, reason, label, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(limit)
  if (error) { if (missing(error)) return []; throw error }
  return data || []
}

async function removeExclusion(userId, id) {
  const { data, error } = await supabase.from('lead_exclusions').delete().eq('id', id).eq('user_id', userId).select('id')
  if (error) throw error
  return (data || []).length
}

// Mensagem "SAIR" de um contato → telefone entra na exclusão (não bloqueia o chat).
async function maybeOptOut({ userId, phone, text }) {
  if (!isConfigured || !userId || !isOptOut(text)) return false
  const k = phoneKey(phone)
  if (!k) return false
  const { error } = await supabase.from('lead_exclusions')
    .upsert({ user_id: userId, kind: 'phone', value: k, reason: 'opt_out' }, { onConflict: 'user_id,kind,value' })
  if (error) { if (!missing(error)) console.warn('[prospecção] opt-out:', error.message); return false }
  console.log(`[prospecção] contato pediu para sair → exclusão (${k.slice(0, 4)}…)`)
  return true
}

// ── Validação de WhatsApp ───────────────────────────────────────────────────
const CHECK_BATCH = 25
const CHECK_PER_HOUR = 200
const CHECK_CACHE_DAYS = 30
const checkHits = new Map()

function takeCheckQuota(userId, n) {
  const now = Date.now()
  const used = (checkHits.get(userId) || []).filter(t => now - t < 3600_000)
  if (used.length + n > CHECK_PER_HOUR) { checkHits.set(userId, used); return false }
  checkHits.set(userId, [...used, ...Array(n).fill(now)])
  return true
}

// phones → { results: [{ phone, whatsapp: true|false|null, cached }], checked, fromCache }
async function checkWhatsApp(userId, phonesIn, { baileys }) {
  const phones = [...new Set((phonesIn || []).map(phoneKey).filter(Boolean))].slice(0, CHECK_BATCH)
  if (!phones.length) throw Object.assign(new Error('Nenhum telefone válido para validar.'), { status: 400 })
  const since = new Date(Date.now() - CHECK_CACHE_DAYS * 86400_000).toISOString()
  const cache = new Map()
  const { data: cached, error } = await supabase.from('whatsapp_checks').select('phone, has_whatsapp')
    .eq('user_id', userId).in('phone', phones).gte('checked_at', since)
  if (error && !missing(error)) throw error
  for (const c of cached || []) cache.set(c.phone, c.has_whatsapp)

  const todo = phones.filter(p => !cache.has(p))
  const fresh = new Map()
  if (todo.length) {
    if (!takeCheckQuota(userId, todo.length)) throw Object.assign(new Error(`Limite de ${CHECK_PER_HOUR} validações por hora (protege o seu número). Tente mais tarde.`), { status: 429 })
    let data
    try {
      ({ data } = await baileys.post('/check-numbers', { userId, numbers: todo }, { timeout: 150_000 }))
    } catch (e) {
      const msg = e?.response?.data?.error || e.message
      const notConnected = /não conectado|not connected/i.test(msg || '') || e?.response?.status === 404
      throw Object.assign(new Error(notConnected ? 'Conecte o WhatsApp em Integrações para validar os números.' : `Não foi possível validar agora: ${msg}`), { status: notConnected ? 409 : 502 })
    }
    for (const r of data?.results || []) if (r && typeof r.exists === 'boolean') fresh.set(String(r.number), r.exists)
    const rows = [...fresh].map(([phone, ok]) => ({ user_id: userId, phone, has_whatsapp: ok, checked_at: new Date().toISOString() }))
    if (rows.length) {
      const { error: upErr } = await supabase.from('whatsapp_checks').upsert(rows, { onConflict: 'user_id,phone' })
      if (upErr && !missing(upErr)) console.warn('[prospecção] cache whatsapp:', upErr.message)
    }
  }
  return {
    results: phones.map(p => ({ phone: p, whatsapp: cache.has(p) ? cache.get(p) : fresh.has(p) ? fresh.get(p) : null, cached: cache.has(p) })),
    checked: fresh.size,
    fromCache: cache.size,
  }
}

// ── Perfil e histórico ──────────────────────────────────────────────────────
const PROFILE_FIELDS = { segments: 'str', cities: 'str', minRating: 'num', minReviews: 'num', needPhone: 'bool', needEmail: 'bool', needInstagram: 'bool', needSite: 'bool', needWhatsapp: 'bool' }
function cleanProfile(p = {}) {
  const out = {}
  for (const [k, t] of Object.entries(PROFILE_FIELDS)) {
    if (!(k in p)) continue
    if (t === 'str') out[k] = String(p[k] ?? '').slice(0, 300)
    else if (t === 'num') out[k] = Math.max(0, Math.min(1000, Number(p[k]) || 0))
    else out[k] = Boolean(p[k])
  }
  return out
}

async function getProfile(userId) {
  const { data, error } = await supabase.from('prospecting_profiles').select('profile, updated_at').eq('user_id', userId).maybeSingle()
  if (error) { if (missing(error)) return null; throw error }
  return data ? { profile: data.profile, updatedAt: data.updated_at } : { profile: null }
}

async function saveProfile(userId, profile) {
  const clean = cleanProfile(profile)
  const { error } = await supabase.from('prospecting_profiles')
    .upsert({ user_id: userId, profile: clean, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) { if (missing(error)) throw Object.assign(new Error('Perfil na conta indisponível: rode a migração prospecting_quality.sql.'), { status: 503 }); throw error }
  return clean
}

async function recordSearch(userId, entry) {
  if (!isConfigured) return
  const row = {
    user_id: userId, source: entry.source, query: String(entry.query || '').slice(0, 200) || null,
    location: String(entry.location || '').slice(0, 200) || null, requested: entry.requested ?? null,
    found: entry.found || 0, new_count: entry.new_count || 0, excluded: entry.excluded || 0, in_crm: entry.in_crm || 0,
    cost_usd: Math.max(0, Number(entry.cost_usd) || 0),
  }
  const { error } = await supabase.from('lead_searches').insert(row)
  if (error && !missing(error)) console.warn('[prospecção] histórico:', error.message)
}

async function listSearches(userId, limit = 20) {
  const { data, error } = await supabase.from('lead_searches')
    .select('id, source, query, location, requested, found, new_count, excluded, in_crm, cost_usd, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(limit)
  if (error) { if (missing(error)) return []; throw error }
  return data || []
}

module.exports = {
  phoneKey, cnpjRoot, domainKey, leadKeys, screenLeads, summarize, isOptOut, cleanProfile,
  exclusionMap, crmKeys, screenFor, addExclusions, listExclusions, removeExclusion, maybeOptOut,
  checkWhatsApp, getProfile, saveProfile, recordSearch, listSearches,
  CHECK_BATCH, CHECK_PER_HOUR,
}
