import { describe, it, expect } from 'vitest'
import { leadsPerDay, stageReach, pipelineHealth, ageTone, diffPipeline } from './pipelineStats'
import { DEFAULT_STAGES as S } from '@hooks/useStages'

const NOW = new Date(2026, 10, 24, 12)
const ago = (d) => new Date(NOW.getTime() - d * 86400000).toISOString()
const rows = [
  { id: '1', name: 'A', stage: 'lead', created_at: ago(0), phone: '119', value: 0 },
  { id: '2', name: 'B', stage: 'lead', created_at: ago(10), phone: '', value: 100 },
  { id: '3', name: 'C', stage: 'qual', created_at: ago(1), phone: '21', value: 0 },
  { id: '4', name: 'D', stage: 'closed', created_at: ago(3), phone: '31', value: 900 },
  { id: '5', name: 'E', stage: 'lost', created_at: ago(2), phone: '41', value: 50 },
]

describe('pipelineStats', () => {
  it('conta entradas por dia, hoje no fim', () => {
    const d = leadsPerDay(rows, 14, NOW)
    expect(d).toHaveLength(14)
    expect(d.at(-1).count).toBe(1)
    expect(d.at(-2).count).toBe(1)
    expect(d.reduce((a, x) => a + x.count, 0)).toBe(5)
  })

  it('alcance por etapa e conversão entre etapas (perdidos fora)', () => {
    const { steps, lost } = stageReach(rows, S)
    expect(lost).toBe(1)
    expect(steps.map(s => s.reached)).toEqual([4, 2, 1, 1, 1])
    expect(steps[1].conv).toBe(50)
    expect(steps[0].conv).toBeNull()
  })

  it('saúde: parados, sem valor e sem telefone só entre os abertos', () => {
    expect(pipelineHealth(rows, S, { now: NOW.getTime() })).toEqual({ open: 3, stale: 1, noValue: 2, noPhone: 1, newToday: 1 })
  })

  it('selo de idade muda de cor', () => {
    expect(ageTone(ago(0), NOW.getTime())).toMatchObject({ label: 'hoje', color: '#22C55E' })
    expect(ageTone(ago(5), NOW.getTime())).toMatchObject({ label: '5d', color: '#EAB308' })
    expect(ageTone(ago(28), NOW.getTime()).color).toBe('#EF4444')
  })

  it('feed ao vivo: entrada, avanço e venda', () => {
    const next = [{ ...rows[0], stage: 'qual' }, rows[1], { ...rows[2], stage: 'closed' }, { id: '9', name: 'Novo', stage: 'lead' }]
    const ev = diffPipeline(rows.slice(0, 3), next, S)
    expect(ev.map(e => e.kind)).toEqual(['move', 'won', 'new'])
    expect(ev[0].text).toBe('Novo Lead → Qualificado')
    expect(diffPipeline(null, next, S)).toEqual([])
  })
})
