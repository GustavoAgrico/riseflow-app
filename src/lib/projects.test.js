import { describe, it, expect } from 'vitest'
import {
  progress, nextStep, isLate, daysLeft, toggleStep, addStep, removeStep, completionOffer, statusPatch,
  filterProjects, sortProjects, summary, validateNew, makeSteps,
} from './projects'

const TODAY = '2026-11-24'
const steps = [
  { id: 'a', title: 'Início', done: true },
  { id: 'b', title: 'Acessos', done: false },
  { id: 'c', title: 'Treino', done: false },
]
const P = (over = {}) => ({ id: 'p', name: 'Implantação', status: 'active', due_date: '2026-12-10', steps, ...over })

describe('progresso e prazo', () => {
  it('conta passos feitos e acha o próximo', () => {
    expect(progress(P())).toEqual({ done: 1, total: 3, pct: 33 })
    expect(progress(P({ steps: [] }))).toEqual({ done: 0, total: 0, pct: 0 })
    expect(nextStep(P()).title).toBe('Acessos')
  })

  it('atraso só para projeto não concluído com prazo vencido', () => {
    expect(isLate(P({ due_date: '2026-11-20' }), TODAY)).toBe(true)
    expect(isLate(P({ due_date: '2026-11-20', status: 'done' }), TODAY)).toBe(false)
    expect(isLate(P({ due_date: TODAY }), TODAY)).toBe(false)
    expect(daysLeft(P(), TODAY)).toBe(16)
  })
})

describe('checklist', () => {
  it('primeiro passo marcado tira de planejamento; desmarcar não volta o status', () => {
    const p = P({ status: 'planning', steps: steps.map(s => ({ ...s, done: false })) })
    const r = toggleStep(p, 'b', 'T')
    expect(r.status).toBe('active')
    expect(r.steps.find(s => s.id === 'b')).toMatchObject({ done: true, done_at: 'T' })
    const back = toggleStep({ ...p, ...r }, 'b')
    expect(back.status).toBe('active')
    expect(back.steps.find(s => s.id === 'b')).toMatchObject({ done: false, done_at: null })
  })

  it('adiciona (sem texto vazio) e remove passos', () => {
    expect(addStep(P(), '   ')).toHaveLength(3)
    const added = addStep(P(), ' Go-live ')
    expect(added.at(-1)).toMatchObject({ title: 'Go-live', done: false })
    expect(removeStep(P(), 'a').map(s => s.id)).toEqual(['b', 'c'])
    expect(new Set(makeSteps().map(s => s.id)).size).toBe(5)
  })

  it('tudo feito oferece revisão e depois conclusão, sem concluir sozinho', () => {
    const all = steps.map(s => ({ ...s, done: true }))
    expect(completionOffer(P())).toBeNull()
    expect(completionOffer(P({ steps: all }))).toBe('review')
    expect(completionOffer(P({ steps: all, status: 'review' }))).toBe('done')
    expect(completionOffer(P({ steps: all, status: 'done' }))).toBeNull()
  })

  it('concluir grava a data; reabrir limpa', () => {
    expect(statusPatch(P(), 'done', 'T')).toEqual({ status: 'done', completed_at: 'T' })
    expect(statusPatch(P({ status: 'done', completed_at: 'X' }), 'done', 'T').completed_at).toBe('X')
    expect(statusPatch(P({ status: 'done', completed_at: 'X' }), 'active')).toEqual({ status: 'active', completed_at: null })
  })
})

describe('lista', () => {
  const list = [
    P({ id: '1', name: 'Site Clínica', client_name: 'Clínica Vida', status: 'done', completed_at: '2026-11-03T10:00:00Z' }),
    P({ id: '2', name: 'CRM Auto', client_name: 'Auto Center', due_date: '2026-11-01' }),
    P({ id: '3', name: 'Bot Loja', client_name: 'Loja Sol', status: 'planning', due_date: '2026-12-01' }),
  ]

  it('filtra por status e busca em nome/cliente', () => {
    expect(filterProjects(list, { status: 'planning' }).map(p => p.id)).toEqual(['3'])
    expect(filterProjects(list, { query: 'clínica' }).map(p => p.id)).toEqual(['1'])
  })

  it('ordena atrasados primeiro e concluídos no fim', () => {
    expect(sortProjects(list, TODAY).map(p => p.id)).toEqual(['2', '3', '1'])
  })

  it('resume contagens, atrasos e concluídos no mês', () => {
    expect(summary(list, TODAY)).toMatchObject({ late: 1, doneThisMonth: 1, open: 2, all: 3, counts: { done: 1, active: 1, planning: 1, review: 0 } })
  })

  it('novo projeto exige nome e prazo', () => {
    expect(validateNew({ name: '', due_date: TODAY })).toMatch(/nome/)
    expect(validateNew({ name: 'X' })).toMatch(/prazo/)
    expect(validateNew({ name: 'X', due_date: TODAY })).toBeNull()
  })
})
