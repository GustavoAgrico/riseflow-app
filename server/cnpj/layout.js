// Layout dos dados abertos do CNPJ (Receita Federal). CSV sem cabeçalho, ";" e
// aspas, latin1. Só o que a prospecção usa — o resto é descartado na leitura.
//
// Estabelecimentos: 0 cnpj_basico · 1 ordem · 2 dv · 3 matriz(1)/filial(2) · 4 nome fantasia ·
//   5 situação (02 = ativa) · 6 data situação · 7 motivo · 8 cidade exterior · 9 país ·
//   10 início atividade (AAAAMMDD) · 11 CNAE principal · 12 CNAEs secundários · 13 tipo logradouro ·
//   14 logradouro · 15 número · 16 complemento · 17 bairro · 18 CEP · 19 UF · 20 município (código) ·
//   21 DDD1 · 22 telefone1 · 23 DDD2 · 24 telefone2 · 25 DDD fax · 26 fax · 27 e-mail · 28/29 situação especial
// Empresas: 0 cnpj_basico · 1 razão social · 2 natureza jurídica · 3 qualificação · 4 capital ("1000,00") ·
//   5 porte (00 n/i · 01 ME · 03 EPP · 05 demais) · 6 ente federativo
// Simples: 0 cnpj_basico · 1 opção Simples (S/N) · 2/3 datas · 4 opção MEI (S/N) · 5/6 datas

const PORTE = { 0: 'Não informado', 1: 'Microempresa', 3: 'Pequeno porte', 5: 'Demais' }

// '"a";"b";""' → ['a', 'b', '']
function parseLine(line) {
  let s = line.endsWith('\r') ? line.slice(0, -1) : line
  if (!s) return null
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1)
  return s.split('";"')
}

const clean = (v) => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim()
  return t || null
}
const titleCase = (v) => {
  const t = clean(v)
  if (!t) return null
  return t.toLowerCase().replace(/(^|[\s\-/(])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E|Em|Para|Com)\b/g, w => w.toLowerCase())
    .replace(/\b(Ltda|Me|Epp|S\/a|Sa|Eireli)\b/g, w => w.toUpperCase())
}

// DDD + número → "11987654321" (só dígitos). Inválido → null.
// A Receita guarda muitos celulares no formato antigo (8 dígitos, sem o 9 da frente):
// número local de 8 dígitos começando com 6–9 é celular → ganha o 9 (fixo começa com 2–5).
function phoneOf(ddd, num) {
  const d = String(ddd || '').replace(/\D/g, '').replace(/^0+/, '')
  let n = String(num || '').replace(/\D/g, '')
  if (d.length !== 2 || n.length < 8 || n.length > 9 || /^0+$/.test(n) || /^(\d)\1+$/.test(n)) return null
  if (n.length === 8 && /^[6-9]/.test(n)) n = '9' + n
  if (n.length === 9 && n[0] !== '9') return null
  return d + n
}
const isMobile = (p) => Boolean(p && p.length === 11 && p[2] === '9')

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
function emailOf(v) {
  const e = String(v || '').trim().toLowerCase()
  return EMAIL.test(e) && e.length <= 120 ? e : null
}

// Linha de Estabelecimentos → registro, ou null se não for ativa/no Brasil.
function estabRow(f) {
  if (!f || f.length < 28 || f[5] !== '02') return null
  const uf = clean(f[19])
  if (!uf || uf === 'EX') return null
  const cnpj = `${f[0]}${f[1]}${f[2]}`
  if (!/^\d{14}$/.test(cnpj)) return null
  const tel1 = phoneOf(f[21], f[22])
  let tel2 = phoneOf(f[23], f[24])
  if (tel2 === tel1) tel2 = null
  const rua = [clean(f[13]), clean(f[14])].filter(Boolean).join(' ')
  const endereco = [rua, clean(f[15]) && clean(f[15]) !== 'S/N' ? clean(f[15]) : null].filter(Boolean).join(', ')
  return {
    cnpj,
    basico: f[0],
    matriz: f[3] === '1' ? 1 : 0,
    fantasia: titleCase(f[4]),
    abertura: /^\d{8}$/.test(f[10]) ? f[10] : null,
    cnae: Number(f[11]) || null,
    uf,
    municipio: Number(f[20]) || null,
    bairro: titleCase(f[17]),
    cep: /^\d{8}$/.test(f[18]) ? f[18] : null,
    endereco: titleCase(endereco) || null,
    tel1,
    tel2,
    email: emailOf(f[27]),
    celular: isMobile(tel1) || isMobile(tel2) ? 1 : 0,
  }
}

function empresaRow(f) {
  if (!f || f.length < 6 || !/^\d{8}$/.test(f[0])) return null
  const capital = Number(String(f[4] || '').replace(/\./g, '').replace(',', '.'))
  return {
    basico: f[0],
    razao: titleCase(f[1]),
    natureza: Number(f[2]) || null,
    capital: Number.isFinite(capital) ? capital : null,
    porte: Number(f[5]) || 0,
  }
}

function simplesRow(f) {
  if (!f || f.length < 5 || !/^\d{8}$/.test(f[0])) return null
  return { basico: f[0], simples: f[1] === 'S' ? 1 : 0, mei: f[4] === 'S' ? 1 : 0 }
}

// Tabelas de apoio (Cnaes, Municipios): "codigo";"descricao"
function codeRow(f) {
  if (!f || f.length < 2 || !/^\d+$/.test(f[0])) return null
  return { code: Number(f[0]), name: clean(f[1]) }
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

module.exports = { PORTE, parseLine, phoneOf, isMobile, emailOf, estabRow, empresaRow, simplesRow, codeRow, titleCase, fold }
