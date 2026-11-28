// Leitura de listas de leads (CSV de planilha, Excel exportado ou texto colado).
// Detecta o separador (; , ou tab) e os nomes das colunas em português/inglês.

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const FIELDS = {
  name: ['nome', 'empresa', 'razao social', 'nome fantasia', 'fantasia', 'company', 'name', 'cliente', 'estabelecimento'],
  phone: ['telefone', 'phone', 'celular', 'whatsapp', 'fone', 'tel', 'contato', 'numero'],
  email: ['email', 'e-mail', 'mail'],
  website: ['site', 'website', 'url', 'web', 'pagina'],
  instagram: ['instagram', 'insta', 'ig'],
  city: ['cidade', 'city', 'municipio'],
  state: ['uf', 'estado', 'state'],
  category: ['categoria', 'segmento', 'nicho', 'ramo', 'category', 'atividade', 'setor'],
  cnpj: ['cnpj', 'documento'],
}

export function detectDelimiter(line) {
  const counts = { ';': 0, ',': 0, '\t': 0 }
  let q = false
  for (const ch of line) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++ }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ','
}

export function parseRows(text, delim) {
  const rows = []
  let row = [], cell = '', q = false
  const t = String(text || '').replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === delim) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(c => c.trim())) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some(c => c.trim())) rows.push(row)
  return rows
}

function mapHeader(header) {
  const map = {}
  header.forEach((h, i) => {
    const k = fold(h)
    for (const [field, names] of Object.entries(FIELDS)) {
      if (map[field] != null) continue
      if (names.some(n => k === n || k.startsWith(n + ' ') || k.endsWith(' ' + n) || k.replace(/[^a-z]/g, '') === n.replace(/[^a-z]/g, ''))) { map[field] = i; break }
    }
  })
  return map
}

const phoneLike = (v) => String(v || '').replace(/\D/g, '').length >= 10
const cleanUrl = (v) => {
  const s = String(v || '').trim()
  if (!s || /\s/.test(s) || !/\./.test(s)) return ''
  return s.replace(/\/+$/, '')
}
const cleanInsta = (v) => {
  const s = String(v || '').trim()
  if (!s) return ''
  if (/instagram\.com\//i.test(s)) return s.startsWith('http') ? s : `https://${s}`
  const handle = s.replace(/^@/, '')
  return /^[A-Za-z0-9_.]{2,30}$/.test(handle) ? `https://www.instagram.com/${handle}` : ''
}

// Texto → leads { name, phone, email, website, instagram, city, state, category, cnpj }.
export function parseLeadList(text, { max = 500 } = {}) {
  const first = String(text || '').split(/\r?\n/).find(l => l.trim()) || ''
  const delim = detectDelimiter(first)
  const rows = parseRows(text, delim)
  if (!rows.length) return { leads: [], skipped: 0, columns: {} }
  let map = mapHeader(rows[0])
  let body = rows.slice(1)
  // Sem cabeçalho reconhecível: 1ª coluna = nome, a primeira coluna com cara de telefone = telefone.
  if (map.name == null && map.phone == null) {
    body = rows
    map = { name: 0 }
    const sample = rows[0]
    const pi = sample.findIndex((c, i) => i > 0 && phoneLike(c))
    if (pi >= 0) map.phone = pi
    const ei = sample.findIndex(c => /@/.test(c))
    if (ei >= 0) map.email = ei
  }
  const get = (r, f) => (map[f] != null ? String(r[map[f]] ?? '').trim() : '')
  const leads = []
  let skipped = 0
  for (const r of body.slice(0, max)) {
    const name = get(r, 'name')
    const phoneRaw = get(r, 'phone')
    const email = get(r, 'email').toLowerCase()
    if (!name && !phoneRaw) { skipped++; continue }
    leads.push({
      name: name || phoneRaw,
      phone: phoneLike(phoneRaw) ? phoneRaw.replace(/[^\d+]/g, '') : '',
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
      website: cleanUrl(get(r, 'website')),
      instagram: cleanInsta(get(r, 'instagram')),
      city: get(r, 'city'), state: get(r, 'state'), category: get(r, 'category'),
      cnpj: get(r, 'cnpj').replace(/\D/g, ''),
    })
  }
  return { leads, skipped: skipped + Math.max(0, body.length - max), columns: map }
}
