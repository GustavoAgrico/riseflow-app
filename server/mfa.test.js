import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// ── Supabase falso (tabelas em memória + auth) ───────────────────────────────
function fakeSupabase() {
  const tables = { mfa_recovery_codes: [], mfa_email_codes: [], mfa_sessions: [] }
  const users = new Map()
  const adminCalls = []
  let seq = 0
  const matchers = (filters) => (r) => filters.every(f => f(r))
  function q(table) {
    const filters = []
    let op = 'select', payload = null, opts = {}, wantRows = false, countHead = false
    const rows = () => tables[table].filter(matchers(filters))
    const api = {
      select(_c, o = {}) { if (op === 'select') { countHead = Boolean(o.head) } else wantRows = true; return api },
      eq(k, v) { filters.push(r => r[k] === v); return api },
      is(k, v) { filters.push(r => (r[k] ?? null) === v); return api },
      gt(k, v) { filters.push(r => r[k] > v); return api },
      limit() { return api },
      insert(p) { op = 'insert'; payload = p; return api },
      update(p) { op = 'update'; payload = p; return api },
      upsert(p, o) { op = 'upsert'; payload = p; opts = o; return api },
      delete() { op = 'delete'; return api },
      maybeSingle() { return run().then(r => ({ data: (r.data || [])[0] || null, error: r.error })) },
      then(res, rej) { return run().then(res, rej) },
    }
    async function run() {
      const t = tables[table]
      if (op === 'select') { const r = rows(); return countHead ? { count: r.length, error: null } : { data: r, error: null } }
      if (op === 'insert') { for (const p of [].concat(payload)) t.push({ id: `id${++seq}`, used_at: null, ...p }); return { error: null } }
      if (op === 'update') { const r = rows(); r.forEach(x => Object.assign(x, payload)); return { data: wantRows ? r.map(x => ({ id: x.id })) : null, error: null } }
      if (op === 'delete') { const r = new Set(rows()); tables[table] = t.filter(x => !r.has(x)); return { data: [...r], error: null } }
      if (op === 'upsert') {
        const key = opts.onConflict
        for (const p of [].concat(payload)) { const hit = t.find(x => x[key] === p[key]); if (hit) Object.assign(hit, p); else t.push({ ...p }) }
        return { error: null }
      }
    }
    return api
  }
  return {
    tables, users, adminCalls,
    client: {
      from: q,
      auth: {
        getUser: async (token) => { const u = users.get(token); return u ? { data: { user: u.user }, error: null } : { data: null, error: { message: 'bad' } } },
        admin: {
          updateUserById: async (id, attrs) => { adminCalls.push(['update', id, attrs]); for (const u of users.values()) if (u.user.id === id) u.user.app_metadata = attrs.app_metadata; return { error: null } },
          mfa: { deleteFactor: async (a) => { adminCalls.push(['deleteFactor', a]); for (const u of users.values()) if (u.user.id === a.userId) u.user.factors = u.user.factors.filter(f => f.id !== a.id); return { error: null } } },
        },
      },
    },
  }
}

const jwtWith = (claims) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`

describe('2FA — regras', () => {
  const M = require('./mfa')
  it('lê claims do token do Supabase', () => {
    expect(M.decodeClaims(jwtWith({ aal: 'aal2', session_id: 's1' }))).toMatchObject({ aal: 'aal2', session_id: 's1' })
    expect(M.decodeClaims('lixo')).toEqual({})
  })
  it('política: só fator TOTP verificado conta; e-mail pelo app_metadata', () => {
    expect(M.policyOf({ factors: [{ id: 'f1', factor_type: 'totp', status: 'unverified' }] })).toMatchObject({ totp: false, required: false })
    expect(M.policyOf({ factors: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] })).toMatchObject({ totp: true, totpFactorIds: ['f1'], required: true })
    expect(M.policyOf({ app_metadata: { mfa_email: true } })).toMatchObject({ email: true, required: true })
    expect(M.policyOf({ factors: [{ id: 'p', factor_type: 'phone', status: 'verified' }] }).required).toBe(false)
  })
  it('códigos de recuperação: formato legível, hash não depende de traço/maiúscula, muda por usuário', () => {
    const c = M.recoveryCode()
    expect(c).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/)
    expect(c).not.toMatch(/[01ilo]/)
    expect(M.hashCode('u1', 'ABCDE-FGHJK')).toBe(M.hashCode('u1', 'abcdefghjk'))
    expect(M.hashCode('u1', 'abcdefghjk')).not.toBe(M.hashCode('u2', 'abcdefghjk'))
    expect(M.emailCode()).toMatch(/^\d{6}$/)
  })
})

describe('2FA — fluxo no servidor', () => {
  let fake, server, base, orig
  const env = { ...process.env }
  const TOTP_USER = { id: 'u-totp', email: 'ana@x.com', app_metadata: {}, factors: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] }
  const PLAIN_USER = { id: 'u-plain', email: 'bia@x.com', app_metadata: {}, factors: [] }
  const tokens = {
    totpAal1: jwtWith({ aal: 'aal1', session_id: '11111111-1111-4111-8111-111111111111' }),
    totpAal2: jwtWith({ aal: 'aal2', session_id: '22222222-2222-4222-8222-222222222222' }),
    plain: jwtWith({ aal: 'aal1', session_id: '33333333-3333-4333-8333-333333333333' }),
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'teste-2fa'
    delete process.env.BREVO_API_KEY; delete process.env.RESEND_API_KEY; delete process.env.SENDGRID_API_KEY; delete process.env.SMTP_HOST
    fake = fakeSupabase()
    fake.users.set(tokens.totpAal1, { user: TOTP_USER })
    fake.users.set(tokens.totpAal2, { user: TOTP_USER })
    fake.users.set(tokens.plain, { user: PLAIN_USER })
    const sc = require('./supabaseClient')
    orig = { supabase: sc.supabase, isConfigured: sc.isConfigured }
    sc.supabase = fake.client
    sc.isConfigured = true
    for (const k of Object.keys(require.cache)) if (/[\\/]server[\\/](mfa|routes[\\/]mfa)\.js$/.test(k)) delete require.cache[k]
    const express = require('express')
    const app = express()
    app.use(express.json())
    app.use('/api/mfa', require('./routes/mfa'))
    await new Promise(r => { server = app.listen(0, '127.0.0.1', r) })
    base = `http://127.0.0.1:${server.address().port}/api/mfa`
  })
  afterAll(async () => {
    await new Promise(r => server?.close(r))
    const sc = require('./supabaseClient')
    sc.supabase = orig.supabase; sc.isConfigured = orig.isConfigured
    for (const k of Object.keys(require.cache)) if (/[\\/]server[\\/](mfa|routes[\\/]mfa)\.js$/.test(k)) delete require.cache[k]
    process.env = env
  })
  beforeEach(() => { fake.tables.mfa_sessions = []; fake.tables.mfa_email_codes = [] })

  const call = (path, token, body) => fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async r => ({ status: r.status, body: await r.json() }))

  it('sem sessão: 401', async () => {
    expect((await call('/status')).status).toBe(401)
    expect((await call('/status', 'token-falso')).status).toBe(401)
  })

  it('status: sem 2FA está liberado; com TOTP só passa em aal2', async () => {
    expect((await call('/status', tokens.plain)).body).toMatchObject({ required: false, satisfied: true, emailAvailable: false })
    expect((await call('/status', tokens.totpAal1)).body).toMatchObject({ required: true, satisfied: false, totp: true })
    expect((await call('/status', tokens.totpAal2)).body).toMatchObject({ required: true, satisfied: true, aal: 'aal2' })
  })

  it('códigos de recuperação: só sessão verificada gera; cada um vale uma vez e libera a sessão', async () => {
    expect((await call('/recovery/generate', tokens.totpAal1, {})).status).toBe(403)
    const gen = await call('/recovery/generate', tokens.totpAal2, {})
    expect(gen.body.codes).toHaveLength(8)
    expect(fake.tables.mfa_recovery_codes.every(r => !gen.body.codes.some(c => r.code_hash.includes(c)))).toBe(true) // só hash no banco

    expect((await call('/recovery/use', tokens.totpAal1, { code: 'aaaaa-bbbbb' })).status).toBe(401)
    const ok = await call('/recovery/use', tokens.totpAal1, { code: gen.body.codes[0].toUpperCase() })
    expect(ok.body).toEqual({ left: 7 })
    expect((await call('/status', tokens.totpAal1)).body.satisfied).toBe(true)  // sessão confiável
    expect((await call('/recovery/use', tokens.totpAal1, { code: gen.body.codes[0] })).status).toBe(401) // já usado
  })

  it('quem entrou com recuperação pode remover o app autenticador perdido', async () => {
    fake.tables.mfa_sessions.push({ session_id: '11111111-1111-4111-8111-111111111111', user_id: 'u-totp', method: 'recovery', expires_at: new Date(Date.now() + 1e9).toISOString() })
    expect((await call('/totp/remove', tokens.totpAal1, { factorId: 'outro' })).status).toBe(404)
    expect((await call('/totp/remove', tokens.totpAal1, { factorId: 'f1' })).body).toEqual({ ok: true })
    expect(fake.adminCalls.at(-1)).toEqual(['deleteFactor', { id: 'f1', userId: 'u-totp' }])
    expect(fake.tables.mfa_recovery_codes).toHaveLength(0) // tudo desligado → códigos apagados
    TOTP_USER.factors = [{ id: 'f1', factor_type: 'totp', status: 'verified' }]
  })

  it('código por e-mail: sem provedor configurado avisa (503)', async () => {
    const r = await call('/email/send', tokens.totpAal1, { purpose: 'login' })
    expect(r.status).toBe(503)
    expect(r.body.error).toMatch(/e-mail não configurado/i)
  })

  it('código por e-mail: errado conta tentativa, expirado e excesso bloqueiam; certo libera a sessão', async () => {
    const M = require('./mfa')
    const put = (extra = {}) => { fake.tables.mfa_email_codes = [{ user_id: 'u-totp', code_hash: M.hashCode('u-totp', '123456'), purpose: 'login', attempts: 0, expires_at: new Date(Date.now() + 60_000).toISOString(), sent_at: new Date().toISOString(), ...extra }] }
    put()
    expect((await call('/email/verify', tokens.totpAal1, { code: '000000' })).status).toBe(401)
    expect(fake.tables.mfa_email_codes[0].attempts).toBe(1)
    put({ expires_at: new Date(Date.now() - 1000).toISOString() })
    expect((await call('/email/verify', tokens.totpAal1, { code: '123456' })).body.error).toMatch(/expirado/)
    put({ attempts: 5 })
    expect((await call('/email/verify', tokens.totpAal1, { code: '123456' })).status).toBe(429)
    put()
    expect((await call('/email/verify', tokens.totpAal1, { code: '123 456' })).body).toEqual({ ok: true })
    expect(fake.tables.mfa_email_codes).toHaveLength(0)
    expect((await call('/status', tokens.totpAal1)).body.satisfied).toBe(true)
  })

  it('ativar e-mail como 2ª etapa exige sessão verificada e liga no app_metadata', async () => {
    const M = require('./mfa')
    fake.tables.mfa_email_codes = [{ user_id: 'u-plain', code_hash: M.hashCode('u-plain', '654321'), purpose: 'enable', attempts: 0, expires_at: new Date(Date.now() + 60_000).toISOString(), sent_at: new Date().toISOString() }]
    expect((await call('/email/verify', tokens.plain, { code: '654321', enable: true })).body).toEqual({ ok: true })
    expect(PLAIN_USER.app_metadata).toEqual({ mfa_email: true })
    expect((await call('/status', tokens.plain)).body).toMatchObject({ required: true, email: true, satisfied: true })
  })
})
