import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const { st, mfaApi, totp, getProxyToken, signOut } = vi.hoisted(() => {
  const st = { current: null }
  return {
    st,
    mfaApi: { status: vi.fn(async () => st.current), useRecovery: vi.fn(), verifyEmail: vi.fn(), sendEmail: vi.fn() },
    totp: { verify: vi.fn() },
    getProxyToken: vi.fn(async () => 'tok'),
    signOut: vi.fn(),
  }
})
vi.mock('@services/mfa', () => ({ mfaApi, totp, MFA_EVENT: 'rf:mfa-required' }))
vi.mock('@/lib/supabase', () => ({ getProxyToken: (...a) => getProxyToken(...a) }))
vi.mock('@context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'ana@x.com' }, session: { user: { id: 'u1' } }, isDemoMode: false, signOut }) }))

import { MfaGate } from './MfaGate'

const LOCKED = { required: true, satisfied: false, totp: true, totpFactorIds: ['f1'], email: false, emailAvailable: false, recoveryAvailable: true, recoveryLeft: 8 }

beforeEach(() => { vi.clearAllMocks(); st.current = null })

describe('MfaGate', () => {
  it('sem 2FA (ou já verificado) mostra o app normalmente', async () => {
    st.current = { required: false, satisfied: true }
    render(<MfaGate><p>painel</p></MfaGate>)
    await waitFor(() => expect(mfaApi.status).toHaveBeenCalled())
    expect(screen.getByText('painel')).toBeInTheDocument()
  })

  it('com 2FA pendente esconde o app até o código do autenticador', async () => {
    st.current = LOCKED
    render(<MfaGate><p>painel</p></MfaGate>)
    expect(await screen.findByText('Verificação em duas etapas')).toBeInTheDocument()
    expect(screen.queryByText('painel')).toBeNull()
    expect(screen.queryByText('Receber código por e-mail')).toBeNull() // sem provedor de e-mail

    fireEvent.change(screen.getByLabelText('Código de verificação'), { target: { value: '12a34 56' } })
    expect(screen.getByLabelText('Código de verificação').value).toBe('123456')
    st.current = { ...LOCKED, satisfied: true, aal: 'aal2' }
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirmar/ })) })
    expect(totp.verify).toHaveBeenCalledWith('f1', '123456')
    expect(getProxyToken).toHaveBeenCalledWith({ force: true })
    expect(await screen.findByText('painel')).toBeInTheDocument()
  })

  it('perdeu o celular: código de recuperação libera e avisa quando restam poucos', async () => {
    st.current = LOCKED
    mfaApi.useRecovery.mockImplementation(async () => { st.current = { ...LOCKED, satisfied: true }; return { left: 1 } })
    render(<MfaGate><p>painel</p></MfaGate>)
    fireEvent.click(await screen.findByText('Perdi o celular: usar código de recuperação'))
    fireEvent.change(screen.getByLabelText('Código de recuperação'), { target: { value: 'abcde-fghjk' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirmar/ })) })
    expect(mfaApi.useRecovery).toHaveBeenCalledWith('abcde-fghjk')
    expect(await screen.findByText('painel')).toBeInTheDocument()
  })

  it('código errado mostra o erro e continua bloqueado', async () => {
    st.current = LOCKED
    totp.verify.mockRejectedValueOnce(new Error('Código incorreto ou vencido.'))
    render(<MfaGate><p>painel</p></MfaGate>)
    fireEvent.change(await screen.findByLabelText('Código de verificação'), { target: { value: '000000' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirmar/ })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Código incorreto')
    expect(screen.queryByText('painel')).toBeNull()
  })

  it('o servidor pedindo 2FA (evento) faz a porta aparecer', async () => {
    st.current = { required: true, satisfied: true, totp: true, totpFactorIds: ['f1'] }
    render(<MfaGate><p>painel</p></MfaGate>)
    expect(await screen.findByText('painel')).toBeInTheDocument()
    st.current = LOCKED
    await act(async () => { window.dispatchEvent(new CustomEvent('rf:mfa-required')) })
    expect(await screen.findByText('Verificação em duas etapas')).toBeInTheDocument()
  })
})
