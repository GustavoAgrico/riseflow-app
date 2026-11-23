// Busca de leads no Google Maps pela API do Apify (ator compass/crawler-google-places).
// Sem custo: cada busca só usa o crédito grátis mensal da conta Apify do dono
// (APIFY_TOKEN). getCredit() lê o consumo do mês e a busca é reduzida ou
// bloqueada para nunca passar de PROSPECTING_FREE_BUDGET_USD (padrão US$ 5).
const el = require('./elevenlabs')

const ACTOR = process.env.APIFY_MAPS_ACTOR || 'compass~crawler-google-places'
const PRICE_PER_PLACE = 0.004 // US$, plano gratuito do Apify (planos pagos cobram menos)
const SAFETY = 1.5            // folga sobre o preço por empresa ao reservar crédito
const API = 'https://api.apify.com/v2'

const isConfigured = () => Boolean(process.env.APIFY_TOKEN)
const estimateUsd = (max) => Math.round(max * PRICE_PER_PLACE * 100) / 100
const freeBudgetUsd = () => Number(process.env.PROSPECTING_FREE_BUDGET_USD || 5)
const authHeader = () => ({ Authorization: `Bearer ${process.env.APIFY_TOKEN}` })

// Crédito grátis que ainda resta no mês e quantas empresas ele paga.
async function getCredit() {
  const res = await fetch(`${API}/users/me/limits`, { headers: authHeader(), signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Apify ${res.status} ao consultar o crédito do mês.`)
  const d = (await res.json())?.data || {}
  const limitUsd = Math.min(Number(d.limits?.maxMonthlyUsageUsd ?? freeBudgetUsd()), freeBudgetUsd())
  const usedUsd = Number(d.current?.monthlyUsageUsd) || 0
  const remainingUsd = Math.max(0, Math.floor((limitUsd - usedUsd) * 1000) / 1000)
  return {
    limitUsd,
    usedUsd: Math.round(usedUsd * 1000) / 1000,
    remainingUsd,
    maxPlaces: Math.floor(remainingUsd / (PRICE_PER_PLACE * SAFETY)),
    renewsAt: d.monthlyUsageCycle?.endAt || null,
  }
}

function mapPlace(p) {
  return {
    placeId: p.placeId || null,
    name: p.title || '',
    category: p.categoryName || (Array.isArray(p.categories) ? p.categories[0] : '') || '',
    address: p.address || '',
    city: p.city || '',
    state: p.state || '',
    phone: el.toE164(p.phoneUnformatted || p.phone),
    phoneDisplay: p.phone || '',
    website: p.website || '',
    rating: typeof p.totalScore === 'number' ? p.totalScore : null,
    reviews: Number(p.reviewsCount) || 0,
    mapsUrl: p.url || '',
    closed: Boolean(p.permanentlyClosed || p.temporarilyClosed),
  }
}

// capUsd: teto de gasto da execução; o próprio Apify interrompe ao chegar nele.
async function searchGoogleMaps({ query, location, max, capUsd }) {
  const cap = Math.max(0.01, Math.min(capUsd ?? Infinity, max * PRICE_PER_PLACE * SAFETY)).toFixed(3)
  const url = `${API}/acts/${ACTOR}/run-sync-get-dataset-items?timeout=240&maxTotalChargeUsd=${cap}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchStringsArray: [query],
      locationQuery: location,
      maxCrawledPlacesPerSearch: max,
      language: 'pt-BR',
    }),
    signal: AbortSignal.timeout(280_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Apify ${res.status}: ${text.slice(0, 300)}`)
  let items = []
  try { items = JSON.parse(text) } catch { throw new Error('Resposta inesperada do Apify.') }
  return (Array.isArray(items) ? items : []).map(mapPlace).filter(p => p.name && !p.closed)
}

module.exports = { isConfigured, estimateUsd, getCredit, searchGoogleMaps, mapPlace, PRICE_PER_PLACE }
