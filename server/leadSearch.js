// Busca de leads no Google Maps pela API do Apify (ator compass/crawler-google-places).
// Cobrança por empresa encontrada, na conta Apify do dono do RiseFlow (APIFY_TOKEN).
const el = require('./elevenlabs')

const ACTOR = process.env.APIFY_MAPS_ACTOR || 'compass~crawler-google-places'
const PRICE_PER_PLACE = 0.004 // US$, plano gratuito do Apify (planos pagos cobram menos)

const isConfigured = () => Boolean(process.env.APIFY_TOKEN)
const estimateUsd = (max) => Math.round(max * PRICE_PER_PLACE * 100) / 100

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

async function searchGoogleMaps({ query, location, max }) {
  // Teto de gasto da execução: o próprio Apify interrompe ao passar desse valor.
  const cap = (max * PRICE_PER_PLACE * 1.5 + 0.02).toFixed(2)
  const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=240&maxTotalChargeUsd=${cap}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}`, 'Content-Type': 'application/json' },
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

module.exports = { isConfigured, estimateUsd, searchGoogleMaps, mapPlace, PRICE_PER_PLACE }
