import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { scoreMessage, combineScore, levelOf } = require('./intent')
const { responseStats } = require('./pilot')

describe('detector de intenção de compra', () => {
  it('"quero comprar agora" é intenção alta', () => {
    const r = scoreMessage('Oi! Quero comprar agora, me manda o pix?')
    expect(r.level).toBe('alta')
    expect(r.score).toBeGreaterThanOrEqual(90)
    expect(r.signals).toEqual(expect.arrayContaining(['quer comprar', 'pediu forma de pagamento']))
  })

  it('pergunta de preço é intenção média; cumprimento é baixa', () => {
    const preco = scoreMessage('Boa tarde, quanto custa o plano?')
    expect(preco.level).toBe('media')
    expect(scoreMessage('oi tudo bem').level).toBe('baixa')
    expect(scoreMessage('').score).toBe(0)
  })

  it('entende sem acento e em espanhol', () => {
    expect(scoreMessage('qual o preco').signals).toContain('perguntou preço')
    expect(scoreMessage('¡Quiero comprar ahora!').level).toBe('alta')
  })

  it('reconhece o produto da conta citado na mensagem', () => {
    const r = scoreMessage('tenho interesse no Plano Pro', { products: [{ name: 'Plano Pro' }, { name: 'Básico' }] })
    expect(r.product).toBe('Plano Pro')
    expect(r.signals).toContain('citou Plano Pro')
  })

  it('recusa derruba a nota na hora', () => {
    const no = scoreMessage('não tenho interesse, para de mandar mensagem')
    expect(no.score).toBe(0)
    expect(combineScore(95, new Date().toISOString(), no)).toBe(0)
  })

  it('intenção forte não some com um "ok", mas esfria com os dias', () => {
    const ok = scoreMessage('ok')
    const now = Date.now()
    expect(combineScore(92, new Date(now).toISOString(), ok, now)).toBe(92)
    expect(combineScore(92, new Date(now - 7 * 86400000).toISOString(), ok, now)).toBe(44)
    expect(levelOf(80)).toBe('alta'); expect(levelOf(80, 85)).toBe('media')
  })
})

describe('tempo de resposta', () => {
  it('mediana entre a 1ª mensagem do cliente e a 1ª resposta', () => {
    const t = (min) => new Date(Date.UTC(2026, 10, 24, 10, min)).toISOString()
    const r = responseStats([
      { contact_phone: 'a', direction: 'inbound', created_at: t(0) },
      { contact_phone: 'a', direction: 'outbound', created_at: t(1) },
      { contact_phone: 'b', direction: 'received', created_at: t(0) },
      { contact_phone: 'b', direction: 'sent', created_at: t(10) },
      { contact_phone: 'c', direction: 'sent', created_at: t(0) },
      { contact_phone: 'd', direction: 'inbound', created_at: t(5) },
    ])
    expect(r).toEqual({ medianSeconds: 600, responded: 2, conversations: 3 })
  })
})
