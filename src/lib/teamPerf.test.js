import { describe, it, expect } from 'vitest'
import { memberStats, needsAttention, nudgeTemplates, sentTodayByName, winsByName, fmtWait, levelOf } from './teamPerf'

const NOW = new Date(2026, 10, 25, 15, 0).getTime()
const ago = (min) => new Date(NOW - min * 60000).toISOString()
const convs = [
  { assigned_to: 'Ana', unread_count: 0, status: 'active', last_message_at: ago(5) },
  { assigned_to: 'Mari', unread_count: 2, status: 'active', last_message_at: ago(90) },
  { assigned_to: 'Mari', unread_count: 1, status: 'active', last_message_at: ago(20) },
  { assigned_to: 'Mari', unread_count: 4, status: 'closed', last_message_at: ago(500) },
]

describe('desempenho da equipe', () => {
  it('cliente esperando há muito tempo derruba a nota e explica o motivo', () => {
    const r = memberStats({ name: 'Mari', status: 'online' }, { convs, now: NOW })
    expect(r).toMatchObject({ active: 2, waiting: 3, waitingConvs: 2, oldestWait: 90 })
    expect(r.score).toBe(70 - 23 - 6)
    expect(r.level).toBe('atencao')
    expect(r.reasons[0]).toMatchObject({ tone: 'bad', text: '2 clientes esperando há 1h30' })
    expect(r.reasons.some(x => x.text === 'Nenhuma resposta enviada hoje')).toBe(true)
  })

  it('respostas do dia e vendas somam pontos', () => {
    const r = memberStats({ name: 'Ana', status: 'online' }, { convs, sentToday: { Ana: 12 }, wins: { Ana: { count: 2, value: 900 } }, now: NOW })
    expect(r.score).toBe(92)
    expect(r.level).toBe('otimo')
    expect(r.reasons.map(x => x.tone)).toEqual(['good', 'good'])
  })

  it('offline com cliente esperando pesa mais', () => {
    const on = memberStats({ name: 'Mari', status: 'online' }, { convs, sentToday: { Mari: 1 }, now: NOW })
    const off = memberStats({ name: 'Mari', status: 'offline' }, { convs, sentToday: { Mari: 1 }, now: NOW })
    expect(on.score - off.score).toBe(10)
    expect(off.reasons.some(x => x.text.includes('offline'))).toBe(true)
  })

  it('lista de atenção do pior para o melhor e mensagens prontas', () => {
    const rows = [{ name: 'A', score: 55, level: 'atencao' }, { name: 'B', score: 30, level: 'critico' }, { name: 'C', score: 90, level: 'otimo' }]
    expect(needsAttention(rows).map(r => r.name)).toEqual(['B', 'A'])
    const t = nudgeTemplates({ name: 'Mariana Oliveira', waitingConvs: 1, oldestWait: 45, status: 'offline' })
    expect(t[0]).toBe('Mariana, tem um cliente esperando resposta há 45 min. Consegue ver agora?')
    expect(t[1]).toContain('offline')
    expect(t.length).toBeLessThanOrEqual(4)
  })

  it('conta respostas de hoje por atendente e vendas por responsável', () => {
    const msgs = [
      { direction: 'outbound', sender_name: 'Ana', created_at: ago(10) },
      { direction: 'sent', sender_name: 'Ana', created_at: ago(30) },
      { direction: 'inbound', sender_name: 'Ana', created_at: ago(5) },
      { direction: 'outbound', sender_name: 'Ana', created_at: ago(60 * 24) },
      { direction: 'outbound', sender_name: null, created_at: ago(1) },
    ]
    expect(sentTodayByName(msgs, new Date(NOW))).toEqual({ Ana: 2 })
    expect(winsByName([{ assigned_to: 'Ana', value: 100 }, { assigned_to: 'Ana', value: '50' }, { assigned_to: null }])).toEqual({ Ana: { count: 2, value: 150 } })
    expect(fmtWait(125)).toBe('2h05'); expect(fmtWait(120)).toBe('2h'); expect(levelOf(39)).toBe('critico')
  })
})
