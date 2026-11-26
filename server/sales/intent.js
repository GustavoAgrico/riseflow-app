// Detector de intenção de compra — regras em português (também entende espanhol básico).
// Gratuito e instantâneo: roda em toda mensagem recebida, sem chamar IA paga.
// score 0–100 · level 'alta' | 'media' | 'baixa' · signals = motivos legíveis para a tela.

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// [regex, peso, rótulo]. Pesos somam; o resultado é limitado a 0–100.
const RULES = [
  // Decisão de compra explícita
  [/\b(quero|vou|queria|gostaria de|preciso) (comprar|fechar|contratar|assinar|adquirir|levar|pegar)\b/, 55, 'quer comprar'],
  [/\b(quiero|voy a) (comprar|contratar|cerrar)\b/, 55, 'quer comprar'],
  [/\b(bora|vamos|pode) fechar\b|\bfechado\b|\bfechou\b|\btopo\b|\bnegocio fechado\b/, 45, 'aceitou fechar'],
  [/\b(manda|mande|envia|envie|me passa|passa|qual (e|eh))( o| a| um| uma| seu| sua)? (chave )?(pix|link( de pagamento)?|boleto|dados (para|pra) pagamento)\b|\bchave pix\b/, 55, 'pediu forma de pagamento'],
  [/\bcomo (faco|faço|posso) (para |pra )?(pagar|comprar|contratar|assinar)\b|\b(aceita|aceitam|parcela|parcelam) (no )?(cartao|credito|debito|pix|boleto)\b/, 40, 'perguntou como pagar'],
  [/\b(comprar|fechar|contratar) (agora|hoje|ainda hoje)\b|\bcomprar ahora\b/, 25, 'quer agora'],
  // Preço e condições
  [/\bquanto (custa|e|eh|fica|sai|cobra)\b|\bqual (o )?(valor|preco)\b|\bpre[cç]o\b|\bvalores\b|\bcuanto cuesta\b|\bprecio\b/, 34, 'perguntou preço'],
  [/\borcamento\b|\bcotacao\b|\bproposta\b|\btabela de pre/, 30, 'pediu orçamento'],
  [/\bdesconto\b|\bparcel|\ba vista\b|\bfrete\b|\bentrega\b|\bprazo\b/, 15, 'negociando condições'],
  // Disponibilidade / agendamento
  [/\b(tem|tem como|ha|há) (disponivel|disponibilidade|estoque|vaga|horario)\b|\bdisponibilidade\b|\btienen disponibilidad\b/, 18, 'perguntou disponibilidade'],
  [/\b(agendar|marcar|reservar)\b|\bquando (posso|pode|da)\b/, 18, 'quer agendar'],
  // Interesse
  [/\btenho interesse\b|\bme interess|\binteressad[oa]\b|\bme interesa\b/, 20, 'demonstrou interesse'],
  [/\bcomo funciona\b|\bmais informac|\bquero saber\b|\bgostaria de saber\b|\bpode me explicar\b|\bme fala mais\b/, 12, 'pediu informações'],
  // Urgência (reforço)
  [/\burgente\b|\bpra hoje\b|\bainda hoje\b|\bo quanto antes\b|\brapido\b/, 8, 'tem urgência'],
  // Sinais negativos
  [/\bnao (tenho|tenho mais) interesse\b|\bnao quero\b|\bpar[ae] de (me )?(mandar|enviar)\b|\bsair da lista\b|\bdescadastr|\bremov[ae] (meu|o) (numero|contato)\b|\bno me interesa\b/, -60, 'sem interesse'],
  [/\bmuito caro\b|\bta caro\b|\besta caro\b|\bfora do (meu )?orcamento\b/, -12, 'achou caro'],
  [/\bdepois (eu )?(vejo|falo|retorno)\b|\bso (olhando|pesquisando)\b|\bvou pensar\b/, -10, 'adiou'],
]

const BASE = 8

function levelOf(score, hot = 75) {
  if (score >= hot) return 'alta'
  if (score >= 40) return 'media'
  return 'baixa'
}

// products: [{ name }] da conta — o primeiro citado vira o "produto de interesse".
function scoreMessage(text, { products = [], hot = 75 } = {}) {
  const t = fold(text)
  if (!t.trim()) return { score: 0, level: 'baixa', signals: [], product: null }
  let score = BASE
  const signals = []
  for (const [re, weight, label] of RULES) {
    if (re.test(t)) {
      score += weight
      if (!signals.includes(label)) signals.push(label)
    }
  }
  if (score > BASE && t.includes('?')) score += 3
  let product = null
  for (const p of products) {
    const name = fold(p?.name).trim()
    if (name.length >= 3 && t.includes(name)) { product = p.name; score += 8; signals.push(`citou ${p.name}`); break }
  }
  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, level: levelOf(score, hot), signals, product }
}

// A nota da conversa é a maior intenção recente: uma mensagem forte não some com um "ok" depois,
// mas esfria com o tempo (perde ~10% por dia sem novos sinais). Recusa explícita derruba na hora.
function combineScore(prev, prevAt, current, now = Date.now()) {
  if (current.signals.includes('sem interesse')) return current.score
  const days = prevAt ? Math.max(0, (now - new Date(prevAt).getTime()) / 86400000) : 0
  const decayed = Math.round((Number(prev) || 0) * Math.pow(0.9, days))
  return Math.max(decayed, current.score)
}

module.exports = { scoreMessage, combineScore, levelOf, fold }
