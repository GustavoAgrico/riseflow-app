import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { roleFromTeam, atLeast, roleOf } = require('./orgs')
const { scopeRequest } = require('./routes/restProxy')

describe('organizações — papéis', () => {
  it('cargo da equipe vira papel da organização (igual ao SQL)', () => {
    expect(roleFromTeam('Admin')).toBe('admin')
    expect(roleFromTeam(' supervisor ')).toBe('manager')
    expect(roleFromTeam('Gerente')).toBe('manager')
    expect(roleFromTeam('Atendente')).toBe('agent')
    expect(roleFromTeam('Visualizador')).toBe('viewer')
    expect(roleFromTeam('owner')).toBe('admin') // dono só existe um, o da organização
    expect(roleFromTeam(null)).toBe('agent')
  })

  it('hierarquia owner > admin > manager > agent > viewer', () => {
    expect(atLeast('owner', 'admin')).toBe(true)
    expect(atLeast('manager', 'admin')).toBe(false)
    expect(atLeast('agent', 'manager')).toBe(false)
    expect(atLeast('inventado', 'viewer')).toBe(false)
  })

  it('papel vem do JWT; sem claim, dono ou atendente', () => {
    expect(roleOf({ sub: 'x' })).toBe('owner')
    expect(roleOf({ sub: 'x', member_id: 'm' })).toBe('agent')
    expect(roleOf({ sub: 'x', member_id: 'm', org_role: 'manager' })).toBe('manager')
    expect(roleOf({ sub: 'x', org_role: 'superuser' })).toBe('owner')
  })

  it('proxy REST descarta organization_id mandado pelo navegador', () => {
    const r = scopeRequest({ table: 'clients', method: 'POST', params: new URLSearchParams(), body: { name: 'x', organization_id: 'org-de-outra-conta' }, headers: {}, userId: 'a' })
    expect(r.body).toEqual({ name: 'x', user_id: 'a' })
    const up = scopeRequest({ table: 'clients', method: 'PATCH', params: new URLSearchParams('id=eq.1'), body: { organization_id: 'z', name: 'y' }, headers: {}, userId: 'a' })
    expect(up.body).toEqual({ name: 'y' })
  })
})

describe('/api/org', () => {
  let server, base, sign, renamed
  const env = { ...process.env }
  const ORG = { id: 'org-a', name: 'Clínica A', created_at: '2026-01-01', owner_user_id: 'owner-a' }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'teste-org'
    const stubPath = require.resolve('./orgs')
    const real = require('./orgs')
    require.cache[stubPath].exports = {
      ...real,
      getOrganization: async (owner) => (owner === 'owner-a' ? ORG : null),
      listMembers: async () => [{ id: 'm1', email: 'ana@a.com', role: 'agent', status: 'active' }],
      renameOrganization: async (owner, name) => { renamed = { owner, name }; return { id: 'org-a', name } },
    }
    for (const k of Object.keys(require.cache)) if (/[\\/]server[\\/](routes[\\/]org|middleware[\\/]auth)\.js$/.test(k)) delete require.cache[k]
    const express = require('express')
    const jwt = require('jsonwebtoken')
    const app = express()
    app.use(express.json())
    app.use('/api/org', require('./middleware/auth'), require('./routes/org'))
    await new Promise(r => { server = app.listen(0, '127.0.0.1', r) })
    base = `http://127.0.0.1:${server.address().port}/api/org`
    sign = (claims) => jwt.sign(claims, 'teste-org')
  })

  afterAll(async () => {
    await new Promise(r => server?.close(r))
    delete require.cache[require.resolve('./orgs')]
    process.env = env
  })

  const get = (claims) => fetch(base, { headers: { Authorization: `Bearer ${sign(claims)}` } }).then(async r => ({ status: r.status, body: await r.json() }))
  const patch = (claims, body) => fetch(base, { method: 'PATCH', headers: { Authorization: `Bearer ${sign(claims)}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })

  it('dono vê a própria organização e a equipe, sem o id do dono', async () => {
    const r = await get({ sub: 'owner-a' })
    expect(r.body.organization).toEqual({ id: 'org-a', name: 'Clínica A', created_at: '2026-01-01' })
    expect(r.body.role).toBe('owner')
    expect(r.body.members).toHaveLength(1)
  })

  it('atendente vê a organização mas não a lista de membros', async () => {
    const r = await get({ sub: 'owner-a', member_id: 'm1', org_role: 'agent' })
    expect(r.body.organization.id).toBe('org-a')
    expect(r.body.members).toEqual([])
  })

  it('outra conta nunca recebe a organização A', async () => {
    const r = await get({ sub: 'owner-b' })
    expect(r.body.organization).toBeNull()
  })

  it('renomear: só dono/admin, e sempre a organização do próprio JWT', async () => {
    renamed = null
    expect((await patch({ sub: 'owner-a', member_id: 'm1', org_role: 'manager' }, { name: 'X' })).status).toBe(403)
    expect(renamed).toBeNull()
    expect((await patch({ sub: 'owner-a', member_id: 'm2', org_role: 'admin' }, { name: 'Nova', owner_user_id: 'owner-b' })).status).toBe(200)
    expect(renamed).toEqual({ owner: 'owner-a', name: 'Nova' })
  })
})
