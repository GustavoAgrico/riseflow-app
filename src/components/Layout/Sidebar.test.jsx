import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from './Sidebar'

// Mocks dos contextos (o Sidebar só precisa de sidebarOpen + dados do usuário)
vi.mock('@context/AppContext', () => ({ useApp: () => ({ sidebarOpen: true, setSidebarOpen: vi.fn() }) }))

let authValue
vi.mock('@context/AuthContext', () => ({ useAuth: () => authValue }))

const renderAt = (path = '/dashboard') =>
  render(<MemoryRouter initialEntries={[path]}><Sidebar /></MemoryRouter>)

beforeEach(() => {
  authValue = { user: { email: 'ana@ex.com', user_metadata: { full_name: 'Ana Lima' } }, isDemoMode: false, isMember: false }
  try { localStorage.clear() } catch {}
})

describe('Sidebar — navegação agrupada', () => {
  it('mostra as 5 seções semânticas', () => {
    renderAt()
    for (const label of ['Operação', 'Vendas', 'Automação', 'Análise', 'Administração']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    }
  })

  it('marca a página ativa com aria-current="page"', () => {
    renderAt('/crm')
    const link = screen.getByRole('link', { name: 'CRM' })
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('permite recolher um grupo (aria-expanded alterna e itens somem)', () => {
    renderAt('/dashboard')
    const header = screen.getByRole('button', { name: /Vendas/i })
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Agendamentos' })).toBeInTheDocument()
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Agendamentos' })).toBeNull()
  })

  it('a busca global filtra as páginas', () => {
    renderAt()
    fireEvent.change(screen.getByRole('searchbox', { name: /buscar/i }), { target: { value: 'cobr' } })
    expect(screen.getByRole('link', { name: 'Cobranças' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull()
  })

  it('membro de equipe não vê a seção Administração', () => {
    authValue = { ...authValue, isMember: true }
    renderAt('/chat')
    expect(screen.queryByRole('button', { name: /Administração/i })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Configurações' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Chat' })).toBeInTheDocument()
  })

  it('nenhuma rota removida: com tudo aberto, os 20 itens têm link', () => {
    try { localStorage.setItem('rf_nav_open', JSON.stringify({ operacao: true, vendas: true, automacao: true, analise: true, admin: true })) } catch {}
    renderAt()
    expect(screen.getAllByRole('link').length).toBe(20)
  })
})
