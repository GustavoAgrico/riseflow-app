import { describe, it, expect } from 'vitest'
import { aging, bucketOf, cashFlow, collectedThisMonth, daysLate, invoicesCsv, invoiceDocument, reminderText, isOverdue } from './finance'

const TODAY = '2026-11-24'
const rows = [
  { id: 'a', amount: 100, due_date: '2026-11-30', status: 'pending' },               // a vencer
  { id: 'b', amount: 200, due_date: '2026-11-10', status: 'pending' },               // 14 dias
  { id: 'c', amount: 300, due_date: '2026-09-20', status: 'pending' },               // 65 dias
  { id: 'd', amount: 400, due_date: '2026-05-01', status: 'pending' },               // +90
  { id: 'e', amount: 500, due_date: '2026-10-05', status: 'paid', paid_at: '2026-11-02T13:00:00' },
  { id: 'f', amount: 50, due_date: null, status: 'pending' },                         // sem vencimento
]

describe('idade dos valores em aberto', () => {
  it('distribui o que não foi pago por faixa de atraso e ignora o pago', () => {
    const b = Object.fromEntries(aging(rows, TODAY).map(x => [x.id, [x.total, x.count]]))
    expect(b).toEqual({ current: [150, 2], '1-30': [200, 1], '31-60': [0, 0], '61-90': [300, 1], '90+': [400, 1] })
    expect(bucketOf(rows[4], TODAY)).toBeNull()
  })

  it('vencimento hoje ainda não é atraso', () => {
    const r = { amount: 1, due_date: TODAY, status: 'pending' }
    expect(isOverdue(r, TODAY)).toBe(false)
    expect(daysLate(r, TODAY)).toBe(0)
    expect(daysLate(rows[1], TODAY)).toBe(14)
  })
})

describe('fluxo de caixa', () => {
  it('faturado por vencimento e recebido pela data do pagamento', () => {
    const s = cashFlow(rows, 6, TODAY)
    expect(s.map(x => x.key)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
    const nov = s.at(-1); const out = s.find(x => x.key === '2026-10'); const set = s.find(x => x.key === '2026-09')
    expect(nov).toMatchObject({ label: 'nov', billed: 300, received: 500 })
    expect(out).toMatchObject({ billed: 500, received: 0 })
    expect(set.billed).toBe(300)
    expect(cashFlow(rows, 12, TODAY)).toHaveLength(12)
  })

  it('recebido no mês usa paid_at', () => {
    expect(collectedThisMonth(rows, TODAY)).toBe(500)
    expect(collectedThisMonth(rows, '2026-10-15')).toBe(0)
  })
})

describe('exportação e documentos', () => {
  it('CSV com ponto e vírgula, vírgula decimal e proteção contra fórmula', () => {
    const csv = invoicesCsv([{ client_name: '=HYPERLINK("x")', description: 'Plano; Pro', amount: 1234.5, due_date: '2026-11-10', status: 'pending' }], TODAY)
    const [head, line] = csv.replace('﻿', '').split('\r\n')
    expect(head.split(';')[0]).toBe('Cliente')
    expect(line).toContain(`"'=HYPERLINK(""x"")"`)
    expect(line).toContain('"Plano; Pro";1234,50;2026-11-10;Atrasado;14')
  })

  it('documento escapa HTML do cliente e mostra situação', () => {
    const html = invoiceDocument({ id: 'abc12345-x', client_name: '<script>alert(1)</script>', amount: 99, due_date: '2026-11-10', status: 'pending' }, { company: 'Rise & Co', today: TODAY })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('Rise &amp; Co')
    expect(html).toContain('Em atraso há 14 dia(s)')
  })

  it('lembrete usa o primeiro nome e o valor', () => {
    const t = reminderText({ client_name: 'Ana Souza', amount: 150, description: 'Mensalidade', due_date: '2099-01-10', status: 'pending' }, { brl: n => `R$ ${n}` })
    expect(t).toMatch(/^Olá, Ana! /)
    expect(t).toContain('R$ 150')
    expect(t).toContain('com vencimento em')
  })
})
