import { supabase } from '@/lib/supabase'
import {
  sendMessage as evoSend,
  sendWhatsAppAudio as evoAudioSend,
  getInstanceStatus,
  getChats,
  getAllMessages,
  getMessages,
  findContacts,
} from '@/services/evolutionApi'
import api from '@/services/api'

const channelOf = (phone) => {
  const p = String(phone || '')
  if (/^fb\d+$/.test(p)) return 'facebook'
  if (/^ig\d+$/.test(p)) return 'instagram'
  if (/^tg-?\d+$/.test(p)) return 'telegram'
  return 'whatsapp'
}

const sendByChannel = async (phone, text, userId) => {
  const ch = channelOf(phone)
  if (ch === 'facebook' || ch === 'instagram') {
    const r = await api.post('/meta/send', { number: phone, text, userId }).then(r => r.data)
    if (!r.success) throw new Error(r.error || 'Falha ao enviar pela Meta')
    return r
  }
  if (ch === 'telegram') {
    const r = await api.post('/telegram/send', { number: phone, text, userId }).then(r => r.data)
    if (!r.success) throw new Error(r.error || 'Falha ao enviar pelo Telegram')
    return r
  }
  // WhatsApp — Evolution API (usa apenas dígitos)
  return evoSend(String(phone).replace(/\D/g, ''), text)
}

/* Converte um Blob de áudio gravado em base64 puro (sem prefixo data:) */
const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader()
  fr.onloadend = () => resolve(String(fr.result).split(',')[1] ?? '')
  fr.onerror = reject
  fr.readAsDataURL(blob)
})

/* A apikey, a URL e a instância da Evolution vivem só no backend proxy.
   O frontend não conhece mais nenhuma credencial da Evolution. */

/* ─── Supabase CRUD ───────────────────────────────────────────────────── */

export const fetchConversations = async (userId, { assignedTo } = {}) => {
  let q = supabase.from('conversations').select('*').eq('user_id', userId)
  if (assignedTo) q = q.eq('assigned_to', assignedTo)
  const { data, error } = await q.order('last_message_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export const fetchMessages = async (conversationId) => {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export const sendChatMessage = async (userId, conversationId, contactPhone, content) => {
  const phone = String(contactPhone)
  const ch = channelOf(phone)

  // Salva otimisticamente no Supabase; o status é atualizado após o envio.
  const { data: msg, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, user_id: userId, content, direction: 'outbound', status: 'sent', channel: ch })
    .select()
    .single()
  if (error) throw error

  await supabase.from('conversations')
    .update({ last_message: content, last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  console.log('[Chat] Enviando para:', phone, '(canal:', ch + ')')
  let r
  try {
    r = await sendByChannel(phone, content, userId)
    console.log('[Chat] Resposta canal:', JSON.stringify(r))
  } catch (e) {
    console.error('[Chat] Envio falhou:', e.message)
    const err = new Error(e.message || `Falha ao enviar para ${ch}`)
    err.savedMsg = msg
    throw err
  }

  const ok = !!(r?.key?.id || r?.messageId || r?.success || r?.status === 'PENDING' || r?.status === 'success')
  // Guarda o ID externo (Cloud: messages[0].id) p/ casar status updates do webhook.
  const externalId = r?.messageId || r?.key?.id || null
  await supabase.from('messages')
    .update({ status: ok ? 'delivered' : 'sent', ...(externalId ? { external_id: externalId } : {}) })
    .eq('id', msg.id)
  console.log('[Chat] Mensagem salva no Supabase')
  return msg
}

export const sendChatAudio = async (userId, conversationId, contactPhone, blob) => {
  const { data: msg, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, user_id: userId, content: '🎵 Mensagem de voz', direction: 'outbound', status: 'sent', channel: 'whatsapp' })
    .select()
    .single()
  if (error) throw error

  await supabase.from('conversations')
    .update({ last_message: '🎵 Mensagem de voz', last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  const phone = String(contactPhone).replace(/\D/g, '')
  try {
    const b64 = await blobToBase64(blob)
    await evoAudioSend(phone, b64)
    supabase.from('messages').update({ status: 'delivered' }).eq('id', msg.id)
  } catch (e) { console.warn('[WA audio send offline]', e.message) }

  return msg
}

export const createConversation = async (userId, { contactName, contactPhone, contactChannel, initialMessage }) => {
  // Preserva o prefixo de canal (fb/ig/tg) — é ele que faz channelOf rotear o
  // envio. Só limpa para dígitos quando é um telefone puro (WhatsApp).
  const raw = String(contactPhone).trim()
  const phone = /^(fb|ig|tg)-?\d+$/i.test(raw) ? raw.toLowerCase() : raw.replace(/\D/g, '')
  let { data: conv, error } = await supabase
    .from('conversations')
    .upsert({
      user_id: userId,
      contact_name: contactName,
      contact_phone: phone,
      contact_channel: contactChannel ?? 'whatsapp',
      last_message: initialMessage ?? null,
      last_message_at: new Date().toISOString(),
      unread_count: 0, status: 'active',
    }, { onConflict: 'user_id,contact_phone' })
    .select().single()
  if (error) {
    // Se o upsert falhar, busca a conversa existente
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .eq('contact_phone', phone)
      .single()
    if (!existing) throw error
    conv = existing
  }
  if (initialMessage) await sendChatMessage(userId, conv.id, contactPhone, initialMessage)
  return conv
}

export const markConversationRead = async (id) =>
  supabase.from('conversations').update({ unread_count: 0 }).eq('id', id)

/* Exclui a conversa (o número) e todas as suas mensagens. */
export const deleteConversation = async (conversationId) => {
  await supabase.from('messages').delete().eq('conversation_id', conversationId)
  const { error } = await supabase.from('conversations').delete().eq('id', conversationId)
  if (error) throw error
}

/* ─── WhatsApp helpers ────────────────────────────────────────────────── */

const toUnix = (ts) => {
  if (!ts) return 0
  if (typeof ts === 'number') return ts
  if (typeof ts === 'object' && 'low' in ts) return ts.low  // Protobuf Long
  return Number(ts) || 0
}

const extractText = (m) => {
  const msg = m?.message
  if (!msg) return ''
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    (msg.imageMessage    ? '📷 Imagem'    : null) ??
    (msg.audioMessage   ? '🎵 Áudio'     : null) ??
    (msg.videoMessage   ? '🎬 Vídeo'     : null) ??
    (msg.documentMessage ? '📄 Documento' : null) ??
    (msg.stickerMessage ? '🎭 Sticker'   : null) ??
    ''
  )
}

/* ─── checkWhatsAppConnection ─────────────────────────────────────────── */
export const checkWhatsAppConnection = async () => {
  try {
    const data = await getInstanceStatus()
    const instances = Array.isArray(data) ? data : (data ? [data] : [])
    // O proxy responde por uma única instância, então basta a primeira.
    const inst = instances[0]
    return inst?.instance?.state === 'open' || inst?.instance?.status === 'open' || inst?.state === 'open'
  } catch { return false }
}

/* ─── syncWhatsAppChats ───────────────────────────────────────────────────
   IMPORTANT — How Evolution API v1.8.2 works:
   ─────────────────────────────────────────────
   The local Evolution API database is EMPTY until messages flow through
   the webhook. It cannot access WhatsApp's historical messages stored on
   the device. Only messages received/sent AFTER the instance was connected
   (and the webhook is active) appear in findChats / findMessages.

   This function tries all known endpoints and returns the count of
   conversations it could find. 0 is normal on a fresh instance.
   ──────────────────────────────────────────────────────────────────────── */
export const syncWhatsAppChats = async (userId, onProgress = () => {}) => {
  onProgress('Iniciando sincronização...')
  // A Evolution leva alguns segundos para importar a agenda após o pareamento.
  onProgress('Aguardando o WhatsApp sincronizar a agenda...')
  await new Promise(r => setTimeout(r, 3500))

  /* ── shared normalizer: raw chat array → { phone, name, lastMsg, lastAt } ── */
  const normalizeChat = (c) => {
    const jid   = c.id || c.remoteJid || ''
    const phone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/[^\d]/g, '')
    const name  = c.name || c.pushName || c.verifiedName || c.notify || `+${phone}`
    const lm    = c.lastMessage || c.messages?.[0]
    const lastMsg = lm?.message?.conversation
      || lm?.message?.extendedTextMessage?.text
      || lm?.message?.imageMessage?.caption
      || extractText(lm)
      || ''
    const ts = toUnix(lm?.messageTimestamp)
    const lastAt = ts ? new Date(ts * 1000).toISOString() : new Date().toISOString()
    return { phone, name, lastMsg, lastAt }
  }

  let convs  = []   // final list of { phone, name, lastMsg, lastAt }
  let source = null

  /* ────── Endpoint 1: findChats (via proxy) ──────────────────────── */
  console.log('[sync] ▶ Endpoint 1 — GET /api/chats (proxy)')
  onProgress('Tentando findChats...')
  try {
    const d = await getChats()
    console.log(`[sync]   length: ${Array.isArray(d) ? d.length : '—'} | data:`, d)

    if (Array.isArray(d) && d.length > 0) {
      convs = d.filter(c => { const j = c.id || c.remoteJid || ''; return j.includes('@s.whatsapp.net') || j.includes('@c.us') }).map(normalizeChat).filter(c => c.phone && c.phone.length >= 10 && c.phone.length <= 13)
      source = 'findChats'
      console.log(`[sync]   ✅ ${convs.length} conversas`)
    } else {
      console.log('[sync]   ⚠ findChats vazio — tentando mensagens')
    }
  } catch (e) { console.warn('[sync]   ❌ findChats erro:', e.message) }

  /* ────── Endpoint 2: findMessages (via proxy, primary fallback) ─── */
  if (convs.length === 0) {
    console.log('[sync] ▶ Endpoint 2 — GET /api/messages (proxy)')
    onProgress('Buscando via mensagens...')
    try {
      const raw = await getAllMessages()
      const msgs = Array.isArray(raw) ? raw
        : (raw?.messages?.records ?? raw?.records ?? raw?.messages ?? [])
      console.log(`[sync]   mensagens: ${msgs.length}`)
      console.log('[sync]   Primeira mensagem:', msgs[0])

      if (msgs.length > 0) {
        // Group by JID — keep latest message per conversation
        const byJid = {}
        for (const m of msgs) {
          const jid = m?.key?.remoteJid
          if (!jid || !jid.includes('@s.whatsapp.net') || jid === '0@s.whatsapp.net') continue
          const ts = toUnix(m.messageTimestamp)
          if (!byJid[jid] || ts > toUnix(byJid[jid].messageTimestamp)) byJid[jid] = m
        }
        console.log(`[sync]   JIDs únicos: ${Object.keys(byJid).length}`)

        convs = Object.entries(byJid).map(([jid, m]) => {
          const phone  = jid.split('@')[0].replace(/\D/g, '')
          const name   = m.pushName || `+${phone}`
          const ts     = toUnix(m.messageTimestamp)
          return { phone, name, lastMsg: extractText(m), lastAt: ts ? new Date(ts * 1000).toISOString() : new Date().toISOString() }
        }).filter(c => c.phone)
        source = 'findMessages'
        console.log(`[sync]   ✅ ${convs.length} conversas derivadas de mensagens`)
      } else {
        console.log('[sync]   ⚠ findMessages também vazio')
      }
    } catch (e) { console.warn('[sync]   ❌ findMessages erro:', e.message) }
  }

  /* ────── Endpoint 3: findContacts — agenda real do WhatsApp (números dos leads)
     v1.8.2 expõe via POST {where:{}}. Algumas versões respondem em GET ou em
     { records:[...] }. Tentamos POST primeiro e caímos para GET. Este é o
     endpoint mais confiável para obter os NÚMEROS REAIS logo após o QR code,
     já que findChats/findMessages costumam vir vazios numa instância nova. ── */
  console.log('[sync] ▶ Endpoint 3 — GET /api/contacts (proxy)')
  onProgress('Importando contatos...')
  const nameMap = {}
  try {
    const d = await findContacts()
    const contacts = Array.isArray(d) ? d : (d?.records ?? d?.contacts ?? [])
    console.log(`[sync]   contatos: ${contacts.length}`)
    console.log('[sync]   Primeiro contato:', contacts[0])

    for (const c of contacts) {
      const jid = c.id || c.remoteJid
      if (jid) nameMap[jid] = c.pushName || c.name || c.notify || c.verifiedName || ''
    }
    // Sem conversas reais → constrói a lista de leads a partir da agenda
    if (convs.length === 0 && contacts.length > 0) {
      convs = contacts
        .map(c => {
          const jid = c.id || c.remoteJid || ''
          if (!jid.includes('@s.whatsapp.net') && !jid.includes('@c.us')) return null
          if (jid.includes('@g.us') || jid.includes('@broadcast')) return null
          const phone = jid.split('@')[0].replace(/\D/g, '')
          if (phone.length < 10) return null   // ignora ids inválidos / serviço
          return { phone, name: c.pushName || c.name || c.notify || c.verifiedName || `+${phone}`, lastMsg: '', lastAt: new Date().toISOString() }
        })
        .filter(Boolean)
      if (convs.length > 0) source = 'findContacts'
      console.log(`[sync]   ✅ ${convs.length} leads construídos da agenda`)
    }
  } catch (e) { console.warn('[sync]   ❌ findContacts erro:', e.message) }

  // Apply better names from contacts map
  if (Object.keys(nameMap).length > 0) {
    convs = convs.map(c => {
      const jid = `${c.phone}@s.whatsapp.net`
      return { ...c, name: nameMap[jid] || c.name }
    })
  }

  /* ────── Endpoint 4: diagnostic — fetchInstances ─────────────────── */
  console.log('[sync] ▶ Endpoint 4 — GET /api/instance/status (proxy, diagnóstico)')
  try {
    const d = await getInstanceStatus()
    console.log(`[sync]   Instances:`, d)
    const instances = Array.isArray(d) ? d : [d]
    const inst0 = instances[0]
    console.log(`[sync]   State: ${inst0?.instance?.state ?? inst0?.state ?? '?'} | Name: ${inst0?.instance?.instanceName ?? inst0?.instanceName ?? '?'}`)
  } catch (e) { console.warn('[sync]   fetchInstances erro:', e.message) }

  /* ────── Upsert to Supabase ──────────────────────────────────────── */
  if (convs.length === 0) {
    console.warn('[sync] ❌ Nenhuma conversa encontrada em nenhum endpoint')
    onProgress('Nenhuma conversa encontrada')
    return 0
  }

  console.log(`[sync] Salvando ${convs.length} conversas no Supabase (fonte: ${source})`)
  onProgress(`Salvando ${convs.length} conversas...`)

  let synced = 0
  let errors = 0

  for (const conv of convs) {
    const { error } = await supabase
      .from('conversations')
      .upsert({
        user_id: userId,
        contact_name: conv.name,
        contact_phone: conv.phone,
        contact_channel: 'whatsapp',
        last_message: conv.lastMsg,
        last_message_at: conv.lastAt,
        status: 'active',
      }, { onConflict: 'user_id,contact_phone' })

    if (error) {
      console.error('[sync] upsert error:', error.message, '| phone:', conv.phone)
      errors++
    } else {
      synced++
    }

    const done = synced + errors
    if (done % 5 === 0 || done === convs.length) {
      onProgress(`Salvando ${done}/${convs.length}...`)
    }
  }

  console.log(`[sync] ✅ Finalizado — ${synced} ok, ${errors} erros`)
  return synced
}

/* ─── loadConversationMessages ───────────────────────────────────────────
   Fetches and upserts messages for one conversation from Evolution API.
   Called when user clicks a conversation.
   ──────────────────────────────────────────────────────────────────────── */
export const loadConversationMessages = async (userId, conversationId, contactPhone) => {
  const jid = `${contactPhone}@s.whatsapp.net`
  console.log('[msgs] Loading for JID:', jid)

  let evoMsgs = []
  try {
    const raw = await getMessages(jid)
    evoMsgs = Array.isArray(raw) ? raw : (raw?.messages?.records ?? raw?.records ?? raw?.messages ?? [])
    console.log('[msgs] Evolution returned:', evoMsgs.length, 'messages')
  } catch (e) { console.warn('[msgs] Evolution offline:', e.message) }

  if (evoMsgs.length > 0) {
    const toUnixLocal = (ts) => {
      if (!ts) return 0
      if (typeof ts === 'number') return ts
      if (typeof ts === 'object' && 'low' in ts) return ts.low
      return Number(ts) || 0
    }
    const rows = evoMsgs
      .filter(m => m?.key?.id && extractText(m))
      .map(m => {
        const unix = toUnixLocal(m.messageTimestamp)
        return {
          conversation_id: conversationId,
          user_id: userId,
          content: extractText(m),
          direction: m.key?.fromMe ? 'outbound' : 'inbound',
          status: 'delivered',
          channel: 'whatsapp',
          external_id: m.key.id,
          created_at: unix ? new Date(unix * 1000).toISOString() : new Date().toISOString(),
        }
      })

    if (rows.length > 0) {
      const { error } = await supabase.from('messages')
        .upsert(rows, { onConflict: 'external_id', ignoreDuplicates: true })
      if (error) console.warn('[msgs] upsert warning:', error.message)
      else console.log('[msgs] upserted', rows.length, 'messages')
    }
  }

  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  return data ?? []
}
