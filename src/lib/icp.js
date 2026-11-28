// Perfil de cliente ideal (ICP) e classificação de leads em Tier A / B / C.
// Nota 0–100 explicada por motivos legíveis. Requisitos obrigatórios não atendidos limitam a nota.

export const DEFAULT_PROFILE = {
  segments: '',      // palavras do segmento-alvo, separadas por vírgula (ex.: odontologia, estética)
  cities: '',        // cidades/UF aceitas, separadas por vírgula (vazio = qualquer)
  minRating: 4,      // avaliação mínima no Google (0 = não considera)
  minReviews: 10,    // número mínimo de avaliações
  needPhone: true,
  needEmail: false,
  needInstagram: false,
  needSite: false,
  needWhatsapp: false, // só conta depois de "Validar WhatsApp"
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const list = (s) => String(s || '').split(/[,;\n]/).map(x => fold(x).trim()).filter(Boolean)

export function scoreLead(lead, profile = DEFAULT_PROFILE) {
  const p = { ...DEFAULT_PROFILE, ...profile }
  const reasons = []
  const good = (t) => reasons.push({ ok: true, text: t })
  const bad = (t) => reasons.push({ ok: false, text: t })
  let score = 20

  const hasPhone = Boolean(lead.phone || lead.whatsapp)
  const hasEmail = Boolean(lead.email || lead.emails?.length)
  if (hasPhone) { score += 15; good(lead.whatsapp ? 'tem WhatsApp' : 'tem telefone') }
  // hasWhatsapp: true/false depois de validar pelo número conectado; undefined = não conferido.
  if (lead.hasWhatsapp === true) { score += 8; good('WhatsApp confirmado') }
  else if (lead.hasWhatsapp === false) { score -= 12; bad('telefone sem WhatsApp') }
  if (hasEmail) { score += 12; good('tem e-mail comercial') }
  if (lead.instagram) { score += 10; good('tem Instagram') }
  if (lead.website) { score += 8 }
  if (lead.linkedin) { score += 5; good('tem LinkedIn') }

  if (lead.rating != null) {
    if (lead.rating >= 4.5) { score += 10; good(`nota ${String(lead.rating).replace('.', ',')} no Google`) }
    else if (lead.rating >= 4) score += 6
    else if (lead.rating < 3.5) { score -= 10; bad(`nota baixa (${String(lead.rating).replace('.', ',')})`) }
    if (p.minRating && lead.rating < p.minRating) { score -= 8; bad(`abaixo da nota mínima ${p.minRating}`) }
  }
  const reviews = Number(lead.reviews) || 0
  if (reviews >= 100) { score += 10; good(`${reviews} avaliações (empresa movimentada)`) }
  else if (reviews >= 30) score += 6
  else if (reviews >= 10) score += 3
  if (p.minReviews && lead.rating != null && reviews < p.minReviews) { score -= 5; bad(`poucas avaliações (${reviews})`) }

  const segs = list(p.segments)
  if (segs.length) {
    const hay = fold(`${lead.category || ''} ${lead.name || ''} ${lead.company?.atividade || ''}`)
    if (segs.some(s => hay.includes(s))) { score += 15; good('é do segmento-alvo') } else { score -= 10; bad('fora do segmento-alvo') }
  }
  const cities = list(p.cities)
  if (cities.length) {
    const where = fold(`${lead.city || ''} ${lead.state || ''} ${lead.company?.cidade || ''} ${lead.company?.uf || ''}`)
    if (cities.some(c => where.includes(c))) score += 5; else { score -= 10; bad('fora da região-alvo') }
  }

  const sit = fold(lead.company?.situacao)
  if (sit.includes('ativa')) { score += 5; good('CNPJ ativo') }
  else if (sit && /(baixada|inapta|suspensa|nula)/.test(sit)) { score -= 40; bad(`CNPJ ${lead.company.situacao.toLowerCase()}`) }
  if (lead.company?.socios?.length) { score += 5; good('dono identificado') }

  // Requisitos obrigatórios: sem eles, no máximo Tier C.
  const missing = []
  if (p.needPhone && !hasPhone) missing.push('telefone')
  if (p.needEmail && !hasEmail) missing.push('e-mail')
  if (p.needInstagram && !lead.instagram) missing.push('Instagram')
  if (p.needSite && !lead.website) missing.push('site')
  if (p.needWhatsapp && lead.hasWhatsapp === false) missing.push('WhatsApp')
  score = Math.max(0, Math.min(100, Math.round(score)))
  if (missing.length) { score = Math.min(score, 39); bad(`falta ${missing.join(', ')}`) }

  return { score, tier: score >= 70 ? 'A' : score >= 45 ? 'B' : 'C', reasons }
}

export const TIER_COLORS = { A: '#22C55E', B: '#EAB308', C: '#94A3B8' }
