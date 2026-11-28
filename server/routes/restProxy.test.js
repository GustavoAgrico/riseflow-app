// Prova de isolamento conta A × conta B no proxy REST (/api/rest/v1).
// Tudo que o frontend lê/grava via supabase.from() passa por aqui com a service
// key, então estas regras SÃO o isolamento entre contas.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { scopeRequest, embeddedResources, USER_TABLES } = require('./restProxy')

const A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const B = 'bbbbbbbb-0000-4000-8000-00000000000b'

const run = (table, method, qs = '', body, headers = {}, extra = {}) =>
  scopeRequest({ table, method, params: new URLSearchParams(qs), body, headers: { ...headers }, userId: A, ...extra })

describe('isolamento por conta — leitura', () => {
  it('toda tabela por usuário ganha user_id=eq.<conta logada>', () => {
    for (const t of USER_TABLES) {
      const r = run(t, 'GET', 'select=*')
      expect(r.params.getAll('user_id'), t).toEqual([`eq.${A}`])
    }
  })

  it('pedir o user_id de outra conta não adianta: o filtro é trocado pelo da conta logada', () => {
    const r = run('clients', 'GET', `select=*&user_id=eq.${B}`)
    expect(r.params.getAll('user_id')).toEqual([`eq.${A}`])
  })

  it('or/and com o id de outra conta continuam presos ao user_id da conta logada', () => {
    const r = run('messages', 'GET', `or=(user_id.eq.${B},id.gt.0)`)
    expect(r.params.get('or')).toBe(`(user_id.eq.${B},id.gt.0)`)
    expect(r.params.getAll('user_id')).toEqual([`eq.${A}`]) // PostgREST faz AND entre os dois
  })

  it('tabela fora da lista é recusada (403)', () => {
    for (const t of ['users', 'agents', 'auth.users', 'billing', 'Clients', 'clients;drop']) {
      expect(run(t, 'GET').status, t).toBe(403)
    }
  })

  it('profiles: só o próprio perfil, nunca o de outro id', () => {
    const r = run('profiles', 'GET', `id=eq.${B}`)
    expect(r.params.getAll('id')).toEqual([`eq.${A}`])
    expect(run('profiles', 'DELETE').status).toBe(403)
    expect(run('profiles', 'POST', '', { id: B }).status).toBe(403)
  })
})

describe('isolamento por conta — relacionamentos embutidos', () => {
  it('embutido ganha filtro de user_id (a tarefa apontando para cliente de outra conta volta sem o cliente)', () => {
    const r = run('crm_tasks', 'GET', 'select=*, clients(name, phone, stage, value)')
    expect(r.params.getAll('clients.user_id')).toEqual([`eq.${A}`])
  })

  it('apelido e dica de chave estrangeira usam o nome certo no filtro', () => {
    expect(embeddedResources('id,cliente:clients!crm_tasks_client_id_fkey(name)')).toEqual({ names: ['cliente'] })
    const r = run('crm_tasks', 'GET', `select=id,cli:clients!inner(name)&cli.user_id=eq.${B}`)
    expect(r.params.getAll('cli.user_id')).toEqual([`eq.${A}`])
  })

  it('embutir tabela sem dono, aninhar ou espalhar é recusado', () => {
    expect(run('clients', 'GET', 'select=*,profiles(*)').status).toBe(403)
    expect(run('clients', 'GET', 'select=*,users(email)').status).toBe(403)
    expect(run('crm_tasks', 'GET', 'select=*,clients(name,messages(*))').status).toBe(403)
    expect(run('crm_tasks', 'GET', 'select=*,...clients(name)').status).toBe(403)
    expect(run('crm_tasks', 'GET', 'select=*,clients(name').status).toBe(403)
  })

  it('colunas comuns, apelidos e casts continuam livres', () => {
    const r = run('clients', 'GET', 'select=id,nome:name,value::text,meta->>x')
    expect(r.status).toBeUndefined()
    expect([...r.params.keys()]).toEqual(['select', 'user_id'])
  })
})

describe('isolamento por conta — escrita', () => {
  it('insert: user_id do corpo é sempre o da conta logada (um ou vários)', () => {
    expect(run('clients', 'POST', '', { name: 'X', user_id: B }).body.user_id).toBe(A)
    const many = run('messages', 'POST', '', [{ content: 'a', user_id: B }, { content: 'b' }]).body
    expect(many.map(m => m.user_id)).toEqual([A, A])
  })

  it('update/delete só alcançam linhas da conta logada e não mudam o dono', () => {
    const up = run('clients', 'PATCH', `id=eq.123&user_id=eq.${B}`, { name: 'novo', user_id: B })
    expect(up.params.getAll('user_id')).toEqual([`eq.${A}`])
    expect(up.body).toEqual({ name: 'novo' })
    const del = run('clients', 'DELETE', 'id=eq.123')
    expect(del.params.getAll('user_id')).toEqual([`eq.${A}`])
  })

  it('upsert que não resolve conflito por user_id vira "ignorar duplicado" (não sobrescreve linha alheia)', () => {
    const r = run('settings', 'POST', 'on_conflict=id', { id: 'x' }, { prefer: 'resolution=merge-duplicates,return=representation' })
    expect(r.headers.prefer).toBe('resolution=ignore-duplicates,return=representation')
    const ok = run('settings', 'POST', 'on_conflict=user_id', { a: 1 }, { prefer: 'resolution=merge-duplicates' })
    expect(ok.headers.prefer).toBe('resolution=merge-duplicates')
    const composite = run('user_preferences', 'POST', 'on_conflict=user_id, key', { key: 'k' }, { prefer: 'resolution=merge-duplicates' })
    expect(composite.headers.prefer).toBe('resolution=merge-duplicates')
  })

  it('PUT (upsert pela chave primária, sem dono) é recusado', () => {
    expect(run('clients', 'PUT', 'id=eq.123', { id: '123', name: 'roubado' }).status).toBe(405)
  })

  it('plano e limite não mudam pelo navegador', () => {
    const r = run('usage', 'PATCH', '', { plan: 'enterprise', messages_limit: 999999, messages_used: 1 })
    expect(r.body).toEqual({ messages_used: 1 })
  })

  it('campaign_messages: só campanhas da conta logada', () => {
    const extra = { campaignIds: ['c-a1'] }
    expect(run('campaign_messages', 'POST', '', { campaign_id: 'c-b1' }, {}, extra).status).toBe(403)
    expect(run('campaign_messages', 'POST', '', [{ campaign_id: 'c-a1' }, { campaign_id: 'c-b1' }], {}, extra).status).toBe(403)
    expect(run('campaign_messages', 'POST', '', { campaign_id: 'c-a1' }, {}, extra).status).toBeUndefined()
    expect(run('campaign_messages', 'GET', '', undefined, {}, extra).params.get('campaign_id')).toBe('in.(c-a1)')
    const none = run('campaign_messages', 'DELETE', '', undefined, {}, { campaignIds: [] })
    expect(none.params.get('campaign_id')).toBe('in.(00000000-0000-0000-0000-000000000000)')
    const moved = run('campaign_messages', 'PATCH', 'id=eq.1', { status: 'sent', campaign_id: 'c-b1' }, {}, extra)
    expect(moved.body).toEqual({ status: 'sent' })
  })
})

// Rota de verdade (auth + proxy) com fetch do PostgREST interceptado: confirma que
// o JWT da conta A nunca gera uma chamada sem o escopo da conta A.
describe('rota /api/rest/v1 ponta a ponta (fetch interceptado)', () => {
  let server, base, calls, signA, signB
  const env = { ...process.env }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'teste-isolamento'
    process.env.SUPABASE_URL = 'https://supabase.test'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-teste'
    for (const k of Object.keys(require.cache)) if (/[\\/]server[\\/](routes[\\/]restProxy|middleware[\\/]auth|supabaseClient)\.js$/.test(k)) delete require.cache[k]
    const express = require('express')
    const jwt = require('jsonwebtoken')
    const auth = require('../middleware/auth')
    const proxy = require('./restProxy')
    signA = jwt.sign({ sub: A }, 'teste-isolamento')
    signB = jwt.sign({ sub: B }, 'teste-isolamento')

    calls = []
    const realFetch = globalThis.fetch
    vi.stubGlobal('fetch', async (url, init = {}) => {
      if (String(url).startsWith('https://supabase.test/')) {
        calls.push({ url: new URL(url), init })
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return realFetch(url, init)
    })

    const app = express()
    app.use(express.json())
    app.use('/api/rest/v1', auth, proxy)
    await new Promise(r => { server = app.listen(0, '127.0.0.1', r) })
    base = `http://127.0.0.1:${server.address().port}/api/rest/v1`
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    await new Promise(r => server?.close(r))
    process.env = env
  })

  const call = (path, { token, method = 'GET', body } = {}) => fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })

  it('sem token ou com token falso: 401 e nada chega ao banco', async () => {
    calls.length = 0
    expect((await call('/clients')).status).toBe(401)
    expect((await call('/clients', { token: 'x.y.z' })).status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('conta A lendo "clientes da conta B" recebe consulta presa à conta A', async () => {
    calls.length = 0
    const r = await call(`/clients?select=*&user_id=eq.${B}`, { token: signA })
    expect(r.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0].url.searchParams.getAll('user_id')).toEqual([`eq.${A}`])
    expect(calls[0].init.headers.Authorization).toBe('Bearer service-key-teste')
  })

  it('conta B gravando com user_id da conta A grava como conta B', async () => {
    calls.length = 0
    await call('/crm_tasks', { token: signB, method: 'POST', body: { title: 't', user_id: A } })
    expect(JSON.parse(calls[0].init.body).user_id).toBe(B)
  })

  it('PUT e tabela fora da lista não chegam ao banco', async () => {
    calls.length = 0
    expect((await call('/clients?id=eq.1', { token: signA, method: 'PUT', body: { id: 1 } })).status).toBe(405)
    expect((await call('/agents', { token: signA })).status).toBe(403)
    expect(calls).toHaveLength(0)
  })
})
