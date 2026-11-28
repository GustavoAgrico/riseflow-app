import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const { st, mfaApi, totp } = vi.hoisted(() => {
  const st = { current: null }
  return {
    st,
    mfaApi: { status: vi.fn(async () => st.current), generateRecovery: vi.fn(), removeTotp: vi.fn(), sendEmail: vi.fn(), verifyEmail: vi.fn(), disableEmail: vi.fn() },
    totp: { enroll: vi.fn(), verify: vi.fn(), unenroll: vi.fn() },
  }
})
vi.mock('@services/mfa', () => ({ mfaApi, totp }))

import { TwoFactorSettings } from './TwoFactorSettings'

const OFF = { required: false, satisfied: true, totp: false, totpFactorIds: [], email: false, emailAvailable: false, recoveryAvailable: true, recoveryLeft: 0 }
const CODES = ['aaaaa-bbbbb', 'ccccc-ddddd', 'eeeee-fffff', 'ggggg-hhhhh', 'jjjjj-kkkkk', 'mmmmm-nnnnn', 'ppppp-qqqqq', 'rrrrr-sssss']

beforeEach(() => { vi.clearAllMocks(); st.current = OFF })

describe('TwoFactorSettings', () => {
  it('ativa com QR code e mostra os códigos de recuperação uma vez', async () => {
    totp.enroll.mockResolvedValue({ factorId: 'f1', qr: 'data:image/svg+xml;utf8,<svg/>', secret: 'JBSWY3DPEHPK3PXP' })
    mfaApi.generateRecovery.mockResolvedValue({ codes: CODES })
    render(<TwoFactorSettings />)
    expect(await screen.findByText('Desativada')).toBeInTheDocument()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Ativar com app autenticador/ })) })
    expect(screen.getByAltText('QR code para o app autenticador')).toBeInTheDocument()
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Código do app autenticador'), { target: { value: '123456' } })
    st.current = { ...OFF, required: true, totp: true, totpFactorIds: ['f1'], recoveryLeft: 8 }
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirmar e ativar/ })) })
    expect(totp.verify).toHaveBeenCalledWith('f1', '123456')
    expect(screen.getByText('Ativada')).toBeInTheDocument()
    expect(screen.getByLabelText('Códigos de recuperação')).toHaveTextContent('aaaaa-bbbbb')

    fireEvent.click(screen.getByRole('button', { name: /Já guardei/ }))
    expect(screen.queryByLabelText('Códigos de recuperação')).toBeNull()
    expect(screen.getByText(/Códigos de recuperação restantes: 8/)).toBeInTheDocument()
  })

  it('desativar pede confirmação; sessão aceita por recuperação usa o servidor', async () => {
    st.current = { ...OFF, required: true, totp: true, totpFactorIds: ['f1'], recoveryLeft: 3 }
    totp.unenroll.mockRejectedValue(new Error('AAL2 required'))
    render(<TwoFactorSettings />)
    fireEvent.click(await screen.findByRole('button', { name: /Desativar/ }))
    expect(screen.getByText(/só com a senha/)).toBeInTheDocument()
    st.current = OFF
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirmar/ })) })
    expect(mfaApi.removeTotp).toHaveBeenCalledWith('f1')
    expect(screen.getByText('Desativada')).toBeInTheDocument()
  })

  it('e-mail só aparece como opção quando o servidor tem provedor', async () => {
    render(<TwoFactorSettings />)
    expect(await screen.findByText(/disponível quando o envio de e-mail do sistema estiver configurado/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ativar por e-mail/ })).toBeNull()
  })
})
