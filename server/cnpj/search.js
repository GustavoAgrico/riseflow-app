// Busca na base local do CNPJ (SQLite gerado por importer.js). Funções puras
// sobre um DatabaseSync aberto — o servidor as chama dentro de worker.js.
const L = require('./layout')

const MAX_LIMIT = 100
const COUNT_CAP = 5000

const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null)
const ymd = (years) => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

// Parâmetros da tela → filtros validados.
function normalize(p = {}) {
  const cnaes = [...new Set((Array.isArray(p.cnaes) ? p.cnaes : [p.cnaes]).map(int).filter(n => n && n >= 100000 && n <= 9999999))].slice(0, 20)
  const uf = /^[A-Z]{2}$/.test(String(p.uf || '').toUpperCase()) ? String(p.uf).toUpperCase() : null
  const cidade = int(p.cidade) || null
  const portes = [...new Set((Array.isArray(p.portes) ? p.portes : []).map(int).filter(n => [1, 3, 5].includes(n)))]
  const mei = ['only', 'exclude'].includes(p.mei) ? p.mei : 'any'
  const phone = ['has', 'mobile'].includes(p.phone) ? p.phone : 'any'
  const minYears = Math.max(0, Math.min(80, int(p.minYears) || 0))
  const maxYears = Math.max(0, Math.min(80, int(p.maxYears) || 0))
  return {
    cnaes, uf, cidade: uf ? cidade : null, portes, mei, phone,
    simples: p.simples === 'only' ? 'only' : 'any',
    email: Boolean(p.email), matriz: Boolean(p.matriz),
    minYears, maxYears: maxYears && maxYears >= minYears ? maxYears : 0,
    capitalMin: Math.max(0, Number(p.capitalMin) || 0),
    order: ['antigas', 'novas'].includes(p.order) ? p.order : 'novas',
    limit: Math.max(1, Math.min(MAX_LIMIT, int(p.limit) || 50)),
    offset: Math.max(0, Math.min(10000, int(p.offset) || 0)),
  }
}

// → { sql, args, countSql } (exige setor ou cidade: sem isso varreria o Brasil inteiro).
function buildQuery(params) {
  const f = normalize(params)
  if (!f.cnaes.length && !f.cidade) return { error: 'Escolha pelo menos um setor (CNAE) ou uma cidade.' }
  const where = []
  const args = []
  if (f.cnaes.length) { where.push(`e.cnae in (${f.cnaes.map(() => '?').join(',')})`); args.push(...f.cnaes) }
  if (f.uf) { where.push('e.uf = ?'); args.push(f.uf) }
  if (f.cidade) { where.push('e.municipio = ?'); args.push(f.cidade) }
  if (f.phone === 'has') where.push('e.tel1 is not null')
  if (f.phone === 'mobile') where.push('e.celular = 1')
  if (f.email) where.push('e.email is not null')
  if (f.matriz) where.push('e.matriz = 1')
  if (f.minYears) { where.push('e.abertura <= ?'); args.push(ymd(f.minYears)) }
  if (f.maxYears) { where.push('e.abertura >= ?'); args.push(ymd(f.maxYears)) }
  const needCompany = f.portes.length || f.mei !== 'any' || f.simples === 'only' || f.capitalMin > 0
  if (f.portes.length) where.push(`p.porte in (${f.portes.join(',')})`)
  if (f.mei === 'only') where.push('p.mei = 1')
  if (f.mei === 'exclude') where.push('coalesce(p.mei, 0) = 0')
  if (f.simples === 'only') where.push('p.simples = 1')
  if (f.capitalMin > 0) { where.push('p.capital >= ?'); args.push(f.capitalMin) }
  const join = `${needCompany ? 'join' : 'left join'} empresas p on p.basico = e.basico`
  const w = where.length ? `where ${where.join(' and ')}` : ''
  // rowid desempata sem atrapalhar os índices (cnae, uf, municipio, abertura) já ordenados.
  const order = f.order === 'antigas' ? 'e.abertura asc, e.rowid asc' : 'e.abertura desc, e.rowid desc'
  const sql = `select e.cnpj, e.matriz, e.fantasia, e.abertura, e.cnae, e.uf, e.municipio, e.bairro, e.cep, e.endereco,
      e.tel1, e.tel2, e.email, e.celular, p.razao, p.capital, p.porte, p.simples, p.mei, c.name as cnae_name, m.name as cidade
    from estab e ${join}
    left join cnaes c on c.code = e.cnae
    left join cidades m on m.uf = e.uf and m.code = e.municipio
    ${w} order by ${order} limit ? offset ?`
  // Total "no setor/região/idade": só colunas do índice → barato. Os demais filtros
  // (celular, e-mail, porte…) não entram na conta; quem diz se há mais é limit+1.
  const baseWhere = []
  const baseArgs = []
  if (f.cnaes.length) { baseWhere.push(`cnae in (${f.cnaes.map(() => '?').join(',')})`); baseArgs.push(...f.cnaes) }
  if (f.uf) { baseWhere.push('uf = ?'); baseArgs.push(f.uf) }
  if (f.cidade) { baseWhere.push('municipio = ?'); baseArgs.push(f.cidade) }
  if (f.minYears) { baseWhere.push('abertura <= ?'); baseArgs.push(ymd(f.minYears)) }
  if (f.maxYears) { baseWhere.push('abertura >= ?'); baseArgs.push(ymd(f.maxYears)) }
  const countSql = `select count(*) as n from (select 1 from estab where ${baseWhere.join(' and ')} limit ${COUNT_CAP + 1})`
  return { sql, args: [...args, f.limit + 1, f.offset], countArgs: baseArgs, countSql, filters: f }
}

// Índices que a busca usa (criados pelo importer.js).
const INDEXES = [
  'create index if not exists estab_cnae_loc on estab (cnae, uf, municipio, abertura)',
  'create index if not exists estab_cnae_age on estab (cnae, abertura)',
  'create index if not exists estab_loc_age on estab (uf, municipio, abertura)',
]

const fmtPhone = (p) => (p ? (p.length === 11 ? `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}` : `(${p.slice(0, 2)}) ${p.slice(2, 6)}-${p.slice(6)}`) : '')
const fmtCnpj = (c) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
const isoDate = (d) => (d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null)

// Linha do banco → lead no formato da Prospecção.
function toLead(r) {
  // Prefere o celular (mais chance de WhatsApp).
  const phones = [r.tel1, r.tel2].filter(Boolean)
  const best = phones.find(L.isMobile) || phones[0] || ''
  const other = phones.find(p => p !== best) || ''
  const porte = r.mei ? 'MEI' : L.PORTE[r.porte] || null
  const name = r.fantasia || r.razao || fmtCnpj(r.cnpj)
  return {
    key: `cnpj-${r.cnpj}`,
    name,
    phone: best ? `+55${best}` : '',
    phoneDisplay: fmtPhone(best),
    phone2: other ? `+55${other}` : '',
    mobile: L.isMobile(best),
    email: r.email || '',
    city: r.cidade || '',
    state: r.uf || '',
    category: r.cnae_name || '',
    address: [r.endereco, r.bairro].filter(Boolean).join(' · '),
    cnpj: r.cnpj,
    company: {
      cnpj: r.cnpj, razao_social: r.razao || null, nome_fantasia: r.fantasia || null, porte,
      atividade: r.cnae_name || null, cnae: r.cnae, situacao: 'ATIVA', abertura: isoDate(r.abertura),
      cidade: r.cidade || null, uf: r.uf, capital: r.capital ?? null, simples: Boolean(r.simples), mei: Boolean(r.mei), matriz: Boolean(r.matriz),
    },
  }
}

function search(db, params) {
  const q = buildQuery(params)
  if (q.error) return { error: q.error }
  const rows = db.prepare(q.sql).all(...q.args)
  const hasMore = rows.length > q.filters.limit
  const n = db.prepare(q.countSql).get(...q.countArgs).n
  return {
    results: rows.slice(0, q.filters.limit).map(toLead),
    hasMore,
    baseTotal: Math.min(n, COUNT_CAP), baseCapped: n > COUNT_CAP, // empresas ativas no setor/região/idade (antes dos filtros de contato/porte)
    filters: q.filters,
  }
}

function findCnaes(db, text, limit = 15) {
  const t = L.fold(text)
  if (/^\d{4,7}$/.test(t.replace(/\D/g, '')) && /^[\d\s./-]+$/.test(t)) {
    const digits = t.replace(/\D/g, '')
    return db.prepare("select code, name, total from cnaes where cast(code as text) like ? order by total desc limit ?").all(`${digits}%`, limit)
  }
  const words = t.split(' ').filter(w => w.length >= 3).slice(0, 4)
  if (!words.length) return []
  return db.prepare(`select code, name, total from cnaes where ${words.map(() => 'name_fold like ?').join(' and ')} order by total desc limit ?`)
    .all(...words.map(w => `%${w}%`), limit)
}

function findCidades(db, text, uf, limit = 15) {
  const t = L.fold(text)
  if (t.length < 2) return []
  const args = [`${t}%`]
  let sql = 'select uf, code, name, total from cidades where name_fold like ?'
  if (/^[A-Z]{2}$/.test(String(uf || ''))) { sql += ' and uf = ?'; args.push(uf) }
  return db.prepare(`${sql} order by total desc limit ?`).all(...args, limit)
}

function status(db) {
  const get = (k) => db.prepare('select value from meta where key = ?').get(k)?.value || null
  return { ready: true, competencia: get('competencia'), importedAt: get('imported_at'), estabelecimentos: Number(get('estabelecimentos')) || null }
}

module.exports = { normalize, buildQuery, toLead, search, findCnaes, findCidades, status, fmtPhone, INDEXES, MAX_LIMIT, COUNT_CAP }
