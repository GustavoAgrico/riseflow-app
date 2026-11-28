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

describe('Prospecção — base do CNPJ', () => {
  const lead = (n, extra = {}) => ({
    key: `cnpj-${n}`, name: `Clínica ${n}`, phone: `+55119876543${n}`, phoneDisplay: `(11) 98765-43${n}`, mobile: true, email: '', city: 'Sao Paulo', state: 'SP',
    category: 'Atividade odontológica', cnpj: `1122233300018${n}`, screen: { status: 'novo' },
    company: { cnpj: `1122233300018${n}`, porte: 'Microempresa', situacao: 'ATIVA', abertura: '2019-05-01', matriz: true, capital: 20000 }, ...extra,
  })

  it('escolhe o setor, busca, mostra porte/idade e carrega mais', async () => {
    routes['GET /prospecting/cnpj/status'] = { ready: true, competencia: '2026-11', estabelecimentos: 25000000 }
    routes['GET /prospecting/cnpj/cnaes'] = [{ code: 8630504, name: 'Atividade odontológica', total: 120000 }]
    let page = 0
    routes['POST /prospecting/cnpj/search'] = (b) => {
      page++
      return b.offset ? { results: [lead(3)], hasMore: false, baseTotal: 610, offset: 2, summary: { found: 1, new_count: 1, in_crm: 0, excluded: 0 } }
        : { results: [lead(1), lead(2, { screen: { status: 'no_crm' }, inCrm: true })], hasMore: true, baseTotal: 610, summary: { found: 2, new_count: 1, in_crm: 1, excluded: 0 } }
    }
    renderPage()
    expect(await screen.findByText(/competência/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Buscar na base/ })).toBeDisabled() // precisa de setor ou cidade

    fireEvent.change(screen.getByLabelText('Setor (CNAE)'), { target: { value: 'odonto' } })
    fireEvent.mouseDown(await screen.findByRole('option', { name: /Atividade odontológica/ }))
    expect(screen.getByRole('button', { name: 'Remover setor Atividade odontológica' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'SP' } })
    fireEvent.click(screen.getByRole('button', { name: /Buscar na base/ }))
    expect(await screen.findByText('Empresas da base CNPJ')).toBeInTheDocument()
    const body = calls.find(c => c.url === '/prospecting/cnpj/search').body
    expect(body).toMatchObject({ cnaes: [8630504], uf: 'SP', phone: 'mobile', mei: 'exclude', matriz: true, offset: 0, label: 'Atividade odontológica', locationLabel: 'SP' })
    expect(screen.getByText(/610 empresas ativas no setor e região · mostrando 2 \(tem mais\) · 1 já no CRM/)).toBeInTheDocument()
    expect(screen.getAllByText(/Microempresa · desde 2019/).length).toBe(2)
    expect(screen.getByText('1 selecionado')).toBeInTheDocument() // a que já está no CRM fica fora

    fireEvent.click(screen.getByRole('button', { name: /Carregar mais \(mostrando 2\)/ }))
    expect(await screen.findByText('Clínica 3')).toBeInTheDocument()
    expect(calls.filter(c => c.url === '/prospecting/cnpj/search').at(-1).body.offset).toBe(2)
    expect(screen.getByText('2 selecionados')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Carregar mais/ })).toBeNull()
    expect(page).toBe(2)
  })

  it('base ainda importando: avisa e não deixa buscar', async () => {
    routes['GET /prospecting/cnpj/status'] = { ready: false }
    renderPage()
    expect(await screen.findByText(/ainda está sendo importada/)).toBeInTheDocument()
    expect(screen.getByLabelText('Setor (CNAE)')).toBeDisabled()
  })
})
