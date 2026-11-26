import { describe, it, expect } from 'vitest'
import { buildTips, pickTip, guideFor, businessDaysLeft, dayHeadline, greeting } from './coach'

const NOW = new Date(2026, 10, 24, 9, 0) // terça, 24/11/2026, 9h

describe('dicas dos agentes', () => {
  it('ordena por urgência e cada dica tem um mascote e um caminho', () => {
    const tips = buildTips({ tasksOverdue: 2, tasksToday: 3, invoicesOverdue: { count: 1, total: 1200 }, leadsStale: 4, goal: 10000, wonMonth: 4000 }, { path: '/crm', now: NOW })
    expect(tips[0].id).toBe('tasks-overdue')
    expect(tips.map(t => t.id)).toEqual(expect.arrayContaining(['tasks-today', 'inv-overdue', 'leads-stale', 'goal-pace', 'guide:/crm']))
    for (const t of tips) {
      expect(['comercial', 'atendente', 'prospector', 'agenda', 'metas', 'analista']).toContain(t.agent)
      expect(t.text.length).toBeGreaterThan(10)
    }
  })

  it('ritmo da meta divide o que falta pelos dias úteis', () => {
    expect(businessDaysLeft(NOW)).toBe(5) // 24 a 30/11/2026: ter, qua, qui, sex, seg
    const pace = buildTips({ goal: 10000, wonMonth: 5000 }, { now: NOW }).find(t => t.id === 'goal-pace')
    expect(pace.title).toBe('Meta em 50%')
    expect(pace.text).toContain('R$ 5 mil')
    expect(pace.text).toContain('R$ 1 mil por dia útil')
    expect(buildTips({ goal: 1000, wonMonth: 1500 }, { now: NOW }).some(t => t.id === 'goal-hit')).toBe(true)
    expect(buildTips({}, { now: NOW }).some(t => t.id === 'goal-none')).toBe(true)
  })

  it('sem pendências dá um incentivo em vez de lista vazia', () => {
    const tips = buildTips({ goal: 1000, wonMonth: 2000, newLeadsWeek: 10 }, { path: '/x', now: NOW })
    expect(tips.some(t => t.id === 'all-clear')).toBe(true)
  })

  it('orientação da tela casa subrotas e só aparece em telas conhecidas', () => {
    expect(guideFor('/crm/board').id).toBe('guide:/crm')
    expect(guideFor('/desconhecida')).toBeNull()
  })

  it('balão: urgente primeiro, depois a dica da tela; pula as vistas', () => {
    const tips = buildTips({ tasksOverdue: 1 }, { path: '/billing', now: NOW })
    expect(pickTip(tips, { path: '/billing' }).id).toBe('tasks-overdue')
    expect(pickTip(tips, { path: '/billing', seen: ['tasks-overdue'] }).id).toBe('guide:/billing')
    expect(pickTip(tips, { seen: tips.map(t => t.id) })).toBeNull()
  })

  it('saudação do dia resume tarefas, reuniões e conversas', () => {
    expect(greeting(9)).toBe('Bom dia'); expect(greeting(15)).toBe('Boa tarde'); expect(greeting(20)).toBe('Boa noite')
    expect(dayHeadline({ tasksToday: 2, meetingsToday: 1 }, NOW)).toBe('Bom dia! Hoje: 2 tarefas, 1 reunião.')
    expect(dayHeadline({}, NOW)).toContain('Agenda livre')
  })
})

describe('leads quentes do Piloto de Vendas', () => {
  it('lead pronto para comprar é a dica mais urgente', () => {
    const tips = buildTips({ hotLeads: [{ name: 'Marina', score: 96 }], tasksOverdue: 3 }, { now: NOW })
    expect(tips[0]).toMatchObject({ id: 'hot-leads', agent: 'comercial', cta: { to: '/vendas-ia' } })
    expect(tips[0].text).toContain('Marina mostrou 96%')
  })
})
