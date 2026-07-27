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

/* Valida um Page Access Token e devolve { id, name } da página. */
async function verifyPageToken(token) {
  const { data } = await axios.get(`${GRAPH}/me`, {
    params: { fields: 'id,name', access_token: token }, timeout: 15_000,
  })
  return data
}

/* Assina o app nos eventos de mensagens da página (necessário p/ webhook). */
async function subscribePage(pageId, token) {
  await axios.post(`${GRAPH}/${pageId}/subscribed_apps`, null, {
    params: { subscribed_fields: 'messages,messaging_postbacks', access_token: token },
    timeout: 15_000,
  })
}

/* ─── Recebimento (chamado pelo webhook após validar a assinatura) ─────── */
// body.object: 'page' (Messenger) | 'instagram' (DM) — mesmo shape messaging[].
async function handleWebhookEvent(body) {
  const channel = body?.object === 'instagram' ? 'instagram' : body?.object === 'page' ? 'facebook' : null
  if (!channel) return
  const prefix = channel === 'instagram' ? 'ig' : 'fb'
  const domain = channel === 'instagram' ? 'instagram' : 'messenger'

  for (const entry of body.entry || []) {
    const page = pages.get(String(entry.id))
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
          const { data } = await axios.get(`${GRAPH}/${psid}`, {
            params: { fields: 'name,first_name,last_name,username', access_token: page.token },
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
    .select('created_at').eq('contact_phone', String(number)).eq('direction', 'received')
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

module.exports = {
  init, registerPage, unregisterPagesOf, getStatus, verifyPageToken, subscribePage,
  handleWebhookEvent, sendTextTo, resumePages, isMetaNumber,
}
