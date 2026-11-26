import { describe, it, expect } from 'vitest'
import { mentionQuery, filterPeople, insertMention, extractMentions, splitMentions } from './mentions'

const people = [
  { id: '1', name: 'Ana' },
  { id: '2', name: 'Ana Paula' },
  { id: '3', name: 'João Silva' },
]

describe('mentions', () => {
  it('detecta o termo depois do último @', () => {
    expect(mentionQuery('fala com @an')).toBe('an')
    expect(mentionQuery('@')).toBe('')
    expect(mentionQuery('email a@b.com')).toBeNull()
    expect(mentionQuery('sem menção')).toBeNull()
  })

  it('filtra pessoas sem acento e sem caixa', () => {
    expect(filterPeople(people, 'joao').map(p => p.id)).toEqual(['3'])
    expect(filterPeople(people, '').length).toBe(3)
  })

  it('insere o nome completo no lugar do termo', () => {
    expect(insertMention('ver com @jo', people[2])).toBe('ver com @João Silva ')
  })

  it('extrai menções preferindo o nome mais longo', () => {
    expect(extractMentions('@Ana Paula liga pra ele', people)).toEqual([{ id: '2', name: 'Ana Paula' }])
    expect(extractMentions('@ana e @joao silva', people).map(p => p.id).sort()).toEqual(['1', '3'])
    expect(extractMentions('@Anabela', people)).toEqual([])
  })

  it('divide o texto destacando as menções', () => {
    const parts = splitMentions('oi @Ana Paula, veja', [{ id: '2', name: 'Ana Paula' }])
    expect(parts).toEqual([
      { text: 'oi ', mention: false },
      { text: '@Ana Paula', mention: true },
      { text: ', veja', mention: false },
    ])
  })
})
