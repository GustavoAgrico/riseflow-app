// Canais Meta (Facebook Messenger + Instagram DM) via Graph API / Messenger
// Platform. Segue o padrão do Telegram: recebimento entra no MESMO pipeline
// (Socket.io → Chat, IA → funis) e o envio é roteado pelo prefixo do contato.
//
// Identidade do contato:
//   Messenger: phone = "fb<PSID>",  jid = "fb<PSID>@messenger"
//   Instagram: phone = "ig<IGSID>", jid = "ig<IGSID>@instagram"
//
// Envio: POST graph.facebook.com/<ver>/me/messages com o PAGE ACCESS TOKEN.
// Janela de 24h (política da Meta): só é permitido responder até 24h após a
// última mensagem RECEBIDA do contato — o envio fora da janela é bloqueado
// aqui com erro claro (messaging_type: RESPONSE).
const axios = require('axios')
const { supabase, isConfigured } = require('./supabaseClient')
const { saveIncomingMessage } = require('./inbox')
const metaLeads = require('./metaLeads')

const GRAPH = 'https://graph.facebook.com/v21.0'
const WINDOW_24H_MS = 24 * 60 * 60 * 1000

// pageId -> { userId, channel: 'facebook'|'instagram', token, pageName }
const pages = new Map()
// "fb<id>"/"ig<id>" -> { pageId, lastIncomingAt } (dono do chat + janela de 24h)
const chats = new Map()

let io = null
let onIncoming = null

const isMetaNumber = (n) => /^(fb|ig)\d+$/.test(String(n || ''))
const channelOf = (n) => (String(n).startsWith('ig') ? 'instagram' : 'facebook')
const toPsid = (n) => String(n).slice(2)

function init({ socketIo, incomingHandler }) {
  io = socketIo
  onIncoming = incomingHandler
}

function emitIntegrationConnected(channel) {
  io?.emit('integration_connected', { channel })
}

/* Registra uma página conectada (boot ou connect). */
function registerPage({ pageId, userId, channel, token, pageName }) {
  pages.set(String(pageId), { userId, channel, token, pageName })
}

function unregisterPagesOf(userId, channel) {
  for (const [pid, p] of pages) {
    if (p.userId === userId && p.channel === channel) pages.delete(pid)
  }
}

function getStatus(userId, channel) {
  for (const p of pages.values()) {
    if (p.userId === userId && p.channel === channel) {
      return { connected: true, pageName: p.pageName }
    }
  }
  return { connected: false }
}

/* Valida um Page Access Token e devolve { id, name } da página.
   Tenta /me primeiro; se falhar por permissão (código 100), usa debug_token.
   Se debug_token também falhar mas /me confirmou que o token chegou à Graph,
   aceita o token com id vazio (o page_id virá do request body ou ficará vazio). */
async function verifyPageToken(token) {
  let meErrorCode = null

  let meData = null
  try {
    const { data } = await axios.get(`${GRAPH}/me`, {
      params: { fields: 'id,name,category', access_token: token }, timeout: 15_000,
    })
    meData = data
    if (data?.error) meErrorCode = data.error.code
  } catch (err) {
    const code = err.response?.data?.error?.code
    meErrorCode = code ?? null
    // Código 190 = token inválido/expirado — rejeita diretamente
    if (code === 190) throw new Error('Token inválido ou expirado.')
  }
  if (meData?.id) {
    // Só Páginas têm 'category'. Um token de USUÁRIO passaria aqui e só falharia
    // depois, no sync, com (#298) read_mailbox — rejeita já com mensagem clara.
    if (!meData.category) {
      throw new Error('Esse token é de um USUÁRIO, não de uma Página. No Graph API Explorer use "Get Page Access Token" e selecione a página (ex.: gugah.agrico).')
    }
    return meData
  }

  const { META_APP_ID, META_APP_SECRET } = process.env
  if (META_APP_ID && META_APP_SECRET) {
    // Obtém app access token real via client_credentials (mais confiável que APP_ID|APP_SECRET)
    let appToken = `${META_APP_ID}|${META_APP_SECRET}`
    try {
      const { data: atData } = await axios.get('https://graph.facebook.com/oauth/access_token', {
        params: { client_id: META_APP_ID, client_secret: META_APP_SECRET, grant_type: 'client_credentials' },
        timeout: 10_000,
      })
      if (atData?.access_token) appToken = atData.access_token
    } catch { /* usa shorthand como fallback */ }

    try {
      const { data: { data: info } } = await axios.get('https://graph.facebook.com/debug_token', {
        params: { input_token: token, access_token: appToken }, timeout: 15_000,
      })
      if (info?.is_valid) return { id: String(info.profile_id || info.user_id || ''), name: null }
      throw new Error('Token inválido ou expirado.')
    } catch (debugErr) {
      const msg = debugErr.response?.data?.error?.message ?? debugErr.message
      console.warn('[meta] debug_token falhou:', msg)
      // Se debug_token falhou mas /me chegou à Graph com erro de permissão (#100),
      // o token é provavelmente válido — aceita sem validação completa.
      if (meErrorCode === 100) {
        console.warn('[meta] aceitando token sem validação completa (pages_read_engagement ausente)')
        return { id: '', name: null }
      }
      throw debugErr
    }
  }

  if (meErrorCode === 100) {
    console.warn('[meta] aceitando token sem validação (META_APP_ID/SECRET ausentes, pages_read_engagement)')
    return { id: '', name: null }
  }
  throw new Error('Token inválido ou expirado.')
}

/* Assina o app nos eventos da página (necessário p/ webhook).
   Tenta incluir `leadgen` (Lead Ads do tráfego pago); se a permissão
   leads_retrieval não estiver liberada, cai p/ só mensagens — o canal de
   conversa continua funcionando mesmo sem a captação de leads. */
async function subscribePage(pageId, token) {
  const sub = (fields) =>
    axios.post(`${GRAPH}/${pageId}/subscribed_apps`, null, {
      params: { subscribed_fields: fields, access_token: token },
      timeout: 15_000,
    })
  try {
    await sub('messages,messaging_postbacks,leadgen')
  } catch (e) {
    console.warn('[meta] assinatura com leadgen falhou; assinando só mensagens:',
      e.response?.data?.error?.message ?? e.message)
    await sub('messages,messaging_postbacks')
  }
}

/* ─── Recebimento (chamado pelo webhook após validar a assinatura) ─────── */
// body.object: 'page' (Messenger) | 'instagram' (DM) — mesmo shape messaging[].
async function handleWebhookEvent(body) {
  const channel = body?.object === 'instagram' ? 'instagram' : body?.object === 'page' ? 'facebook' : null
  if (!channel) return
  const prefix = channel === 'instagram' ? 'ig' : 'fb'
  const domain = channel === 'instagram' ? 'instagram' : 'messenger'

  for (const entry of body.entry || []) {
    let page = pages.get(String(entry.id))
    // Instagram webhooks arrive with the IG Account ID in entry.id, but we may
    // have registered the page under the Facebook Page ID — fall back to the
    // first connected Instagram page so messages are not silently dropped.
    if (!page && channel === 'instagram') {
      page = [...pages.values()].find((p) => p.channel === 'instagram') ?? null
    }

    // Lead Ads (formulário do tráfego pago) chegam em entry.changes[] com
    // field='leadgen'. Busca os dados e salva no CRM (fire-and-forget).
    for (const change of entry.changes || []) {
      if (change.field !== 'leadgen') continue
      const v = change.value || {}
      if (page?.userId && page?.token) {
        metaLeads.ingestLead({
          leadgenId: v.leadgen_id,
          pageToken: page.token,
          userId: page.userId,
          adId: v.ad_id,
          formId: v.form_id,
          createdTime: v.created_time,
          channel: page.channel, // 'facebook' | 'instagram' (atribui o canal do lead)
        }).catch((e) => console.error('[meta-leads] ingest:', e?.message ?? e))
      } else {
        console.warn('[meta-leads] leadgen recebido de página não registrada:', entry.id)
      }
    }
    for (const ev of entry.messaging || []) {
      const msg = ev.message
      if (!msg || msg.is_echo) continue // ecos são as nossas próprias mensagens
      const text = msg.text ?? (msg.attachments?.length ? '📎 Anexo' : '')
      if (!text) continue

      const psid = String(ev.sender?.id || '')
      if (!psid) continue
      const phone = `${prefix}${psid}`
      const jid = `${phone}@${domain}`

      // Janela de 24h + dono do chat.
      chats.set(phone, { pageId: String(entry.id), lastIncomingAt: Date.now() })

      // Nome do contato: a Graph exige chamada extra por PSID; usa o id como
      // fallback e tenta resolver o nome best-effort (não bloqueia o pipeline).
      let pushName = phone
      if (page?.token) {
        try {
          // Usuário do Instagram NÃO tem first_name/last_name — pedir esses campos
          // faz a Graph falhar (#100) e o nome cair no id. Campos por canal.
          const nameFields = channel === 'instagram' ? 'name,username' : 'name,first_name,last_name,username'
          const { data } = await axios.get(`${GRAPH}/${psid}`, {
            params: { fields: nameFields, access_token: page.token },
            timeout: 8_000,
          })
          pushName = data.name
            || [data.first_name, data.last_name].filter(Boolean).join(' ')
            || data.username || phone
        } catch { /* sem permissão de perfil — segue com o id */ }
      }

      console.log(`[meta] ← ${phone} (${pushName}): ${text.slice(0, 50)}`)

      // 1) Tempo real para o Chat (mesmo evento do WhatsApp/Telegram).
      io?.emit('new_message', {
        jid,
        message: { id: msg.mid ?? null, fromMe: false, text, pushName, timestamp: ev.timestamp ?? null },
      })

      // 2) Persistência (Chat carrega histórico de conversations/messages).
      if (page?.userId) {
        await saveIncomingMessage({ userId: page.userId, phone, name: pushName, text, channel: prefix })
      }

      // 3) IA → funis (mesma cadeia do WhatsApp), fire-and-forget.
      if (onIncoming) {
        Promise.resolve(onIncoming({ jid, text, pushName, fromMe: false }))
          .catch((err) => console.error('[meta] IA/flowEngine:', err?.message ?? err))
      }
    }
  }
}

/* ─── Envio ────────────────────────────────────────────────────────────── */
/* Resolve o token da página para um contato: dono conhecido do chat → única
   página conectada do canal → PAGE_ACCESS_TOKEN do .env (fallback global). */
function resolvePage(number) {
  const known = chats.get(String(number))
  if (known && pages.has(known.pageId)) return pages.get(known.pageId)
  const channel = channelOf(number)
  const ofChannel = [...pages.values()].filter((p) => p.channel === channel)
  if (ofChannel.length === 1) return ofChannel[0]
  if (process.env.PAGE_ACCESS_TOKEN) return { token: process.env.PAGE_ACCESS_TOKEN }
  return null
}

/* Janela de 24h: usa o registro em memória; sem registro (restart), consulta a
   última recebida no banco. Sem nenhum registro → bloqueia (conservador). */
async function within24h(number, userId) {
  const known = chats.get(String(number))
  if (known?.lastIncomingAt) return Date.now() - known.lastIncomingAt < WINDOW_24H_MS
  if (!isConfigured) return false
  const { data } = await supabase.from('messages')
    .select('created_at').eq('contact_phone', String(number))
    .in('direction', ['inbound', 'received']) // aceita vocabulário novo e antigo
    .order('created_at', { ascending: false }).limit(1)
  const last = data?.[0]?.created_at
  return last ? Date.now() - new Date(last).getTime() < WINDOW_24H_MS : false
}

async function sendTextTo(number, text, userId = null) {
  if (!isMetaNumber(number)) throw new Error(`Contato Meta inválido: ${number}`)
  const page = resolvePage(number)
  if (!page) throw new Error(`Nenhuma página ${channelOf(number) === 'instagram' ? 'do Instagram' : 'do Facebook'} conectada para este contato.`)
  if (!(await within24h(number, userId))) {
    throw new Error('Fora da janela de 24h da Meta: só é possível responder até 24h após a última mensagem do contato.')
  }
  try {
    const { data } = await axios.post(`${GRAPH}/me/messages`, {
      recipient: { id: toPsid(number) },
      messaging_type: 'RESPONSE',
      message: { text },
    }, { params: { access_token: page.token }, timeout: 15_000 })
    return { success: true, key: { id: data.message_id ?? null } }
  } catch (err) {
    const g = err.response?.data?.error
    throw new Error(g ? `Meta: ${g.message}` : err.message)
  }
}

/* ─── Boot: recarrega páginas conectadas (integrations facebook/instagram) ─ */
async function resumePages() {
  if (!isConfigured) return
  try {
    const { data } = await supabase.from('integrations')
      .select('user_id, type, config').in('type', ['facebook', 'instagram']).eq('status', 'connected')
    for (const row of data || []) {
      const token = row.config?.page_token
      const pageId = row.config?.page_id
      if (!token || !pageId) continue
      registerPage({
        pageId, userId: row.user_id, channel: row.type,
        token, pageName: row.config?.page_name || null,
      })
      console.log(`[meta] página ${pageId} (${row.type}) religada p/ user ${row.user_id}`)
    }
  } catch (e) {
    console.warn('[meta] resumePages falhou:', e?.message ?? e)
  }
}

/* ─── Seguidores do perfil ────────────────────────────────────────────────
   A Graph NÃO expõe a LISTA de seguidores (privacidade) — só o total.
   Facebook: followers_count/fan_count da própria página.
   Instagram: followers_count da conta profissional vinculada à página. */
async function getFollowerCount({ pageId, token, channel }) {
  if (!pageId || !token) throw new Error('página não conectada')
  if (channel === 'instagram') {
    const { data } = await axios.get(`${GRAPH}/${pageId}`, {
      params: { fields: 'instagram_business_account{followers_count,follows_count,media_count,username}', access_token: token },
      timeout: 12_000,
    })
    const ig = data.instagram_business_account
    if (!ig) throw new Error('Nenhuma conta do Instagram vinculada a esta página.')
    return { channel, count: ig.followers_count ?? null, username: ig.username ?? null, mediaCount: ig.media_count ?? null }
  }
  const { data } = await axios.get(`${GRAPH}/${pageId}`, {
    params: { fields: 'followers_count,fan_count,name', access_token: token },
    timeout: 12_000,
  })
  return { channel, count: data.followers_count ?? data.fan_count ?? null, username: data.name ?? null }
}

/* Persiste uma mensagem histórica (inbound|outbound) no mesmo shape do chat.
   Idempotente por external_id (dedup com o que o webhook já gravou). */
async function saveMetaMessage({ userId, phone, name, text, direction, externalId, createdAt, channel }) {
  if (!isConfigured || !userId || !text) return
  const { data: conv } = await supabase.from('conversations').upsert({
    user_id: userId, contact_phone: phone, contact_name: name || phone,
    contact_channel: channel, last_message: text, last_message_at: createdAt, updated_at: createdAt,
  }, { onConflict: 'user_id,contact_phone' }).select('id').single()
  await supabase.from('messages').upsert({
    user_id: userId, conversation_id: conv?.id, contact_phone: phone, content: text,
    direction, type: 'text', channel, external_id: externalId,
    status: 'delivered', read: direction === 'outbound', created_at: createdAt,
  }, { onConflict: 'external_id', ignoreDuplicates: true })
}

/* ─── Sync do Direct/Messenger ─────────────────────────────────────────────
   Puxa as threads da página (histórico) e persiste em conversations/messages,
   para o Chat mostrar as conversas mesmo sem esperar novos webhooks.
   IG usa platform=instagram; o "nós" é o IG business account (não o pageId). */
async function syncConversations({ pageId, token, channel, userId }) {
  if (!pageId || !token) throw new Error('página não conectada')
  const prefix = channel === 'instagram' ? 'ig' : 'fb'
  const domain = channel === 'instagram' ? 'instagram' : 'messenger'

  // Quem somos "nós" nas threads (para definir a direção de cada mensagem).
  let selfId = String(pageId)
  if (channel === 'instagram') {
    try {
      const { data } = await axios.get(`${GRAPH}/${pageId}`, {
        params: { fields: 'instagram_business_account{id}', access_token: token }, timeout: 12_000,
      })
      selfId = String(data.instagram_business_account?.id || pageId)
    } catch { /* mantém pageId */ }
  }

  const MAX_CONVS = 80
  let url = `${GRAPH}/${pageId}/conversations`
  let params = {
    platform: channel === 'instagram' ? 'instagram' : 'messenger',
    fields: 'participants,updated_time,messages.limit(25){id,message,from,created_time}',
    limit: 25, access_token: token,
  }

  let convCount = 0, msgCount = 0
  while (url && convCount < MAX_CONVS) {
    const { data } = await axios.get(url, { params, timeout: 20_000 })
    for (const thread of data.data || []) {
      const parts = thread.participants?.data || []
      const contact = parts.find((p) => String(p.id) !== selfId) || parts[0]
      if (!contact) continue
      const cid = String(contact.id)
      const phone = `${prefix}${cid}`
      const name = contact.name || contact.username || phone
      const jid = `${phone}@${domain}`

      const msgs = (thread.messages?.data || []).slice().reverse() // cronológico
      let lastInbound = 0
      for (const m of msgs) {
        const text = m.message || (m.attachments?.length ? '📎 Anexo' : '')
        if (!text) continue
        const outbound = String(m.from?.id) === selfId
        const createdAt = m.created_time ? new Date(m.created_time).toISOString() : new Date().toISOString()
        await saveMetaMessage({
          userId, phone, name, text,
          direction: outbound ? 'outbound' : 'inbound',
          externalId: m.id, createdAt, channel,
        })
        msgCount++
        if (!outbound) lastInbound = Math.max(lastInbound, new Date(createdAt).getTime())
      }
      // Habilita envio dentro da janela de 24h e fixa o dono do chat.
      chats.set(phone, { pageId: String(pageId), lastIncomingAt: lastInbound || Date.now() })
      convCount++
      if (convCount >= MAX_CONVS) break
      io?.emit('new_chat', { chat: { id: jid } })
    }
    url = data.paging?.next || null
    params = undefined // a URL de paging já traz todos os parâmetros
  }

  return { conversations: convCount, messages: msgCount }
}

module.exports = {
  init, registerPage, unregisterPagesOf, getStatus, verifyPageToken, subscribePage,
  handleWebhookEvent, sendTextTo, resumePages, isMetaNumber, emitIntegrationConnected,
  getFollowerCount, syncConversations,
}
