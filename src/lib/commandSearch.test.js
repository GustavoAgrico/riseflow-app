import { describe, it, expect } from 'vitest'
import { fold, score, searchContacts, pageItems, createItems, buildSections, isTypingTarget } from './commandSearch'

const NAV = [
  { label: 'Operação', items: [{ label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' }, { label: 'Clientes', path: '/clients' }] },
  { label: 'Administração', items: [{ label: 'Cobranças', path: '/billing' }, { label: 'Metas e produtos', path: '/goals' }] },
]
const CONTACTS = [
  { id: '1', name: 'João Pereira', company: 'Clínica Vida', phone: '5511987654321', email: 'joao@vida.com' },
  { id: '2', name: 'Maria Lopes', company: 'Auto Center', phone: '5521999990000' },
  { id: '3', name: 'Ana', company: 'Joalheria Sol', phone: '' },
]

describe('busca da paleta', () => {
  it('ignora acento e maiúsculas', () => {
    expect(fold('Cobranças')).toBe('cobrancas')
    expect(score('Cobranças', 'cobranca')).toBeGreaterThan(0)
    expect(score('Cobranças', 'xyz')).toBe(0)
  })

  it('início do texto vale mais que o meio', () => {
    expect(score('João Pereira', 'jo')).toBeGreaterThan(score('Ana Joalheria', 'jo'))
    expect(score('Ana Joalheria', 'jo')).toBeGreaterThan(score('Majora', 'jo'))
    const r = searchContacts(CONTACTS, 'jo')
    expect(r[0].label).toBe('João Pereira')
  })

  it('acha contato por telefone (só dígitos) e monta o link de abertura', () => {
    const r = searchContacts(CONTACTS, '99999')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ label: 'Maria Lopes', path: '/crm?abrir=2' })
    expect(searchContacts(CONTACTS, '')).toEqual([])
  })

  it('páginas e ações respeitam o cargo', () => {
    const canAccess = (p) => p !== '/goals' && p !== '/billing'
    expect(pageItems(NAV, canAccess).map(p => p.path)).toEqual(['/dashboard', '/clients'])
    expect(createItems(canAccess).some(a => a.id === 'create:nova-cobranca')).toBe(false)
    expect(createItems(canAccess).some(a => a.id === 'create:novo-fluxo')).toBe(true)
  })

  it('modo criar mostra só ações; busca vazia mostra páginas', () => {
    const pages = pageItems(NAV), creates = createItems()
    expect(buildSections({ query: 'cobr', mode: 'create', pages, creates, contacts: CONTACTS }).map(s => s.id)).toEqual(['create'])
    const all = buildSections({ query: '', mode: 'search', pages, creates, contacts: CONTACTS })
    expect(all.map(s => s.id)).toEqual(['pages', 'create'])
    const q = buildSections({ query: 'cobranca', mode: 'search', pages, creates, contacts: CONTACTS })
    expect(q.find(s => s.id === 'pages').items[0].path).toBe('/billing')
  })

  it('atalhos de uma tecla não disparam ao digitar', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false)
  })
})
