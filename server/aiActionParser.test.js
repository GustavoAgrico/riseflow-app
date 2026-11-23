import { describe, it, expect } from 'vitest'
import { parseActions, describeAction, actionsPrompt } from './aiActionParser'

describe('parseActions', () => {
  it('separa a resposta das ações e tira os marcadores', () => {
    const raw = 'Perfeito, vou registrar!\n[[ACAO tipo="criar_tarefa" titulo="Enviar orçamento" prazo="amanha"]]\n[[ACAO tipo="mover_etapa" etapa="Proposta"]]'
    const { text, actions } = parseActions(raw)
    expect(text).toBe('Perfeito, vou registrar!')
    expect(actions).toEqual([
      { type: 'criar_tarefa', params: { titulo: 'Enviar orçamento', prazo: 'amanha' } },
      { type: 'mover_etapa', params: { etapa: 'Proposta' } },
    ])
  })

  it('aceita AÇÃO com acento e descarta tipo desconhecido ou incompleto', () => {
    const raw = 'Ok [[AÇÃO tipo="agendar" data="2026-11-25" hora="14:30"]] [[ACAO tipo="apagar_tudo"]] [[ACAO tipo="criar_tarefa"]]'
    const { text, actions } = parseActions(raw)
    expect(text).toBe('Ok')
    expect(actions).toEqual([{ type: 'agendar', params: { data: '2026-11-25', hora: '14:30' } }])
  })

  it('limita a 3 ações e funciona sem marcadores', () => {
    const tag = '[[ACAO tipo="criar_tarefa" titulo="x"]]'
    expect(parseActions(tag.repeat(5)).actions).toHaveLength(3)
    expect(parseActions('Só texto')).toEqual({ text: 'Só texto', actions: [] })
  })
})

describe('describeAction e actionsPrompt', () => {
  it('descreve em português', () => {
    expect(describeAction({ type: 'agendar', params: { data: '2026-11-25', hora: '09:00', titulo: 'Visita' } }))
      .toBe('Agendar "Visita" em 2026-11-25 às 09:00')
  })
  it('lista as etapas da conta no prompt', () => {
    const p = actionsPrompt({ stages: [{ label: 'Lead' }, { label: 'Ganho' }], today: '2026-11-23', mode: 'auto' })
    expect(p).toContain('Lead, Ganho')
    expect(p).toContain('Hoje é 2026-11-23')
  })
})
