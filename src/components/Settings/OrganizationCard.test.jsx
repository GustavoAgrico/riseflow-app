import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const get = vi.fn()
const patch = vi.fn()
vi.mock('@services/api', () => ({ api: { get: (...a) => get(...a), patch: (...a) => patch(...a) } }))
import { OrganizationCard } from './OrganizationCard'

const ORG = { organization: { id: 'o1', name: 'Clínica Sorriso' }, role: 'owner', members: [
  { id: 'a', email: 'dono@x.com', role: 'owner', status: 'active' },
  { id: 'b', email: 'ana@x.com', role: 'agent', status: 'invited' },
] }

beforeEach(() => { get.mockReset(); patch.mockReset() })

describe('OrganizationCard', () => {
  it('mostra empresa, papel e equipe', async () => {
    get.mockResolvedValue({ data: ORG })
    render(<OrganizationCard />)
    expect(await screen.findByText('Clínica Sorriso')).toBeInTheDocument()
    expect(screen.getByText('Você: Dono')).toBeInTheDocument()
    expect(screen.getByText('ana@x.com')).toBeInTheDocument()
    expect(screen.getByText('sem login ainda')).toBeInTheDocument()
  })

  it('dono renomeia a empresa', async () => {
    get.mockResolvedValue({ data: ORG })
    patch.mockResolvedValue({ data: { organization: { id: 'o1', name: 'Sorriso Ltda' } } })
    render(<OrganizationCard />)
    fireEvent.click(await screen.findByLabelText('Renomear empresa'))
    fireEvent.change(screen.getByLabelText('Nome da empresa'), { target: { value: 'Sorriso Ltda' } })
    fireEvent.click(screen.getByLabelText('Salvar nome'))
    expect(await screen.findByText('Sorriso Ltda')).toBeInTheDocument()
    expect(patch).toHaveBeenCalledWith('/org', { name: 'Sorriso Ltda' })
  })

  it('atendente não vê o botão de renomear', async () => {
    get.mockResolvedValue({ data: { ...ORG, role: 'agent', members: [] } })
    render(<OrganizationCard />)
    expect(await screen.findByText('Você: Atendente')).toBeInTheDocument()
    expect(screen.queryByLabelText('Renomear empresa')).toBeNull()
  })

  it('sem migração (organization null) ou em demo, não aparece', async () => {
    get.mockResolvedValue({ data: { organization: null, role: 'owner', members: [] } })
    const { container } = render(<OrganizationCard />)
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
    get.mockClear()
    render(<OrganizationCard disabled />)
    expect(get).not.toHaveBeenCalled()
  })
})
