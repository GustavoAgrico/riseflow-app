import { describe, it, expect } from 'vitest'
import { agentsForPage, roleOnPage, helloTip, orderAgents } from './agentPages'

const AGENTS = ['comercial', 'atendente', 'prospector', 'agenda', 'metas', 'analista'].map((k, i) => ({ id: String(i), kind: k, name: k.toUpperCase() }))

describe('agentes por tela', () => {
  it('Chat e atendimento ficam com a atendente; prospecção com o prospector', () => {
    expect(agentsForPage('/chat')[0]).toBe('atendente')
    expect(agentsForPage('/smart-attendant')).toEqual(['atendente'])
    expect(agentsForPage('/prospeccao?x=1')).toEqual(['prospector'])
    expect(agentsForPage('/crm/board')[0]).toBe('comercial')
    expect(agentsForPage('/desconhecida')).toEqual([])
  })

  it('ordena o trilho com os donos da tela primeiro, sem perder ninguém', () => {
    const ordered = orderAgents(AGENTS, '/chat').map(a => a.kind)
    expect(ordered.slice(0, 2)).toEqual(['atendente', 'comercial'])
    expect(ordered).toHaveLength(6)
    expect(orderAgents(AGENTS, '/x').map(a => a.kind)).toEqual(AGENTS.map(a => a.kind))
  })

  it('apresentação explica a função na tela e traz atalhos', () => {
    expect(roleOnPage('atendente', '/chat')).toContain('atendimento')
    expect(roleOnPage('metas', '/goals')).toContain('metas')
    const t = helloTip({ kind: 'atendente', name: 'Bia' }, '/chat', ['Quem está esperando?', 'b', 'c'])
    expect(t).toMatchObject({ id: 'hello:/chat', agent: 'atendente', title: 'Bia aqui 👋', prompts: ['Quem está esperando?', 'b'] })
    expect(helloTip({ kind: 'x', name: 'X' }, '/nada')).toBeNull()
  })
})
