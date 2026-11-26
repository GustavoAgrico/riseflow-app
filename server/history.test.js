import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { groupHistory } = require('./inbox')

describe('histórico do WhatsApp (pareamento)', () => {
  it('agrupa por telefone, ordena por data e usa rótulo para mídia', () => {
    const g = groupHistory([
      { jid: '5511999990000@s.whatsapp.net', id: 'b', fromMe: true, text: 'Oi, tudo bem?', timestamp: 1700000100 },
      { jid: '5511999990000@s.whatsapp.net', id: 'a', fromMe: false, text: 'Quero um orçamento', pushName: 'Ana', timestamp: 1700000000 },
      { jid: '5521888880000:12@s.whatsapp.net', id: 'c', fromMe: false, text: '', messageType: 'image', timestamp: 1700000200 },
    ])
    expect([...g.keys()]).toEqual(['5511999990000', '5521888880000'])
    expect(g.get('5511999990000').map(m => m.id)).toEqual(['a', 'b'])
    expect(g.get('5521888880000')[0]).toMatchObject({ content: '📷 Imagem', at: new Date(1700000200 * 1000).toISOString() })
  })

  it('descarta mensagem sem id, sem data, sem conteúdo ou com número inválido', () => {
    const g = groupHistory([
      { jid: '5511999990000@s.whatsapp.net', id: null, text: 'x', timestamp: 1 },
      { jid: '5511999990000@s.whatsapp.net', id: 'x', text: 'x' },
      { jid: '5511999990000@s.whatsapp.net', id: 'y', text: '', messageType: 'text', timestamp: 1 },
      { jid: '123@s.whatsapp.net', id: 'z', text: 'oi', timestamp: 1 },
    ])
    expect(g.size).toBe(0)
  })
})
