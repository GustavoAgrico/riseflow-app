import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { build, sortForPage } = require('./suggestions')
const pageContext = require('./pageContext')
const { TOOLS, TOOLS_BY_KIND } = require('./tools/catalog')
const { validate } = require('./tools/executor')

const base = {
  settings: { hot_threshold: 75 },
  opps: [
    { id: 'o1', client_id: 'c1', contact_name: 'Marina', score: 96, status: 'new', last_message: 'Quero comprar agora' },
    { id: 'o2', client_id: 'c2', contact_name: 'João', score: 60, status: 'new' },
    { id: 'o3', client_id: null, contact_name: 'Sem ficha', score: 90, status: 'new' },
    { id: 'o4', client_id: 'c4', contact_name: 'Já contatado', score: 95, status: 'contacted' },
  ],
  stale: [{ id: 'c9', name: 'Lead antigo' }],
  recentLeads: 2,
  invoices: [{ id: 'i1', client_id: 'c5', client_name: 'Ana Souza', amount: 150, due_date: '2026-11-10', description: 'Mensalidade' }],
  projects: [{ id: 'p1', name: 'Implantação', client_name: 'Clínica', steps: [{ title: 'Kick-off', done: true }, { title: 'Treinamento', done: false }] }],
  overview: { people: [{ member_id: 'm1', name: 'Mariana Oliveira', status: 'offline', waiting_conversations: 2, oldest_wait_minutes: 95 }, { member_id: 'm2', name: 'Ok', waiting_conversations: 1, oldest_wait_minutes: 5 }] },
  msgCount: 40,
}

describe('ações sugeridas pelos agentes', () => {
  const list = build(base)
  const byId = (prefix) => list.find(s => s.id.startsWith(prefix))

  it('só sugere retorno para lead quente, novo e com ficha', () => {
    const s = byId('hot-followup')
    expect(s.steps).toHaveLength(1)
    expect(s.steps[0]).toEqual({ tool: 'create_task', input: { title: 'Responder Marina (intenção 96%)', due: 'hoje', client_id: 'c1' } })
  })

  it('cobrança e chamar equipe são risco alto e mostram o que será feito', () => {
    const inv = byId('invoice-reminders')
    expect(inv.risk).toBe('alto')
    expect(inv.preview[0]).toContain('Ana Souza')
    expect(inv.steps[0].input.text).toMatch(/^Olá, Ana!/)
    const nudge = byId('nudge:m1')
    expect(nudge.risk).toBe('alto')
    expect(nudge.title).toBe('Chamar Mariana Oliveira: 2 clientes esperando há 1h35')
    expect(list.some(s => s.id === 'nudge:m2')).toBe(false)
  })

  it('projeto atrasado vira tarefa no próximo passo; funil fraco sugere prospecção por conversa', () => {
    expect(byId('project:p1').steps[0].input.title).toBe('Projeto Implantação: Treinamento')
    const p = byId('prospect')
    expect(p.steps).toBeUndefined()
    expect(p.prompt).toContain('nicho e a cidade')
  })

  it('sem oportunidades e com mensagens, sugere ler as conversas', () => {
    expect(build({ ...base, opps: [] }).some(s => s.id === 'scan-conversations')).toBe(true)
    expect(build({ ...base, opps: [], msgCount: 0 }).some(s => s.id === 'scan-conversations')).toBe(false)
  })

  it('toda etapa usa ferramenta existente com entrada válida', () => {
    for (const s of build({ ...base, opps: [] }).concat(list)) {
      for (const step of s.steps || []) {
        expect(TOOLS[step.tool], step.tool).toBeTruthy()
        expect(validate(TOOLS[step.tool].schema, step.input).error, `${s.id} ${step.tool}`).toBeUndefined()
      }
    }
  })

  it('o que é da tela atual vem primeiro', () => {
    expect(sortForPage(list, '/billing')[0].id).toMatch(/^invoice-reminders/)
    expect(sortForPage(list, '/monitor')[0].id).toBe('nudge:m1')
  })
})

describe('tela atual e ferramentas novas', () => {
  it('guarda a tela e gera a linha do prompt', () => {
    expect(pageContext.setPage('u1', '/vendas-ia?x=1')).toBe(true)
    expect(pageContext.pageNote('u1')).toContain('Piloto de Vendas')
    expect(pageContext.setPage('u1', '/qualquer')).toBe(false)
    expect(pageContext.labelOf('/crm/board')).toContain('Painel ao vivo')
  })

  it('cada agente tem só ferramentas que existem; chamar equipe pede aprovação', () => {
    for (const names of Object.values(TOOLS_BY_KIND)) for (const n of names) expect(TOOLS[n], n).toBeTruthy()
    expect(TOOLS.nudge_team_member.risk).toBe('alto')
    expect(TOOLS_BY_KIND.prospector).toEqual(expect.arrayContaining(['search_leads', 'scan_conversations_for_leads', 'list_hot_leads']))
  })
})
