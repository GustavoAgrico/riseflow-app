import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'

// Servidor CommonJS: carregar pelo mesmo require (mesmas classes) — ver agents.test.js.
const require = createRequire(import.meta.url)
const claude = require('./providers/claude')
const { openai } = require('./providers/openai')
const { createExecutor, validate } = require('./tools/executor')
const { TOOLS, TOOLS_BY_KIND, toolsForAgent } = require('./tools/catalog')
const crm = require('../crmActions')

// Banco falso: registra os filtros e responde só linhas da conta pedida.
function fakeDb(rows = {}) {
  const calls = []
  const db = {
    calls,
    from(table) {
      const q = { table, op: 'select', filters: [], payload: null }
      calls.push(q)
      const match = () => (rows[table] || []).filter(r => q.filters.every(([col, v]) => r[col] === undefined || r[col] === v))
      const api = {
        select() { return api },
        insert(p) { q.op = 'insert'; q.payload = p; return api },
        update(p) { q.op = 'update'; q.payload = p; return api },
        eq(col, v) { q.filters.push([col, v]); return api },
        order() { return api }, limit() { return api }, or() { return api }, ilike() { return api },
        gte() { return api }, lte() { return api }, lt() { return api },
        maybeSingle() { return Promise.resolve({ data: match()[0] || null, error: null }) },
        single() { return Promise.resolve({ data: q.op === 'insert' ? { id: 'novo', ...q.payload } : match()[0], error: null }) },
        then(res, rej) { return Promise.resolve({ data: q.op === 'select' ? match() : null, error: null }).then(res, rej) },
      }
      return api
    },
  }
  return db
}

const CLIENTE_A = { id: 'c1', user_id: 'conta-a', name: 'Clínica Sorriso', phone: '5511999990000', stage: 'lead' }
const ctxFor = (userId, extra = {}) => ({
  userId, agent: { id: 'ag', kind: 'comercial' }, db: fakeDb({ clients: [CLIENTE_A], pipeline_stages: [] }),
  deps: { crm, emitSalesUpdate: vi.fn(), sendText: vi.fn(), prospecting: {} }, ...extra,
})

describe('ciclo de ferramentas nos provedores', () => {
  it('Claude: executa a ferramenta, devolve a resposta do assistente intacta e o tool_result juntos', async () => {
    const first = {
      stop_reason: 'tool_use', model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 5 },
      content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'tu1', name: 'search_contacts', input: { query: 'sorriso' } }],
    }
    const second = { stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 20, output_tokens: 7 }, content: [{ type: 'text', text: 'Achei a Clínica Sorriso.' }] }
    const create = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const execute = vi.fn().mockResolvedValue({ contacts: [{ id: 'c1' }] })
    const r = await claude.run({ system: 's', messages: [{ role: 'user', content: 'ache a sorriso' }], tools: [{ name: 'search_contacts', description: 'd', schema: { type: 'object' } }], execute, client: { beta: { messages: { create } } } })
    expect(r).toMatchObject({ text: 'Achei a Clínica Sorriso.', steps: 1, usage: { in: 30, out: 12 } })
    expect(execute).toHaveBeenCalledWith('search_contacts', { query: 'sorriso' })
    const sent = create.mock.calls[1][0].messages
    expect(sent[1]).toEqual({ role: 'assistant', content: first.content })
    expect(sent[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: JSON.stringify({ contacts: [{ id: 'c1' }] }) }] })
    expect(create.mock.calls[0][0].tools[0]).toEqual({ name: 'search_contacts', description: 'd', input_schema: { type: 'object' } })
  })

  it('formato OpenAI (OpenAI/Groq): tool_calls viram mensagens tool e a conversa continua', async () => {
    const post = vi.fn()
      .mockResolvedValueOnce({ data: { choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'x1', type: 'function', function: { name: 'list_tasks', arguments: '{"filter":"hoje"}' } }] } }], usage: { prompt_tokens: 3, completion_tokens: 2 } } })
      .mockResolvedValueOnce({ data: { choices: [{ finish_reason: 'stop', message: { content: 'Você tem 1 tarefa hoje.' } }], usage: { prompt_tokens: 5, completion_tokens: 4 } } })
    const execute = vi.fn().mockResolvedValue({ tasks: [{ id: 't1' }] })
    const r = await openai.run({ apiKey: 'k', system: 's', messages: [{ role: 'user', content: 'tarefas de hoje?' }], tools: [{ name: 'list_tasks', description: 'd', schema: { type: 'object' } }], execute, http: { post } })
    expect(r).toMatchObject({ text: 'Você tem 1 tarefa hoje.', steps: 1 })
    expect(execute).toHaveBeenCalledWith('list_tasks', { filter: 'hoje' })
    const msgs = post.mock.calls[1][1].messages
    expect(msgs.at(-1)).toEqual({ role: 'tool', tool_call_id: 'x1', content: JSON.stringify({ tasks: [{ id: 't1' }] }) })
  })
})

describe('executor: risco, aprovação e repetição', () => {
  const tool = (name, risk, run = vi.fn().mockResolvedValue({ ok: true })) => ({ name, risk, run, description: 'd', schema: { type: 'object', properties: { x: { type: 'string' } }, required: [] } })

  it('risco alto nunca executa sem aprovação: vira pedido e a ação fica guardada', async () => {
    const send = tool('send_whatsapp', 'alto')
    const requestApproval = vi.fn().mockResolvedValue({ id: 'ap1', summary: 'Enviar WhatsApp' })
    const ex = createExecutor({ ctx: {}, tools: [send], requestApproval })
    const out = await ex.execute('send_whatsapp', { x: 'oi' })
    expect(out).toMatchObject({ pending_approval: true, approval_id: 'ap1' })
    expect(send.run).not.toHaveBeenCalled()
    expect(ex.log.approvals).toEqual([{ id: 'ap1', summary: 'Enviar WhatsApp' }])
  })

  it('baixo e médio rodam direto; política "deny" proíbe; ferramenta fora da lista é recusada', async () => {
    const low = tool('search_contacts', 'baixo')
    const mid = tool('create_task', 'medio')
    const ex = createExecutor({ ctx: {}, tools: [low, mid], policy: { medio: 'deny' }, requestApproval: vi.fn() })
    expect(await ex.execute('search_contacts', {})).toEqual({ ok: true })
    expect((await ex.execute('create_task', {})).error).toMatch(/proibida/)
    expect(mid.run).not.toHaveBeenCalled()
    expect((await ex.execute('send_whatsapp', {})).error).toMatch(/não está disponível/)
  })

  it('a mesma chamada no turno roda uma vez; numa retentativa, o resultado gravado é reaproveitado', async () => {
    const mid = tool('create_task', 'medio')
    const ex = createExecutor({ ctx: {}, tools: [mid], requestApproval: vi.fn() })
    await ex.execute('create_task', { x: 'a' })
    await ex.execute('create_task', { x: 'a' })
    expect(mid.run).toHaveBeenCalledTimes(1)
    const retry = createExecutor({ ctx: {}, tools: [mid], requestApproval: vi.fn(), recall: async () => ({ created: true, task: { id: 't-antiga' } }) })
    expect(await retry.execute('create_task', { x: 'a' })).toEqual({ created: true, task: { id: 't-antiga' } })
    expect(mid.run).toHaveBeenCalledTimes(1)
  })

  it('valida a entrada: obrigatório, enum, tipos, limites e campos extras descartados', () => {
    const schema = TOOLS.list_tasks.schema
    expect(validate(schema, { filter: 'hoje', user_id: 'outra-conta' })).toEqual({ value: { filter: 'hoje' } })
    expect(validate(schema, { filter: 'ontem' }).error).toMatch(/deve ser um de/)
    expect(validate(TOOLS.move_pipeline_stage.schema, { client_id: 'c1' }).error).toMatch(/stage é obrigatório/)
    expect(validate(TOOLS.search_leads.schema, { query: 'a', location: 'b', max: 999 }).value.max).toBe(20)
  })
})

describe('isolamento entre contas', () => {
  it('nenhuma ferramenta aceita user_id na entrada', () => {
    for (const t of Object.values(TOOLS)) expect(JSON.stringify(t.schema)).not.toMatch(/user_id/)
  })

  it('mover etapa de um lead de outra conta falha e não grava nada', async () => {
    const ctx = ctxFor('conta-b')
    await expect(TOOLS.move_pipeline_stage.run(ctx, { client_id: 'c1', stage: 'Proposta' })).rejects.toThrow(/não encontrado/)
    expect(ctx.db.calls.some(c => c.op === 'update')).toBe(false)
    expect(ctx.db.calls[0].filters).toContainEqual(['user_id', 'conta-b'])
  })

  it('na conta certa move a etapa e avisa o painel ao vivo', async () => {
    const ctx = ctxFor('conta-a')
    expect(await TOOLS.move_pipeline_stage.run(ctx, { client_id: 'c1', stage: 'Proposta' })).toEqual({ changed: true, client: 'Clínica Sorriso', stage: 'Proposta' })
    const upd = ctx.db.calls.find(c => c.op === 'update')
    expect(upd.payload).toEqual({ stage: 'prop' })
    expect(upd.filters).toContainEqual(['user_id', 'conta-a'])
    expect(ctx.deps.emitSalesUpdate).toHaveBeenCalledWith('conta-a', 'clients')
  })

  it('WhatsApp para lead de outra conta não sai', async () => {
    const ctx = ctxFor('conta-b')
    await expect(TOOLS.send_whatsapp.run(ctx, { client_id: 'c1', text: 'oi' })).rejects.toThrow(/não encontrado/)
    expect(ctx.deps.sendText).not.toHaveBeenCalled()
  })
})

describe('catálogo', () => {
  it('cada agente padrão recebe só ferramentas que existem; WhatsApp e ligação são risco alto', () => {
    for (const [kind, names] of Object.entries(TOOLS_BY_KIND)) {
      expect(toolsForAgent({ kind }).map(t => t.name)).toEqual(names)
    }
    expect(TOOLS.send_whatsapp.risk).toBe('alto')
    expect(TOOLS.queue_ai_call.risk).toBe('alto')
    expect(toolsForAgent({ kind: 'prospector' }).map(t => t.name)).toContain('search_leads')
  })
})
