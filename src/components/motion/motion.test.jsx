import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { parseLocaleNumber, formatLike, CountUp, RevealText } from './index'

describe('números animados', () => {
  it('lê o número de textos em pt-BR', () => {
    expect(parseLocaleNumber('R$ 1.234,50')).toMatchObject({ value: 1234.5, decimals: 2, grouped: true })
    expect(parseLocaleNumber('R$ 43,6 mil')).toMatchObject({ value: 43.6, decimals: 1 })
    expect(parseLocaleNumber('50%')).toMatchObject({ value: 50, decimals: 0, index: 0 })
    expect(parseLocaleNumber('sem número')).toBeNull()
  })

  it('formata no mesmo jeito do original', () => {
    expect(formatLike(parseLocaleNumber('R$ 1.234,50'), 999.5)).toBe('999,50')
    expect(formatLike(parseLocaleNumber('2.527'), 2527)).toBe('2.527')
  })

  it('leitor de tela recebe o valor final, mesmo durante a animação', () => {
    render(<CountUp value="R$ 1.497,00" />)
    expect(screen.getByLabelText('R$ 1.497,00')).toBeInTheDocument()
  })

  it('texto sem número aparece como está', () => {
    render(<p><CountUp value="—" /></p>)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('título por letra mantém o texto acessível', () => {
    render(<h1><RevealText text="Cobranças" /></h1>)
    expect(screen.getByLabelText('Cobranças')).toBeInTheDocument()
  })
})
