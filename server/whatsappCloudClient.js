// WhatsApp Cloud API (oficial da Meta, via Graph API). Alternativa ao Baileys
// que NÃO exige servidor sempre-ligado: a Meta hospeda tudo e entrega o
// recebimento por webhook. O recebimento entra no MESMO pipeline dos outros
// canais (Socket.io → Chat, IA → funis) e o número do contato é o telefone puro
// — mesma identidade do WhatsApp Baileys, então um contato é o mesmo número
// independente do provider (Cloud ou QR).
//
// Diferença do Baileys: aqui o dono do número é resolvido pelo phone_number_id
// que vem no metadata do webhook (índice byPhoneId → userId). O envio é
// POST graph.facebook.com/<ver>/<phoneNumberId>/messages com Bearer token.
//
// Janela de 24h da Meta: mensagem livre (texto) só é aceita até 24h após a
// última mensagem recebida do contato; fora disso a Meta exige template
// aprovado. Aqui enviamos texto livre e repassamos o erro da Meta se estiver
// fora da janela (templates ficam para uma próxima etapa).
const axios = require('axios')
const { supabase, isConfigured } = require('./supabaseClient')
const { saveIncomingMessage } = require('./inbox')

const GRAPH = 'https://graph.facebook.com/v21.0'

// userId -> { phoneNumberId, token, wabaId, displayNumber }
const numbers = new Map()
// phoneNumberId -> userId (resolve o dono do número no webhook recebido)
const byPhoneId = new Map()

let io = null
let onIncoming = null

function init({ socketIo, incomingHandler }) {
  io = socketIo
  onIncoming = incomingHandler
}

function emitIntegrationConnected() {
  io?.emit('integration_connected', { channel: 'whatsapp' })
}

function registerNumber({ userId, phoneNumberId, token, wabaId, displayNumber }) {
  const uid = String(userId)
  numbers.set(uid, {
    phoneNumberId: String(phoneNumberId),
    token,
    wabaId: wabaId || null,
    displayNumber: displayNumber || null,
  })
  byPhoneId.set(String(phoneNumberId), uid)
}

function unregisterFor(userId) {
  const entry = numbers.get(String(userId))
  if (entry) byPhoneId.delete(String(entry.phoneNumberId))
  numbers.delete(String(userId))
}

// Um usuário está no Cloud se tem um número Cloud conectado. O dispatch de saída
// (flowEngine/messages) usa isto para escolher Cloud API em vez de Baileys.
function isActiveFor(userId) {
  return userId != null && numbers.has(String(userId))
}

function getStatus(userId) {
  const e = numbers.get(String(userId))
  return e ? { connected: true, displayNumber: e.displayNumber } : { connected: false }
}

// Valida phoneNumberId + token na Graph e devolve { displayNumber, verifiedName }.
async function verifyCredentials({ phoneNumberId, token }) {
  const { data } = await axios.get(`${GRAPH}/${phoneNumberId}`, {
    params: { fields: 'display_phone_number,verified_name' },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15_000,
  })
  return { displayNumber: data.display_phone_number || null, verifiedName: data.verified_name || null }
}

/* ─── Recebimento (chamado pelo webhook após validar a assinatura) ─────────── */
// object='whatsapp_business_account'; entry[].changes[] com field='messages'.
// value.messages[] = recebidas; value.statuses[] = entregue/lido (ignorado).
async function handleWebhookEvent(body) {
  if (body?.object !== 'whatsapp_business_account') return
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue
      const value = change.value || {}
      const phoneNumberId = value.metadata?.phone_number_id
      const userId = phoneNumberId ? byPhoneId.get(String(phoneNumberId)) : null

      // Nome do contato vem em contacts[] (profile.name) indexado por wa_id.
      const nameByWaId = {}
      for (const c of value.contacts || []) nameByWaId[c.wa_id] = c.profile?.name

      for (const msg of value.messages || []) {
        const text = msg.text?.body
          ?? (msg.type && msg.type !== 'text' ? '📎 Mídia recebida' : '')
        if (!text) continue

        const number = String(msg.from) // telefone puro (mesmo id do Baileys)
        const pushName = nameByWaId[number] || number
        const jid = `${number}@s.whatsapp.net`

        console.log(`[wa-cloud] ← ${number} (${pushName}): ${text.slice(0, 50)}`)

        // 1) Tempo real para o Chat (mesmo evento dos outros canais).
        io?.emit('new_message', {
          jid,
          message: {
            id: msg.id ?? null,
            fromMe: false,
            text,
            pushName,
            timestamp: msg.timestamp ? Number(msg.timestamp) * 1000 : null,
          },
        })

        // 2) Persistência (Chat carrega histórico de conversations/messages).
        if (userId) {
          await saveIncomingMessage({ userId, phone: number, name: pushName, text, channel: 'whatsapp' })
        } else {
          console.warn(`[wa-cloud] mensagem de número não registrado (phone_number_id=${phoneNumberId})`)
        }

        // 3) IA → funis (mesma cadeia do WhatsApp), fire-and-forget.
        if (onIncoming) {
          Promise.resolve(onIncoming({ jid, text, pushName, fromMe: false }))
            .catch((err) => console.error('[wa-cloud] IA/flowEngine:', err?.message ?? err))
        }
      }
    }
  }
}

/* ─── Envio ────────────────────────────────────────────────────────────────── */
async function sendTextTo(number, text, userId = null) {
  // Resolve o número Cloud do usuário; se só houver um conectado, usa ele.
  const entry = userId != null ? numbers.get(String(userId)) : null
  const e = entry || (numbers.size === 1 ? [...numbers.values()][0] : null)
  if (!e) throw new Error('Nenhum número WhatsApp Cloud conectado para este usuário.')
  try {
    const { data } = await axios.post(
      `${GRAPH}/${e.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: String(number).replace(/\D/g, ''),
        type: 'text',
        text: { preview_url: false, body: text },
      },
      { headers: { Authorization: `Bearer ${e.token}` }, timeout: 15_000 }
    )
    return { success: true, key: { id: data.messages?.[0]?.id ?? null } }
  } catch (err) {
    const g = err.response?.data?.error
    throw new Error(g ? `WhatsApp Cloud: ${g.message}` : err.message)
  }
}

/* ─── Boot: recarrega números conectados (integrations type='whatsapp_cloud') ─ */
async function resumeNumbers() {
  if (!isConfigured) return
  try {
    const { data } = await supabase.from('integrations')
      .select('user_id, config').eq('type', 'whatsapp_cloud').eq('status', 'connected')
    for (const row of data || []) {
      const cfg = row.config || {}
      if (!cfg.phone_number_id || !cfg.token) continue
      registerNumber({
        userId: row.user_id,
        phoneNumberId: cfg.phone_number_id,
        token: cfg.token,
        wabaId: cfg.waba_id,
        displayNumber: cfg.display_number,
      })
      console.log(`[wa-cloud] número ${cfg.phone_number_id} religado p/ user ${row.user_id}`)
    }
  } catch (e) {
    console.warn('[wa-cloud] resumeNumbers falhou:', e?.message ?? e)
  }
}

module.exports = {
  init, registerNumber, unregisterFor, isActiveFor, getStatus,
  verifyCredentials, handleWebhookEvent, sendTextTo, resumeNumbers,
  emitIntegrationConnected,
}
