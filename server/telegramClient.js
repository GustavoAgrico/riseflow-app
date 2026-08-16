// Canal Telegram (Bot API oficial, via grammY) — segue o padrão do Baileys:
// mensagens recebidas entram no MESMO fluxo (Socket.io → Chat, IA → funis) e o
// envio é roteado pelo prefixo do contato.
//
// Identidade do contato: jid = "tg<chatId>@telegram", phone = "tg<chatId>".
// Isso permite reusar conversations/messages/flow_executions sem colidir com
// números de WhatsApp (jidToNumber() do flowEngine funciona sem mudanças).
//
// Modo de recebimento:
//   - Padrão: long polling (funciona em localhost, sem URL pública).
//   - Com TELEGRAM_WEBHOOK_BASE definido (ex.: https://app.onrender.com):
//     registra webhook do Telegram em <base>/api/telegram/webhook/<userId>,
//     protegido pelo secret_token oficial da Bot API.
const crypto = require('crypto')
const { Bot } = require('grammy')
const { supabase, isConfigured } = require('./supabaseClient')
const { saveIncomingMessage } = require('./inbox')

const WEBHOOK_BASE = (process.env.TELEGRAM_WEBHOOK_BASE || '').replace(/\/+$/, '')

const bots = new Map()       // userId -> { bot, username, secret }
const chatOwner = new Map()  // "tg<chatId>" -> userId (aprendido nas mensagens recebidas)

let io = null                // injetado pelo index.js (Socket.io)
let onIncoming = null        // injetado: ({ jid, text, pushName, fromMe }) => void (IA + funis)

const nowIso = () => new Date().toISOString()
const isTelegramNumber = (n) => /^tg-?\d+$/.test(String(n || ''))
const toChatId = (n) => String(n).slice(2) // remove o prefixo "tg"

function init({ socketIo, incomingHandler }) {
  io = socketIo
  onIncoming = incomingHandler
}

/* Handler de mensagem recebida — normaliza para o shape do webhook do Baileys. */
async function handleMessage(userId, msg) {
  if (!msg || msg.chat?.type !== 'private') return // só conversas privadas (como o Baileys ignora grupos)
  const text = msg.text ?? msg.caption ?? ''
  if (!text) return
  const phone = `tg${msg.chat.id}`
  const jid = `${phone}@telegram`
  const pushName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ')
    || msg.from?.username || phone

  chatOwner.set(phone, userId)
  console.log(`[telegram] ← ${phone} (${pushName}): ${text.slice(0, 50)}`)

  // 1) Tempo real para o Chat (mesmo evento que o WhatsApp emite).
  io?.emit('new_message', {
    jid,
    message: { id: String(msg.message_id), fromMe: false, text, pushName, timestamp: msg.date ?? null },
  })

  // 2) Persistência (o Chat carrega histórico de conversations/messages).
  await saveIncomingMessage({ userId, phone, name: pushName, text, channel: 'tg' })

  // 3) IA → funis (mesma cadeia do webhook WhatsApp), fire-and-forget.
  if (onIncoming) {
    Promise.resolve(onIncoming({ jid, text, pushName, fromMe: false, userId }))
      .catch((err) => console.error('[telegram] IA/flowEngine:', err?.message ?? err))
  }
}

/* Sobe (ou reinicia) o bot de um usuário. Valida o token via getMe. */
async function startBot(userId, token) {
  await stopBot(userId) // idempotente: derruba instância anterior se houver

  const bot = new Bot(token)
  const me = await bot.api.getMe() // lança se o token for inválido
  bot.on('message', (ctx) => handleMessage(userId, ctx.message))
  bot.catch((err) => console.error('[telegram] erro no bot:', err?.message ?? err))

  const secret = crypto.randomBytes(24).toString('hex')
  if (WEBHOOK_BASE) {
    // Modo webhook: o Telegram entrega em /api/telegram/webhook/<userId>.
    await bot.init()
    await bot.api.setWebhook(`${WEBHOOK_BASE}/api/telegram/webhook/${userId}`, {
      secret_token: secret,
      drop_pending_updates: true,
    })
    console.log(`[telegram] bot @${me.username} conectado (webhook) p/ user ${userId}`)
  } else {
    // Modo polling: remove webhook antigo e consome via getUpdates.
    await bot.api.deleteWebhook({ drop_pending_updates: true }).catch(() => {})
    bot.start({ drop_pending_updates: true }) // não aguarda: roda até stop()
      .catch((err) => console.error('[telegram] polling encerrou com erro:', err?.message ?? err))
    console.log(`[telegram] bot @${me.username} conectado (polling) p/ user ${userId}`)
  }

  bots.set(userId, { bot, username: me.username, secret })
  io?.emit('integration_connected', { channel: 'telegram' })
  return { username: me.username, name: me.first_name }
}

async function stopBot(userId) {
  const entry = bots.get(userId)
  if (!entry) return
  bots.delete(userId)
  try { await entry.bot.stop() } catch { /* polling pode já ter parado */ }
  try { await entry.bot.api.deleteWebhook() } catch { /* sem webhook — ok */ }
}

function getStatus(userId) {
  const entry = bots.get(userId)
  return entry ? { connected: true, username: entry.username } : { connected: false }
}

/* Processa um update entregue pelo webhook público (modo TELEGRAM_WEBHOOK_BASE). */
async function handleWebhookUpdate(userId, secretHeader, update) {
  const entry = bots.get(userId)
  if (!entry) return false
  if (!entry.secret || secretHeader !== entry.secret) return false
  await entry.bot.handleUpdate(update)
  return true
}

/* Envia texto para um contato "tg<chatId>". Resolve o bot pelo dono conhecido
   do chat, pelo userId explícito, ou — fallback single-tenant — o único bot ativo. */
async function sendTextTo(number, text, userId = null) {
  if (!isTelegramNumber(number)) throw new Error(`Número Telegram inválido: ${number}`)
  const owner = userId || chatOwner.get(String(number)) || (bots.size === 1 ? [...bots.keys()][0] : null)
  const entry = owner ? bots.get(owner) : null
  if (!entry) throw new Error('Nenhum bot do Telegram conectado para este contato.')
  const sent = await entry.bot.api.sendMessage(toChatId(number), text)
  return { success: true, key: { id: String(sent.message_id) } }
}

/* Boot: religa os bots já conectados (integrations type='telegram'). */
async function resumeBots() {
  if (!isConfigured) return
  try {
    const { data } = await supabase.from('integrations')
      .select('user_id, config').eq('type', 'telegram').eq('status', 'connected')
    for (const row of data || []) {
      const token = row.config?.bot_token
      if (!token) continue
      try { await startBot(row.user_id, token) }
      catch (e) { console.warn(`[telegram] bot do user ${row.user_id} não religou:`, e?.message ?? e) }
    }
  } catch (e) {
    console.warn('[telegram] resumeBots falhou:', e?.message ?? e)
  }
}

module.exports = {
  init, startBot, stopBot, getStatus, sendTextTo, resumeBots,
  handleWebhookUpdate, isTelegramNumber,
}
