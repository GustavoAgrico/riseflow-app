import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const q = require('./quality')

describe('chaves de identidade do lead', () => {
  it('telefone: com/sem DDI, máscara, inválido', () => {
    expect(q.phoneKey('(11) 98765-4321')).toBe('5511987654321')
    expect(q.phoneKey('+55 11 98765-4321')).toBe('5511987654321')
    expect(q.phoneKey('+1 415 555 0100')).toBe('14155550100')
    expect(q.phoneKey('1234')).toBeNull()
  })

  it('CNPJ raiz junta matriz e filiais', () => {
    expect(q.cnpjRoot('11.222.333/0001-81')).toBe('11222333')
    expect(q.cnpjRoot('11222333000262')).toBe('11222333')
    expect(q.cnpjRoot('123')).toBeNull()
  })

  it('domínio: site e e-mail dão a mesma chave; genéricos e redes não contam', () => {
    expect(q.domainKey('https://www.clinicasorriso.com.br/contato')).toBe('clinicasorriso.com.br')
    expect(q.domainKey('contato@loja.clinicasorriso.com.br')).toBe('clinicasorriso.com.br')
    expect(q.domainKey('acme.com')).toBe('acme.com')
    expect(q.domainKey('fulano@gmail.com')).toBeNull()
    expect(q.domainKey('https://instagram.com/clinica')).toBeNull()
    expect(q.domainKey('sorriso.wixsite.com/site')).toBe('sorriso.wixsite.com')
    expect(q.domainKey('não é site')).toBeNull()
  })

  it('leadKeys reúne tudo sem repetir', () => {
    const keys = q.leadKeys({ phone: '11987654321', whatsapp: '5511987654321', cnpj: '11222333000181', website: 'acme.com.br', email: 'oi@acme.com.br' })
    expect(keys.sort()).toEqual(['cnpj_root:11222333', 'domain:acme.com.br', 'phone:5511987654321'])
  })
})

describe('triagem', () => {
  const leads = [
    { key: 'a', name: 'Acme', phone: '11 3333-4444', website: 'acme.com.br' },
    { key: 'b', name: 'Acme filial', phone: '11 3333-5555', website: 'https://acme.com.br/sp' },  // mesmo domínio
    { key: 'c', name: 'Beta', phone: '21 99999-0000' },
    { key: 'd', name: 'Gama', cnpj: '11222333000262', phone: '31 98888-7777' },
    { key: 'e', name: 'Delta', email: 'x@delta.com' },
  ]

  it('marca novo, repetido, no CRM e excluído (com motivo)', () => {
    const r = q.screenLeads(leads, {
      excluded: new Map([['cnpj_root:11222333', 'opt_out']]),
      crm: new Set(['phone:5521999990000']),
    })
    expect(r.map(x => x.status)).toEqual(['novo', 'repetido', 'no_crm', 'excluido', 'novo'])
    expect(r[1]).toMatchObject({ of: 'a', match: 'domain:acme.com.br' })
    expect(r[3]).toMatchObject({ reason: 'opt_out' })
    expect(q.summarize(r)).toEqual({ found: 5, new_count: 2, excluded: 1, in_crm: 1 })
  })

  it('exclusão vence CRM e repetição', () => {
    const r = q.screenLeads([leads[0], leads[0]], { excluded: new Map([['phone:551133334444', 'descartado']]), crm: new Set(['domain:acme.com.br']) })
    expect(r.map(x => x.status)).toEqual(['excluido', 'excluido'])
  })
})

describe('pedido para sair', () => {
  it('só a mensagem inteira conta', () => {
    for (const t of ['SAIR', 'sair.', 'Parar', 'não quero receber', 'me tira da lista!']) expect(q.isOptOut(t), t).toBe(true)
    for (const t of ['vou sair mais cedo hoje', 'qual o preço?', 'parar de pagar boleto?', '']) expect(q.isOptOut(t), t).toBe(false)
  })
})

describe('perfil de cliente ideal', () => {
  it('só campos conhecidos, com tipos e limites', () => {
    expect(q.cleanProfile({ segments: 'odonto', minRating: '4.5', needWhatsapp: 1, hack: 'x', minReviews: -3 }))
      .toEqual({ segments: 'odonto', minRating: 4.5, needWhatsapp: true, minReviews: 0 })
  })
})

describe('validação de WhatsApp', () => {
  // supabase falso: cache com 1 número; registra o que foi salvo
  const fakeDb = (cached) => {
    const saved = []
    const chain = {
      select: () => chain, eq: () => chain, in: () => chain,
      gte: async () => ({ data: cached, error: null }),
      upsert: async (rows) => { saved.push(...rows); return { error: null } },
    }
    return { db: { from: () => chain }, saved }
  }

  it('usa o cache, consulta só o que falta e guarda o resultado', async () => {
    const supa = require('../supabaseClient')
    const orig = supa.supabase
    const { db, saved } = fakeDb([{ phone: '5511900000001', has_whatsapp: true }])
    supa.supabase = db
    delete require.cache[require.resolve('./quality')]
    const fresh = require('./quality')
    const calls = []
    const baileys = { post: async (url, body) => { calls.push(body); return { data: { results: [{ number: '5511900000002', exists: false }, { number: '5511900000003', exists: null }] } } } }
    try {
      const r = await fresh.checkWhatsApp('user-a', ['11 90000-0001', '(11) 90000-0002', '11900000003', 'lixo'], { baileys })
      expect(calls).toEqual([{ userId: 'user-a', numbers: ['5511900000002', '5511900000003'] }])
      expect(r.results).toEqual([
        { phone: '5511900000001', whatsapp: true, cached: true },
        { phone: '5511900000002', whatsapp: false, cached: false },
        { phone: '5511900000003', whatsapp: null, cached: false },
      ])
      expect(saved.map(s => [s.user_id, s.phone, s.has_whatsapp])).toEqual([['user-a', '5511900000002', false]])
    } finally {
      supa.supabase = orig
      delete require.cache[require.resolve('./quality')]
    }
  })

  it('WhatsApp desconectado vira mensagem clara (409)', async () => {
    const supa = require('../supabaseClient')
    const orig = supa.supabase
    supa.supabase = fakeDb([]).db
    delete require.cache[require.resolve('./quality')]
    const fresh = require('./quality')
    const baileys = { post: async () => { throw Object.assign(new Error('x'), { response: { status: 409, data: { error: 'WhatsApp não conectado' } } }) } }
    try {
      await expect(fresh.checkWhatsApp('user-b', ['11900000009'], { baileys })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Integrações/) })
    } finally {
      supa.supabase = orig
      delete require.cache[require.resolve('./quality')]
    }
  })
})
