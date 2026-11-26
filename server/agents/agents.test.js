import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'

// O servidor é CommonJS: carregar pelo mesmo require garante as mesmas classes de erro
// (um import ESM criaria uma segunda cópia do módulo e o instanceof falharia).
const require = createRequire(import.meta.url)
const Anthropic = require('@anthropic-ai/sdk')
const { runChain } = require('./providers')
const { ProviderError, NoProviderError } = require('./providers/errors')
const claude = require('./providers/claude')
const { runTurn, toModelMessages, NO_KEY_MESSAGE, REFUSAL_MESSAGE } = require('./turn')
const realtime = require('../realtime')

const ok = (text) => ({ run: vi.fn().mockResolvedValue({ text, stopReason: 'end_turn', model: 'm', usage: { in: 1, out: 2 } }) })
const fails = (switchable) => ({ run: vi.fn().mockRejectedValue(new ProviderError('falhou', { switchable, retryable: switchable })) })
const keys = { anthropic_key: 'a', openai_key: 'o' }

describe('runChain (troca automática de modelo)', () => {
  it('troca para o próximo provedor quando o primeiro cai e registra de onde veio', async () => {
    const adapters = { claude: fails(true), openai: ok('oi') }
    const r = await runChain({ chain: ['claude', 'openai'], keys, system: 's', messages: [], adapters })
    expect(r).toMatchObject({ text: 'oi', provider: 'openai', fallbackFrom: 'claude' })
  })

  it('não troca em pedido inválido (o erro se repetiria)', async () => {
    const adapters = { claude: fails(false), openai: ok('oi') }
    await expect(runChain({ chain: ['claude', 'openai'], keys, system: 's', messages: [], adapters })).rejects.toThrow('falhou')
    expect(adapters.openai.run).not.toHaveBeenCalled()
  })

  it('usa o Groq como último recurso mesmo fora da cadeia do agente', async () => {
    const auth = () => ({ run: vi.fn().mockRejectedValue(new ProviderError('401', { switchable: true, status: 401 })) })
    const adapters = { claude: auth(), openai: auth(), groq: ok('groq ok') }
    const r = await runChain({ chain: ['claude', 'openai'], keys: { ...keys, groq_key: 'g' }, system: 's', messages: [], adapters })
    expect(r).toMatchObject({ text: 'groq ok', provider: 'groq', fallbackFrom: 'claude' })
  })

  it('todas as chaves recusadas viram aviso claro, sem nova tentativa', async () => {
    const auth = () => ({ run: vi.fn().mockRejectedValue(new ProviderError('401', { switchable: true, status: 401 })) })
    const adapters = { claude: auth(), openai: auth(), groq: auth() }
    const err = await runChain({ chain: ['claude'], keys: { ...keys, groq_key: 'g' }, system: 's', messages: [], adapters }).catch(e => e)
    expect(err.name).toBe('KeysRejectedError')
    expect(err.message).toBe('Chave de IA recusada: Claude, Groq, OpenAI.')
    const turn = await runTurn({ agent: { name: 'Rizo', role: 'r', instructions: 'i' }, history: [{ author_kind: 'user', content: 'oi' }], keys },
      { runChain: vi.fn().mockRejectedValue(err) })
    expect(turn).toMatchObject({ authorKind: 'system', text: 'Chave de IA recusada: Claude, Groq, OpenAI. Atualize em Configurações → API & Webhooks.' })
  })

  it('pula provedor sem chave e falha sem nenhuma chave', async () => {
    const adapters = { claude: ok('c'), openai: ok('o') }
    const r = await runChain({ chain: ['claude', 'openai'], keys: { openai_key: 'o' }, system: 's', messages: [], adapters })
    expect(r.provider).toBe('openai')
    expect(adapters.claude.run).not.toHaveBeenCalled()
    await expect(runChain({ chain: ['claude'], keys: {}, system: 's', messages: [], adapters })).rejects.toBeInstanceOf(NoProviderError)
  })
})

describe('adaptador Claude', () => {
  it('chama o Opus 5.5 com fallback do servidor e devolve só o texto', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Olá!' }],
      stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 3 },
    })
    const r = await claude.run({ system: 's', messages: [{ role: 'user', content: 'oi' }], client: { beta: { messages: { create } } } })
    expect(r).toEqual({ text: 'Olá!', stopReason: 'end_turn', model: 'claude-opus-5-5', usage: { in: 10, out: 3 }, steps: 0 })
    expect(create.mock.calls[0][0]).toMatchObject({
      model: 'claude-opus-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'], output_config: { effort: 'low' },
    })
  })

  it('limite (429) vira erro que troca de provedor; 400 não troca', async () => {
    const limit = Object.assign(Object.create(Anthropic.RateLimitError.prototype), { status: 429, message: 'limite' })
    const bad = Object.assign(Object.create(Anthropic.BadRequestError.prototype), { status: 400, message: 'inválido' })
    const client = (err) => ({ beta: { messages: { create: vi.fn().mockRejectedValue(err) } } })
    await expect(claude.run({ system: 's', messages: [], client: client(limit) })).rejects.toMatchObject({ switchable: true, retryable: true })
    await expect(claude.run({ system: 's', messages: [], client: client(bad) })).rejects.toMatchObject({ switchable: false, retryable: false })
  })
})

describe('turno', () => {
  const agent = { name: 'Bia', role: 'Atendente', instructions: 'Ajude.', provider_chain: ['claude'] }

  it('monta o histórico começando pelo usuário e unindo mensagens seguidas', () => {
    expect(toModelMessages([
      { author_kind: 'agent', content: 'antes' },
      { author_kind: 'user', content: 'a' },
      { author_kind: 'user', content: 'b' },
      { author_kind: 'agent', content: 'c' },
      { author_kind: 'user', content: 'd' },
    ])).toEqual([
      { role: 'user', content: 'a\n\nb' },
      { role: 'assistant', content: 'c' },
      { role: 'user', content: 'd' },
    ])
  })

  it('responde com o texto do modelo e os dados da execução', async () => {
    const chain = vi.fn().mockResolvedValue({ text: 'Claro!', stopReason: 'end_turn', provider: 'claude', model: 'claude-opus-5-5', fallbackFrom: null, usage: { in: 5, out: 2 } })
    const r = await runTurn({ agent, history: [{ author_kind: 'user', content: 'oi' }], keys }, { runChain: chain })
    expect(r).toMatchObject({ authorKind: 'agent', text: 'Claro!', run: { provider: 'claude', tokens_in: 5, tokens_out: 2 } })
    expect(chain.mock.calls[0][0].system).toContain('Você se chama Bia')
  })

  it('sem chave de IA responde com aviso de sistema; recusa vira aviso curto', async () => {
    const noKey = await runTurn({ agent, history: [{ author_kind: 'user', content: 'oi' }], keys: {} },
      { runChain: vi.fn().mockRejectedValue(new NoProviderError()) })
    expect(noKey).toMatchObject({ authorKind: 'system', text: NO_KEY_MESSAGE })
    const refused = await runTurn({ agent, history: [{ author_kind: 'user', content: 'x' }], keys },
      { runChain: vi.fn().mockResolvedValue({ text: '', stopReason: 'refusal', provider: 'claude' }) })
    expect(refused).toMatchObject({ authorKind: 'system', text: REFUSAL_MESSAGE })
  })
})

describe('tempo real por conta', () => {
  it('evento de agente vai só para a sala da conta, nunca para todos', () => {
    const emit = vi.fn()
    const io = { to: vi.fn(() => ({ emit })), emit: vi.fn() }
    realtime.setIo(io)
    realtime.emitToUser('conta-a', 'agent_message', { agent_id: 'x' })
    expect(io.to).toHaveBeenCalledWith('user:conta-a')
    expect(emit).toHaveBeenCalledWith('agent_message', { agent_id: 'x' })
    expect(io.emit).not.toHaveBeenCalled()
  })
})
