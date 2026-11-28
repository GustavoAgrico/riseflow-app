// Envio por Telegram/Facebook/Instagram: o dono do bot/página é SEMPRE o do JWT.
// Antes, o corpo da requisição trazia userId e a conta A podia mandar pelo bot da conta B.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const B = 'bbbbbbbb-0000-4000-8000-00000000000b'

describe('POST /send (Telegram e Meta) usa só o dono do JWT', () => {
  let server, base, token, sent
  const env = { ...process.env }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'teste-isolamento'
    const fake = (channel) => ({
      sendTextTo: async (number, text, userId) => { sent.push({ channel, number, userId }); return { success: true } },
      isTelegramNumber: () => true, isMetaNumber: () => true,
      getStatus: () => ({}),
    })
    const stub = (rel, exportsObj) => {
      const path = require.resolve(rel)
      require.cache[path] = { id: path, filename: path, loaded: true, exports: exportsObj }
    }
    for (const k of Object.keys(require.cache)) if (/[\\/]server[\\/](routes[\\/](telegram|meta)|middleware[\\/]auth)\.js$/.test(k)) delete require.cache[k]
    stub('../telegramClient', fake('telegram'))
    stub('../metaClient', fake('meta'))

    const express = require('express')
    const jwt = require('jsonwebtoken')
    const auth = require('../middleware/auth')
    const app = express()
    app.use(express.json())
    app.use('/api/telegram', auth, require('./telegram'))
    app.use('/api/meta', auth, require('./meta'))
    await new Promise(r => { server = app.listen(0, '127.0.0.1', r) })
    base = `http://127.0.0.1:${server.address().port}/api`
    token = jwt.sign({ sub: A }, 'teste-isolamento')
  })

  afterAll(async () => {
    await new Promise(r => server?.close(r))
    for (const k of Object.keys(require.cache)) if (/[\\/]server[\\/](telegramClient|metaClient)\.js$/.test(k)) delete require.cache[k]
    process.env = env
  })

  const post = (path, body) => fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  it('Telegram: userId da conta B no corpo é ignorado', async () => {
    sent = []
    expect((await post('/telegram/send', { number: 'tg123', text: 'oi', userId: B })).status).toBe(200)
    expect(sent).toEqual([{ channel: 'telegram', number: 'tg123', userId: A }])
  })

  it('Meta: userId da conta B no corpo é ignorado', async () => {
    sent = []
    expect((await post('/meta/send', { number: 'fb123', text: 'oi', userId: B })).status).toBe(200)
    expect(sent).toEqual([{ channel: 'meta', number: 'fb123', userId: A }])
  })

  it('sem token não envia nada', async () => {
    sent = []
    const r = await fetch(`${base}/telegram/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ number: 'tg1', text: 'x' }) })
    expect(r.status).toBe(401)
    expect(sent).toEqual([])
  })
})
