import { describe, it, expect } from 'vitest'
import { computeSalesMetrics, stageOf, kindOf, inPeriod, isOutbound } from './metrics'

// Etapas iguais às DEFAULT_STAGES do useStages.
const STAGES = [
  { key: 'lead', label: 'Novo Lead', color: '#7C3AED', kind: 'open', probability: 10 },
  { key: 'qual', label: 'Qualificado', color: '#2563EB', kind: 'open', probability: 30 },
  { key: 'prop', label: 'Proposta', color: '#D97706', kind: 'open', probability: 50 },
  { key: 'closed', label: 'Fechado', color: '#059669', kind: 'won', probability: 100 },
  { key: 'lost', label: 'Perdido', color: '#EF4444', kind: 'lost', probability: 0 },
]

const deal = (stage, value, created_at = '2026-09-01') => ({ stage, value, created_at })

describe('metrics — fonte única de indicadores comerciais', () => {
  const deals = [
    deal('lead', 1000),
    deal('qual', 2000),
    deal('prop', 3000), // abertos: 6000
    deal('closed', 5000),
    deal('closed', 3000), // ganhos: 2 negócios, R$ 8000
    deal('lost', 4000), // perdidos: 1
  ]
  const m = computeSalesMetrics(deals, STAGES)

  it('pipeline aberto exclui ganhos e perdidos', () => {
    expect(m.pipeline).toBe(6000) // 1000+2000+3000
  })

  it('ticket médio = receita ganha / nº de ganhos (não pipeline total / ganhos)', () => {
    // O bug antigo do funil fazia (todo o pipeline) / ganhos = 18000/2 = 9000.
    expect(m.ticket).toBe(4000) // 8000 / 2
  })

  it('ticket médio NÃO é R$ 0 quando existem ganhos válidos', () => {
    expect(m.ticket).toBeGreaterThan(0)
  })

  it('conversão = ganhos / encerrados (não ganhos / total)', () => {
    // ganhos 2, encerrados 3 → 66,7%. O cálculo won/total daria 2/6 = 33%.
    expect(m.convRate).toBeCloseTo((2 / 3) * 100, 5)
    expect(m.lostRate).toBeCloseTo((1 / 3) * 100, 5)
    expect(m.won).toBe(2)
    expect(m.lost).toBe(1)
    expect(m.decided).toBe(3)
  })

  it('previsão ponderada = Σ valor × probabilidade da etapa (só abertos)', () => {
    // 1000*.10 + 2000*.30 + 3000*.50 = 100 + 600 + 1500 = 2200
    expect(m.weightedForecast).toBe(2200)
  })

  it('a soma das etapas corresponde ao total exibido', () => {
    const somaEtapas = m.byStage.reduce((a, s) => a + s.count, 0)
    expect(somaEtapas).toBe(m.total)
    expect(m.total).toBe(6)
  })

  it('conta zero-safe: sem negócios não quebra nem retorna NaN', () => {
    const z = computeSalesMetrics([], STAGES)
    expect(z.convRate).toBe(0)
    expect(z.ticket).toBe(0)
    expect(z.pipeline).toBe(0)
  })

  it('negócio com stage órfão cai na primeira etapa (não some do total)', () => {
    const orfao = computeSalesMetrics([deal('etapa_removida', 900)], STAGES)
    expect(orfao.total).toBe(1)
    expect(stageOf({ stage: 'etapa_removida' }, STAGES)).toBe('lead')
    expect(kindOf({ stage: 'etapa_removida' }, STAGES)).toBe('open')
  })
})

describe('inPeriod — filtro por janela', () => {
  const deals = [deal('lead', 1, '2026-09-01'), deal('lead', 1, '2026-01-01')]

  it('sem opts retorna tudo', () => {
    expect(inPeriod(deals).length).toBe(2)
  })

  it('filtra pelo início da janela', () => {
    const start = new Date('2026-06-01').getTime()
    expect(inPeriod(deals, { start }).length).toBe(1)
  })
})

describe('isOutbound — normaliza vocabulário misto de direction', () => {
  it('trata os dois vocabulários (frontend e servidor)', () => {
    expect(isOutbound('outbound')).toBe(true)
    expect(isOutbound('sent')).toBe(true) // regressão: Dashboard subcontava isto
    expect(isOutbound('inbound')).toBe(false)
    expect(isOutbound('received')).toBe(false)
    expect(isOutbound(undefined)).toBe(false)
  })
})
