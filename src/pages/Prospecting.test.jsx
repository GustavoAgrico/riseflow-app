import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const calls = []
let routes = {}
const reply = (method, url, body) => {
  calls.push({ method, url, body })
  const h = routes[`${method} ${url}`]
  if (!h) return Promise.resolve({ data: {} })
  try { return Promise.resolve({ data: typeof h === 'function' ? h(body) : h }) } catch (e) { return Promise.reject(e) }
}
vi.mock('@services/api', () => ({
  default: {
    get: (url) => reply('GET', url),
    post: (url, body) => reply('POST', url, body),
    put: (url, body) => reply('PUT', url, body),
    delete: (url) => reply('DELETE', url),
  },
}))
vi.mock('@components/Layout/Layout', () => ({ Layout: ({ children }) => <div>{children}</div> }))
vi.mock('@context/AuthContext', () => ({ useAuth: () => ({ isDemoMode: false }) }))

import { Prospecting } from './Prospecting'

const LIST = 'Nome;Telefone;Site\nAcme;(11) 3333-4444;acme.com.br\nBeta;(21) 99999-0000;\nGama;(31) 98888-7777;\nAcme Filial;(11) 3333-5555;acme.com.br/sp'

beforeEach(() => {
  calls.length = 0
  try { localStorage.clear() } catch {}
  routes = {
    'GET /prospecting/queue': [],
    'GET /prospecting/credit': { remainingUsd: 4, limitUsd: 5, maxPlaces: 600 },
    'GET /prospecting/profile': { profile: { segments: 'odonto' } },
    'POST /prospecting/screen': (b) => ({
      results: b.leads.map((l, i) => ({ key: l.key, status: ['novo', 'no_crm', 'excluido', 'repetido'][i], ...(i === 2 ? { reason: 'opt_out' } : {}) })),
      summary: { found: 4, new_count: 1, in_crm: 1, excluded: 1 },
    }),
    'POST /prospecting/check-whatsapp': (b) => ({ results: b.phones.map(p => ({ phone: '551133334444', whatsapp: true })) }),
    'POST /prospecting/exclusions': { added: 2 },
  }
})

const renderPage = () => render(<MemoryRouter><Prospecting /></MemoryRouter>)

async function loadList() {
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: 'Importar lista' }))
  fireEvent.change(screen.getByLabelText('Lista de leads'), { target: { value: LIST } })
  fireEvent.click(screen.getByRole('button', { name: /Ler lista/ }))
  await screen.findByText(/1 novo · 1 já no CRM · 1 na lista de exclusão · 1 repetido/)
}

describe('Prospecção — qualidade dos leads', () => {
  it('perfil de cliente ideal vem da conta', async () => {
    renderPage()
    expect(await screen.findByText(/Segmentos: odonto/)).toBeInTheDocument()
  })

  it('lista é conferida no servidor; excluídos e repetidos ficam escondidos e fora da seleção', async () => {
    await loadList()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Acme')).toBeInTheDocument()
    expect(within(table).getByText('Já no CRM')).toBeInTheDocument()
    expect(within(table).queryByText('Gama')).toBeNull()          // excluído (pediu para sair)
    expect(within(table).queryByText('Acme Filial')).toBeNull()   // repetido
    expect(screen.getByText('1 selecionado')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Mostrar 2 excluídos\/repetidos/ }))
    expect(within(table).getByText(/Excluído · pediu para sair/)).toBeInTheDocument()
    expect(within(table).getByText('Repetido')).toBeInTheDocument()
  })

  it('valida WhatsApp dos selecionados e mostra o selo', async () => {
    await loadList()
    fireEvent.click(screen.getByRole('button', { name: /Validar WhatsApp \(1\)/ }))
    expect(await screen.findByText(/1 com WhatsApp, 0 sem/)).toBeInTheDocument()
    const check = calls.find(c => c.url === '/prospecting/check-whatsapp')
    expect(check.body.phones).toEqual(['1133334444']) // só o selecionado (Acme), como veio da lista
    expect(within(screen.getByRole('table')).getByText('WhatsApp')).toBeInTheDocument()
  })

  it('descartar manda para a lista de exclusão e tira da seleção', async () => {
    await loadList()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar Acme' }))
    await waitFor(() => expect(calls.some(c => c.url === '/prospecting/exclusions')).toBe(true))
    const body = calls.find(c => c.url === '/prospecting/exclusions').body
    expect(body).toMatchObject({ reason: 'descartado', leads: [expect.objectContaining({ name: 'Acme', website: 'acme.com.br' })] })
    expect(await screen.findByText(/não aparece mais em novas buscas/)).toBeInTheDocument()
    expect(screen.getByText('0 selecionados')).toBeInTheDocument()
  })
})
