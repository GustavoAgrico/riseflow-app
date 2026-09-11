// ─────────────────────────────────────────────────────────────────────────────
// Fonte ÚNICA de verdade dos indicadores comerciais (Entregável 1 do roadmap
// da Fase 1). Dashboard, Funil e CRM devem consumir SOMENTE estas funções —
// nunca recalcular pipeline / conversão / ticket inline. As definições seguem
// a seção "Regras de cálculo" do roadmap.
//
// Um "negócio" aqui é uma linha de `clients`: { stage, value, created_at }.
// As etapas vêm de useStages(): { key, label, color, kind:'open'|'won'|'lost',
// probability }.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => Number(v) || 0

// Etapa efetiva de um negócio. Cai na 1ª etapa quando `stage` está vazio ou
// aponta para uma etapa que não existe mais (órfão de etapa removida).
export function stageOf(deal, stages) {
  const k = deal?.stage
  if (k && stages.some((s) => s.key === k)) return k
  return stages[0]?.key ?? 'lead'
}

export function kindOf(deal, stages) {
  const key = stageOf(deal, stages)
  return stages.find((s) => s.key === key)?.kind ?? 'open'
}

// Filtra por janela [start, end) sobre created_at (epoch ms). Sem opts → tudo.
// Um negócio sem data válida só entra quando não há filtro de período.
export function inPeriod(deals, { start, end } = {}) {
  if (start == null && end == null) return deals.slice()
  return deals.filter((d) => {
    const t = new Date(d?.created_at).getTime()
    if (Number.isNaN(t)) return false
    if (start != null && t < start) return false
    if (end != null && t >= end) return false
    return true
  })
}

// ── Períodos globais ─────────────────────────────────────────────────────────
// Conjunto ÚNICO de períodos usado pelo seletor global (Dashboard, Funil,
// Analytics). Janelas móveis a partir de agora, iguais em todas as telas.
export const PERIOD_OPTIONS = [
  { key: '1d', label: 'Hoje', days: 1 },
  { key: '7d', label: '7 dias', days: 7 },
  { key: '30d', label: '30 dias', days: 30 },
  { key: '90d', label: '90 dias', days: 90 },
]
export const DEFAULT_PERIOD = '30d'

export function periodDays(key) {
  return (PERIOD_OPTIONS.find((o) => o.key === key) ??
    PERIOD_OPTIONS.find((o) => o.key === DEFAULT_PERIOD)).days
}

// Converte a chave do período na janela { start } que computeSalesMetrics espera.
export function periodRange(key, now = Date.now()) {
  return { start: now - periodDays(key) * 86_400_000 }
}

// Núcleo: todos os indicadores derivados de um MESMO conjunto e das MESMAS
// regras. É isto que garante que Dashboard e Funil, com o mesmo período,
// exibam os mesmos totais.
export function computeSalesMetrics(deals, stages = [], opts = {}) {
  const list = inPeriod(deals ?? [], opts)
  const byKind = { open: [], won: [], lost: [] }
  for (const d of list) (byKind[kindOf(d, stages)] ?? byKind.open).push(d)

  const sum = (arr) => arr.reduce((a, d) => a + num(d.value), 0)
  const won = byKind.won.length
  const lost = byKind.lost.length
  const decided = won + lost // negócios encerrados (ganhos + perdidos)
  const wonValue = sum(byKind.won)

  const probByKey = new Map(stages.map((s) => [s.key, num(s.probability)]))
  const weightedForecast = byKind.open.reduce(
    (a, d) => a + (num(d.value) * (probByKey.get(stageOf(d, stages)) ?? 0)) / 100,
    0,
  )

  const byStage = stages.map((s) => {
    const items = list.filter((d) => stageOf(d, stages) === s.key)
    return {
      key: s.key,
      label: s.label,
      color: s.color,
      kind: s.kind,
      probability: num(s.probability),
      count: items.length,
      value: sum(items),
      share: list.length ? items.length / list.length : 0,
    }
  })

  return {
    total: list.length, // nº de negócios no período
    open: byKind.open.length,
    won,
    lost,
    decided,
    pipeline: sum(byKind.open), // Pipeline aberto = valor dos negócios ativos (open)
    wonValue, // Receita ganha
    lostValue: sum(byKind.lost),
    weightedForecast, // Σ valor × probabilidade da etapa (só negócios abertos)
    convRate: decided ? (won / decided) * 100 : 0, // ganhos / encerrados
    lostRate: decided ? (lost / decided) * 100 : 0, // perdidos / encerrados
    ticket: won ? wonValue / won : 0, // receita ganha / nº de ganhos
    byStage,
  }
}

// ── Domínio de mensagens ─────────────────────────────────────────────────────
// `messages.direction` tem vocabulário MISTO no banco: o frontend grava
// 'outbound'/'inbound'; o servidor e a Edge Function deployada gravam
// 'sent'/'received'. Todo consumidor DEVE normalizar por aqui — nunca comparar
// `direction === 'outbound'` cru, senão subconta o que veio como 'sent'.
export const isOutbound = (direction) => direction === 'outbound' || direction === 'sent'

// Formatadores canônicos — evita cada tela inventar o seu e divergir.
export const brl = (n) => 'R$ ' + Math.round(num(n)).toLocaleString('pt-BR')
export const brlShort = (n) => {
  const v = num(n)
  if (v >= 1000) return 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k'
  return 'R$ ' + v.toLocaleString('pt-BR')
}
export const pct = (n, digits = 1) => num(n).toFixed(digits) + '%'
