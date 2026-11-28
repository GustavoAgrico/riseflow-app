// Enriquecimento de leads por fontes públicas (sem custo):
//   1. site da empresa → e-mail, Instagram, Facebook, LinkedIn, WhatsApp e CNPJ (página inicial + contato);
//   2. CNPJ → dados públicos da Receita via BrasilAPI (razão social, porte, atividade, situação, sócios).
// Segurança: só http/https nas portas 80/443, sem IP privado/local (checado a cada redirecionamento),
// tempo e tamanho limitados. Lê só páginas públicas, como um navegador.
const dns = require('dns').promises
const net = require('net')

const TIMEOUT_MS = 7000
const MAX_BYTES = 600_000
const MAX_REDIRECTS = 3
const UA = 'Mozilla/5.0 (compatible; RiseFlowBot/1.0; +https://riseflow-app.pages.dev)'
const CONTACT_PATHS = ['/contato', '/contact', '/fale-conosco', '/sobre']

// ── Funções puras (testadas) ─────────────────────────────────────────────────
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase()
    if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7))
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')
  }
  return true
}

function normalizeUrl(raw) {
  let s = String(raw || '').trim()
  if (!s) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) return null // ftp:, file:, javascript:…
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (!['http:', 'https:'].includes(u.protocol)) return null
    if (u.port && !['80', '443'].includes(u.port)) return null
    if (u.username || u.password) return null
    return u
  } catch { return null }
}

const JUNK_EMAIL = /(example\.|exemplo\.|sentry|wixpress|wix\.com|domain\.com|seudominio|email\.com$|\.png$|\.jpg$|\.jpeg$|\.gif$|\.webp$|\.svg$|godaddy|cloudflare|@2x)/i
const SOCIAL_SKIP = /\/(sharer|share|intent|plugins|tr|dialog|login|p\/|reel\/|explore|hashtag|stories|watch)/i

function cnpjValid(raw) {
  const c = String(raw || '').replace(/\D/g, '')
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const calc = (base) => {
    let sum = 0, w = base.length - 7
    for (const d of base) { sum += Number(d) * w--; if (w < 2) w = 9 }
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = calc(c.slice(0, 12)), d2 = calc(c.slice(0, 12) + d1)
  return c.endsWith(`${d1}${d2}`)
}

function decodeEntities(s) {
  return s.replace(/&#64;|&commat;/gi, '@').replace(/&#46;|&period;/gi, '.').replace(/&amp;/g, '&').replace(/%40/g, '@')
}

// Contatos encontrados no HTML de uma página.
function extractContacts(html, baseHost = '') {
  const text = decodeEntities(String(html || ''))
  const emails = new Set()
  for (const m of text.matchAll(/mailto:([^"'?\s>]+)/gi)) emails.add(m[1].toLowerCase())
  for (const m of text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) emails.add(m[0].toLowerCase())
  const cleanEmails = [...emails].filter(e => !JUNK_EMAIL.test(e) && e.length <= 80)
  // Prefere e-mail do próprio domínio do site.
  const host = baseHost.replace(/^www\./, '')
  cleanEmails.sort((a, b) => Number(b.endsWith(host)) - Number(a.endsWith(host)))

  const social = (re) => {
    for (const m of text.matchAll(re)) {
      const url = m[0].replace(/["'<>\s].*$/, '').replace(/\/+$/, '')
      if (!SOCIAL_SKIP.test(url)) return url.startsWith('http') ? url : `https://${url}`
    }
    return null
  }
  const instagram = social(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/[A-Za-z0-9_.]{2,30}\/?/gi)
  const facebook = social(/(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/[A-Za-z0-9_.-]{3,60}\/?/gi)
  const linkedin = social(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9_-]{2,80}\/?/gi)

  let whatsapp = null
  const wa = text.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp\.com\/send\?phone=)(\+?\d{10,14})/i)
  if (wa) whatsapp = wa[1].replace(/\D/g, '')

  let cnpj = null
  for (const m of text.matchAll(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g)) {
    if (cnpjValid(m[0])) { cnpj = m[0].replace(/\D/g, ''); break }
  }
  return { emails: cleanEmails.slice(0, 3), instagram, facebook, linkedin, whatsapp, cnpj }
}

const merge = (a, b) => ({
  emails: [...new Set([...(a.emails || []), ...(b.emails || [])])].slice(0, 3),
  instagram: a.instagram || b.instagram || null,
  facebook: a.facebook || b.facebook || null,
  linkedin: a.linkedin || b.linkedin || null,
  whatsapp: a.whatsapp || b.whatsapp || null,
  cnpj: a.cnpj || b.cnpj || null,
})

// ── Rede ─────────────────────────────────────────────────────────────────────
async function assertPublicHost(hostname) {
  if (net.isIP(hostname)) { if (isPrivateIp(hostname)) throw new Error('endereço não público'); return }
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(hostname)) throw new Error('endereço não público')
  const addrs = await dns.lookup(hostname, { all: true })
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('endereço não público')
}

async function fetchPage(startUrl) {
  let url = startUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url.hostname)
    const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = normalizeUrl(new URL(res.headers.get('location'), url).toString())
      if (!next) throw new Error('redirecionamento inválido')
      url = next
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const type = res.headers.get('content-type') || ''
    if (!/text\/html|application\/xhtml/i.test(type)) throw new Error('não é página HTML')
    const reader = res.body.getReader()
    let size = 0, html = ''
    const dec = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      html += dec.decode(value, { stream: true })
      if (size > MAX_BYTES) { try { await reader.cancel() } catch { /* ok */ } break }
    }
    return { html, finalUrl: url }
  }
  throw new Error('redirecionamentos demais')
}

async function enrichWebsite(website) {
  const start = normalizeUrl(website)
  if (!start) return { error: 'site inválido' }
  try {
    const home = await fetchPage(start)
    let found = extractContacts(home.html, home.finalUrl.hostname)
    // Sem e-mail na página inicial: tenta as páginas de contato mais comuns.
    for (const p of CONTACT_PATHS) {
      if (found.emails.length && (found.instagram || found.cnpj)) break
      try {
        const page = await fetchPage(new URL(p, home.finalUrl))
        found = merge(found, extractContacts(page.html, home.finalUrl.hostname))
      } catch { /* página não existe */ }
    }
    return { ...found, site: home.finalUrl.origin }
  } catch (e) {
    return { error: String(e?.message || e).slice(0, 120) }
  }
}

// CNPJ → dados públicos (BrasilAPI). Cache em memória por 1 dia.
const cnpjCache = new Map()
async function lookupCnpj(cnpj) {
  const c = String(cnpj || '').replace(/\D/g, '')
  if (!cnpjValid(c)) return null
  const hit = cnpjCache.get(c)
  if (hit && Date.now() - hit.at < 86_400_000) return hit.data
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const d = await res.json()
    const data = {
      cnpj: c,
      razao_social: d.razao_social || null,
      nome_fantasia: d.nome_fantasia || null,
      porte: d.porte || d.descricao_porte || null,
      atividade: d.cnae_fiscal_descricao || null,
      situacao: d.descricao_situacao_cadastral || null,
      abertura: d.data_inicio_atividade || null,
      cidade: d.municipio || null, uf: d.uf || null,
      email: d.email ? String(d.email).toLowerCase() : null,
      socios: (Array.isArray(d.qsa) ? d.qsa : []).slice(0, 5).map(s => ({ nome: s.nome_socio, cargo: s.qualificacao_socio })).filter(s => s.nome),
    }
    cnpjCache.set(c, { at: Date.now(), data })
    return data
  } catch { return null }
}

// Enriquecimento completo de um lead (site + CNPJ). Nunca lança: erros viram campo error.
async function enrichLead({ website, cnpj }) {
  const out = website ? await enrichWebsite(website) : {}
  const doc = cnpj || out.cnpj
  if (doc) {
    const company = await lookupCnpj(doc)
    if (company) {
      out.company = company
      if (company.email && !(out.emails || []).includes(company.email)) out.emails = [...(out.emails || []), company.email].slice(0, 3)
    }
  }
  return out
}

// Vários leads com no máximo 4 ao mesmo tempo.
async function enrichMany(items, concurrency = 4) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = { key: items[i].key, ...(await enrichLead(items[i])) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

module.exports = { enrichWebsite, enrichLead, enrichMany, lookupCnpj, extractContacts, cnpjValid, isPrivateIp, normalizeUrl }
