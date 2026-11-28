import { describe, it, expect } from 'vitest'
import { scoreLead, DEFAULT_PROFILE } from './icp'
import { parseLeadList, detectDelimiter } from './leadList'

describe('cliente ideal (Tier A/B/C)', () => {
  const profile = { ...DEFAULT_PROFILE, segments: 'odontologia, dentista', cities: 'São Paulo' }
  const rich = { name: 'Sorriso Odontologia', category: 'Dentista', city: 'São Paulo', phone: '5511999990000', email: 'a@b.com', instagram: 'x', website: 'y', rating: 4.8, reviews: 320, company: { situacao: 'ATIVA', socios: [{ nome: 'Ana' }] } }

  it('empresa completa do segmento e região vira Tier A com motivos', () => {
    const r = scoreLead(rich, profile)
    expect(r.tier).toBe('A')
    expect(r.score).toBe(100)
    expect(r.reasons.map(x => x.text)).toEqual(expect.arrayContaining(['é do segmento-alvo', 'dono identificado', 'tem Instagram']))
  })

  it('fora do segmento e da região perde pontos; requisito faltando limita a Tier C', () => {
    const far = scoreLead({ ...rich, category: 'Padaria', name: 'Pão Bom', city: 'Recife' }, profile)
    expect(far.score).toBeLessThan(scoreLead(rich, profile).score)
    expect(far.reasons.some(x => x.text === 'fora do segmento-alvo')).toBe(true)
    const noPhone = scoreLead({ ...rich, phone: '' }, profile)
    expect(noPhone).toMatchObject({ tier: 'C', score: 39 })
    expect(noPhone.reasons.at(-1).text).toBe('falta telefone')
  })

  it('WhatsApp validado sobe a nota; sem WhatsApp desce e, se exigido, limita a Tier C', () => {
    const base = { ...rich, rating: 4.2, reviews: 20, company: null, instagram: '' }
    const plain = scoreLead(base, profile).score
    expect(scoreLead({ ...base, hasWhatsapp: true }, profile).score).toBe(plain + 8)
    expect(scoreLead({ ...base, hasWhatsapp: false }, profile).score).toBe(plain - 12)
    const strict = scoreLead({ ...base, hasWhatsapp: false }, { ...profile, needWhatsapp: true })
    expect(strict.tier).toBe('C')
    expect(strict.reasons.at(-1).text).toBe('falta WhatsApp')
    expect(scoreLead(base, { ...profile, needWhatsapp: true }).tier).not.toBe('C') // ainda não conferido: não pune
  })

  it('CNPJ baixado derruba a nota', () => {
    expect(scoreLead({ ...rich, company: { situacao: 'BAIXADA' } }, profile).tier).not.toBe('A')
  })
})

describe('importação de listas', () => {
  it('lê planilha com ponto e vírgula, aspas e colunas em português', () => {
    const csv = '﻿Nome;Telefone;E-mail;Site;Instagram;Cidade;Segmento\n"Clínica ""Sorriso""";(11) 98765-4321;CONTATO@SORRISO.COM;sorriso.com.br/;@clinicasorriso;São Paulo;Odontologia\nSem Nome;;;;;;\n'
    const r = parseLeadList(csv)
    expect(r.leads).toHaveLength(2)
    expect(r.leads[0]).toEqual({ name: 'Clínica "Sorriso"', phone: '11987654321', email: 'contato@sorriso.com', website: 'sorriso.com.br', instagram: 'https://www.instagram.com/clinicasorriso', city: 'São Paulo', state: '', category: 'Odontologia', cnpj: '' })
  })

  it('aceita vírgula, cabeçalho em inglês e lista colada sem cabeçalho', () => {
    expect(detectDelimiter('name,phone,email')).toBe(',')
    const en = parseLeadList('Company,Phone,Website\nAcme,+55 21 99999-0000,https://acme.com')
    expect(en.leads[0]).toMatchObject({ name: 'Acme', phone: '+5521999990000', website: 'https://acme.com' })
    const pasted = parseLeadList('Padaria Central\t(31) 3333-4444\nMercado Bom\t31 98888-7777')
    expect(pasted.leads.map(l => l.phone)).toEqual(['3133334444', '31988887777'])
  })
})
