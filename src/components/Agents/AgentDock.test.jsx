import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AgentDock } from '@components/Agents/AgentDock'
import { agentsApi } from '@services/agents'

const auth = { isDemoMode: true }
vi.mock('@context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('@services/socket', () => ({ default: { on: vi.fn(), off: vi.fn() } }))
vi.mock('@services/agents', () => ({
  agentsApi: { list: vi.fn(), messages: vi.fn(), send: vi.fn(), approvals: vi.fn(), decide: vi.fn() },
}))

const renderDock = () => render(<MemoryRouter><AgentDock /></MemoryRouter>)

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  auth.isDemoMode = true
})

test('demo: abre o Rizo, aprova e envia mensagem', async () => {
  renderDock()
  const tabs = await screen.findAllByRole('tab')
  expect(tabs).toHaveLength(6)
  fireEvent.click(tabs[0])
  expect(screen.getByLabelText('Conversa com Rizo')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Aprovar'))
  await waitFor(() => expect(screen.getByText(/^Aprovado\./)).toBeInTheDocument())
  expect(screen.queryByText('PEDE APROVAÇÃO')).not.toBeInTheDocument()

  const input = document.querySelector('#agent-dock-input')
  expect(screen.getByLabelText('Enviar mensagem')).toBeDisabled()
  fireEvent.change(input, { target: { value: 'Quem eu ligo hoje?' } })
  fireEvent.submit(input.form)
  expect(await screen.findByText('Quem eu ligo hoje?')).toBeInTheDocument()

  // Fechar e persistir: o estado vai para o localStorage.
  fireEvent.click(screen.getByLabelText('Fechar aba do agente'))
  expect(screen.queryByLabelText('Conversa com Rizo')).not.toBeInTheDocument()
  expect(localStorage.getItem('rf.agentDock.open')).toBe('false')
})

test('demo: pedido de leads para a Bia responde com o atalho para a Prospecção', async () => {
  renderDock()
  fireEvent.click((await screen.findAllByRole('tab'))[1])
  expect(screen.getByText(/Modo exemplo/)).toBeInTheDocument()
  const input = document.querySelector('#agent-dock-input')
  fireEvent.change(input, { target: { value: 'quero que busque contatos para leads' } })
  fireEvent.submit(input.form)
  const link = await screen.findByRole('link', { name: /Abrir Prospecção com IA/ })
  expect(link).toHaveAttribute('href', '/prospeccao')
  expect(screen.getByText(/Ainda sou um exemplo/)).toBeInTheDocument()
})

test('sem backend: resposta que não é lista de agentes (index.html) cai no demo', async () => {
  auth.isDemoMode = false
  agentsApi.list.mockResolvedValue('<!doctype html><html></html>')
  renderDock()
  const tabs = await screen.findAllByRole('tab')
  fireEvent.click(tabs[2])
  expect(screen.getByLabelText('Conversa com Pino')).toHaveTextContent('exemplo')
  expect(agentsApi.messages).not.toHaveBeenCalled()
})

test('com backend: decisão que falha devolve o cartão e mostra alerta', async () => {
  auth.isDemoMode = false
  agentsApi.list.mockResolvedValue([{ id: 'ag1', kind: 'comercial', name: 'Rizo', role: 'Comercial', status: 'waiting_approval' }])
  agentsApi.messages.mockResolvedValue([])
  agentsApi.approvals.mockResolvedValue([{ id: 'ap1', tool: 'send_whatsapp', summary: 'Enviar proposta.' }])
  agentsApi.decide.mockRejectedValue(new Error('500'))
  renderDock()
  fireEvent.click((await screen.findAllByRole('tab'))[0])
  fireEvent.click(await screen.findByText('Aprovar'))
  expect(agentsApi.decide).toHaveBeenCalledWith('ap1', 'approve')
  expect(await screen.findByRole('alert')).toHaveTextContent('A decisão não foi registrada')
  expect(screen.getByText('Enviar proposta.')).toBeInTheDocument()
  expect(screen.queryByText(/^Aprovado\./)).not.toBeInTheDocument()
})
